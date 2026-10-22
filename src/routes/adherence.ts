import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { AdherenceAnalyticsService } from "../services/adherence-analytics.service";
import { getParamString } from "../utils/validation";
import { BadRequestError } from "../errors";

export const adherenceRouter = Router();

// All adherence endpoints require authentication
adherenceRouter.use(requireAuth);

/**
 * GET /adherence/:patientId/summary
 * Retrieves the latest generated adherence summary and risk level for a patient.
 */
adherenceRouter.get(
  "/:patientId/summary",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorUserId = req.user!.id;
      const patientId = getParamString(req.params.patientId);

      const latest = await AdherenceAnalyticsService.getLatestAnalysis(
        actorUserId,
        patientId,
      );

      if (latest) {
        res.json({ analysis: latest });
        return;
      }

      // If no analysis exists yet, generate a default 7-day report on the fly
      const report = await AdherenceAnalyticsService.generateReport(
        actorUserId,
        patientId,
      );
      res.json({ analysis: report });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /adherence/:patientId/analyze
 * Generates a structured adherence report, detecting repeated missed/delayed doses and risk patterns.
 */
adherenceRouter.post(
  "/:patientId/analyze",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorUserId = req.user!.id;
      const patientId = getParamString(req.params.patientId);
      const { periodStart, periodEnd, kind, generator } = req.body ?? {};

      const report = await AdherenceAnalyticsService.generateReport(
        actorUserId,
        patientId,
        {
          periodStart,
          periodEnd,
          kind,
          generator,
        },
      );

      res.status(201).json({ report });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /adherence/:patientId/history
 * Retrieves standardized chronological adherence history with observational outcomes
 * (ON_TIME, LATE, UNCONFIRMED, MISSED, SKIPPED, UPCOMING) and confirmation latency.
 */
adherenceRouter.get(
  "/:patientId/history",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorUserId = req.user!.id;
      const patientId = getParamString(req.params.patientId);
      const { startDate, endDate, limit } = req.query;

      let parsedLimit: number | undefined;
      if (limit !== undefined && limit !== "") {
        const num = Number(limit);
        if (!Number.isInteger(num) || num < 1) {
          throw new BadRequestError("limit must be a positive integer.");
        }
        parsedLimit = num;
      }

      const history = await AdherenceAnalyticsService.getAdherenceHistory(
        actorUserId,
        patientId,
        {
          startDate: typeof startDate === "string" ? startDate : undefined,
          endDate: typeof endDate === "string" ? endDate : undefined,
          limit: parsedLimit,
        },
      );

      res.json({ patientId, count: history.length, history });
    } catch (error) {
      next(error);
    }
  },
);
