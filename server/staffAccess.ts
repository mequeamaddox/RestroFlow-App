import { z } from 'zod';
import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { departments, positions, employees, invitationTokens, locations, users, userPermissions, onboardingTokens } from '@shared/schema';
import type { db } from './db';

export const staffInvitationRequest = z.object({
  email:z.string().trim().email().transform(s => s.toLowerCase()),
  role:z.enum(['employee','team_lead','foh_manager','boh_manager','gm']).default('employee'),
  locationId:z.string().uuid().optional(),
  firstName:z.string().trim().min(1).max(50).optional(), lastName:z.string().trim().min(1).max(50).optional(),
  departmentId:z.string().uuid().or(z.literal('')).optional(), positionId:z.string().uuid().or(z.literal('')).optional(),
  hourlyRate:z.coerce.number().min(0).max(99999999).optional().transform(v => v === undefined ? undefined : String(v)),
  salary:z.coerce.number().min(0).max(9999999999).optional().transform(v => v === undefined ? undefined : String(v)),
  startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), personalMessage:z.string().max(5000).optional(),
  expiresInHours:z.number().int().min(1).max(168).default(168),
});
export class StaffAccessError extends Error {}

// The invitation determines the role for this restaurant, never global owner access.
export async function acceptStaffInvitation(database: Pick<typeof db, 'transaction'>, token: string, identity: { id: string; email: string }) {
  return database.transaction(async tx => {
    const [invite] = await tx.select().from(invitationTokens).where(eq(invitationTokens.token, token)).for('update');
    if (!invite || invite.acceptedAt || invite.status !== 'pending' || (invite.expiresAt && invite.expiresAt < new Date())) throw new StaffAccessError('Invitation is expired or already used.');
    if (invite.email.toLowerCase() !== identity.email.toLowerCase()) throw new StaffAccessError('Sign in with the email address on this invitation.');
    const [location] = await tx.select().from(locations).where(eq(locations.id, invite.locationId));
    if (!location || location.isActive === false || location.deletedAt) throw new StaffAccessError('Restaurant is no longer active.');
    if (location.ownerId) {
      const [owner] = await tx.select().from(users).where(eq(users.id,location.ownerId));
      if (!owner || owner.accountState !== 'active') throw new StaffAccessError('Restaurant owner is no longer active.');
    }
    if (invite.departmentId) {
      const [department] = await tx.select().from(departments).where(eq(departments.id, invite.departmentId));
      if (!department || department.locationId !== invite.locationId) throw new StaffAccessError('Invitation department belongs to another restaurant.');
    }
    if (invite.positionId) {
      const [position] = await tx.select().from(positions).where(eq(positions.id, invite.positionId));
      const [department] = position ? await tx.select().from(departments).where(eq(departments.id, position.departmentId)) : [];
      if (!department || department.locationId !== invite.locationId || (invite.departmentId && department.id !== invite.departmentId)) throw new StaffAccessError('Invitation position does not belong to the selected department.');
    }
    // Serialize memberships for this restaurant, including different invitations for one email.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${invite.locationId + ':' + identity.email.toLowerCase()}))`);
    const [existingUser] = await tx.select().from(users).where(eq(users.email, identity.email.toLowerCase()));
    if (existingUser && existingUser.accountState && existingUser.accountState !== 'active') throw new StaffAccessError('This account is disabled. Contact your administrator.');
    const user = existingUser ?? (await tx.insert(users).values({ id: identity.id, email: identity.email.toLowerCase(), firstName: invite.firstName, lastName: invite.lastName, role: invite.role, defaultLocationId: invite.locationId }).returning())[0];
    if (!user) throw new StaffAccessError('Could not create the staff account.');
    const [existingEmployee] = await tx.select().from(employees).where(and(eq(employees.email, user.email!), eq(employees.locationId, invite.locationId)));
    const employment = {
      firstName: invite.firstName || existingEmployee?.firstName || user.firstName || 'New',
      lastName: invite.lastName || existingEmployee?.lastName || user.lastName || 'Employee',
      email:user.email,locationId:invite.locationId,
      departmentId:invite.departmentId || existingEmployee?.departmentId,
      positionId:invite.positionId || existingEmployee?.positionId,
      hourlyRate:invite.hourlyRate ?? existingEmployee?.hourlyRate,
      salary:invite.salary ?? existingEmployee?.salary,
      hireDate:invite.startDate || existingEmployee?.hireDate || new Date().toISOString().slice(0,10),
      status:'active',
    };
    const [employee] = existingEmployee
      ? await tx.update(employees).set(employment).where(eq(employees.id,existingEmployee.id)).returning()
      : await tx.insert(employees).values({ ...employment,employeeNumber:`E${crypto.randomUUID().replace(/-/g,'').slice(0,9)}`,notes:`Clerk ID: ${identity.id}` }).returning();
    if (!employee) throw new StaffAccessError('Could not save the employee profile.');
    const [permission] = await tx.select().from(userPermissions).where(and(eq(userPermissions.userId, user.id), eq(userPermissions.locationId, invite.locationId)));
    const membership = { role: invite.role, permissions: [], isActive: true, grantedBy: invite.invitedBy, updatedAt: new Date() };
    if (permission) await tx.update(userPermissions).set(membership as any).where(eq(userPermissions.id, permission.id));
    else await tx.insert(userPermissions).values({ ...membership, userId: user.id, locationId: invite.locationId } as any);
    await tx.update(invitationTokens).set({ status: 'accepted', acceptedAt: new Date(), employeeId: employee.id }).where(eq(invitationTokens.id, invite.id));
    let onboardingToken: string | undefined;
    if (location.hrAddonEnabled) {
      onboardingToken = crypto.randomBytes(32).toString('hex');
      await tx.insert(onboardingTokens).values({ employeeId:employee.id,token:onboardingToken,expiresAt:new Date(Date.now()+72*3600000) });
    }
    return { userId: user.id, employeeId: employee.id, onboardingToken };
  });
}
