import type { Server as HttpServer } from "node:http";
import type { User } from "@supabase/supabase-js";
import { Server } from "socket.io";
import type { Socket } from "socket.io";
import { supabase } from "../config/supabase";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { verifyNexPillToken } from "../utils/token";

export interface DoseRealtimePayload {
  doseId: string;
  patientId: string;
  status: string;
  eventId?: string;
  fromStatus?: string;
  toStatus?: string;
  source?: string;
  occurredAt?: Date;
}

export interface AgentInsightRealtimePayload {
  patientId: string;
  actorUserId: string;
  query: string;
  response: string;
  safeguardTriggered: boolean;
  toolsInvoked: string[];
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface AdherenceRealtimePayload {
  patientId: string;
  actorUserId: string;
  riskLevel: string;
  confirmationRate: number;
  reasons: string[];
  suggestedFollowUp?: string;
  summaryText?: string;
  timestamp: string;
}

export interface AlertRealtimePayload {
  alertId: string;
  patientId: string;
  recipientId: string;
  type: string;
  message: string;
  status: string;
  timestamp: string;
}

let io: Server | null = null;

const getToken = (socket: Socket): string | undefined => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.length > 0) {
    return authToken;
  }

  const authorization = socket.handshake.headers.authorization;
  return typeof authorization === "string"
    ? authorization.match(/^Bearer\s+(\S+)$/i)?.[1]
    : undefined;
};

const authenticateSocket = async (socket: Socket): Promise<User> => {
  const token = getToken(socket);
  if (!token) {
    throw new Error("Missing bearer token");
  }

  const nexpillPayload = verifyNexPillToken(token);
  if (nexpillPayload) {
    const dbUser = await prisma.user.findUnique({
      where: { id: nexpillPayload.id },
      select: { id: true, email: true, disabledAt: true, createdAt: true },
    });
    if (!dbUser || dbUser.disabledAt) {
      throw new Error("Your account is not allowed to access application data.");
    }
    return {
      id: dbUser.id,
      email: dbUser.email,
      app_metadata: {},
      user_metadata: { role: nexpillPayload.role || "patient" },
      aud: "authenticated",
      created_at: dbUser.createdAt.toISOString(),
    } as unknown as User;
  }

  if (!supabase) {
    throw new Error("Authentication is not configured");
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Invalid or expired token");
  }

  const account = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { disabledAt: true },
  });
  if (!account || account.disabledAt) {
    throw new Error("Your account is not allowed to access application data.");
  }

  return data.user;
};

export const initializeDoseRealtime = (httpServer: HttpServer): Server => {
  if (io) {
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin:
        env.corsOrigin === "*"
          ? true
          : env.corsOrigin.split(",").map((origin) => origin.trim()),
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      socket.data.user = await authenticateSocket(socket);
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Socket authentication failed"));
    }
  });

  io.on("connection", async (socket) => {
    const user = socket.data.user as User;
    socket.join(`user:${user.id}`);
    socket.join(`patient:${user.id}`);

    const accesses = await prisma.caregiverAccess.findMany({
      where: { caregiverId: user.id, status: "ACTIVE", canViewSchedule: true },
      select: { patientId: true },
    });
    for (const access of accesses) {
      socket.join(`patient:${access.patientId}`);
    }
  });

  return io;
};

export const emitDoseUpdate = (payload: DoseRealtimePayload): void => {
  io?.to(`patient:${payload.patientId}`).emit("dose.updated", payload);
};

export const emitAgentInsight = (payload: AgentInsightRealtimePayload): void => {
  io?.to(`patient:${payload.patientId}`).emit("agent.insight", payload);
};

export const emitAdherenceUpdate = (payload: AdherenceRealtimePayload): void => {
  io?.to(`patient:${payload.patientId}`).emit("adherence.updated", payload);
};

export const emitAlertCreated = (payload: AlertRealtimePayload): void => {
  io?.to(`patient:${payload.patientId}`).emit("alert.created", payload);
  io?.to(`user:${payload.recipientId}`).emit("alert.created", payload);
};

export const getRealtimeServer = (): Server | null => io;

export const setRealtimeServerForTesting = (mockIo: Server | null): void => {
  io = mockIo;
};

export const closeDoseRealtime = async (): Promise<void> => {
  if (!io) {
    return;
  }

  const currentIo = io;
  io = null;
  await currentIo.close();
};
