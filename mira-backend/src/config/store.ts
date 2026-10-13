import type { PrismaClient } from '../generated/prisma/client.js';
import type { Store } from '../types/domain.js';
import { BusinessRepository } from '../modules/businesses/business.repository.js';
import { ServiceRepository } from '../modules/services/service.repository.js';
import { AppointmentRepository } from '../modules/appointments/appointment.repository.js';
import { CallRepository } from '../modules/calls/call.repository.js';
import { LeadRepository } from '../modules/leads/lead.repository.js';
export function createStore(db: PrismaClient): Store {
  const businesses = new BusinessRepository(db), services = new ServiceRepository(db), appointments = new AppointmentRepository(db);
  const calls = new CallRepository(db), leads = new LeadRepository(db);
  return {
    ping: async () => { await db.$queryRaw`SELECT 1`; }, business: id => businesses.byId(id), businessByAgent: id => businesses.byAgent(id),
    services: id => services.list(id), service: (businessId, id) => services.byId(businessId, id),
    attempt: id => appointments.attempt(id), appointment: id => appointments.appointment(id),
    prepare: (a, c) => appointments.prepare(a, c), markAttempt: (id, state, code) => appointments.mark(id, state, code),
    confirm: a => appointments.confirm(a), reservations: (id, range, exclude) => appointments.reservations(id, range, exclude),
    unresolved: () => appointments.unresolved(), createLead: (input, fp, context) => leads.create(input, fp, context), recordWebhook: u => calls.record(u),
  };
}
