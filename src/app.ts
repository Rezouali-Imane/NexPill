import express from "express";
import { errorHandler } from "./middleware/error-handler";
import { notFound } from "./middleware/not-found";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";

export const app = express();

app.use(express.json());
app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use(notFound);
app.use(errorHandler);
