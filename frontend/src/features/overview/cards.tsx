import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { DoseStatusTag, StatusTag } from "@/components/ui/StatusTag";
import {
  lowestSupply,
  nextDose,
  progress,
  weekBars,
  adherence,
} from "@/domain/derive";
import { medById } from "@/domain/labels";
import { doseState } from "@/domain/status";
import type { Caregiver, Dose, Medication, Snapshot } from "@/domain/types";
import { formatClock, formatRelative } from "@/lib/time";
import { usePatientActions, usePatientState } from "@/state/PatientStore";
import {
  CallDialog,
  CareTeamDialog,
  RefillDialog,
  SendUpdateDialog,
} from "@/features/dialogs/ContactDialogs";
import { ConcernDialog, SkipDialog } from "@/features/dialogs/DoseDialogs";
import s from "./Overview.module.css";

export function ProgressCard({ todays }: { todays: Dose[] }) {
  const p = progress(todays);
  const complete = p.total > 0 && p.remaining === 0;
  return (
    <Card tone="info" className={s.progress} aria-labelledby="progress-h">
      <div className={s.progressText}>
        <Eyebrow>Today's progress</Eyebrow>
        <h2 id="progress-h" className={s.h2}>
          {complete
            ? "All doses completed"
            : `${p.done} of ${p.total} doses completed`}
        </h2>
        <p className={s.lead}>
          {complete
            ? "Nothing left to take today."
            : `${p.remaining} ${p.remaining === 1 ? "dose" : "doses"} remaining today`}
        </p>
        <div
          className={s.track}
          role="progressbar"
          aria-label="Daily progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={p.percent}
          aria-valuetext={`${p.done} of ${p.total} doses, ${p.percent} percent`}
        >
          <div className={s.fill} style={{ width: `${p.percent}%` }} />
        </div>
        <div className={s.meta}>
          <span>Daily progress</span>
          <b>{p.percent}%</b>
        </div>
      </div>
      <div className={s.badge}>
        <div className={s.badgeIcon}>
          <Icon name={complete ? "check" : "pill"} size={34} />
        </div>
        <span>{complete ? "Well done" : "Stay on track"}</span>
      </div>
    </Card>
  );
}

export function NextDoseCard({
  todays,
  meds,
}: {
  todays: Dose[];
  meds: Medication[];
}) {
  const { recordDose } = usePatientActions();
  const { pending } = usePatientState();
  const [dialog, setDialog] = useState<"skip" | "concern" | null>(null);
  const dose = nextDose(todays);
  const med = dose ? medById(meds, dose.medicationId) : undefined;

  if (!dose || !med) {
    return (
      <Card className={s.next} aria-labelledby="next-h">
        <Eyebrow>Up next</Eyebrow>
        <h2 id="next-h" className={s.h3}>
          You are all done for today
        </h2>
        <div className={s.done}>
          <Icon name="circleCheck" size={30} />
          Every dose for today has been recorded. See you tomorrow.
        </div>
      </Card>
    );
  }
  const busy = pending.includes(dose.id);
  return (
    <Card className={s.next} aria-labelledby="next-h">
      <div className={s.nextHead}>
        <div>
          <Eyebrow>Up next</Eyebrow>
          <h2 id="next-h" className={s.h3}>
            Your next medication
          </h2>
        </div>
        <div className={s.time}>
          <Icon name="clock" size={20} />
          <time>{formatClock(dose.time)}</time>
        </div>
      </div>
      <div className={s.med}>
        <div className={s.medIcon}>
          <Icon name="pill" />
        </div>
        <div className={s.medName}>
          <h3>{med.name}</h3>
          <p>
            {med.strength} {med.form}
          </p>
        </div>
        <dl className={s.facts}>
          <div className={s.fact}>
            <dt>Instructions</dt>
            <dd>{med.instructions}</dd>
          </div>
          <div className={s.fact}>
            <dt>Prescribed by</dt>
            <dd>{med.prescriber}</dd>
          </div>
        </dl>
      </div>
      <Callout label="Important:">{med.important}</Callout>
      <div className={s.actions}>
        <Button
          variant="primary"
          loading={busy}
          icon={<Icon name="check" />}
          onClick={() => void recordDose(dose, { kind: "taken" })}
          aria-label={`Mark ${med.name} ${med.strength} as taken`}
        >
          Mark as taken
        </Button>
        <Button disabled={busy} onClick={() => setDialog("skip")}>
          Skip for now
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => setDialog("concern")}
        >
          I have a concern
        </Button>
      </div>
      <SkipDialog
        dose={dose}
        med={med}
        open={dialog === "skip"}
        onClose={() => setDialog(null)}
      />
      <ConcernDialog
        dose={dose}
        med={med}
        open={dialog === "concern"}
        onClose={() => setDialog(null)}
      />
    </Card>
  );
}

