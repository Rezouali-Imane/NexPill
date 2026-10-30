import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextInput, TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { usePatientActions } from '@/state/PatientStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

const FORMS = [
  { id: 'tablet', label: 'Tablet' },
  { id: 'capsule', label: 'Capsule' },
  { id: 'liquid', label: 'Liquid' },
  { id: 'drops', label: 'Drops' },
  { id: 'inhaler', label: 'Inhaler' },
];

const PRESETS = [
  { id: 'once', label: 'Once daily (08:00)', times: ['08:00'] },
  { id: 'twice', label: 'Twice daily (08:00, 20:00)', times: ['08:00', '20:00'] },
  { id: 'thrice', label: '3× daily (08:00, 14:00, 20:00)', times: ['08:00', '14:00', '20:00'] },
  { id: 'custom', label: 'Custom time...', times: [] },
];

export function AddMedicationDialog({ open, onClose }: Props) {
  const { addMedication } = usePatientActions();

  const [name, setName] = useState('');
  const [strength, setStrength] = useState('');
  const [form, setForm] = useState('tablet');
  const [preset, setPreset] = useState<'once' | 'twice' | 'thrice' | 'custom'>('once');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [instructions, setInstructions] = useState('');
  const [prescriber, setPrescriber] = useState('');
  const [purpose, setPurpose] = useState('');

  const [nameError, setNameError] = useState('');
  const [timeError, setTimeError] = useState('');
  const [busy, setBusy] = useState(false);

  const handlePresetSelect = (pId: 'once' | 'twice' | 'thrice' | 'custom') => {
    setPreset(pId);
    setTimeError('');
    if (pId === 'once') setTimes(['08:00']);
    else if (pId === 'twice') setTimes(['08:00', '20:00']);
    else if (pId === 'thrice') setTimes(['08:00', '14:00', '20:00']);
  };

  const addCustomTime = () => {
    setTimes((prev) => [...prev, '12:00']);
  };

  const removeTime = (index: number) => {
    if (times.length <= 1) {
      setTimeError('At least one dose time is required.');
      return;
    }
    setTimes((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTime = (index: number, val: string) => {
    setTimeError('');
    setTimes((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const resetForm = () => {
    setName('');
    setStrength('');
    setForm('tablet');
    setPreset('once');
    setTimes(['08:00']);
    setInstructions('');
    setPrescriber('');
    setPurpose('');
    setNameError('');
    setTimeError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    if (!name.trim()) {
      setNameError('Please enter a medication name.');
      hasError = true;
    }

    if (times.length === 0 || times.some((t) => !t.trim())) {
      setTimeError('Please set at least one valid time of day.');
      hasError = true;
    }

    if (hasError) return;

    setBusy(true);
    const ok = await addMedication({
      name: name.trim(),
      strength: strength.trim() || undefined,
      form,
      scheduleTimes: times.sort(),
      instructions: instructions.trim() || undefined,
      prescriber: prescriber.trim() || undefined,
      purpose: purpose.trim() || undefined,
    });
    setBusy(false);

    if (ok) {
      resetForm();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Add medication"
      description="Enter prescription details and schedule reminders for this medication."
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
        <TextInput
          label="Medication name"
          placeholder="e.g. Metformin, Lisinopril, Atorvastatin"
          value={name}
          error={nameError}
          data-autofocus
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError('');
          }}
          required
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <TextInput
            label="Strength / Dosage"
            placeholder="e.g. 500mg, 1 tablet"
            value={strength}
            onChange={(e) => setStrength(e.target.value)}
          />
          <div className="field">
            <label htmlFor="med-form" style={{ display: 'block', fontWeight: 600, fontSize: '1.0625rem', marginBottom: 6 }}>
              Form
            </label>
            <select
              id="med-form"
              value={form}
              onChange={(e) => setForm(e.target.value)}
              style={{
                width: '100%',
                minHeight: 52,
                padding: '12px 14px',
                font: 'inherit',
                fontSize: '1rem',
                color: 'var(--nx-ink)',
                background: '#fff',
                border: '1.5px solid #c9d3d2',
                borderRadius: 'var(--nx-r-sm)',
              }}
            >
              {FORMS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Schedule & Routine */}
        <div style={{ marginTop: 20 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '1.0625rem', marginBottom: 6 }}>
            Schedule routine
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {PRESETS.map((p) => {
              const active = preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePresetSelect(p.id as any)}
                  aria-pressed={active}
                  style={{
                    minHeight: 34,
                    padding: '0 12px',
                    borderRadius: 'var(--nx-r-full)',
                    border: '1px solid',
                    borderColor: active ? 'var(--nx-primary)' : 'var(--nx-line)',
                    background: active ? 'var(--nx-primary)' : '#fff',
                    color: active ? '#fff' : 'var(--nx-ink)',
                    fontWeight: 600,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Time pickers */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            {times.map((t, idx) => (
              <div
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  background: 'var(--nx-panel)',
                  borderRadius: 'var(--nx-r-sm)',
                  border: '1px solid var(--nx-line)',
                }}
              >
                <Icon name="clock" size={16} />
                <input
                  type="time"
                  value={t}
                  onChange={(e) => updateTime(idx, e.target.value)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    font: 'inherit',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: 'var(--nx-ink)',
                  }}
                />
                {times.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTime(idx)}
                    aria-label={`Remove time ${t}`}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--nx-muted)',
                    }}
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addCustomTime}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 36,
                padding: '0 12px',
                borderRadius: 'var(--nx-r-full)',
                border: '1px dashed var(--nx-line)',
                background: '#fff',
                color: 'var(--nx-primary)',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <Icon name="plus" size={14} /> Add time
            </button>
          </div>
          {timeError && (
            <p role="alert" style={{ color: 'var(--nx-concern-ink)', fontWeight: 600, marginTop: 6, fontSize: '0.875rem' }}>
              {timeError}
            </p>
          )}
        </div>

        {/* Instructions */}
        <div style={{ marginTop: 14 }}>
          <TextArea
            label="Instructions (optional)"
            placeholder="e.g. Take with dinner, drink plenty of water"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
          />
        </div>

        {/* Prescriber & Purpose */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <TextInput
            label="Prescribed by (optional)"
            placeholder="e.g. Dr. Adams"
            value={prescriber}
            onChange={(e) => setPrescriber(e.target.value)}
          />
          <TextInput
            label="Condition / Purpose (optional)"
            placeholder="e.g. High blood pressure"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </div>

        <div className="actions" style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
          <Button size="md" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="md" variant="primary" type="submit" loading={busy}>
            Save medication
          </Button>
        </div>
      </form>
    </Modal>
  );
}
