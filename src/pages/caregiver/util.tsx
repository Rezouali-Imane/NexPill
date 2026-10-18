import { StatusTag } from '@/components/ui/StatusTag';
import type { DoseState } from '@/domain/status';

const TONE: Record<DoseState, 'success' | 'warning' | 'concern' | 'info' | 'neutral'> = {
  taken: 'success', late: 'warning', skipped: 'warning', missed: 'concern', concern: 'concern', overdue: 'warning', due: 'info', upcoming: 'neutral',
};
export function DoseStatusTagFromState({ state, label }: { state: DoseState; label: string }) {
  return <StatusTag tone={TONE[state]} compact>{label}</StatusTag>;
}
