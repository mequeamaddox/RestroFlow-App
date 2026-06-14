# Architecture

High-level map of RestroFlow so a new developer can find their way around quickly.
For deep dives into specific subsystems, see the sibling docs: [AUTH](AUTH.md),
[PERMISSIONS](PERMISSIONS.md), [BILLING](BILLING.md), [OCR](OCR.md),
[DATABASE](DATABASE.md), [DEPLOYMENT](DEPLOYMENT.md).

## What it is

A multi-tenant restaurant operations platform: inventory, recipe costing, vendor
management, purchase orders, waste tracking, OCR invoice processing, real-time
analytics, POS integration, and an HR/payroll add-on. Tenancy is anchored on
**locations** owned by a user (see [PERMISSIONS](PERMISSIONS.md)).

## Tech stack

| Layer       | Technology |
|-------------|-----------|
| Frontend    | React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix), TanStack Query, `wouter` routing, React Hook Form + Zod |
| Backend     | Node.js + Express (ES modules), Drizzle ORM |
| Database    | PostgreSQL (Neon serverless, accessed over WebSockets) |
| Auth        | Clerk (`@clerk/express`) |
| Monitoring  | Sentry |
| Billing     | Square (Stripe code paths also exist — see [BILLING](BILLING.md)) |
| Other       | SendGrid (email), AWS S3 / Replit Object Storage, AWS Textract + Tesseract.js (OCR) |

## Directory layout

```
client/          React frontend (Vite)
  src/
    pages/       One file per route (dashboard.tsx, inventory.tsx, hr-dashboard.tsx, ...)
    contexts/    LocationContext (current location), PermissionContext (RBAC)
    components/  ui/ (shadcn primitives) + feature folders (inventory/, payroll/, ...)
    lib/         queryClient.ts (TanStack Query fetcher + apiRequest)
    hooks/       useAuth.ts, use-toast.ts, ...
server/          Express backend
  index.ts       App entry: middleware, startup, route registration, Vite/static serving
  routes/        API routes by domain (auth.ts, billing.ts, inventory.ts, hr.ts, payroll.ts, pos.ts, invoices.ts, analytics.ts, recipes.ts) + index.ts registrar
  storage.ts     IStorage interface + DatabaseStorage (all DB access lives here)
  db.ts          Neon connection
  clerkAuth.ts   Auth middleware + key diagnostics
  permissions.ts Role/permission matrix (backend)
  securityMiddleware.ts  requireLocationAccess / assertLocationAccess, security headers, rate limiting
  locationContext.ts     Per-transaction location scoping
  encryption.ts  AES-256-GCM field encryption for PII
  ocrService.ts  Invoice OCR pipeline
  squareSubscriptionService.ts, billingMiddleware.ts  Billing
  startup-migrations.ts  Idempotent migrations run on dev startup
shared/
  schema.ts      Drizzle schema + Zod insert schemas (source of truth, shared FE/BE)
scripts/
  migrate.mjs    Production migration runner (mirror of startup-migrations.ts)
```

## Server boot sequence (`server/index.ts`)

1. **Sentry** initializes first (disabled if no `SENTRY_DSN`).
2. **Middleware**, in order: security headers → API rate limiter → `express.json`
   (with raw-body capture for webhook signature verification) → `cookieParser` →
   `logClerkKeyDiagnostics()` → `logEncryptionStatus()` → `clerkMiddleware` →
   `locationContextMiddleware` → request/response logging interceptor.
3. **Startup work**: `runStartupMigrations()` (idempotent `ALTER TABLE ... IF NOT EXISTS`),
   then `registerRoutes(app)`.
4. **Error handling**: Sentry handler + a global error middleware.
5. **Frontend serving**: `setupVite` (HMR) in development; `serveStatic` (built assets)
   in production. ⚠️ Do not modify the Vite setup (`server/vite.ts`, `vite.config.ts`).
6. **Schedulers**: background POS polling + analytics jobs run only when
   `ENABLE_SCHEDULERS=true` (off by default).

## Request lifecycle

1. A React component calls a query/mutation through TanStack Query. The shared
   fetcher in `client/src/lib/queryClient.ts` builds the URL from the query key and,
   for location-scoped endpoints, appends `?locationId=<id>` from the current location.
2. The request passes through `clerkMiddleware` (identity) and
   `locationContextMiddleware` (attaches `req.locationId`).
3. The route handler in `server/routes/*` authenticates (`requireAuth`/`isAuthenticated`),
   authorizes (`requireLocationAccess` where needed), validates the body with a Zod
   schema, and calls a method on `storage`.
4. `DatabaseStorage` runs the Drizzle query against Neon and returns typed data.
5. JSON is returned; the frontend invalidates the relevant query key to refresh.

## Key conventions

- **All DB access goes through `server/storage.ts`.** Routes stay thin: authenticate,
  authorize, validate, delegate to `storage`.
- **Types are shared.** `shared/schema.ts` exports table types and `createInsertSchema`
  Zod schemas used by both frontend and backend.
- **Multi-tenancy is by location/owner**, enforced in `securityMiddleware.ts` and
  `locationContext.ts` — see [PERMISSIONS](PERMISSIONS.md).
