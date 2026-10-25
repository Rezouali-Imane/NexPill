# NexPill – patient & caregiver front end (React + TypeScript)

Vite · React 18 · React Router · CSS Modules on `--nx-*` design tokens (mirror the Figma variables). Front end only – the backend is a typed contract (`docs/API.md`) with a localStorage mock.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # vitest + Testing Library
npm run build
```

## Try it
Demo accounts (password `Nexpill123!`): `jamie@nexpill.demo` (patient), `ahmed@nexpill.demo`, `nadia@nexpill.demo`, `emily@nexpill.demo` (caregiver of all three).
Live demo: sign in as the patient in one tab and the caregiver in another (each tab keeps its own session) – doses taken/skipped and messages appear instantly.
Or create accounts: Welcome → choose Patient/Caregiver → sign up. Patient generates an invite code (My caregivers); caregiver enters it (Patients) → patient approves.

## Structure
`src/api` contract + mock · `src/domain` types & derivations (dose states, risk, timeline) · `src/auth` session/guards · `src/state`, `src/caregiver` stores ·
`src/pages/{auth,caregiver}` + patient pages · `src/features`, `src/components` UI.

## Not yet (second pass)
Escalation settings, safety checks, NexPill device simulation (3D), notification settings.
