import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  backend,
  ApiError,
  type PatientApi,
  type RealtimeChannel,
} from "@/api";
import type { Session } from "@/domain/auth";
import type {
  Dose,
  DoseOutcome,
  ServerEvent,
  Settings,
  Snapshot,
} from "@/domain/types";
import { medName } from "@/domain/labels";
import { useUi } from "./UiStore";

interface State {
  status: "loading" | "ready" | "error";
  error?: string;
  data: Snapshot | null;
  /** Dose ids with a request in flight. */
  pending: string[];
}

type Action =
  | { type: "loaded"; data: Snapshot }
  | { type: "failed"; error: string }
  | { type: "event"; event: ServerEvent }
  | { type: "dose/pending"; id: string; on: boolean }
  | { type: "dose/optimistic"; dose: Dose }
  | { type: "settings"; settings: Settings }
  | { type: "read"; ids?: string[] };

const initial: State = { status: "loading", data: null, pending: [] };

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [item, ...list];

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "loaded":
      return { ...s, status: "ready", data: a.data, error: undefined };
    case "failed":
      return { ...s, status: s.data ? s.status : "error", error: a.error };
    case "dose/pending":
      return {
        ...s,
        pending: a.on
          ? [...s.pending, a.id]
          : s.pending.filter((x) => x !== a.id),
      };
    case "dose/optimistic":
      return s.data
        ? { ...s, data: { ...s.data, doses: upsert(s.data.doses, a.dose) } }
        : s;
    case "settings":
      return s.data ? { ...s, data: { ...s.data, settings: a.settings } } : s;
    case "read":
      return s.data
        ? {
            ...s,
            data: {
              ...s.data,
              notifications: s.data.notifications.map((n) =>
                !a.ids || a.ids.includes(n.id) ? { ...n, read: true } : n,
              ),
            },
          }
        : s;
    case "event": {
      if (!s.data) return s;
      const d = s.data;
      const e = a.event;
      switch (e.type) {
        case "dose.updated":
          return { ...s, data: { ...d, doses: upsert(d.doses, e.dose) } };
        case "caregiver.message":
          return {
            ...s,
            data: { ...d, messages: upsert(d.messages, e.message) },
          };
        case "caregiver.acknowledged":
          return {
            ...s,
            data: {
              ...d,
              messages: d.messages.map((m) =>
                m.id === e.messageId ? { ...m, acknowledgedAt: e.at } : m,
              ),
            },
          };
        case "notification.created":
          return {
            ...s,
            data: {
              ...d,
              notifications: upsert(d.notifications, e.notification),
            },
          };
        case "refill.updated":
          return { ...s, data: { ...d, refills: upsert(d.refills, e.refill) } };
        default:
          return s;
      }
    }
  }
}

export interface PatientActions {
  recordDose(dose: Dose, outcome: DoseOutcome): Promise<boolean>;
  requestRefill(medicationId: string): Promise<boolean>;
  sendCaregiverUpdate(caregiverId: string, body: string): Promise<boolean>;
  sendCareTeamMessage(subject: string, body: string): Promise<boolean>;
  markNotificationsRead(ids?: string[]): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  getShareId(): Promise<string | null>;
  regenerateShareId(): Promise<string | null>;
  removeCaregiver(linkId: string): Promise<void>;
  loadSamplePlan(): Promise<void>;
  resetDemo(): Promise<void>;
  reload(): Promise<void>;
}

interface Ctx {
  state: State;
  actions: PatientActions;
}
const PatientCtx = createContext<Ctx | null>(null);

