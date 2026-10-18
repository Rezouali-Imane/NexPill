import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import p from '@/components/ui/Page.module.css';
import type { ConnectionState } from '@/domain/types';
import { mockRealtime } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { usePatientActions, usePatientData } from '@/state/PatientStore';
import { useUi } from '@/state/UiStore';
import f from './Help.module.css';

const CONN: Record<ConnectionState, string> = {
  connecting: 'Connecting…', open: 'Live updates on', reconnecting: 'Reconnecting…', closed: 'Offline',
};

export default function Settings() {
  const { settings } = usePatientData();
  const { connection } = useUi();
  const { session, signOut } = useAuth();
  const { updateSettings, resetDemo } = usePatientActions();
  return (
    <>
      <PageHeader title="Settings" subtitle="Reminders, text size and sharing" />
      <Card aria-labelledby="acct-h">
        <h2 id="acct-h" className={p.h2}>Account</h2>
        <p className={p.sub}>{session?.user.firstName} {session?.user.lastName} · {session?.user.email}</p>
        <div style={{ marginTop: 16 }}><Button size="md" onClick={() => void signOut()}>Sign out</Button></div>
      </Card>
      <Card aria-labelledby="rem-h">
        <h2 id="rem-h" className={p.h2}>Reminders</h2>
        <Switch label="Medication reminders" description="Get a reminder when a dose is due." checked={settings.reminders} onChange={(v) => void updateSettings({ reminders: v })} />
        <div style={{ padding: '4px 0 20px' }}>
          <label htmlFor="lead" style={{ fontWeight: 700, fontSize: '1.1875rem', display: 'block', marginBottom: 6 }}>Remind me</label>
          <select
            id="lead" value={settings.reminderLeadMinutes} disabled={!settings.reminders}
            onChange={(e) => void updateSettings({ reminderLeadMinutes: Number(e.target.value) as 0 | 5 | 10 | 15 })}
            style={{ minHeight: 52, fontSize: '1.125rem', padding: '0 14px', borderRadius: 14, border: '1.5px solid #c9d3d2', background: '#fff', font: 'inherit' }}
          >
            <option value={0}>At the dose time</option>
            <option value={5}>5 minutes before</option>
            <option value={10}>10 minutes before</option>
            <option value={15}>15 minutes before</option>
          </select>
        </div>
        <Switch label="NexPill device sounds" description="Play a chime when the device opens." checked={settings.deviceSounds} onChange={(v) => void updateSettings({ deviceSounds: v })} />
      </Card>
      <Card aria-labelledby="share-h">
        <h2 id="share-h" className={p.h2}>Sharing & display</h2>
        <Switch label="Share updates with my caregiver" description="Your caregiver is told when a dose is missed or you report a concern." checked={settings.caregiverUpdates} onChange={(v) => void updateSettings({ caregiverUpdates: v })} />
        <Switch label="Larger text" description="Increases text size across the app." checked={settings.textSize === 'large'} onChange={(v) => void updateSettings({ textSize: v ? 'large' : 'standard' })} />
      </Card>
      <Card aria-labelledby="dev-h">
        <h2 id="dev-h" className={p.h2}>Demo tools</h2>
        <p className={p.sub} role="status">Connection: {CONN[connection]}</p>
        <div className={f.faq} />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <Button size="md" onClick={() => mockRealtime.simulateDrop()}>Simulate dropped connection</Button>
          <Button size="md" variant="danger" onClick={() => void resetDemo()}>Reset demo data</Button>
        </div>
      </Card>
    </>
  );
}
