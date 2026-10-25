import { adherence, dosesOn, nextDose, progress, weekBars, streak } from '@/domain/derive';
import { doseState } from '@/domain/status';
import { alertsFor, insights, todaySummary, timeline, type PatientView } from '@/domain/caregiver';
import { AHMED_MEDS, AHMED_PLAN, JAMIE_MEDS, JAMIE_PLAN, buildDoses } from '@/api/mock/seed';
import { formatClock, toISODate } from '@/lib/time';

const now = new Date('2026-10-14T10:00:00');
const today = toISODate(now);
const doses = buildDoses(JAMIE_MEDS, JAMIE_PLAN, now);

describe('derive (patient)', () => {
  it('formats clock', () => {
    expect(formatClock('08:00')).toBe('8:00 AM');
    expect(formatClock('12:30')).toBe('12:30 PM');
    expect(formatClock('20:00')).toBe('8:00 PM');
    expect(formatClock('00:15')).toBe('12:15 AM');
  });
  it('today starts at 1 of 3 with Lisinopril next', () => {
    const t = dosesOn(doses, today);
    expect(progress(t)).toMatchObject({ total: 3, done: 1, remaining: 2, percent: 33 });
    expect(nextDose(t)?.medicationId).toBe('med-lisinopril');
  });
  it('seeded 30-day adherence is 92%', () => expect(adherence(doses, today, 30, now)).toBe(92));
  it('week has 7 bars and future days are empty', () => {
    const w = weekBars(doses, today, now);
    expect(w).toHaveLength(7);
    expect(w[6]!.value).toBeNull();
  });
  it('streak is >= 0', () => expect(streak(doses, today)).toBeGreaterThanOrEqual(0));
});

describe('dose states follow the escalation rules', () => {
  const d = (time: string) => ({ id: 'x', medicationId: 'm', date: today, time, status: 'upcoming' as const });
  it('upcoming → due → overdue → missed', () => {
    expect(doseState(d('10:30'), now)).toBe('upcoming');
    expect(doseState(d('09:50'), now)).toBe('due');      // 10 min past
    expect(doseState(d('09:20'), now)).toBe('overdue');  // 40 min past
    expect(doseState(d('08:30'), now)).toBe('missed');   // 90 min past
  });
  it('taken > 30 min after schedule is late', () => {
    const taken = { ...d('08:00'), status: 'taken' as const, resolvedAt: new Date(`${today}T08:42:00`).toISOString() };
    expect(doseState(taken, now)).toBe('late');
    expect(doseState({ ...taken, resolvedAt: new Date(`${today}T08:10:00`).toISOString() }, now)).toBe('taken');
  });
});

describe('derive (caregiver)', () => {
  const evening = new Date('2026-10-14T19:10:00');
  const ahmedDoses = buildDoses(AHMED_MEDS, AHMED_PLAN, evening);
  const view: PatientView = {
    link: { id: 'l', caregiverId: 'c', patientId: 'p', relationship: 'Daughter', status: 'active', isPrimary: true, notifyOn: { missedDose: true, concern: true, refill: true }, createdAt: '' },
    patient: { id: 'p', firstName: 'Ahmed', lastName: 'Khelifi' }, medications: AHMED_MEDS, doses: ahmedDoses, messages: [], serverTime: '',
  };
  it('summarises Ahmed’s evening like the design', () => {
    const s = todaySummary(view, toISODate(evening), evening);
    expect(s).toMatchObject({ scheduled: 5, missed: 1, upcoming: 1, late: 1 });
    expect(s.missedTimes).toEqual(['18:00']);
  });
  it('rates the evening-miss pattern as high risk and explains why', () => {
    const r = insights(view, toISODate(evening), evening);
    expect(r.level).toBe('high');
    expect(r.reasons.join(' ')).toMatch(/evening doses \(18:00\) were missed/);
  });
  it('produces alerts and a timeline', () => {
    expect(alertsFor(view, toISODate(evening), evening).some((a) => a.kind === 'missed')).toBe(true);
    expect(timeline(view, toISODate(evening), evening)).toHaveLength(5);
  });
});
