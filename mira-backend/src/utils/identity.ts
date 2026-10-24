import { createHash } from 'node:crypto';
export function fingerprint(value: object): string {
  const canonical = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
export function eventId(businessId: string, requestId: string): string {
  // Hex is a subset of Google Calendar's base32hex character set.
  return 'mira' + createHash('sha256').update(businessId + '\0' + requestId).digest('hex');
}
export function retellBookingPrefix(businessId: string, callId: string): string {
  // Scope the trusted call ID to its business and keep even 200-character call IDs bounded.
  return 'retell:' + createHash('sha256').update(businessId + '\0' + callId).digest('hex') + ':booking:';
}
