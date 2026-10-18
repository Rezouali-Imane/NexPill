import { useAuth } from '@/auth/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { PATIENT_NAV, PATIENT_NAV_SECONDARY } from '@/components/layout/nav';
import { Button } from '@/components/ui/Button';
import { useEffect } from 'react';
import { PatientProvider, usePatientActions, usePatientState } from '@/state/PatientStore';

function Shell() {
  const { status, error, data } = usePatientState();
  const { reload } = usePatientActions();
  const size = data?.settings.textSize;
  // Applies the patient's "larger text" setting.
  useEffect(() => {
    if (size) document.documentElement.dataset.textSize = size;
    return () => { delete document.documentElement.dataset.textSize; };
  }, [size]);
  if (status === 'loading') return <p role="status" style={{ padding: 40, fontSize: '1.25rem' }}>Loading your medication plan…</p>;
  if (status === 'error')
    return (
      <div role="alert" style={{ padding: 40, display: 'grid', gap: 16, justifyItems: 'start' }}>
        <p style={{ fontSize: '1.25rem' }}>{error ?? 'We could not load your plan.'}</p>
        <Button size="md" variant="primary" onClick={() => void reload()}>Try again</Button>
      </div>
    );
  return <AppShell primary={PATIENT_NAV} secondary={PATIENT_NAV_SECONDARY} caption="Patient profile" />;
}

export default function PatientArea() {
  const { session } = useAuth();
  if (!session) return null;
  return <PatientProvider session={session}><Shell /></PatientProvider>;
}
