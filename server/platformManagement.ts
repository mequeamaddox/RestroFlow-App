import type Stripe from 'stripe';
import { and, eq } from 'drizzle-orm';
import { users, locations, platformOperations, auditLogs, posIntegrations } from '@shared/schema';
import type { db } from './db';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const managementDraft = z.object({
  action:z.enum(['plan','suspend','reactivate','delete_owner','restore_owner','addons','delete_restaurant','restore_restaurant']),
  ownerId:z.string().min(1).max(255), locationId:z.string().uuid().optional(),
  plan:z.enum(['free','core']).optional(), hrAddonEnabled:z.boolean().optional(),barAddonEnabled:z.boolean().optional(),
  requestKey:z.string().uuid(), reason:z.string().trim().min(1).max(500), confirmation:z.string().optional(),
}).strict();
export type ManagementDraft=z.infer<typeof managementDraft>;
type Owner=typeof users.$inferSelect;
type Restaurant=typeof locations.$inferSelect;
interface Prices {core:string;hr:string;bar:string;}
interface Snapshot {owner:Owner;restaurants:Restaurant[];ownerChanges:Partial<Owner>;restaurantChanges:Array<{id:string;changes:Partial<Restaurant>}>;prices:Prices;origin:string;}
export interface ManagementResult {message:string;checkoutUrl?:string;}
const liveStatuses=new Set(['active','trialing','past_due','unpaid','paused','incomplete']);

export function planManagement(owner:Owner, restaurants:Restaurant[], draft:ManagementDraft, prices:Prices, origin:string):Snapshot {
  if(owner.role!=='owner' && !(owner.role==='platform_admin' && ['addons','delete_restaurant','restore_restaurant'].includes(draft.action))) throw new Error('Manage customer owners here; platform administrators and staff accounts are protected.');
  if(draft.ownerId!==owner.id) throw new Error('Owner does not match this request.');
  const snap:Snapshot={owner,restaurants,ownerChanges:{},restaurantChanges:[],prices,origin};
  const active=restaurants.filter(l=>l.isActive && !l.deletedAt);
  if(['plan','addons','suspend'].includes(draft.action) && owner.accountState!=='active') throw new Error('Reactivate or restore the owner before changing their plan or add-ons.');
  if(draft.action==='plan') {
    if(!draft.plan) throw new Error('Choose Core or Free.');
    if(draft.plan==='free') {
      if(active.length>1) throw new Error('Free supports one active restaurant. Delete or deactivate additional restaurants before downgrading.');
      snap.ownerChanges={subscriptionPlan:'free',subscriptionStatus:'inactive',stripeSubscriptionId:null,ocrCreditsLimit:5,subscriptionEndDate:null};
      snap.restaurantChanges=restaurants.map(l=>({id:l.id,changes:{hrAddonEnabled:false,barAddonEnabled:false}}));
    }
  } else if(draft.action==='suspend') snap.ownerChanges={accountState:'suspended'};
  else if(draft.action==='reactivate') {
    if(owner.accountState==='deleted') throw new Error('Restore this deleted owner first.');
    snap.ownerChanges={accountState:'active'};
  } else if(draft.action==='delete_owner') {
    if(draft.confirmation!==owner.email) throw new Error('Type the owner email to confirm deletion.');
    snap.ownerChanges={accountState:'deleted',subscriptionPlan:'free',subscriptionStatus:'inactive',stripeSubscriptionId:null,subscriptionEndDate:null,ocrCreditsLimit:5};
    snap.restaurantChanges=restaurants.map(l=>({id:l.id,changes:{isActive:false,deletedAt:new Date(),hrAddonEnabled:false,barAddonEnabled:false}}));
  } else if(draft.action==='restore_owner') snap.ownerChanges={accountState:'active'};
  else {
    const location=restaurants.find(l=>l.id===draft.locationId && l.ownerId===owner.id);
    if(!location) throw new Error('Restaurant does not belong to this owner.');
    if(draft.action==='addons') {
      if(!location.isActive || location.deletedAt) throw new Error('Restore the restaurant before changing add-ons.');
      if(draft.hrAddonEnabled===undefined || draft.barAddonEnabled===undefined) throw new Error('Specify both restaurant add-ons.');
      snap.restaurantChanges=[{id:location.id,changes:{hrAddonEnabled:draft.hrAddonEnabled,barAddonEnabled:draft.barAddonEnabled}}];
    } else if(draft.action==='delete_restaurant') {
      if(draft.confirmation!==location.name) throw new Error('Type the restaurant name to confirm deletion.');
      snap.restaurantChanges=[{id:location.id,changes:{isActive:false,deletedAt:new Date(),hrAddonEnabled:false,barAddonEnabled:false}}];
    } else {
      if(owner.accountState!=='active') throw new Error('Restore or reactivate the owner first.');
      const limit=owner.subscriptionPlan==='core'?3:1;
      if(!location.isActive && active.length>=limit) throw new Error(`The current plan supports ${limit} active restaurant(s).`);
      snap.restaurantChanges=[{id:location.id,changes:{isActive:true,deletedAt:null,hrAddonEnabled:false,barAddonEnabled:false}}];
    }
  }
  return snap;
}

