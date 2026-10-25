import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import {
  useCaregiverActions,
  useCaregiverData,
  useCaregiverState,
} from "@/caregiver/CaregiverStore";
import {
  ActivityCard,
  AttentionBanner,
  DaySummary,
  InsightsCard,
  LiveStatus,
  PatientSwitcher,
  TimelineCard,
  WeekCard,
} from "@/features/caregiver/cards";
import s from "@/features/caregiver/Caregiver.module.css";
import { formatLongDate } from "@/lib/time";
import { useNow } from "@/lib/useNow";

export function CaregiverBell({ count }: { count: number }) {
  return (
    <Link
      to="/caregiver/alerts"
      className={s.bellLink}
      aria-label={count ? `Alerts, ${count} new` : "Alerts, none new"}
    >
      <Icon name="bell" />
      {count > 0 && <span className={s.bellDot} aria-hidden="true" />}
    </Link>
  );
}

export default function Dashboard() {
  const { now } = useNow();
  const { session } = useAuth();
  const state = useCaregiverState();
  const { select } = useCaregiverActions();
  const d = useCaregiverData(now);
  const first = session?.user.firstName ?? "";
  const hour = now.getHours();
  const greet =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const n = d.patients.length;
  const attn = d.needAttention.length;
  const sub =
    n === 0
      ? `${greet}, ${first}. You are not following any patients yet.`
      : attn === 0
        ? `${greet}, ${first}. All ${n} of your ${n === 1 ? "patient is" : "patients are"} doing well.`
        : `${greet}, ${first}. ${attn} of your ${n} ${n === 1 ? "patient needs" : "patients need"} attention.`;

  const header = (
    <PageHeader
      eyebrow={formatLongDate(now)}
      title="Caregiver dashboard"
      subtitle={sub}
      showHelp={false}
      actions={<LiveStatus lastUpdated={state.lastUpdated} />}
      bell={<CaregiverBell count={d.unseen.length} />}
    />
  );

  if (!d.selected) {
    return (
      <>
        {header}
        <Card aria-labelledby="none-h">
          <h2 id="none-h" className={s.h2}>
            Connect to your first patient
          </h2>
          <p className={s.sub}>
            Ask the patient to open <b>My caregivers</b> in their NexPill app
            and find their NexPill ID. Enter it here and you will see their
            updates straight away.
          </p>
          <div style={{ marginTop: 20 }}>
            <Link to="/caregiver/patients?add=1">
              <Button size="md" variant="primary" tabIndex={-1}>
                Enter a patient ID
              </Button>
            </Link>
          </div>
        </Card>
      </>
    );
  }

  const v = d.selected;
  return (
    <>
      {header}
      <PatientSwitcher
        patients={d.patients}
        selectedId={v.patient.id}
        risk={d.risk}
        now={now}
        today={d.today}
        onSelect={select}
      />
      <div className={s.grid}>
        <div className={s.col}>
          <AttentionBanner
            view={v}
            today={d.today}
            now={now}
            caregiverFirst="you"
          />
          <DaySummary view={v} today={d.today} now={now} />
          <TimelineCard view={v} today={d.today} now={now} />
          <WeekCard view={v} today={d.today} now={now} />
          <ActivityCard
            view={v}
            today={d.today}
            now={now}
            caregiverFirst="you"
          />
        </div>
        <div className={s.side}>
          <InsightsCard key={v.patient.id} view={v} today={d.today} now={now} />
        </div>
      </div>
    </>
  );
}
