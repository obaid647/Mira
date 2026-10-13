# Booking recovery

The Google Calendar API and PostgreSQL do not share a transaction. The durable attempt records the exact normalized input, resource, reserved interval, deterministic event ID and optional trusted Retell call ID before the insert.

| State | Meaning | Recovery |
| --- | --- | --- |
| PREPARED | Customer and recovery snapshot exist; no external insert has started. | Revalidate business rules and live availability, then insert. |
| INSERTING | An insert may have occurred; its result may be unknown. | Retrieve the deterministic event and verify metadata/time before saving. If missing, recheck and insert using the same ID. |
| CONFIRMED | Calendar event and database appointment were saved. | Return the original confirmation for identical retries. |
| FAILED | A definitive pre-insert or provider rejection occurred. | Start a new deliberate booking attempt after choosing a time. |

Run `npm run bookings:reconcile` after connectivity returns. It logs identifiers and stable result codes only. It may create real missing events on the connected demo calendar. It never reports confirmation to a caller automatically or sends notifications.

If insertion was uncertain, an event lookup returning 404 does not release the reservation. Conflicting availability, past appointment times, changed configuration, changed calendar ID, or mismatched/canceled events remain unresolved for manual review. Review both Calendar and the booking attempt before deciding how to resolve them; cancellation/rescheduling is outside this MVP.

Do not change `booking_request_id` to retry an uncertain operation. Identical keys with changed normalized input or trusted call context return `IDEMPOTENCY_CONFLICT`. Event ID collisions are retrieved and checked, never silently accepted.

Session advisory locks are held on a dedicated pg connection, not a pooled Prisma transaction. Broken or uncertain lock connections are discarded. Reservations protect intervals even after a crashed API process releases its lock. The lock pool requires a direct connection or Supabase session pooling.

All confirmed and unresolved reservations remain excluded from availability. Manual deletion of a confirmed Calendar event does not free the database reservation; synchronization of external edits is not implemented. Simultaneous manual events or other schedulers are not serialized by this backend, which is why the demo uses a dedicated calendar.
