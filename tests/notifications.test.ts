import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Hoisted mocks for Vitest
const { mockGetUser, mockPrisma } = vi.hoisted(() => {
  return {
    mockGetUser: vi.fn(),
    mockPrisma: {
      user: {
        findUnique: vi.fn(),
      },
      scheduledDose: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      notificationEndpoint: {
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
      notification: {
        upsert: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      caregiverAlert: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("../src/config/supabase", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

vi.mock("../src/db/prisma", () => ({
  prisma: mockPrisma,
}));

import type { Prisma } from "@prisma/client";
import { app } from "../src/app";
import { NotificationService } from "../src/services/notification.service";
import {
  startNotificationDispatcher,
  stopNotificationDispatcher,
} from "../src/jobs/notification.job";

describe("Reminder Scheduling & Notification Event Flow", () => {
  const patientId = "11111111-1111-4111-a111-111111111111";
  const caregiverId = "22222222-2222-4222-a222-222222222222";
  const doseId = "33333333-3333-4333-a333-333333333333";
  const scheduleId = "44444444-4444-4444-a444-444444444444";
  const notificationId = "55555555-5555-4555-a555-555555555555";

  const scheduledAt = new Date("2026-10-19T08:00:00.000Z");

  const sampleDose = {
    id: doseId,
    scheduleId,
    patientId,
    scheduledAt,
    localDate: new Date("2026-10-19T00:00:00.000Z"),
    timeZone: "UTC",
    lateAfterAt: new Date("2026-10-19T08:15:00.000Z"),
    missedDeadlineAt: new Date("2026-10-19T10:00:00.000Z"),
    status: "PENDING",
    version: 0,
    schedule: {
      id: scheduleId,
      medicationId: "med-1",
      doseLabel: "Morning Dose",
      medication: {
        id: "med-1",
        name: "Lisinopril",
        patientId,
      },
      reminder: {
        reminderOffsetsMin: [15, 0], // 15 min before, and at dose time
        lateAfterMin: 15, // Follow-up 15 min after if late
        caregiverAlertAfterMin: 30,
        missedAfterMin: 120,
        notifyCaregivers: true,
      },
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    stopNotificationDispatcher();

    mockPrisma.user.findUnique.mockResolvedValue({
      platformRole: "USER",
      disabledAt: null,
    });

    mockPrisma.$transaction.mockImplementation(
      async (callback: (client: typeof mockPrisma) => unknown) => {
        return callback(mockPrisma);
      },
    );
  });

  const authenticateAs = (userId: string, email = "user@nexpill.test") => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: userId, email } },
      error: null,
    });
  };

  describe("Reminder Timing", () => {
    it("schedules advance, on-time, and follow-up reminders with exact timestamps", async () => {
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce(sampleDose);
      mockPrisma.notificationEndpoint.findMany.mockResolvedValueOnce([
        { channel: "PUSH", enabled: true, address: "device-token-123" },
      ]);

      const capturedUpserts: Prisma.NotificationUpsertArgs[] = [];
      mockPrisma.notification.upsert.mockImplementation(
        (args: Prisma.NotificationUpsertArgs) => {
          capturedUpserts.push(args);
          return Promise.resolve({ id: `notif-${capturedUpserts.length}` });
        },
      );

      const result = await NotificationService.scheduleDoseReminders(doseId);

      // Expect 3 notifications: 15 min prior, 0 min on-time, 15 min follow-up
      expect(result.scheduledCount).toBe(3);

      // 1. Advance reminder: 07:45 UTC (8:00 - 15 min)
      const advance = capturedUpserts.find(
        (u) => u.where.dedupeKey === `dose-reminder-${doseId}-PUSH-15`,
      );
      expect(advance).toBeDefined();
      expect(advance?.create.scheduledFor).toEqual(
        new Date("2026-10-19T07:45:00.000Z"),
      );
      expect(advance?.create.kind).toBe("DOSE_REMINDER");
      expect(advance?.create.channel).toBe("PUSH");
      expect(advance?.create.status).toBe("SCHEDULED");

      // 2. On-time reminder: 08:00 UTC (8:00 - 0 min)
      const onTime = capturedUpserts.find(
        (u) => u.where.dedupeKey === `dose-reminder-${doseId}-PUSH-0`,
      );
      expect(onTime).toBeDefined();
      expect(onTime?.create.scheduledFor).toEqual(
        new Date("2026-10-19T08:00:00.000Z"),
      );
      expect(onTime?.create.kind).toBe("DOSE_REMINDER");

      // 3. Late follow-up reminder: 08:15 UTC (8:00 + 15 min lateAfterMin)
      const followUp = capturedUpserts.find(
        (u) => u.where.dedupeKey === `dose-followup-${doseId}-PUSH-15`,
      );
      expect(followUp).toBeDefined();
      expect(followUp?.create.scheduledFor).toEqual(
        new Date("2026-10-19T08:15:00.000Z"),
      );
      expect(followUp?.create.kind).toBe("DOSE_REMINDER_FOLLOWUP");
    });
  });

  describe("Duplicate-Notification Prevention", () => {
    it("guarantees idempotency via deterministic dedupeKey across repeated calls", async () => {
      mockPrisma.scheduledDose.findUnique.mockResolvedValue(sampleDose);
      mockPrisma.notificationEndpoint.findMany.mockResolvedValue([
        { channel: "IN_APP", enabled: true, address: "in-app" },
      ]);

      const dedupeKeysFirstRun: string[] = [];
      const dedupeKeysSecondRun: string[] = [];

      mockPrisma.notification.upsert.mockImplementation(
        (args: Prisma.NotificationUpsertArgs) => {
          dedupeKeysFirstRun.push(args.where.dedupeKey as string);
          return Promise.resolve({ id: "notif-id", ...args.create });
        },
      );

      // First run
      await NotificationService.scheduleDoseReminders(doseId);

      mockPrisma.notification.upsert.mockImplementation(
        (args: Prisma.NotificationUpsertArgs) => {
          dedupeKeysSecondRun.push(args.where.dedupeKey as string);
          return Promise.resolve({ id: "notif-id", ...args.create });
        },
      );

      // Second run for identical dose
      await NotificationService.scheduleDoseReminders(doseId);

      // Verify that dedupe keys match exactly across runs
      expect(dedupeKeysFirstRun).toEqual(dedupeKeysSecondRun);
      expect(dedupeKeysFirstRun).toContain(
        `dose-reminder-${doseId}-IN_APP-15`,
      );
      expect(dedupeKeysFirstRun).toContain(
        `dose-reminder-${doseId}-IN_APP-0`,
      );
      expect(dedupeKeysFirstRun).toContain(
        `dose-followup-${doseId}-IN_APP-15`,
      );

      // Upsert update block is empty ({}), ensuring existing notification is never duplicated
      expect(mockPrisma.notification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dedupeKey: `dose-reminder-${doseId}-IN_APP-0`,
          }),
          update: {},
        }),
      );
    });
  });

  describe("Notification-Event Flow", () => {
    it("dispatches due SCHEDULED notifications and transitions them to DELIVERED", async () => {
      const referenceTime = new Date("2026-10-19T08:01:00.000Z");

      const dueNotification = {
        id: notificationId,
        recipientId: patientId,
        patientId,
        doseId,
        kind: "DOSE_REMINDER",
        channel: "PUSH",
        status: "SCHEDULED",
        scheduledFor: new Date("2026-10-19T08:00:00.000Z"),
        attemptCount: 0,
        dose: {
          id: doseId,
          status: "PENDING",
        },
      };

      mockPrisma.notification.findMany.mockResolvedValueOnce([dueNotification]);
      mockPrisma.notification.update.mockResolvedValueOnce({
        ...dueNotification,
        status: "DELIVERED",
        deliveredAt: referenceTime,
      });

      const result = await NotificationService.dispatchDueNotifications(referenceTime);

      expect(result.processedCount).toBe(1);
      expect(result.deliveredCount).toBe(1);
      expect(result.cancelledCount).toBe(0);

      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: notificationId },
          data: expect.objectContaining({
            status: "DELIVERED",
            sentAt: referenceTime,
            deliveredAt: referenceTime,
          }),
        }),
      );
    });

    it("cancels due reminders if the dose was already resolved as TAKEN", async () => {
      const referenceTime = new Date("2026-10-19T08:01:00.000Z");

      const dueNotificationForTakenDose = {
        id: notificationId,
        recipientId: patientId,
        patientId,
        doseId,
        kind: "DOSE_REMINDER",
        channel: "PUSH",
        status: "SCHEDULED",
        scheduledFor: new Date("2026-10-19T08:00:00.000Z"),
        dose: {
          id: doseId,
          status: "TAKEN", // Already taken!
        },
      };

      mockPrisma.notification.findMany.mockResolvedValueOnce([
        dueNotificationForTakenDose,
      ]);
      mockPrisma.notification.update.mockResolvedValueOnce({});

      const result = await NotificationService.dispatchDueNotifications(referenceTime);

      expect(result.deliveredCount).toBe(0);
      expect(result.cancelledCount).toBe(1);

      // Must cancel the notification instead of delivering
      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: notificationId },
          data: expect.objectContaining({
            status: "CANCELLED",
            lastError: expect.stringContaining("TAKEN"),
          }),
        }),
      );
    });

    it("delivers CAREGIVER_ALERT notifications even if the linked dose is MISSED", async () => {
      const referenceTime = new Date("2026-10-19T10:05:00.000Z");

      const caregiverAlertNotification = {
        id: "alert-notif-1",
        recipientId: caregiverId,
        patientId,
        doseId,
        kind: "CAREGIVER_ALERT",
        channel: "IN_APP",
        status: "SCHEDULED",
        scheduledFor: new Date("2026-10-19T10:00:00.000Z"),
        dose: {
          id: doseId,
          status: "MISSED",
        },
      };

      mockPrisma.notification.findMany.mockResolvedValueOnce([caregiverAlertNotification]);
      mockPrisma.notification.update.mockResolvedValueOnce({
        ...caregiverAlertNotification,
        status: "DELIVERED",
        deliveredAt: referenceTime,
      });

      const result = await NotificationService.dispatchDueNotifications(referenceTime);

      expect(result.deliveredCount).toBe(1);
      expect(result.cancelledCount).toBe(0);
      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "alert-notif-1" },
          data: expect.objectContaining({
            status: "DELIVERED",
          }),
        }),
      );
    });

    it("cancels all pending reminders when cancelPendingDoseReminders is invoked", async () => {
      mockPrisma.notification.updateMany.mockResolvedValueOnce({ count: 2 });

      const cancelledCount = await NotificationService.cancelPendingDoseReminders(
        doseId,
        "Dose marked as taken",
      );

      expect(cancelledCount).toBe(2);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          doseId,
          status: "SCHEDULED",
        },
        data: {
          status: "CANCELLED",
          lastError: "Dose marked as taken",
        },
      });
    });

    it("creates a CAREGIVER_ALERT notification event for caregivers", async () => {
      const sampleAlert = {
        id: "alert-123",
        patientId,
        recipientId: caregiverId,
        doseId,
        type: "DOSE_MISSED" as const,
        status: "OPEN" as const,
        message: "Dose was missed",
        reason: {},
        dedupeKey: "missed-dose-alert-key",
        createdAt: new Date(),
        acknowledgedAt: null,
        resolvedAt: null,
      };

      mockPrisma.notificationEndpoint.findMany.mockResolvedValueOnce([
        { channel: "EMAIL", enabled: true, address: "caregiver@nexpill.test" },
      ]);
      mockPrisma.notification.upsert.mockResolvedValueOnce({
        id: "alert-notif-1",
        kind: "CAREGIVER_ALERT",
      });

      const notifs = await NotificationService.scheduleCaregiverAlertNotification(
        sampleAlert,
      );

      expect(notifs).toHaveLength(1);
      expect(mockPrisma.notification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dedupeKey: `alert-notif-${sampleAlert.id}-EMAIL` },
          create: expect.objectContaining({
            recipientId: caregiverId,
            alertId: sampleAlert.id,
            kind: "CAREGIVER_ALERT",
            channel: "EMAIL",
            status: "SCHEDULED",
          }),
        }),
      );
    });
  });

  describe("HTTP Endpoints (/notifications)", () => {
    it("GET /notifications lists notifications for authenticated user", async () => {
      authenticateAs(patientId);
      mockPrisma.notification.findMany.mockResolvedValueOnce([
        { id: notificationId, kind: "DOSE_REMINDER", status: "SCHEDULED" },
      ]);

      const response = await request(app)
        .get("/notifications")
        .query({ status: "SCHEDULED" })
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.notifications).toHaveLength(1);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recipientId: patientId,
            status: "SCHEDULED",
          }),
        }),
      );
    });

    it("PATCH /notifications/:id/delivered marks notification as delivered", async () => {
      authenticateAs(patientId);
      mockPrisma.notification.findUnique.mockResolvedValueOnce({
        id: notificationId,
        recipientId: patientId,
        status: "SCHEDULED",
      });
      mockPrisma.notification.update.mockResolvedValueOnce({
        id: notificationId,
        status: "DELIVERED",
      });

      const response = await request(app)
        .patch(`/notifications/${notificationId}/delivered`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.notification.status).toBe("DELIVERED");
    });

    it("POST /notifications/jobs/dispatch executes notification worker manually", async () => {
      authenticateAs(patientId);
      mockPrisma.notification.findMany.mockResolvedValueOnce([]);

      const response = await request(app)
        .post("/notifications/jobs/dispatch")
        .set("Authorization", "Bearer valid-token")
        .send({ referenceTime: "2026-10-19T08:30:00.000Z" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.result.processedCount).toBe(0);
    });

    it("POST /notifications/doses/:doseId/schedule schedules dose reminders", async () => {
      authenticateAs(patientId);
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce(sampleDose);
      mockPrisma.notificationEndpoint.findMany.mockResolvedValueOnce([]);
      mockPrisma.notification.upsert.mockResolvedValue({ id: "notif-1" });

      const response = await request(app)
        .post(`/notifications/doses/${doseId}/schedule`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(201);
      expect(response.body.scheduledCount).toBeGreaterThan(0);
    });

    it("POST /notifications/endpoints registers user notification channel", async () => {
      authenticateAs(patientId);
      mockPrisma.notificationEndpoint.upsert.mockResolvedValueOnce({
        id: "ep-1",
        userId: patientId,
        channel: "PUSH",
        address: "fcm-push-token-abc",
        enabled: true,
      });

      const response = await request(app)
        .post("/notifications/endpoints")
        .set("Authorization", "Bearer valid-token")
        .send({
          channel: "PUSH",
          address: "fcm-push-token-abc",
        });

      expect(response.status).toBe(201);
      expect(response.body.endpoint.channel).toBe("PUSH");
      expect(response.body.endpoint.address).toBe("fcm-push-token-abc");
    });

    it("GET /notifications/endpoints lists registered delivery endpoints", async () => {
      authenticateAs(patientId);
      mockPrisma.notificationEndpoint.findMany.mockResolvedValueOnce([
        {
          id: "ep-1",
          userId: patientId,
          channel: "PUSH",
          address: "fcm-push-token-abc",
          enabled: true,
          createdAt: new Date(),
        },
      ]);

      const response = await request(app)
        .get("/notifications/endpoints")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.endpoints).toHaveLength(1);
      expect(response.body.endpoints[0].channel).toBe("PUSH");
      expect(mockPrisma.notificationEndpoint.findMany).toHaveBeenCalledWith({
        where: { userId: patientId },
        orderBy: { createdAt: "desc" },
      });
    });

    it("rejects unauthenticated requests across endpoints with 401", async () => {
      const resGet = await request(app).get("/notifications");
      expect(resGet.status).toBe(401);

      const resGetEndpoints = await request(app).get("/notifications/endpoints");
      expect(resGetEndpoints.status).toBe(401);

      const resPostEndpoints = await request(app)
        .post("/notifications/endpoints")
        .send({ channel: "PUSH", address: "token" });
      expect(resPostEndpoints.status).toBe(401);

      const resPatchDelivered = await request(app)
        .patch(`/notifications/${notificationId}/delivered`);
      expect(resPatchDelivered.status).toBe(401);

      const resSchedule = await request(app)
        .post(`/notifications/doses/${doseId}/schedule`);
      expect(resSchedule.status).toBe(401);
    });

    it("POST /notifications/endpoints rejects invalid channel enum with 400", async () => {
      authenticateAs(patientId);

      const response = await request(app)
        .post("/notifications/endpoints")
        .set("Authorization", "Bearer valid-token")
        .send({
          channel: "CARRIER_PIGEON",
          address: "123 Main St",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid channel");
    });

    it("POST /notifications/endpoints rejects empty or missing address with 400", async () => {
      authenticateAs(patientId);

      const response = await request(app)
        .post("/notifications/endpoints")
        .set("Authorization", "Bearer valid-token")
        .send({
          channel: "PUSH",
          address: "   ",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("address is required and cannot be empty");
    });

    it("PATCH /notifications/:id/delivered returns 404 when notification does not exist", async () => {
      authenticateAs(patientId);
      mockPrisma.notification.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .patch(`/notifications/${notificationId}/delivered`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("not found");
    });

    it("PATCH /notifications/:id/delivered returns 403 when user is not the recipient", async () => {
      authenticateAs(patientId);
      mockPrisma.notification.findUnique.mockResolvedValueOnce({
        id: notificationId,
        recipientId: caregiverId,
        status: "SCHEDULED",
      });

      const response = await request(app)
        .patch(`/notifications/${notificationId}/delivered`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("You do not have permission");
    });

    it("PATCH /notifications/:id/delivered rejects marking CANCELLED notification as delivered with 400", async () => {
      authenticateAs(patientId);
      mockPrisma.notification.findUnique.mockResolvedValueOnce({
        id: notificationId,
        recipientId: patientId,
        status: "CANCELLED",
      });

      const response = await request(app)
        .patch(`/notifications/${notificationId}/delivered`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Cannot mark a CANCELLED notification");
    });

    it("GET /notifications rejects invalid status or kind query parameters with 400", async () => {
      authenticateAs(patientId);

      const resStatus = await request(app)
        .get("/notifications")
        .query({ status: "INVALID_STATUS" })
        .set("Authorization", "Bearer valid-token");
      expect(resStatus.status).toBe(400);
      expect(resStatus.body.error).toContain("Invalid status");

      const resKind = await request(app)
        .get("/notifications")
        .query({ kind: "INVALID_KIND" })
        .set("Authorization", "Bearer valid-token");
      expect(resKind.status).toBe(400);
      expect(resKind.body.error).toContain("Invalid kind");

      const resChannel = await request(app)
        .get("/notifications")
        .query({ channel: "INVALID_CHANNEL" })
        .set("Authorization", "Bearer valid-token");
      expect(resChannel.status).toBe(400);
      expect(resChannel.body.error).toContain("Invalid channel");
    });

    it("PATCH /notifications/:id/delivered rejects non-UUID notification ID with 400", async () => {
      authenticateAs(patientId);

      const response = await request(app)
        .patch("/notifications/not-a-valid-uuid/delivered")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("must be a valid UUID");
    });

    it("POST /notifications/doses/:doseId/schedule returns 404 when scheduled dose does not exist", async () => {
      authenticateAs(patientId);
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/notifications/doses/${doseId}/schedule`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("not found");
    });
  });

  describe("Notification dispatcher background lifecycle", () => {
    it("starts and stops dispatcher cleanly", () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      startNotificationDispatcher(15000);
      startNotificationDispatcher(15000); // duplicate call no-op
      stopNotificationDispatcher();
      expect(true).toBe(true);
    });
  });
});
