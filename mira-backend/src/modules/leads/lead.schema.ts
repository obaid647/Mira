import { z } from 'zod';
import { phoneSchema } from '../../utils/phone.js';
const text = (max: number) => z.string().trim().min(1).max(max);
export const leadSchema = z.object({
  business_id: text(128), service_requested: text(500), notes: text(2000), lead_request_id: text(200),
  caller_number: phoneSchema.optional(), customer_name: text(120).optional(),
  urgency: z.enum(['unknown', 'routine', 'urgent']).default('unknown'),
}).strict();
