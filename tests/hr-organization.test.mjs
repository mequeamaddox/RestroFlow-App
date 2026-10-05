import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID, randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { mkdtemp,rm,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { onboardingDatabase } from './onboarding-database.ts';
const db=onboardingDatabase(),locationId=randomUUID(),otherId=randomUUID();
db.read().locations.push({id:locationId,ownerId:'owner',name:'Restaurant',isActive:true,hrAddonEnabled:true},{id:otherId,ownerId:'other',name:'Other',isActive:true,hrAddonEnabled:true});
db.read().users.push({id:'other',role:'owner',accountState:'active'},{id:'staff',email:'staff@example.com',role:'employee',accountState:'active'});
const table=(name)=>db.read()[name];
const get=(name,id)=>table(name).find(r=>r.id===id);
const create=(name,values)=>{const row={id:randomUUID(),...values};table(name).push(row);return row;};
const update=(name,id,values)=>Object.assign(get(name,id),values);
globalThis.__organizationStorage={
 getUser:async id=>get('users',id),getLocationById:async id=>get('locations',id),getUserPermissions:async id=>table('user_permissions').filter(p=>p.userId===id),createSecurityLog:async()=>{},
 getDepartments:async id=>table('departments').filter(d=>d.locationId===id),getDepartment:async id=>get('departments',id),createDepartment:async values=>create('departments',values),updateDepartment:async(id,v)=>update('departments',id,v),deleteDepartment:async id=>db.read().departments=table('departments').filter(d=>d.id!==id),
 getPositions:async id=>table('positions').filter(p=>get('departments',p.departmentId)?.locationId===id),getPosition:async id=>get('positions',id),createPosition:async v=>create('positions',v),updatePosition:async(id,v)=>update('positions',id,v),deletePosition:async id=>db.read().positions=table('positions').filter(p=>p.id!==id),getEmployee:async id=>get('employees',id),
 createInvitationToken:async v=>create('invitation_tokens',{status:'pending',token:randomBytes(32).toString('hex'),...v}),
};
globalThis.__organizationDb=db.client;
const directory=await mkdtemp(join(tmpdir(),'restro-organization-'));
await build({stdin:{contents:"export {registerHROrganizationRoutes} from './server/routes/hrOrganization';export {registerAuthRoutes} from './server/routes/auth';",resolveDir:process.cwd()},outfile:join(directory,'routes.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'test-services',setup(b){
 const replacements={
 '../storage':'export const storage=globalThis.__organizationStorage;', './storage':'export const storage=globalThis.__organizationStorage;', '../db':'export const db=globalThis.__organizationDb;',
 '@clerk/express':"export const getAuth=req=>({userId:req.user?.id || 'staff'});",
 '../invitationEmailService':'export class InvitationEmailService {static async sendInvitationEmail(){return true;}}',
 './helpers':"export const isAuthenticated=(req,res,next)=>{req.user={id:req.headers['x-user'] || 'owner',role:req.headers['x-user']==='staff'?'employee':'owner'};next();};export const requireHRAccess=async(req,res,next)=>{const loc=await globalThis.__organizationStorage.getLocationById(req.query.locationId);if(!loc?.hrAddonEnabled)return res.status(403).json({message:'HR required'});next();};export const calculateSubscriptionTotal=()=>179;export const requirePlatformAdmin=()=>{};export const clerkClient={users:{getUser:async()=>({emailAddresses:[{emailAddress:'staff@example.com'}]})}};",
 };
 b.onResolve({filter:/.*/},args=>replacements[args.path]?{path:args.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:replacements[args.path],loader:'js'}));
}}]});
await symlink(join(process.cwd(),'node_modules'),join(directory,'node_modules'));
const {registerHROrganizationRoutes,registerAuthRoutes}=await import(pathToFileURL(join(directory,'routes.mjs')).href);
const app=express();app.use(express.json());registerHROrganizationRoutes(app);registerAuthRoutes(app);
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const request=(path,method='GET',body,user='owner')=>fetch(base+path,{method,headers:{'Content-Type':'application/json','x-user':user},body:body?JSON.stringify(body):undefined});
let department,position;
try {
 await test('department form body creates an owned department and it appears in the restaurant list',async()=>{
  const response=await request('/api/hr/departments','POST',{name:'Kitchen',description:'Food preparation',locationId,managerId:null});assert.equal(response.status,201);department=await response.json();assert.equal(department.locationId,locationId);
  const list=await (await request(`/api/hr/departments?locationId=${locationId}`)).json();assert.equal(list[0].id,department.id);
 });
 await test('position creation and the previously missing edit endpoint persist department and pay',async()=>{
  const response=await request(`/api/hr/positions?locationId=${locationId}`,'POST',{title:'Cook',departmentId:department.id,hourlyRate:18});assert.equal(response.status,201);position=await response.json();assert.equal(position.hourlyRateMin,'18');
  const edited=await request(`/api/hr/positions/${position.id}`,'PUT',{title:'Lead Cook',departmentId:department.id,hourlyRate:21});assert.equal(edited.status,200);
  const list=await (await request(`/api/hr/positions?locationId=${locationId}`)).json();assert.equal(list[0].department.name,'Kitchen');assert.equal(list[0].hourlyRate,21);
 });
 await test('a newly created department and position can be invited and joined through actual invitation routes',async()=>{
  const created=await request('/api/invitations','POST',{email:'staff@example.com',firstName:'Test',lastName:'Employee',role:'employee',locationId,departmentId:department.id,positionId:position.id,hourlyRate:21});assert.equal(created.status,201);const invitation=await created.json();
  assert.equal(invitation.departmentId,department.id);assert.equal(invitation.positionId,position.id);
  const accepted=await request(`/api/invite/${invitation.token}/accept`,'POST',{});assert.equal(accepted.status,200);assert.equal(table('employees')[0].departmentId,department.id);assert.equal(table('employees')[0].positionId,position.id);assert.equal(table('employees')[0].hourlyRate,'21');
 });
 await test('missing or conflicting restaurants and invalid departments cannot create records',async()=>{
  const count=table('departments').length;assert.equal((await request('/api/hr/departments','POST',{name:'Invalid'})).status,400);assert.equal((await request(`/api/hr/departments?locationId=${otherId}`,'POST',{name:'Invalid',locationId})).status,400);assert.equal(table('departments').length,count);
  assert.equal((await request(`/api/hr/positions?locationId=${locationId}`,'POST',{title:'Invalid',departmentId:randomUUID()})).status,400);
 });
 await test('employees cannot manage structure and owners cannot cross restaurant boundaries',async()=>{
  assert.equal((await request('/api/hr/departments','POST',{name:'Denied',locationId},'staff')).status,403);
  assert.equal((await request(`/api/hr/departments?locationId=${otherId}`)).status,403);
  const foreign=create('departments',{name:'Foreign',locationId:otherId});assert.equal((await request(`/api/hr/positions?locationId=${locationId}`,'POST',{title:'Denied',departmentId:foreign.id})).status,400);
  assert.equal((await request(`/api/hr/departments/${foreign.id}`,'PUT',{name:'Denied',locationId})).status,400);
 });
}finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});delete globalThis.__organizationStorage;delete globalThis.__organizationDb;}
