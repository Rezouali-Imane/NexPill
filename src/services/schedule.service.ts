import { prisma } from "../db/prisma";
import { NotFoundError, BadRequestError } from "../errors";
import {
  validateUuid,
  validateNonEmptyString,
  validateTimesOfDay,
  validateDaysOfWeek,
  parseDate,
  parseOptionalDate,
} from "../utils/validation";
import { AccessControlService } from "./access-control.service";
import type { MedicationSchedule, Prisma } from "@prisma/client";

export interface ReminderConfigDto {
  reminderOffsetsMin?: number[];
  lateAfterMin?: number;
  caregiverAlertAfterMin?: number;
  missedAfterMin?: number;
  notifyCaregivers?: boolean;
}

export interface CreateScheduleDto {
  doseLabel: string;
  timeZone?: string;
  timesOfDay: string[];
  daysOfWeek: number[];
  startDate: string | Date;
  endDate?: string | Date | null;
  reminder?: ReminderConfigDto;
}

export interface UpdateScheduleDto {
  doseLabel?: string;
  timeZone?: string;
  timesOfDay?: string[];
  daysOfWeek?: number[];
  startDate?: string | Date;
  endDate?: string | Date | null;
  reminder?: ReminderConfigDto;
}

export class ScheduleService {
  /**
   * Creates a schedule and associated reminder configuration for a medication.
   */
  static async createSchedule(
    actorUserId: string,
    medicationId: string,
    dto: CreateScheduleDto,
  ): Promise<MedicationSchedule> {
    const validMedicationId = validateUuid(medicationId, "medicationId");

    const medication = await prisma.medication.findUnique({
      where: { id: validMedicationId },
    });

    if (!medication) {
      throw new NotFoundError(`Medication with ID "${medicationId}" not found.`);
    }

    // Check write permissions for the patient
    await AccessControlService.assertPatientAccess(actorUserId, medication.patientId, "write");

    const doseLabel = validateNonEmptyString(dto.doseLabel, "doseLabel");
    const timeZone = dto.timeZone?.trim() || "UTC";
    const timesOfDay = validateTimesOfDay(dto.timesOfDay);
    const daysOfWeek = validateDaysOfWeek(dto.daysOfWeek);
    const startDate = parseDate(dto.startDate, "startDate");
    const endDate = parseOptionalDate(dto.endDate, "endDate");

    if (endDate && startDate > endDate) {
      throw new BadRequestError("startDate cannot be later than endDate.");
    }

    const schedule = await prisma.medicationSchedule.create({
      data: {
        medicationId: validMedicationId,
        doseLabel,
        timeZone,
        timesOfDay,
        daysOfWeek,
        startDate,
        endDate: endDate ?? null,
        reminder: {
          create: {
            reminderOffsetsMin: dto.reminder?.reminderOffsetsMin ?? [0, 15],
            lateAfterMin: dto.reminder?.lateAfterMin ?? 15,
            caregiverAlertAfterMin: dto.reminder?.caregiverAlertAfterMin ?? 30,
            missedAfterMin: dto.reminder?.missedAfterMin ?? 120,
            notifyCaregivers: dto.reminder?.notifyCaregivers ?? true,
          },
        },
      },
      include: {
        reminder: true,
      },
    });

    return schedule;
  }

