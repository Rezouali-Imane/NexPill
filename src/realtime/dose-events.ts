import type { Server as HttpServer } from "node:http";
import type { User } from "@supabase/supabase-js";
import { Server } from "socket.io";
import type { Socket } from "socket.io";
import { supabase } from "../config/supabase";
import { env } from "../config/env";
import { prisma } from "../db/prisma";

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
  if (!supabase) {
    throw new Error("Authentication is not configured");
  }

  const token = getToken(socket);
  if (!token) {
    throw new Error("Missing bearer token");
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
      where: { caregiverId: user.id, status: "ACTIVE" },
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

export const closeDoseRealtime = async (): Promise<void> => {
  if (!io) {
    return;
  }

  const currentIo = io;
  io = null;
  await currentIo.close();
};
