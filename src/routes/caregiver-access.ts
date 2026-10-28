import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { CaregiverAccessService } from "../services/caregiver-access.service";
import { DoseService } from "../services/dose.service";
import { getParamString, validateNonEmptyString } from "../utils/validation";

export const caregiverAccessRouter = Router();
caregiverAccessRouter.use(requireAuth);

caregiverAccessRouter.post("/invites", async (request, response, next) => {
  try {
    const result = await CaregiverAccessService.createInvite(
      request.user!.id,
      request.body ?? {},
    );
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

caregiverAccessRouter.post("/invites/accept", async (request, response, next) => {
  try {
    const token = validateNonEmptyString(request.body?.token, "token");
    const caregiverEmail = validateNonEmptyString(
      request.user!.email,
      "authenticated user email",
    );
    const result = await CaregiverAccessService.acceptInvite(
      request.user!.id,
      caregiverEmail,
      token,
    );
    response.json({ access: result });
  } catch (error) {
    next(error);
  }
});

caregiverAccessRouter.get("/", async (request, response, next) => {
  try {
    const access = await CaregiverAccessService.listForUser(request.user!.id);
    response.json({ access });
  } catch (error) {
    next(error);
  }
});

caregiverAccessRouter.delete("/:id", async (request, response, next) => {
  try {
    const accessId = getParamString(request.params.id);
    const result = await CaregiverAccessService.revokeAccess(
      request.user!.id,
      accessId,
    );
    response.json(result);
  } catch (error) {
    next(error);
  }
});

caregiverAccessRouter.get("/:patientId/daily-summary", async (request, response, next) => {
  try {
    const date = validateNonEmptyString(request.query.date, "date");
    const summary = await DoseService.getDailySummary(
      request.user!.id,
      getParamString(request.params.patientId),
      date,
    );
    response.json({ summary });
  } catch (error) {
    next(error);
  }
});
