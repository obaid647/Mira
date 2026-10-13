import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { CallContext, WebhookUpdate } from '../../types/domain.js';
import { AppError } from '../../utils/errors.js';
import { advisoryKey } from '../appointments/booking-lock.js';
export async function ensureCall(tx: Prisma.TransactionClient, businessId: string, context: CallContext, customerId?: string) {
  const existing = await tx.callLog.findUnique({ where: { retellCallId: context.callId } });
  if (existing && existing.businessId !== businessId) throw new AppError('UNAUTHORIZED', 'Call does not belong to this business.', 401);
  return tx.callLog.upsert({ where: { retellCallId: context.callId },
    create: { businessId, retellCallId: context.callId, callerNumber: context.callerNumber ?? null, callStatus: 'ongoing', customerId },
    update: customerId ? { customerId } : {} });
}
export class CallRepository {
  constructor(private db: PrismaClient) {}
  async record(u: WebhookUpdate) {
    await this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKey('call:' + u.callId)}::bigint)`;
      const inserted = await tx.webhookReceipt.createMany({ data: { event: u.event, retellCallId: u.callId }, skipDuplicates: true });
      if (!inserted.count) return;
      const current = await ensureCall(tx, u.businessId, { callId: u.callId, agentId: '', callerNumber: u.callerNumber });
      const appointment = await tx.appointment.findFirst({ where: { businessId: u.businessId, retellCallId: u.callId } });
      const data: Prisma.CallLogUpdateInput = {
        ...(u.startedAt && !current.startedAt ? { startedAt: u.startedAt } : {}),
        ...(u.endedAt && !current.endedAt ? { endedAt: u.endedAt } : {}),
        ...(u.callerNumber && !current.callerNumber ? { callerNumber: u.callerNumber } : {}),
        ...(u.rank >= current.lifecycleRank ? { callStatus: u.status, lifecycleRank: u.rank,
          ...(u.summary !== undefined ? { callSummary: u.summary } : {}),
          ...(u.failureDetails ? { failureDetails: u.failureDetails } : {}),
          ...(u.transcript !== undefined ? { transcript: u.transcript } : {}),
          ...(u.recordingUrl !== undefined ? { recordingUrl: u.recordingUrl } : {}) } : {}),
      };
      await tx.callLog.update({ where: { retellCallId: u.callId }, data });
      if (appointment) await tx.callLog.updateMany({ where: { retellCallId: u.callId, businessId: u.businessId }, data: { appointmentId: appointment.id, customerId: appointment.customerId } });
    }, { timeout: 5000 });
  }
}
