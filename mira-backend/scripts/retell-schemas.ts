import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { businessInput } from '../src/modules/businesses/business.schema.js';
import { serviceInput } from '../src/modules/services/service.schema.js';
import { availabilitySchema, bookingSchema } from '../src/modules/appointments/appointment.schema.js';
import { leadSchema } from '../src/modules/leads/lead.schema.js';
const functions = { get_business_information: businessInput, get_services: serviceInput, check_availability: availabilitySchema, create_appointment: bookingSchema.omit({ booking_request_id: true }), create_lead: leadSchema };
await mkdir('docs/retell-functions', { recursive: true });
for (const [name, schema] of Object.entries(functions)) {
  const json = z.toJSONSchema(schema, { io: 'input' });
  for (const [key, constant] of Object.entries({ business_id: 'demo-business', lead_request_id: '{{lead_request_id}}' })) {
    const property = json.properties?.[key];
    if (property && typeof property === 'object') property.const = constant;
  }
  // Retell descriptions identify values collected from the caller; constants identify trusted configuration.
  for (const [key, property] of Object.entries(json.properties ?? {})) if (property && typeof property === 'object' && !('const' in property)) property.description = `The verified ${key.replaceAll('_', ' ')} collected during the conversation.`;
  let output: unknown = json;
  if (name === 'create_appointment') {
    // Keep the dashboard contract simple. Zod remains the authoritative backend validator.
    output = { type: 'object', properties: Object.fromEntries(Object.entries(json.properties ?? {}).map(([key, value]) => {
      const property = value as { type: 'string' | 'boolean'; description?: string };
      return [key, { type: property.type, description: key === 'business_id' ? 'Use demo-business for the configured sample business.'
        : key === 'appointment_start' ? 'Copy the selected available slot start exactly, including its timezone offset.' : property.description }];
    })), required: json.required };
  }
  await writeFile(`docs/retell-functions/${name}.json`, JSON.stringify(output, null, 2) + '\n');
}
console.log('Wrote five Retell parameter schemas.');
