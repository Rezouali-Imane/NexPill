import type {
  AlertStatus,
  AlertType,
  Prisma,
} from "@prisma/client";
import { prisma } from "../db/prisma";
import { ForbiddenError, NotFoundError } from "../errors";
import { validateUuid } from "../utils/validation";
import { AccessControlService } from "./access-control.service";
import { emitAlertCreated } from "../realtime/dose-events";

export interface ListAlertsQuery {
  patientId?: string;
  status?: AlertStatus;
  type?: AlertType;
  startDate?: string | Date;
  endDate?: string | Date;
}

export interface EscalationResult {
  alertsCreated: number;
  repeatedMissesCreated: number;
  lateAlertsCreated: number;
}

export class AlertService {
  /**
   * Retrieves caregiver alerts accessible to the actor (as recipient, patient, or admin).
   */
  static async listAlerts(actorUserId: string, query: ListAlertsQuery = {}) {
    const actor = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { platformRole: true, disabledAt: true },
    });

    if (!actor || actor.disabledAt) {
      throw new ForbiddenError("Your account is not allowed to access this resource.");
    }

    const where: Prisma.CaregiverAlertWhereInput = {};

    if (query.patientId) {
      const patientId = validateUuid(query.patientId, "patientId");
      await AccessControlService.assertPatientAccess(actorUserId, patientId, "read");
      where.patientId = patientId;

      if (actor.platformRole !== "ADMIN" && actorUserId !== patientId) {
        where.recipientId = actorUserId;
      }
    } else if (actor.platformRole !== "ADMIN") {
      // Non-admins see alerts where they are recipient or patient
      where.OR = [
        { recipientId: actorUserId },
        { patientId: actorUserId },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    return prisma.caregiverAlert.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { displayName: true },
            },
          },
        },
        dose: {
          include: {
            schedule: {
              include: {
                medication: {
                  select: { id: true, name: true, dosageText: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Fetches a single alert by ID, asserting authorization.
   */
  static async getAlertById(actorUserId: string, alertId: string) {
    const validAlertId = validateUuid(alertId, "alertId");

    const alert = await prisma.caregiverAlert.findUnique({
      where: { id: validAlertId },
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { displayName: true },
            },
          },
        },
        recipient: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
        dose: {
          include: {
            schedule: {
              include: {
                medication: true,
                reminder: true,
              },
            },
            events: {
              orderBy: { recordedAt: "desc" },
              take: 5,
            },
          },
        },
        notifications: true,
      },
    });

    if (!alert) {
      throw new NotFoundError(`Caregiver alert with ID "${alertId}" not found.`);
    }

    const actor = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { platformRole: true, disabledAt: true },
    });

    if (!actor || actor.disabledAt) {
      throw new ForbiddenError("Your account is not allowed to access this resource.");
    }

    const isRecipient = alert.recipientId === actorUserId;
    const isPatient = alert.patientId === actorUserId;
    const isAdmin = actor.platformRole === "ADMIN";

    if (!isRecipient && !isPatient && !isAdmin) {
      throw new ForbiddenError("You do not have permission to view this alert.");
    }

    return alert;
  }

  /**
   * Acknowledges an alert, transitioning status from OPEN to ACKNOWLEDGED.
   */
  static async acknowledgeAlert(actorUserId: string, alertId: string) {
    const alert = await this.getAlertById(actorUserId, alertId);

    if (alert.status !== "OPEN") {
      return alert; // Idempotent if already acknowledged or resolved
    }

    return prisma.caregiverAlert.update({
      where: { id: alert.id },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
      },
      include: {
        patient: { select: { id: true, email: true } },
        dose: true,
      },
    });
  }

  /**
   * Resolves an alert, transitioning status to RESOLVED.
   */
  static async resolveAlert(actorUserId: string, alertId: string) {
    const alert = await this.getAlertById(actorUserId, alertId);

    if (alert.status === "RESOLVED") {
      return alert; // Idempotent
    }

    return prisma.caregiverAlert.update({
      where: { id: alert.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
      include: {
        patient: { select: { id: true, email: true } },
        dose: true,
      },
    });
  }

  /**
   * Computes an alert summary (counts by status and alert type).
   */
  static async getSummary(actorUserId: string, patientId?: string) {
    const alerts = await this.listAlerts(actorUserId, { patientId });

    return {
      total: alerts.length,
      open: alerts.filter((a) => a.status === "OPEN").length,
      acknowledged: alerts.filter((a) => a.status === "ACKNOWLEDGED").length,
      resolved: alerts.filter((a) => a.status === "RESOLVED").length,
      byType: {
        doseLate: alerts.filter((a) => a.type === "DOSE_LATE").length,
        doseMissed: alerts.filter((a) => a.type === "DOSE_MISSED").length,
        repeatedMisses: alerts.filter((a) => a.type === "REPEATED_MISSES").length,
        safetyWarning: alerts.filter((a) => a.type === "SAFETY_WARNING").length,
        riskHigh: alerts.filter((a) => a.type === "RISK_HIGH").length,
      },
    };
  }

  /**
   * Escalation Engine: Evaluates repeated-misses escalation rules when a dose is missed.
   * If a patient has 2 or more consecutive missed doses, generates a REPEATED_MISSES alert.
   */
  static async checkRepeatedMissesEscalation(
    client: Prisma.TransactionClient | typeof prisma,
    patientId: string,
    currentMissedDoseId: string,
    referenceTime: Date = new Date(),
  ): Promise<boolean> {
    // Look up recent past doses for this patient
    const rawRecent = await client.scheduledDose.findMany({
      where: {
        patientId,
        scheduledAt: { lte: referenceTime },
        status: { in: ["MISSED", "TAKEN", "SKIPPED", "UNABLE_TO_TAKE"] },
      },
      orderBy: { scheduledAt: "desc" },
      take: 5,
      include: {
        schedule: {
          include: {
            medication: true,
          },
        },
      },
    });

    const recentDoses = Array.isArray(rawRecent) ? rawRecent : [];

    // Count consecutive missed doses from the most recent
    let consecutiveMissed = 0;
    for (const dose of recentDoses) {
      if (dose.status === "MISSED") {
        consecutiveMissed++;
      } else {
        break; // Sequence broken
      }
    }

    if (consecutiveMissed < 2) {
      return false; // Threshold not met
    }

    // Get active caregivers configured to receive alerts
    const caregivers = await client.caregiverAccess.findMany({
      where: {
        patientId,
        status: "ACTIVE",
        canReceiveAlerts: true,
      },
    });

    for (const caregiver of caregivers) {
      if (!caregiver.caregiverId) {
        continue;
      }

      const dedupeKey = `repeated-misses-${patientId}-${currentMissedDoseId}-${caregiver.caregiverId}`;
      const alert = await client.caregiverAlert.upsert({
        where: { dedupeKey },
        create: {
          patientId,
          recipientId: caregiver.caregiverId,
          doseId: currentMissedDoseId,
          type: "REPEATED_MISSES",
          status: "OPEN",
          message: `Escalation: Patient has missed ${consecutiveMissed} consecutive doses. Immediate caregiver attention recommended.`,
          reason: {
            patientId,
            consecutiveMissed,
            currentMissedDoseId,
            escalationLevel: "HIGH",
            evaluatedAt: referenceTime.toISOString(),
          },
          dedupeKey,
        },
        update: {},
      });

      emitAlertCreated({
        alertId: alert.id,
        patientId,
        recipientId: caregiver.caregiverId,
        type: "REPEATED_MISSES",
        message: alert.message,
        status: alert.status,
        timestamp: (alert.createdAt ?? referenceTime).toISOString(),
      });

      const notifDedupeKey = `alert-notif-${alert.id}-IN_APP`;
      await client.notification.upsert({
        where: { dedupeKey: notifDedupeKey },
        create: {
          recipientId: caregiver.caregiverId,
          patientId,
          alertId: alert.id,
          doseId: currentMissedDoseId,
          kind: "CAREGIVER_ALERT",
          channel: "IN_APP",
          status: "SCHEDULED",
          scheduledFor: referenceTime,
          dedupeKey: notifDedupeKey,
        },
        update: {},
      });
    }

    return true;
  }
}
