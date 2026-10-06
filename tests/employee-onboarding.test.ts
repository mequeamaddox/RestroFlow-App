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

test('paperwork accepts numbers typed with spaces or dashes and explains bad ones',async()=>{
  const db=staff();const result=await acceptStaffInvitation(db.client,'invite-token',{id:'staff',email:'employee@example.com'});
  await assert.rejects(completeEmployeeProfile(db.client,result.onboardingToken!,{bankingInfo:{routingNumber:'1234'}}),/Routing number must be 9 digits/);
  await completeEmployeeProfile(db.client,result.onboardingToken!,{personalInfo:{ssn:'123 45 6789'},bankingInfo:{routingNumber:'1234-5678-9',accountNumber:'0001 2345'}});
  assert.equal(db.read().onboarding_tokens[0].isUsed,true);assert.match(db.read().employee_onboarding_data[0].routingNumber,/^enc:v1:/);
});

test('a later paperwork submission with blank fields keeps details saved earlier',async()=>{
  const db=staff();const result=await acceptStaffInvitation(db.client,'invite-token',{id:'staff',email:'employee@example.com'});
  await completeEmployeeProfile(db.client,result.onboardingToken!,{personalInfo:{phone:'5551234567'},bankingInfo:{bankName:'First Bank',accountNumber:'12345678',routingNumber:'123456789'}});
  const saved={...db.read().employee_onboarding_data[0]};
  db.read().onboarding_tokens.push({id:randomUUID(),employeeId:result.employeeId,token:'second-link',isUsed:false,expiresAt:new Date(Date.now()+3600000)});
  await completeEmployeeProfile(db.client,'second-link',{personalInfo:{phone:'5559999999'},bankingInfo:{bankName:'',accountNumber:'',routingNumber:''}});
  const row=db.read().employee_onboarding_data[0];
  assert.equal(row.phone,'5559999999');assert.equal(row.bankName,'First Bank');assert.equal(row.accountNumber,saved.accountNumber);assert.equal(row.routingNumber,saved.routingNumber);
});

const signedW4={filingStatus:'single',multipleJobs:false,qualifyingChildren:1,dependentsAmount:2200,extraWithholding:25,signedName:'Test Employee',attest:true};
const signedI9={citizenship:'citizen',noPreparer:true,signedName:'Test Employee',attest:true};
const profile={personalInfo:{phone:'5551234567',address:'1 Main St',city:'Tampa',state:'FL',zipCode:'33601',dateOfBirth:'1990-01-01',ssn:'123-45-6789'}};

test('signed W-4 and I-9 Section 1 are saved encrypted with the profile, with signer details',async()=>{
  const {decryptField}=await import('../server/encryption');
  const db=staff();const result=await acceptStaffInvitation(db.client,'invite-token',{id:'staff',email:'employee@example.com'});
  await completeEmployeeProfile(db.client,result.onboardingToken!,{...profile,w4:signedW4,i9:signedI9},{ipAddress:'203.0.113.9',userAgent:'test'});
  const forms=db.read().employee_tax_forms;assert.equal(forms.length,2);
  const w4=forms.find((f:any)=>f.formType==='w4');const i9=forms.find((f:any)=>f.formType==='i9');
  assert.match(w4.employeeData,/^enc:v1:/);assert.match(i9.employeeData,/^enc:v1:/);
  assert.equal(w4.status,'complete');assert.equal(i9.status,'employee_signed');assert.equal(i9.employeeSignedName,'Test Employee');assert.equal(i9.employeeIp,'203.0.113.9');
  const section1=JSON.parse(decryptField(i9.employeeData));
  assert.equal(section1.address,'1 Main St');assert.equal(section1.ssn,'123456789');assert.equal(section1.citizenship,'citizen');assert.equal(section1.attest,undefined);
  assert.equal(JSON.parse(decryptField(w4.employeeData)).extraWithholding,25);
});

test('W-4 exemption clears withholding adjustments and I-9 status rules are enforced',async()=>{
  const {w4Schema,i9Section1Schema}=await import('../shared/taxForms');
  const exempt=w4Schema.parse({...signedW4,exempt:true});assert.equal(exempt.dependentsAmount,0);assert.equal(exempt.extraWithholding,0);
  assert.throws(()=>w4Schema.parse({...signedW4,attest:false}),/confirm the statement/);
  assert.throws(()=>i9Section1Schema.parse({...signedI9,citizenship:'permanent_resident'}),/USCIS \/ A-Number/);
  assert.equal(i9Section1Schema.parse({...signedI9,citizenship:'permanent_resident',uscisNumber:'A-123 456 789'}).uscisNumber,'123456789');
  assert.throws(()=>i9Section1Schema.parse({...signedI9,citizenship:'authorized_alien',workAuthExpiration:'N/A'}),/Enter one of/);
  assert.ok(i9Section1Schema.parse({...signedI9,citizenship:'authorized_alien',workAuthExpiration:'2027-06-30',foreignPassportNumber:'X1234567',passportCountry:'Canada'}));
  assert.throws(()=>i9Section1Schema.parse({...signedI9,noPreparer:false}),/Supplement A/);
});

test('an I-9 without an address is rejected and nothing from the submission is saved',async()=>{
  const db=staff();const result=await acceptStaffInvitation(db.client,'invite-token',{id:'staff',email:'employee@example.com'});
  await assert.rejects(completeEmployeeProfile(db.client,result.onboardingToken!,{personalInfo:{phone:'5551234567'},w4:signedW4,i9:signedI9}),/full address and date of birth/);
  assert.equal(db.read().employee_tax_forms.length,0);assert.equal(db.read().employee_onboarding_data.length,0);assert.equal(db.read().onboarding_tokens[0].isUsed,false);
});

test('I-9 Section 2 is due three business days after the first day of work',async()=>{
  const {i9Section2DueDate,i9Section2Schema}=await import('../shared/taxForms');
  assert.equal(i9Section2DueDate('2026-10-08'),'2026-10-13');assert.equal(i9Section2DueDate('2026-10-05'),'2026-10-08');
  const base={firstDayOfEmployment:'2026-10-05',employerName:'Pat Manager',employerTitle:'General Manager',businessName:'Fish Camp',businessAddress:'1 Main St, Tampa, FL',attest:true};
  const doc={title:'U.S. Passport',issuingAuthority:'U.S. Department of State',number:'123456789'};
  assert.ok(i9Section2Schema.parse({...base,documentChoice:'list_a',listA:[doc]}));
  assert.throws(()=>i9Section2Schema.parse({...base,documentChoice:'list_b_c',listB:doc}),/one List B and one List C/);
});
