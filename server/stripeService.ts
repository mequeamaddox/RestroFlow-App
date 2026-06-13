import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  : null;

export const isStripeEnabled = !!stripe;

export const PLANS = {
  professional: {
    name: 'Professional',
    priceId: process.env.STRIPE_PRICE_PROFESSIONAL || '',
    amount: 17900,
    ocrLimit: 999,
  },
  enterprise: {
    name: 'Enterprise',
    priceId: process.env.STRIPE_PRICE_ENTERPRISE || '',
    amount: 39900,
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
}): Promise<string> {
  if (!stripe) throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY.');
  const plan = PLANS[params.plan];
  if (!plan.priceId) {
    throw new Error(
      `Price ID for ${params.plan} is not configured. Set STRIPE_PRICE_${params.plan.toUpperCase()}.`
    );
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { userId: params.userId, plan: params.plan },
    subscription_data: {
      metadata: { userId: params.userId, plan: params.plan },
      ...(params.trialDays ? { trial_period_days: params.trialDays } : {}),
    },
    allow_promotion_codes: true,
  };

  if (params.stripeCustomerId) {
    sessionParams.customer = params.stripeCustomerId;
  } else {
    sessionParams.customer_email = params.email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
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
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    default:
      return 'inactive';
  }
}
