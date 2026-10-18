import type { Dose, ISODate, Medication, Snapshot } from './types';
import { addDays, toISODate } from '@/lib/time';
import { doseState, isCounted, isTakenState } from './status';

export const isResolved = (d: Dose) => d.status !== 'upcoming';

export function dosesOn(doses: Dose[], date: ISODate): Dose[] {
  return doses.filter((d) => d.date === date).sort((a, b) => a.time.localeCompare(b.time));
}

/** First unresolved dose of the day = "Up next" / "Due next". */
export function nextDose(todays: Dose[]): Dose | undefined {
  return todays.find((d) => d.status === 'upcoming');
}

export function progress(todays: Dose[]) {
  const total = todays.length;
  const done = todays.filter(isResolved).length;
  const taken = todays.filter((d) => d.status === 'taken').length;
  return {
    total,
    done,
    taken,
    remaining: total - done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** Rolling adherence: taken ÷ resolved doses over the last `days` days. */
export function adherence(doses: Dose[], today: ISODate, days = 30, now: Date = new Date()): number {
  const from = toISODate(addDays(new Date(`${today}T00:00:00`), -(days - 1)));
  const resolved = doses.filter((d) => d.date >= from && d.date <= today && isCounted(d, now));
  if (resolved.length === 0) return 0;
  const taken = resolved.filter((d) => isTakenState(doseState(d, now))).length;
  return Math.round((taken / resolved.length) * 100);
}

export interface WeekBar {
  label: string;
  date: ISODate;
  /** 0–1, or null when there is no data yet (future day). */
  value: number | null;
  taken: number;
  total: number;
}

/** Monday → Sunday of the week containing `today`. */
export function weekBars(doses: Dose[], today: ISODate, now: Date = new Date()): WeekBar[] {
  const t = new Date(`${today}T00:00:00`);
  const monday = addDays(t, -((t.getDay() + 6) % 7));
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return labels.map((label, i) => {
    const date = toISODate(addDays(monday, i));
    const day = doses.filter((d) => d.date === date);
    const counted = day.filter((d) => isCounted(d, now));
    const taken = day.filter((d) => isTakenState(doseState(d, now))).length;
    const future = date > today || counted.length === 0;
    return { label, date, taken, total: counted.length, value: future ? null : taken / counted.length };
  });
}

export function daysOfSupply(med: Medication): number {
  const perDay = Math.max(med.schedule.length, 1);
  return Math.floor(med.pillsLeft / perDay);
}

export function lowestSupply(s: Pick<Snapshot, 'medications'>) {
  return [...s.medications]
    .map((m) => ({ med: m, days: daysOfSupply(m) }))
    .filter((x) => x.days <= x.med.refillThresholdDays)
    .sort((a, b) => a.days - b.days)[0];
}

/** Consecutive days (ending today/yesterday) with every dose taken. */
export function streak(doses: Dose[], today: ISODate): number {
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const date = toISODate(addDays(new Date(`${today}T00:00:00`), -i));
    const day = doses.filter((d) => d.date === date);
    if (day.length === 0) break;
    const unresolved = day.some((d) => d.status === 'upcoming');
    if (i === 0 && unresolved) continue;
    if (day.every((d) => d.status === 'taken')) n++;
    else break;
  }
  return n;
}