export function ScheduleCard({
  todays,
  meds,
  now,
}: {
  todays: Dose[];
  meds: Medication[];
  now: Date;
}) {
  const next = nextDose(todays);
  return (
    <Card aria-labelledby="sched-h">
      <div className={s.schedHead}>
        <div>
          <h2 id="sched-h" className={s.h3l}>
            Today's schedule
          </h2>
          <p className={s.sub}>All medications planned for today</p>
        </div>
        <Link to="/patient/schedule" className={s.textLink}>
          View full schedule <Icon name="chevron" size={18} />
        </Link>
      </div>
      <ul className={s.rows}>
        {todays.map((d) => {
          const med = medById(meds, d.medicationId);
          const st = doseState(d, now);
          const cls =
            st === "taken"
              ? s.dotTaken
              : st === "concern" || st === "missed"
                ? s.dotConcern
                : st === "skipped" || st === "late" || st === "overdue"
                  ? s.dotWarn
                  : "";
          return (
            <li key={d.id} className={s.row}>
              <Link
                to={`/patient/medications#${d.medicationId}`}
                className={s.rowLink}
              >
                <span className={[s.dot, cls].join(" ")}>
                  <Icon
                    name={
                      st === "taken" || st === "late"
                        ? "check"
                        : st === "upcoming" || st === "due"
                          ? "clock"
                          : "alert"
                    }
                  />
                </span>
                <span className={s.rtime}>{formatClock(d.time)}</span>
                <span className={s.rname}>
                  <b>{med?.name}</b>
                  <span>{med?.strength}</span>
                </span>
                <DoseStatusTag dose={d} now={now} isNext={next?.id === d.id} />
                <Icon name="chevron" size={20} className={s.chev} />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function AdherenceCard({
  data,
  today,
  now,
}: {
  data: Snapshot;
  today: string;
  now: Date;
}) {
  const pct = adherence(data.doses, today, 30, now);
  const bars = weekBars(data.doses, today, now);
  const message =
    pct >= 90
      ? "Excellent work. You are building a healthy routine."
      : pct >= 75
        ? "Good progress. A few more doses will build a steadier routine."
        : "Let us find what is getting in the way. Your care team can help.";
  return (
    <Card className={s.adh} aria-labelledby="adh-h">
      <div className={s.adhHead}>
        <div>
          <Eyebrow>This week</Eyebrow>
          <h2 id="adh-h" className={s.h3m}>
            Your adherence
          </h2>
        </div>
        <div className={s.trend}>
          <Icon name="trend" />
        </div>
      </div>
      <p className={s.stat} aria-label={`${pct} percent`}>
        <b aria-hidden="true">{pct}</b>
        <span aria-hidden="true">%</span>
      </p>
      <p className={s.msg}>{message}</p>
      <ul className={s.chart} aria-label="Doses taken each day this week">
        {bars.map((b, i) => (
          <li
            key={i}
            className={s.chartCol}
            aria-label={
              b.value === null
                ? `${b.date}: no data yet`
                : `${b.date}: ${b.taken} of ${b.total} doses taken`
            }
          >
            <div
              className={[s.bar, b.value === null ? s.barOff : ""].join(" ")}
              style={
                b.value === null
                  ? undefined
                  : { height: `${Math.max(b.value, 0.05) * 100}%` }
              }
            />
          </li>
        ))}
      </ul>
      <ul className={s.labels} aria-hidden="true">
        {bars.map((b, i) => (
          <li key={i}>{b.label}</li>
        ))}
      </ul>
    </Card>
  );
}

export function RefillCard({ data }: { data: Snapshot }) {
  const [open, setOpen] = useState(false);
  const low = lowestSupply(data);
  if (!low) return null;
  const { med, days } = low;
  const request = data.refills.find(
    (r) => r.medicationId === med.id && r.status !== "collected",
  );
  return (
    <Card tone="refill" className={s.refill} aria-labelledby="refill-h">
      <div className={s.refillIcon}>
        <Icon name="pill" />
      </div>
      <div className={s.refillBody}>
        <h2 id="refill-h" className={s.h3m} style={{ marginTop: 0 }}>
          Refill reminder
        </h2>
        <p>
          {med.name} has approximately{" "}
          <strong>
            {days} {days === 1 ? "day" : "days"}
          </strong>{" "}
          remaining.
        </p>
        {request ? (
          <p className={s.status}>
            <Icon name="circleCheck" size={20} />
            {request.status === "ready"
              ? "Ready to collect"
              : "Refill requested"}
          </p>
        ) : (
          <button
            type="button"
            className={s.refillBtn}
            onClick={() => setOpen(true)}
          >
            <span>Manage refill</span>
            <Icon name="chevron" size={18} />
          </button>
        )}
      </div>
      <RefillDialog med={med} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

export function CaregiverCard({
  caregiver,
  data,
}: {
  caregiver: Caregiver;
  data: Snapshot;
}) {
  const [dialog, setDialog] = useState<"call" | "update" | null>(null);
  const first = caregiver.name.split(" ")[0] ?? caregiver.name;
  const last = data.messages.find(
    (m) => m.caregiverId === caregiver.id && m.kind === "update",
  );
  return (
    <Card className={s.cg} aria-labelledby="cg-h">
      <div className={s.cgTop}>
        <div className={s.cgIcon}>
          <Icon name="users" />
        </div>
        <div className={s.cgName}>
          <small>CONNECTED CAREGIVER</small>
          <h2 id="cg-h" className={s.cgTitle}>
            {caregiver.name}
          </h2>
        </div>
        <StatusTag tone="success" compact>
          Active
        </StatusTag>
      </div>
      <p className={s.rel}>
        {caregiver.relationship} ·{" "}
        {caregiver.isPrimary ? "Primary caregiver" : "Caregiver"}
      </p>
      <div className={s.note}>
        <Icon name="check" size={18} />
        <p>
          The caregiver receives an update if a dose is missed or you report a
          concern.
        </p>
      </div>
      {last && (
        <p className={s.ack}>
          <Icon name="check" size={16} />
          {last.acknowledgedAt
            ? `${first} saw your update ${formatRelative(last.acknowledgedAt)}`
            : "Update sent. Waiting for her to see it."}
        </p>
      )}
      <div className={s.cgActions}>
        <Button
          size="stack"
          variant="primary"
          icon={<Icon name="phone" size={20} />}
          onClick={() => setDialog("call")}
        >
          Call {first}
        </Button>
        <Button size="stack" onClick={() => setDialog("update")}>
          Send update
        </Button>
      </div>
      <CallDialog
        caregiver={caregiver}
        open={dialog === "call"}
        onClose={() => setDialog(null)}
      />
      <SendUpdateDialog
        caregiver={caregiver}
        open={dialog === "update"}
        onClose={() => setDialog(null)}
      />
    </Card>
  );
}

export function HelpCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card className={s.help} aria-labelledby="help-h">
      <div className={s.helpHead}>
        <Icon name="help" size={30} />
        <h2 id="help-h">Need help with a medication?</h2>
      </div>
      <p>
        Call your caregiver, care team, or pharmacist before making changes.
      </p>
      <button type="button" className={s.helpBtn} onClick={() => setOpen(true)}>
        Contact care team
      </button>
      <CareTeamDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
