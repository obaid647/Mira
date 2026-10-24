import { z } from 'zod';
import { phoneSchema } from '../../utils/phone.js';
const text = (max: number) => z.string().trim().min(1).max(max);
export const bookingSchema = z.object({
  business_id: text(128), service_id: text(128), customer_name: text(120),
  customer_phone: phoneSchema, service_address: text(500),
  appointment_start: z.iso.datetime({ offset: true }), problem_description: text(2000),
  booking_request_id: text(200), sms_consent: z.boolean().default(false),
}).strict();
// Retell may omit the legacy argument or still send it from an older dashboard schema.
// Validate its type/length if present, then discard it: only the server assigns call booking IDs.
export const retellBookingSchema = bookingSchema.omit({ booking_request_id: true }).extend({
  booking_request_id: text(200).optional(),
}).transform(({ booking_request_id: _ignored, ...input }) => input);
export const availabilitySchema = z.object({
  business_id: text(128), service_id: text(128),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.enum(['morning', 'afternoon', 'evening', 'any']).default('any'),
}).strict();
