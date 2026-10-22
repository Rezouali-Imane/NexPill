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
    it("exposes lookup_medication_information with strict read-only and safety annotations", async () => {
      const server = createMedicalMcpServer("user-1");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      const result = await client.listTools();
      expect(result.tools).toHaveLength(1);

      const tool = result.tools[0]!;
      expect(tool.name).toBe("lookup_medication_information");
      expect(tool.description).toContain(
        "Read-only medication name lookup against the public NIH RxNorm terminology service",
      );

      // Verify read-only and idempotency annotations
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });

      // Verify input schema constraints
      expect(tool.inputSchema).toMatchObject({
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
  });
});
