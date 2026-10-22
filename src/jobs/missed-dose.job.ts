import { prisma } from "../db/prisma";
import { emitDoseUpdate } from "../realtime/dose-events";
import { AlertService } from "../services/alert.service";

export interface MissedDoseJobResult {
  runAt: Date;
  missedCount: number;
  processedDoseIds: string[];
  alertsCreatedCount: number;
  repeatedMissesCount?: number;
  lateAlertsCount?: number;
}

export class MissedDoseJobService {
  /**
   * Scans for PENDING scheduled doses whose missedDeadlineAt is in the past (<= referenceTime).
   * Transitions them to MISSED, records an audit DoseEvent, and creates CaregiverAlerts if enabled.
   */
  static async detectAndMarkMissedDoses(
    referenceTime: Date = new Date(),
    batchLimit = 500,
  ): Promise<MissedDoseJobResult> {
    const overdueDoses = await prisma.scheduledDose.findMany({
      where: {
        status: "PENDING",
        missedDeadlineAt: {
          lte: referenceTime,
        },
      },
      include: {
        schedule: {
          include: {
            medication: true,
            reminder: true,
          },
        },
      },
      take: batchLimit,
      orderBy: { missedDeadlineAt: "asc" },
    });

    if (overdueDoses.length === 0) {
      return {
        runAt: referenceTime,
        missedCount: 0,
        processedDoseIds: [],
        alertsCreatedCount: 0,
      };
  
    }

    const processedDoseIds: string[] = [];
    let alertsCreatedCount = 0;
    let repeatedMissesCount = 0;

    for (const dose of overdueDoses) {
      try {
        const processed = await prisma.$transaction(async (tx) => {
          // 1. Mark dose as MISSED (with optimistic concurrency check)
          const updated = await tx.scheduledDose.updateMany({
            where: { id: dose.id, status: "PENDING" },
            data: {
              status: "MISSED",
              resolvedAt: referenceTime,
              resolvedSource: "SYSTEM",
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            return false;
          }

          // 2. Create DoseEvent audit record
          await tx.doseEvent.create({
            data: {
              doseId: dose.id,
              fromStatus: "PENDING",
              toStatus: "MISSED",
              source: "SYSTEM",
              actorUserId: null,
              occurredAt: dose.missedDeadlineAt,
              recordedAt: referenceTime,
              idempotencyKey: `system-missed-${dose.id}`,
              note: `Dose missed: deadline ${dose.missedDeadlineAt.toISOString()} passed without confirmation.`,
            },
          });

          // 3. Generate CaregiverAlert if configured on the reminder
          if (dose.schedule.reminder?.notifyCaregivers) {
            const caregivers = await tx.caregiverAccess.findMany({
              where: {
                patientId: dose.patientId,
                status: "ACTIVE",
                canReceiveAlerts: true,
              },
            });

            for (const caregiver of caregivers) {
              if (!caregiver.caregiverId) {
                continue;
              }
              const dedupeKey = `missed-dose-${dose.id}-${caregiver.caregiverId}`;
              const alert = await tx.caregiverAlert.upsert({
                where: { dedupeKey },
                create: {
                  patientId: dose.patientId,
                  recipientId: caregiver.caregiverId,
                  doseId: dose.id,
                  type: "DOSE_MISSED",
                  status: "OPEN",
                  message: `Missed dose: "${dose.schedule.medication.name}" (${dose.schedule.doseLabel}) scheduled for ${dose.scheduledAt.toISOString()} was not confirmed in time.`,
                  reason: {
                    doseId: dose.id,
                    scheduleId: dose.scheduleId,
                    medicationId: dose.schedule.medicationId,
                    medicationName: dose.schedule.medication.name,
                    doseLabel: dose.schedule.doseLabel,
                    scheduledAt: dose.scheduledAt.toISOString(),
                    missedDeadlineAt: dose.missedDeadlineAt.toISOString(),
                  },
                  dedupeKey,
                },
                update: {},
              });
              alertsCreatedCount++;

              const notifDedupeKey = `alert-notif-${alert.id}-IN_APP`;
              await tx.notification.upsert({
                where: { dedupeKey: notifDedupeKey },
                create: {
                  recipientId: caregiver.caregiverId,
                  patientId: dose.patientId,
                  alertId: alert.id,
                  doseId: dose.id,
                  kind: "CAREGIVER_ALERT",
                  channel: "IN_APP",
                  status: "SCHEDULED",
                  scheduledFor: referenceTime,
                  dedupeKey: notifDedupeKey,
                },
                update: {},
              });
            }
          }

          // 4. Resolve any open DOSE_LATE alert for this dose
          if (typeof tx.caregiverAlert?.updateMany === "function") {
            await tx.caregiverAlert.updateMany({
              where: {
                doseId: dose.id,
                type: "DOSE_LATE",
                status: "OPEN",
              },
              data: {
                status: "RESOLVED",
                resolvedAt: referenceTime,
              },
            });
          }

          // 5. Evaluate repeated misses escalation rule
          const repeatedEscalated = await AlertService.checkRepeatedMissesEscalation(
            tx,
            dose.patientId,
            dose.id,
            referenceTime,
          );
  
          if (repeatedEscalated) {
            repeatedMissesCount++;
          }

          return true;
        });

        if (processed) {
          processedDoseIds.push(dose.id);
          emitDoseUpdate({
            doseId: dose.id,
            patientId: dose.patientId,
            status: "MISSED",
            fromStatus: "PENDING",
            toStatus: "MISSED",
            source: "SYSTEM",
            occurredAt: dose.missedDeadlineAt,
          });
        }
      } catch (err) {
        console.error(`[MissedDoseJob] Failed to process missed dose ${dose.id}:`, err);
      }
    }

    return {
      runAt: referenceTime,
      missedCount: processedDoseIds.length,
      processedDoseIds,
      alertsCreatedCount,
      repeatedMissesCount,
    };

  }

  /**
   * Scans for PENDING scheduled doses that are overdue for caregiver late alert escalation
   * (now >= scheduledAt + caregiverAlertAfterMin) but have not yet passed missedDeadlineAt.
   */
  static async detectAndEscalateLateDoses(
    referenceTime: Date = new Date(),
    batchLimit = 500,
  ): Promise<number> {
    const rawPending = await prisma.scheduledDose.findMany({
      where: {
        status: "PENDING",
        missedDeadlineAt: { gt: referenceTime },
      },
      include: {
        schedule: {
          include: {
            medication: true,
            reminder: true,
          },
        },
      },
      take: batchLimit,
      orderBy: { scheduledAt: "asc" },
    });

    const pendingDoses = Array.isArray(rawPending) ? rawPending : [];
    let lateAlertsCreated = 0;

    for (const dose of pendingDoses) {
      if (!dose.schedule.reminder?.notifyCaregivers) {
        continue;
      }

      const alertAfterMin = dose.schedule.reminder.caregiverAlertAfterMin ?? 30;
      const lateEscalationTime = new Date(
        dose.scheduledAt.getTime() + alertAfterMin * 60 * 1000,
      );

      if (referenceTime >= lateEscalationTime) {
        const rawCaregivers = await prisma.caregiverAccess.findMany({
          where: {
            patientId: dose.patientId,
            status: "ACTIVE",
            canReceiveAlerts: true,
          },
        });

        const caregivers = Array.isArray(rawCaregivers) ? rawCaregivers : [];

        for (const caregiver of caregivers) {
          if (!caregiver.caregiverId) {
            continue;
          }

          const dedupeKey = `late-dose-${dose.id}-${caregiver.caregiverId}`;
          const alert = await prisma.caregiverAlert.upsert({
            where: { dedupeKey },
            create: {
              patientId: dose.patientId,
              recipientId: caregiver.caregiverId,
              doseId: dose.id,
              type: "DOSE_LATE",
              status: "OPEN",
              message: `Late dose: "${dose.schedule.medication.name}" (${dose.schedule.doseLabel}) scheduled for ${dose.scheduledAt.toISOString()} is overdue.`,
              reason: {
                doseId: dose.id,
                scheduleId: dose.scheduleId,
                medicationId: dose.schedule.medicationId,
                medicationName: dose.schedule.medication.name,
                doseLabel: dose.schedule.doseLabel,
                scheduledAt: dose.scheduledAt.toISOString(),
                lateAfterMin: dose.schedule.reminder.lateAfterMin,
                caregiverAlertAfterMin: alertAfterMin,
              },
              dedupeKey,
            },
            update: {},
          });

          const notifDedupeKey = `alert-notif-${alert.id}-IN_APP`;
          await prisma.notification.upsert({
            where: { dedupeKey: notifDedupeKey },
            create: {
              recipientId: caregiver.caregiverId,
              patientId: dose.patientId,
              alertId: alert.id,
              doseId: dose.id,
              kind: "CAREGIVER_ALERT",
              channel: "IN_APP",
              status: "SCHEDULED",
              scheduledFor: referenceTime,
              dedupeKey: notifDedupeKey,
            },
            update: {},
          });

          lateAlertsCreated++;
        }
      }
    }

    return lateAlertsCreated;

  }
}

let missedDoseTimer: NodeJS.Timeout | null = null;

/**
 * Starts a recurring background interval that runs detectAndMarkMissedDoses.
 */
export function startMissedDoseScheduler(intervalMs = 60000): void {
  if (missedDoseTimer) {
    return;
  }

  // Run once on launch
  MissedDoseJobService.detectAndMarkMissedDoses().catch((err) => {
    console.error("[MissedDoseJob] Error during startup detection:", err);
  });
  MissedDoseJobService.detectAndEscalateLateDoses().catch((err) => {
    console.error("[MissedDoseJob] Error during startup late detection:", err);
  });

  missedDoseTimer = setInterval(async () => {
    try {
      const result = await MissedDoseJobService.detectAndMarkMissedDoses();
      if (result.missedCount > 0) {
        console.log(
          `[MissedDoseJob] Detected ${result.missedCount} missed doses. Created ${result.alertsCreatedCount} alerts.`,
        );
      }
      const lateCount = await MissedDoseJobService.detectAndEscalateLateDoses();
      if (lateCount > 0) {
        console.log(`[MissedDoseJob] Escalated ${lateCount} late dose caregiver alerts.`);

      }
    } catch (error) {
      console.error("[MissedDoseJob] Background execution error:", error);
    }
  }, intervalMs);

  if (typeof missedDoseTimer === "object" && missedDoseTimer !== null && "unref" in missedDoseTimer) {
    missedDoseTimer.unref();
  }
}

/**
 * Stops the recurring background missed dose scheduler.
 */
export function stopMissedDoseScheduler(): void {
  if (missedDoseTimer) {
    clearInterval(missedDoseTimer);
    missedDoseTimer = null;
  }
}
