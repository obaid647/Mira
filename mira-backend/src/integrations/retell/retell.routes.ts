import { Router } from 'express';
import type { Env } from '../../config/env.js';
import type { Store } from '../../types/domain.js';
import type { AvailabilityService } from '../../modules/appointments/availability.service.js';
import type { AppointmentService } from '../../modules/appointments/appointment.service.js';
import { apiKeyAuth } from '../../middleware/auth.js';
import { adaptFunction } from './retell.adapter.js';
import { businessInput } from '../../modules/businesses/business.schema.js';
import { businessInformation } from '../../modules/businesses/business.service.js';
import { serviceInput } from '../../modules/services/service.schema.js';
import { verifyService } from '../../modules/services/service.service.js';
import { availabilitySchema, bookingSchema, retellBookingSchema } from '../../modules/appointments/appointment.schema.js';
import { leadSchema } from '../../modules/leads/lead.schema.js';
import { createLead } from '../../modules/leads/lead.service.js';
export function retellRoutes(env: Env, store: Store, availability: AvailabilityService, appointments: AppointmentService, now: () => Date) {
  const router = Router();
  router.use(apiKeyAuth(env.API_KEY));
  router.post('/get-business-information', async (req, res) => {
    const { args } = await adaptFunction(req, 'get_business_information', env, store);
    res.json(await businessInformation(store, businessInput.parse(args).business_id, now));
  });
  router.post('/get-services', async (req, res) => {
    const { args } = await adaptFunction(req, 'get_services', env, store), input = serviceInput.parse(args);
    res.json(await verifyService(store, input.business_id, input.service_query));
  });
  router.post('/check-availability', async (req, res) => {
    const { args } = await adaptFunction(req, 'check_availability', env, store);
    res.json(await availability.check(availabilitySchema.parse(args)));
  });
  router.post('/create-appointment', async (req, res) => {
    const { args, context } = await adaptFunction(req, 'create_appointment', env, store);
    const input = context ? retellBookingSchema.parse(args) : bookingSchema.parse(args);
    res.json(await appointments.create(input, context));
  });
  router.post('/create-lead', async (req, res) => {
    const { args, context } = await adaptFunction(req, 'create_lead', env, store);
    res.json(await createLead(store, leadSchema.parse(args), context));
  });
  return router;
}
