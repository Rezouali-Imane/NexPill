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
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      drugInteraction: {
        findMany: vi.fn(),
      },
      safetyWarning: {
        create: vi.fn(),
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

describe("Medication Endpoints", () => {
  const patientId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const caregiverId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  const strangerId = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
  const medicationId = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
  const catalogItemId = "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee";
  const conflictingCatalogItemId = "ffffffff-ffff-4fff-ffff-ffffffffffff";

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({
      platformRole: "USER",
      disabledAt: null,
    });
  });

  const authenticateAs = (userId: string, email = "user@nexpill.test") => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: userId, email } },
      error: null,
    });
  };

  describe("Authentication Guard", () => {
    it("should return 401 when no token is provided", async () => {
      const response = await request(app).get("/medications");
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Missing bearer token" });
    });
  });

  describe("POST /medications (Create Medication)", () => {
    it("should allow a patient to create their own medication", async () => {
      authenticateAs(patientId);

      const fakeMedication = {
        id: medicationId,
        patientId,
        name: "Lisinopril",
        dosageText: "10mg",
        form: "tablet",
        route: "oral",
        instructions: "Take once daily in the morning",
        prescriber: "Dr. Adams",
        startDate: new Date("2026-10-15T00:00:00.000Z"),
        endDate: null,
        status: "ACTIVE",
        catalogItemId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        catalogItem: null,
      };

      mockPrisma.medication.create.mockResolvedValueOnce(fakeMedication);

      const response = await request(app)
        .post("/medications")
        .set("Authorization", "Bearer valid-token")
        .send({
          name: "Lisinopril",
          dosageText: "10mg",
          form: "tablet",
          route: "oral",
          instructions: "Take once daily in the morning",
          prescriber: "Dr. Adams",
          startDate: "2026-10-15",
        });

      expect(response.status).toBe(201);
      expect(response.body.medication.name).toBe("Lisinopril");
      expect(response.body.medication.dosageText).toBe("10mg");
      expect(response.body.warnings).toEqual([]);
      expect(mockPrisma.medication.create).toHaveBeenCalledTimes(1);
    });

    it("should return 400 if required fields are missing", async () => {
      authenticateAs(patientId);

      const response = await request(app)
        .post("/medications")
        .set("Authorization", "Bearer valid-token")
        .send({
          dosageText: "10mg",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("name is required");
    });

    it("should return 400 if startDate is later than endDate", async () => {
      authenticateAs(patientId);

      const response = await request(app)
        .post("/medications")
        .set("Authorization", "Bearer valid-token")
        .send({
          name: "Amoxicillin",
          dosageText: "500mg",
          startDate: "2026-10-20",
          endDate: "2026-10-10",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("startDate cannot be later than endDate");
    });

    it("should allow an authorized caregiver with canManageMedications to create medication for a patient", async () => {
      authenticateAs(caregiverId);

      mockPrisma.user.findUnique.mockResolvedValueOnce({ platformRole: "USER" });
      mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce({
        caregiverId,
        patientId,
        status: "ACTIVE",
        canViewSchedule: true,
        canManageMedications: true,
      });

      const fakeMedication = {
        id: medicationId,
        patientId,
        name: "Metformin",
        dosageText: "500mg",
        catalogItemId: null,
        status: "ACTIVE",
      };

      mockPrisma.medication.create.mockResolvedValueOnce(fakeMedication);

      const response = await request(app)
        .post("/medications")
        .set("Authorization", "Bearer valid-token")
        .send({
          patientId,
          name: "Metformin",
          dosageText: "500mg",
        });

      expect(response.status).toBe(201);
      expect(response.body.medication.name).toBe("Metformin");
    });

    it("should return 403 if caregiver lacks canManageMedications permission", async () => {
      authenticateAs(caregiverId);

      mockPrisma.user.findUnique.mockResolvedValueOnce({ platformRole: "USER" });
      mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce({
        caregiverId,
        patientId,
        status: "ACTIVE",
        canViewSchedule: true,
        canManageMedications: false, // Read-only caregiver!
      });

      const response = await request(app)
        .post("/medications")
        .set("Authorization", "Bearer valid-token")
        .send({
          patientId,
          name: "Metformin",
          dosageText: "500mg",
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("do not allow modifying or managing");
    });

    it("should trigger Conflict Engine and record SafetyWarning if drug interaction is detected", async () => {
      authenticateAs(patientId);

      const createdMedication = {
        id: medicationId,
        patientId,
        name: "Aspirin",
        dosageText: "81mg",
        catalogItemId,
        status: "ACTIVE",
      };

      mockPrisma.medication.create.mockResolvedValueOnce(createdMedication);

      // Existing active medication for the same patient (e.g. Warfarin)
      mockPrisma.medication.findMany.mockResolvedValueOnce([
        {
          id: "existing-med-id",
          name: "Warfarin",
          catalogItemId: conflictingCatalogItemId,
        },
      ]);

      // Conflict between Aspirin and Warfarin
      mockPrisma.drugInteraction.findMany.mockResolvedValueOnce([
        {
          id: "interaction-123",
          drugAId: catalogItemId,
          drugBId: conflictingCatalogItemId,
          severity: "SEVERE",
          description: "High risk of severe gastrointestinal bleeding when combined.",
          drugA: { name: "Aspirin" },
          drugB: { name: "Warfarin" },
        },
      ]);

      mockPrisma.safetyWarning.create.mockResolvedValueOnce({
        id: "warning-123",
        patientId,
        medicationId,
        otherMedicationId: "existing-med-id",
        interactionId: "interaction-123",
        kind: "INTERACTION",
        severity: "SEVERE",
        message: "High risk of severe gastrointestinal bleeding when combined.",
      });

      const response = await request(app)
        .post("/medications")
        .set("Authorization", "Bearer valid-token")
        .send({
          name: "Aspirin",
          dosageText: "81mg",
          catalogItemId,
        });

      expect(response.status).toBe(201);
      expect(response.body.medication.name).toBe("Aspirin");
      expect(response.body.warnings).toHaveLength(1);
      expect(response.body.warnings[0].severity).toBe("SEVERE");
      expect(response.body.warnings[0].otherMedicationName).toBe("Warfarin");
      expect(mockPrisma.safetyWarning.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /medications (List Medications)", () => {
    it("should list medications for the authenticated patient", async () => {
      authenticateAs(patientId);

      const fakeList = [
        { id: medicationId, name: "Atorvastatin", dosageText: "20mg", status: "ACTIVE" },
      ];

      mockPrisma.medication.findMany.mockResolvedValueOnce(fakeList);

      const response = await request(app)
        .get("/medications")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.medications).toHaveLength(1);
      expect(response.body.medications[0].name).toBe("Atorvastatin");
    });

    it("should allow authorized caregiver to list patient's medications", async () => {
      authenticateAs(caregiverId);

      mockPrisma.user.findUnique.mockResolvedValueOnce({ platformRole: "USER" });
      mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce({
        caregiverId,
        patientId,
        status: "ACTIVE",
        canViewSchedule: true,
        canManageMedications: false,
      });

      mockPrisma.medication.findMany.mockResolvedValueOnce([
        { id: medicationId, name: "Atorvastatin", dosageText: "20mg", status: "ACTIVE" },
      ]);

      const response = await request(app)
        .get(`/medications?patientId=${patientId}`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.medications).toHaveLength(1);
    });

    it("should return 403 for unauthorized caregiver access", async () => {
      authenticateAs(strangerId);

      mockPrisma.user.findUnique.mockResolvedValueOnce({ platformRole: "USER" });
      mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/medications?patientId=${patientId}`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("do not have active caregiver access");
    });
  });

  describe("GET /medications/:id (Get Single Medication)", () => {
    it("should return medication by ID", async () => {
      authenticateAs(patientId);

      mockPrisma.medication.findUnique.mockResolvedValueOnce({
        id: medicationId,
        patientId,
        name: "Lisinopril",
        dosageText: "10mg",
        schedules: [],
        warnings: [],
        catalogItem: null,
      });

      const response = await request(app)
        .get(`/medications/${medicationId}`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.medication.id).toBe(medicationId);
      expect(response.body.medication.name).toBe("Lisinopril");
    });

    it("should return 404 if medication not found", async () => {
      authenticateAs(patientId);

      mockPrisma.medication.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/medications/${medicationId}`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("not found");
    });

    it("should return 400 for invalid UUID", async () => {
      authenticateAs(patientId);

      const response = await request(app)
        .get("/medications/not-a-valid-uuid")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("must be a valid UUID");
    });
  });

  describe("PUT /medications/:id & PATCH /medications/:id (Update Medication)", () => {
    it("should update medication details", async () => {
      authenticateAs(patientId);

      mockPrisma.medication.findUnique.mockResolvedValueOnce({
        id: medicationId,
        patientId,
        name: "Lisinopril",
        dosageText: "10mg",
        status: "ACTIVE",
      });

      const updated = {
        id: medicationId,
        patientId,
        name: "Lisinopril",
        dosageText: "20mg",
        status: "ACTIVE",
        catalogItem: null,
      };

      mockPrisma.medication.update.mockResolvedValueOnce(updated);

      const response = await request(app)
        .patch(`/medications/${medicationId}`)
        .set("Authorization", "Bearer valid-token")
        .send({
          dosageText: "20mg",
        });

      expect(response.status).toBe(200);
      expect(response.body.medication.dosageText).toBe("20mg");
    });
  });

  describe("DELETE /medications/:id (Deactivate / Remove Medication)", () => {
    it("should soft-delete medication by default (status = INACTIVE)", async () => {
      authenticateAs(patientId);

      mockPrisma.medication.findUnique.mockResolvedValueOnce({
        id: medicationId,
        patientId,
        name: "Lisinopril",
        status: "ACTIVE",
      });

      mockPrisma.medication.update.mockResolvedValueOnce({
        id: medicationId,
        patientId,
        name: "Lisinopril",
        status: "INACTIVE",
      });

      const response = await request(app)
        .delete(`/medications/${medicationId}`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("deactivated");
      expect(response.body.medication.status).toBe("INACTIVE");
      expect(mockPrisma.medication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "INACTIVE" },
        }),
      );
    });

    it("should hard-delete medication when ?hard=true is passed", async () => {
      authenticateAs(patientId);

      mockPrisma.medication.findUnique.mockResolvedValueOnce({
        id: medicationId,
        patientId,
        name: "Lisinopril",
        status: "ACTIVE",
      });

      mockPrisma.medication.delete.mockResolvedValueOnce({});

      const response = await request(app)
        .delete(`/medications/${medicationId}?hard=true`)
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("permanently removed");
      expect(mockPrisma.medication.delete).toHaveBeenCalledTimes(1);
    });
  });
});
