import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/utils/logger.js';
import { FakeCalendar, MemoryLock, MemoryStore, now, testEnv } from './helpers.js';

function setup(production = false) {
  const env = { ...testEnv(), ...(production ? { NODE_ENV: 'production' as const, DATABASE_SSL: true } : {}) };
  const store = new MemoryStore(), calendar = new FakeCalendar();
  const app = createApp({ env, store, calendar, lock: new MemoryLock(), logger: createLogger('silent'), now });
  return { app, env, store, calendar };
}

describe('Interactive API documentation', () => {
  it.each([false, true])('serves public docs and local assets (production=%s)', async production => {
    const { app, env } = setup(production);
    const redirect = await request(app).get('/docs');
    expect(redirect.status).toBe(301);
    expect(redirect.headers.location).toBe('/docs/');
    const page = await request(app).get('/docs/');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.text).toContain('Mira API Docs');
    expect(page.text).not.toContain(env.API_KEY);
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect(page.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    for (const path of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js', 'swagger-ui-init.js']) {
      const asset = await request(app).get(`/docs/${path}`);
      expect(asset.status, path).toBe(200);
      expect(asset.headers['content-type']).toMatch(/javascript|css/);
    }
    const init = await request(app).get('/docs/swagger-ui-init.js');
    expect(init.text).toContain('"url": "/openapi.json"');
    expect(init.text).toContain('"persistAuthorization": false');
    expect(init.text).toContain('"validatorUrl": null');
    expect(init.text).not.toContain(env.API_KEY);
    const health = await request(app).get('/health');
    expect(health.headers['content-security-policy']).toContain('upgrade-insecure-requests');
    expect((await request(app).get('/openapi.json')).status).toBe(200);
  });

  it('documents all API operations with resolving references and the correct authentication', async () => {
    const { app, env } = setup();
    const { body: spec } = await request(app).get('/openapi.json');
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers).toEqual([{ url: '/', description: 'This backend' }]);
    expect(Object.keys(spec.paths).sort()).toEqual([
      '/health', '/ready', '/api/retell/get-business-information', '/api/retell/get-services',
      '/api/retell/check-availability', '/api/retell/create-appointment', '/api/retell/create-lead', '/api/webhooks/retell',
    ].sort());
    const verifyRefs = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === '$ref') {
          expect(child).toMatch(/^#\//);
          const target = String(child).slice(2).split('/').reduce((node, segment) => node?.[segment], spec);
          expect(target, String(child)).toBeDefined();
        } else verifyRefs(child);
      }
    };
    verifyRefs(spec);
    expect(spec.components.securitySchemes.ApiKey).toMatchObject({ type: 'apiKey', in: 'header', name: 'x-api-key' });
    expect(spec.components.securitySchemes.RetellSignature.name).toBe('x-retell-signature');
    for (const [path, item] of Object.entries(spec.paths)) {
      const operation = item as { get?: { security: object[] }; post?: { security: object[] } };
      if (path.startsWith('/api/retell/')) expect(operation.post?.security).toEqual([{ ApiKey: [] }]);
      else if (path === '/api/webhooks/retell') expect(operation.post?.security).toEqual([{ RetellSignature: [] }]);
      else expect(operation.get?.security).toEqual([]);
    }
    const serialized = JSON.stringify(spec);
    for (const secret of [env.API_KEY, env.RETELL_API_KEY!, env.DATABASE_URL]) expect(serialized).not.toContain(secret);
  });

  it('retains runtime validation constraints and input defaults in request schemas', async () => {
    const { app } = setup();
    const { body: { components: { schemas } } } = await request(app).get('/openapi.json');
    expect(schemas.BookingInput.additionalProperties).toBe(false);
    expect(schemas.BookingInput.required).toContain('booking_request_id');
    expect(schemas.BookingInput.required).not.toContain('sms_consent');
    expect(schemas.BookingInput.properties.sms_consent.default).toBe(false);
    expect(schemas.BookingInput.properties.customer_phone).toMatchObject({ type: 'string', minLength: 1, maxLength: 40 });
    expect(schemas.BookingInput.properties.customer_name.maxLength).toBe(120);
    expect(schemas.BookingInput.properties.appointment_start.format).toBe('date-time');
    expect(schemas.AvailabilityInput.properties.period).toMatchObject({ enum: ['morning', 'afternoon', 'evening', 'any'], default: 'any' });
    expect(schemas.LeadInput.required).not.toContain('caller_number');
    expect(schemas.LeadInput.properties.urgency.default).toBe('unknown');
  });

  it('executes the documented function examples with authentication and an available slot', async () => {
    const { app, env, calendar, store } = setup();
    const { body: spec } = await request(app).get('/openapi.json');
    const exampleFor = (path: string) => structuredClone(spec.paths[path].post.requestBody.content['application/json'].example);
    for (const name of ['get-business-information', 'get-services', 'check-availability', 'create-appointment', 'create-lead']) {
      const path = `/api/retell/${name}`;
      expect((await request(app).post(path).send(exampleFor(path))).status).toBe(401);
    }
    expect(store.leads.size).toBe(0);
    expect(calendar.inserts).toBe(0);
    for (const name of ['get-business-information', 'get-services']) {
      const path = `/api/retell/${name}`;
      const response = await request(app).post(path).set('x-api-key', env.API_KEY).send(exampleFor(path));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    }
    const availabilityPath = '/api/retell/check-availability';
    const available = await request(app).post(availabilityPath).set('x-api-key', env.API_KEY).send(exampleFor(availabilityPath));
    expect(available.status).toBe(200);
    expect(available.body.available_slots.length).toBeGreaterThan(0);
    const bookingPath = '/api/retell/create-appointment';
    const booking = { ...exampleFor(bookingPath), appointment_start: available.body.available_slots[0].start };
    const booked = await request(app).post(bookingPath).set('x-api-key', env.API_KEY).send(booking);
    expect(booked.status).toBe(200);
    expect(booked.body.status).toBe('confirmed');
    const retry = await request(app).post(bookingPath).set('x-api-key', env.API_KEY).send(booking);
    expect(retry.body.appointment_id).toBe(booked.body.appointment_id);
    expect(calendar.inserts).toBe(1);
    const leadPath = '/api/retell/create-lead';
    expect((await request(app).post(leadPath).set('x-api-key', env.API_KEY).send(exampleFor(leadPath))).status).toBe(200);
    expect(store.leads.size).toBe(1);
    expect((await request(app).post('/api/webhooks/retell').set('x-api-key', env.API_KEY).send({ event: 'call_ended' })).status).toBe(401);
  });

  it('uses the configured demo business in examples without requiring a database lookup', async () => {
    const env = { ...testEnv(), DEMO_BUSINESS_ID: 'custom-demo' };
    const app = createApp({ env, store: new MemoryStore(), calendar: new FakeCalendar(), lock: new MemoryLock(), logger: createLogger('silent'), now });
    const { body: spec } = await request(app).get('/openapi.json');
    expect(spec.paths['/api/retell/get-business-information'].post.requestBody.content['application/json'].example.business_id).toBe('custom-demo');
  });
});
