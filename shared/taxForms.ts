import { z } from 'zod';

// Form editions these screens mirror. Review each January against the current IRS / USCIS releases.
export const W4_FORM_VERSION = 'Form W-4 (2026)';
export const I9_FORM_VERSION = 'Form I-9 (Edition 01/20/25)';
// Per-dependent amounts printed in Form W-4 Step 3; used only to suggest a total the employee can adjust.
export const W4_DEPENDENT_AMOUNTS = { qualifyingChild: 2200, otherDependent: 500 };

export const W4_ATTESTATION = 'Under penalties of perjury, I declare that this certificate, to the best of my knowledge and belief, is true, correct, and complete.';
export const I9_EMPLOYEE_ATTESTATION = 'I am aware that federal law provides for imprisonment and/or fines for false statements, or the use of false documents, in connection with the completion of this form. I attest, under penalty of perjury, that this information, including my selection of the box attesting to my citizenship or immigration status, is true and correct.';
export const I9_EMPLOYER_ATTESTATION = 'I attest, under penalty of perjury, that (1) I have examined the documentation presented by the above-named employee, (2) the above-listed documentation appears to be genuine and to relate to the employee named, and (3) to the best of my knowledge, the employee is authorized to work in the United States.';

export const FILING_STATUS_LABELS = {
  single: 'Single or Married filing separately',
  married_jointly: 'Married filing jointly or Qualifying surviving spouse',
  head_of_household: 'Head of household',
} as const;

export const CITIZENSHIP_LABELS = {
  citizen: 'A citizen of the United States',
  noncitizen_national: 'A noncitizen national of the United States',
  permanent_resident: 'A lawful permanent resident',
  authorized_alien: 'A noncitizen (other than item 2 and 3 above) authorized to work',
} as const;

const digitsOnly = (v: unknown) => (typeof v === 'string' ? v.replace(/[\s-]/g, '') : v);
const money = z.coerce.number({ invalid_type_error: 'Enter a dollar amount.' }).min(0, 'Amounts cannot be negative.').max(10_000_000).default(0);
const optionalText = (max = 100) => z.string().trim().max(max).optional().transform(v => (v ? v : undefined));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.');
const signature = {
  signedName: z.string().trim().min(2, 'Type your full name to sign.').max(120),
  attest: z.literal(true, { errorMap: () => ({ message: 'Check the box to confirm the statement above your signature.' }) }),
};

export const w4Schema = z.object({
  filingStatus: z.enum(['single', 'married_jointly', 'head_of_household'], { errorMap: () => ({ message: 'Choose your filing status.' }) }),
  multipleJobs: z.boolean().default(false),
  qualifyingChildren: z.coerce.number().int().min(0).max(20).default(0),
  otherDependents: z.coerce.number().int().min(0).max(20).default(0),
  dependentsAmount: money,
  otherIncome: money,
  deductions: money,
  extraWithholding: money,
  exempt: z.boolean().default(false),
  ...signature,
}).transform(w4 => (w4.exempt
  // Claiming exemption uses Steps 1 and 5 only; the IRS ignores Steps 2-4.
  ? { ...w4, multipleJobs: false, qualifyingChildren: 0, otherDependents: 0, dependentsAmount: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 }
  : w4));
export type W4 = z.infer<typeof w4Schema>;

