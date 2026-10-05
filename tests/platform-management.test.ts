import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getTableName,getTableColumns} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import * as schema from '../shared/schema';
import {planManagement,applyManagementBilling,managePlatformAccount,managementDraft,type ManagementDraft} from '../server/platformManagement';
const owner:any={id:'owner',email:'owner@example.com',role:'owner',accountState:'active',subscriptionPlan:'core',subscriptionStatus:'active',stripeCustomerId:'cus_owner',stripeSubscriptionId:'sub_owner'};
const restaurant:any={id:'11111111-1111-4111-8111-111111111111',name:'Restaurant',ownerId:'owner',isActive:true,deletedAt:null,hrAddonEnabled:false,barAddonEnabled:false};
const prices={core:'price_core',hr:'price_hr',bar:'price_bar'};
const draft=(action:ManagementDraft['action'],data:any={}):ManagementDraft=>({action,ownerId:'owner',requestKey:randomUUID(),reason:'Customer requested change',...data});
function stripe(failPayment=false){
 const calls:any[]=[];let sub:any={id:'sub_owner',customer:'cus_owner',metadata:{userId:'owner'},status:'active',collection_method:'charge_automatically',items:{data:[{id:'item_core',price:{id:'price_core'},quantity:1}],has_more:false}};
 const seen=new Map<string,any>();
 const client:any={subscriptions:{retrieve:async()=>structuredClone(sub),list:async()=>({data:sub.status==='canceled'?[]:[structuredClone(sub)],has_more:false}),cancel:async(_id:any,p:any,o:any)=>{calls.push({type:'cancel',p,o});sub.status='canceled';return structuredClone(sub);},update:async(_id:any,p:any,o:any)=>{
  if(seen.has(o.idempotencyKey))return seen.get(o.idempotencyKey);
  calls.push({type:'update',p,o});if(failPayment && p.items)throw Object.assign(new Error('Payment requires authentication'),{type:'StripeCardError'});
  for(const item of p.items || []){let current=sub.items.data.find((i:any)=>i.id===item.id);if(item.deleted)sub.items.data=sub.items.data.filter((i:any)=>i.id!==item.id);else if(current)current.quantity=item.quantity;else sub.items.data.push({id:'item_'+item.price,price:{id:item.price},quantity:item.quantity});}
  if(p.pause_collection!==undefined)sub.pause_collection=p.pause_collection;if(p.metadata)Object.assign(sub.metadata,p.metadata);if(p.cancel_at_period_end!==undefined)sub.cancel_at_period_end=p.cancel_at_period_end;
  const result=structuredClone(sub);seen.set(o.idempotencyKey,result);return result;
 }},customers:{create:async()=>({id:'cus_new'})},checkout:{sessions:{list:async()=>({data:[],has_more:false}),expire:async()=>{},create:async(p:any,o:any)=>{calls.push({type:'checkout',p,o});return {url:'https://checkout.stripe.test/owner'};}}}};
 return {client,calls,read:()=>sub};
}
function database(failAudit=false){
 let state:any={users:[structuredClone(owner)],locations:[structuredClone(restaurant)],platform_operations:[],audit_logs:[],pos_integrations:[{id:'pos',locationId:restaurant.id,isActive:true}]};
 const dialect=new PgDialect();
 const matches=(table:any,row:any,condition:any)=>{const {sql,params}=dialect.sqlToQuery(condition);const columns=Object.entries(getTableColumns(table)).map(([key,c]:any)=>[c.name,key]);return [...sql.matchAll(/"([^"]+)"\s*=\s*\$(\d+)/g)].every(m=>{const key=columns.find(([name])=>name===m[1])?.[1];return key && row[key]===params[Number(m[2])-1];});};
 const adapter=(data:any)=>({select:()=>({from:(table:any)=>({where:(condition:any)=>Promise.resolve(data[getTableName(table)].filter((r:any)=>matches(table,r,condition)))} )}),insert:(table:any)=>({values:async(values:any)=>{if(failAudit && table===schema.auditLogs)throw new Error('Audit insert failed');data[getTableName(table)].push({id:randomUUID(),...structuredClone(values)});}}),update:(table:any)=>({set:(changes:any)=>({where:async(condition:any)=>{for(const row of data[getTableName(table)].filter((r:any)=>matches(table,r,condition)))Object.assign(row,structuredClone(changes));}})})});
 const client:any={...adapter(state),transaction:async(work:any)=>{const copy=structuredClone(state);const result=await work(adapter(copy));Object.keys(state).forEach(k=>state[k]=copy[k]);return result;}};
 return {client,read:()=>state,setFail:(value:boolean)=>failAudit=value};
}
test('paid add-on changes bill the correct quantities and commit owner access and audit together',async()=>{
 const db=database(),provider=stripe(),d=draft('addons',{locationId:restaurant.id,hrAddonEnabled:true,barAddonEnabled:true});
 await managePlatformAccount(db.client,provider.client,'admin',d,prices,'https://restroflowsolutions.com');
 assert.equal(db.read().locations[0].hrAddonEnabled,true);assert.equal(db.read().audit_logs.length,1);
 const call=provider.calls[0];assert.equal(call.p.payment_behavior,'error_if_incomplete');assert.equal(call.p.proration_behavior,'always_invoice');assert.deepEqual(call.p.items.map((i:any)=>i.quantity),[1,1]);
 await managePlatformAccount(db.client,provider.client,'admin',d,prices,'https://restroflowsolutions.com');assert.equal(provider.calls.length,1);assert.equal(db.read().audit_logs.length,1);
});
test('a failed payment grants no features and remains safe to retry',async()=>{
 const db=database(),provider=stripe(true),d=draft('addons',{locationId:restaurant.id,hrAddonEnabled:true,barAddonEnabled:false});
 await assert.rejects(managePlatformAccount(db.client,provider.client,'admin',d,prices,'https://restroflowsolutions.com'),/Payment/);
 assert.equal(db.read().locations[0].hrAddonEnabled,false);assert.equal(db.read().audit_logs.length,0);assert.equal(db.read().platform_operations[0].status,'failed');
});
test('Stripe success followed by a database failure is durable and retry does not bill again',async()=>{
 const db=database(true),provider=stripe(),d=draft('addons',{locationId:restaurant.id,hrAddonEnabled:true,barAddonEnabled:false});
 await assert.rejects(managePlatformAccount(db.client,provider.client,'admin',d,prices,'https://restroflowsolutions.com'),/Audit/);
 assert.equal(db.read().locations[0].hrAddonEnabled,false);assert.equal(db.read().platform_operations[0].status,'pending');assert.ok(db.read().platform_operations[0].result);
 db.setFail(false);await managePlatformAccount(db.client,provider.client,'admin',d,prices,'https://restroflowsolutions.com');assert.equal(provider.calls.length,1);assert.equal(db.read().locations[0].hrAddonEnabled,true);
});
test('owner deletion cancels billing, blocks all restaurants and POS imports, and keeps restorable data',async()=>{
 const db=database(),provider=stripe(),d=draft('delete_owner',{confirmation:owner.email});
 await managePlatformAccount(db.client,provider.client,'admin',d,prices,'https://restroflowsolutions.com');
 assert.equal(provider.calls[0].type,'cancel');assert.equal(db.read().users[0].accountState,'deleted');assert.equal(db.read().locations[0].isActive,false);assert.ok(db.read().locations[0].deletedAt);assert.equal(db.read().pos_integrations[0].isActive,false);assert.equal(db.read().users.length,1);
});
test('restoring a saved deletion after DB failure converts serialized timestamps safely',async()=>{
 const db=database(true),provider=stripe(),d=draft('delete_owner',{confirmation:owner.email});
 await assert.rejects(managePlatformAccount(db.client,provider.client,'admin',d,prices,'https://restroflowsolutions.com'));
 db.read().platform_operations[0].snapshot=JSON.parse(JSON.stringify(db.read().platform_operations[0].snapshot));db.setFail(false);
 await managePlatformAccount(db.client,provider.client,'admin',d,prices,'https://restroflowsolutions.com');assert.ok(db.read().locations[0].deletedAt instanceof Date);assert.equal(provider.calls.length,1);
});
test('suspension pauses new invoices and reactivation resumes collection',async()=>{
 const db=database(),provider=stripe();await managePlatformAccount(db.client,provider.client,'admin',draft('suspend'),prices,'https://restroflowsolutions.com');assert.equal(db.read().users[0].accountState,'suspended');assert.deepEqual(provider.calls[0].p.pause_collection,{behavior:'void'});
 await managePlatformAccount(db.client,provider.client,'admin',draft('reactivate'),prices,'https://restroflowsolutions.com');assert.equal(db.read().users[0].accountState,'active');assert.equal(provider.calls[1].p.pause_collection,'');
});
test('unsubscribed Core upgrades create checkout links without activating access or trials',async()=>{
 const db=database(),provider=stripe();Object.assign(db.read().users[0],{stripeCustomerId:null,stripeSubscriptionId:null,subscriptionPlan:'free',subscriptionStatus:'inactive'});
 const result=await managePlatformAccount(db.client,provider.client,'admin',draft('plan',{plan:'core'}),prices,'https://restroflowsolutions.com');
 assert.ok(result.checkoutUrl);assert.equal(db.read().users[0].subscriptionPlan,'free');assert.equal(db.read().users[0].subscriptionStatus,'inactive');assert.equal(provider.calls[0].p.subscription_data.trial_period_days,undefined);
});
test('foreign restaurants, administrator accounts, missing confirmations and invalid requests are rejected before billing',async()=>{
 assert.throws(()=>planManagement({...owner,role:'platform_admin'},[restaurant],draft('plan',{plan:'free'}),prices,'https://example.com'));
 assert.throws(()=>planManagement(owner,[],draft('addons',{locationId:restaurant.id,hrAddonEnabled:true,barAddonEnabled:false}),prices,'https://example.com'));
 assert.throws(()=>planManagement(owner,[restaurant],draft('delete_owner',{confirmation:'wrong'}),prices,'https://example.com'));
 assert.throws(()=>managementDraft.parse({...draft('suspend'),subscriptionPlan:'core'}));
 const db=database(),provider=stripe();await assert.rejects(managePlatformAccount(db.client,provider.client,'owner',draft('delete_owner',{confirmation:owner.email}),prices,'https://example.com'));assert.equal(provider.calls.length,0);
});
test('Free downgrades preserve restaurant records and require an active count within the plan limit',async()=>{
 assert.throws(()=>planManagement(owner,[restaurant,{...restaurant,id:randomUUID()}],draft('plan',{plan:'free'}),prices,'https://example.com'),/one active/);
 const db=database(),provider=stripe();await managePlatformAccount(db.client,provider.client,'admin',draft('plan',{plan:'free'}),prices,'https://example.com');assert.equal(db.read().users[0].subscriptionPlan,'free');assert.equal(db.read().users[0].stripeSubscriptionId,null);assert.equal(db.read().locations[0].isActive,true);
});
test('a pending DB reconciliation blocks a second operation and request keys cannot be repurposed',async()=>{
 const db=database(true),provider=stripe(),d=draft('suspend');await assert.rejects(managePlatformAccount(db.client,provider.client,'admin',d,prices,'https://example.com'));
 await assert.rejects(managePlatformAccount(db.client,provider.client,'admin',draft('delete_owner',{confirmation:owner.email}),prices,'https://example.com'),/pending request/);
 await assert.rejects(managePlatformAccount(db.client,provider.client,'admin',{...d,reason:'Different'},prices,'https://example.com'),/request key/);assert.equal(provider.calls.length,1);
});
test('unmatched customer subscriptions and unknown price items fail closed',async()=>{
 const provider=stripe(),d=draft('addons',{locationId:restaurant.id,hrAddonEnabled:true,barAddonEnabled:false});provider.read().customer='cus_other';await assert.rejects(applyManagementBilling(provider.client,planManagement(owner,[restaurant],d,prices,'https://example.com'),d),/match/);
 provider.read().customer='cus_owner';provider.read().items.data.push({id:'unknown',price:{id:'price_other'},quantity:1});await assert.rejects(applyManagementBilling(provider.client,planManagement(owner,[restaurant],d,prices,'https://example.com'),d),/different Stripe price/);assert.equal(provider.calls.length,0);
});

test('deleting one restaurant removes its add-on charge while preserving the Core subscription',async()=>{
 const db=database(),provider=stripe();db.read().locations[0].hrAddonEnabled=true;provider.read().items.data.push({id:'hr',price:{id:'price_hr'},quantity:1});
 await managePlatformAccount(db.client,provider.client,'admin',draft('delete_restaurant',{locationId:restaurant.id,confirmation:restaurant.name}),prices,'https://example.com');
 assert.equal(provider.calls[0].type,'update');assert.deepEqual(provider.calls[0].p.items,[{id:'hr',deleted:true}]);assert.equal(db.read().users[0].stripeSubscriptionId,'sub_owner');assert.equal(db.read().locations[0].isActive,false);
});
