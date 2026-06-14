# Billing & Subscriptions

Monetization is a freemium model: a free tier with limited OCR and a paid
**professional** (Core) tier, plus a per-location **HR Management add-on**. Payments
run through **Stripe**.

> **Enterprise** is no longer a self-serve tier. Larger / multi-unit customers are
> directed to **contact sales** (`sales@restroflow.com`) for custom pricing.

## Plans

| Plan | Price | OCR credits | Notes |
|------|-------|-------------|-------|
| `free` | $0 | 5 / month | Default for new owners |
| `professional` (Core) | $179 / mo | 999 (effectively unlimited) | Unlocks analytics/BI, P&L, all integrations, etc. |
| Enterprise | Custom (contact sales) | — | Not a self-serve plan; handled manually |

HR add-on: **$79 / location / month** on top of the base plan, gated by
`hrAddonEnabled` on each location. Annual billing applies a 20% discount across the
board (Professional → $143/mo, HR add-on → $63/location/mo).

## Files

| File | Responsibility |
|------|----------------|
| `server/stripeService.ts` | Stripe SDK setup, `PLANS` definition, `createCheckoutSession`, `createBillingPortalSession` |
| `server/billingMiddleware.ts` | `requirePlan(minPlan)` route gating |
| `server/routes/billing.ts` | `/api/subscriptions/plans`, `/api/subscriptions/current`, `/api/billing/checkout`, `/api/billing/portal`, Stripe webhook |
| `server/routes/auth.ts` | `/api/user/subscription` (plan + OCR usage summary) |
| `shared/subscriptionSchemas.ts` | Plan/tier definitions and validation |
| `server/routes/helpers.ts` | `PLAN_BASE_PRICE`, `calculateSubscriptionTotal`, `checkOcrAccess` |
| `server/storage.ts` | OCR credit accounting (`checkOcrAccess`, `updateOcrCreditsUsed`, `resetOcrCredits`) |
| `client/src/pages/pricing.tsx` | Public pricing page |
| `client/src/pages/subscription.tsx` | In-app subscription management |

## Stripe integration

Configured via secrets (request these before enabling billing):

- `STRIPE_SECRET_KEY` — server-side API key
- `STRIPE_PRICE_PROFESSIONAL` — Stripe Price ID for the Professional plan
- `STRIPE_WEBHOOK_SECRET` — verifies the `stripe-signature` header

> If `STRIPE_SECRET_KEY` is absent, `isStripeEnabled` is `false`: the subscription
> plans still render for preview, but checkout returns a "billing not configured"
> message and the rest of the app runs fine.

Webhook signatures are verified using the raw request body captured in
`express.json`'s `verify` hook (see [ARCHITECTURE](ARCHITECTURE.md)).

## Endpoints

- **`GET /api/subscriptions/plans`** (`billing.ts`) — static plan + HR add-on catalog
  and `stripeEnabled` flag (no auth required; used by the pricing page).
- **`POST /api/billing/checkout`** (`billing.ts`) — creates a Stripe Checkout session
  for the `professional` plan and returns `{ checkoutUrl }`.
- **`POST /api/billing/portal`** (`billing.ts`) — opens the Stripe billing portal for
  the user's `stripeCustomerId`.
- **`GET /api/subscriptions/current`** (`billing.ts`) — current plan, status, next
  billing date, and `totalAmount` (base + HR add-on). `hrAddonLocations` is computed by
  filtering locations where `ownerId === req.user.id` **and** `hrAddonEnabled`.
- **`GET /api/user/subscription`** (`auth.ts`) — summary: `plan`, `status`,
  `ocrCreditsUsed`, `ocrCreditsLimit`, `hrAddonEnabled`, `hrAddonLocations`,
  `totalAmount`.
- **`POST /api/billing/webhook`** (`billing.ts`) — Stripe webhook; updates the user's
  plan/status on `checkout.session.completed` and `customer.subscription.*` events.

> ⚠️ **Tenant-safety rule:** location counts for billing **must** filter
> `loc.ownerId === userId`. Counting all locations bills an owner for other tenants'
> locations (this was a real bug — keep the `ownerId` filter on every count).

## Plan gating — `requirePlan`

`requirePlan(minPlan)` in `billingMiddleware.ts`:

- Plan order: `['free', 'professional']`.
- Allows the request if the user's `subscriptionPlan` index ≥ `minPlan` index.
- For any non-free `minPlan`, it additionally requires `subscriptionStatus` to be
  `active` or `past_due`.

Example: analytics routes such as `/api/analytics/profit-loss` and
`/api/analytics/business-intelligence` are gated with `requirePlan('professional')`.

## OCR credits (freemium)

See [OCR](OCR.md). Credits live on the `users` table (`ocr_credits_used`,
`ocr_credits_limit`, default 5 for free, 999 for paid). `checkOcrAccess(userId)` gates
processing; `updateOcrCreditsUsed` increments after a successful run.
