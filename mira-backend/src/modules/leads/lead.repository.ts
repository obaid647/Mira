import type { PrismaClient } from '../../generated/prisma/client.js';
import type { CallContext, LeadInput } from '../../types/domain.js';
import { AppError } from '../../utils/errors.js';
import { upsertCustomer } from '../customers/customer.repository.js';
import { ensureCall } from '../calls/call.repository.js';
import { advisoryKey } from '../appointments/booking-lock.js';
export class LeadRepository {
  constructor(private db: PrismaClient) {}
  async create(input: LeadInput, fingerprint: string, context?: CallContext) {
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKey('lead:' + input.lead_request_id)}::bigint)`;
      const existing = await tx.lead.findUnique({ where: { leadRequestId: input.lead_request_id } });
      if (existing) {
        if (existing.fingerprint !== fingerprint || existing.businessId !== input.business_id || existing.retellCallId !== (context?.callId ?? null)) throw new AppError('IDEMPOTENCY_CONFLICT', 'Please use a new identifier for a different request.', 409);
        return { id: existing.id };
      }
      const phone = input.caller_number ?? context?.callerNumber;
      const customer = phone && input.customer_name ? await upsertCustomer(tx, input.business_id, input.customer_name, phone) : null;
      if (context) await ensureCall(tx, input.business_id, context, customer?.id);
      const lead = await tx.lead.create({ data: { businessId: input.business_id, customerId: customer?.id, callerNumber: phone,
        serviceRequested: input.service_requested, notes: input.notes, urgency: input.urgency.toUpperCase() as 'UNKNOWN' | 'ROUTINE' | 'URGENT',
        leadRequestId: input.lead_request_id, fingerprint, retellCallId: context?.callId } });
      return { id: lead.id };
    }, { timeout: 5000 });
  }
}
