export function matchesEmployeeSearch(employee:{firstName?:string|null;lastName?:string|null;email?:string|null;employeeNumber?:string|null},search:string) {
  const term=search.trim().toLowerCase();
  return !term || [employee.firstName,employee.lastName,employee.email,employee.employeeNumber,[employee.firstName,employee.lastName].filter(Boolean).join(' ')].some(value=>(value || '').toLowerCase().includes(term));
}
