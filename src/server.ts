import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./db/prisma";
import {
  startMissedDoseScheduler,
  stopMissedDoseScheduler,
} from "./jobs/missed-dose.job";

const server = app.listen(env.port, env.host, () => {
  console.log(`NexPill API listening on http://${env.host}:${env.port} (${env.nodeEnv})`);
});

// Start scheduled job for missed doses in non-test environments
if (process.env.NODE_ENV !== "test" && process.env.DISABLE_BACKGROUND_JOBS !== "true") {
  startMissedDoseScheduler();
}

const gracefulShutdown = (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  stopMissedDoseScheduler();
  server.close(async () => {
    try {
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

