import { randomBytes, createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { locations, users, departments, positions, invitationTokens, ownerOnboarding, ownerOnboardingSteps } from '@shared/schema';
import type { db } from './db';

export class CompanySetupError extends Error {}
export const setupSteps = ['restaurant_info', 'departments', 'positions', 'hr_addon', 'employee_invitations'] as const;
const money = z.string().trim().regex(/^(?:\d{1,7})(?:\.\d{1,2})?$/, 'Enter a valid amount').or(z.literal('')).optional();
const name = z.string().trim().min(2).max(100);
export const companyStepSchemas = {
  restaurant_info: z.object({ name, type: z.string().min(1).max(50), address: z.string().trim().min(5), phone: z.string().optional(), manager: name, cuisine: z.string().optional(), seatingCapacity: z.string().optional(), operatingHours: z.record(z.unknown()).optional() }),
  departments: z.object({ departments: z.array(z.object({ name, description: z.string().optional(), budget: money })).min(1).max(50) }),
  positions: z.object({ positions: z.array(z.object({ title: name, departmentId: z.string().min(1), description: z.string().optional(), minHourlyRate: money, maxHourlyRate: money, requirements: z.string().optional() })).min(1).max(100) }),
  hr_addon: z.object({ enableHR: z.boolean(), selectedFeatures: z.array(z.string()).optional(), enableForLocations: z.array(z.string().uuid()).optional() }),
  employee_invitations: z.object({ invitations: z.array(z.object({ firstName: name.max(50), lastName: name.max(50), email: z.string().trim().email().transform(s => s.toLowerCase()), departmentId: z.string().min(1), positionId: z.string().min(1), hourlyRate: money })).max(100) }),
};
export const companyStepRequest = z.object({ stepName: z.enum(setupSteps), status: z.enum(['completed', 'skipped']).default('completed'), stepData: z.unknown() });
export function parseCompanyStep(input: unknown) {
  const request = companyStepRequest.parse(input);
  if (request.status === 'skipped') {
    if (['restaurant_info', 'departments', 'positions'].includes(request.stepName)) throw new CompanySetupError('Complete the required setup steps.');
    return { ...request, stepData: null };
  }
  return { ...request, stepData: companyStepSchemas[request.stepName].parse(request.stepData) };
}
export function setupBillingKey(onboardingId: string, locationId: string) {
  const h = createHash('sha256').update(`onboarding-hr:${onboardingId}:${locationId}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
function selected<T extends { id: string }>(items: T[] | undefined, reference: string): T {
  const item = items?.find(i => i.id === reference) ?? (/^\d+$/.test(reference) ? items?.[Number(reference)] : undefined);
  if (!item) throw new CompanySetupError('Select a valid department and position from this restaurant.');
  return item;
}

// All local setup writes and progress advance together; failed steps remain retryable.
export async function saveCompanyStep(database: Pick<typeof db, 'transaction'>, userId: string, input: unknown) {
  const request = parseCompanyStep(input);
  return database.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'company-setup:' + userId}))`);
    const [owner] = await tx.select().from(users).where(eq(users.id, userId));
    if (!owner || !['owner','platform_admin'].includes(owner.role || '') || owner.accountState !== 'active') throw new CompanySetupError('An active owner account is required.');
    const [progress] = await tx.select().from(ownerOnboarding).where(eq(ownerOnboarding.userId, userId)).for('update');
    if (!progress) throw new CompanySetupError('Start company setup first.');
    const data: any = { ...(progress.data as any || {}) };
    let step: any = request.stepData;
    const owned = await tx.select().from(locations).where(eq(locations.ownerId, userId));
    let location = owned.find(l => l.id === data.restaurant_info?.locationId && l.isActive && !l.deletedAt);
    if (request.stepName === 'restaurant_info') {
      location ??= owned.find(l => l.isActive && !l.deletedAt && l.name === step.name) ?? owned.find(l => l.isActive && !l.deletedAt);
      const values = { name: step.name, type: step.type, address: step.address, phone: step.phone, manager: step.manager };
      if (!location) {
        const limit = ({free:1,core:3} as Record<string,number>)[owner.subscriptionPlan || 'free'];
        if (owner.role !== 'platform_admin' && limit !== undefined && owned.filter(l => l.isActive && !l.deletedAt).length >= limit) throw new CompanySetupError('Your plan has reached its restaurant limit.');
        [location] = await tx.insert(locations).values({ ...values, ownerId: userId }).returning();
      } else [location] = await tx.update(locations).set(values).where(eq(locations.id, location.id)).returning();
      step = { ...step, locationId: location.id };
    } else if (!location) throw new CompanySetupError('Complete restaurant setup before continuing.');
    if (request.stepName === 'departments') {
      const existing = await tx.select().from(departments).where(eq(departments.locationId, location!.id));
      const saved = [];
      const names = new Set<string>();
      for (const department of step.departments) {
        const key = department.name.toLowerCase();
        if (names.has(key)) throw new CompanySetupError('Department names must be unique.');
        names.add(key);
        let row = existing.find(d => d.name.toLowerCase() === key);
        const values = { name: department.name, description: department.description, locationId: location!.id };
        if (row) [row] = await tx.update(departments).set(values).where(eq(departments.id,row.id)).returning();
        else [row] = await tx.insert(departments).values(values).returning();
        saved.push({ ...department, id: row.id });
      }
      step = { departments: saved };
    }
    if (request.stepName === 'positions') {
      const saved = [];
      const seen = new Set<string>();
      for (const position of step.positions) {
        const department = selected<any>(data.departments?.departments, position.departmentId);
        const [realDepartment] = await tx.select().from(departments).where(and(eq(departments.id,department.id),eq(departments.locationId,location!.id)));
        if (!realDepartment) throw new CompanySetupError('Save the restaurant departments before positions.');
        const key = department.id + ':' + position.title.toLowerCase();
        if (seen.has(key)) throw new CompanySetupError('Position titles must be unique within a department.');
        seen.add(key);
        if (position.minHourlyRate && position.maxHourlyRate && Number(position.minHourlyRate) > Number(position.maxHourlyRate)) throw new CompanySetupError('Minimum pay cannot exceed maximum pay.');
        const existing = await tx.select().from(positions).where(eq(positions.departmentId,department.id));
        let row = existing.find(p => p.title.toLowerCase() === position.title.toLowerCase());
        const values = { title: position.title, departmentId: department.id, description: position.description, hourlyRateMin: position.minHourlyRate || null, hourlyRateMax: position.maxHourlyRate || null, requirements: position.requirements };
        if (row) [row] = await tx.update(positions).set(values).where(eq(positions.id,row.id)).returning();
        else [row] = await tx.insert(positions).values(values).returning();
        saved.push({ ...position, departmentId: department.id, id: row.id });
      }
      step = { positions: saved };
    }
    if (request.stepName === 'hr_addon' && step?.enableHR) {
      if (!step.enableForLocations?.length) throw new CompanySetupError('Choose at least one restaurant for HR.');
      for (const id of step.enableForLocations) {
        const target = owned.find(l => l.id === id && l.isActive && !l.deletedAt);
        if (!target?.hrAddonEnabled) throw new CompanySetupError('Complete paid HR activation before continuing.');
      }
    }
    const invitations = [];
    if (request.stepName === 'employee_invitations' && step) {
      const saved = [];
      for (const invite of step.invitations) {
        const department = selected<any>(data.departments?.departments,invite.departmentId);
        const position = selected<any>(data.positions?.positions,invite.positionId);
        const [realPosition] = await tx.select().from(positions).where(and(eq(positions.id,position.id),eq(positions.departmentId,department.id)));
        const [realDepartment] = await tx.select().from(departments).where(and(eq(departments.id,department.id),eq(departments.locationId,location!.id)));
        if (!realPosition || !realDepartment) throw new CompanySetupError('The employee position must belong to the selected department.');
        const existing = await tx.select().from(invitationTokens).where(and(eq(invitationTokens.locationId,location!.id),eq(invitationTokens.email,invite.email)));
        let invitation = existing.find(i => i.status === 'pending' && !i.acceptedAt && i.expiresAt > new Date());
        const previous: any = data.employee_invitations?.invitations?.find((i:any) => i.email === invite.email && i.invitationId);
        const accepted = existing.find(i => i.status === 'accepted' && i.employeeId && (!previous || i.id === previous.invitationId));
        const values = { email: invite.email, firstName: invite.firstName, lastName: invite.lastName, role:'employee', locationId:location!.id, departmentId:department.id, positionId:position.id, hourlyRate:invite.hourlyRate || null, invitedBy:userId };
        if (accepted) invitation = accepted;
        else if (invitation) [invitation] = await tx.update(invitationTokens).set(values).where(eq(invitationTokens.id,invitation.id)).returning();
        else [invitation] = await tx.insert(invitationTokens).values({ ...values, token:randomBytes(32).toString('hex'), expiresAt:new Date(Date.now()+168*3600000) }).returning();
        if (!invitation) throw new CompanySetupError('Invitation could not be saved.');
        if (!accepted) invitations.push(invitation);
        saved.push({ ...invite, departmentId:department.id, positionId:position.id, invitationId:invitation.id });
      }
      step = { invitations:saved };
    }
    data[request.stepName] = step;
    const index = setupSteps.indexOf(request.stepName);
    const skipped = new Set((progress.skippedSteps as string[]) || []);
    if (request.status === 'skipped') skipped.add(request.stepName); else skipped.delete(request.stepName);
    const [updated] = await tx.update(ownerOnboarding).set({ data, isCompleted:false, completedAt:null, currentStep:setupSteps[Math.min(index+1,4)], completedSteps:Math.max(progress.completedSteps || 0,index+1), skippedSteps:[...skipped],updatedAt:new Date() }).where(eq(ownerOnboarding.id,progress.id)).returning();
    const [record] = await tx.select().from(ownerOnboardingSteps).where(and(eq(ownerOnboardingSteps.onboardingId,progress.id),eq(ownerOnboardingSteps.stepName,request.stepName)));
    const values = { status:request.status,stepData:step,completedAt:request.status === 'completed' ? new Date() : null,updatedAt:new Date() };
    if (record) await tx.update(ownerOnboardingSteps).set(values).where(eq(ownerOnboardingSteps.id,record.id));
    else await tx.insert(ownerOnboardingSteps).values({ ...values,onboardingId:progress.id,stepName:request.stepName,startedAt:new Date() });
    return { progress:updated, invitations };
  });
}

