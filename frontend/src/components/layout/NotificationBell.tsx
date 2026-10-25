import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { usePatientActions, usePatientState } from '@/state/PatientStore';
import { formatRelative } from '@/lib/time';
import s from './NotificationBell.module.css';

export function NotificationBell() {
  const { data } = usePatientState();
  const { markNotificationsRead } = usePatientActions();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const list = data?.notifications ?? [];
  const unread = list.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className={s.wrap} ref={wrap}>
      <button
        ref={btn} type="button" className={s.bell} aria-expanded={open} aria-controls={panelId}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" />
        {unread > 0 && <span className={s.dot} aria-hidden="true" />}
      </button>
      {open && (
        <div id={panelId} className={s.panel} role="region" aria-label="Notifications">
          <div className={s.head}>
            <h2>Notifications</h2>
            {unread > 0 && (
              <button type="button" className={s.link} onClick={() => void markNotificationsRead()}>Mark all as read</button>
            )}
          </div>
          {list.length === 0 ? (
            <p className={s.empty}>You are all caught up.</p>
          ) : (
            <ul className={s.list}>
              {list.map((n) => (
                <li key={n.id} className={[s.item, n.read ? '' : s.unread].join(' ')}>
                  <p className={s.title}>{n.title}{!n.read && <span className="sr-only"> (unread)</span>}</p>
                  <p className={s.body}>{n.body}</p>
                  <p className={s.time}>{formatRelative(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
