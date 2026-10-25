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
  ApiError,
  backend,
  type CaregiverApi,
  type RealtimeChannel,
} from "@/api";
import type { CaregiverDashboard } from "@/api/client";
import type { CareLink, Session } from "@/domain/auth";
import {
  alertsFor,
  insights,
  type CaregiverAlert,
  type PatientView,
  type RiskLevel,
} from "@/domain/caregiver";
import { toISODate } from "@/lib/time";
import { useUi } from "@/state/UiStore";

interface State {
  status: "loading" | "ready" | "error";
  error?: string;
  data: CaregiverDashboard | null;
  selectedId: string | null;
  lastUpdated: number;
}

type Action =
  | { type: "loaded"; data: CaregiverDashboard }
  | { type: "failed"; error: string }
  | { type: "select"; id: string }
  | { type: "view"; patientId: string; update: (v: PatientView) => PatientView }
  | { type: "acked"; ids: string[] }
  | { type: "touch" };

const SEL_KEY = "nexpill.caregiver.selected";
const readSel = () => {
  try {
    return sessionStorage.getItem(SEL_KEY);
  } catch {
    return null;
  }
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "loaded": {
      const ids = a.data.patients.map((p) => p.patient.id);
      const selectedId =
        s.selectedId && ids.includes(s.selectedId)
          ? s.selectedId
          : readSel() && ids.includes(readSel()!)
            ? readSel()
            : (ids[0] ?? null);
      return {
        ...s,
        status: "ready",
        data: a.data,
        selectedId,
        lastUpdated: Date.now(),
        error: undefined,
      };
    }
    case "failed":
      return { ...s, status: s.data ? s.status : "error", error: a.error };
    case "select":
      return { ...s, selectedId: a.id };
    case "touch":
      return { ...s, lastUpdated: Date.now() };
    case "acked":
      return s.data
        ? {
            ...s,
            data: {
              ...s.data,
              acknowledgedAlerts: [
                ...new Set([...s.data.acknowledgedAlerts, ...a.ids]),
              ],
            },
          }
        : s;
    case "view":
      return s.data
        ? {
            ...s,
            lastUpdated: Date.now(),
            data: {
              ...s.data,
              patients: s.data.patients.map((p) =>
                p.patient.id === a.patientId ? a.update(p) : p,
              ),
            },
          }
        : s;
  }
}

