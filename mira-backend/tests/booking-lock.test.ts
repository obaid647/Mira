import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';
import { PostgresBookingLock } from '../src/modules/appointments/booking-lock.js';
describe('Booking lock connection cleanup', () => {
  const setup = () => { const client = Object.assign(new EventEmitter(), { query: vi.fn(), release: vi.fn() }); const pool = { connect: async () => client } as unknown as Pool; return { client, lock: new PostgresBookingLock(pool, 0) }; };
  it('releases the advisory lock after operation failure', async () => { const { client, lock } = setup(); client.query.mockResolvedValueOnce({ rows: [{ locked: true }] }).mockResolvedValueOnce({ rows: [{ unlocked: true }] }); await expect(lock.withLock('calendar', async () => { throw new Error('operation failed'); })).rejects.toThrow('operation failed'); expect(client.query).toHaveBeenCalledTimes(2); expect(client.release).toHaveBeenCalledWith(false); });
  it('discards a connection with an uncertain acquisition result', async () => { const { client, lock } = setup(); client.query.mockRejectedValue(new Error('response lost')); await expect(lock.withLock('calendar', async () => 'done')).rejects.toMatchObject({ code: 'BOOKING_FAILED' }); expect(client.release).toHaveBeenCalledWith(true); });
  it('discards an unconfirmed unlock', async () => { const { client, lock } = setup(); client.query.mockResolvedValueOnce({ rows: [{ locked: true }] }).mockResolvedValueOnce({ rows: [{ unlocked: false }] }); expect(await lock.withLock('calendar', async () => 'done')).toBe('done'); expect(client.release).toHaveBeenCalledWith(true); });
  it('prevents a booking continuation after connection loss', async () => { const { client, lock } = setup(); client.query.mockResolvedValueOnce({ rows: [{ locked: true }] }); await expect(lock.withLock('calendar', async assertHeld => { client.emit('error', new Error('connection lost')); assertHeld(); return 'done'; })).rejects.toMatchObject({ code: 'BOOKING_RECONCILIATION_REQUIRED' }); expect(client.release).toHaveBeenCalledWith(true); });
});
