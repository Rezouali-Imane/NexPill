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

describe("Caregiver daily summary", () => {
  const patientId = "11111111-1111-4111-a111-111111111111";
  const caregiverId = "22222222-2222-4222-a222-222222222222";

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
  });

  it("counts scheduled, taken, skipped, and missed doses by exact status", async () => {
    mockPrisma.scheduledDose.findMany.mockResolvedValue([
      { status: "PENDING" },
      { status: "TAKEN" },
      { status: "TAKEN" },
      { status: "SKIPPED" },
      { status: "MISSED" },
      { status: "UNABLE_TO_TAKE" },
    ]);

    const response = await request(app)
      .get(`/caregiver-access/${patientId}/daily-summary`)
      .set("Authorization", "Bearer valid-token")
      .query({ date: "2026-10-17" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      summary: {
        date: "2026-10-17",
        scheduled: 6,
        taken: 2,
        skipped: 1,
        missed: 1,
      },
    });
    expect(mockPrisma.scheduledDose.findMany).toHaveBeenCalledWith({
      where: {
        patientId,
        localDate: new Date("2026-10-17T00:00:00.000Z"),
        status: { not: "CANCELLED" },
      },
      select: { status: true },
    });
  });

  it("rejects invalid dates", async () => {
    const response = await request(app)
      .get(`/caregiver-access/${patientId}/daily-summary`)
      .set("Authorization", "Bearer valid-token")
      .query({ date: "2026-02-30" });

    expect(response.status).toBe(400);
    expect(mockPrisma.scheduledDose.findMany).not.toHaveBeenCalled();
  });

  it("requires schedule-view access", async () => {
    mockPrisma.caregiverAccess.findUnique.mockResolvedValue({
      status: "ACTIVE",
      canViewSchedule: false,
    });

    const response = await request(app)
      .get(`/caregiver-access/${patientId}/daily-summary`)
      .set("Authorization", "Bearer valid-token")
      .query({ date: "2026-10-17" });

    expect(response.status).toBe(403);
    expect(mockPrisma.scheduledDose.findMany).not.toHaveBeenCalled();
  });
});
