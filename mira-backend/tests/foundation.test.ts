import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createLogger } from '../src/utils/logger.js';
import { FakeCalendar, MemoryLock, MemoryStore, now, testEnv } from './helpers.js';
describe('Phase 1 foundation', () => {
  const setup = () => { const store = new MemoryStore(); return { store, app: createApp({ env: testEnv(), store, calendar: new FakeCalendar(), lock: new MemoryLock(), logger: createLogger('silent'), now }) }; };
  it('responds on health without a database call', async () => { const { app, store } = setup(); const ping = vi.spyOn(store, 'ping'); const r = await request(app).get('/health'); expect(r.status).toBe(200); expect(r.body.status).toBe('ok'); expect(ping).not.toHaveBeenCalled(); expect(r.headers['x-powered-by']).toBeUndefined(); expect(r.headers['x-request-id']).toBeTruthy(); });
  it('checks database readiness and reports outages', async () => { const { app, store } = setup(); expect((await request(app).get('/ready')).status).toBe(200); vi.spyOn(store, 'ping').mockRejectedValue(new Error('secret')); const r = await request(app).get('/ready'); expect(r.status).toBe(503); expect(r.body.error_code).toBe('DATABASE_UNAVAILABLE'); expect(JSON.stringify(r.body)).not.toContain('secret'); });
  it('requires keys and provides safe validation errors', async () => { const { app } = setup(); expect((await request(app).post('/api/retell/get-business-information').send({ business_id: 'demo-business' })).status).toBe(401); const r = await request(app).post('/api/retell/get-business-information').set('x-api-key', testEnv().API_KEY).send({ business_id: 'demo-business', extra: 'sensitive' }); expect(r.status).toBe(400); expect(r.body.error_code).toBe('INVALID_REQUEST'); expect(JSON.stringify(r.body)).not.toContain('sensitive'); });
  it('rejects missing secrets, partial Google config, transaction poolers and insecure production TLS', () => { const good = { API_KEY: testEnv().API_KEY, DATABASE_URL: 'postgresql://localhost:5432/mira' }; expect(() => parseEnv({})).toThrow(); expect(() => parseEnv({ ...good, GOOGLE_CLIENT_ID: 'partial' })).toThrow(); expect(() => parseEnv({ ...good, DATABASE_URL: 'postgresql://host:6543/mira' })).toThrow(); expect(() => parseEnv({ ...good, NODE_ENV: 'production', DATABASE_SSL: 'false' })).toThrow(); expect(parseEnv(good).STORE_TRANSCRIPTS).toBe(false); });
  it('keeps credentials, caller data and driver errors out of application logs', async () => {
    const store = new MemoryStore(), logger = createLogger('silent');
    const info = vi.spyOn(logger, 'info'), error = vi.spyOn(logger, 'error');
    vi.spyOn(store, 'business').mockRejectedValue(new Error('PRIVATE_DRIVER_VALUE'));
    const app = createApp({ env: testEnv(), store, calendar: new FakeCalendar(), lock: new MemoryLock(), logger, now });
    await request(app).post('/api/retell/get-services').set('x-api-key', testEnv().API_KEY).send({ business_id: 'demo-business', service_query: 'PRIVATE_CALLER_VALUE' });
    const logs = JSON.stringify([info.mock.calls, error.mock.calls]);
    expect(logs).not.toContain(testEnv().API_KEY); expect(logs).not.toContain('PRIVATE_DRIVER_VALUE'); expect(logs).not.toContain('PRIVATE_CALLER_VALUE');
  });
});
