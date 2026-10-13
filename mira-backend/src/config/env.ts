import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform(v => v === 'true');
const optionalSecret = z.string().trim().transform(v => v || undefined).optional();
const pgUrl = z.url().refine(v => /^postgres(ql)?:/.test(v), 'Must be a PostgreSQL URL');
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_KEY: z.string().min(32),
  DEMO_BUSINESS_ID: z.string().min(1).default('demo-business'),
  CORS_ORIGINS: z.string().default('').transform(v => v.split(',').map(s => s.trim()).filter(Boolean)),
  DATABASE_URL: pgUrl,
  DIRECT_URL: pgUrl.optional(),
  DATABASE_SSL: bool.default(true),
  DATABASE_CA_BASE64: optionalSecret,
  RETELL_AGENT_ID: optionalSecret,
  RETELL_API_KEY: optionalSecret,
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  GOOGLE_REFRESH_TOKEN: optionalSecret,
  GOOGLE_CALENDAR_ID: optionalSecret,
  GOOGLE_REDIRECT_URI: z.url().default('http://localhost:3005/oauth2callback'),
  CALENDAR_TIMEOUT_MS: z.coerce.number().int().min(1000).max(15000).default(8000),
  BOOKING_LOCK_WAIT_MS: z.coerce.number().int().min(0).max(5000).default(2000),
  STORE_TRANSCRIPTS: bool.default(false),
  STORE_RECORDINGS: bool.default(false),
  SMS_ENABLED: z.literal('false').default('false'),
}).superRefine((v, ctx) => {
  const port = new URL(v.DATABASE_URL).port;
  if (port === '6543') ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Use a direct connection or session pooler for advisory locks' });
  if (v.NODE_ENV === 'production' && !v.DATABASE_SSL) ctx.addIssue({ code: 'custom', path: ['DATABASE_SSL'], message: 'Production requires verified TLS' });
  const google = [v.GOOGLE_CLIENT_ID, v.GOOGLE_CLIENT_SECRET, v.GOOGLE_CALENDAR_ID];
  if ((google.some(Boolean) || v.GOOGLE_REFRESH_TOKEN) && !google.every(Boolean)) ctx.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_ID'], message: 'Configure Google client ID, client secret and calendar ID together; the helper supplies the local refresh token' });
});
export type Env = z.infer<typeof envSchema>;
export function parseEnv(input: NodeJS.ProcessEnv): Env { return envSchema.parse(input); }
