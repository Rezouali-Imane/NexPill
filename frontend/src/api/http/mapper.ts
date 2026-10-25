import type { CareLink } from "@/domain/auth";
import type {
  AppNotification,
  Caregiver,
  Dose,
  DoseStatus,
  Medication,
} from "@/domain/types";

export interface BackendMedication {
  id: string;
  name: string;
  dosageText: string;
  form?: string | null;
  instructions?: string | null;
  prescriber?: string | null;
  status: string;
  schedules?: Array<{
    id: string;
    timesOfDay: string[];
    doseLabel: string;
  }>;
}

export interface BackendDose {
  id: string;
  scheduleId: string;
  patientId: string;
  scheduledAt: string;
  localDate: string;
  lateAfterAt?: string;
  missedDeadlineAt?: string;
  status: "PENDING" | "TAKEN" | "SKIPPED" | "UNABLE_TO_TAKE" | "MISSED" | "CANCELLED";
  resolvedAt?: string | null;
  resolvedSource?: string | null;
  note?: string | null;
  schedule?: {
    medicationId: string;
    doseLabel?: string;
    medication?: BackendMedication;
  };
}

export interface BackendCaregiverAccess {
  id: string;
  caregiverId?: string | null;
  patientId: string;
  status: "PENDING" | "ACTIVE" | "REVOKED";
  canViewSchedule: boolean;
  canViewHistory: boolean;
  canReceiveAlerts: boolean;
  canRecordDoses: boolean;
  canManageMedications: boolean;
  caregiver?: {
    id: string;
    email: string;
    profile?: { displayName: string } | null;
  } | null;
  patient?: {
    id: string;
    email: string;
    profile?: { displayName: string } | null;
  } | null;
  createdAt: string;
}

export interface BackendNotification {
  id: string;
  title: string;
  body: string;
  kind: string;
  status: string;
  scheduledFor: string;
  createdAt: string;
  read?: boolean;
}

export function mapBackendDoseStatus(status: BackendDose["status"]): DoseStatus {
  switch (status) {
    case "TAKEN":
      return "taken";
    case "SKIPPED":
      return "skipped";
    case "UNABLE_TO_TAKE":
      return "concern";
    case "MISSED":
      return "missed";
    case "CANCELLED":
      return "skipped";
    case "PENDING":
    default:
      return "upcoming";
  }
}

export function mapBackendMedication(med: BackendMedication): Medication {
  const allTimes = (med.schedules ?? []).flatMap((s) => s.timesOfDay);
  const scheduleTimes = allTimes.length > 0 ? allTimes : ["08:00", "20:00"];

  return {
    id: med.id,
    name: med.name,
    strength: med.dosageText || "Standard dose",
    form: med.form || "tablet",
    instructions: med.instructions || "Take as prescribed with water",
    important: "Take regularly at scheduled times. Do not exceed prescribed dosage.",
    prescriber: med.prescriber || "Primary Care Physician",
    purpose: "Prescribed therapy",
    schedule: scheduleTimes,
    pillsLeft: 30,
    refillThresholdDays: 7,
  };
}

export function mapBackendDose(d: BackendDose): Dose {
  const scheduledTime = d.scheduledAt
    ? new Date(d.scheduledAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "12:00";

  const dateStr = d.localDate
    ? d.localDate.slice(0, 10)
    : d.scheduledAt
      ? d.scheduledAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  return {
    id: d.id,
    medicationId: d.schedule?.medicationId ?? d.scheduleId,
    date: dateStr,
    time: scheduledTime,
    status: mapBackendDoseStatus(d.status),
    resolvedAt: d.resolvedAt ?? undefined,
    source: (d.resolvedSource?.toLowerCase() as Dose["source"]) ?? "app",
    note: d.note ?? undefined,
  };
}

export function mapBackendCaregiver(access: BackendCaregiverAccess): Caregiver {
  const name =
    access.caregiver?.profile?.displayName ||
    access.caregiver?.email?.split("@")[0] ||
    "Caregiver";

  return {
    id: access.id,
    userId: access.caregiverId || access.id,
    name,
    relationship: "Caregiver",
    isPrimary: true,
    status: "active",
    notifyOn: {
      missedDose: access.canReceiveAlerts,
      concern: access.canReceiveAlerts,
      refill: access.canManageMedications,
    },
  };
}

export function mapBackendCareLink(access: BackendCaregiverAccess): CareLink {
  return {
    id: access.id,
    caregiverId: access.caregiverId || access.id,
    patientId: access.patientId,
    relationship: "Primary Caregiver",
    status: "active",
    isPrimary: true,
    notifyOn: {
      missedDose: access.canReceiveAlerts,
      concern: access.canReceiveAlerts,
      refill: access.canManageMedications,
    },
    createdAt: access.createdAt,
  };
}

export function mapBackendNotification(n: BackendNotification): AppNotification {
  const tone =
    n.kind.includes("WARNING") || n.kind.includes("ALERT")
      ? "warning"
      : n.kind.includes("MISSED")
        ? "concern"
        : "info";

  return {
    id: n.id,
    title: n.title,
    body: n.body,
    createdAt: n.createdAt,
    read: n.status === "DELIVERED" || Boolean(n.read),
    tone,
  };
}
