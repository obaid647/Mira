import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import { z } from 'zod';
const env = z.object({ GOOGLE_CLIENT_ID: z.string().min(1), GOOGLE_CLIENT_SECRET: z.string().min(1), GOOGLE_REDIRECT_URI: z.url().default('http://localhost:3005/oauth2callback') }).parse(process.env);
const redirect = new URL(env.GOOGLE_REDIRECT_URI);
if (redirect.hostname !== 'localhost' || redirect.protocol !== 'http:') throw new Error('The demo authorization helper accepts only an http://localhost redirect.');
const auth = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirect.toString());
auth.transporter.defaults = { timeout: 10000, retry: false };
const state = randomBytes(24).toString('hex');
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', redirect.origin);
  if (url.pathname !== redirect.pathname) { res.writeHead(404).end(); return; }
  const supplied = url.searchParams.get('state') ?? '';
  if (!/^[a-f0-9]{48}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(state))) { res.writeHead(400).end('Invalid OAuth state.'); return; }
  const code = url.searchParams.get('code');
  if (!code) { res.writeHead(400).end('Authorization was not granted. Restart the helper to try again.'); return; }
  try {
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) throw new Error('Missing refresh token');
    await writeFile('.oauth-credentials.json', JSON.stringify({ refresh_token: tokens.refresh_token }, null, 2), { mode: 0o600 });
    await chmod('.oauth-credentials.json', 0o600);
    res.end('Authorized. Return to your terminal.');
    console.log('Saved OAuth credentials securely to ignored .oauth-credentials.json. The Calendar adapter reads this file directly; no token copy to .env is needed.');
    server.close(); clearTimeout(expiry);
  } catch { res.writeHead(500).end('Authorization failed. Check your Google configuration and local credential-file permissions.'); console.error('OAuth exchange failed; no token was logged.'); }
});
const expiry = setTimeout(() => { server.close(); console.error('Authorization timed out. Restart the helper.'); process.exitCode = 1; }, 900000);
server.listen(Number(redirect.port || 80), '127.0.0.1', () => console.log('Open this URL in your browser:\n' + auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', state,
  scope: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.events.freebusy'] })));
