import type { CallContext, LeadInput, Store } from '../../types/domain.js';
import { requireBusiness } from '../businesses/business.service.js';
import { fingerprint } from '../../utils/identity.js';
export async function createLead(store: Store, input: LeadInput, context?: CallContext) {
  await requireBusiness(store, input.business_id);
  const normalized = { ...input, ...(input.caller_number ?? context?.callerNumber ? { caller_number: input.caller_number ?? context?.callerNumber } : {}) };
  const lead = await store.createLead(normalized, fingerprint(normalized), context);
  return { success: true, lead_id: lead.id, status: 'open', message: 'Your message has been recorded for follow-up.' };
}
