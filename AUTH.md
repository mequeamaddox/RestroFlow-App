# Authentication

Identity is handled by **Clerk** (`@clerk/express`); the application keeps its own
`users` table in Postgres and links the two **by email**, not by Clerk user id.
Authorization (roles/permissions/tenant isolation) is covered separately in
[PERMISSIONS](PERMISSIONS.md).

## Pieces

| File | Responsibility |
|------|----------------|
| `server/clerkAuth.ts` | `clerkMiddleware`, `requireAuth`, `optionalAuth`, `isAuthenticated`, `logClerkKeyDiagnostics` |
| `server/routes/auth.ts` | `/api/auth/me`, `/api/auth/logout`, `/api/user/subscription` |
| `client/src/hooks/useAuth.ts` | Frontend hook that reads `/api/auth/me` |
| Clerk dashboard | The actual identity provider, user store, and sessions |

## Email-first user resolution (important)

Clerk issues a `userId` per Clerk application. **If the Clerk app or keys are swapped,
existing users get brand-new Clerk ids** — but their row in our `users` table keeps its
original id. To survive that, the backend always resolves a user by **email**:

1. `requireAuth` reads `getAuth(req)` to get the Clerk `userId` + `sessionClaims`.
2. It derives the email via `resolveEmail` (session claims first, then the Clerk API).
3. It looks the user up with `storage.getUserByEmail`. If not found, it checks for a
   matching **invited employee**, then provisions/links the account via
   `storage.upsertUser` (mapping the current Clerk `userId` onto the existing record).
4. `req.user.id` is set to the **database** user id. All tenant scoping uses this id.

> ⚠️ **Past bug to avoid:** never re-fetch the user by the Clerk `userId` after an
> upsert. Because the DB row keeps its original id, that lookup returns null and
> produces a false "User not found" / 401. Use the value returned by `upsertUser`.
> See `.agents/memory/clerk-auth.md` for the full failure modes.

## `/api/auth/me`

The bridge between frontend and the DB user record:

1. Validates the Clerk session.
2. Finds the user by id, then by email.
3. If missing, calls `upsertUser`, defaulting `role` to `owner` for fresh signups, or
   preserving the role from an invitation.
4. Returns the user record (including `role`, `subscriptionPlan`, etc.).

Sessions use Clerk's `__session` cookie. `/api/auth/logout` clears it.

## Startup key diagnostics

`logClerkKeyDiagnostics()` runs once at boot and logs, e.g.:

```
🔐 [Clerk] frontend instance="clerk.restroflowsolutions.com" publishableKey=live secretKey=live
```

It decodes the publishable key to show the Clerk instance domain and warns if the
publishable and secret keys are from **different** apps/environments (a common cause of
401s). It never logs secret values.

## Environment-specific keys (dev vs prod)

- **Production** uses **live** keys (`pk_live_…` / `sk_live_…`). Live publishable keys
  are **domain-locked** to `restroflowsolutions.com`, so they will *not* work in the
  Replit dev preview.
- For local/dev testing of the auth flow, use Clerk **test** keys (`pk_test_…`).

Relevant secrets: `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
(`CLERK_PUBLISHABLE_KEY` is also read as a fallback on the server).

## Frontend

`useAuth()` (`client/src/hooks/useAuth.ts`) queries `/api/auth/me` and exposes the
current user. The app shell (`client/src/App.tsx`) splits unauthenticated routes
(Landing/Login) from authenticated routes, and wraps the latter in `LocationProvider`
and `PermissionProvider`.
