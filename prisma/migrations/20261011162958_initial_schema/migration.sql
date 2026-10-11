-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "MedicationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DoseStatus" AS ENUM ('PENDING', 'TAKEN', 'SKIPPED', 'UNABLE_TO_TAKE', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DoseEventSource" AS ENUM ('PATIENT', 'CAREGIVER', 'DEVICE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WarningKind" AS ENUM ('INTERACTION', 'DUPLICATE', 'DOSE_LIMIT');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'MODERATE', 'SEVERE');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('DOSE_REMINDER', 'DOSE_REMINDER_FOLLOWUP', 'CAREGIVER_ALERT', 'SAFETY_WARNING', 'DAILY_SUMMARY');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SCHEDULED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('DOSE_LATE', 'DOSE_MISSED', 'REPEATED_MISSES', 'RISK_HIGH', 'SAFETY_WARNING');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('STABLE', 'NEEDS_ATTENTION', 'HIGH_RISK');

-- CreateEnum
CREATE TYPE "AnalysisKind" AS ENUM ('RISK_ASSESSMENT', 'DAILY_SUMMARY', 'REMINDER_TIMING_SUGGESTION');

-- CreateEnum
CREATE TYPE "AnalysisGenerator" AS ENUM ('RULES', 'AI_MODEL');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('UNASSIGNED', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "DeviceEventType" AS ENUM ('COMPARTMENT_OPENED', 'DOSE_DISPENSED', 'DOSE_REMOVED', 'HEARTBEAT', 'ERROR');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM_JOB', 'AI_SERVICE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
    "disabledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "largeText" BOOLEAN NOT NULL DEFAULT false,
    "highContrast" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "NotificationEndpoint" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "address" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaregiverAccess" (
    "id" UUID NOT NULL,
    "caregiverId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "status" "AccessStatus" NOT NULL DEFAULT 'PENDING',
    "canViewSchedule" BOOLEAN NOT NULL DEFAULT true,
    "canViewHistory" BOOLEAN NOT NULL DEFAULT true,
    "canReceiveAlerts" BOOLEAN NOT NULL DEFAULT true,
    "canRecordDoses" BOOLEAN NOT NULL DEFAULT false,
    "canManageMedications" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" UUID NOT NULL,
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMPTZ(6),
    "grantedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CaregiverAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugCatalogItem" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "externalId" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrugCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugInteraction" (
    "id" UUID NOT NULL,
    "drugAId" UUID NOT NULL,
    "drugBId" UUID NOT NULL,
    "severity" "Severity" NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrugInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyWarning" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "medicationId" UUID NOT NULL,
    "otherMedicationId" UUID,
    "interactionId" UUID,
    "kind" "WarningKind" NOT NULL,
    "severity" "Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMPTZ(6),
    "acknowledgedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyWarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "catalogItemId" UUID,
    "name" TEXT NOT NULL,
    "dosageText" TEXT NOT NULL,
    "form" TEXT,
    "route" TEXT,
    "instructions" TEXT,
    "prescriber" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "status" "MedicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationSchedule" (
    "id" UUID NOT NULL,
    "medicationId" UUID NOT NULL,
    "previousScheduleId" UUID,
    "doseLabel" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "timesOfDay" TEXT[],
    "daysOfWeek" INTEGER[],
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "effectiveFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMPTZ(6),
    "generatedThrough" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MedicationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderConfig" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "reminderOffsetsMin" INTEGER[] DEFAULT ARRAY[0, 15]::INTEGER[],
    "lateAfterMin" INTEGER NOT NULL DEFAULT 15,
    "caregiverAlertAfterMin" INTEGER NOT NULL DEFAULT 30,
    "missedAfterMin" INTEGER NOT NULL DEFAULT 120,
    "notifyCaregivers" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ReminderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledDose" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "scheduledAt" TIMESTAMPTZ(6) NOT NULL,
    "localDate" DATE NOT NULL,
    "timeZone" TEXT NOT NULL,
    "lateAfterAt" TIMESTAMPTZ(6) NOT NULL,
    "missedDeadlineAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "DoseStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedSource" "DoseEventSource",
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ScheduledDose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoseEvent" (
    "id" UUID NOT NULL,
    "doseId" UUID NOT NULL,
    "fromStatus" "DoseStatus" NOT NULL,
    "toStatus" "DoseStatus" NOT NULL,
    "source" "DoseEventSource" NOT NULL,
    "actorUserId" UUID,
    "deviceEventId" UUID,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "recordedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "DoseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "doseId" UUID,
    "alertId" UUID,
    "kind" "NotificationKind" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledFor" TIMESTAMPTZ(6) NOT NULL,
    "sentAt" TIMESTAMPTZ(6),
    "deliveredAt" TIMESTAMPTZ(6),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaregiverAlert" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "doseId" UUID,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "reason" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMPTZ(6),
    "resolvedAt" TIMESTAMPTZ(6),

    CONSTRAINT "CaregiverAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdherenceAnalysis" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "kind" "AnalysisKind" NOT NULL,
    "periodStart" TIMESTAMPTZ(6) NOT NULL,
    "periodEnd" TIMESTAMPTZ(6) NOT NULL,
    "riskLevel" "RiskLevel",
    "metrics" JSONB NOT NULL,
    "reasons" JSONB,
    "summaryText" TEXT,
    "generator" "AnalysisGenerator" NOT NULL,
    "modelName" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdherenceAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "patientId" UUID,
    "status" "DeviceStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "isSimulated" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceEvent" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "doseId" UUID,
    "type" "DeviceEventType" NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "DeviceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" UUID,
    "patientId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "NotificationEndpoint_userId_idx" ON "NotificationEndpoint"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEndpoint_userId_channel_address_key" ON "NotificationEndpoint"("userId", "channel", "address");

-- CreateIndex
CREATE UNIQUE INDEX "CaregiverAccess_inviteTokenHash_key" ON "CaregiverAccess"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "CaregiverAccess_patientId_status_idx" ON "CaregiverAccess"("patientId", "status");

-- CreateIndex
CREATE INDEX "CaregiverAccess_caregiverId_status_idx" ON "CaregiverAccess"("caregiverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CaregiverAccess_caregiverId_patientId_key" ON "CaregiverAccess"("caregiverId", "patientId");

-- CreateIndex
CREATE INDEX "DrugCatalogItem_name_idx" ON "DrugCatalogItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DrugCatalogItem_source_externalId_key" ON "DrugCatalogItem"("source", "externalId");

-- CreateIndex
CREATE INDEX "DrugInteraction_drugBId_idx" ON "DrugInteraction"("drugBId");

-- CreateIndex
CREATE UNIQUE INDEX "DrugInteraction_drugAId_drugBId_key" ON "DrugInteraction"("drugAId", "drugBId");

-- CreateIndex
CREATE INDEX "SafetyWarning_patientId_createdAt_idx" ON "SafetyWarning"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyWarning_medicationId_idx" ON "SafetyWarning"("medicationId");

-- CreateIndex
CREATE INDEX "SafetyWarning_otherMedicationId_idx" ON "SafetyWarning"("otherMedicationId");

-- CreateIndex
CREATE INDEX "Medication_patientId_status_idx" ON "Medication"("patientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationSchedule_previousScheduleId_key" ON "MedicationSchedule"("previousScheduleId");

-- CreateIndex
CREATE INDEX "MedicationSchedule_medicationId_effectiveTo_idx" ON "MedicationSchedule"("medicationId", "effectiveTo");

-- CreateIndex
CREATE INDEX "MedicationSchedule_effectiveTo_generatedThrough_idx" ON "MedicationSchedule"("effectiveTo", "generatedThrough");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderConfig_scheduleId_key" ON "ReminderConfig"("scheduleId");

-- CreateIndex
CREATE INDEX "ScheduledDose_patientId_scheduledAt_idx" ON "ScheduledDose"("patientId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledDose_patientId_localDate_idx" ON "ScheduledDose"("patientId", "localDate");

-- CreateIndex
CREATE INDEX "ScheduledDose_status_missedDeadlineAt_idx" ON "ScheduledDose"("status", "missedDeadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledDose_scheduleId_scheduledAt_key" ON "ScheduledDose"("scheduleId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoseEvent_deviceEventId_key" ON "DoseEvent"("deviceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "DoseEvent_idempotencyKey_key" ON "DoseEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DoseEvent_doseId_recordedAt_idx" ON "DoseEvent"("doseId", "recordedAt");

-- CreateIndex
CREATE INDEX "DoseEvent_actorUserId_idx" ON "DoseEvent"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_status_scheduledFor_idx" ON "Notification"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_doseId_idx" ON "Notification"("doseId");

-- CreateIndex
CREATE UNIQUE INDEX "CaregiverAlert_dedupeKey_key" ON "CaregiverAlert"("dedupeKey");

-- CreateIndex
CREATE INDEX "CaregiverAlert_recipientId_status_createdAt_idx" ON "CaregiverAlert"("recipientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CaregiverAlert_patientId_createdAt_idx" ON "CaregiverAlert"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "AdherenceAnalysis_patientId_kind_createdAt_idx" ON "AdherenceAnalysis"("patientId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_serial_key" ON "Device"("serial");

-- CreateIndex
CREATE INDEX "Device_patientId_idx" ON "Device"("patientId");

-- CreateIndex
CREATE INDEX "DeviceEvent_deviceId_occurredAt_idx" ON "DeviceEvent"("deviceId", "occurredAt");

-- CreateIndex
CREATE INDEX "DeviceEvent_doseId_idx" ON "DeviceEvent"("doseId");

-- CreateIndex
CREATE INDEX "AuditEvent_patientId_createdAt_idx" ON "AuditEvent"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEndpoint" ADD CONSTRAINT "NotificationEndpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverAccess" ADD CONSTRAINT "CaregiverAccess_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverAccess" ADD CONSTRAINT "CaregiverAccess_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverAccess" ADD CONSTRAINT "CaregiverAccess_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugInteraction" ADD CONSTRAINT "DrugInteraction_drugAId_fkey" FOREIGN KEY ("drugAId") REFERENCES "DrugCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugInteraction" ADD CONSTRAINT "DrugInteraction_drugBId_fkey" FOREIGN KEY ("drugBId") REFERENCES "DrugCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyWarning" ADD CONSTRAINT "SafetyWarning_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyWarning" ADD CONSTRAINT "SafetyWarning_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyWarning" ADD CONSTRAINT "SafetyWarning_otherMedicationId_fkey" FOREIGN KEY ("otherMedicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyWarning" ADD CONSTRAINT "SafetyWarning_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "DrugInteraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "DrugCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_previousScheduleId_fkey" FOREIGN KEY ("previousScheduleId") REFERENCES "MedicationSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderConfig" ADD CONSTRAINT "ReminderConfig_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MedicationSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledDose" ADD CONSTRAINT "ScheduledDose_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MedicationSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledDose" ADD CONSTRAINT "ScheduledDose_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseEvent" ADD CONSTRAINT "DoseEvent_doseId_fkey" FOREIGN KEY ("doseId") REFERENCES "ScheduledDose"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseEvent" ADD CONSTRAINT "DoseEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseEvent" ADD CONSTRAINT "DoseEvent_deviceEventId_fkey" FOREIGN KEY ("deviceEventId") REFERENCES "DeviceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_doseId_fkey" FOREIGN KEY ("doseId") REFERENCES "ScheduledDose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "CaregiverAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverAlert" ADD CONSTRAINT "CaregiverAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverAlert" ADD CONSTRAINT "CaregiverAlert_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverAlert" ADD CONSTRAINT "CaregiverAlert_doseId_fkey" FOREIGN KEY ("doseId") REFERENCES "ScheduledDose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdherenceAnalysis" ADD CONSTRAINT "AdherenceAnalysis_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceEvent" ADD CONSTRAINT "DeviceEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceEvent" ADD CONSTRAINT "DeviceEvent_doseId_fkey" FOREIGN KEY ("doseId") REFERENCES "ScheduledDose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
