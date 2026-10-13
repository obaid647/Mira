import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from '../utils/errors.js';
export function apiKeyAuth(key: string): RequestHandler {
  const expected = createHash('sha256').update(key).digest();
  return (req, _res, next) => {
    const provided = req.get('x-api-key') ?? '';
    if (!timingSafeEqual(createHash('sha256').update(provided).digest(), expected)) return next(new AppError('UNAUTHORIZED', 'Unauthorized request.', 401));
    next();
  };
}
