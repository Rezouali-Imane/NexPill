import crypto from "node:crypto";
import type { DoseEventSource, DoseStatus, Prisma, ScheduledDose } from "@prisma/client";
import { prisma } from "../db/prisma";
import { BadRequestError, NotFoundError } from "../errors";
import {
  parseDate,
  validateNonEmptyString,
  validateOptionalString,
  validateUuid,
} from "../utils/validation";
import { AccessControlService } from "./access-control.service";

export interface RecordDoseActionDto {
  occurredAt?: string | Date;
  note?: string;
  idempotencyKey?: string;
}

export interface ListDosesQuery {
  patientId?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  status?: DoseStatus;
  medicationId?: string;
  scheduleId?: string;
}

export interface GenerateDosesDto {
  scheduleId: string;
  startDate: string | Date;
  endDate: string | Date;
}

export class DoseService {
  /**
   * Marks a scheduled dose as TAKEN.
   */
  static async recordTaken(
    actorUserId: string,
    doseId: string,
    dto?: RecordDoseActionDto,
  ) {
    return DoseService.recordStatus(actorUserId, doseId, "TAKEN", dto);
  }

  /**
   * Marks a scheduled dose as SKIPPED with an optional reason note.
   */
  static async recordSkipped(
    actorUserId: string,
    doseId: string,
    dto?: RecordDoseActionDto,
  ) {
    return DoseService.recordStatus(actorUserId, doseId, "SKIPPED", dto);
  }

  /**
   * Marks a scheduled dose as UNABLE_TO_TAKE with an optional reason note.
   */
  static async recordUnableToTake(
    actorUserId: string,
    doseId: string,
    dto?: RecordDoseActionDto,
  ) {
    return DoseService.recordStatus(actorUserId, doseId, "UNABLE_TO_TAKE", dto);
  }

  /**
   * Core state transition logic for recording dose adherence.
   */
  static async recordStatus(
    actorUserId: string,
    doseId: string,
    targetStatus: DoseStatus,
    dto?: RecordDoseActionDto,
  ) {
    const validDoseId = validateUuid(doseId, "doseId");

    // Idempotency replay check if client provided an idempotencyKey
    if (dto?.idempotencyKey) {
      const existingKey = validateNonEmptyString(dto.idempotencyKey, "idempotencyKey");
      const existingEvent = await prisma.doseEvent.findUnique({
        where: { idempotencyKey: existingKey },
        include: {
          dose: {
            include: {
              schedule: {
                include: { medication: true, reminder: true },
              },
            },
          },
        },
      });

      if (existingEvent) {
        return {
          dose: existingEvent.dose,
          event: existingEvent,
          message: "Idempotent response: action already processed with this key.",
        };
      }
    }

    const dose = await prisma.scheduledDose.findUnique({
      where: { id: validDoseId },
      include: {
        schedule: {
          include: {
            medication: true,
            reminder: true,
          },
        },
        events: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!dose) {
      throw new NotFoundError(`Scheduled dose with ID "${doseId}" not found.`);
    }

    // Assert caregiver or patient record_dose access
    await AccessControlService.assertPatientAccess(
      actorUserId,
      dose.patientId,
      "record_dose",
    );

    // Terminal status check
    if (dose.status === "CANCELLED") {
      throw new BadRequestError("Cannot change the status of a CANCELLED dose.");
    }

    // Idempotent state check
    if (dose.status === targetStatus) {
      return {
        dose,
        event: dose.events[0] ?? null,
        message: `Dose is already marked as ${targetStatus}.`,
      };
    }

    const source: DoseEventSource =
      actorUserId === dose.patientId ? "PATIENT" : "CAREGIVER";
    const occurredAt = dto?.occurredAt
      ? parseDate(dto.occurredAt, "occurredAt")
      : new Date();
    const idempotencyKey =
      dto?.idempotencyKey?.trim() || crypto.randomUUID();
    const note = validateOptionalString(dto?.note, "note") ?? null;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create audit event
      const event = await tx.doseEvent.create({
        data: {
          doseId: dose.id,
          fromStatus: dose.status,
          toStatus: targetStatus,
          source,
          actorUserId,
          occurredAt,
          recordedAt: new Date(),
          idempotencyKey,
          note,
        },
      });

      // 2. Update dose record
      const updatedDose = await tx.scheduledDose.update({
        where: { id: dose.id },
        data: {
          status: targetStatus,
          resolvedAt: occurredAt,
          resolvedSource: source,
          version: { increment: 1 },
        },
        include: {
          schedule: {
            include: {
              medication: true,
              reminder: true,
            },
          },
          events: {
            orderBy: { recordedAt: "desc" },
          },
        },
      });

      // 3. Resolve any open caregiver alerts for this dose
      await tx.caregiverAlert.updateMany({
        where: {
          doseId: dose.id,
          status: "OPEN",
        },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });

      return { dose: updatedDose, event };
    });

    return result;
  }

