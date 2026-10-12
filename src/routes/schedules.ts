import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { ScheduleService } from "../services/schedule.service";
import { getParamString } from "../utils/validation";

export const scheduleRouter = Router();

// All schedule endpoints require authentication
scheduleRouter.use(requireAuth);

/**
 * GET /schedules/:id
 * Fetches a single schedule with reminder configuration and medication details.
 */
scheduleRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const schedule = await ScheduleService.getScheduleById(
      actorUserId,
      getParamString(req.params.id),
    );
    res.json({ schedule });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /schedules/:id
 * Updates a schedule or its reminder configuration.
 */
scheduleRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const schedule = await ScheduleService.updateSchedule(
      actorUserId,
      getParamString(req.params.id),
      req.body,
    );
    res.json({ schedule });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /schedules/:id
 * Deactivates a schedule by setting its effectiveTo timestamp to now.
 */
scheduleRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const result = await ScheduleService.deleteSchedule(
      actorUserId,
      getParamString(req.params.id),
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

