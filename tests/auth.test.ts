import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}));

vi.mock("../src/config/supabase", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

import { app } from "../src/app";

describe("Auth Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /auth/me", () => {
    it("returns 401 if no Authorization header is provided", async () => {
      const response = await request(app).get("/auth/me");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Missing bearer token" });
    });

    it("returns 401 if the bearer token is invalid or expired", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: "Invalid token" },
      });

      const response = await request(app)
        .get("/auth/me")
        .set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Invalid or expired token" });
      expect(mockGetUser).toHaveBeenCalledWith("invalid-token");
    });

    it("returns user details if the bearer token is valid", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: "11111111-1111-4111-a111-111111111111",
            email: "patient@nexpill.test",
          },
        },
        error: null,
      });

      const response = await request(app)
        .get("/auth/me")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: "11111111-1111-4111-a111-111111111111",
        email: "patient@nexpill.test",
      });
      expect(mockGetUser).toHaveBeenCalledWith("valid-token");
    });
  });
});
