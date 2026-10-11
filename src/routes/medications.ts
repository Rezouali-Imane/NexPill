import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { MedicationService } from "../services/medication.service";
import { ScheduleService } from "../services/schedule.service";
import { getParamString } from "../utils/validation";

export const medicationRouter = Router();

// All medication endpoints require authentication
medicationRouter.use(requireAuth);

/**
 * POST /medications
 * Creates a new medication record and runs drug conflict analysis.
 */
medicationRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const { medication, warnings } = await MedicationService.createMedication(
      actorUserId,
      req.body,
    );
    res.status(201).json({ medication, warnings });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /medications
 * Lists medications for the authenticated user or a managed patient.
 */
medicationRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const medications = await MedicationService.listMedications(actorUserId, {
      patientId: typeof req.query.patientId === "string" ? req.query.patientId : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      includeSchedules: req.query.includeSchedules === "true",
    });
    res.json({ medications });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /medications/:id
 * Fetches a single medication by ID with its schedules, catalog details, and warnings.
 */
medicationRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const medication = await MedicationService.getMedicationById(
      actorUserId,
      getParamString(req.params.id),
    );
    res.json({ medication });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /medications/:id
 * PATCH /medications/:id
 * Updates an existing medication and re-analyzes drug conflict warnings.
 */
const handleUpdateMedication = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actorUserId = req.user!.id;
    const { medication, warnings } = await MedicationService.updateMedication(
      actorUserId,
      getParamString(req.params.id),
      req.body,
    );
    res.json({ medication, warnings });
  } catch (error) {
    next(error);
  }
};

medicationRouter.put("/:id", handleUpdateMedication);
medicationRouter.patch("/:id", handleUpdateMedication);

/**
 * DELETE /medications/:id
 * Deactivates (status = INACTIVE) or permanently deletes a medication.
 */
medicationRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const hardDelete = req.query.hard === "true";
    const result = await MedicationService.deleteMedication(
      actorUserId,
      getParamString(req.params.id),
      hardDelete,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /medications/:medicationId/schedules
 * Creates a schedule and reminder configuration for a medication.
 */
medicationRouter.post("/:medicationId/schedules", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const schedule = await ScheduleService.createSchedule(
      actorUserId,
      getParamString(req.params.medicationId),
      req.body,
    );
    res.status(201).json({ schedule });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /medications/:medicationId/schedules
 * Lists active schedules for a medication.
 */
medicationRouter.get("/:medicationId/schedules", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = req.user!.id;
    const schedules = await ScheduleService.listSchedulesForMedication(
      actorUserId,
      getParamString(req.params.medicationId),
    );
    res.json({ schedules });
  } catch (error) {
    next(error);
  }
});

