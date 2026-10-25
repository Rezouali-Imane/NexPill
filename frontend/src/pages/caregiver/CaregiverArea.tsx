import { useAuth } from '@/auth/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { CAREGIVER_NAV, CAREGIVER_NAV_SECONDARY } from '@/components/layout/nav';
import { CaregiverProvider, useCaregiverData, useCaregiverState } from '@/caregiver/CaregiverStore';
import { useNow } from '@/lib/useNow';
import { Button } from '@/components/ui/Button';

function Shell() {
  const { now } = useNow();
  const { status, data } = useCaregiverState();
  const { unseen } = useCaregiverData(now);

  if (status === 'loading') {
    return (
      <div style={{ padding: '32px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <p style={{ fontSize: '0.9375rem', color: 'var(--nx-muted)' }}>Loading patient overview…</p>
      </div>
    );
  }

  if (status === 'error' && !data) {
    return (
      <div style={{ padding: '32px 24px', display: 'grid', gap: 12, justifyItems: 'start' }}>
        <p style={{ fontSize: '0.9375rem', color: 'var(--nx-muted)' }}>Could not load patient dashboard. Reconnecting…</p>
        <Button size="md" variant="primary" onClick={() => location.reload()}>Retry</Button>
      </div>
    );
  }

  const nav = CAREGIVER_NAV.map((i) => (i.to === '/caregiver/alerts' ? { ...i, badge: unseen.length } : i));
  return <AppShell primary={nav} secondary={CAREGIVER_NAV_SECONDARY} caption="Caregiver" />;
}

export default function CaregiverArea() {
  const { session } = useAuth();
  if (!session) return null;
  return <CaregiverProvider session={session}><Shell /></CaregiverProvider>;
}
