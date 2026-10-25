import { ApiError, type PatientApi } from "../client";
import type { CareLink, Session } from "@/domain/auth";
import type {
  AppNotification,
  Caregiver,
  CaregiverMessage,
  CareTeamMessage,
  DoseOutcome,
  RefillRequest,
  Snapshot,
} from "@/domain/types";
import { daysOfSupply } from "@/domain/derive";
import { randomToken } from "./crypto";
import {
  getDb,
  newShareId,
  save,
  uid,
  wait,
  clone,
  publish,
  userName,
  type DB,
  type PatientRecord,
} from "./db";
import {
  AHMED_MEDS,
  AHMED_PLAN,
  JAMIE_MEDS,
  JAMIE_PLAN,
  NADIA_MEDS,
  NADIA_PLAN,
  buildDoses,
} from "./seed";
import { toISODate } from "@/lib/time";

export function createMockPatientApi(session: Session): PatientApi {
  const patientId = session.user.patientId;
  if (session.user.role !== "patient" || !patientId)
    throw new ApiError("Patients only.", "forbidden");

  const ctx = async () => {
    const db = await getDb();
    const rec = db.patients[patientId];
    if (!rec) throw new ApiError("Patient not found", "not-found");
    return { db, rec };
  };
  const links = (db: DB) => db.links.filter((l) => l.patientId === patientId);

  const toCaregiver = (db: DB, l: CareLink): Caregiver => {
    const n = userName(db, l.caregiverId);
    return {
      id: l.id,
      userId: l.caregiverId,
      name: n.full,
      relationship: l.relationship,
      isPrimary: l.isPrimary,
      status: l.status,
      phone: n.phone,
      notifyOn: clone(l.notifyOn),
    };
  };

  const snapshot = (db: DB, rec: PatientRecord): Snapshot => ({
    patient: {
      id: rec.id,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      phone: session.user.phone,
    },
    medications: clone(rec.medications),
    doses: clone(rec.doses),
    caregivers: links(db).map((l) => toCaregiver(db, l)),
    messages: clone(rec.messages),
    notifications: clone(rec.notifications),
    refills: clone(rec.refills),
    careTeamMessages: clone(rec.careTeamMessages),
    settings: clone(rec.settings),
    serverTime: new Date().toISOString(),
  });

  const notifyCaregivers = (
    db: DB,
    rec: PatientRecord,
    key: keyof CareLink["notifyOn"],
    kind: CaregiverMessage["kind"],
    body: string,
  ) => {
    if (!rec.settings.caregiverUpdates) return;
    for (const l of links(db).filter(
      (x) => x.status === "active" && x.notifyOn[key],
    )) {
      const message: CaregiverMessage = {
        id: uid("msg"),
        caregiverId: l.id,
        body,
        kind,
        sentAt: new Date().toISOString(),
      };
      rec.messages = [message, ...rec.messages];
      publish(patientId, { type: "caregiver.message", message }, 100);
    }
  };

  const notify = (
    rec: PatientRecord,
    n: Omit<AppNotification, "id" | "createdAt" | "read">,
  ) => {
    const notification: AppNotification = {
      ...n,
      id: uid("n"),
      createdAt: new Date().toISOString(),
      read: false,
    };
    rec.notifications = [notification, ...rec.notifications];
    publish(patientId, { type: "notification.created", notification }, 150);
  };

  const first = session.user.firstName;

  return {
    async getSnapshot() {
      await wait();
      const { db, rec } = await ctx();
      return snapshot(db, rec);
    },

    async recordDose(doseId, outcome: DoseOutcome) {
      await wait();
      const { db, rec } = await ctx();
      const dose = rec.doses.find((d) => d.id === doseId);
      if (!dose) throw new ApiError("Dose not found", "not-found");
      if (dose.status !== "upcoming")
        throw new ApiError("This dose has already been recorded", "conflict");
      const med = rec.medications.find((m) => m.id === dose.medicationId);
      const label = med ? `${med.name} ${med.strength}` : "a medication";
      dose.resolvedAt = new Date().toISOString();
      dose.source = "app";
      switch (outcome.kind) {
        case "taken":
          dose.status = "taken";
          if (med && med.pillsLeft > 0) med.pillsLeft -= 1;
          break;
        case "skipped":
          dose.status = "skipped";
          dose.note = outcome.reason;
          notifyCaregivers(
            db,
            rec,
            "missedDose",
            "missed-dose",
            `${first} skipped ${label}${outcome.reason ? `: ${outcome.reason}` : "."}`,
          );
          break;
        case "concern":
          dose.status = "concern";
          dose.note = outcome.text;
          notifyCaregivers(
            db,
            rec,
            "concern",
            "concern",
            `${first} reported a concern about ${label}: ${outcome.text}`,
          );
          notify(rec, {
            title: "Concern sent",
            body: "Your care team and caregivers were told.",
            tone: "info",
          });
          break;
      }
      save(db);
      const out = clone(dose);
      publish(patientId, { type: "dose.updated", dose: out });
      return out;
    },

    async requestRefill(medicationId): Promise<RefillRequest> {
      await wait(300);
      const { db, rec } = await ctx();
      const med = rec.medications.find((m) => m.id === medicationId);
      if (!med) throw new ApiError("Medication not found", "not-found");
      const existing = rec.refills.find(
        (r) => r.medicationId === medicationId && r.status !== "collected",
      );
      if (existing)
        throw new ApiError(
          `A refill for ${med.name} is already ${existing.status}`,
          "conflict",
        );
      const refill: RefillRequest = {
        id: uid("rf"),
        medicationId,
        requestedAt: new Date().toISOString(),
        status: "requested",
      };
      rec.refills = [refill, ...rec.refills];
      notifyCaregivers(
        db,
        rec,
        "refill",
        "refill",
        `${first} requested a refill of ${med.name} (${daysOfSupply(med)} days left).`,
      );
      save(db);
      publish(patientId, { type: "refill.updated", refill });
      setTimeout(() => {
        const r = rec.refills.find((x) => x.id === refill.id);
        if (!r) return;
        r.status = "ready";
        notify(rec, {
          title: "Refill ready",
          body: `${med.name} is ready to collect.`,
          tone: "success",
        });
        save(db);
        publish(patientId, { type: "refill.updated", refill: clone(r) }, 0);
      }, 8000);
      return clone(refill);
    },

    async sendCaregiverUpdate(linkId, body): Promise<CaregiverMessage> {
      await wait();
      const { db, rec } = await ctx();
      const link = links(db).find(
        (l) => l.id === linkId && l.status === "active",
      );
      if (!link) throw new ApiError("Caregiver not found", "not-found");
      const trimmed = body.trim();
      if (!trimmed) throw new ApiError("Write a message first", "invalid");
      const message: CaregiverMessage = {
        id: uid("msg"),
        caregiverId: link.id,
        body: trimmed,
        kind: "update",
        sentAt: new Date().toISOString(),
      };
      rec.messages = [message, ...rec.messages];
      save(db);
      publish(patientId, { type: "caregiver.message", message }, 100);
      return clone(message);
    },

    async sendCareTeamMessage(subject, body): Promise<CareTeamMessage> {
      await wait(300);
      const { db, rec } = await ctx();
      if (!body.trim()) throw new ApiError("Write a message first", "invalid");
      const msg: CareTeamMessage = {
        id: uid("ct"),
        subject: subject.trim() || "Medication question",
        body: body.trim(),
        sentAt: new Date().toISOString(),
      };
      rec.careTeamMessages = [msg, ...rec.careTeamMessages];
      save(db);
      return clone(msg);
    },

    async markNotificationsRead(ids) {
      await wait(60);
      const { db, rec } = await ctx();
      rec.notifications = rec.notifications.map((n) =>
        !ids || ids.includes(n.id) ? { ...n, read: true } : n,
      );
      save(db);
    },

    async updateSettings(patch) {
      await wait(60);
      const { db, rec } = await ctx();
      rec.settings = { ...rec.settings, ...patch };
      save(db);
      return clone(rec.settings);
    },

    async getShareId() {
      await wait(80);
      const { rec } = await ctx();
      return rec.shareId;
    },

    async regenerateShareId() {
      await wait(200);
      const { db, rec } = await ctx();
      rec.shareId = newShareId(db); // old ID stops working; existing caregivers stay linked
      save(db);
      return rec.shareId;
    },

    async removeCaregiver(linkId) {
      await wait(200);
      const { db } = await ctx();
      const link = links(db).find((l) => l.id === linkId);
      if (!link) throw new ApiError("Caregiver not found", "not-found");
      db.links = db.links.filter((l) => l.id !== linkId);
      if (link.isPrimary) {
        const next = links(db).find((l) => l.status === "active");
        if (next) next.isPrimary = true;
      }
      save(db);
      publish(patientId, {
        type: "link.updated",
        link: clone(link),
        removed: true,
      });
    },

    async loadSamplePlan() {
      await wait(250);
      const { db, rec } = await ctx();
      rec.medications = clone(JAMIE_MEDS);
      rec.doses = buildDoses(JAMIE_MEDS, JAMIE_PLAN);
      rec.demo = "jamie";
      rec.seedDay = toISODate(new Date());
      save(db);
      return snapshot(db, rec);
    },

    async resetDemo() {
      await wait(150);
      const { db, rec } = await ctx();
      if (rec.demo) {
        const [meds, plan] =
          rec.demo === "ahmed"
            ? [AHMED_MEDS, AHMED_PLAN]
            : rec.demo === "nadia"
              ? [NADIA_MEDS, NADIA_PLAN]
              : [JAMIE_MEDS, JAMIE_PLAN];
        rec.medications = clone(meds);
        rec.doses = buildDoses(meds, plan);
      }
      rec.messages = [];
      rec.refills = [];
      rec.careTeamMessages = [];
      save(db);
      return snapshot(db, rec);
    },
  };
}
export { randomToken };
