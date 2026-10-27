import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { Role } from '@/domain/auth';
import { AuthLayout } from './AuthLayout';
import s from './Auth.module.css';

const ROLES: { id: Role; title: string; text: string; icon: 'user' | 'heart' }[] = [
  { id: 'patient', title: "I'm a patient", text: 'I take medication and want reminders.', icon: 'user' },
  { id: 'caregiver', title: "I'm a caregiver", text: "I look after someone else's medication.", icon: 'heart' },
];

export default function Welcome() {
  const nav = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [hint, setHint] = useState('');

  return (
    <AuthLayout title="Welcome to NexPill" subtitle="First, tell us how you will use NexPill.">
      <fieldset className={s.roles}>
        <legend>I am a…</legend>
        {ROLES.map((r) => (
          <label key={r.id} className={s.role}>
            <input
              type="radio"
              name="role"
              value={r.id}
              checked={role === r.id}
              onChange={() => {
                setRole(r.id);
                setHint('');
              }}
            />
            <span className={s.roleIcon}>
              <Icon name={r.icon} size={24} />
            </span>
            <span>
              <b>{r.title}</b>
              <span>{r.text}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p role="alert" className={s.alert} hidden={!hint} style={{ marginTop: 12 }}>
        {hint}
      </p>
      <div className={s.actions}>
        <Button
          variant="primary"
          onClick={() => (role ? nav(`/signup/${role}`) : setHint('Choose patient or caregiver first.'))}
        >
          Create account
        </Button>
        <Button onClick={() => nav(role ? `/signin?role=${role}` : '/signin')}>Sign in</Button>
      </div>
    </AuthLayout>
  );
}
