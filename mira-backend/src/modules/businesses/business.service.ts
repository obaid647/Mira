import { DateTime } from 'luxon';
import type { Business, Store } from '../../types/domain.js';
import { AppError } from '../../utils/errors.js';
import { businessConfigSchema } from './business.schema.js';
export async function requireBusiness(store: Store, id: string): Promise<Business> {
  const business = await store.business(id);
  if (!business) throw new AppError('BUSINESS_NOT_FOUND', 'I could not find that business.', 404);
  if (!businessConfigSchema.safeParse(business).success) throw new AppError('BUSINESS_CONFIGURATION_ERROR', 'The business configuration needs attention.', 503);
  return business;
}
export async function businessInformation(store: Store, id: string, now: () => Date) {
  const b = await requireBusiness(store, id);
  return { success: true, business_id: b.id, name: b.name, address: b.address, phone_number: b.phoneNumber,
    timezone: b.timezone, operating_hours: b.operatingHours, service_area: b.serviceArea, policies: b.policies,
    current_local_time: DateTime.fromJSDate(now(), { zone: b.timezone }).toISO(), is_sample_data: b.isSampleData };
}
