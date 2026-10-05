import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {build} from 'esbuild';
import {mkdtemp,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const a=randomUUID(),b=randomUUID(),c=randomUUID();
const records=[{id:randomUUID(),locationId:a,email:'staff@example.com',status:'active'},{id:randomUUID(),locationId:b,email:'staff@example.com',status:'active'},{id:randomUUID(),locationId:a,email:'someone@example.com',status:'active'}];
globalThis.__employeeStorage={
 getUser:async id=>({id,email:'staff@example.com',role:'employee',accountState:'active'}),
 getLocationById:async id=>({id,ownerId:'owner',isActive:true}),
 getUserPermissions:async()=>[{locationId:a,isActive:true,role:'employee'},{locationId:b,isActive:true,role:'employee'}],createSecurityLog:async()=>{},
 getEmployeeByEmail:async(email,id)=>records.find(e=>e.email===email && e.locationId===id),getEmployee:async id=>records.find(e=>e.id===id),
};
const directory=await mkdtemp(join(tmpdir(),'restro-employee-'));
await build({entryPoints:['server/employeeIdentity.ts'],outfile:join(directory,'identity.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'storage',setup(b){b.onResolve({filter:/^\.\/storage$/},()=>({path:'storage',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const storage=globalThis.__employeeStorage;',loader:'js'}));}}]});
await symlink(join(process.cwd(),'node_modules'),join(directory,'node_modules'));
const {registerEmployeeIdentityRoute,ownEmployee}=await import(pathToFileURL(join(directory,'identity.mjs')).href);
const app=express();app.use((req,res,next)=>{req.user={id:'staff',role:'employee'};next();});registerEmployeeIdentityRoute(app,(req,res,next)=>next());
app.get('/own/:id',async(req,res)=>{const employee=await ownEmployee(req,res,req.params.id);if(employee)res.json(employee);});
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
try {
 await test('one login resolves separate employee profiles for each selected restaurant',async()=>{
  for(const [location,record] of [[a,records[0]],[b,records[1]]]){const response=await fetch(`${base}/api/employees/me/identity?locationId=${location}`);assert.equal(response.status,200);assert.deepEqual(await response.json(),{id:record.id,locationId:location});}
 });
 await test('missing and unauthorized restaurant selection never falls back to the first employee',async()=>{
  assert.equal((await fetch(`${base}/api/employees/me/identity`)).status,400);
  assert.equal((await fetch(`${base}/api/employees/me/identity?locationId=${c}`)).status,403);
 });
 await test('self-service accepts the restaurant employee UUID and rejects another employee or inactive employment',async()=>{
  assert.equal((await fetch(`${base}/own/${records[0].id}`)).status,200);
  assert.equal((await fetch(`${base}/own/${records[2].id}`)).status,403);
  records[1].status='terminated';assert.equal((await fetch(`${base}/own/${records[1].id}`)).status,403);
  assert.equal((await fetch(`${base}/api/employees/me/identity?locationId=${b}`)).status,404);
 });
}finally{await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});delete globalThis.__employeeStorage;}
