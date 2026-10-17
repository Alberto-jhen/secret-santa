# Remigo

A bilingual React SPA for organizing Secret Santa gift exchanges, built with TypeScript, Vite, React Router, and Tailwind CSS.

## Development

```sh
npm install
npm run dev
```

## Checks

```sh
npm run build
npm run lint
npm test
```

## Routes

- `/`: landing page and draw overview.
- `/register`: create an account with inline validation and email confirmation when enabled.
- `/login`: sign in to an existing account.
- `/guest-draw`: create a guest draw and email each participant a private result link.
- `/guest-result`: resolve a participant's assignment using the token in the URL fragment.
- Any other path renders the not-found page.

Account registration uses Supabase Auth with email and password. Configure email signups and allow the app's `/register` URL in the Supabase Auth redirect settings; Supabase Auth handles confirmation emails. Guest draws are backed by Supabase Edge Functions; assignments are never returned to the organizer.

## Local Supabase setup

1. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your local Supabase project.
2. Start Supabase locally with the Supabase CLI, then apply the migrations with `supabase db reset`.
3. Configure Edge Function secrets: `GUEST_ACCESS_TOKEN_SECRET` and `GUEST_RATE_LIMIT_SECRET` (each at least 32 characters), `GUEST_CLEANUP_SECRET` and `GUEST_OUTBOX_SECRET` (each at least 32 characters), `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_EMAIL`, `APP_BASE_URL`, and `ALLOWED_ORIGINS`. The Gmail OAuth refresh token needs the `gmail.send` scope. Set `GMAIL_SENDER_NAME` optionally. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions.
4. Serve or deploy `guest-draw`, `guest-result`, `guest-resend`, `process-guest-draw-outbox`, and `purge-expired-guest-draws`. Never put the service-role key or Gmail credentials in a `VITE_` variable or the browser.
5. Schedule `process-guest-draw-outbox` (for example, every five minutes) with the `x-outbox-secret` header to retry queued/failed emails, and schedule `purge-expired-guest-draws` daily with `x-cleanup-secret`. The cleanup removes expired guest data and old rate-limit records. Until cleanup is scheduled, result links expire but database rows are not automatically deleted.

Public guest functions validate input, restrict browser origins, hash rate-limit identities, cap a draw at 50 participants, and reserve no more than 400 Gmail messages per UTC day. Email work uses atomic 15-minute claims to prevent overlapping requests from processing the same queued delivery; delivery remains at-least-once if Gmail accepts a message but the subsequent database acknowledgement fails. The SQL migration enables RLS throughout; guest data has no `anon` or `authenticated` table access and is available only to service-role Edge Function RPCs. Group, membership, invitation, exclusion, assignment, gift-idea, and notification tables are foundational; authenticated-group UI is not part of this phase.

## Structure

- `src/components/layout`: shared header, footer, and layout.
- `src/components/pages`: landing, registration, guest draw/result, and not-found pages.
- `src/components/ui`: reusable brand, buttons, icons, and layout primitives.
- `src/i18n`: English and Spanish messages and locale provider.
- `supabase/migrations`: schema, access controls, guest-draw RPCs, and cleanup.
- `supabase/functions`: private guest-draw, result, resend, outbox, and cleanup endpoints.
