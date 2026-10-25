import { useAuth } from '@/auth/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { PATIENT_NAV, PATIENT_NAV_SECONDARY } from '@/components/layout/nav';
import { Button } from '@/components/ui/Button';
import { useEffect } from 'react';
import { PatientProvider, usePatientActions, usePatientState } from '@/state/PatientStore';

function Shell() {
  const { status, data } = usePatientState();
  const { reload } = usePatientActions();
  const size = data?.settings.textSize;
  // Applies the patient's "larger text" setting.
  useEffect(() => {
    if (size) document.documentElement.dataset.textSize = size;
    return () => { delete document.documentElement.dataset.textSize; };
  }, [size]);

  if (status === 'loading') {
    return (
      <div style={{ padding: '32px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <p style={{ fontSize: '0.9375rem', color: 'var(--nx-muted)' }}>Loading your medication plan…</p>
      </div>
    );
  }

  if (status === 'error' && !data) {
    return (
      <div style={{ padding: '32px 24px', display: 'grid', gap: 12, justifyItems: 'start' }}>
        <p style={{ fontSize: '0.9375rem', color: 'var(--nx-muted)' }}>Could not load medication plan. Reconnecting…</p>
        <Button size="md" variant="primary" onClick={() => void reload()}>Retry</Button>
      </div>
    );
  }

  return <AppShell primary={PATIENT_NAV} secondary={PATIENT_NAV_SECONDARY} caption="Patient profile" />;
}

export default function PatientArea() {
  const { session } = useAuth();
  if (!session) return null;
  return <PatientProvider session={session}><Shell /></PatientProvider>;
}
