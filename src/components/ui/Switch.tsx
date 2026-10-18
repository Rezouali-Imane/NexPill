import { useId } from 'react';
import s from './Switch.module.css';

export function Switch({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className={s.row}>
      <div className={s.text}>
        <label htmlFor={id} className={s.label}>{label}</label>
        {description && <p id={`${id}-d`} className={s.desc}>{description}</p>}
      </div>
      <button
        id={id} type="button" role="switch" aria-checked={checked} aria-describedby={description ? `${id}-d` : undefined}
        className={[s.sw, checked ? s.on : ''].join(' ')} onClick={() => onChange(!checked)}
      >
        <span className={s.knob} />
        <span className={s.state}>{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}
