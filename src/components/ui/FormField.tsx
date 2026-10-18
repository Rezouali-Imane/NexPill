import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './Icon';
import { passwordStrength } from '@/lib/validation';
import s from './FormField.module.css';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  trailing?: ReactNode;
}

export function FormField({ label, hint, error, optional, trailing, className, ...rest }: Props) {
  const id = useId();
  const describedBy = [hint && `${id}-h`, error && `${id}-e`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={[s.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={s.label}>{label}{optional && <span className={s.opt}> (optional)</span>}</label>
      {hint && <p id={`${id}-h`} className={s.hint}>{hint}</p>}
      <div className={s.wrap}>
        <input id={id} className={s.input} aria-invalid={!!error || undefined} aria-describedby={describedBy} {...rest} />
        {trailing}
      </div>
      {error && <p id={`${id}-e`} className={s.error}><Icon name="alert" size={16} /> {error}</p>}
    </div>
  );
}

export function PasswordField({ showStrength, ...props }: Props & { showStrength?: boolean }) {
  const [show, setShow] = useState(false);
  const value = String(props.value ?? '');
  const strength = passwordStrength(value);
  const words = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div>
      <FormField
        {...props} type={show ? 'text' : 'password'} autoCapitalize="none" spellCheck={false}
        trailing={
          <button type="button" className={s.toggle} onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'}>
            <Icon name={show ? 'eyeOff' : 'eye'} size={22} />
          </button>
        }
      />
      {showStrength && value.length > 0 && (
        <div className={s.meter} aria-live="polite">
          <div className={s.bars} aria-hidden="true">
            {[1, 2, 3, 4].map((n) => <span key={n} className={[s.bar, strength >= n ? s[`s${strength}`] : ''].join(' ')} />)}
          </div>
          <span>Password strength: <b>{words[strength]}</b></span>
        </div>
      )}
    </div>
  );
}

export function Checkbox({ label, error, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={s.check}>
        <input id={id} type="checkbox" aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-e` : undefined} {...rest} />
        <span>{label}</span>
      </label>
      {error && <p id={`${id}-e`} className={s.error}><Icon name="alert" size={16} /> {error}</p>}
    </div>
  );
}
