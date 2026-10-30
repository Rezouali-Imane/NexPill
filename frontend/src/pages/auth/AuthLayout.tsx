import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import s from './Auth.module.css';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={s.page}>
      <a href="#auth-main" className="skip-link">
        Skip to form
      </a>
      <aside className={s.brand}>
        <div className={s.brandContent}>
          <div className={s.logoWrap}>
            <Logo />
          </div>
          <div className={s.pitch}>
            <h2>Medication, made calm.</h2>
            <p>
              Gentle reminders for patients. Peace of mind for the people who care for them.
            </p>
          </div>

          <div className={s.demoCard}>
            <div className={s.demoHeader}>
              <span className={s.demoBadge}>Demo & Judge Access</span>
            </div>
            <p className={s.demoIntro}>
              Preloaded with active prescriptions, daily schedules, and caregiver alerts:
            </p>

            <div className={s.demoAccount}>
              <div className={s.demoRow}>
                <span className={s.demoRole}>Patient (Jamie Miller)</span>
                <Link to="/signin?demo=patient" className={s.demoFillBtn}>
                  Auto-fill
                </Link>
              </div>
              <div className={s.demoField}>
                <span className={s.demoLabel}>Email:</span>
                <code className={s.demoCode}>patient@nexpill.demo</code>
              </div>
              <div className={s.demoField}>
                <span className={s.demoLabel}>Password:</span>
                <code className={s.demoCode}>Nexpill123!</code>
              </div>
            </div>

            <div className={s.demoAccount}>
              <div className={s.demoRow}>
                <span className={s.demoRole}>Caregiver (Sarah Miller)</span>
                <Link to="/signin?demo=caregiver" className={s.demoFillBtn}>
                  Auto-fill
                </Link>
              </div>
              <div className={s.demoField}>
                <span className={s.demoLabel}>Email:</span>
                <code className={s.demoCode}>caregiver@nexpill.demo</code>
              </div>
              <div className={s.demoField}>
                <span className={s.demoLabel}>Password:</span>
                <code className={s.demoCode}>Nexpill123!</code>
              </div>
            </div>
          </div>
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
