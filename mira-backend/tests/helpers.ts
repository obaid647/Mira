import { randomUUID } from 'node:crypto';
import { demoBusiness, demoServices } from '../prisma/demo-data.js';
import type { Appointment, Attempt, BookingInput, BookingLock, Business, CallContext, Interval, LeadInput, Store, WebhookUpdate } from '../src/types/domain.js';
import type { Calendar, CalendarEvent } from '../src/integrations/google-calendar/calendar.types.js';
import { overlaps } from '../src/modules/appointments/availability.service.js';
import { AppError } from '../src/utils/errors.js';
import { parseEnv } from '../src/config/env.js';
export const now = () => new Date('2026-10-11T12:00:00Z');
export const testEnv = () => parseEnv({ NODE_ENV: 'test', API_KEY: 'test-api-key-that-is-long-enough-123456', DATABASE_URL: 'postgresql://localhost:5432/mira', DATABASE_SSL: 'false', RETELL_API_KEY: 'test-retell-key', RETELL_AGENT_ID: 'agent-demo', LOG_LEVEL: 'silent' });
export const booking = (overrides: Partial<BookingInput> = {}): BookingInput => ({ business_id: 'demo-business', service_id: 'pipe-repair', customer_name: 'Sample Caller', customer_phone: '+15195550123', service_address: '123 Sample Street, Cambridge, ON', appointment_start: '2026-10-12T09:00:00-04:00', problem_description: 'Basement pipe leaking', booking_request_id: 'call-test:booking:1', sms_consent: false, ...overrides });
export class MemoryStore implements Store {
  businesses = new Map<string, Business>([['demo-business', demoBusiness('demo-business', 'sample-calendar', 'agent-demo')]]);
  serviceRecords = demoServices();
  attempts = new Map<string, Attempt>(); appointments = new Map<string, Appointment>();
  customers = new Map<string, { id: string; name: string; phone: string }>();
  leads = new Map<string, { id: string; fingerprint: string; input: LeadInput; callId: string | null }>();
  calls = new Map<string, WebhookUpdate & { appointmentId?: string }>(); receipts = new Set<string>();
  async ping() {}
  async business(id: string) { return this.businesses.get(id) ?? null; }
  async businessByAgent(id: string) { return [...this.businesses.values()].find(b => b.retellAgentId === id) ?? null; }
  async services(businessId: string) { return this.serviceRecords.filter(s => s.businessId === businessId); }
  async service(businessId: string, id: string) { return this.serviceRecords.find(s => s.businessId === businessId && s.id === id) ?? null; }
  async attempt(id: string) { const a = this.attempts.get(id); return a ? { ...a } : null; }
  async appointment(id: string) { return this.appointments.get(id) ?? null; }
  async prepare(a: Omit<Attempt, 'customerId' | 'state' | 'failureCode'>, _context?: CallContext) {
    const key = a.businessId + ':' + a.snapshot.customer_phone;
    let customer = this.customers.get(key);
    if (!customer) { customer = { id: randomUUID(), name: a.snapshot.customer_name, phone: a.snapshot.customer_phone }; this.customers.set(key, customer); }
    const attempt: Attempt = { ...a, customerId: customer.id, state: 'PREPARED', failureCode: null };
    this.attempts.set(a.bookingRequestId, attempt);
    return { ...attempt };
  }
  async markAttempt(id: string, state: Attempt['state'], failureCode?: string) { Object.assign(this.attempts.get(id)!, { state, failureCode: failureCode ?? null }); }
  async confirm(a: Attempt) {
    const appointment = { id: randomUUID(), businessId: a.businessId, customerId: a.customerId, bookingRequestId: a.bookingRequestId, googleCalendarEventId: a.eventId, startTime: a.startTime, endTime: a.endTime, retellCallId: a.retellCallId };
    this.appointments.set(a.bookingRequestId, appointment);
    await this.markAttempt(a.bookingRequestId, 'CONFIRMED');
    return appointment;
  }
  async reservations(calendarId: string, range: Interval, exclude?: string) { return [...this.attempts.values()].filter(a => a.calendarId === calendarId && a.bookingRequestId !== exclude && a.state !== 'FAILED').map(a => ({ start: a.reservedStart, end: a.reservedEnd })).filter(a => overlaps(a, range)); }
  async unresolved() { return [...this.attempts.values()].filter(a => a.state === 'PREPARED' || a.state === 'INSERTING'); }
  async createLead(input: LeadInput, fingerprint: string, context?: CallContext) {
    const existing = this.leads.get(input.lead_request_id);
    if (existing) { if (existing.fingerprint !== fingerprint || existing.callId !== (context?.callId ?? null)) throw new AppError('IDEMPOTENCY_CONFLICT', 'Conflicting request.', 409); return { id: existing.id }; }
    const lead = { id: randomUUID(), fingerprint, input, callId: context?.callId ?? null }; this.leads.set(input.lead_request_id, lead); return { id: lead.id };
  }
  async recordWebhook(u: WebhookUpdate) {
    const key = u.event + ':' + u.callId;
    if (this.receipts.has(key)) return;
    this.receipts.add(key);
    const current = this.calls.get(u.callId);
    this.calls.set(u.callId, current && current.rank > u.rank ? { ...current, startedAt: current.startedAt ?? u.startedAt } : { ...current, ...u });
  }
}
export class FakeCalendar implements Calendar {
  busyIntervals: Interval[] = []; events = new Map<string, CalendarEvent>(); inserts = 0;
  async busy(_b: Business, range: Interval) { return [...this.busyIntervals, ...this.events.values()].filter(i => overlaps(i, range)).map(i => ({ start: i.start, end: i.end })); }
  async insert(_b: Business, _s: unknown, a: Attempt) {
    const existing = this.events.get(a.eventId); if (existing) return existing;
    this.inserts++;
    const event = { id: a.eventId, start: a.startTime, end: a.endTime, status: 'confirmed', bookingRequestId: a.bookingRequestId, fingerprint: a.fingerprint, businessId: a.businessId };
    this.events.set(a.eventId, event); return event;
  }
  async get(_b: Business, id: string) { return this.events.get(id) ?? null; }
}
export class MemoryLock implements BookingLock {
  private tails = new Map<string, Promise<void>>();
  async withLock<T>(id: string, operation: (assertHeld: () => void) => Promise<T>): Promise<T> {
    const previous = this.tails.get(id) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>(resolve => { release = resolve; }); this.tails.set(id, tail);
    await previous;
    try { return await operation(() => {}); } finally { release(); if (this.tails.get(id) === tail) this.tails.delete(id); }
  }
}