export function PatientProvider({
  children,
  session,
  api: apiOverride,
  realtime = backend.realtime,
}: {
  children: ReactNode;
  session: Session;
  api?: PatientApi;
  realtime?: RealtimeChannel;
}) {
  const api = useMemo(
    () => apiOverride ?? backend.patient(session),
    [apiOverride, session],
  );
  const patientId = session.user.patientId;
  const [state, dispatch] = useReducer(reducer, initial);
  const stateRef = useRef(state);
  stateRef.current = state;

  const { toast, announce, setConnection } = useUi();

  const errText = (e: unknown) =>
    e instanceof ApiError
      ? e.message
      : "Something went wrong. Please try again.";

  const reload = useCallback(async () => {
    try {
      dispatch({ type: "loaded", data: await api.getSnapshot() });
    } catch (e) {
      dispatch({ type: "failed", error: errText(e) });
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const offEvents = realtime.subscribe((event, pid) => {
      if (pid !== patientId) return;
      if (event.type === "link.updated") {
        void reload();
        return;
      }
      dispatch({ type: "event", event });
      if (event.type === "notification.created")
        announce(`${event.notification.title}. ${event.notification.body}`);
      if (event.type === "caregiver.acknowledged") {
        const d = stateRef.current.data;
        const msg = d?.messages.find((m) => m.id === event.messageId);
        const who =
          d?.caregivers
            .find((c) => c.id === msg?.caregiverId)
            ?.name.split(" ")[0] ?? "Your caregiver";
        toast("info", `${who} has seen your update.`);
      }
    });
    const offState = realtime.onState((s) => {
      setConnection(s);
      // Missed frames while offline: re-sync on reconnect.
      if (s === "open" && stateRef.current.data) void reload();
    });
    realtime.connect();
    return () => {
      offEvents();
      offState();
      realtime.disconnect();
    };
  }, [realtime, reload, toast, announce, setConnection, patientId]);

  const actions = useMemo<PatientActions>(
    () => ({
      async recordDose(dose, outcome) {
        if (stateRef.current.pending.includes(dose.id)) return false;
        const before = dose;
        const data = stateRef.current.data;
        const name = data
          ? medName(data.medications, dose.medicationId)
          : "Medication";
        dispatch({ type: "dose/pending", id: dose.id, on: true });
        dispatch({
          type: "dose/optimistic",
          dose: {
            ...dose,
            status:
              outcome.kind === "taken"
                ? "taken"
                : outcome.kind === "skipped"
                  ? "skipped"
                  : "concern",
            resolvedAt: new Date().toISOString(),
            source: "app",
          },
        });
        try {
          const saved = await api.recordDose(dose.id, outcome);
          dispatch({ type: "dose/optimistic", dose: saved });
          const text =
            outcome.kind === "taken"
              ? `${name} marked as taken.`
              : outcome.kind === "skipped"
                ? `${name} skipped for now. Your caregiver may be told.`
                : `Concern about ${name} sent to your care team.`;
          announce(text);
          toast("success", text);
          return true;
        } catch (e) {
          dispatch({ type: "dose/optimistic", dose: before });
          toast("error", errText(e));
          if (e instanceof ApiError && e.code === "conflict") void reload();
          return false;
        } finally {
          dispatch({ type: "dose/pending", id: dose.id, on: false });
        }
      },
      async requestRefill(medicationId) {
        try {
          await api.requestRefill(medicationId);
          toast(
            "success",
            "Refill requested. We will tell you when it is ready.",
          );
          announce("Refill requested.");
          return true;
        } catch (e) {
          toast("error", errText(e));
          return false;
        }
      },
      async sendCaregiverUpdate(caregiverId, body) {
        try {
          await api.sendCaregiverUpdate(caregiverId, body);
          toast("success", "Update sent.");
          announce("Update sent to your caregiver.");
          return true;
        } catch (e) {
          toast("error", errText(e));
          return false;
        }
      },
      async sendCareTeamMessage(subject, body) {
        try {
          await api.sendCareTeamMessage(subject, body);
          toast("success", "Message sent to your care team.");
          announce("Message sent to your care team.");
          return true;
        } catch (e) {
          toast("error", errText(e));
          return false;
        }
      },
      async markNotificationsRead(ids) {
        dispatch({ type: "read", ids });
        try {
          await api.markNotificationsRead(ids);
        } catch {
          void reload();
        }
      },
      async updateSettings(patch) {
        const prev = stateRef.current.data?.settings;
        if (prev)
          dispatch({ type: "settings", settings: { ...prev, ...patch } });
        try {
          dispatch({
            type: "settings",
            settings: await api.updateSettings(patch),
          });
        } catch (e) {
          if (prev) dispatch({ type: "settings", settings: prev });
          toast("error", errText(e));
        }
      },
      async getShareId() {
        try {
          return await api.getShareId();
        } catch (e) {
          toast("error", errText(e));
          return null;
        }
      },
      async regenerateShareId() {
        try {
          const id = await api.regenerateShareId();
          toast("success", "New ID created. The old one no longer works.");
          return id;
        } catch (e) {
          toast("error", errText(e));
          return null;
        }
      },
      async removeCaregiver(linkId) {
        try {
          await api.removeCaregiver(linkId);
          toast("success", "Caregiver removed.");
          await reload();
        } catch (e) {
          toast("error", errText(e));
        }
      },
      async loadSamplePlan() {
        if (api.loadSamplePlan)
          dispatch({ type: "loaded", data: await api.loadSamplePlan() });
      },
      async resetDemo() {
        if (api.resetDemo)
          dispatch({ type: "loaded", data: await api.resetDemo() });
      },
      reload,
    }),
    [api, reload, toast, announce],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <PatientCtx.Provider value={value}>{children}</PatientCtx.Provider>;
}

function useCtx() {
  const c = useContext(PatientCtx);
  if (!c) throw new Error("usePatient must be used inside <PatientProvider>");
  return c;
}

export const usePatientState = () => useCtx().state;
export const usePatientActions = () => useCtx().actions;

/** For pages: guaranteed non-null data. */
export function usePatientData() {
  const { state } = useCtx();
  if (!state.data) throw new Error("usePatientData called before data loaded");
  return state.data;
}
