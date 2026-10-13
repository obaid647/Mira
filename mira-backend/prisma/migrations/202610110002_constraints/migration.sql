ALTER TABLE "Service" ADD CONSTRAINT "Service_duration_positive" CHECK ("durationMinutes" > 0);
ALTER TABLE "Service" ADD CONSTRAINT "Service_price_nonnegative" CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "Business" ADD CONSTRAINT "Business_booking_rules_valid" CHECK (
  "minimumNoticeMinutes" >= 0 AND "bufferBeforeMinutes" >= 0 AND "bufferAfterMinutes" >= 0
  AND "bookingHorizonDays" > 0 AND "slotIntervalMinutes" > 0
);
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_interval_valid" CHECK ("startTime" < "endTime");
ALTER TABLE "BookingAttempt" ADD CONSTRAINT "BookingAttempt_interval_valid" CHECK (
  "startTime" < "endTime" AND "reservedStart" <= "startTime" AND "reservedEnd" >= "endTime"
);
