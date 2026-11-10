import type { Service, Store } from '../../types/domain.js';
import { AppError } from '../../utils/errors.js';
import { requireBusiness } from '../businesses/business.service.js';
import { matchServices } from './service.matcher.js';

export type ServiceCandidate = Pick<Service, 'id' | 'name' | 'description' | 'active'>;
export type ServiceVerification = {
  success: true; is_sample_data: boolean; candidates: ServiceCandidate[];
} & ({
  service_found: true; match_status: 'supported';
  service: { id: string; name: string; duration_minutes: number; price: string | null; emergency_eligible: boolean };
} | {
  service_found: false; match_status: 'unknown' | 'ambiguous' | 'unsupported'; service: null;
});
export async function requireService(store: Store, businessId: string, id: string): Promise<Service> {
  const service = await store.service(businessId, id);
  if (!service?.active) throw new AppError('SERVICE_NOT_FOUND', 'I could not verify that service.', 404);
  if (!Number.isInteger(service.durationMinutes) || service.durationMinutes < 1) throw new AppError('BUSINESS_CONFIGURATION_ERROR', 'The service configuration needs attention.', 503);
  return service;
}
export async function verifyService(store: Store, businessId: string, query: string): Promise<ServiceVerification> {
  const b = await requireBusiness(store, businessId);
  const all = await store.services(businessId);
  const matches = matchServices(query, all);
  if (matches.length !== 1) return { success: true, service_found: false, match_status: matches.length ? 'ambiguous' : 'unknown', service: null,
    candidates: matches.map(({ id, name, description, active }) => ({ id, name, description, active })), is_sample_data: b.isSampleData };
  const service = matches[0]!;
  if (!service.active) return { success: true, service_found: false, match_status: 'unsupported', service: null, candidates: [], is_sample_data: b.isSampleData };
  return { success: true, service_found: true, match_status: 'supported', service: { id: service.id, name: service.name,
    duration_minutes: service.durationMinutes, price: service.price, emergency_eligible: service.emergencyEligible }, candidates: [], is_sample_data: b.isSampleData };
}
