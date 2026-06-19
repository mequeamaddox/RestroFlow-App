import type { Express } from 'express';
import { storage } from '../storage';
import { isAuthenticated, calculateSubscriptionTotal } from './helpers';
import { requireLocationAccess } from '../securityMiddleware';
import { sendEmail } from '../email';
import { isOwnerLevel } from '@shared/roles';
import {
  stripe,
  isStripeEnabled,
  createCheckoutSession,
  createPortalSession,
  cancelStripeSubscription,
  constructWebhookEvent,
  mapStripeStatusToPlan,
  type StripePlan,
} from '../stripeService';

export function registerBillingRoutes(app: Express): void {
  // ─── Sales Integration ────────────────────────────────────────────────────

  app.post('/api/sales/transactions', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const { locationId, totalAmount, paymentMethod, customerCount, posTransactionId, items } = req.body;
      if (!locationId || !totalAmount || !items || !Array.isArray(items))
        return res.status(400).json({ message: 'Missing required fields' });
      const transactionId = await storage.recordSalesTransaction(
        locationId, parseFloat(totalAmount), paymentMethod || 'cash',
        customerCount || 1, posTransactionId || null, items, req.user!.id,
      );
      res.json({ transactionId, message: 'Sales transaction recorded successfully' });
    } catch (error) {
      console.error('Error recording sales transaction:', error);
      res.status(500).json({ message: 'Failed to record sales transaction' });
    }
  });

  // ─── Subscriptions ────────────────────────────────────────────────────────

  app.get('/api/subscriptions/plans', async (_req, res) => {
    res.json({
      plans: [
        {
          id: 'core',
          name: 'RestroFlow Core',
          price: 179,
          billingCycle: 'MONTHLY',
          popular: true,
          locationLimit: 3,
          features: [
            'Up to 3 locations',
            'Unlimited OCR invoice processing',
            'Advanced image OCR (scanned invoices)',
            'Support for all file types (PDF, Images)',
            'Advanced analytics dashboard',
            'All POS/accounting integrations',
            'Budget tracking & variance analysis',
            'Theoretical vs actual reporting',
            'Menu engineering analysis',
            'Priority phone support',
            'API access',
          ],
        },
      ],
      hrAddon: {
        pricePerLocation: 79,
        description: 'HR Management Add-on — Employee scheduling, time tracking, payroll, and document management',
        features: [
          'Employee scheduling & time tracking',
          'Digital document management',
          'Payroll processing & pay stubs',
          'Performance reviews & evaluations',
          'Time-off request management',
          'Task assignment & completion tracking',
          'Internal messaging system',
          'HR analytics & reporting',
        ],
      },
      barAddon: {
        pricePerLocation: 79,
        description: 'Bar & Beverage Add-on — Cocktail recipe costing, pour cost analysis, and liquor inventory',
        features: [
          'Liquor inventory tracking by oz/ml',
          'Cocktail recipe costing',
          'Pour cost & variance analysis',
          'Beverage waste tracking',
          'Happy hour pricing tools',
          'Beverage menu management',
          'Bar-specific analytics & reporting',
        ],
      },
      stripeEnabled: isStripeEnabled,
    });
  });

  app.get('/api/subscriptions/current', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      if (!isOwnerLevel(user?.role))
        return res.status(403).json({ message: 'Access denied. Only business owners can access subscription information.' });
      if (!user) return res.status(404).json({ message: 'User not found' });
      const allLocations = await storage.getLocations();
      // Tenant-aware: only count THIS owner's locations, never other tenants'
      const ownedLocations = allLocations.filter((loc: any) => loc.ownerId === userId);
      const hrAddonLocations = ownedLocations.filter((loc: any) => loc.hrAddonEnabled).length;
      const barAddonLocations = ownedLocations.filter((loc: any) => loc.barAddonEnabled).length;
      res.json({
        id: user.stripeSubscriptionId || user.id,
        plan: user.subscriptionPlan || 'free',
        status: user.subscriptionStatus || 'inactive',
        nextBillingDate: user.subscriptionEndDate?.toISOString(),
        totalAmount: calculateSubscriptionTotal(user.subscriptionPlan, hrAddonLocations, barAddonLocations),
        hrAddonLocations,
        barAddonLocations,
        locationCount: ownedLocations.length,
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: user.stripeSubscriptionId,
        createdAt: user.createdAt?.toISOString(),
      });
    } catch (error: any) {
      console.error('Error fetching current subscription:', error);
      res.status(500).json({ message: 'Failed to fetch current subscription', error: error.message });
    }
  });


  app.post('/api/subscriptions/cancel', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getSubscriptionByUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      if (!isOwnerLevel(user.role))
        return res.status(403).json({ message: 'Access denied. Only business owners can cancel subscriptions.' });
      if (user.stripeSubscriptionId && isStripeEnabled) {
        await cancelStripeSubscription(user.stripeSubscriptionId, false);
        return res.json({ success: true, message: 'Your subscription will be cancelled at the end of the current billing period.' });
      }
      await storage.updateUserSubscription(userId, { subscriptionStatus: 'cancelled', hrAddonEnabled: false, ocrCreditsLimit: 5 });
      res.json({ success: true, message: 'Subscription cancelled successfully' });
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      if (error.name === 'ZodError') return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
      res.status(500).json({ message: 'Failed to cancel subscription', error: error.message });
    }
  });

  // ─── Owner Onboarding ─────────────────────────────────────────────────────

  app.get('/api/owner-onboarding/progress', isAuthenticated, async (req, res) => {
    try {
      if (!isOwnerLevel(req.user!.role))
        return res.status(403).json({ message: 'Access denied. Onboarding is only available to business owners.' });
      const onboarding = await storage.getOwnerOnboarding(req.user!.id);
      res.json(onboarding || { userId: req.user!.id, isCompleted: false, currentStep: 'restaurant_info', completedSteps: 0, totalSteps: 5, data: {} });
    } catch (error: any) {
      // If the table doesn't exist yet (first deploy before drizzle-kit push), return the default.
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        return res.json({ userId: req.user!.id, isCompleted: false, currentStep: 'restaurant_info', completedSteps: 0, totalSteps: 5, data: {} });
      }
      console.error('Error fetching onboarding progress:', error);
      res.status(500).json({ message: 'Failed to fetch onboarding progress' });
    }
  });

  app.post('/api/owner-onboarding/start', isAuthenticated, async (req, res) => {
    try {
      if (!isOwnerLevel(req.user!.role))
        return res.status(403).json({ message: 'Access denied. Onboarding is only available to business owners.' });
      let onboarding = await storage.getOwnerOnboarding(req.user!.id);
      if (!onboarding) {
        onboarding = await storage.createOwnerOnboarding({ userId: req.user!.id, isCompleted: false, currentStep: 'restaurant_info', totalSteps: 5, completedSteps: 0, skippedSteps: [], data: {} });
      }
      res.status(201).json(onboarding);
    } catch (error) {
      console.error('Error starting onboarding:', error);
      res.status(500).json({ message: 'Failed to start onboarding' });
    }
  });

  app.put('/api/owner-onboarding/step', isAuthenticated, async (req, res) => {
    try {
      if (!isOwnerLevel(req.user!.role))
        return res.status(403).json({ message: 'Access denied. Onboarding is only available to business owners.' });
      const { stepName, stepData, status = 'completed' } = req.body;
      const onboarding = await storage.updateOwnerOnboardingStep(req.user!.id, stepName, stepData, status);
      res.json(onboarding);
    } catch (error) {
      console.error('Error updating onboarding step:', error);
      res.status(500).json({ message: 'Failed to update onboarding step' });
    }
  });

  app.post('/api/owner-onboarding/complete', isAuthenticated, async (req, res) => {
    try {
      if (!isOwnerLevel(req.user!.role))
        return res.status(403).json({ message: 'Access denied. Onboarding is only available to business owners.' });
      const onboarding = await storage.completeOwnerOnboarding(req.user!.id);
      res.json(onboarding);
    } catch (error) {
      console.error('Error completing onboarding:', error);
      res.status(500).json({ message: 'Failed to complete onboarding' });
    }
  });

  // ─── Stripe Billing ───────────────────────────────────────────────────────

  app.post('/api/billing/checkout', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { plan } = req.body;
      if (plan !== 'core')
        return res.status(400).json({ message: 'Invalid plan. Must be core.' });
      if (!isStripeEnabled)
        return res.status(503).json({ message: 'Stripe billing is not yet configured. Please contact support.', configured: false });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const host = `${req.protocol}://${req.get('host')}`;
      const trialDays = req.body.trialDays ? parseInt(req.body.trialDays) : undefined;
      const checkoutUrl = await createCheckoutSession({
        userId, email: user.email!, plan: plan as StripePlan, stripeCustomerId: user.stripeCustomerId,
        successUrl: `${host}/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${host}/subscription`,
        ...(trialDays && trialDays > 0 ? { trialDays } : {}),
      });
      res.json({ checkoutUrl });
    } catch (error: any) {
      console.error('Stripe checkout error:', error);
      res.status(500).json({ message: error.message || 'Failed to create checkout session' });
    }
  });

  app.post('/api/billing/portal', isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user?.stripeCustomerId)
        return res.status(400).json({ message: 'No Stripe billing account found. Please subscribe first.' });
      if (!isStripeEnabled) return res.status(503).json({ message: 'Stripe billing is not configured.' });
      const host = `${req.protocol}://${req.get('host')}`;
      const portalUrl = await createPortalSession({ stripeCustomerId: user.stripeCustomerId, returnUrl: `${host}/subscription` });
      res.json({ portalUrl });
    } catch (error: any) {
      console.error('Stripe portal error:', error);
      res.status(500).json({ message: error.message || 'Failed to open billing portal' });
    }
  });

  app.post('/api/billing/webhook', async (req: any, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret || !isStripeEnabled) {
      console.warn('Stripe webhook received but STRIPE_WEBHOOK_SECRET not configured');
      return res.status(200).json({ received: true });
    }
    let event;
    try {
      event = constructWebhookEvent(req.rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }
    // C1: Idempotency — skip already-processed Stripe events
    if (await storage.hasProcessedWebhook(event.id)) {
      return res.json({ received: true });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as any;
          const { userId, plan } = session.metadata || {};
          if (userId && plan) {
            await storage.updateUserSubscription(userId, {
              subscriptionPlan: plan as 'core',
              subscriptionStatus: 'active',
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              ocrCreditsLimit: 999,
            });
          }
          break;
        }
        case 'customer.subscription.updated': {
          const sub = event.data.object as any;
          const { userId } = sub.metadata || {};
          const mappedStatus = mapStripeStatusToPlan(sub.status);
          const priceId: string = sub.items?.data?.[0]?.price?.id;
          let plan: 'core' | undefined;
          if (priceId === process.env.STRIPE_PRICE_CORE) plan = 'core';
          if (userId) {
            await storage.updateUserSubscription(userId, {
              ...(plan ? { subscriptionPlan: plan, ocrCreditsLimit: 999 } : {}),
              subscriptionStatus: mappedStatus,
            });
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as any;
          const { userId } = sub.metadata || {};
          if (userId) {
            await storage.updateUserSubscription(userId, {
              subscriptionPlan: 'free', subscriptionStatus: 'inactive',
              stripeSubscriptionId: undefined, ocrCreditsLimit: 5,
            });
            // C2: Disable HR addon on all locations owned by this user when subscription is cancelled
            const allLocations = await storage.getLocations();
            const ownedLocations = allLocations.filter((loc: any) => loc.ownerId === userId);
            await Promise.all(ownedLocations.map((loc: any) =>
              storage.updateLocation(loc.id, { hrAddonEnabled: false }),
            ));
          }
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object as any;
          if (invoice.customer && stripe) {
            try {
              const subscriptions = await stripe.subscriptions.list({ customer: invoice.customer, limit: 1 });
              const sub = subscriptions.data[0];
              if (sub?.metadata?.userId) {
                await storage.updateUserSubscription(sub.metadata.userId, { subscriptionStatus: mapStripeStatusToPlan(sub.status) });
              }
            } catch (e) { console.error('Failed to refresh subscription after invoice.paid:', e); }
          }
          break;
        }
        case 'customer.subscription.trial_will_end': {
          const sub = event.data.object as any;
          const { userId } = sub.metadata || {};
          let email = sub.customer_email;
          if (!email && userId) {
            const u = await storage.getUser(userId);
            email = u?.email ?? '';
          }
          if (email) {
            const trialEndDate = new Date(sub.trial_end * 1000).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const appUrl = process.env.APP_URL || 'https://app.restroflow.com';
            await sendEmail({
              to: email, from: 'billing@restroflow.com', subject: 'Your RestroFlow trial ends soon',
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h2 style="color:#f97316;">Your free trial ends on ${trialEndDate}</h2><p>After your trial ends, you'll be charged automatically based on your chosen plan. No action needed if you'd like to continue — your card on file will be billed.</p><p>To update your payment method or cancel before the trial ends, visit your billing portal.</p><a href="${appUrl}/subscription" style="display:inline-block;background:#f97316;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0;">Manage Subscription →</a></div>`,
            }).catch(e => console.error('Failed to send trial-ending email:', e));
          }
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as any;
          if (invoice.customer_email) {
            const appUrl = process.env.APP_URL || 'https://app.restroflow.com';
            await sendEmail({
              to: invoice.customer_email, from: 'billing@restroflow.com', subject: 'Action Required: Payment Failed for RestroFlow',
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;"><div style="background:#ef444420;border:1px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:24px;"><h2 style="color:#ef4444;margin:0 0 8px;">⚠️ Payment Failed</h2><p style="margin:0;color:#374151;">We were unable to process your RestroFlow subscription payment.</p></div><p>To keep your account active, please update your payment method.</p><a href="${appUrl}/subscription" style="display:inline-block;background:#f97316;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0;">Update Payment Method →</a><p style="color:#6b7280;font-size:13px;margin-top:24px;">Questions? Contact <a href="mailto:support@restroflow.com">support@restroflow.com</a></p></div>`,
            }).catch(e => console.error('Failed to send dunning email:', e));
          }
          break;
        }
        default:
          console.log(`Unhandled Stripe event: ${event.type}`);
      }
      // C1: Record event ID so retries are deduplicated
      await storage.markWebhookProcessed(event.id, {
        provider: 'stripe',
        integrationId: event.type,
        receivedAt: new Date().toISOString(),
      });
      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook processing error:', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
}
