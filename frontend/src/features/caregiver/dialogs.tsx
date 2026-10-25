import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { PatientView } from '@/domain/caregiver';
import { useCaregiverActions } from '@/caregiver/CaregiverStore';

export function SendMessageDialog({ view, open, onClose }: { view: PatientView; open: boolean; onClose: () => void }) {
  const { sendMessage } = useCaregiverActions();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = view.patient.firstName;
  const quick = [`Hi ${first}, have you taken your medication?`, 'Please confirm your dose when you can.', 'I will call you in a few minutes.'];
  const submit = async () => {
    if (!body.trim()) { setError('Write a short message first.'); return; }
    setBusy(true);
    const ok = await sendMessage(view.patient.id, body);
    setBusy(false);
    if (ok) { setBody(''); setError(''); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Message ${first}`} description={`${first} will see it in their notifications straight away.`}>
      <div className="field" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {quick.map((q) => <Button key={q} size="md" onClick={() => setBody(q)}>{q}</Button>)}
      </div>
      <TextArea label="Message" value={body} error={error} maxLength={300} data-autofocus onChange={(e) => { setBody(e.target.value); setError(''); }} />
      <div className="actions">
        <Button size="md" onClick={onClose}>Cancel</Button>
        <Button size="md" variant="primary" loading={busy} onClick={() => void submit()}>Send message</Button>
      </div>
    </Modal>
  );
}
