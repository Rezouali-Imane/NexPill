import type {
  AdherenceAnalysis,
  AnalysisGenerator,
  AnalysisKind,
  DoseStatus,
  Prisma,
  RiskLevel,
} from "@prisma/client";
import { prisma } from "../db/prisma";
import { BadRequestError } from "../errors";
import { parseDate, validateUuid } from "../utils/validation";
import { AccessControlService } from "./access-control.service";
import { AiSummaryService } from "./ai-summary.service";

export type TimeOfDayBucket = "morning" | "afternoon" | "evening" | "night";

export interface TimeOfDayMetrics {
  scheduled: number;
  confirmed: number;
  unconfirmed: number;
  missed: number;
  confirmationRate: number;
  averageDelayMinutes: number;
}

export interface AdherenceMetrics {
  totalScheduled: number;
  dueScheduledCount: number;
  upcomingCount: number;
  confirmedCount: number;
  unconfirmedCount: number;
  missedCount: number;
  skippedCount: number;
  delayedCount: number;
  confirmationRate: number;
  averageDelayMinutes: number;
  trend: "IMPROVING" | "STABLE" | "DETERIORATING";
  timeOfDay: Record<TimeOfDayBucket, TimeOfDayMetrics>;
}

export type AdherenceResultStatus =
  | "ON_TIME"
  | "LATE"
  | "UNCONFIRMED"
  | "MISSED"
  | "SKIPPED"
  | "UNABLE_TO_TAKE"
  | "UPCOMING";

export interface AdherenceHistoryItem {
  doseId: string;
  scheduleId: string;
  medication: {
    id?: string;
    name: string;
    dosage?: string | null;
    route?: string | null;
  };
  scheduledAt: Date;
  timeOfDay: TimeOfDayBucket;
  status: DoseStatus;
  adherenceResult: AdherenceResultStatus;
  delayMinutes: number | null;
  confirmedAt: Date | null;
  note: string | null;
}

export interface AdherencePattern {
  type:
    | "REPEATED_MISSED_DOSES"
    | "REPEATED_DELAYS"
    | "TIME_OF_DAY_FRICTION"
    | "ADHERENCE_DETERIORATION";
  severity: "INFO" | "MODERATE" | "HIGH";
  description: string;
  evidence: Record<string, unknown>;
}

export interface StructuredAdherenceReport {
  patientId: string;
  period: {
    start: Date;
    end: Date;
  };
  metrics: AdherenceMetrics;
  patterns: AdherencePattern[];
  riskAssessment: {
    level: RiskLevel;
    score: number; // 0.0 (safe) to 1.0 (critical)
    reasons: string[];
  };
  suggestedFollowUp: string;
  summaryText: string;
  analysisRecordId?: string;
}

export class AdherenceAnalyticsService {
  /**
   * Helper to categorize a scheduled date/time into a local time-of-day bucket.
   */
  static getTimeOfDay(date: Date): TimeOfDayBucket {
    const hours = date.getUTCHours();
    if (hours >= 5 && hours < 12) {
      return "morning";
    }
    if (hours >= 12 && hours < 17) {
      return "afternoon";
    }
    if (hours >= 17 && hours < 22) {
      return "evening";
    }
    return "night";
  }

