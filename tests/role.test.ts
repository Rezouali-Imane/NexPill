import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireRole } from "../src/middleware/require-role";

const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}));

describe("Role authorization middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    const next = vi.fn();
    const middleware = requireRole("ADMIN");

    await middleware(
      { user: undefined } as Request,
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: "Authentication is required",
      }),
    );
  });

  it("rejects authenticated users without the required role", async () => {
    mockFindUnique.mockResolvedValueOnce({
      platformRole: "USER",
      disabledAt: null,
    });
    const next = vi.fn();
    const middleware = requireRole("ADMIN");

    await middleware(
      { user: { id: "user-id" } } as Request,
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: "You do not have permission to access this resource.",
      }),
    );
  });

  it("allows an admin and exposes the verified database role", async () => {
    mockFindUnique.mockResolvedValueOnce({
      platformRole: "ADMIN",
      disabledAt: null,
    });
    const next = vi.fn();
    const request = { user: { id: "admin-id" } } as Request & {
      platformRole?: string;
    };

    await requireRole("ADMIN")(request, {} as Response, next);

    expect(request.platformRole).toBe("ADMIN");
    expect(next).toHaveBeenCalledWith();
  });
});
