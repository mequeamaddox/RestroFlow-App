import Stripe from 'stripe';
import { createHash } from 'node:crypto';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2025-08-27.basil' })
  : null;

export const isStripeEnabled = !!stripe;

export const PLANS = {
  core: {
    name: 'RestroFlow Core',
    priceId: process.env.STRIPE_PRICE_CORE || '',
    amount: 17900,
    ocrLimit: 999,
  },
} as const;

export type StripePlan = keyof typeof PLANS;

export async function createCheckoutSession(params: {
  userId: string;
  email: string;
  plan: StripePlan;
  stripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  priceIdOverride?: string;
  addonItems?: Array<{ price: string; quantity: number }>;
}): Promise<string> {
  if (!stripe) throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY.');
  const plan = PLANS[params.plan];
  const priceId = params.priceIdOverride || plan.priceId;
  if (!priceId) {
    throw new Error(
      `Price ID for ${params.plan} is not configured. Set STRIPE_PRICE_${params.plan.toUpperCase()} or update it in Admin → Platform Settings.`
    );
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }, ...(params.addonItems || [])],
    automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === 'true' },
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { userId: params.userId, plan: params.plan },
    subscription_data: {
      metadata: { userId: params.userId, plan: params.plan },
      billing_mode: { type: 'flexible' },
      ...(params.trialDays ? { trial_period_days: params.trialDays } : {}),
    },
    allow_promotion_codes: true,
  };

  if (params.stripeCustomerId) {
    sessionParams.customer = params.stripeCustomerId;
    sessionParams.customer_update = { address: 'auto', name: 'auto' };
  } else {
    sessionParams.customer_email = params.email;
  }

  const fingerprint = createHash('sha256').update(JSON.stringify(sessionParams)).digest('hex').slice(0, 24);
  const session = await stripe.checkout.sessions.create(sessionParams, {
    idempotencyKey: `checkout:${params.userId}:${fingerprint}:${Math.floor(Date.now() / 300000)}`,
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return session.url;
}

export async function cancelStripeSubscription(
  subscriptionId: string,
  immediately = false
): Promise<Stripe.Subscription> {
  if (!stripe) throw new Error('Stripe is not configured.');
  if (immediately) {
    return stripe.subscriptions.cancel(subscriptionId);
  }
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

export async function createPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<string> {
  if (!stripe) throw new Error('Stripe is not configured.');
  const session = await stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
  return session.url;
}

export function constructWebhookEvent(
  payload: Buffer,
  sig: string,
  secret: string
): Stripe.Event {
  if (!stripe) throw new Error('Stripe is not configured.');
  return stripe.webhooks.constructEvent(payload, sig, secret);
}

export function mapStripeStatusToPlan(
  status: Stripe.Subscription.Status
): 'active' | 'inactive' | 'cancelled' | 'past_due' {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'unpaid':
    case 'paused':
      return 'inactive';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    default:
      return 'inactive';
  }
}

/** Basil moved billing periods onto subscription items. */
export function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | undefined {
  const ends = sub.items.data.map(item => item.current_period_end).filter(Boolean);
  return ends.length ? new Date(Math.min(...ends) * 1000) : undefined;
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const sub = invoice.parent?.subscription_details?.subscription;
  return typeof sub === 'string' ? sub : sub?.id;
}
