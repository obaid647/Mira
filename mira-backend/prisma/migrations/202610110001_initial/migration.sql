-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED');

-- CreateEnum
CREATE TYPE "BookingState" AS ENUM ('PREPARED', 'INSERTING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('OPEN');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('UNKNOWN', 'ROUTINE', 'URGENT');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "operatingHours" JSONB NOT NULL,
    "serviceArea" TEXT[],
    "policies" JSONB NOT NULL,
    "calendarId" TEXT,
    "retellAgentId" TEXT,
    "isSampleData" BOOLEAN NOT NULL DEFAULT false,
    "minimumNoticeMinutes" INTEGER NOT NULL DEFAULT 120,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 15,
    "bookingHorizonDays" INTEGER NOT NULL DEFAULT 30,
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "aliases" TEXT[],
    "durationMinutes" INTEGER NOT NULL,
    "price" DECIMAL(10,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "emergencyEligible" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "endTime" TIMESTAMPTZ(3) NOT NULL,
    "serviceAddress" TEXT NOT NULL,
    "problemDescription" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "googleCalendarEventId" TEXT NOT NULL,
    "bookingRequestId" TEXT NOT NULL,
    "retellCallId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAttempt" (
    "bookingRequestId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "endTime" TIMESTAMPTZ(3) NOT NULL,
    "reservedStart" TIMESTAMPTZ(3) NOT NULL,
    "reservedEnd" TIMESTAMPTZ(3) NOT NULL,
    "retellCallId" TEXT,
    "state" "BookingState" NOT NULL DEFAULT 'PREPARED',
    "failureCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BookingAttempt_pkey" PRIMARY KEY ("bookingRequestId")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "retellCallId" TEXT NOT NULL,
    "customerId" TEXT,
    "appointmentId" TEXT,
    "callerNumber" TEXT,
    "callStatus" TEXT NOT NULL,
    "callSummary" TEXT,
    "failureDetails" JSONB,
    "transcript" TEXT,
    "recordingUrl" TEXT,
    "lifecycleRank" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "callerNumber" TEXT,
    "serviceRequested" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "urgency" "Urgency" NOT NULL DEFAULT 'UNKNOWN',
    "status" "LeadStatus" NOT NULL DEFAULT 'OPEN',
    "leadRequestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "retellCallId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "retellCallId" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_retellAgentId_key" ON "Business"("retellAgentId");

-- CreateIndex
CREATE INDEX "Service_businessId_active_idx" ON "Service"("businessId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Service_id_businessId_key" ON "Service"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_phoneNumber_key" ON "Customer"("businessId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_id_businessId_key" ON "Customer"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_googleCalendarEventId_key" ON "Appointment"("googleCalendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_bookingRequestId_key" ON "Appointment"("bookingRequestId");

-- CreateIndex
CREATE INDEX "Appointment_businessId_startTime_endTime_idx" ON "Appointment"("businessId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Appointment_retellCallId_idx" ON "Appointment"("retellCallId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_id_businessId_key" ON "Appointment"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_bookingRequestId_businessId_key" ON "Appointment"("bookingRequestId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAttempt_eventId_key" ON "BookingAttempt"("eventId");

-- CreateIndex
CREATE INDEX "BookingAttempt_calendarId_state_reservedStart_reservedEnd_idx" ON "BookingAttempt"("calendarId", "state", "reservedStart", "reservedEnd");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAttempt_bookingRequestId_businessId_key" ON "BookingAttempt"("bookingRequestId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_retellCallId_key" ON "CallLog"("retellCallId");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_id_businessId_key" ON "CallLog"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_leadRequestId_key" ON "Lead"("leadRequestId");

-- CreateIndex
CREATE INDEX "Lead_businessId_createdAt_idx" ON "Lead"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_event_retellCallId_key" ON "WebhookReceipt"("event", "retellCallId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "Customer"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_businessId_fkey" FOREIGN KEY ("serviceId", "businessId") REFERENCES "Service"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_bookingRequestId_businessId_fkey" FOREIGN KEY ("bookingRequestId", "businessId") REFERENCES "BookingAttempt"("bookingRequestId", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttempt" ADD CONSTRAINT "BookingAttempt_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttempt" ADD CONSTRAINT "BookingAttempt_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "Customer"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttempt" ADD CONSTRAINT "BookingAttempt_serviceId_businessId_fkey" FOREIGN KEY ("serviceId", "businessId") REFERENCES "Service"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "Customer"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_appointmentId_businessId_fkey" FOREIGN KEY ("appointmentId", "businessId") REFERENCES "Appointment"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "Customer"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
