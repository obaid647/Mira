# Mira

An Express/TypeScript MVP for a Retell Conversation Flow Agent. PostgreSQL stores business data, customers, confirmed appointments, leads, and call metadata. Google Calendar provides live busy information and receives bookings. Cambridge Plumbing and every seeded business detail are **SAMPLE DATA**.

## Run locally

Use Node **24 LTS**. From `mira-backend`:

```powershell
npm ci
Copy-Item .env.example .env  # only if .env does not already exist
```

Fill in the local `.env`. Do not commit it or paste secrets into logs/chat. See [Supabase setup](docs/supabase-setup.md), [Google authorization](docs/google-calendar-setup.md), and [Retell setup](docs/retell-setup.md).

```powershell
npm run db:deploy
npm run db:seed
npm run dev
```

Check `http://localhost:3000/health` and `/ready`. `/health` checks the process; `/ready` checks PostgreSQL. Calendar credentials are not tested by either endpoint. Missing or malformed required environment values prevent startup. Configure the Google client ID, secret and calendar ID together. The existing authorization helper saves the local refresh token to ignored `.oauth-credentials.json`; no token copy to `.env` is needed. Until consent completes, Calendar actions return errors.

This workspace also has an ignored project-local Node 24 binary. If your system still uses Node 20, the optional PowerShell launcher runs npm with that binary:

```powershell
pwsh -File scripts/npm-local.ps1 run dev
# Or: powershell -File scripts/npm-local.ps1 run dev
```

Pass other npm arguments to the same launcher, such as `run typecheck` or `test`. Installing Node 24 normally makes standard `npm` commands sufficient.

## Verify

```powershell
npm run typecheck
npm test
npm run test:database
npm run build
npm start
npm run providers:check
```

`npm test` uses injected test doubles for external services. `test:database` runs real PostgreSQL in a disposable local cluster, exercises Prisma migrations and cross-connection locks, and removes the test cluster. No Docker is needed. The portable PostgreSQL dependency requires its npm postinstall scripts. Tests create only an isolated `mira_test_*` schema when `TEST_DATABASE_URL` is supplied. Prefer a separate disposable database; the suite never resets your public schema.

`providers:check` is read-only and reports database connectivity, Calendar FreeBusy, and Retell agent access independently. A passing probe does **not** prove event creation or a successful phone conversation. [End-to-end testing](docs/end-to-end.md) describes explicit live checks.

## API

All function endpoints use `POST /api/retell/<function-name-with-hyphens>` and require `x-api-key`. Direct tests send flat JSON; live Retell sends a signed `{name, call, args}` envelope. The demo key is authorized only for `DEMO_BUSINESS_ID`. Webhooks use Retell signatures instead of the demo API key.

- `get-business-information`
- `get-services`
- `check-availability`
- `create-appointment`
- `create-lead`

See [API examples](docs/api.md) and the five JSON parameter schemas in `docs/retell-functions/`. SMS is deferred; there is no `send-sms` action. The agent must not offer or claim SMS delivery.

## Booking and recovery

A PostgreSQL session advisory lock serializes bookings per calendar. A durable booking attempt reserves the interval before the external insert. Stable request IDs, payload fingerprints, unique constraints, and deterministic Google event IDs make retries recoverable.

```powershell
npm run bookings:reconcile
```

This command may create a missing event after rechecking availability, or save an existing event after a partial failure. Uncertain insert outcomes retain their reservation until resolved. See [recovery and limitations](docs/booking-recovery.md).

## Deployment later

Railway: select Node 24, install with `npm ci`, build with `npm run build`, use `npm run db:deploy` as the deployment migration command, and start with `npm start`. Set secrets as environment variables, bind the supplied `PORT`, and use `/ready` for readiness. Seed the demo manually once; do not reseed automatically on every deployment. Use a direct PostgreSQL connection or Supabase **session** pooler, never the transaction pooler for these session locks.

This MVP excludes dashboards, billing, onboarding, number provisioning, agent creation, RAG, queues, CRM, rescheduling/cancellation, and multiple technician calendars. The supplied PDF is a broader roadmap, not an additional implementation instruction.
