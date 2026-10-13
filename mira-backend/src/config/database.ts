import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from './env.js';
export function connectionOptions(env: Pick<Env, 'DATABASE_URL' | 'DATABASE_SSL' | 'DATABASE_CA_BASE64'>) {
  const url = new URL(env.DATABASE_URL);
  // pg URL SSL options can override the verified TLS object; keep TLS under our control.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: env.DATABASE_SSL
    ? { rejectUnauthorized: true, ...(env.DATABASE_CA_BASE64 ? { ca: Buffer.from(env.DATABASE_CA_BASE64, 'base64').toString('utf8') } : {}) }
    : false, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 5000, query_timeout: 6000, max: 5 };
}
export function createDatabase(env: Env) {
  const options = connectionOptions(env);
  const schema = new URL(env.DATABASE_URL).searchParams.get('schema') ?? 'public';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error('Invalid database schema');
  const prisma = new PrismaClient({ adapter: new PrismaPg(options, { schema }) });
  const lockPool = new Pool({ ...options, max: 4, query_timeout: 3000 });
  return { prisma, lockPool, close: async () => { await Promise.allSettled([prisma.$disconnect(), lockPool.end()]); } };
}
