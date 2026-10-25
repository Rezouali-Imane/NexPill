import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, backend } from '@/api';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { EMAIL_RE } from '@/lib/validation';
import { AuthLayout } from './AuthLayout';
import s from './Auth.module.css';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError('Enter a valid email address.'); return; }
    setBusy(true); setError('');
    try { setSent(await backend.auth.requestPasswordReset(email)); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'); }
    setBusy(false);
  };

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we will send you a link to choose a new password." footer={<Link to="/signin">Back to sign in</Link>}>
      <Link to="/signin" className={s.back}><Icon name="arrowLeft" size={18} /> Back</Link>
      {sent ? (
        <div className={s.form} style={{ marginTop: 8 }}>
          <p className={s.okbox} role="status">If an account exists for {email.trim()}, a reset link is on its way. It expires in 30 minutes.</p>
          {sent.devLink && (
            <p className={s.demo}><b>Demo only:</b> there is no email service, so here is the link: <Link to={sent.devLink} className={s.link}>Choose a new password</Link></p>
          )}
        </div>
      ) : (
        <form className={s.form} onSubmit={(e) => void submit(e)} noValidate>
          <FormField label="Email" type="email" inputMode="email" autoComplete="email" value={email} error={error} onChange={(e) => { setEmail(e.target.value); setError(''); }} required />
          <Button type="submit" variant="primary" loading={busy}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
