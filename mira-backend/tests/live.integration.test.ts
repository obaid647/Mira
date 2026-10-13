import { afterAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { createDatabase } from '../src/config/database.js';
import { createStore } from '../src/config/store.js';
import { EnvironmentCalendarCredentials } from '../src/integrations/google-calendar/credentials.js';
import { GoogleCalendar } from '../src/integrations/google-calendar/calendar.service.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { PostgresBookingLock } from '../src/modules/appointments/booking-lock.js';
import { booking } from './helpers.js';
describe.skipIf(process.env.LIVE_TEST_ENABLED !== 'true')('Explicitly enabled live providers', () => {
  let db: ReturnType<typeof createDatabase> | undefined;
  afterAll(async () => { await db?.close(); });
  it('connects to PostgreSQL and retrieves live Calendar busy intervals', async () => { const env = parseEnv(process.env); db = createDatabase(env); const store = createStore(db.prisma); await store.ping(); const business = await store.business(env.DEMO_BUSINESS_ID); expect(business?.isSampleData).toBe(true); const now = new Date(); const busy = await new GoogleCalendar(new EnvironmentCalendarCredentials(env), env.CALENDAR_TIMEOUT_MS).busy(business!, { start: now, end: new Date(now.getTime() + 86400000) }); expect(Array.isArray(busy)).toBe(true); });
  it.skipIf(process.env.LIVE_BOOKING_ENABLED !== 'true')('creates and retrieves a real sample event and confirms database persistence', async () => { const env = parseEnv(process.env); if (!process.env.LIVE_TEST_START) throw new Error('Set LIVE_TEST_START to a valid available future slot.'); const database = db ?? createDatabase(env); db = database; const store = createStore(database.prisma); const business = await store.business(env.DEMO_BUSINESS_ID); expect(business?.isSampleData).toBe(true); const calendar = new GoogleCalendar(new EnvironmentCalendarCredentials(env), env.CALENDAR_TIMEOUT_MS); const requestId = 'live-test:' + process.env.LIVE_TEST_START; const service = new AppointmentService(store, calendar, new PostgresBookingLock(database.lockPool, env.BOOKING_LOCK_WAIT_MS), () => new Date()); const input = booking({ business_id: env.DEMO_BUSINESS_ID, appointment_start: process.env.LIVE_TEST_START, booking_request_id: requestId }); const result = await service.create(input); expect(result.status).toBe('confirmed'); const appointment = await store.appointment(requestId); expect(appointment).not.toBeNull(); expect((await calendar.get(business!, appointment!.googleCalendarEventId))?.status).toBe('confirmed'); expect((await service.create(input)).appointment_id).toBe(result.appointment_id); }, 40000);
});
