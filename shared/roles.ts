/**
 * Single source of truth for all role values.
 * Import Role and the helpers everywhere — never compare raw strings.
 *
 * Legacy note: older DB rows may still carry "admin" (= GM equivalent) or
 * "manager" (= BOH_MANAGER equivalent). Both are kept here for back-compat.
 */
export const Role = {
  PLATFORM_ADMIN: 'platform_admin',
  OWNER:          'owner',
  GM:             'gm',
  FOH_MANAGER:    'foh_manager',
  BOH_MANAGER:    'boh_manager',
  TEAM_LEAD:      'team_lead',
  EMPLOYEE:       'employee',
  // Legacy aliases still present in older DB rows
  ADMIN:          'admin',    // treated as GM-level
  MANAGER:        'manager',  // treated as BOH_MANAGER-level
} as const;

export type RoleValue = typeof Role[keyof typeof Role];

/** Developer / superuser — bypasses all tenant and billing gates. */
export function isPlatformAdmin(role: string | null | undefined): boolean {
  return role === Role.PLATFORM_ADMIN;
}

/** Owner or platform admin — can manage billing, locations, invitations. */
export function isOwnerLevel(role: string | null | undefined): boolean {
  return role === Role.PLATFORM_ADMIN || role === Role.OWNER;
}

/** Manager or above — can manage employees, view HR data, etc. */
export function isManagerLevel(role: string | null | undefined): boolean {
  return (
    isOwnerLevel(role) ||
    role === Role.GM ||
    role === Role.FOH_MANAGER ||
    role === Role.BOH_MANAGER ||
    role === Role.ADMIN ||    // legacy
    role === Role.MANAGER     // legacy
  );
}

/** Pure staff — sees only the employee self-service portal. */
export function isEmployeeOnly(role: string | null | undefined): boolean {
  return role === Role.EMPLOYEE || role === Role.TEAM_LEAD;
}