export async function finishCompanySetup(database: Pick<typeof db,'transaction'>, userId:string) {
  return database.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'company-setup:' + userId}))`);
    const [progress] = await tx.select().from(ownerOnboarding).where(eq(ownerOnboarding.userId,userId)).for('update');
    const data:any = progress?.data;
    const [location] = data?.restaurant_info?.locationId ? await tx.select().from(locations).where(and(eq(locations.id,data.restaurant_info.locationId),eq(locations.ownerId,userId))) : [];
    if (!progress || !location?.isActive || location.deletedAt) throw new CompanySetupError('Complete restaurant setup before finishing.');
    for (const step of ['departments','positions'] as const) {
      const rows = data?.[step]?.[step];
      if (!rows?.length || rows.some((r:any) => !r.id)) throw new CompanySetupError(`Complete ${step} setup before finishing.`);
    }
    const realDepartments = await tx.select().from(departments).where(eq(departments.locationId,location.id));
    const savedDepartmentIds = new Set(data.departments.departments.map((d:any) => d.id));
    if (data.departments.departments.some((d:any) => !realDepartments.some(row => row.id === d.id))) throw new CompanySetupError('Save the restaurant departments again before finishing.');
    for (const position of data.positions.positions) {
      const [row] = await tx.select().from(positions).where(eq(positions.id,position.id));
      if (!row || !savedDepartmentIds.has(row.departmentId) || row.departmentId !== position.departmentId) throw new CompanySetupError('Save positions in the current restaurant departments before finishing.');
    }
    if (data.hr_addon?.enableHR) {
      for (const id of data.hr_addon.enableForLocations || []) {
        const [target] = await tx.select().from(locations).where(and(eq(locations.id,id),eq(locations.ownerId,userId)));
        if (!target?.isActive || target.deletedAt || !target.hrAddonEnabled) throw new CompanySetupError('Review HR activation before finishing.');
      }
    }
    const records = await tx.select().from(ownerOnboardingSteps).where(eq(ownerOnboardingSteps.onboardingId,progress.id));
    if (setupSteps.some(step => !records.some(r => r.stepName === step && (r.status === 'completed' || (!['restaurant_info','departments','positions'].includes(step) && r.status === 'skipped'))))) throw new CompanySetupError('Complete or skip each setup step before finishing.');
    const [result] = await tx.update(ownerOnboarding).set({isCompleted:true,completedAt:new Date(),completedSteps:5,updatedAt:new Date()}).where(eq(ownerOnboarding.id,progress.id)).returning();
    return result;
  });
}
