import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from 'pino';
import { AppError } from '../utils/errors.js';
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    const malformed = error instanceof SyntaxError && 'body' in error;
    const tooLarge = typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large';
    const safe = error instanceof AppError ? error : error instanceof ZodError || malformed || tooLarge
      ? new AppError('INVALID_REQUEST', 'Please check the information provided.', tooLarge ? 413 : 400)
      : new AppError('BOOKING_FAILED', 'I could not complete that action. Please leave a message.', 500);
    // Do not serialize provider errors: they can contain credentials, URLs, or personal data.
    logger[safe.status >= 500 ? 'error' : 'warn']({ requestId: res.locals.requestId, code: safe.code, status: safe.status }, 'Request failed');
    res.status(safe.status).json({ success: false, error_code: safe.code, message: safe.message, request_id: res.locals.requestId });
  };
}
