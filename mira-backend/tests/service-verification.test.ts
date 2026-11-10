import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/utils/logger.js';
import { demoBusiness, demoServices } from '../prisma/demo-data.js';
import { FakeCalendar, MemoryLock, MemoryStore, now, testEnv } from './helpers.js';

function setup() {
  const store = new MemoryStore();
  const app = createApp({ env: testEnv(), store, calendar: new FakeCalendar(), lock: new MemoryLock(), logger: createLogger('silent'), now });
  const verify = (service_query: string, business_id = 'demo-business') => request(app)
    .post('/api/retell/get-services').set('x-api-key', testEnv().API_KEY).send({ business_id, service_query });
  return { store, verify };
}

describe('Service verification response', () => {
  it('returns current configured details for a natural variation', async () => {
    const { store, verify } = setup();
    Object.assign(store.serviceRecords[0]!, { name: 'Domestic Pipe Repair', durationMinutes: 75, price: '125.50', emergencyEligible: false });
    const response = await verify('my kitchen pipes are leaking');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, service_found: true, match_status: 'supported',
      service: { id: 'pipe-repair', name: 'Domestic Pipe Repair', duration_minutes: 75, price: '125.50', emergency_eligible: false },
      candidates: [], is_sample_data: true });
  });

  it.each([
    ['Repair a leaking kitchen faucet supply or drain pipe underneath the sink', ['fixture-repair', 'pipe-repair']],
    ['leaking pipe and blocked drain', ['drain-cleaning', 'pipe-repair']],
  ])('returns only configured candidates for %s', async (query, candidateIds) => {
    const { store, verify } = setup();
    const response = await verify(query);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, service_found: false, match_status: 'ambiguous', service: null,
      candidates: candidateIds.map(id => {
        const { name, description, active } = store.serviceRecords.find(service => service.id === id)!;
        return { id, name, description, active };
      }), is_sample_data: true });
  });

  it.each(['my sink is leaking', 'install solar panels', 'repair', 'please help me', 'not pipe repair'])
  ('returns unknown without a service or candidates for %s', async query => {
    const { verify } = setup();
    const response = await verify(query);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, service_found: false, match_status: 'unknown', service: null, candidates: [] });
  });

  it('preserves unsupported and does not use activity to resolve ambiguity', async () => {
    const { store, verify } = setup();
    store.serviceRecords[0]!.active = false;
    const unsupported = await verify('kitchen pipes are leaking');
    expect(unsupported.status).toBe(200);
    expect(unsupported.body).toMatchObject({ service_found: false, match_status: 'unsupported', service: null, candidates: [] });
    const ambiguous = await verify('leaking pipe and blocked drain');
    expect(ambiguous.body).toMatchObject({ service_found: false, match_status: 'ambiguous', service: null,
      candidates: [{ id: 'drain-cleaning', active: true }, { id: 'pipe-repair', active: false }] });
  });

  it('keeps duplicate exact aliases ambiguous and returns each configured candidate once', async () => {
    const { store, verify } = setup();
    store.serviceRecords[2]!.aliases.push('pipe leak', 'pipe leak');
    const response = await verify('pipe leak');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ service_found: false, match_status: 'ambiguous', service: null,
      candidates: [{ id: 'fixture-repair' }, { id: 'pipe-repair' }] });
  });

  it('reflects catalog changes on the next request without restarting', async () => {
    const { store, verify } = setup();
    expect((await verify('garden hose leaks')).body.match_status).toBe('unknown');
    store.serviceRecords[0]!.aliases.push('leaking garden hose');
    expect((await verify('garden hose leaks')).body.service.id).toBe('pipe-repair');
    store.serviceRecords[0]!.active = false;
    expect((await verify('garden hose leaks')).body.match_status).toBe('unsupported');
    store.serviceRecords = store.serviceRecords.filter(service => service.id !== 'pipe-repair');
    expect((await verify('garden hose leaks')).body.match_status).toBe('unknown');
  });

  it('does not match or expose another business catalog', async () => {
    const { store, verify } = setup();
    store.businesses.set('another', demoBusiness('another'));
    const foreign = demoServices('another');
    foreign[0]!.aliases.push('garden hose leak');
    store.serviceRecords.push(...foreign);
    expect((await verify('garden hose leak')).body).toMatchObject({ match_status: 'unknown', candidates: [] });
    expect((await verify('leaking pipe and blocked drain')).body.candidates.map((candidate: { id: string }) => candidate.id))
      .toEqual(['drain-cleaning', 'pipe-repair']);
    expect((await verify('garden hose leak', 'another')).status).toBe(401);
  });
});
