import type { Attempt, Business, Interval, Service } from '../../types/domain.js';
export interface CalendarEvent {
  id: string; start: Date; end: Date; status: string;
  bookingRequestId: string; fingerprint: string; businessId: string;
}
export interface Calendar {
  busy(business: Business, range: Interval): Promise<Interval[]>;
  insert(business: Business, service: Service, attempt: Attempt): Promise<CalendarEvent>;
  get(business: Business, eventId: string): Promise<CalendarEvent | null>;
}
