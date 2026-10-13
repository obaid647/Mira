import type { Prisma } from '../../generated/prisma/client.js';
export function upsertCustomer(tx: Prisma.TransactionClient, businessId: string, name: string, phoneNumber: string) {
  return tx.customer.upsert({ where: { businessId_phoneNumber: { businessId, phoneNumber } },
    create: { businessId, name, phoneNumber }, update: { name } });
}
