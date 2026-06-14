---
name: Clerk auth (RestroFlow)
description: How Clerk login works here and the two non-obvious failure modes — key mismatch and prod-key domain lock.
---

# Clerk auth — failure modes & how to read them

App uses Clerk (`@clerk/express` backend, `@clerk/clerk-react` frontend). Two env keys must come from the SAME Clerk application:
- `VITE_CLERK_PUBLISHABLE_KEY` (frontend, `pk_...`) — public; the instance domain is base64-encoded after the `pk_(live|test)_` prefix. Decode with `Buffer.from(b,'base64').toString().replace(/\$$/,'')` to see which Clerk instance the frontend targets.
- `CLERK_SECRET_KEY` (backend, `sk_...`) — secret; domain NOT decodable.

## Failure mode 1: "user not found" on login + log line "Clerk instance keys do not match"
**Cause:** publishable key and secret key are from two DIFFERENT Clerk apps. Frontend mints a session token against app A; backend tries to verify it with app B's secret → no valid user → `/api/auth/me` returns "User not found".
**Fix:** re-copy BOTH keys from the same app's API Keys page (dashboard.clerk.com). Don't guess which one is wrong — replace both together so they're guaranteed to match.

## Failure mode 2: works in prod, fails in Replit preview — "Production Keys are only allowed for domain X"
**Cause:** `pk_live_`/`sk_live_` keys are domain-locked to the production domain (here `restroflowsolutions.com`). They reject any other Origin, so the Replit dev preview (localhost:5000 / *.replit.dev) gets HTTP 400 from Clerk and login never completes in preview.
**Fix for preview testing:** use the Clerk app's DEVELOPMENT instance keys (`pk_test_`/`sk_test_`) in the Replit **development** environment scope, while keeping the live keys for production. Test instances allow localhost and arbitrary origins.

**How to apply:** `pk_live_`+`sk_live_` = production-only; for the Replit preview you need `pk_test_`+`sk_test_` from the same app. Check the decoded instance domain + the live/test prefix before assuming a key problem.
