import type { RequestHandler } from "express";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../config/supabase";
import { prisma } from "../db/prisma";
import { verifyNexPillToken } from "../utils/token";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

export const requireAuth: RequestHandler = async (request, response, next) => {
  const authorization = request.header("authorization");
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

  if (!token) {
    response.status(401).json({ error: "Missing bearer token" });
    return;
  }

  // 1. Resilient token check (for accounts provisioned when Supabase email rate limits are exceeded)
  const nexpillPayload = verifyNexPillToken(token);
  if (nexpillPayload) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: nexpillPayload.id },
      });
      if (dbUser && !dbUser.disabledAt) {
        request.user = {
          id: dbUser.id,
          email: dbUser.email,
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: dbUser.createdAt.toISOString(),
        } as unknown as User;
        next();
        return;
      }
    } catch {
      // Fall through to error
    }
    response.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // 2. Standard Supabase token check
  if (!supabase) {
    response.status(503).json({ error: "Authentication is not configured" });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    response.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  request.user = data.user;
  next();
};
