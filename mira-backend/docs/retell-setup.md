# Retell Conversation Flow configuration

Verified against the current [Conversation Flow custom-function documentation](https://docs.retellai.com/build/conversation-flow/custom-function), [webhook overview](https://docs.retellai.com/features/webhook-overview), and [signature mechanism](https://docs.retellai.com/features/secure-webhook).

## Common settings

Start the API and expose it with an HTTPS tunnel, such as `ngrok http 3000`. Set the public origin in each function URL. Retell cannot call localhost or a private IP directly. Restarted tunnels may change their URL, requiring all function and webhook URLs to be updated.

Set `RETELL_AGENT_ID` and the Retell verification API key (`RETELL_API_KEY`) locally, then reseed. Use the API key designated for webhook verification in Retell. Backend `API_KEY` is a separate random secret.

For every function: POST, `Content-Type: application/json`, static `x-api-key: <backend API_KEY>`, **Payload: args only OFF**, timeout **30000 ms**, `max_retry=0` initially. Retell includes `X-Retell-Signature`. The backend authenticates both the demo key and the exact signed body, and reads trusted call IDs from `call.call_id`.

Use a Function node with **Wait for Result ON**. A short waiting sentence may be spoken, but no success statement before the result. Add a safe failure/else transition. Reset result variables before each invocation because a failed request may leave prior variables intact.

## Functions

Paste the corresponding JSON schema from `docs/retell-functions/`. Schemas can be regenerated with `npm run retell:schemas`. The `create_appointment` schema intentionally uses only an object, primitive property types, descriptions, and required fields so the dashboard can save it. Strict date, phone, length, unknown-field, and business authorization checks remain in the backend. Set `business_id` to `demo-business`; the signed agent mapping must authorize that business regardless of the model's argument. Other function schemas use a business constant. If `DEMO_BUSINESS_ID` changes, update the schemas and configured service IDs accordingly.

| Name | Description | URL suffix | Response variables |
| --- | --- | --- | --- |
| `get_business_information` | Retrieve verified sample business hours, area and policies. | `/api/retell/get-business-information` | `business_name←name`, `business_timezone←timezone`, `current_local_time←current_local_time`, `business_policies←policies` |
| `get_services` | Verify the caller's service request using configured services; ask for clarification on unknown or ambiguous results. | `/api/retell/get-services` | `service_found←service_found`, `service_id←service.id`, `service_name←service.name`, `service_duration←service.duration_minutes`, `service_match_status←match_status` |
| `check_availability` | Check the selected service/date against the live Google calendar. | `/api/retell/check-availability` | `availability_success←success`, `slots←available_slots`, `slot1_start←available_slots[0].start`, `slot2_start←available_slots[1].start`, `slot3_start←available_slots[2].start` |
| `create_appointment` | Book the chosen checked slot using a server-managed call attempt. | `/api/retell/create-appointment` | `booking_success←success`, `appointment_id←appointment_id`, `booking_status←status`, `confirmed_start←appointment_start`, optional `booking_request_id←booking_request_id` |
| `create_lead` | Record an unbooked or urgent request for human follow-up; does not book or notify anyone. | `/api/retell/create-lead` | `lead_success←success`, `lead_id←lead_id`, `lead_status←status` |

Responses are JSON objects. Success and failure examples are in [api.md](api.md). Expected refusals such as unknown service are HTTP 200 with `service_found=false`; validation/authentication failures use 400/401, unavailable slots or conflicting identifiers use 409, and provider/recovery failures use 503. Retell receives failed HTTP actions as errors: configure a failure transition rather than relying solely on stored response variables.

### Server-owned appointment identifiers

Keep **Payload: args only OFF** for booking. The backend verifies the exact raw-body signature and resolves the business from `call.agent_id` before accepting `call.call_id` as trusted context. A signed args-only booking is rejected because it contains no trusted call identity. Do not add `call_id`, `retell_call_id`, or `booking_attempt_counter` to the model's arguments.

Retell supplies the verified call object automatically in `{name, call, args}`. It does **not** need to supply a booking request identifier or counter. The booking service assigns the internal field immediately before preparing the durable attempt:

```text
booking_request_id = "retell:" + SHA256(business_id + NUL + verified_call_id) + ":booking:" + server_counter
```

The counter starts at 1. Allocation happens inside the PostgreSQL per-calendar lock. `BookingAttempt.bookingRequestId`, its normalized snapshot, trusted `retellCallId`, fingerprint, and deterministic Calendar event ID are committed before inserting an event. The highest persisted server counter is the source for the next counter; no process-local counter or Retell variable is used. This uses the existing booking journal and needs no database migration.

- Identical normalized input for that call reuses its persisted attempt, including across retries, concurrent requests, and API restarts. Equivalent timezone offsets and normalized phone numbers match.
- A new counter is allocated only for changed booking details after all previous attempts for the call have definitively failed. A delayed retry matching an earlier failed attempt still returns that attempt's failure.
- Changed details while a booking is prepared, uncertain, or confirmed return `IDEMPOTENCY_CONFLICT`. Do not switch times after a timeout; retry the original details or capture a message for reconciliation. This MVP supports one successful appointment per call.
- The successful response includes the server-owned `booking_request_id`. You may map `booking_request_id` to that response field for tracing, but never send it back as an authority to create another booking.

Your existing simple schema may continue to require `booking_request_id`: a nonempty string up to 200 characters is accepted for compatibility, validated, and **discarded**. Changing it cannot bypass idempotency. Prefer removing that field and any Code node that generates booking IDs or increments a booking counter. The generated `create_appointment.json` omits it. Backend Zod still rejects invalid argument types, oversized strings, invalid or offset-free timestamps, invalid phones, and extra fields.

Retell variables are strings. Reset booking result variables before each call; no booking-ID Code node is needed. Lead capture retains its separate existing identifier contract; for example, create its ID once in a Code node:

```javascript
return {
  lead_request_id: String(dv.call_id) + ":lead:1",
  booking_success: "false",
  booking_status: "pending"
};
```

Map these returned fields to variables. The lead identifier must remain stable on retries. The backend ignores all legacy booking identifiers supplied by the model; appointment idempotency is controlled by the persisted server allocation described above.

## Existing stages and guardrails

Welcome → identify service/urgency → verify service → check availability → collect and repeat name/phone/address/chosen time → create appointment → confirm only when `booking_success` is true **and** `booking_status` is confirmed.

- Resolve “tomorrow” from `current_local_time` in the business timezone; send `YYYY-MM-DD`, never a relative phrase.
- Copy the chosen slot's exact RFC3339 timestamp into `appointment_start`. Do not regenerate offsets or invent another time.
- Clear service variables on every verification attempt; unsupported/unknown/ambiguous requests go to clarification or lead capture.
- Clear all slot variables before checking again. Offer only returned slots, including when fewer than three exist. Empty slots mean no available time for that preference.
- Ask about urgency. Urgent requests go to `create_lead` or a configured Retell human transfer, never an emergency dispatch promise. `emergency_eligible` does not imply live emergency availability.
- API failure → offer to take a message or transfer. If lead capture also fails, do not claim that the message was saved.
- No SMS action is configured. Never claim a text was sent.
- Transfers use Retell's existing Call Transfer node. Use a real configured destination; the seed's fictional phone is not a human transfer destination.

## Webhooks and inbound Twilio routing

Set agent webhook URL to `<PUBLIC_ORIGIN>/api/webhooks/retell`; enable `call_started`, `call_ended`, `call_analyzed`. Retell retries unsuccessful lifecycle deliveries; this endpoint acknowledges only after a short durable database update. Summary normally arrives in `call_analyzed`.

Keep backend `STORE_TRANSCRIPTS=false` and `STORE_RECORDINGS=false`. Configure Retell's own storage settings separately: backend defaults do not change provider retention. Enabling either backend setting requires an explicit local configuration change.

For inbound voice, use [Retell's Twilio elastic SIP trunking instructions](https://docs.retellai.com/deploy/twilio): create the trunk, set origination to Retell's documented SIP URI, associate your Twilio number, import it in Retell, test the SIP connection, and assign the existing Conversation Flow Agent. Configure termination/credentials as required by Retell's import flow. The backend handles tools and webhooks; it does not proxy Twilio audio or provision phone numbers.

Validate all five functions in a live call before claiming the integration works. Dashboard-only tests may omit call context or signatures; use authenticated flat requests for local endpoint debugging instead of disabling signature checks.
