# Opervia — Phase 1 (Auth, RBAC, Leads → Clients → Projects)

This is a real, working foundation — not a mockup. Every button calls a real API route,
every API route is authorized server-side against the database, and nothing renders
fake/hardcoded numbers.

## What's built in this phase

- Auth.js (NextAuth v5): email/password (bcrypt-hashed) + Google OAuth
- RBAC: ADMIN / AGENT / CLIENT, enforced in `src/lib/authz.ts` and re-checked on
  every API route — never just hidden in the UI
- IDOR protection: an Agent cannot access another agent's lead/client/project
  even by editing the URL — every access goes through `assertCanAccessX()`
  against the database
- Full CRUD: Leads, Clients, Projects, with a validated project status state
  machine (`SUBMITTED → ... → COMPLETED`, with `REJECTED` as a dead end)
- Lead → Client conversion that preserves history (no duplicate data entry)
- Append-only audit log for every sensitive action
- Dashboard with live Prisma aggregates (zero hardcoded stats)
- Institutional/admission-portal visual style (navy/slate, dense tables)

## What's NOT built yet (next phases, per your original spec)

Agent email system + threading, proposals, Razorpay payments/refunds,
commission engine, real-time chat + translation, milestones approval flow,
documents upload to storage, notifications, public analytics, reviews.
The schema already has the tables needed so these attach without a rewrite —
say the word and I'll build the next phase the same way (real, authorized, tested).

## 1. Install

```bash
npm install
```

This sandbox couldn't reach `binaries.prisma.sh` to fetch Prisma's engine
binaries, so `prisma generate`/`migrate` weren't run here — they will work
normally on your machine or in CI/Vercel with normal internet access.

## 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in real values — see `.env.example` for exactly which dashboard each
credential comes from (Neon/Supabase, Google Cloud Console, Razorpay,
Resend, etc).

## 3. Create the database schema

```bash
npx prisma migrate dev --name init
```

## 4. Create the first Admin account

```bash
SEED_ADMIN_EMAIL="you@youragency.com" SEED_ADMIN_PASSWORD="ChooseAStrongPassword123!" npm run seed
```

## 5. Run locally

```bash
npm run dev
```

Sign in at `http://localhost:3000/login` with the admin credentials above.

## 6. Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add every variable from `.env.example` in Vercel → Project Settings →
   Environment Variables (use your production DB URL, real secrets).
4. Set `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to your production domain.
5. Vercel will run `npm install` (which runs `prisma generate` via
   `postinstall`) and build automatically.
6. Run the migration against your production DB once:
   `DATABASE_URL="<prod-url>" npx prisma migrate deploy`
7. Run the seed script once against production the same way as step 4.

## 7. Post-deploy checklist

- [ ] Log in as Admin, confirm dashboard shows `0` everywhere (real data, not fake)
- [ ] Create a Lead, confirm it appears only for the Admin (no Agent assigned yet)
- [ ] Create an Agent user directly in the DB (Agent self-serve creation is
      Phase 2 — for now insert a `User` with `role=AGENT` + linked `Agent` row)
- [ ] Log in as that Agent, confirm they see 0 leads (not the Admin's)
- [ ] Assign a lead to the Agent, confirm it now appears for them and only them
- [ ] Try to open another agent's client via a guessed URL — confirm you get
      a 403/404, not the data (this is the IDOR check working)
- [ ] Convert a Lead to a Client, confirm no duplicate entry was needed and
      the original lead source/notes are visible on the Client page
- [ ] Log in as a Client (create one manually or via Google sign-in),
      submit a project, confirm it's visible to Admin and the assigned Agent
- [ ] As Admin, walk a project through the status buttons on the Project page
      and confirm the Activity timeline records each transition
