import { useUi } from '@/state/UiStore';
import { Icon } from './Icon';
import s from './Toasts.module.css';

/** Visual toasts. Screen readers are served by the single polite live region in <LiveRegion>. */
export function Toasts() {
  const { toasts, dismissToast } = useUi();
  // Filter out any backend error alerts from showing as visual banners in the UI
  const visualToasts = toasts.filter((t) => t.tone !== 'error');

  return (
    <div className={s.stack}>
      {visualToasts.map((t) => (
        <div key={t.id} className={[s.toast, s[t.tone]].join(' ')}>
          <Icon name="circleCheck" size={18} />
          <span>{t.text}</span>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss message">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function LiveRegion() {
  const { announcement } = useUi();
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>;
}
