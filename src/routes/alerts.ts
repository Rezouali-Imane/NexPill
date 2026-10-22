import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { AlertStatus, AlertType } from "@prisma/client";
import { requireAuth } from "../middleware/require-auth";
import { AlertService } from "../services/alert.service";
import { getParamString } from "../utils/validation";

export const alertRouter = Router();

// All alert endpoints require authentication
alertRouter.use(requireAuth);

/**
 * GET /alerts/summary
 * Returns alert count totals broken down by status and alert type.
 */
alertRouter.get("/summary", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const summary = await AlertService.getSummary(actorUserId, patientId);
    res.json({ summary });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /alerts
 * Lists alerts accessible to the authenticated caregiver or patient.
 */
alertRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const alerts = await AlertService.listAlerts(actorUserId, {
      patientId: typeof req.query.patientId === "string" ? req.query.patientId : undefined,
      status: typeof req.query.status === "string" ? (req.query.status as AlertStatus) : undefined,
      type: typeof req.query.type === "string" ? (req.query.type as AlertType) : undefined,
      startDate: typeof req.query.startDate === "string" ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === "string" ? req.query.endDate : undefined,
    });
    res.json({ alerts });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /alerts/:id
 * Retrieves full details for a single caregiver alert.
 */
alertRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const alert = await AlertService.getAlertById(
      actorUserId,
      getParamString(req.params.id),
    );
    res.json({ alert });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /alerts/:id/acknowledge
 * POST /alerts/:id/acknowledge
 * Acknowledges an alert by the recipient caregiver or patient.
 */
const handleAcknowledge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const alert = await AlertService.acknowledgeAlert(
      actorUserId,
      getParamString(req.params.id),
    );
    res.json({ alert });
  } catch (error) {
    next(error);
  }
};

alertRouter.patch("/:id/acknowledge", handleAcknowledge);
alertRouter.post("/:id/acknowledge", handleAcknowledge);

/**
 * PATCH /alerts/:id/resolve
 * POST /alerts/:id/resolve
 * Resolves an alert.
 */
const handleResolve = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const alert = await AlertService.resolveAlert(
      actorUserId,
      getParamString(req.params.id),
    );
    res.json({ alert });
  } catch (error) {
    next(error);
  }
};

alertRouter.patch("/:id/resolve", handleResolve);
alertRouter.post("/:id/resolve", handleResolve);
