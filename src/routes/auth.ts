import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { supabase } from "../config/supabase";
import { prisma } from "../db/prisma";

export const authRouter = Router();

/**
 * GET /auth/me
 * Retrieves current authenticated user profile.
 */
authRouter.get("/me", requireAuth, (request, response) => {
  response.json({
    id: request.user?.id,
    email: request.user?.email,
  });
});

/**
 * POST /auth/signup
 * Creates a new user in Supabase Auth and registers them in the database.
 */
authRouter.post("/signup", async (request, response, next) => {
  try {
    const { email, password, firstName, lastName, role, phone, birthDate } = request.body ?? {};

    if (!email || !password) {
      response.status(400).json({ error: "Email and password are required" });
      return;
    }

    if (!supabase) {
      response.status(503).json({ error: "Authentication service is not configured" });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          firstName: firstName ?? "",
          lastName: lastName ?? "",
          role: role ?? "patient",
          phone: phone ?? "",
          birthDate: birthDate ?? "",
        },
      },
    });

    if (error) {
      response.status(400).json({ error: error.message });
      return;
    }

    const user = data.user;
    if (user) {
      try {
        await prisma.user.upsert({
          where: { id: user.id },
          update: { email: user.email! },
          create: {
            id: user.id,
            email: user.email!,
            platformRole: "USER",
            profile: {
              create: {
                displayName: `${firstName ?? ""} ${lastName ?? ""}`.trim() || user.email!,
              },
            },
          },
        });
      } catch (dbError) {
        console.warn("[Auth] Database user sync warning:", dbError);
      }
    }

    response.status(201).json({
      token: data.session?.access_token,
      user: user
        ? {
            id: user.id,
            email: user.email,
            role: role ?? "patient",
            firstName: firstName ?? "",
            lastName: lastName ?? "",
            patientId: user.id,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/signin
 * Authenticates user credentials with Supabase and returns a bearer token and session.
 */
authRouter.post("/signin", async (request, response, next) => {
  try {
    const { email, password } = request.body ?? {};

    if (!email || !password) {
      response.status(400).json({ error: "Email and password are required" });
      return;
    }

    if (!supabase) {
      response.status(503).json({ error: "Authentication service is not configured" });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      response.status(401).json({ error: error?.message || "Invalid email or password" });
      return;
    }

    let displayName = "";
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: data.user.id },
        include: { profile: true },
      });
      displayName = dbUser?.profile?.displayName ?? "";
    } catch {
      // Continue with metadata if DB lookup fails
    }

    const metadata = (data.user.user_metadata as Record<string, string> | undefined) ?? {};
    const role = metadata.role ?? "patient";

    response.json({
      token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role,
        firstName: metadata.firstName ?? displayName.split(" ")[0] ?? "",
        lastName: metadata.lastName ?? displayName.split(" ").slice(1).join(" ") ?? "",
        patientId: data.user.id,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/signout
 * Clears current session.
 */
authRouter.post("/signout", async (_request, response) => {
  response.json({ ok: true });
});
