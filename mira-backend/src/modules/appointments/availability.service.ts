import { DateTime } from 'luxon';
import type { Business, Interval, Service, Store } from '../../types/domain.js';
import type { Calendar } from '../../integrations/google-calendar/calendar.types.js';
import { calendarUnavailable, invalid, slotUnavailable } from '../../utils/errors.js';
import { requireBusiness } from '../businesses/business.service.js';
import { requireService } from '../services/service.service.js';

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
export function reserved(b: Business, slot: Interval): Interval {
  return { start: new Date(slot.start.getTime() - b.bufferBeforeMinutes * 60000), end: new Date(slot.end.getTime() + b.bufferAfterMinutes * 60000) };
}
function localDay(b: Business, date: string, now: Date) {
  const day = DateTime.fromISO(date, { zone: b.timezone });
  const today = DateTime.fromJSDate(now, { zone: b.timezone }).startOf('day');
  if (!day.isValid || day.toISODate() !== date || day < today || day > today.plus({ days: b.bookingHorizonDays })) throw invalid('Please choose a valid date within the booking window.');
  return day;
}
export function openingWindows(b: Business, date: string, now: Date): Interval[] {
  const day = localDay(b, date, now);
  return (b.operatingHours[String(day.weekday)] ?? []).map(hours => {
    const parse = (time: string) => {
      const [hour, minute] = time.split(':').map(Number);
      const dt = day.set({ hour: hour!, minute: minute! });
      // Reject DST gaps and ambiguous wall times instead of silently shifting them.
      if (dt.toFormat('HH:mm') !== time || dt.getPossibleOffsets().length !== 1) throw invalid('That operating time is ambiguous. Please choose another date.');
      return dt.toJSDate();
    };
    return { start: parse(hours.open), end: parse(hours.close) };
  });
}
export function validateSlot(b: Business, s: Service, start: Date, now: Date): Interval {
  if (!Number.isFinite(start.getTime())) throw invalid('Please provide a valid appointment time.');
  const local = DateTime.fromJSDate(start, { zone: b.timezone });
  const windows = openingWindows(b, local.toISODate()!, now);
  const slot = { start, end: new Date(start.getTime() + s.durationMinutes * 60000) };
  const padded = reserved(b, slot);
  const aligned = local.second === 0 && local.millisecond === 0 && windows.some(w => (start.getTime() - w.start.getTime()) % (b.slotIntervalMinutes * 60000) === 0);
  if (!aligned || start.getTime() < now.getTime() + b.minimumNoticeMinutes * 60000 || !windows.some(w => padded.start >= w.start && padded.end <= w.end)) throw slotUnavailable();
  return slot;
}
export async function occupied(store: Store, calendar: Calendar, b: Business, range: Interval, exclude?: string): Promise<Interval[]> {
  if (!b.calendarId) throw calendarUnavailable();
  const extra = (b.bufferBeforeMinutes + b.bufferAfterMinutes) * 60000;
  const queryRange = { start: new Date(range.start.getTime() - extra), end: new Date(range.end.getTime() + extra) };
  const [busy, reservations] = await Promise.all([calendar.busy(b, queryRange), store.reservations(b.calendarId, queryRange, exclude)]);
  return [...busy.map(v => reserved(b, v)), ...reservations];
}
export class AvailabilityService {
  constructor(private store: Store, private calendar: Calendar, private now: () => Date) {}
  async check(input: { business_id: string; service_id: string; date: string; period: 'morning' | 'afternoon' | 'evening' | 'any' }) {
    const b = await requireBusiness(this.store, input.business_id), s = await requireService(this.store, b.id, input.service_id);
    const now = this.now();
    const windows = openingWindows(b, input.date, now);
    const day = localDay(b, input.date, now);
    // Even on closed days, require a working connected calendar; never simulate success on outages.
    const busy = await occupied(this.store, this.calendar, b, { start: day.startOf('day').toJSDate(), end: day.plus({ days: 1 }).startOf('day').toJSDate() });
    const slots: { start: string; end: string }[] = [];
    for (const w of windows) {
      for (let instant = w.start.getTime(); instant < w.end.getTime(); instant += b.slotIntervalMinutes * 60000) {
        const start = new Date(instant);
        const local = DateTime.fromJSDate(start, { zone: b.timezone });
        const period = local.hour < 12 ? 'morning' : local.hour < 17 ? 'afternoon' : 'evening';
        if (input.period !== 'any' && input.period !== period) continue;
        let slot: Interval;
        try { slot = validateSlot(b, s, start, now); } catch { continue; }
        if (busy.some(v => overlaps(reserved(b, slot), v))) continue;
        slots.push({ start: local.toISO()!, end: DateTime.fromJSDate(slot.end, { zone: b.timezone }).toISO()! });
        if (slots.length === 3) return { success: true, timezone: b.timezone, available_slots: slots, is_sample_data: b.isSampleData };
      }
    }
    return { success: true, timezone: b.timezone, available_slots: slots, is_sample_data: b.isSampleData };
  }
}
