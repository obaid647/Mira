import { parseEnv } from '../src/config/env.js';
import { createDatabase } from '../src/config/database.js';
import { createStore } from '../src/config/store.js';
import { GoogleCalendar } from '../src/integrations/google-calendar/calendar.service.js';
import { EnvironmentCalendarCredentials } from '../src/integrations/google-calendar/credentials.js';
import { PostgresBookingLock } from '../src/modules/appointments/booking-lock.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AppError } from '../src/utils/errors.js';
const env = parseEnv(process.env), db = createDatabase(env), store = createStore(db.prisma);
const service = new AppointmentService(store, new GoogleCalendar(new EnvironmentCalendarCredentials(env), env.CALENDAR_TIMEOUT_MS), new PostgresBookingLock(db.lockPool, env.BOOKING_LOCK_WAIT_MS), () => new Date());
try {
  const attempts = await store.unresolved();
  console.log(`Checking ${attempts.length} unresolved attempts. Existing events are recovered; missing events may be created after a live availability recheck.`);
  for (const a of attempts) {
    try { await service.reconcile(a); console.log(JSON.stringify({ request_id: a.bookingRequestId, result: 'reconciled' })); }
    catch (error) { console.error(JSON.stringify({ request_id: a.bookingRequestId, result: 'unresolved', code: error instanceof AppError ? error.code : 'BOOKING_FAILED' })); process.exitCode = 1; }
  }
} catch { console.error('Reconciliation could not read the database.'); process.exitCode = 1; }
finally { await db.close(); }
