import { createServer } from "node:http";
import type { Server } from "node:http";
import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./db/prisma";
import {
  startMissedDoseScheduler,
  stopMissedDoseScheduler,
} from "./jobs/missed-dose.job";
import {
  startNotificationDispatcher,
  stopNotificationDispatcher,
} from "./jobs/notification.job";
import {
  closeDoseRealtime,
  initializeDoseRealtime,
} from "./realtime/dose-events";

// Handle uncaught exceptions and unhandled rejections to prevent silent container crashes
process.on("uncaughtException", (error) => {
  console.error("[CRITICAL] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[CRITICAL] Unhandled promise rejection at:", promise, "reason:", reason);
});

const server = createServer(app);
initializeDoseRealtime(server);

// Bind primary server to configured port and host (0.0.0.0)
const primaryPort = env.port;
server.listen(primaryPort, "0.0.0.0", () => {
  console.log(`NexPill API listening on http://0.0.0.0:${primaryPort} (${env.nodeEnv})`);
});

// Dual-port safety: if primary port is not 3000, also bind port 3000 in case Railway proxy targets 3000
let fallbackServer: Server | null = null;
if (primaryPort !== 3000) {
  try {
    fallbackServer = createServer(app);
    fallbackServer.listen(3000, "0.0.0.0", () => {
      console.log(`NexPill API fallback listening on http://0.0.0.0:3000 (${env.nodeEnv})`);
    });
    fallbackServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.warn("[Server] Port 3000 is already in use; primary listener will handle traffic.");
      } else {
        console.error("[Server] Fallback listener error on port 3000:", err);
      }
    });
  } catch (err) {
    console.warn("[Server] Could not initialize fallback listener on port 3000:", err);
  }
}

// Start scheduled jobs in non-test environments
if (process.env.NODE_ENV !== "test" && process.env.DISABLE_BACKGROUND_JOBS !== "true") {
  startMissedDoseScheduler();
  startNotificationDispatcher();
}

const gracefulShutdown = (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  stopMissedDoseScheduler();
  stopNotificationDispatcher();

  if (fallbackServer) {
    fallbackServer.close();
  }

  server.close(async () => {
    try {
      await closeDoseRealtime();
      await prisma.$disconnect();
      console.log("Database connection closed. Shutdown complete.");
      process.exit(0);
    } catch (error) {
      console.error("Error during database disconnect:", error);
      process.exit(1);
    }
  });

  // Force close if graceful shutdown takes longer than 10 seconds
  const timer = setTimeout(() => {
    console.error("Graceful shutdown timeout exceeded. Forcefully exiting.");
    process.exit(1);
  }, 10000);
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    (timer as NodeJS.Timeout).unref();
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
