import type {
  CaregiverAlert,
  NotificationChannel,
  NotificationKind,
  NotificationStatus,
  Prisma,
  DoseStatus,
} from "@prisma/client";
import { prisma } from "../db/prisma";
import { BadRequestError, NotFoundError } from "../errors";
import {
  parseDate,
  validateNonEmptyString,
  validateUuid,
} from "../utils/validation";

export interface ScheduleRemindersResult {
  scheduledCount: number;
  notificationIds: string[];
}

export interface ScheduleRemindersDoseInput {
  id: string;
  patientId: string;
  scheduledAt: Date;
  status: DoseStatus | string;
  schedule?: {
    reminder?: {
      reminderOffsetsMin?: number[];
      lateAfterMin?: number;
    } | null;
  } | null;
}

export interface DispatchDueNotificationsResult {
  runAt: Date;
  processedCount: number;
  deliveredCount: number;
  cancelledCount: number;
  failedCount: number;
}

export interface ListNotificationsQuery {
  status?: NotificationStatus;
  kind?: NotificationKind;
  channel?: NotificationChannel;
  doseId?: string;
  startDate?: string | Date;
  endDate?: string | Date;
}

export interface RegisterEndpointDto {
  channel: NotificationChannel;
  address: string;
}

export class NotificationService {
  /**
   * Generates scheduled reminder notifications for a dose based on reminder offsets
   * and follow-up thresholds. Uses unique dedupeKey to ensure idempotency and prevent duplicates.
   */
  static async scheduleDoseReminders(
    doseOrId: string | ScheduleRemindersDoseInput,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<ScheduleRemindersResult> {
    let dose: ScheduleRemindersDoseInput | null;

    if (typeof doseOrId === "string") {
      const validDoseId = validateUuid(doseOrId, "doseId");

      dose = await client.scheduledDose.findUnique({
        where: { id: validDoseId },
        include: {
          schedule: {
            include: {
              reminder: true,
              medication: true,
            },
          },
        },
      });

      if (!dose) {
        throw new NotFoundError(`Scheduled dose with ID "${doseOrId}" not found.`);
      }
    } else {
      dose = doseOrId;
    }

    // Do not schedule reminders if dose is already resolved or cancelled
    if (dose.status !== "PENDING") {
      return { scheduledCount: 0, notificationIds: [] };
    }

    const reminder = dose.schedule?.reminder;
    const offsetsMin = reminder?.reminderOffsetsMin ?? [0, 15];
    const lateAfterMin = reminder?.lateAfterMin ?? 15;

    // Retrieve recipient's active notification endpoints or default to IN_APP & PUSH
    const endpoints = await client.notificationEndpoint.findMany({
      where: {
        userId: dose.patientId,
        enabled: true,
      },
    });

    const channels: NotificationChannel[] =
      endpoints.length > 0
        ? Array.from(new Set(endpoints.map((e) => e.channel)))
        : ["IN_APP", "PUSH"];

    const notificationIds: string[] = [];

    for (const channel of channels) {
      // 1. Advance & on-time reminders (e.g. 15 min before, and at dose time 0 min)
      for (const offset of offsetsMin) {
        const scheduledFor = new Date(
          dose.scheduledAt.getTime() - offset * 60 * 1000,
        );

        // Deduplication key guarantees duplicate-prevention across re-runs
        const dedupeKey = `dose-reminder-${dose.id}-${channel}-${offset}`;

        const notif = await client.notification.upsert({
          where: { dedupeKey },
          create: {
            recipientId: dose.patientId,
            patientId: dose.patientId,
            doseId: dose.id,
            kind: "DOSE_REMINDER",
            channel,
            status: "SCHEDULED",
            scheduledFor,
            dedupeKey,
          },
          update: {},
        });

        notificationIds.push(notif.id);
      }

      // 2. Follow-up reminder if dose becomes late
      if (lateAfterMin > 0) {
        const followUpTime = new Date(
          dose.scheduledAt.getTime() + lateAfterMin * 60 * 1000,
        );
        const followUpDedupeKey = `dose-followup-${dose.id}-${channel}-${lateAfterMin}`;

        const followUpNotif = await client.notification.upsert({
          where: { dedupeKey: followUpDedupeKey },
          create: {
            recipientId: dose.patientId,
            patientId: dose.patientId,
            doseId: dose.id,
            kind: "DOSE_REMINDER_FOLLOWUP",
            channel,
            status: "SCHEDULED",
            scheduledFor: followUpTime,
            dedupeKey: followUpDedupeKey,
          },
          update: {},
        });

        notificationIds.push(followUpNotif.id);
      }
    }

    return {
      scheduledCount: notificationIds.length,
      notificationIds,
    };
  }

  /**
   * Dispatches a notification for an urgent CaregiverAlert.
   */
  static async scheduleCaregiverAlertNotification(
    alert: CaregiverAlert,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    const endpoints = await client.notificationEndpoint.findMany({
      where: {
        userId: alert.recipientId,
        enabled: true,
      },
    });

    const channels: NotificationChannel[] =
      endpoints.length > 0
        ? Array.from(new Set(endpoints.map((e) => e.channel)))
        : ["IN_APP", "PUSH"];

    const createdNotifications = [];

    for (const channel of channels) {
      const dedupeKey = `alert-notif-${alert.id}-${channel}`;

      const notif = await client.notification.upsert({
        where: { dedupeKey },
        create: {
          recipientId: alert.recipientId,
          patientId: alert.patientId,
          alertId: alert.id,
          doseId: alert.doseId,
          kind: "CAREGIVER_ALERT",
          channel,
          status: "SCHEDULED",
          scheduledFor: new Date(), // Immediate dispatch
          dedupeKey,
        },
        update: {},
      });

      createdNotifications.push(notif);
    }

    return createdNotifications;
  }

  /**
   * Event Handler: Cancels all pending SCHEDULED reminders for a dose when resolved
   * (e.g. taken, skipped, unable to take, or cancelled) to prevent stale notifications.
   */
  static async cancelPendingDoseReminders(
    doseId: string,
    reason = "Dose has been resolved or cancelled.",
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<number> {
    const validDoseId = validateUuid(doseId, "doseId");

    const result = await client.notification.updateMany({
      where: {
        doseId: validDoseId,
        status: "SCHEDULED",
      },
      data: {
        status: "CANCELLED",
        lastError: reason,
      },
    });

    return result.count;
  }

  /**
   * Backend Notification-Event Dispatcher:
   * Scans for SCHEDULED notifications whose scheduledFor <= referenceTime,
   * verifies dose state, and transitions them to DELIVERED/SENT or CANCELLED.
   */
  static async dispatchDueNotifications(
    referenceTime: Date = new Date(),
    batchLimit = 100,
  ): Promise<DispatchDueNotificationsResult> {
    const dueNotifications = await prisma.notification.findMany({
      where: {
        status: "SCHEDULED",
        scheduledFor: {
          lte: referenceTime,
        },
      },
      include: {
        dose: true,
        alert: true,
      },
      take: batchLimit,
      orderBy: { scheduledFor: "asc" },
    });

    if (dueNotifications.length === 0) {
      return {
        runAt: referenceTime,
        processedCount: 0,
        deliveredCount: 0,
        cancelledCount: 0,
        failedCount: 0,
      };
    }

    let deliveredCount = 0;
    let cancelledCount = 0;
    let failedCount = 0;

    for (const notif of dueNotifications) {
      try {
        // If it's a dose reminder and the dose is no longer PENDING, cancel it
        if (notif.dose && notif.dose.status !== "PENDING") {
          await prisma.notification.update({
            where: { id: notif.id },
            data: {
              status: "CANCELLED",
              lastError: `Dose is already in status ${notif.dose.status}.`,
            },
          });
          cancelledCount++;
          continue;
        }

        // Transition through SENDING -> DELIVERED
        await prisma.notification.update({
          where: { id: notif.id },
          data: {
            status: "DELIVERED",
            sentAt: referenceTime,
            deliveredAt: referenceTime,
            attemptCount: { increment: 1 },
          },
        });

        deliveredCount++;
      } catch (err: unknown) {
        failedCount++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.notification.update({
          where: { id: notif.id },
          data: {
            status: "FAILED",
            attemptCount: { increment: 1 },
            lastError: errorMessage,
            nextRetryAt: new Date(referenceTime.getTime() + 5 * 60 * 1000), // Retry in 5 minutes
          },
        });
      }
    }

    return {
      runAt: referenceTime,
      processedCount: dueNotifications.length,
      deliveredCount,
      cancelledCount,
      failedCount,
    };
  }

  /**
   * Retrieves notifications for the authenticated user as recipient.
   */
  static async listNotifications(
    actorUserId: string,
    query: ListNotificationsQuery,
  ) {
    const where: Prisma.NotificationWhereInput = {
      recipientId: actorUserId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.kind) {
      where.kind = query.kind;
    }

    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.doseId) {
      where.doseId = validateUuid(query.doseId, "doseId");
    }

    if (query.startDate || query.endDate) {
      where.scheduledFor = {};
      if (query.startDate) {
        where.scheduledFor.gte = parseDate(query.startDate, "startDate");
      }
      if (query.endDate) {
        where.scheduledFor.lte = parseDate(query.endDate, "endDate");
      }
    }

    return prisma.notification.findMany({
      where,
      include: {
        dose: {
          include: {
            schedule: {
              include: {
                medication: true,
              },
            },
          },
        },
        alert: true,
      },
      orderBy: { scheduledFor: "desc" },
    });
  }

  /**
   * Marks a notification as DELIVERED by the client (e.g. mobile push receipt or in-app read).
   */
  static async markDelivered(actorUserId: string, notificationId: string) {
    const validId = validateUuid(notificationId, "notificationId");

    const notif = await prisma.notification.findUnique({
      where: { id: validId },
    });

    if (!notif) {
      throw new NotFoundError(`Notification with ID "${notificationId}" not found.`);
    }

    if (notif.recipientId !== actorUserId) {
      throw new NotFoundError(`Notification with ID "${notificationId}" not found.`);
    }

    return prisma.notification.update({
      where: { id: validId },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
      },
    });
  }

  /**
   * Lists registered notification endpoints (channels & addresses) for the user.
   */
  static async listEndpoints(userId: string) {
    return prisma.notificationEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Registers or updates a notification endpoint (e.g. push token, email address).
   */
  static async registerEndpoint(userId: string, dto: RegisterEndpointDto) {
    const address = validateNonEmptyString(dto.address, "address");
    const validChannels: NotificationChannel[] = ["IN_APP", "PUSH", "EMAIL", "SMS"];

    if (!validChannels.includes(dto.channel)) {
      throw new BadRequestError(
        `Invalid channel "${dto.channel}". Must be one of: ${validChannels.join(", ")}`,
      );
    }

    return prisma.notificationEndpoint.upsert({
      where: {
        userId_channel_address: {
          userId,
          channel: dto.channel,
          address,
        },
      },
      create: {
        userId,
        channel: dto.channel,
        address,
        enabled: true,
      },
      update: {
        enabled: true,
      },
    });
  }
}
