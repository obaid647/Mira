import { parseEnv } from './config/env.js';
import { createDatabase } from './config/database.js';
import { createStore } from './config/store.js';
import { createLogger } from './utils/logger.js';
import { createApp } from './app.js';
import { EnvironmentCalendarCredentials } from './integrations/google-calendar/credentials.js';
import { GoogleCalendar } from './integrations/google-calendar/calendar.service.js';
import { PostgresBookingLock } from './modules/appointments/booking-lock.js';
import { ZodError } from 'zod';
import { existsSync } from 'node:fs';
try {
  const env = parseEnv(process.env), logger = createLogger(env.LOG_LEVEL);
  const db = createDatabase(env);
  db.lockPool.on('error', () => logger.error({ code: 'DATABASE_UNAVAILABLE' }, 'Idle booking connection failed'));
  const app = createApp({ env, logger, store: createStore(db.prisma), calendar: new GoogleCalendar(new EnvironmentCalendarCredentials(env), env.CALENDAR_TIMEOUT_MS), lock: new PostgresBookingLock(db.lockPool, env.BOOKING_LOCK_WAIT_MS) });
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT }, 'Mira backend listening');
    if (!env.RETELL_API_KEY || !env.RETELL_AGENT_ID) logger.warn('Retell setup is incomplete; signed calls and webhooks require configuration and seeding');
    if (!env.GOOGLE_CLIENT_ID) logger.warn('Google Calendar is unconfigured; availability and booking will return errors');
    else if (!env.GOOGLE_REFRESH_TOKEN && !existsSync('.oauth-credentials.json')) logger.warn('Google consent is pending; run google:authorize. No token values will be logged.');
  });
  server.requestTimeout = 30000;
  server.on('error', async () => { logger.fatal({ code: 'SERVER_START_FAILED' }, 'Server could not start'); await db.close(); process.exitCode = 1; });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => { logger.error('Graceful shutdown timed out'); process.exit(1); }, 25000);
    timer.unref();
    server.close(async () => { await db.close(); clearTimeout(timer); process.exitCode = 0; });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (error) {
  // Startup diagnostics list variable names only, never their values.
  const fields = error instanceof ZodError ? error.issues.map(issue => issue.path.join('.')) : [];
  createLogger().fatal({ fields }, 'Startup configuration failed. Check .env.');
  process.exitCode = 1;
}
