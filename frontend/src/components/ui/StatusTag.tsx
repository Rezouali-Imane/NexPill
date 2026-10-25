import type { Dose } from '@/domain/types';
import { STATE_LABEL, doseState } from '@/domain/status';
import { Icon, type IconName } from './Icon';
import s from './StatusTag.module.css';

type Tone = 'success' | 'info' | 'neutral' | 'concern' | 'warning';

const TONE_ICON: Record<Tone, IconName | null> = {
  success: 'check', info: 'clock', neutral: null, concern: 'alert', warning: 'alert',
};

/** Status is always communicated by word + (where useful) icon, never colour alone. */
export function StatusTag({ tone, children, compact }: { tone: Tone; children: string; compact?: boolean }) {
  const icon = TONE_ICON[tone];
  return (
    <span className={[s.tag, s[tone], compact ? s.compact : ''].join(' ')}>
      {icon && !compact && <Icon name={icon} size={16} strokeWidth={2.2} />}
      {children}
    </span>
  );
}

export function DoseStatusTag({ dose, now, isNext, compact }: { dose: Dose; now: Date; isNext?: boolean; compact?: boolean }) {
  const state = doseState(dose, now);
  switch (state) {
    case 'upcoming': return <StatusTag compact={compact} tone={isNext ? 'info' : 'neutral'}>{isNext ? 'Due next' : STATE_LABEL.upcoming}</StatusTag>;
    case 'due': return <StatusTag compact={compact} tone="info">{STATE_LABEL.due}</StatusTag>;
    case 'taken': return <StatusTag compact={compact} tone="success">{STATE_LABEL.taken}</StatusTag>;
    case 'late': return <StatusTag compact={compact} tone="warning">{STATE_LABEL.late}</StatusTag>;
    case 'overdue': case 'skipped': return <StatusTag compact={compact} tone="warning">{STATE_LABEL[state]}</StatusTag>;
    case 'missed': case 'concern': return <StatusTag compact={compact} tone="concern">{STATE_LABEL[state]}</StatusTag>;
  }
}
