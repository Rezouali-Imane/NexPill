import type { Dose, DoseStatus, Medication, Settings } from '@/domain/types';
import { addDays, toISODate } from '@/lib/time';

const med = (id: string, name: string, strength: string, schedule: string[], o: Partial<Medication> = {}): Medication => ({
  id, name, strength, form: 'tablet', instructions: `Take 1 tablet`, important: 'Take at the same time each day.',
  prescriber: 'Dr. Sarah Chen', purpose: '', schedule, pillsLeft: 40, refillThresholdDays: 10, ...o,
});

export const JAMIE_MEDS: Medication[] = [
  med('med-metformin', 'Metformin', '500 mg', ['08:00'], { instructions: 'Take 1 tablet with breakfast', important: 'Take with food to reduce stomach upset. Swallow whole.', purpose: 'Blood sugar control', pillsLeft: 8 }),
  med('med-lisinopril', 'Lisinopril', '10 mg', ['12:30'], { instructions: 'Take 1 tablet with water', important: 'Take at the same time each day. You may take this medication with or without food.', purpose: 'Blood pressure', pillsLeft: 24 }),
  med('med-atorvastatin', 'Atorvastatin', '20 mg', ['20:00'], { instructions: 'Take 1 tablet in the evening', important: 'Avoid large amounts of grapefruit juice.', purpose: 'Cholesterol', pillsLeft: 41 }),
];

export const AHMED_MEDS: Medication[] = [
  med('med-metformin', 'Metformin', '500 mg', ['08:00', '18:00'], { purpose: 'Blood sugar control', instructions: 'Take 1 tablet with food', pillsLeft: 30 }),
  med('med-lisinopril', 'Lisinopril', '10 mg', ['12:00'], { purpose: 'Blood pressure', pillsLeft: 33 }),
  med('med-aspirin', 'Aspirin', '75 mg', ['14:00'], { purpose: 'Heart protection', pillsLeft: 50 }),
  med('med-atorvastatin', 'Atorvastatin', '20 mg', ['22:00'], { purpose: 'Cholesterol', pillsLeft: 29 }),
];

export const NADIA_MEDS: Medication[] = [
  med('med-levothyroxine', 'Levothyroxine', '50 mcg', ['07:00'], { purpose: 'Thyroid', instructions: 'Take on an empty stomach', pillsLeft: 27 }),
  med('med-amlodipine', 'Amlodipine', '5 mg', ['09:00'], { purpose: 'Blood pressure', pillsLeft: 35 }),
  med('med-metformin', 'Metformin', '850 mg', ['21:00'], { purpose: 'Blood sugar control', pillsLeft: 36 }),
];

export const DEFAULT_SETTINGS: Settings = {
  reminders: true, reminderLeadMinutes: 5, caregiverUpdates: true, textSize: 'standard', deviceSounds: true,
};

export interface DosePlan {
  /** Past-day exceptions: [daysBack, time]. */
  missed: [number, string][];
  skipped: [number, string][];
  /** Minutes after the schedule that a dose is normally confirmed, per time slot. */
  delay?: Record<string, number>;
  /** 'fixed': first slot of today taken, the rest upcoming (matches the design). 'clock': follows the real time. */
  today: 'fixed' | 'clock';
  /** Slots never confirmed today. */
  openToday?: string[];
  /** Slots confirmed late today (minutes after schedule). */
  lateToday?: Record<string, number>;
}

export const JAMIE_PLAN: DosePlan = {
  today: 'fixed',
  missed: [[1, '20:00'], [6, '08:00'], [9, '20:00'], [13, '12:30'], [17, '20:00'], [22, '08:00']],
  skipped: [[4, '12:30']],
};
export const AHMED_PLAN: DosePlan = {
  today: 'clock',
  missed: [[1, '18:00'], [2, '18:00'], [4, '18:00'], [6, '18:00'], [11, '18:00'], [13, '18:00']],
  skipped: [[3, '12:00']],
  delay: { '18:00': 50 },
  openToday: ['18:00'],
  lateToday: { '14:00': 42 },
};
export const NADIA_PLAN: DosePlan = {
  today: 'clock',
  missed: [[2, '21:00'], [5, '09:00'], [10, '21:00']],
  skipped: [],
  delay: { '09:00': 12 },
};

export function buildDoses(meds: Medication[], plan: DosePlan, now = new Date()): Dose[] {
  const doses: Dose[] = [];
  const slots = meds.flatMap((m) => m.schedule.map((time) => ({ m, time }))).sort((a, b) => a.time.localeCompare(b.time));
  for (let back = 29; back >= 0; back--) {
    const date = toISODate(addDays(now, -back));
    slots.forEach(({ m, time }, i) => {
      const due = new Date(`${date}T${time}:00`);
      let status: DoseStatus = 'taken';
      let delay = plan.delay?.[time] ?? 3;
      if (plan.missed.some(([b, t]) => b === back && t === time)) status = 'missed';
      else if (plan.skipped.some(([b, t]) => b === back && t === time)) status = 'skipped';
      else if (back === 0) {
        if (plan.today === 'fixed') status = i === 0 ? 'taken' : 'upcoming';
        else {
          delay = plan.lateToday?.[time] ?? delay;
          status = plan.openToday?.includes(time) || new Date(due.getTime() + delay * 60000) > now ? 'upcoming' : 'taken';
        }
      }
      let resolvedAt: Date | undefined;
      if (status === 'taken') {
        resolvedAt = new Date(due.getTime() + delay * 60000);
        if (plan.today === 'fixed' && back === 0 && resolvedAt > now) resolvedAt = new Date(now);
      } else if (status === 'skipped') resolvedAt = due;
      doses.push({
        id: `dose-${date}-${m.id}-${time.replace(':', '')}`, medicationId: m.id, date, time, status,
        resolvedAt: resolvedAt?.toISOString(),
        source: status === 'taken' ? (i % 2 === 0 ? 'device' : 'app') : undefined,
        note: status === 'skipped' ? 'Felt nauseous' : undefined,
      });
    });
  }
  return doses;
}
