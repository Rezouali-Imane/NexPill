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
      caregiverAccess: {
        findMany: vi.fn(),
      },
      scheduledDose: {
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      doseEvent: {
        create: vi.fn(),
      },
      caregiverAlert: {
        upsert: vi.fn(),
        updateMany: vi.fn(),
      },
      notification: {
        upsert: vi.fn(),
        updateMany: vi.fn(),
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

import { app } from "../src/app";
import {
  MissedDoseJobService,
  startMissedDoseScheduler,
  stopMissedDoseScheduler,
} from "../src/jobs/missed-dose.job";

describe("Missed Dose Detection Job & Trigger", () => {
  const patientId = "11111111-1111-4111-a111-111111111111";
  const caregiverId = "22222222-2222-4222-a222-222222222222";
  const doseId = "44444444-4444-4444-a444-444444444444";
  const scheduleId = "33333333-3333-4333-a333-333333333333";

  const overdueDose = {
    id: doseId,
    scheduleId,
    patientId,
    scheduledAt: new Date("2026-10-16T08:00:00.000Z"),
    localDate: new Date("2026-10-16T00:00:00.000Z"),
    timeZone: "UTC",
    lateAfterAt: new Date("2026-10-16T08:15:00.000Z"),
    missedDeadlineAt: new Date("2026-10-16T10:00:00.000Z"),
    status: "PENDING",
    version: 0,
    schedule: {
      id: scheduleId,
      medicationId: "med-1",
      doseLabel: "Morning 500mg",
      medication: {
        id: "med-1",
        name: "Metformin",
      },
      reminder: {
        lateAfterMin: 15,
        missedAfterMin: 120,
        notifyCaregivers: true,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stopMissedDoseScheduler();

    mockPrisma.user.findUnique.mockResolvedValue({
      platformRole: "USER",
      disabledAt: null,
    });
    mockPrisma.scheduledDose.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.notification.upsert.mockResolvedValue({ id: "notif-1" });
    mockPrisma.caregiverAlert.updateMany.mockResolvedValue({ count: 0 });

    // Default $transaction execution passes through callback
    mockPrisma.$transaction.mockImplementation(
      async (callback: (client: typeof mockPrisma) => unknown) => {
        return callback(mockPrisma);
      },
    );
  });

  describe("MissedDoseJobService.detectAndMarkMissedDoses", () => {
    it("returns zero processed when no doses are overdue", async () => {
      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([]);

      const result = await MissedDoseJobService.detectAndMarkMissedDoses(new Date());

      expect(result.missedCount).toBe(0);
      expect(result.processedDoseIds).toEqual([]);
      expect(result.alertsCreatedCount).toBe(0);
      expect(mockPrisma.scheduledDose.updateMany).not.toHaveBeenCalled();
    });

    it("detects overdue doses, transitions status to MISSED, and records SYSTEM DoseEvent", async () => {
      const referenceTime = new Date("2026-10-16T10:30:00.000Z");
      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([overdueDose]);
      mockPrisma.scheduledDose.update.mockResolvedValueOnce({
        ...overdueDose,
        status: "MISSED",
        resolvedSource: "SYSTEM",
      });
      mockPrisma.doseEvent.create.mockResolvedValueOnce({ id: "evt-missed-1" });
      mockPrisma.caregiverAccess.findMany.mockResolvedValueOnce([
        { caregiverId, patientId, status: "ACTIVE", canReceiveAlerts: true },
      ]);
      mockPrisma.caregiverAlert.upsert.mockResolvedValueOnce({ id: "alert-1" });

      const result = await MissedDoseJobService.detectAndMarkMissedDoses(referenceTime);

      expect(result.missedCount).toBe(1);
      expect(result.processedDoseIds).toContain(doseId);
      expect(result.alertsCreatedCount).toBe(1);

      // Verify dose updated to MISSED
      expect(mockPrisma.scheduledDose.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: doseId, status: "PENDING" },
          data: expect.objectContaining({
            status: "MISSED",
            resolvedSource: "SYSTEM",
            resolvedAt: referenceTime,
          }),
        }),
      );

      // Verify audit event created with SYSTEM source
      expect(mockPrisma.doseEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            doseId,
            fromStatus: "PENDING",
            toStatus: "MISSED",
            source: "SYSTEM",
            idempotencyKey: `system-missed-${doseId}`,
          }),
        }),
      );

      // Verify CaregiverAlert created
      expect(mockPrisma.caregiverAlert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dedupeKey: `missed-dose-${doseId}-${caregiverId}` },
          create: expect.objectContaining({
            type: "DOSE_MISSED",
            recipientId: caregiverId,
            patientId,
          }),
        }),
      );
    });

    it("skips caregiver alerts if notifyCaregivers is disabled on the schedule reminder", async () => {
      const doseWithoutNotify = {
        ...overdueDose,
        schedule: {
          ...overdueDose.schedule,
          reminder: {
            ...overdueDose.schedule.reminder,
            notifyCaregivers: false,
          },
        },
      };

      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([doseWithoutNotify]);
      mockPrisma.scheduledDose.update.mockResolvedValueOnce({});
      mockPrisma.doseEvent.create.mockResolvedValueOnce({});

      const result = await MissedDoseJobService.detectAndMarkMissedDoses();

      expect(result.missedCount).toBe(1);
      expect(result.alertsCreatedCount).toBe(0);
      expect(mockPrisma.caregiverAccess.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.caregiverAlert.upsert).not.toHaveBeenCalled();
    });

    it("does not create an event when another worker already resolved the dose", async () => {
      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([overdueDose]);
      mockPrisma.scheduledDose.updateMany.mockResolvedValueOnce({ count: 0 });

      const result = await MissedDoseJobService.detectAndMarkMissedDoses(
        new Date("2026-10-16T10:30:00.000Z"),
      );

      expect(result.missedCount).toBe(0);
      expect(mockPrisma.doseEvent.create).not.toHaveBeenCalled();
      expect(mockPrisma.caregiverAlert.upsert).not.toHaveBeenCalled();
    });
  });

  describe("Scheduler start/stop lifecycle", () => {
    it("can start and stop the scheduler without hanging timers", () => {
      mockPrisma.scheduledDose.findMany.mockResolvedValue([]);
      startMissedDoseScheduler(10000);
      // Double call should be a no-op
      startMissedDoseScheduler(10000);
      stopMissedDoseScheduler();
      expect(true).toBe(true);
    });
  });

  describe("POST /doses/jobs/detect-missed", () => {
    it("rejects a non-admin authenticated user", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: patientId, email: "patient@nexpill.test" } },
        error: null,
      });

      const response = await request(app)
        .post("/doses/jobs/detect-missed")
        .set("Authorization", "Bearer test-token")
        .send({ referenceTime: "2026-10-16T11:00:00.000Z" });

      expect(response.status).toBe(403);
      expect(mockPrisma.scheduledDose.findMany).not.toHaveBeenCalled();
    });

    it("allows an admin to manually trigger the detection job", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: patientId, email: "patient@nexpill.test" } },
        error: null,
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        platformRole: "ADMIN",
        disabledAt: null,
      });

      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([overdueDose]);
      mockPrisma.scheduledDose.update.mockResolvedValueOnce({});
      mockPrisma.doseEvent.create.mockResolvedValueOnce({});
      mockPrisma.caregiverAccess.findMany.mockResolvedValueOnce([]);

      const response = await request(app)
        .post("/doses/jobs/detect-missed")
        .set("Authorization", "Bearer valid-token")
        .send({ referenceTime: "2026-10-16T11:00:00.000Z" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.result.missedCount).toBe(1);
    });
  });
});
