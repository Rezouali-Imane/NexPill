import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { StatusTag } from '@/components/ui/StatusTag';
import {
  RISK_LABEL, activityFor, insights, timeline, todaySummary, weekTrend,
  type PatientView, type RiskLevel,
} from '@/domain/caregiver';
import { STATE_LABEL, type DoseState } from '@/domain/status';
import { formatClock } from '@/lib/time';
import { useUi } from '@/state/UiStore';
import { useCaregiverActions } from '@/caregiver/CaregiverStore';
import { SendMessageDialog } from './dialogs';
import s from './Caregiver.module.css';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const initials = (v: PatientView) => `${v.patient.firstName[0]}${v.patient.lastName[0]}`.toUpperCase();
const riskTone = (r: RiskLevel) => (r === 'high' ? 'concern' : r === 'attention' ? 'warning' : 'success') as 'concern' | 'warning' | 'success';

export function RiskTag({ level }: { level: RiskLevel }) {
  return <StatusTag tone={riskTone(level)} compact>{RISK_LABEL[level]}</StatusTag>;
}

/* ───────── live status ───────── */
export function LiveStatus({ lastUpdated }: { lastUpdated: number }) {
  const { connection } = useUi();
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 5000); return () => window.clearInterval(id); }, []);
  const secs = Math.max(0, Math.round((Date.now() - lastUpdated) / 1000));
  const ago = secs < 5 ? 'just now' : secs < 60 ? `${secs} s ago` : `${Math.round(secs / 60)} min ago`;
  const live = connection === 'open';
  return (
    <div className={s.live}>
      <span className={[s.dotLive, live ? '' : s.dotOff].join(' ')} aria-hidden="true" />
      <span>{live ? 'Live' : connection === 'reconnecting' ? 'Reconnecting' : 'Offline'}</span>
      <small>Updated {ago}</small>
    </div>
  );
}

/* ───────── patient switcher ───────── */
export function PatientSwitcher({ patients, selectedId, risk, now, today, onSelect }: {
  patients: PatientView[]; selectedId?: string; risk: Map<string, RiskLevel>; now: Date; today: string; onSelect: (id: string) => void;
}) {
  return (
    <div className={s.switch} role="group" aria-label="Choose a patient">
      {patients.map((p) => {
        const sum = todaySummary(p, today, now);
        return (
          <button key={p.patient.id} type="button" className={s.pt} aria-pressed={selectedId === p.patient.id} onClick={() => onSelect(p.patient.id)}>
            <span className={s.avatar} aria-hidden="true">{initials(p)}</span>
            <span className={s.ptText}>
              <b>{p.patient.firstName} {p.patient.lastName}</b>
              <span>{sum.nextTime ? `Next dose ${sum.nextTime}` : 'No more doses today'}</span>
            </span>
            <RiskTag level={risk.get(p.patient.id) ?? 'stable'} />
          </button>
        );
      })}
      <div className={s.switchActions}>
        <Link to="/caregiver/patients?add=1"><Button size="md" icon={<Icon name="plus" size={18} />} tabIndex={-1}>Add patient</Button></Link>
        <Link to="/caregiver/patients"><Button size="md" tabIndex={-1}>Manage patients</Button></Link>
      </div>
    </div>
  );
}

