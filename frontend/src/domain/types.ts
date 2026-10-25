/** Domain model shared by the UI, the API client and the realtime channel. */

export type DoseStatus = 'upcoming' | 'taken' | 'skipped' | 'missed' | 'concern';
export type DoseSource = 'app' | 'device' | 'caregiver';

import type { CareLink } from './auth';

/** Local calendar date, `YYYY-MM-DD`. */
export type ISODate = string;
/** 24h local time, `HH:mm`. */
export type Clock = string;
/** Full ISO-8601 timestamp. */
export type ISOTimestamp = string;

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface Medication {
  id: string;
  name: string;
  /** e.g. "500 mg" */
  strength: string;
  /** e.g. "tablet" */
  form: string;
  instructions: string;
  /** Extra guidance shown in the "Important" callout. */
  important: string;
  prescriber: string;
  purpose: string;
  /** Times per day the medication is taken. */
  schedule: Clock[];
  pillsLeft: number;
  /** Show the refill reminder when remaining days <= this. */
  refillThresholdDays: number;
}

export interface Dose {
  id: string;
  medicationId: string;
  date: ISODate;
  time: Clock;
  status: DoseStatus;
  resolvedAt?: ISOTimestamp;
  source?: DoseSource;
  /** Free text: a concern, or why the dose was skipped. */
  note?: string;
}

export interface Caregiver {
  /** Link id (patient ↔ caregiver relationship). */
  id: string;
  userId: string;
  name: string;
  relationship: string;
  isPrimary: boolean;
  status: 'active';
  phone?: string;
  /** Events the caregiver is told about. */
  notifyOn: { missedDose: boolean; concern: boolean; refill: boolean };
}

export interface CaregiverMessage {
  id: string;
  caregiverId: string;
  body: string;
  sentAt: ISOTimestamp;
  acknowledgedAt?: ISOTimestamp;
  kind: 'update' | 'concern' | 'missed-dose' | 'refill';
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: ISOTimestamp;
  read: boolean;
  tone: 'info' | 'success' | 'warning' | 'concern';
}

export type RefillStatus = 'requested' | 'ready' | 'collected';
export interface RefillRequest {
  id: string;
  medicationId: string;
  requestedAt: ISOTimestamp;
  status: RefillStatus;
}

export interface CareTeamMessage {
  id: string;
  subject: string;
  body: string;
  sentAt: ISOTimestamp;
}

export interface Settings {
  reminders: boolean;
  reminderLeadMinutes: 0 | 5 | 10 | 15;
  caregiverUpdates: boolean;
  textSize: 'standard' | 'large';
  deviceSounds: boolean;
}

export interface Snapshot {
  patient: Patient;
  medications: Medication[];
  /** Today plus the preceding 29 days. */
  doses: Dose[];
  caregivers: Caregiver[];
  messages: CaregiverMessage[];
  notifications: AppNotification[];
  refills: RefillRequest[];
  careTeamMessages: CareTeamMessage[];
  settings: Settings;
  serverTime: ISOTimestamp;
}

/** Outcomes a patient can record for a dose. */
export type DoseOutcome =
  | { kind: 'taken' }
  | { kind: 'skipped'; reason?: string }
  | { kind: 'concern'; text: string };

/** Pushed from the server (simulated WebSocket in the mock). */
export type ServerEvent =
  | { type: 'dose.updated'; dose: Dose }
  | { type: 'caregiver.message'; message: CaregiverMessage }
  | { type: 'caregiver.acknowledged'; messageId: string; at: ISOTimestamp }
  | { type: 'notification.created'; notification: AppNotification }
  | { type: 'refill.updated'; refill: RefillRequest }
  /** A patient ↔ caregiver link was requested, approved or removed. */
  | { type: 'link.updated'; link: CareLink; removed?: boolean };

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';
