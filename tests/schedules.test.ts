import { describe, it, expect, vi, beforeEach } from "vitest";
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
      },
      medication: {
        findUnique: vi.fn(),
      },
      medicationSchedule: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
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

describe("Schedule Endpoints", () => {
  const patientId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const caregiverId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  const medicationId = "11111111-1111-4111-a111-111111111111";
  const scheduleId = "22222222-2222-4222-a222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const authenticateAs = (userId: string, email = "user@nexpill.test") => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: userId, email } },
      error: null,
    });
  };

  describe("POST /medications/:medicationId/schedules", () => {
    it("should allow a patient to create a schedule for their medication", async () => {
      authenticateAs(patientId);

      mockPrisma.medication.findUnique.mockResolvedValueOnce({
        id: medicationId,
        patientId,
      });

      const fakeSchedule = {
        id: scheduleId,
        medicationId,
        doseLabel: "Morning Dose",
        timeZone: "America/New_York",
        timesOfDay: ["08:00"],
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        startDate: new Date("2026-10-15T00:00:00.000Z"),
        endDate: null,
        reminder: {
          reminderOffsetsMin: [0, 15],
          lateAfterMin: 15,
          caregiverAlertAfterMin: 30,
          missedAfterMin: 120,
          notifyCaregivers: true,
        },
      };

      mockPrisma.medicationSchedule.create.mockResolvedValueOnce(fakeSchedule);

      const response = await request(app)
        .post(`/medications/${medicationId}/schedules`)
        .set("Authorization", "Bearer valid-token")
        .send({
          doseLabel: "Morning Dose",
          timeZone: "America/New_York",
          timesOfDay: ["08:00"],
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          startDate: "2026-10-15",
          reminder: {
            reminderOffsetsMin: [0, 15],
            lateAfterMin: 15,
            caregiverAlertAfterMin: 30,
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.schedule.doseLabel).toBe("Morning Dose");
      expect(response.body.schedule.timesOfDay).toEqual(["08:00"]);
    });

    it("should allow an authorized caregiver with canManageMedications to create a schedule", async () => {
      authenticateAs(caregiverId);

      mockPrisma.medication.findUnique.mockResolvedValueOnce({
        id: medicationId,
        patientId,
      });

      mockPrisma.user.findUnique.mockResolvedValueOnce({ platformRole: "USER" });
      mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce({
        caregiverId,
        patientId,
        status: "ACTIVE",
        canViewSchedule: true,
        canManageMedications: true,
      });

      mockPrisma.medicationSchedule.create.mockResolvedValueOnce({
        id: scheduleId,
        medicationId,
        doseLabel: "Afternoon Dose",
        timesOfDay: ["14:00"],
        daysOfWeek: [1, 2, 3, 4, 5],
      });

      const response = await request(app)
        .post(`/medications/${medicationId}/schedules`)
        .set("Authorization", "Bearer valid-token")
        .send({
          doseLabel: "Afternoon Dose",
          timesOfDay: ["14:00"],
          daysOfWeek: [1, 2, 3, 4, 5],
          startDate: "2026-10-15",
        });

      expect(response.status).toBe(201);
      expect(response.body.schedule.doseLabel).toBe("Afternoon Dose");
    });


    it("should return 400 for invalid timesOfDay format", async () => {
      authenticateAs(patientId);

      mockPrisma.medication.findUnique.mockResolvedValueOnce({
        id: medicationId,
        patientId,
      });

      const response = await request(app)
        .post(`/medications/${medicationId}/schedules`)
        .set("Authorization", "Bearer valid-token")
        .send({
          doseLabel: "Night Dose",
          timesOfDay: ["25:99"], // Invalid time!
          daysOfWeek: [1],
          startDate: "2026-10-15",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("timesOfDay");
    });

    it("should return 400 for invalid daysOfWeek", async () => {
      authenticateAs(patientId);

      mockPrisma.medication.findUnique.mockResolvedValueOnce({
        id: medicationId,
        patientId,
      });

      const response = await request(app)
        .post(`/medications/${medicationId}/schedules`)
        .set("Authorization", "Bearer valid-token")
        .send({
          doseLabel: "Weekly Dose",
          timesOfDay: ["08:00"],
          daysOfWeek: [10], // Invalid day!
          startDate: "2026-10-15",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("daysOfWeek");
    });

    it("should return 404 if medication does not exist", async () => {
      authenticateAs(patientId);

      mockPrisma.medication.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/medications/${medicationId}/schedules`)
        .set("Authorization", "Bearer valid-token")
        .send({
          doseLabel: "Morning Dose",
          timesOfDay: ["08:00"],
          daysOfWeek: [1],
          startDate: "2026-10-15",
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("not found");
    });
  });

  describe("GET /medications/:medicationId/schedules", () => {
    it("should list active schedules for medication", async () => {
      authenticateAs(patientId);

      mockPrisma.medication.findUnique.mockResolvedValueOnce({
        id: medicationId,
        patientId,
      });

      mockPrisma.medicationSchedule.findMany.mockResolvedValueOnce([
        {
          id: scheduleId,
          medicationId,
          doseLabel: "Morning Dose",
          timesOfDay: ["08:00"],
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          reminder: { lateAfterMin: 15 },
        },
      ]);

      const response = await request(app)
        .get(`/medications/${medicationId}/schedules`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.schedules).toHaveLength(1);
      expect(response.body.schedules[0].doseLabel).toBe("Morning Dose");
    });
  });

  describe("GET /schedules/:id", () => {
    it("should retrieve a schedule by ID", async () => {
      authenticateAs(patientId);

      mockPrisma.medicationSchedule.findUnique.mockResolvedValueOnce({
        id: scheduleId,
        medicationId,
        doseLabel: "Evening Dose",
        timesOfDay: ["20:00"],
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        medication: { patientId },
        reminder: null,
      });

      const response = await request(app)
        .get(`/schedules/${scheduleId}`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.schedule.doseLabel).toBe("Evening Dose");
    });

    it("should return 404 if schedule does not exist", async () => {
      authenticateAs(patientId);

      mockPrisma.medicationSchedule.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/schedules/${scheduleId}`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /schedules/:id", () => {
    it("should update schedule times", async () => {
      authenticateAs(patientId);

      mockPrisma.medicationSchedule.findUnique.mockResolvedValueOnce({
        id: scheduleId,
        medication: { patientId },
      });

      mockPrisma.medicationSchedule.update.mockResolvedValueOnce({
        id: scheduleId,
        doseLabel: "Updated Dose Label",
        timesOfDay: ["09:00"],
        reminder: null,
      });

      const response = await request(app)
        .patch(`/schedules/${scheduleId}`)
        .set("Authorization", "Bearer valid-token")
        .send({
          doseLabel: "Updated Dose Label",
          timesOfDay: ["09:00"],
        });

      expect(response.status).toBe(200);
      expect(response.body.schedule.doseLabel).toBe("Updated Dose Label");
    });
  });

  describe("DELETE /schedules/:id", () => {
    it("should deactivate schedule by setting effectiveTo = now", async () => {
      authenticateAs(patientId);

      mockPrisma.medicationSchedule.findUnique.mockResolvedValueOnce({
        id: scheduleId,
        medication: { patientId },
      });

      mockPrisma.medicationSchedule.update.mockResolvedValueOnce({
        id: scheduleId,
        effectiveTo: new Date(),
      });

      const response = await request(app)
        .delete(`/schedules/${scheduleId}`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("deactivated");
    });
  });
});
