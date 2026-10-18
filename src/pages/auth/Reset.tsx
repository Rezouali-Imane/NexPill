import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, backend } from '@/api';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/FormField';
import { validatePassword } from '@/lib/validation';
import { AuthLayout } from './AuthLayout';
import s from './Auth.module.css';

export default function Reset() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ pw?: string; confirm?: string }>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = { pw: validatePassword(pw), confirm: pw !== confirm ? 'The passwords do not match.' : undefined };
    setErrors(errs);
    if (errs.pw || errs.confirm) return;
    setBusy(true); setFormError('');
    try { await backend.auth.resetPassword(token, pw); setDone(true); setTimeout(() => nav('/signin', { replace: true }), 2500); }
    catch (err) { setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'); setBusy(false); }
  };

  if (!token) return <AuthLayout title="Link not valid" footer={<Link to="/forgot-password">Request a new link</Link>}><p className={s.sub}>This reset link is missing or incomplete.</p></AuthLayout>;

  return (
    <AuthLayout title="Choose a new password" footer={<Link to="/signin">Back to sign in</Link>}>
      {done ? (
        <p className={s.okbox} role="status" style={{ marginTop: 24 }}>Password updated. Taking you to sign in…</p>
      ) : (
        <form className={s.form} onSubmit={(e) => void submit(e)} noValidate>
          {formError && <p role="alert" className={s.alert}>{formError}</p>}
          <PasswordField label="New password" autoComplete="new-password" showStrength value={pw} error={errors.pw} hint="At least 8 characters, with a letter and a number." onChange={(e) => { setPw(e.target.value); setErrors({}); }} required />
          <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} error={errors.confirm} onChange={(e) => { setConfirm(e.target.value); setErrors({}); }} required />
          <Button type="submit" variant="primary" loading={busy}>Update password</Button>
        </form>
      )}
    </AuthLayout>
  );
}
