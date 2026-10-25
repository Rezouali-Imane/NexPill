import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { DoseStatusTag } from '@/components/ui/StatusTag';
import p from '@/components/ui/Page.module.css';
import { dosesOn, nextDose, weekBars } from '@/domain/derive';
import { medById } from '@/domain/labels';
import { formatClock, formatDayHeading } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { usePatientActions, usePatientData, usePatientState } from '@/state/PatientStore';

export default function Schedule() {
  const data = usePatientData();
  const { now, today } = useNow();
  const { recordDose } = usePatientActions();
  const { pending } = usePatientState();
  const week = weekBars(data.doses, today, now);
  const [selected, setSelected] = useState(today);
  const doses = dosesOn(data.doses, selected);
  const next = nextDose(dosesOn(data.doses, today));
  const dayName = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });

  return (
    <>
      <PageHeader title="Schedule" subtitle="Every dose planned for this week" />
      <Card aria-labelledby="week-h">
        <h2 id="week-h" className={p.h2}>This week</h2>
        <div className={p.chips} role="group" aria-label="Choose a day">
          {week.map((d) => (
            <button
              key={d.date} type="button" className={p.tab} aria-pressed={selected === d.date}
              onClick={() => setSelected(d.date)}
            >
              {dayName(d.date)}{d.date === today && <span className="sr-only"> (today)</span>}
            </button>
          ))}
        </div>
      </Card>
      <Card aria-labelledby="day-h">
        <h2 id="day-h" className={p.h2}>{formatDayHeading(selected, today)}</h2>
        {doses.length === 0 ? (
          <p className={p.empty}>No doses planned for this day.</p>
        ) : (
          <ul className={p.list}>
            {doses.map((d) => {
              const med = medById(data.medications, d.medicationId);
              const canAct = d.date === today && d.status === 'upcoming';
              return (
                <li key={d.id} className={p.item}>
                  <Icon name={d.status === 'taken' ? 'circleCheck' : d.status === 'upcoming' ? 'clock' : 'alert'} size={28} />
                  <span style={{ width: 96, fontWeight: 500, color: 'var(--nx-muted)', fontSize: '1.25rem' }}>{formatClock(d.time)}</span>
                  <span className={p.grow}><b>{med?.name}</b><span>{med?.strength} · {med?.instructions}</span></span>
                  <DoseStatusTag dose={d} now={now} isNext={next?.id === d.id} />
                  {canAct && (
                    <Button size="md" variant="primary" loading={pending.includes(d.id)}
                      aria-label={`Mark ${med?.name} at ${formatClock(d.time)} as taken`}
                      onClick={() => void recordDose(d, { kind: 'taken' })}>
                      Mark as taken
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