  /**
   * Retrieves a single scheduled dose with parent schedule, medication, and event audit trail.
   */
  static async getDoseById(actorUserId: string, doseId: string) {
    const validDoseId = validateUuid(doseId, "doseId");

    const dose = await prisma.scheduledDose.findUnique({
      where: { id: validDoseId },
      include: {
        schedule: {
          include: {
            medication: true,
            reminder: true,
          },
        },
        events: {
          orderBy: { recordedAt: "desc" },
        },
      },
    });

    if (!dose) {
      throw new NotFoundError(`Scheduled dose with ID "${doseId}" not found.`);
    }

    await AccessControlService.assertPatientAccess(
      actorUserId,
      dose.patientId,
      "read",
    );

    return dose;
  }

  /**
   * Lists scheduled doses for a patient with optional filters for dates, status, or medication.
   */
  static async listDoses(actorUserId: string, query: ListDosesQuery) {
    const targetPatientId = query.patientId
      ? validateUuid(query.patientId, "patientId")
      : actorUserId;

    await AccessControlService.assertPatientAccess(
      actorUserId,
      targetPatientId,
      "read",
    );

    const where: Prisma.ScheduledDoseWhereInput = {
      patientId: targetPatientId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.scheduleId) {
      where.scheduleId = validateUuid(query.scheduleId, "scheduleId");
    }

    if (query.medicationId) {
      where.schedule = {
        medicationId: validateUuid(query.medicationId, "medicationId"),
      };
    }

    if (query.startDate || query.endDate) {
      where.scheduledAt = {};
      if (query.startDate) {
        where.scheduledAt.gte = parseDate(query.startDate, "startDate");
      }
      if (query.endDate) {
        where.scheduledAt.lte = parseDate(query.endDate, "endDate");
      }
    }

    return prisma.scheduledDose.findMany({
      where,
      include: {
        schedule: {
          include: {
            medication: true,
            reminder: true,
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    });
  }

  /**
   * Generates ScheduledDose records for a schedule between startDate and endDate.
   */
  static async generateDosesForSchedule(
    actorUserId: string,
    dto: GenerateDosesDto,
  ) {
    const validScheduleId = validateUuid(dto.scheduleId, "scheduleId");
    const startDate = parseDate(dto.startDate, "startDate");
    const endDate = parseDate(dto.endDate, "endDate");

    if (startDate > endDate) {
      throw new BadRequestError("startDate cannot be later than endDate.");
    }

    const schedule = await prisma.medicationSchedule.findUnique({
      where: { id: validScheduleId },
      include: {
        medication: true,
        reminder: true,
      },
    });

    if (!schedule) {
      throw new NotFoundError(
        `Medication schedule with ID "${dto.scheduleId}" not found.`,
      );
    }

    await AccessControlService.assertPatientAccess(
      actorUserId,
      schedule.medication.patientId,
      "write",
    );

    const lateAfterMin = schedule.reminder?.lateAfterMin ?? 15;
    const missedAfterMin = schedule.reminder?.missedAfterMin ?? 120;
    const generatedDoses: ScheduledDose[] = [];

    // Iterate through each calendar day
    const cursor = new Date(startDate);
    cursor.setUTCHours(0, 0, 0, 0);

    const lastDay = new Date(endDate);
    lastDay.setUTCHours(23, 59, 59, 999);

    while (cursor <= lastDay) {
      const dayOfWeek = cursor.getUTCDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
      // Match day of week against daysOfWeek array (allow Sunday as either 0 or 7)
      const dayMatches =
        schedule.daysOfWeek.includes(dayOfWeek) ||
        (dayOfWeek === 0 && schedule.daysOfWeek.includes(7)) ||
        (dayOfWeek === 7 && schedule.daysOfWeek.includes(0));

      if (dayMatches) {
        for (const timeStr of schedule.timesOfDay) {
          const [hoursStr, minutesStr] = timeStr.split(":");
          const hours = Number.parseInt(hoursStr ?? "0", 10);
          const minutes = Number.parseInt(minutesStr ?? "0", 10);

          const scheduledAt = new Date(cursor);
          scheduledAt.setUTCHours(hours, minutes, 0, 0);

          const lateAfterAt = new Date(
            scheduledAt.getTime() + lateAfterMin * 60 * 1000,
          );
          const missedDeadlineAt = new Date(
            scheduledAt.getTime() + missedAfterMin * 60 * 1000,
          );
          const localDate = new Date(
            Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()),
          );

          const dose = await prisma.scheduledDose.upsert({
            where: {
              scheduleId_scheduledAt: {
                scheduleId: schedule.id,
                scheduledAt,
              },
            },
            create: {
              scheduleId: schedule.id,
              patientId: schedule.medication.patientId,
              scheduledAt,
              localDate,
              timeZone: schedule.timeZone,
              lateAfterAt,
              missedDeadlineAt,
              status: "PENDING",
            },
            update: {},
          });

          generatedDoses.push(dose);
        }
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // Update schedule's generatedThrough marker
    await prisma.medicationSchedule.update({
      where: { id: schedule.id },
      data: { generatedThrough: endDate },
    });

    return {
      message: `Generated ${generatedDoses.length} scheduled doses.`,
      count: generatedDoses.length,
      doses: generatedDoses,
    };
  }
}
