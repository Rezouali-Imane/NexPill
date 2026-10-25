import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusTag } from "@/components/ui/StatusTag";
import p from "@/components/ui/Page.module.css";
import { useAuth } from "@/auth/AuthContext";
import { insights, timeline } from "@/domain/caregiver";
import { InsightsCard, initials } from "@/features/caregiver/cards";
import cs from "@/features/caregiver/Caregiver.module.css";
import { useCaregiverData } from "@/caregiver/CaregiverStore";
import { mockRealtime } from "@/api";
import { useNow } from "@/lib/useNow";
import { useUi } from "@/state/UiStore";
import { STATE_LABEL } from "@/domain/status";
import { DoseStatusTagFromState } from "./util";
import { CaregiverBell } from "./Dashboard";

export function InsightsPage() {
  const { now } = useNow();
  const d = useCaregiverData(now);
  return (
    <>
      <PageHeader
        title="Insights"
        subtitle="Habits and risk for every patient"
        showHelp={false}
        bell={<CaregiverBell count={d.unseen.length} />}
      />
      {d.patients.length === 0 ? (
        <Card>
          <p className={p.empty}>Connect a patient to see insights.</p>
        </Card>
      ) : (
        <div className={p.two}>
          {d.patients.map((v) => (
            <div key={v.patient.id}>
              <h2 className={p.h2} style={{ marginBottom: 14 }}>
                {v.patient.firstName} {v.patient.lastName}
              </h2>
              <InsightsCard view={v} today={d.today} now={now} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function SchedulePage() {
  const { now } = useNow();
  const d = useCaregiverData(now);
  const rows = d.patients
    .flatMap((v) => timeline(v, d.today, now).map((t) => ({ v, t })))
    .sort((a, b) => a.t.dose.time.localeCompare(b.t.dose.time));
  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="Today's doses for all your patients"
        showHelp={false}
        bell={<CaregiverBell count={d.unseen.length} />}
      />
      <Card aria-labelledby="sc-h">
        <h2 id="sc-h" className={p.h2}>
          Today
        </h2>
        {rows.length === 0 ? (
          <p className={p.empty}>No doses scheduled today.</p>
        ) : (
          <ul className={p.list} style={{ marginTop: 12 }}>
            {rows.map(({ v, t }) => (
              <li key={`${v.patient.id}-${t.dose.id}`} className={p.item}>
                <span className={cs.avatar} aria-hidden="true">
                  {initials(v)}
                </span>
                <span
                  style={{ width: 70, fontWeight: 600, fontSize: "1.25rem" }}
                >
                  {t.dose.time}
                </span>
                <span className={p.grow}>
                  <b>
                    {t.name} {t.strength}
                  </b>
                  <span>
                    {v.patient.firstName} {v.patient.lastName} · {t.detail}
                  </span>
                </span>
                <DoseStatusTagFromState
                  state={t.state}
                  label={STATE_LABEL[t.state]}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export function ComingSoon({
  title,
  text,
  icon,
}: {
  title: string;
  text: string;
  icon: "shield" | "device";
}) {
  const { now } = useNow();
  const d = useCaregiverData(now);
  return (
    <>
      <PageHeader
        title={title}
        showHelp={false}
        bell={<CaregiverBell count={d.unseen.length} />}
      />
      <Card aria-labelledby="cs-h">
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <span className={cs.insIcon}>
            <Icon name={icon} />
          </span>
          <div>
            <h2 id="cs-h" className={p.h2}>
              Coming in the next release
            </h2>
            <p className={p.sub}>{text}</p>
          </div>
        </div>
      </Card>
    </>
  );
}

export function CaregiverHelp() {
  const { now } = useNow();
  const d = useCaregiverData(now);
  const FAQ = [
    [
      "How does a patient get alerted?",
      "NexPill sends a reminder at the dose time and a second one after 15 minutes. If there is still no confirmation after 30 minutes you are alerted. After 60 minutes the dose is marked missed.",
    ],
    [
      'What does "late" mean?',
      "A dose confirmed more than 30 minutes after its scheduled time. It counts as taken but is shown as late.",
    ],
    [
      "Why am I seeing a risk level?",
      'It is based on missed and late doses in the last 7 to 14 days. "Why am I getting this alert?" on the dashboard lists the exact reasons. It describes habits and is not medical advice.',
    ],
    [
      "How do I add another patient?",
      "Ask them for their NexPill ID (My caregivers → Your NexPill ID), then enter it under Patients → Add a patient. You see their updates straight away and they are notified.",
    ],
  ];
  return (
    <>
      <PageHeader
        title="Help & support"
        subtitle="How NexPill alerts and risk levels work"
        showHelp={false}
        bell={<CaregiverBell count={d.unseen.length} />}
      />
      <Card aria-labelledby="cf-h">
        <h2 id="cf-h" className={p.h2}>
          Common questions
        </h2>
        <div style={{ marginTop: 12 }}>
          {FAQ.map(([q, a]) => (
            <details
              key={q}
              style={{
                borderTop: "1px solid var(--nx-line)",
                padding: "6px 0",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "1.1875rem",
                  minHeight: 52,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {q}
              </summary>
              <p style={{ color: "var(--nx-muted-strong)", paddingBottom: 16 }}>
                {a}
              </p>
            </details>
          ))}
        </div>
      </Card>
    </>
  );
}

export function CaregiverSettings() {
  const { now } = useNow();
  const d = useCaregiverData(now);
  const { session, signOut } = useAuth();
  const { connection } = useUi();
  const u = session?.user;
  const risk = d.patients
    .map((v) => `${v.patient.firstName}: ${insights(v, d.today, now).level}`)
    .join(" · ");
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your account"
        showHelp={false}
        bell={<CaregiverBell count={d.unseen.length} />}
      />
      <Card aria-labelledby="ca-h">
        <h2 id="ca-h" className={p.h2}>
          Account
        </h2>
        <p className={p.sub}>
          {u?.firstName} {u?.lastName} · {u?.email}
          {u?.phone ? ` · ${u.phone}` : ""}
        </p>
        <div style={{ marginTop: 16 }}>
          <Button size="md" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Card>
      <Card aria-labelledby="cd-h">
        <h2 id="cd-h" className={p.h2}>
          Demo tools
        </h2>
        <p className={p.sub} role="status">
          Connection: {connection === "open" ? "Live updates on" : connection}
        </p>
        <p className={p.sub}>{risk}</p>
        <div style={{ marginTop: 16 }}>
          <Button size="md" onClick={() => mockRealtime.simulateDrop()}>
            Simulate dropped connection
          </Button>
        </div>
        <p className={p.sub} style={{ marginTop: 12 }}>
          Notification preferences and escalation rules arrive with the next
          release.
        </p>
      </Card>
    </>
  );
}

export { StatusTag };
