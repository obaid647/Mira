import type { PrismaClient } from '../../generated/prisma/client.js';
export class ServiceRepository {
  constructor(private db: PrismaClient) {}
  async list(businessId: string) {
    return (await this.db.service.findMany({ where: { businessId }, orderBy: { id: 'asc' } })).map(s => ({ ...s, price: s.price?.toString() ?? null }));
  }
  async byId(businessId: string, id: string) {
    const s = await this.db.service.findUnique({ where: { id_businessId: { id, businessId } } });
    return s ? { ...s, price: s.price?.toString() ?? null } : null;
  }
}
