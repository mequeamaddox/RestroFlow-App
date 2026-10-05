# Billing & Subscriptions

Monetization is a freemium model: a free tier with limited OCR and a paid
**core** tier, plus a per-location **HR Management add-on**. Payments
run through **Stripe**.

> **Enterprise** is no longer a self-serve tier. Larger / multi-unit customers are
> directed to **contact sales** (`sales@restroflow.com`) for custom pricing.

## Plans

| Plan | Price | OCR credits | Notes |
|------|-------|-------------|-------|
| `free` | $0 | 5 / month | Default for new owners |
| `core` (RestroFlow Core) | $179 / mo | 999 (effectively unlimited) | Unlocks analytics/BI, P&L, all integrations, etc. |
| Enterprise | Custom (contact sales) | — | Not a self-serve plan; handled manually |

HR add-on: **$79 / location / month** on top of the base plan, gated by
`hrAddonEnabled` on each location. Annual billing applies a 20% discount across the
board (Core → $143/mo, HR add-on → $63/location/mo).

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
- `STRIPE_PRICE_CORE` — Stripe Price ID for the RestroFlow Core plan
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
  for the `core` plan and returns `{ checkoutUrl }`.
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

- Plan order: `['free', 'core']`.
- Allows the request if the user's `subscriptionPlan` index ≥ `minPlan` index.
- For any non-free `minPlan`, it additionally requires `subscriptionStatus` to be
  `active` or `past_due`.

Example: analytics routes such as `/api/analytics/profit-loss` and
`/api/analytics/business-intelligence` are gated with `requirePlan('core')`.

## OCR credits (freemium)

See [OCR](OCR.md). Credits live on the `users` table (`ocr_credits_used`,
`ocr_credits_limit`, default 5 for free, 999 for paid). `checkOcrAccess(userId)` gates
processing; `updateOcrCreditsUsed` increments after a successful run.

## Stripe integration plan and launch checks (2026-10-05)

The Stripe implementation planner recommends hosted subscription Checkout, flexible
billing mode, a customer portal, signature-verified lifecycle webhooks, and Smart
Retries with recovery emails. The connected Stripe session is **test mode**.
The existing application uses v1 Customers; retain that model rather than adopting
the planner's Accounts v2 portal example without a deliberate migration.

- Configure `STRIPE_SECRET_KEY`, `STRIPE_PRICE_CORE`, and `STRIPE_WEBHOOK_SECRET`
  from the **same account and environment**. Database platform setting
  `stripe_price_core` overrides the environment value; update it when switching modes.
- Configure recurring `STRIPE_PRICE_HR` and `STRIPE_PRICE_BAR` when locations have
  those add-ons enabled. Initial Checkout includes their owned-location quantities.
  **Post-purchase add-on toggles/location deletion are not yet synchronized with
  Stripe subscription item quantities.** Do not launch self-service add-on changes
  until that workflow includes payment confirmation and entitlement synchronization.
- Existing pricing documentation has free access, annual pricing, and add-ons;
  Checkout currently implements monthly Core plus enabled add-ons. Annual prices
  need a separate implementation. Verify the intended catalog before creating prices.
- Set admin `trial_days` to `0` for upfront payment without trials. No new trial is
  introduced by this change; the existing configurable trial setting is preserved.
- Confirm `APP_URL` is the canonical HTTPS app URL. Redirects no longer trust Host.
- Create an endpoint at `/api/billing/webhook` using the app's pinned Basil version.
  Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
  `invoice.payment_failed`, and (only if using trials) `customer.subscription.trial_will_end`.
- Webhook processing serializes by customer across replicas and records completion
  after durable updates. Failed updates remain retryable; a retry can repeat completed
  partial work, so subscription updates are assignments rather than increments.
  Emails remain best effort and may be repeated after a process crash.
- `unpaid` and `paused` map to inactive; `past_due` retains the existing recovery access
  policy. Configure Stripe recovery's final action to cancel or mark unpaid; a separate
  app-enforced grace deadline remains a follow-up if retaining `past_due` indefinitely.
- Configure the customer portal for payment method updates, invoice history,
  cancellation at period end, and approved product/price changes. Enable Smart Retries.
- Tax: confirm head office address, software product tax category, tax behavior,
  and applicable registrations. `STRIPE_AUTOMATIC_TAX=true` enables Checkout automatic
  tax after those settings are ready; default false avoids guessing tax obligations.
- Connect is a separate requirement only if RestroFlow moves money for restaurants,
  vendors, or other parties. Subscription revenue collected by RestroFlow uses the
  platform's own account. Confirm the intended third-party payment flow before building
  connected-account onboarding or creating connected accounts.

Before live launch, test payment success, delayed payment, declines/recovery,
concurrent Checkout requests, portal cancellation, out-of-order events, duplicate
webhook delivery, and a failed DB update followed by a retry. Use new live Customer,
Price, Subscription and webhook IDs/secrets; never reuse sandbox IDs in production.
Unit tests use mocks, so they do not establish live Stripe, database or portal readiness.
