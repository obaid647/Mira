import pino from 'pino';
export function createLogger(level = 'info') {
  return pino({ level, redact: ['req.headers.authorization', 'req.headers.x-api-key', 'req.headers.x-retell-signature', 'password', 'token', 'credentials'], base: undefined });
}
