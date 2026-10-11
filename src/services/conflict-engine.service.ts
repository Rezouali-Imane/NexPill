import { prisma } from "../db/prisma";
import type { Severity, WarningKind } from "@prisma/client";

export interface DetectedInteractionWarning {
  id?: string;
  kind: WarningKind;
  severity: Severity;
  message: string;
  medicationId: string;
  otherMedicationId: string;
  otherMedicationName: string;
  interactionId?: string;
}

export class ConflictEngineService {
  /**
   * Scans for drug-drug interactions between a newly added or updated medication
   * and the patient's existing active medications.
   * If any interactions are detected, SafetyWarning records are generated and saved.
   */
  static async checkAndRecordInteractions(
    patientId: string,
    medicationId: string,
    catalogItemId: string | null | undefined,
  ): Promise<DetectedInteractionWarning[]> {
    if (!catalogItemId) {
      return [];
    }

    // Find all other ACTIVE medications for the same patient that have a catalogItemId
    const existingMedications = await prisma.medication.findMany({
      where: {
        patientId,
        status: "ACTIVE",
        id: { not: medicationId },
        catalogItemId: { not: null },
      },
      select: {
        id: true,
        name: true,
        catalogItemId: true,
      },
    });

    if (existingMedications.length === 0) {
      return [];
    }

    const otherCatalogItemIds = existingMedications
      .map((m) => m.catalogItemId)
      .filter((id): id is string => id !== null);

    if (otherCatalogItemIds.length === 0) {
      return [];
    }

    // Query for any interaction pairs between catalogItemId and existing catalog items
    const interactions = await prisma.drugInteraction.findMany({
      where: {
        OR: [
          {
            drugAId: catalogItemId,
            drugBId: { in: otherCatalogItemIds },
          },
          {
            drugBId: catalogItemId,
            drugAId: { in: otherCatalogItemIds },
          },
        ],
      },
      include: {
        drugA: { select: { name: true } },
        drugB: { select: { name: true } },
      },
    });

    const warnings: DetectedInteractionWarning[] = [];

    for (const interaction of interactions) {
      // Determine which of the patient's existing medications matches this interaction
      const conflictingOtherMed = existingMedications.find(
        (m) =>
          m.catalogItemId === interaction.drugAId ||
          m.catalogItemId === interaction.drugBId,
      );

      if (!conflictingOtherMed) {
        continue;
      }

      // Persist the safety warning in the database
      const createdWarning = await prisma.safetyWarning.create({
        data: {
          patientId,
          medicationId,
          otherMedicationId: conflictingOtherMed.id,
          interactionId: interaction.id,
          kind: "INTERACTION",
          severity: interaction.severity,
          message: interaction.description,
        },
      });

      warnings.push({
        id: createdWarning.id,
        kind: createdWarning.kind,
        severity: createdWarning.severity,
        message: createdWarning.message,
        medicationId,
        otherMedicationId: conflictingOtherMed.id,
        otherMedicationName: conflictingOtherMed.name,
        interactionId: interaction.id,
      });
    }

    return warnings;
  }
}
