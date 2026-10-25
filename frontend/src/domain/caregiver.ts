import type { CareLink } from './auth';
import {
  ALERT_AFTER_MIN, LATE_AFTER_MIN, MISSED_AFTER_MIN, SECOND_REMINDER_AFTER_MIN,
  doseState, isCounted, isTakenState, minutesBetween, scheduledAt, type DoseState,
} from './status';
import type { CaregiverMessage, Dose, ISODate, Medication, Patient } from './types';
import { addDays, formatClock, toISODate } from '@/lib/time';

export interface PatientView {
  link: CareLink;
  patient: Patient;
  medications: Medication[];
  /** Today and the preceding 29 days. */
  doses: Dose[];
  messages: CaregiverMessage[];
  serverTime: string;
}


export type RiskLevel = 'stable' | 'attention' | 'high';
export const RISK_LABEL: Record<RiskLevel, string> = { stable: 'Stable', attention: 'Needs attention', high: 'High risk' };

const med = (v: PatientView, d: Dose) => v.medications.find((m) => m.id === d.medicationId);
const medLabel = (v: PatientView, d: Dose) => { const m = med(v, d); return m ? `${m.name} ${m.strength}` : 'medication'; };
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const lastDays = (v: PatientView, days: number, today: ISODate) => {
  const from = toISODate(addDays(new Date(`${today}T00:00:00`), -(days - 1)));
  return v.doses.filter((d) => d.date >= from && d.date <= today);
};
const period = (time: string) => (Number(time.slice(0, 2)) < 12 ? 'morning' : Number(time.slice(0, 2)) < 18 ? 'afternoon' : 'evening');

/* ───────────────────────── today ───────────────────────── */

export interface TodaySummary {
  scheduled: number; due: number; taken: number; late: number; missed: number; skipped: number; upcoming: number;
  percent: number; missedTimes: string[]; skippedTimes: string[]; nextTime?: string;
}

export function todaySummary(v: PatientView, today: ISODate, now: Date): TodaySummary {
  const ds = v.doses.filter((d) => d.date === today).sort((a, b) => a.time.localeCompare(b.time));
  const st = ds.map((d) => ({ d, s: doseState(d, now) }));
  const by = (f: (s: DoseState) => boolean) => st.filter((x) => f(x.s));
  const upcoming = by((s) => s === 'upcoming' || s === 'due' || s === 'overdue');
  const taken = by(isTakenState).length;
  const due = ds.length - by((s) => s === 'upcoming').length;
  return {
    scheduled: ds.length, due, taken, late: by((s) => s === 'late').length,
    missed: by((s) => s === 'missed').length, skipped: by((s) => s === 'skipped').length,
    upcoming: upcoming.length, percent: due === 0 ? 0 : Math.round((taken / due) * 100),
    missedTimes: by((s) => s === 'missed').map((x) => x.d.time),
    skippedTimes: by((s) => s === 'skipped').map((x) => x.d.time),
    nextTime: upcoming[0]?.d.time,
  };
}

export interface TimelineItem { dose: Dose; state: DoseState; name: string; strength: string; detail: string }

export function timeline(v: PatientView, today: ISODate, now: Date): TimelineItem[] {
  return v.doses.filter((d) => d.date === today).sort((a, b) => a.time.localeCompare(b.time)).map((dose) => {
    const state = doseState(dose, now);
    const m = med(v, dose);
    let detail = '';
    if (state === 'taken' || state === 'late') detail = `Taken at ${hhmm(new Date(dose.resolvedAt ?? dose.date))}`;
    else if (state === 'missed') detail = 'No confirmation';
    else if (state === 'skipped') detail = 'Skipped';
    else if (state === 'concern') detail = 'Concern reported';
    else if (state === 'due' || state === 'overdue') detail = 'Waiting for confirmation';
    else { const mins = minutesBetween(scheduledAt(dose), now); detail = `In ${Math.floor(mins / 60)} h ${mins % 60} min`; }
    return { dose, state, name: m?.name ?? 'Medication', strength: m?.strength ?? '', detail };
  });
}

/* ───────────────────────── activity ───────────────────────── */

export interface ActivityEvent { id: string; at: Date; title: string; detail: string; tone: 'success' | 'warning' | 'concern' | 'info'; badge?: string }

