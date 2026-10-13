import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { invalid } from './errors.js';
import { z } from 'zod';
export function normalizePhone(value: string): string {
  const parsed = parsePhoneNumberFromString(value, 'CA');
  if (!parsed?.isValid()) throw invalid('Please provide a valid phone number, including its area code.');
  return parsed.number;
}
export function optionalCaller(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { return normalizePhone(value); } catch { return undefined; }
}
export const phoneSchema = z.string().trim().min(1).max(40).transform((value, ctx) => {
  try { return normalizePhone(value); }
  catch { ctx.addIssue({ code: 'custom', message: 'Please provide a valid phone number.' }); return z.NEVER; }
});
