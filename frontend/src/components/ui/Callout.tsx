import type { ReactNode } from 'react';
import s from './Callout.module.css';

export function Callout({ label, children, tone = 'note' }: { label: string; children: ReactNode; tone?: 'note' | 'info' | 'concern' }) {
  return (
    <div className={[s.callout, s[tone]].join(' ')} role="note">
      <strong>{label}</strong> {children}
    </div>
  );
}
