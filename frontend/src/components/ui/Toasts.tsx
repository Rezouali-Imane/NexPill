import { useUi } from '@/state/UiStore';
import { Icon } from './Icon';
import s from './Toasts.module.css';

/** Visual toasts. Screen readers are served by the single polite live region in <LiveRegion>. */
export function Toasts() {
  const { toasts, dismissToast } = useUi();
  return (
    <div className={s.stack}>
      {toasts.map((t) => (
        <div key={t.id} className={[s.toast, s[t.tone]].join(' ')} role={t.tone === 'error' ? 'alert' : undefined}>
          <Icon name={t.tone === 'error' ? 'alert' : 'circleCheck'} size={22} />
          <span>{t.text}</span>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss message"><Icon name="x" size={18} /></button>
        </div>
      ))}
    </div>
  );
}

export function LiveRegion() {
  const { announcement } = useUi();
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>;
}
