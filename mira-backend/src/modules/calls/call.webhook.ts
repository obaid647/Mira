import { z } from 'zod';
import type { Env } from '../../config/env.js';
import type { Store, WebhookUpdate } from '../../types/domain.js';
import { optionalCaller } from '../../utils/phone.js';
import { AppError } from '../../utils/errors.js';
const timestamp = z.number().int().nonnegative().max(8640000000000000).optional();
const payloadSchema = z.object({ event: z.string().max(100), call: z.object({
  call_id: z.string().min(1).max(200), agent_id: z.string().min(1).max(200),
  from_number: z.string().max(50).optional(), call_status: z.string().max(100).optional(),
  start_timestamp: timestamp, end_timestamp: timestamp, disconnection_reason: z.string().max(200).optional(),
  call_analysis: z.object({ call_summary: z.string().max(20000).optional() }).optional(),
}).passthrough() });
export async function handleWebhook(store: Store, body: unknown, env: Env) {
  const p = payloadSchema.parse(body);
  if (!['call_started', 'call_ended', 'call_analyzed'].includes(p.event)) return;
  const b = await store.businessByAgent(p.call.agent_id);
  if (!b || b.id !== env.DEMO_BUSINESS_ID) throw new AppError('UNAUTHORIZED', 'This call is not authorized for that business.', 401);
  const event = p.event as WebhookUpdate['event'];
  const rank = event === 'call_started' ? 1 : event === 'call_ended' ? 2 : 3;
  await store.recordWebhook({ event, businessId: b.id, callId: p.call.call_id, rank,
    status: p.call.call_status ?? (rank === 1 ? 'ongoing' : 'ended'), callerNumber: optionalCaller(p.call.from_number),
    ...(p.call.start_timestamp !== undefined ? { startedAt: new Date(p.call.start_timestamp) } : {}),
    ...(p.call.end_timestamp !== undefined ? { endedAt: new Date(p.call.end_timestamp) } : {}),
    ...(p.call.call_analysis?.call_summary !== undefined ? { summary: p.call.call_analysis.call_summary } : {}),
    ...(p.call.disconnection_reason ? { failureDetails: { disconnection_reason: p.call.disconnection_reason } } : {}),
    ...(env.STORE_TRANSCRIPTS && typeof p.call.transcript === 'string' ? { transcript: z.string().max(500000).parse(p.call.transcript) } : {}),
    ...(env.STORE_RECORDINGS && typeof p.call.recording_url === 'string' ? { recordingUrl: z.url().max(4000).parse(p.call.recording_url) } : {}),
  });
}
