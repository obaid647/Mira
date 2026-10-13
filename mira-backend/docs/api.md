# API examples

Send `Content-Type: application/json` and `x-api-key: <API_KEY>` to all `/api/retell` routes. The key is restricted to the configured demo business. IDs and contact information below are sample data; dates must be replaced with valid future dates from live availability.

```json
{"business_id":"demo-business"}
```

POST `/api/retell/get-business-information` returns `success`, `business_id`, `name`, `address`, `phone_number`, `timezone`, `operating_hours`, `service_area`, `policies`, `current_local_time`, and `is_sample_data`.

POST `/api/retell/get-services`:

```json
{"business_id":"demo-business","service_query":"leaking basement pipe"}
```

Successful verification returns `service_found=true`, `match_status=supported`, and `service` containing `id`, `name`, `duration_minutes`, nullable `price`, and `emergency_eligible`. Other results return `service_found=false`, `service=null`, and `match_status=unknown|ambiguous|unsupported`.

POST `/api/retell/check-availability`:

```json
{"business_id":"demo-business","service_id":"pipe-repair","date":"REPLACE_WITH_FUTURE_YYYY-MM-DD","period":"morning"}
```

Returns `success`, `timezone`, `available_slots` (zero to three `{start,end}` objects), and `is_sample_data`. Periods: `morning`, `afternoon`, `evening`, `any`. A preference filters appointment start time. Notice, duration, buffers, opening hours and horizon still apply. Buffered appointments must fit inside business hours. The sample closing time and after-buffer mean a one-hour appointment cannot start at 16:00 on a weekday.

POST `/api/retell/create-appointment`:

```json
{
  "business_id":"demo-business",
  "service_id":"pipe-repair",
  "customer_name":"Sample Caller",
  "customer_phone":"+15195550123",
  "service_address":"123 Sample Street, Cambridge, ON",
  "appointment_start":"REPLACE_WITH_EXACT_RETURNED_SLOT_START",
  "problem_description":"Basement pipe leaking",
  "sms_consent":false,
  "booking_request_id":"unique-call:booking:1"
}
```

Phone numbers normalize to E.164; Canadian local numbers may be supplied. The backend computes the end time from the service. `sms_consent` is accepted for contract compatibility but performs no SMS action.

Confirmed response:

```json
{"success":true,"appointment_id":"generated-id","status":"confirmed","appointment_start":"RFC3339_TIME","message":"Appointment successfully created.","is_sample_data":true}
```

POST `/api/retell/create-lead`:

```json
{"business_id":"demo-business","service_requested":"pipe leak","notes":"Urgent request; callback needed","urgency":"urgent","caller_number":"+15195550123","customer_name":"Sample Caller","lead_request_id":"unique-call:lead:1"}
```

`caller_number` and `customer_name` are optional, so blocked caller ID does not prevent message capture. Urgency defaults to `unknown`; accepted values are `unknown`, `routine`, `urgent`. A saved lead returns `success`, `lead_id`, `status=open`, and a short message. This stores the message but does not send a notification or promise a callback time.

Failures:

```json
{"success":false,"error_code":"SLOT_UNAVAILABLE","message":"The selected appointment time is no longer available.","request_id":"trace-id"}
```

Stable codes include `INVALID_REQUEST`, `BUSINESS_NOT_FOUND`, `SERVICE_NOT_FOUND`, `SLOT_UNAVAILABLE`, `CALENDAR_UNAVAILABLE`, `BOOKING_FAILED`, `UNAUTHORIZED`, `IDEMPOTENCY_CONFLICT`, `BOOKING_IN_PROGRESS`, `BOOKING_RECONCILIATION_REQUIRED`, `DATABASE_UNAVAILABLE`, and `BUSINESS_CONFIGURATION_ERROR`. Unknown routes return `NOT_FOUND`.

Do not supply `retell_call_id` in function arguments. Live requests must use the signed envelope so call association can be trusted.
