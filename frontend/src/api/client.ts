/**
 * THE BACKEND CONTRACT.
 * The UI only talks to these interfaces. `src/api/mock/*` implements them in the browser;
 * the real backend implements the same shapes over HTTP + WebSocket (see docs/API.md).
 */
import type { CareLink, Session, SignUpInput } from "@/domain/auth";
import type { PatientView } from "@/domain/caregiver";
import type {
  CareTeamMessage,
  CaregiverMessage,
  ConnectionState,
  Dose,
  DoseOutcome,
  RefillRequest,
  ServerEvent,
  Settings,
  Snapshot,
} from "@/domain/types";

export type ApiErrorCode =
  | "network"
  | "conflict"
  | "not-found"
  | "invalid"
  | "unauthorized"
  | "forbidden"
  | "rate-limited";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AuthApi {
  signUp(input: SignUpInput): Promise<Session>;
  /** Must not reveal whether the email or the password was wrong. */
  signIn(email: string, password: string): Promise<Session>;
  /** Resolve the session for a stored token, or null if it expired. */
  getSession(token: string): Promise<Session | null>;
  signOut(token: string): Promise<void>;
  /** Always resolves, whether or not the email exists. `devLink` is only returned by the mock. */
  requestPasswordReset(email: string): Promise<{ devLink?: string }>;
  resetPassword(resetToken: string, newPassword: string): Promise<void>;
}

export interface PatientApi {
  getSnapshot(): Promise<Snapshot>;
  recordDose(doseId: string, outcome: DoseOutcome): Promise<Dose>;
  requestRefill(medicationId: string): Promise<RefillRequest>;
  sendCaregiverUpdate(linkId: string, body: string): Promise<CaregiverMessage>;
  sendCareTeamMessage(subject: string, body: string): Promise<CareTeamMessage>;
  markNotificationsRead(ids?: string[]): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  /** The patient's permanent ID (NX-XXXXXXXX). A caregiver who enters it is linked immediately. */
  getShareId(): Promise<string>;
  /** Replaces the ID; the old one stops working, existing caregivers stay linked. */
  regenerateShareId(): Promise<string>;
  removeCaregiver(linkId: string): Promise<void>;
  /** Mock only: fill an empty account with a sample plan. */
  loadSamplePlan?(): Promise<Snapshot>;
  /** Mock only: restore seed data. */
  resetDemo?(): Promise<Snapshot>;
}

export interface CaregiverDashboard {
  patients: PatientView[];
  acknowledgedAlerts: string[];
}

export interface CaregiverApi {
  getDashboard(): Promise<CaregiverDashboard>;
  /** Link to a patient by their ID. Access is immediate; the patient is notified. Throttled after repeated wrong IDs. */
  linkPatient(shareId: string, relationship: string): Promise<CareLink>;
  unlinkPatient(linkId: string): Promise<void>;
  markMessagesSeen(patientId: string): Promise<void>;
  acknowledgeAlerts(ids: string[]): Promise<void>;
  /** Send a short message to a linked patient (delivered as a notification). */
  sendMessage(patientId: string, body: string): Promise<void>;
  addExtraReminder(
    patientId: string,
    medicationId: string,
    time: string,
  ): Promise<void>;
}

/** WebSocket-shaped channel for server push. Events are scoped to a patient. */
export interface RealtimeChannel {
  connect(): void;
  disconnect(): void;
  subscribe(handler: (e: ServerEvent, patientId: string) => void): () => void;
  onState(handler: (s: ConnectionState) => void): () => void;
}

export interface Backend {
  auth: AuthApi;
  patient(session: Session): PatientApi;
  caregiver(session: Session): CaregiverApi;
  realtime: RealtimeChannel;
}
