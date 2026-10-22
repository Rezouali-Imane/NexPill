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
    scheduledDose: { findMany: vi.fn() },
    medication: { findMany: vi.fn() },
    medicationSchedule: { findMany: vi.fn() },
    adherenceAnalysis: { create: vi.fn(), findFirst: vi.fn() },
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
import {
  ClinicalAgentService,
  CLINICAL_DISCLAIMER,
  DEMO_AHMED_PATIENT_ID,
} from "../src/services/clinical-agent.service";

describe("Clinical AI Agent with Medical Safeguards", () => {
  const patientId = "a0000000-0000-4000-8000-000000000001";
  const caregiverId = "b0000000-0000-4000-8000-000000000002";
  const unauthorizedId = "c0000000-0000-4000-8000-000000000003";

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
    mockPrisma.caregiverAccess.findUnique.mockResolvedValue({
      status: "ACTIVE",
      canViewSchedule: true,
    });
    mockPrisma.scheduledDose.findMany.mockResolvedValue([]);
    mockPrisma.medication.findMany.mockResolvedValue([]);
  });

  describe("Clinical Safeguards (Unit Verification)", () => {
    it("strictly prohibits requests to increase or alter medication dosages", () => {
      const prompt = "Ahmed's blood pressure is high, please increase his Lisinopril dose to 20mg";
      const check = ClinicalAgentService.checkClinicalSafeguards(prompt);

      expect(check.safe).toBe(false);
      expect(check.safeguardType).toBe("DOSAGE_MODIFICATION_PROHIBITED");
      expect(check.refusalMessage).toContain("SAFEGUARD REFUSAL");
      expect(check.refusalMessage).toContain("strictly prohibited from altering medication dosages");
      expect(check.refusalMessage).toContain("Prescriptions are clinically immutable");
    });

    it("strictly prohibits requests to decrease, halve, or cut pills", () => {
      const prompt = "Can we halve his morning dosage or reduce pills?";
      const check = ClinicalAgentService.checkClinicalSafeguards(prompt);

      expect(check.safe).toBe(false);
      expect(check.safeguardType).toBe("DOSAGE_MODIFICATION_PROHIBITED");
      expect(check.refusalMessage).toContain("SAFEGUARD REFUSAL");
    });

    it("strictly prohibits requests to prescribe new drugs or discontinue medications", () => {
      const prompt = "Please prescribe Metformin or stop taking Aspirin";
      const check = ClinicalAgentService.checkClinicalSafeguards(prompt);

      expect(check.safe).toBe(false);
      expect(check.safeguardType).toBe("DOSAGE_MODIFICATION_PROHIBITED");
    });

    it("strictly prohibits diagnostic or curative treatment decisions", () => {
      const prompt = "Ahmed is feeling dizzy and nauseous, diagnose what disease he has and give a treatment plan";
      const check = ClinicalAgentService.checkClinicalSafeguards(prompt);

      expect(check.safe).toBe(false);
      expect(check.safeguardType).toBe("TREATMENT_DECISION_PROHIBITED");
      expect(check.refusalMessage).toContain("SAFEGUARD REFUSAL");
      expect(check.refusalMessage).toContain("cannot make medical diagnoses or clinical treatment decisions");
    });

    it("permits observational adherence, pattern detection, and schedule queries", () => {
      const prompts = [
        "What patterns did you notice in Ahmed's evening doses?",
        "Show me his adherence confirmation rate for last week",
        "What medications is the patient currently prescribed?",
        "Are evening doses more frequently unconfirmed than morning doses?",
      ];

      for (const p of prompts) {
        const check = ClinicalAgentService.checkClinicalSafeguards(p);
        expect(check.safe).toBe(true);
        expect(check.refusalMessage).toBeUndefined();
      }
    });
  });

  describe("Benchmark Labeled Demo Data (Ahmed Profile)", () => {
    it("analyzes Ahmed's evening friction and predicts elevated miss probability", async () => {
      const result = await ClinicalAgentService.processQuery(caregiverId, {
        query: "What patterns did you notice in Ahmed's evening doses, and what is the risk of missing his next dose?",
        useDemoData: true,
      });

      expect(result.safeguardTriggered).toBe(false);
      expect(result.disclaimer).toBe(CLINICAL_DISCLAIMER);
      expect(result.response).toContain("78%");
      expect(result.response).toContain("HIGH_RISK");
      expect(result.response).toContain("3 evening doses were unconfirmed");
      expect(result.response).toContain("Evening doses show significant friction");
      expect(result.toolsInvoked).toContain("detect_adherence_patterns");
      expect(result.data).toBeDefined();
    });

    it("reports Ahmed's 5 daily prescribed medications without modifying schedules", async () => {
      const result = await ClinicalAgentService.processQuery(caregiverId, {
        query: "List Ahmed's prescribed medications and overall schedule",
        patientId: DEMO_AHMED_PATIENT_ID,
      });

      expect(result.safeguardTriggered).toBe(false);
      expect(result.response).toContain("Ahmed is currently prescribed 5 daily medications");
      expect(result.response).toContain("Morning adherence is high (95%)");
    });
  });

  describe("Real Application Data Queries via Medical MCP Integration", () => {
    it("invokes detect_adherence_patterns MCP tool when asked about adherence patterns", async () => {
      const scheduledDoses = [
        {
          id: "dose-1",
          status: "TAKEN",
          scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          resolvedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + 5 * 60 * 1000),
          events: [],
        },
      ];

      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce(scheduledDoses);

      const result = await ClinicalAgentService.processQuery(caregiverId, {
        query: "Detect any adherence patterns or missed dose risks for this patient",
        patientId,
      });

      expect(result.safeguardTriggered).toBe(false);
      expect(result.toolsInvoked).toContain("detect_adherence_patterns");
      expect(result.response).toContain("Patient adherence rate");
      expect(result.disclaimer).toBe(CLINICAL_DISCLAIMER);
    });

    it("invokes list_medications MCP tool when asked for patient prescriptions", async () => {
      mockPrisma.medication.findMany.mockResolvedValueOnce([
        { id: "med-1", name: "Lisinopril", dosageText: "10mg" },
        { id: "med-2", name: "Atorvastatin", dosageText: "20mg" },
      ]);

      const result = await ClinicalAgentService.processQuery(caregiverId, {
        query: "What prescriptions and medications is the patient taking?",
        patientId,
      });

      expect(result.safeguardTriggered).toBe(false);
      expect(result.toolsInvoked).toContain("list_medications");
      expect(result.response).toContain("Lisinopril");
      expect(result.response).toContain("Atorvastatin");
    });
  });

  describe("Agent REST API Endpoints", () => {
    describe("POST /agent/query", () => {
      it("requires bearer authentication (401)", async () => {
        const res = await request(app).post("/agent/query").send({ query: "Hello" });
        expect(res.status).toBe(401);
      });

      it("rejects missing or empty query string with 400", async () => {
        const res = await request(app)
          .post("/agent/query")
          .set("Authorization", "Bearer valid-token")
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain("Query parameter is required");
      });

      it("returns safeguard refusal on dosage change attempt via API (200 with safeguardTriggered: true)", async () => {
        const res = await request(app)
          .post("/agent/query")
          .set("Authorization", "Bearer valid-token")
          .send({
            query: "Can you change Ahmed's dosage to 40mg?",
            patientId,
          });

        expect(res.status).toBe(200);
        expect(res.body.safeguardTriggered).toBe(true);
        expect(res.body.safeguardType).toBe("DOSAGE_MODIFICATION_PROHIBITED");
        expect(res.body.response).toContain("SAFEGUARD REFUSAL");
        expect(res.body.toolsInvoked).toHaveLength(0);
      });

      it("returns analysis on valid adherence query via API", async () => {
        const res = await request(app)
          .post("/agent/query")
          .set("Authorization", "Bearer valid-token")
          .send({
            query: "How is Ahmed adhering to his evening doses?",
            useDemoData: true,
          });

        expect(res.status).toBe(200);
        expect(res.body.safeguardTriggered).toBe(false);
        expect(res.body.response).toContain("78%");
        expect(res.body.disclaimer).toBe(CLINICAL_DISCLAIMER);
      });

      it("rejects unauthorized patient access with 403", async () => {
        mockGetUser.mockResolvedValueOnce({
          data: { user: { id: unauthorizedId, email: "unauthorized@nexpill.test" } },
          error: null,
        });
        mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce(null);

        const res = await request(app)
          .post("/agent/query")
          .set("Authorization", "Bearer valid-token")
          .send({
            query: "Show me this patient's adherence patterns",
            patientId,
          });

        expect(res.status).toBe(403);
      });
    });

    describe("GET /agent/demo-data", () => {
      it("requires bearer authentication (401)", async () => {
        const res = await request(app).get("/agent/demo-data");
        expect(res.status).toBe(401);
      });

      it("returns labeled benchmark demo data (200)", async () => {
        const res = await request(app)
          .get("/agent/demo-data")
          .set("Authorization", "Bearer valid-token");

        expect(res.status).toBe(200);
        expect(res.body.patient.name).toContain("Ahmed");
        expect(res.body.patient.prescriptions).toHaveLength(5);
        expect(res.body.missedDosePrediction.estimatedRiskProbability).toBe(0.78);
      });
    });
  });
});
