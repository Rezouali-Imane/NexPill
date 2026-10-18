import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { NotificationChannel, NotificationKind, NotificationStatus } from "@prisma/client";
import { requireAuth } from "../middleware/require-auth";
import { NotificationService } from "../services/notification.service";
import { getParamString } from "../utils/validation";

export const notificationRouter = Router();

// All notification endpoints require authentication
notificationRouter.use(requireAuth);

/**
 * GET /notifications
 * Lists notifications for the authenticated user with optional filters.
 */
notificationRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const notifications = await NotificationService.listNotifications(actorUserId, {
      status: typeof req.query.status === "string" ? (req.query.status as NotificationStatus) : undefined,
      kind: typeof req.query.kind === "string" ? (req.query.kind as NotificationKind) : undefined,
      channel: typeof req.query.channel === "string" ? (req.query.channel as NotificationChannel) : undefined,
      doseId: typeof req.query.doseId === "string" ? req.query.doseId : undefined,
      startDate: typeof req.query.startDate === "string" ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === "string" ? req.query.endDate : undefined,
    });
    res.json({ notifications });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /notifications/:id/delivered
 * Marks a notification as DELIVERED by the recipient.
 */
notificationRouter.patch("/:id/delivered", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const notification = await NotificationService.markDelivered(
      actorUserId,
      getParamString(req.params.id),
    );
    res.json({ notification });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /notifications/jobs/dispatch
 * Triggers the due notifications dispatcher on-demand.
 */
notificationRouter.post("/jobs/dispatch", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const referenceTime = req.body?.referenceTime
      ? new Date(req.body.referenceTime)
      : new Date();
    const result = await NotificationService.dispatchDueNotifications(referenceTime);
    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /notifications/doses/:doseId/schedule
 * Schedules reminders for a specific dose.
 */
notificationRouter.post(
  "/doses/:doseId/schedule",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await NotificationService.scheduleDoseReminders(
        getParamString(req.params.doseId),
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /notifications/endpoints
 * Lists registered notification delivery endpoints for the authenticated user.
 */
notificationRouter.get("/endpoints", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const endpoints = await NotificationService.listEndpoints(actorUserId);
    res.json({ endpoints });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /notifications/endpoints
 * Registers or enables a delivery channel endpoint for the user.
 */
notificationRouter.post("/endpoints", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const endpoint = await NotificationService.registerEndpoint(actorUserId, req.body);
    res.status(201).json({ endpoint });
  } catch (error) {
    next(error);
  }
});
