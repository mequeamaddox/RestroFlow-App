import { db } from '../db';
import { z } from 'zod';
import { saveCompanyStep, finishCompanySetup, parseCompanyStep, setupBillingKey, CompanySetupError } from '../companyOnboarding';
import { executePlatformChange } from '../executePlatformChange';
import { InvitationEmailService } from '../invitationEmailService';
import type { Express } from 'express';
import type Stripe from 'stripe';
import { withBillingLock, processBillingEvent } from '../billingLock';
import { storage } from '../storage';
import { isAuthenticated, calculateSubscriptionTotal } from './helpers';
import { requireLocationAccess } from '../securityMiddleware';
import { sendEmail } from '../email';
import { sendWelcomeEmail, sendInvoiceReceiptEmail } from '../transactionalEmails';
import { isOwnerLevel } from '@shared/roles';
import {
  stripe,
  isStripeEnabled,
  createCheckoutSession,
  createPortalSession,
  cancelStripeSubscription,
  constructWebhookEvent,
  mapStripeStatusToPlan,
  subscriptionPeriodEnd,
  invoiceSubscriptionId,
  type StripePlan,
} from '../stripeService';

export function registerBillingRoutes(app: Express): void {
  // ─── Sales Integration ────────────────────────────────────────────────────

  // shadowed by inventory.ts — keeping for reference
  // app.post('/api/sales/transactions', isAuthenticated, requireLocationAccess(), async (req, res) => {
  //   try {
  //     const { locationId, totalAmount, paymentMethod, customerCount, posTransactionId, items } = req.body;
  //     if (!locationId || !totalAmount || !items || !Array.isArray(items))
  //       return res.status(400).json({ message: 'Missing required fields' });
  //     const transactionId = await storage.recordSalesTransaction(
  //       locationId, parseFloat(totalAmount), paymentMethod || 'cash',
  //       customerCount || 1, posTransactionId || null, items, req.user!.id,
  //     );
  //     res.json({ transactionId, message: 'Sales transaction recorded successfully' });
  //   } catch (error) {
  //     console.error('Error recording sales transaction:', error);
  //     res.status(500).json({ message: 'Failed to record sales transaction' });
  //   }
  // });

  // ─── Subscriptions ────────────────────────────────────────────────────────

  app.get('/api/subscriptions/plans', async (_req, res) => {
    const [corePriceDb, hrAddonPriceDb, barAddonPriceDb] = await Promise.all([
      storage.getPlatformSetting('core_plan_price'),
      storage.getPlatformSetting('hr_addon_price'),
      storage.getPlatformSetting('bar_addon_price'),
    ]);
    const corePrice = corePriceDb ? parseInt(corePriceDb) : 179;
    const hrAddonPrice = hrAddonPriceDb ? parseInt(hrAddonPriceDb) : 79;
    const barAddonPrice = barAddonPriceDb ? parseInt(barAddonPriceDb) : 79;

    res.json({
      plans: [
        {
          id: 'core',
          name: 'RestroFlow Core',
          price: corePrice,
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
        pricePerLocation: hrAddonPrice,
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
        pricePerLocation: barAddonPrice,
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
      const ownedLocations = await storage.getLocations(userId);
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
        createdAt: user.createdAt?.toISOString(),
        hasBillingAccount: !!user.stripeCustomerId,
      });
    } catch (error: any) {
      console.error('Error fetching current subscription:', error);
      res.status(500).json({ message: 'Failed to fetch current subscription' });
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
      const onboarding = await withBillingLock(`company-setup-start:${req.user!.id}`,async () => {
        const existing = await storage.getOwnerOnboarding(req.user!.id);
        return existing || storage.createOwnerOnboarding({ userId: req.user!.id, isCompleted: false, currentStep: 'restaurant_info', totalSteps: 5, completedSteps: 0, skippedSteps: [], data: {} });
      });
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
      const request = parseCompanyStep(req.body);
      const ownerId = req.user!.id;
      if (request.stepName === 'hr_addon' && request.status === 'completed') {
        const selection = request.stepData as { enableHR: boolean; enableForLocations?: string[] };
        if (selection.enableHR) {
          const progress = await storage.getOwnerOnboarding(ownerId);
          if (!(progress?.data as any)?.restaurant_info?.locationId) throw new CompanySetupError('Complete restaurant setup first.');
          if (!selection.enableForLocations?.length) throw new CompanySetupError('Choose at least one restaurant for HR.');
          const owned = await storage.getLocations(ownerId);
          const targets = selection.enableForLocations.map(id => owned.find(l => l.id === id && l.isActive && !l.deletedAt));
          if (targets.some(l => !l)) throw new CompanySetupError('Choose active restaurants owned by your company.');
          for (const target of targets) {
            if (target!.hrAddonEnabled) continue;
            await executePlatformChange(ownerId, { action:'addons', ownerId, locationId:target!.id, hrAddonEnabled:true, barAddonEnabled:!!target!.barAddonEnabled, requestKey:setupBillingKey(progress!.id,target!.id), reason:'HR activated during company onboarding' });
          }
        }
      }
      const { progress, invitations } = await saveCompanyStep(db,ownerId,request);
      const invitationResults = [];
      if (invitations.length) {
        const owner = await storage.getUser(ownerId);
        const location = await storage.getLocationById(invitations[0].locationId);
        const inviter = `${owner?.firstName || ''} ${owner?.lastName || ''}`.trim() || 'Your manager';
        const origin = (process.env.APP_URL || 'https://restroflowsolutions.com').replace(/\/$/,'');
        for (const invitation of invitations) {
          let emailSent = false;
          try { emailSent = await InvitationEmailService.sendInvitationEmail(invitation,inviter,location?.name || 'RestroFlow',location?.name); }
          catch (error) { console.error('Onboarding invitation email failed:',error); }
          invitationResults.push({email:invitation.email,emailSent,invitationUrl:`${origin}/invitation/accept/${invitation.token}`});
        }
      }
      res.json({ ...progress, invitationResults });
    } catch (error) {
      console.error('Error updating onboarding step:', error);
      res.status(400).json({ message: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : 'Failed to update onboarding step' });
    }
  });

  app.post('/api/owner-onboarding/complete', isAuthenticated, async (req, res) => {
    try {
      if (!isOwnerLevel(req.user!.role))
        return res.status(403).json({ message: 'Access denied. Onboarding is only available to business owners.' });
      const onboarding = await finishCompanySetup(db,req.user!.id);
      res.json(onboarding);
    } catch (error) {
      console.error('Error completing onboarding:', error);
      res.status(error instanceof CompanySetupError ? 400 : 500).json({ message: error instanceof CompanySetupError ? error.message : 'Failed to complete onboarding' });
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

      // Respect billing_enabled flag set in platform admin
      const billingEnabled = await storage.getPlatformSetting('billing_enabled');
      if (billingEnabled === 'false')
        return res.status(503).json({ message: 'Billing is temporarily disabled. Please try again later.', configured: false });

      const checkoutUrl = await withBillingLock(`stripe-checkout:${userId}`, async () => {
        const user = await storage.getUser(userId);
        if (!user || !isOwnerLevel(user.role)) throw new Error('Only business owners can manage billing.');
        if (!stripe) throw new Error('Stripe billing is not configured.');
        if (!user.stripeCustomerId) {
          const customer = await stripe.customers.create({ email: user.email!, metadata: { userId } }, { idempotencyKey: `restroflow-customer:${userId}` });
          await storage.updateUserSubscription(userId, { stripeCustomerId: customer.id });
          user.stripeCustomerId = customer.id;
        }
        const existing = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'all', limit: 100 });
        if (existing.data.some(sub => !['canceled', 'incomplete_expired'].includes(sub.status))) {
          throw new Error('You already have a subscription. Use Manage Billing to update it.');
        }
        const openSessions = await stripe.checkout.sessions.list({ customer: user.stripeCustomerId, status: 'open', limit: 100 });
        const open = openSessions.data.find(session => session.mode === 'subscription' && session.metadata?.userId === userId && session.url);
        if (open?.url) return open.url;
        const host = billingOrigin();

        // trial_days and stripe_price_core: server-only settings — never accept from client
        const [trialDaysSetting, stripePriceCoreDb] = await Promise.all([
          storage.getPlatformSetting('trial_days'),
          storage.getPlatformSetting('stripe_price_core'),
        ]);
        const trialDays = trialDaysSetting !== null ? parseInt(trialDaysSetting) : undefined;

        const ownedLocations = await storage.getLocations(userId);
        const addonItems = [];
        for (const [flag, env] of [['hrAddonEnabled', 'STRIPE_PRICE_HR'], ['barAddonEnabled', 'STRIPE_PRICE_BAR']] as const) {
          const quantity = ownedLocations.filter(location => location[flag]).length;
          if (quantity) {
            const price = await storage.getPlatformSetting(env==='STRIPE_PRICE_HR'?'stripe_price_hr':'stripe_price_bar') || process.env[env];
            if (!price) throw new Error(`Configure ${env} before billing enabled add-ons.`);
            addonItems.push({ price, quantity });
          }
        }
        return createCheckoutSession({
          addonItems, userId, email: user.email!, plan: plan as StripePlan, stripeCustomerId: user.stripeCustomerId,
          successUrl: `${host}/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${host}/subscription`,
          ...(trialDays && trialDays > 0 ? { trialDays } : {}),
          ...(stripePriceCoreDb ? { priceIdOverride: stripePriceCoreDb } : {}),
        });
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
      if (!isOwnerLevel(user?.role)) return res.status(403).json({ message: 'Only business owners can manage billing.' });
      if (!user?.stripeCustomerId)
        return res.status(400).json({ message: 'No Stripe billing account found. Please subscribe first.' });
      if (!isStripeEnabled) return res.status(503).json({ message: 'Stripe billing is not configured.' });
      const host = billingOrigin();
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
      return res.status(400).json({ received: false, error: 'Webhook not configured' });
    }
    let event;
    try {
      event = constructWebhookEvent(req.rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }
    try {
      const customer = (event.data.object as any).customer;
      const customerId = typeof customer === 'string' ? customer : customer?.id;
      await processBillingEvent(`stripe-events:${customerId || event.id}`,
        () => storage.hasProcessedWebhook(event.id), async () => {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object as any;
          const { userId, plan } = session.metadata || {};
          if (userId && plan) {
            if (!stripe || !session.subscription || plan !== 'core') throw new Error('Invalid subscription checkout.');
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            const user = await storage.getUser(userId);
            if(user?.accountState==='deleted' || sub.status==='canceled' || sub.status==='incomplete_expired') break;
            if (user?.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id) break;
            const status = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
              ? mapStripeStatusToPlan(sub.status) : 'inactive';
            await storage.updateUserSubscription(userId, {
              subscriptionPlan: 'core',
              subscriptionStatus: status,
              subscriptionEndDate: subscriptionPeriodEnd(sub),
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              ocrCreditsLimit: 999,
            });
            const u = await storage.getUser(userId);
            if (u?.email) {
              sendWelcomeEmail(u.email, u.firstName ?? undefined)
                .catch(e => console.error('Failed to send welcome email:', e));
            }
          }
          break;
        }
        case 'customer.subscription.updated': {
          const sub = await stripe!.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
          const { userId } = sub.metadata || {};
          if(sub.status==='canceled' || sub.status==='incomplete_expired') break;
          const mappedStatus = mapStripeStatusToPlan(sub.status);
          const priceId: string = sub.items?.data?.[0]?.price?.id;
          // Read stripe_price_core from DB admin settings; fall back to env var
          const stripePriceCoreDb = await storage.getPlatformSetting('stripe_price_core');
          const stripePriceCore = stripePriceCoreDb || process.env.STRIPE_PRICE_CORE;
          let plan: 'core' | undefined;
          if (priceId && stripePriceCore && priceId === stripePriceCore) plan = 'core';
          if (userId) {
            const user = await storage.getUser(userId);
            if (user?.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id) break;
            await storage.updateUserSubscription(userId, {
              ...(plan ? { subscriptionPlan: plan, ocrCreditsLimit: 999 } : {}),
              stripeSubscriptionId: sub.id,
              subscriptionStatus: mappedStatus,
              subscriptionEndDate: subscriptionPeriodEnd(sub),
            });
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = await stripe!.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
          const { userId } = sub.metadata || {};
          if (userId) {
            const user = await storage.getUser(userId);
            if (user?.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id) break;
            await storage.updateUserSubscription(userId, {
              subscriptionPlan: 'free', subscriptionStatus: 'inactive',
              stripeSubscriptionId: null, ocrCreditsLimit: 5,
              subscriptionEndDate: subscriptionPeriodEnd(sub),
            });
            // C2: Disable HR addon on all locations owned by this user when subscription is cancelled
            const ownedLocations = await storage.getLocations(userId);
            await Promise.all(ownedLocations.map((loc: any) =>
              storage.updateLocation(loc.id, { hrAddonEnabled: false, barAddonEnabled: false }),
            ));
          }
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object as any;
          if (invoice.customer && stripe) {
            try {
              const subscriptionId = invoiceSubscriptionId(invoice);
              const sub = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : undefined;
              if (sub?.metadata?.userId) {
                const user = await storage.getUser(sub.metadata.userId);
                if (user?.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id) break;
                await storage.updateUserSubscription(sub.metadata.userId, { subscriptionStatus: mapStripeStatusToPlan(sub.status) });
              }
              if (invoice.customer_email) {
                const periodStart = new Date(invoice.period_start * 1000);
                const periodEnd = new Date(invoice.period_end * 1000);
                sendInvoiceReceiptEmail(invoice.customer_email, {
                  invoiceNumber: invoice.number || invoice.id,
                  amountPaid: invoice.amount_paid / 100,
                  currency: invoice.currency,
                  periodStart,
                  periodEnd,
                  invoiceUrl: invoice.hosted_invoice_url,
                  plan: sub?.metadata?.plan,
                }).catch(e => console.error('Failed to send invoice receipt email:', e));
              }
            } catch (e) { console.error('Failed to refresh subscription after invoice.paid:', e); throw e; }
          }
          break;
        }
        case 'customer.subscription.trial_will_end': {
          const sub = await stripe!.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
          const { userId } = sub.metadata || {};
          let email = '';
          if (!email && userId) {
            const u = await storage.getUser(userId);
            email = u?.email ?? '';
          }
          if (email) {
            const trialEndDate = new Date((sub.trial_end || 0) * 1000).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const appUrl = process.env.APP_URL || 'https://restroflowsolutions.com';
            await sendEmail({
              to: email, from: process.env.FROM_EMAIL || 'noreply@restroflowsolutions.com', subject: 'Your RestroFlow trial ends soon',
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h2 style="color:#f97316;">Your free trial ends on ${trialEndDate}</h2><p>After your trial ends, you'll be charged automatically based on your chosen plan. No action needed if you'd like to continue — your card on file will be billed.</p><p>To update your payment method or cancel before the trial ends, visit your billing portal.</p><a href="${appUrl}/subscription" style="display:inline-block;background:#f97316;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0;">Manage Subscription →</a></div>`,
            }).catch(e => console.error('Failed to send trial-ending email:', e));
          }
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as any;
          if (invoice.customer_email) {
            const appUrl = process.env.APP_URL || 'https://restroflowsolutions.com';
            await sendEmail({
              to: invoice.customer_email, from: process.env.FROM_EMAIL || 'noreply@restroflowsolutions.com', subject: 'Action Required: Payment Failed for RestroFlow',
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;"><div style="background:#ef444420;border:1px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:24px;"><h2 style="color:#ef4444;margin:0 0 8px;">⚠️ Payment Failed</h2><p style="margin:0;color:#374151;">We were unable to process your RestroFlow subscription payment.</p></div><p>To keep your account active, please update your payment method.</p><a href="${appUrl}/subscription" style="display:inline-block;background:#f97316;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0;">Update Payment Method →</a><p style="color:#6b7280;font-size:13px;margin-top:24px;">Questions? Contact <a href="mailto:support@restroflowsolutions.com">support@restroflowsolutions.com</a></p></div>`,
            }).catch(e => console.error('Failed to send dunning email:', e));
          }
          break;
        }
        default:
          console.log(`Unhandled Stripe event: ${event.type}`);
      }
      }, () => storage.markWebhookProcessed(event.id, {
        provider: 'stripe', integrationId: event.type, receivedAt: new Date().toISOString(),
      }));
      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook processing error:', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
}

function billingOrigin(): string {
  const url = new URL(process.env.APP_URL || 'https://restroflowsolutions.com');
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('APP_URL must use HTTPS in production.');
  }
  return url.origin;
}
