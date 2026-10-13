import { parseEnv } from '../src/config/env.js';
import { createDatabase } from '../src/config/database.js';
import { createStore } from '../src/config/store.js';
import { GoogleCalendar } from '../src/integrations/google-calendar/calendar.service.js';
import { EnvironmentCalendarCredentials } from '../src/integrations/google-calendar/credentials.js';
import { Retell } from 'retell-sdk';
import { ZodError } from 'zod';
try {
  const googleKeys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_CALENDAR_ID'] as const;
  const googleComplete = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALENDAR_ID'].every(key => Boolean(process.env[key]));
  // Probe independent providers while OAuth setup is still incomplete; server startup remains strict.
  const probeEnv = googleComplete ? process.env : { ...process.env, ...Object.fromEntries(googleKeys.map(key => [key, undefined])) };
  const env = parseEnv(probeEnv), db = createDatabase(env), store = createStore(db.prisma);
  try {
    try { await store.ping(); console.log('PostgreSQL: connection verified.'); } catch { console.log('PostgreSQL: connection failed; check local configuration.'); process.exitCode = 1; }
    let business;
    try { business = await store.business(env.DEMO_BUSINESS_ID); } catch { /* report unavailable without leaking driver error */ }
    if (business && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      try { const now = new Date(); await new GoogleCalendar(new EnvironmentCalendarCredentials(env), env.CALENDAR_TIMEOUT_MS).busy(business, { start: now, end: new Date(now.getTime() + 86400000) }); console.log('Google Calendar: live FreeBusy verified. Event creation is not tested by this command.'); }
      catch { console.log('Google Calendar: live check failed; complete OAuth and verify calendar access.'); process.exitCode = 1; }
    } else { console.log('Google Calendar: pending credentials and seeded business.'); process.exitCode = 1; }
    if (env.RETELL_API_KEY && env.RETELL_AGENT_ID) {
      try { await new Retell({ apiKey: env.RETELL_API_KEY, timeout: 8000, maxRetries: 0 }).agent.retrieve(env.RETELL_AGENT_ID); console.log('Retell: existing agent access verified. A live call still needs manual testing.'); }
      catch { console.log('Retell: agent access check failed.'); process.exitCode = 1; }
    } else { console.log('Retell: pending API key and agent ID.'); process.exitCode = 1; }
  } finally { await db.close(); }
} catch (error) { console.log('Configuration incomplete: ' + (error instanceof ZodError ? error.issues.map(i => i.path.join('.')).join(', ') : 'check .env')); process.exitCode = 1; }
