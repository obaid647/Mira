import { describe, it, expect } from 'vitest';
import { businessInformation } from '../src/modules/businesses/business.service.js';
import { verifyService, requireService } from '../src/modules/services/service.service.js';
import { MemoryStore, now } from './helpers.js';
describe('Business and service verification', () => {
  it('returns sample business information and local clock', async () => { const result = await businessInformation(new MemoryStore(), 'demo-business', now); expect(result.is_sample_data).toBe(true); expect(result.timezone).toBe('America/Toronto'); expect(result.current_local_time).toContain('2026-10-11'); expect(result.policies.pricing).toContain('not configured'); });
  it('reports missing business', async () => { await expect(businessInformation(new MemoryStore(), 'missing', now)).rejects.toMatchObject({ code: 'BUSINESS_NOT_FOUND' }); });
  it('matches configured aliases without inventing price', async () => { const r = await verifyService(new MemoryStore(), 'demo-business', 'Hi, my leaking basement pipe needs repair'); expect(r.service_found).toBe(true); expect(r.service).toMatchObject({ id: 'pipe-repair', duration_minutes: 60, price: null }); });
  it('uses configured descriptions', async () => { const r = await verifyService(new MemoryStore(), 'demo-business', 'Repair of leaking domestic water pipes'); expect(r.service_found).toBe(true); });
  it('returns unknown for unsupported or unverified requests', async () => { expect(await verifyService(new MemoryStore(), 'demo-business', 'install a solar panel')).toMatchObject({ service_found: false, match_status: 'unknown', service: null }); });
  it('requires clarification for ambiguity', async () => { expect(await verifyService(new MemoryStore(), 'demo-business', 'leaking pipe and blocked drain')).toMatchObject({ service_found: false, match_status: 'ambiguous' }); });
  it('does not offer inactive or cross-business services', async () => { const store = new MemoryStore(); store.serviceRecords[0]!.active = false; expect(await verifyService(store, 'demo-business', 'pipe repair')).toMatchObject({ service_found: false, match_status: 'unsupported' }); await expect(requireService(store, 'another', 'pipe-repair')).rejects.toMatchObject({ code: 'SERVICE_NOT_FOUND' }); });
});
