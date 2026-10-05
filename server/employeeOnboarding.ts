import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { onboardingTokens, employeeOnboardingData, employees, locations, users } from '@shared/schema';
import { encryptOnboardingPII } from './encryption';
import type { db } from './db';
export class EmployeeSetupError extends Error {}
const text = z.string().trim().max(255).optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional();
const payload = z.object({
  personalInfo:z.object({phone:text,address:text,city:text,state:text,zipCode:text,dateOfBirth:date,ssn:z.string().regex(/^(?:\d{3}-?\d{2}-?\d{4})?$/).optional()}).optional(),
  emergencyContact:z.object({name:text,phone:text,relationship:text}).optional(),
  bankingInfo:z.object({bankName:text,accountNumber:z.string().regex(/^\d{4,17}$/).or(z.literal('')).optional(),routingNumber:z.string().regex(/^\d{9}$/).or(z.literal('')).optional(),accountType:z.enum(['checking','savings']).optional()}).optional(),
});
export async function completeEmployeeProfile(database:Pick<typeof db,'transaction'>,token:string,input:unknown,context:{ipAddress?:string;userAgent?:string}={}) {
  const {personalInfo:p,emergencyContact:e,bankingInfo:b} = payload.parse(input);
  return database.transaction(async tx => {
    const [link] = await tx.select().from(onboardingTokens).where(eq(onboardingTokens.token,token)).for('update');
    if (!link || link.isUsed || link.expiresAt < new Date()) throw new EmployeeSetupError('Invalid or expired onboarding invitation.');
    const [employee] = await tx.select().from(employees).where(eq(employees.id,link.employeeId));
    const [location] = employee ? await tx.select().from(locations).where(eq(locations.id,employee.locationId)) : [];
    const [owner] = location?.ownerId ? await tx.select().from(users).where(eq(users.id,location.ownerId)) : [];
    if (!employee || !location?.isActive || location.deletedAt || !location.hrAddonEnabled || !owner || owner.accountState !== 'active') throw new EmployeeSetupError('This restaurant is no longer available for onboarding.');
    const [existing] = await tx.select().from(employeeOnboardingData).where(eq(employeeOnboardingData.employeeId,employee.id));
    const values = encryptOnboardingPII({ employeeId:employee.id,tokenId:link.id,phone:p?.phone,address:p?.address,city:p?.city,state:p?.state,zipCode:p?.zipCode,dateOfBirth:p?.dateOfBirth || undefined,socialSecurityNumber:p?.ssn,emergencyContactName:e?.name,emergencyContactPhone:e?.phone,emergencyContactRelationship:e?.relationship,bankName:b?.bankName,accountNumber:b?.accountNumber,routingNumber:b?.routingNumber,accountType:b?.accountType,...context });
    if (existing) await tx.update(employeeOnboardingData).set(values).where(eq(employeeOnboardingData.id,existing.id));
    else await tx.insert(employeeOnboardingData).values(values);
    await tx.update(employees).set({status:'active'}).where(eq(employees.id,employee.id));
    await tx.update(onboardingTokens).set({isUsed:true,completedAt:new Date()}).where(and(eq(onboardingTokens.id,link.id),eq(onboardingTokens.isUsed,false)));
  });
}
