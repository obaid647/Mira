import { z } from 'zod';
import { DateTime } from 'luxon';
import { businessInput, hoursSchema } from '../modules/businesses/business.schema.js';
import { serviceInput } from '../modules/services/service.schema.js';
import { availabilitySchema, bookingSchema } from '../modules/appointments/appointment.schema.js';
import { leadSchema } from '../modules/leads/lead.schema.js';
import { webhookPayloadSchema } from '../modules/calls/call.webhook.js';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonResponse = (name: string, description: string) => ({
  description, content: { 'application/json': { schema: ref(name) } },
});
const inputSchema = (schema: z.ZodType) => {
  // Input mode documents strings before normalization and makes defaulted fields optional.
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, { io: 'input' });
  return json;
};
const success = z.literal(true);
const sample = { success, is_sample_data: z.boolean() };
const service = z.object({
  id: z.string(), name: z.string(), duration_minutes: z.number().int().positive(),
  price: z.string().nullable(), emergency_eligible: z.boolean(),
});
const candidate = z.object({ id: z.string(), name: z.string(), description: z.string(), active: z.boolean() });
const verificationResponse = z.union([
  z.object({ ...sample, service_found: z.literal(true), match_status: z.literal('supported'), service, candidates: z.array(candidate).max(0) }),
  z.object({ ...sample, service_found: z.literal(false), match_status: z.enum(['unknown', 'ambiguous', 'unsupported']), service: z.null(), candidates: z.array(candidate) }),
]);

