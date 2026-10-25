import { useAuth } from '@/auth/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { CAREGIVER_NAV, CAREGIVER_NAV_SECONDARY } from '@/components/layout/nav';
import { CaregiverProvider, useCaregiverData, useCaregiverState } from '@/caregiver/CaregiverStore';
import { useNow } from '@/lib/useNow';
import { Button } from '@/components/ui/Button';

function Shell() {
  const { now } = useNow();
  const { status, error } = useCaregiverState();
  const { unseen } = useCaregiverData(now);
  if (status === 'loading') return <p role="status" style={{ padding: 40, fontSize: '1.25rem' }}>Loading your patients…</p>;
  if (status === 'error') return <div role="alert" style={{ padding: 40 }}><p style={{ fontSize: '1.25rem', marginBottom: 16 }}>{error}</p><Button size="md" variant="primary" onClick={() => location.reload()}>Try again</Button></div>;
  const nav = CAREGIVER_NAV.map((i) => (i.to === '/caregiver/alerts' ? { ...i, badge: unseen.length } : i));
  return <AppShell primary={nav} secondary={CAREGIVER_NAV_SECONDARY} caption="Caregiver" />;
}

export default function CaregiverArea() {
  const { session } = useAuth();
  if (!session) return null;
  return <CaregiverProvider session={session}><Shell /></CaregiverProvider>;
}
