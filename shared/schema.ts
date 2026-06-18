import { sql, relations } from 'drizzle-orm';
import {
  index,
  uniqueIndex,
  jsonb,
  pgTable,
  timestamp,
  date,
  varchar,
  text,
  decimal,
  integer,
  pgEnum,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Locations table
export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // restaurant, bar, cafe, etc.
  address: text("address"),
  phone: varchar("phone"),
  manager: varchar("manager"),
  isActive: boolean("is_active").default(true),
  hrAddonEnabled: boolean("hr_addon_enabled").default(false), // HR add-on subscription status
  ownerId: varchar("owner_id"), // user ID of the owner — enforces cross-tenant isolation
  createdAt: timestamp("created_at").defaultNow(),
});

// Subscription plans enum
export const subscriptionPlanEnum = pgEnum("subscription_plan", ["free", "core", "enterprise"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "inactive", "cancelled", "paused", "past_due"]);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("employee"), // owner, gm, foh_manager, boh_manager, team_lead, employee
  defaultLocationId: uuid("default_location_id").references(() => locations.id),
  // Subscription fields
  subscriptionPlan: subscriptionPlanEnum("subscription_plan").default("free"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("inactive"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  ocrCreditsUsed: integer("ocr_credits_used").default(0),
  ocrCreditsLimit: integer("ocr_credits_limit").default(5), // Free tier gets 5 OCR processes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Categories for inventory items
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).default("general"), // general, bar, kitchen, cleaning, etc.
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }), // null = global/shared across all locations
  createdAt: timestamp("created_at").defaultNow(),
});

// Vendors
export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  contactPerson: varchar("contact_person", { length: 100 }),
  email: varchar("email"),
  phone: varchar("phone"),
  address: text("address"),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Vendor Price Catalog - tracks multiple vendor prices for the same item
export const vendorPriceCatalog = pgTable("vendor_price_catalog", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id).notNull(),
  vendorId: uuid("vendor_id").references(() => vendors.id).notNull(),
  
  // Legacy fields (backward compatibility)
  costPerUnit: decimal("cost_per_unit", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  
  // Enhanced pack size tracking
  caseCost: decimal("case_cost", { precision: 10, scale: 2 }), // Full case/purchase unit price
  purchaseUom: varchar("purchase_uom", { length: 20 }), // CS, BX, BG, EA, etc.
  packQty: integer("pack_qty"), // Number of inner items (24 in "24x12 oz")
  innerSize: decimal("inner_size", { precision: 10, scale: 4 }), // Size of each inner item (12 in "24x12 oz")
  innerUnit: varchar("inner_unit", { length: 20 }), // Unit of inner item (oz in "24x12 oz")
  perPieceCost: decimal("per_piece_cost", { precision: 10, scale: 4 }), // Cost per individual piece
  perBaseUnitCost: decimal("per_base_unit_cost", { precision: 10, scale: 6 }), // Cost per oz/lb/etc
  totalBaseUnits: decimal("total_base_units", { precision: 10, scale: 4 }), // Total oz/lb per case
  
  // Vendor product identifiers
  vendorSku: varchar("vendor_sku", { length: 100 }), // Vendor's product number
  packSizeRaw: varchar("pack_size_raw", { length: 100 }), // Original pack size string from vendor
  
  minimumOrderQuantity: decimal("minimum_order_quantity", { precision: 10, scale: 2 }).default("1"),
  leadTimeDays: integer("lead_time_days").default(0),
  isPreferredVendor: boolean("is_preferred_vendor").default(false),
  notes: text("notes"),
  effectiveDate: timestamp("effective_date").defaultNow(),
  expiryDate: timestamp("expiry_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Price Import History - tracks CSV/email imports and processing results
export const priceImports = pgTable("price_imports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: uuid("vendor_id").references(() => vendors.id).notNull(),
  importedBy: varchar("imported_by").references(() => users.id).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: integer("file_size").notNull(),
  importType: varchar("import_type", { length: 20 }).notNull(), // csv, excel, email
  status: varchar("status", { length: 20 }).default("processing"), // processing, completed, failed
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  matchedItems: integer("matched_items").default(0),
  newItems: integer("new_items").default(0),
  priceUpdates: integer("price_updates").default(0),
  errorLog: text("error_log"),
  processingStarted: timestamp("processing_started").defaultNow(),
  processingCompleted: timestamp("processing_completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Inventory items
export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  displayName: varchar("display_name", { length: 100 }), // Simple name for team use (e.g., "Chicken" instead of full vendor product name)
  description: text("description"),
  categoryId: uuid("category_id").references(() => categories.id),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("0"),
  
  // Multi-unit inventory tracking
  purchaseUnit: varchar("purchase_unit", { length: 20 }).notNull().default("case"), // Unit for ordering/inventory (case, box, bag)
  recipeUnit: varchar("recipe_unit", { length: 20 }).notNull().default("lbs"), // Unit for recipes (lbs, oz, cups)
  conversionFactor: decimal("conversion_factor", { precision: 10, scale: 4 }).notNull().default("1"), // Recipe units per purchase unit (40 lbs per case)
  
  // Cost calculations
  costPerPurchaseUnit: decimal("cost_per_purchase_unit", { precision: 10, scale: 2 }).notNull().default("0"), // Cost per case
  servingsPerPurchaseUnit: integer("servings_per_purchase_unit"), // How many servings per case (optional)
  
  // Legacy fields (backward compatibility)
  unit: varchar("unit", { length: 20 }).notNull().default("each"), // lbs, kg, L, pieces, bottles, cases, etc.
  costPerUnit: decimal("cost_per_unit", { precision: 10, scale: 2 }).notNull().default("0"),
  
  reorderLevel: decimal("reorder_level", { precision: 10, scale: 2 }).notNull().default("0"),
  vendorId: uuid("vendor_id").references(() => vendors.id),
  barcode: varchar("barcode"),
  // Bar-specific fields
  alcoholContent: decimal("alcohol_content", { precision: 5, scale: 2 }), // ABV percentage
  isAlcoholic: boolean("is_alcoholic").default(false),
  bottleSize: varchar("bottle_size"), // 750ml, 1L, etc.
  
  // Normalized unit prices for universal recipe costing
  packSize: varchar("pack_size", { length: 100 }), // e.g., "40 LB", "1/5 GA", "2000 CT"
  caseQuantity: decimal("case_quantity", { precision: 10, scale: 4 }), // numeric part of pack (e.g., 40, 5, 2000)
  casePrice: decimal("case_price", { precision: 10, scale: 2 }), // price per case/pack
  pricePerLb: decimal("price_per_lb", { precision: 10, scale: 6 }),
  pricePerGa: decimal("price_per_ga", { precision: 10, scale: 6 }),
  pricePerOz: decimal("price_per_oz", { precision: 10, scale: 6 }),
  pricePerInnerUnit: decimal("price_per_inner_unit", { precision: 10, scale: 6 }),
  innerUnit: varchar("inner_unit", { length: 20 }), // CT/EA/OZ/LB/GA (from pack size)
  
  // Conversion layer for recipe costing
  piecesPerLb: decimal("pieces_per_lb", { precision: 10, scale: 4 }), // shrimp 16/20 ~ 18, wings 5–8 ~ 6.5
  ozPerPiece: decimal("oz_per_piece", { precision: 10, scale: 4 }), // patties/tenders, e.g., 6 oz
  ozPerCup: decimal("oz_per_cup", { precision: 10, scale: 4 }), // default 8 if not set (water-like sauces)
  cupsPerGa: decimal("cups_per_ga", { precision: 10, scale: 4 }), // default 16 if not set
  piecesPerCase: decimal("pieces_per_case", { precision: 10, scale: 4 }), // disposables count if helpful
  yieldPct: decimal("yield_pct", { precision: 5, scale: 2 }), // 0–100 (default 100)
  gradeLow: integer("grade_low"), // for "16/20"
  gradeHigh: integer("grade_high"), // for "16/20"
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Recipes
export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  servingSize: integer("serving_size").notNull().default(1),
  prepTime: integer("prep_time").notNull(), // minutes
  cookTime: integer("cook_time").notNull().default(0), // minutes
  instructions: text("instructions").notNull(),
  sellingPrice: decimal("selling_price", { precision: 10, scale: 2 }),
  imageUrl: varchar("image_url", { length: 500 }), // Path to recipe photo
  
  // Cost analysis fields
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }), // Total ingredient cost for recipe
  costPerServing: decimal("cost_per_serving", { precision: 10, scale: 4 }), // Cost per single serving
  profitMargin: decimal("profit_margin", { precision: 5, scale: 2 }), // Profit margin percentage
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Recipe ingredients (junction table)
export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "cascade" }),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(), // Quantity in recipe units (lbs, oz)
  unit: varchar("unit", { length: 20 }).notNull(), // Recipe unit (lbs, oz, cups, etc.)
  portionCost: decimal("portion_cost", { precision: 10, scale: 4 }), // Calculated cost for this ingredient portion
});

