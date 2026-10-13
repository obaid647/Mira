import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import type { BookingLock, Store } from './types/domain.js';
import type { Calendar } from './integrations/google-calendar/calendar.types.js';
import { AvailabilityService } from './modules/appointments/availability.service.js';
import { AppointmentService } from './modules/appointments/appointment.service.js';
import { retellRoutes } from './integrations/retell/retell.routes.js';
import { verifySignature, type RawRequest } from './integrations/retell/retell.adapter.js';
import { handleWebhook } from './modules/calls/call.webhook.js';
import { errorHandler } from './middleware/errors.js';
import { AppError } from './utils/errors.js';
export interface AppDependencies { env: Env; store: Store; calendar: Calendar; lock: BookingLock; logger: Logger; now?: () => Date }
export function createApp({ env, store, calendar, lock, logger, now = () => new Date() }: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const started = performance.now();
    res.on('finish', () => logger.info({ requestId, method: req.method, path: req.route?.path ?? 'unmatched', status: res.statusCode, durationMs: Math.round(performance.now() - started) }, 'Request completed'));
    next();
  });
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: false }));
  app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { (req as RawRequest).rawBody = Buffer.from(buffer); } }));
  app.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    try { await store.ping(); } catch { throw new AppError('DATABASE_UNAVAILABLE', 'The database is unavailable.', 503); }
    res.json({ success: true, status: 'ready' });
  });
  app.use('/api/retell', retellRoutes(env, store, new AvailabilityService(store, calendar, now), new AppointmentService(store, calendar, lock, now), now));
  app.post('/api/webhooks/retell', async (req, res) => {
    await verifySignature(req, env);
    await handleWebhook(store, req.body, env);
    res.status(204).end();
  });
  app.use((_req, _res, next) => next(new AppError('NOT_FOUND', 'Endpoint not found.', 404)));
  app.use(errorHandler(logger));
  return app;
}
