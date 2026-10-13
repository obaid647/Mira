import { z } from 'zod';
export const serviceInput = z.object({ business_id: z.string().trim().min(1).max(128), service_query: z.string().trim().min(2).max(500) }).strict();
