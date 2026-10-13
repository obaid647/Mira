import { afterAll, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { createServer } from 'node:net';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../src/generated/prisma/client.js';
import { createDatabase, connectionOptions } from '../src/config/database.js';
import { createStore } from '../src/config/store.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { PostgresBookingLock } from '../src/modules/appointments/booking-lock.js';
import { demoBusiness, demoServices } from '../prisma/demo-data.js';
import { testEnv, booking, FakeCalendar, now } from './helpers.js';
import { createLead } from '../src/modules/leads/lead.service.js';

describe('Real PostgreSQL migrations and concurrency', () => {
  let embedded: EmbeddedPostgres | undefined, admin: Pool | undefined;
  let db1: ReturnType<typeof createDatabase>, db2: ReturnType<typeof createDatabase>;
  const schema = 'mira_test_' + randomUUID().replaceAll('-', '');
  beforeAll(async () => {
    let url = process.env.TEST_DATABASE_URL;
    if (!url) {
      await mkdir('.cache', { recursive: true });
      const dir = await mkdtemp(resolve('.cache/pg-'));
      if (!dir.startsWith(resolve('.cache') + '\\') && !dir.startsWith(resolve('.cache') + '/')) throw new Error('Test cluster must remain inside .cache');
      const listener = createServer(); await new Promise<void>(r => listener.listen(0, '127.0.0.1', r));
      const port = (listener.address() as { port: number }).port; await new Promise<void>((r, reject) => listener.close(e => e ? reject(e) : r()));
      embedded = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: randomUUID(), port, persistent: false, onLog: () => {}, onError: () => {} });
      await embedded.initialise(); await embedded.start();
      const client = embedded.getPgClient('postgres', '127.0.0.1');
      // getPgClient owns the generated password; do not output it.
      const cfg = (client as unknown as { connectionParameters: { user: string; password: string; port: number } }).connectionParameters;
      url = `postgresql://${cfg.user}:${encodeURIComponent(cfg.password)}@127.0.0.1:${cfg.port}/postgres`;
    }
    const ssl = process.env.TEST_DATABASE_URL ? process.env.DATABASE_SSL !== 'false' : false;
    const target = new URL(url); target.searchParams.set('schema', schema);
    const env = { ...testEnv(), DATABASE_URL: target.toString(), DATABASE_SSL: ssl, DATABASE_CA_BASE64: process.env.DATABASE_CA_BASE64 };
    admin = new Pool(connectionOptions(env)); await admin.query(`CREATE SCHEMA "${schema}"`);
    // Exercise the actual committed Prisma migrations, not a mock or db push.
    await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DIRECT_URL: target.toString(), DATABASE_URL: target.toString() }, timeout: 60000, windowsHide: true });
    db1 = createDatabase(env); db2 = createDatabase(env);
    const b = demoBusiness('demo-business', 'integration-calendar', 'agent-demo');
    await db1.prisma.business.create({ data: { ...b, operatingHours: b.operatingHours as unknown as Prisma.InputJsonObject } });
    await db1.prisma.service.createMany({ data: demoServices() });
  }, 90000);
  beforeEach(async () => {
    await db1.prisma.$transaction([db1.prisma.callLog.deleteMany(), db1.prisma.webhookReceipt.deleteMany(), db1.prisma.lead.deleteMany(), db1.prisma.appointment.deleteMany(), db1.prisma.bookingAttempt.deleteMany(), db1.prisma.customer.deleteMany()]);
  });
  afterAll(async () => {
    if (db1) await db1.close(); if (db2) await db2.close();
    if (admin) { try { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); } finally { await admin.end(); } }
    if (embedded) await embedded.stop();
  }, 30000);
  function services() {
    const calendar = new FakeCalendar();
    const store1 = createStore(db1.prisma), store2 = createStore(db2.prisma);
    return { calendar, store1, store2, a: new AppointmentService(store1, calendar, new PostgresBookingLock(db1.lockPool, 2000), now), b: new AppointmentService(store2, calendar, new PostgresBookingLock(db2.lockPool, 2000), now) };
  }
  it('connects and persists normalized business-specific records', async () => { const { a, store1 } = services(); await store1.ping(); const r = await a.create(booking()); expect(r.status).toBe('confirmed'); expect(await db1.prisma.customer.count()).toBe(1); expect(await db1.prisma.appointment.count()).toBe(1); expect((await db2.prisma.customer.findFirst())!.phoneNumber).toBe('+15195550123'); });
  it('serializes conflicting attempts across independent connections', async () => { const { a, b, calendar } = services(); const result = await Promise.allSettled([a.create(booking()), b.create(booking({ booking_request_id: 'other' }))]); expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(calendar.inserts).toBe(1); expect(await db1.prisma.appointment.count()).toBe(1); });
  it('deduplicates simultaneous retries across connections', async () => { const { a, b, calendar } = services(); const [first, second] = await Promise.all([a.create(booking()), b.create(booking())]); expect(first.appointment_id).toBe(second.appointment_id); expect(calendar.inserts).toBe(1); });
  it('recovers a database-save failure after a real persisted journal and fake Calendar insertion', async () => { const { a, b, store1, calendar } = services(); vi.spyOn(store1, 'confirm').mockRejectedValueOnce(new Error('injected failure')); await expect(a.create(booking())).rejects.toMatchObject({ code: 'BOOKING_RECONCILIATION_REQUIRED' }); expect((await db1.prisma.bookingAttempt.findFirst())!.state).toBe('INSERTING'); await b.reconcile((await createStore(db2.prisma).unresolved())[0]!); expect(await db1.prisma.appointment.count()).toBe(1); expect(calendar.inserts).toBe(1); });
  it('deduplicates urgent leads concurrently', async () => { const { store1, store2 } = services(); const input = { business_id: 'demo-business', service_requested: 'pipe leak', notes: 'urgent callback', urgency: 'urgent' as const, lead_request_id: 'lead:one' }; const [first, second] = await Promise.all([createLead(store1, input), createLead(store2, input)]); expect(first.lead_id).toBe(second.lead_id); expect(await db1.prisma.lead.count()).toBe(1); });
  it('persists webhook receipts, out-of-order summaries and appointment association', async () => { const { store1, store2, a } = services(); await a.create(booking(), { callId: 'call-db', agentId: 'agent-demo' }); const analyzed = { event: 'call_analyzed' as const, businessId: 'demo-business', callId: 'call-db', status: 'ended', rank: 3, summary: 'Sample completed booking' }; await Promise.all([store1.recordWebhook(analyzed), store2.recordWebhook(analyzed)]); await store1.recordWebhook({ ...analyzed, event: 'call_started', rank: 1, status: 'ongoing', summary: undefined }); const call = await db1.prisma.callLog.findUniqueOrThrow({ where: { retellCallId: 'call-db' } }); expect(call.callStatus).toBe('ended'); expect(call.callSummary).toBe(analyzed.summary); expect(call.appointmentId).toBeTruthy(); expect(call.transcript).toBeNull(); expect(await db1.prisma.webhookReceipt.count()).toBe(2); });
  it('rejects cross-business foreign keys and duplicate customer phone numbers', async () => { await db1.prisma.customer.create({ data: { id: 'customer-one', businessId: 'demo-business', name: 'Sample', phoneNumber: '+15195550123' } }); await expect(db1.prisma.customer.create({ data: { businessId: 'demo-business', name: 'Other', phoneNumber: '+15195550123' } })).rejects.toThrow(); const other = demoBusiness('other'); await db1.prisma.business.upsert({ where: { id: other.id }, create: { ...other, operatingHours: other.operatingHours as unknown as Prisma.InputJsonObject }, update: {} }); await expect(db1.prisma.lead.create({ data: { businessId: 'other', customerId: 'customer-one', serviceRequested: 'repair', notes: 'sample', leadRequestId: 'bad-foreign-key', fingerprint: 'sample' } })).rejects.toThrow(); });
});
