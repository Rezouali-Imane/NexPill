import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@/api";
import { homeFor, useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { Checkbox, FormField, PasswordField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { MIN_AGE, type Role, type SignUpInput } from "@/domain/auth";
import { toISODate } from "@/lib/time";
import { validateSignUp, type FieldErrors } from "@/lib/validation";
import { AuthLayout } from "./AuthLayout";
import s from "./Auth.module.css";

export default function SignUp() {
  const { role: param } = useParams();
  const role =
    param === "patient" || param === "caregiver" ? (param as Role) : null;
  const { signUp } = useAuth();
  const nav = useNavigate();
  const [v, setV] = useState({
    firstName: "",
    lastName: "",
    birthDate: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
    agree: false,
    remember: false,
  });
  const [errors, setErrors] = useState<FieldErrors & { agree?: string }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const alertRef = useRef<HTMLParagraphElement>(null);

  if (!role) return <Navigate to="/welcome" replace />;

  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const maxBirth = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - MIN_AGE);
    return toISODate(d);
  })();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    const input: SignUpInput = {
      role,
      firstName: v.firstName,
      lastName: v.lastName,
      birthDate: v.birthDate,
      email: v.email,
      password: v.password,
      phone: v.phone,
    };
    const errs: typeof errors = validateSignUp(input);
    if (!errs.password && v.confirm !== v.password)
      errs.confirm = "The passwords do not match.";
    if (!v.agree) errs.agree = "Please agree to continue.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError("Please fix the highlighted fields.");
      queueMicrotask(() =>
        (
          document.querySelector('[aria-invalid="true"]') as HTMLElement | null
        )?.focus(),
      );
      return;
    }
    setBusy(true);
    try {
      await signUp(input, v.remember);
      nav(
        role === "patient"
          ? homeFor("patient")
          : "/caregiver/patients?welcome=1",
        { replace: true },
      );
    } catch (err) {
      if (err instanceof ApiError && err.field)
        setErrors({ [err.field]: err.message });
      else
        setFormError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
        );
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      wide
      title={
        role === "patient"
          ? "Create your patient account"
          : "Create your caregiver account"
      }
      subtitle={
        role === "patient"
          ? "We use these details to keep your medication plan safe and personal."
          : "After this, you will connect to a patient with their NexPill ID."
      }
      footer={
        <>
          <span>
            Already have an account?{" "}
            <Link to={`/signin?role=${role}`}>Sign in</Link>
          </span>
          <span>
            {role === "patient" ? (
              <>
                Looking after someone?{" "}
                <Link to="/signup/caregiver">Sign up as a caregiver</Link>
              </>
            ) : (
              <>
                Taking medication yourself?{" "}
                <Link to="/signup/patient">Sign up as a patient</Link>
              </>
            )}
          </span>
        </>
      }
    >
      <Link to="/welcome" className={s.back}>
        <Icon name="arrowLeft" size={18} /> Back
      </Link>
      <form className={s.form} onSubmit={(e) => void submit(e)} noValidate>
        {formError && (
          <p ref={alertRef} role="alert" className={s.alert}>
            {formError}
          </p>
        )}
        <div className={s.row}>
          <FormField
            label="First name"
            autoComplete="given-name"
            value={v.firstName}
            error={errors.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            required
          />
          <FormField
            label="Last name"
            autoComplete="family-name"
            value={v.lastName}
            error={errors.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            required
          />
        </div>
        <FormField
          label="Date of birth"
          type="date"
          autoComplete="bday"
          max={maxBirth}
          min="1900-01-01"
          value={v.birthDate}
          error={errors.birthDate}
          hint={`You must be at least ${MIN_AGE} years old.`}
          onChange={(e) => set("birthDate", e.target.value)}
          required
        />
        <FormField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={v.email}
          error={errors.email}
          onChange={(e) => set("email", e.target.value)}
          required
        />
        <FormField
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          optional
          value={v.phone}
          error={errors.phone}
          hint={
            role === "caregiver"
              ? "So the patient can call you from the app."
              : "So your caregiver can call you from the app."
          }
          onChange={(e) => set("phone", e.target.value)}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          showStrength
          value={v.password}
          error={errors.password}
          hint="At least 8 characters, with a letter and a number."
          onChange={(e) => set("password", e.target.value)}
          required
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={v.confirm}
          error={errors.confirm}
          onChange={(e) => set("confirm", e.target.value)}
          required
        />
        <Checkbox
          label="Keep me signed in on this device"
          checked={v.remember}
          onChange={(e) => set("remember", e.target.checked)}
        />
        <Checkbox
          label={
            <>
              I agree to the <a href="#terms">Terms</a> and{" "}
              <a href="#privacy">Privacy Policy</a>. NexPill is a reminder tool
              and does not replace advice from a doctor or pharmacist.
            </>
          }
          checked={v.agree}
          error={errors.agree}
          onChange={(e) => set("agree", e.target.checked)}
        />
        <Button type="submit" variant="primary" loading={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
