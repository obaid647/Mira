# Mira

Mira is an AI receptionist application being developed for service businesses. It aims to help callers get answers, request appointments, and leave messages through a natural phone conversation, while giving businesses a reliable record of each request.

The broader product combines a phone-based voice agent, a backend that performs business actions, and a business-facing frontend. This repository currently contains the MVP backend; the voice agent is configured separately in Retell, and the frontend is future work.

## The caller experience

A caller should be able to explain what they need in their own words, such as:

> "Hi, my basement pipe is leaking. Can someone come tomorrow?"

Mira's intended flow is to:

1. Identify the requested service and ask about urgency.
2. Verify that the business offers the service.
3. Check the connected calendar and offer available appointment times.
4. Collect the caller's name, phone number, service address, and problem description.
5. Create the appointment and confirm it only after the booking is saved successfully.
6. Record an unbooked request as a lead when booking is unsuitable or cannot be completed.

Urgent requests are directed toward message capture or a separately configured human transfer. Mira does not promise emergency dispatch.

## Reliability and business information

Mira is designed to use configured business information and live calendar results. It should not invent supported services, prices, policies, or appointment availability. An appointment is confirmed only after both the calendar event and the database booking have been saved.

Repeated tool calls must not create duplicate appointments. The backend uses identifiers derived from verified Retell call context, persisted booking attempts, and calendar booking locks to make retries recoverable. Failed or uncertain actions must be reported honestly so the caller can leave a message or seek human help.

## Current scope

The current focus is a testable inbound call that verifies a service, offers live availability, books one appointment, saves the customer and booking, and records the completed call. Automated tests cover backend behavior; successful real-provider integration still requires configured accounts and an end-to-end phone test.

The MVP does not include a frontend dashboard, subscriptions, automated onboarding, automatic phone-number provisioning, CRM integrations, multiple technician schedules, or appointment rescheduling and cancellation. These remain outside the current implementation.

## Explore the project

- [Backend overview and local setup](mira-backend/README.md)
- [API examples](mira-backend/docs/api.md)
- [Retell agent and Twilio routing setup](mira-backend/docs/retell-setup.md)
- [Google Calendar authorization](mira-backend/docs/google-calendar-setup.md)
- [Supabase database setup](mira-backend/docs/supabase-setup.md)
- [End-to-end testing guide](mira-backend/docs/end-to-end.md)
