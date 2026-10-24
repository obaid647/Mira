import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { CalendarWriteError } from '../src/integrations/google-calendar/calendar.errors.js';
import { createLogger } from '../src/utils/logger.js';
import { eventId, fingerprint, retellBookingPrefix } from '../src/utils/identity.js';
import { FakeCalendar, MemoryLock, MemoryStore, booking, now, testEnv } from './helpers.js';

function setup() {
  const store = new MemoryStore(), calendar = new FakeCalendar(), lock = new MemoryLock();
  const app = createApp({ env: testEnv(), store, calendar, lock, logger: createLogger('silent'), now });
  const send = (args: object, callId = 'call-trusted') => {
    const raw = JSON.stringify({ name: 'create_appointment', args, call: { call_id: callId, agent_id: 'agent-demo' } });
    const timestamp = Date.now();
    const signature = `v=${timestamp},d=${createHmac('sha256', testEnv().RETELL_API_KEY!).update(raw + timestamp).digest('hex')}`;
    return request(app).post('/api/retell/create-appointment').set('x-api-key', testEnv().API_KEY)
      .set('x-retell-signature', signature).set('Content-Type', 'application/json').send(raw);
  };
  return { store, calendar, lock, app, send };
}
const callInput = () => { const { booking_request_id: _ignored, ...input } = booking(); return input; };

