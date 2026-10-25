import { PageHeader } from '@/components/layout/PageHeader';
import { dosesOn } from '@/domain/derive';
import {
  AdherenceCard, CaregiverCard, HelpCard, NextDoseCard, ProgressCard, RefillCard, ScheduleCard,
} from '@/features/overview/cards';
import s from '@/features/overview/Overview.module.css';
import { formatLongDate, greeting } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import p from '@/components/ui/Page.module.css';
import { usePatientActions, usePatientData } from '@/state/PatientStore';

export default function Overview() {
  const data = usePatientData();
  const { now, today } = useNow();
  const todays = dosesOn(data.doses, today);
  const primary = data.caregivers.find((c) => c.isPrimary && c.status === 'active');
  const first = primary?.name.split(' ')[0];
  const { loadSamplePlan } = usePatientActions();
  if (data.medications.length === 0) {
    return (
      <>
        <PageHeader eyebrow={formatLongDate(now)} title={`${greeting(now)}, ${data.patient.firstName}`} subtitle="Welcome to NexPill. Your plan is empty for now." />
        <Card aria-labelledby="empty-h">
          <h2 id="empty-h" className={p.h2}>No medications yet</h2>
          <p className={p.sub}>Your care team or caregiver adds your medications, and they will appear here with reminders. Meanwhile, you can invite a caregiver from “My caregivers”.</p>
          <div style={{ marginTop: 20 }}>
            <Button size="md" variant="primary" onClick={() => void loadSamplePlan()}>Load a sample plan (demo)</Button>
          </div>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(now)}
        title={`${greeting(now)}, ${data.patient.firstName}`}
        subtitle={first ? `Here is your medication plan for today. ${first} can see your updates.` : 'Here is your medication plan for today.'}
      />
      <div className={s.grid}>
        <div className={s.left}>
          <ProgressCard todays={todays} />
          <NextDoseCard todays={todays} meds={data.medications} />
          <ScheduleCard todays={todays} meds={data.medications} now={now} />
        </div>
        <div className={s.right}>
          <AdherenceCard data={data} today={today} now={now} />
          <RefillCard data={data} />
          {primary && <CaregiverCard caregiver={primary} data={data} />}
          <HelpCard />
        </div>
      </div>
    </>
  );
}
