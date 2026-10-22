import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { ClinicalAgentService } from "../services/clinical-agent.service";
import { BadRequestError } from "../errors";

export const agentRouter = Router();

// All agent interactions require authentication
agentRouter.use(requireAuth);

/**
 * POST /agent/query
 * Executes an AI Agent query against the backend Medical MCP server with strict clinical safeguards.
 */
agentRouter.post(
  "/query",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorUserId = req.user!.id;
      const { query, patientId, useDemoData } = req.body ?? {};

      if (!query || typeof query !== "string" || query.trim().length === 0) {
        throw new BadRequestError("Query parameter is required and must be a non-empty string.");
      }

      const result = await ClinicalAgentService.processQuery(actorUserId, {
        query: query.trim(),
        patientId,
        useDemoData: Boolean(useDemoData),
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /agent/demo-data
 * Retrieves labeled benchmark patient profile (Ahmed) for demonstration and offline testing.
 */
agentRouter.get(
  "/demo-data",
  (_req: Request, res: Response) => {
    const demoData = ClinicalAgentService.getLabeledAhmedDemoData();
    res.json(demoData);
  },
);
