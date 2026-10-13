import type { Service, Store } from '../../types/domain.js';
import { AppError } from '../../utils/errors.js';
import { requireBusiness } from '../businesses/business.service.js';
const normalize = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export async function requireService(store: Store, businessId: string, id: string): Promise<Service> {
  const service = await store.service(businessId, id);
  if (!service?.active) throw new AppError('SERVICE_NOT_FOUND', 'I could not verify that service.', 404);
  if (!Number.isInteger(service.durationMinutes) || service.durationMinutes < 1) throw new AppError('BUSINESS_CONFIGURATION_ERROR', 'The service configuration needs attention.', 503);
  return service;
}
export async function verifyService(store: Store, businessId: string, query: string) {
  const b = await requireBusiness(store, businessId);
  const normalized = normalize(query);
  const all = await store.services(businessId);
  const exact = all.filter(s => [s.name, s.description, ...s.aliases].some(v => normalize(v) === normalized));
  const candidates = exact.length ? exact : all.filter(s => [s.name, ...s.aliases, s.description].some(v => {
    const phrase = normalize(v);
    return phrase.length >= 4 && ` ${normalized} `.includes(` ${phrase} `);
  }));
  if (candidates.length !== 1) return { success: true, service_found: false, match_status: candidates.length ? 'ambiguous' : 'unknown', service: null, is_sample_data: b.isSampleData };
  const service = candidates[0]!;
  if (!service.active) return { success: true, service_found: false, match_status: 'unsupported', service: null, is_sample_data: b.isSampleData };
  return { success: true, service_found: true, match_status: 'supported', service: { id: service.id, name: service.name,
    duration_minutes: service.durationMinutes, price: service.price, emergency_eligible: service.emergencyEligible }, is_sample_data: b.isSampleData };
}
