import { NavLink } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import type { NavItem } from './nav';
import s from './Sidebar.module.css';

export interface SidebarProfile { name: string; initials: string; caption: string }

function Links({ items, label, onNavigate }: { items: NavItem[]; label: string; onNavigate?: () => void }) {
  return (
    <nav aria-label={label} className={s.nav}>
      {items.map((i) => (
        <NavLink
          key={i.to} to={i.to} end={i.end} onClick={onNavigate}
          className={({ isActive }) => [s.link, isActive ? s.active : ''].join(' ')}
        >
          <Icon name={i.icon} />
          <span className={s.label}>{i.label}</span>
          {!!i.badge && <span className={s.badge} aria-label={`${i.badge} new`}>{i.badge}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

interface Props {
  open: boolean; onNavigate: () => void; primary: NavItem[]; secondary: NavItem[];
  profile: SidebarProfile; onSignOut: () => void;
}

export function Sidebar({ open, onNavigate, primary, secondary, profile, onSignOut }: Props) {
  return (
    <aside className={[s.aside, open ? s.open : ''].join(' ')} id="sidebar">
      <div className={s.logo}><Logo /></div>
      <Links items={primary} label="Main" onNavigate={onNavigate} />
      <div className={s.spacer} />
      <Links items={secondary} label="Support and settings" onNavigate={onNavigate} />
      <div className={s.profile}>
        <div className={s.avatar} aria-hidden="true">{profile.initials}</div>
        <div className={s.who}>
          <p className={s.pname}>{profile.name}</p>
          <p className={s.prole}>{profile.caption}</p>
        </div>
        <button type="button" className={s.signout} onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <Icon name="logout" size={20} />
        </button>
      </div>
    </aside>
  );
}
