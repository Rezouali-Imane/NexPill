import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { Dose, Medication } from '@/domain/types';
import { usePatientActions } from '@/state/PatientStore';
import { formatClock } from '@/lib/time';

interface Props { dose: Dose; med: Medication; open: boolean; onClose: () => void }

export function SkipDialog({ dose, med, open, onClose }: Props) {
  const { recordDose } = usePatientActions();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await recordDose(dose, { kind: 'skipped', reason: reason.trim() || undefined });
    setBusy(false);
    if (ok) { setReason(''); onClose(); }
  };
  return (
    <Modal
      open={open} onClose={onClose} title={`Skip ${med.name} for now?`}
      description={`This is your ${formatClock(dose.time)} dose. If a dose is skipped, your caregiver may be told. Do not take a double dose later unless your care team says so.`}
    >
      <TextArea label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      <div className="actions">
        <Button size="md" onClick={onClose} data-autofocus>Go back</Button>
        <Button size="md" variant="danger" loading={busy} onClick={() => void submit()}>Skip this dose</Button>
      </div>
    </Modal>
  );
}

export function ConcernDialog({ dose, med, open, onClose }: Props) {
  const { recordDose } = usePatientActions();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim()) { setError('Tell us what worries you so your care team can help.'); return; }
    setBusy(true);
    const ok = await recordDose(dose, { kind: 'concern', text: text.trim() });
    setBusy(false);
    if (ok) { setText(''); setError(''); onClose(); }
  };
  return (
    <Modal
      open={open} onClose={onClose} title={`Concern about ${med.name}`}
      description="Your care team and your primary caregiver will be told. If this is an emergency, call your local emergency number now."
    >
      <TextArea
        label="What is worrying you?" value={text} error={error} maxLength={500}
        hint="For example: side effects, feeling unwell, a different-looking tablet."
        onChange={(e) => { setText(e.target.value); if (error) setError(''); }} data-autofocus
      />
      <div className="actions">
        <Button size="md" onClick={onClose}>Cancel</Button>
        <Button size="md" variant="primary" loading={busy} onClick={() => void submit()}>Send concern</Button>
      </div>
    </Modal>
  );
}
