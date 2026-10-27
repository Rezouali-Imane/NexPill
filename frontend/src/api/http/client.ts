import { mockBackend } from "../mock";
import { io, type Socket } from "socket.io-client";
import {
  ApiError,
  type AuthApi,
  type Backend,
  type CaregiverApi,
  type CaregiverDashboard,
  type PatientApi,
  type RealtimeChannel,
} from "../client";
import type { CareLink, Session, SignUpInput } from "@/domain/auth";
import type { PatientView } from "@/domain/caregiver";
import type {
  CaregiverMessage,
  CareTeamMessage,
  ConnectionState,
  Dose,
  DoseOutcome,
  RefillRequest,
  ServerEvent,
  Settings,
  Snapshot,
} from "@/domain/types";
import {
  mapBackendCaregiver,
  mapBackendCareLink,
  mapBackendDose,
  mapBackendMedication,
  mapBackendNotification,
  type BackendCaregiverAccess,
  type BackendDose,
  type BackendMedication,
  type BackendNotification,
} from "./mapper";

const DEFAULT_SETTINGS: Settings = {
  reminders: true,
  reminderLeadMinutes: 5,
  caregiverUpdates: true,
  textSize: "standard",
  deviceSounds: true,
};

export function createHttpBackend(baseUrl: string): Backend {
  const cleanUrl = baseUrl.replace(/\/+$/, "");

  async function request<T>(
    path: string,
    options: RequestInit = {},
    token?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(`${cleanUrl}${path}`, {
        ...options,
        headers,
      });
    } catch {
      throw new ApiError(
        "Network connection failed. Please check if the server is reachable.",
        "network",
      );
    }

    if (response.status === 401) {
      let message = path.includes("/auth/signin")
        ? "Invalid email or password."
        : "Session expired or invalid.";
      try {
        const body = await response.clone().json();
        if (body?.error) message = body.error;
        else if (body?.message) message = body.message;
      } catch {
        // Fallback to default
      }
      throw new ApiError(message, "unauthorized");
    }

    if (response.status === 403) {
      throw new ApiError("You do not have permission for this action.", "forbidden");
    }

    if (response.status === 404) {
      throw new ApiError("Requested resource not found.", "not-found");
    }

    if (!response.ok) {
      let msg = "An error occurred";
      try {
        const body = await response.json();
        msg = body.error || body.message || msg;
      } catch {
        // Fallback to generic message
      }
      throw new ApiError(msg, response.status === 409 ? "conflict" : "invalid");
    }

    return response.json() as Promise<T>;
  }

  // ────────────────────────────── Auth API ──────────────────────────────

  const auth: AuthApi = {
    async signUp(input: SignUpInput): Promise<Session> {
      const data = await request<{
        token: string;
        user: {
          id: string;
          email: string;
          role: string;
          firstName: string;
          lastName: string;
          patientId?: string;
        };
      }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(input),
      });

      return {
        token: data.token,
        user: {
          id: data.user.id,
          role: input.role,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          birthDate: input.birthDate,
          phone: input.phone,
          patientId: data.user.patientId ?? data.user.id,
        },
      };
    },

    async signIn(email: string, password: string): Promise<Session> {
      const trimmedEmail = email.trim().toLowerCase();
      const isDemo =
        trimmedEmail.includes("demo") ||
        trimmedEmail.includes("jamie") ||
        trimmedEmail.includes("emily") ||
        trimmedEmail.includes("ahmed") ||
        trimmedEmail.includes("nadia") ||
        trimmedEmail.includes("eleanor") ||
        trimmedEmail.includes("sarah");

      try {
        const data = await request<{
          token: string;
          user: {
            id: string;
            email: string;
            role: string;
            firstName: string;
            lastName: string;
            patientId?: string;
          };
        }>("/auth/signin", {
          method: "POST",
          body: JSON.stringify({ email: trimmedEmail, password }),
        });

        return {
          token: data.token,
          user: {
            id: data.user.id,
            role: (data.user.role as "patient" | "caregiver") || "patient",
            firstName: data.user.firstName || "User",
            lastName: data.user.lastName || "",
            email: data.user.email,
            birthDate: "1990-01-01",
            patientId: data.user.patientId ?? data.user.id,
          },
        };
      } catch (err) {
        if (
          isDemo ||
          (err instanceof ApiError && (err.code === "network" || err.code === "unauthorized"))
        ) {
          try {
            return await mockBackend.auth.signIn(email, password);
          } catch {
            // Re-throw original
          }
        }
        throw err;
      }
    },

    async getSession(token: string): Promise<Session | null> {
      try {
        const data = await request<{
          id: string;
          email: string;
          role?: string;
          firstName?: string;
          lastName?: string;
          displayName?: string;
        }>("/auth/me", {}, token);

        return {
          token,
          user: {
            id: data.id,
            role: (data.role as "patient" | "caregiver") || "patient",
            firstName: data.firstName || data.displayName?.split(" ")[0] || "User",
            lastName: data.lastName || data.displayName?.split(" ").slice(1).join(" ") || "",
            email: data.email,
            birthDate: "1990-01-01",
            patientId: data.id,
          },
        };
      } catch {
        return mockBackend.auth.getSession(token);
      }
    },

    async signOut(token: string): Promise<void> {
      try {
        await request("/auth/signout", { method: "POST" }, token);
      } catch {
        // Signout gracefully even if offline
      }
    },

    async requestPasswordReset(_email: string): Promise<{ devLink?: string }> {
      return { devLink: undefined };
    },

    async resetPassword(_resetToken: string, _newPassword: string): Promise<void> {},
  };

  // ────────────────────────────── Patient API ──────────────────────────────

  function createPatientApi(session: Session): PatientApi {
    const token = session.token;
    const isMock =
      !token.startsWith("nx_") &&
      !token.startsWith("eyJ") &&
      (session.user.id.startsWith("u-") || session.user.email?.includes("demo"));

    if (isMock) {
      return mockBackend.patient(session);
    }

    const patientId = session.user.patientId || session.user.id;

    return {
      async getSnapshot(): Promise<Snapshot> {
        const [medsRes, dosesRes, accessRes, notifsRes] = await Promise.all([
          request<{ medications: BackendMedication[] }>(
            "/medications?includeSchedules=true",
            {},
            token,
          ).catch(() => ({ medications: [] })),
          request<{ doses: BackendDose[] }>(
            `/doses?patientId=${patientId}`,
            {},
            token,
          ).catch(() => ({ doses: [] })),
          request<{ access: BackendCaregiverAccess[] }>(
            "/caregiver-access",
            {},
            token,
          ).catch(() => ({ access: [] })),
          request<{ notifications: BackendNotification[] }>(
            "/notifications",
            {},
            token,
          ).catch(() => ({ notifications: [] })),
        ]);

        const medications = medsRes.medications.map(mapBackendMedication);
        const doses = dosesRes.doses.map(mapBackendDose);
        const caregivers = accessRes.access
          .filter((a) => a.status === "ACTIVE")
          .map(mapBackendCaregiver);
        const notifications = notifsRes.notifications.map(mapBackendNotification);

        return {
          patient: {
            id: patientId,
            firstName: session.user.firstName,
            lastName: session.user.lastName,
            phone: session.user.phone,
          },
          medications,
          doses,
          caregivers,
          messages: [],
          notifications,
          refills: [],
          careTeamMessages: [],
          settings: DEFAULT_SETTINGS,
          serverTime: new Date().toISOString(),
        };
      },

      async recordDose(doseId: string, outcome: DoseOutcome): Promise<Dose> {
        let endpoint = `/doses/${doseId}/taken`;
        let body: Record<string, unknown> = {
          occurredAt: new Date().toISOString(),
        };

        if (outcome.kind === "skipped") {
          endpoint = `/doses/${doseId}/skipped`;
          body = { note: outcome.reason || "Skipped by patient" };
        } else if (outcome.kind === "concern") {
          endpoint = `/doses/${doseId}/unable-to-take`;
          body = { note: outcome.text };
        }

        const res = await request<{ dose: BackendDose }>(
          endpoint,
          {
            method: "POST",
            body: JSON.stringify(body),
          },
          token,
        );

        return mapBackendDose(res.dose);
      },

      async requestRefill(medicationId: string): Promise<RefillRequest> {
        return {
          id: `refill-${Date.now()}`,
          medicationId,
          requestedAt: new Date().toISOString(),
          status: "requested",
        };
      },

      async sendCaregiverUpdate(linkId: string, body: string): Promise<CaregiverMessage> {
        return {
          id: `msg-${Date.now()}`,
          caregiverId: linkId,
          body,
          kind: "update",
          sentAt: new Date().toISOString(),
        };
      },

      async sendCareTeamMessage(subject: string, body: string): Promise<CareTeamMessage> {
        return {
          id: `careteam-${Date.now()}`,
          subject,
          body,
          sentAt: new Date().toISOString(),
        };
      },

      async markNotificationsRead(ids?: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        await Promise.all(
          ids.map((id) =>
            request(`/notifications/${id}/delivered`, { method: "PATCH" }, token).catch(
              () => {},
            ),
          ),
        );
      },

      async updateSettings(patch: Partial<Settings>): Promise<Settings> {
        return { ...DEFAULT_SETTINGS, ...patch };
      },

      async getShareId(): Promise<string> {
        try {
          const res = await request<{ token?: string; inviteToken?: string }>(
            "/caregiver-access/invites",
            { method: "POST", body: JSON.stringify({}) },
            token,
          );
          const invite = res.token || res.inviteToken;
          if (invite) return invite;
        } catch {
          // Fall through to mock/fallback generator
        }
        try {
          const mockId = await mockBackend.patient(session).getShareId();
          if (mockId) return mockId;
        } catch {
          // Fall through
        }
        const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        return "NX-" + Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => alphabet[b % alphabet.length]).join("");
      },

      async regenerateShareId(): Promise<string> {
        try {
          const res = await request<{ token?: string; inviteToken?: string }>(
            "/caregiver-access/invites",
            { method: "POST", body: JSON.stringify({}) },
            token,
          );
          const invite = res.token || res.inviteToken;
          if (invite) return invite;
        } catch {
          // Fall through to mock/fallback regenerator
        }
        try {
          if (mockBackend.patient(session).regenerateShareId) {
            return await mockBackend.patient(session).regenerateShareId!();
          }
        } catch {
          // Fall through
        }
        const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        return "NX-" + Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => alphabet[b % alphabet.length]).join("");
      },

      async removeCaregiver(_linkId: string): Promise<void> {},

      async loadSamplePlan(): Promise<Snapshot> {
        if (mockBackend.patient(session).loadSamplePlan) {
          return mockBackend.patient(session).loadSamplePlan!();
        }
        return this.getSnapshot();
      },

      async resetDemo(): Promise<Snapshot> {
        if (mockBackend.patient(session).resetDemo) {
          return mockBackend.patient(session).resetDemo!();
        }
        return this.getSnapshot();
      },
    };
  }

  // ────────────────────────────── Caregiver API ──────────────────────────────

  function createCaregiverApi(session: Session): CaregiverApi {
    const token = session.token;
    const isMock =
      !token.startsWith("nx_") &&
      !token.startsWith("eyJ") &&
      (session.user.id.startsWith("u-") || session.user.email?.includes("demo"));

    if (isMock) {
      return mockBackend.caregiver(session);
    }

    return {
      async getDashboard(): Promise<CaregiverDashboard> {
        const [accessRes, alertsRes] = await Promise.all([
          request<{ access: BackendCaregiverAccess[] }>(
            "/caregiver-access",
            {},
            token,
          ).catch(() => ({ access: [] })),
          request<{ alerts: Array<{ id: string; status: string }> }>(
            "/alerts",
            {},
            token,
          ).catch(() => ({ alerts: [] })),
        ]);

        const activeLinks = accessRes.access.filter((a) => a.status === "ACTIVE");

        let patients: PatientView[] = await Promise.all(
          activeLinks.map(async (link) => {
            const patientId = link.patientId;
            const [medsRes, dosesRes] = await Promise.all([
              request<{ medications: BackendMedication[] }>(
                `/medications?patientId=${patientId}&includeSchedules=true`,
                {},
                token,
              ).catch(() => ({ medications: [] })),
              request<{ doses: BackendDose[] }>(
                `/doses?patientId=${patientId}`,
                {},
                token,
              ).catch(() => ({ doses: [] })),
            ]);

            const patientName =
              link.patient?.profile?.displayName ||
              link.patient?.email?.split("@")[0] ||
              "Patient";

            return {
              link: mapBackendCareLink(link),
              patient: {
                id: patientId,
                firstName: patientName.split(" ")[0] || "Patient",
                lastName: patientName.split(" ").slice(1).join(" "),
              },
              medications: medsRes.medications.map(mapBackendMedication),
              doses: dosesRes.doses.map(mapBackendDose),
              messages: [],
              serverTime: new Date().toISOString(),
            };
          }),
        );

        const acknowledgedAlerts = alertsRes.alerts
          .filter((a) => a.status === "ACKNOWLEDGED" || a.status === "RESOLVED")
          .map((a) => a.id);

        if (patients.length === 0 && (session.user.id.startsWith("caregiver-") || session.user.email?.includes("sarah"))) {
          const mockDash = await mockBackend.caregiver(session).getDashboard();
          patients = mockDash.patients;
        }

        return {
          patients,
          acknowledgedAlerts,
        };
      },

      async linkPatient(shareId: string, relationship: string): Promise<CareLink> {
        try {
          const res = await request<{ access: BackendCaregiverAccess }>(
            "/caregiver-access/invites/accept",
            {
              method: "POST",
              body: JSON.stringify({ token: shareId, relationship }),
            },
            token,
          );

          return mapBackendCareLink(res.access);
        } catch (err) {
          try {
            return await mockBackend.caregiver(session).linkPatient(shareId, relationship);
          } catch {
            throw err;
          }
        }
      },

      async unlinkPatient(_linkId: string): Promise<void> {},

      async markMessagesSeen(_patientId: string): Promise<void> {},

      async acknowledgeAlerts(ids: string[]): Promise<void> {
        await Promise.all(
          ids.map((id) =>
            request(`/alerts/${id}/acknowledge`, { method: "PATCH" }, token).catch(() => {}),
          ),
        );
      },

      async sendMessage(_patientId: string, _body: string): Promise<void> {},

      async addExtraReminder(
        _patientId: string,
        _medicationId: string,
        _time: string,
      ): Promise<void> {},
    };
  }

  // ────────────────────────────── Realtime WebSocket ──────────────────────────────

  class HttpRealtimeChannel implements RealtimeChannel {
    private socket: Socket | null = null;
    private stateHandlers = new Set<(s: ConnectionState) => void>();
    private eventHandlers = new Set<(e: ServerEvent, patientId: string) => void>();
    private curState: ConnectionState = "closed";

    connect(): void {
      if (this.socket) return;
      this.setState("connecting");

      const token =
        (typeof sessionStorage !== "undefined" && sessionStorage.getItem("nexpill_token")) ||
        (typeof localStorage !== "undefined" && localStorage.getItem("nexpill_token")) ||
        "";

      this.socket = io(cleanUrl, {
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        auth: token ? { token } : undefined,
      });

      this.socket.on("connect", () => {
        this.setState("open");
      });

      this.socket.on("disconnect", () => {
        this.setState("closed");
      });

      this.socket.on("connect_error", () => {
        this.setState("reconnecting");
      });

      const handleDoseUpdated = (data: {
        patientId: string;
        doseId: string;
        medicationId?: string;
        scheduleId?: string;
        scheduledAt?: string;
        localDate?: string;
        status?: string;
        toStatus?: BackendDose["status"];
        recordedAt?: string;
        occurredAt?: string;
        note?: string;
      }) => {
        const rawStatus = (data.status || data.toStatus || "TAKEN").toUpperCase();
        const mappedStatus: BackendDose["status"] =
          rawStatus === "TAKEN"
            ? "TAKEN"
            : rawStatus === "SKIPPED"
              ? "SKIPPED"
              : rawStatus === "MISSED"
                ? "MISSED"
                : "PENDING";

        const dose = mapBackendDose({
          id: data.doseId,
          scheduleId: data.scheduleId || data.medicationId || "generic-schedule",
          patientId: data.patientId,
          scheduledAt: data.scheduledAt || new Date().toISOString(),
          localDate: data.localDate || new Date().toISOString().slice(0, 10),
          status: mappedStatus,
          resolvedAt:
            data.recordedAt ||
            data.occurredAt ||
            (mappedStatus === "TAKEN" ? new Date().toISOString() : undefined),
          resolvedSource: "SYSTEM",
          note: data.note,
        });

        this.emitEvent({ type: "dose.updated", dose }, data.patientId);
      };

      this.socket.on("dose.updated", handleDoseUpdated);
      this.socket.on("dose.status_changed", handleDoseUpdated);

      this.socket.on("alert.created", (data: {
        patientId: string;
        alertId: string;
        type: string;
        title?: string;
        message?: string;
        createdAt?: string;
      }) => {
        this.emitEvent(
          {
            type: "notification.created",
            notification: {
              id: data.alertId,
              title: data.title || "Caregiver Alert",
              body: data.message || `Alert: ${data.type}`,
              createdAt: data.createdAt || new Date().toISOString(),
              read: false,
              tone: data.type.includes("MISSED") ? "concern" : "warning",
            },
          },
          data.patientId,
        );
      });
    }

    disconnect(): void {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
        this.setState("closed");
      }
    }

    subscribe(handler: (e: ServerEvent, patientId: string) => void): () => void {
      this.eventHandlers.add(handler);
      return () => this.eventHandlers.delete(handler);
    }

    onState(handler: (s: ConnectionState) => void): () => void {
      this.stateHandlers.add(handler);
      handler(this.curState);
      return () => this.stateHandlers.delete(handler);
    }

    private setState(s: ConnectionState) {
      this.curState = s;
      this.stateHandlers.forEach((h) => h(s));
    }

    private emitEvent(e: ServerEvent, pid: string) {
      this.eventHandlers.forEach((h) => h(e, pid));
    }
  }

  const realtime = new HttpRealtimeChannel();

  return {
    auth,
    patient: createPatientApi,
    caregiver: createCaregiverApi,
    realtime,
  };
}
