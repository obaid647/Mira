export interface HoursRange { open: string; close: string }
export type Hours = Record<string, HoursRange[]>;
export interface Business {
  id: string; name: string; phoneNumber: string; address: string; timezone: string;
  operatingHours: Hours; serviceArea: string[]; policies: Record<string, string>;
  calendarId: string | null; retellAgentId: string | null; isSampleData: boolean;
  minimumNoticeMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number;
  bookingHorizonDays: number; slotIntervalMinutes: number;
}
export interface Service {
  id: string; businessId: string; name: string; description: string; aliases: string[];
  durationMinutes: number; price: string | null; active: boolean; emergencyEligible: boolean;
}
export interface CallContext { callId: string; agentId: string; callerNumber?: string }
export interface BookingInput {
  business_id: string; service_id: string; customer_name: string; customer_phone: string;
  service_address: string; appointment_start: string; problem_description: string;
  booking_request_id: string; sms_consent: boolean;
}
export interface LeadInput {
  business_id: string; service_requested: string; notes: string; lead_request_id: string;
  caller_number?: string; customer_name?: string; urgency: 'unknown' | 'routine' | 'urgent';
}
export interface Interval { start: Date; end: Date }
export interface Attempt {
  bookingRequestId: string; businessId: string; customerId: string; serviceId: string;
  calendarId: string; eventId: string; fingerprint: string; snapshot: BookingInput;
  startTime: Date; endTime: Date; reservedStart: Date; reservedEnd: Date;
  retellCallId: string | null; state: 'PREPARED' | 'INSERTING' | 'CONFIRMED' | 'FAILED'; failureCode: string | null;
}
export interface Appointment {
  id: string; businessId: string; customerId: string; bookingRequestId: string;
  googleCalendarEventId: string; startTime: Date; endTime: Date; retellCallId: string | null;
}
export interface WebhookUpdate {
  event: 'call_started' | 'call_ended' | 'call_analyzed'; businessId: string; callId: string;
  callerNumber?: string; status: string; rank: number; startedAt?: Date; endedAt?: Date;
  summary?: string; failureDetails?: Record<string, string>;
  transcript?: string; recordingUrl?: string;
}
export interface Store {
  ping(): Promise<void>;
  business(id: string): Promise<Business | null>;
  businessByAgent(agentId: string): Promise<Business | null>;
  services(businessId: string): Promise<Service[]>;
  service(businessId: string, id: string): Promise<Service | null>;
  attempt(id: string): Promise<Attempt | null>;
  appointment(id: string): Promise<Appointment | null>;
  prepare(attempt: Omit<Attempt, 'customerId' | 'state' | 'failureCode'>, context?: CallContext): Promise<Attempt>;
  markAttempt(id: string, state: Attempt['state'], failureCode?: string): Promise<void>;
  confirm(attempt: Attempt): Promise<Appointment>;
  reservations(calendarId: string, range: Interval, excludeRequestId?: string): Promise<Interval[]>;
  unresolved(): Promise<Attempt[]>;
  createLead(input: LeadInput, fingerprint: string, context?: CallContext): Promise<{ id: string }>;
  recordWebhook(update: WebhookUpdate): Promise<void>;
}
export interface BookingLock {
  withLock<T>(calendarId: string, operation: (assertHeld: () => void) => Promise<T>): Promise<T>;
}