/** Stripe first; a failed payment must never grant a paid feature. No customer is charged just to create a checkout link. */
export async function applyManagementBilling(client:Stripe|null,snap:Snapshot,draft:ManagementDraft):Promise<ManagementResult> {
  const owner=snap.owner, key=`platform:${draft.requestKey}`;
  if(!client) {
    if(owner.stripeCustomerId || owner.stripeSubscriptionId || draft.action==='addons' || (draft.action==='plan' && draft.plan==='core')) throw new Error('Configure Stripe before changing this customer billing.');
    return {message:'Account updated.'};
  }
  let sub:Stripe.Subscription|undefined;
  if(owner.stripeSubscriptionId) sub=await client.subscriptions.retrieve(owner.stripeSubscriptionId);
  if(owner.stripeCustomerId) {
    const subscriptions=await client.subscriptions.list({customer:owner.stripeCustomerId,status:'all',limit:100});
    const live=subscriptions.data.filter(s=>liveStatuses.has(s.status));
    if(live.length>1 || subscriptions.has_more) throw new Error('Multiple customer subscriptions require billing review before this change.');
    if(sub && live.length && live[0].id!==sub.id && liveStatuses.has(sub.status)) throw new Error('The active Stripe subscription does not match this owner account.');
    if(!sub || !liveStatuses.has(sub.status)) sub=live[0] || sub;
  }
  if(sub && (String(typeof sub.customer==='string'?sub.customer:sub.customer.id)!==owner.stripeCustomerId || (sub.metadata.userId && sub.metadata.userId!==owner.id))) throw new Error('Stripe subscription does not match the owner.');
  if(sub?.schedule || sub?.pending_update) throw new Error('Resolve the scheduled or pending Stripe change before editing this account.');
  const live=!!sub && liveStatuses.has(sub.status);
  if(draft.action==='delete_owner' || (draft.action==='plan' && draft.plan==='free')) {
    if(live) await client.subscriptions.cancel(sub!.id,{invoice_now:false,prorate:false},{idempotencyKey:key});
    if(owner.stripeCustomerId) {
      const sessions=await client.checkout.sessions.list({customer:owner.stripeCustomerId,status:'open',limit:100});
      if(sessions.has_more) throw new Error('More checkout sessions require billing review. Retry after closing them.');
      for(const session of sessions.data.filter(s=>s.metadata?.userId===owner.id)) await client.checkout.sessions.expire(session.id,{}, {idempotencyKey:`${key}:${session.id}`});
    }
    return {message:'Subscription cancelled immediately. Future subscription charges stopped; no automatic refund was issued.'};
  }
  if(draft.action==='suspend' || draft.action==='reactivate') {
    if(live) await client.subscriptions.update(sub!.id,{pause_collection:draft.action==='suspend'?{behavior:'void'}:'',metadata:{restroflow_admin_request:draft.requestKey}},{idempotencyKey:key});
    return {message:draft.action==='suspend'?'Access suspended and new subscription invoices paused. Existing invoices are unchanged.':'Account access restored and subscription collection resumed. Previously voided invoices stay voided.'};
  }
  if(draft.action==='restore_owner' || draft.action==='restore_restaurant') return {message:'Restored. Deleted restaurants and cancelled subscriptions must be restored or upgraded separately.'};
  if(draft.action==='plan' && draft.plan==='core' && !live) {
    if(!snap.prices.core) throw new Error('Configure the Core Stripe price first.');
    const customerId=owner.stripeCustomerId || (await client.customers.create({email:owner.email || undefined,metadata:{userId:owner.id}},{idempotencyKey:`restroflow-customer:${owner.id}`})).id;
    const open=await client.checkout.sessions.list({customer:customerId,status:'open',limit:100});
    if(open.has_more) throw new Error('Review open checkout sessions before creating another link.');
    for(const session of open.data.filter(s=>s.metadata?.userId===owner.id)) await client.checkout.sessions.expire(session.id,{}, {idempotencyKey:`${key}:${session.id}`});
    snap.restaurantChanges=snap.restaurants.map(l=>({id:l.id,changes:{hrAddonEnabled:false,barAddonEnabled:false}}));
    const taxEnabled=process.env.STRIPE_AUTOMATIC_TAX==='true';
    if(taxEnabled && !(await client.tax.registrations.list({status:'active',limit:1})).data.length) throw new Error('Configure an active tax registration before collecting automatic tax.');
    const session=await client.checkout.sessions.create({mode:'subscription',automatic_tax:{enabled:taxEnabled},tax_id_collection:{enabled:true},customer:customerId,customer_update:{address:'auto',name:'auto'},billing_address_collection:'required',line_items:[{price:snap.prices.core,quantity:1}],success_url:`${snap.origin}/subscription?success=true`,cancel_url:`${snap.origin}/subscription?cancelled=true`,metadata:{userId:owner.id,plan:'core'},subscription_data:{metadata:{userId:owner.id,plan:'core'},billing_mode:{type:'flexible'}},allow_promotion_codes:true},{idempotencyKey:key});
    if(!session.url) throw new Error('Stripe did not return a checkout link.');
    snap.ownerChanges={stripeCustomerId:customerId};
    return {message:'Checkout link ready. Paid access activates only after payment confirmation.',checkoutUrl:session.url};
  }
  if(!live) {
    if(draft.action==='addons' && (draft.hrAddonEnabled || draft.barAddonEnabled)) throw new Error('Upgrade this owner through paid checkout before enabling add-ons.');
    return {message:'Restaurant updated. There is no active subscription to adjust.'};
  }
  if(sub!.status!=='active' && sub!.status!=='trialing') throw new Error('Resolve unpaid or incomplete subscription invoices before changing paid features.');
  if(sub!.collection_method!=='charge_automatically') throw new Error('This invoiced subscription requires billing review before changing paid features.');
  const after=snap.restaurants.map(l=>({...l,...snap.restaurantChanges.find(c=>c.id===l.id)?.changes})).filter(l=>l.isActive && !l.deletedAt);
  const desired=[{price:snap.prices.core,quantity:1},{price:snap.prices.hr,quantity:after.filter(l=>l.hrAddonEnabled).length},{price:snap.prices.bar,quantity:after.filter(l=>l.barAddonEnabled).length}];
  for(const row of desired) if(row.quantity && !row.price) throw new Error('Configure the Stripe prices for Core and all enabled add-ons.');
  if(sub!.items.has_more) throw new Error('Review subscriptions with more than 100 items before changing them.');
  if(new Set(desired.map(d=>d.price).filter(Boolean)).size!==desired.filter(d=>d.price).length) throw new Error('Use distinct Stripe prices for Core, HR, and Bar.');
  const known=new Set(desired.map(d=>d.price).filter(Boolean));
  if(sub!.items.data.some(i=>!known.has(i.price.id))) throw new Error('This subscription uses a different Stripe price. Review its pricing before changing it.');
  const items:Stripe.SubscriptionUpdateParams.Item[]=[];
  for(const row of desired.filter(r=>r.price)) {
    const matches=sub!.items.data.filter(i=>i.price.id===row.price);
    if(matches.length>1) throw new Error('Duplicate Stripe price items require billing review.');
    const current=matches[0];
    if(row.quantity) {if(!current || current.quantity!==row.quantity) items.push({...(current?{id:current.id}:{price:row.price}),quantity:row.quantity});}
    else if(current) items.push({id:current.id,deleted:true});
  }
  if(items.length || (draft.action==='plan' && sub!.cancel_at_period_end)) {
    sub=await client.subscriptions.update(sub!.id,{items,proration_behavior:'always_invoice',payment_behavior:'error_if_incomplete',cancel_at_period_end:false,metadata:{restroflow_admin_request:draft.requestKey}},{idempotencyKey:key});
  }
  snap.ownerChanges={...snap.ownerChanges,subscriptionPlan:'core',subscriptionStatus:'active',stripeSubscriptionId:sub!.id};
  return {message:'Access and Stripe subscription updated. Prorated charges or credits apply immediately.'};
}

