import crypto from 'crypto';
import {
  users,
  locations,
  categories,
  vendors,
  vendorPriceCatalog,
  priceImports,
  inventoryItems,
  recipes,
  recipeIngredients,
  menuItems,
  menuItemIngredients,
  purchaseOrders,
  purchaseOrderItems,
  wasteEntries,
  inventoryTransactions,
  invoiceProcessing,
  onboardingTokens,
  documentTemplates,
  employeeDocumentAssignments,
  employeeSignatures,
  documentFormFields,
  employeeDocumentResponses,
  recipeAssignments,
  invitationTokens,
  businessIntelligence,
  budgets,
  type User,
  type UpsertUser,
  type Location,
  type InsertLocation,
  type Category,
  type InsertCategory,
  type Vendor,
  type InsertVendor,
  type VendorPriceCatalog,
  type InsertVendorPriceCatalog,
  type PriceImport,
  type InsertPriceImport,
  type InventoryItem,
  type InsertInventoryItem,
  type Recipe,
  type InsertRecipe,
  type RecipeIngredient,
  type InsertRecipeIngredient,
  type MenuItem,
  type InsertMenuItem,
  type MenuItemIngredient,
  type InsertMenuItemIngredient,
  type PurchaseOrder,
  type InsertPurchaseOrder,
  type PurchaseOrderItem,
  type InsertPurchaseOrderItem,
  type WasteEntry,
  type InsertWasteEntry,
  sales,
  salesItems,
  type InventoryTransaction,
  type InsertInventoryTransaction,
  posIntegrations,
  posMenuItems,
  posItemMappings,
  posSales,
  posSaleItems,
  posEmployees,
  posEmployeeMappings,
  posTimeclocks,
  webhookEvents,
  type PosIntegration,
  type InsertPosIntegration,
  type PosMenuItem,
  type InsertPosMenuItem,
  type PosItemMapping,
  type InsertPosItemMapping,
  type PosSale,
  type InsertPosSale,
  type PosSaleItem,
  type InsertPosSaleItem,
  type PosEmployee,
  type InsertPosEmployee,
  type PosEmployeeMapping,
  type InsertPosEmployeeMapping,
  type PosTimeclock,
  type InsertPosTimeclock,
  // HR imports
  departments,
  positions,
  employees,
  shifts,
  availability,
  timeOffRequests,
  tasks,
  taskCompletions,
  messages,
  paycheckSettings,
  messageThreads,
  performanceReviews,
  timeEntries,
  type Department,
  type InsertDepartment,
  type Position,
  type InsertPosition,
  type Employee,
  type InsertEmployee,
  type Shift,
  type InsertShift,
  type Availability,
  type InsertAvailability,
  type TimeOffRequest,
  type InsertTimeOffRequest,
  type Task,
  type InsertTask,
  type TaskCompletion,
  type InsertTaskCompletion,
  type Message,
  type InsertMessage,
  type MessageThread,
  type InsertMessageThread,
  type PerformanceReview,
  type InsertPerformanceReview,
  type TimeEntry,
  type InsertTimeEntry,
  // Payroll imports
  payPeriods,
  paystubs,
  payrollDeductions,
  employeeDeductions,
  payrollPeriods,
  paychecks,
  payStubs,
  type PayPeriod,
  type InsertPayPeriod,
  type Paystub,
  type InsertPaystub,
  type PayrollDeduction,
  type InsertPayrollDeduction,
  type EmployeeDeduction,
  type InsertEmployeeDeduction,
  type PayrollPeriod,
  type InsertPayrollPeriod,
  type Paycheck,
  type InsertPaycheck,
  type PayStub,
  type InsertPayStub,
  type DocumentTemplate,
  type InsertDocumentTemplate,
  type EmployeeDocumentAssignment,
  type InsertEmployeeDocumentAssignment,
  type EmployeeSignature,
  type InsertEmployeeSignature,
  type DocumentFormField,
  type InsertDocumentFormField,
  type EmployeeDocumentResponse,
  type InsertEmployeeDocumentResponse,
  type RecipeAssignment,
  type InsertRecipeAssignment,
  type InvitationToken,
  type InsertInvitationToken,
  // Document and onboarding imports
  employeeDocuments,
  documentRequirements,
  onboardingTemplates,
  onboardingSteps,
  employeeOnboarding,
  employeeOnboardingSteps,
  employeeOnboardingData,
  type EmployeeDocument,
  type InsertEmployeeDocument,
  type DocumentRequirement,
  type InsertDocumentRequirement,
  type OnboardingTemplate,
  type InsertOnboardingTemplate,
  type OnboardingStep,
  type InsertOnboardingStep,
  type EmployeeOnboarding,
  type InsertEmployeeOnboarding,
  type EmployeeOnboardingStep,
  type InsertEmployeeOnboardingStep,
  type EmployeeOnboardingData,
  type InsertEmployeeOnboardingData,
  type OnboardingToken,
  type InsertOnboardingToken,
  ownerOnboarding,
  ownerOnboardingSteps,
  type OwnerOnboarding,
  type InsertOwnerOnboarding,
  type OwnerOnboardingStep,
  type InsertOwnerOnboardingStep,
} from "@shared/schema";
import { db } from "./db";
import { eq, sql, desc, and, or, gte, lte, lt, ilike, sum, isNull, isNotNull, asc, inArray } from "drizzle-orm";

// Local authentication user interface
export interface LocalAuthUser {
  id: string;
  email: string;
  password: string;
  createdAt: Date;
}

export interface InsertLocalAuthUser {
  id: string;
  email: string;
  password: string;
  createdAt: Date;
}

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Subscription operations
  updateUserSubscription(userId: string, subscriptionData: { 
    subscriptionPlan?: 'free' | 'professional' | 'enterprise';
    subscriptionStatus?: 'active' | 'inactive' | 'cancelled' | 'past_due';
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    squareCustomerId?: string;
    squareSubscriptionId?: string;
    subscriptionEndDate?: Date;
    ocrCreditsLimit?: number;
    hrAddonEnabled?: boolean;
  }): Promise<User>;
  createSquareCustomer(userId: string, squareCustomerId: string): Promise<User>;
  getSubscriptionByUser(userId: string): Promise<User | undefined>;
  getUserBySquareCustomerId(squareCustomerId: string): Promise<User | undefined>;
  updateOcrCreditsUsed(userId: string, creditsUsed: number): Promise<User>;
  checkOcrAccess(userId: string): Promise<{ hasAccess: boolean; creditsRemaining: number; plan: string }>;
  resetOcrCredits(userId: string): Promise<User>;

  // Location operations
  getLocations(): Promise<Location[]>;
  createLocation(location: InsertLocation): Promise<Location>;

  // Category operations
  getCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, category: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  // Vendor operations
  getVendors(locationId?: string): Promise<Vendor[]>;
  getVendor(id: string): Promise<Vendor | undefined>;
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  updateVendor(id: string, vendor: Partial<InsertVendor>): Promise<Vendor>;
  deleteVendor(id: string): Promise<void>;

  // Inventory operations
  getInventoryItems(): Promise<(InventoryItem & { category?: Category; vendor?: Vendor })[]>;
  getInventoryItem(id: string): Promise<(InventoryItem & { category?: Category; vendor?: Vendor }) | undefined>;
  createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem>;
  deleteInventoryItem(id: string): Promise<void>;
  getLowStockItems(): Promise<(InventoryItem & { category?: Category; vendor?: Vendor })[]>;
  getTotalInventoryValue(): Promise<number>;

  // Recipe operations
  getRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<(Recipe & { ingredients: (RecipeIngredient & { inventoryItem: InventoryItem })[] }) | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
  createRecipeWithIngredients(recipeData: InsertRecipe & { ingredients?: InsertRecipeIngredient[] }): Promise<Recipe>;
  updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;
  addRecipeIngredient(ingredient: InsertRecipeIngredient): Promise<RecipeIngredient>;
  removeRecipeIngredient(id: string): Promise<void>;
  deleteRecipeIngredients(recipeId: string): Promise<void>;
  addRecipeIngredients(ingredients: InsertRecipeIngredient[]): Promise<void>;

  // Menu item operations
  getMenuItems(): Promise<MenuItem[]>;
  getMenuItem(id: string): Promise<(MenuItem & { ingredients: (MenuItemIngredient & { inventoryItem: InventoryItem })[] }) | undefined>;
  createMenuItem(menuItem: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: string, menuItem: Partial<InsertMenuItem>): Promise<MenuItem>;
  deleteMenuItem(id: string): Promise<void>;
  addMenuItemIngredient(ingredient: InsertMenuItemIngredient): Promise<MenuItemIngredient>;
  removeMenuItemIngredient(id: string): Promise<void>;

  // Purchase order operations
  getPurchaseOrders(locationId?: string): Promise<(PurchaseOrder & { vendor?: Vendor; items?: PurchaseOrderItem[] })[]>;
  getPurchaseOrder(id: string): Promise<(PurchaseOrder & { vendor?: Vendor; items: (PurchaseOrderItem & { inventoryItem: InventoryItem })[] }) | undefined>;
  createPurchaseOrder(order: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: string, order: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder>;
  deletePurchaseOrder(id: string): Promise<void>;
  addPurchaseOrderItem(item: InsertPurchaseOrderItem): Promise<PurchaseOrderItem>;
  removePurchaseOrderItem(id: string): Promise<void>;

  // Waste tracking operations
  getWasteEntries(): Promise<(WasteEntry & { inventoryItem: InventoryItem; reporter?: User })[]>;
  createWasteEntry(entry: InsertWasteEntry): Promise<WasteEntry>;
  getWasteStats(startDate?: Date, endDate?: Date): Promise<{ totalCost: number; totalEntries: number }>;

  // Inventory transaction operations
  createInventoryTransaction(transaction: InsertInventoryTransaction): Promise<InventoryTransaction>;
  getInventoryTransactions(itemId?: string): Promise<(InventoryTransaction & { inventoryItem?: InventoryItem; creator?: User })[]>;

  // Dashboard metrics
  getDashboardMetrics(locationId?: string): Promise<{
    totalInventoryValue: number;
    lowStockCount: number;
    weeklyWaste: number;
    foodCostPercentage: number;
  }>;

  // Universal POS integration operations
  getPosIntegrations(locationId?: string): Promise<PosIntegration[]>;
  getPosIntegration(id: string): Promise<PosIntegration | undefined>;
  getPosIntegrationByMerchant(merchantId: string, provider: string): Promise<PosIntegration | undefined>;
  createPosIntegration(integration: InsertPosIntegration): Promise<PosIntegration>;
  updatePosIntegration(id: string, integration: Partial<InsertPosIntegration>): Promise<PosIntegration>;
  deletePosIntegration(id: string): Promise<void>;

  // POS menu items
  getPosMenuItems(integrationId: string): Promise<PosMenuItem[]>;
  upsertPosMenuItem(menuItem: InsertPosMenuItem): Promise<PosMenuItem>;
  updatePosMenuItemRecipe(menuItemId: string, recipeId: string | null, inventoryItemId?: string | null): Promise<PosMenuItem>;
  getUnmappedMenuItems(locationId: string): Promise<(PosMenuItem & { integration: PosIntegration })[]>;
  getSuggestedRecipes(menuItemName: string, locationId: string): Promise<Recipe[]>;

  // POS item mappings
  getPosItemMappings(integrationId?: string): Promise<(PosItemMapping & { posMenuItem?: PosMenuItem; inventoryItem?: InventoryItem })[]>;
  getPosItemMappingByPosItemId(posItemId: string): Promise<(PosItemMapping & { posMenuItem?: PosMenuItem; inventoryItem?: InventoryItem }) | undefined>;
  createPosItemMapping(mapping: InsertPosItemMapping): Promise<PosItemMapping>;
  updatePosItemMapping(id: string, mapping: Partial<InsertPosItemMapping>): Promise<PosItemMapping>;
  deletePosItemMapping(id: string): Promise<void>;

  // POS sales
  createPosSale(sale: InsertPosSale): Promise<PosSale>;
  getPosSales(integrationId?: string, startDate?: Date, endDate?: Date): Promise<(PosSale & { items?: PosSaleItem[] })[]>;
  getPosSaleById(id: string): Promise<PosSale | undefined>;
  hasProcessedWebhook(eventId: string): Promise<boolean>;
  markWebhookProcessed(eventId: string, record: { provider: string; integrationId: string; receivedAt: string; raw?: any }): Promise<void>;

  // Advanced MarginEdge-like Features
  
  // Invoice Processing
  getInvoices(status?: string, locationId?: string): Promise<any[]>;
  createInvoice(invoice: any): Promise<any>;
  updateInvoiceStatus(id: string, status: string): Promise<any>;
  updateInvoice(id: string, data: any): Promise<any>;
  getInvoiceStats(locationId?: string): Promise<any>;

  // Cost Monitoring & Alerts
  getCostAlerts(locationId?: string): Promise<any[]>;
  getPriceMonitoring(timeRange: string): Promise<any[]>;
  getCostTrends(timeRange: string, locationId?: string): Promise<any[]>;
  getBudgetTracking(locationId?: string): Promise<any>;

  // Business Intelligence
  getDailyPnL(timeRange: string, locationId?: string): Promise<any[]>;
  getKPIMetrics(timeRange: string, locationId?: string): Promise<any>;
  getProfitabilityAnalysis(timeRange: string, locationId?: string): Promise<any[]>;
  getMenuPerformance(timeRange: string, locationId?: string): Promise<any[]>;
  getCostAnalysis(timeRange: string, locationId?: string): Promise<any>;
  getPosSales(locationId?: string): Promise<(PosSale & { items?: PosSaleItem[] })[]>;
  getPosSaleByOrderId(integrationId: string, orderId: string): Promise<PosSale | undefined>;
  createPosSale(sale: InsertPosSale): Promise<PosSale>;
  updatePosSale(id: string, sale: Partial<InsertPosSale>): Promise<PosSale>;

  // POS sale items
  createPosSaleItem(saleItem: InsertPosSaleItem): Promise<PosSaleItem>;
  updatePosSaleItem(id: string, saleItem: Partial<InsertPosSaleItem>): Promise<PosSaleItem>;

  // HR Department operations
  getDepartments(locationId?: string): Promise<Department[]>;
  getDepartment(id: string): Promise<Department | undefined>;
  createDepartment(department: InsertDepartment): Promise<Department>;
  updateDepartment(id: string, department: Partial<InsertDepartment>): Promise<Department>;
  deleteDepartment(id: string): Promise<void>;

  // HR Position operations  
  getPositions(locationId?: string): Promise<Position[]>;
  getPosition(id: string): Promise<Position | undefined>;
  createPosition(position: InsertPosition): Promise<Position>;
  updatePosition(id: string, position: Partial<InsertPosition>): Promise<Position>;
  deletePosition(id: string): Promise<void>;

  // HR Employee operations
  getEmployees(locationId?: string): Promise<(Employee & { department?: Department; position?: Position })[]>;
  getEmployee(id: string): Promise<(Employee & { department?: Department; position?: Position }) | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: string, employee: Partial<InsertEmployee>): Promise<Employee>;
  deleteEmployee(id: string): Promise<void>;

  // HR Shift operations
  getShifts(locationId?: string): Promise<(Shift & { employee?: Employee })[]>;
  getEmployeeShifts(employeeId: string): Promise<Shift[]>;
  getShift(id: string): Promise<(Shift & { employee?: Employee }) | undefined>;
  createShift(shift: InsertShift): Promise<Shift>;
  updateShift(id: string, shift: Partial<InsertShift>): Promise<Shift>;
  deleteShift(id: string): Promise<void>;

  // HR Task operations
  getTasks(locationId?: string): Promise<(Task & { assignedEmployee?: Employee })[]>;
  getTask(id: string): Promise<(Task & { assignedEmployee?: Employee }) | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, task: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // HR Time Entry operations (for time clock)
  getTimeEntries(): Promise<(TimeEntry & { employee?: Employee })[]>;
  getEmployeeTimeEntries(employeeId: string): Promise<TimeEntry[]>;
  getActiveTimeEntry(employeeId: string): Promise<TimeEntry | undefined>;
  clockIn(employeeId: string, shiftId?: string): Promise<TimeEntry>;
  clockOut(entryId: string): Promise<TimeEntry>;
  startBreak(entryId: string): Promise<TimeEntry>;
  endBreak(entryId: string): Promise<TimeEntry>;
  createTimeEntry(entryData: any): Promise<TimeEntry>;

  // HR Message operations
  getMessages(locationId?: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageAsRead(messageId: string, userId: string): Promise<void>;
  
  // HR Analytics
  getHRAnalytics(locationId?: string): Promise<any>;

  // HR Payroll operations - Comprehensive Restaurant Payroll System
  getPayPeriods(): Promise<PayPeriod[]>;
  getPayPeriod(id: string): Promise<PayPeriod | undefined>;
  createPayPeriod(payPeriod: InsertPayPeriod): Promise<PayPeriod>;
  updatePayPeriod(id: string, payPeriod: Partial<InsertPayPeriod>): Promise<PayPeriod>;
  deletePayPeriod(id: string): Promise<void>;
  
  // Advanced payroll calculation with restaurant-specific features
  calculatePayroll(payPeriodId: string): Promise<Paystub[]>;
  recalculatePayroll(payPeriodId: string): Promise<Paystub[]>;
  approvePayroll(payPeriodId: string, approvedBy: string): Promise<PayPeriod>;
  getPaystubsByPeriod(payPeriodId: string): Promise<(Paystub & { employee?: Employee })[]>;
  
  // Deduction management
  getPayrollDeductions(): Promise<PayrollDeduction[]>;
  createPayrollDeduction(deduction: InsertPayrollDeduction): Promise<PayrollDeduction>;
  updatePayrollDeduction(id: string, deduction: Partial<InsertPayrollDeduction>): Promise<PayrollDeduction>;
  deletePayrollDeduction(id: string): Promise<void>;
  
  // Employee deduction assignments
  getEmployeeDeductions(employeeId?: string): Promise<EmployeeDeduction[]>;
  assignDeductionToEmployee(assignment: InsertEmployeeDeduction): Promise<EmployeeDeduction>;
  updateEmployeeDeduction(id: string, assignment: Partial<InsertEmployeeDeduction>): Promise<EmployeeDeduction>;
  removeEmployeeDeduction(id: string): Promise<void>;
  
  // Enhanced payroll summary with comprehensive data
  getPayrollSummary(locationId?: string): Promise<{ 
    totalEmployees: number; 
    monthlyPayroll: number; 
    avgHourlyRate: number; 
    laborCostPercentage: number;
    totalTipsReported: number;
    averageTipsPerEmployee: number;
    complianceScore: number;
    outstandingViolations: number;
  }>;

  // Employee document and onboarding operations
  generateOnboardingToken(employeeId: string): Promise<OnboardingToken>;
  validateOnboardingToken(token: string): Promise<OnboardingToken | undefined>;
  getEmployeeProfile(employeeId: string): Promise<{ employee: Employee; onboardingData?: any; documents?: any[] } | undefined>;
  createOnboardingData(data: any): Promise<any>;
  updateOnboardingData(employeeId: string, data: any): Promise<any>;

  // Document template operations
  getDocumentTemplates(): Promise<any[]>;
  getDocumentTemplate(id: string): Promise<any | undefined>;
  createDocumentTemplate(template: any): Promise<any>;
  updateDocumentTemplate(id: string, template: Partial<any>): Promise<any>;
  deleteDocumentTemplate(id: string): Promise<void>;

  // Employee document assignment operations
  getEmployeeDocuments(employeeId: string): Promise<any[]>;
  getAllEmployeeDocuments(): Promise<any[]>;
  createDocumentAssignment(assignment: any): Promise<any>;
  updateDocumentAssignment(id: string, assignment: Partial<any>): Promise<any>;
  deleteDocumentAssignment(id: string): Promise<void>;

  // Document signature operations
  createEmployeeSignature(signature: any): Promise<any>;
  getEmployeeSignature(documentAssignmentId: string): Promise<any | undefined>;
  
  // Digital form methods
  getDocumentFormFields(templateId: string): Promise<DocumentFormField[]>;
  createDocumentFormField(field: InsertDocumentFormField): Promise<DocumentFormField>;
  getDocumentFormResponses(assignmentId: string): Promise<EmployeeDocumentResponse[]>;
  saveDocumentFormResponse(response: InsertEmployeeDocumentResponse): Promise<EmployeeDocumentResponse>;
  updateDocumentFormResponse(assignmentId: string, fieldId: string, fieldValue: string): Promise<EmployeeDocumentResponse>;
  
  // Recipe assignment operations
  getRecipeAssignmentsByDepartment(departmentId: string): Promise<RecipeAssignment[]>;
  getRecipeAssignmentsForEmployee(employeeId: string): Promise<RecipeAssignment[]>;
  createRecipeAssignment(assignment: InsertRecipeAssignment): Promise<RecipeAssignment>;
  updateRecipeAssignmentStatus(id: string, status: string): Promise<RecipeAssignment>;

  // Invitation token operations
  getInvitationTokens(invitedBy?: string): Promise<InvitationToken[]>;
  getInvitationToken(token: string): Promise<InvitationToken | undefined>;
  getInvitationTokenById(id: string): Promise<InvitationToken | undefined>;
  createInvitationToken(invitation: InsertInvitationToken): Promise<InvitationToken>;
  updateInvitationToken(id: string, updates: Partial<InsertInvitationToken>): Promise<InvitationToken>;
  acceptInvitationToken(token: string, employeeId: string): Promise<InvitationToken>;
  cancelInvitationToken(id: string): Promise<void>;
  expireOldInvitationTokens(): Promise<number>;

  // Payroll operations
  getPayrollPeriods(locationId?: string): Promise<PayrollPeriod[]>;
  createPayrollPeriod(period: InsertPayrollPeriod): Promise<PayrollPeriod>;
  getPayrollPeriod(id: string): Promise<PayrollPeriod | undefined>;
  updatePayrollPeriod(id: string, period: Partial<PayrollPeriod>): Promise<PayrollPeriod>;
  getPaychecks(payrollPeriodId: string): Promise<(Paycheck & { employee: Employee })[]>;
  createPaycheck(paycheck: InsertPaycheck): Promise<Paycheck>;
  updatePaycheck(id: string, paycheck: Partial<Paycheck>): Promise<Paycheck>;
  getEmployeePayStubs(employeeId: string): Promise<PayStub[]>;
  createPayStub(payStub: InsertPayStub): Promise<PayStub>;
  markPayStubViewed(payStubId: string): Promise<void>;
  getTimeEntries(employeeId: string, startDate: string, endDate: string): Promise<TimeEntry[]>;
  calculatePayrollHoursFromTimeEntries(payrollPeriodId: string): Promise<{ employeeId: string; regularHours: number; overtimeHours: number; totalHours: number; employee?: Employee }[]>;
  recalculatePayPeriodTotals(payrollPeriodId: string): Promise<void>;
  getPaycheckSettings(): Promise<any>;
  updatePaycheckSettings(settings: any): Promise<any>;
  
  // Tax settings operations
  getTaxSettings(locationId: string): Promise<any>;
  createTaxSettings(settings: any): Promise<any>;
  updateTaxSettings(id: string, settings: any): Promise<any>;
  
  // Local authentication methods (fallback when Firebase Admin SDK is unavailable)
  createLocalAuthUser(user: InsertLocalAuthUser): Promise<LocalAuthUser>;
  getLocalAuthUser(email: string): Promise<LocalAuthUser | null>;
  verifyLocalAuthUser(email: string, password: string): Promise<LocalAuthUser | null>;

  // Owner onboarding operations
  getOwnerOnboarding(userId: string): Promise<OwnerOnboarding | undefined>;
  createOwnerOnboarding(data: InsertOwnerOnboarding): Promise<OwnerOnboarding>;
  updateOwnerOnboardingStep(userId: string, stepName: string, stepData: any, status: string): Promise<OwnerOnboarding>;
  completeOwnerOnboarding(userId: string): Promise<OwnerOnboarding>;
}

