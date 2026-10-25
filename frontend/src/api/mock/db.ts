import type { CareLink, User } from "@/domain/auth";
import type {
  AppNotification,
  CareTeamMessage,
  CaregiverMessage,
  Dose,
  Medication,
  RefillRequest,
  ServerEvent,
  Settings,
} from "@/domain/types";
import { toISODate } from "@/lib/time";
import { hashPassword, newSalt } from "./crypto";
import { mockRealtime } from "../mockRealtime";
import {
  AHMED_MEDS,
  AHMED_PLAN,
  DEFAULT_SETTINGS,
  JAMIE_MEDS,
  JAMIE_PLAN,
  NADIA_MEDS,
  NADIA_PLAN,
  buildDoses,
} from "./seed";

export interface StoredUser extends User {
  hash: string;
  salt: string;
}

export interface PatientRecord {
  id: string;
  medications: Medication[];
  doses: Dose[];
  messages: CaregiverMessage[];
  notifications: AppNotification[];
  /** Permanent public ID the patient shares with caregivers (NX-XXXXXXXX). */
  shareId: string;
  refills: RefillRequest[];
  careTeamMessages: CareTeamMessage[];
  settings: Settings;
  extraReminders: { id: string; medicationId: string; time: string }[];
  /** Demo patients get their doses re-anchored to "today" each day. */
  demo?: "jamie" | "ahmed" | "nadia";
  seedDay?: string;
}

export interface DB {
  v: 3;
  users: StoredUser[];
  sessions: Record<string, { userId: string; expiresAt: number }>;
  patients: Record<string, PatientRecord>;
  links: CareLink[];
  resets: Record<string, { userId: string; expiresAt: number }>;
  acks: Record<string, string[]>;
  failures: Record<string, { count: number; until: number }>;
}

export const DEMO_PASSWORD = "Nexpill123!";
export const DEMO_ACCOUNTS = {
  patient: "jamie@nexpill.demo",
  caregiver: "emily@nexpill.demo",
};

const KEY = "nexpill.mock.db.v3";

const ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
/** New unique patient ID, e.g. NX-7K3M9QXA (31^8 combinations). */
export function newShareId(db: DB): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const id =
      "NX-" +
      [...bytes].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
    if (!Object.values(db.patients).some((p) => p.shareId === id)) return id;
  }
}
export const uid = (p: string) =>
  `${p}-${Math.random().toString(36).slice(2, 10)}`;
export const wait = (ms = 160) => new Promise<void>((r) => setTimeout(r, ms));
export const clone = <T>(v: T): T => structuredClone(v);

const DEMO = {
  jamie: { meds: JAMIE_MEDS, plan: JAMIE_PLAN },
  ahmed: { meds: AHMED_MEDS, plan: AHMED_PLAN },
  nadia: { meds: NADIA_MEDS, plan: NADIA_PLAN },
} as const;

function record(
  id: string,
  shareId: string,
  meds: Medication[],
  doses: Dose[],
  demo?: PatientRecord["demo"],
): PatientRecord {
  return {
    id,
    shareId,
    medications: clone(meds),
    doses,
    messages: [],
    notifications: [],
    refills: [],
    careTeamMessages: [],
    settings: { ...DEFAULT_SETTINGS },
    extraReminders: [],
    demo,
    seedDay: demo ? toISODate(new Date()) : undefined,
  };
}

async function seedUser(
  id: string,
  role: User["role"],
  first: string,
  last: string,
  email: string,
  birth: string,
  extra: Partial<User> = {},
): Promise<StoredUser> {
  const salt = newSalt();
  return {
    id,
    role,
    firstName: first,
    lastName: last,
    email,
    birthDate: birth,
    hash: await hashPassword(DEMO_PASSWORD, salt),
    salt,
    ...extra,
  };
}

