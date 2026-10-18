import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { StatusTag } from '@/components/ui/StatusTag';
import p from '@/components/ui/Page.module.css';
import { useCaregiverActions, useCaregiverData } from '@/caregiver/CaregiverStore';
import { formatRelative } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { CaregiverBell } from './Dashboard';

const KIND = { missed: 'Missed dose', overdue: 'Overdue', concern: 'Concern', skipped: 'Skipped', refill: 'Refill' } as const;

export default function Alerts() {
  const { now } = useNow();
  const d = useCaregiverData(now);
  const { acknowledge, select } = useCaregiverActions();
  const [filter, setFilter] = useState<'new' | 'all'>('new');
  const list = filter === 'new' ? d.unseen : d.alerts;
  return (
    <>
      <PageHeader title="Alerts" subtitle="Missed doses, concerns and refills from the last 7 days" showHelp={false} bell={<CaregiverBell count={d.unseen.length} />} />
      <Card aria-labelledby="al-h">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 id="al-h" className={p.h2}>{filter === 'new' ? 'New alerts' : 'All alerts'}</h2>
          {d.unseen.length > 0 && <Button size="md" onClick={() => void acknowledge(d.unseen.map((a) => a.id))}>Mark all as seen</Button>}
        </div>
        <div className={p.chips} role="group" aria-label="Filter alerts">
          <button type="button" className={p.tab} aria-pressed={filter === 'new'} onClick={() => setFilter('new')}>New ({d.unseen.length})</button>
          <button type="button" className={p.tab} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All ({d.alerts.length})</button>
        </div>
        {list.length === 0 ? <p className={p.empty}>{filter === 'new' ? 'You are all caught up.' : 'No alerts in the last 7 days.'}</p> : (
          <ul className={p.list} style={{ marginTop: 12 }}>
            {list.map((a) => (
              <li key={a.id} className={p.item}>
                <Icon name={a.severity === 'info' ? 'pill' : 'alert'} size={28} />
                <span className={p.grow}><b>{a.title}</b><span>{a.detail} · {formatRelative(a.at.toISOString(), now)}</span></span>
                <StatusTag compact tone={a.severity === 'concern' ? 'concern' : a.severity === 'warning' ? 'warning' : 'info'}>{KIND[a.kind]}</StatusTag>
                {!d.acked.has(a.id) && <Button size="md" onClick={() => void acknowledge([a.id])}>Mark as seen</Button>}
                <Button size="md" onClick={() => { select(a.patientId); location.assign('/caregiver'); }}>Open {a.patientName.split(' ')[0]}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
