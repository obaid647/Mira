import type { Env } from '../../config/env.js';
import { calendarUnavailable } from '../../utils/errors.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
const savedCredentials = z.object({ refresh_token: z.string().min(1) });
export interface GoogleCredentials { clientId: string; clientSecret: string; refreshToken: string }
export interface CalendarCredentialResolver { resolve(businessId: string): Promise<GoogleCredentials> }
export class EnvironmentCalendarCredentials implements CalendarCredentialResolver {
  constructor(private env: Env, private credentialsPath = resolve('.oauth-credentials.json')) {}
  async resolve(businessId: string): Promise<GoogleCredentials> {
    if (businessId !== this.env.DEMO_BUSINESS_ID || !this.env.GOOGLE_CLIENT_ID || !this.env.GOOGLE_CLIENT_SECRET) throw calendarUnavailable();
    let refreshToken = this.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) {
      try { refreshToken = savedCredentials.parse(JSON.parse(await readFile(this.credentialsPath, 'utf8'))).refresh_token; }
      catch { throw calendarUnavailable(); }
    }
    return { clientId: this.env.GOOGLE_CLIENT_ID, clientSecret: this.env.GOOGLE_CLIENT_SECRET, refreshToken };
  }
}
