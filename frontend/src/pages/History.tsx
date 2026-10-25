import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { DoseStatusTag } from '@/components/ui/StatusTag';
import p from '@/components/ui/Page.module.css';
import { adherence, isResolved, streak } from '@/domain/derive';
import { medById } from '@/domain/labels';
import type { Dose } from '@/domain/types';
import { formatClock, formatDayHeading, formatTimestampTime } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { usePatientData } from '@/state/PatientStore';

type Filter = 'all' | 'taken' | 'attention';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All doses' }, { id: 'taken', label: 'Taken' }, { id: 'attention', label: 'Missed, skipped or concern' },
];

export default function History() {
  const data = usePatientData();
  const { now, today } = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const resolved = useMemo(() => data.doses.filter(isResolved), [data.doses]);
  const shown = resolved.filter((d) => filter === 'all' || (filter === 'taken' ? d.status === 'taken' : d.status !== 'taken'));
  const groups = useMemo(() => {
    const m = new Map<string, Dose[]>();
    [...shown].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).forEach((d) => m.set(d.date, [...(m.get(d.date) ?? []), d]));
    return [...m.entries()];
  }, [shown]);
  const missed = resolved.filter((d) => d.status === 'missed').length;

  return (
    <>
      <PageHeader title="History" subtitle="The last 30 days of doses" />
      <div className={p.stats}>
        <div className={p.stat}><b>{adherence(data.doses, today, 30, now)}%</b><span>30-day adherence</span></div>
        <div className={p.stat}><b>{streak(data.doses, today)} {streak(data.doses, today) === 1 ? 'day' : 'days'}</b><span>Current perfect streak</span></div>
        <div className={p.stat}><b>{resolved.filter((d) => d.status === 'taken').length}</b><span>Doses taken</span></div>
        <div className={p.stat}><b>{missed}</b><span>Doses missed</span></div>
      </div>
      <Card aria-labelledby="hist-h">
        <h2 id="hist-h" className={p.h2}>Dose log</h2>
        <div className={p.chips} role="group" aria-label="Filter doses">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={p.tab} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        {groups.length === 0 && <p className={p.empty}>Nothing to show for this filter.</p>}
        {groups.map(([date, doses]) => (
          <section key={date} aria-label={formatDayHeading(date, today)} style={{ marginTop: 28 }}>
            <h3 style={{ fontSize: '1.125rem', color: 'var(--nx-muted)' }}>{formatDayHeading(date, today)}</h3>
            <ul className={p.list}>
              {doses.map((d) => (
                <li key={d.id} className={p.item}>
                  <span style={{ width: 90, color: 'var(--nx-muted)', fontWeight: 500 }}>{formatClock(d.time)}</span>
                  <span className={p.grow}>
                    <b>{medById(data.medications, d.medicationId)?.name} {medById(data.medications, d.medicationId)?.strength}</b>
                    <span>
                      {d.status === 'taken' && d.resolvedAt ? `Recorded at ${formatTimestampTime(d.resolvedAt)}${d.source === 'device' ? ' by your NexPill device' : ''}` : d.note ?? ''}
                    </span>
                  </span>
                  <DoseStatusTag dose={d} now={now} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Card>
    </>
  );
}
