# NexPill

## Backend

Install dependencies with `npm install`, copy `.env.example` to `.env`, and add
the Supabase connection strings before running Prisma commands.

- `npm run dev` starts the development server.
- `npm run build` compiles TypeScript to `dist`.
- `npm start` runs the compiled server.
- `npm run lint` checks the source.
- `GET /health` returns `{ "status": "ok" }`.

The Prisma schema intentionally contains no application models yet.