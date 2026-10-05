import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { acceptStaffInvitation, staffInvitationRequest } from '../server/staffAccess';
import { completeEmployeeProfile } from '../server/employeeOnboarding';
import { onboardingDatabase } from './onboarding-database';
process.env.PII_ENCRYPTION_KEY='test-only-onboarding-secret';
function staff(hr=true) {
  const db=onboardingDatabase();const locationId=randomUUID();
  db.read().locations.push({id:locationId,ownerId:'owner',name:'Fish Camp',isActive:true,hrAddonEnabled:hr});
  db.read().invitation_tokens.push({id:randomUUID(),token:'invite-token',status:'pending',email:'employee@example.com',role:'employee',locationId,invitedBy:'owner',expiresAt:new Date(Date.now()+3600000)});
  return db;
}
test('accepting an HR restaurant invitation links access and opens employee paperwork automatically',async()=>{
  const db=staff();const result=await acceptStaffInvitation(db.client,'invite-token',{id:'staff',email:'employee@example.com'});
  assert.ok(result.onboardingToken);assert.equal(db.read().onboarding_tokens[0].token,result.onboardingToken);assert.equal(db.read().onboarding_tokens[0].employeeId,result.employeeId);
  assert.equal(db.read().user_permissions[0].locationId,db.read().locations[0].id);assert.equal(db.read().invitation_tokens[0].status,'accepted');
});
test('Core-only staff can join without requiring paid HR paperwork',async()=>{
  const db=staff(false);const result=await acceptStaffInvitation(db.client,'invite-token',{id:'staff',email:'employee@example.com'});assert.equal(result.onboardingToken,undefined);assert.equal(db.read().onboarding_tokens.length,0);
});
test('disabled restaurants, owners and existing employees cannot accept invitations',async()=>{
  for(const kind of ['restaurant','deleted','owner','employee']) {
    const db=staff();if(kind==='restaurant')db.read().locations[0].isActive=false;if(kind==='deleted')db.read().locations[0].deletedAt=new Date();if(kind==='owner')db.read().users[0].accountState='suspended';if(kind==='employee')db.read().users.push({id:'staff',email:'employee@example.com',role:'employee',accountState:'deleted'});
    await assert.rejects(acceptStaffInvitation(db.client,'invite-token',{id:'staff',email:'employee@example.com'}));assert.equal(db.read().invitation_tokens[0].status,'pending');assert.equal(db.read().employees.length,0);
  }
});
test('paperwork writes encrypted sensitive fields and consumes its link in the same transaction',async()=>{
  const db=staff();const result=await acceptStaffInvitation(db.client,'invite-token',{id:'staff',email:'employee@example.com'});
  await completeEmployeeProfile(db.client,result.onboardingToken!,{personalInfo:{phone:'5551234567',ssn:'123-45-6789',dateOfBirth:'1990-01-01'},emergencyContact:{name:'Contact'},bankingInfo:{accountNumber:'12345678',routingNumber:'123456789'}});
  const row=db.read().employee_onboarding_data[0];assert.match(row.socialSecurityNumber,/^enc:v1:/);assert.match(row.accountNumber,/^enc:v1:/);assert.match(row.routingNumber,/^enc:v1:/);assert.equal(db.read().onboarding_tokens[0].isUsed,true);
  await assert.rejects(completeEmployeeProfile(db.client,result.onboardingToken!,{}),/Invalid or expired/);assert.equal(db.read().employee_onboarding_data.length,1);
});
test('failed profile or link writes leave no partial paperwork and remain retryable',async()=>{
  for(const table of ['employee_onboarding_data','onboarding_tokens']) {
    const db=staff();const result=await acceptStaffInvitation(db.client,'invite-token',{id:'staff',email:'employee@example.com'});db.fail(table);
    await assert.rejects(completeEmployeeProfile(db.client,result.onboardingToken!,{personalInfo:{phone:'5551234567'}}),/database failure/);assert.equal(db.read().onboarding_tokens[0].isUsed,false);assert.equal(db.read().employee_onboarding_data.length,0);
    db.fail('');await completeEmployeeProfile(db.client,result.onboardingToken!,{personalInfo:{phone:'5551234567'}});assert.equal(db.read().onboarding_tokens[0].isUsed,true);
  }
});
test('expired links and disabled owners cannot submit employee paperwork',async()=>{
  for(const kind of ['expired','owner']) {
    const db=staff();const result=await acceptStaffInvitation(db.client,'invite-token',{id:'staff',email:'employee@example.com'});if(kind==='expired')db.read().onboarding_tokens[0].expiresAt=new Date(0);else db.read().users[0].accountState='deleted';
    await assert.rejects(completeEmployeeProfile(db.client,result.onboardingToken!,{}));assert.equal(db.read().employee_onboarding_data.length,0);
  }
});
test('employee invitation form accepts canonical manager roles and rejects owner access and invalid data',()=>{
  for(const role of ['employee','team_lead','foh_manager','boh_manager','gm']) assert.equal(staffInvitationRequest.parse({email:'Staff@Example.com',role,hourlyRate:18,startDate:'2026-10-05'}).role,role);
  assert.throws(()=>staffInvitationRequest.parse({email:'staff@example.com',role:'owner'}));assert.throws(()=>staffInvitationRequest.parse({email:'staff@example.com',role:'manager'}));assert.throws(()=>staffInvitationRequest.parse({email:'bad',hourlyRate:-1}));assert.throws(()=>staffInvitationRequest.parse({email:'staff@example.com',startDate:'2026-10-05T00:00:00Z'}));
});

test('invitation acceptance updates a pre-created employee profile without duplicating it',async()=>{
  const db=staff(false);const employeeId=randomUUID();
  db.read().employees.push({id:employeeId,employeeNumber:'EEXISTING',firstName:'Test',lastName:'Employee',email:'employee@example.com',locationId:db.read().locations[0].id,status:'inactive',hourlyRate:'14.00',hireDate:'2026-09-01'});
  db.read().invitation_tokens[0].hourlyRate='20.00';
  const result=await acceptStaffInvitation(db.client,'invite-token',{id:'staff',email:'employee@example.com'});
  assert.equal(result.employeeId,employeeId);assert.equal(db.read().employees.length,1);assert.equal(db.read().employees[0].hourlyRate,'20.00');assert.equal(db.read().employees[0].status,'active');assert.equal(db.read().employees[0].hireDate,'2026-09-01');
});
