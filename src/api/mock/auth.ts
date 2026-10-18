import type { AuthApi } from "../client";
import { ApiError } from "../client";
import type { Session, SignUpInput, User } from "@/domain/auth";
import { MIN_AGE } from "@/domain/auth";
import { validateSignUp } from "@/lib/validation";
import { hashPassword, newSalt, randomToken, safeEqual } from "./crypto";
import { DEFAULT_SETTINGS } from "./seed";
import {
  getDb,
  newShareId,
  save,
  uid,
  wait,
  type DB,
  type PatientRecord,
  type StoredUser,
} from "./db";

const SESSION_MS = 1000 * 60 * 60 * 24 * 30;
const RESET_MS = 1000 * 60 * 30;
const MAX_FAILURES = 5;
const LOCK_MS = 1000 * 60 * 5;

const toUser = ({ hash: _h, salt: _s, ...u }: StoredUser): User => u;
const norm = (e: string) => e.trim().toLowerCase();

function open(db: DB, user: StoredUser): Session {
  const token = randomToken();
  db.sessions[token] = { userId: user.id, expiresAt: Date.now() + SESSION_MS };
  save(db);
  return { token, user: toUser(user) };
}

export const mockAuth: AuthApi = {
  async signUp(input: SignUpInput) {
    await wait(300);
    const db = await getDb();
    const errors = validateSignUp(input);
    const first = Object.entries(errors)[0];
    if (first) throw new ApiError(first[1], "invalid", first[0]);
    if (db.users.some((u) => u.email === norm(input.email)))
      throw new ApiError(
        "An account with this email already exists. Try signing in.",
        "conflict",
        "email",
      );

    const salt = newSalt();
    const id = uid("u");
    const user: StoredUser = {
      id,
      role: input.role,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: norm(input.email),
      birthDate: input.birthDate,
      phone: input.phone?.trim() || undefined,
      hash: await hashPassword(input.password, salt),
      salt,
    };
    if (input.role === "patient") {
      const patientId = uid("p");
      user.patientId = patientId;
      const rec: PatientRecord = {
        id: patientId,
        shareId: newShareId(db),
        medications: [],
        doses: [],
        messages: [],
        notifications: [],
        refills: [],
        careTeamMessages: [],
        settings: { ...DEFAULT_SETTINGS },
        extraReminders: [],
      };
      db.patients[patientId] = rec;
    }
    db.users.push(user);
    return open(db, user);
  },

  async signIn(email, password) {
    await wait(300);
    const db = await getDb();
    const key = norm(email);
    const f = db.failures[key];
    if (f && f.until > Date.now())
      throw new ApiError(
        "Too many attempts. Please wait a few minutes or reset your password.",
        "rate-limited",
      );
    const user = db.users.find((u) => u.email === key);
    // Always hash, so timing does not reveal whether the account exists.
    const hash = await hashPassword(password, user?.salt ?? "x");
    if (!user || !safeEqual(hash, user.hash)) {
      const count = (db.failures[key]?.count ?? 0) + 1;
      db.failures[key] = {
        count,
        until: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0,
      };
      save(db);
      throw new ApiError("Email or password is incorrect.", "unauthorized");
    }
    delete db.failures[key];
    return open(db, user);
  },

  async getSession(token) {
    const db = await getDb();
    const s = db.sessions[token];
    if (!s || s.expiresAt < Date.now()) return null;
    const user = db.users.find((u) => u.id === s.userId);
    return user ? { token, user: toUser(user) } : null;
  },

  async signOut(token) {
    const db = await getDb();
    delete db.sessions[token];
    save(db);
  },

  async requestPasswordReset(email) {
    await wait(300);
    const db = await getDb();
    const user = db.users.find((u) => u.email === norm(email));
    if (!user) return {};
    const token = randomToken();
    db.resets[token] = { userId: user.id, expiresAt: Date.now() + RESET_MS };
    save(db);
    return { devLink: `/reset-password?token=${token}` };
  },

  async resetPassword(resetToken, newPassword) {
    await wait(300);
    const db = await getDb();
    const r = db.resets[resetToken];
    if (!r || r.expiresAt < Date.now())
      throw new ApiError(
        "This reset link has expired. Request a new one.",
        "invalid",
      );
    const user = db.users.find((u) => u.id === r.userId);
    if (!user) throw new ApiError("This reset link is not valid.", "invalid");
    const err = validateSignUp({
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      birthDate: user.birthDate,
      email: user.email,
      password: newPassword,
    }).password;
    if (err) throw new ApiError(err, "invalid", "password");
    user.salt = newSalt();
    user.hash = await hashPassword(newPassword, user.salt);
    delete db.resets[resetToken];
    // sign out everywhere
    for (const [t, s] of Object.entries(db.sessions))
      if (s.userId === user.id) delete db.sessions[t];
    delete db.failures[user.email];
    save(db);
  },
};

export { MIN_AGE };
