import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { DoseStatus } from "@prisma/client";
import { MissedDoseJobService } from "../jobs/missed-dose.job";
import { requireAuth } from "../middleware/require-auth";
import { requireRole } from "../middleware/require-role";
import { DoseService } from "../services/dose.service";
import { getParamString } from "../utils/validation";

export const doseRouter = Router();

// All dose endpoints require authentication
doseRouter.use(requireAuth);

/**
 * POST /doses/:id/taken
 * Marks a scheduled dose as TAKEN.
 */
doseRouter.post("/:id/taken", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const result = await DoseService.recordTaken(
      actorUserId,
      getParamString(req.params.id),
      req.body,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /doses/:id/skipped
 * Marks a scheduled dose as SKIPPED with an optional reason note.
 */
doseRouter.post("/:id/skipped", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const result = await DoseService.recordSkipped(
      actorUserId,
      getParamString(req.params.id),
      req.body,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /doses/:id/unable-to-take
 * Marks a scheduled dose as UNABLE_TO_TAKE with an optional reason note.
 */
doseRouter.post("/:id/unable-to-take", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const result = await DoseService.recordUnableToTake(
      actorUserId,
      getParamString(req.params.id),
      req.body,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /doses/generate
 * Generates scheduled doses for a schedule across a date range.
 */
doseRouter.post("/generate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const result = await DoseService.generateDosesForSchedule(
      actorUserId,
      req.body,
    );
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /doses/jobs/detect-missed
 * Manually or externally triggers the missed-doses detection job.
 */
doseRouter.post("/jobs/detect-missed", requireRole("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const referenceTime = req.body?.referenceTime
      ? new Date(req.body.referenceTime)
      : new Date();
    const result = await MissedDoseJobService.detectAndMarkMissedDoses(referenceTime);
    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /doses/:id
 * Fetches details of a single scheduled dose with its medication, schedule, and event logs.
 */
doseRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const dose = await DoseService.getDoseById(
      actorUserId,
      getParamString(req.params.id),
    );
    res.json({ dose });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /doses
 * Lists scheduled doses for a patient with optional filters for dates, status, or medication.
 */
doseRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const doses = await DoseService.listDoses(actorUserId, {
      patientId: typeof req.query.patientId === "string" ? req.query.patientId : undefined,
      startDate: typeof req.query.startDate === "string" ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === "string" ? req.query.endDate : undefined,
      status: typeof req.query.status === "string" ? (req.query.status as DoseStatus) : undefined,
      medicationId: typeof req.query.medicationId === "string" ? req.query.medicationId : undefined,
      scheduleId: typeof req.query.scheduleId === "string" ? req.query.scheduleId : undefined,
    });
    res.json({ doses });
  } catch (error) {
    next(error);
  }
});
