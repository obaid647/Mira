# Supabase PostgreSQL

1. Create or select the demo Supabase project. Use a test project for this MVP.
2. In **Connect**, copy the session pooler PostgreSQL URL, usually port **5432**. Use a direct connection if your network supports it. Port 6543 transaction pooling is rejected because booking uses session advisory locks.
3. Configure `DATABASE_URL` and `DIRECT_URL`. Percent-encode special characters in the password. `DIRECT_URL` is the Prisma CLI migration connection; it may equal the session URL for this persistent server.
4. Keep `DATABASE_SSL=true`. If necessary, encode the Supabase CA certificate as `DATABASE_CA_BASE64`; certificate verification remains enabled. URL SSL options are stripped for the application so they cannot override verified TLS. Configure the CLI connection's supported SSL options as needed for migrations.
5. Run `npm run db:deploy`, then `npm run db:seed`. Committed migrations create eight models and enforce business-consistent relationships and valid booking intervals.
6. Run `/ready` or `npm run providers:check` to verify access. Inspect the sample `Business` and `Service` records in the Supabase table editor.

If Node returns `SELF_SIGNED_CERT_IN_CHAIN`, download your project's CA from **Database Settings → SSL Configuration**. Base64-encode the file into `DATABASE_CA_BASE64`; do not disable certificate verification. [Supabase SSL verification](https://supabase.com/docs/guides/platform/ssl-enforcement)

For the Prisma migration CLI, set `sslmode=require`, `sslaccept=strict`, and `sslcert=<absolute CA file path>` as URL query parameters in `DIRECT_URL`. Percent-encode the file path. The pg-based application uses the base64 CA instead; CLI and application have different TLS configuration mechanisms. When deploying, use a certificate path on the deployment host rather than your Windows Downloads path.

For development schema changes, use `npm run db:migrate -- --name description` with a role and shadow database configuration that support Prisma migrations. Initial setup only needs `db:deploy`; it does not need a shadow database.

No Supabase service-role API token is needed: Prisma uses the PostgreSQL connection. Restrict direct database access to the backend. If you use only Prisma, disable the Supabase Data API or configure RLS to prevent public access to these tables.

Official instructions: [Prisma with Supabase](https://supabase.com/docs/guides/database/prisma).