export async function managePlatformAccount(database:Pick<typeof db,'select'|'insert'|'update'|'transaction'>,client:Stripe|null,actor:string,draft:ManagementDraft,prices:Prices,origin:string) {
  const [owner]=await database.select().from(users).where(eq(users.id,draft.ownerId));
  if(!owner || (owner.id===actor && !['addons','delete_restaurant','restore_restaurant'].includes(draft.action)) || (owner.role!=='owner' && !(owner.role==='platform_admin' && ['addons','delete_restaurant','restore_restaurant'].includes(draft.action)))) throw new Error('Owner not found, or this account is protected.');
  const fingerprint=createHash('sha256').update(JSON.stringify(draft)).digest('hex');
  const [previous]=await database.select().from(platformOperations).where(eq(platformOperations.id,draft.requestKey));
  if(previous && (previous.fingerprint!==fingerprint || previous.actorId!==actor)) throw new Error('This request key belongs to another change.');
  if(previous?.completedAt) return previous.result as ManagementResult;
  const [unfinished]=await database.select().from(platformOperations).where(and(eq(platformOperations.ownerId,owner.id),eq(platformOperations.status,'pending')));
  if(unfinished && unfinished.id!==draft.requestKey) throw new Error(`Finish the pending request ${unfinished.id} before making another change.`);
  const restaurants=await database.select().from(locations).where(eq(locations.ownerId,owner.id));
  const snap=(previous?.status==='pending'?previous.snapshot as Snapshot:undefined) || planManagement(owner,restaurants,draft,prices,origin);
  if(previous?.status==='failed') await database.update(platformOperations).set({status:'pending',snapshot:snap}).where(eq(platformOperations.id,draft.requestKey));
  if(!previous) await database.insert(platformOperations).values({id:draft.requestKey,ownerId:owner.id,actorId:actor,fingerprint,status:'pending',snapshot:snap,draft});
  // A durable operation permits retry after a Stripe success followed by a database failure.
  let result=previous?.result as ManagementResult;
  if(!result) try {result=await applyManagementBilling(client,snap,draft);} catch(error:any) {
    // Network errors can have an uncertain remote result. Keep those requests retryable with their original key.
    if(!['delete_owner'].includes(draft.action) && !(draft.action==='plan' && draft.plan==='free') && (!error?.type || ['StripeCardError','StripeInvalidRequestError','StripeAuthenticationError','StripePermissionError'].includes(error.type))) await database.update(platformOperations).set({status:'failed'}).where(eq(platformOperations.id,draft.requestKey));
    throw error;
  }
  await database.update(platformOperations).set({result,snapshot:snap}).where(eq(platformOperations.id,draft.requestKey));
  return database.transaction(async tx=>{
    if(Object.keys(snap.ownerChanges).length) await tx.update(users).set({...snap.ownerChanges,updatedAt:new Date()}).where(eq(users.id,owner.id));
    for(const row of snap.restaurantChanges) {
      if(typeof row.changes.deletedAt === 'string') row.changes.deletedAt=new Date(row.changes.deletedAt);
      await tx.update(locations).set(row.changes).where(and(eq(locations.id,row.id),eq(locations.ownerId,owner.id)));
      if(row.changes.deletedAt) await tx.update(posIntegrations).set({isActive:false}).where(eq(posIntegrations.locationId,row.id));
    }
    await tx.insert(auditLogs).values({userId:actor,tableName:draft.locationId?'locations':'users',recordId:draft.locationId || owner.id,locationId:draft.locationId,action:draft.action.startsWith('delete')?'delete':'update',oldValues:{owner:snap.owner,restaurants:snap.restaurants},newValues:{owner:snap.ownerChanges,restaurants:snap.restaurantChanges},reason:draft.reason});
    await tx.update(platformOperations).set({status:'complete',completedAt:new Date(),result}).where(eq(platformOperations.id,draft.requestKey));
    return result;
  });
}
