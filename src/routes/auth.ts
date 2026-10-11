import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";

export const authRouter = Router();

authRouter.get("/me", requireAuth, (request, response) => {
  response.json({
    id: request.user?.id,
    email: request.user?.email,
  });
});
