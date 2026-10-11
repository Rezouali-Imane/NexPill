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

Application features are being developed incrementally.
