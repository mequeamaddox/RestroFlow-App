import { createContext, useContext, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

// Permission types (matching server-side)
export enum Permission {
  // User Management
  VIEW_ALL_EMPLOYEES = "view_all_employees",
  MANAGE_EMPLOYEES = "manage_employees",
  MANAGE_ROLES = "manage_roles",
  VIEW_EMPLOYEE_DETAILS = "view_employee_details",
  
  // Inventory & Operations
  VIEW_INVENTORY = "view_inventory",
  MANAGE_INVENTORY = "manage_inventory",
  VIEW_RECIPES = "view_recipes",
  MANAGE_RECIPES = "manage_recipes",
  VIEW_VENDORS = "view_vendors",
  MANAGE_VENDORS = "manage_vendors",
  MANAGE_PURCHASE_ORDERS = "manage_purchase_orders",
  VIEW_PURCHASE_ORDERS = "view_purchase_orders",
  
  // Financial & Analytics
  VIEW_ANALYTICS = "view_analytics",
  VIEW_FINANCIAL_DATA = "view_financial_data",
  MANAGE_PRICING = "manage_pricing",
  VIEW_LABOR_COSTS = "view_labor_costs",
  
  // HR & Scheduling
  MANAGE_SCHEDULES = "manage_schedules",
  VIEW_ALL_SCHEDULES = "view_all_schedules",
  MANAGE_TIME_OFF = "manage_time_off",
  VIEW_TIME_TRACKING = "view_time_tracking",
  MANAGE_PAYROLL = "manage_payroll",
  VIEW_PERFORMANCE = "view_performance",
  
  // Tasks & Communication
  ASSIGN_TASKS = "assign_tasks",
  VIEW_ALL_TASKS = "view_all_tasks",
  MANAGE_COMMUNICATION = "manage_communication",
  
  // System Administration
  MANAGE_LOCATIONS = "manage_locations",
  MANAGE_SETTINGS = "manage_settings",
  VIEW_AUDIT_LOGS = "view_audit_logs",
}

export enum RestaurantRole {
  PLATFORM_ADMIN = "platform_admin",
  OWNER = "owner",
  GM = "gm",
  FOH_MANAGER = "foh_manager",
  BOH_MANAGER = "boh_manager",
  TEAM_LEAD = "team_lead",
  EMPLOYEE = "employee"
}

// Role-based permission matrix (matching server-side)
const ROLE_PERMISSIONS: Record<RestaurantRole, Permission[]> = {
  // Platform admin gets every permission
  [RestaurantRole.PLATFORM_ADMIN]: Object.values(Permission),
  [RestaurantRole.OWNER]: [
    Permission.VIEW_ALL_EMPLOYEES,
    Permission.MANAGE_EMPLOYEES,
    Permission.MANAGE_ROLES,
    Permission.VIEW_EMPLOYEE_DETAILS,
    Permission.VIEW_INVENTORY,
    Permission.MANAGE_INVENTORY,
    Permission.VIEW_RECIPES,
    Permission.MANAGE_RECIPES,
    Permission.VIEW_VENDORS,
    Permission.MANAGE_VENDORS,
    Permission.MANAGE_PURCHASE_ORDERS,
    Permission.VIEW_PURCHASE_ORDERS,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_FINANCIAL_DATA,
    Permission.MANAGE_PRICING,
    Permission.VIEW_LABOR_COSTS,
    Permission.MANAGE_SCHEDULES,
    Permission.VIEW_ALL_SCHEDULES,
    Permission.MANAGE_TIME_OFF,
    Permission.VIEW_TIME_TRACKING,
    Permission.MANAGE_PAYROLL,
    Permission.VIEW_PERFORMANCE,
    Permission.ASSIGN_TASKS,
    Permission.VIEW_ALL_TASKS,
    Permission.MANAGE_COMMUNICATION,
    Permission.MANAGE_LOCATIONS,
    Permission.MANAGE_SETTINGS,
    Permission.VIEW_AUDIT_LOGS,
  ],
  
  [RestaurantRole.GM]: [
    Permission.VIEW_ALL_EMPLOYEES,
    Permission.MANAGE_EMPLOYEES,
    Permission.VIEW_EMPLOYEE_DETAILS,
    Permission.VIEW_INVENTORY,
    Permission.MANAGE_INVENTORY,
    Permission.VIEW_RECIPES,
    Permission.MANAGE_RECIPES,
    Permission.VIEW_VENDORS,
    Permission.MANAGE_VENDORS,
    Permission.MANAGE_PURCHASE_ORDERS,
    Permission.VIEW_PURCHASE_ORDERS,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_FINANCIAL_DATA,
    Permission.MANAGE_PRICING,
    Permission.VIEW_LABOR_COSTS,
    Permission.MANAGE_SCHEDULES,
    Permission.VIEW_ALL_SCHEDULES,
    Permission.MANAGE_TIME_OFF,
    Permission.VIEW_TIME_TRACKING,
    Permission.MANAGE_PAYROLL,
    Permission.VIEW_PERFORMANCE,
    Permission.ASSIGN_TASKS,
    Permission.VIEW_ALL_TASKS,
    Permission.MANAGE_COMMUNICATION,
    Permission.MANAGE_SETTINGS,
  ],
  
  [RestaurantRole.FOH_MANAGER]: [
    Permission.VIEW_ALL_EMPLOYEES,
    Permission.MANAGE_EMPLOYEES,
    Permission.VIEW_EMPLOYEE_DETAILS,
    Permission.VIEW_INVENTORY,
    Permission.MANAGE_INVENTORY,
    Permission.VIEW_RECIPES,
    Permission.MANAGE_RECIPES,
    Permission.VIEW_VENDORS,
    Permission.VIEW_PURCHASE_ORDERS,
    Permission.VIEW_ANALYTICS,
    Permission.MANAGE_SCHEDULES,
    Permission.VIEW_ALL_SCHEDULES,
    Permission.MANAGE_TIME_OFF,
    Permission.VIEW_TIME_TRACKING,
    Permission.ASSIGN_TASKS,
    Permission.VIEW_ALL_TASKS,
    Permission.MANAGE_COMMUNICATION,
  ],
  
  [RestaurantRole.BOH_MANAGER]: [
    Permission.VIEW_ALL_EMPLOYEES,
    Permission.MANAGE_EMPLOYEES,
    Permission.VIEW_EMPLOYEE_DETAILS,
    Permission.VIEW_INVENTORY,
    Permission.MANAGE_INVENTORY,
    Permission.VIEW_RECIPES,
    Permission.MANAGE_RECIPES,
    Permission.VIEW_VENDORS,
    Permission.MANAGE_VENDORS,
    Permission.MANAGE_PURCHASE_ORDERS,
    Permission.VIEW_PURCHASE_ORDERS,
    Permission.VIEW_ANALYTICS,
    Permission.MANAGE_SCHEDULES,
    Permission.VIEW_ALL_SCHEDULES,
    Permission.MANAGE_TIME_OFF,
    Permission.VIEW_TIME_TRACKING,
    Permission.ASSIGN_TASKS,
    Permission.VIEW_ALL_TASKS,
    Permission.MANAGE_COMMUNICATION,
  ],
  
  [RestaurantRole.TEAM_LEAD]: [
    Permission.VIEW_EMPLOYEE_DETAILS,
    Permission.VIEW_INVENTORY,
    Permission.VIEW_RECIPES,
    Permission.VIEW_PURCHASE_ORDERS,
    Permission.VIEW_ALL_SCHEDULES,
    Permission.VIEW_TIME_TRACKING,
    Permission.ASSIGN_TASKS,
    Permission.VIEW_ALL_TASKS,
    Permission.MANAGE_COMMUNICATION,
  ],
  
  [RestaurantRole.EMPLOYEE]: [
    Permission.VIEW_INVENTORY,
    Permission.VIEW_RECIPES,
    Permission.VIEW_ALL_SCHEDULES,
    Permission.VIEW_TIME_TRACKING,
    Permission.VIEW_ALL_TASKS,
  ],
};

interface PermissionContextType {
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
  userRole: RestaurantRole;
  canManageUser: (targetRole: string) => boolean;
}

const PermissionContext = createContext<PermissionContextType | null>(null);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  const userRole = ((user as any)?.role || 'employee') as RestaurantRole;
  
  const hasPermission = (permission: Permission): boolean => {
    return ROLE_PERMISSIONS[userRole]?.includes(permission) || false;
  };
  
  const hasAnyPermission = (permissions: Permission[]): boolean => {
    return permissions.some(permission => hasPermission(permission));
  };
  
  const hasAllPermissions = (permissions: Permission[]): boolean => {
    return permissions.every(permission => hasPermission(permission));
  };
  
  const ROLE_HIERARCHY: Record<RestaurantRole, number> = {
    [RestaurantRole.EMPLOYEE]: 1,
    [RestaurantRole.TEAM_LEAD]: 2,
    [RestaurantRole.BOH_MANAGER]: 3,
    [RestaurantRole.FOH_MANAGER]: 3,
    [RestaurantRole.GM]: 4,
    [RestaurantRole.OWNER]: 5,
    [RestaurantRole.PLATFORM_ADMIN]: 10,
  };
  
  const canManageUser = (targetRole: string): boolean => {
    const managerLevel = ROLE_HIERARCHY[userRole] || 0;
    const targetLevel = ROLE_HIERARCHY[targetRole as RestaurantRole] || 0;
    return managerLevel > targetLevel;
  };
  
  return (
    <PermissionContext.Provider value={{
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      userRole,
      canManageUser,
    }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return context;
}

// HOC for protecting components based on permissions
export function withPermission<T extends object>(
  Component: React.ComponentType<T>,
  requiredPermissions: Permission | Permission[],
  fallback?: React.ReactNode
) {
  return function PermissionProtectedComponent(props: T) {
    const { hasPermission, hasAnyPermission } = usePermissions();
    
    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    const hasAccess = Array.isArray(requiredPermissions) 
      ? hasAnyPermission(permissions)
      : hasPermission(requiredPermissions);
    
    if (!hasAccess) {
      return fallback || (
        <div className="p-4 text-center text-muted-foreground">
          <p>You don't have permission to access this feature.</p>
          <p className="text-sm mt-2">Contact your manager for access.</p>
        </div>
      );
    }
    
    return <Component {...props} />;
  };
}

// Hook for conditional rendering based on permissions
export function usePermissionGuard() {
  const { hasPermission, hasAnyPermission, hasAllPermissions, userRole } = usePermissions();
  
  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    userRole,
    // Utility functions for common permission patterns
    canViewHR: () => hasAnyPermission([Permission.VIEW_ALL_EMPLOYEES, Permission.MANAGE_EMPLOYEES]),
    canManageHR: () => hasPermission(Permission.MANAGE_EMPLOYEES),
    canViewFinancials: () => hasPermission(Permission.VIEW_FINANCIAL_DATA),
    canManageInventory: () => hasPermission(Permission.MANAGE_INVENTORY),
    canViewAnalytics: () => hasPermission(Permission.VIEW_ANALYTICS),
    isManager: () => [RestaurantRole.PLATFORM_ADMIN, RestaurantRole.OWNER, RestaurantRole.GM, RestaurantRole.FOH_MANAGER, RestaurantRole.BOH_MANAGER].includes(userRole),
    isOwnerOrGM: () => [RestaurantRole.PLATFORM_ADMIN, RestaurantRole.OWNER, RestaurantRole.GM].includes(userRole),
  };
}