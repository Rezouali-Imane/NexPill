import type { ErrorRequestHandler } from "express";
import { HttpError } from "../errors";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  // Handle generic error with status or statusCode property
  const status =
    typeof error?.status === "number"
      ? error.status
      : typeof error?.statusCode === "number"
        ? error.statusCode
        : 500;

  if (status >= 500) {
    console.error(error);
    response.status(500).json({ error: "Internal server error" });
    return;
  }

  response.status(status).json({
    error: error.message || "An unexpected error occurred",
  });
};

