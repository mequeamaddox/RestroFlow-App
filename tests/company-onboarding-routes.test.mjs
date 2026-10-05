import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { build } from 'esbuild';
import { mkdtemp,rm,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { onboardingDatabase } from './onboarding-database.ts';
const dir=await mkdtemp(join(tmpdir(),'restro-company-routes-'));
let database=onboardingDatabase(),sendEmail=false,paymentFails=false;
const billingCalls=[];
globalThis.__companyRouteServices={
 get database(){return database.client;},
 storage:{getOwnerOnboarding:async()=>database.read().owner_onboarding[0],getUser:async()=>database.read().users[0],getLocations:async()=>database.read().locations,getLocationById:async id=>database.read().locations.find(l=>l.id===id)},
 email:async()=>sendEmail,
 activate:async(_actor,draft)=>{billingCalls.push(draft);if(paymentFails)throw new Error('Payment requires authentication');database.read().locations.find(l=>l.id===draft.locationId).hrAddonEnabled=true;},
};
await build({stdin:{contents:"export {registerBillingRoutes} from './server/routes/billing';",resolveDir:process.cwd()},outfile:join(dir,'routes.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'company-route-services',setup(b){
 const replacements={
 '../db':'export const db={transaction:(...args)=>globalThis.__companyRouteServices.database.transaction(...args)};',
 '../storage':'export const storage=globalThis.__companyRouteServices.storage;',
 './helpers':"export const isAuthenticated=(req,res,next)=>{req.user={id:'owner',role:req.headers['x-role'] || 'owner'};next();};export const calculateSubscriptionTotal=()=>179;",
 '../billingLock':'export const withBillingLock=async(_key,work)=>work();export const processBillingEvent=async()=>{};',
 '../executePlatformChange':'export const executePlatformChange=(...args)=>globalThis.__companyRouteServices.activate(...args);',
 '../invitationEmailService':'export class InvitationEmailService {static sendInvitationEmail(...args){return globalThis.__companyRouteServices.email(...args);}}',
 '../securityMiddleware':'export const requireLocationAccess=()=>()=>{};',
 '../email':'export const sendEmail=async()=>{};',
 '../transactionalEmails':'export const sendWelcomeEmail=async()=>{};export const sendInvoiceReceiptEmail=async()=>{};',
 '../stripeService':'export const stripe=null,isStripeEnabled=false;export const createCheckoutSession=()=>{},createPortalSession=()=>{},cancelStripeSubscription=()=>{},constructWebhookEvent=()=>{},mapStripeStatusToPlan=()=>{},subscriptionPeriodEnd=()=>{},invoiceSubscriptionId=()=>{};',
 };
 b.onResolve({filter:/.*/},args=>replacements[args.path]?{path:args.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:replacements[args.path],loader:'js'}));
}}]});
await symlink(join(process.cwd(),'node_modules'),join(dir,'node_modules'));
const {registerBillingRoutes}=await import(pathToFileURL(join(dir,'routes.mjs')).href);
const app=express();app.use(express.json());registerBillingRoutes(app);
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const post=(path,body,role='owner',method='POST')=>fetch(base+path,{method,headers:{'Content-Type':'application/json','x-role':role},body:JSON.stringify(body)});
const step=(stepName,stepData)=>post('/api/owner-onboarding/step',{stepName,stepData},'owner','PUT');
const reset=()=>{database=onboardingDatabase();billingCalls.length=0;paymentFails=false;sendEmail=false;};
async function foundation(){await step('restaurant_info',{name:'Fish Camp',type:'restaurant',address:'Ocean Hwy',manager:'Owner'});await step('departments',{departments:[{name:'Kitchen'}]});await step('positions',{positions:[{title:'Cook',departmentId:'0'}]});}
try {
 await test('company HTTP routes reject staff, invalid steps and failed setup without advancing',async()=>{
  reset();assert.equal((await post('/api/owner-onboarding/step',{stepName:'departments',stepData:{}},'employee','PUT')).status,403);
  assert.equal((await step('unknown',{})).status,400);database.fail('locations');assert.equal((await step('restaurant_info',{name:'Fish Camp',type:'restaurant',address:'Ocean Hwy',manager:'Owner'})).status,400);assert.equal(database.read().owner_onboarding[0].currentStep,'restaurant_info');
 });
 await test('HR activation fails closed and retries with the same billing request before enabling access',async()=>{
  reset();await foundation();const selection={enableHR:true,enableForLocations:[database.read().locations[0].id]};paymentFails=true;
  assert.equal((await step('hr_addon',selection)).status,400);assert.equal(database.read().owner_onboarding[0].data.hr_addon,undefined);assert.equal(database.read().locations[0].hrAddonEnabled,undefined);
  paymentFails=false;assert.equal((await step('hr_addon',selection)).status,200);assert.equal(billingCalls[0].requestKey,billingCalls[1].requestKey);assert.equal(database.read().locations[0].hrAddonEnabled,true);
 });
 await test('email failure returns durable invitation links and a completed HTTP flow can finish',async()=>{
  reset();await foundation();assert.equal((await step('hr_addon',{enableHR:false})).status,200);
  const response=await step('employee_invitations',{invitations:[{firstName:'Test',lastName:'Employee',email:'staff@example.com',departmentId:'0',positionId:'0',hourlyRate:'19.00'}]});assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.invitationResults[0].emailSent,false);assert.match(data.invitationResults[0].invitationUrl,/\/invitation\/accept\/[a-f0-9]{64}$/);assert.equal(database.read().invitation_tokens[0].hourlyRate,'19.00');
  const finished=await post('/api/owner-onboarding/complete',{});assert.equal(finished.status,200);assert.equal((await finished.json()).isCompleted,true);
 });
} finally {await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});delete globalThis.__companyRouteServices;}
