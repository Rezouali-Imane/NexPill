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

Application features are being developed incrementally.
