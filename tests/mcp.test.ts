import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

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

describe("Medical MCP endpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires bearer authentication before handling MCP requests", async () => {
    const response = await request(app).post("/mcp").send({});

    expect(response.status).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("does not expose a GET transport", async () => {
    const response = await request(app).get("/mcp");

    expect(response.status).toBe(405);
  });
});
