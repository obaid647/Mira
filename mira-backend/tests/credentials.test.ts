import { describe, it, expect, vi } from 'vitest';
import { EnvironmentCalendarCredentials } from '../src/integrations/google-calendar/credentials.js';
import { testEnv } from './helpers.js';
import { parseEnv } from '../src/config/env.js';
const files = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile: files.readFile }));
describe('Existing local OAuth credential file', () => {
  const env = () => ({ ...testEnv(), GOOGLE_CLIENT_ID: 'sample-client', GOOGLE_CLIENT_SECRET: 'sample-secret', GOOGLE_CALENDAR_ID: 'sample-calendar' });
  it('uses the helper file without requiring a copied environment token', async () => { files.readFile.mockResolvedValue(JSON.stringify({ refresh_token: 'test-only-refresh' })); const creds = await new EnvironmentCalendarCredentials(env()).resolve('demo-business'); expect(creds.refreshToken).toBe('test-only-refresh'); expect(files.readFile.mock.calls.at(-1)![0]).toMatch(/\.oauth-credentials\.json$/); });
  it('does not leak missing or malformed file contents', async () => { files.readFile.mockRejectedValueOnce(new Error('PRIVATE_FILE_VALUE')); await expect(new EnvironmentCalendarCredentials(env()).resolve('demo-business')).rejects.toMatchObject({ code: 'CALENDAR_UNAVAILABLE' }); files.readFile.mockResolvedValueOnce('PRIVATE_INVALID_JSON'); await expect(new EnvironmentCalendarCredentials(env()).resolve('demo-business')).rejects.toMatchObject({ code: 'CALENDAR_UNAVAILABLE' }); });
  it('supports explicit deployment secrets without reading a local file', async () => { files.readFile.mockClear(); const creds = await new EnvironmentCalendarCredentials({ ...env(), GOOGLE_REFRESH_TOKEN: 'test-only-env-refresh' }).resolve('demo-business'); expect(creds.refreshToken).toBe('test-only-env-refresh'); expect(files.readFile).not.toHaveBeenCalled(); });
  it('accepts configured Google client values before the helper supplies a refresh token', () => { expect(parseEnv({ API_KEY: testEnv().API_KEY, DATABASE_URL: 'postgresql://localhost:5432/mira', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_CALENDAR_ID: 'test-calendar' }).GOOGLE_REFRESH_TOKEN).toBeUndefined(); });
});
