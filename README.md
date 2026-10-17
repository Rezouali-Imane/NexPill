# NexPill

NexPill is a smart medication management platform for patients and caregivers.
It is designed to support medication schedules, dose tracking, reminders,
caregiver access, safety checks, and adherence insights.

## Backend

The backend uses Node.js, TypeScript, Express, Prisma, and Supabase PostgreSQL.
Supabase Auth provides the authentication foundation.

```bash
npm install
cp .env.example .env
npm run dev
```

The API currently provides:

- `GET /health`
- `GET /auth/me` for Supabase bearer-token verification
- Dose recording and querying under `/doses`
- `POST /doses/jobs/detect-missed` for admin-triggered overdue-dose detection

### Overdue-dose detection

The server runs the missed-dose job every 60 seconds outside test mode. It
scans pending scheduled doses whose `missedDeadlineAt` has passed, marks them
as `MISSED`, records a system `DoseEvent`, and creates configured caregiver
alerts. Set `DISABLE_BACKGROUND_JOBS=true` to disable the scheduler.

### Real-time dose updates

Socket.IO is served on the same HTTP server as the API. Clients must
authenticate during the handshake with a Supabase access token:

```ts
const socket = io("http://localhost:3000", {
  auth: { token: supabaseAccessToken },
});
socket.on("dose.updated", (update) => {
  console.log(update);
});
```

Connections are rejected when the token is missing or invalid, or when the
application user is disabled. A client receives updates only for its own
patient room or for patients with an active caregiver relationship.

## Permission and audit review

Caregiver access is enforced by `AccessControlService` before medication,
schedule, and dose operations:

- The patient can access their own records.
- An administrator must still have an enabled application account, but does
  not need a caregiver relationship.
- A caregiver must have an `ACTIVE` relationship for the patient.
- `canViewSchedule` permits read access to medication and schedule data.
- `canManageMedications` permits medication and schedule writes.
- `canRecordDoses` permits dose status recording.
- `PENDING` and `REVOKED` caregiver relationships are denied.
- Disabled or unknown application accounts are denied.

The `DoseEvent` model is the authoritative append-only ledger for dose status
transitions, including patient, caregiver, device, and system sources. The
broader `AuditEvent` model exists for cross-resource audit records, but
application services do not yet write it consistently. Until that is
implemented, medication, schedule, caregiver-access, and MCP operations must
not claim complete audit coverage. A production audit implementation should
write an `AuditEvent` in the same transaction as each sensitive mutation and
include actor, patient, action, resource, timestamp, and a redacted metadata
object.

## Medical MCP scope

The Medical MCP is a controlled tool surface for authenticated, patient-scoped
medication workflows. It is not a diagnostic system, prescribing system,
emergency service, or replacement for a clinician. It must not expose raw
Prisma access, arbitrary SQL, Supabase service-role credentials, or unrestricted
cross-patient search.

### Tools and input schemas

All tools accept JSON objects and reject unknown fields. IDs are UUID strings
and timestamps are ISO-8601 date-time strings.

| Tool | Input schema | Purpose |
| --- | --- | --- |
| `list_medications` | `{ patientId?: UUID, status?: "ACTIVE" \| "INACTIVE" \| "ALL", includeSchedules?: boolean }` | List medications visible to the caller. |
| `get_medication` | `{ medicationId: UUID }` | Read one medication, schedules, and active warnings. |
| `list_schedules` | `{ patientId?: UUID, medicationId?: UUID }` | List visible medication schedules. |
| `list_doses` | `{ patientId?: UUID, startDate?: ISODateTime, endDate?: ISODateTime, status?: DoseStatus, medicationId?: UUID, scheduleId?: UUID }` | Read scheduled doses in an explicit date range. |
| `get_dose` | `{ doseId: UUID }` | Read one dose and its dose-event history. |
| `record_dose` | `{ doseId: UUID, status: "TAKEN" \| "SKIPPED" \| "UNABLE_TO_TAKE", occurredAt?: ISODateTime, note?: string, idempotencyKey: string }` | Record an adherence event. |
| `acknowledge_alert` | `{ alertId: UUID }` | Acknowledge an alert delivered to the authenticated caregiver or patient. |