export function createOpenApiDocument(businessId: string, now: Date) {
  let exampleDay = DateTime.fromJSDate(now, { zone: 'America/Toronto' }).plus({ days: 1 }).startOf('day');
  while (exampleDay.weekday > 5) exampleDay = exampleDay.plus({ days: 1 });
  const base = { business_id: businessId };
  const errors = {
    '400': jsonResponse('Error', 'INVALID_REQUEST: malformed JSON, invalid fields, or a date outside the booking window.'),
    '401': jsonResponse('Error', 'UNAUTHORIZED: missing/invalid credentials or a business not authorized for this key.'),
    '413': jsonResponse('Error', 'INVALID_REQUEST: JSON body exceeds 1 MB.'),
    '500': jsonResponse('Error', 'BOOKING_FAILED: the action could not be completed.'),
  };
  const businessErrors = {
    ...errors,
    '404': jsonResponse('Error', 'BUSINESS_NOT_FOUND or SERVICE_NOT_FOUND, where applicable.'),
    '503': jsonResponse('Error', 'BUSINESS_CONFIGURATION_ERROR: business or service configuration needs attention.'),
  };
  const functionOperation = (operationId: string, summary: string, schema: string, example: object,
    response: string, description: string, extraResponses: object = {}) => ({
    tags: ['Functions'], operationId, summary, description,
    security: [{ ApiKey: [] }],
    requestBody: { required: true, content: { 'application/json': { schema: ref(schema), example } } },
    responses: { '200': jsonResponse(response, 'Request completed successfully.'), ...businessErrors, ...extraResponses },
  });
  return {
    openapi: '3.1.0',
    info: {
      title: 'Mira API', version: '0.1.0',
      description: [
        'Direct endpoint testing: click **Authorize**, enter your API_KEY as the x-api-key value (no prefix), then choose **Try it out → Execute**.',
        'Function examples use flat JSON for the configured demo business. Sample service IDs and contact details must be adjusted for your catalog.',
        'Start with business information and service verification. For availability, choose a future date within the business booking window; the example is the next weekday in America/Toronto. Copy an exact available_slots[].start into the appointment request.',
        '**Creating appointments and leads performs real writes.** A booking can create a Google Calendar event. Use a new booking_request_id or lead_request_id for each new operation; keep the ID and payload unchanged when retrying. SMS is not sent.',
        'Live Retell function calls use the same API key plus x-retell-signature and a signed {name, call, args} envelope. The name uses underscores (for example create_appointment); call contains call_id, agent_id, and optionally from_number. Send the flat fields inside args. Omit booking_request_id for signed bookings: the server assigns it from verified call context; a legacy supplied ID is validated and ignored. Signed args-only bookings are rejected. Swagger examples use the manual flat contract.',
        'Provider credentials, database setup, and Google consent are still required for the corresponding operations. /health checks the process; /ready checks only the database.',
      ].join('\n\n'),
    },
    servers: [{ url: '/', description: 'This backend' }],
    tags: [
      { name: 'Health', description: 'Process health and database readiness.' },
      { name: 'Functions', description: 'API-key-authorized direct function testing.' },
      { name: 'Webhooks', description: 'Retell-signed events; an API key cannot replace a signature.' },
    ],
    paths: {
      '/health': { get: {
        tags: ['Health'], operationId: 'health', summary: 'Check process health', security: [],
        responses: { '200': jsonResponse('Health', 'Process is running; no provider calls are made.') },
      } },
      '/ready': { get: {
        tags: ['Health'], operationId: 'ready', summary: 'Check database readiness', security: [],
        responses: { '200': jsonResponse('Ready', 'Database is reachable.'), '503': jsonResponse('Error', 'DATABASE_UNAVAILABLE: database is unreachable.') },
      } },
      '/api/retell/get-business-information': { post: functionOperation(
        'getBusinessInformation', 'Get business information', 'BusinessInput', base, 'BusinessInformation',
        'Returns configured business details, policies, hours, and current local time.',
      ) },
      '/api/retell/get-services': { post: functionOperation(
        'getServices', 'Verify a requested service', 'ServiceInput', { ...base, service_query: 'leaking basement pipe' }, 'ServiceVerification',
        'Verify the caller request against the configured catalog. Only book when match_status is supported. For ambiguous results, clarify using candidates and verify again.',
      ) },
      '/api/retell/check-availability': { post: functionOperation(
        'checkAvailability', 'Find available appointment slots', 'AvailabilityInput',
        { ...base, service_id: 'pipe-repair', date: exampleDay.toISODate(), period: 'morning' }, 'Availability',
        'Choose a future date within the configured booking window. Returns up to three slots, honoring business hours, notice, buffers, and live calendar occupancy. Copy the selected start exactly when booking.',
        { '503': jsonResponse('Error', 'CALENDAR_UNAVAILABLE or BUSINESS_CONFIGURATION_ERROR: availability cannot be checked.') },
      ) },
      '/api/retell/create-appointment': { post: functionOperation(
        'createAppointment', 'Create an appointment (writes data)', 'BookingInput', {
          ...base, service_id: 'pipe-repair', customer_name: 'Sample Caller', customer_phone: '+15195550123',
          service_address: '123 Sample Street, Cambridge, ON', appointment_start: exampleDay.set({ hour: 9 }).toISO(),
          problem_description: 'Basement pipe leaking', sms_consent: false, booking_request_id: 'manual-test:booking:1',
        }, 'Appointment',
        'Creates a real booking and calendar event. Replace appointment_start with an exact slot returned by check-availability. Supply a unique booking_request_id for a new manual booking and reuse it with the same payload for retries. Phone numbers normalize to E.164. sms_consent defaults to false and does not send SMS. Signed Retell envelopes omit booking_request_id because the server assigns it.',
        {
          '409': jsonResponse('Error', 'SLOT_UNAVAILABLE, IDEMPOTENCY_CONFLICT, or BOOKING_IN_PROGRESS: choose a new slot, resolve a conflicting ID, or retry the unchanged request as appropriate.'),
          '503': jsonResponse('Error', 'CALENDAR_UNAVAILABLE, DATABASE_UNAVAILABLE, BUSINESS_CONFIGURATION_ERROR, BOOKING_FAILED, or BOOKING_RECONCILIATION_REQUIRED. An uncertain booking is not confirmed; retain its ID for recovery.'),
        },
      ) },
      '/api/retell/create-lead': { post: functionOperation(
        'createLead', 'Save a lead (writes data)', 'LeadInput', {
          ...base, service_requested: 'pipe leak', notes: 'Urgent request; callback needed', urgency: 'urgent',
          caller_number: '+15195550123', customer_name: 'Sample Caller', lead_request_id: 'manual-test:lead:1',
        }, 'Lead',
        'Saves a real lead. Contact fields are optional; urgency defaults to unknown. Use a new lead_request_id for a new lead and retain the same ID and payload for retries. This records a message without sending notifications or promising a callback time.',
        { '409': jsonResponse('Error', 'IDEMPOTENCY_CONFLICT: the identifier was already used for a different request.') },
      ) },
      '/api/webhooks/retell': { post: {
        tags: ['Webhooks'], operationId: 'retellWebhook', summary: 'Receive a signed Retell call event',
        description: 'Requires a genuine x-retell-signature for the exact JSON bytes sent, using the configured Retell secret, with a timestamp within five minutes. Swagger does not generate signatures; an API key alone will not authorize this request. Supported events are call_started, call_ended, and call_analyzed; other valid signed events are acknowledged without processing. The agent must map to the configured demo business.',
        security: [{ RetellSignature: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: ref('WebhookInput'), example: {
          event: 'call_ended', call: { call_id: 'sample-call', agent_id: 'REPLACE_WITH_CONFIGURED_AGENT_ID', call_status: 'ended' },
        } } } },
        responses: { '204': { description: 'Event acknowledged; no response body.' }, ...errors },
      } },
    },
    components: {
      securitySchemes: {
        ApiKey: { type: 'apiKey', in: 'header', name: 'x-api-key', description: 'Enter your configured API_KEY without a prefix. Authorized only for the configured demo business.' },
        RetellSignature: { type: 'apiKey', in: 'header', name: 'x-retell-signature', description: 'A fresh Retell signature for the exact request body; not your API key or Retell secret.' },
      },
      schemas: {
        BusinessInput: inputSchema(businessInput), ServiceInput: inputSchema(serviceInput),
        AvailabilityInput: inputSchema(availabilitySchema), BookingInput: inputSchema(bookingSchema),
        LeadInput: inputSchema(leadSchema), WebhookInput: inputSchema(webhookPayloadSchema),
        Health: inputSchema(z.object({ success, status: z.literal('ok') })),
        Ready: inputSchema(z.object({ success, status: z.literal('ready') })),
        BusinessInformation: inputSchema(z.object({
          ...sample, business_id: z.string(), name: z.string(), address: z.string(), phone_number: z.string(),
          timezone: z.string(), operating_hours: hoursSchema, service_area: z.array(z.string()),
          policies: z.record(z.string(), z.string()), current_local_time: z.iso.datetime({ offset: true }),
        })),
        ServiceVerification: inputSchema(verificationResponse),
        Availability: inputSchema(z.object({
          ...sample, timezone: z.string(), available_slots: z.array(z.object({
            start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }),
          })).max(3),
        })),
        Appointment: inputSchema(z.object({
          ...sample, appointment_id: z.string(), booking_request_id: z.string(), status: z.literal('confirmed'),
          appointment_start: z.iso.datetime({ offset: true }), message: z.string(),
        })),
        Lead: inputSchema(z.object({ success, lead_id: z.string(), status: z.literal('open'), message: z.string() })),
        Error: inputSchema(z.object({ success: z.literal(false), error_code: z.string(), message: z.string(), request_id: z.string() })),
      },
    },
  };
}