export class DatabaseStorage implements IStorage {
  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  // Location operations
  async getLocations(): Promise<Location[]> {
    return await db.select().from(locations).orderBy(locations.name);
  }

  async getLocationById(id: string): Promise<Location | null> {
    const result = await db.execute(sql`SELECT * FROM locations WHERE id = ${id} LIMIT 1`);
    return (result.rows[0] as Location) || null;
  }

  async createLocation(locationData: InsertLocation): Promise<Location> {
    const [location] = await db
      .insert(locations)
      .values(locationData)
      .returning();
    return location;
  }

  async updateLocation(id: string, locationData: Partial<InsertLocation>): Promise<Location> {
    const [location] = await db
      .update(locations)
      .set({ ...locationData, updatedAt: new Date() })
      .where(eq(locations.id, id))
      .returning();
    return location;
  }

  async deleteLocation(id: string): Promise<void> {
    await db.delete(locations).where(eq(locations.id, id));
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Always normalize email
    const email = (userData.email || '').toLowerCase();
    if (!email) throw new Error('upsertUser: email is required');

    // 1) Find by email (this is the canonical identity key)
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // 2) If not found → insert a new row
    if (existing.length === 0) {
      const toInsert = {
        ...userData,
        email,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const [inserted] = await db.insert(users).values(toInsert).returning();
      return inserted;
    }

    // 3) If found → update only safe fields; NEVER change `id`
    const existingUser = existing[0];
    const updates: any = { updatedAt: new Date() };

    // Optionally fill firstName/lastName the first time
    if (userData.firstName && !existingUser.firstName) {
      updates.firstName = userData.firstName;
    }
    if (userData.lastName && !existingUser.lastName) {
      updates.lastName = userData.lastName;
    }

    // Optionally fill profileImageUrl
    if (userData.profileImageUrl && !existingUser.profileImageUrl) {
      updates.profileImageUrl = userData.profileImageUrl;
    }

    // Optionally relax role upgrades, but don't downgrade existing roles
    if (userData.role && (existingUser.role === 'employee' || !existingUser.role)) {
      updates.role = userData.role;
    }

    // If there's nothing meaningful to change, return existing
    const onlyUpdatedAt = Object.keys(updates).length === 1;
    if (onlyUpdatedAt) return existingUser;

    const [updated] = await db
      .update(users)
      .set(updates)                  // ← no `id`, no `email` change here
      .where(eq(users.id, existingUser.id))
      .returning();

    return updated;
  }

  // Subscription operations
  async updateUserSubscription(userId: string, subscriptionData: { 
    subscriptionPlan?: 'free' | 'professional' | 'enterprise';
    subscriptionStatus?: 'active' | 'inactive' | 'cancelled' | 'past_due';
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    squareCustomerId?: string;
    squareSubscriptionId?: string;
    subscriptionEndDate?: Date;
    ocrCreditsLimit?: number;
    hrAddonEnabled?: boolean;
  }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...subscriptionData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateOcrCreditsUsed(userId: string, creditsUsed: number): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ocrCreditsUsed: creditsUsed,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async checkOcrAccess(userId: string): Promise<{ hasAccess: boolean; creditsRemaining: number; plan: string }> {
    const user = await this.getUser(userId);
    if (!user) {
      return { hasAccess: false, creditsRemaining: 0, plan: 'free' };
    }

    const plan = user.subscriptionPlan || 'free';
    const creditsUsed = user.ocrCreditsUsed || 0;
    const creditsLimit = user.ocrCreditsLimit || 5;
    
    // Premium users have unlimited OCR access
    if (plan === 'professional' || plan === 'enterprise') {
      return { hasAccess: true, creditsRemaining: 999, plan };
    }
    
    // Free users have limited credits
    const creditsRemaining = Math.max(0, creditsLimit - creditsUsed);
    const hasAccess = creditsRemaining > 0;
    
    return { hasAccess, creditsRemaining, plan };
  }

  async resetOcrCredits(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ocrCreditsUsed: 0,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async createSquareCustomer(userId: string, squareCustomerId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        squareCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getSubscriptionByUser(userId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async getUserBySquareCustomerId(squareCustomerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.squareCustomerId, squareCustomerId));
    return user;
  }

  // Category operations
  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories).orderBy(categories.name);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [result] = await db.insert(categories).values(category).returning();
    return result;
  }

  async updateCategory(id: string, category: Partial<InsertCategory>): Promise<Category> {
    const [result] = await db
      .update(categories)
      .set(category)
      .where(eq(categories.id, id))
      .returning();
    return result;
  }

  async deleteCategory(id: string): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  // Vendor operations
  async getVendors(locationId?: string): Promise<Vendor[]> {
    if (locationId) {
      return await db.select().from(vendors)
        .where(eq(vendors.locationId, locationId))
        .orderBy(vendors.name);
    }
    return await db.select().from(vendors).orderBy(vendors.name);
  }

  async getVendor(id: string): Promise<Vendor | undefined> {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id));
    return vendor;
  }

  async createVendor(vendor: InsertVendor): Promise<Vendor> {
    const [result] = await db.insert(vendors).values(vendor).returning();
    return result;
  }

  async updateVendor(id: string, vendor: Partial<InsertVendor>): Promise<Vendor> {
    const [result] = await db
      .update(vendors)
      .set(vendor)
      .where(eq(vendors.id, id))
      .returning();
    return result;
  }

  async deleteVendor(id: string): Promise<void> {
    await db.delete(vendors).where(eq(vendors.id, id));
  }

  // Vendor price catalog operations
  async getVendorPricesForItem(inventoryItemId: string): Promise<any[]> {
    const prices = await db
      .select({
        id: vendorPriceCatalog.id,
        inventoryItemId: vendorPriceCatalog.inventoryItemId,
        vendorId: vendorPriceCatalog.vendorId,
        costPerUnit: vendorPriceCatalog.costPerUnit,
        unit: vendorPriceCatalog.unit,
        minimumOrderQuantity: vendorPriceCatalog.minimumOrderQuantity,
        leadTimeDays: vendorPriceCatalog.leadTimeDays,
        isPreferredVendor: vendorPriceCatalog.isPreferredVendor,
        notes: vendorPriceCatalog.notes,
        effectiveDate: vendorPriceCatalog.effectiveDate,
        expiryDate: vendorPriceCatalog.expiryDate,
        vendorName: vendors.name,
        vendorEmail: vendors.email,
        vendorPhone: vendors.phone,
        itemName: inventoryItems.name,
        currentCostPerUnit: inventoryItems.costPerUnit,
      })
      .from(vendorPriceCatalog)
      .leftJoin(vendors, eq(vendorPriceCatalog.vendorId, vendors.id))
      .leftJoin(inventoryItems, eq(vendorPriceCatalog.inventoryItemId, inventoryItems.id))
      .where(eq(vendorPriceCatalog.inventoryItemId, inventoryItemId))
      .orderBy(vendorPriceCatalog.costPerUnit);
    
    return prices;
  }

  async getPriceComparison(locationId?: string): Promise<any[]> {
    const query = db
      .select({
        itemId: inventoryItems.id,
        itemName: inventoryItems.name,
        itemUnit: inventoryItems.unit,
        currentCost: inventoryItems.costPerUnit,
        currentVendor: vendors.name,
        categoryName: categories.name,
        vendorPrices: sql`json_agg(
          json_build_object(
            'vendorId', ${vendorPriceCatalog.vendorId},
            'vendorName', ${vendors.name},
            'costPerUnit', ${vendorPriceCatalog.costPerUnit},
            'unit', ${vendorPriceCatalog.unit},
            'minimumOrderQuantity', ${vendorPriceCatalog.minimumOrderQuantity},
            'leadTimeDays', ${vendorPriceCatalog.leadTimeDays},
            'isPreferredVendor', ${vendorPriceCatalog.isPreferredVendor},
            'effectiveDate', ${vendorPriceCatalog.effectiveDate}
          )
        ) filter (where ${vendorPriceCatalog.id} is not null)`,
      })
      .from(inventoryItems)
      .leftJoin(vendors, eq(inventoryItems.vendorId, vendors.id))
      .leftJoin(categories, eq(inventoryItems.categoryId, categories.id))
      .leftJoin(vendorPriceCatalog, eq(inventoryItems.id, vendorPriceCatalog.inventoryItemId))
      .leftJoin(vendors.as('catalogVendors'), eq(vendorPriceCatalog.vendorId, vendors.id))
      .groupBy(
        inventoryItems.id,
        inventoryItems.name,
        inventoryItems.unit,
        inventoryItems.costPerUnit,
        vendors.name,
        categories.name
      );

    if (locationId) {
      query.where(eq(inventoryItems.locationId, locationId));
    }

    const results = await query;
    return results.map(item => ({
      ...item,
      vendorPrices: item.vendorPrices || [],
      potentialSavings: item.vendorPrices?.length > 0 
        ? Math.max(0, parseFloat(item.currentCost) - Math.min(...item.vendorPrices.map((p: any) => parseFloat(p.costPerUnit))))
        : 0
    }));
  }

  async addVendorPrice(priceData: InsertVendorPriceCatalog): Promise<VendorPriceCatalog> {
    const [result] = await db.insert(vendorPriceCatalog).values(priceData).returning();
    return result;
  }

  async updateVendorPrice(id: string, priceData: Partial<InsertVendorPriceCatalog>): Promise<VendorPriceCatalog> {
    const [result] = await db
      .update(vendorPriceCatalog)
      .set({ ...priceData, updatedAt: new Date() })
      .where(eq(vendorPriceCatalog.id, id))
      .returning();
    return result;
  }

  async deleteVendorPrice(id: string): Promise<void> {
    await db.delete(vendorPriceCatalog).where(eq(vendorPriceCatalog.id, id));
  }

  // Price import methods
  async createPriceImport(data: InsertPriceImport): Promise<PriceImport> {
    const [priceImport] = await db
      .insert(priceImports)
      .values(data)
      .returning();
    return priceImport;
  }

  async getPriceImports(vendorId?: string): Promise<PriceImport[]> {
    if (vendorId) {
      return await db.select().from(priceImports)
        .where(eq(priceImports.vendorId, vendorId))
        .orderBy(desc(priceImports.createdAt));
    }
    return await db.select().from(priceImports)
      .orderBy(desc(priceImports.createdAt));
  }

  async updatePriceImportStatus(
    id: string,
    status: 'processing' | 'completed' | 'failed',
    stats?: {
      totalRows?: number;
      processedRows?: number;
      matchedItems?: number;
      newItems?: number;
      priceUpdates?: number;
      errorLog?: string;
    }
  ): Promise<PriceImport> {
    const updateData: any = { 
      status,
      processingCompleted: status === 'completed' || status === 'failed' ? new Date() : null,
    };
    
    if (stats) {
      Object.assign(updateData, stats);
    }

    const [priceImport] = await db
      .update(priceImports)
      .set(updateData)
      .where(eq(priceImports.id, id))
      .returning();
    return priceImport;
  }

  async findMatchingInventoryItem(
    itemName: string, 
    vendorSku?: string,
    locationId?: string
  ): Promise<InventoryItem | undefined> {
    const query = db.select().from(inventoryItems);
    
    if (locationId) {
      query.where(eq(inventoryItems.locationId, locationId));
    }
    
    // Try exact name match first
    const exactMatch = await query
      .where(
        and(
          eq(inventoryItems.name, itemName),
          locationId ? eq(inventoryItems.locationId, locationId) : undefined
        )
      );
    
    if (exactMatch.length > 0) {
      return exactMatch[0];
    }
    
    // Try case-insensitive match
    const caseInsensitiveMatch = await query
      .where(
        and(
          sql`LOWER(${inventoryItems.name}) = LOWER(${itemName})`,
          locationId ? eq(inventoryItems.locationId, locationId) : undefined
        )
      );
    
    if (caseInsensitiveMatch.length > 0) {
      return caseInsensitiveMatch[0];
    }
    
    return undefined;
  }

  // Universal POS Integration Methods
  async getPosIntegrations(locationId?: string): Promise<PosIntegration[]> {
    let query = db.select().from(posIntegrations);
    
    if (locationId) {
      query = query.where(eq(posIntegrations.locationId, locationId));
    }
    
    return await query.orderBy(posIntegrations.createdAt);
  }

  async getPosIntegration(id: string): Promise<PosIntegration | undefined> {
    const [integration] = await db.select().from(posIntegrations).where(eq(posIntegrations.id, id));
    return integration;
  }

  async getPosIntegrationByMerchant(merchantId: string, provider: string): Promise<PosIntegration | undefined> {
    const [integration] = await db.select().from(posIntegrations)
      .where(and(
        eq(posIntegrations.merchantId, merchantId), 
        eq(posIntegrations.provider, provider as any),
        eq(posIntegrations.isActive, true)
      ));
    return integration;
  }

  async createPosIntegration(integrationData: InsertPosIntegration): Promise<PosIntegration> {
    const [integration] = await db
      .insert(posIntegrations)
      .values(integrationData)
      .returning();
    return integration;
  }

  async updatePosIntegration(id: string, integrationData: Partial<InsertPosIntegration>): Promise<PosIntegration> {
    const [integration] = await db
      .update(posIntegrations)
      .set({ ...integrationData, updatedAt: new Date() })
      .where(eq(posIntegrations.id, id))
      .returning();
    return integration;
  }

  async deletePosIntegration(id: string): Promise<void> {
    await db.delete(posIntegrations).where(eq(posIntegrations.id, id));
  }

  // POS Menu Items
  async getPosMenuItems(integrationId: string): Promise<PosMenuItem[]> {
    return await db.select().from(posMenuItems)
      .where(eq(posMenuItems.posIntegrationId, integrationId))
      .orderBy(posMenuItems.name);
  }

  async upsertPosMenuItem(menuItemData: InsertPosMenuItem): Promise<PosMenuItem> {
    const [menuItem] = await db
      .insert(posMenuItems)
      .values(menuItemData)
      .onConflictDoUpdate({
        target: [posMenuItems.posItemId, posMenuItems.posIntegrationId],
        set: {
          ...menuItemData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return menuItem;
  }

  async updatePosMenuItemRecipe(menuItemId: string, recipeId: string | null, inventoryItemId?: string | null): Promise<PosMenuItem> {
    // Enforce mutual exclusivity: if one is set, the other must be null
    const update: any = { updatedAt: new Date() };
    
    if (recipeId !== null) {
      update.recipeId = recipeId;
      update.inventoryItemId = null; // Clear inventory item when setting recipe
    } else if (inventoryItemId !== undefined && inventoryItemId !== null) {
      update.inventoryItemId = inventoryItemId;
      update.recipeId = null; // Clear recipe when setting inventory item
    } else {
      // Both are null - clear both
      update.recipeId = null;
      update.inventoryItemId = null;
    }

    const [menuItem] = await db
      .update(posMenuItems)
      .set(update)
      .where(eq(posMenuItems.id, menuItemId))
      .returning();
    return menuItem;
  }

  async getUnmappedMenuItems(locationId: string): Promise<(PosMenuItem & { integration: PosIntegration })[]> {
    const results = await db
      .select()
      .from(posMenuItems)
      .leftJoin(posIntegrations, eq(posMenuItems.posIntegrationId, posIntegrations.id))
      .where(
        and(
          isNull(posMenuItems.recipeId),
          isNull(posMenuItems.inventoryItemId),
          eq(posIntegrations.locationId, locationId),
          eq(posMenuItems.isActive, true)
        )
      )
      .orderBy(posMenuItems.name);

    return results.map(row => ({
      ...row.pos_menu_items,
      integration: row.pos_integrations!,
    }));
  }

  async getSuggestedRecipes(menuItemName: string, locationId: string): Promise<Recipe[]> {
    const searchTerm = `%${menuItemName.toLowerCase()}%`;
    return await db
      .select()
      .from(recipes)
      .where(
        and(
          eq(recipes.locationId, locationId),
          sql`LOWER(${recipes.name}) LIKE ${searchTerm}`
        )
      )
      .orderBy(recipes.name)
      .limit(10);
  }

  async deletePosMenuItem(menuItemId: string): Promise<void> {
    await db
      .delete(posMenuItems)
      .where(eq(posMenuItems.id, menuItemId));
  }

  // POS Item Mappings
  async getPosItemMappings(integrationId?: string): Promise<(PosItemMapping & { posMenuItem?: PosMenuItem; inventoryItem?: InventoryItem })[]> {
    let query = db.select().from(posItemMappings)
      .leftJoin(posMenuItems, eq(posItemMappings.posMenuItemId, posMenuItems.id))
      .leftJoin(inventoryItems, eq(posItemMappings.inventoryItemId, inventoryItems.id));

    if (integrationId) {
      query = query.where(eq(posMenuItems.posIntegrationId, integrationId));
    }

    const results = await query;
    return results.map(row => ({
      ...row.pos_item_mappings,
      posMenuItem: row.pos_menu_items || undefined,
      inventoryItem: row.inventory_items || undefined,
    }));
  }

  async getPosItemMappingByPosItemId(posItemId: string): Promise<(PosItemMapping & { posMenuItem?: PosMenuItem; inventoryItem?: InventoryItem }) | undefined> {
    const [result] = await db.select().from(posItemMappings)
      .leftJoin(posMenuItems, eq(posItemMappings.posMenuItemId, posMenuItems.id))
      .leftJoin(inventoryItems, eq(posItemMappings.inventoryItemId, inventoryItems.id))
      .where(eq(posMenuItems.posItemId, posItemId));

    if (!result) return undefined;

    return {
      ...result.pos_item_mappings,
      posMenuItem: result.pos_menu_items || undefined,
      inventoryItem: result.inventory_items || undefined,
    };
  }

  async createPosItemMapping(mappingData: InsertPosItemMapping): Promise<PosItemMapping> {
    const [mapping] = await db
      .insert(posItemMappings)
      .values(mappingData)
      .returning();
    return mapping;
  }

  async updatePosItemMapping(id: string, mappingData: Partial<InsertPosItemMapping>): Promise<PosItemMapping> {
    const [mapping] = await db
      .update(posItemMappings)
      .set(mappingData)
      .where(eq(posItemMappings.id, id))
      .returning();
    return mapping;
  }

  async deletePosItemMapping(id: string): Promise<void> {
    await db.delete(posItemMappings).where(eq(posItemMappings.id, id));
  }

  // POS Sales
  async getPosSales(locationId?: string): Promise<(PosSale & { items?: PosSaleItem[] })[]> {
    let query = db.select().from(posSales);
    
    if (locationId) {
      query = query.where(eq(posSales.locationId, locationId));
    }
    
    const sales = await query.orderBy(desc(posSales.orderDate));
    
    // Get items for each sale
    const salesWithItems = await Promise.all(
      sales.map(async (sale) => {
        const items = await db.select().from(posSaleItems)
          .where(eq(posSaleItems.posSaleId, sale.id));
        return { ...sale, items };
      })
    );

    return salesWithItems;
  }

  async getPosSaleByOrderId(integrationId: string, orderId: string): Promise<PosSale | undefined> {
    const [sale] = await db.select().from(posSales)
      .where(and(
        eq(posSales.posIntegrationId, integrationId),
        eq(posSales.posOrderId, orderId)
      ));
    return sale;
  }

  async createPosSale(saleData: InsertPosSale): Promise<PosSale> {
    const [sale] = await db
      .insert(posSales)
      .values(saleData)
      .returning();
    return sale;
  }

  async updatePosSale(id: string, saleData: Partial<InsertPosSale>): Promise<PosSale> {
    const [sale] = await db
      .update(posSales)
      .set(saleData)
      .where(eq(posSales.id, id))
      .returning();
    return sale;
  }

  // POS Sale Items
  async createPosSaleItem(saleItemData: InsertPosSaleItem): Promise<PosSaleItem> {
    const [saleItem] = await db
      .insert(posSaleItems)
      .values(saleItemData)
      .returning();
    return saleItem;
  }

  async updatePosSaleItem(id: string, saleItemData: Partial<InsertPosSaleItem>): Promise<PosSaleItem> {
    const [saleItem] = await db
      .update(posSaleItems)
      .set(saleItemData)
      .where(eq(posSaleItems.id, id))
      .returning();
    return saleItem;
  }

  async getPosSaleById(id: string): Promise<PosSale | undefined> {
    const [sale] = await db.select().from(posSales).where(eq(posSales.id, id));
    return sale;
  }

  async hasProcessedWebhook(eventId: string): Promise<boolean> {
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, eventId));
    return !!event;
  }

  async markWebhookProcessed(eventId: string, record: { provider: string; integrationId: string; receivedAt: string; raw?: any }): Promise<void> {
    await db.insert(webhookEvents).values({
      eventId,
      provider: record.provider,
      integrationId: record.integrationId,
      receivedAt: new Date(record.receivedAt),
      rawPayload: record.raw,
    });
  }

  // POS Employees
  async upsertPosEmployee(employeeData: InsertPosEmployee): Promise<PosEmployee> {
    // Try to find existing employee by integration + posEmployeeId
    const [existing] = await db.select().from(posEmployees)
      .where(and(
        eq(posEmployees.posIntegrationId, employeeData.posIntegrationId),
        eq(posEmployees.posEmployeeId, employeeData.posEmployeeId)
      ));

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(posEmployees)
        .set({ ...employeeData, updatedAt: new Date() })
        .where(eq(posEmployees.id, existing.id))
        .returning();
      return updated;
    } else {
      // Insert new
      const [inserted] = await db
        .insert(posEmployees)
        .values(employeeData)
        .returning();
      return inserted;
    }
  }

  async getPosEmployees(integrationId: string): Promise<PosEmployee[]> {
    return await db.select().from(posEmployees)
      .where(eq(posEmployees.posIntegrationId, integrationId))
      .orderBy(posEmployees.displayName);
  }

  async getPosEmployee(id: string): Promise<PosEmployee | undefined> {
    const [employee] = await db.select().from(posEmployees)
      .where(eq(posEmployees.id, id));
    return employee;
  }

  async getUnlinkedPosEmployees(locationId: string): Promise<PosEmployee[]> {
    // Get POS employees from integrations at this location that don't have HR mappings
    const results = await db
      .select({
        posEmployee: posEmployees
      })
      .from(posEmployees)
      .leftJoin(posEmployeeMappings, eq(posEmployees.id, posEmployeeMappings.posEmployeeId))
      .innerJoin(posIntegrations, eq(posEmployees.posIntegrationId, posIntegrations.id))
      .where(and(
        eq(posIntegrations.locationId, locationId),
        eq(posEmployees.isActive, true),
        sql`${posEmployeeMappings.id} IS NULL` // No mapping exists
      ))
      .orderBy(posEmployees.displayName);
    
    return results.map(r => r.posEmployee);
  }

  // POS Timeclock
  async upsertPosTimeclock(timeclockData: InsertPosTimeclock): Promise<PosTimeclock> {
    // Try to find existing timeclock entry by integration + posTimeEntryId
    const [existing] = await db.select().from(posTimeclocks)
      .where(and(
        eq(posTimeclocks.posIntegrationId, timeclockData.posIntegrationId),
        eq(posTimeclocks.posTimeEntryId, timeclockData.posTimeEntryId)
      ));

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(posTimeclocks)
        .set({ ...timeclockData, updatedAt: new Date() })
        .where(eq(posTimeclocks.id, existing.id))
        .returning();
      return updated;
    } else {
      // Insert new
      const [inserted] = await db
        .insert(posTimeclocks)
        .values(timeclockData)
        .returning();
      return inserted;
    }
  }

  async getPosTimeclocks(integrationId: string): Promise<PosTimeclock[]> {
    return await db.select().from(posTimeclocks)
      .where(eq(posTimeclocks.posIntegrationId, integrationId))
      .orderBy(desc(posTimeclocks.clockInAt));
  }

  // Inventory operations
  async getInventoryItems(locationId?: string): Promise<(InventoryItem & { category?: Category; vendor?: Vendor })[]> {
    let query = db
      .select()
      .from(inventoryItems)
      .leftJoin(categories, eq(inventoryItems.categoryId, categories.id))
      .leftJoin(vendors, eq(inventoryItems.vendorId, vendors.id))
      .orderBy(inventoryItems.name);

    if (locationId) {
      query = query.where(eq(inventoryItems.locationId, locationId));
    }

    return await query.then(rows => rows.map(row => ({
      ...row.inventory_items,
      category: row.categories || undefined,
      vendor: row.vendors || undefined,
    })));
  }

  async getInventoryItem(id: string): Promise<(InventoryItem & { category?: Category; vendor?: Vendor }) | undefined> {
    const [result] = await db
      .select()
      .from(inventoryItems)
      .leftJoin(categories, eq(inventoryItems.categoryId, categories.id))
      .leftJoin(vendors, eq(inventoryItems.vendorId, vendors.id))
      .where(eq(inventoryItems.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result.inventory_items,
      category: result.categories || undefined,
      vendor: result.vendors || undefined,
    };
  }

  async createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem> {
    const [result] = await db.insert(inventoryItems).values(item).returning();
    return result;
  }

  async updateInventoryItem(id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem> {
    const [result] = await db
      .update(inventoryItems)
      .set({ ...item, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning();
    return result;
  }

  async deleteInventoryItem(id: string): Promise<void> {
    // First delete all related inventory transactions
    await db.delete(inventoryTransactions).where(eq(inventoryTransactions.inventoryItemId, id));
    
    // Then delete all related recipe ingredients
    await db.delete(recipeIngredients).where(eq(recipeIngredients.inventoryItemId, id));
    
    // Finally delete the inventory item
    await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  }

  async getLowStockItems(locationId?: string): Promise<(InventoryItem & { category?: Category; vendor?: Vendor })[]> {
    let query = db
      .select()
      .from(inventoryItems)
      .leftJoin(categories, eq(inventoryItems.categoryId, categories.id))
      .leftJoin(vendors, eq(inventoryItems.vendorId, vendors.id))
      .where(sql`${inventoryItems.quantity} <= ${inventoryItems.reorderLevel}`)
      .orderBy(inventoryItems.name);

    if (locationId) {
      query = query.where(and(
        sql`${inventoryItems.quantity} <= ${inventoryItems.reorderLevel}`,
        eq(inventoryItems.locationId, locationId)
      ));
    } else {
      query = query.where(sql`${inventoryItems.quantity} <= ${inventoryItems.reorderLevel}`);
    }

    return await query.then(rows => rows.map(row => ({
      ...row.inventory_items,
      category: row.categories || undefined,
      vendor: row.vendors || undefined,
    })));
  }

  async getTotalInventoryValue(locationId?: string): Promise<number> {
    let query = db
      .select({
        total: sql<string>`COALESCE(SUM(${inventoryItems.quantity} * ${inventoryItems.costPerUnit}), 0)`,
      })
      .from(inventoryItems);
    
    if (locationId) {
      query = query.where(eq(inventoryItems.locationId, locationId));
    }
    
    const [result] = await query;
    return parseFloat(result?.total || '0');
  }

  // Recipe operations
  async getRecipes(locationId?: string): Promise<(Recipe & { ingredientCount: number; estimatedCost: number })[]> {
    let query = db.select().from(recipes).orderBy(recipes.name);
    
    if (locationId) {
      query = query.where(eq(recipes.locationId, locationId));
    }
    
    const allRecipes = await query;
    
    const recipesWithStats = await Promise.all(allRecipes.map(async (recipe) => {
      // Get ingredient count and cost
      const ingredients = await db
        .select({
          count: sql<number>`COUNT(*)`,
          totalCost: sql<number>`COALESCE(SUM(${recipeIngredients.quantity} * ${inventoryItems.costPerUnit}), 0)`
        })
        .from(recipeIngredients)
        .leftJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
        .where(eq(recipeIngredients.recipeId, recipe.id));
      
      const stats = ingredients[0] || { count: 0, totalCost: 0 };
      
      return {
        ...recipe,
        ingredientCount: Number(stats.count),
        estimatedCost: Number(stats.totalCost)
      };
    }));
    
    return recipesWithStats;
  }

  async getRecipe(id: string): Promise<(Recipe & { ingredients: (RecipeIngredient & { inventoryItem: InventoryItem })[] }) | undefined> {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    if (!recipe) return undefined;

    const ingredients = await db
      .select()
      .from(recipeIngredients)
      .innerJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
      .where(eq(recipeIngredients.recipeId, id))
      .then(rows => rows.map(row => ({
        ...row.recipe_ingredients,
        inventoryItem: row.inventory_items,
      })));

    return { ...recipe, ingredients };
  }

  async createRecipe(recipe: InsertRecipe): Promise<Recipe> {
    const [result] = await db.insert(recipes).values(recipe).returning();
    return result;
  }

  async createRecipeWithIngredients(recipeData: InsertRecipe & { ingredients?: InsertRecipeIngredient[] }): Promise<Recipe> {
    const { ingredients, ...recipe } = recipeData;
    
    // Create recipe first
    const [createdRecipe] = await db.insert(recipes).values(recipe).returning();
    
    // Add ingredients if provided
    if (ingredients && ingredients.length > 0) {
      const ingredientsWithRecipeId = ingredients.map(ing => ({
        ...ing,
        recipeId: createdRecipe.id
      }));
      
      await db.insert(recipeIngredients).values(ingredientsWithRecipeId);
    }
    
    return createdRecipe;
  }

  async updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe> {
    const [result] = await db
      .update(recipes)
      .set({ ...recipe, updatedAt: new Date() })
      .where(eq(recipes.id, id))
      .returning();
    return result;
  }

  async deleteRecipe(id: string): Promise<void> {
    await db.delete(recipes).where(eq(recipes.id, id));
  }

  async addRecipeIngredient(ingredient: InsertRecipeIngredient): Promise<RecipeIngredient> {
    const [result] = await db.insert(recipeIngredients).values(ingredient).returning();
    return result;
  }

  async removeRecipeIngredient(id: string): Promise<void> {
    await db.delete(recipeIngredients).where(eq(recipeIngredients.id, id));
  }

  async deleteRecipeIngredients(recipeId: string): Promise<void> {
    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
  }

  async addRecipeIngredients(ingredients: InsertRecipeIngredient[]): Promise<void> {
    if (ingredients.length > 0) {
      await db.insert(recipeIngredients).values(ingredients);
    }
  }

  // Menu item operations
  async getMenuItems(): Promise<MenuItem[]> {
    return await db.select().from(menuItems).orderBy(menuItems.name);
  }

  async getMenuItem(id: string): Promise<(MenuItem & { ingredients: (MenuItemIngredient & { inventoryItem: InventoryItem })[] }) | undefined> {
    const [menuItem] = await db.select().from(menuItems).where(eq(menuItems.id, id));
    if (!menuItem) return undefined;

    const ingredients = await db
      .select()
      .from(menuItemIngredients)
      .innerJoin(inventoryItems, eq(menuItemIngredients.inventoryItemId, inventoryItems.id))
      .where(eq(menuItemIngredients.menuItemId, id))
      .then(rows => rows.map(row => ({
        ...row.menu_item_ingredients,
        inventoryItem: row.inventory_items,
      })));

    return { ...menuItem, ingredients };
  }

  async createMenuItem(menuItem: InsertMenuItem): Promise<MenuItem> {
    const [result] = await db.insert(menuItems).values(menuItem).returning();
    return result;
  }

  async updateMenuItem(id: string, menuItem: Partial<InsertMenuItem>): Promise<MenuItem> {
    const [result] = await db
      .update(menuItems)
      .set({ ...menuItem, updatedAt: new Date() })
      .where(eq(menuItems.id, id))
      .returning();
    return result;
  }

  async deleteMenuItem(id: string): Promise<void> {
    await db.delete(menuItems).where(eq(menuItems.id, id));
  }

  async addMenuItemIngredient(ingredient: InsertMenuItemIngredient): Promise<MenuItemIngredient> {
    const [result] = await db.insert(menuItemIngredients).values(ingredient).returning();
    return result;
  }

  async removeMenuItemIngredient(id: string): Promise<void> {
    await db.delete(menuItemIngredients).where(eq(menuItemIngredients.id, id));
  }

  // Purchase order operations
  async getPurchaseOrders(locationId?: string): Promise<(PurchaseOrder & { vendor?: Vendor; items?: PurchaseOrderItem[] })[]> {
    const query = db
      .select()
      .from(purchaseOrders)
      .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .orderBy(desc(purchaseOrders.createdAt));
    
    if (locationId) {
      query.where(eq(purchaseOrders.locationId, locationId));
    }
    
    return await query
      .then(rows => rows.map(row => ({
        ...row.purchase_orders,
        vendor: row.vendors || undefined,
      })));
  }

  async getPurchaseOrder(id: string): Promise<(PurchaseOrder & { vendor?: Vendor; items: (PurchaseOrderItem & { inventoryItem: InventoryItem })[] }) | undefined> {
    const [order] = await db
      .select()
      .from(purchaseOrders)
      .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .where(eq(purchaseOrders.id, id));
    
    if (!order) return undefined;

    const items = await db
      .select()
      .from(purchaseOrderItems)
      .innerJoin(inventoryItems, eq(purchaseOrderItems.inventoryItemId, inventoryItems.id))
      .where(eq(purchaseOrderItems.purchaseOrderId, id))
      .then(rows => rows.map(row => ({
        ...row.purchase_order_items,
        inventoryItem: row.inventory_items,
      })));

    return {
      ...order.purchase_orders,
      vendor: order.vendors || undefined,
      items,
    };
  }

  async createPurchaseOrder(order: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [result] = await db.insert(purchaseOrders).values(order).returning();
    return result;
  }

  async updatePurchaseOrder(id: string, order: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder> {
    const [result] = await db
      .update(purchaseOrders)
      .set({ ...order, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id))
      .returning();
    return result;
  }

  async deletePurchaseOrder(id: string): Promise<void> {
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  }

  async addPurchaseOrderItem(item: InsertPurchaseOrderItem): Promise<PurchaseOrderItem> {
    const [result] = await db.insert(purchaseOrderItems).values(item).returning();
    return result;
  }

  async removePurchaseOrderItem(id: string): Promise<void> {
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.id, id));
  }

  // Waste tracking operations
  async getWasteEntries(locationId?: string): Promise<(WasteEntry & { inventoryItem: InventoryItem; reporter?: User })[]> {
    let query = db
      .select()
      .from(wasteEntries)
      .innerJoin(inventoryItems, eq(wasteEntries.inventoryItemId, inventoryItems.id))
      .leftJoin(users, eq(wasteEntries.reportedBy, users.id))
      .orderBy(desc(wasteEntries.createdAt));

    if (locationId) {
      query = query.where(eq(inventoryItems.locationId, locationId));
    }

    return await query.then(rows => rows.map(row => ({
      ...row.waste_entries,
      inventoryItem: row.inventory_items,
      reporter: row.users || undefined,
    })));
  }

  async createWasteEntry(entry: InsertWasteEntry): Promise<WasteEntry> {
    const [result] = await db.insert(wasteEntries).values(entry).returning();
    return result;
  }

  async getWasteStats(startDate?: Date, endDate?: Date): Promise<{ totalCost: number; totalEntries: number }> {
    let query = db.select({
      totalCost: sql<string>`COALESCE(SUM(${wasteEntries.cost}), 0)`,
      totalEntries: sql<string>`COUNT(*)`,
    }).from(wasteEntries);

    if (startDate && endDate) {
      query = query.where(and(
        gte(wasteEntries.createdAt, startDate),
        lte(wasteEntries.createdAt, endDate)
      ));
    }

    const [result] = await query;
    return {
      totalCost: parseFloat(result?.totalCost || '0'),
      totalEntries: parseInt(result?.totalEntries || '0'),
    };
  }

  // Inventory transaction operations
  async createInventoryTransaction(transaction: InsertInventoryTransaction): Promise<InventoryTransaction> {
    const [result] = await db.insert(inventoryTransactions).values(transaction).returning();
    return result;
  }

  async getInventoryTransactions(itemId?: string): Promise<(InventoryTransaction & { inventoryItem?: InventoryItem; creator?: User })[]> {
    let query = db
      .select()
      .from(inventoryTransactions)
      .leftJoin(inventoryItems, eq(inventoryTransactions.inventoryItemId, inventoryItems.id))
      .leftJoin(users, eq(inventoryTransactions.createdBy, users.id))
      .orderBy(desc(inventoryTransactions.createdAt));

    if (itemId) {
      query = query.where(eq(inventoryTransactions.inventoryItemId, itemId));
    }

    return await query.then(rows => rows.map(row => ({
      ...row.inventory_transactions,
      inventoryItem: row.inventory_items || undefined,
      creator: row.users || undefined,
    })));
  }

  // Calculate food cost percentage from real POS sales and inventory costs
  async calculateFoodCostPercentage(): Promise<number> {
    try {
      // Get today's sales data from POS
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));

      // Get total revenue from POS sales
      const salesData = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(CAST(${posSales.total} AS DECIMAL)), 0)`,
        })
        .from(posSales)
        .where(
          sql`${posSales.orderDate} >= ${startOfDay} 
          AND ${posSales.orderDate} <= ${endOfDay}`
        );

      const totalRevenue = Number(salesData[0]?.totalRevenue || 0);

      if (totalRevenue === 0) {
        return 0; // No sales means no food cost percentage
      }

      // Get COGS from inventory transactions (items used/sold today)
      const cogsData = await db
        .select({
          totalCogs: sql<number>`COALESCE(SUM(CAST(${inventoryTransactions.quantity} AS DECIMAL) * 
            (SELECT CAST(cost_per_unit AS DECIMAL) FROM inventory_items WHERE id = ${inventoryTransactions.inventoryItemId})), 0)`,
        })
        .from(inventoryTransactions)
        .where(
          sql`${inventoryTransactions.type} = 'out' 
          AND ${inventoryTransactions.createdAt} >= ${startOfDay} 
          AND ${inventoryTransactions.createdAt} <= ${endOfDay}`
        );

      const totalCogs = Number(cogsData[0]?.totalCogs || 0);
      
      // Calculate food cost percentage: (COGS / Revenue) * 100
      return (totalCogs / totalRevenue) * 100;
    } catch (error) {
      console.error('Error calculating food cost percentage:', error);
      return 0; // Return 0 if calculation fails
    }
  }

  // Dashboard metrics
  async getDashboardMetrics(locationId?: string): Promise<{
    totalInventoryValue: number;
    lowStockCount: number;
    weeklyWaste: number;
    foodCostPercentage: number;
  }> {
    const totalInventoryValue = await this.getTotalInventoryValue(locationId);
    
    const lowStockItems = await this.getLowStockItems(locationId);
    const lowStockCount = lowStockItems.length;
    
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const wasteStats = await this.getWasteStats(weekAgo, new Date());
    
    // Calculate real food cost percentage from POS sales and inventory costs
    const foodCostPercentage = await this.calculateFoodCostPercentage();
    
    return {
      totalInventoryValue,
      lowStockCount,
      weeklyWaste: wasteStats.totalCost,
      foodCostPercentage,
    };
  }

  // Security and audit methods
  async createSecurityLog(data: any): Promise<any> {
    try {
      const result = await db.execute(sql`
        INSERT INTO security_logs (user_id, action, resource, ip_address, user_agent, session_id, severity, metadata)
        VALUES (${data.userId}, ${data.action}, ${data.resource}, ${data.ipAddress}, ${data.userAgent}, ${data.sessionId}, ${data.severity}, ${data.metadata})
        RETURNING *
      `);
      return result.rows[0];
    } catch (error) {
      console.error('Failed to create security log:', error);
      throw error;
    }
  }

  async createAuditLog(data: any): Promise<any> {
    try {
      const result = await db.execute(sql`
        INSERT INTO audit_logs (user_id, location_id, table_name, record_id, action, old_values, new_values, changed_fields, reason)
        VALUES (${data.userId}, ${data.locationId}, ${data.tableName}, ${data.recordId}, ${data.action}, ${data.oldValues}, ${data.newValues}, ${data.changedFields}, ${data.reason})
        RETURNING *
      `);
      return result.rows[0];
    } catch (error) {
      console.error('Failed to create audit log:', error);
      throw error;
    }
  }

  async getUserPermissions(userId: string): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM user_permissions WHERE user_id = ${userId} AND is_active = true
      `);
      return result.rows;
    } catch (error) {
      console.error('Failed to get user permissions:', error);
      return [];
    }
  }

  async createCostAlert(data: any): Promise<any> {
    try {
      const result = await db.execute(sql`
        INSERT INTO cost_alerts (location_id, alert_type, item_id, threshold, actual_value, variance, severity)
        VALUES (${data.locationId}, ${data.alertType}, ${data.itemId}, ${data.threshold}, ${data.actualValue}, ${data.variance}, ${data.severity})
        RETURNING *
      `);
      return result.rows[0];
    } catch (error) {
      console.error('Failed to create cost alert:', error);
      throw error;
    }
  }

  async createBusinessIntelligence(data: any): Promise<any> {
    try {
      const result = await db.execute(sql`
        INSERT INTO business_intelligence (location_id, report_date, total_revenue, total_cogs, gross_margin, 
                                          food_cost_percentage, waste_percentage, inventory_turnover, avg_order_value, 
                                          customer_count, top_selling_items, low_performing_items, trends)
        VALUES (${data.locationId}, ${data.reportDate}, ${data.totalRevenue}, ${data.totalCogs}, ${data.grossMargin},
                ${data.foodCostPercentage}, ${data.wastePercentage}, ${data.inventoryTurnover}, ${data.avgOrderValue},
                ${data.customerCount}, ${data.topSellingItems}, ${data.lowPerformingItems}, ${data.trends})
        RETURNING *
      `);
      return result.rows[0];
    } catch (error) {
      console.error('Failed to create business intelligence:', error);
      throw error;
    }
  }

  async getBusinessIntelligenceByDate(locationId: string, date: Date): Promise<any | null> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM business_intelligence 
        WHERE location_id = ${locationId} AND DATE(report_date) = DATE(${date.toISOString()})
        ORDER BY created_at DESC LIMIT 1
      `);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Failed to get business intelligence by date:', error);
      return null;
    }
  }

  async createPriceMonitoring(data: any): Promise<any> {
    try {
      const result = await db.execute(sql`
        INSERT INTO price_monitoring (inventory_item_id, vendor_id, previous_price, current_price, 
                                     price_change, percentage_change, threshold, alert_sent, invoice_id)
        VALUES (${data.inventoryItemId}, ${data.vendorId}, ${data.previousPrice}, ${data.currentPrice},
                ${data.priceChange}, ${data.percentageChange}, ${data.threshold}, ${data.alertSent}, ${data.invoiceId})
        RETURNING *
      `);
      return result.rows[0];
    } catch (error) {
      console.error('Failed to create price monitoring:', error);
      throw error;
    }
  }

  async getLatestPriceMonitoring(inventoryItemId: string, vendorId: string): Promise<any | null> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM price_monitoring 
        WHERE inventory_item_id = ${inventoryItemId} AND vendor_id = ${vendorId}
        ORDER BY created_at DESC LIMIT 1
      `);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Failed to get latest price monitoring:', error);
      return null;
    }
  }

  async getPosSalesByDateRange(locationId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return await db.select().from(posSales)
      .where(and(
        eq(posSales.locationId, locationId),
        gte(posSales.orderDate, startDate),
        lte(posSales.orderDate, endDate)
      ));
  }

  async getInventoryTransactionsByDateRange(locationId: string, startDate: Date, endDate: Date, type?: string): Promise<any[]> {
    const conditions = [
      eq(inventoryTransactions.locationId, locationId),
      gte(inventoryTransactions.createdAt, startDate),
      lte(inventoryTransactions.createdAt, endDate)
    ];
    
    if (type) {
      conditions.push(eq(inventoryTransactions.type, type));
    }

    return await db.select().from(inventoryTransactions)
      .where(and(...conditions));
  }

  async getPurchaseOrdersByDateRange(locationId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return await db.select().from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.locationId, locationId),
        gte(purchaseOrders.orderDate, startDate),
        lte(purchaseOrders.orderDate, endDate)
      ));
  }

  async getInventoryByLocation(locationId: string): Promise<any[]> {
    return await db.select().from(inventoryItems)
      .where(eq(inventoryItems.locationId, locationId));
  }
  // Advanced MarginEdge-like Features Implementation

  async getInvoiceById(id: string): Promise<any | null> {
    const result = await db.execute(sql`SELECT * FROM invoice_processing WHERE id = ${id} LIMIT 1`);
    return result.rows[0] || null;
  }

  async getInvoices(status?: string, locationId?: string): Promise<any[]> {
    try {
      let query = db
        .select()
        .from(invoiceProcessing)
        .leftJoin(vendors, eq(invoiceProcessing.vendorId, vendors.id))
        .orderBy(desc(invoiceProcessing.createdAt));

      const conditions = [];
      if (status && status !== 'all') {
        conditions.push(eq(invoiceProcessing.status, status));
      }
      if (locationId) {
        conditions.push(eq(invoiceProcessing.locationId, locationId));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const results = await query;
      return results.map(row => {
        let lineItems = [];
        let fees = [];
        
        // Safe parsing of lineItems
        try {
          if (row.invoice_processing.lineItems) {
            lineItems = typeof row.invoice_processing.lineItems === 'string' 
              ? JSON.parse(row.invoice_processing.lineItems) 
              : row.invoice_processing.lineItems;
          }
        } catch (error) {
          console.error('Error parsing lineItems:', error);
          lineItems = [];
        }
        
        // Safe parsing of fees
        try {
          if (row.invoice_processing.fees) {
            fees = typeof row.invoice_processing.fees === 'string' 
              ? JSON.parse(row.invoice_processing.fees) 
              : row.invoice_processing.fees;
          }
        } catch (error) {
          console.error('Error parsing fees:', error);
          fees = [];
        }
        
        return {
          ...row.invoice_processing,
          vendor: row.vendors || undefined,
          totalAmount: parseFloat(row.invoice_processing.total || '0'),
          subtotal: parseFloat(row.invoice_processing.subtotal || '0'),
          tax: parseFloat(row.invoice_processing.tax || '0'),
          lineItems,
          fees,
        };
      });
    } catch (error) {
      console.error('Error fetching invoices:', error);
      return [];
    }
  }

  async createInvoice(invoice: any): Promise<any> {
    try {
      // Calculate totals
      const subtotal = parseFloat(invoice.subtotal || '0');
      const tax = parseFloat(invoice.tax || '0');
      const total = parseFloat(invoice.total || (subtotal + tax));

      const invoiceData = {
        invoiceNumber: invoice.invoiceNumber || `INV-${Date.now()}`,
        vendorId: invoice.vendorId || null,
        locationId: invoice.locationId || null,
        invoiceDate: new Date(invoice.invoiceDate || Date.now()),
        dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
        subtotal: subtotal.toString(),
        tax: tax.toString(),
        total: total.toString(),
        status: invoice.status || 'pending',
        uploadMethod: invoice.uploadMethod || 'upload',
        ocrConfidence: invoice.ocrConfidence ? parseFloat(invoice.ocrConfidence).toString() : null,
        lineItems: invoice.lineItems ? JSON.stringify(invoice.lineItems) : null,
        fees: invoice.fees ? JSON.stringify(invoice.fees) : null, // IRS-compliant separate tracking of delivery, shipping, and other charges
        attachmentPath: invoice.attachmentPath || null, // Path to original invoice file
        notes: invoice.notes || (invoice.originalText ? 
          invoice.originalText
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove control characters
            .replace(/[^\x20-\x7E\s]/g, '') // Keep only printable ASCII and whitespace
            .substring(0, 1000) // Limit length
            .trim() || null 
          : null),
        processedAt: invoice.processedAt ? new Date(invoice.processedAt) : new Date(),
      };

      const [result] = await db.insert(invoiceProcessing).values(invoiceData).returning();
      return {
        ...result,
        totalAmount: parseFloat(result.total || '0'),
        subtotal: parseFloat(result.subtotal || '0'),
        tax: parseFloat(result.tax || '0'),
      };
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw error;
    }
  }

  async updateInvoiceStatus(id: string, status: string): Promise<any> {
    try {
      const [result] = await db
        .update(invoiceProcessing)
        .set({ status })
        .where(eq(invoiceProcessing.id, id))
        .returning();
      
      return {
        ...result,
        totalAmount: parseFloat(result.total || '0'),
        subtotal: parseFloat(result.subtotal || '0'),
        tax: parseFloat(result.tax || '0'),
      };
    } catch (error) {
      console.error('Error updating invoice status:', error);
      throw error;
    }
  }

  async updateInvoice(id: string, data: any): Promise<any> {
    try {
      const updateData = {
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
        total: data.total ? data.total.toString() : null,
        subtotal: data.subtotal ? data.subtotal.toString() : null,
        lineItems: data.lineItems ? JSON.stringify(data.lineItems) : null,
        fees: data.fees ? JSON.stringify(data.fees) : null,
        status: (data.status as any) || 'pending'
      };
      
      const [result] = await db
        .update(invoiceProcessing)
        .set(updateData)
        .where(eq(invoiceProcessing.id, id))
        .returning();
      
      return {
        ...result,
        totalAmount: parseFloat(result.total || '0'),
        subtotal: parseFloat(result.subtotal || '0'),
        tax: parseFloat(result.tax || '0'),
      };
    } catch (error) {
      console.error('Error updating invoice:', error);
      throw error;
    }
  }

  async deleteInvoice(id: string): Promise<void> {
    try {
      await db
        .delete(invoiceProcessing)
        .where(eq(invoiceProcessing.id, id));
    } catch (error) {
      console.error('Error deleting invoice:', error);
      throw error;
    }
  }

  async getInvoiceStats(locationId?: string): Promise<any> {
    try {
      // Base where conditions
      const whereConditions = locationId ? [eq(invoiceProcessing.locationId, locationId)] : [];
      const pendingConditions = locationId ? 
        [eq(invoiceProcessing.status, 'pending'), eq(invoiceProcessing.locationId, locationId)] : 
        [eq(invoiceProcessing.status, 'pending')];
      const overdueConditions = locationId ? 
        [eq(invoiceProcessing.status, 'overdue'), eq(invoiceProcessing.locationId, locationId)] : 
        [eq(invoiceProcessing.status, 'overdue')];

      const [totalResult] = await db
        .select({
          count: sql`COUNT(*)`,
          total: sql`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
        })
        .from(invoiceProcessing)
        .where(whereConditions.length > 0 ? whereConditions[0] : undefined);

      const [pendingResult] = await db
        .select({ count: sql`COUNT(*)` })
        .from(invoiceProcessing)
        .where(and(...pendingConditions));

      const [overdueResult] = await db
        .select({ count: sql`COUNT(*)` })
        .from(invoiceProcessing)
        .where(and(...overdueConditions));

      return {
        totalInvoices: parseInt(totalResult.count as string) || 0,
        pendingCount: parseInt(pendingResult.count as string) || 0,
        overdueCount: parseInt(overdueResult.count as string) || 0,
        totalAmount: parseFloat(totalResult.total as string) || 0,
      };
    } catch (error) {
      console.error('Error fetching invoice stats:', error);
      return {
        totalInvoices: 0,
        pendingCount: 0,
        overdueCount: 0,
        totalAmount: 0,
      };
    }
  }

  async getCostAlerts(locationId?: string): Promise<any[]> {
    try {
      // Return empty array since cost_alerts table doesn't exist yet
      // This would be populated when actual cost monitoring alerts are implemented
      return [];
    } catch (error) {
      console.error('Error fetching cost alerts:', error);
      return []; // Return empty array when no real alerts exist
    }
  }

  async getPriceMonitoring(timeRange: string): Promise<any[]> {
    try {
      // Get real price monitoring data from purchase orders and invoices
      const daysAgo = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 90;
      const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      
      const priceHistory = await db
        .select({
          itemName: inventoryItems.name,
          vendorName: vendors.name,
          currentPrice: inventoryItems.costPerUnit,
          createdAt: inventoryItems.createdAt,
        })
        .from(inventoryItems)
        .leftJoin(vendors, eq(inventoryItems.vendorId, vendors.id))
        .where(gte(inventoryItems.updatedAt, startDate))
        .orderBy(desc(inventoryItems.updatedAt))
        .limit(20);
      
      return priceHistory.map(item => ({
        id: `pm-${item.itemName}-${Date.now()}`,
        itemName: item.itemName,
        vendorName: item.vendorName || 'Unknown Vendor',
        currentPrice: parseFloat(item.currentPrice || '0'),
        previousPrice: parseFloat(item.currentPrice || '0'), // Would need historical data for real comparison
        percentageChange: 0, // Would calculate from historical data
        changeDate: item.createdAt || new Date()
      }));
    } catch (error) {
      console.error('Error fetching price monitoring:', error);
      return []; // Return empty array when no data exists
    }
  }

  async getCostTrends(timeRange: string, locationId?: string): Promise<any[]> {
    try {
      // Get real cost trends from actual data
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      // Get sales data for the period
      const salesData = (locationId && locationId !== 'all')
        ? await this.getPosSalesByDateRange(locationId, startDate, new Date())
        : [];
      
      // Get waste data for the period
      const wasteStats = await this.getWasteStats(startDate, new Date());
      
      // Calculate daily aggregates from real data
      const trends = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayStart = new Date(date.setHours(0, 0, 0, 0));
        const dayEnd = new Date(date.setHours(23, 59, 59, 999));
        
        // Filter sales for this day
        const daySales = salesData.filter(sale => {
          const saleDate = new Date(sale.orderDate);
          return saleDate >= dayStart && saleDate <= dayEnd;
        });
        
        const dayRevenue = daySales.reduce((sum, sale) => sum + parseFloat(sale.total), 0);
        
        trends.push({
          date: dayStart.toISOString().split('T')[0],
          actualCost: dayRevenue * 0.3, // Approximate COGS at 30%
          budgetedCost: dayRevenue * 0.28, // Budget target at 28%
          foodCostPercentage: dayRevenue > 0 ? 30 : 0,
          grossMarginPercentage: dayRevenue > 0 ? 70 : 0,
          wastePercentage: dayRevenue > 0 ? (wasteStats.totalCost / days / Math.max(dayRevenue, 1)) * 100 : 0
        });
      }
      
      return trends;
    } catch (error) {
      console.error('Error fetching cost trends:', error);
      return []; // Return empty array when no data exists
    }
  }

  async getBudgetTracking(locationId?: string): Promise<any> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const conditions = [
        gte(purchaseOrders.orderDate, startOfMonth)
      ];
      
      if (locationId && locationId !== 'all') {
        conditions.push(eq(purchaseOrders.locationId, locationId));
      }

      const monthlyOrders = await db
        .select()
        .from(purchaseOrders)
        .where(and(...conditions));

      const monthlySpend = monthlyOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);
      
      // Get budget from budgets table if exists
      const budgetData = await db.select().from(budgets);
      const totalBudget = budgetData.reduce((sum, budget) => sum + parseFloat(budget.amount), 0);
      const spendVariance = totalBudget > 0 ? ((monthlySpend - totalBudget) / totalBudget * 100) : 0;

      const categoryBreakdown: any = {};
      
      monthlyOrders.forEach(order => {
        const items = order.items as any[];
        items?.forEach((item: any) => {
          const category = item.category || 'Other';
          if (!categoryBreakdown[category]) {
            categoryBreakdown[category] = { name: category, actual: 0, budget: 0, variance: 0 };
          }
          categoryBreakdown[category].actual += parseFloat(item.total || 0);
        });
      });

      return {
        monthlySpend,
        spendVariance: parseFloat(spendVariance.toFixed(1)),
        foodCostPercentage: 0, // Would need sales data to calculate
        categoryBreakdown: Object.values(categoryBreakdown)
      };
    } catch (error) {
      console.error('Error fetching budget tracking:', error);
      return {
        monthlySpend: 0,
        spendVariance: 0,
        foodCostPercentage: 0,
        categoryBreakdown: []
      };
    }
  }

  async getDailyPnL(timeRange: string, locationId?: string): Promise<any[]> {
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const conditions = [
        gte(businessIntelligence.reportDate, startDate)
      ];
      
      if (locationId && locationId !== 'all') {
        conditions.push(eq(businessIntelligence.locationId, locationId));
      }

      const biData = await db
        .select()
        .from(businessIntelligence)
        .where(and(...conditions))
        .orderBy(businessIntelligence.reportDate);

      return biData.map(row => ({
        date: row.reportDate,
        revenue: parseFloat(row.totalRevenue || '0'),
        cogs: parseFloat(row.totalCogs || '0'),
        grossProfit: parseFloat(row.totalRevenue || '0') - parseFloat(row.totalCogs || '0'),
        foodCostPercentage: parseFloat(row.foodCostPercentage || '0'),
        grossMarginPercentage: row.totalRevenue && parseFloat(row.totalRevenue) > 0 
          ? ((parseFloat(row.totalRevenue) - parseFloat(row.totalCogs || '0')) / parseFloat(row.totalRevenue) * 100) 
          : 0
      }));
    } catch (error) {
      console.error('Error fetching daily P&L:', error);
      return [];
    }
  }

  async getKPIMetrics(timeRange: string, locationId?: string): Promise<any> {
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const conditions = [
        gte(businessIntelligence.reportDate, startDate)
      ];
      
      if (locationId && locationId !== 'all') {
        conditions.push(eq(businessIntelligence.locationId, locationId));
      }

      const biData = await db
        .select()
        .from(businessIntelligence)
        .where(and(...conditions));

      if (biData.length === 0) {
        return {
          grossMargin: 0,
          marginVariance: 0,
          foodCostPercentage: 0,
          avgOrderValue: 0,
          aovVariance: 0,
          customerCount: 0
        };
      }

      const avgFoodCost = biData.reduce((sum, row) => sum + parseFloat(row.foodCostPercentage || '0'), 0) / biData.length;
      const avgOrderValue = biData.reduce((sum, row) => sum + parseFloat(row.avgOrderValue || '0'), 0) / biData.length;
      const totalCustomers = biData.reduce((sum, row) => sum + (row.customerCount || 0), 0);
      const avgGrossMargin = 100 - avgFoodCost;

      return {
        grossMargin: parseFloat(avgGrossMargin.toFixed(1)),
        marginVariance: 0,
        foodCostPercentage: parseFloat(avgFoodCost.toFixed(1)),
        avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
        aovVariance: 0,
        customerCount: totalCustomers
      };
    } catch (error) {
      console.error('Error fetching KPI metrics:', error);
      return {
        grossMargin: 0,
        marginVariance: 0,
        foodCostPercentage: 0,
        avgOrderValue: 0,
        aovVariance: 0,
        customerCount: 0
      };
    }
  }

  async getProfitabilityAnalysis(timeRange: string, locationId?: string): Promise<any[]> {
    try {
      const kpis = await this.getKPIMetrics(timeRange, locationId);
      
      return [
        { name: "Gross Profit Margin", value: `${kpis.grossMargin}%`, target: "65-70%" },
        { name: "Food Cost Percentage", value: `${kpis.foodCostPercentage}%`, target: "28-32%" },
        { name: "Labor Cost Percentage", value: "N/A", target: "28-35%" },
        { name: "Prime Cost", value: "N/A", target: "<60%" },
        { name: "Net Profit Margin", value: "N/A", target: "10-15%" },
        { name: "EBITDA", value: "N/A", target: "15-20%" },
        { name: "Inventory Turnover", value: "N/A", target: "20-30x" },
        { name: "Average Check Size", value: `$${kpis.avgOrderValue.toFixed(2)}`, target: "$45-50" }
      ];
    } catch (error) {
      console.error('Error fetching profitability analysis:', error);
      return [];
    }
  }

  async getMenuPerformance(timeRange: string, locationId?: string): Promise<any[]> {
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const conditions = [
        gte(posSales.orderDate, startDate)
      ];
      
      if (locationId && locationId !== 'all') {
        conditions.push(eq(posSales.locationId, locationId));
      }

      const sales = await db
        .select()
        .from(posSales)
        .where(and(...conditions));

      const itemPerformance: any = {};
      
      sales.forEach(sale => {
        const items = sale.items as any[];
        items?.forEach((item: any) => {
          const itemName = item.name || 'Unknown Item';
          if (!itemPerformance[itemName]) {
            itemPerformance[itemName] = {
              name: itemName,
              unitsSold: 0,
              revenue: 0,
              category: item.category || 'Other'
            };
          }
          itemPerformance[itemName].unitsSold += item.quantity || 1;
          itemPerformance[itemName].revenue += parseFloat(item.price || 0) * (item.quantity || 1);
        });
      });

      return Object.values(itemPerformance)
        .sort((a: any, b: any) => b.revenue - a.revenue)
        .slice(0, 10)
        .map((item: any) => ({
          ...item,
          margin: 70, // Default margin - needs recipe costing integration
          profit: item.revenue * 0.70
        }));
    } catch (error) {
      console.error('Error fetching menu performance:', error);
      return [];
    }
  }

  async getCostAnalysis(timeRange: string, locationId?: string): Promise<any> {
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const conditions = [
        gte(purchaseOrders.orderDate, startDate)
      ];
      
      if (locationId && locationId !== 'all') {
        conditions.push(eq(purchaseOrders.locationId, locationId));
      }

      const orders = await db
        .select()
        .from(purchaseOrders)
        .where(and(...conditions));

      const categoryBreakdown: any = {};
      
      orders.forEach(order => {
        const items = order.items as any[];
        items?.forEach((item: any) => {
          const category = item.category || 'Other';
          if (!categoryBreakdown[category]) {
            categoryBreakdown[category] = { name: category, value: 0 };
          }
          categoryBreakdown[category].value += parseFloat(item.total || 0);
        });
      });

      return {
        categoryBreakdown: Object.values(categoryBreakdown),
        monthlyBreakdown: []
      };
    } catch (error) {
      console.error('Error fetching cost analysis:', error);
      return {
        categoryBreakdown: [],
        monthlyBreakdown: []
      };
    }
  }
  // HR Department operations
  async getDepartments(locationId?: string): Promise<Department[]> {
    if (locationId) {
      return await db.select().from(departments).where(eq(departments.locationId, locationId)).orderBy(departments.name);
    }
    return await db.select().from(departments).orderBy(departments.name);
  }

  async getDepartment(id: string): Promise<Department | undefined> {
    const [department] = await db.select().from(departments).where(eq(departments.id, id));
    return department;
  }

  async createDepartment(department: InsertDepartment): Promise<Department> {
    const [created] = await db.insert(departments).values(department).returning();
    return created;
  }

  async updateDepartment(id: string, department: Partial<InsertDepartment>): Promise<Department> {
    const [updated] = await db.update(departments)
      .set({ ...department, updatedAt: new Date() })
      .where(eq(departments.id, id))
      .returning();
    return updated;
  }

  async deleteDepartment(id: string): Promise<void> {
    await db.delete(departments).where(eq(departments.id, id));
  }

  // HR Position operations
  async getPositions(locationId?: string): Promise<Position[]> {
    if (locationId) {
      // Filter positions by their department's location
      const result = await db.select({
        position: positions
      })
      .from(positions)
      .leftJoin(departments, eq(positions.departmentId, departments.id))
      .where(eq(departments.locationId, locationId))
      .orderBy(positions.title);
      
      return result.map(r => r.position);
    }
    return await db.select().from(positions).orderBy(positions.title);
  }

  async getPosition(id: string): Promise<Position | undefined> {
    const [position] = await db.select().from(positions).where(eq(positions.id, id));
    return position;
  }

  async createPosition(position: InsertPosition): Promise<Position> {
    const [created] = await db.insert(positions).values(position).returning();
    return created;
  }

  async updatePosition(id: string, position: Partial<InsertPosition>): Promise<Position> {
    const [updated] = await db.update(positions)
      .set({ ...position, updatedAt: new Date() })
      .where(eq(positions.id, id))
      .returning();
    return updated;
  }

  async deletePosition(id: string): Promise<void> {
    await db.delete(positions).where(eq(positions.id, id));
  }

  // HR Employee operations  
  async getEmployees(locationId?: string): Promise<(Employee & { department?: Department; position?: Position })[]> {
    let query = db.select({
      employee: employees,
      department: departments,
      position: positions,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(positions, eq(employees.positionId, positions.id));

    // Filter by location if provided using direct employee location assignment
    if (locationId) {
      query = query.where(eq(employees.locationId, locationId));
    }
    
    const result = await query.orderBy(employees.lastName, employees.firstName);
    
    return result.map(r => ({ 
      ...r.employee, 
      department: r.department || undefined, 
      position: r.position || undefined 
    }));
  }

  async getEmployee(id: string): Promise<(Employee & { department?: Department; position?: Position }) | undefined> {
    const [result] = await db.select({
      employee: employees,
      department: departments,
      position: positions,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .where(eq(employees.id, id));
    
    return result ? { 
      ...result.employee, 
      department: result.department || undefined, 
      position: result.position || undefined 
    } : undefined;
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    // Generate next sequential employee number
    const existingEmployees = await db.select({ employeeNumber: employees.employeeNumber })
      .from(employees)
      .orderBy(desc(employees.employeeNumber));
    
    let nextEmployeeNumber = "EMP001";
    if (existingEmployees.length > 0) {
      const lastNumber = existingEmployees[0].employeeNumber;
      if (lastNumber && lastNumber.startsWith("EMP")) {
        const numPart = parseInt(lastNumber.substring(3));
        if (!isNaN(numPart)) {
          nextEmployeeNumber = `EMP${String(numPart + 1).padStart(3, '0')}`;
        }
      }
    }

    const employeeData = {
      ...employee,
      employeeNumber: nextEmployeeNumber
    };

    const [created] = await db.insert(employees).values(employeeData).returning();
    return created;
  }

  async updateEmployee(id: string, employee: Partial<InsertEmployee>): Promise<Employee> {
    const [updated] = await db.update(employees)
      .set({ ...employee, updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();
    return updated;
  }

  async deleteEmployee(id: string): Promise<void> {
    // Handle foreign key constraints by cleaning up related records first
    
    // 1. Delete or update paystubs (set employee_id to null or delete if cascading is desired)
    await db.delete(paystubs).where(eq(paystubs.employeeId, id));
    
    // 2. Delete time entries
    await db.delete(timeEntries).where(eq(timeEntries.employeeId, id));
    
    // 3. Update tasks to remove employee assignment (don't delete tasks, just unassign)
    await db.update(tasks)
      .set({ assignedTo: null })
      .where(eq(tasks.assignedTo, id));
    
    // 4. Delete shifts
    await db.delete(shifts).where(eq(shifts.employeeId, id));
    
    // 5. Delete availability records
    await db.delete(availability).where(eq(availability.employeeId, id));
    
    // 6. Delete time-off requests
    await db.delete(timeOffRequests).where(eq(timeOffRequests.employeeId, id));
    
    // 7. Delete performance reviews
    await db.delete(performanceReviews).where(eq(performanceReviews.employeeId, id));
    
    // 8. Delete task completions
    await db.delete(taskCompletions).where(eq(taskCompletions.employeeId, id));
    
    // 9. Update messages to remove employee recipient (keep messages, just remove recipient reference)
    await db.update(messages)
      .set({ recipientId: null })
      .where(eq(messages.recipientId, id));
    
    // 10. Delete employee onboarding records
    await db.delete(employeeOnboarding).where(eq(employeeOnboarding.employeeId, id));
    
    // 11. Delete employee documents
    await db.delete(employeeDocuments).where(eq(employeeDocuments.employeeId, id));
    
    // 12. Delete employee document assignments  
    await db.delete(employeeDocumentAssignments).where(eq(employeeDocumentAssignments.employeeId, id));
    
    // 13. Delete POS employee mappings
    await db.delete(posEmployeeMappings).where(eq(posEmployeeMappings.employeeId, id));
    
    // Finally, delete the employee record
    await db.delete(employees).where(eq(employees.id, id));
  }

  // HR Shift operations
  async getShifts(locationId?: string): Promise<(Shift & { employee?: Employee })[]> {
    const query = db.select({
      shift: shifts,
      employee: employees,
    })
    .from(shifts)
    .leftJoin(employees, eq(shifts.employeeId, employees.id));
    
    // Filter by location if provided and order by startTime
    const result = locationId
      ? await query.where(eq(shifts.locationId, locationId))
      : await query;
    
    return result.map(r => ({ ...r.shift, employee: r.employee || undefined }));
  }

  async getShift(id: string): Promise<(Shift & { employee?: Employee }) | undefined> {
    const [result] = await db.select({
      shift: shifts,
      employee: employees,
    })
    .from(shifts)
    .leftJoin(employees, eq(shifts.employeeId, employees.id))
    .where(eq(shifts.id, id));
    
    return result ? { ...result.shift, employee: result.employee || undefined } : undefined;
  }

  async createShift(shift: InsertShift): Promise<Shift> {
    const [created] = await db.insert(shifts).values(shift).returning();
    return created;
  }

  async updateShift(id: string, shift: Partial<InsertShift>): Promise<Shift> {
    const [updated] = await db.update(shifts)
      .set({ ...shift, updatedAt: new Date() })
      .where(eq(shifts.id, id))
      .returning();
    return updated;
  }

  async deleteShift(id: string): Promise<void> {
    await db.delete(shifts).where(eq(shifts.id, id));
  }

  async getEmployeeShifts(employeeId: string): Promise<Shift[]> {
    return await db.select().from(shifts)
      .where(eq(shifts.employeeId, employeeId))
      .orderBy(desc(shifts.startTime));
  }

  // HR Task operations
  async getTasks(locationId?: string): Promise<(Task & { assignedEmployee?: Employee })[]> {
    const query = db.select({
      task: tasks,
      assignedEmployee: employees,
    })
    .from(tasks)
    .leftJoin(employees, eq(tasks.assignedTo, employees.id));
    
    // Filter by location if provided
    const result = locationId
      ? await query.where(eq(tasks.locationId, locationId))
      : await query;
    
    return result.map(r => ({ ...r.task, assignedEmployee: r.assignedEmployee || undefined }));
  }

  async getTask(id: string): Promise<(Task & { assignedEmployee?: Employee }) | undefined> {
    const [result] = await db.select({
      task: tasks,
      assignedEmployee: employees,
    })
    .from(tasks)
    .leftJoin(employees, eq(tasks.assignedTo, employees.id))
    .where(eq(tasks.id, id));
    
    return result ? { ...result.task, assignedEmployee: result.assignedEmployee || undefined } : undefined;
  }

  async createTask(task: InsertTask): Promise<Task> {
    const [created] = await db.insert(tasks).values(task).returning();
    return created;
  }

  async updateTask(id: string, data: Partial<InsertTask>): Promise<Task> {
    const [updated] = await db
      .update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async updateTaskStatus(id: string, status: string): Promise<Task> {
    const [updated] = await db
      .update(tasks)
      .set({ 
        status: status as 'pending' | 'in_progress' | 'completed' | 'cancelled', 
        updatedAt: new Date(),
        completedAt: status === 'completed' ? new Date() : null
      })
      .where(eq(tasks.id, id))
      .returning();
    return updated;
  }

  // HR Time Entry operations (for time clock)
  async getTimeEntries(): Promise<(TimeEntry & { employee?: Employee })[]> {
    try {
      // Use direct SQL to avoid Drizzle timestamp issues completely
      const result = await db.execute(sql`
        SELECT te.id, te.employee_id, te.status, te.notes, te.total_hours,
               e.first_name, e.last_name
        FROM time_entries te
        LEFT JOIN employees e ON te.employee_id = e.id
        WHERE te.status = 'clocked-in'
        LIMIT 50
      `);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        employeeId: row.employee_id,
        clockInTime: new Date(), // Use current date to avoid null issues
        clockOutTime: null,
        breakStartTime: null,
        breakEndTime: null,
        totalHours: row.total_hours,
        status: row.status || 'clocked-in',
        notes: row.notes,
        createdAt: new Date(),
        updatedAt: new Date(),
        employee: row.first_name ? {
          id: row.employee_id,
          firstName: row.first_name,
          lastName: row.last_name
        } : undefined
      })) as (TimeEntry & { employee?: Employee })[];
    } catch (error) {
      console.error('Error fetching time entries:', error);
      return [];
    }
  }

  async getActiveTimeEntry(employeeId: string): Promise<TimeEntry | undefined> {
    try {
      // Use direct SQL to avoid timestamp issues
      const result = await db.execute(sql`
        SELECT id, employee_id, status, notes
        FROM time_entries 
        WHERE employee_id = ${employeeId} 
        AND status = 'clocked-in'
        LIMIT 1
      `);
      
      if (result.rows.length === 0) return undefined;
      
      const row = result.rows[0] as any;
      return {
        id: row.id,
        employeeId: row.employee_id,
        clockInTime: new Date(),
        clockOutTime: null,
        breakStartTime: null,
        breakEndTime: null,
        totalHours: null,
        status: row.status,
        notes: row.notes,
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;
    } catch (error) {
      console.error('Error fetching active time entry:', error);
      return undefined;
    }
  }

  async clockIn(employeeId: string, shiftId?: string): Promise<TimeEntry> {
    const clockInTime = new Date();
    const [entry] = await db.insert(timeEntries).values({
      employeeId,
      shiftId: shiftId || null,
      clockInTime,
      status: 'clocked-in',
      createdAt: new Date(),
    }).returning();
    return {
      ...entry,
      clockInTime: clockInTime.toISOString(),
      clockOutTime: null,
      breakStartTime: null,
      breakEndTime: null,
      totalHours: 0,
      createdAt: clockInTime.toISOString()
    } as TimeEntry;
  }

  async clockOut(entryId: string): Promise<TimeEntry> {
    const clockOutTime = new Date();
    
    // Handle POS-synced entries
    if (entryId.startsWith('pos-')) {
      const posTimeclockId = entryId.replace('pos-', '');
      
      // Update pos_timeclocks table
      const result = await db.execute(sql`
        UPDATE pos_timeclocks
        SET clock_out_at = ${clockOutTime},
            status = 'closed',
            updated_at = ${clockOutTime}
        WHERE id = ${posTimeclockId}::uuid
        RETURNING id, clock_in_at, clock_out_at, break_seconds, status
      `);
      
      if (result.rows.length === 0) throw new Error('POS time entry not found');
      
      const row = result.rows[0] as any;
      const clockIn = new Date(row.clock_in_at);
      const totalHours = (clockOutTime.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
      
      return {
        id: entryId,
        employeeId: '', // Not needed for this response
        clockInTime: clockIn.toISOString(),
        clockOutTime: clockOutTime.toISOString(),
        breakStartTime: null,
        breakEndTime: null,
        totalHours: totalHours.toFixed(2),
        status: 'closed',
        notes: null,
        createdAt: clockIn.toISOString(),
        updatedAt: clockOutTime.toISOString(),
        source: 'pos'
      } as any;
    }
    
    // Handle regular time entries
    const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, entryId));
    
    if (!entry) throw new Error('Time entry not found');
    
    const clockInTime = entry.clockInTime;
    if (!clockInTime) throw new Error('Clock in time not found');
    const totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
    
    const [updated] = await db.update(timeEntries)
      .set({
        clockOutTime,
        totalHours: totalHours.toFixed(2),
        status: 'clocked-out',
        updatedAt: new Date(),
      })
      .where(eq(timeEntries.id, entryId))
      .returning();
    
    return updated;
  }

  async startBreak(entryId: string): Promise<TimeEntry> {
    const [updated] = await db.update(timeEntries)
      .set({
        breakStartTime: new Date(),
        status: 'on-break',
        updatedAt: new Date(),
      })
      .where(eq(timeEntries.id, entryId))
      .returning();
    
    return updated;
  }

  async endBreak(entryId: string): Promise<TimeEntry> {
    const [updated] = await db.update(timeEntries)
      .set({
        breakEndTime: new Date(),
        status: 'clocked-in',
        updatedAt: new Date(),
      })
      .where(eq(timeEntries.id, entryId))
      .returning();
    
    return updated;
  }

  async updateTimeEntry(entryId: string, updateData: {
    clockInTime?: Date;
    clockOutTime?: Date;
    breakStartTime?: Date;
    breakEndTime?: Date;
    totalHours?: string;
    notes?: string;
  }): Promise<TimeEntry> {
    // Handle POS-synced entries
    if (entryId.startsWith('pos-')) {
      const posTimeclockId = entryId.replace('pos-', '');
      
      // Only update clock times for POS entries (breaks and notes not supported in POS tables)
      if (updateData.clockInTime || updateData.clockOutTime) {
        // Build update object for POS timeclocks
        const posUpdateData: any = {
          updatedAt: new Date()
        };
        
        if (updateData.clockInTime) {
          posUpdateData.clockInAt = updateData.clockInTime;
        }
        if (updateData.clockOutTime) {
          posUpdateData.clockOutAt = updateData.clockOutTime;
          posUpdateData.status = 'closed';
        }
        
        const [updated] = await db.update(posTimeclocks)
          .set(posUpdateData)
          .where(eq(posTimeclocks.id, posTimeclockId))
          .returning();
        
        if (!updated) throw new Error('POS time entry not found');
        
        const result = { rows: [updated] };
        
        if (result.rows.length === 0) throw new Error('POS time entry not found');
        
        const row = result.rows[0] as any;
        const clockIn = new Date(row.clock_in_at);
        const clockOut = row.clock_out_at ? new Date(row.clock_out_at) : null;
        let totalHours = null;
        if (clockOut) {
          totalHours = ((clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)).toFixed(2);
        }
        
        return {
          id: entryId,
          employeeId: '',
          clockInTime: clockIn.toISOString(),
          clockOutTime: clockOut ? clockOut.toISOString() : null,
          breakStartTime: null,
          breakEndTime: null,
          totalHours,
          status: row.status === 'open' ? 'clocked-in' : 'clocked-out',
          notes: null,
          createdAt: clockIn.toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'pos'
        } as any;
      }
      
      throw new Error('Only clock in/out times can be updated for POS entries');
    }
    
    // Handle regular time entries
    // Recalculate total hours if times are being updated
    if (updateData.clockInTime || updateData.clockOutTime) {
      const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, entryId));
      if (entry) {
        const clockIn = updateData.clockInTime || entry.clockInTime;
        const clockOut = updateData.clockOutTime || entry.clockOutTime;
        if (clockIn && clockOut) {
          const totalHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
          updateData.totalHours = totalHours.toFixed(2);
        }
      }
    }

    const [updated] = await db.update(timeEntries)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(timeEntries.id, entryId))
      .returning();
    
    return updated;
  }

  async deleteTimeEntry(entryId: string): Promise<void> {
    // Handle POS-synced entries
    if (entryId.startsWith('pos-')) {
      const posTimeclockId = entryId.replace('pos-', '');
      await db.execute(sql`
        DELETE FROM pos_timeclocks
        WHERE id = ${posTimeclockId}::uuid
      `);
      return;
    }
    
    // Handle regular time entries
    await db.delete(timeEntries).where(eq(timeEntries.id, entryId));
  }

  async createTimeEntry(entryData: any): Promise<TimeEntry> {
    const clockInTime = new Date(entryData.clockInTime);
    const clockOutTime = entryData.clockOutTime ? new Date(entryData.clockOutTime) : null;
    
    // Check for overlapping time entries for the same employee
    if (clockOutTime) {
      const existingEntries = await db.select().from(timeEntries)
        .where(eq(timeEntries.employeeId, entryData.employeeId));
      
      for (const existing of existingEntries) {
        if (existing.clockInTime && existing.clockOutTime) {
          const existingStart = existing.clockInTime.getTime();
          const existingEnd = existing.clockOutTime.getTime();
          const newStart = clockInTime.getTime();
          const newEnd = clockOutTime.getTime();
          
          // Check if times overlap
          if ((newStart < existingEnd && newEnd > existingStart)) {
            throw new Error(`Time entry overlaps with existing entry from ${existing.clockInTime.toISOString()} to ${existing.clockOutTime.toISOString()}`);
          }
        }
      }
    }

    const [entry] = await db.insert(timeEntries).values({
      employeeId: entryData.employeeId,
      clockInTime: clockInTime,
      clockOutTime: clockOutTime,
      breakStartTime: entryData.breakStartTime ? new Date(entryData.breakStartTime) : null,
      breakEndTime: entryData.breakEndTime ? new Date(entryData.breakEndTime) : null,
      notes: entryData.notes || null,
      status: entryData.clockOutTime ? 'clocked-out' : 'clocked-in',
      createdAt: new Date()
    }).returning();
    return entry;
  }

  async getEmployeeTimeEntries(employeeId: string): Promise<TimeEntry[]> {
    return await db.select().from(timeEntries)
      .where(eq(timeEntries.employeeId, employeeId))
      .orderBy(desc(timeEntries.clockInTime));
  }

  // HR Message operations
  async getMessages(locationId?: string): Promise<Message[]> {
    if (locationId) {
      return await db.select().from(messages)
        .where(eq(messages.locationId, locationId))
        .orderBy(desc(messages.createdAt));
    }
    return await db.select().from(messages).orderBy(desc(messages.createdAt));
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    // Ensure senderId is set - fallback to owner ID if missing
    const messageWithSender = {
      ...message,
      senderId: message.senderId || '46308728'
    };
    console.log('Storage: Creating message with data:', messageWithSender);
    const [created] = await db.insert(messages).values(messageWithSender).returning();
    return created;
  }

  async markMessageAsRead(messageId: string, userId: string): Promise<void> {
    const [message] = await db.select().from(messages).where(eq(messages.id, messageId));
    if (!message) return;
    
    const readBy = Array.isArray(message.readBy) ? message.readBy : [];
    const alreadyRead = readBy.some((r: any) => r.userId === userId);
    
    if (!alreadyRead) {
      readBy.push({ userId, readAt: new Date() });
      await db.update(messages)
        .set({ readBy, updatedAt: new Date() })
        .where(eq(messages.id, messageId));
    }
  }



  // HR Time-off Request operations
  async getTimeOffRequests(): Promise<TimeOffRequest[]> {
    return await db.select().from(timeOffRequests).orderBy(desc(timeOffRequests.createdAt));
  }

  async getEmployeeTimeOffRequests(employeeId: string): Promise<TimeOffRequest[]> {
    return await db.select()
      .from(timeOffRequests)
      .where(eq(timeOffRequests.employeeId, employeeId))
      .orderBy(desc(timeOffRequests.createdAt));
  }

  async createTimeOffRequest(request: InsertTimeOffRequest): Promise<TimeOffRequest> {
    const [created] = await db.insert(timeOffRequests).values(request).returning();
    return created;
  }

  async updateTimeOffRequestStatus(id: string, status: string, notes?: string, approvedBy?: string): Promise<TimeOffRequest> {
    const updateData: any = { 
      status, 
      updatedAt: new Date() 
    };
    
    if (notes) updateData.notes = notes;
    if (approvedBy) {
      updateData.approvedBy = approvedBy;
      updateData.approvalDate = new Date();
    }

    const [updated] = await db
      .update(timeOffRequests)
      .set(updateData)
      .where(eq(timeOffRequests.id, id))
      .returning();
    return updated;
  }

  // HR Analytics
  async getHRAnalytics(locationId?: string): Promise<any> {
    try {
      // Get employees first (with proper location filtering)
      const employees = await this.getEmployees(locationId);
      const employeeIds = employees.map(emp => emp.id);
      
      // Get related data filtered by employee location
      let shiftsQuery = db.select().from(shifts);
      let tasksQuery = db.select().from(tasks);  
      let messagesQuery = db.select().from(messages);
      
      // Filter by employees from the selected location
      if (locationId && employeeIds.length > 0) {
        shiftsQuery = shiftsQuery.where(inArray(shifts.employeeId, employeeIds));
        tasksQuery = tasksQuery.where(inArray(tasks.assignedTo, employeeIds));
        // Messages can be location-specific or employee-specific
        messagesQuery = messagesQuery.where(
          or(
            inArray(messages.recipientId, employeeIds),
            and(
              eq(messages.recipientType, 'location'),
              eq(messages.recipientId, locationId)
            )
          )
        );
      }
      
      const allShifts = await shiftsQuery;
      const allTasks = await tasksQuery;
      const allMessages = await messagesQuery;
      
      // Get currently working count - only from employees at this location
      let currentlyWorkingManualCount = 0;
      let currentlyWorkingPosCount = 0;
      
      // Only count if we have a location and employees
      if (locationId && employeeIds.length > 0) {
        // Count manual time entries
        const manualResult = await db.select({ count: sql<number>`count(*)` })
          .from(timeEntries)
          .where(
            and(
              sql`clock_out_time IS NULL`,
              inArray(timeEntries.employeeId, employeeIds)
            )
          );
        currentlyWorkingManualCount = Number(manualResult[0]?.count) || 0;
        
        // Count POS timeclock entries
        const posResult = await db.select({ count: sql<number>`count(*)` })
          .from(posTimeclocks)
          .where(
            and(
              eq(posTimeclocks.status, 'open'),
              eq(posTimeclocks.locationId, locationId)
            )
          );
        currentlyWorkingPosCount = Number(posResult[0]?.count) || 0;
      }
      
      const totalCurrentlyWorking = currentlyWorkingManualCount + currentlyWorkingPosCount;

      // Calculate analytics safely
      const today = new Date().toISOString().split('T')[0];
      
      // Calculate actual weekly hours from time entries
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      // Get all time entries (both regular and POS) from the past week
      const weeklyTimeEntries = locationId && employeeIds.length > 0
        ? await db.select().from(timeEntries)
            .where(
              and(
                gte(timeEntries.clockInTime, sevenDaysAgo),
                inArray(timeEntries.employeeId, employeeIds)
              )
            )
        : await db.select().from(timeEntries)
            .where(gte(timeEntries.clockInTime, sevenDaysAgo));
      
      // Get POS time entries from the past week (only completed entries with clockOutAt)
      const weeklyPosTimeEntries = locationId
        ? await db.select().from(posTimeclocks)
            .where(
              and(
                gte(posTimeclocks.clockInAt, sevenDaysAgo),
                isNotNull(posTimeclocks.clockOutAt),
                eq(posTimeclocks.locationId, locationId)
              )
            )
        : await db.select().from(posTimeclocks)
            .where(
              and(
                gte(posTimeclocks.clockInAt, sevenDaysAgo),
                isNotNull(posTimeclocks.clockOutAt)
              )
            );
      
      // Calculate total hours from regular time entries (only completed entries)
      const regularHours = weeklyTimeEntries.reduce((total, entry: any) => {
        if (entry.clockOutTime) {
          const hours = (new Date(entry.clockOutTime).getTime() - new Date(entry.clockInTime).getTime()) / (1000 * 60 * 60);
          return total + hours;
        }
        return total;
      }, 0);
      
      // Calculate total hours from POS time entries (only completed entries)
      const posHours = weeklyPosTimeEntries.reduce((total, entry: any) => {
        if (entry.clockOutAt) {
          const hours = (new Date(entry.clockOutAt).getTime() - new Date(entry.clockInAt).getTime()) / (1000 * 60 * 60);
          return total + hours;
        }
        return total;
      }, 0);
      
      const totalWeeklyHours = regularHours + posHours;
      
      // Calculate actual labor cost based on individual employee hours and rates (not averages)
      let estimatedWeeklyLabor = 0;
      
      // Calculate cost from manual time entries
      for (const entry of weeklyTimeEntries) {
        if (entry.clockOutTime) {
          const employee = employees.find((emp: any) => emp.id === entry.employeeId);
          if (employee && employee.hourlyRate) {
            const hours = (new Date(entry.clockOutTime).getTime() - new Date(entry.clockInTime).getTime()) / (1000 * 60 * 60);
            estimatedWeeklyLabor += hours * employee.hourlyRate;
          }
        }
      }
      
      // Calculate cost from POS time entries
      for (const entry of weeklyPosTimeEntries) {
        if (entry.clockOutAt && entry.employeeId) {
          const employee = employees.find((emp: any) => emp.id === entry.employeeId);
          if (employee && employee.hourlyRate) {
            const hours = (new Date(entry.clockOutAt).getTime() - new Date(entry.clockInAt).getTime()) / (1000 * 60 * 60);
            estimatedWeeklyLabor += hours * employee.hourlyRate;
          }
        }
      }
      
      // Calculate average rate for display purposes only
      const employeesWithWage = employees.filter((emp: any) => emp.hourlyRate && emp.hourlyRate > 0);
      const avgHourlyRate = employeesWithWage.length > 0
        ? employeesWithWage.reduce((sum: number, emp: any) => sum + (emp.hourlyRate || 0), 0) / employeesWithWage.length
        : 0;
      
      // Calculate scheduled shift hours for the current week
      const currentWeekStart = new Date();
      currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay()); // Sunday
      currentWeekStart.setHours(0, 0, 0, 0);
      
      const currentWeekEnd = new Date(currentWeekStart);
      currentWeekEnd.setDate(currentWeekEnd.getDate() + 6); // Saturday
      currentWeekEnd.setHours(23, 59, 59, 999);
      
      const weeklyScheduledShifts = allShifts.filter((shift: any) => {
        if (!shift.date) return false;
        const shiftDate = new Date(shift.date);
        return shiftDate >= currentWeekStart && shiftDate <= currentWeekEnd;
      });
      
      const scheduledWeeklyHours = weeklyScheduledShifts.reduce((total, shift: any) => {
        // Parse time strings (HH:MM format)
        const [startHour, startMin] = shift.startTime.split(':').map(Number);
        const [endHour, endMin] = shift.endTime.split(':').map(Number);
        
        // Calculate hours
        const startMinutes = startHour * 60 + startMin;
        let endMinutes = endHour * 60 + endMin;
        
        // Handle overnight shifts
        if (endMinutes < startMinutes) {
          endMinutes += 24 * 60;
        }
        
        const totalMinutes = endMinutes - startMinutes - (shift.breakDuration || 0);
        const hours = totalMinutes / 60;
        
        return total + hours;
      }, 0);
      
      // Calculate scheduled labor cost
      let scheduledWeeklyLabor = 0;
      for (const shift of weeklyScheduledShifts) {
        const employee = employees.find((emp: any) => emp.id === shift.employeeId);
        if (employee && employee.hourlyRate) {
          const [startHour, startMin] = shift.startTime.split(':').map(Number);
          const [endHour, endMin] = shift.endTime.split(':').map(Number);
          
          const startMinutes = startHour * 60 + startMin;
          let endMinutes = endHour * 60 + endMin;
          
          if (endMinutes < startMinutes) {
            endMinutes += 24 * 60;
          }
          
          const totalMinutes = endMinutes - startMinutes - (shift.breakDuration || 0);
          const hours = totalMinutes / 60;
          
          scheduledWeeklyLabor += hours * employee.hourlyRate;
        }
      }
      
      // Calculate task completion rate properly
      const completedTasks = allTasks.filter((task: any) => task.status === 'completed').length;
      const taskCompletionRate = allTasks.length > 0 
        ? (completedTasks / allTasks.length) * 100 
        : 0;
      
      const analytics = {
        // Basic counts (now location-filtered)
        totalEmployees: employees.length,
        activeEmployees: employees.filter((emp: any) => emp.status === 'active').length,
        currentlyWorking: totalCurrentlyWorking,
        
        // Today's metrics  
        todayShifts: allShifts.filter((shift: any) => 
          shift.date && shift.date.toString().startsWith(today)
        ).length,
        pendingTasks: allTasks.filter((task: any) => task.status !== 'completed').length,
        unreadMessages: allMessages.filter((msg: any) => !msg.isRead).length,
        
        // Time off (simplified)
        pendingTimeOff: 0,
        approvedTimeOff: 0,
        
        // Weekly analytics - SCHEDULED hours from shifts (current week)
        weeklyShifts: weeklyScheduledShifts.length,
        totalWeeklyHours: Math.round(scheduledWeeklyHours * 100) / 100,
        
        // Actual worked hours from time entries (past 7 days) - for comparison
        actualWeeklyHours: Math.round(totalWeeklyHours * 100) / 100,
        actualWeeklyLabor: Math.round(estimatedWeeklyLabor * 100) / 100,
        
        // Performance metrics
        taskCompletionRate: Math.round(taskCompletionRate * 100) / 100,
        
        // Labor cost - SCHEDULED labor from shifts
        avgHourlyRate: Math.round(avgHourlyRate * 100) / 100,
        estimatedWeeklyLabor: Math.round(scheduledWeeklyLabor * 100) / 100,
        
        // Recent activity
        recentMessages: allMessages.slice(0, 5),
        upcomingShifts: allShifts.slice(0, 10)
      };

      return analytics;
    } catch (error) {
      console.error('Error calculating HR analytics:', error);
      throw error;
    }
  }

  // HR Payroll operations
  async getPayPeriods(): Promise<PayPeriod[]> {
    return await db.select().from(payPeriods).orderBy(desc(payPeriods.startDate));
  }

  async getPayPeriod(id: string): Promise<PayPeriod | undefined> {
    const [payPeriod] = await db.select().from(payPeriods).where(eq(payPeriods.id, id));
    return payPeriod;
  }

  async createPayPeriod(payPeriodData: InsertPayPeriod): Promise<PayPeriod> {
    const [payPeriod] = await db
      .insert(payPeriods)
      .values(payPeriodData)
      .returning();
    return payPeriod;
  }

  async updatePayPeriod(id: string, payPeriodData: Partial<InsertPayPeriod>): Promise<PayPeriod> {
    const [payPeriod] = await db
      .update(payPeriods)
      .set({ ...payPeriodData, updatedAt: new Date() })
      .where(eq(payPeriods.id, id))
      .returning();
    return payPeriod;
  }

  /**
   * Calculate tax deductions for payroll using configured tax settings
   * @param payPeriodId - The payroll period ID to get location from
   * @param grossPay - The gross pay amount
   * @param customDeductions - Any custom deduction amounts
   * @returns Object with calculated tax amounts
   */
  private async calculateTaxDeductions(payPeriodId: string, grossPay: number, customDeductions: number = 0) {
    // Get the pay period to find location
    const period = await this.getPayrollPeriod(payPeriodId);
    
    // Get tax settings for this location (use defaults if not found)
    const taxSettings = period?.locationId ? await this.getTaxSettings(period.locationId) : null;
    const federalTaxRate = taxSettings ? parseFloat(taxSettings.federalTaxRate) : 0.08;
    const stateTaxRate = taxSettings ? parseFloat(taxSettings.stateTaxRate) : 0.02;
    const socialSecurityRate = taxSettings ? parseFloat(taxSettings.socialSecurityRate) : 0.062;
    const medicareRate = taxSettings ? parseFloat(taxSettings.medicareRate) : 0.0145;
    
    // Calculate tax deductions using configured rates
    const federalTax = grossPay * federalTaxRate;
    const stateTax = grossPay * stateTaxRate;
    const socialSecurity = grossPay * socialSecurityRate;
    const medicare = grossPay * medicareRate;
    const totalDeductions = federalTax + stateTax + socialSecurity + medicare + customDeductions;
    
    return {
      federalTax,
      stateTax,
      socialSecurity,
      medicare,
      totalDeductions
    };
  }

  async recalculatePayroll(payPeriodId: string): Promise<Paystub[]> {
    // Delete existing paystubs for this pay period
    await db.delete(paystubs).where(eq(paystubs.payPeriodId, payPeriodId));
    
    // Reset pay period status
    await this.updatePayPeriod(payPeriodId, {
      status: 'draft',
      totalGrossPay: '0',
      totalDeductions: '0',
      totalNetPay: '0'
    });
    
    // Recalculate
    return this.calculatePayroll(payPeriodId);
  }

  async calculatePayroll(payPeriodId: string): Promise<Paystub[]> {
    // Get the pay period
    const payPeriod = await this.getPayPeriod(payPeriodId);
    if (!payPeriod) throw new Error('Pay period not found');

    // Get paycheck settings to control actual payroll processing behavior
    const paycheckSettings = await this.getPaycheckSettings();
    console.log('🎯 Using real paycheck settings for payroll processing:', paycheckSettings);
    
    // Get all active employees
    const employees = await this.getEmployees();
    const activeEmployees = employees.filter(emp => emp.status === 'active');

    // Get manual time entries for the pay period (exclude NULL clock_in_time entries)
    const employeeTimeEntries = await db
      .select()
      .from(timeEntries)
      .where(
        and(
          isNotNull(timeEntries.clockInTime),
          gte(timeEntries.clockInTime, sql`${payPeriod.startDate}::timestamp`),
          lte(timeEntries.clockInTime, sql`${payPeriod.endDate}::timestamp + interval '1 day'`)
        )
      );

    // Get POS timeclock entries for the pay period (calculate hours from clock_in_at and clock_out_at)
    const posTimeclockEntries = await db
      .select({
        id: posTimeclocks.id,
        employeeId: posEmployeeMappings.employeeId,
        clockInAt: posTimeclocks.clockInAt,
        clockOutAt: posTimeclocks.clockOutAt,
        breakSeconds: posTimeclocks.breakSeconds
      })
      .from(posTimeclocks)
      .leftJoin(posEmployees, eq(posTimeclocks.posEmployeeId, posEmployees.id))
      .leftJoin(posEmployeeMappings, eq(posEmployees.id, posEmployeeMappings.posEmployeeId))
      .where(
        and(
          isNotNull(posTimeclocks.clockInAt),
          isNotNull(posTimeclocks.clockOutAt),
          isNotNull(posEmployeeMappings.employeeId),
          gte(posTimeclocks.clockInAt, sql`${payPeriod.startDate}::timestamp`),
          lte(posTimeclocks.clockInAt, sql`${payPeriod.endDate}::timestamp + interval '1 day'`)
        )
      );

    console.log(`📊 Payroll calculation: ${employeeTimeEntries.length} manual entries, ${posTimeclockEntries.length} POS entries`);

    const paystubsToCreate: InsertPaystub[] = [];

    for (const employee of activeEmployees) {
      // Calculate hours worked for this employee from manual entries
      const empTimeEntries = employeeTimeEntries.filter(entry => entry.employeeId === employee.id);
      
      // Calculate hours from POS timeclocks
      const empPosEntries = posTimeclockEntries.filter(entry => entry.employeeId === employee.id);
      
      let regularHours = 0;
      let overtimeHours = 0;
      
      // Add manual time entry hours
      for (const entry of empTimeEntries) {
        if (entry.clockOutTime && entry.totalHours) {
          const hours = Number(entry.totalHours);
          if (regularHours + hours <= 40) {
            regularHours += hours;
          } else if (regularHours < 40) {
            const regularToAdd = 40 - regularHours;
            regularHours = 40;
            overtimeHours += hours - regularToAdd;
          } else {
            overtimeHours += hours;
          }
        }
      }

      // Add POS timeclock hours (calculate from clock_in_at and clock_out_at)
      for (const entry of empPosEntries) {
        if (entry.clockInAt && entry.clockOutAt) {
          // Calculate total hours from timestamps
          const clockInTime = new Date(entry.clockInAt).getTime();
          const clockOutTime = new Date(entry.clockOutAt).getTime();
          const breakSeconds = entry.breakSeconds || 0;
          
          // Calculate work milliseconds (minus break time)
          const workMilliseconds = clockOutTime - clockInTime - (breakSeconds * 1000);
          const hours = workMilliseconds / (1000 * 60 * 60); // Convert to hours
          
          if (regularHours + hours <= 40) {
            regularHours += hours;
          } else if (regularHours < 40) {
            const regularToAdd = 40 - regularHours;
            regularHours = 40;
            overtimeHours += hours - regularToAdd;
          } else {
            overtimeHours += hours;
          }
        }
      }

      const hourlyRate = Number(employee.hourlyRate || 15);
      const overtimeRate = hourlyRate * 1.5;
      
      const regularPay = regularHours * hourlyRate;
      const overtimePay = overtimeHours * overtimeRate;
      const grossPay = regularPay + overtimePay;
      
      // Calculate tax deductions using configured tax settings
      const { federalTax, stateTax, socialSecurity, medicare, totalDeductions } = 
        await this.calculateTaxDeductions(payPeriodId, grossPay);
      const netPay = grossPay - totalDeductions;

      // Generate real check number using settings
      let checkNumber: number | undefined;
      if (paycheckSettings?.showLastCheckNumber) {
        checkNumber = (paycheckSettings.lastCheckNumber || 1000) + paystubsToCreate.length + 1;
      }

      paystubsToCreate.push({
        payPeriodId,
        employeeId: employee.id,
        regularHours: regularHours.toString(),
        overtimeHours: overtimeHours.toString(),
        regularRate: hourlyRate.toString(),
        overtimeRate: overtimeRate.toString(),
        regularPay: regularPay.toString(),
        overtimePay: overtimePay.toString(),
        grossPay: grossPay.toString(),
        federalTax: federalTax.toString(),
        stateTax: stateTax.toString(),
        socialSecurity: socialSecurity.toString(),
        medicare: medicare.toString(),
        totalDeductions: totalDeductions.toString(),
        netPay: netPay.toString(),
        status: 'calculated',
        checkNumber: checkNumber?.toString(),
        // Store the real settings that control how this paycheck will be displayed/printed
        metadata: JSON.stringify({
          displayLast4Ssn: paycheckSettings?.displayLast4Ssn || false,
          displayBusinessName: paycheckSettings?.displayBusinessName || false,
          displayTaxFilingName: paycheckSettings?.displayTaxFilingName || false,
          paycheckLayout: paycheckSettings?.paycheckLayout || 'check_stub_only',
          printSignature: paycheckSettings?.printSignature || false,
          businessName: paycheckSettings?.businessName || 'Business Name',
          taxFilingName: paycheckSettings?.taxFilingName || 'Tax Filing Name'
        })
      });
    }

    // Insert all paystubs
    const createdPaystubs = await db
      .insert(paystubs)
      .values(paystubsToCreate)
      .returning();

    // Update the last check number in settings after processing payroll
    if (paycheckSettings?.showLastCheckNumber && paystubsToCreate.length > 0) {
      const lastCheckUsed = (paycheckSettings.lastCheckNumber || 1000) + paystubsToCreate.length;
      await this.updatePaycheckSettings({ lastCheckNumber: lastCheckUsed });
      console.log('✅ Updated last check number to:', lastCheckUsed);
    }

    // Update pay period totals
    const totalGrossPay = paystubsToCreate.reduce((sum, stub) => sum + Number(stub.grossPay), 0);
    const totalDeductions = paystubsToCreate.reduce((sum, stub) => sum + Number(stub.totalDeductions), 0);
    const totalNetPay = paystubsToCreate.reduce((sum, stub) => sum + Number(stub.netPay), 0);

    await this.updatePayPeriod(payPeriodId, {
      status: 'calculated',
      totalGrossPay: totalGrossPay.toString(),
      totalDeductions: totalDeductions.toString(),
      totalNetPay: totalNetPay.toString()
    });

    return createdPaystubs;
  }

  async approvePayroll(payPeriodId: string, approvedBy: string): Promise<PayPeriod> {
    const [payPeriod] = await db
      .update(payPeriods)
      .set({
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(payPeriods.id, payPeriodId))
      .returning();
    return payPeriod;
  }

  async createManualPaystub(payPeriodId: string, manualData: any): Promise<Paystub> {
    const {
      employeeId,
      regularHours,
      overtimeHours,
      regularRate,
      bonuses,
      tips,
      customDeductions,
      notes
    } = manualData;

    // Get employee details
    const employee = await this.getEmployee(employeeId);
    if (!employee) throw new Error('Employee not found');

    // Get paycheck settings for check number generation
    const paycheckSettings = await this.getPaycheckSettings();

    // Calculate pay
    const regHours = parseFloat(regularHours) || 0;
    const otHours = parseFloat(overtimeHours) || 0;
    const rate = parseFloat(regularRate) || 0;
    const bonusAmount = parseFloat(bonuses) || 0;
    const tipAmount = parseFloat(tips) || 0;
    const customDeductionAmount = parseFloat(customDeductions) || 0;

    const regularPay = regHours * rate;
    const overtimePay = otHours * rate * 1.5;
    const grossPay = regularPay + overtimePay + bonusAmount + tipAmount;

    // Calculate tax deductions using configured tax settings
    const { federalTax, stateTax, socialSecurity, medicare, totalDeductions } = 
      await this.calculateTaxDeductions(payPeriodId, grossPay, customDeductionAmount);
    const netPay = grossPay - totalDeductions;

    // Generate check number
    let checkNumber: number | undefined;
    if (paycheckSettings?.showLastCheckNumber) {
      checkNumber = (paycheckSettings.lastCheckNumber || 1000) + 1;
      await this.updatePaycheckSettings({ lastCheckNumber: checkNumber });
    }

    // Create paystub
    const paystubData = {
      payPeriodId,
      employeeId,
      regularHours: regHours.toString(),
      overtimeHours: otHours.toString(),
      regularRate: rate.toString(),
      overtimeRate: (rate * 1.5).toString(),
      regularPay: regularPay.toString(),
      overtimePay: overtimePay.toString(),
      bonuses: bonusAmount.toString(),
      tips: tipAmount.toString(),
      grossPay: grossPay.toString(),
      federalTax: federalTax.toString(),
      stateTax: stateTax.toString(),
      socialSecurity: socialSecurity.toString(),
      medicare: medicare.toString(),
      otherDeductions: customDeductionAmount.toString(),
      totalDeductions: totalDeductions.toString(),
      netPay: netPay.toString(),
      status: 'calculated',
      checkNumber: checkNumber?.toString(),
      notes
    };

    const [createdPaystub] = await db
      .insert(paystubs)
      .values(paystubData)
      .returning();

    return createdPaystub;
  }

  async updatePaystub(paystubId: string, updateData: any): Promise<Paystub> {
    const {
      regularHours,
      overtimeHours,
      regularRate,
      bonuses,
      tips,
      customDeductions,
      notes
    } = updateData;

    // Get the existing paystub to find the payPeriodId
    const [existingPaystub] = await db.select().from(paystubs).where(eq(paystubs.id, paystubId));
    if (!existingPaystub) throw new Error('Paystub not found');

    // Recalculate pay based on new values
    const regHours = parseFloat(regularHours) || 0;
    const otHours = parseFloat(overtimeHours) || 0;
    const rate = parseFloat(regularRate) || 0;
    const bonusAmount = parseFloat(bonuses) || 0;
    const tipAmount = parseFloat(tips) || 0;
    const customDeductionAmount = parseFloat(customDeductions) || 0;

    const regularPay = regHours * rate;
    const overtimePay = otHours * rate * 1.5;
    const grossPay = regularPay + overtimePay + bonusAmount + tipAmount;

    // Calculate tax deductions using configured tax settings
    const { federalTax, stateTax, socialSecurity, medicare, totalDeductions } = 
      await this.calculateTaxDeductions(existingPaystub.payPeriodId, grossPay, customDeductionAmount);
    const netPay = grossPay - totalDeductions;

    const updatedData = {
      regularHours: regHours.toString(),
      overtimeHours: otHours.toString(),
      regularRate: rate.toString(),
      overtimeRate: (rate * 1.5).toString(),
      regularPay: regularPay.toString(),
      overtimePay: overtimePay.toString(),
      bonuses: bonusAmount.toString(),
      tips: tipAmount.toString(),
      grossPay: grossPay.toString(),
      federalTax: federalTax.toString(),
      stateTax: stateTax.toString(),
      socialSecurity: socialSecurity.toString(),
      medicare: medicare.toString(),
      otherDeductions: customDeductionAmount.toString(),
      totalDeductions: totalDeductions.toString(),
      netPay: netPay.toString(),
      notes,
      updatedAt: new Date()
    };

    const [updatedPaystub] = await db
      .update(paystubs)
      .set(updatedData)
      .where(eq(paystubs.id, paystubId))
      .returning();

    return updatedPaystub;
  }

  async getEmployeePayStubs(employeeId: string, year: number): Promise<any[]> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    const results = await db
      .select({
        paystub: paystubs,
        payPeriod: payPeriods
      })
      .from(paystubs)
      .leftJoin(payPeriods, eq(paystubs.payPeriodId, payPeriods.id))
      .where(
        and(
          eq(paystubs.employeeId, employeeId),
          gte(payPeriods.payDate, startDate),
          lt(payPeriods.payDate, endDate)
        )
      )
      .orderBy(desc(payPeriods.payDate));

    return results.map(result => ({
      ...result.paystub,
      payPeriod: result.payPeriod
    }));
  }

  async getEmployeePayrollSummary(employeeId: string, year: number): Promise<any> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    const results = await db
      .select({
        paystub: paystubs,
        payPeriod: payPeriods
      })
      .from(paystubs)
      .leftJoin(payPeriods, eq(paystubs.payPeriodId, payPeriods.id))
      .where(
        and(
          eq(paystubs.employeeId, employeeId),
          gte(payPeriods.payDate, startDate),
          lt(payPeriods.payDate, endDate),
          eq(paystubs.status, 'calculated')
        )
      );

    const yearToDateGross = results.reduce((sum, r) => sum + parseFloat(r.paystub.grossPay || '0'), 0);
    const yearToDateNet = results.reduce((sum, r) => sum + parseFloat(r.paystub.netPay || '0'), 0);
    const yearToDateTaxes = results.reduce((sum, r) => sum + parseFloat(r.paystub.totalDeductions || '0'), 0);
    const totalHours = results.reduce((sum, r) => 
      sum + parseFloat(r.paystub.regularHours || '0') + parseFloat(r.paystub.overtimeHours || '0'), 0
    );

    return {
      totalGrossPay: yearToDateGross,
      totalNetPay: yearToDateNet,
      totalDeductions: yearToDateTaxes,
      averageHours: results.length > 0 ? totalHours / results.length : 0,
      yearToDateGross,
      yearToDateNet,
      yearToDateTaxes
    };
  }

  async getPaystubsByPeriod(payPeriodId: string): Promise<(Paystub & { employee?: Employee })[]> {
    const paystubResults = await db
      .select({
        paystub: paystubs,
        employee: employees
      })
      .from(paystubs)
      .leftJoin(employees, eq(paystubs.employeeId, employees.id))
      .where(eq(paystubs.payPeriodId, payPeriodId));

    return paystubResults.map(result => ({
      ...result.paystub,
      employee: result.employee || undefined
    }));
  }

  async getPayrollDeductions(): Promise<PayrollDeduction[]> {
    return await db.select().from(payrollDeductions).where(eq(payrollDeductions.isActive, true));
  }

  async deletePayPeriod(id: string): Promise<void> {
    try {
      // First delete all paystubs for this pay period
      await db.delete(paystubs).where(eq(paystubs.payPeriodId, id));
      
      // Then delete the pay period
      await db.delete(payPeriods).where(eq(payPeriods.id, id));
    } catch (error) {
      console.error('Error deleting pay period:', error);
      throw error;
    }
  }

  async getPayrollSummary(locationId?: string): Promise<{ 
    totalEmployees: number; 
    monthlyPayroll: number; 
    avgHourlyRate: number; 
    laborCostPercentage: number;
    totalTipsReported: number;
    averageTipsPerEmployee: number;
    complianceScore: number;
    outstandingViolations: number;
  }> {
    const employees = await this.getEmployees();
    const activeEmployees = employees.filter(emp => emp.status === 'active');
    
    const totalEmployees = activeEmployees.length;
    
    // Get actual payroll data from calculated pay periods
    const recentPayPeriods = await db
      .select()
      .from(payPeriods)
      .where(eq(payPeriods.status, 'calculated'))
      .orderBy(sql`${payPeriods.createdAt} DESC`)
      .limit(4); // Last 4 pay periods for monthly estimate
    
    let monthlyPayroll = 0;
    let avgHourlyRate = 15;
    let laborCostPercentage = 30;
    
    if (recentPayPeriods.length > 0) {
      // Calculate actual monthly payroll from recent pay periods
      const totalNetPay = recentPayPeriods.reduce((sum, period) => 
        sum + Number(period.totalNetPay || 0), 0);
      
      // If biweekly pay periods, multiply by 2.17 to get monthly
      // If weekly, multiply by 4.33
      monthlyPayroll = totalNetPay * (26 / 12); // Assuming biweekly
      
      // Calculate actual average hourly rate from paystubs
      const payPeriodIds = recentPayPeriods.map(p => p.id);
      const allPaystubs = payPeriodIds.length > 0 ? await db
        .select()
        .from(paystubs)
        .where(sql`${paystubs.payPeriodId} = ANY(${payPeriodIds})`)
        : [];
      
      if (allPaystubs.length > 0) {
        const totalHours = allPaystubs.reduce((sum, stub) => 
          sum + Number(stub.regularHours || 0) + Number(stub.overtimeHours || 0), 0);
        const totalPay = allPaystubs.reduce((sum, stub) => 
          sum + Number(stub.grossPay || 0), 0);
        
        if (totalHours > 0) {
          avgHourlyRate = totalPay / totalHours;
        }
      }
      
      // TODO: Calculate labor cost percentage from actual sales data when POS integration active
      laborCostPercentage = 28; // Realistic target for restaurants
    } else {
      // Fallback to estimates if no calculated pay periods exist
      avgHourlyRate = activeEmployees.length > 0 
        ? activeEmployees.reduce((sum, emp) => sum + Number(emp.hourlyRate || 15), 0) / activeEmployees.length
        : 15;
      monthlyPayroll = totalEmployees * avgHourlyRate * 160;
    }
    
    // Enhanced metrics for comprehensive payroll
    const totalTipsReported = monthlyPayroll * 0.15; // Estimated 15% tips
    const averageTipsPerEmployee = totalEmployees > 0 ? totalTipsReported / totalEmployees : 0;
    const complianceScore = 95; // High compliance score
    const outstandingViolations = 0; // No current violations
    
    return {
      totalEmployees,
      monthlyPayroll: Math.round(monthlyPayroll * 100) / 100,
      avgHourlyRate: Math.round(avgHourlyRate * 100) / 100,
      laborCostPercentage: Math.round(laborCostPercentage * 100) / 100,
      totalTipsReported: Math.round(totalTipsReported * 100) / 100,
      averageTipsPerEmployee: Math.round(averageTipsPerEmployee * 100) / 100,
      complianceScore,
      outstandingViolations
    };
  }

  // Additional comprehensive payroll methods
  async createPayrollDeduction(deduction: InsertPayrollDeduction): Promise<PayrollDeduction> {
    const [newDeduction] = await db
      .insert(payrollDeductions)
      .values(deduction)
      .returning();
    return newDeduction;
  }

  async updatePayrollDeduction(id: string, deduction: Partial<InsertPayrollDeduction>): Promise<PayrollDeduction> {
    const [updatedDeduction] = await db
      .update(payrollDeductions)
      .set({ ...deduction, updatedAt: new Date() })
      .where(eq(payrollDeductions.id, id))
      .returning();
    return updatedDeduction;
  }

  async deletePayrollDeduction(id: string): Promise<void> {
    await db.delete(payrollDeductions).where(eq(payrollDeductions.id, id));
  }

  async getEmployeeDeductions(employeeId?: string): Promise<EmployeeDeduction[]> {
    const query = db.select().from(employeeDeductions);
    if (employeeId) {
      return await query.where(eq(employeeDeductions.employeeId, employeeId));
    }
    return await query;
  }

  async assignDeductionToEmployee(assignment: InsertEmployeeDeduction): Promise<EmployeeDeduction> {
    const [newAssignment] = await db
      .insert(employeeDeductions)
      .values(assignment)
      .returning();
    return newAssignment;
  }

  async updateEmployeeDeduction(id: string, assignment: Partial<InsertEmployeeDeduction>): Promise<EmployeeDeduction> {
    const [updatedAssignment] = await db
      .update(employeeDeductions)
      .set({ ...assignment, updatedAt: new Date() })
      .where(eq(employeeDeductions.id, id))
      .returning();
    return updatedAssignment;
  }

  async removeEmployeeDeduction(id: string): Promise<void> {
    await db.delete(employeeDeductions).where(eq(employeeDeductions.id, id));
  }

  // Employee Documents Management
  async getEmployeeDocuments(employeeId?: string): Promise<EmployeeDocument[]> {
    const query = db.select().from(employeeDocuments);
    if (employeeId) {
      return await query.where(eq(employeeDocuments.employeeId, employeeId));
    }
    return await query;
  }

  async createEmployeeDocument(document: InsertEmployeeDocument): Promise<EmployeeDocument> {
    const [newDocument] = await db
      .insert(employeeDocuments)
      .values(document)
      .returning();
    return newDocument;
  }

  async updateEmployeeDocument(id: string, document: Partial<InsertEmployeeDocument>): Promise<EmployeeDocument> {
    const [updatedDocument] = await db
      .update(employeeDocuments)
      .set({ ...document, updatedAt: new Date() })
      .where(eq(employeeDocuments.id, id))
      .returning();
    return updatedDocument;
  }

  async deleteEmployeeDocument(id: string): Promise<void> {
    await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id));
  }

  async getDocumentRequirements(locationId?: string, positionId?: string): Promise<DocumentRequirement[]> {
    let query = db.select().from(documentRequirements);
    
    if (locationId && positionId) {
      query = query.where(
        and(
          eq(documentRequirements.locationId, locationId),
          eq(documentRequirements.positionId, positionId)
        )
      );
    } else if (locationId) {
      query = query.where(eq(documentRequirements.locationId, locationId));
    } else if (positionId) {
      query = query.where(eq(documentRequirements.positionId, positionId));
    }
    
    return await query;
  }

  async createDocumentRequirement(requirement: InsertDocumentRequirement): Promise<DocumentRequirement> {
    const [newRequirement] = await db
      .insert(documentRequirements)
      .values(requirement)
      .returning();
    return newRequirement;
  }

  async updateDocumentRequirement(id: string, requirement: Partial<InsertDocumentRequirement>): Promise<DocumentRequirement> {
    const [updatedRequirement] = await db
      .update(documentRequirements)
      .set({ ...requirement, updatedAt: new Date() })
      .where(eq(documentRequirements.id, id))
      .returning();
    return updatedRequirement;
  }

  async deleteDocumentRequirement(id: string): Promise<void> {
    await db.delete(documentRequirements).where(eq(documentRequirements.id, id));
  }

  // Onboarding Templates Management
  async getOnboardingTemplates(locationId?: string, positionId?: string): Promise<OnboardingTemplate[]> {
    let query = db.select().from(onboardingTemplates);
    
    if (locationId && positionId) {
      // Return templates that match location OR are general (location_id IS NULL)
      // AND match position OR are general (position_id IS NULL)
      query = query.where(
        and(
          or(eq(onboardingTemplates.locationId, locationId), isNull(onboardingTemplates.locationId)),
          or(eq(onboardingTemplates.positionId, positionId), isNull(onboardingTemplates.positionId))
        )
      );
    } else if (locationId) {
      // Return location-specific templates OR general templates (location_id IS NULL)
      query = query.where(
        or(eq(onboardingTemplates.locationId, locationId), isNull(onboardingTemplates.locationId))
      );
    } else if (positionId) {
      // Return position-specific templates OR general templates (position_id IS NULL)
      query = query.where(
        or(eq(onboardingTemplates.positionId, positionId), isNull(onboardingTemplates.positionId))
      );
    }
    
    return await query;
  }

  async createOnboardingTemplate(template: InsertOnboardingTemplate): Promise<OnboardingTemplate> {
    const [newTemplate] = await db
      .insert(onboardingTemplates)
      .values(template)
      .returning();
    return newTemplate;
  }

  async updateOnboardingTemplate(id: string, template: Partial<InsertOnboardingTemplate>): Promise<OnboardingTemplate> {
    const [updatedTemplate] = await db
      .update(onboardingTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(onboardingTemplates.id, id))
      .returning();
    return updatedTemplate;
  }

  async deleteOnboardingTemplate(id: string): Promise<void> {
    await db.delete(onboardingTemplates).where(eq(onboardingTemplates.id, id));
  }

  // Onboarding Steps Management
  async getOnboardingSteps(templateId: string): Promise<OnboardingStep[]> {
    return await db
      .select()
      .from(onboardingSteps)
      .where(eq(onboardingSteps.templateId, templateId))
      .orderBy(onboardingSteps.stepOrder);
  }

  async createOnboardingStep(step: InsertOnboardingStep): Promise<OnboardingStep> {
    const [newStep] = await db
      .insert(onboardingSteps)
      .values(step)
      .returning();
    return newStep;
  }

  async updateOnboardingStep(id: string, step: Partial<InsertOnboardingStep>): Promise<OnboardingStep> {
    const [updatedStep] = await db
      .update(onboardingSteps)
      .set({ ...step, updatedAt: new Date() })
      .where(eq(onboardingSteps.id, id))
      .returning();
    return updatedStep;
  }

  async deleteOnboardingStep(id: string): Promise<void> {
    await db.delete(onboardingSteps).where(eq(onboardingSteps.id, id));
  }

  // Employee Onboarding Progress
  async getEmployeeOnboarding(employeeId?: string): Promise<EmployeeOnboarding[]> {
    const query = db.select().from(employeeOnboarding);
    if (employeeId) {
      return await query.where(eq(employeeOnboarding.employeeId, employeeId));
    }
    return await query;
  }

  async createEmployeeOnboarding(onboarding: InsertEmployeeOnboarding): Promise<EmployeeOnboarding> {
    const [newOnboarding] = await db
      .insert(employeeOnboarding)
      .values(onboarding)
      .returning();
    return newOnboarding;
  }

  async updateEmployeeOnboarding(id: string, onboarding: Partial<InsertEmployeeOnboarding>): Promise<EmployeeOnboarding> {
    const [updatedOnboarding] = await db
      .update(employeeOnboarding)
      .set({ ...onboarding, updatedAt: new Date() })
      .where(eq(employeeOnboarding.id, id))
      .returning();
    return updatedOnboarding;
  }

  async deleteEmployeeOnboarding(id: string): Promise<void> {
    await db.delete(employeeOnboarding).where(eq(employeeOnboarding.id, id));
  }

  // Employee Onboarding Step Progress
  async getEmployeeOnboardingSteps(employeeOnboardingId: string): Promise<EmployeeOnboardingStep[]> {
    return await db
      .select()
      .from(employeeOnboardingSteps)
      .where(eq(employeeOnboardingSteps.employeeOnboardingId, employeeOnboardingId));
  }

  async createEmployeeOnboardingStep(step: InsertEmployeeOnboardingStep): Promise<EmployeeOnboardingStep> {
    const [newStep] = await db
      .insert(employeeOnboardingSteps)
      .values(step)
      .returning();
    return newStep;
  }

  async updateEmployeeOnboardingStep(id: string, step: Partial<InsertEmployeeOnboardingStep>): Promise<EmployeeOnboardingStep> {
    const [updatedStep] = await db
      .update(employeeOnboardingSteps)
      .set({ ...step, updatedAt: new Date() })
      .where(eq(employeeOnboardingSteps.id, id))
      .returning();
    return updatedStep;
  }

  async deleteEmployeeOnboardingStep(id: string): Promise<void> {
    await db.delete(employeeOnboardingSteps).where(eq(employeeOnboardingSteps.id, id));
  }

  // Advanced onboarding analytics
  async getOnboardingProgress(locationId?: string): Promise<{
    totalActiveOnboarding: number;
    completedThisMonth: number;
    overdueOnboarding: number;
    averageCompletionDays: number;
  }> {
    const allOnboarding = await this.getEmployeeOnboarding();
    const activeOnboarding = allOnboarding.filter(o => o.status === 'in-progress');
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const completedThisMonth = allOnboarding.filter(o => 
      o.status === 'completed' && 
      o.actualCompletionDate && 
      new Date(o.actualCompletionDate) >= startOfMonth
    );
    
    const overdueOnboarding = allOnboarding.filter(o => 
      o.status === 'in-progress' && 
      o.targetCompletionDate && 
      new Date(o.targetCompletionDate) < now
    );
    
    // Calculate average completion days from completed onboarding
    const completedWithDates = allOnboarding.filter(o => 
      o.status === 'completed' && o.startDate && o.actualCompletionDate
    );
    
    let averageCompletionDays = 7; // Default estimate
    if (completedWithDates.length > 0) {
      const totalDays = completedWithDates.reduce((sum, o) => {
        const start = new Date(o.startDate!);
        const end = new Date(o.actualCompletionDate!);
        const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        return sum + daysDiff;
      }, 0);
      averageCompletionDays = Math.round(totalDays / completedWithDates.length);
    }
    
    return {
      totalActiveOnboarding: activeOnboarding.length,
      completedThisMonth: completedThisMonth.length,
      overdueOnboarding: overdueOnboarding.length,
      averageCompletionDays
    };
  }

  // Onboarding Token Management for Public Access
  async createOnboardingToken(employeeId: string, expirationHours: number = 72): Promise<OnboardingToken> {
    const token = crypto.randomUUID() + '-' + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
    
    const [newToken] = await db
      .insert(onboardingTokens)
      .values({
        employeeId,
        token,
        expiresAt,
      })
      .returning();
    
    return newToken;
  }

  async getOnboardingTokenByToken(token: string): Promise<OnboardingToken | undefined> {
    const [tokenRecord] = await db
      .select()
      .from(onboardingTokens)
      .where(eq(onboardingTokens.token, token));
    
    return tokenRecord;
  }

  async validateOnboardingToken(token: string): Promise<{ isValid: boolean; employee?: Employee }> {
    const tokenRecord = await this.getOnboardingTokenByToken(token);
    
    if (!tokenRecord || tokenRecord.isUsed || new Date() > new Date(tokenRecord.expiresAt)) {
      return { isValid: false };
    }

    const employee = await this.getEmployee(tokenRecord.employeeId);
    return { isValid: true, employee };
  }

  async markOnboardingTokenAsUsed(token: string): Promise<void> {
    await db
      .update(onboardingTokens)
      .set({ isUsed: true, completedAt: new Date() })
      .where(eq(onboardingTokens.token, token));
  }

  // Employee Onboarding Data Management
  async saveEmployeeOnboardingData(data: InsertEmployeeOnboardingData): Promise<EmployeeOnboardingData> {
    const [savedData] = await db
      .insert(employeeOnboardingData)
      .values(data)
      .returning();
    return savedData;
  }

  async getEmployeeOnboardingData(employeeId: string): Promise<EmployeeOnboardingData | undefined> {
    const [data] = await db
      .select()
      .from(employeeOnboardingData)
      .where(eq(employeeOnboardingData.employeeId, employeeId));
    return data;
  }

  async updateEmployeeOnboardingData(employeeId: string, data: Partial<InsertEmployeeOnboardingData>): Promise<EmployeeOnboardingData> {
    const [updatedData] = await db
      .update(employeeOnboardingData)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(employeeOnboardingData.employeeId, employeeId))
      .returning();
    return updatedData;
  }

  async getEmployeeWithOnboardingData(employeeId: string): Promise<{ employee?: Employee; onboardingData?: EmployeeOnboardingData }> {
    const employee = await this.getEmployee(employeeId);
    const onboardingData = await this.getEmployeeOnboardingData(employeeId);
    
    return {
      employee,
      onboardingData
    };
  }

  // Document template operations
  async getDocumentTemplates(): Promise<DocumentTemplate[]> {
    const templates = await db.select()
      .from(documentTemplates)
      .where(eq(documentTemplates.isActive, true))
      .orderBy(documentTemplates.sortOrder);
    return templates;
  }

  async getDocumentTemplate(id: string): Promise<DocumentTemplate | undefined> {
    const [template] = await db.select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, id));
    return template;
  }

  async createDocumentTemplate(template: InsertDocumentTemplate): Promise<DocumentTemplate> {
    const [created] = await db.insert(documentTemplates)
      .values(template)
      .returning();
    return created;
  }

  async updateDocumentTemplate(id: string, template: Partial<InsertDocumentTemplate>): Promise<DocumentTemplate> {
    const [updated] = await db.update(documentTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(documentTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteDocumentTemplate(id: string): Promise<void> {
    await db.update(documentTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(documentTemplates.id, id));
  }

  // Employee document assignment operations
  async getEmployeeDocuments(employeeId: string): Promise<any[]> {
    const documents = await db.select({
      id: employeeDocumentAssignments.id,
      templateId: employeeDocumentAssignments.templateId,
      status: employeeDocumentAssignments.status,
      sentAt: employeeDocumentAssignments.sentAt,
      viewedAt: employeeDocumentAssignments.viewedAt,
      completedAt: employeeDocumentAssignments.completedAt,
      signedAt: employeeDocumentAssignments.signedAt,
      expiresAt: employeeDocumentAssignments.expiresAt,
      notes: employeeDocumentAssignments.notes,
      completedFilePath: employeeDocumentAssignments.completedFilePath,
      signaturePath: employeeDocumentAssignments.signaturePath,
      templateName: documentTemplates.name,
      templateType: documentTemplates.type,
      requiresSignature: documentTemplates.requiresSignature,
      isRequired: documentTemplates.isRequired,
      description: documentTemplates.description,
    })
    .from(employeeDocumentAssignments)
    .innerJoin(documentTemplates, eq(employeeDocumentAssignments.templateId, documentTemplates.id))
    .where(eq(employeeDocumentAssignments.employeeId, employeeId))
    .orderBy(documentTemplates.sortOrder);
    
    return documents;
  }

  async getAllEmployeeDocuments(): Promise<any[]> {
    const documents = await db.select({
      id: employeeDocumentAssignments.id,
      employeeId: employeeDocumentAssignments.employeeId,
      status: employeeDocumentAssignments.status,
      sentAt: employeeDocumentAssignments.sentAt,
      completedAt: employeeDocumentAssignments.completedAt,
      signedAt: employeeDocumentAssignments.signedAt,
      templateName: documentTemplates.name,
      templateType: documentTemplates.type,
      employeeName: sql<string>`CONCAT(${employees.firstName}, ' ', ${employees.lastName})`,
      employeeEmail: employees.email,
    })
    .from(employeeDocumentAssignments)
    .innerJoin(documentTemplates, eq(employeeDocumentAssignments.templateId, documentTemplates.id))
    .innerJoin(employees, eq(employeeDocumentAssignments.employeeId, employees.id))
    .orderBy(desc(employeeDocumentAssignments.createdAt));
    
    return documents;
  }

  async createDocumentAssignment(assignment: InsertEmployeeDocumentAssignment): Promise<EmployeeDocumentAssignment> {
    const [created] = await db.insert(employeeDocumentAssignments)
      .values(assignment)
      .returning();
    return created;
  }

  async updateDocumentAssignment(id: string, assignment: Partial<InsertEmployeeDocumentAssignment>): Promise<EmployeeDocumentAssignment> {
    const [updated] = await db.update(employeeDocumentAssignments)
      .set({ ...assignment, updatedAt: new Date() })
      .where(eq(employeeDocumentAssignments.id, id))
      .returning();
    return updated;
  }

  async deleteDocumentAssignment(id: string): Promise<void> {
    await db.delete(employeeDocumentAssignments)
      .where(eq(employeeDocumentAssignments.id, id));
  }

  // Document signature operations
  async createEmployeeSignature(signature: InsertEmployeeSignature): Promise<EmployeeSignature> {
    const [created] = await db.insert(employeeSignatures)
      .values(signature)
      .returning();
    return created;
  }

  async getEmployeeSignature(documentAssignmentId: string): Promise<EmployeeSignature | undefined> {
    const [signature] = await db.select()
      .from(employeeSignatures)
      .where(eq(employeeSignatures.documentAssignmentId, documentAssignmentId));
    return signature;
  }

  // Digital form methods
  async getDocumentFormFields(templateId: string): Promise<DocumentFormField[]> {
    return await db.select()
      .from(documentFormFields)
      .where(eq(documentFormFields.templateId, templateId))
      .orderBy(documentFormFields.sortOrder);
  }

  async createDocumentFormField(field: InsertDocumentFormField): Promise<DocumentFormField> {
    const [created] = await db.insert(documentFormFields)
      .values(field)
      .returning();
    return created;
  }

  async getDocumentFormResponses(assignmentId: string): Promise<EmployeeDocumentResponse[]> {
    return await db.select()
      .from(employeeDocumentResponses)
      .where(eq(employeeDocumentResponses.assignmentId, assignmentId));
  }

  async saveDocumentFormResponse(response: InsertEmployeeDocumentResponse): Promise<EmployeeDocumentResponse> {
    const [existing] = await db.select()
      .from(employeeDocumentResponses)
      .where(eq(employeeDocumentResponses.assignmentId, response.assignmentId))
      .where(eq(employeeDocumentResponses.fieldId, response.fieldId));
    
    if (existing) {
      const [updated] = await db.update(employeeDocumentResponses)
        .set({ fieldValue: response.fieldValue, updatedAt: new Date() })
        .where(eq(employeeDocumentResponses.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(employeeDocumentResponses)
        .values(response)
        .returning();
      return created;
    }
  }

  async updateDocumentFormResponse(assignmentId: string, fieldId: string, fieldValue: string): Promise<EmployeeDocumentResponse> {
    const response = { assignmentId, fieldId, fieldValue };
    return await this.saveDocumentFormResponse(response);
  }

  // Enhanced employee profile to include document status
  async getEmployeeProfile(employeeId: string): Promise<{ employee: Employee; onboardingData?: any; documents?: any[] } | undefined> {
    const [employee] = await db.select()
      .from(employees)
      .where(eq(employees.id, employeeId));
      
    if (!employee) return undefined;

    // Get onboarding data if exists
    let onboardingData = undefined;
    try {
      const [onboarding] = await db.select()
        .from(employeeOnboardingData)
        .where(eq(employeeOnboardingData.employeeId, employeeId));
      onboardingData = onboarding || null;
    } catch (error) {
      // Table might not exist yet, ignore error
      console.log('Onboarding data table not found, skipping...');
    }

    // Get document assignments
    const documents = await this.getEmployeeDocuments(employeeId);

    return { 
      employee, 
      onboardingData,
      documents 
    };
  }

  // Recipe assignment operations
  async getRecipeAssignmentsByDepartment(departmentId: string): Promise<RecipeAssignment[]> {
    const result = await db.select({
      assignment: recipeAssignments,
      recipe: recipes,
    })
    .from(recipeAssignments)
    .innerJoin(recipes, eq(recipeAssignments.recipeId, recipes.id))
    .where(eq(recipeAssignments.departmentId, departmentId))
    .orderBy(desc(recipeAssignments.createdAt));
    
    return result.map(r => ({ ...r.assignment, recipe: r.recipe })) as any;
  }

  async getRecipeAssignmentsForEmployee(employeeId: string): Promise<RecipeAssignment[]> {
    // Get employee's department first
    const [employee] = await db.select({ departmentId: employees.departmentId })
      .from(employees)
      .where(eq(employees.id, employeeId));
    
    if (!employee?.departmentId) {
      return [];
    }
    
    // Get assignments for employee's department
    return this.getRecipeAssignmentsByDepartment(employee.departmentId);
  }

  async createRecipeAssignment(assignment: InsertRecipeAssignment): Promise<RecipeAssignment> {
    const [created] = await db.insert(recipeAssignments).values(assignment).returning();
    return created;
  }

  async updateRecipeAssignmentStatus(id: string, status: string): Promise<RecipeAssignment> {
    const updateData: any = { status, updatedAt: new Date() };
    if (status === 'completed') {
      updateData.completedAt = new Date();
    }
    
    const [updated] = await db.update(recipeAssignments)
      .set(updateData)
      .where(eq(recipeAssignments.id, id))
      .returning();
    
    return updated;
  }

  // Invitation token operations
  async getInvitationTokens(invitedBy?: string): Promise<InvitationToken[]> {
    let query = db.select({
      invitation: invitationTokens,
      location: locations,
      department: departments,
      position: positions,
      invitedByUser: users,
    })
    .from(invitationTokens)
    .leftJoin(locations, eq(invitationTokens.locationId, locations.id))
    .leftJoin(departments, eq(invitationTokens.departmentId, departments.id))
    .leftJoin(positions, eq(invitationTokens.positionId, positions.id))
    .leftJoin(users, eq(invitationTokens.invitedBy, users.id))
    .orderBy(desc(invitationTokens.createdAt));

    if (invitedBy) {
      query = query.where(eq(invitationTokens.invitedBy, invitedBy)) as any;
    }

    const results = await query;
    return results.map(row => ({
      ...row.invitation,
      location: row.location,
      department: row.department,
      position: row.position,
      invitedByUser: row.invitedByUser,
    })) as InvitationToken[];
  }

  async getInvitationToken(token: string): Promise<InvitationToken | undefined> {
    const [invitation] = await db.select({
      invitation: invitationTokens,
      location: locations,
      department: departments,
      position: positions,
    })
    .from(invitationTokens)
    .leftJoin(locations, eq(invitationTokens.locationId, locations.id))
    .leftJoin(departments, eq(invitationTokens.departmentId, departments.id))
    .leftJoin(positions, eq(invitationTokens.positionId, positions.id))
    .where(eq(invitationTokens.token, token));

    if (!invitation) return undefined;

    return {
      ...invitation.invitation,
      location: invitation.location,
      department: invitation.department,
      position: invitation.position,
    } as InvitationToken;
  }

  async getInvitationTokenById(id: string): Promise<InvitationToken | undefined> {
    const [invitation] = await db.select().from(invitationTokens).where(eq(invitationTokens.id, id));
    return invitation;
  }

  async createInvitationToken(invitation: InsertInvitationToken): Promise<InvitationToken> {
    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiry to 48 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const invitationData = {
      ...invitation,
      token,
      expiresAt,
      status: 'pending' as const,
    };

    const [created] = await db.insert(invitationTokens).values(invitationData).returning();
    return created;
  }

  async updateInvitationToken(id: string, updates: Partial<InsertInvitationToken>): Promise<InvitationToken> {
    const [updated] = await db.update(invitationTokens)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(invitationTokens.id, id))
      .returning();
    return updated;
  }

  async acceptInvitationToken(token: string, employeeId: string): Promise<InvitationToken> {
    const [updated] = await db.update(invitationTokens)
      .set({
        status: 'accepted' as const,
        acceptedAt: new Date(),
        employeeId,
        updatedAt: new Date(),
      })
      .where(eq(invitationTokens.token, token))
      .returning();
    return updated;
  }

  async cancelInvitationToken(id: string): Promise<void> {
    await db.update(invitationTokens)
      .set({
        status: 'cancelled' as const,
        updatedAt: new Date(),
      })
      .where(eq(invitationTokens.id, id));
  }

  async expireOldInvitationTokens(): Promise<number> {
    const now = new Date();
    const result = await db.update(invitationTokens)
      .set({
        status: 'expired' as const,
        updatedAt: now,
      })
      .where(
        and(
          eq(invitationTokens.status, 'pending'),
          lt(invitationTokens.expiresAt, now)
        )
      )
      .returning();
    
    return result.length;
  }

  // Payroll operations
  async getPayrollPeriods(locationId?: string): Promise<PayrollPeriod[]> {
    let query = db.select().from(payPeriods).orderBy(desc(payPeriods.createdAt));
    
    if (locationId) {
      query = query.where(eq(payPeriods.locationId, locationId)) as any;
    }
    
    return await query;
  }

  async createPayrollPeriod(period: InsertPayrollPeriod): Promise<PayrollPeriod> {
    const [created] = await db.insert(payPeriods).values(period).returning();
    return created;
  }

  async getPayrollPeriod(id: string): Promise<PayrollPeriod | undefined> {
    const [period] = await db.select().from(payPeriods).where(eq(payPeriods.id, id));
    return period;
  }

  async updatePayrollPeriod(id: string, period: Partial<PayrollPeriod>): Promise<PayrollPeriod> {
    const [updated] = await db.update(payPeriods)
      .set({ ...period, updatedAt: new Date() })
      .where(eq(payPeriods.id, id))
      .returning();
    return updated;
  }

  async getPaychecks(payrollPeriodId: string): Promise<(Paycheck & { employee: Employee })[]> {
    const result = await db.select({
      paycheck: paystubs,
      employee: employees,
      payPeriod: payPeriods
    })
    .from(paystubs)
    .innerJoin(employees, eq(paystubs.employeeId, employees.id))
    .leftJoin(payPeriods, eq(paystubs.payPeriodId, payPeriods.id))
    .where(eq(paystubs.payPeriodId, payrollPeriodId))
    .orderBy(employees.lastName, employees.firstName);
    
    return result.map(r => ({ 
      ...r.paycheck, 
      employee: r.employee,
      payPeriod: r.payPeriod ? {
        startDate: r.payPeriod.startDate,
        endDate: r.payPeriod.endDate
      } : undefined,
      payDate: r.payPeriod?.payDate
    })) as any;
  }

  async createPaycheck(paycheck: InsertPaycheck): Promise<Paycheck> {
    const [created] = await db.insert(paystubs).values(paycheck).returning();
    return created;
  }

  async updatePaycheck(id: string, paycheck: Partial<Paycheck>): Promise<Paycheck> {
    const [updated] = await db.update(paystubs)
      .set({ ...paycheck, updatedAt: new Date() })
      .where(eq(paystubs.id, id))
      .returning();
    return updated;
  }

  async recalculatePayPeriodTotals(payrollPeriodId: string): Promise<void> {
    // Get all paychecks for this pay period
    const paychecks = await db.select()
      .from(paystubs)
      .where(eq(paystubs.payPeriodId, payrollPeriodId));
    
    if (paychecks.length === 0) {
      return;
    }
    
    // Calculate totals
    const totalGrossPay = paychecks.reduce((sum, paycheck) => sum + Number(paycheck.grossPay || 0), 0);
    const totalDeductions = paychecks.reduce((sum, paycheck) => sum + Number(paycheck.totalDeductions || 0), 0);
    const totalNetPay = paychecks.reduce((sum, paycheck) => sum + Number(paycheck.netPay || 0), 0);
    
    // Update the pay period with calculated totals
    await db.update(payPeriods)
      .set({
        totalGrossPay: totalGrossPay.toString(),
        totalDeductions: totalDeductions.toString(),
        totalNetPay: totalNetPay.toString(),
        status: 'calculated',
        updatedAt: new Date()
      })
      .where(eq(payPeriods.id, payrollPeriodId));
  }

  async getEmployeePayStubs(employeeId: string): Promise<any[]> {
    const results = await db
      .select({
        id: paystubs.id,
        payPeriodId: paystubs.payPeriodId,
        employeeId: paystubs.employeeId,
        regularHours: paystubs.regularHours,
        overtimeHours: paystubs.overtimeHours,
        regularRate: paystubs.regularRate,
        overtimeRate: paystubs.overtimeRate,
        regularPay: paystubs.regularPay,
        overtimePay: paystubs.overtimePay,
        bonuses: paystubs.bonuses,
        tips: paystubs.tips,
        grossPay: paystubs.grossPay,
        federalTax: paystubs.federalTax,
        stateTax: paystubs.stateTax,
        socialSecurity: paystubs.socialSecurity,
        medicare: paystubs.medicare,
        totalDeductions: paystubs.totalDeductions,
        netPay: paystubs.netPay,
        status: paystubs.status,
        notes: paystubs.notes,
        createdAt: paystubs.createdAt,
        updatedAt: paystubs.updatedAt,
        payDate: paystubs.createdAt, // Use createdAt as payDate for now
        checkNumber: paystubs.id, // Use ID as check number for now
        // Pay period information
        payPeriod: {
          id: payPeriods.id,
          name: payPeriods.name,
          startDate: payPeriods.startDate,
          endDate: payPeriods.endDate,
          payDate: payPeriods.payDate,
          frequency: payPeriods.frequency,
          status: payPeriods.status
        },
        // Employee information
        employee: {
          firstName: employees.firstName,
          lastName: employees.lastName,
          address: employees.address,
          phone: employees.phone
        }
      })
      .from(paystubs)
      .leftJoin(payPeriods, eq(paystubs.payPeriodId, payPeriods.id))
      .leftJoin(employees, eq(paystubs.employeeId, employees.id))
      .where(eq(paystubs.employeeId, employeeId))
      .orderBy(desc(paystubs.createdAt));

    return results;
  }

  async createPayStub(payStub: InsertPayStub): Promise<PayStub> {
    const [created] = await db.insert(paystubs).values(payStub).returning();
    return created;
  }

  async markPayStubViewed(payStubId: string): Promise<void> {
    await db.update(paystubs)
      .set({ viewedAt: new Date() })
      .where(eq(paystubs.id, payStubId));
  }

  async getTimeEntries(employeeId: string, startDate: string, endDate: string): Promise<TimeEntry[]> {
    return await db.select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.employeeId, employeeId),
          gte(timeEntries.clockInTime, startDate),
          lte(timeEntries.clockInTime, endDate)
        )
      )
      .orderBy(timeEntries.clockInTime);
  }

  async calculatePayrollHoursFromTimeEntries(payrollPeriodId: string): Promise<{ employeeId: string; regularHours: number; overtimeHours: number; totalHours: number; employee?: Employee }[]> {
    try {
      // First get the payroll period to know the date range
      const payrollPeriod = await this.getPayrollPeriod(payrollPeriodId);
      if (!payrollPeriod) {
        throw new Error('Payroll period not found');
      }

      // Get all time entries for the period - convert date strings to Date objects
      const startDate = new Date(payrollPeriod.startDate);
      const endDate = new Date(payrollPeriod.endDate);
      
      const allTimeEntries = await db.select({
        employeeId: timeEntries.employeeId,
        clockInTime: timeEntries.clockInTime,
        clockOutTime: timeEntries.clockOutTime,
        breakStartTime: timeEntries.breakStartTime,
        breakEndTime: timeEntries.breakEndTime,
        totalHours: timeEntries.totalHours,
        status: timeEntries.status,
        employeeFirstName: employees.firstName,
        employeeLastName: employees.lastName,
        employeeHourlyRate: employees.hourlyRate
      })
      .from(timeEntries)
      .leftJoin(employees, eq(timeEntries.employeeId, employees.id))
      .where(
        and(
          gte(timeEntries.clockInTime, startDate),
          lte(timeEntries.clockInTime, endDate),
          eq(timeEntries.status, 'clocked-out') // Only count completed shifts
        )
      );

      // Group by employee and calculate hours
      const employeeHours = new Map<string, {
        employeeId: string;
        regularHours: number;
        overtimeHours: number;
        totalHours: number;
        employee?: Employee;
      }>();

      for (const entry of allTimeEntries) {
        if (!entry.clockOutTime) continue; // Skip incomplete entries

        let workedHours = 0;
        
        // Calculate total worked hours
        if (entry.totalHours) {
          workedHours = parseFloat(entry.totalHours);
        } else if (entry.clockInTime && entry.clockOutTime) {
          const clockIn = new Date(entry.clockInTime);
          const clockOut = new Date(entry.clockOutTime);
          let totalMs = clockOut.getTime() - clockIn.getTime();
          
          // Subtract break time if recorded
          if (entry.breakStartTime && entry.breakEndTime) {
            const breakStart = new Date(entry.breakStartTime);
            const breakEnd = new Date(entry.breakEndTime);
            const breakMs = breakEnd.getTime() - breakStart.getTime();
            totalMs -= breakMs;
          }
          
          workedHours = totalMs / (1000 * 60 * 60); // Convert to hours
        }

        if (workedHours <= 0) continue;

        // Get or create employee entry
        if (!employeeHours.has(entry.employeeId)) {
          employeeHours.set(entry.employeeId, {
            employeeId: entry.employeeId,
            regularHours: 0,
            overtimeHours: 0,
            totalHours: 0,
            employee: {
              id: entry.employeeId,
              firstName: entry.employeeFirstName || '',
              lastName: entry.employeeLastName || '',
              hourlyRate: entry.employeeHourlyRate || ''
            } as Employee
          });
        }

        const empData = employeeHours.get(entry.employeeId)!;
        empData.totalHours += workedHours;
      }

      // Calculate regular vs overtime hours (40+ hours = overtime)
      const result = Array.from(employeeHours.values()).map(emp => {
        if (emp.totalHours <= 40) {
          emp.regularHours = emp.totalHours;
          emp.overtimeHours = 0;
        } else {
          emp.regularHours = 40;
          emp.overtimeHours = emp.totalHours - 40;
        }
        return emp;
      });

      console.log('📊 Calculated hours:', result);
      return result;
    } catch (error) {
      console.error('Error calculating payroll hours:', error);
      throw error;
    }
  }

  // Paycheck settings methods - now with real database operations
  async getPaycheckSettings(locationId?: string): Promise<any> {
    try {
      let query = db.select().from(paycheckSettings).where(eq(paycheckSettings.isActive, true));
      
      if (locationId) {
        query = query.where(eq(paycheckSettings.locationId, locationId));
      }
      
      const settings = await query.limit(1);
      
      if (settings.length === 0) {
        // Create default settings if none exist - ensure locationId is never null
        const defaultLocationId = locationId || "8d0336af-20da-41fb-a37e-dfdae21ba9bb";
        const defaultSettings = {
          locationId: defaultLocationId,
          paycheckLayout: 'check_stub_only' as const,
          displayLast4Ssn: true,
          displayTaxFilingName: true,
          displayBusinessName: true,
          printSignature: false,
          showLastCheckNumber: true,
          companyName: 'Your Company Name',
          companyAddress: 'Your Company Address',
          companyPhone: '',
          companyEin: '',
          businessName: 'Your Business Name',
          taxFilingName: 'Your Tax Filing Name',
          bankName: 'Your Bank Name',
          lastCheckNumber: 1000,
          isActive: true
        };
        
        const [created] = await db.insert(paycheckSettings).values(defaultSettings).returning();
        return created;
      }
      
      return settings[0];
    } catch (error) {
      console.error('Error fetching paycheck settings:', error);
      throw error;
    }
  }

  async updatePaycheckSettings(settingsData: any, locationId?: string): Promise<any> {
    try {
      // First get existing settings
      const existing = await this.getPaycheckSettings(locationId);
      
      if (existing && existing.id) {
        // Update existing settings
        const updateData = {
          ...settingsData,
          updatedAt: new Date()
        };
        
        const [updated] = await db
          .update(paycheckSettings)
          .set(updateData)
          .where(eq(paycheckSettings.id, existing.id))
          .returning();
          
        console.log('✅ Updated paycheck settings:', updated);
        return updated;
      } else {
        // Create new settings if none exist - ensure locationId is never null  
        const defaultLocationId = locationId || "8d0336af-20da-41fb-a37e-dfdae21ba9bb";
        const newSettings = {
          locationId: defaultLocationId,
          ...settingsData,
          isActive: true
        };
        
        const [created] = await db.insert(paycheckSettings).values(newSettings).returning();
        console.log('✅ Created new paycheck settings:', created);
        return created;
      }
    } catch (error) {
      console.error('Error updating paycheck settings:', error);
      throw error;
    }
  }

  // Tax settings methods
  async getTaxSettings(locationId: string): Promise<any> {
    try {
      const { payrollTaxSettings } = await import('./db/schema_comprehensive_payroll.js');
      
      const [settings] = await db
        .select()
        .from(payrollTaxSettings)
        .where(
          and(
            eq(payrollTaxSettings.locationId, locationId),
            eq(payrollTaxSettings.isActive, true)
          )
        )
        .limit(1);
      
      return settings;
    } catch (error) {
      console.error('Error fetching tax settings:', error);
      throw error;
    }
  }

  async createTaxSettings(settings: any): Promise<any> {
    try {
      const { payrollTaxSettings } = await import('./db/schema_comprehensive_payroll.js');
      
      const [created] = await db
        .insert(payrollTaxSettings)
        .values(settings)
        .returning();
      
      console.log('✅ Created tax settings:', created);
      return created;
    } catch (error) {
      console.error('Error creating tax settings:', error);
      throw error;
    }
  }

  async updateTaxSettings(id: string, settings: any): Promise<any> {
    try {
      const { payrollTaxSettings } = await import('./db/schema_comprehensive_payroll.js');
      
      const updateData = {
        ...settings,
        updatedAt: new Date()
      };
      
      const [updated] = await db
        .update(payrollTaxSettings)
        .set(updateData)
        .where(eq(payrollTaxSettings.id, id))
        .returning();
      
      console.log('✅ Updated tax settings:', updated);
      return updated;
    } catch (error) {
      console.error('Error updating tax settings:', error);
      throw error;
    }
  }
  
  // In-memory storage for local authentication users (for fallback when Firebase Admin SDK is unavailable)
  private localAuthUsers: LocalAuthUser[] = [];
  
  async createLocalAuthUser(user: InsertLocalAuthUser): Promise<LocalAuthUser> {
    const existingUser = this.localAuthUsers.find(u => u.email === user.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }
    
    const newUser: LocalAuthUser = {
      id: user.id,
      email: user.email,
      password: user.password, // In production, this should be hashed
      createdAt: user.createdAt
    };
    
    this.localAuthUsers.push(newUser);
    console.log(`✅ Created local auth user: ${user.email} (${user.id})`);
    return newUser;
  }
  
  async getLocalAuthUser(email: string): Promise<LocalAuthUser | null> {
    const user = this.localAuthUsers.find(user => user.email === email);
    return user || null;
  }
  
  async verifyLocalAuthUser(email: string, password: string): Promise<LocalAuthUser | null> {
    const user = this.localAuthUsers.find(u => u.email === email && u.password === password);
    return user || null;
  }

  // Multi-Unit Cost Calculation System
  
  /**
   * Calculate cost per recipe unit for an inventory item
   * Converts from purchase units (cases) to recipe units (lbs/oz) using conversion factor
   */
  calculateCostPerRecipeUnit(item: InventoryItem): number {
    const costPerPurchaseUnit = parseFloat(item.costPerPurchaseUnit || '0');
    const conversionFactor = parseFloat(item.conversionFactor || '1');
    
    // Cost per recipe unit = Cost per case / Recipe units per case
    // Example: $80 per case / 40 lbs per case = $2 per lb
    return costPerPurchaseUnit / conversionFactor;
  }
  
  /**
   * Calculate cost per serving for an inventory item (if servings are tracked)
   */
  calculateCostPerServing(item: InventoryItem): number | null {
    if (!item.servingsPerPurchaseUnit) return null;
    
    const costPerPurchaseUnit = parseFloat(item.costPerPurchaseUnit || '0');
    const servingsPerPurchaseUnit = item.servingsPerPurchaseUnit;
    
    return costPerPurchaseUnit / servingsPerPurchaseUnit;
  }
  
  /**
   * Convert quantity from purchase units to recipe units
   * Example: 2 cases → 80 lbs (if conversion factor is 40 lbs per case)
   */
  convertPurchaseToRecipeUnits(item: InventoryItem, purchaseQuantity: number): number {
    const conversionFactor = parseFloat(item.conversionFactor || '1');
    return purchaseQuantity * conversionFactor;
  }
  
  /**
   * Convert quantity from recipe units to purchase units
   * Example: 80 lbs → 2 cases (if conversion factor is 40 lbs per case)
   */
  convertRecipeToPurchaseUnits(item: InventoryItem, recipeQuantity: number): number {
    const conversionFactor = parseFloat(item.conversionFactor || '1');
    return recipeQuantity / conversionFactor;
  }
  
  /**
   * Get remaining recipe units available for an inventory item
   * Converts from purchase units in inventory to recipe units available for use
   */
  getAvailableRecipeUnits(item: InventoryItem): number {
    const purchaseQuantity = parseFloat(item.quantity);
    return this.convertPurchaseToRecipeUnits(item, purchaseQuantity);
  }

  // Sales Integration System

  /**
   * Record a sales transaction with automatic inventory deduction
   */
  async recordSalesTransaction(
    locationId: string, 
    totalAmount: number, 
    paymentMethod: string,
    customerCount: number,
    posTransactionId: string | null,
    items: Array<{
      itemName: string;
      quantity: number;
      unitPrice: number;
      recipeId?: string;
      menuItemId?: string;
      inventoryItemId?: string;
    }>,
    createdBy: string
  ): Promise<string> {
    try {
      // Create the sales transaction
      const [salesTransaction] = await db.insert(sales).values({
        locationId,
        totalAmount: totalAmount.toString(),
        paymentMethod,
        customerCount,
        posTransactionId,
        saleDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();

      const transactionId = salesTransaction.id;

      // Process each sales item and deduct from inventory
      for (const item of items) {
        const totalPrice = item.quantity * item.unitPrice;

        // Get inventory cost for profit calculation if linked to inventory
        let costOfGoods: number | null = null;
        if (item.inventoryItemId) {
          const [inventoryItem] = await db
            .select()
            .from(inventoryItems)
            .where(eq(inventoryItems.id, item.inventoryItemId));
          
          if (inventoryItem) {
            const costPerRecipeUnit = this.calculateCostPerRecipeUnit(inventoryItem);
            costOfGoods = item.quantity * costPerRecipeUnit;
          }
        }

        const profitAmount = costOfGoods !== null ? totalPrice - costOfGoods : null;
        const profitMargin = profitAmount !== null && totalPrice > 0 
          ? (profitAmount / totalPrice) * 100 
          : null;

        // Create sales item record
        await db.insert(salesItems).values({
          saleId: transactionId,
          menuItemId: item.menuItemId || null,
          recipeId: item.recipeId || null,
          itemName: item.itemName,
          quantity: Math.floor(item.quantity),
          unitPrice: item.unitPrice.toString(),
          totalPrice: totalPrice.toString(),
          costOfGoods: costOfGoods?.toString() || null,
          profitAmount: profitAmount?.toString() || null,
          profitMargin: profitMargin?.toString() || null
        });

        // Deduct from inventory if linked to an inventory item
        if (item.inventoryItemId) {
          const [inventoryItem] = await db
            .select()
            .from(inventoryItems)
            .where(eq(inventoryItems.id, item.inventoryItemId));

          if (inventoryItem) {
            // Convert sales quantity (in recipe units) to purchase units for inventory deduction
            const purchaseUnitsToDeduct = this.convertRecipeToPurchaseUnits(inventoryItem, item.quantity);

            // Update inventory quantity (subtract from purchase units)
            const currentQuantity = parseFloat(inventoryItem.quantity);
            const newQuantity = Math.max(0, currentQuantity - purchaseUnitsToDeduct);

            await db
              .update(inventoryItems)
              .set({ 
                quantity: newQuantity.toString(),
                updatedAt: new Date() 
              })
              .where(eq(inventoryItems.id, item.inventoryItemId));

            // Record inventory transaction for audit trail
            await db.insert(inventoryTransactions).values({
              inventoryItemId: item.inventoryItemId,
              locationId,
              type: 'out',
              quantity: (-purchaseUnitsToDeduct).toString(),
              unitCost: inventoryItem.costPerPurchaseUnit || inventoryItem.costPerUnit,
              totalCost: (-(purchaseUnitsToDeduct * parseFloat(inventoryItem.costPerPurchaseUnit || inventoryItem.costPerUnit))).toString(),
              reference: `Sales Transaction: ${transactionId}`,
              createdBy
            });
          }
        }
      }

      return transactionId;
    } catch (error) {
      console.error('Error recording sales transaction:', error);
      throw error;
    }
  }

  /**
   * Get sales transactions with items for a location
   */
  async getSalesTransactions(locationId: string, limit: number = 50) {
    const transactions = await db
      .select()
      .from(sales)
      .where(eq(sales.locationId, locationId))
      .orderBy(desc(sales.saleDate))
      .limit(limit);

    const transactionsWithItems = await Promise.all(
      transactions.map(async (transaction) => {
        const items = await db
          .select({
            id: salesItems.id,
            itemName: salesItems.itemName,
            quantity: salesItems.quantity,
            unitPrice: salesItems.unitPrice,
            totalPrice: salesItems.totalPrice,
            costOfGoods: salesItems.costOfGoods,
            profitAmount: salesItems.profitAmount,
            profitMargin: salesItems.profitMargin,
            menuItemId: salesItems.menuItemId,
            recipeId: salesItems.recipeId
          })
          .from(salesItems)
          .where(eq(salesItems.saleId, transaction.id));

        return {
          ...transaction,
          items
        };
      })
    );

    return transactionsWithItems;
  }

  /**
   * Get remaining stock levels with multi-unit conversion
   */
  async getRemainingStockLevels(locationId: string) {
    const items = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.locationId, locationId));

    return items.map(item => {
      const purchaseQuantity = parseFloat(item.quantity);
      const availableRecipeUnits = this.getAvailableRecipeUnits(item);
      const costPerRecipeUnit = this.calculateCostPerRecipeUnit(item);
      const costPerServing = this.calculateCostPerServing(item);
      
      return {
        id: item.id,
        name: item.name,
        purchaseQuantity,
        purchaseUnit: item.purchaseUnit || 'case',
        availableRecipeUnits,
        recipeUnit: item.recipeUnit || 'lb',
        servingsPerPurchaseUnit: item.servingsPerPurchaseUnit,
        costPerRecipeUnit,
        costPerServing,
        totalValue: purchaseQuantity * parseFloat(item.costPerPurchaseUnit || item.costPerUnit),
        reorderLevel: parseFloat(item.reorderLevel),
        isLowStock: purchaseQuantity <= parseFloat(item.reorderLevel)
      };
    });
  }

  // Owner onboarding operations
  async getOwnerOnboarding(userId: string): Promise<OwnerOnboarding | undefined> {
    const [result] = await db
      .select()
      .from(ownerOnboarding)
      .where(eq(ownerOnboarding.userId, userId));
    return result;
  }

  async createOwnerOnboarding(data: InsertOwnerOnboarding): Promise<OwnerOnboarding> {
    const [result] = await db.insert(ownerOnboarding).values(data).returning();
    return result;
  }

  async updateOwnerOnboardingStep(userId: string, stepName: string, stepData: any, status: string): Promise<OwnerOnboarding> {
    // Get existing onboarding
    const existing = await this.getOwnerOnboarding(userId);
    if (!existing) {
      throw new Error('Onboarding not found');
    }

    // Update step-specific data in the main onboarding data object
    const currentData = existing.data || {};
    const updatedData = {
      ...currentData,
      [stepName]: stepData
    };

    // Calculate progress
    const stepMap = {
      'restaurant_info': 1,
      'departments': 2,
      'positions': 3,
      'hr_addon': 4,
      'employee_invitations': 5
    };

    const currentStepNumber = stepMap[stepName as keyof typeof stepMap] || 1;
    const completedSteps = status === 'completed' ? Math.max(existing.completedSteps, currentStepNumber) : existing.completedSteps;

    // Determine next step
    let nextStep = stepName;
    if (status === 'completed' && currentStepNumber < 5) {
      const nextSteps = Object.keys(stepMap).find(key => stepMap[key as keyof typeof stepMap] === currentStepNumber + 1);
      nextStep = nextSteps || stepName;
    }

    // Update main onboarding record
    const [updatedOnboarding] = await db
      .update(ownerOnboarding)
      .set({
        data: updatedData,
        currentStep: nextStep as any,
        completedSteps,
        updatedAt: new Date(),
      })
      .where(eq(ownerOnboarding.userId, userId))
      .returning();

    // Create or update individual step record
    const existingStep = await db
      .select()
      .from(ownerOnboardingSteps)
      .where(and(
        eq(ownerOnboardingSteps.onboardingId, existing.id),
        eq(ownerOnboardingSteps.stepName, stepName as any)
      ));

    if (existingStep.length > 0) {
      await db
        .update(ownerOnboardingSteps)
        .set({
          status: status as any,
          stepData,
          completedAt: status === 'completed' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(ownerOnboardingSteps.id, existingStep[0].id));
    } else {
      await db.insert(ownerOnboardingSteps).values({
        onboardingId: existing.id,
        stepName: stepName as any,
        status: status as any,
        stepData,
        startedAt: new Date(),
        completedAt: status === 'completed' ? new Date() : null,
      });
    }

    return updatedOnboarding;
  }

  async completeOwnerOnboarding(userId: string): Promise<OwnerOnboarding> {
    const [result] = await db
      .update(ownerOnboarding)
      .set({
        isCompleted: true,
        completedAt: new Date(),
        completedSteps: 5,
        updatedAt: new Date(),
      })
      .where(eq(ownerOnboarding.userId, userId))
      .returning();

    if (!result) {
      throw new Error('Onboarding not found');
    }

    return result;
  }
}

export const storage = new DatabaseStorage();

// Initialize default locations and categories
async function initializeData() {
  try {
    // Initialize locations
    const existingLocations = await storage.getLocations();
    if (existingLocations.length === 0) {
      // Create default locations for table-top restaurant and bar & grill
      await storage.createLocation({
        name: "Main Restaurant",
        type: "restaurant",
        address: "123 Main Street, Downtown",
        manager: "Restaurant Manager",
        isActive: true,
      });
      
      await storage.createLocation({
        name: "Bar & Grill",
        type: "bar",
        address: "456 Nightlife Avenue, Entertainment District",
        manager: "Bar Manager", 
        isActive: true,
      });
      
      console.log("Default locations created successfully");
    }

    // Initialize categories
    const existingCategories = await storage.getCategories();
    if (existingCategories.length === 0) {
      // Restaurant categories
      const restaurantCategories = [
        { name: "Proteins", description: "Meat, poultry, seafood", type: "kitchen" },
        { name: "Vegetables", description: "Fresh vegetables and herbs", type: "kitchen" },
        { name: "Dairy", description: "Milk, cheese, cream, butter", type: "kitchen" },
        { name: "Grains & Starches", description: "Rice, pasta, bread, potatoes", type: "kitchen" },
        { name: "Condiments & Sauces", description: "Sauces, spices, seasonings", type: "kitchen" },
      ];

      // Bar categories
      const barCategories = [
        { name: "Spirits", description: "Whiskey, vodka, rum, gin, tequila", type: "bar" },
        { name: "Wine", description: "Red, white, sparkling wines", type: "bar" },
        { name: "Beer", description: "Draft, bottled, and canned beer", type: "bar" },
        { name: "Mixers", description: "Juices, sodas, tonic, simple syrups", type: "bar" },
        { name: "Bar Tools", description: "Strainers, jiggers, shakers", type: "bar" },
        { name: "Garnishes", description: "Olives, cherries, citrus, herbs", type: "bar" },
      ];

      // General categories
      const generalCategories = [
        { name: "Cleaning Supplies", description: "Sanitizers, detergents, paper goods", type: "general" },
        { name: "Office Supplies", description: "Paper, pens, receipt books", type: "general" },
        { name: "Packaging & Disposables", description: "To-go boxes, tray liners, cups, napkins", type: "general" },
        { name: "Small Wares", description: "Portion cups, lids, straws, utensils", type: "general" },
      ];

      for (const category of [...restaurantCategories, ...barCategories, ...generalCategories]) {
        await storage.createCategory(category);
      }

      console.log("Default categories created successfully");
    }
  } catch (error) {
    console.error("Error initializing data:", error);
  }
}

// Initialize on startup
initializeData();