The MCP should not expose medication creation, deletion, schedule mutation,
dose generation, missed-dose job execution, caregiver-access management, or
administrative role management until dedicated audit and approval workflows
exist. In particular, `record_dose` is the only write tool in the initial
scope.

### Current MCP transport and medication lookup

The initial server skeleton is available at `POST /mcp` using the MCP
Streamable HTTP transport. The endpoint requires both a valid Supabase bearer
token and an enabled application user (`USER` or `ADMIN`). MCP clients must
send the token in the HTTP `Authorization` header; it is never accepted as a
tool argument.

The currently implemented tool is:

| Tool | Input | Source |
| --- | --- | --- |
| `lookup_medication_information` | `{ medicationName: string }` | NIH RxNorm public terminology API |

This tool is read-only and returns RxCUI/name terminology matches. RxNorm is
used without an API credential. The upstream URL, timeout, response parsing,
and error messages are controlled by the server; clients cannot select an
arbitrary URL or provide upstream credentials. The result is reference
terminology only, not prescribing, diagnosis, dosage, or emergency advice.

### Authorization boundaries

Every tool must authenticate the caller with Supabase Auth and resolve the
application user from Prisma. Authorization is evaluated for the target
patient on every call; a patient ID supplied by the caller is never trusted.

- Patients may read and write only their own records.
- Caregivers may read only patients with an `ACTIVE` relationship and
  `canViewSchedule`; they may record doses only with `canRecordDoses`.
- The initial MCP surface should not grant medication or schedule writes to
  caregivers, even when `canManageMedications` is true.
- Administrators may use read tools after enabled-account verification, but
  MCP access should be separately allow-listed and fully audited.
- Every write requires an idempotency key and must emit both its domain event
  (`DoseEvent` where applicable) and a redacted `AuditEvent`.
- Tool errors must not reveal whether an inaccessible UUID exists; return the
  repository's standard not-found/forbidden behavior without leaking records.

## Linking a caregiver with an invitation token

The patient does not share their patient ID. Instead, an authenticated patient
creates a short-lived, single-use invitation:

```http
POST /caregiver-access/invites
Authorization: Bearer <patient-access-token>
Content-Type: application/json

{
  "canViewSchedule": true,
  "canViewHistory": true,
  "canReceiveAlerts": true,
  "canRecordDoses": false,
  "canManageMedications": false
}
```

The response contains an opaque `token` and an expiration timestamp. The
patient shares the token through a trusted channel. The caregiver signs up or
signs in with Supabase Auth, then submits the token while authenticated:

```http
POST /caregiver-access/invites/accept
Authorization: Bearer <caregiver-access-token>
Content-Type: application/json

{ "token": "<invitation-token>" }
```

After acceptance, the caregiver can load the linked patient relationship:

```http
GET /caregiver-access
Authorization: Bearer <caregiver-access-token>
```

Caregivers with schedule-view permission can request a patient-local daily
dose summary:

```http
GET /caregiver-access/<patient-id>/daily-summary?date=2026-10-17
Authorization: ******
```

The response contains `scheduled`, `taken`, `skipped`, and `missed` totals.
`scheduled` includes every non-cancelled dose for that local calendar date;
the other totals count only doses with the matching status. Pending and
`UNABLE_TO_TAKE` doses are included in `scheduled` but are not counted as
taken, skipped, or missed.

The token is stored only as a SHA-256 hash, expires after seven days, is
cleared on acceptance, and cannot be reused. New invitations start with dose
recording and medication-management permissions disabled. The patient ID is
never embedded in the token.

Application features are being developed incrementally.