  /**
   * Evaluates exact observational outcome and latency for a scheduled dose event.
   */
  static determineAdherenceResult(
    status: DoseStatus,
    scheduledAt: Date,
    resolvedAt?: Date | null,
    eventOccurredAt?: Date | null,
    now: Date = new Date(),
  ): {
    adherenceResult: AdherenceResultStatus;
    delayMinutes: number | null;
    confirmedAt: Date | null;
  } {
    if (status === "TAKEN") {
      const confirmedAt = resolvedAt ?? eventOccurredAt ?? null;
      let delayMinutes = 0;
      if (confirmedAt) {
        delayMinutes = Math.max(
          0,
          Math.round((new Date(confirmedAt).getTime() - scheduledAt.getTime()) / (60 * 1000)),
        );
      }
      return {
        adherenceResult: delayMinutes >= 15 ? "LATE" : "ON_TIME",
        delayMinutes,
        confirmedAt: confirmedAt ? new Date(confirmedAt) : null,
      };
    }

    if (status === "SKIPPED") {
      return { adherenceResult: "SKIPPED", delayMinutes: null, confirmedAt: null };
    }

    if (status === "MISSED") {
      return { adherenceResult: "MISSED", delayMinutes: null, confirmedAt: null };
    }

    if (status === "UNABLE_TO_TAKE") {
      return { adherenceResult: "UNABLE_TO_TAKE", delayMinutes: null, confirmedAt: null };
    }

    // Status is PENDING
    if (scheduledAt.getTime() > now.getTime()) {
      return { adherenceResult: "UPCOMING", delayMinutes: null, confirmedAt: null };
    }

    return { adherenceResult: "UNCONFIRMED", delayMinutes: null, confirmedAt: null };
  }

