import type { RequestHandler } from "express";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../config/supabase";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

export const requireAuth: RequestHandler = async (request, response, next) => {
  if (!supabase) {
    response.status(503).json({ error: "Authentication is not configured" });
    return;
  }

  const authorization = request.header("authorization");
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

  if (!token) {
    response.status(401).json({ error: "Missing bearer token" });
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