// Bar menu items (cocktails, beers, wines)
export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(), // cocktail, beer, wine, spirit, non-alcoholic
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Menu item ingredients (for cocktails and mixed drinks)
export const menuItemIngredients = pgTable("menu_item_ingredients", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: uuid("menu_item_id").references(() => menuItems.id, { onDelete: "cascade" }),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(), // oz, ml, etc.
  unit: varchar("unit", { length: 20 }).notNull(),
});

// Purchase orders
export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", ["draft", "sent", "confirmed", "delivered", "cancelled"]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
  vendorId: uuid("vendor_id").references(() => vendors.id),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  status: purchaseOrderStatusEnum("status").default("draft"),
  orderDate: timestamp("order_date").defaultNow(),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Purchase order items
export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "cascade" }),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull(),
});

// Waste tracking
export const wasteReasons = pgEnum("waste_reason", ["expired", "spoiled", "damaged", "overproduction", "preparation_error", "other"]);

export const wasteEntries = pgTable("waste_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  reason: wasteReasons("reason").notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  reportedBy: varchar("reported_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Sales tracking - for recording sales and automatic inventory deduction
export const sales = pgTable("sales", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  saleDate: timestamp("sale_date").defaultNow().notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  customerCount: integer("customer_count").default(1),
  paymentMethod: varchar("payment_method", { length: 50 }), // cash, card, mobile, etc.
  posTransactionId: varchar("pos_transaction_id", { length: 100 }), // POS system transaction ID
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Sales items - individual items sold (for inventory deduction and cost analysis)
export const salesItems = pgTable("sales_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  saleId: uuid("sale_id").references(() => sales.id, { onDelete: "cascade" }).notNull(),
  menuItemId: uuid("menu_item_id").references(() => menuItems.id), // For menu items
  recipeId: uuid("recipe_id").references(() => recipes.id), // For recipes
  itemName: varchar("item_name", { length: 200 }).notNull(), // Item name at time of sale
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  costOfGoods: decimal("cost_of_goods", { precision: 10, scale: 4 }), // Calculated ingredient cost
  profitAmount: decimal("profit_amount", { precision: 10, scale: 4 }), // Profit for this item
  profitMargin: decimal("profit_margin", { precision: 5, scale: 2 }), // Profit margin percentage
});

// Inventory transactions
export const transactionTypeEnum = pgEnum("transaction_type", ["in", "out", "adjustment", "production_usage", "recipe_consumption"]);

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  type: transactionTypeEnum("type").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }),
  reference: varchar("reference"), // PO number, recipe name, production batch, etc.
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Recipe Production Tracking - Enterprise level production monitoring
export const recipeProductions = pgTable("recipe_productions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  recipeId: uuid("recipe_id").references(() => recipes.id).notNull(),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  quantityProduced: decimal("quantity_produced", { precision: 10, scale: 2 }).notNull(),
  actualCost: decimal("actual_cost", { precision: 10, scale: 4 }), // Cost when produced
  theoreticalCost: decimal("theoretical_cost", { precision: 10, scale: 4 }), // Cost based on recipe
  variance: decimal("variance", { precision: 10, scale: 4 }), // Actual vs theoretical
  variancePercentage: decimal("variance_percentage", { precision: 5, scale: 2 }),
  batchNumber: varchar("batch_number"),
  producedBy: varchar("produced_by").references(() => users.id),
  productionDate: timestamp("production_date").defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Unit Conversion System for Enterprise Multi-Unit Management
export const unitConversions = pgTable("unit_conversions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id).notNull(),
  fromUnit: varchar("from_unit", { length: 20 }).notNull(), // Purchase unit
  toUnit: varchar("to_unit", { length: 20 }).notNull(), // Usage unit
  conversionFactor: decimal("conversion_factor", { precision: 10, scale: 6 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Variance Analysis - Enterprise reporting for theoretical vs actual
export const varianceAnalysis = pgTable("variance_analysis", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id),
  recipeId: uuid("recipe_id").references(() => recipes.id),
  analysisDate: date("analysis_date").notNull(),
  theoreticalUsage: decimal("theoretical_usage", { precision: 10, scale: 4 }).notNull(),
  actualUsage: decimal("actual_usage", { precision: 10, scale: 4 }).notNull(),
  variance: decimal("variance", { precision: 10, scale: 4 }).notNull(),
  variancePercentage: decimal("variance_percentage", { precision: 5, scale: 2 }).notNull(),
  varianceCost: decimal("variance_cost", { precision: 10, scale: 2 }).notNull(),
  varianceCategory: varchar("variance_category", { length: 50 }), // waste, theft, over_portioning, etc
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Recipe Costing History - Track cost changes over time
export const recipeCostHistory = pgTable("recipe_cost_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  recipeId: uuid("recipe_id").references(() => recipes.id).notNull(),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  totalCost: decimal("total_cost", { precision: 10, scale: 4 }).notNull(),
  costPerServing: decimal("cost_per_serving", { precision: 10, scale: 4 }).notNull(),
  margins: decimal("margin_percentage", { precision: 5, scale: 2 }),
  effectiveDate: timestamp("effective_date").defaultNow(),
  ingredientSnapshot: text("ingredient_snapshot"), // Store ingredient costs JSON at this time
  createdAt: timestamp("created_at").defaultNow(),
});

// Inventory Valuation Methods - FIFO, LIFO, Weighted Average
export const inventoryValuations = pgTable("inventory_valuations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id).notNull(),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  valuationDate: date("valuation_date").notNull(),
  fifoValue: decimal("fifo_value", { precision: 12, scale: 2 }),
  lifoValue: decimal("lifo_value", { precision: 12, scale: 2 }),
  weightedAvgValue: decimal("weighted_avg_value", { precision: 12, scale: 2 }),
  currentQuantity: decimal("current_quantity", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});


// Relations
export const locationsRelations = relations(locations, ({ many }) => ({
  users: many(users),
  vendors: many(vendors),
  inventoryItems: many(inventoryItems),
  menuItems: many(menuItems),
  purchaseOrders: many(purchaseOrders),
  wasteEntries: many(wasteEntries),
  inventoryTransactions: many(inventoryTransactions),
}));

export const usersRelations = relations(users, ({ one }) => ({
  defaultLocation: one(locations, {
    fields: [users.defaultLocationId],
    references: [locations.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  inventoryItems: many(inventoryItems),
}));

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  location: one(locations, {
    fields: [vendors.locationId],
    references: [locations.id],
  }),
  inventoryItems: many(inventoryItems),
  purchaseOrders: many(purchaseOrders),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  category: one(categories, {
    fields: [inventoryItems.categoryId],
    references: [categories.id],
  }),
  vendor: one(vendors, {
    fields: [inventoryItems.vendorId],
    references: [vendors.id],
  }),
  location: one(locations, {
    fields: [inventoryItems.locationId],
    references: [locations.id],
  }),
  recipeIngredients: many(recipeIngredients),
  menuItemIngredients: many(menuItemIngredients),
  purchaseOrderItems: many(purchaseOrderItems),
  wasteEntries: many(wasteEntries),
  transactions: many(inventoryTransactions),
  unitConversions: many(unitConversions),
  varianceAnalysis: many(varianceAnalysis),
  valuations: many(inventoryValuations),
}));

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  location: one(locations, {
    fields: [menuItems.locationId],
    references: [locations.id],
  }),
  ingredients: many(menuItemIngredients),
}));

