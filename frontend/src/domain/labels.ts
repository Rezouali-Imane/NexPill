import type { DoseStatus, Medication } from './types';

export const medName = (meds: Medication[], id: string) => meds.find((m) => m.id === id)?.name ?? 'Medication';
export const medById = (meds: Medication[], id: string) => meds.find((m) => m.id === id);

export const STATUS_LABEL: Record<DoseStatus, string> = {
  upcoming: 'Upcoming', taken: 'Taken', skipped: 'Skipped', missed: 'Missed', concern: 'Concern reported',
};
