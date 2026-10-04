import test from 'node:test';
import assert from 'node:assert/strict';
import { employees, invitationTokens, locations, users, userPermissions } from '../shared/schema';
import { acceptStaffInvitation } from '../server/staffAccess';

function database(failEmployee = false, existing = false) {
  let state = {
    invitation: { id: 'invite', token: 'token', status: 'pending', acceptedAt: null, email: 'staff@example.com', locationId: 'restaurant', role: 'foh_manager', expiresAt: new Date(Date.now() + 100000), invitedBy: 'owner' },
    user: existing ? { id: 'original-user-id', email: 'staff@example.com', role: 'owner' } : null as any,
    employee: null as any, membership: null as any,
  };
  const client = { async transaction(work: (tx: any) => Promise<any>) {
    const draft = structuredClone(state);
    const tx = {
      execute: async () => {},
      select: () => ({ from: (table: any) => ({ where: () => {
        const query: any = { then: (resolve: any) => Promise.resolve(table === invitationTokens ? [draft.invitation] : table === locations ? [{ id: 'restaurant' }] : table === users ? draft.user ? [draft.user] : [] : table === employees ? draft.employee ? [draft.employee] : [] : table === userPermissions ? draft.membership ? [draft.membership] : [] : []).then(resolve), for: () => query }; return query;
      } }) }),
      insert: (table: any) => ({ values: (value: any) => {
        const query: any = { then: (resolve: any, reject: any) => Promise.resolve().then(() => {
          if (table === users) { draft.user = value; return [value]; }
          if (table === employees) { if (failEmployee) throw new Error('employee failure'); draft.employee = { ...value, id: 'employee' }; return [draft.employee]; }
          if (table === userPermissions) { draft.membership = { ...value, id: 'membership' }; return [draft.membership]; }
          throw new Error('Unexpected insert');
        }).then(resolve, reject), returning: () => query }; return query;
      } }),
      update: (table: any) => ({ set: (values: any) => ({ where: async () => {
        if (table === invitationTokens) Object.assign(draft.invitation, values);
        else if (table === userPermissions) Object.assign(draft.membership, values);
        else throw new Error('Unexpected update');
      } }) }),
    };
    const result = await work(tx); state = draft; return result;
  } };
  return { client: client as unknown as Parameters<typeof acceptStaffInvitation>[0], read: () => state };
}
test('invitation acceptance commits the staff profile, membership, and accepted state together', async () => {
  const db = database(); await acceptStaffInvitation(db.client, 'token', { id: 'clerk', email: 'staff@example.com' });
  assert.equal(db.read().membership.userId, 'clerk'); assert.equal(db.read().membership.locationId, 'restaurant');
  assert.equal(db.read().membership.role, 'foh_manager'); assert.equal(db.read().membership.isActive, true);
  assert.equal(db.read().invitation.status, 'accepted'); assert.ok(db.read().employee);
});
test('failed staff setup leaves invitation pending and creates no partial local account', async () => {
  const db = database(true); await assert.rejects(acceptStaffInvitation(db.client, 'token', { id: 'clerk', email: 'staff@example.com' }), /employee failure/);
  assert.equal(db.read().invitation.status, 'pending'); assert.equal(db.read().user, null); assert.equal(db.read().membership, null);
});
test('invitation cannot be accepted by a different signed-in email', async () => {
  const db = database(); await assert.rejects(acceptStaffInvitation(db.client, 'token', { id: 'clerk', email: 'other@example.com' }), /email address/);
  assert.equal(db.read().invitation.status, 'pending');
});
test('existing accounts keep canonical identity and global ownership while gaining scoped membership', async () => {
  const db = database(false, true); await acceptStaffInvitation(db.client, 'token', { id: 'new-clerk-id', email: 'staff@example.com' });
  assert.equal(db.read().user.id, 'original-user-id'); assert.equal(db.read().user.role, 'owner');
  assert.equal(db.read().membership.userId, 'original-user-id'); assert.equal(db.read().membership.role, 'foh_manager');
  await assert.rejects(acceptStaffInvitation(db.client, 'token', { id: 'new-clerk-id', email: 'staff@example.com' }), /already used/);
});
