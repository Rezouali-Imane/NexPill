import { prisma } from "../db/prisma";
import { NotFoundError, BadRequestError } from "../errors";
import {
  validateUuid,
  validateOptionalUuid,
  validateNonEmptyString,
  validateOptionalString,
  parseOptionalDate,
} from "../utils/validation";
import { AccessControlService } from "./access-control.service";
import { ConflictEngineService, type DetectedInteractionWarning } from "./conflict-engine.service";
import type { Medication, MedicationStatus, Prisma } from "@prisma/client";

export interface CreateMedicationDto {
  patientId?: string;
  name: string;
  dosageText: string;
  catalogItemId?: string | null;
  form?: string | null;
  route?: string | null;
  instructions?: string | null;
  prescriber?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  status?: MedicationStatus;
}

export interface UpdateMedicationDto {
  name?: string;
  dosageText?: string;
  catalogItemId?: string | null;
  form?: string | null;
  route?: string | null;
  instructions?: string | null;
  prescriber?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  status?: MedicationStatus;
}

export interface ListMedicationsOptions {
  patientId?: string;
  status?: string;
  includeSchedules?: boolean;
}

export class MedicationService {
  /**
   * Creates a new medication for the patient, enforcing permissions and scanning for drug conflicts.
   */
  static async createMedication(
    actorUserId: string,
    dto: CreateMedicationDto,
  ): Promise<{ medication: Medication; warnings: DetectedInteractionWarning[] }> {
    const targetPatientId = dto.patientId
      ? validateUuid(dto.patientId, "patientId")
      : actorUserId;

    // Check permission: Actor must be patient or authorized caregiver with canManageMedications
    await AccessControlService.assertPatientAccess(actorUserId, targetPatientId, "write");

    const name = validateNonEmptyString(dto.name, "name");
    const dosageText = validateNonEmptyString(dto.dosageText, "dosageText");
    const catalogItemId = validateOptionalUuid(dto.catalogItemId, "catalogItemId");
    const form = validateOptionalString(dto.form);
    const route = validateOptionalString(dto.route);
    const instructions = validateOptionalString(dto.instructions);
    const prescriber = validateOptionalString(dto.prescriber);
    const startDate = parseOptionalDate(dto.startDate, "startDate");
    const endDate = parseOptionalDate(dto.endDate, "endDate");

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestError("startDate cannot be later than endDate.");
    }

    const medication = await prisma.medication.create({
      data: {
        patientId: targetPatientId,
        catalogItemId: catalogItemId ?? null,
        name,
        dosageText,
        form: form ?? null,
        route: route ?? null,
        instructions: instructions ?? null,
        prescriber: prescriber ?? null,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        status: dto.status ?? "ACTIVE",
      },
      include: {
        catalogItem: true,
      },
    });

    // Run Conflict Engine if linked to drug catalog
    const warnings = await ConflictEngineService.checkAndRecordInteractions(
      targetPatientId,
      medication.id,
      medication.catalogItemId,
    );

