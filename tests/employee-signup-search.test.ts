import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationAccountError } from '../server/invitationAccountError';
import { matchesEmployeeSearch } from '../shared/employeeSearch';
test('password rejection does not falsely tell employees they have an existing account',()=>{
  const failure=invitationAccountError({errors:[{code:'form_password_pwned',longMessage:'Use a different password.'}]});
  assert.equal(failure.code,'PASSWORD_REJECTED');assert.equal(failure.message,'Use a different password.');
  assert.equal(invitationAccountError({errors:[{code:'form_identifier_exists'}]}).code,'ACCOUNT_EXISTS');
  assert.equal(invitationAccountError({}).code,'ACCOUNT_CREATION_FAILED');
});
test('employee search handles missing email and names, full names, and employee numbers',()=>{
  const employee={firstName:'Jane',lastName:'Smith',email:null,employeeNumber:'EMP012'};
  assert.equal(matchesEmployeeSearch(employee,' jane smith '),true);
  assert.equal(matchesEmployeeSearch(employee,'EMP012'),true);
  assert.equal(matchesEmployeeSearch({firstName:null,lastName:null,email:null},'someone'),false);
  assert.equal(matchesEmployeeSearch(employee,'missing'),false);
  assert.equal(matchesEmployeeSearch(employee,''),true);
});