  /**
   * Fetches dose history and computes deterministic adherence metrics for a patient.
   */
  static async computeAdherenceMetrics(
    actorUserId: string,
    patientId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ metrics: AdherenceMetrics; doses: unknown[] }> {
    const validPatientId = validateUuid(patientId, "patientId");
    await AccessControlService.assertPatientAccess(actorUserId, validPatientId, "read");

    const doses = await prisma.scheduledDose.findMany({
      where: {
        patientId: validPatientId,
        scheduledAt: {
          gte: periodStart,
          lte: periodEnd,
        },
        status: { not: "CANCELLED" },
      },
      include: {
        schedule: {
          include: {
            medication: true,
          },
        },
        events: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    const now = new Date();
    const initBucket = (): TimeOfDayMetrics => ({
      scheduled: 0,
      confirmed: 0,
      unconfirmed: 0,
      missed: 0,
      confirmationRate: 1,
      averageDelayMinutes: 0,
    });

    const timeOfDay: Record<TimeOfDayBucket, TimeOfDayMetrics> = {
      morning: initBucket(),
      afternoon: initBucket(),
      evening: initBucket(),
      night: initBucket(),
    };

    const bucketDelays: Record<TimeOfDayBucket, number[]> = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
    };

    let confirmedCount = 0;
    let missedCount = 0;
    let skippedCount = 0;
    let delayedCount = 0;
    let dueScheduledCount = 0;
    let upcomingCount = 0;
    const allDelays: number[] = [];

    for (const dose of doses) {
      const bucket = this.getTimeOfDay(dose.scheduledAt);
      const isPastOrDue =
        dose.scheduledAt.getTime() <= now.getTime() || dose.status !== "PENDING";

      if (isPastOrDue) {
        dueScheduledCount++;
      } else {
        upcomingCount++;
      }
      timeOfDay[bucket].scheduled++;

      if (dose.status === "TAKEN") {
        confirmedCount++;
        timeOfDay[bucket].confirmed++;

        // Calculate confirmation delay in minutes
        const confirmationTime = dose.resolvedAt ?? dose.events[0]?.occurredAt;
        if (confirmationTime) {
          const delayMinutes = Math.max(
            0,
            Math.round(
              (new Date(confirmationTime).getTime() - dose.scheduledAt.getTime()) /
                (60 * 1000),
            ),
          );
          allDelays.push(delayMinutes);
          bucketDelays[bucket].push(delayMinutes);

          if (delayMinutes >= 15) {
            delayedCount++;
          }
        }
      } else if (dose.status === "MISSED") {
        missedCount++;
        timeOfDay[bucket].missed++;
      } else if (dose.status === "SKIPPED") {
        skippedCount++;
      } else {
        // PENDING past scheduled time or UNABLE_TO_TAKE
        if (isPastOrDue) {
          timeOfDay[bucket].unconfirmed++;
        }
      }
    }

    // Unconfirmed count represents due doses that were not confirmed or skipped
    const unconfirmedCount =
      dueScheduledCount > 0
        ? Math.max(0, dueScheduledCount - confirmedCount - skippedCount)
        : doses.length > 0
          ? Math.max(0, doses.length - confirmedCount - skippedCount)
          : 0;

    // Confirmation rate evaluated against due doses to prevent future scheduled doses from depressing the score
    const rateDenominator = dueScheduledCount > 0 ? dueScheduledCount : doses.length;
    const confirmationRate =
      rateDenominator > 0 ? Number((confirmedCount / rateDenominator).toFixed(3)) : 1;

    // Calculate rates and averages per bucket
    for (const key of Object.keys(timeOfDay) as TimeOfDayBucket[]) {
      const b = timeOfDay[key];
      b.unconfirmed = Math.max(0, b.scheduled - b.confirmed - b.missed);
      b.confirmationRate =
        b.scheduled > 0 ? Number((b.confirmed / b.scheduled).toFixed(3)) : 1;
      const delays = bucketDelays[key];
      b.averageDelayMinutes =
        delays.length > 0
          ? Math.round(delays.reduce((sum, d) => sum + d, 0) / delays.length)
          : 0;
    }

    const averageDelayMinutes =
      allDelays.length > 0
        ? Math.round(allDelays.reduce((sum, d) => sum + d, 0) / allDelays.length)
        : 0;

    // Trend calculation (compare first half of period to second half)
    let trend: "IMPROVING" | "STABLE" | "DETERIORATING" = "STABLE";
    const dueDoses = doses.filter(
      (d) => d.scheduledAt.getTime() <= now.getTime() || d.status !== "PENDING",
    );
    const trendTarget = dueDoses.length >= 6 ? dueDoses : doses;

    if (trendTarget.length >= 6) {
      const mid = Math.floor(trendTarget.length / 2);
      const firstHalf = trendTarget.slice(0, mid);
      const secondHalf = trendTarget.slice(mid);

      const firstRate =
        firstHalf.length > 0
          ? firstHalf.filter((d) => d.status === "TAKEN").length / firstHalf.length
          : 1;
      const secondRate =
        secondHalf.length > 0
          ? secondHalf.filter((d) => d.status === "TAKEN").length / secondHalf.length
          : 1;

      if (secondRate <= firstRate - 0.15) {
        trend = "DETERIORATING";
      } else if (secondRate >= firstRate + 0.15) {
        trend = "IMPROVING";
      }
    }

    const metrics: AdherenceMetrics = {
      totalScheduled: doses.length,
      dueScheduledCount,
      upcomingCount,
      confirmedCount,
      unconfirmedCount,
      missedCount,
      skippedCount,
      delayedCount,
      confirmationRate,
      averageDelayMinutes,
      trend,
      timeOfDay,
    };

    return { metrics, doses };
  }

  /**
   * Pattern Detector: Identifies repeated missed doses, delayed doses, and time-of-day friction.
   */
  static detectPatterns(
    metrics: AdherenceMetrics,
    doses: unknown[],
  ): { patterns: AdherencePattern[]; riskAssessment: { level: RiskLevel; score: number; reasons: string[] } } {
    if (doses.length === 0) {
      return {
        patterns: [],
        riskAssessment: {
          level: "STABLE",
          score: 0.0,
          reasons: ["No scheduled doses were recorded in this observation period."],
        },
      };
    }

    const patterns: AdherencePattern[] = [];
    const reasons: string[] = [];
    let riskScore = 0.0;

    // 1. Repeated Missed Doses Pattern
    let consecutiveMissed = 0;
    let maxConsecutiveMissed = 0;
    const nowTime = Date.now();

    for (const dose of doses as Array<{ status: string; scheduledAt?: Date }>) {
      const isUnconfirmedOrMissed =
        dose.status === "MISSED" ||
        (dose.status === "PENDING" && (!dose.scheduledAt || dose.scheduledAt.getTime() <= nowTime));

      if (isUnconfirmedOrMissed) {
        consecutiveMissed++;
        if (consecutiveMissed > maxConsecutiveMissed) {
          maxConsecutiveMissed = consecutiveMissed;
        }
      } else if (dose.status === "TAKEN") {
        consecutiveMissed = 0;
      }
    }

    if (maxConsecutiveMissed >= 2) {
      patterns.push({
        type: "REPEATED_MISSED_DOSES",
        severity: maxConsecutiveMissed >= 3 ? "HIGH" : "MODERATE",
        description: `Patient had ${maxConsecutiveMissed} consecutive missed doses without confirmation.`,
        evidence: { maxConsecutiveMissed, totalMissed: metrics.missedCount },
      });
      reasons.push(
        `${maxConsecutiveMissed} consecutive doses were missed without confirmation.`,
      );
      riskScore += maxConsecutiveMissed >= 3 ? 0.45 : 0.3;
    } else if (metrics.missedCount >= 2) {
      patterns.push({
        type: "REPEATED_MISSED_DOSES",
        severity: "MODERATE",
        description: `Multiple missed doses detected (${metrics.missedCount} doses missed in review period).`,
        evidence: { missedCount: metrics.missedCount },
      });
      reasons.push(`${metrics.missedCount} missed doses in the observation window.`);
      riskScore += 0.25;
    }

    // 2. Repeated Delays Pattern
    if (metrics.delayedCount >= 2) {
      const severity = metrics.averageDelayMinutes >= 60 ? "MODERATE" : "INFO";
      patterns.push({
        type: "REPEATED_DELAYS",
        severity,
        description: `Repeated confirmation delays: ${metrics.delayedCount} doses confirmed late (averaging ${metrics.averageDelayMinutes} minutes delay).`,
        evidence: {
          delayedCount: metrics.delayedCount,
          averageDelayMinutes: metrics.averageDelayMinutes,
        },
      });
      reasons.push(
        `Frequent late confirmations (average delay of ${metrics.averageDelayMinutes} minutes across ${metrics.delayedCount} doses).`,
      );
      riskScore += 0.2;
    }

    // 3. Time-of-Day Friction Pattern
    const tod = metrics.timeOfDay;
    for (const bucket of ["morning", "afternoon", "evening", "night"] as TimeOfDayBucket[]) {
      const b = tod[bucket];
      if (b.scheduled >= 3) {
        // Compare with overall confirmation rate or other active buckets
        if (b.confirmationRate < 0.75) {
          patterns.push({
            type: "TIME_OF_DAY_FRICTION",
            severity: b.confirmationRate < 0.6 ? "HIGH" : "MODERATE",
            description: `${bucket.charAt(0).toUpperCase() + bucket.slice(1)} doses have an elevated unconfirmed rate (${Math.round((1 - b.confirmationRate) * 100)}% unconfirmed).`,
            evidence: {
              bucket,
              scheduled: b.scheduled,
              confirmed: b.confirmed,
              rate: b.confirmationRate,
            },
          });
          reasons.push(
            `${bucket.charAt(0).toUpperCase() + bucket.slice(1)} doses show significant friction (${Math.round(b.confirmationRate * 100)}% confirmation rate across ${b.scheduled} scheduled doses).`,
          );
          riskScore += 0.25;
        }
      }
    }

    // 4. Adherence Deterioration Trend
    if (metrics.trend === "DETERIORATING") {
      patterns.push({
        type: "ADHERENCE_DETERIORATION",
        severity: "MODERATE",
        description:
          "Adherence velocity is deteriorating: confirmation rates in the second half of the period dropped significantly.",
        evidence: { trend: metrics.trend },
      });
      reasons.push("Recent adherence momentum has deteriorated compared to earlier days.");
      riskScore += 0.2;
    }

    // Normalize risk score to [0.0, 1.0]
    riskScore = Math.min(1.0, Number(riskScore.toFixed(2)));

    // Determine categorical risk level
    let level: RiskLevel = "STABLE";
    if (riskScore >= 0.5 || metrics.confirmationRate < 0.65 || maxConsecutiveMissed >= 3) {
      level = "HIGH_RISK";
    } else if (riskScore >= 0.25 || metrics.confirmationRate < 0.85 || patterns.length > 0) {
      level = "NEEDS_ATTENTION";
    }

    if (reasons.length === 0) {
      reasons.push("Consistent on-time adherence with no concerning behavioral patterns.");
    }

    return {
      patterns,
      riskAssessment: {
        level,
        score: riskScore,
        reasons,
      },
    };
  }

  /**
   * Generates a grounded, compassionate natural language summary and caregiver follow-up.
   */
  static synthesizeNarrative(
    metrics: AdherenceMetrics,
    patterns: AdherencePattern[],
    riskLevel: RiskLevel,
  ): { summaryText: string; suggestedFollowUp: string } {
    const ratePercent = Math.round(metrics.confirmationRate * 100);
    const parts: string[] = [];

    parts.push(
      `Patient adherence is at ${ratePercent}% (${metrics.confirmedCount}/${metrics.totalScheduled} doses confirmed).`,
    );

    if (patterns.length > 0) {
      const patternDescriptions = patterns.map((p) => p.description).join(" ");
      parts.push(patternDescriptions);
    } else {
      parts.push("Doses are being taken consistently with minimal delay.");
    }

    let suggestedFollowUp = "Continue standard schedule monitoring.";

    if (riskLevel === "HIGH_RISK") {
      const todFriction = patterns.find((p) => p.type === "TIME_OF_DAY_FRICTION");
      if (todFriction) {
        const bucket = (todFriction.evidence as { bucket?: string }).bucket ?? "scheduled";
        suggestedFollowUp = `Immediate check-in recommended: Patient is frequently missing ${bucket} doses. Review ${bucket} routine and verify caregiver assistance.`;
      } else {
        suggestedFollowUp =
          "Immediate caregiver check-in recommended: multiple doses remain unconfirmed or missed.";
      }
    } else if (riskLevel === "NEEDS_ATTENTION") {
      const delayed = patterns.find((p) => p.type === "REPEATED_DELAYS");
      const todFriction = patterns.find((p) => p.type === "TIME_OF_DAY_FRICTION");

      if (todFriction) {
        const bucket = (todFriction.evidence as { bucket?: string }).bucket ?? "evening";
        suggestedFollowUp = `Check whether the patient needs additional support with their ${bucket} routine or if reminder times should be adjusted.`;
      } else if (delayed) {
        suggestedFollowUp =
          "Patient often takes medication late. Consider discussing whether reminder offsets or notification channels should be customized.";
      } else {
        suggestedFollowUp =
          "Monitor next scheduled doses to ensure adherence stabilizes.";
      }
    }

    parts.push(`Suggested follow-up: ${suggestedFollowUp}`);

    return {
      summaryText: parts.join(" "),
      suggestedFollowUp,
    };
  }

  /**
   * Generates an explainable structured adherence summary report and persists it to AdherenceAnalysis.
   */
  static async generateReport(
    actorUserId: string,
    patientId: string,
    options: {
      periodStart?: Date | string;
      periodEnd?: Date | string;
      kind?: AnalysisKind;
      generator?: AnalysisGenerator;
    } = {},
  ): Promise<StructuredAdherenceReport> {
    const end = options.periodEnd ? parseDate(options.periodEnd, "periodEnd") : new Date();
    const start = options.periodStart
      ? parseDate(options.periodStart, "periodStart")
      : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000); // Default to last 7 days

    if (start > end) {
      throw new BadRequestError("periodStart cannot be later than periodEnd.");
    }

    const { metrics, doses } = await this.computeAdherenceMetrics(
      actorUserId,
      patientId,
      start,
      end,
    );

    const { patterns, riskAssessment } = this.detectPatterns(metrics, doses);
    const fallbackNarrative = this.synthesizeNarrative(
      metrics,
      patterns,
      riskAssessment.level,
    );

    let summaryText = fallbackNarrative.summaryText;
    let suggestedFollowUp = fallbackNarrative.suggestedFollowUp;
    let generator: AnalysisGenerator = options.generator ?? "AI_MODEL";
    let modelName = "rules-deterministic-v1";
    let promptVersion: string | undefined = undefined;

    if (generator === "AI_MODEL") {
      const aiResult = await AiSummaryService.generateSummary(
        metrics,
        patterns,
        riskAssessment.level,
        fallbackNarrative,
      );
      summaryText = aiResult.summaryText;
      suggestedFollowUp = aiResult.suggestedFollowUp;
      generator = aiResult.generator;
      modelName = aiResult.modelName;
      promptVersion = aiResult.promptVersion;
    }

    // Persist to AdherenceAnalysis database model
    const analysis = await prisma.adherenceAnalysis.create({
      data: {
        patientId,
        kind: options.kind ?? "DAILY_SUMMARY",
        periodStart: start,
        periodEnd: end,
        riskLevel: riskAssessment.level,
        metrics: metrics as unknown as Prisma.InputJsonValue,
        reasons: {
          score: riskAssessment.score,
          reasons: riskAssessment.reasons,
          patterns,
        } as unknown as Prisma.InputJsonValue,
        summaryText,
        generator,
        modelName,
        promptVersion,
      },
    });

    return {
      patientId,
      period: { start, end },
      metrics,
      patterns,
      riskAssessment,
      suggestedFollowUp,
      summaryText,
      analysisRecordId: analysis.id,
    };
  }

  /**
   * Retrieves the latest persisted adherence analysis report for a patient.
   */
  static async getLatestAnalysis(
    actorUserId: string,
    patientId: string,
  ): Promise<AdherenceAnalysis | null> {
    const validPatientId = validateUuid(patientId, "patientId");
    await AccessControlService.assertPatientAccess(actorUserId, validPatientId, "read");

    return prisma.adherenceAnalysis.findFirst({
      where: { patientId: validPatientId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves standardized chronological adherence history with observational outcomes.
   * Provides consistent data for frontend views and AI agent tools.
   */
  static async getAdherenceHistory(
    actorUserId: string,
    patientId: string,
    options: {
      startDate?: Date | string;
      endDate?: Date | string;
      limit?: number;
    } = {},
  ): Promise<AdherenceHistoryItem[]> {
    const validPatientId = validateUuid(patientId, "patientId");
    await AccessControlService.assertPatientAccess(actorUserId, validPatientId, "read");

    const where: Prisma.ScheduledDoseWhereInput = {
      patientId: validPatientId,
      status: { not: "CANCELLED" },
    };

    if (options.startDate || options.endDate) {
      where.scheduledAt = {};
      if (options.startDate) {
        where.scheduledAt.gte = parseDate(options.startDate, "startDate");
      }
      if (options.endDate) {
        where.scheduledAt.lte = parseDate(options.endDate, "endDate");
      }
    }

    const doses = await prisma.scheduledDose.findMany({
      where,
      include: {
        schedule: {
          include: {
            medication: true,
          },
        },
        events: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: options.limit ? Math.min(Math.max(1, options.limit), 500) : 100,
    });

    const now = new Date();
    return doses.map((dose) => {
      const evaluation = this.determineAdherenceResult(
        dose.status,
        dose.scheduledAt,
        dose.resolvedAt,
        dose.events[0]?.occurredAt,
        now,
      );

      return {
        doseId: dose.id,
        scheduleId: dose.scheduleId,
        medication: {
          id: dose.schedule?.medication?.id,
          name: dose.schedule?.medication?.name ?? "Unknown Medication",
          dosage: dose.schedule?.medication?.dosageText ?? null,
          route: dose.schedule?.medication?.route ?? null,
        },
        scheduledAt: dose.scheduledAt,
        timeOfDay: this.getTimeOfDay(dose.scheduledAt),
        status: dose.status,
        adherenceResult: evaluation.adherenceResult,
        delayMinutes: evaluation.delayMinutes,
        confirmedAt: evaluation.confirmedAt,
        note: dose.events[0]?.note ?? null,
      };
    });
  }
}
