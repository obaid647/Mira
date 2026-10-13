# Google Calendar demo authorization

1. Use a dedicated Google test account. Create a dedicated calendar and set its timezone to `America/Toronto`. This backend should be its only automated booking writer.
2. Create a Google Cloud project and enable the Google Calendar API.
3. Configure Google Auth Platform consent settings. For an external testing app, add the dedicated account as a test user.
4. Create an OAuth **Web application** client. Add this exact authorized redirect URI: `http://localhost:3005/oauth2callback`.
5. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`. Copy the dedicated calendar ID from Calendar settings into `GOOGLE_CALENDAR_ID`.
6. Run `npm run google:authorize`. Open the URL printed by the helper within 15 minutes and sign in with the dedicated test account. The callback validates state and exchanges the code locally. The configured callback port must be free; stop the API first if you configured the callback to use its port.
7. The helper exchanges the code for access and refresh tokens automatically, then saves only the refresh token to the existing ignored **`.oauth-credentials.json`**, with private file permissions. It never prints tokens or secrets. Keep this file: the Calendar credential resolver reads it directly, so no manual token copy or second local storage method is needed. A successful repeat authorization renews this same file.
8. Run `npm run db:deploy`, `npm run db:seed`, and `npm run providers:check`. Reseeding connects the demo business to the configured calendar and Retell agent.

The helper requests `calendar.events` and `calendar.events.freebusy`, plus offline access. The short-lived access token stays in memory; Google’s client obtains fresh access tokens from the saved refresh token. Calendar access is resolved by business ID through `CalendarCredentialResolver`; replacing demo credentials with encrypted per-business credentials later does not change booking services. For hosted deployment, supply `GOOGLE_REFRESH_TOKEN` through your environment/secrets manager instead of uploading the local credential file. When present, that explicit environment value takes precedence; do not maintain two local copies.

Google external apps in Testing issue refresh tokens that expire after seven days for these scopes. Repeat authorization when needed. [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)

Authentication failures, missing permissions, missing calendars, Calendar-specific FreeBusy errors, and timeouts cause structured failures. No provider outage returns fake slots or a booking confirmation.

Official references: [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [event creation](https://developers.google.com/workspace/calendar/api/guides/create-events).
