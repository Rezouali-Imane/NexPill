import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { StatusTag } from '@/components/ui/StatusTag';
import p from '@/components/ui/Page.module.css';
import { daysOfSupply } from '@/domain/derive';
import type { Medication } from '@/domain/types';
import { RefillDialog } from '@/features/dialogs/ContactDialogs';
import { formatClock } from '@/lib/time';
import { usePatientData } from '@/state/PatientStore';

function MedCard({ med }: { med: Medication }) {
  const data = usePatientData();
  const [open, setOpen] = useState(false);
  const days = daysOfSupply(med);
  const low = days <= med.refillThresholdDays;
  const req = data.refills.find((r) => r.medicationId === med.id && r.status !== 'collected');
  return (
    <Card as="article" id={med.id} aria-labelledby={`${med.id}-h`}>
      <div className={p.item} style={{ borderTop: 0, paddingTop: 0 }}>
        <Icon name="pill" size={30} />
        <div className={p.grow}>
          <h2 id={`${med.id}-h`} className={p.h2}>{med.name} <span style={{ fontWeight: 400, color: 'var(--nx-muted)' }}>{med.strength}</span></h2>
          <p className={p.sub}>{med.purpose} · Prescribed by {med.prescriber}</p>
        </div>
        {req ? <StatusTag tone="success">{req.status === 'ready' ? 'Refill ready' : 'Refill requested'}</StatusTag>
          : low ? <StatusTag tone="warning">Low supply</StatusTag> : <StatusTag tone="neutral">Supply OK</StatusTag>}
      </div>
      <p style={{ marginTop: 8 }}><b>Instructions:</b> {med.instructions}</p>
      <div className={p.chips} aria-label="Daily times" role="list">
        {med.schedule.map((t) => <span role="listitem" key={t} className={p.chip}>{formatClock(t)}</span>)}
      </div>
      <div style={{ margin: '18px 0' }}><Callout label="Important:">{med.important}</Callout></div>
      <div className={p.item} style={{ borderTop: 0, padding: 0 }}>
        <span className={p.grow}><b>{days} {days === 1 ? 'day' : 'days'} left</b><span>{med.pillsLeft} {med.form}s remaining</span></span>
        {!req && <Button size="md" variant={low ? 'primary' : 'secondary'} onClick={() => setOpen(true)}>Request refill</Button>}
      </div>
      <RefillDialog med={med} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

export default function Medications() {
  const data = usePatientData();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);
  return (
    <>
      <PageHeader title="Medications" subtitle="Everything you take, and how to take it" />
      <div className={p.stack}>
        {data.medications.map((m) => <MedCard key={m.id} med={m} />)}
      </div>
    </>
  );
}
