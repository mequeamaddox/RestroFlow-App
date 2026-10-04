import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { departments, positions, employees, invitationTokens, locations, users, userPermissions } from '@shared/schema';
import type { db } from './db';

export class StaffAccessError extends Error {}

// The invitation determines the role for this restaurant, never global owner access.
export async function acceptStaffInvitation(database: Pick<typeof db, 'transaction'>, token: string, identity: { id: string; email: string }) {
  return database.transaction(async tx => {
    const [invite] = await tx.select().from(invitationTokens).where(eq(invitationTokens.token, token)).for('update');
    if (!invite || invite.acceptedAt || invite.status !== 'pending' || (invite.expiresAt && invite.expiresAt < new Date())) throw new StaffAccessError('Invitation is expired or already used.');
    if (invite.email.toLowerCase() !== identity.email.toLowerCase()) throw new StaffAccessError('Sign in with the email address on this invitation.');
    const [location] = await tx.select().from(locations).where(eq(locations.id, invite.locationId));
    if (!location) throw new StaffAccessError('Restaurant no longer exists.');
    if (invite.departmentId) {
      const [department] = await tx.select().from(departments).where(eq(departments.id, invite.departmentId));
      if (!department || department.locationId !== invite.locationId) throw new StaffAccessError('Invitation department belongs to another restaurant.');
    }
    if (invite.positionId) {
      const [position] = await tx.select().from(positions).where(eq(positions.id, invite.positionId));
      const [department] = position ? await tx.select().from(departments).where(eq(departments.id, position.departmentId)) : [];
      if (!department || department.locationId !== invite.locationId) throw new StaffAccessError('Invitation position belongs to another restaurant.');
    }
    // Serialize memberships for this restaurant, including different invitations for one email.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${invite.locationId + ':' + identity.email.toLowerCase()}))`);
    const [existingUser] = await tx.select().from(users).where(eq(users.email, identity.email.toLowerCase()));
    const user = existingUser ?? (await tx.insert(users).values({ id: identity.id, email: identity.email.toLowerCase(), firstName: invite.firstName, lastName: invite.lastName, role: invite.role, defaultLocationId: invite.locationId }).returning())[0];
    if (!user) throw new StaffAccessError('Could not create the staff account.');
    const [existingEmployee] = await tx.select().from(employees).where(and(eq(employees.email, user.email!), eq(employees.locationId, invite.locationId)));
    const employee = existingEmployee ?? (await tx.insert(employees).values({
      employeeNumber: `E${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`,
      firstName: invite.firstName || user.firstName || 'New', lastName: invite.lastName || user.lastName || 'Employee',
      email: user.email, locationId: invite.locationId, departmentId: invite.departmentId, positionId: invite.positionId,
      hourlyRate: invite.hourlyRate, salary: invite.salary, hireDate: invite.startDate || new Date().toISOString().slice(0, 10), status: 'active', notes: `Clerk ID: ${identity.id}`,
    }).returning())[0];
    const [permission] = await tx.select().from(userPermissions).where(and(eq(userPermissions.userId, user.id), eq(userPermissions.locationId, invite.locationId)));
    const membership = { role: invite.role, permissions: [], isActive: true, grantedBy: invite.invitedBy, updatedAt: new Date() };
    if (permission) await tx.update(userPermissions).set(membership as any).where(eq(userPermissions.id, permission.id));
    else await tx.insert(userPermissions).values({ ...membership, userId: user.id, locationId: invite.locationId } as any);
    await tx.update(invitationTokens).set({ status: 'accepted', acceptedAt: new Date(), employeeId: employee.id }).where(eq(invitationTokens.id, invite.id));
    return { userId: user.id, employeeId: employee.id };
  });
}
