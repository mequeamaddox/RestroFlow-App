import { db } from './db';
import { storage } from './storage';
import { stripe } from './stripeService';
import { withBillingLock } from './billingLock';
import { managePlatformAccount, managementDraft, type ManagementDraft } from './platformManagement';
export async function executePlatformChange(actor:string,draft:ManagementDraft){
 draft=managementDraft.parse(draft);
 return withBillingLock(`stripe-checkout:${draft.ownerId}`,async()=>{
  const owner=await storage.getUser(draft.ownerId);if(!owner) throw new Error('Owner not found.');
  return withBillingLock(`stripe-events:${owner.stripeCustomerId || owner.id}`,async()=>{
   const prices={core:await storage.getPlatformSetting('stripe_price_core') || process.env.STRIPE_PRICE_CORE || '',hr:await storage.getPlatformSetting('stripe_price_hr') || process.env.STRIPE_PRICE_HR || '',bar:await storage.getPlatformSetting('stripe_price_bar') || process.env.STRIPE_PRICE_BAR || ''};
   const origin=(process.env.APP_URL || 'https://restroflowsolutions.com').replace(/\/$/,'');
   return managePlatformAccount(db,stripe,actor,draft,prices,origin);
  });
 });
}
