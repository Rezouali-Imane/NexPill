import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { LiveRegion, Toasts } from '@/components/ui/Toasts';
import { useAuth } from '@/auth/AuthContext';
import { useUi } from '@/state/UiStore';
import { Sidebar } from './Sidebar';
import type { NavItem } from './nav';
import s from './AppShell.module.css';

export function AppShell({ primary, secondary, caption }: { primary: NavItem[]; secondary: NavItem[]; caption: string }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { connection } = useUi();
  const { session, signOut } = useAuth();
  const u = session?.user;

  useEffect(() => {
    setOpen(false);
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={s.shell}>
      <a href="#main" className="skip-link">Skip to main content</a>
      <button
        type="button" className={s.menu} aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen((o) => !o)}
      >
        <Icon name={open ? 'x' : 'menu'} />
      </button>
      <Sidebar
        open={open} onNavigate={() => setOpen(false)} primary={primary} secondary={secondary}
        profile={{ name: u ? `${u.firstName} ${u.lastName}` : '', initials: u ? `${u.firstName[0]}${u.lastName[0]}`.toUpperCase() : '', caption }}
        onSignOut={() => void signOut()}
      />
      {open && <div className={s.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />}
      <main id="main" tabIndex={-1} className={s.main}>
        {connection === 'reconnecting' && (
          <p className={s.offline} role="status">Reconnecting… your changes are saved and will sync.</p>
        )}
        <Outlet />
      </main>
      <Toasts />
      <LiveRegion />
    </div>
  );
}
