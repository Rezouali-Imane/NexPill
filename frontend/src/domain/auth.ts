import type { ISODate, ISOTimestamp } from './types';

export type Role = 'patient' | 'caregiver';

export interface User {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  birthDate: ISODate;
  phone?: string;
  /** Present for patients: the id of their medication record. */
  patientId?: string;
}

export interface Session {
  token: string;
  user: User;
}

export interface SignUpInput {
  role: Role;
  firstName: string;
  lastName: string;
  birthDate: ISODate;
  email: string;
  password: string;
  phone?: string;
}

export type LinkStatus = 'active';

/** A patient ↔ caregiver relationship. */
export interface CareLink {
  id: string;
  caregiverId: string;
  patientId: string;
  relationship: string;
  status: LinkStatus;
  isPrimary: boolean;
  /** What the caregiver is told about. */
  notifyOn: { missedDose: boolean; concern: boolean; refill: boolean };
  createdAt: ISOTimestamp;
}

export const MIN_AGE = 18;
export const RELATIONSHIPS = [
  'Daughter', 'Son', 'Spouse or partner', 'Parent', 'Sibling', 'Other relative', 'Friend or neighbour', 'Professional carer',
] as const;
