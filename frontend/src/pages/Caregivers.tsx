import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { StatusTag } from '@/components/ui/StatusTag';
import p from '@/components/ui/Page.module.css';
import type { Caregiver } from '@/domain/types';
import { ConfirmDialog } from '@/features/dialogs/ConfirmDialog';
import { CaregiverCard } from '@/features/overview/cards';
import { formatRelative } from '@/lib/time';
import { usePatientActions, usePatientData } from '@/state/PatientStore';
import s from './Caregivers.module.css';

const KIND: Record<string, string> = { update: 'Your update', concern: 'Concern shared', 'missed-dose': 'Dose alert', refill: 'Refill notice' };

function ShareIdCard() {
  const { getShareId, regenerateShareId } = usePatientActions();
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { void getShareId().then(setId); }, [getShareId]);
  const renew = async () => { setBusy(true); const n = await regenerateShareId(); if (n) setId(n); setBusy(false); };
  return (
    <Card aria-labelledby="invite-h">
      <h2 id="invite-h" className={p.h2}>Your NexPill ID</h2>
      <p className={p.sub}>Give this ID to someone you trust. When they enter it, they can see your updates straight away. Only share it with people you want to follow you.</p>
      <div className={s.codeBox}>
        {id ? (
          <>
            <p className="sr-only">Your ID is {id.split('').join(' ')}</p>
            <span className={s.code} aria-hidden="true">{id}</span>
          </>
        ) : <span className={s.expiry}>Loading…</span>}
      </div>
      <div style={{ marginTop: 20 }}>
        <Button size="md" variant="secondary" loading={busy} onClick={() => setConfirm(true)}>Create a new ID</Button>
        <p className={s.expiry} style={{ marginTop: 8 }}>Use this if your ID reached someone it shouldn't. People already linked stay linked; remove them from the list if needed.</p>
      </div>
      {confirm && (
        <ConfirmDialog open title="Create a new ID?" confirmLabel="Create new ID" onClose={() => setConfirm(false)}
          description="Your current ID will stop working. Caregivers who are already connected are not affected."
          onConfirm={renew} />
      )}
    </Card>
  );
}

export default function Caregivers() {
  const data = usePatientData();
  const { removeCaregiver } = usePatientActions();
  const [removing, setRemoving] = useState<Caregiver | null>(null);
  const active = data.caregivers;
  return (
    <>
      <PageHeader title="My caregivers" subtitle="The people who can see your updates" />
      <div className={p.two}>
        <div className={p.stack}>
          {active.length === 0 && <Card><p className={p.empty}>No caregivers yet. Share your NexPill ID to connect someone.</p></Card>}
          {active.map((c) => (
            <div key={c.id} className={p.stack}>
              <CaregiverCard caregiver={c} data={data} />
              <Card aria-label={`What ${c.name} is told about`}>
                <h2 className={p.h2} style={{ fontSize: '1.375rem' }}>What {c.name.split(' ')[0]} is told about</h2>
                <ul className={p.list}>
                  {([['missedDose', 'A dose is missed or skipped'], ['concern', 'You report a concern'], ['refill', 'You request a refill']] as const).map(([k, label]) => (
                    <li key={k} className={p.item}>
                      <Icon name={c.notifyOn[k] ? 'circleCheck' : 'circleMinus'} />
                      <span className={p.grow}>{label}</span>
                      <StatusTag tone={c.notifyOn[k] ? 'success' : 'neutral'} compact>{c.notifyOn[k] ? 'On' : 'Off'}</StatusTag>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 12 }}><Button size="md" variant="danger" onClick={() => setRemoving(c)}>Remove {c.name.split(' ')[0]}</Button></div>
              </Card>
            </div>
          ))}
        </div>
        <div className={p.stack}>
          <ShareIdCard />
          <Card aria-labelledby="msgs-h">
            <h2 id="msgs-h" className={p.h2}>Recent messages</h2>
            {data.messages.length === 0 ? (
              <p className={p.empty}>Nothing sent yet. Use “Send update” to let your caregiver know how you are.</p>
            ) : (
              <ul className={p.list}>
                {data.messages.slice(0, 20).map((m) => (
                  <li key={m.id} className={p.item}>
                    <Icon name="message" />
                    <span className={p.grow}><b>{KIND[m.kind]}</b><span>{m.body}</span></span>
                    <span style={{ color: 'var(--nx-muted)', fontSize: '0.9375rem' }}>
                      {formatRelative(m.sentAt)}{m.acknowledgedAt ? ' · Seen' : ' · Sent'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {removing && (
        <ConfirmDialog open title={`Remove ${removing.name}?`} confirmLabel="Remove" danger onClose={() => setRemoving(null)}
          description="They will stop seeing your updates immediately. They can follow you again later with your ID."
          onConfirm={() => removeCaregiver(removing.id)} />
      )}
    </>
  );
}
