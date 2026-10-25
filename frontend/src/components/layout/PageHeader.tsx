import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/auth/AuthContext';
import { NotificationBell } from './NotificationBell';
import s from './PageHeader.module.css';

export function PageHeader({ eyebrow, title, subtitle, actions, bell = true, showHelp = true }: { showHelp?: boolean; eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode; bell?: ReactNode | boolean }) {
  const { session } = useAuth();
  const role = session?.user.role ?? 'patient';
  return (
    <header className={s.header}>
      <div className={s.text}>
        {eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}
        <h1 className={s.title}>{title}</h1>
        {subtitle && <p className={s.sub}>{subtitle}</p>}
      </div>
      <div className={s.actions}>
        {actions}
        {showHelp && <Link to={`/${role}/help`} className={s.help}><Icon name="help" /><span>Need help?</span></Link>}
        {bell === true ? <NotificationBell /> : bell || null}
      </div>
    </header>
  );
}
