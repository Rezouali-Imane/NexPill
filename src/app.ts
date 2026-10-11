import express from "express";
import { errorHandler } from "./middleware/error-handler";
import { notFound } from "./middleware/not-found";
import { healthRouter } from "./routes/health";

export const app = express();

app.use(express.json());
app.use("/health", healthRouter);
app.use(notFound);
app.use(errorHandler);
