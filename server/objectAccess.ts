import { db } from './db';
import { eq } from 'drizzle-orm';
import {
  invoiceProcessing, recipes, teamResources, documentTemplates,
  employeeDocuments, employeeDocumentAssignments, employees,
} from '@shared/schema';

// Resolve access from saved records, never from a caller-supplied location ID.
// Unregistered or unscoped objects fail closed rather than becoming public to
// every signed-in account. Existing record-specific download routes remain valid.
export async function getObjectLocationIds(objectPath: string): Promise<(string | null)[]> {
  const groups = await Promise.all([
    db.select({ locationId: invoiceProcessing.locationId }).from(invoiceProcessing)
      .where(eq(invoiceProcessing.attachmentPath, objectPath)),
    db.select({ locationId: recipes.locationId }).from(recipes)
      .where(eq(recipes.imageUrl, objectPath)),
    db.select({ locationId: teamResources.locationId }).from(teamResources)
      .where(eq(teamResources.fileUrl, objectPath)),
    db.select({ locationId: documentTemplates.locationId }).from(documentTemplates)
      .where(eq(documentTemplates.filePath, objectPath)),
    db.select({ locationId: employees.locationId }).from(employeeDocuments)
      .innerJoin(employees, eq(employeeDocuments.employeeId, employees.id))
      .where(eq(employeeDocuments.filePath, objectPath)),
    db.select({ locationId: employees.locationId }).from(employeeDocumentAssignments)
      .innerJoin(employees, eq(employeeDocumentAssignments.employeeId, employees.id))
      .where(eq(employeeDocumentAssignments.completedFilePath, objectPath)),
  ]);
  return Array.from(new Set(groups.flat().map(record => record.locationId)));
}
