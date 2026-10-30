import { useId, type TextareaHTMLAttributes, type InputHTMLAttributes } from 'react';
import s from './Field.module.css';

export function TextArea({ label, hint, error, ...rest }: { label: string; hint?: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className={s.label}>{label}</label>
      {hint && <p id={`${id}-h`} className={s.hint}>{hint}</p>}
      <textarea
        id={id} rows={4} className={s.input} aria-invalid={!!error || undefined}
        aria-describedby={[hint && `${id}-h`, error && `${id}-e`].filter(Boolean).join(' ') || undefined} {...rest}
      />
      {error && <p id={`${id}-e`} role="alert" className={s.error}>{error}</p>}
    </div>
  );
}

export function TextInput({ label, hint, error, ...rest }: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className={s.label}>{label}</label>
      {hint && <p id={`${id}-h`} className={s.hint}>{hint}</p>}
      <input
        id={id}
        className={s.input}
        aria-invalid={!!error || undefined}
        aria-describedby={[hint && `${id}-h`, error && `${id}-e`].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {error && <p id={`${id}-e`} role="alert" className={s.error}>{error}</p>}
    </div>
  );
}
