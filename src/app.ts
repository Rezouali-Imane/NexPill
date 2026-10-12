import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error-handler";
import { notFound } from "./middleware/not-found";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { medicationRouter } from "./routes/medications";
import { scheduleRouter } from "./routes/schedules";

export const app = express();

app.use(
  cors({
    origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",").map((o) => o.trim()),
    credentials: true,
  }),
);
app.use(express.json());

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/medications", medicationRouter);
app.use("/schedules", scheduleRouter);
app.use(notFound);
app.use(errorHandler);

