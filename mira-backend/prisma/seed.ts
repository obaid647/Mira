import { parseEnv } from '../src/config/env.js';
import { createDatabase } from '../src/config/database.js';
import { demoBusiness, demoServices } from './demo-data.js';
import type { Prisma } from '../src/generated/prisma/client.js';
// Seeding stores a calendar ID but does not authenticate with Google; permit OAuth bootstrap.
const env = parseEnv({ ...process.env, GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GOOGLE_REFRESH_TOKEN: undefined, GOOGLE_CALENDAR_ID: undefined }), db = createDatabase(env);
try {
  const b = demoBusiness(env.DEMO_BUSINESS_ID, process.env.GOOGLE_CALENDAR_ID?.trim() || null, env.RETELL_AGENT_ID ?? null);
  await db.prisma.$transaction(async tx => {
    const data = { ...b, operatingHours: b.operatingHours as unknown as Prisma.InputJsonObject };
    await tx.business.upsert({ where: { id: b.id }, create: data, update: data });
    for (const s of demoServices(b.id)) await tx.service.upsert({ where: { id: s.id }, create: s, update: s });
  });
  console.log('Seeded Cambridge Plumbing SAMPLE DATA. Re-run after changing Calendar or Retell configuration.');
} catch { console.error('Seeding failed. Check the database connection, migrations, and environment configuration.'); process.exitCode = 1; }
finally { await db.close(); }
