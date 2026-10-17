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
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      medication: {
        findUnique: vi.fn(),
      },
      medicationSchedule: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      scheduledDose: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      doseEvent: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      caregiverAlert: {
        updateMany: vi.fn(),
        upsert: vi.fn(),
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

describe("Dose Endpoints (/doses)", () => {
  const patientId = "11111111-1111-4111-a111-111111111111";
  const caregiverId = "22222222-2222-4222-a222-222222222222";
  const scheduleId = "33333333-3333-4333-a333-333333333333";
  const doseId = "44444444-4444-4444-a444-444444444444";

  const sampleDose = {
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
    resolvedAt: null,
    resolvedSource: null,
    schedule: {
      id: scheduleId,
      medicationId: "med-1",
      doseLabel: "Morning 500mg",
      timeZone: "UTC",
      medication: {
        id: "med-1",
        name: "Metformin",
        patientId,
      },
      reminder: {
        lateAfterMin: 15,
        missedAfterMin: 120,
        notifyCaregivers: true,
      },
    },
    events: [],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({
      platformRole: "USER",
      disabledAt: null,
    });
    // Default $transaction execution passes through callback
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

  describe("POST /doses/:id/taken", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const response = await request(app).post(`/doses/${doseId}/taken`);
      expect(response.status).toBe(401);
    });

    it("rejects requests with invalid bearer token with 401", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: "Invalid or expired token" },
      });

      const response = await request(app)
        .post(`/doses/${doseId}/taken`)
        .set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
    });

    it("allows a patient to record their own dose as TAKEN", async () => {
      authenticateAs(patientId);
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce({ ...sampleDose });

      const updatedDose = {
        ...sampleDose,
        status: "TAKEN",
        resolvedSource: "PATIENT",
        resolvedAt: new Date("2026-10-16T08:05:00.000Z"),
        version: 1,
      };
      const createdEvent = {
        id: "evt-1",
        doseId,
        fromStatus: "PENDING",
        toStatus: "TAKEN",
        source: "PATIENT",
        actorUserId: patientId,
        occurredAt: new Date("2026-10-16T08:05:00.000Z"),
        recordedAt: new Date(),
        idempotencyKey: "client-key-1",
        note: "Taken with breakfast",
      };

      mockPrisma.doseEvent.create.mockResolvedValueOnce(createdEvent);
      mockPrisma.scheduledDose.update.mockResolvedValueOnce(updatedDose);
      mockPrisma.caregiverAlert.updateMany.mockResolvedValueOnce({ count: 0 });

      const response = await request(app)
        .post(`/doses/${doseId}/taken`)
        .set("Authorization", "Bearer valid-token")
        .send({
          occurredAt: "2026-10-16T08:05:00.000Z",
          note: "Taken with breakfast",
          idempotencyKey: "client-key-1",
        });

      expect(response.status).toBe(200);
      expect(response.body.dose.status).toBe("TAKEN");
      expect(response.body.event.toStatus).toBe("TAKEN");
      expect(mockPrisma.doseEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            doseId,
            fromStatus: "PENDING",
            toStatus: "TAKEN",
            source: "PATIENT",
            actorUserId: patientId,
            note: "Taken with breakfast",
          }),
        }),
      );
      expect(mockPrisma.scheduledDose.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: doseId },
          data: expect.objectContaining({
            status: "TAKEN",
            resolvedSource: "PATIENT",
          }),
        }),
      );
    });

    it("allows an authorized caregiver with canRecordDoses: true to record dose as TAKEN", async () => {
      authenticateAs(caregiverId);
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce({ ...sampleDose });
      mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce({
        caregiverId,
        patientId,
        status: "ACTIVE",
        canRecordDoses: true,
      });

      const updatedDose = {
        ...sampleDose,
        status: "TAKEN",
        resolvedSource: "CAREGIVER",
        version: 1,
      };
      const createdEvent = {
        id: "evt-2",
        doseId,
        fromStatus: "PENDING",
        toStatus: "TAKEN",
        source: "CAREGIVER",
        actorUserId: caregiverId,
      };

      mockPrisma.doseEvent.create.mockResolvedValueOnce(createdEvent);
      mockPrisma.scheduledDose.update.mockResolvedValueOnce(updatedDose);
      mockPrisma.caregiverAlert.updateMany.mockResolvedValueOnce({ count: 1 });

      const response = await request(app)
        .post(`/doses/${doseId}/taken`)
        .set("Authorization", "Bearer valid-token")
        .send();

      expect(response.status).toBe(200);
      expect(mockPrisma.doseEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: "CAREGIVER",
            actorUserId: caregiverId,
          }),
        }),
      );
    });

    it("rejects caregiver with 403 Forbidden if canRecordDoses is false", async () => {
      authenticateAs(caregiverId);
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce({ ...sampleDose });
      mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce({
        caregiverId,
        patientId,
        status: "ACTIVE",
        canRecordDoses: false,
      });

      const response = await request(app)
        .post(`/doses/${doseId}/taken`)
        .set("Authorization", "Bearer valid-token")
        .send();

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("recording doses");
    });

    it("returns 404 if dose does not exist", async () => {
      authenticateAs(patientId);
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/doses/${doseId}/taken`)
        .set("Authorization", "Bearer valid-token")
        .send();

      expect(response.status).toBe(404);
    });

    it("returns idempotent response if dose is already marked as TAKEN", async () => {
      authenticateAs(patientId);
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce({
        ...sampleDose,
        status: "TAKEN",
        events: [{ id: "existing-evt", toStatus: "TAKEN" }],
      });

      const response = await request(app)
        .post(`/doses/${doseId}/taken`)
        .set("Authorization", "Bearer valid-token")
        .send();

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("already marked as TAKEN");
      expect(mockPrisma.scheduledDose.update).not.toHaveBeenCalled();
    });

    it("rejects attempting to change status of a CANCELLED dose with 400 Bad Request", async () => {
      authenticateAs(patientId);
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce({
        ...sampleDose,
        status: "CANCELLED",
      });

      const response = await request(app)
        .post(`/doses/${doseId}/taken`)
        .set("Authorization", "Bearer valid-token")
        .send();

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("CANCELLED");
    });
  });

  describe("POST /doses/:id/skipped", () => {
    it("allows recording a dose as SKIPPED with a reason note", async () => {
      authenticateAs(patientId);
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce({ ...sampleDose });

      const updatedDose = {
        ...sampleDose,
        status: "SKIPPED",
        resolvedSource: "PATIENT",
        version: 1,
      };
      const createdEvent = {
        id: "evt-skip",
        doseId,
        fromStatus: "PENDING",
        toStatus: "SKIPPED",
        source: "PATIENT",
        note: "Patient fasting for morning lab test",
      };

      mockPrisma.doseEvent.create.mockResolvedValueOnce(createdEvent);
      mockPrisma.scheduledDose.update.mockResolvedValueOnce(updatedDose);
      mockPrisma.caregiverAlert.updateMany.mockResolvedValueOnce({ count: 0 });

      const response = await request(app)
        .post(`/doses/${doseId}/skipped`)
        .set("Authorization", "Bearer valid-token")
        .send({ note: "Patient fasting for morning lab test" });

      expect(response.status).toBe(200);
      expect(response.body.dose.status).toBe("SKIPPED");
      expect(mockPrisma.doseEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toStatus: "SKIPPED",
            note: "Patient fasting for morning lab test",
          }),
        }),
      );
    });
  });

  describe("POST /doses/:id/unable-to-take", () => {
    it("allows recording a dose as UNABLE_TO_TAKE with acute clinical symptoms note", async () => {
      authenticateAs(patientId);
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce({ ...sampleDose });

      const updatedDose = {
        ...sampleDose,
        status: "UNABLE_TO_TAKE",
        resolvedSource: "PATIENT",
        version: 1,
      };
      const createdEvent = {
        id: "evt-unable",
        doseId,
        fromStatus: "PENDING",
        toStatus: "UNABLE_TO_TAKE",
        source: "PATIENT",
        note: "Severe nausea, unable to keep liquid down",
      };

      mockPrisma.doseEvent.create.mockResolvedValueOnce(createdEvent);
      mockPrisma.scheduledDose.update.mockResolvedValueOnce(updatedDose);
      mockPrisma.caregiverAlert.updateMany.mockResolvedValueOnce({ count: 0 });

      const response = await request(app)
        .post(`/doses/${doseId}/unable-to-take`)
        .set("Authorization", "Bearer valid-token")
        .send({ note: "Severe nausea, unable to keep liquid down" });

      expect(response.status).toBe(200);
      expect(response.body.dose.status).toBe("UNABLE_TO_TAKE");
      expect(mockPrisma.doseEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toStatus: "UNABLE_TO_TAKE",
            note: "Severe nausea, unable to keep liquid down",
          }),
        }),
      );
    });
  });

  describe("GET /doses/:id", () => {
    it("retrieves single dose with schedule, medication, and event history", async () => {
      authenticateAs(patientId);
      mockPrisma.scheduledDose.findUnique.mockResolvedValueOnce({
        ...sampleDose,
        events: [
          {
            id: "evt-1",
            fromStatus: "PENDING",
            toStatus: "TAKEN",
            recordedAt: new Date(),
          },
        ],
      });

      const response = await request(app)
        .get(`/doses/${doseId}`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.dose.id).toBe(doseId);
      expect(response.body.dose.events).toHaveLength(1);
    });
  });

  describe("GET /doses", () => {
    it("lists doses for authenticated patient with filters", async () => {
      authenticateAs(patientId);
      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([sampleDose]);

      const response = await request(app)
        .get("/doses")
        .query({ status: "PENDING", startDate: "2026-10-16" })
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.doses).toHaveLength(1);
      expect(mockPrisma.scheduledDose.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patientId,
            status: "PENDING",
          }),
        }),
      );
    });
  });

  describe("POST /doses/generate", () => {
    it("generates scheduled doses from schedule recurrence rules", async () => {
      authenticateAs(patientId);
      mockPrisma.medicationSchedule.findUnique.mockResolvedValueOnce({
        id: scheduleId,
        doseLabel: "Morning",
        timeZone: "UTC",
        timesOfDay: ["08:00"],
        daysOfWeek: [1, 2, 3, 4, 5],
        medication: { patientId },
        reminder: { lateAfterMin: 15, missedAfterMin: 120 },
      });
      mockPrisma.scheduledDose.upsert.mockResolvedValue({ id: "generated-dose" });
      mockPrisma.medicationSchedule.update.mockResolvedValueOnce({});

      const response = await request(app)
        .post("/doses/generate")
        .set("Authorization", "Bearer valid-token")
        .send({
          scheduleId,
          startDate: "2026-10-19", // Monday
          endDate: "2026-10-23", // Friday
        });

      expect(response.status).toBe(201);
      expect(response.body.count).toBe(5);
    });
  });
});
