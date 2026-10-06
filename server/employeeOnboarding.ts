import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { onboardingTokens, employeeOnboardingData, employees, locations, users, employeeTaxForms } from '@shared/schema';
import { encryptOnboardingPII, decryptOnboardingPII, encryptField } from './encryption';
import { w4Schema, i9Section1Schema, W4_FORM_VERSION, I9_FORM_VERSION } from '@shared/taxForms';
import type { db } from './db';
export class EmployeeSetupError extends Error {}
const text = z.string().trim().max(255).optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date of birth as YYYY-MM-DD.').or(z.literal('')).optional();
// People type these with spaces or dashes; store digits only.
const digits = (pattern: RegExp, message: string) =>
  z.preprocess(v => typeof v === 'string' ? v.replace(/[\s-]/g, '') : v, z.string().regex(pattern, message).or(z.literal('')).optional());
const payload = z.object({
  personalInfo:z.object({phone:text,address:text,city:text,state:text,zipCode:text,dateOfBirth:date,ssn:digits(/^\d{9}$/, 'Social Security number must be 9 digits.')}).optional(),
  emergencyContact:z.object({name:text,phone:text,relationship:text}).optional(),
  bankingInfo:z.object({bankName:text,accountNumber:digits(/^\d{4,17}$/, 'Account number must be 4 to 17 digits.'),routingNumber:digits(/^\d{9}$/, 'Routing number must be 9 digits.'),accountType:z.enum(['checking','savings']).optional()}).optional(),
  w4:w4Schema.optional(),
  i9:i9Section1Schema.optional(),
});
export async function completeEmployeeProfile(database:Pick<typeof db,'transaction'>,token:string,input:unknown,context:{ipAddress?:string;userAgent?:string}={}) {
  const {personalInfo:p,emergencyContact:e,bankingInfo:b,w4,i9} = payload.parse(input);
  return database.transaction(async tx => {
    const [link] = await tx.select().from(onboardingTokens).where(eq(onboardingTokens.token,token)).for('update');
    if (!link || link.isUsed || link.expiresAt < new Date()) throw new EmployeeSetupError('Invalid or expired onboarding invitation.');
    const [employee] = await tx.select().from(employees).where(eq(employees.id,link.employeeId));
    const [location] = employee ? await tx.select().from(locations).where(eq(locations.id,employee.locationId)) : [];
    const [owner] = location?.ownerId ? await tx.select().from(users).where(eq(users.id,location.ownerId)) : [];
    if (!employee || !location?.isActive || location.deletedAt || !location.hrAddonEnabled || !owner || owner.accountState !== 'active') throw new EmployeeSetupError('This restaurant is no longer available for onboarding.');
    const [existing] = await tx.select().from(employeeOnboardingData).where(eq(employeeOnboardingData.employeeId,employee.id));
    // Blank answers must not erase details saved by an earlier submission.
    const provided = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
    const values = encryptOnboardingPII(provided({ employeeId:employee.id,tokenId:link.id,phone:p?.phone,address:p?.address,city:p?.city,state:p?.state,zipCode:p?.zipCode,dateOfBirth:p?.dateOfBirth || undefined,socialSecurityNumber:p?.ssn,emergencyContactName:e?.name,emergencyContactPhone:e?.phone,emergencyContactRelationship:e?.relationship,bankName:b?.bankName,accountNumber:b?.accountNumber,routingNumber:b?.routingNumber,accountType:b?.accountType,...context }) as any);
    if (existing) await tx.update(employeeOnboardingData).set(values).where(eq(employeeOnboardingData.id,existing.id));
    else await tx.insert(employeeOnboardingData).values(values);
    const signedContext = { employeeIp: context.ipAddress, employeeUserAgent: context.userAgent };
    if (w4) {
      const { signedName, attest, ...form } = w4;
      await tx.insert(employeeTaxForms).values({ employeeId:employee.id, formType:'w4', formVersion:W4_FORM_VERSION, status:'complete', employeeData:encryptField(JSON.stringify(form)), employeeSignedName:signedName, employeeSignedAt:new Date(), ...signedContext });
    }
    if (i9) {
      // Section 1 identity fields come from this profile (or what was saved earlier), not retyped.
      const prior: any = existing ? decryptOnboardingPII(existing) : {};
      const pick = (now?: string, before?: string) => (now ? now : before || undefined);
      const { signedName, attest, noPreparer, ...answers } = i9;
      const section1 = { lastName:employee.lastName, firstName:employee.firstName, ...answers,
        address:pick(p?.address,prior.address), city:pick(p?.city,prior.city), state:pick(p?.state,prior.state), zipCode:pick(p?.zipCode,prior.zipCode),
        dateOfBirth:pick(p?.dateOfBirth,prior.dateOfBirth), ssn:pick(p?.ssn,prior.socialSecurityNumber), phone:pick(p?.phone,prior.phone) };
      if (!section1.address || !section1.city || !section1.state || !section1.zipCode || !section1.dateOfBirth) throw new EmployeeSetupError('Form I-9 needs your full address and date of birth.');
      await tx.insert(employeeTaxForms).values({ employeeId:employee.id, formType:'i9', formVersion:I9_FORM_VERSION, status:'employee_signed', employeeData:encryptField(JSON.stringify(section1)), employeeSignedName:signedName, employeeSignedAt:new Date(), ...signedContext });
    }
    await tx.update(employees).set({status:'active'}).where(eq(employees.id,employee.id));
    await tx.update(onboardingTokens).set({isUsed:true,completedAt:new Date()}).where(and(eq(onboardingTokens.id,link.id),eq(onboardingTokens.isUsed,false)));
  });
}
