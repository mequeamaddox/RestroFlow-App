import type { Request, Response, NextFunction } from "express";

// Restaurant role hierarchy and permissions
export enum RestaurantRole {
  PLATFORM_ADMIN = "platform_admin",
  OWNER = "owner",
  GM = "gm", // General Manager
  FOH_MANAGER = "foh_manager", // Front of House Manager
  BOH_MANAGER = "boh_manager", // Back of House Manager
  TEAM_LEAD = "team_lead",
  EMPLOYEE = "employee"
}

// Permission categories for different system areas
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

// Role-based permission matrix
export const ROLE_PERMISSIONS: Record<RestaurantRole, Permission[]> = {
  [RestaurantRole.PLATFORM_ADMIN]: [], // platform_admin bypasses at the function level
  [RestaurantRole.OWNER]: [
    // Full access to everything
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
    // General Manager - nearly full access, but can't manage other owners
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
    // Front of House Manager - customer-facing operations
    Permission.VIEW_ALL_EMPLOYEES, // Only FoH team
    Permission.MANAGE_EMPLOYEES, // Only FoH team
    Permission.VIEW_EMPLOYEE_DETAILS,
    Permission.VIEW_INVENTORY, // Limited to FoH items
    Permission.MANAGE_INVENTORY, // Limited to FoH items
    Permission.VIEW_RECIPES, // Menu items
    Permission.MANAGE_RECIPES, // Menu items
    Permission.VIEW_VENDORS, // FoH vendors
    Permission.VIEW_PURCHASE_ORDERS,
    Permission.VIEW_ANALYTICS, // FoH metrics
    Permission.MANAGE_SCHEDULES, // FoH schedules
    Permission.VIEW_ALL_SCHEDULES,
    Permission.MANAGE_TIME_OFF,
    Permission.VIEW_TIME_TRACKING,
    Permission.ASSIGN_TASKS,
    Permission.VIEW_ALL_TASKS,
    Permission.MANAGE_COMMUNICATION,
  ],
  
  [RestaurantRole.BOH_MANAGER]: [
    // Back of House Manager - kitchen and prep operations
    Permission.VIEW_ALL_EMPLOYEES, // Only BoH team
    Permission.MANAGE_EMPLOYEES, // Only BoH team
    Permission.VIEW_EMPLOYEE_DETAILS,
    Permission.VIEW_INVENTORY, // Kitchen inventory
    Permission.MANAGE_INVENTORY, // Kitchen inventory
    Permission.VIEW_RECIPES, // Kitchen recipes
    Permission.MANAGE_RECIPES, // Kitchen recipes
    Permission.VIEW_VENDORS, // Food vendors
    Permission.MANAGE_VENDORS, // Food vendors
    Permission.MANAGE_PURCHASE_ORDERS, // Food orders
    Permission.VIEW_PURCHASE_ORDERS,
    Permission.VIEW_ANALYTICS, // Kitchen metrics
    Permission.MANAGE_SCHEDULES, // BoH schedules
    Permission.VIEW_ALL_SCHEDULES,
    Permission.MANAGE_TIME_OFF,
    Permission.VIEW_TIME_TRACKING,
    Permission.ASSIGN_TASKS,
    Permission.VIEW_ALL_TASKS,
    Permission.MANAGE_COMMUNICATION,
  ],
  
  [RestaurantRole.TEAM_LEAD]: [
    // Team Lead - limited management of direct reports
    Permission.VIEW_EMPLOYEE_DETAILS, // Own team only
    Permission.VIEW_INVENTORY,
    Permission.VIEW_RECIPES,
    Permission.VIEW_PURCHASE_ORDERS,
    Permission.VIEW_ALL_SCHEDULES,
    Permission.VIEW_TIME_TRACKING,
    Permission.ASSIGN_TASKS, // Limited scope
    Permission.VIEW_ALL_TASKS,
    Permission.MANAGE_COMMUNICATION, // Team communication
  ],
  
  [RestaurantRole.EMPLOYEE]: [
    // Employee - own data and basic operational access
    Permission.VIEW_INVENTORY, // Read-only
    Permission.VIEW_RECIPES, // Read-only
    Permission.VIEW_ALL_SCHEDULES, // Own schedule
    Permission.VIEW_TIME_TRACKING, // Own time data
    Permission.VIEW_ALL_TASKS, // Own tasks
  ],
};

// Utility function to check if user has permission
export function hasPermission(userRole: string, permission: Permission): boolean {
  if (userRole === 'platform_admin') return true;
  const role = userRole as RestaurantRole;
  return ROLE_PERMISSIONS[role]?.includes(permission) || false;
}

// Utility function to check multiple permissions
export function hasAnyPermission(userRole: string, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(userRole, permission));
}

// Utility function to check if user has all permissions
export function hasAllPermissions(userRole: string, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(userRole, permission));
}

// Middleware to check permissions
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized - No user session" });
    }

    try {
      // Import storage to get user role from database
      const { storage } = await import('./storage');
      const userId = user.id;
      const dbUser = await storage.getUser(userId);
      const userRole = dbUser?.role || 'employee';

      if (userRole === 'platform_admin') return next();

      if (!hasPermission(userRole, permission)) {
        return res.status(403).json({
          message: "Forbidden - Insufficient permissions",
          required: permission,
          userRole
        });
      }

      next();
    } catch (error) {
      console.error('Error checking permissions:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}

// Middleware to check multiple permissions (OR logic)
export function requireAnyPermission(permissions: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      return res.status(401).json({ message: "Unauthorized - No user session" });
    }
    
    try {
      // Import storage to get user role from database
      const { storage } = await import('./storage');
      const userId = user.id;
      const dbUser = await storage.getUser(userId);
      const userRole = dbUser?.role || 'employee';
      
      if (!hasAnyPermission(userRole, permissions)) {
        return res.status(403).json({ 
          message: "Forbidden - Insufficient permissions",
          required: permissions,
          userRole
        });
      }
      
      next();
    } catch (error) {
      console.error('Error checking permissions:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}

// Helper to get user's effective permissions
export function getUserPermissions(userRole: string): Permission[] {
  const role = userRole as RestaurantRole;
  return ROLE_PERMISSIONS[role] || [];
}

// Role hierarchy levels (higher number = more authority)
export const ROLE_HIERARCHY: Record<RestaurantRole, number> = {
  [RestaurantRole.EMPLOYEE]: 1,
  [RestaurantRole.TEAM_LEAD]: 2,
  [RestaurantRole.BOH_MANAGER]: 3,
  [RestaurantRole.FOH_MANAGER]: 3,
  [RestaurantRole.GM]: 4,
  [RestaurantRole.OWNER]: 5,
  [RestaurantRole.PLATFORM_ADMIN]: 10,
};

// Check if user can manage another user based on hierarchy
export function canManageUser(managerRole: string, targetRole: string): boolean {
  const managerLevel = ROLE_HIERARCHY[managerRole as RestaurantRole] || 0;
  const targetLevel = ROLE_HIERARCHY[targetRole as RestaurantRole] || 0;
  return managerLevel > targetLevel;
}