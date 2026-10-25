import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import s from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  /** lg = 72px (Figma action row), stack = 78px (caregiver card), md = 52px. */
  size?: 'lg' | 'stack' | 'md';
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'lg', icon, loading, disabled, className, children, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={[s.btn, s[variant], s[size], className].filter(Boolean).join(' ')} {...rest}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
});
