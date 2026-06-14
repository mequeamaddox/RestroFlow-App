# Billing & Subscriptions

Monetization is a freemium model: a free tier with limited OCR, a paid
**professional** tier, and a per-location **HR Management add-on**. Payments run
through **Square**.

> ⚠️ **Known inconsistencies (verify before relying on numbers).** The codebase
> currently has more than one source of truth for pricing. Treat the figures below as
> "what the code says today," and consolidate them before launch:
> - Professional base price appears as **$179/mo** in `squareSubscriptionService.ts`
>   but **$99** in the `calculateSubscriptionTotal` helper in `billing.ts`.
> - HR add-on appears as **$79/location/mo** (`getHrAddonPricing`) but **$29/location**
>   in `calculateSubscriptionTotal`.
> - Square subscription *creation* is partially **mocked** (see `createSubscription` in
>   `squareSubscriptionService.ts`) and needs a real Square catalog before it charges.
> - Some **Stripe** code paths / `enterprise` references also exist; Square is the
>   active provider.

## Plans

| Plan | Price (per code) | OCR credits | Notes |
|------|------------------|-------------|-------|
| `free` | $0 | 5 | Default for new owners |
| `professional` | $99 / $179 (inconsistent) | 999 (effectively unlimited) | Unlocks analytics/BI, P&L, etc. |
| `enterprise` | referenced | — | Present in schemas/Stripe paths; not fully wired in Square |

HR add-on: per-location fee on top of the base plan, gated by `hrAddonEnabled` on each
location.

## Files

| File | Responsibility |
|------|----------------|
| `server/squareSubscriptionService.ts` | Square API calls: `createCustomer`, `createSubscription`, `verifyWebhookSignature`, `getHrAddonPricing` |
| `server/billingMiddleware.ts` | `requirePlan(minPlan)` route gating |
| `server/routes/billing.ts` | `/api/subscriptions/current`, `calculateSubscriptionTotal` helper |
| `server/routes/auth.ts` | `/api/user/subscription` (plan + OCR usage summary) |
| `shared/subscriptionSchemas.ts` | Plan/tier definitions and validation |
| `server/storage.ts` | OCR credit accounting (`checkOcrAccess`, `updateOcrCreditsUsed`, `resetOcrCredits`) |
| `client/src/components/subscription/upgrade-prompt.tsx` | Upgrade UI when limits hit |

## Square integration

Configured via secrets (request these before enabling billing):

- `SQUARE_ACCESS_TOKEN` — API bearer token
- `SQUARE_APPLICATION_ID`
- `SQUARE_ENVIRONMENT` — `sandbox` or `production` (selects the API base URL)
- `SQUARE_WEBHOOK_SIGNATURE_KEY` — verifies the `x-square-signature` header

> If these are absent the server logs `⚠️ Square credentials not configured -
> subscription features disabled` and billing is inert (the rest of the app runs fine).

Webhook signatures are verified using the raw request body captured in
`express.json`'s `verify` hook (see [ARCHITECTURE](ARCHITECTURE.md)).

## Endpoints

- **`GET /api/subscriptions/current`** (`billing.ts`) — current plan, status, next
  billing date, and `totalAmount` (base + HR add-on). `hrAddonLocations` is computed by
  filtering locations where `ownerId === req.user.id` **and** `hrAddonEnabled`.
- **`GET /api/user/subscription`** (`auth.ts`) — summary: `plan`, `status`,
  `ocrCreditsUsed`, `ocrCreditsLimit`, `hrAddonEnabled`, `hrAddonLocations`,
  `totalAmount`.

> ⚠️ **Tenant-safety rule:** location counts for billing **must** filter
> `loc.ownerId === userId`. Counting all locations bills an owner for other tenants'
> locations (this was a real bug — keep the `ownerId` filter on every count).

## Plan gating — `requirePlan`

`requirePlan(minPlan)` in `billingMiddleware.ts`:

- Plan order: `['free', 'professional', 'enterprise']`.
- Allows the request if the user's `subscriptionPlan` index ≥ `minPlan` index.
- For any non-free `minPlan`, it additionally requires `subscriptionStatus` to be
  `active` or `past_due`.

Example: analytics routes such as `/api/analytics/profit-loss` and
`/api/analytics/business-intelligence` are gated with `requirePlan('professional')`.

## OCR credits (freemium)

See [OCR](OCR.md). Credits live on the `users` table (`ocr_credits_used`,
`ocr_credits_limit`, default 5 for free, 999 for paid). `checkOcrAccess(userId)` gates
processing; `updateOcrCreditsUsed` increments after a successful run.
