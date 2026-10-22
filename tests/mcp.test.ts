import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const { mockGetUser, mockPrisma } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockPrisma: {
    user: { findUnique: vi.fn() },
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
import { createMedicalMcpServer } from "../src/mcp/medical-server";
import { MedicationInformationService } from "../src/services/medication-information.service";
import { AdherenceAnalyticsService } from "../src/services/adherence-analytics.service";
import { ForbiddenError } from "../src/errors";

describe("Medical MCP Server & Transport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("Access Boundaries & HTTP Transport Constraints", () => {
    it("requires bearer authentication on POST /mcp", async () => {
      const response = await request(app).post("/mcp").send({});

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Missing bearer token" });
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("rejects invalid or expired bearer tokens on POST /mcp", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: new Error("Token expired"),
      });

      const response = await request(app)
        .post("/mcp")
        .set("Authorization", "Bearer expired-token")
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Invalid or expired token" });
    });

    it("rejects disabled user accounts with 403 Forbidden", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "user-disabled", email: "disabled@nexpill.test" } },
        error: null,
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        platformRole: "USER",
        disabledAt: new Date("2026-10-01T00:00:00Z"),
      });

      const response = await request(app)
        .post("/mcp")
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("not allowed to access this resource");
    });

    it("rejects users missing from application database with 403 Forbidden", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "user-missing", email: "missing@nexpill.test" } },
        error: null,
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .post("/mcp")
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(response.status).toBe(403);
    });

    it("does not expose a GET transport (405 Method Not Allowed)", async () => {
      const response = await request(app).get("/mcp");

      expect(response.status).toBe(405);
      expect(response.body).toEqual({
        error: "Medical MCP supports POST requests only.",
      });
    });

    it("does not allow DELETE transport sessions (405 Method Not Allowed)", async () => {
      const response = await request(app).delete("/mcp");

      expect(response.status).toBe(405);
      expect(response.body).toEqual({
        error: "Medical MCP sessions are stateless and cannot be deleted.",
      });
    });
  });

  describe("MCP Tool Contract & Metadata", () => {
    it("exposes all registered medical and adherence agent tools with strict safety annotations", async () => {
      const server = createMedicalMcpServer("user-1");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      const result = await client.listTools();
      expect(result.tools).toHaveLength(6);

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toEqual([
        "lookup_medication_information",
        "list_medications",
        "list_schedules",
        "get_patient_adherence_history",
        "detect_adherence_patterns",
        "generate_adherence_summary",
      ]);

      const lookupTool = result.tools.find((t) => t.name === "lookup_medication_information")!;
      expect(lookupTool.description).toContain(
        "Read-only medication name lookup against the public NIH RxNorm terminology service",
      );
      expect(lookupTool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });
      expect(lookupTool.inputSchema).toMatchObject({
        type: "object",
        properties: {
          medicationName: {
            type: "string",
            minLength: 1,
            maxLength: 200,
          },
        },
        required: ["medicationName"],
      });

      const patternTool = result.tools.find((t) => t.name === "detect_adherence_patterns")!;
      expect(patternTool.description).toContain("Analyzes patient dose history");
      expect(patternTool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });

      const summaryTool = result.tools.find((t) => t.name === "generate_adherence_summary")!;
      expect(summaryTool.description).toContain("Generates an explainable, structured adherence summary");
      expect(summaryTool.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      });

      await client.close();
      await server.close();
    });
  });

  describe("MCP Tool Input Validation", () => {
    let client: Client;
    let server: ReturnType<typeof createMedicalMcpServer>;

    beforeEach(async () => {
      server = createMedicalMcpServer("user-1");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      client = new Client({ name: "test-client", version: "1.0.0" });

      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);
    });

    it("rejects an empty medicationName string", async () => {
      const res = await client.callTool({
        name: "lookup_medication_information",
        arguments: { medicationName: "" },
      });

      expect(res.isError).toBe(true);
      expect((res.content[0] as { text: string }).text).toContain(
        "MCP error -32602: Input validation error",
      );
      expect((res.content[0] as { text: string }).text).toContain(
        "expected string to have >=1 characters",
      );
    });

    it("rejects medicationName exceeding 200 characters", async () => {
      const res = await client.callTool({
        name: "lookup_medication_information",
        arguments: { medicationName: "A".repeat(201) },
      });

      expect(res.isError).toBe(true);
      expect((res.content[0] as { text: string }).text).toContain(
        "MCP error -32602: Input validation error",
      );
      expect((res.content[0] as { text: string }).text).toContain(
        "expected string to have <=200 characters",
      );
    });

    it("rejects non-string medicationName types", async () => {
      const res = await client.callTool({
        name: "lookup_medication_information",
        arguments: { medicationName: 12345 },
      });

      expect(res.isError).toBe(true);
      expect((res.content[0] as { text: string }).text).toContain(
        "expected string, received number",
      );
    });

    it("rejects missing medicationName parameter", async () => {
      const res = await client.callTool({
        name: "lookup_medication_information",
        arguments: {},
      });

      expect(res.isError).toBe(true);
      expect((res.content[0] as { text: string }).text).toContain(
        "expected string, received undefined",
      );
    });

    it("rejects invalid patientId uuid on detect_adherence_patterns", async () => {
      const res = await client.callTool({
        name: "detect_adherence_patterns",
        arguments: { patientId: "not-a-uuid" },
      });

      expect(res.isError).toBe(true);
      expect((res.content[0] as { text: string }).text).toContain(
        "Invalid UUID",
      );
    });
  });

  describe("MCP Tool Execution & Error Handling", () => {
    it("returns serialized medication data on valid lookup", async () => {
      const server = createMedicalMcpServer("user-1");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      const mockLookup = vi
        .spyOn(MedicationInformationService, "lookup")
        .mockResolvedValueOnce({
          query: "Lisinopril",
          source: "RxNorm",
          sourceUrl: "https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=Lisinopril&maxEntries=5",
          matches: [
            {
              rxCui: "29046",
              name: "Lisinopril",
              termType: "IN",
            },
          ],
        });

      const response = await client.callTool({
        name: "lookup_medication_information",
        arguments: { medicationName: "Lisinopril" },
      });

      expect(response.isError).toBeFalsy();
      expect(response.content).toHaveLength(1);
      expect(response.content[0]!.type).toBe("text");

      const parsed = JSON.parse((response.content[0] as { text: string }).text);
      expect(parsed.query).toBe("Lisinopril");
      expect(parsed.source).toBe("RxNorm");
      expect(parsed.matches).toHaveLength(1);
      expect(parsed.matches[0].rxCui).toBe("29046");

      expect(mockLookup).toHaveBeenCalledWith("Lisinopril");

      await client.close();
      await server.close();
    });

    it("handles upstream source errors safely without leaking internal details", async () => {
      const server = createMedicalMcpServer("user-1");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      vi.spyOn(MedicationInformationService, "lookup").mockRejectedValueOnce(
        new Error("Trusted medication information source is unavailable."),
      );

      const response = await client.callTool({
        name: "lookup_medication_information",
        arguments: { medicationName: "Aspirin" },
      });

      expect(response.isError).toBe(true);
      expect((response.content[0] as { text: string }).text).toBe(
        "Trusted medication information source is unavailable.",
      );

      await client.close();
      await server.close();
    });

    it("executes detect_adherence_patterns and returns structured findings", async () => {
      const server = createMedicalMcpServer("user-1");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      const mockMetrics = {
        totalScheduled: 10,
        confirmedCount: 9,
        unconfirmedCount: 1,
        missedCount: 1,
        skippedCount: 0,
        delayedCount: 0,
        confirmationRate: 0.9,
        averageDelayMinutes: 5,
        trend: "STABLE" as const,
        timeOfDay: {
          morning: { scheduled: 5, confirmed: 5, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 2 },
          afternoon: { scheduled: 0, confirmed: 0, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 0 },
          evening: { scheduled: 5, confirmed: 4, unconfirmed: 1, missed: 1, confirmationRate: 0.8, averageDelayMinutes: 8 },
          night: { scheduled: 0, confirmed: 0, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 0 },
        },
      };

      vi.spyOn(AdherenceAnalyticsService, "computeAdherenceMetrics").mockResolvedValueOnce({
        metrics: mockMetrics,
        doses: [],
      });

      vi.spyOn(AdherenceAnalyticsService, "detectPatterns").mockReturnValueOnce({
        patterns: [],
        riskAssessment: {
          level: "STABLE",
          score: 0.0,
          reasons: ["Consistent on-time adherence."],
        },
      });

      const response = await client.callTool({
        name: "detect_adherence_patterns",
        arguments: {
          patientId: "a0000000-0000-4000-8000-000000000001",
        },
      });

      expect(response.isError).toBeFalsy();
      const data = JSON.parse((response.content[0] as { text: string }).text);
      expect(data.patientId).toBe("a0000000-0000-4000-8000-000000000001");
      expect(data.metrics.confirmationRate).toBe(0.9);
      expect(data.riskAssessment.level).toBe("STABLE");

      await client.close();
      await server.close();
    });

    it("executes generate_adherence_summary and persists explainable report", async () => {
      const server = createMedicalMcpServer("user-1");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      vi.spyOn(AdherenceAnalyticsService, "generateReport").mockResolvedValueOnce({
        patientId: "a0000000-0000-4000-8000-000000000001",
        period: { start: new Date("2026-10-01"), end: new Date("2026-10-08") },
        metrics: {} as never,
        patterns: [],
        riskAssessment: { level: "STABLE", score: 0.0, reasons: [] },
        suggestedFollowUp: "Continue standard monitoring.",
        summaryText: "Patient adherence is 100%.",
        analysisRecordId: "rec-1",
      });

      const response = await client.callTool({
        name: "generate_adherence_summary",
        arguments: {
          patientId: "a0000000-0000-4000-8000-000000000001",
        },
      });

      expect(response.isError).toBeFalsy();
      const data = JSON.parse((response.content[0] as { text: string }).text);
      expect(data.summaryText).toContain("Patient adherence is 100%");
      expect(data.analysisRecordId).toBe("rec-1");

      await client.close();
      await server.close();
    });

    it("executes get_patient_adherence_history and returns observational outcomes", async () => {
      const server = createMedicalMcpServer("user-1");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      const mockHistory = [
        {
          doseId: "dose-1",
          scheduleId: "sched-1",
          medication: { name: "Lisinopril", dosage: "10mg", route: "ORAL" },
          scheduledAt: new Date("2026-10-20T08:00:00Z"),
          timeOfDay: "morning",
          status: "TAKEN",
          adherenceResult: "ON_TIME",
          delayMinutes: 3,
          confirmedAt: new Date("2026-10-20T08:03:00Z"),
          note: null,
        },
      ];

      vi.spyOn(AdherenceAnalyticsService, "getAdherenceHistory").mockResolvedValueOnce(mockHistory as never);

      const response = await client.callTool({
        name: "get_patient_adherence_history",
        arguments: {
          patientId: "a0000000-0000-4000-8000-000000000001",
        },
      });

      expect(response.isError).toBeFalsy();
      const data = JSON.parse((response.content[0] as { text: string }).text);
      expect(data).toHaveLength(1);
      expect(data[0].adherenceResult).toBe("ON_TIME");
      expect(data[0].medication.name).toBe("Lisinopril");

      await client.close();
      await server.close();
    });

    it("handles authorization errors safely through MCP protocol", async () => {
      const server = createMedicalMcpServer("user-unauthorized");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      vi.spyOn(AdherenceAnalyticsService, "computeAdherenceMetrics").mockRejectedValueOnce(
        new ForbiddenError("You are not allowed to view adherence records for this patient."),
      );

      const response = await client.callTool({
        name: "detect_adherence_patterns",
        arguments: {
          patientId: "a0000000-0000-4000-8000-000000000001",
        },
      });

      expect(response.isError).toBe(true);
      expect((response.content[0] as { text: string }).text).toContain(
        "You are not allowed to view adherence records for this patient.",
      );

      await client.close();
      await server.close();
    });
  });
});