/* ───────── attention banner ───────── */
export function AttentionBanner({ view, today, now, caregiverFirst }: { view: PatientView; today: string; now: Date; caregiverFirst: string }) {
  const [open, setOpen] = useState(false);
  const tl = timeline(view, today, now);
  const problem = [...tl].reverse().find((t) => t.state === 'missed' || t.state === 'concern') ?? [...tl].reverse().find((t) => t.state === 'overdue');
  if (!problem) return null;
  const first = view.patient.firstName;
  const label = `${problem.dose.time} ${problem.name}`;
  const act = activityFor(view, today, now, caregiverFirst);
  const alertEv = act.find((e) => e.id.startsWith(problem.dose.id) && (e.id.endsWith('-m') || e.id.endsWith('-al') || e.id.endsWith('-c')));
  const bad = problem.state !== 'overdue';
  const headline = problem.state === 'missed' ? `${first} missed the ${label} dose`
    : problem.state === 'concern' ? `${first} reported a concern about ${problem.name}` : `${first} has not confirmed the ${label} dose`;
  const body = problem.state === 'missed' ? `Two reminders went unanswered and you were alerted. Please check in with ${first}.`
    : problem.state === 'concern' ? problem.dose.note ?? 'Please check in.' : `Reminders have been sent. If there is no answer soon, this dose will be marked missed.`;
  return (
    <section className={[s.banner, bad ? '' : s.bannerWarn].join(' ')} aria-label="Needs attention">
      <div className={s.bannerIcon}><Icon name="alert" size={26} /></div>
      <div className={s.bannerText}>
        <p className={s.eyebrow}>Needs attention · {hhmm(alertEv?.at ?? now)}</p>
        <h2>{headline}</h2>
        <p>{body}</p>
      </div>
      <div className={s.bannerActions}>
        {view.patient.phone
          ? <a href={`tel:${view.patient.phone.replace(/\s/g, '')}`} style={{ textDecoration: 'none' }}><Button variant="primary" size="md" icon={<Icon name="phone" size={20} />} tabIndex={-1}>Call {first}</Button></a>
          : <Button variant="primary" size="md" disabled title={`${first} has not added a phone number`}>Call {first}</Button>}
        <Button size="md" onClick={() => setOpen(true)}>Send message</Button>
      </div>
      <SendMessageDialog view={view} open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

/* ───────── today summary ───────── */
export function DaySummary({ view, today, now }: { view: PatientView; today: string; now: Date }) {
  const sum = todaySummary(view, today, now);
  const first = view.patient.firstName;
  const bad = sum.missed > 0;
  const period = (t?: string) => (!t ? '' : Number(t.slice(0, 2)) < 12 ? 'Morning' : Number(t.slice(0, 2)) < 18 ? 'Afternoon' : 'Evening');
  const when = (times: string[], none: string) => (times.length === 0 ? none : `at ${times.join(', ')}`);
  return (
    <Card className={[s.dayCard, bad ? s.bad : ''].join(' ')} aria-labelledby="day-h">
      <div className={s.sumHead}>
        <div>
          <p className={s.eyebrow}>{first}'s day · updated {hhmm(now)}</p>
          <h2 id="day-h" className={s.sumTitle}>{sum.due === 0 ? 'No doses due yet' : `${sum.taken} of ${sum.due} due ${sum.due === 1 ? 'dose' : 'doses'} taken`}</h2>
          <p className={s.sub}>{sum.upcoming > 0 ? `${sum.upcoming === 1 ? 'One more dose is' : `${sum.upcoming} more doses are`} scheduled${sum.nextTime ? ` at ${sum.nextTime}` : ''}.` : 'Nothing else is scheduled today.'}</p>
          <div className={s.statusRow}>
            {bad ? <StatusTag tone="concern">Missed</StatusTag> : sum.due > 0 ? <StatusTag tone="success">On track</StatusTag> : <StatusTag tone="neutral">Waiting</StatusTag>}
            <span>{bad ? `${period(sum.missedTimes[0])} medication was missed` : sum.due > 0 ? 'Every due dose has been confirmed' : 'The first dose is not due yet'}</span>
          </div>
        </div>
        <p className={s.big} aria-label={`${sum.percent} percent`}>{sum.percent}%<small>Today's adherence</small></p>
      </div>
      <div className={s.tiles}>
        <div className={s.tile}><b>{sum.scheduled}</b><strong>Scheduled</strong><span>doses today</span></div>
        <div className={s.tile}><b>{sum.taken}</b><strong>Taken</strong><span>{sum.late ? `incl. ${sum.late} late` : 'on time'}</span></div>
        <div className={s.tile}><b>{sum.missed}</b><strong>Missed</strong><span>{when(sum.missedTimes, 'none today')}</span></div>
        <div className={s.tile}><b>{sum.skipped}</b><strong>Skipped</strong><span>{when(sum.skippedTimes, 'none today')}</span></div>
        <div className={s.tile}><b>{sum.upcoming}</b><strong>Upcoming</strong><span>{sum.nextTime ? `at ${sum.nextTime}` : 'none left'}</span></div>
      </div>
    </Card>
  );
}

/* ───────── medication timeline ───────── */
const NODE_ICON: Record<DoseState, IconName> = {
  taken: 'check', late: 'clock', skipped: 'circleMinus', missed: 'x', concern: 'alert', overdue: 'alert', due: 'clock', upcoming: 'clock',
};
const TAG: Record<DoseState, 'success' | 'warning' | 'concern' | 'info' | 'neutral'> = {
  taken: 'success', late: 'warning', skipped: 'warning', missed: 'concern', concern: 'concern', overdue: 'warning', due: 'info', upcoming: 'neutral',
};

export function TimelineCard({ view, today, now }: { view: PatientView; today: string; now: Date }) {
  const items = timeline(view, today, now);
  const nowHM = hhmm(now);
  const nowIndex = items.findIndex((i) => i.dose.time > nowHM);
  const insertAt = nowIndex === -1 ? items.length : nowIndex;
  return (
    <Card aria-labelledby="tl-h">
      <h2 id="tl-h" className={s.h2}>Medication timeline</h2>
      <p className={s.sub}>Today's full day at a glance. Late means confirmed more than 30 minutes after the scheduled time.</p>
      {items.length === 0 ? <p className={s.sub}>No doses scheduled today.</p> : (
        <ol className={s.tl}>
          {items.flatMap((it, i) => {
            const li = (
              <li key={it.dose.id} className={s.tlItem}>
                <span className={[s.node, s[`n_${it.state}`]].join(' ')}><Icon name={NODE_ICON[it.state]} size={22} strokeWidth={2.2} /></span>
                <span className={s.tlTime}>{it.dose.time}</span>
                <span className={s.tlName}>{it.name}</span>
                <span className={s.tlStr}>{it.strength}</span>
                <StatusTag compact tone={TAG[it.state]}>{STATE_LABEL[it.state] === 'Taken late' ? 'Late' : STATE_LABEL[it.state]}</StatusTag>
                <span className={s.tlDetail}>{it.detail}</span>
              </li>
            );
            return i === insertAt ? [<li key="now" className={s.nowMark} aria-label={`Now, ${nowHM}`}><span className={s.nowPill}>Now</span></li>, li] : [li];
          })}
          {insertAt === items.length && <li key="now" className={s.nowMark} aria-label={`Now, ${nowHM}`}><span className={s.nowPill}>Now</span></li>}
        </ol>
      )}
    </Card>
  );
}

/* ───────── week ───────── */
export function WeekCard({ view, today, now }: { view: PatientView; today: string; now: Date }) {
  const w = weekTrend(view, today, now);
  const diff = w.prevPercent === null ? null : w.percent - w.prevPercent;
  const lastSkip = w.skipped[w.skipped.length - 1];
  const dayName = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
  const GOAL = 90;
  return (
    <Card aria-labelledby="wk-h">
      <div className={s.weekHead}>
        <div>
          <p className={s.eyebrow}>This week</p>
          <h2 id="wk-h" className={s.h2}>Adherence and trend</h2>
          <p className={s.weekBig} aria-label={`${w.percent} percent`}>{w.percent}%</p>
        </div>
        {diff !== null && (
          <span className={[s.delta, diff > 0 ? s.up : diff < 0 ? s.down : s.same].join(' ')}>
            <Icon name="trend" size={18} />{diff === 0 ? 'Same as last week' : `${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'point' : 'points'} ${diff > 0 ? 'up' : 'down'} vs last week`}
          </span>
        )}
      </div>
      <p className={s.sub}>{w.taken} of {w.due} due doses taken.{w.prevPercent !== null && ` Last week: ${w.prevPercent}%.`}</p>
      <ul className={s.chart} aria-label="Adherence by day this week">
        <span className={s.goal} style={{ bottom: `${GOAL}%` }} aria-hidden="true" />
        {w.days.map((d) => (
          <li key={d.date} className={s.col2} aria-label={d.percent === null ? `${d.label}: no data yet` : `${d.label}: ${d.percent} percent${d.isToday ? ' (today)' : ''}`}>
            <div className={[s.barB, d.percent === null ? s.barNone : '', d.isToday ? s.barToday : ''].join(' ')} style={d.percent === null ? undefined : { height: `${Math.max(d.percent, 4)}%` }} />
          </li>
        ))}
      </ul>
      <ul className={s.dayLabels} aria-hidden="true">
        {w.days.map((d) => <li key={d.date}><b>{d.label}</b>{d.percent === null ? '–' : `${d.percent}%`}</li>)}
      </ul>
      <p className={s.goalNote}>Goal: {GOAL}% of due doses taken.{w.days.some((d) => d.isToday) && ` ${new Date(`${today}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })} is today.`}</p>
      <div className={s.tiles}>
        <div className={s.tile}><b>{w.taken}</b><strong>Taken</strong><span>of {w.due} due doses</span></div>
        <div className={s.tile}><b>{w.late}</b><strong>Late</strong><span>counted as taken</span></div>
        <div className={s.tile}><b>{w.skipped.length}</b><strong>Skipped</strong><span>{lastSkip ? `${dayName(lastSkip.date)}, ${lastSkip.time}` : 'none this week'}</span></div>
        <div className={s.tile}><b>{w.missed}</b><strong>Missed</strong><span>{w.missed === 0 ? 'none this week' : w.missedTimes.length === 1 ? `all at ${w.missedTimes[0]}` : 'at various times'}</span></div>
      </div>
    </Card>
  );
}

/* ───────── activity ───────── */
const TONE_ICON: Record<'success' | 'warning' | 'concern' | 'info', IconName> = { success: 'check', warning: 'alert', concern: 'x', info: 'bell' };

export function ActivityCard({ view, today, now, caregiverFirst }: { view: PatientView; today: string; now: Date; caregiverFirst: string }) {
  const events = activityFor(view, today, now, caregiverFirst);
  return (
    <Card aria-labelledby="act-h">
      <h2 id="act-h" className={s.h2}>Activity timeline</h2>
      <p className={s.sub}>Everything that happened today for {view.patient.firstName}, newest first.</p>
      {events.length === 0 ? <p className={s.sub} style={{ marginTop: 16 }}>Nothing yet today.</p> : (
        <ul className={s.act}>
          {events.map((e) => (
            <li key={e.id} className={s.actItem}>
              <span className={s.actTime}>{hhmm(e.at)}</span>
              <span className={[s.actIcon, s[`i_${e.tone}`]].join(' ')}><Icon name={TONE_ICON[e.tone]} size={18} strokeWidth={2.2} /></span>
              <span className={s.actBody}><b>{e.title}</b><span>{e.detail}</span></span>
              {e.badge && <StatusTag compact tone={e.tone === 'success' ? 'success' : e.tone === 'concern' ? 'concern' : 'warning'}>{e.badge}</StatusTag>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ───────── insights ───────── */
export function InsightsCard({ view, today, now }: { view: PatientView; today: string; now: Date }) {
  const { addReminder } = useCaregiverActions();
  const [dismissed, setDismissed] = useState(false);
  const [added, setAdded] = useState(false);
  const ins = insights(view, today, now);
  const idx = ins.level === 'stable' ? 0 : ins.level === 'attention' ? 1 : 2;
  const first = view.patient.firstName;
  const days = 14;
  const summary = ins.level === 'high' ? `${first} missed ${ins.missed7} ${ins.missed7 === 1 ? 'dose' : 'doses'} in the last 7 days. Their predicted risk of missing the next dose is high.`
    : ins.level === 'attention' ? `${first} has a few missed or late doses recently. A gentle check-in may help.`
    : `${first} has been taking doses reliably. No action needed.`;
  return (
    <Card aria-labelledby="ins-h">
      <div className={s.insHead}>
        <div className={s.insIcon}><Icon name="insights" /></div>
        <div>
          <h2 id="ins-h" className={s.h2} style={{ fontSize: '1.375rem' }}>Adherence insights</h2>
          <p className={s.sub} style={{ marginTop: 2 }}>From the last {days} days of dose confirmations</p>
        </div>
      </div>
      <div className={s.riskRow}>
        <span className={s.eyebrow}>Adherence risk</span>
        <RiskTag level={ins.level} />
      </div>
      <div className={s.meter} role="img" aria-label={`Risk level: ${RISK_LABEL[ins.level]}`}>
        {[0, 1, 2].map((i) => <span key={i} className={[s.seg, i === idx ? s[`on${i}`] : ''].join(' ')} />)}
      </div>
      <div className={s.meterLabels} aria-hidden="true">
        {(['stable', 'attention', 'high'] as RiskLevel[]).map((l) => <span key={l} className={ins.level === l ? s.cur : ''}>{RISK_LABEL[l]}</span>)}
      </div>
      <p className={s.sub} style={{ marginTop: 14 }}>{summary}</p>
      <h3 className={s.h3}>{ins.level === 'stable' ? 'What we noticed' : 'Why am I getting this alert?'}</h3>
      <ul className={s.why}>{ins.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      {ins.suggestion && !dismissed && (
        <div className={s.suggest}>
          <p className={s.eyebrow}>Suggested change</p>
          <b>{added ? `Extra reminder added for ${formatClock(ins.suggestion.time)}` : `Add an extra reminder at ${ins.suggestion.time}`}</b>
          <p>{ins.suggestion.text}</p>
          {!added && (
            <div className="row" style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <Button size="md" variant="primary" onClick={async () => { if (await addReminder(view.patient.id, ins.suggestion!.medicationId, ins.suggestion!.time)) setAdded(true); }}>Add reminder</Button>
              <Button size="md" onClick={() => setDismissed(true)}>Not now</Button>
            </div>
          )}
        </div>
      )}
      <p className={s.disclaimer}>Insights describe habits. They are not medical advice.</p>
    </Card>
  );
}
