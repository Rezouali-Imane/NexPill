import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { AdherenceAnalyticsService } from "../services/adherence-analytics.service";
import { getParamString } from "../utils/validation";

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
