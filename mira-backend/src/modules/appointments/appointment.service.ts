import { DateTime } from 'luxon';
import type { Appointment, Attempt, BookingInput, BookingLock, Business, CallContext, Service, Store } from '../../types/domain.js';
import type { Calendar, CalendarEvent } from '../../integrations/google-calendar/calendar.types.js';
import { CalendarWriteError } from '../../integrations/google-calendar/calendar.errors.js';
import { AppError, calendarUnavailable, slotUnavailable } from '../../utils/errors.js';
import { eventId, fingerprint } from '../../utils/identity.js';
import { requireBusiness } from '../businesses/business.service.js';
import { requireService } from '../services/service.service.js';
import { occupied, overlaps, reserved, validateSlot } from './availability.service.js';

const recoveryError = () => new AppError('BOOKING_RECONCILIATION_REQUIRED', 'I cannot confirm that booking yet. Please leave a message for follow-up.', 503);
export class AppointmentService {
  constructor(private store: Store, private calendar: Calendar, private lock: BookingLock, private now: () => Date) {}
  private confirmation(a: Appointment, b: Business) {
    return { success: true, appointment_id: a.id, status: 'confirmed', appointment_start: DateTime.fromJSDate(a.startTime, { zone: b.timezone }).toISO(),
      message: 'Appointment successfully created.', is_sample_data: b.isSampleData };
  }
  private verifyEvent(event: CalendarEvent, a: Attempt) {
    if (event.id !== a.eventId || event.status !== 'confirmed' || event.businessId !== a.businessId || event.bookingRequestId !== a.bookingRequestId
      || event.fingerprint !== a.fingerprint || event.start.getTime() !== a.startTime.getTime() || event.end.getTime() !== a.endTime.getTime()) throw recoveryError();
  }
  private verifyAttempt(a: Attempt, b: Business, fp: string, context?: CallContext) {
    if (a.businessId !== b.id || a.fingerprint !== fp || a.retellCallId !== (context?.callId ?? null)) throw new AppError('IDEMPOTENCY_CONFLICT', 'Please use a new identifier for a different booking attempt.', 409);
    if (a.state !== 'CONFIRMED' && a.calendarId !== b.calendarId) throw recoveryError();
  }
  async create(input: BookingInput, context?: CallContext) {
    const normalized = { ...input, appointment_start: new Date(input.appointment_start).toISOString() };
    const fp = fingerprint(normalized);
    const b = await requireBusiness(this.store, input.business_id);
    const existing = await this.store.attempt(input.booking_request_id);
    if (existing) {
      this.verifyAttempt(existing, b, fp, context);
      if (existing.state === 'CONFIRMED') {
        const appointment = await this.store.appointment(existing.bookingRequestId);
        if (!appointment) throw recoveryError();
        return this.confirmation(appointment, b);
      }
    }
    if (!b.calendarId) throw calendarUnavailable();
    return this.lock.withLock(b.calendarId, async assertHeld => {
      let a = await this.store.attempt(input.booking_request_id);
      if (a) {
        this.verifyAttempt(a, b, fp, context);
        if (a.state === 'CONFIRMED') {
          const appointment = await this.store.appointment(a.bookingRequestId);
          if (!appointment) throw recoveryError();
          return this.confirmation(appointment, b);
        }
        if (a.state === 'FAILED') throw new AppError(a.failureCode ?? 'BOOKING_FAILED', 'That booking attempt failed. Please select a time and start a new attempt.', a.failureCode === 'SLOT_UNAVAILABLE' ? 409 : 503);
      }
      const s = await requireService(this.store, b.id, input.service_id);
      if (!a) {
        const slot = validateSlot(b, s, new Date(normalized.appointment_start), this.now());
        const padded = reserved(b, slot);
        assertHeld();
        a = await this.store.prepare({ bookingRequestId: input.booking_request_id, businessId: b.id, serviceId: s.id,
          calendarId: b.calendarId!, eventId: eventId(b.id, input.booking_request_id), fingerprint: fp, snapshot: normalized,
          startTime: slot.start, endTime: slot.end, reservedStart: padded.start, reservedEnd: padded.end, retellCallId: context?.callId ?? null }, context);
      }
      const appointment = await this.execute(b, s, a, assertHeld);
      return this.confirmation(appointment, b);
    });
  }
  private async execute(b: Business, s: Service, a: Attempt, assertHeld: () => void): Promise<Appointment> {
    // INSERTING survives a process crash or lost insert response. Resolve its event first.
    if (a.state === 'INSERTING') {
      let found: CalendarEvent | null;
      try { found = await this.calendar.get(b, a.eventId); } catch { throw recoveryError(); }
      assertHeld();
      if (found) {
        this.verifyEvent(found, a);
        try { return await this.store.confirm(a); } catch { throw recoveryError(); }
      }
    }
    // A changed business/service configuration must not change an existing recovery snapshot.
    const uncertain = a.state === 'INSERTING';
    try {
      const slot = validateSlot(b, s, a.startTime, this.now());
      const padded = reserved(b, slot);
      if (slot.end.getTime() !== a.endTime.getTime() || padded.start.getTime() !== a.reservedStart.getTime() || padded.end.getTime() !== a.reservedEnd.getTime()) throw recoveryError();
      const busy = await occupied(this.store, this.calendar, b, padded, a.bookingRequestId);
      assertHeld();
      if (busy.some(v => overlaps(padded, v))) throw slotUnavailable();
    } catch (error) {
      // Never free an uncertain insert reservation merely because a subsequent GET returned 404.
      if (uncertain) throw recoveryError();
      await this.store.markAttempt(a.bookingRequestId, 'FAILED', error instanceof AppError ? error.code : 'BOOKING_FAILED');
      throw error;
    }
    assertHeld();
    await this.store.markAttempt(a.bookingRequestId, 'INSERTING');
    assertHeld();
    let event: CalendarEvent;
    try { event = await this.calendar.insert(b, s, a); }
    catch (error) {
      if (!uncertain && error instanceof CalendarWriteError && error.definitive) {
        await this.store.markAttempt(a.bookingRequestId, 'FAILED', error.code);
        throw error;
      }
      throw recoveryError();
    }
    assertHeld();
    this.verifyEvent(event, a);
    try { return await this.store.confirm(a); } catch { throw recoveryError(); }
  }
  async reconcile(a: Attempt) {
    const b = await requireBusiness(this.store, a.businessId);
    if (b.calendarId !== a.calendarId) throw recoveryError();
    return this.lock.withLock(a.calendarId, async assertHeld => {
      const current = await this.store.attempt(a.bookingRequestId);
      if (!current || current.state === 'FAILED') return;
      if (current.state === 'CONFIRMED') return;
      // Retrieval comes before active-service checks: recover a created event even if the service was disabled later.
      if (current.state === 'INSERTING') {
        const found = await this.calendar.get(b, current.eventId);
        assertHeld();
        if (found) { this.verifyEvent(found, current); await this.store.confirm(current); return; }
      }
      const service = await requireService(this.store, b.id, current.serviceId);
      await this.execute(b, service, current, assertHeld);
    });
  }
}
