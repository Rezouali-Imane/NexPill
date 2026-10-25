import { MIN_AGE, type SignUpInput } from '@/domain/auth';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ageOn(birthISO: string, on = new Date()): number {
  const b = new Date(`${birthISO}T00:00:00`);
  let age = on.getFullYear() - b.getFullYear();
  const m = on.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) age -= 1;
  return age;
}

export function validatePassword(pw: string): string | undefined {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number.';
  return undefined;
}

/** 0–4 for the strength meter. */
export function passwordStrength(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

export function validateBirthDate(v: string, today = new Date()): string | undefined {
  if (!v) return 'Enter your date of birth.';
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'Enter a valid date.';
  if (d > today) return 'Date of birth cannot be in the future.';
  if (d.getFullYear() < 1900) return 'Enter a valid date.';
  if (ageOn(v, today) < MIN_AGE) return `You must be at least ${MIN_AGE} years old to create an account.`;
  return undefined;
}

export type FieldErrors = Partial<Record<keyof SignUpInput | 'confirm', string>>;

export function validateSignUp(i: SignUpInput): FieldErrors {
  const e: FieldErrors = {};
  if (!i.firstName.trim()) e.firstName = 'Enter your first name.';
  if (!i.lastName.trim()) e.lastName = 'Enter your last name.';
  const b = validateBirthDate(i.birthDate);
  if (b) e.birthDate = b;
  if (!EMAIL_RE.test(i.email.trim())) e.email = 'Enter a valid email address.';
  const p = validatePassword(i.password);
  if (p) e.password = p;
  if (i.phone && !/^[+\d][\d\s().-]{5,}$/.test(i.phone.trim())) e.phone = 'Enter a valid phone number or leave it empty.';
  return e;
}