  /**
   * Lists active schedules for a specific medication.
   */
  static async listSchedulesForMedication(
    actorUserId: string,
    medicationId: string,
  ): Promise<MedicationSchedule[]> {
    const validMedicationId = validateUuid(medicationId, "medicationId");

    const medication = await prisma.medication.findUnique({
      where: { id: validMedicationId },
    });

    if (!medication) {
      throw new NotFoundError(`Medication with ID "${medicationId}" not found.`);
    }

    await AccessControlService.assertPatientAccess(actorUserId, medication.patientId, "read");

    return prisma.medicationSchedule.findMany({
      where: {
        medicationId: validMedicationId,
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gt: new Date() } },
        ],
      },
      include: {
        reminder: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a schedule by ID with its parent medication and reminder config.
   */
  static async getScheduleById(
    actorUserId: string,
    scheduleId: string,
  ): Promise<MedicationSchedule> {
    const validId = validateUuid(scheduleId, "scheduleId");

    const schedule = await prisma.medicationSchedule.findUnique({
      where: { id: validId },
      include: {
        reminder: true,
        medication: true,
      },
    });

    if (!schedule) {
      throw new NotFoundError(`Schedule with ID "${scheduleId}" not found.`);
    }

    await AccessControlService.assertPatientAccess(
      actorUserId,
      schedule.medication.patientId,
      "read",
    );

    return schedule;
  }

  /**
   * Updates an existing schedule or its reminder configuration.
   */
  static async updateSchedule(
    actorUserId: string,
    scheduleId: string,
    dto: UpdateScheduleDto,
  ): Promise<MedicationSchedule> {
    const validId = validateUuid(scheduleId, "scheduleId");

    const existing = await prisma.medicationSchedule.findUnique({
      where: { id: validId },
      include: { medication: true, reminder: true },
    });

    if (!existing) {
      throw new NotFoundError(`Schedule with ID "${scheduleId}" not found.`);
    }

    await AccessControlService.assertPatientAccess(
      actorUserId,
      existing.medication.patientId,
      "write",
    );

    const updateData: Prisma.MedicationScheduleUpdateInput = {};

    if (dto.doseLabel !== undefined) {
      updateData.doseLabel = validateNonEmptyString(dto.doseLabel, "doseLabel");
    }
    if (dto.timeZone !== undefined) {
      updateData.timeZone = validateNonEmptyString(dto.timeZone, "timeZone");
    }
    if (dto.timesOfDay !== undefined) {
      updateData.timesOfDay = validateTimesOfDay(dto.timesOfDay);
    }
    if (dto.daysOfWeek !== undefined) {
      updateData.daysOfWeek = validateDaysOfWeek(dto.daysOfWeek);
    }
    if (dto.startDate !== undefined) {
      updateData.startDate = parseDate(dto.startDate, "startDate");
    }
    if (dto.endDate !== undefined) {
      updateData.endDate = parseOptionalDate(dto.endDate, "endDate") ?? null;
    }

    if (dto.reminder) {
      updateData.reminder = {
        upsert: {
          create: {
            reminderOffsetsMin: dto.reminder.reminderOffsetsMin ?? [0, 15],
            lateAfterMin: dto.reminder.lateAfterMin ?? 15,
            caregiverAlertAfterMin: dto.reminder.caregiverAlertAfterMin ?? 30,
            missedAfterMin: dto.reminder.missedAfterMin ?? 120,
            notifyCaregivers: dto.reminder.notifyCaregivers ?? true,
          },
          update: {
            ...(dto.reminder.reminderOffsetsMin ? { reminderOffsetsMin: dto.reminder.reminderOffsetsMin } : {}),
            ...(dto.reminder.lateAfterMin !== undefined ? { lateAfterMin: dto.reminder.lateAfterMin } : {}),
            ...(dto.reminder.caregiverAlertAfterMin !== undefined ? { caregiverAlertAfterMin: dto.reminder.caregiverAlertAfterMin } : {}),
            ...(dto.reminder.missedAfterMin !== undefined ? { missedAfterMin: dto.reminder.missedAfterMin } : {}),
            ...(dto.reminder.notifyCaregivers !== undefined ? { notifyCaregivers: dto.reminder.notifyCaregivers } : {}),
          },
        },
      };
    }

    return prisma.medicationSchedule.update({
      where: { id: validId },
      data: updateData,
      include: {
        reminder: true,
      },
    });
  }

  /**
   * Deactivates a schedule by marking effectiveTo = now.
   */
  static async deleteSchedule(
    actorUserId: string,
    scheduleId: string,
  ): Promise<{ message: string; schedule: MedicationSchedule }> {
    const validId = validateUuid(scheduleId, "scheduleId");

    const existing = await prisma.medicationSchedule.findUnique({
      where: { id: validId },
      include: { medication: true },
    });

    if (!existing) {
      throw new NotFoundError(`Schedule with ID "${scheduleId}" not found.`);
    }

    await AccessControlService.assertPatientAccess(
      actorUserId,
      existing.medication.patientId,
      "write",
    );

    const deactivated = await prisma.medicationSchedule.update({
      where: { id: validId },
      data: { effectiveTo: new Date() },
      include: { reminder: true },
    });

    return {
      message: "Schedule deactivated successfully.",
      schedule: deactivated,
    };
  }
}
