import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Business } from '../../types/domain.js';
import { businessConfigSchema } from './business.schema.js';
import { AppError } from '../../utils/errors.js';
function decode(row: Awaited<ReturnType<PrismaClient['business']['findUnique']>>): Business | null {
  if (!row) return null;
  const config = businessConfigSchema.safeParse(row);
  if (!config.success) throw new AppError('BUSINESS_CONFIGURATION_ERROR', 'The business configuration needs attention.', 503);
  return { ...row, ...config.data };
}
export class BusinessRepository {
  constructor(private db: PrismaClient) {}
  async byId(id: string) { return decode(await this.db.business.findUnique({ where: { id } })); }
  async byAgent(retellAgentId: string) { return decode(await this.db.business.findUnique({ where: { retellAgentId } })); }
}