describe('Server-owned Retell booking identifiers', () => {
  it('accepts simple primitive arguments and generates a durable identifier without an ID argument', async () => {
    const { send, store, calendar } = setup();
    const response = await send(callInput());
    expect(response.status).toBe(200);
    expect(response.body.booking_request_id).toBe(retellBookingPrefix('demo-business', 'call-trusted') + '1');
    const saved = store.attempts.get(response.body.booking_request_id)!;
    expect(saved.snapshot.booking_request_id).toBe(response.body.booking_request_id);
    expect(saved.retellCallId).toBe('call-trusted');
    expect(calendar.inserts).toBe(1);
  });

  it('ignores changing model-generated IDs and canonicalizes equivalent timestamp offsets on retries', async () => {
    const { send, store, calendar } = setup();
    const first = await send(booking({ booking_request_id: 'invented-one' }));
    const retry = await send(booking({ booking_request_id: 'invented-two', appointment_start: '2026-10-12T13:00:00Z' }));
    expect(first.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(store.attempts.size).toBe(1);
    expect(calendar.inserts).toBe(1);
  });

  it('serializes concurrent retries even when the model supplies different IDs', async () => {
    const { send, store, calendar } = setup();
    const [first, second] = await Promise.all([send(booking({ booking_request_id: 'one' })), send(booking({ booking_request_id: 'two' }))]);
    expect(first.status).toBe(200); expect(second.status).toBe(200);
    expect(first.body.appointment_id).toBe(second.body.appointment_id);
    expect(store.attempts.size).toBe(1); expect(calendar.inserts).toBe(1);
  });

  it('blocks changed details after confirmation instead of creating a second appointment', async () => {
    const { send, store, calendar } = setup();
    await send(callInput());
    const changed = await send(booking({ booking_request_id: 'new-invented-id', appointment_start: '2026-10-12T11:00:00-04:00' }));
    expect(changed.status).toBe(409); expect(changed.body.error_code).toBe('IDEMPOTENCY_CONFLICT');
    expect(store.attempts.size).toBe(1); expect(calendar.inserts).toBe(1);
  });

  it('advances the persisted counter only for changed input after a definitive failure', async () => {
    const { send, store, calendar } = setup();
    calendar.busyIntervals.push({ start: new Date('2026-10-12T09:00:00-04:00'), end: new Date('2026-10-12T10:00:00-04:00') });
    expect((await send(callInput())).body.error_code).toBe('SLOT_UNAVAILABLE');
    expect((await send(booking({ booking_request_id: 'retry-failed' }))).body.error_code).toBe('SLOT_UNAVAILABLE');
    expect(store.attempts.size).toBe(1);
    const second = await send(booking({ appointment_start: '2026-10-12T11:00:00-04:00' }));
    expect(second.status).toBe(200);
    expect(second.body.booking_request_id).toBe(retellBookingPrefix('demo-business', 'call-trusted') + '2');
    // A delayed retry of the first failed attempt remains failed, even after a later success.
    expect((await send(callInput())).body.error_code).toBe('SLOT_UNAVAILABLE');
    expect(store.attempts.size).toBe(2); expect(calendar.inserts).toBe(1);
  });

  it('recovers a lost insert response across service reconstruction despite a new supplied ID', async () => {
    const { send, store, calendar, lock } = setup();
    const insert = calendar.insert.bind(calendar);
    vi.spyOn(calendar, 'insert').mockImplementationOnce(async (...args) => { await insert(...args); throw new CalendarWriteError(false); });
    expect((await send(callInput())).body.error_code).toBe('BOOKING_RECONCILIATION_REQUIRED');
    const restarted = new AppointmentService(store, calendar, lock, now);
    const result = await restarted.create(booking({ booking_request_id: 'invented-after-timeout' }), { callId: 'call-trusted', agentId: 'agent-demo' });
    expect(result.status).toBe('confirmed');
    expect(store.attempts.size).toBe(1); expect(calendar.inserts).toBe(1);
  });

  it('does not advance the counter for changed details while an insertion is uncertain', async () => {
    const { send, store, calendar } = setup();
    vi.spyOn(calendar, 'insert').mockRejectedValueOnce(new CalendarWriteError(false));
    expect((await send(callInput())).status).toBe(503);
    const changed = await send(booking({ appointment_start: '2026-10-12T11:00:00-04:00', booking_request_id: 'bypass' }));
    expect(changed.body.error_code).toBe('IDEMPOTENCY_CONFLICT');
    expect(store.attempts.size).toBe(1); expect([...store.attempts.values()][0]!.state).toBe('INSERTING');
  });

  it('recovers a persisted call attempt created before server-owned IDs were introduced', async () => {
    const { send, store, calendar } = setup();
    const snapshot = booking({ booking_request_id: 'legacy-call:booking:1', appointment_start: '2026-10-12T13:00:00.000Z' });
    const start = new Date(snapshot.appointment_start), end = new Date('2026-10-12T14:00:00Z');
    const context = { callId: 'call-trusted', agentId: 'agent-demo' };
    const attempt = await store.prepare({ bookingRequestId: snapshot.booking_request_id, businessId: snapshot.business_id,
      serviceId: snapshot.service_id, calendarId: 'sample-calendar', eventId: eventId(snapshot.business_id, snapshot.booking_request_id),
      fingerprint: fingerprint(snapshot), snapshot, startTime: start, endTime: end, reservedStart: start,
      reservedEnd: new Date('2026-10-12T14:15:00Z'), retellCallId: context.callId }, context);
    await store.markAttempt(attempt.bookingRequestId, 'INSERTING');
    await calendar.insert(store.businesses.get('demo-business')!, store.serviceRecords[0]!, attempt);
    const response = await send(booking({ booking_request_id: 'different-model-id' }));
    expect(response.status).toBe(200);
    expect(response.body.booking_request_id).toBe(snapshot.booking_request_id);
    expect(store.attempts.size).toBe(1); expect(calendar.inserts).toBe(1);
  });

  it('resumes the persisted prepared call attempt after interruption before insertion', async () => {
    const { send, store, calendar } = setup();
    vi.spyOn(store, 'markAttempt').mockRejectedValueOnce(new Error('interrupted before insert'));
    expect((await send(callInput())).status).toBe(500);
    expect([...store.attempts.values()][0]!.state).toBe('PREPARED');
    const response = await send(booking({ booking_request_id: 'changed-after-interruption' }));
    expect(response.status).toBe(200);
    expect(response.body.booking_request_id).toBe(retellBookingPrefix('demo-business', 'call-trusted') + '1');
    expect(store.attempts.size).toBe(1); expect(calendar.inserts).toBe(1);
  });

  it('does not insert or allocate a new identity if database preparation fails', async () => {
    const { send, store, calendar } = setup();
    vi.spyOn(store, 'prepare').mockRejectedValueOnce(new Error('database unavailable'));
    expect((await send(callInput())).status).toBe(500);
    expect(store.attempts.size).toBe(0); expect(calendar.inserts).toBe(0);
    const retry = await send(booking({ booking_request_id: 'different' }));
    expect(retry.status).toBe(200);
    expect(retry.body.booking_request_id).toBe(retellBookingPrefix('demo-business', 'call-trusted') + '1');
  });

  it('isolates verified call IDs and keeps long call IDs within the booking ID limit', async () => {
    const { send, store } = setup();
    const first = await send(callInput(), 'x'.repeat(200));
    const second = await send(booking({ appointment_start: '2026-10-12T11:00:00-04:00' }), 'another-call');
    expect(first.status).toBe(200); expect(second.status).toBe(200);
    expect(first.body.booking_request_id.length).toBeLessThanOrEqual(200);
    expect(first.body.booking_request_id).not.toBe(second.body.booking_request_id);
    expect(store.attempts.size).toBe(2);
  });

  it.each([
    { customer_name: '' }, { customer_name: 'x'.repeat(121) },
    { service_address: 'x'.repeat(501) }, { problem_description: 'x'.repeat(2001) },
    { appointment_start: 'tomorrow morning' }, { appointment_start: '2026-02-30T09:00:00-05:00' },
    { appointment_start: '2026-10-12T09:00:00' }, { customer_phone: '123' },
    { booking_request_id: 'x'.repeat(201) }, { sms_consent: 'false' },
    { booking_attempt_counter: 99 }, { retell_call_id: 'spoof' },
  ])('enforces backend Zod validation for simplified schema input: %j', async overrides => {
    const { send, store, calendar } = setup();
    const result = await send({ ...callInput(), ...overrides });
    expect(result.status).toBe(400); expect(result.body.error_code).toBe('INVALID_REQUEST');
    expect(store.attempts.size).toBe(0); expect(calendar.inserts).toBe(0);
  });

  it('rejects signed args-only bookings because they have no trusted call context', async () => {
    const { app, store, calendar } = setup();
    const raw = JSON.stringify(booking()), timestamp = Date.now();
    const signature = `v=${timestamp},d=${createHmac('sha256', testEnv().RETELL_API_KEY!).update(raw + timestamp).digest('hex')}`;
    const result = await request(app).post('/api/retell/create-appointment').set('x-api-key', testEnv().API_KEY)
      .set('x-retell-signature', signature).set('Content-Type', 'application/json').send(raw);
    expect(result.status).toBe(400); expect(store.attempts.size).toBe(0); expect(calendar.inserts).toBe(0);
  });
});
