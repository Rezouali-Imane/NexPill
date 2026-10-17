import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error-handler";
import { notFound } from "./middleware/not-found";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./docs/swagger";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { medicationRouter } from "./routes/medications";
import { scheduleRouter } from "./routes/schedules";
import { doseRouter } from "./routes/doses";
import { caregiverAccessRouter } from "./routes/caregiver-access";

export const app = express();

app.use(
  cors({
    origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",").map((o: string) => o.trim()),
    credentials: true,
  }),
);
app.use(express.json());

// API Documentation (Swagger UI)
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.get("/docs.json", (_req, res) => {
  res.json(openApiSpec);
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/medications", medicationRouter);
app.use("/schedules", scheduleRouter);
app.use("/doses", doseRouter);
app.use("/caregiver-access", caregiverAccessRouter);
app.use(notFound);
app.use(errorHandler);
