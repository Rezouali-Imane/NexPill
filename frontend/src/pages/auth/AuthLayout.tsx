import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';
import s from './Auth.module.css';

export function AuthLayout({ title, subtitle, children, footer, wide }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className={s.page}>
      <a href="#auth-main" className="skip-link">Skip to form</a>
      <aside className={s.brand}>
        <Logo />
        <div className={s.pitch}>
          <h2>Medication, made calm.</h2>
          <p>Gentle reminders for patients. Peace of mind for the people who care for them.</p>
          <ul>
            <li>Clear, large, easy-to-read screens</li>
            <li>Caregivers are told only when it matters</li>
            <li>Updates arrive in real time</li>
          </ul>
        </div>
      </aside>
      <main id="auth-main" className={s.main}>
        <div className={[s.card, wide ? s.wide : ''].join(' ')}>
          <h1 className={s.title}>{title}</h1>
          {subtitle && <p className={s.sub}>{subtitle}</p>}
          {children}
          {footer && <div className={s.footer}>{footer}</div>}
        </div>
      </main>
    </div>
  );
}
