import type { Backend } from "./client";
import { mockBackend } from "./mock";
import { createHttpBackend } from "./http/client";

/**
 * Single composition point.
 * Reads VITE_API_URL or localStorage override.
 * When set, routes requests to the live backend and connects via Socket.io.
 * When unset, seamlessly falls back to the in-browser mock backend.
 */
const configuredUrl =
  (typeof window !== "undefined" && window.localStorage.getItem("nexpill_api_url")) ||
  import.meta.env.VITE_API_URL;

export const isLiveBackend = Boolean(configuredUrl);
export const backendUrl = configuredUrl || "http://localhost:3000";

export const backend: Backend = configuredUrl
  ? createHttpBackend(configuredUrl)
  : mockBackend;

export { mockRealtime } from "./mockRealtime";
export { ApiError } from "./client";
export type {
  AuthApi,
  Backend,
  CaregiverApi,
  CaregiverDashboard,
  PatientApi,
  RealtimeChannel,
} from "./client";
