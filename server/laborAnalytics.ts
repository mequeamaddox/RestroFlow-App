import type { Employee, PosEmployeeMapping, PosTimeclock, TimeEntry } from '@shared/schema';

type Wage = Pick<Employee, 'id' | 'hourlyRate'>;
type ManualEntry = Pick<TimeEntry, 'id' | 'employeeId' | 'clockInTime' | 'clockOutTime' | 'breakStartTime' | 'breakEndTime'>;
type PosEntry = Pick<PosTimeclock, 'posEmployeeId' | 'clockInAt' | 'clockOutAt' | 'breakSeconds' | 'wageCents' | 'hrTimeEntryId'>;
type Mapping = Pick<PosEmployeeMapping, 'posEmployeeId' | 'employeeId' | 'status'>;

export function calculateWorkedLabor(employees: Wage[], manual: ManualEntry[], pos: PosEntry[], mappings: Mapping[]) {
  const rates = new Map(employees.map(employee => [employee.id, Number(employee.hourlyRate || 0)]));
  const mappedEmployees = new Map(mappings.filter(mapping => mapping.status !== 'ignored')
    .map(mapping => [mapping.posEmployeeId, mapping.employeeId]));
  // POS entries can also be mirrored in the HR time table. Count the source once.
  const mirroredIds = new Set(pos.filter(entry => entry.clockOutAt).map(entry => entry.hrTimeEntryId));
  let hours = 0;
  let labor = 0;
  for (const entry of manual) {
    if (!entry.clockInTime || !entry.clockOutTime || mirroredIds.has(entry.id)) continue;
    const breakHours = entry.breakStartTime && entry.breakEndTime
      ? Math.max(0, (entry.breakEndTime.getTime() - entry.breakStartTime.getTime()) / 3600000) : 0;
    const paidHours = Math.max(0, (entry.clockOutTime.getTime() - entry.clockInTime.getTime()) / 3600000 - breakHours);
    hours += paidHours;
    labor += paidHours * (rates.get(entry.employeeId || '') || 0);
  }
  for (const entry of pos) {
    if (!entry.clockOutAt) continue;
    const paidHours = Math.max(0, (entry.clockOutAt.getTime() - entry.clockInAt.getTime()) / 3600000
      - Math.max(0, entry.breakSeconds || 0) / 3600);
    const rate = entry.wageCents != null ? entry.wageCents / 100
      : rates.get(mappedEmployees.get(entry.posEmployeeId) || '') || 0;
    hours += paidHours;
    labor += paidHours * rate;
  }
  return { hours, labor };
}
