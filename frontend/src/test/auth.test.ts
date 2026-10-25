import { mockAuth } from "@/api/mock/auth";
import { createMockPatientApi } from "@/api/mock/patient";
import { createMockCaregiverApi } from "@/api/mock/caregiver";
import { DEMO_PASSWORD, resetDb } from "@/api/mock/db";
import { ApiError } from "@/api/client";
import {
  validateBirthDate,
  validatePassword,
  validateSignUp,
} from "@/lib/validation";

beforeEach(async () => {
  localStorage.clear();
  await resetDb();
});

const base = {
  role: "patient" as const,
  firstName: "Lina",
  lastName: "Haddad",
  birthDate: "1970-05-01",
  email: "lina@example.com",
  password: "Strong123",
};

describe("validation", () => {
  it("enforces 18+", () => {
    expect(validateBirthDate("2015-01-01", new Date("2026-10-17"))).toMatch(
      /at least 18/,
    );
    expect(
      validateBirthDate("2000-01-01", new Date("2026-10-17")),
    ).toBeUndefined();
    expect(validateBirthDate("2999-01-01")).toMatch(/future/);
  });
  it("checks password rules", () => {
    expect(validatePassword("short1")).toBeDefined();
    expect(validatePassword("lettersonly")).toBeDefined();
    expect(validatePassword("Strong123")).toBeUndefined();
  });
  it("reports every bad field", () => {
    expect(
      Object.keys(
        validateSignUp({
          ...base,
          firstName: "",
          email: "nope",
          password: "x",
        }),
      ),
    ).toEqual(expect.arrayContaining(["firstName", "email", "password"]));
  });
});

describe("mock auth", () => {
  it("signs up, rejects duplicates, signs in, signs out", async () => {
    const s = await mockAuth.signUp(base);
    expect(s.user).toMatchObject({
      role: "patient",
      email: "lina@example.com",
    });
    expect(s.user.patientId).toBeTruthy();
    expect("hash" in s.user).toBe(false);
    await expect(
      mockAuth.signUp({ ...base, email: "LINA@example.com" }),
    ).rejects.toMatchObject({ code: "conflict", field: "email" });
    const again = await mockAuth.signIn("lina@example.com", "Strong123");
    expect((await mockAuth.getSession(again.token))?.user.id).toBe(s.user.id);
    await mockAuth.signOut(again.token);
    expect(await mockAuth.getSession(again.token)).toBeNull();
  });
  it("gives the same message for unknown email and wrong password, and locks after 5 tries", async () => {
    const a = await mockAuth
      .signIn("nobody@example.com", "whatever1")
      .catch((e: ApiError) => e);
    const b = await mockAuth
      .signIn("jamie@nexpill.demo", "wrongpass1")
      .catch((e: ApiError) => e);
    expect((a as ApiError).message).toBe((b as ApiError).message);
    for (let i = 0; i < 4; i++)
      await mockAuth
        .signIn("jamie@nexpill.demo", "wrongpass1")
        .catch(() => undefined);
    await expect(
      mockAuth.signIn("jamie@nexpill.demo", DEMO_PASSWORD),
    ).rejects.toMatchObject({ code: "rate-limited" });
  });
  it("resets a password with a one-time token", async () => {
    const { devLink } =
      await mockAuth.requestPasswordReset("jamie@nexpill.demo");
    const token = new URLSearchParams(devLink!.split("?")[1]).get("token")!;
    await mockAuth.resetPassword(token, "Brandnew123");
    await expect(
      mockAuth.resetPassword(token, "Another123"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(
      (await mockAuth.signIn("jamie@nexpill.demo", "Brandnew123")).user.role,
    ).toBe("patient");
    expect(await mockAuth.requestPasswordReset("ghost@example.com")).toEqual(
      {},
    );
  });
});

describe("permanent patient ID linking", () => {
  it("caregiver enters the ID, gets access at once, patient is notified", async () => {
    const patient = await mockAuth.signUp(base);
    const caregiver = await mockAuth.signUp({
      ...base,
      role: "caregiver",
      email: "cg@example.com",
      firstName: "Sara",
    });
    const pApi = createMockPatientApi(patient);
    const cApi = createMockCaregiverApi(caregiver);

    const id = await pApi.getShareId();
    expect(id).toMatch(/^NX-[A-Z2-9]{8}$/);
    expect(await pApi.getShareId()).toBe(id); // permanent

    await expect(
      cApi.linkPatient("NX-BADCODE1", "Daughter"),
    ).rejects.toMatchObject({ field: "code" });
    await cApi.linkPatient(` ${id.toLowerCase()} `, "Daughter");
    await expect(cApi.linkPatient(id, "Daughter")).rejects.toMatchObject({
      code: "conflict",
    });

    const dash = await cApi.getDashboard();
    expect(dash.patients).toHaveLength(1);
    expect(dash.patients[0]!.link).toMatchObject({
      status: "active",
      isPrimary: true,
    });

    const snap = await pApi.getSnapshot();
    expect(snap.caregivers).toHaveLength(1);
    expect(snap.notifications[0]!.title).toMatch(/new caregiver/i);

    await pApi.removeCaregiver(snap.caregivers[0]!.id);
    expect((await cApi.getDashboard()).patients).toHaveLength(0);
  });
  it("regenerating the ID kills the old one but keeps existing caregivers", async () => {
    const patient = await mockAuth.signUp(base);
    const pApi = createMockPatientApi(patient);
    const c1 = createMockCaregiverApi(
      await mockAuth.signUp({
        ...base,
        role: "caregiver",
        email: "a@example.com",
      }),
    );
    const c2 = createMockCaregiverApi(
      await mockAuth.signUp({
        ...base,
        role: "caregiver",
        email: "b@example.com",
      }),
    );
    const old = await pApi.getShareId();
    await c1.linkPatient(old, "Friend or neighbour");
    const fresh = await pApi.regenerateShareId();
    expect(fresh).not.toBe(old);
    await expect(c2.linkPatient(old, "Son")).rejects.toMatchObject({
      code: "invalid",
    });
    await c2.linkPatient(fresh, "Son");
    expect((await c1.getDashboard()).patients).toHaveLength(1);
  });
  it("locks a caregiver out after 5 wrong IDs", async () => {
    const c = createMockCaregiverApi(
      await mockAuth.signUp({
        ...base,
        role: "caregiver",
        email: "g@example.com",
      }),
    );
    for (let i = 0; i < 5; i++)
      await c.linkPatient("NX-AAAAAAAA", "Son").catch(() => undefined);
    await expect(c.linkPatient("NX-JM4K7R2Q", "Son")).rejects.toMatchObject({
      code: "rate-limited",
    });
  });
  it("role checks", async () => {
    const patient = await mockAuth.signUp(base);
    expect(() => createMockCaregiverApi(patient)).toThrow();
  });
  it("a caregiver only sees their own patients", async () => {
    const emily = await mockAuth.signIn("emily@nexpill.demo", DEMO_PASSWORD);
    const dash = await createMockCaregiverApi(emily).getDashboard();
    expect(dash.patients.map((p) => p.patient.firstName).sort()).toEqual([
      "Ahmed",
      "Jamie",
      "Nadia",
    ]);
    const other = await mockAuth.signUp({
      ...base,
      role: "caregiver",
      email: "x@example.com",
    });
    expect(
      (await createMockCaregiverApi(other).getDashboard()).patients,
    ).toHaveLength(0);
  });
});
