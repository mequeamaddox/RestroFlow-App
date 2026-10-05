import test from 'node:test';
import assert from 'node:assert/strict';
import { saveCompanyStep, finishCompanySetup, parseCompanyStep, setupBillingKey } from '../server/companyOnboarding';
import { onboardingDatabase } from './onboarding-database';
const restaurant={name:'Fish Camp',type:'restaurant',address:'10744 Ocean Hwy',manager:'Manager'};
const step=(stepName:string,stepData:any,status='completed')=>({stepName,stepData,status});
async function foundation(db:ReturnType<typeof onboardingDatabase>) {
  await saveCompanyStep(db.client,'owner',step('restaurant_info',restaurant));
  await saveCompanyStep(db.client,'owner',step('departments',{departments:[{name:'Kitchen'},{name:'Front of House'}]}));
  await saveCompanyStep(db.client,'owner',step('positions',{positions:[{title:'Cook',departmentId:'0',minHourlyRate:'18.00',maxHourlyRate:'22.00'},{title:'Server',departmentId:'1'}]}));
}
test('company setup creates real owned restaurant, departments and positions with stable IDs',async()=>{
  const db=onboardingDatabase();await foundation(db);
  assert.equal(db.read().locations[0].ownerId,'owner');assert.equal(db.read().departments.length,2);assert.equal(db.read().positions.length,2);
  assert.equal(db.read().positions[0].hourlyRateMin,'18.00');assert.equal(db.read().positions[0].departmentId,db.read().departments[0].id);
  const saved=db.read().owner_onboarding[0].data;assert.equal(saved.restaurant_info.locationId,db.read().locations[0].id);assert.equal(saved.positions.positions[0].departmentId,saved.departments.departments[0].id);
  await foundation(db);assert.equal(db.read().locations.length,1);assert.equal(db.read().departments.length,2);assert.equal(db.read().positions.length,2);
});
test('a failed real restaurant or position write cannot advance saved progress',async()=>{
  const db=onboardingDatabase();db.fail('locations');await assert.rejects(saveCompanyStep(db.client,'owner',step('restaurant_info',restaurant)),/database failure/);
  assert.equal(db.read().owner_onboarding[0].currentStep,'restaurant_info');assert.equal(db.read().locations.length,0);
  db.fail('');await saveCompanyStep(db.client,'owner',step('restaurant_info',restaurant));await saveCompanyStep(db.client,'owner',step('departments',{departments:[{name:'Kitchen'}]}));
  db.fail('positions');await assert.rejects(saveCompanyStep(db.client,'owner',step('positions',{positions:[{title:'Cook',departmentId:'0'}]})));
  assert.equal(db.read().owner_onboarding[0].currentStep,'positions');assert.equal(db.read().positions.length,0);
});
test('wizard invitations preserve department, position and pay, and retries do not duplicate invitations',async()=>{
  const db=onboardingDatabase();await foundation(db);
  const invites=step('employee_invitations',{invitations:[{firstName:'Test',lastName:'Employee',email:'Staff@Example.com',departmentId:'0',positionId:'0',hourlyRate:'20.00'}]});
  const a=await saveCompanyStep(db.client,'owner',invites);const b=await saveCompanyStep(db.client,'owner',invites);
  assert.equal(db.read().invitation_tokens.length,1);assert.equal(a.invitations[0].token,b.invitations[0].token);
  const i=db.read().invitation_tokens[0];assert.equal(i.email,'staff@example.com');assert.equal(i.hourlyRate,'20.00');assert.equal(i.departmentId,db.read().departments[0].id);assert.equal(i.positionId,db.read().positions[0].id);
});
test('invalid department-position combinations roll back the entire invitation step',async()=>{
  const db=onboardingDatabase();await foundation(db);
  await assert.rejects(saveCompanyStep(db.client,'owner',step('employee_invitations',{invitations:[{firstName:'Test',lastName:'Employee',email:'one@example.com',departmentId:'0',positionId:'0'},{firstName:'Test',lastName:'Employee',email:'two@example.com',departmentId:'1',positionId:'0'}]})),/selected department/);
  assert.equal(db.read().invitation_tokens.length,0);assert.equal(db.read().owner_onboarding[0].data.employee_invitations,undefined);
});
test('HR selection cannot silently grant an unpaid add-on or a foreign restaurant',async()=>{
  const db=onboardingDatabase();await foundation(db);const id=db.read().locations[0].id;
  await assert.rejects(saveCompanyStep(db.client,'owner',step('hr_addon',{enableHR:true,enableForLocations:[id]})),/paid HR/);
  assert.equal(db.read().owner_onboarding[0].data.hr_addon,undefined);
  db.read().locations[0].hrAddonEnabled=true;await saveCompanyStep(db.client,'owner',step('hr_addon',{enableHR:true,enableForLocations:[id]}));
  assert.equal(db.read().owner_onboarding[0].data.hr_addon.enableHR,true);assert.equal(setupBillingKey('setup',id),setupBillingKey('setup',id));assert.notEqual(setupBillingKey('setup',id),setupBillingKey('other',id));
});
test('completion requires real setup and each optional step completed or explicitly skipped',async()=>{
  const db=onboardingDatabase();await assert.rejects(finishCompanySetup(db.client,'owner'),/restaurant/);await foundation(db);await assert.rejects(finishCompanySetup(db.client,'owner'),/each setup step/);
  await saveCompanyStep(db.client,'owner',step('hr_addon',null,'skipped'));await saveCompanyStep(db.client,'owner',step('employee_invitations',null,'skipped'));
  const result=await finishCompanySetup(db.client,'owner');assert.equal(result.isCompleted,true);assert.ok(result.completedAt);
  db.read().locations[0].isActive=false;await assert.rejects(finishCompanySetup(db.client,'owner'),/restaurant/);
});
test('setup rejects unsupported steps, required skips, malformed pay and inactive owners',async()=>{
  assert.throws(()=>parseCompanyStep(step('unknown',{})));assert.throws(()=>parseCompanyStep(step('departments',null,'skipped')));
  const db=onboardingDatabase();db.read().users[0].accountState='suspended';await assert.rejects(saveCompanyStep(db.client,'owner',step('restaurant_info',restaurant)),/active owner/);
});
