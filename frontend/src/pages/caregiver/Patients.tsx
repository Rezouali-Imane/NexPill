import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import p from "@/components/ui/Page.module.css";
import { RELATIONSHIPS } from "@/domain/auth";
import { adherence } from "@/domain/derive";
import { todaySummary, type PatientView } from "@/domain/caregiver";
import { ConfirmDialog } from "@/features/dialogs/ConfirmDialog";
import { RiskTag, initials } from "@/features/caregiver/cards";
import cs from "@/features/caregiver/Caregiver.module.css";
import {
  useCaregiverActions,
  useCaregiverData,
} from "@/caregiver/CaregiverStore";
import { useNow } from "@/lib/useNow";
import { useUi } from "@/state/UiStore";
import { CaregiverBell } from "./Dashboard";

function AddPatient({ autoFocus }: { autoFocus: boolean }) {
  const { linkPatient } = useCaregiverActions();
  const { toast, announce } = useUi();
  const [code, setCode] = useState("");
  const [rel, setRel] = useState("");
  const [errors, setErrors] = useState<{ code?: string; rel?: string }>({});
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!code.trim()) errs.code = "Enter the NexPill ID the patient gave you.";
    if (!rel) errs.rel = "Choose your relationship to the patient.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const r = await linkPatient(code, rel);
    setBusy(false);
    if (r.ok) {
      setCode("");
      setRel("");
      toast("success", "Connected. You can now see their updates.");
      announce("Connected to the patient.");
    } else setErrors({ code: r.error });
  };
  return (
    <Card aria-labelledby="add-h" id="add">
      <h2 id="add-h" className={p.h2}>
        Add a patient
      </h2>
      <p className={p.sub}>
        Ask the patient for their NexPill ID (My caregivers → Your NexPill ID).
        Once you enter it, you see their updates straight away and they are
        notified.
      </p>
      <form
        onSubmit={(e) => void submit(e)}
        noValidate
        style={{ display: "grid", gap: 18, marginTop: 20 }}
      >
        <FormField
          label="Patient's NexPill ID"
          placeholder="NX-ABCD2345"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={code}
          error={errors.code}
          autoFocus={autoFocus}
          onChange={(e) => {
            setCode(e.target.value);
            setErrors({});
          }}
        />
        <div>
          <label
            htmlFor="rel"
            style={{
              fontWeight: 600,
              fontSize: "1.0625rem",
              display: "block",
              marginBottom: 6,
            }}
          >
            Your relationship to them
          </label>
          <select
            id="rel"
            value={rel}
            aria-invalid={!!errors.rel || undefined}
            onChange={(e) => {
              setRel(e.target.value);
              setErrors({});
            }}
            style={{
              width: "100%",
              minHeight: 56,
              fontSize: "1.125rem",
              padding: "0 14px",
              borderRadius: 14,
              border: "1.5px solid #c9d3d2",
              background: "#fff",
              font: "inherit",
            }}
          >
            <option value="">Choose…</option>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {errors.rel && (
            <p
              role="alert"
              style={{
                color: "var(--nx-concern-ink)",
                fontWeight: 600,
                marginTop: 6,
              }}
            >
              {errors.rel}
            </p>
          )}
        </div>
        <div>
          <Button type="submit" variant="primary" size="md" loading={busy}>
            Connect
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function Patients() {
  const { now } = useNow();
  const d = useCaregiverData(now);
  const { unlinkPatient } = useCaregiverActions();
  const [params] = useSearchParams();
  const [removing, setRemoving] = useState<PatientView | null>(null);
  const welcome = params.get("welcome") === "1";
  return (
    <>
      <PageHeader
        title="Patients"
        subtitle="The people you care for"
        showHelp={false}
        bell={<CaregiverBell count={d.unseen.length} />}
      />
      {welcome && d.patients.length === 0 && (
        <p
          className={cs.banner}
          role="status"
          style={{
            background: "var(--nx-success-bg)",
            borderColor: "var(--nx-success-bg)",
            color: "var(--nx-success-ink)",
            fontWeight: 600,
            fontSize: "1.125rem",
          }}
        >
          Your account is ready. The last step: enter your patient's NexPill ID
          below.
        </p>
      )}
      <div className={p.two}>
        <div className={p.stack}>
          {d.patients.length === 0 && (
            <Card>
              <p className={p.empty}>You are not following any patients yet.</p>
            </Card>
          )}
          {d.patients.map((v) => {
            const sum = todaySummary(v, d.today, now);
            return (
              <Card
                key={v.patient.id}
                as="article"
                aria-label={`${v.patient.firstName} ${v.patient.lastName}`}
              >
                <div className={p.item} style={{ borderTop: 0, padding: 0 }}>
                  <span className={cs.avatar} aria-hidden="true">
                    {initials(v)}
                  </span>
                  <span className={p.grow}>
                    <b>
                      {v.patient.firstName} {v.patient.lastName}
                    </b>
                    <span>
                      {v.link.relationship}
                      {v.link.isPrimary ? " · Primary caregiver" : ""}
                    </span>
                  </span>
                  <RiskTag level={d.risk.get(v.patient.id) ?? "stable"} />
                </div>
                <div className={cs.tiles}>
                  <div className={cs.tile}>
                    <b>{adherence(v.doses, d.today, 30, now)}%</b>
                    <strong>30-day adherence</strong>
                  </div>
                  <div className={cs.tile}>
                    <b>
                      {sum.taken}/{sum.scheduled}
                    </b>
                    <strong>Today</strong>
                    <span>
                      {sum.nextTime ? `Next ${sum.nextTime}` : "Done for today"}
                    </span>
                  </div>
                  <div className={cs.tile}>
                    <b>{v.medications.length}</b>
                    <strong>Medications</strong>
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <Button
                    size="md"
                    variant="danger"
                    onClick={() => setRemoving(v)}
                  >
                    Stop following
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
        <AddPatient autoFocus={params.get("add") === "1" || welcome} />
      </div>
      {removing && (
        <ConfirmDialog
          open
          danger
          title={`Stop following ${removing.patient.firstName}?`}
          confirmLabel="Stop following"
          onClose={() => setRemoving(null)}
          description="You will no longer see their medication updates. You can follow them again later with their ID."
          onConfirm={() => unlinkPatient(removing.link.id)}
        />
      )}
    </>
  );
}
