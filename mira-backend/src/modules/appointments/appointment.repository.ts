import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { Attempt, CallContext, Interval } from '../../types/domain.js';
import { bookingSchema } from './appointment.schema.js';
import { upsertCustomer } from '../customers/customer.repository.js';
import { ensureCall } from '../calls/call.repository.js';
type Row = Awaited<ReturnType<PrismaClient['bookingAttempt']['findUnique']>>;
function decode(row: Row): Attempt | null { return row ? { ...row, snapshot: bookingSchema.parse(row.snapshot) } : null; }
export class AppointmentRepository {
  constructor(private db: PrismaClient) {}
  async attempt(bookingRequestId: string) { return decode(await this.db.bookingAttempt.findUnique({ where: { bookingRequestId } })); }
  async appointment(bookingRequestId: string) { return this.db.appointment.findUnique({ where: { bookingRequestId } }); }
  async prepare(a: Omit<Attempt, 'customerId' | 'state' | 'failureCode'>, context?: CallContext): Promise<Attempt> {
    const row = await this.db.$transaction(async tx => {
      const customer = await upsertCustomer(tx, a.businessId, a.snapshot.customer_name, a.snapshot.customer_phone);
      if (context) await ensureCall(tx, a.businessId, context, customer.id);
      return tx.bookingAttempt.create({ data: { ...a, customerId: customer.id, snapshot: a.snapshot as unknown as Prisma.InputJsonValue } });
    });
    return decode(row)!;
  }
  async mark(bookingRequestId: string, state: Attempt['state'], failureCode?: string) {
    await this.db.bookingAttempt.update({ where: { bookingRequestId }, data: { state, failureCode: failureCode ?? null } });
  }
  async confirm(a: Attempt) {
    return this.db.$transaction(async tx => {
      const existing = await tx.appointment.findUnique({ where: { bookingRequestId: a.bookingRequestId } });
      if (existing) return existing;
      const appointment = await tx.appointment.create({ data: {
        businessId: a.businessId, customerId: a.customerId, serviceId: a.serviceId,
        startTime: a.startTime, endTime: a.endTime, serviceAddress: a.snapshot.service_address,
        problemDescription: a.snapshot.problem_description, googleCalendarEventId: a.eventId,
        bookingRequestId: a.bookingRequestId, retellCallId: a.retellCallId,
      } });
      await tx.bookingAttempt.update({ where: { bookingRequestId: a.bookingRequestId }, data: { state: 'CONFIRMED', failureCode: null } });
      if (a.retellCallId) await tx.callLog.updateMany({ where: { businessId: a.businessId, retellCallId: a.retellCallId }, data: { customerId: a.customerId, appointmentId: appointment.id } });
      return appointment;
    });
  }
  async reservations(calendarId: string, range: Interval, excludeRequestId?: string) {
    const attempts = await this.db.bookingAttempt.findMany({ where: { calendarId, state: { in: ['PREPARED', 'INSERTING', 'CONFIRMED'] },
      reservedStart: { lt: range.end }, reservedEnd: { gt: range.start }, ...(excludeRequestId ? { bookingRequestId: { not: excludeRequestId } } : {}) },
      select: { reservedStart: true, reservedEnd: true } });
    return attempts.map(a => ({ start: a.reservedStart, end: a.reservedEnd }));
  }
  async unresolved() { return (await this.db.bookingAttempt.findMany({ where: { state: { in: ['PREPARED', 'INSERTING'] } }, orderBy: { createdAt: 'asc' } })).map(a => decode(a)!); }
}
