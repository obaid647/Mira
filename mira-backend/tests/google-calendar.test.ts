import { beforeEach, describe, it, expect, vi } from 'vitest';
import { demoBusiness } from '../prisma/demo-data.js';
import { GoogleCalendar } from '../src/integrations/google-calendar/calendar.service.js';
import { EnvironmentCalendarCredentials } from '../src/integrations/google-calendar/credentials.js';
import { testEnv, MemoryStore, MemoryLock, booking, now } from './helpers.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
const mocks = vi.hoisted(() => ({ query: vi.fn(), get: vi.fn(), insert: vi.fn() }));
vi.mock('googleapis/build/src/apis/calendar/index.js', () => ({ calendar: () => ({ freebusy: { query: mocks.query }, events: { get: mocks.get, insert: mocks.insert } }) }));
vi.mock('google-auth-library', () => ({ OAuth2Client: class { transporter = { defaults: {} }; setCredentials() {} } }));
describe('Official Google Calendar adapter', () => {
  const b = demoBusiness('demo-business', 'calendar-id');
  const range = { start: new Date('2026-10-12T00:00:00Z'), end: new Date('2026-10-13T00:00:00Z') };
  const resolver = { resolve: async () => ({ clientId: 'test', clientSecret: 'test', refreshToken: 'test' }) };
  beforeEach(() => vi.resetAllMocks());
  it('parses real FreeBusy response shape and submits timezone and calendar ID', async () => { mocks.query.mockResolvedValue({ data: { calendars: { 'calendar-id': { busy: [{ start: '2026-10-12T13:00:00Z', end: '2026-10-12T14:00:00Z' }] } } } }); const r = await new GoogleCalendar(resolver, 8000).busy(b, range); expect(r[0]!.start.toISOString()).toBe('2026-10-12T13:00:00.000Z'); expect(mocks.query.mock.calls[0]![0].requestBody.timeZone).toBe('America/Toronto'); });
  it.each([{ calendars: {} }, { calendars: { 'calendar-id': { errors: [{ reason: 'notFound' }], busy: [] } } }, { calendars: { 'calendar-id': { busy: [{ start: 'bad', end: 'bad' }] } } }])('rejects missing, errored or malformed calendars', async data => { mocks.query.mockResolvedValue({ data }); await expect(new GoogleCalendar(resolver, 8000).busy(b, range)).rejects.toMatchObject({ code: 'CALENDAR_UNAVAILABLE' }); });
  it('times out instead of inventing availability', async () => { mocks.query.mockImplementation(() => new Promise(() => {})); await expect(new GoogleCalendar(resolver, 5).busy(b, range)).rejects.toMatchObject({ code: 'CALENDAR_UNAVAILABLE' }); });
  it('requires authorized business-specific credentials', async () => { await expect(new EnvironmentCalendarCredentials(testEnv()).resolve('different-business')).rejects.toMatchObject({ code: 'CALENDAR_UNAVAILABLE' }); });
  it('returns null only for a genuinely missing event', async () => { mocks.get.mockRejectedValue({ response: { status: 404 } }); expect(await new GoogleCalendar(resolver, 8000).get(b, 'missing')).toBeNull(); mocks.get.mockRejectedValue({ response: { status: 401 } }); await expect(new GoogleCalendar(resolver, 8000).get(b, 'missing')).rejects.toMatchObject({ code: 'CALENDAR_UNAVAILABLE' }); });
  it('submits an opaque sample event with recovery metadata through the official client', async () => {
    const store = new MemoryStore(); store.businesses.get('demo-business')!.calendarId = 'calendar-id';
    mocks.query.mockResolvedValue({ data: { calendars: { 'calendar-id': { busy: [] } } } });
    mocks.insert.mockImplementation(async ({ requestBody }) => ({ data: { ...requestBody, status: 'confirmed' } }));
    const result = await new AppointmentService(store, new GoogleCalendar(resolver, 8000), new MemoryLock(), now).create(booking());
    expect(result.status).toBe('confirmed');
    const submitted = mocks.insert.mock.calls[0]![0];
    expect(submitted.calendarId).toBe('calendar-id'); expect(submitted.requestBody.id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(submitted.requestBody.summary).toContain('[SAMPLE DATA]'); expect(submitted.requestBody.transparency).toBe('opaque');
    expect(submitted.requestBody.start.timeZone).toBe('America/Toronto'); expect(submitted.requestBody.extendedProperties.private.bookingRequestId).toBe(booking().booking_request_id);
  });
  it('retrieves and verifies an already-created event after an HTTP 409 insert response', async () => {
    const store = new MemoryStore(); store.businesses.get('demo-business')!.calendarId = 'calendar-id';
    mocks.query.mockResolvedValue({ data: { calendars: { 'calendar-id': { busy: [] } } } });
    mocks.insert.mockRejectedValue({ response: { status: 409 } });
    mocks.get.mockImplementation(async () => { const a = [...store.attempts.values()][0]!; return { data: { id: a.eventId, status: 'confirmed', start: { dateTime: a.startTime.toISOString() }, end: { dateTime: a.endTime.toISOString() }, extendedProperties: { private: { businessId: a.businessId, fingerprint: a.fingerprint, bookingRequestId: a.bookingRequestId } } } }; });
    expect((await new AppointmentService(store, new GoogleCalendar(resolver, 8000), new MemoryLock(), now).create(booking())).status).toBe('confirmed');
    expect(mocks.insert).toHaveBeenCalledOnce(); expect(mocks.get).toHaveBeenCalledOnce();
  });
});
