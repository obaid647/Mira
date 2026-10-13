import { Retell } from 'retell-sdk';
import { z } from 'zod';
import type { Request } from 'express';
import type { Env } from '../../config/env.js';
import type { CallContext, Store } from '../../types/domain.js';
import { AppError, invalid } from '../../utils/errors.js';
import { optionalCaller } from '../../utils/phone.js';

export type RawRequest = Request & { rawBody?: Buffer };
const callSchema = z.object({ call_id: z.string().min(1).max(200), agent_id: z.string().min(1).max(200), from_number: z.string().max(50).optional() });
const envelopeSchema = z.object({ name: z.string(), args: z.record(z.string(), z.unknown()), call: callSchema });
export async function verifySignature(req: RawRequest, env: Env): Promise<void> {
  const signature = req.get('x-retell-signature');
  const timestamp = /^v=(\d+),d=([a-f0-9]+)$/i.exec(signature ?? '')?.[1];
  if (!env.RETELL_API_KEY || !signature || !req.rawBody || !timestamp || Math.abs(Date.now() - Number(timestamp)) > 300000
    || !await Retell.verify(req.rawBody.toString('utf8'), env.RETELL_API_KEY, signature)) throw new AppError('UNAUTHORIZED', 'Unauthorized request.', 401);
}
export async function adaptFunction(req: RawRequest, name: string, env: Env, store: Store): Promise<{ args: unknown; context?: CallContext }> {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalid();
  const wrapped = 'args' in body || 'call' in body || 'name' in body;
  if (wrapped || req.get('x-retell-signature')) await verifySignature(req, env);
  let args: unknown = body;
  let context: CallContext | undefined;
  if (wrapped) {
    const envelope = envelopeSchema.parse(body);
    if (envelope.name !== name) throw invalid('The requested function does not match the endpoint.');
    const business = await store.businessByAgent(envelope.call.agent_id);
    if (!business || business.id !== env.DEMO_BUSINESS_ID || envelope.args.business_id !== business.id) throw new AppError('UNAUTHORIZED', 'This call is not authorized for that business.', 401);
    args = envelope.args;
    context = { callId: envelope.call.call_id, agentId: envelope.call.agent_id, callerNumber: optionalCaller(envelope.call.from_number) };
  } else if (!('business_id' in body) || body.business_id !== env.DEMO_BUSINESS_ID) {
    // A shared demo API key must never become a cross-business authorization mechanism.
    throw new AppError('UNAUTHORIZED', 'This key is not authorized for that business.', 401);
  }
  return { args, context };
}
