import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { mockGetUser, mockPrisma } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockPrisma: {
    user: { findUnique: vi.fn() },
    caregiverAccess: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    scheduledDose: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    doseEvent: { create: vi.fn() },
    caregiverAlert: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    notification: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../src/config/supabase", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

vi.mock("../src/db/prisma", () => ({ prisma: mockPrisma }));

import { app } from "../src/app";
import { AlertService } from "../src/services/alert.service";
import { MissedDoseJobService } from "../src/jobs/missed-dose.job";

describe("Caregiver Alerts & Missed-Dose Escalation Rules", () => {
  const patientId = "11111111-1111-4111-a111-111111111111";
  const caregiverId = "22222222-2222-4222-a222-222222222222";
  const doseId = "33333333-3333-4333-a333-333333333333";
  const alertId = "55555555-5555-4555-a555-555555555555";

  const sampleAlert = {
    id: alertId,
    patientId,
    recipientId: caregiverId,
    doseId,
    type: "DOSE_MISSED",
    status: "OPEN",
    message: 'Missed dose: "Metformin" scheduled for 08:00 was not confirmed.',
    reason: { doseId, medicationName: "Metformin" },
    dedupeKey: `missed-dose-${doseId}-${caregiverId}`,
    createdAt: new Date("2026-10-22T10:00:00.000Z"),
    acknowledgedAt: null,
    resolvedAt: null,
    patient: {
      id: patientId,
      email: "patient@nexpill.test",
      profile: { displayName: "John Doe" },
    },
    recipient: {
      id: caregiverId,
      email: "caregiver@nexpill.test",
      profile: { displayName: "Jane Caregiver" },
    },
    dose: {
      id: doseId,
      scheduledAt: new Date("2026-10-22T08:00:00.000Z"),
      status: "MISSED",
      schedule: {
        doseLabel: "Morning",
        medication: { name: "Metformin", dosageText: "500mg" },
      },
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: caregiverId, email: "caregiver@nexpill.test" } },
      error: null,
    });
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

  describe("Missed-Dose Escalation Rules", () => {
    it("escalates to DOSE_LATE alert when dose passes caregiverAlertAfterMin before deadline", async () => {
      const scheduledAt = new Date("2026-10-22T08:00:00.000Z");
      const referenceTime = new Date("2026-10-22T08:35:00.000Z"); // 35 min after (alertAfterMin = 30)

      const lateDose = {
        id: doseId,
        patientId,
        scheduledAt,
        missedDeadlineAt: new Date("2026-10-22T10:00:00.000Z"),
        status: "PENDING",
        schedule: {
          doseLabel: "Morning",
          medication: { id: "med-1", name: "Metformin" },
          reminder: {
            lateAfterMin: 15,
            caregiverAlertAfterMin: 30,
            notifyCaregivers: true,
          },
        },
      };

      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([lateDose]);
      mockPrisma.caregiverAccess.findMany.mockResolvedValueOnce([
        { caregiverId, patientId, status: "ACTIVE", canReceiveAlerts: true },
      ]);
      mockPrisma.caregiverAlert.upsert.mockResolvedValueOnce({
        id: "alert-late-1",
        type: "DOSE_LATE",
      });
      mockPrisma.notification.upsert.mockResolvedValueOnce({ id: "notif-late-1" });

      const count = await MissedDoseJobService.detectAndEscalateLateDoses(referenceTime);

      expect(count).toBe(1);
      expect(mockPrisma.caregiverAlert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dedupeKey: `late-dose-${doseId}-${caregiverId}` },
          create: expect.objectContaining({
            type: "DOSE_LATE",
            patientId,
            recipientId: caregiverId,
          }),
        }),
      );
    });

    it("triggers REPEATED_MISSES escalation when patient has consecutive missed doses", async () => {
      const referenceTime = new Date("2026-10-22T10:00:00.000Z");

      // Mock recent doses showing 2 consecutive missed doses
      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([
        { id: doseId, status: "MISSED", scheduledAt: referenceTime },
        { id: "dose-prior", status: "MISSED", scheduledAt: new Date("2026-10-22T08:00:00.000Z") },
        { id: "dose-earlier", status: "TAKEN", scheduledAt: new Date("2026-10-21T20:00:00.000Z") },
      ]);
      mockPrisma.caregiverAccess.findMany.mockResolvedValueOnce([
        { caregiverId, patientId, status: "ACTIVE", canReceiveAlerts: true },
      ]);
      mockPrisma.caregiverAlert.upsert.mockResolvedValueOnce({ id: "alert-repeated-1" });
      mockPrisma.notification.upsert.mockResolvedValueOnce({ id: "notif-repeated-1" });

      const escalated = await AlertService.checkRepeatedMissesEscalation(
        mockPrisma,
        patientId,
        doseId,
        referenceTime,
      );

      expect(escalated).toBe(true);
      expect(mockPrisma.caregiverAlert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            dedupeKey: `repeated-misses-${patientId}-${doseId}-${caregiverId}`,
          },
          create: expect.objectContaining({
            type: "REPEATED_MISSES",
            patientId,
            recipientId: caregiverId,
          }),
        }),
      );
    });

    it("does not trigger REPEATED_MISSES when consecutive misses threshold is not reached", async () => {
      // Only 1 missed dose preceded by taken dose
      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([
        { id: doseId, status: "MISSED", scheduledAt: new Date() },
        { id: "prior-dose", status: "TAKEN", scheduledAt: new Date() },
      ]);

      const escalated = await AlertService.checkRepeatedMissesEscalation(
        mockPrisma,
        patientId,
        doseId,
      );

      expect(escalated).toBe(false);
      expect(mockPrisma.caregiverAlert.upsert).not.toHaveBeenCalled();
    });
  });

  describe("Caregiver Alerts API Endpoints", () => {
    it("GET /alerts lists alerts for authenticated caregiver", async () => {
      mockPrisma.caregiverAlert.findMany.mockResolvedValueOnce([sampleAlert]);

      const response = await request(app)
        .get("/alerts")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.alerts).toHaveLength(1);
      expect(response.body.alerts[0].id).toBe(alertId);
      expect(response.body.alerts[0].type).toBe("DOSE_MISSED");
      expect(response.body.alerts[0].dose.schedule.medication.name).toBe("Metformin");
    });

    it("GET /alerts/summary returns aggregated counts by status and type", async () => {
      mockPrisma.caregiverAlert.findMany.mockResolvedValueOnce([
        { ...sampleAlert, status: "OPEN", type: "DOSE_MISSED" },
        { ...sampleAlert, id: "a2", status: "ACKNOWLEDGED", type: "DOSE_LATE" },
        { ...sampleAlert, id: "a3", status: "OPEN", type: "REPEATED_MISSES" },
      ]);

      const response = await request(app)
        .get("/alerts/summary")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.summary).toEqual({
        total: 3,
        open: 2,
        acknowledged: 1,
        resolved: 0,
        byType: {
          doseLate: 1,
          doseMissed: 1,
          repeatedMisses: 1,
          safetyWarning: 0,
          riskHigh: 0,
        },
      });
    });

    it("GET /alerts/:id returns single alert with full details", async () => {
      mockPrisma.caregiverAlert.findUnique.mockResolvedValueOnce(sampleAlert);

      const response = await request(app)
        .get(`/alerts/${alertId}`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.alert.id).toBe(alertId);
      expect(response.body.alert.patient.profile.displayName).toBe("John Doe");
    });

    it("PATCH /alerts/:id/acknowledge updates alert status to ACKNOWLEDGED", async () => {
      mockPrisma.caregiverAlert.findUnique.mockResolvedValueOnce(sampleAlert);
      mockPrisma.caregiverAlert.update.mockResolvedValueOnce({
        ...sampleAlert,
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date("2026-10-22T10:05:00.000Z"),
      });

      const response = await request(app)
        .patch(`/alerts/${alertId}/acknowledge`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.alert.status).toBe("ACKNOWLEDGED");
      expect(mockPrisma.caregiverAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: alertId },
          data: expect.objectContaining({ status: "ACKNOWLEDGED" }),
        }),
      );
    });

    it("PATCH /alerts/:id/resolve updates alert status to RESOLVED", async () => {
      mockPrisma.caregiverAlert.findUnique.mockResolvedValueOnce(sampleAlert);
      mockPrisma.caregiverAlert.update.mockResolvedValueOnce({
        ...sampleAlert,
        status: "RESOLVED",
        resolvedAt: new Date("2026-10-22T10:10:00.000Z"),
      });

      const response = await request(app)
        .patch(`/alerts/${alertId}/resolve`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.alert.status).toBe("RESOLVED");
      expect(mockPrisma.caregiverAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: alertId },
          data: expect.objectContaining({ status: "RESOLVED" }),
        }),
      );
    });

    it("rejects unauthorized user from viewing alerts belonging to someone else", async () => {
      mockPrisma.caregiverAlert.findUnique.mockResolvedValueOnce({
        ...sampleAlert,
        recipientId: "someone-else",
        patientId: "another-patient",
      });

      const response = await request(app)
        .get(`/alerts/${alertId}`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(403);
    });
  });
});