async function seed(): Promise<DB> {
  const now = new Date();
  const users = await Promise.all([
    seedUser(
      "u-jamie",
      "patient",
      "Jamie",
      "Miller",
      "jamie@nexpill.demo",
      "1952-04-18",
      { patientId: "p-jamie", phone: "+44 7700 900456" },
    ),
    seedUser(
      "u-ahmed",
      "patient",
      "Ahmed",
      "Khelifi",
      "ahmed@nexpill.demo",
      "1948-11-02",
      { patientId: "p-ahmed", phone: "+213 555 010 203" },
    ),
    seedUser(
      "u-nadia",
      "patient",
      "Nadia",
      "Cherif",
      "nadia@nexpill.demo",
      "1957-03-21",
      { patientId: "p-nadia", phone: "+213 555 010 487" },
    ),
    seedUser(
      "u-emily",
      "caregiver",
      "Emily",
      "Miller",
      "emily@nexpill.demo",
      "1981-06-09",
      { phone: "+44 7700 900123" },
    ),
  ]);
  const patients: Record<string, PatientRecord> = {
    "p-jamie": record(
      "p-jamie",
      "NX-JM4K7R2Q",
      JAMIE_MEDS,
      buildDoses(JAMIE_MEDS, JAMIE_PLAN, now),
      "jamie",
    ),
    "p-ahmed": record(
      "p-ahmed",
      "NX-AH8M3T6W",
      AHMED_MEDS,
      buildDoses(AHMED_MEDS, AHMED_PLAN, now),
      "ahmed",
    ),
    "p-nadia": record(
      "p-nadia",
      "NX-ND5P9X2C",
      NADIA_MEDS,
      buildDoses(NADIA_MEDS, NADIA_PLAN, now),
      "nadia",
    ),
  };
  patients["p-jamie"]!.notifications = [
    {
      id: "n-refill",
      title: "Refill reminder",
      body: "Metformin has about 8 days remaining.",
      createdAt: new Date(now.getTime() - 3600_000).toISOString(),
      read: false,
      tone: "warning",
    },
  ];
  const notify = { missedDose: true, concern: true, refill: true };
  const mk = (
    patientId: string,
    relationship: string,
    isPrimary: boolean,
  ): CareLink => ({
    id: `l-emily-${patientId}`,
    caregiverId: "u-emily",
    patientId,
    relationship,
    status: "active",
    isPrimary,
    notifyOn: { ...notify },
    createdAt: now.toISOString(),
  });
  return {
    v: 3,
    users,
    sessions: {},
    patients,
    resets: {},
    acks: {},
    failures: {},
    links: [
      mk("p-jamie", "Daughter", true),
      mk("p-ahmed", "Other relative", false),
      mk("p-nadia", "Friend or neighbour", false),
    ],
  };
}

let dbPromise: Promise<DB> | null = null;

export function getDb(): Promise<DB> {
  dbPromise ??= (async () => {
    let db: DB | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DB;
        if (parsed.v === 3) db = parsed;
      }
    } catch {
      /* ignore */
    }
    db ??= await seed();
    // Re-anchor demo patients to today so the dashboards always look live.
    const today = toISODate(new Date());
    for (const p of Object.values(db.patients)) {
      if (p.demo && p.seedDay !== today) {
        const d = DEMO[p.demo];
        const settings = p.settings,
          notifications = p.notifications;
        Object.assign(
          p,
          record(p.id, p.shareId, d.meds, buildDoses(d.meds, d.plan), p.demo),
          { settings, notifications },
        );
      }
    }
    save(db);
    return db;
  })();
  return dbPromise;
}

export function save(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage unavailable */
  }
}

/** Wipe everything and re-seed (demo tools / tests). */
export async function resetDb(): Promise<DB> {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  dbPromise = null;
  return getDb();
}

export const publish = (
  patientId: string,
  event: ServerEvent,
  latency?: number,
) => mockRealtime.publish(patientId, event, latency);

export function userName(db: DB, id: string) {
  const u = db.users.find((x) => x.id === id);
  return u
    ? {
        first: u.firstName,
        last: u.lastName,
        full: `${u.firstName} ${u.lastName}`,
        phone: u.phone,
      }
    : { first: "Someone", last: "", full: "Someone", phone: undefined };
}
