# End-to-end acceptance

## Preparation

1. Install Node 24 and dependencies; configure Supabase and Google OAuth locally.
2. Run `npm run db:deploy` and `npm run db:seed`; verify `isSampleData=true` on the demo business.
3. Run `npm run providers:check`. This reads PostgreSQL, Calendar FreeBusy and the existing Retell agent. Resolve failed or pending checks.
4. Start `npm run dev`. Verify `/health` and `/ready`.
5. Start an HTTPS tunnel to port 3000; configure all five Retell functions and the webhook URL using [retell-setup.md](retell-setup.md).
6. Verify Twilio trunk routing and assign the existing Retell agent to the imported number.

## Live API smoke checks

Read-only integration check: set `LIVE_TEST_ENABLED=true` locally and run `npm run test:live`. It checks real PostgreSQL and Calendar FreeBusy.

To explicitly test event creation outside a call, also set `LIVE_BOOKING_ENABLED=true` and `LIVE_TEST_START` to an exact available future slot. `test:live` will create **one real sample event** and appointment; repeated runs for the same start use the same request ID. Do this only on the dedicated test calendar. This test keeps its records as evidence; it does not cancel the event. Leave these flags off for ordinary tests.

## Real phone call

Call the Twilio number and say: “Hi, my basement pipe is leaking. Can someone come tomorrow?” Confirm that the agent asks about urgency; use a routine, non-emergency request for the booking scenario.

Verify:

1. The correct existing Retell agent answers the call.
2. Service verification returns the configured Pipe Repair service.
3. The agent resolves tomorrow in Toronto time and asks for a preference when needed.
4. `check_availability` queries the real dedicated Calendar and offers only returned slots.
5. The caller selects a slot and supplies sample name, phone and service address.
6. `create_appointment` rechecks availability, inserts the event and saves the booking.
7. The agent confirms only after the successful API result. No SMS is offered.
8. After the call ends and analysis arrives, the signed webhook stores status, summary and appointment association.

In Google Calendar, open the event and verify its sample marker, start/end, timezone, location and customer details. In Supabase, check `Customer`, `BookingAttempt` (`CONFIRMED`), `Appointment`, `CallLog` and `WebhookReceipt`. Expect exactly one event and appointment per request ID. Do not paste customer data or credentials into debugging reports.

## Failure calls

- Ask for solar-panel installation: no supported service is invented; the agent clarifies or saves a lead.
- Fill the calendar or try a slot that another API request has just booked: no overlapping booking is confirmed.
- Make the Google credentials invalid temporarily, then restart: no slots or booking are invented; offer a message or transfer. Restore credentials afterward and reconcile uncertain attempts if present.
- Describe an urgent burst pipe: save an urgent lead or use a configured real human transfer; no dispatch guarantee.
- Repeat a booking tool call with the same stable ID: retrieve the original confirmation rather than another event.

Record automated checks, live provider checks, and the real phone-call outcome separately. A runnable backend or successful mock tests alone do not complete the real-provider acceptance scenario.
