import { calendar, calendar_v3 } from 'googleapis/build/src/apis/calendar/index.js';
import { OAuth2Client } from 'google-auth-library';
import type { Attempt, Business, Interval, Service } from '../../types/domain.js';
import type { Calendar, CalendarEvent } from './calendar.types.js';
import type { CalendarCredentialResolver } from './credentials.js';
import { calendarUnavailable } from '../../utils/errors.js';
import { withDeadline } from '../../utils/deadline.js';
import { CalendarWriteError } from './calendar.errors.js';
function status(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('response' in error && typeof error.response === 'object' && error.response !== null && 'status' in error.response) return Number(error.response.status);
  return 'code' in error && typeof error.code === 'number' ? error.code : undefined;
}
function decodeEvent(e: calendar_v3.Schema$Event): CalendarEvent {
  const start = new Date(e.start?.dateTime ?? ''), end = new Date(e.end?.dateTime ?? '');
  const meta = e.extendedProperties?.private;
  if (!e.id || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw calendarUnavailable();
  return { id: e.id, start, end, status: e.status ?? 'unknown', bookingRequestId: meta?.bookingRequestId ?? '', fingerprint: meta?.fingerprint ?? '', businessId: meta?.businessId ?? '' };
}
export class GoogleCalendar implements Calendar {
  constructor(private credentials: CalendarCredentialResolver, private timeoutMs: number) {}
  private async client(b: Business) {
    if (!b.calendarId) throw calendarUnavailable();
    const credentials = await this.credentials.resolve(b.id);
    const auth = new OAuth2Client(credentials.clientId, credentials.clientSecret);
    auth.setCredentials({ refresh_token: credentials.refreshToken });
    auth.transporter.defaults = { ...auth.transporter.defaults, timeout: this.timeoutMs, retry: false };
    return calendar({ version: 'v3', auth });
  }
  async busy(b: Business, range: Interval): Promise<Interval[]> {
    try {
      const api = await this.client(b);
      const response = await withDeadline(api.freebusy.query({ requestBody: { timeMin: range.start.toISOString(), timeMax: range.end.toISOString(),
        timeZone: b.timezone, items: [{ id: b.calendarId! }] } }, { timeout: this.timeoutMs, retry: false }), this.timeoutMs, calendarUnavailable);
      const calendar = response.data.calendars?.[b.calendarId!];
      if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw calendarUnavailable();
      return calendar.busy.map(item => {
        const start = new Date(item.start ?? ''), end = new Date(item.end ?? '');
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw calendarUnavailable();
        return { start, end };
      });
    } catch { throw calendarUnavailable(); }
  }
  async get(b: Business, eventId: string): Promise<CalendarEvent | null> {
    try {
      const api = await this.client(b);
      const response = await withDeadline(api.events.get({ calendarId: b.calendarId!, eventId }, { timeout: this.timeoutMs, retry: false }), this.timeoutMs, calendarUnavailable);
      return decodeEvent(response.data);
    } catch (error) { if (status(error) === 404) return null; throw calendarUnavailable(); }
  }
  async insert(b: Business, service: Service, a: Attempt): Promise<CalendarEvent> {
    let api: calendar_v3.Calendar;
    try { api = await this.client(b); } catch { throw new CalendarWriteError(true); }
    try {
      const response = await withDeadline(api.events.insert({ calendarId: a.calendarId, sendUpdates: 'none', requestBody: {
        id: a.eventId, summary: `${b.isSampleData ? '[SAMPLE DATA] ' : ''}${b.name}: ${service.name}`,
        location: a.snapshot.service_address,
        description: `Customer: ${a.snapshot.customer_name}\nPhone: ${a.snapshot.customer_phone}\nProblem: ${a.snapshot.problem_description}`,
        start: { dateTime: a.startTime.toISOString(), timeZone: b.timezone }, end: { dateTime: a.endTime.toISOString(), timeZone: b.timezone },
        transparency: 'opaque', extendedProperties: { private: { bookingRequestId: a.bookingRequestId, fingerprint: a.fingerprint, businessId: a.businessId } },
      } }, { timeout: this.timeoutMs, retry: false }), this.timeoutMs, () => new CalendarWriteError(false));
      return decodeEvent(response.data);
    } catch (error) {
      if (status(error) === 409) {
        try { const existing = await this.get(b, a.eventId); if (existing) return existing; } catch { /* retain uncertain reservation */ }
        throw new CalendarWriteError(false);
      }
      if (error instanceof CalendarWriteError) throw error;
      throw new CalendarWriteError([400, 401, 403, 404, 410, 422].includes(status(error) ?? 0));
    }
  }
}
