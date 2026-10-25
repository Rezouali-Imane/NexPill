import {
  ApiError,
  type CaregiverApi,
  type CaregiverDashboard,
} from "../client";
import type { CareLink, Session } from "@/domain/auth";
import { RELATIONSHIPS } from "@/domain/auth";
import type { PatientView } from "@/domain/caregiver";
import { clone, getDb, publish, save, uid, wait, type DB } from "./db";

export function createMockCaregiverApi(session: Session): CaregiverApi {
  if (session.user.role !== "caregiver")
    throw new ApiError("Caregivers only.", "forbidden");
  const me = session.user.id;

  const mine = (db: DB) => db.links.filter((l) => l.caregiverId === me);

  const view = (db: DB, link: CareLink): PatientView | null => {
    const rec = db.patients[link.patientId];
    const user = db.users.find((u) => u.patientId === link.patientId);
    if (!rec || !user) return null;
    return {
      link: clone(link),
      patient: {
        id: rec.id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
      },
      medications: clone(rec.medications),
      doses: clone(rec.doses),
      messages: clone(rec.messages.filter((m) => m.caregiverId === link.id)),
      serverTime: new Date().toISOString(),
    };
  };

  return {
    async getDashboard(): Promise<CaregiverDashboard> {
      await wait();
      const db = await getDb();
      const active = mine(db).filter((l) => l.status === "active");
      const patients = active
        .map((l) => view(db, l))
        .filter((v): v is PatientView => !!v);
      return {
        patients,
        acknowledgedAlerts: [...(db.acks[me] ?? [])],
      };
    },

    async linkPatient(shareId, relationship) {
      await wait(300);
      const db = await getDb();
      if (!(RELATIONSHIPS as readonly string[]).includes(relationship))
        throw new ApiError(
          "Choose your relationship to the patient.",
          "invalid",
          "relationship",
        );
      // Throttle guessing: 5 wrong IDs in a row locks this caregiver for 15 minutes.
      const fkey = `link:${me}`;
      const f = db.failures[fkey];
      if (f && f.until > Date.now())
        throw new ApiError(
          "Too many attempts. Please try again in a few minutes.",
          "rate-limited",
          "code",
        );
      const key = shareId.trim().toUpperCase().replace(/\s+/g, "");
      const rec = Object.values(db.patients).find((p) => p.shareId === key);
      // One generic message so IDs cannot be probed.
      if (!rec) {
        const count = (f?.count ?? 0) + 1;
        db.failures[fkey] = {
          count,
          until: count >= 5 ? Date.now() + 15 * 60_000 : 0,
        };
        save(db);
        throw new ApiError(
          "We could not find a patient with that ID. Check it with the patient.",
          "invalid",
          "code",
        );
      }
      delete db.failures[fkey];
      if (mine(db).some((l) => l.patientId === rec.id))
        throw new ApiError(
          "You are already following this patient.",
          "conflict",
          "code",
        );
      const link: CareLink = {
        id: uid("l"),
        caregiverId: me,
        patientId: rec.id,
        relationship,
        status: "active",
        isPrimary: !db.links.some((l) => l.patientId === rec.id && l.isPrimary),
        notifyOn: { missedDose: true, concern: true, refill: true },
        createdAt: new Date().toISOString(),
      };
      db.links.push(link);
      const n = {
        id: uid("n"),
        title: "New caregiver connected",
        body: `${session.user.firstName} ${session.user.lastName} (${relationship}) can now see your updates. Not right? Remove them in My caregivers.`,
        createdAt: new Date().toISOString(),
        read: false,
        tone: "warning" as const,
      };
      rec.notifications = [n, ...rec.notifications];
      save(db);
      publish(rec.id, { type: "notification.created", notification: n }, 100);
      publish(rec.id, { type: "link.updated", link: clone(link) });
      return clone(link);
    },

    async unlinkPatient(linkId) {
      await wait(200);
      const db = await getDb();
      const link = mine(db).find((l) => l.id === linkId);
      if (!link) throw new ApiError("Patient not found", "not-found");
      db.links = db.links.filter((l) => l.id !== linkId);
      save(db);
      publish(link.patientId, {
        type: "link.updated",
        link: clone(link),
        removed: true,
      });
    },

    async markMessagesSeen(patientId) {
      await wait(60);
      const db = await getDb();
      const link = mine(db).find(
        (l) => l.patientId === patientId && l.status === "active",
      );
      const rec = db.patients[patientId];
      if (!link || !rec) return;
      const at = new Date().toISOString();
      for (const m of rec.messages.filter(
        (x) => x.caregiverId === link.id && !x.acknowledgedAt,
      )) {
        m.acknowledgedAt = at;
        publish(
          patientId,
          { type: "caregiver.acknowledged", messageId: m.id, at },
          0,
        );
      }
      save(db);
    },

    async acknowledgeAlerts(ids) {
      await wait(60);
      const db = await getDb();
      db.acks[me] = [...new Set([...(db.acks[me] ?? []), ...ids])];
      save(db);
    },

    async sendMessage(patientId, body) {
      await wait(200);
      const db = await getDb();
      if (
        !mine(db).some(
          (l) => l.patientId === patientId && l.status === "active",
        )
      )
        throw new ApiError("Patient not found", "not-found");
      const text = body.trim();
      if (!text) throw new ApiError("Write a message first", "invalid");
      const rec = db.patients[patientId];
      if (!rec) throw new ApiError("Patient not found", "not-found");
      const n = {
        id: uid("n"),
        title: `Message from ${session.user.firstName}`,
        body: text,
        createdAt: new Date().toISOString(),
        read: false,
        tone: "info" as const,
      };
      rec.notifications = [n, ...rec.notifications];
      save(db);
      publish(
        patientId,
        { type: "notification.created", notification: n },
        100,
      );
    },

    async addExtraReminder(patientId, medicationId, time) {
      await wait(150);
      const db = await getDb();
      if (
        !mine(db).some(
          (l) => l.patientId === patientId && l.status === "active",
        )
      )
        throw new ApiError("Patient not found", "not-found");
      const rec = db.patients[patientId];
      if (!rec) throw new ApiError("Patient not found", "not-found");
      if (
        rec.extraReminders.some(
          (r) => r.medicationId === medicationId && r.time === time,
        )
      )
        throw new ApiError("That reminder already exists.", "conflict");
      rec.extraReminders.push({ id: uid("rm"), medicationId, time });
      save(db);
    },
  };
}
