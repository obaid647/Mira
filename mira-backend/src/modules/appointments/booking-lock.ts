import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { BookingLock } from '../../types/domain.js';
import { AppError } from '../../utils/errors.js';
export function advisoryKey(value: string): string { return createHash('sha256').update(value).digest().readBigInt64BE().toString(); }
export class PostgresBookingLock implements BookingLock {
  constructor(private pool: Pool, private waitMs: number) {}
  async withLock<T>(calendarId: string, operation: (assertHeld: () => void) => Promise<T>): Promise<T> {
    let client: PoolClient;
    try { client = await this.pool.connect(); } catch { throw new AppError('BOOKING_FAILED', 'Booking is temporarily unavailable.', 503); }
    let held = false;
    let broken = false;
    const onError = () => { broken = true; };
    client.on('error', onError);
    const key = advisoryKey('calendar:' + calendarId);
    const assertHeld = () => { if (broken || !held) throw new AppError('BOOKING_RECONCILIATION_REQUIRED', 'I cannot confirm that booking yet. Please leave a message.', 503); };
    try {
      const deadline = Date.now() + this.waitMs;
      do {
        let result;
        try { result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS locked', [key]); }
        catch { broken = true; throw new AppError('BOOKING_FAILED', 'Booking is temporarily unavailable.', 503); }
        held = result.rows[0]?.locked ?? false;
        if (held) break;
        if (Date.now() >= deadline) throw new AppError('BOOKING_IN_PROGRESS', 'Another booking is being checked. Please try again shortly.', 409);
        await new Promise(resolve => setTimeout(resolve, 50));
      } while (!held);
      assertHeld();
      return await operation(assertHeld);
    } finally {
      if (held && !broken) {
        try { const result = await client.query<{ unlocked: boolean }>('SELECT pg_advisory_unlock($1::bigint) AS unlocked', [key]); broken = !result.rows[0]?.unlocked; }
        catch { broken = true; }
      }
      client.removeListener('error', onError);
      client.release(broken);
    }
  }
}
