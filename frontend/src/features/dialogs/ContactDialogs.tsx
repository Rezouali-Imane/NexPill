import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { Caregiver, Medication } from '@/domain/types';
import { daysOfSupply } from '@/domain/derive';
import { usePatientActions } from '@/state/PatientStore';

export function CareTeamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sendCareTeamMessage } = usePatientActions();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!body.trim()) { setError('Write your question first.'); return; }
    setBusy(true);
    const ok = await sendCareTeamMessage(subject, body);
    setBusy(false);
    if (ok) { setSubject(''); setBody(''); setError(''); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Contact your care team"
      description="We usually reply within one working day. For anything urgent, call your care team or emergency services.">
      <TextInput label="Subject (optional)" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={80} />
      <TextArea label="Your message" value={body} error={error} maxLength={800}
        onChange={(e) => { setBody(e.target.value); if (error) setError(''); }} data-autofocus />
      <div className="actions">
        <Button size="md" onClick={onClose}>Cancel</Button>
        <Button size="md" variant="primary" loading={busy} onClick={() => void submit()}>Send message</Button>
      </div>
    </Modal>
  );
}

export function SendUpdateDialog({ caregiver, open, onClose }: { caregiver: Caregiver; open: boolean; onClose: () => void }) {
  const { sendCaregiverUpdate } = usePatientActions();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = caregiver.name.split(' ')[0];
  const submit = async () => {
    if (!body.trim()) { setError('Write a short message first.'); return; }
    setBusy(true);
    const ok = await sendCaregiverUpdate(caregiver.id, body);
    setBusy(false);
    if (ok) { setBody(''); setError(''); onClose(); }
  };
  const quick = ['I took all my medications.', 'I am feeling fine today.', 'Please call me when you can.'];
  return (
    <Modal open={open} onClose={onClose} title={`Send an update to ${first}`}>
      <div className="field" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {quick.map((q) => (
          <Button key={q} size="md" onClick={() => setBody(q)}>{q}</Button>
        ))}
      </div>
      <TextArea label="Message" value={body} error={error} maxLength={400}
        onChange={(e) => { setBody(e.target.value); if (error) setError(''); }} data-autofocus />
      <div className="actions">
        <Button size="md" onClick={onClose}>Cancel</Button>
        <Button size="md" variant="primary" loading={busy} onClick={() => void submit()}>Send update</Button>
      </div>
    </Modal>
  );
}

export function CallDialog({ caregiver, open, onClose }: { caregiver: Caregiver; open: boolean; onClose: () => void }) {
  const first = caregiver.name.split(' ')[0];
  return (
    <Modal open={open} onClose={onClose} title={`Call ${first}`} description={caregiver.phone ? `${caregiver.name} · ${caregiver.phone}` : `${first} has not added a phone number yet. Try sending an update instead.`}>
      <div className="actions">
        <Button size="md" onClick={onClose}>{caregiver.phone ? 'Cancel' : 'Close'}</Button>
        {caregiver.phone && <a
          href={`tel:${caregiver.phone.replace(/\s/g, '')}`} onClick={onClose} data-autofocus
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 14,
            background: 'var(--nx-primary)', color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: '1.0625rem',
          }}
        >
          Call now
        </a>}
      </div>
    </Modal>
  );
}

export function RefillDialog({ med, open, onClose }: { med: Medication; open: boolean; onClose: () => void }) {
  const { requestRefill } = usePatientActions();
  const [busy, setBusy] = useState(false);
  const days = daysOfSupply(med);
  const submit = async () => {
    setBusy(true);
    const ok = await requestRefill(med.id);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={`Refill ${med.name}?`}
      description={`You have about ${days} ${days === 1 ? 'day' : 'days'} left (${med.pillsLeft} ${med.form}s). We will send the request to your pharmacy and let your caregiver know.`}>
      <div className="actions">
        <Button size="md" onClick={onClose}>Not now</Button>
        <Button size="md" variant="primary" loading={busy} onClick={() => void submit()} data-autofocus>Request refill</Button>
      </div>
    </Modal>
  );
}
