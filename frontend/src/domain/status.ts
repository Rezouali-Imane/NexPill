import type { Dose } from './types';

/** Minutes after the scheduled time. Mirrors the escalation in the design: reminder, 2nd reminder (+15), caregiver alert (+30), missed (+60). */
export const SECOND_REMINDER_AFTER_MIN = 15;
export const ALERT_AFTER_MIN = 30;
export const MISSED_AFTER_MIN = 60;
/** Confirmed more than this long after the schedule = "late" (still counts as taken). */
export const LATE_AFTER_MIN = 30;

export type DoseState = 'upcoming' | 'due' | 'overdue' | 'missed' | 'taken' | 'late' | 'skipped' | 'concern';

export const scheduledAt = (d: Pick<Dose, 'date' | 'time'>) => new Date(`${d.date}T${d.time}:00`);
export const minutesBetween = (later: Date, earlier: Date) => Math.round((later.getTime() - earlier.getTime()) / 60000);

/** The state a dose is *displayed* in, derived from stored status + the clock. */
export function doseState(d: Dose, now: Date = new Date()): DoseState {
  const due = scheduledAt(d);
  switch (d.status) {
    case 'taken':
      return d.resolvedAt && minutesBetween(new Date(d.resolvedAt), due) > LATE_AFTER_MIN ? 'late' : 'taken';
    case 'skipped': return 'skipped';
    case 'concern': return 'concern';
    case 'missed': return 'missed';
    case 'upcoming': {
      const m = minutesBetween(now, due);
      if (m < 0) return 'upcoming';
      if (m < ALERT_AFTER_MIN) return 'due';
      if (m < MISSED_AFTER_MIN) return 'overdue';
      return 'missed';
    }
  }
}

/** Counted in adherence: resolved, or unresolved long enough to be treated as missed. */
export const isCounted = (d: Dose, now: Date = new Date()) => d.status !== 'upcoming' || doseState(d, now) === 'missed';
/** Counts as "taken" for adherence (late doses count). */
export const isTakenState = (s: DoseState) => s === 'taken' || s === 'late';

export const STATE_LABEL: Record<DoseState, string> = {
  upcoming: 'Upcoming', due: 'Due now', overdue: 'Overdue', missed: 'Missed',
  taken: 'Taken', late: 'Taken late', skipped: 'Skipped', concern: 'Concern reported',
};
