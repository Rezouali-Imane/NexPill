import type { Backend } from "./client";
import { mockBackend } from "./mock";
import { createHttpBackend } from "./http/client";

const isTest = import.meta.env.MODE === "test";

/**
 * Single composition point.
 * Reads VITE_API_URL or localStorage override.
 * In development and production, connects to the live backend (defaulting to http://localhost:3000).
 * In unit testing (Vitest), uses in-memory mockBackend for fast, isolated test suites.
 */
const configuredUrl =
  !isTest &&
  ((typeof window !== "undefined" && window.localStorage.getItem("nexpill_api_url")) ||
    import.meta.env.VITE_API_URL ||
    "http://localhost:3000");

export const isLiveBackend = Boolean(configuredUrl);
export const backendUrl = configuredUrl || "http://localhost:3000";

export const backend: Backend = configuredUrl
  ? createHttpBackend(configuredUrl)
  : mockBackend;

export { mockBackend };
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