export const menuItemIngredientsRelations = relations(menuItemIngredients, ({ one }) => ({
  menuItem: one(menuItems, {
    fields: [menuItemIngredients.menuItemId],
    references: [menuItems.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [menuItemIngredients.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  location: one(locations, {
    fields: [recipes.locationId],
    references: [locations.id],
  }),
  ingredients: many(recipeIngredients),
  productions: many(recipeProductions),
  costHistory: many(recipeCostHistory),
  varianceAnalysis: many(varianceAnalysis),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeIngredients.recipeId],
    references: [recipes.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [recipeIngredients.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [purchaseOrders.vendorId],
    references: [vendors.id],
  }),
  location: one(locations, {
    fields: [purchaseOrders.locationId],
    references: [locations.id],
  }),
  creator: one(users, {
    fields: [purchaseOrders.createdBy],
    references: [users.id],
  }),
  items: many(purchaseOrderItems),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [purchaseOrderItems.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));

export const wasteEntriesRelations = relations(wasteEntries, ({ one }) => ({
  inventoryItem: one(inventoryItems, {
    fields: [wasteEntries.inventoryItemId],
    references: [inventoryItems.id],
  }),
  location: one(locations, {
    fields: [wasteEntries.locationId],
    references: [locations.id],
  }),
  reporter: one(users, {
    fields: [wasteEntries.reportedBy],
    references: [users.id],
  }),
}));

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one }) => ({
  inventoryItem: one(inventoryItems, {
    fields: [inventoryTransactions.inventoryItemId],
    references: [inventoryItems.id],
  }),
  location: one(locations, {
    fields: [inventoryTransactions.locationId],
    references: [locations.id],
  }),
  creator: one(users, {
    fields: [inventoryTransactions.createdBy],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, createdAt: true });
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true });
export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRecipeSchema = createInsertSchema(recipes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRecipeIngredientSchema = createInsertSchema(recipeIngredients).omit({ id: true });
export const insertRecipeProductionSchema = createInsertSchema(recipeProductions).omit({ id: true, createdAt: true });
export const insertUnitConversionSchema = createInsertSchema(unitConversions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVarianceAnalysisSchema = createInsertSchema(varianceAnalysis).omit({ id: true, createdAt: true });
export const insertRecipeCostHistorySchema = createInsertSchema(recipeCostHistory).omit({ id: true, createdAt: true });
export const insertInventoryValuationSchema = createInsertSchema(inventoryValuations).omit({ id: true, createdAt: true });
export const insertMenuItemSchema = createInsertSchema(menuItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMenuItemIngredientSchema = createInsertSchema(menuItemIngredients).omit({ id: true });
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({ id: true });
export const insertWasteEntrySchema = createInsertSchema(wasteEntries).omit({ id: true, createdAt: true });
export const insertSaleSchema = createInsertSchema(sales).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSalesItemSchema = createInsertSchema(salesItems).omit({ id: true });
export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactions).omit({ id: true, createdAt: true });

// HR Enums (needed for tables)
export const employeeStatusEnum = pgEnum("employee_status", ["active", "inactive", "terminated", "on-leave"]);
export const shiftStatusEnum = pgEnum("shift_status", ["scheduled", "confirmed", "completed", "no-show", "cancelled"]);
export const timeOffTypeEnum = pgEnum("time_off_type", ["vacation", "sick", "personal", "bereavement", "other"]);
export const timeOffStatusEnum = pgEnum("time_off_status", ["pending", "approved", "denied", "cancelled"]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "in-progress", "completed", "cancelled", "overdue"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);
export const taskCategoryEnum = pgEnum("task_category", ["cleaning", "inventory", "maintenance", "training", "admin", "other"]);
export const budgetCategoryEnum = pgEnum("budget_category", ["food", "beverage", "labor", "utilities", "marketing", "maintenance", "supplies", "other"]);
export const budgetPeriodEnum = pgEnum("budget_period", ["weekly", "monthly", "quarterly", "yearly"]);
export const messageTypeEnum = pgEnum("message_type", ["message", "announcement", "alert", "reminder"]);
export const messagePriorityEnum = pgEnum("message_priority", ["normal", "high", "urgent"]);
export const reviewStatusEnum = pgEnum("review_status", ["draft", "pending-employee", "completed", "archived"]);
export const timeEntryStatusEnum = pgEnum("time_entry_status", ["clocked-in", "on-break", "clocked-out"]);

// Employee document and onboarding enums
export const documentTypeEnum = pgEnum("document_type", [
  "identification", "tax-forms", "emergency-contact", "bank-info", 
  "employment-agreement", "handbook", "training-certificate", 
  "performance-review", "disciplinary-action", "other"
]);
export const documentStatusEnum = pgEnum("document_status", ["required", "uploaded", "approved", "rejected", "expired"]);
export const onboardingStepStatusEnum = pgEnum("onboarding_step_status", ["pending", "in-progress", "completed", "skipped"]);
export const onboardingStatusEnum = pgEnum("onboarding_status", ["not-started", "in-progress", "completed", "overdue"]);

// Employee Management Tables (HR Add-on)
// Departments and organizational structure
export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  managerId: uuid("manager_id"), // Will reference employees table
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Job positions and roles
export const positions = pgTable("positions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 100 }).notNull(),
  description: text("description"),
  departmentId: uuid("department_id").references(() => departments.id).notNull(),
  hourlyRateMin: decimal("hourly_rate_min", { precision: 10, scale: 2 }),
  hourlyRateMax: decimal("hourly_rate_max", { precision: 10, scale: 2 }),
  requirements: text("requirements"),
  responsibilities: text("responsibilities"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee profiles and basic info
export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeNumber: varchar("employee_number", { length: 10 }).unique().notNull(), // Clean, short employee ID for display
  firstName: varchar("first_name", { length: 50 }).notNull(),
  lastName: varchar("last_name", { length: 50 }).notNull(),
  email: varchar("email"),
  phone: varchar("phone", { length: 20 }),
  emergencyContactName: varchar("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone"),
  address: text("address"),
  dateOfBirth: date("date_of_birth"),
  hireDate: date("hire_date").notNull(),
  terminationDate: date("termination_date"),
  status: varchar("status").default("active"),
  locationId: uuid("location_id").references(() => locations.id).notNull(), // Direct location assignment
  departmentId: uuid("department_id").references(() => departments.id),
  positionId: uuid("position_id").references(() => positions.id),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  salary: decimal("salary", { precision: 12, scale: 2 }),
  payFrequency: varchar("pay_frequency").default("biweekly"), // weekly, biweekly, monthly, salary
  profilePhoto: varchar("profile_photo"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee invitation tokens for secure invite system
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "expired", "cancelled"]);

export const invitationTokens = pgTable("invitation_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  token: varchar("token", { length: 64 }).unique().notNull(), // Secure random token
  email: varchar("email", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 50 }),
  lastName: varchar("last_name", { length: 50 }),
  role: varchar("role", { length: 50 }).notNull(), // employee, manager, team_lead, etc.
  
  // Organization linkage
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  positionId: uuid("position_id").references(() => positions.id),
  
  // Employment details
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  salary: decimal("salary", { precision: 12, scale: 2 }),
  startDate: date("start_date"),
  
  // Invitation management
  invitedBy: varchar("invited_by").references(() => users.id).notNull(),
  status: invitationStatusEnum("status").default("pending"),
  expiresAt: timestamp("expires_at").notNull(), // Invitation expiry (48 hours)
  acceptedAt: timestamp("accepted_at"),
  employeeId: uuid("employee_id").references(() => employees.id), // Set when invitation is accepted
  
  // Additional data
  personalMessage: text("personal_message"),
  metadata: jsonb("metadata"), // Store additional invitation data
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee schedules and shifts
export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid("employee_id").references(() => employees.id),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  positionId: uuid("position_id").references(() => positions.id),
  date: date("date").notNull(),
  startTime: varchar("start_time").notNull(), // time format
  endTime: varchar("end_time").notNull(), // time format
  breakDuration: integer("break_duration").default(0), // minutes
  status: varchar("status").default("scheduled"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee availability preferences
export const availability = pgTable("availability", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid("employee_id").references(() => employees.id).notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0-6, Sunday=0
  startTime: varchar("start_time", { length: 8 }).notNull(), // HH:MM:SS format
  endTime: varchar("end_time", { length: 8 }).notNull(),
  isAvailable: boolean("is_available").default(true),
  notes: varchar("notes"),
  effectiveDate: timestamp("effective_date").defaultNow(),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Time-off requests and approvals
export const timeOffRequests = pgTable("time_off_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid("employee_id").references(() => employees.id).notNull(),
  requestType: timeOffTypeEnum("request_type").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  totalHours: decimal("total_hours", { precision: 5, scale: 2 }).notNull(),
  reason: text("reason"),
  status: timeOffStatusEnum("status").default("pending"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvalDate: timestamp("approval_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task assignments and tracking
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
  assignedTo: uuid("assigned_to").references(() => employees.id),
  createdBy: uuid("created_by").references(() => users.id),
  priority: varchar("priority").default("medium"),
  status: varchar("status").default("pending"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task completion tracking and verification
export const taskCompletions = pgTable("task_completions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid("task_id").references(() => tasks.id).notNull(),
  employeeId: uuid("employee_id").references(() => employees.id).notNull(),
  completedAt: timestamp("completed_at").defaultNow(),
  actualHours: decimal("actual_hours", { precision: 5, scale: 2 }),
  notes: text("notes"),
  photos: jsonb("photos"), // array of photo URLs
  verifiedBy: varchar("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  rating: integer("rating"), // 1-5 scale
  createdAt: timestamp("created_at").defaultNow(),
});

// Team messaging and announcements
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }), // null = system-wide broadcast
  senderId: varchar("sender_id").references(() => users.id), // Changed from uuid to varchar to match users.id
  recipientType: varchar("recipient_type", { length: 20 }).notNull(), // individual, department, location, all
  recipientId: uuid("recipient_id"), // employee/department/location ID
  title: varchar("title"), // Using title instead of subject to match database
  content: text("content").notNull(),
  messageType: varchar("message_type").default("message"),
  priority: varchar("priority").default("normal"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Message threads and conversations
export const messageThreads = pgTable("message_threads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  originalMessageId: uuid("original_message_id").references(() => messages.id).notNull(),
  participants: jsonb("participants").notNull(), // array of user IDs
  subject: varchar("subject").notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee performance reviews and metrics
export const performanceReviews = pgTable("performance_reviews", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid("employee_id").references(() => employees.id).notNull(),
  reviewerId: varchar("reviewer_id").references(() => users.id).notNull(),
  reviewPeriodStart: timestamp("review_period_start").notNull(),
  reviewPeriodEnd: timestamp("review_period_end").notNull(),
  overallRating: decimal("overall_rating", { precision: 3, scale: 2 }), // 1.00-5.00 scale
  categories: jsonb("categories"), // {category: rating} pairs
  strengths: text("strengths"),
  areasForImprovement: text("areas_for_improvement"),
  goals: jsonb("goals"), // array of goal objects
  actionItems: jsonb("action_items"), // array of action items
  employeeComments: text("employee_comments"),
  status: reviewStatusEnum("status").default("draft"),
  scheduledDate: timestamp("scheduled_date"),
  completedDate: timestamp("completed_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Time tracking and attendance
export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid("employee_id").references(() => employees.id),
  shiftId: uuid("shift_id").references(() => shifts.id),
  clockInTime: timestamp("clock_in_time").notNull(),
  clockOutTime: timestamp("clock_out_time"),
  breakStartTime: timestamp("break_start_time"),
  breakEndTime: timestamp("break_end_time"),
  totalHours: decimal("total_hours", { precision: 5, scale: 2 }),
  status: varchar("status").default("clocked-in"),
  isManual: boolean("is_manual").default(false), // true if added manually by supervisor
  addedBy: varchar("added_by"), // supervisor who added manual entry
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Team Resources for document management
export const teamResources = pgTable("team_resources", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }), // null = shared across all locations
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileType: varchar("file_type", { length: 100 }).notNull(),
  fileSize: integer("file_size").notNull(),
  category: varchar("category").default("other"), // document, form, recipe, policy, manual, other
  uploadedBy: varchar("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// HR Insert schemas and Types (moved here after table definitions)
export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPositionSchema = createInsertSchema(positions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, employeeNumber: true, createdAt: true, updatedAt: true });
export const insertInvitationTokenSchema = createInsertSchema(invitationTokens)
  .omit({ id: true, token: true, status: true, acceptedAt: true, employeeId: true, createdAt: true, updatedAt: true })
  .extend({
    invitedBy: z.string().optional(),
    expiresAt: z.date().optional(),
    hourlyRate: z.union([z.string(), z.number()]).optional().transform(val => val ? String(val) : undefined),
    salary: z.union([z.string(), z.number()]).optional().transform(val => val ? String(val) : undefined),
  });
export const insertShiftSchema = createInsertSchema(shifts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAvailabilitySchema = createInsertSchema(availability).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTimeOffRequestSchema = createInsertSchema(timeOffRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTaskCompletionSchema = createInsertSchema(taskCompletions).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMessageThreadSchema = createInsertSchema(messageThreads).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPerformanceReviewSchema = createInsertSchema(performanceReviews).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTeamResourceSchema = createInsertSchema(teamResources).omit({ id: true, createdAt: true, updatedAt: true });


// HR Types
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Position = typeof positions.$inferSelect;
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type InvitationToken = typeof invitationTokens.$inferSelect;
export type InsertInvitationToken = z.infer<typeof insertInvitationTokenSchema>;
export type Shift = typeof shifts.$inferSelect;
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Availability = typeof availability.$inferSelect;
export type InsertAvailability = z.infer<typeof insertAvailabilitySchema>;
export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
export type InsertTimeOffRequest = z.infer<typeof insertTimeOffRequestSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type TaskCompletion = typeof taskCompletions.$inferSelect;
export type InsertTaskCompletion = z.infer<typeof insertTaskCompletionSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type MessageThread = typeof messageThreads.$inferSelect;
export type InsertMessageThread = z.infer<typeof insertMessageThreadSchema>;
export type PerformanceReview = typeof performanceReviews.$inferSelect;
export type InsertPerformanceReview = z.infer<typeof insertPerformanceReviewSchema>;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TeamResource = typeof teamResources.$inferSelect;
export type InsertTeamResource = z.infer<typeof insertTeamResourceSchema>;


// Universal POS Integration Tables
export const posProviderEnum = pgEnum("pos_provider", ["clover", "spoton", "toast", "revel"]);

export const posIntegrations = pgTable("pos_integrations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  provider: posProviderEnum("provider").notNull(),
  name: varchar("name").notNull(), // User-friendly name for this integration
  merchantId: varchar("merchant_id").notNull(),
  credentials: jsonb("credentials").notNull(), // Store API keys, tokens, etc. as JSON
  environment: varchar("environment").default("sandbox"), // sandbox or production
  webhookUrl: varchar("webhook_url"), // Generated webhook URL for this integration
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  lastWebhookAt: timestamp("last_webhook_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Universal POS Menu Items
export const posMenuItems = pgTable("pos_menu_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  posItemId: varchar("pos_item_id").notNull(), // ID from the POS system
  posIntegrationId: uuid("pos_integration_id").references(() => posIntegrations.id).notNull(),
  recipeId: uuid("recipe_id").references(() => recipes.id), // Link to recipe for inventory deduction (cocktails, prepared food)
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id), // Direct link to inventory item (beer, bottled drinks)
  name: varchar("name").notNull(),
  category: varchar("category"),
  price: decimal("price", { precision: 10, scale: 2 }),
  sku: varchar("sku"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Mapping between POS menu items and inventory items
export const posItemMappings = pgTable("pos_item_mappings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  posMenuItemId: uuid("pos_menu_item_id").references(() => posMenuItems.id).notNull(),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id).notNull(),
  quantityUsed: decimal("quantity_used", { precision: 10, scale: 3 }).notNull(), // Amount of inventory used per menu item
  unit: varchar("unit").notNull(),
  notes: text("notes"), // Additional mapping notes
  createdAt: timestamp("created_at").defaultNow(),
});

// POS Employees (from POS systems)
export const posEmployees = pgTable("pos_employees", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  posIntegrationId: uuid("pos_integration_id").references(() => posIntegrations.id, { onDelete: "cascade" }).notNull(),
  posEmployeeId: varchar("pos_employee_id").notNull(), // Provider's employee ID
  displayName: varchar("display_name").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  email: varchar("email"),
  phone: varchar("phone"),
  roleTitle: varchar("role_title"),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"), // Store additional POS-specific data
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("pos_employees_integration_employee_uq").on(table.posIntegrationId, table.posEmployeeId),
]);

// Mapping between POS employees and HR employees
export const posEmployeeMappings = pgTable("pos_employee_mappings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  posEmployeeId: uuid("pos_employee_id").references(() => posEmployees.id, { onDelete: "cascade" }).notNull().unique(),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }).notNull(),
  status: varchar("status").notNull(), // "auto" | "manual" | "ignored"
  confidence: decimal("confidence", { precision: 3, scale: 2 }), // 0.00 to 1.00
  matchRule: text("match_rule"), // Description of how the match was made
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// POS Time Clock entries
export const posTimeclocks = pgTable("pos_timeclocks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  posIntegrationId: uuid("pos_integration_id").references(() => posIntegrations.id, { onDelete: "cascade" }).notNull(),
  posTimeEntryId: varchar("pos_time_entry_id").notNull(), // Provider's time entry/shift ID
  posEmployeeId: uuid("pos_employee_id").references(() => posEmployees.id, { onDelete: "cascade" }).notNull(),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  clockInAt: timestamp("clock_in_at").notNull(),
  clockOutAt: timestamp("clock_out_at"), // Null for open shifts
  breakSeconds: integer("break_seconds").default(0),
  wageCents: integer("wage_cents"), // Hourly wage in cents
  roleTitle: varchar("role_title"),
  status: varchar("status").notNull(), // "open" | "closed" | "adjusted"
  hrTimeEntryId: uuid("hr_time_entry_id").references(() => timeEntries.id, { onDelete: "set null" }), // Link to HR system
  raw: jsonb("raw"), // Store raw POS data for provenance
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("pos_timeclocks_integration_entry_uq").on(table.posIntegrationId, table.posTimeEntryId),
  index("pos_timeclocks_employee_clockin_idx").on(table.posEmployeeId, table.clockInAt),
]);

// Universal POS Sales transactions
export const posSales = pgTable("pos_sales", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  posOrderId: varchar("pos_order_id").notNull(),
  posIntegrationId: uuid("pos_integration_id").references(() => posIntegrations.id).notNull(),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  cashierPosEmployeeId: uuid("cashier_pos_employee_id").references(() => posEmployees.id, { onDelete: "set null" }), // Employee who rang up the sale
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }),
  tax: decimal("tax", { precision: 10, scale: 2 }),
  tip: decimal("tip", { precision: 10, scale: 2 }),
  orderDate: timestamp("order_date").notNull(),
  processedAt: timestamp("processed_at"),
  inventoryProcessed: boolean("inventory_processed").default(false),
  metadata: jsonb("metadata"), // Store additional POS-specific data
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("pos_sales_cashier_idx").on(table.cashierPosEmployeeId),
]);

// Universal POS Sale items
export const posSaleItems = pgTable("pos_sale_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  posSaleId: uuid("pos_sale_id").references(() => posSales.id).notNull(),
  posMenuItemId: uuid("pos_menu_item_id").references(() => posMenuItems.id),
  servedByPosEmployeeId: uuid("served_by_pos_employee_id").references(() => posEmployees.id, { onDelete: "set null" }), // Employee who served this item
  itemName: varchar("item_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  modifiers: jsonb("modifiers"), // Store item modifications as JSON
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("pos_sale_items_server_idx").on(table.servedByPosEmployeeId),
]);

// Webhook Events for idempotency
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().unique(),
  provider: varchar("provider").notNull(),
  integrationId: varchar("integration_id").notNull(),
  receivedAt: timestamp("received_at").notNull(),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").defaultNow(),
});

// POS Event Queue — Postgres-backed job queue (no Redis required).
// Events from SpotOn webhooks AND fallback polling flow through this table
// so processing is always async and idempotent across multiple server instances.
// Workers claim rows with SELECT … FOR UPDATE SKIP LOCKED.
export const posEventQueue = pgTable("pos_event_queue", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: uuid("integration_id").references(() => posIntegrations.id).notNull(),
  provider: varchar("provider").notNull(),
  eventType: varchar("event_type").notNull(),   // 'order' | 'timeclock' | 'backfill'
  source: varchar("source").notNull(),           // 'webhook' | 'poll'
  idempotencyKey: varchar("idempotency_key").unique(),
  payload: jsonb("payload").notNull(),
  status: varchar("status").default("pending").notNull(), // pending | processing | done | failed
  attempts: integer("attempts").default(0).notNull(),
  lastError: text("last_error"),
  processAfter: timestamp("process_after").defaultNow(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// POS Integration schema exports
export const insertPosIntegrationSchema = createInsertSchema(posIntegrations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPosMenuItemSchema = createInsertSchema(posMenuItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPosItemMappingSchema = createInsertSchema(posItemMappings).omit({ id: true, createdAt: true });
export const insertPosSaleSchema = createInsertSchema(posSales).omit({ id: true, createdAt: true });
export const insertPosSaleItemSchema = createInsertSchema(posSaleItems).omit({ id: true, createdAt: true });
export const insertPosEmployeeSchema = createInsertSchema(posEmployees).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPosEmployeeMappingSchema = createInsertSchema(posEmployeeMappings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPosTimeclockSchema = createInsertSchema(posTimeclocks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPosEventQueueSchema = createInsertSchema(posEventQueue).omit({ id: true, createdAt: true });

// Relations for POS tables
export const posIntegrationsRelations = relations(posIntegrations, ({ one, many }) => ({
  location: one(locations, {
    fields: [posIntegrations.locationId],
    references: [locations.id],
  }),
  menuItems: many(posMenuItems),
  sales: many(posSales),
}));

export const posMenuItemsRelations = relations(posMenuItems, ({ one, many }) => ({
  integration: one(posIntegrations, {
    fields: [posMenuItems.posIntegrationId],
    references: [posIntegrations.id],
  }),
  recipe: one(recipes, {
    fields: [posMenuItems.recipeId],
    references: [recipes.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [posMenuItems.inventoryItemId],
    references: [inventoryItems.id],
  }),
  mappings: many(posItemMappings),
  saleItems: many(posSaleItems),
}));

export const posItemMappingsRelations = relations(posItemMappings, ({ one }) => ({
  posMenuItem: one(posMenuItems, {
    fields: [posItemMappings.posMenuItemId],
    references: [posMenuItems.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [posItemMappings.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));

export const posSalesRelations = relations(posSales, ({ one, many }) => ({
  integration: one(posIntegrations, {
    fields: [posSales.posIntegrationId],
    references: [posIntegrations.id],
  }),
  location: one(locations, {
    fields: [posSales.locationId],
    references: [locations.id],
  }),
  cashier: one(posEmployees, {
    fields: [posSales.cashierPosEmployeeId],
    references: [posEmployees.id],
  }),
  items: many(posSaleItems),
}));

export const posSaleItemsRelations = relations(posSaleItems, ({ one }) => ({
  sale: one(posSales, {
    fields: [posSaleItems.posSaleId],
    references: [posSales.id],
  }),
  posMenuItem: one(posMenuItems, {
    fields: [posSaleItems.posMenuItemId],
    references: [posMenuItems.id],
  }),
  server: one(posEmployees, {
    fields: [posSaleItems.servedByPosEmployeeId],
    references: [posEmployees.id],
  }),
}));

export const posEmployeesRelations = relations(posEmployees, ({ one, many }) => ({
  integration: one(posIntegrations, {
    fields: [posEmployees.posIntegrationId],
    references: [posIntegrations.id],
  }),
  mapping: one(posEmployeeMappings, {
    fields: [posEmployees.id],
    references: [posEmployeeMappings.posEmployeeId],
  }),
  timeclocks: many(posTimeclocks),
  sales: many(posSales),
  servedItems: many(posSaleItems),
}));

export const posEmployeeMappingsRelations = relations(posEmployeeMappings, ({ one }) => ({
  posEmployee: one(posEmployees, {
    fields: [posEmployeeMappings.posEmployeeId],
    references: [posEmployees.id],
  }),
  hrEmployee: one(employees, {
    fields: [posEmployeeMappings.employeeId],
    references: [employees.id],
  }),
}));

export const posTimeclocksRelations = relations(posTimeclocks, ({ one }) => ({
  integration: one(posIntegrations, {
    fields: [posTimeclocks.posIntegrationId],
    references: [posIntegrations.id],
  }),
  posEmployee: one(posEmployees, {
    fields: [posTimeclocks.posEmployeeId],
    references: [posEmployees.id],
  }),
  location: one(locations, {
    fields: [posTimeclocks.locationId],
    references: [locations.id],
  }),
  hrTimeEntry: one(timeEntries, {
    fields: [posTimeclocks.hrTimeEntryId],
    references: [timeEntries.id],
  }),
}));

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Security and Audit Tables
export const securityLogs = pgTable("security_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(), // login, logout, access_denied, data_export, etc.
  resource: varchar("resource", { length: 255 }), // table/endpoint accessed
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  sessionId: varchar("session_id"),
  severity: varchar("severity", { enum: ["low", "medium", "high", "critical"] }).default("low"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  locationId: varchar("location_id").references(() => locations.id),
  tableName: varchar("table_name", { length: 100 }).notNull(),
  recordId: varchar("record_id").notNull(),
  action: varchar("action", { enum: ["create", "update", "delete"] }).notNull(),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  changedFields: jsonb("changed_fields"),
  reason: varchar("reason", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const costAlerts = pgTable("cost_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").references(() => locations.id),
  alertType: varchar("alert_type", { enum: ["price_variance", "budget_exceeded", "waste_threshold", "low_margin"] }).notNull(),
  itemId: varchar("item_id").references(() => inventoryItems.id),
  threshold: decimal("threshold", { precision: 10, scale: 2 }),
  actualValue: decimal("actual_value", { precision: 10, scale: 2 }),
  variance: decimal("variance", { precision: 8, scale: 2 }),
  severity: varchar("severity", { enum: ["low", "medium", "high", "critical"] }).default("medium"),
  isActive: boolean("is_active").default(true),
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const businessIntelligence = pgTable("business_intelligence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").references(() => locations.id),
  reportDate: timestamp("report_date").notNull(),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).default("0"),
  totalCogs: decimal("total_cogs", { precision: 12, scale: 2 }).default("0"),
  grossMargin: decimal("gross_margin", { precision: 8, scale: 2 }).default("0"),
  foodCostPercentage: decimal("food_cost_percentage", { precision: 5, scale: 2 }).default("0"),
  laborCostPercentage: decimal("labor_cost_percentage", { precision: 5, scale: 2 }).default("0"),
  wastePercentage: decimal("waste_percentage", { precision: 5, scale: 2 }).default("0"),
  inventoryTurnover: decimal("inventory_turnover", { precision: 8, scale: 2 }).default("0"),
  avgOrderValue: decimal("avg_order_value", { precision: 10, scale: 2 }).default("0"),
  customerCount: integer("customer_count").default(0),
  topSellingItems: jsonb("top_selling_items"),
  lowPerformingItems: jsonb("low_performing_items"),
  trends: jsonb("trends"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoiceProcessing = pgTable("invoice_processing", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: uuid("vendor_id").references(() => vendors.id),
  locationId: uuid("location_id").references(() => locations.id),
  invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
  invoiceDate: timestamp("invoice_date").notNull(),
  dueDate: timestamp("due_date"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { enum: ["pending_review", "pending", "approved", "paid", "disputed", "cancelled"] }).default("pending_review"),
  paymentMethod: varchar("payment_method", { enum: ["check", "ach", "wire", "credit_card"] }),
  paymentDate: timestamp("payment_date"),
  uploadMethod: varchar("upload_method", { enum: ["photo", "email", "upload", "edi"] }),
  ocrConfidence: decimal("ocr_confidence", { precision: 5, scale: 2 }),
  lineItems: jsonb("line_items"),
  fees: jsonb("fees"), // Separate tracking for delivery, shipping, handling charges for IRS compliance
  attachmentPath: varchar("attachment_path", { length: 500 }), // Path to original invoice file
  notes: text("notes"),
  approvedBy: varchar("approved_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const priceMonitoring = pgTable("price_monitoring", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryItemId: varchar("inventory_item_id").references(() => inventoryItems.id),
  vendorId: varchar("vendor_id").references(() => vendors.id),
  previousPrice: decimal("previous_price", { precision: 10, scale: 2 }),
  currentPrice: decimal("current_price", { precision: 10, scale: 2 }),
  priceChange: decimal("price_change", { precision: 10, scale: 2 }),
  percentageChange: decimal("percentage_change", { precision: 8, scale: 2 }),
  threshold: decimal("threshold", { precision: 8, scale: 2 }).default("10.00"),
  alertSent: boolean("alert_sent").default(false),
  invoiceId: varchar("invoice_id").references(() => invoiceProcessing.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userPermissions = pgTable("user_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  locationId: varchar("location_id").references(() => locations.id),
  role: varchar("role", { enum: ["owner", "manager", "assistant_manager", "kitchen_manager", "staff", "accountant"] }).notNull(),
  permissions: jsonb("permissions").notNull(), // Array of permission strings
  isActive: boolean("is_active").default(true),
  grantedBy: varchar("granted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  category: budgetCategoryEnum("category").notNull(),
  period: budgetPeriodEnum("period").notNull(),
  budgetAmount: decimal("budget_amount", { precision: 12, scale: 2 }).notNull(),
  actualAmount: decimal("actual_amount", { precision: 12, scale: 2 }).default("0"),
  variance: decimal("variance", { precision: 12, scale: 2 }).default("0"),
  variancePercentage: decimal("variance_percentage", { precision: 8, scale: 2 }).default("0"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Auto-ordering rules table
export const autoOrderRules = pgTable("auto_order_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleName: varchar("rule_name", { length: 200 }).notNull(),
  itemId: uuid("item_id").notNull().references(() => inventoryItems.id),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
  triggerType: varchar("trigger_type", { length: 50 }).notNull(), // low_stock, scheduled, consumption, forecast
  reorderPoint: integer("reorder_point").default(50),
  orderQuantity: integer("order_quantity").default(100),
  frequency: varchar("frequency", { length: 20 }).default("weekly"), // daily, weekly, bi-weekly, monthly
  enabled: boolean("enabled").default(true),
  lastTriggered: timestamp("last_triggered"),
  estimatedSavings: decimal("estimated_savings", { precision: 10, scale: 2 }).default("0"),
  userId: varchar("user_id").notNull().references(() => users.id),
  locationId: uuid("location_id").references(() => locations.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee Documents Management
export const employeeDocuments = pgTable("employee_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid("employee_id").references(() => employees.id).notNull(),
  documentType: documentTypeEnum("document_type").notNull(),
  documentName: varchar("document_name", { length: 200 }).notNull(),
  filePath: varchar("file_path", { length: 500 }), // Object storage path
  fileSize: integer("file_size"), // in bytes
  mimeType: varchar("mime_type", { length: 100 }),
  status: documentStatusEnum("status").default("required"),
  isRequired: boolean("is_required").default(false),
  expirationDate: timestamp("expiration_date"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  version: integer("version").default(1),
  replacedDocumentId: uuid("replaced_document_id"), // References another document that this replaces
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Document Template Requirements (What documents are required for each position/location)
export const documentRequirements = pgTable("document_requirements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: uuid("location_id").references(() => locations.id),
  positionId: uuid("position_id").references(() => positions.id),
  documentType: documentTypeEnum("document_type").notNull(),
  isRequired: boolean("is_required").default(true),
  description: text("description"),
  dueDaysAfterHire: integer("due_days_after_hire").default(7), // Days after hire date when due
  renewalPeriodDays: integer("renewal_period_days"), // For documents that expire
  reminderDaysBefore: integer("reminder_days_before").default(7), // Days before expiration to remind
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Onboarding Workflows and Checklists
export const onboardingTemplates = pgTable("onboarding_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }), // documents, training, orientation, general, etc.
  locationId: uuid("location_id").references(() => locations.id),
  positionId: uuid("position_id").references(() => positions.id),
  isDefault: boolean("is_default").default(false),
  estimatedDurationDays: integer("estimated_duration_days").default(7),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Individual onboarding steps within templates
export const onboardingSteps = pgTable("onboarding_steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: uuid("template_id").references(() => onboardingTemplates.id).notNull(),
  stepOrder: integer("step_order").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }), // documents, training, orientation, equipment, etc.
  requiredDocuments: jsonb("required_documents"), // Array of document types needed
  assignedToRole: varchar("assigned_to_role", { length: 50 }), // Who is responsible for this step
  estimatedDurationHours: decimal("estimated_duration_hours", { precision: 4, scale: 2 }).default("1"),
  isRequired: boolean("is_required").default(true),
  dependsOnStepIds: jsonb("depends_on_step_ids"), // Array of step IDs that must be completed first
  instructions: text("instructions"),
  resourceLinks: jsonb("resource_links"), // Links to training materials, videos, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee onboarding progress tracking
export const employeeOnboarding = pgTable("employee_onboarding", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid("employee_id").references(() => employees.id).notNull(),
  templateId: uuid("template_id").references(() => onboardingTemplates.id).notNull(),
  status: onboardingStatusEnum("status").default("not-started"),
  startDate: timestamp("start_date"),
  targetCompletionDate: timestamp("target_completion_date"),
  actualCompletionDate: timestamp("actual_completion_date"),
  completedSteps: integer("completed_steps").default(0),
  totalSteps: integer("total_steps").notNull(),
  progressPercentage: decimal("progress_percentage", { precision: 5, scale: 2 }).default("0"),
  assignedMentorId: uuid("assigned_mentor_id").references(() => employees.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Individual step completion tracking
export const employeeOnboardingSteps = pgTable("employee_onboarding_steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeOnboardingId: uuid("employee_onboarding_id").references(() => employeeOnboarding.id).notNull(),
  stepId: uuid("step_id").references(() => onboardingSteps.id).notNull(),
  status: onboardingStepStatusEnum("status").default("pending"),
  startedDate: timestamp("started_date"),
  completedDate: timestamp("completed_date"),
  completedBy: varchar("completed_by").references(() => users.id),
  timeSpentHours: decimal("time_spent_hours", { precision: 4, scale: 2 }),
  notes: text("notes"),
  rating: integer("rating"), // 1-5 rating of step completion quality
  feedback: text("feedback"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Onboarding tokens for public access links
export const onboardingTokens = pgTable("onboarding_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid("employee_id").references(() => employees.id).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Secure storage for detailed employee onboarding form data
export const employeeOnboardingData = pgTable("employee_onboarding_data", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid("employee_id").references(() => employees.id).notNull(),
  tokenId: uuid("token_id").references(() => onboardingTokens.id),
  
  // Personal Information
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zipCode: varchar("zip_code", { length: 10 }),
  dateOfBirth: date("date_of_birth"),
  socialSecurityNumber: text("social_security_number"), // Encrypted at rest (AES-256-GCM)
  
  // Emergency Contact
  emergencyContactName: varchar("emergency_contact_name", { length: 100 }),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 20 }),
  emergencyContactRelationship: varchar("emergency_contact_relationship", { length: 50 }),
  
  // Banking Information (for direct deposit)
  bankName: varchar("bank_name", { length: 100 }),
  accountNumber: text("account_number"), // Encrypted at rest (AES-256-GCM)
  routingNumber: text("routing_number"), // Encrypted at rest (AES-256-GCM)
  accountType: varchar("account_type", { length: 20 }), // checking, savings
  
  // Form metadata
  completedAt: timestamp("completed_at").defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  // Audit fields
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SecurityLog = typeof securityLogs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type CostAlert = typeof costAlerts.$inferSelect;
export type BusinessIntelligence = typeof businessIntelligence.$inferSelect;
export type InvoiceProcessing = typeof invoiceProcessing.$inferSelect;
export type PriceMonitoring = typeof priceMonitoring.$inferSelect;
export type UserPermission = typeof userPermissions.$inferSelect;
export type Budget = typeof budgets.$inferSelect;

export type InsertSecurityLog = typeof securityLogs.$inferInsert;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type InsertCostAlert = typeof costAlerts.$inferInsert;
export type InsertBusinessIntelligence = typeof businessIntelligence.$inferInsert;
export type InsertInvoiceProcessing = typeof invoiceProcessing.$inferInsert;
export type InsertPriceMonitoring = typeof priceMonitoring.$inferInsert;
export type InsertUserPermission = typeof userPermissions.$inferInsert;
export type InsertBudget = typeof budgets.$inferInsert;

export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true, createdAt: true, updatedAt: true });
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Category = typeof categories.$inferSelect;
export type PosIntegration = typeof posIntegrations.$inferSelect;
export type InsertPosIntegration = z.infer<typeof insertPosIntegrationSchema>;
export type PosEventQueue = typeof posEventQueue.$inferSelect;
export type InsertPosEventQueue = z.infer<typeof insertPosEventQueueSchema>;
export type PosMenuItem = typeof posMenuItems.$inferSelect;
export type InsertPosMenuItem = z.infer<typeof insertPosMenuItemSchema>;
export type PosItemMapping = typeof posItemMappings.$inferSelect;
export type InsertPosItemMapping = z.infer<typeof insertPosItemMappingSchema>;
export type PosSale = typeof posSales.$inferSelect;
export type InsertPosSale = z.infer<typeof insertPosSaleSchema>;
export type PosSaleItem = typeof posSaleItems.$inferSelect;
export type InsertPosSaleItem = z.infer<typeof insertPosSaleItemSchema>;
export type PosEmployee = typeof posEmployees.$inferSelect;
export type InsertPosEmployee = z.infer<typeof insertPosEmployeeSchema>;
export type PosEmployeeMapping = typeof posEmployeeMappings.$inferSelect;
export type InsertPosEmployeeMapping = z.infer<typeof insertPosEmployeeMappingSchema>;
export type PosTimeclock = typeof posTimeclocks.$inferSelect;
export type InsertPosTimeclock = z.infer<typeof insertPosTimeclockSchema>;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type InsertRecipeIngredient = z.infer<typeof insertRecipeIngredientSchema>;
export type RecipeProduction = typeof recipeProductions.$inferSelect;
export type InsertRecipeProduction = z.infer<typeof insertRecipeProductionSchema>;
export type UnitConversion = typeof unitConversions.$inferSelect;
export type InsertUnitConversion = z.infer<typeof insertUnitConversionSchema>;
export type VarianceAnalysis = typeof varianceAnalysis.$inferSelect;
export type InsertVarianceAnalysis = z.infer<typeof insertVarianceAnalysisSchema>;
export type RecipeCostHistory = typeof recipeCostHistory.$inferSelect;
export type InsertRecipeCostHistory = z.infer<typeof insertRecipeCostHistorySchema>;
export type InventoryValuation = typeof inventoryValuations.$inferSelect;
export type InsertInventoryValuation = z.infer<typeof insertInventoryValuationSchema>;
export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type MenuItemIngredient = typeof menuItemIngredients.$inferSelect;
export type InsertMenuItemIngredient = z.infer<typeof insertMenuItemIngredientSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;
export type WasteEntry = typeof wasteEntries.$inferSelect;
export type InsertWasteEntry = z.infer<typeof insertWasteEntrySchema>;
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type InsertInventoryTransaction = z.infer<typeof insertInventoryTransactionSchema>;

export type AutoOrderRule = typeof autoOrderRules.$inferSelect;
export type InsertAutoOrderRule = typeof autoOrderRules.$inferInsert;

// Employee document and onboarding types
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
export type InsertEmployeeDocument = typeof employeeDocuments.$inferInsert;
export type OnboardingToken = typeof onboardingTokens.$inferSelect;
export type InsertOnboardingToken = typeof onboardingTokens.$inferInsert;
export type DocumentRequirement = typeof documentRequirements.$inferSelect;
export type InsertDocumentRequirement = typeof documentRequirements.$inferInsert;
export type OnboardingTemplate = typeof onboardingTemplates.$inferSelect;
export type InsertOnboardingTemplate = typeof onboardingTemplates.$inferInsert;
export type OnboardingStep = typeof onboardingSteps.$inferSelect;
export type InsertOnboardingStep = typeof onboardingSteps.$inferInsert;
export type EmployeeOnboarding = typeof employeeOnboarding.$inferSelect;
export type InsertEmployeeOnboarding = typeof employeeOnboarding.$inferInsert;
export type EmployeeOnboardingStep = typeof employeeOnboardingSteps.$inferSelect;
export type InsertEmployeeOnboardingStep = typeof employeeOnboardingSteps.$inferInsert;
export type EmployeeOnboardingData = typeof employeeOnboardingData.$inferSelect;
export type InsertEmployeeOnboardingData = typeof employeeOnboardingData.$inferInsert;

export const insertEmployeeOnboardingDataSchema = createInsertSchema(employeeOnboardingData).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertAutoOrderRuleSchema = createInsertSchema(autoOrderRules);
export const insertEmployeeDocumentSchema = createInsertSchema(employeeDocuments).omit({ id: true, createdAt: true, updatedAt: true });

// Enhanced Document Management System for W-4, I-9, Handbook, etc.
export const documentTypeEnumNew = pgEnum("document_type_new", [
  "w4_federal", "w4_state_sc", "i9", "handbook", "policy", "nda", 
  "emergency_contact", "direct_deposit", "benefits", "safety_training", 
  "code_of_conduct", "uniform_policy", "harassment_policy", "other"
]);

export const documentTemplates = pgTable("document_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  type: documentTypeEnumNew("type").notNull(),
  description: text("description"),
  filePath: varchar("file_path", { length: 500 }), // Object storage path for template PDF/form
  isRequired: boolean("is_required").default(false),
  isActive: boolean("is_active").default(true),
  requiresSignature: boolean("requires_signature").default(false),
  sortOrder: integer("sort_order").default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee document assignments and completions
export const documentStatusEnumNew = pgEnum("document_status_new", [
  "not_sent", "sent", "viewed", "completed", "signed", "expired", "declined"
]);

export const employeeDocumentAssignments = pgTable("employee_document_assignments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }).notNull(),
  templateId: uuid("template_id").references(() => documentTemplates.id).notNull(),
  status: documentStatusEnumNew("status").default("not_sent"),
  
  // Document file paths
  completedFilePath: varchar("completed_file_path", { length: 500 }), // Filled out form
  signaturePath: varchar("signature_path", { length: 500 }), // Digital signature file
  
  // Tracking dates
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  completedAt: timestamp("completed_at"),
  signedAt: timestamp("signed_at"),
  expiresAt: timestamp("expires_at"),
  
  // Metadata
  sentBy: uuid("sent_by").references(() => users.id),
  notes: text("notes"),
  reminderSent: timestamp("reminder_sent"),
  reminderCount: integer("reminder_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Digital signatures for document signing
export const employeeSignatures = pgTable("employee_signatures", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  documentAssignmentId: uuid("document_assignment_id").references(() => employeeDocumentAssignments.id, { onDelete: "cascade" }).notNull(),
  employeeId: uuid("employee_id").references(() => employees.id).notNull(),
  
  // Signature data
  signatureData: text("signature_data"), // Base64 encoded signature image
  signatureType: varchar("signature_type", { length: 50 }).default("digital"), // digital, drawn, uploaded
  signedName: varchar("signed_name", { length: 255 }), // Name as signed
  
  // Legal verification
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").defaultNow(),
  
  // Document verification
  documentHash: varchar("document_hash", { length: 255 }), // For document integrity
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Document form fields for digital forms
export const documentFormFieldTypeEnum = pgEnum("document_form_field_type", [
  "text", "textarea", "email", "phone", "number", "date", "select", "checkbox", "radio", "signature"
]);

export const documentFormFields = pgTable("document_form_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").references(() => documentTemplates.id, { onDelete: "cascade" }).notNull(),
  fieldName: varchar("field_name", { length: 100 }).notNull(), // e.g., "fullName", "ssn", "address"
  fieldLabel: varchar("field_label", { length: 255 }).notNull(), // e.g., "Full Legal Name"
  fieldType: documentFormFieldTypeEnum("field_type").notNull(),
  isRequired: boolean("is_required").default(false),
  placeholder: varchar("placeholder", { length: 255 }),
  helpText: text("help_text"),
  options: jsonb("options"), // For select/radio options: ["Option 1", "Option 2"]
  validation: jsonb("validation"), // For validation rules: {"minLength": 2, "pattern": "regex"}
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Employee form responses for digital completion
export const employeeDocumentResponses = pgTable("employee_document_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: varchar("assignment_id").references(() => employeeDocumentAssignments.id, { onDelete: "cascade" }).notNull(),
  fieldId: varchar("field_id").references(() => documentFormFields.id).notNull(),
  fieldValue: text("field_value"), // The employee's response
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas for enhanced document management
export const insertDocumentTemplateSchema = createInsertSchema(documentTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmployeeDocumentAssignmentSchema = createInsertSchema(employeeDocumentAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmployeeSignatureSchema = createInsertSchema(employeeSignatures).omit({ id: true, createdAt: true });

export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type EmployeeDocumentAssignment = typeof employeeDocumentAssignments.$inferSelect;
export type InsertEmployeeDocumentAssignment = z.infer<typeof insertEmployeeDocumentAssignmentSchema>;
export type EmployeeSignature = typeof employeeSignatures.$inferSelect;
export type InsertEmployeeSignature = z.infer<typeof insertEmployeeSignatureSchema>;
export const insertDocumentRequirementSchema = createInsertSchema(documentRequirements).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOnboardingTemplateSchema = createInsertSchema(onboardingTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOnboardingStepSchema = createInsertSchema(onboardingSteps).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmployeeOnboardingSchema = createInsertSchema(employeeOnboarding).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmployeeOnboardingStepSchema = createInsertSchema(employeeOnboardingSteps).omit({ id: true, createdAt: true, updatedAt: true });

// Insert schemas for digital document forms
export const insertDocumentFormFieldSchema = createInsertSchema(documentFormFields).omit({ id: true, createdAt: true });
export const insertEmployeeDocumentResponseSchema = createInsertSchema(employeeDocumentResponses).omit({ id: true, createdAt: true, updatedAt: true });

// Recipe assignments for department training and daily prep
export const recipeAssignments = pgTable("recipe_assignments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "cascade" }).notNull(),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "cascade" }).notNull(),
  assignedBy: varchar("assigned_by").references(() => users.id).notNull(),
  assignmentType: varchar("assignment_type").default("training"), // training, daily_prep, specialty
  priority: varchar("priority").default("normal"), // low, normal, high
  notes: text("notes"),
  dueDate: timestamp("due_date"),
  status: varchar("status").default("assigned"), // assigned, in_progress, completed
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Types for digital document forms
export type DocumentFormField = typeof documentFormFields.$inferSelect;
export type InsertDocumentFormField = z.infer<typeof insertDocumentFormFieldSchema>;
export type EmployeeDocumentResponse = typeof employeeDocumentResponses.$inferSelect;
export type InsertEmployeeDocumentResponse = z.infer<typeof insertEmployeeDocumentResponseSchema>;

// Recipe assignment types
export const insertRecipeAssignmentSchema = createInsertSchema(recipeAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export type RecipeAssignment = typeof recipeAssignments.$inferSelect;
export type InsertRecipeAssignment = z.infer<typeof insertRecipeAssignmentSchema>;


// Vendor price catalog types
export const insertVendorPriceCatalogSchema = createInsertSchema(vendorPriceCatalog).omit({ id: true, createdAt: true, updatedAt: true });
export type VendorPriceCatalog = typeof vendorPriceCatalog.$inferSelect;
export type InsertVendorPriceCatalog = z.infer<typeof insertVendorPriceCatalogSchema>;

// Price import types
export const insertPriceImportSchema = createInsertSchema(priceImports).omit({ id: true, createdAt: true });
export type PriceImport = typeof priceImports.$inferSelect;
export type InsertPriceImport = z.infer<typeof insertPriceImportSchema>;

// Owner onboarding system
export const onboardingStepEnum = pgEnum("onboarding_step", [
  "restaurant_info", 
  "departments", 
  "positions", 
  "hr_addon", 
  "employee_invitations"
]);

export const ownerOnboardingStatusEnum = pgEnum("owner_onboarding_status", [
  "not_started",
  "in_progress", 
  "completed",
  "skipped"
]);

// Track overall owner onboarding progress
export const ownerOnboarding = pgTable("owner_onboarding", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  isCompleted: boolean("is_completed").default(false),
  currentStep: onboardingStepEnum("current_step").default("restaurant_info"),
  totalSteps: integer("total_steps").default(5),
  completedSteps: integer("completed_steps").default(0),
  skippedSteps: jsonb("skipped_steps").default("[]"), // Array of step names that were skipped
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  data: jsonb("data").default("{}"), // Store step data for resume functionality
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Track individual step completion
export const ownerOnboardingSteps = pgTable("owner_onboarding_steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  onboardingId: uuid("onboarding_id").references(() => ownerOnboarding.id, { onDelete: "cascade" }).notNull(),
  stepName: onboardingStepEnum("step_name").notNull(),
  status: ownerOnboardingStatusEnum("status").default("not_started"),
  stepData: jsonb("step_data"), // Store specific data for this step
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas for owner onboarding
export const insertOwnerOnboardingSchema = createInsertSchema(ownerOnboarding).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertOwnerOnboardingStepSchema = createInsertSchema(ownerOnboardingSteps).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

// Types for owner onboarding
export type OwnerOnboarding = typeof ownerOnboarding.$inferSelect;
export type InsertOwnerOnboarding = z.infer<typeof insertOwnerOnboardingSchema>;
export type OwnerOnboardingStep = typeof ownerOnboardingSteps.$inferSelect;
export type InsertOwnerOnboardingStep = z.infer<typeof insertOwnerOnboardingStepSchema>;

