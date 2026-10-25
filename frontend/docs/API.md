# NexPill front end ↔ backend contract

Source of truth: `src/api/client.ts` (TypeScript interfaces) and `src/domain/*` (types). The front end currently runs on a
**mock** (`src/api/mock`, localStorage). To go live, implement `Backend` with `fetch` + `WebSocket` and export it from `src/api/index.ts`.
All times are ISO‑8601; dose `date` is `YYYY-MM-DD`, `time` is `HH:mm` (patient local time). Auth: `Authorization: Bearer <token>`.
Errors: `{ code, message, field? }` with codes `validation | conflict | unauthorized | forbidden | not-found | rate-limited | expired`.

## Auth (`AuthApi`)
| Method | Endpoint (suggested) | Notes |
|---|---|---|
| signUp(SignUpInput) | POST /auth/signup | role, firstName, lastName, birthDate (18+), email, password, phone? → `Session{token,user}`. 409 `conflict` field `email` on duplicate (case-insensitive). |
| signIn(email, password) | POST /auth/signin | Same error message for unknown email / wrong password. Lock after 5 failures (`rate-limited`). |
| getSession(token) | GET /auth/session | null/401 if invalid. |
| signOut(token) | POST /auth/signout | |
| requestPasswordReset(email) | POST /auth/forgot | Always 200 (no account enumeration). Send e‑mail with link `/reset-password?token=…`. |
| resetPassword(token, pw) | POST /auth/reset | Single‑use, short expiry. |

Backend must: hash with argon2/bcrypt (the mock uses PBKDF2 for demo only), rate‑limit, use httpOnly cookies or short‑lived tokens.

## Patient (`PatientApi`) – session.role must be `patient`
getSnapshot, markTaken, skip, reportConcern, setSettings, requestRefill, createInviteCode, respondToCaregiver(linkId, approve|decline), removeCaregiver(linkId).
Invite code `NX-XXXXXX` (no 0/O/1/I): single‑use, 24 h, a new code cancels the previous one.

## Caregiver (`CaregiverApi`) – session.role must be `caregiver`
getDashboard → `{patients: PatientView[], pending: PendingRequest[]}` (only **active** links return patient data),
linkPatient(code, relationship) → link `pending` until the patient approves, unlinkPatient, markMessagesSeen, acknowledgeAlerts,
sendMessage, addExtraReminder.  Per‑link `notifyOn` flags decide which alerts the caregiver receives.

## Realtime (`RealtimeChannel`)
WebSocket, authenticated with the token, events scoped by `patientId` (only send events for patients the user may see):
`dose.updated · caregiver.message · caregiver.acknowledged · notification.created · refill.updated · link.updated`.

## Escalation rules the server should own
Dose scheduled at T: reminder at T, second reminder T+15, caregiver alert T+30, **missed** T+60. Confirmed >30 min after T = `late` (counts as taken).
The client derives states from these timings (`src/domain/status.ts`); the server should persist reminder/alert events so the history is auditable.
Risk (`src/domain/caregiver.ts`): high if missed7 ≥ 4 or adherence7 < 70 %; attention if missed7 ≥ 2 or adherence7 < 85 % — deterministic rules, move server‑side if an ML model replaces them.