// Employee-entered I-9 Section 1 fields; name, address, birth date and SSN come from the profile step.
export const i9Section1Schema = z.object({
  middleInitial: z.string().trim().max(1).optional().transform(v => (v ? v.toUpperCase() : undefined)),
  otherLastNames: optionalText(100),
  email: z.string().trim().email('Enter a valid email or leave it blank.').optional().or(z.literal('')).transform(v => (v ? v : undefined)),
  citizenship: z.enum(['citizen', 'noncitizen_national', 'permanent_resident', 'authorized_alien'], { errorMap: () => ({ message: 'Choose your citizenship or immigration status.' }) }),
  uscisNumber: z.preprocess(v => (typeof v === 'string' ? v.replace(/[\s-]/g, '').replace(/^A/i, '') : v), z.string().regex(/^\d{7,9}$/, 'USCIS / A-Number must be 7 to 9 digits.').optional().or(z.literal(''))).transform(v => (v ? v : undefined)),
  workAuthExpiration: z.union([isoDate, z.literal('N/A'), z.literal('')]).optional().transform(v => (v ? v : undefined)),
  i94Number: z.preprocess(digitsOnly, z.string().regex(/^[A-Za-z0-9]{11}$/, 'Form I-94 admission number must be 11 characters.').optional().or(z.literal(''))).transform(v => (v ? v : undefined)),
  foreignPassportNumber: optionalText(30),
  passportCountry: optionalText(60),
  noPreparer: z.literal(true, { errorMap: () => ({ message: 'Confirm you completed this yourself. If someone helped you, ask your manager for the paper Supplement A.' }) }),
  ...signature,
}).superRefine((i9, ctx) => {
  if (i9.citizenship === 'permanent_resident' && !i9.uscisNumber) {
    ctx.addIssue({ code: 'custom', path: ['uscisNumber'], message: 'Lawful permanent residents must enter their USCIS / A-Number.' });
  }
  if (i9.citizenship === 'authorized_alien') {
    if (!i9.workAuthExpiration) ctx.addIssue({ code: 'custom', path: ['workAuthExpiration'], message: 'Enter the date your work authorization expires, or N/A.' });
    const hasPassport = !!(i9.foreignPassportNumber && i9.passportCountry);
    if (!i9.uscisNumber && !i9.i94Number && !hasPassport) {
      ctx.addIssue({ code: 'custom', path: ['uscisNumber'], message: 'Enter one of: USCIS / A-Number, Form I-94 admission number, or foreign passport number and country.' });
    }
  }
});
export type I9Section1 = z.infer<typeof i9Section1Schema>;

const i9Document = z.object({
  title: z.string().trim().min(2, 'Enter the document title.').max(120),
  issuingAuthority: z.string().trim().min(2, 'Enter the issuing authority.').max(120),
  number: z.string().trim().min(1, 'Enter the document number.').max(60),
  expiration: z.union([isoDate, z.literal('N/A'), z.literal('')]).optional().transform(v => (v ? v : undefined)),
});

export const i9Section2Schema = z.object({
  firstDayOfEmployment: isoDate,
  documentChoice: z.enum(['list_a', 'list_b_c']),
  listA: z.array(i9Document).max(3).optional(),
  listB: i9Document.optional(),
  listC: i9Document.optional(),
  additionalInfo: optionalText(500),
  alternativeProcedure: z.boolean().default(false),
  employerName: z.string().trim().min(2, 'Type your full name to sign.').max(120),
  employerTitle: z.string().trim().min(2, 'Enter your title.').max(80),
  businessName: z.string().trim().min(2, 'Enter the business name.').max(120),
  businessAddress: z.string().trim().min(5, 'Enter the business address.').max(240),
  attest: signature.attest,
}).superRefine((s2, ctx) => {
  if (s2.documentChoice === 'list_a' && !s2.listA?.length) ctx.addIssue({ code: 'custom', path: ['listA'], message: 'Record the List A document you examined.' });
  if (s2.documentChoice === 'list_b_c' && (!s2.listB || !s2.listC)) ctx.addIssue({ code: 'custom', path: ['listB'], message: 'Record one List B and one List C document.' });
});
export type I9Section2 = z.infer<typeof i9Section2Schema>;

/** Section 2 is due within three business days after the first day of work (weekends skipped). */
export function i9Section2DueDate(firstDay: string): string {
  const date = new Date(`${firstDay}T12:00:00Z`);
  let added = 0;
  while (added < 3) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return date.toISOString().slice(0, 10);
}

/** Show only the last four characters of an identifying number. */
export const maskTail = (value?: string | null) => (value ? `•••${value.slice(-4)}` : undefined);
