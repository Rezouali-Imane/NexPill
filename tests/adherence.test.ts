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
    adherenceAnalysis: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
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
  AdherenceAnalyticsService,
  type AdherenceMetrics,
} from "../src/services/adherence-analytics.service";
import { ForbiddenError, BadRequestError } from "../src/errors";

describe("Adherence Analytics & AI Summaries", () => {
  const patientId = "a0000000-0000-4000-8000-000000000001";
  const caregiverId = "b0000000-0000-4000-8000-000000000002";
  const unauthorizedId = "c0000000-0000-4000-8000-000000000003";

  beforeEach(() => {
    vi.resetAllMocks();

    mockGetUser.mockResolvedValue({
      data: { user: { id: patientId, email: "patient@nexpill.test" } },
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
  });

  describe("AdherenceAnalyticsService.getTimeOfDay", () => {
    it("correctly identifies morning, afternoon, evening, and night buckets", () => {
      expect(AdherenceAnalyticsService.getTimeOfDay(new Date("2026-10-20T08:00:00Z"))).toBe("morning");
      expect(AdherenceAnalyticsService.getTimeOfDay(new Date("2026-10-20T13:30:00Z"))).toBe("afternoon");
      expect(AdherenceAnalyticsService.getTimeOfDay(new Date("2026-10-20T19:00:00Z"))).toBe("evening");
      expect(AdherenceAnalyticsService.getTimeOfDay(new Date("2026-10-20T02:00:00Z"))).toBe("night");
    });
  });

  describe("AdherenceAnalyticsService.determineAdherenceResult", () => {
    const fixedNow = new Date("2026-10-22T12:00:00Z");

    it("evaluates dose taken within 15 min as ON_TIME", () => {
      const scheduledAt = new Date("2026-10-22T08:00:00Z");
      const resolvedAt = new Date("2026-10-22T08:05:00Z");
      const res = AdherenceAnalyticsService.determineAdherenceResult(
        "TAKEN",
        scheduledAt,
        resolvedAt,
        null,
        fixedNow,
      );
      expect(res.adherenceResult).toBe("ON_TIME");
      expect(res.delayMinutes).toBe(5);
    });

    it("evaluates dose taken >= 15 min late as LATE", () => {
      const scheduledAt = new Date("2026-10-22T08:00:00Z");
      const resolvedAt = new Date("2026-10-22T08:45:00Z");
      const res = AdherenceAnalyticsService.determineAdherenceResult(
        "TAKEN",
        scheduledAt,
        resolvedAt,
        null,
        fixedNow,
      );
      expect(res.adherenceResult).toBe("LATE");
      expect(res.delayMinutes).toBe(45);
    });

    it("evaluates dose taken early as ON_TIME with 0 delayMinutes", () => {
      const scheduledAt = new Date("2026-10-22T08:00:00Z");
      const resolvedAt = new Date("2026-10-22T07:55:00Z");
      const res = AdherenceAnalyticsService.determineAdherenceResult(
        "TAKEN",
        scheduledAt,
        resolvedAt,
        null,
        fixedNow,
      );
      expect(res.adherenceResult).toBe("ON_TIME");
      expect(res.delayMinutes).toBe(0);
    });

    it("evaluates SKIPPED, MISSED, and UNABLE_TO_TAKE accurately", () => {
      const past = new Date("2026-10-22T08:00:00Z");
      expect(
        AdherenceAnalyticsService.determineAdherenceResult("SKIPPED", past, null, null, fixedNow)
          .adherenceResult,
      ).toBe("SKIPPED");
      expect(
        AdherenceAnalyticsService.determineAdherenceResult("MISSED", past, null, null, fixedNow)
          .adherenceResult,
      ).toBe("MISSED");
      expect(
        AdherenceAnalyticsService.determineAdherenceResult("UNABLE_TO_TAKE", past, null, null, fixedNow)
          .adherenceResult,
      ).toBe("UNABLE_TO_TAKE");
    });

    it("evaluates past PENDING as UNCONFIRMED and future PENDING as UPCOMING", () => {
      const past = new Date("2026-10-22T08:00:00Z");
      const future = new Date("2026-10-22T18:00:00Z");

      expect(
        AdherenceAnalyticsService.determineAdherenceResult("PENDING", past, null, null, fixedNow)
          .adherenceResult,
      ).toBe("UNCONFIRMED");
      expect(
        AdherenceAnalyticsService.determineAdherenceResult("PENDING", future, null, null, fixedNow)
          .adherenceResult,
      ).toBe("UPCOMING");
    });
  });

  describe("AdherenceAnalyticsService.computeAdherenceMetrics", () => {
    it("aggregates dose counts, confirmation delays, rates, and time-of-day metrics", async () => {
      const scheduledDoses = [
        {
          id: "dose-1",
          status: "TAKEN",
          scheduledAt: new Date("2026-10-20T08:00:00Z"),
          resolvedAt: new Date("2026-10-20T08:05:00Z"), // 5 min delay
          events: [],
        },
        {
          id: "dose-2",
          status: "TAKEN",
          scheduledAt: new Date("2026-10-20T18:00:00Z"),
          resolvedAt: new Date("2026-10-20T18:45:00Z"), // 45 min delay (> 15 min)
          events: [],
        },
        {
          id: "dose-3",
          status: "MISSED",
          scheduledAt: new Date("2026-10-21T08:00:00Z"),
          resolvedAt: null,
          events: [],
        },
        {
          id: "dose-4",
          status: "SKIPPED",
          scheduledAt: new Date("2026-10-21T18:00:00Z"),
          resolvedAt: null,
          events: [],
        },
        {
          id: "dose-5",
          status: "PENDING",
          scheduledAt: new Date("2026-10-22T08:00:00Z"),
          resolvedAt: null,
          events: [],
        },
      ];

      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce(scheduledDoses);

      const result = await AdherenceAnalyticsService.computeAdherenceMetrics(
        patientId,
        patientId,
        new Date("2026-10-20T00:00:00Z"),
        new Date("2026-10-22T23:59:59Z"),
      );

      const { metrics } = result;
      expect(metrics.totalScheduled).toBe(5);
      expect(metrics.confirmedCount).toBe(2);
      expect(metrics.missedCount).toBe(1);
      expect(metrics.skippedCount).toBe(1);
      expect(metrics.unconfirmedCount).toBe(2); // total 5 - confirmed 2 - skipped 1 = 2
      expect(metrics.delayedCount).toBe(1); // 45 min delay
      expect(metrics.confirmationRate).toBe(0.4); // 2/5
      expect(metrics.averageDelayMinutes).toBe(25); // (5 + 45) / 2
      expect(metrics.timeOfDay.morning.scheduled).toBe(3);
      expect(metrics.timeOfDay.morning.confirmed).toBe(1);
      expect(metrics.timeOfDay.evening.scheduled).toBe(2);
      expect(metrics.timeOfDay.evening.confirmed).toBe(1);
    });

    it("evaluates trend as DETERIORATING when second-half adherence drops by 15%", async () => {
      const doses = [
        // First half: 3 taken
        { status: "TAKEN", scheduledAt: new Date("2026-10-15T08:00:00Z"), events: [] },
        { status: "TAKEN", scheduledAt: new Date("2026-10-16T08:00:00Z"), events: [] },
        { status: "TAKEN", scheduledAt: new Date("2026-10-17T08:00:00Z"), events: [] },
        // Second half: 3 missed/pending
        { status: "MISSED", scheduledAt: new Date("2026-10-18T08:00:00Z"), events: [] },
        { status: "PENDING", scheduledAt: new Date("2026-10-19T08:00:00Z"), events: [] },
        { status: "MISSED", scheduledAt: new Date("2026-10-20T08:00:00Z"), events: [] },
      ];

      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce(doses);

      const result = await AdherenceAnalyticsService.computeAdherenceMetrics(
        patientId,
        patientId,
        new Date("2026-10-15T00:00:00Z"),
        new Date("2026-10-20T23:59:59Z"),
      );

      expect(result.metrics.trend).toBe("DETERIORATING");
    });

    it("evaluates trend as IMPROVING when second-half adherence rises by 15%", async () => {
      const doses = [
        // First half: 3 missed
        { status: "MISSED", scheduledAt: new Date("2026-10-15T08:00:00Z"), events: [] },
        { status: "MISSED", scheduledAt: new Date("2026-10-16T08:00:00Z"), events: [] },
        { status: "MISSED", scheduledAt: new Date("2026-10-17T08:00:00Z"), events: [] },
        // Second half: 3 taken
        { status: "TAKEN", scheduledAt: new Date("2026-10-18T08:00:00Z"), events: [] },
        { status: "TAKEN", scheduledAt: new Date("2026-10-19T08:00:00Z"), events: [] },
        { status: "TAKEN", scheduledAt: new Date("2026-10-20T08:00:00Z"), events: [] },
      ];

      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce(doses);

      const result = await AdherenceAnalyticsService.computeAdherenceMetrics(
        patientId,
        patientId,
        new Date("2026-10-15T00:00:00Z"),
        new Date("2026-10-20T23:59:59Z"),
      );

      expect(result.metrics.trend).toBe("IMPROVING");
    });

    it("handles zero scheduled doses gracefully without division by zero errors", async () => {
      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([]);

      const result = await AdherenceAnalyticsService.computeAdherenceMetrics(
        patientId,
        patientId,
        new Date("2026-10-01T00:00:00Z"),
        new Date("2026-10-07T23:59:59Z"),
      );

      expect(result.metrics.totalScheduled).toBe(0);
      expect(result.metrics.confirmationRate).toBe(1.0);
      expect(result.metrics.confirmedCount).toBe(0);
      expect(result.metrics.unconfirmedCount).toBe(0);
      expect(result.metrics.trend).toBe("STABLE");
    });

    it("does not penalize confirmation rate for future upcoming scheduled doses", async () => {
      const pastTaken = {
        status: "TAKEN",
        scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        events: [],
      };
      const futurePending = {
        status: "PENDING",
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
        events: [],
      };

      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([pastTaken, futurePending]);

      const result = await AdherenceAnalyticsService.computeAdherenceMetrics(
        patientId,
        patientId,
        new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      );

      // Only the past dose is due, so 1/1 = 100% confirmation rate
      expect(result.metrics.totalScheduled).toBe(2);
      expect(result.metrics.dueScheduledCount).toBe(1);
      expect(result.metrics.upcomingCount).toBe(1);
      expect(result.metrics.confirmedCount).toBe(1);
      expect(result.metrics.confirmationRate).toBe(1.0);
    });

    it("correctly aggregates multiple simultaneous medications (Ahmed's 5 doses at 18:00)", async () => {
      const scheduledTime = new Date("2026-10-20T18:00:00Z");
      const doses = [
        { status: "TAKEN", scheduledAt: scheduledTime, resolvedAt: new Date("2026-10-20T18:05:00Z"), events: [] },
        { status: "TAKEN", scheduledAt: scheduledTime, resolvedAt: new Date("2026-10-20T18:05:00Z"), events: [] },
        { status: "TAKEN", scheduledAt: scheduledTime, resolvedAt: new Date("2026-10-20T18:05:00Z"), events: [] },
        { status: "MISSED", scheduledAt: scheduledTime, events: [] },
        { status: "MISSED", scheduledAt: scheduledTime, events: [] },
      ];

      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce(doses);

      const result = await AdherenceAnalyticsService.computeAdherenceMetrics(
        patientId,
        patientId,
        new Date("2026-10-20T00:00:00Z"),
        new Date("2026-10-20T23:59:59Z"),
      );

      expect(result.metrics.totalScheduled).toBe(5);
      expect(result.metrics.timeOfDay.evening.scheduled).toBe(5);
      expect(result.metrics.timeOfDay.evening.confirmed).toBe(3);
      expect(result.metrics.timeOfDay.evening.missed).toBe(2);
      expect(result.metrics.timeOfDay.evening.confirmationRate).toBe(0.6);
    });

    it("rejects unauthorized access with ForbiddenError", async () => {
      mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce(null);

      await expect(
        AdherenceAnalyticsService.computeAdherenceMetrics(
          unauthorizedId,
          patientId,
          new Date(),
          new Date(),
        ),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("AdherenceAnalyticsService.detectPatterns", () => {
    const baseMetrics: AdherenceMetrics = {
      totalScheduled: 10,
      confirmedCount: 9,
      unconfirmedCount: 1,
      missedCount: 1,
      skippedCount: 0,
      delayedCount: 0,
      confirmationRate: 0.9,
      averageDelayMinutes: 5,
      trend: "STABLE",
      timeOfDay: {
        morning: { scheduled: 5, confirmed: 5, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 2 },
        afternoon: { scheduled: 0, confirmed: 0, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 0 },
        evening: { scheduled: 5, confirmed: 4, unconfirmed: 1, missed: 1, confirmationRate: 0.8, averageDelayMinutes: 8 },
        night: { scheduled: 0, confirmed: 0, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 0 },
      },
    };

    it("detects repeated consecutive missed doses and escalates risk", () => {
      const doses = [
        { status: "TAKEN" },
        { status: "MISSED" },
        { status: "MISSED" },
        { status: "MISSED" },
      ];

      const metrics = { ...baseMetrics, missedCount: 3, confirmationRate: 0.25 };
      const { patterns, riskAssessment } = AdherenceAnalyticsService.detectPatterns(metrics, doses);

      const missedPattern = patterns.find((p) => p.type === "REPEATED_MISSED_DOSES");
      expect(missedPattern).toBeDefined();
      expect(missedPattern?.severity).toBe("HIGH");
      expect(riskAssessment.level).toBe("HIGH_RISK");
      expect(riskAssessment.reasons.some((r) => r.includes("consecutive doses were missed"))).toBe(true);
    });

    it("detects repeated confirmation delays", () => {
      const doses = [{ status: "TAKEN" }, { status: "TAKEN" }];
      const metrics: AdherenceMetrics = {
        ...baseMetrics,
        delayedCount: 3,
        averageDelayMinutes: 65,
      };

      const { patterns, riskAssessment } = AdherenceAnalyticsService.detectPatterns(metrics, doses);

      const delayPattern = patterns.find((p) => p.type === "REPEATED_DELAYS");
      expect(delayPattern).toBeDefined();
      expect(delayPattern?.severity).toBe("MODERATE");
      expect(riskAssessment.level).toBe("NEEDS_ATTENTION");
      expect(riskAssessment.reasons.some((r) => r.includes("Frequent late confirmations"))).toBe(true);
    });

    it("detects time-of-day friction when evening confirmation is low", () => {
      const doses = [{ status: "TAKEN" }];
      const metrics: AdherenceMetrics = {
        ...baseMetrics,
        timeOfDay: {
          ...baseMetrics.timeOfDay,
          evening: {
            scheduled: 4,
            confirmed: 1,
            unconfirmed: 3,
            missed: 2,
            confirmationRate: 0.25,
            averageDelayMinutes: 20,
          },
        },
      };

      const { patterns, riskAssessment } = AdherenceAnalyticsService.detectPatterns(metrics, doses);

      const todPattern = patterns.find((p) => p.type === "TIME_OF_DAY_FRICTION");
      expect(todPattern).toBeDefined();
      expect(todPattern?.severity).toBe("HIGH");
      expect(riskAssessment.level).toBe("NEEDS_ATTENTION");
      expect(riskAssessment.reasons.some((r) => r.includes("Evening doses show significant friction"))).toBe(true);
    });

    it("detects adherence deterioration", () => {
      const doses = [{ status: "TAKEN" }];
      const metrics: AdherenceMetrics = {
        ...baseMetrics,
        trend: "DETERIORATING",
      };

      const { patterns } = AdherenceAnalyticsService.detectPatterns(metrics, doses);

      const trendPattern = patterns.find((p) => p.type === "ADHERENCE_DETERIORATION");
      expect(trendPattern).toBeDefined();
      expect(trendPattern?.severity).toBe("MODERATE");
    });

    it("handles empty doses array cleanly without flagging false patterns", () => {
      const { patterns, riskAssessment } = AdherenceAnalyticsService.detectPatterns(baseMetrics, []);
      expect(patterns).toHaveLength(0);
      expect(riskAssessment.level).toBe("STABLE");
      expect(riskAssessment.reasons[0]).toContain("No scheduled doses were recorded");
    });

    it("detects multiple non-consecutive missed doses when interspersed with taken doses", () => {
      const doses = [
        { status: "MISSED" },
        { status: "TAKEN" },
        { status: "MISSED" },
        { status: "TAKEN" },
      ];

      const metrics = { ...baseMetrics, missedCount: 2 };
      const { patterns, riskAssessment } = AdherenceAnalyticsService.detectPatterns(metrics, doses);

      const missedPattern = patterns.find((p) => p.type === "REPEATED_MISSED_DOSES");
      expect(missedPattern).toBeDefined();
      expect(missedPattern?.severity).toBe("MODERATE");
      expect(missedPattern?.description).toContain("Multiple missed doses detected");
      expect(riskAssessment.reasons.some((r) => r.includes("2 missed doses in the observation window"))).toBe(true);
    });
  });

  describe("AdherenceAnalyticsService.synthesizeNarrative", () => {
    it("generates grounded summary text and caregiver follow-up suggestions", () => {
      const metrics: AdherenceMetrics = {
        totalScheduled: 20,
        confirmedCount: 18,
        unconfirmedCount: 2,
        missedCount: 1,
        skippedCount: 1,
        delayedCount: 3,
        confirmationRate: 0.9,
        averageDelayMinutes: 30,
        trend: "STABLE",
        timeOfDay: {
          morning: { scheduled: 10, confirmed: 10, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 5 },
          afternoon: { scheduled: 0, confirmed: 0, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 0 },
          evening: { scheduled: 10, confirmed: 8, unconfirmed: 2, missed: 1, confirmationRate: 0.8, averageDelayMinutes: 40 },
          night: { scheduled: 0, confirmed: 0, unconfirmed: 0, missed: 0, confirmationRate: 1, averageDelayMinutes: 0 },
        },
      };

      const patterns = [
        {
          type: "REPEATED_DELAYS" as const,
          severity: "INFO" as const,
          description: "Repeated confirmation delays: 3 doses confirmed late.",
          evidence: {},
        },
      ];

      const narrative = AdherenceAnalyticsService.synthesizeNarrative(
        metrics,
        patterns,
        "NEEDS_ATTENTION",
      );

      expect(narrative.summaryText).toContain("Patient adherence is at 90% (18/20 doses confirmed).");
      expect(narrative.summaryText).toContain("Repeated confirmation delays: 3 doses confirmed late.");
      expect(narrative.suggestedFollowUp).toContain("Patient often takes medication late.");
    });
  });

  describe("AdherenceAnalyticsService.generateReport", () => {
    it("persists analysis record and returns structured report", async () => {
      const mockAnalysisRecord = {
        id: "analysis-uuid-1",
        patientId,
        kind: "DAILY_SUMMARY",
        periodStart: new Date("2026-10-15T00:00:00Z"),
        periodEnd: new Date("2026-10-22T00:00:00Z"),
        riskLevel: "STABLE",
        metrics: {},
        reasons: {},
        summaryText: "Test summary",
        generator: "AI_MODEL",
        modelName: "nexpill-adherence-ml-v1",
        promptVersion: "1.0",
        createdAt: new Date(),
      };

      mockPrisma.adherenceAnalysis.create.mockResolvedValueOnce(mockAnalysisRecord);

      const report = await AdherenceAnalyticsService.generateReport(patientId, patientId, {
        periodStart: "2026-10-15T00:00:00Z",
        periodEnd: "2026-10-22T00:00:00Z",
      });

      expect(report.patientId).toBe(patientId);
      expect(report.analysisRecordId).toBe("analysis-uuid-1");
      expect(mockPrisma.adherenceAnalysis.create).toHaveBeenCalledTimes(1);
    });

    it("throws BadRequestError if periodStart is later than periodEnd", async () => {
      await expect(
        AdherenceAnalyticsService.generateReport(patientId, patientId, {
          periodStart: "2026-10-22T00:00:00Z",
          periodEnd: "2026-10-15T00:00:00Z",
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("AdherenceAnalyticsService.getLatestAnalysis", () => {
    it("returns latest persisted record ordered by createdAt desc", async () => {
      const mockRecord = {
        id: "analysis-uuid-latest",
        patientId,
        riskLevel: "NEEDS_ATTENTION",
        summaryText: "Recent summary",
      };

      mockPrisma.adherenceAnalysis.findFirst.mockResolvedValueOnce(mockRecord);

      const result = await AdherenceAnalyticsService.getLatestAnalysis(patientId, patientId);
      expect(result).toEqual(mockRecord);
      expect(mockPrisma.adherenceAnalysis.findFirst).toHaveBeenCalledWith({
        where: { patientId },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("AdherenceAnalyticsService.getAdherenceHistory", () => {
    it("returns chronological doses with observational results and medication details", async () => {
      const mockDoses = [
        {
          id: "dose-101",
          scheduleId: "sched-101",
          scheduledAt: new Date("2026-10-20T08:00:00Z"),
          status: "TAKEN",
          resolvedAt: new Date("2026-10-20T08:04:00Z"),
          schedule: {
            medication: {
              id: "med-1",
              name: "Metformin",
              dosageText: "500mg",
              route: "ORAL",
            },
          },
          events: [{ note: "Taken with breakfast" }],
        },
        {
          id: "dose-102",
          scheduleId: "sched-101",
          scheduledAt: new Date("2026-10-20T18:00:00Z"),
          status: "MISSED",
          resolvedAt: null,
          schedule: {
            medication: {
              id: "med-1",
              name: "Metformin",
              dosageText: "500mg",
              route: "ORAL",
            },
          },
          events: [],
        },
      ];

      mockPrisma.scheduledDose.findMany.mockResolvedValueOnce(mockDoses);

      const history = await AdherenceAnalyticsService.getAdherenceHistory(
        patientId,
        patientId,
        { limit: 50 },
      );

      expect(history).toHaveLength(2);
      expect(history[0].doseId).toBe("dose-101");
      expect(history[0].adherenceResult).toBe("ON_TIME");
      expect(history[0].delayMinutes).toBe(4);
      expect(history[0].medication.name).toBe("Metformin");
      expect(history[0].note).toBe("Taken with breakfast");

      expect(history[1].doseId).toBe("dose-102");
      expect(history[1].adherenceResult).toBe("MISSED");
      expect(history[1].delayMinutes).toBeNull();
    });

    it("rejects unauthorized access with ForbiddenError", async () => {
      mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce(null);

      await expect(
        AdherenceAnalyticsService.getAdherenceHistory(unauthorizedId, patientId),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Adherence REST API Endpoints", () => {
    describe("GET /adherence/:patientId/summary", () => {
      it("requires bearer token (401)", async () => {
        const res = await request(app).get(`/adherence/${patientId}/summary`);
        expect(res.status).toBe(401);
      });

      it("rejects non-uuid patientId with 400", async () => {
        const res = await request(app)
          .get("/adherence/invalid-id/summary")
          .set("Authorization", "Bearer valid-token");
        expect(res.status).toBe(400);
      });

      it("returns existing analysis if found (200)", async () => {
        const existingRecord = {
          id: "record-123",
          patientId,
          kind: "DAILY_SUMMARY",
          riskLevel: "STABLE",
          summaryText: "Existing analysis report",
        };

        mockPrisma.adherenceAnalysis.findFirst.mockResolvedValueOnce(existingRecord);

        const res = await request(app)
          .get(`/adherence/${patientId}/summary`)
          .set("Authorization", "Bearer valid-token");

        expect(res.status).toBe(200);
        expect(res.body.analysis.id).toBe("record-123");
        expect(mockPrisma.adherenceAnalysis.create).not.toHaveBeenCalled();
      });

      it("generates 7-day report on the fly if no record exists (200)", async () => {
        mockPrisma.adherenceAnalysis.findFirst.mockResolvedValueOnce(null);
        mockPrisma.adherenceAnalysis.create.mockResolvedValueOnce({
          id: "record-generated",
          patientId,
          kind: "DAILY_SUMMARY",
          riskLevel: "STABLE",
          summaryText: "Freshly generated summary",
        });

        const res = await request(app)
          .get(`/adherence/${patientId}/summary`)
          .set("Authorization", "Bearer valid-token");

        expect(res.status).toBe(200);
        expect(res.body.analysis.analysisRecordId).toBe("record-generated");
        expect(mockPrisma.adherenceAnalysis.create).toHaveBeenCalledTimes(1);
      });

      it("rejects unauthorized caregiver access with 403", async () => {
        mockGetUser.mockResolvedValueOnce({
          data: { user: { id: caregiverId, email: "caregiver@nexpill.test" } },
          error: null,
        });
        mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce(null);

        const res = await request(app)
          .get(`/adherence/${patientId}/summary`)
          .set("Authorization", "Bearer valid-token");

        expect(res.status).toBe(403);
      });
    });

    describe("POST /adherence/:patientId/analyze", () => {
      it("requires bearer token (401)", async () => {
        const res = await request(app).post(`/adherence/${patientId}/analyze`).send({});
        expect(res.status).toBe(401);
      });

      it("rejects invalid date range with 400", async () => {
        const res = await request(app)
          .post(`/adherence/${patientId}/analyze`)
          .set("Authorization", "Bearer valid-token")
          .send({
            periodStart: "2026-10-22T00:00:00Z",
            periodEnd: "2026-10-15T00:00:00Z",
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain("periodStart cannot be later than periodEnd");
      });

      it("computes metrics, detects patterns, and persists structured report (201)", async () => {
        mockPrisma.adherenceAnalysis.create.mockResolvedValueOnce({
          id: "record-analyzed",
          patientId,
          riskLevel: "NEEDS_ATTENTION",
        });

        const res = await request(app)
          .post(`/adherence/${patientId}/analyze`)
          .set("Authorization", "Bearer valid-token")
          .send({
            periodStart: "2026-10-01T00:00:00Z",
            periodEnd: "2026-10-08T00:00:00Z",
            kind: "DAILY_SUMMARY",
            generator: "AI_MODEL",
          });

        expect(res.status).toBe(201);
        expect(res.body.report.patientId).toBe(patientId);
        expect(res.body.report.analysisRecordId).toBe("record-analyzed");
        expect(res.body.report.metrics).toBeDefined();
        expect(res.body.report.patterns).toBeDefined();
        expect(res.body.report.riskAssessment).toBeDefined();
      });

      it("rejects unauthorized access with 403", async () => {
        mockGetUser.mockResolvedValueOnce({
          data: { user: { id: unauthorizedId, email: "unauthorized@nexpill.test" } },
          error: null,
        });
        mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce(null);

        const res = await request(app)
          .post(`/adherence/${patientId}/analyze`)
          .set("Authorization", "Bearer valid-token")
          .send({});

        expect(res.status).toBe(403);
      });
    });

    describe("GET /adherence/:patientId/history", () => {
      it("requires bearer token (401)", async () => {
        const res = await request(app).get(`/adherence/${patientId}/history`);
        expect(res.status).toBe(401);
      });

      it("rejects non-uuid patientId with 400", async () => {
        const res = await request(app)
          .get("/adherence/invalid-uuid/history")
          .set("Authorization", "Bearer valid-token");
        expect(res.status).toBe(400);
      });

      it("returns adherence history items successfully (200)", async () => {
        const mockDoses = [
          {
            id: "dose-201",
            scheduleId: "sched-201",
            scheduledAt: new Date("2026-10-21T08:00:00Z"),
            status: "TAKEN",
            resolvedAt: new Date("2026-10-21T08:25:00Z"), // 25 min late
            schedule: {
              medication: {
                id: "med-2",
                name: "Amlodipine",
                dosageText: "5mg",
                route: "ORAL",
              },
            },
            events: [],
          },
        ];

        mockPrisma.scheduledDose.findMany.mockResolvedValueOnce(mockDoses);

        const res = await request(app)
          .get(`/adherence/${patientId}/history?limit=10`)
          .set("Authorization", "Bearer valid-token");

        expect(res.status).toBe(200);
        expect(res.body.patientId).toBe(patientId);
        expect(res.body.count).toBe(1);
        expect(res.body.history[0].doseId).toBe("dose-201");
        expect(res.body.history[0].adherenceResult).toBe("LATE");
        expect(res.body.history[0].delayMinutes).toBe(25);
        expect(res.body.history[0].medication.name).toBe("Amlodipine");
      });

      it("rejects unauthorized access with 403", async () => {
        mockGetUser.mockResolvedValueOnce({
          data: { user: { id: unauthorizedId, email: "unauthorized@nexpill.test" } },
          error: null,
        });
        mockPrisma.caregiverAccess.findUnique.mockResolvedValueOnce(null);

        const res = await request(app)
          .get(`/adherence/${patientId}/history`)
          .set("Authorization", "Bearer valid-token");

        expect(res.status).toBe(403);
      });

      it("filters history by startDate and endDate query parameters", async () => {
        mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([]);

        const res = await request(app)
          .get(`/adherence/${patientId}/history?startDate=2026-10-01T00:00:00Z&endDate=2026-10-07T23:59:59Z`)
          .set("Authorization", "Bearer valid-token");

        expect(res.status).toBe(200);
        expect(mockPrisma.scheduledDose.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              patientId,
              scheduledAt: {
                gte: new Date("2026-10-01T00:00:00Z"),
                lte: new Date("2026-10-07T23:59:59Z"),
              },
            }),
          }),
        );
      });

      it("rejects invalid startDate with 400 Bad Request", async () => {
        const res = await request(app)
          .get(`/adherence/${patientId}/history?startDate=invalid-date`)
          .set("Authorization", "Bearer valid-token");

        expect(res.status).toBe(400);
        expect(res.body.error).toContain("Invalid date format for startDate");
      });

      it("rejects invalid endDate with 400 Bad Request", async () => {
        const res = await request(app)
          .get(`/adherence/${patientId}/history?endDate=invalid-date`)
          .set("Authorization", "Bearer valid-token");

        expect(res.status).toBe(400);
        expect(res.body.error).toContain("Invalid date format for endDate");
      });

      it("respects limit query parameter", async () => {
        mockPrisma.scheduledDose.findMany.mockResolvedValueOnce([]);

        const res = await request(app)
          .get(`/adherence/${patientId}/history?limit=5`)
          .set("Authorization", "Bearer valid-token");

        expect(res.status).toBe(200);
        expect(mockPrisma.scheduledDose.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            take: 5,
          }),
        );
      });

      it("rejects non-integer or non-positive limit with 400 Bad Request", async () => {
        const res1 = await request(app)
          .get(`/adherence/${patientId}/history?limit=abc`)
          .set("Authorization", "Bearer valid-token");

        expect(res1.status).toBe(400);
        expect(res1.body.error).toContain("limit must be a positive integer");

        const res2 = await request(app)
          .get(`/adherence/${patientId}/history?limit=-5`)
          .set("Authorization", "Bearer valid-token");

        expect(res2.status).toBe(400);
        expect(res2.body.error).toContain("limit must be a positive integer");
      });
    });
  });
});
