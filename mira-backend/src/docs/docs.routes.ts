import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { createOpenApiDocument } from './openapi.js';

export function docsRoutes(businessId: string, now: Date) {
  const router = Router();
  const document = createOpenApiDocument(businessId, now);
  router.get('/openapi.json', (_req, res) => res.json(document));
  router.use('/docs',
    // Keep Helmet's CSP, but allow local HTTP assets rather than upgrading them to HTTPS.
    // Swagger's scripts are served from this origin; no inline-script exception is needed.
    helmet.contentSecurityPolicy({ directives: { upgradeInsecureRequests: null } }),
    swaggerUi.serve,
    swaggerUi.setup(null, {
      customSiteTitle: 'Mira API Docs',
      swaggerOptions: { url: '/openapi.json', validatorUrl: null, persistAuthorization: false },
    }),
  );
  return router;
}