export interface CaregiverActions {
  reload(): Promise<void>;
  select(patientId: string): void;
  linkPatient(
    code: string,
    relationship: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  unlinkPatient(linkId: string): Promise<void>;
  markSeen(patientId: string): Promise<void>;
  acknowledge(ids: string[]): Promise<void>;
  sendMessage(patientId: string, body: string): Promise<boolean>;
  addReminder(
    patientId: string,
    medicationId: string,
    time: string,
  ): Promise<boolean>;
}

const Ctx = createContext<{ state: State; actions: CaregiverActions } | null>(
  null,
);
const errText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Please try again.";

export function CaregiverProvider({
  children,
  session,
  api: apiOverride,
  realtime = backend.realtime,
}: {
  children: ReactNode;
  session: Session;
  api?: CaregiverApi;
  realtime?: RealtimeChannel;
}) {
  const api = useMemo(
    () => apiOverride ?? backend.caregiver(session),
    [apiOverride, session],
  );
  const me = session.user.id;
  const [state, dispatch] = useReducer(reducer, {
    status: "loading",
    data: null,
    selectedId: null,
    lastUpdated: Date.now(),
  });
  const ref = useRef(state);
  ref.current = state;
  const { toast, announce, setConnection } = useUi();

  const reload = useCallback(async () => {
    try {
      dispatch({ type: "loaded", data: await api.getDashboard() });
    } catch (e) {
      dispatch({ type: "failed", error: errText(e) });
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const off = realtime.subscribe((event, pid) => {
      if (event.type === "link.updated") {
        if (event.link.caregiverId === me) {
          void reload();
          if (!event.removed && event.link.status === "active")
            toast("success", "A patient approved your request.");
        }
        return;
      }
      const d = ref.current.data;
      const view = d?.patients.find((p) => p.patient.id === pid);
      if (!view) return;
      if (event.type === "dose.updated") {
        const dose = event.dose;
        dispatch({
          type: "view",
          patientId: pid,
          update: (v) => ({
            ...v,
            doses: v.doses.some((x) => x.id === dose.id)
              ? v.doses.map((x) => (x.id === dose.id ? dose : x))
              : [...v.doses, dose],
          }),
        });
        const med = view.medications.find((m) => m.id === dose.medicationId);
        const verb =
          dose.status === "taken"
            ? "confirmed"
            : dose.status === "skipped"
              ? "skipped"
              : "reported a concern about";
        announce(
          `${view.patient.firstName} ${verb} ${med?.name ?? "a medication"}.`,
        );
      } else if (
        event.type === "caregiver.message" &&
        event.message.caregiverId === view.link.id
      ) {
        const msg = event.message;
        dispatch({
          type: "view",
          patientId: pid,
          update: (v) => ({
            ...v,
            messages: [msg, ...v.messages.filter((x) => x.id !== msg.id)],
          }),
        });
        if (msg.kind !== "update") announce(msg.body);
      } else if (event.type === "caregiver.acknowledged") {
        dispatch({ type: "touch" });
      }
    });
    const offState = realtime.onState((s) => {
      setConnection(s);
      if (s === "open" && ref.current.data) void reload();
    });
    realtime.connect();
    return () => {
      off();
      offState();
      realtime.disconnect();
    };
  }, [realtime, reload, me, toast, announce, setConnection]);

  const actions = useMemo<CaregiverActions>(
    () => ({
      reload,
      select(id) {
        try {
          sessionStorage.setItem(SEL_KEY, id);
        } catch {
          /* ignore */
        }
        dispatch({ type: "select", id });
      },
      async linkPatient(code, relationship) {
        try {
          const link: CareLink = await api.linkPatient(code, relationship);
          void link;
          await reload();
          return { ok: true };
        } catch (e) {
          return { ok: false, error: errText(e) };
        }
      },
      async unlinkPatient(linkId) {
        try {
          await api.unlinkPatient(linkId);
          toast("success", "Patient removed.");
          await reload();
        } catch (e) {
          toast("error", errText(e));
        }
      },
      async markSeen(patientId) {
        try {
          await api.markMessagesSeen(patientId);
        } catch {
          /* best effort */
        }
      },
      async acknowledge(ids) {
        dispatch({ type: "acked", ids });
        try {
          await api.acknowledgeAlerts(ids);
        } catch (e) {
          toast("error", errText(e));
          void reload();
        }
      },
      async sendMessage(patientId, body) {
        try {
          await api.sendMessage(patientId, body);
          toast("success", "Message sent.");
          announce("Message sent.");
          return true;
        } catch (e) {
          toast("error", errText(e));
          return false;
        }
      },
      async addReminder(patientId, medicationId, time) {
        try {
          await api.addExtraReminder(patientId, medicationId, time);
          toast("success", `Extra reminder added for ${time}.`);
          announce(`Extra reminder added for ${time}.`);
          return true;
        } catch (e) {
          toast("error", errText(e));
          return false;
        }
      },
    }),
    [api, reload, toast, announce],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useCtx() {
  const c = useContext(Ctx);
  if (!c)
    throw new Error("useCaregiver* must be used inside <CaregiverProvider>");
  return c;
}
export const useCaregiverState = () => useCtx().state;
export const useCaregiverActions = () => useCtx().actions;

/** Derived, clock-aware view of everything the caregiver sees. */
export function useCaregiverData(now: Date) {
  const { state } = useCtx();
  const data = state.data;
  return useMemo(() => {
    const today = toISODate(now);
    const patients = data?.patients ?? [];
    const acked = new Set(data?.acknowledgedAlerts ?? []);
    const risk = new Map<string, RiskLevel>();
    patients.forEach((p) =>
      risk.set(p.patient.id, insights(p, today, now).level),
    );
    const alerts: CaregiverAlert[] = patients
      .flatMap((p) => alertsFor(p, today, now))
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    const unseen = alerts.filter((a) => !acked.has(a.id));
    const needAttention = patients.filter(
      (p) => risk.get(p.patient.id) !== "stable",
    );
    const selected =
      patients.find((p) => p.patient.id === state.selectedId) ??
      patients[0] ??
      null;
    return {
      today,
      patients,
      risk,
      alerts,
      unseen,
      acked,
      needAttention,
      selected,
    };
  }, [data, now, state.selectedId]);
}
