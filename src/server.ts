import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./db/prisma";

const server = app.listen(env.port, env.host, () => {
  console.log(`NexPill API listening on http://${env.host}:${env.port} (${env.nodeEnv})`);
});

const gracefulShutdown = (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
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
  setTimeout(() => {
    console.error("Graceful shutdown timeout exceeded. Forcefully exiting.");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

