# NexPill

## Backend

Install dependencies with `npm install`, copy `.env.example` to `.env`, and add
the Supabase connection strings and public project settings before running the
server or Prisma commands.

- `npm run dev` starts the development server.
- `npm run build` compiles TypeScript to `dist`.
- `npm start` runs the compiled server.
- `npm run lint` checks the source.
- `GET /health` returns `{ "status": "ok" }`.
- `GET /auth/me` verifies a Supabase bearer token and returns the authenticated
  user's basic identity.

The Prisma schema and initial migration contain the database foundation. Feature
authorization and application workflows are not implemented yet.