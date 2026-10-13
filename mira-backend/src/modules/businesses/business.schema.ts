import { z } from 'zod';
import { DateTime } from 'luxon';
export const businessInput = z.object({ business_id: z.string().trim().min(1).max(128) }).strict();
export const hoursSchema = z.record(z.string().regex(/^[1-7]$/), z.array(z.object({
  open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).refine(v => v.open < v.close, 'Hours must open before closing')));
export const businessConfigSchema = z.object({
  timezone: z.string().refine(v => DateTime.now().setZone(v).isValid),
  operatingHours: hoursSchema,
  policies: z.record(z.string(), z.string()),
  minimumNoticeMinutes: z.number().int().nonnegative(),
  bufferBeforeMinutes: z.number().int().nonnegative(), bufferAfterMinutes: z.number().int().nonnegative(),
  bookingHorizonDays: z.number().int().positive(), slotIntervalMinutes: z.number().int().positive(),
});
