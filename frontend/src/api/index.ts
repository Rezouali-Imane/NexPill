import type { Backend } from './client';
import { mockBackend } from './mock';

/**
 * Single composition point. When the real backend is ready, build a Backend from
 * fetch() + WebSocket (see docs/API.md) and return it here when VITE_API_URL is set.
 */
export const backend: Backend = mockBackend;
export { mockRealtime } from './mockRealtime';
export { ApiError } from './client';
export type { AuthApi, Backend, CaregiverApi, PatientApi, RealtimeChannel } from './client';
