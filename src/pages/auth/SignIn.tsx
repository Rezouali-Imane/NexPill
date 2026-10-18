import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/api/mock/db';
import { homeFor, useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormField, PasswordField } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { EMAIL_RE } from '@/lib/validation';
import { AuthLayout } from './AuthLayout';
import s from './Auth.module.css';

export default function SignIn() {
  const [params] = useSearchParams();
  const role = params.get('role');
  const demo = params.get('demo') as 'patient' | 'caregiver' | null;
  const { signIn } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo && DEMO_ACCOUNTS[demo]) { setEmail(DEMO_ACCOUNTS[demo]); setPassword(DEMO_PASSWORD); }
  }, [demo]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const errs: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Enter your password.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const s = await signIn(email, password, remember);
      const from = loc.state?.from;
      nav(from && from.startsWith(`/${s.user.role}`) ? from : homeFor(s.user.role), { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back" subtitle={role === 'caregiver' ? 'Sign in to check on the people you care for.' : role === 'patient' ? 'Sign in to see your medication plan.' : 'Sign in to your NexPill account.'}
      footer={<span>New to NexPill? <Link to={role === 'patient' || role === 'caregiver' ? `/signup/${role}` : '/welcome'}>Create an account</Link></span>}
    >
      <Link to="/welcome" className={s.back}><Icon name="arrowLeft" size={18} /> Back</Link>
      <form className={s.form} onSubmit={(e) => void submit(e)} noValidate style={{ marginTop: 8 }}>
        {formError && <p role="alert" className={s.alert}>{formError}</p>}
        <FormField label="Email" type="email" inputMode="email" autoComplete="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} required />
        <PasswordField label="Password" autoComplete="current-password" value={password} error={errors.password} onChange={(e) => setPassword(e.target.value)} required />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Checkbox label="Keep me signed in" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <Link to="/forgot-password" className={s.link}>Forgot password?</Link>
        </div>
        <Button type="submit" variant="primary" loading={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </AuthLayout>
  );
}