    return { medication, warnings };
  }

  /**
   * Retrieves medications for a patient, optionally filtering by status and including schedules.
   */
  static async listMedications(
    actorUserId: string,
    options: ListMedicationsOptions,
  ): Promise<Medication[]> {
    const targetPatientId = options.patientId
      ? validateUuid(options.patientId, "patientId")
      : actorUserId;

    await AccessControlService.assertPatientAccess(actorUserId, targetPatientId, "read");

    const where: Prisma.MedicationWhereInput = {
      patientId: targetPatientId,
    };

    const statusParam = options.status?.toUpperCase();
    if (statusParam === "ACTIVE" || statusParam === "INACTIVE") {
      where.status = statusParam;
    } else if (statusParam !== "ALL") {
      where.status = "ACTIVE"; // Default filter to active medications
    }

    return prisma.medication.findMany({
      where,
      include: {
        catalogItem: true,
        ...(options.includeSchedules
          ? {
              schedules: {
                where: {
                  OR: [
                    { effectiveTo: null },
                    { effectiveTo: { gt: new Date() } },
                  ],
                },
                include: { reminder: true },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a single medication by ID, including its catalog item, schedules, and active warnings.
   */
  static async getMedicationById(
    actorUserId: string,
    medicationId: string,
  ): Promise<Medication> {
    const validId = validateUuid(medicationId, "medicationId");

    const medication = await prisma.medication.findUnique({
      where: { id: validId },
      include: {
        catalogItem: true,
        schedules: {
          include: { reminder: true },
          orderBy: { createdAt: "desc" },
        },
        warnings: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!medication) {
      throw new NotFoundError(`Medication with ID "${medicationId}" not found.`);
    }

    await AccessControlService.assertPatientAccess(actorUserId, medication.patientId, "read");

    return medication;
  }

  /**
   * Updates an existing medication and re-evaluates drug conflict warnings if catalog item changes.
   */
  static async updateMedication(
    actorUserId: string,
    medicationId: string,
    dto: UpdateMedicationDto,
  ): Promise<{ medication: Medication; warnings: DetectedInteractionWarning[] }> {
    const validId = validateUuid(medicationId, "medicationId");

    const existing = await prisma.medication.findUnique({
      where: { id: validId },
    });

    if (!existing) {
      throw new NotFoundError(`Medication with ID "${medicationId}" not found.`);
    }

    await AccessControlService.assertPatientAccess(actorUserId, existing.patientId, "write");

    const data: Prisma.MedicationUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = validateNonEmptyString(dto.name, "name");
    }
    if (dto.dosageText !== undefined) {
      data.dosageText = validateNonEmptyString(dto.dosageText, "dosageText");
    }
    if (dto.catalogItemId !== undefined) {
      data.catalogItem = dto.catalogItemId
        ? { connect: { id: validateUuid(dto.catalogItemId, "catalogItemId") } }
        : { disconnect: true };
    }
    if (dto.form !== undefined) {
      data.form = validateOptionalString(dto.form) ?? null;
    }
    if (dto.route !== undefined) {
      data.route = validateOptionalString(dto.route) ?? null;
    }
    if (dto.instructions !== undefined) {
      data.instructions = validateOptionalString(dto.instructions) ?? null;
    }
    if (dto.prescriber !== undefined) {
      data.prescriber = validateOptionalString(dto.prescriber) ?? null;
    }
    if (dto.startDate !== undefined) {
      data.startDate = parseOptionalDate(dto.startDate, "startDate") ?? null;
    }
    if (dto.endDate !== undefined) {
      data.endDate = parseOptionalDate(dto.endDate, "endDate") ?? null;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    // Verify dates if both are modified or one is modified against existing
    const finalStartDate =
      data.startDate !== undefined ? (data.startDate as Date | null) : existing.startDate;
    const finalEndDate =
      data.endDate !== undefined ? (data.endDate as Date | null) : existing.endDate;

    if (finalStartDate && finalEndDate && finalStartDate > finalEndDate) {
      throw new BadRequestError("startDate cannot be later than endDate.");
    }

    const updatedMedication = await prisma.medication.update({
      where: { id: validId },
      data,
      include: {
        catalogItem: true,
      },
    });

    let warnings: DetectedInteractionWarning[] = [];
    if (
      dto.catalogItemId !== undefined ||
      (dto.status === "ACTIVE" && existing.status === "INACTIVE")
    ) {
      warnings = await ConflictEngineService.checkAndRecordInteractions(
        existing.patientId,
        validId,
        updatedMedication.catalogItemId,
      );
    }

    return { medication: updatedMedication, warnings };
  }

  /**
   * Deactivates (soft deletes) or permanently removes a medication.
   */
  static async deleteMedication(
    actorUserId: string,
    medicationId: string,
    hardDelete = false,
  ): Promise<{ message: string; medication?: Medication }> {
    const validId = validateUuid(medicationId, "medicationId");

    const existing = await prisma.medication.findUnique({
      where: { id: validId },
    });

    if (!existing) {
      throw new NotFoundError(`Medication with ID "${medicationId}" not found.`);
    }

    await AccessControlService.assertPatientAccess(actorUserId, existing.patientId, "write");

    if (hardDelete) {
      await prisma.medication.delete({
        where: { id: validId },
      });
      return { message: "Medication permanently removed." };
    }

    const deactivated = await prisma.medication.update({
      where: { id: validId },
      data: { status: "INACTIVE" },
    });

    return {
      message: "Medication deactivated successfully.",
      medication: deactivated,
    };
  }
}
