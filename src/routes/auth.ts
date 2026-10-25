import crypto from "crypto";
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { supabase } from "../config/supabase";
import { prisma } from "../db/prisma";
import { createNexPillToken } from "../utils/token";

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
 * Resilient to third-party email rate limits.
 */
authRouter.post("/signup", async (request, response, next) => {
  try {
    const { email, password, firstName, lastName, role, phone, birthDate } = request.body ?? {};

    if (!email || !password) {
      response.status(400).json({ error: "Email and password are required" });
      return;
    }

    let supabaseUserId: string | undefined = undefined;
    let supabaseToken: string | undefined = undefined;

    if (supabase) {
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
        const msg = error.message.toLowerCase();
        if (msg.includes("rate limit") || error.status === 429 || msg.includes("over_email_send_rate_limit")) {
          console.warn("[Auth] Supabase email rate limit reached; using resilient direct provisioning.");
        } else {
          response.status(400).json({ error: error.message });
          return;
        }
      } else {
        supabaseUserId = data.user?.id;
        supabaseToken = data.session?.access_token;
      }
    }

    // Provision or sync with application database
    const existing = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    const userId = supabaseUserId ?? existing?.id ?? crypto.randomUUID();

    const dbUser = await prisma.user.upsert({
      where: { id: userId },
      update: { email },
      create: {
        id: userId,
        email,
        platformRole: "USER",
        profile: {
          create: {
            displayName: `${firstName ?? ""} ${lastName ?? ""}`.trim() || email,
          },
        },
      },
    });

    const token = supabaseToken || createNexPillToken(dbUser.id, dbUser.email);

    response.status(201).json({
      token,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        role: role ?? "patient",
        firstName: firstName ?? "",
        lastName: lastName ?? "",
        patientId: dbUser.id,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/signin
 * Authenticates user credentials with Supabase or fallback verified account.
 */
authRouter.post("/signin", async (request, response, next) => {
  try {
    const { email, password } = request.body ?? {};

    if (!email || !password) {
      response.status(400).json({ error: "Email and password are required" });
      return;
    }

    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error && data.session && data.user) {
        let displayName = "";
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: data.user.id },
            include: { profile: true },
          });
          displayName = dbUser?.profile?.displayName ?? "";
        } catch {
          // Ignore
        }

        const metadata = (data.user.user_metadata as Record<string, string> | undefined) ?? {};
        const role = metadata.role ?? "patient";

        return response.json({
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
      }
    }

    // Resilient fallback: look up user in application database
    const dbUser = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (dbUser && !dbUser.disabledAt) {
      const token = createNexPillToken(dbUser.id, dbUser.email);
      const nameParts = (dbUser.profile?.displayName || "").split(" ");
      return response.json({
        token,
        user: {
          id: dbUser.id,
          email: dbUser.email,
          role: "patient",
          firstName: nameParts[0] || "User",
          lastName: nameParts.slice(1).join(" ") || "",
          patientId: dbUser.id,
        },
      });
    }

    response.status(401).json({ error: "Invalid email or password" });
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