/** Escalation rules applied to the day's doses. A backend would store these events; the front end derives them identically. */
export function activityFor(v: PatientView, today: ISODate, now: Date, caregiverFirstName = 'you'): ActivityEvent[] {
  const first = v.patient.firstName;
  const out: ActivityEvent[] = [];
  for (const d of v.doses.filter((x) => x.date === today)) {
    const due = scheduledAt(d);
    const label = medLabel(v, d);
    const resolved = d.resolvedAt ? new Date(d.resolvedAt) : null;
    const stillOpenAt = (min: number) => { const at = new Date(due.getTime() + min * 60000); return at <= now && (!resolved || resolved > at); };
    if (due <= now) {
      if (stillOpenAt(0) || resolved) out.push({ id: `${d.id}-r1`, at: due, title: `First reminder sent to ${first}`, detail: label, tone: 'info' });
      if (stillOpenAt(SECOND_REMINDER_AFTER_MIN)) out.push({ id: `${d.id}-r2`, at: new Date(due.getTime() + SECOND_REMINDER_AFTER_MIN * 60000), title: `Second reminder sent to ${first}`, detail: label, tone: 'info' });
      if (stillOpenAt(ALERT_AFTER_MIN)) out.push({ id: `${d.id}-al`, at: new Date(due.getTime() + ALERT_AFTER_MIN * 60000), title: `Alert sent to ${caregiverFirstName}`, detail: 'No confirmation after two reminders', tone: 'warning' });
    }
    const s = doseState(d, now);
    if (s === 'missed') out.push({ id: `${d.id}-m`, at: new Date(due.getTime() + MISSED_AFTER_MIN * 60000), title: 'Dose marked missed', detail: `${label}, due at ${d.time}`, tone: 'concern', badge: 'Missed' });
    if (resolved && (s === 'taken' || s === 'late')) {
      const mins = minutesBetween(resolved, due);
      out.push({
        id: `${d.id}-t`, at: resolved, title: `${first} confirmed ${label}`, tone: 'success', badge: s === 'late' ? 'Late' : 'Taken',
        detail: s === 'late' ? `${mins} minutes after the scheduled time` : `Within ${LATE_AFTER_MIN} minutes of the scheduled time`,
      });
    }
    if (resolved && s === 'skipped') out.push({ id: `${d.id}-s`, at: resolved, title: `${first} skipped ${label}`, detail: d.note ?? 'No reason given', tone: 'warning', badge: 'Skipped' });
    if (resolved && s === 'concern') out.push({ id: `${d.id}-c`, at: resolved, title: `${first} reported a concern`, detail: `${label}: ${d.note ?? ''}`, tone: 'concern', badge: 'Concern' });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/* ───────────────────────── risk & insights ───────────────────────── */

export interface Insight {
  level: RiskLevel;
  reasons: string[];
  adherence7: number;
  adherencePrev7: number | null;
  missed7: number;
  suggestion?: { time: string; text: string; medicationId: string };
}

export function insights(v: PatientView, today: ISODate, now: Date): Insight {
  const first = v.patient.firstName;
  const week = lastDays(v, 7, today).filter((d) => isCounted(d, now));
  const prev = v.doses.filter((d) => d.date < toISODate(addDays(new Date(`${today}T00:00:00`), -6)) && d.date >= toISODate(addDays(new Date(`${today}T00:00:00`), -13)) && isCounted(d, now));
  const rate = (ds: Dose[]) => (ds.length ? Math.round((ds.filter((d) => isTakenState(doseState(d, now))).length / ds.length) * 100) : 0);
  const missed7 = week.filter((d) => doseState(d, now) === 'missed').length;
  const adherence7 = rate(week);
  const todayBad = v.doses.some((d) => d.date === today && ['overdue', 'missed', 'concern'].includes(doseState(d, now)));

  let level: RiskLevel = 'stable';
  if (missed7 >= 4 || (week.length > 0 && adherence7 < 70)) level = 'high';
  else if (missed7 >= 2 || adherence7 < 85 || todayBad) level = 'attention';

  // group by schedule time
  const slots = new Map<string, Dose[]>();
  week.forEach((d) => slots.set(d.time, [...(slots.get(d.time) ?? []), d]));
  const stats = [...slots.entries()].map(([time, ds]) => ({
    time, n: ds.length, miss: ds.filter((d) => doseState(d, now) === 'missed').length,
    taken: ds.filter((d) => isTakenState(doseState(d, now))),
  }));
  const worst = [...stats].sort((a, b) => b.miss - a.miss)[0];
  const best = [...stats].filter((s) => s.miss === 0 && s.n >= 3).sort((a, b) => b.n - a.n)[0];

  const reasons: string[] = [];
  let suggestion: Insight['suggestion'];
  if (worst && worst.miss >= 2) {
    reasons.push(`${worst.miss} of the last ${worst.n} ${period(worst.time)} doses (${worst.time}) were missed.`);
    const times = worst.taken.filter((d) => d.resolvedAt).map((d) => new Date(d.resolvedAt!));
    if (times.length > 0) {
      const avg = Math.round(times.reduce((s, t) => s + t.getHours() * 60 + t.getMinutes(), 0) / times.length);
      const label = `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`;
      reasons.push(`On the ${times.length} ${times.length === 1 ? 'day' : 'days'} ${first} took it, the dose was confirmed around ${label}.`);
      const sample = worst.taken[0];
      const sched = Number(worst.time.slice(0, 2)) * 60 + Number(worst.time.slice(3));
      if (sample && avg - sched >= 20) {
        const at = avg - 5;
        const t = `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;
        suggestion = { time: t, medicationId: sample.medicationId, text: `${first} usually confirms around ${label}, so a reminder just before that may be easier to notice.` };
      }
    }
  } else if (missed7 > 0) {
    reasons.push(`${missed7} missed ${missed7 === 1 ? 'dose' : 'doses'} in the last 7 days.`);
  } else {
    reasons.push('No missed doses in the last 7 days.');
  }
  if (best) reasons.push(`${period(best.time).replace(/^./, (c) => c.toUpperCase())} doses at ${best.time}: ${best.taken.length} of ${best.n} taken.`);
  if (todayBad) reasons.unshift(`A dose today needs attention.`);

  return { level, reasons, adherence7, adherencePrev7: prev.length ? rate(prev) : null, missed7, suggestion };
}

export interface WeekDay { label: string; date: ISODate; percent: number | null; isToday: boolean }

export function weekTrend(v: PatientView, today: ISODate, now: Date) {
  const t = new Date(`${today}T00:00:00`);
  const monday = addDays(t, -((t.getDay() + 6) % 7));
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days: WeekDay[] = names.map((label, i) => {
    const date = toISODate(addDays(monday, i));
    const ds = v.doses.filter((d) => d.date === date && isCounted(d, now));
    const taken = ds.filter((d) => isTakenState(doseState(d, now))).length;
    return { label, date, percent: ds.length ? Math.round((taken / ds.length) * 100) : null, isToday: date === today };
  });
  const wk = v.doses.filter((d) => d.date >= toISODate(monday) && d.date <= today && isCounted(d, now));
  const states = wk.map((d) => doseState(d, now));
  const prevFrom = toISODate(addDays(monday, -7)), prevTo = toISODate(addDays(monday, -1));
  const prev = v.doses.filter((d) => d.date >= prevFrom && d.date <= prevTo && isCounted(d, now));
  const prevPercent = prev.length ? Math.round((prev.filter((d) => isTakenState(doseState(d, now))).length / prev.length) * 100) : null;
  const missedTimes = [...new Set(wk.filter((d) => doseState(d, now) === 'missed').map((d) => d.time))];
  return {
    prevPercent, missedTimes,
    days,
    due: wk.length,
    taken: states.filter(isTakenState).length,
    late: states.filter((s) => s === 'late').length,
    skipped: wk.filter((d) => d.status === 'skipped'),
    missed: states.filter((s) => s === 'missed').length,
    percent: wk.length ? Math.round((states.filter(isTakenState).length / wk.length) * 100) : 0,
  };
}

/* ───────────────────────── alerts ───────────────────────── */

export interface CaregiverAlert {
  id: string; patientId: string; patientName: string; at: Date;
  kind: 'missed' | 'overdue' | 'concern' | 'skipped' | 'refill';
  title: string; detail: string; severity: 'concern' | 'warning' | 'info';
}

export function alertsFor(v: PatientView, today: ISODate, now: Date): CaregiverAlert[] {
  const name = v.patient.firstName;
  const base = { patientId: v.patient.id, patientName: `${v.patient.firstName} ${v.patient.lastName}` };
  const out: CaregiverAlert[] = [];
  for (const d of lastDays(v, 7, today)) {
    const s = doseState(d, now);
    const at = scheduledAt(d);
    const label = medLabel(v, d);
    if (s === 'missed') out.push({ ...base, id: `missed-${d.id}`, at, kind: 'missed', severity: 'concern', title: `${name} missed their ${d.time} ${label}`, detail: 'No confirmation after two reminders.' });
    else if (s === 'overdue') out.push({ ...base, id: `overdue-${d.id}`, at, kind: 'overdue', severity: 'warning', title: `${name} has not confirmed ${label}`, detail: `Due at ${d.time}. Please check in.` });
    else if (s === 'concern') out.push({ ...base, id: `concern-${d.id}`, at: new Date(d.resolvedAt ?? at), kind: 'concern', severity: 'concern', title: `${name} reported a concern`, detail: `${label}: ${d.note ?? ''}` });
    else if (s === 'skipped') out.push({ ...base, id: `skipped-${d.id}`, at: new Date(d.resolvedAt ?? at), kind: 'skipped', severity: 'warning', title: `${name} skipped ${label}`, detail: d.note ?? `Due at ${d.time}.` });
  }
  for (const m of v.messages.filter((x) => x.kind === 'refill'))
    out.push({ ...base, id: `refill-${m.id}`, at: new Date(m.sentAt), kind: 'refill', severity: 'info', title: `${name} requested a refill`, detail: m.body });
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export { formatClock };
