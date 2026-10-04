import { assertPermission, Permission } from '../permissions';
import type { Express } from 'express';
import { storage } from '../storage';
import { StockError } from '../stockOperations';
import { ReceivingError } from '../purchaseOrderReceiving';
import { isAuthenticated, csvUpload, PLAN_LOCATION_LIMITS } from './helpers';
import { requireLocationAccess, assertLocationAccess, assertSameLocation } from '../securityMiddleware';
import {
  insertLocationSchema,
  insertCategorySchema,
  insertVendorSchema,
  insertInventoryItemSchema,
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  insertWasteEntrySchema,
  insertInventoryTransactionSchema,
  vendorPriceCatalog,
} from '@shared/schema';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { parseVendorCsvRow } from '../packSizeParser';
import csv from 'csv-parser';
import { Readable } from 'stream';

export function registerInventoryRoutes(app: Express): void {
  // Locations
  app.get('/api/locations', isAuthenticated, async (req, res) => {
    try {
      // platform_admin sees all locations across all tenants for testing
      const ownerId = req.user!.role === 'platform_admin' ? undefined : req.user!.id;
      const owned = await storage.getLocations(ownerId);
      const permissions = ownerId ? await storage.getUserPermissions(req.user!.id) : [];
      const assigned = await Promise.all(permissions.filter(p => p.isActive).map(p => storage.getLocationById(p.locationId)));
      res.json([...new Map([...owned, ...assigned.filter(Boolean)].map(location => [location!.id, location])).values()]);
    } catch (error) {
      console.error('Error fetching locations:', error);
      res.status(500).json({ message: 'Failed to fetch locations' });
    }
  });

  app.post('/api/locations', isAuthenticated, async (req, res) => {
    try {
      if (!['owner', 'platform_admin'].includes(req.user!.role)) return res.status(403).json({ message: 'Only owners can create restaurants.' });
      const user = await storage.getUser(req.user!.id);
      // Enforce per-plan location limits (platform_admin is unlimited)
      if (req.user!.role !== 'platform_admin') {
        const plan = (user?.subscriptionPlan || 'free') as string;
        const limit = PLAN_LOCATION_LIMITS[plan];
        if (limit !== undefined) {
          const existing = await storage.getLocations(req.user!.id);
          if (existing.length >= limit) {
            return res.status(403).json({
              message: `Your ${plan === 'free' ? 'free' : 'Core'} plan allows up to ${limit} location${limit > 1 ? 's' : ''}. Upgrade to add more.`,
              code: 'LOCATION_LIMIT_REACHED',
              limit,
              current: existing.length,
            });
          }
        }
      }
      const locationData = insertLocationSchema.parse(req.body);
      const location = await storage.createLocation({ ...locationData, ownerId: req.user!.id });
      res.status(201).json(location);
    } catch (error) {
      console.error('Error creating location:', error);
      res.status(400).json({ message: 'Failed to create location' });
    }
  });

  app.patch('/api/locations/:id', isAuthenticated, async (req, res) => {
    try {
      if (!await assertLocationAccess(req, res, req.params.id)) return;
      if (req.user!.role !== 'owner' && req.user!.role !== 'platform_admin') return res.status(403).json({ message: 'Only the restaurant owner can change location settings.' });
      const locationData = insertLocationSchema.partial().parse(req.body);
      const existing = await storage.getLocationById(req.params.id);
      if (locationData.ownerId !== undefined && locationData.ownerId !== existing?.ownerId) return res.status(400).json({ message: 'Location ownership cannot be changed here.' });
      const location = await storage.updateLocation(req.params.id, locationData);
      res.json(location);
    } catch (error) {
      console.error('Error updating location:', error);
      res.status(400).json({ message: 'Failed to update location' });
    }
  });

  app.delete('/api/locations/:id', isAuthenticated, async (req, res) => {
    try {
      if (!await assertLocationAccess(req, res, req.params.id)) return;
      if (req.user!.role !== 'owner' && req.user!.role !== 'platform_admin') return res.status(403).json({ message: 'Only the restaurant owner can delete a location.' });
      await storage.deleteLocation(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting location:', error);
      res.status(400).json({ message: 'Failed to delete location' });
    }
  });

  // Categories
  app.get('/api/categories', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const categories = await storage.getCategories(req.query.locationId as string);
      res.json(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ message: 'Failed to fetch categories' });
    }
  });

  app.post('/api/categories', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const categoryData = insertCategorySchema.parse(req.body);
      if (!assertPermission(req, res, Permission.MANAGE_INVENTORY)) return;
      const category = await storage.createCategory(categoryData);
      res.status(201).json(category);
    } catch (error) {
      console.error('Error creating category:', error);
      res.status(400).json({ message: 'Failed to create category' });
    }
  });

  app.put('/api/categories/:id', isAuthenticated, async (req, res) => {
    try {
      const categoryData = insertCategorySchema.partial().parse(req.body);
      const existing = await storage.getCategory(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Category not found' });
      if (!existing.locationId) {
        if (req.user!.role !== 'platform_admin') return res.status(403).json({ message: 'Shared categories require platform administrator access' });
      } else if (!await assertLocationAccess(req, res, existing.locationId)) return;
      if (categoryData.locationId && !await assertLocationAccess(req, res, categoryData.locationId)) return;
      if (categoryData.locationId === null && req.user!.role !== 'platform_admin') {
        return res.status(403).json({ message: 'Shared categories require platform administrator access' });
      }
      if (!assertPermission(req, res, Permission.MANAGE_INVENTORY)) return;
      const category = await storage.updateCategory(req.params.id, categoryData);
      res.json(category);
    } catch (error) {
      console.error('Error updating category:', error);
      res.status(400).json({ message: 'Failed to update category' });
    }
  });

  app.delete('/api/categories/:id', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const category = await storage.getCategory(req.params.id);
      if (!category) return res.status(404).json({ message: 'Category not found' });
      if (!category.locationId) {
        if (req.user!.role !== 'platform_admin') return res.status(403).json({ message: 'Shared categories require platform administrator access' });
      } else if (!await assertLocationAccess(req, res, category.locationId)) return;
      if (!assertPermission(req, res, Permission.MANAGE_INVENTORY)) return;
      await storage.deleteCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting category:', error);
      res.status(400).json({ message: 'Failed to delete category' });
    }
  });

  // Vendors
  app.get('/api/vendors', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const vendors = await storage.getVendors(req.query.locationId as string);
      res.json(vendors);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      res.status(500).json({ message: 'Failed to fetch vendors' });
    }
  });

  app.get('/api/vendors/:id', isAuthenticated, async (req, res) => {
    try {
      const vendor = await storage.getVendor(req.params.id);
      if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
      if (!vendor.locationId) {
        return res.status(400).json({ message: 'Vendor has no location assigned' });
      }
      if (!await assertLocationAccess(req, res, vendor.locationId)) return;
      res.json(vendor);
    } catch (error) {
      console.error('Error fetching vendor:', error);
      res.status(500).json({ message: 'Failed to fetch vendor' });
    }
  });

  app.post('/api/vendors', isAuthenticated, async (req, res) => {
    try {
      const vendorData = insertVendorSchema.parse(req.body);
      if (!vendorData.locationId) {
        return res.status(400).json({ message: 'Vendor has no location assigned' });
      }
      if (!await assertLocationAccess(req, res, vendorData.locationId)) return;
      if (!assertPermission(req, res, Permission.MANAGE_VENDORS)) return;
      const vendor = await storage.createVendor(vendorData);
      res.status(201).json(vendor);
    } catch (error) {
      console.error('Error creating vendor:', error);
      res.status(400).json({ message: 'Failed to create vendor' });
    }
  });

  app.put('/api/vendors/:id', isAuthenticated, async (req, res) => {
    try {
      const existing = await storage.getVendor(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Vendor not found' });
      if (!existing.locationId) {
        return res.status(400).json({ message: 'Vendor has no location assigned' });
      }
      if (!await assertLocationAccess(req, res, existing.locationId)) return;
      if (!assertSameLocation(res, existing.locationId, req.body.locationId) || !assertPermission(req, res, Permission.MANAGE_VENDORS)) return;
      const vendor = await storage.updateVendor(req.params.id, insertVendorSchema.partial().parse(req.body));
      res.json(vendor);
    } catch (error) {
      console.error('Error updating vendor:', error);
      res.status(400).json({ message: 'Failed to update vendor' });
    }
  });

  app.delete('/api/vendors/:id', isAuthenticated, async (req, res) => {
    try {
      const existing = await storage.getVendor(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Vendor not found' });
      if (!existing.locationId) {
        return res.status(400).json({ message: 'Vendor has no location assigned' });
      }
      if (!await assertLocationAccess(req, res, existing.locationId)) return;
      if (!assertPermission(req, res, Permission.MANAGE_VENDORS)) return;
      await storage.deleteVendor(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting vendor:', error);
      res.status(400).json({ message: 'Failed to delete vendor' });
    }
  });

  // Inventory Items
  app.get('/api/inventory', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const items = await storage.getInventoryItems(req.query.locationId as string);
      res.json(items);
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      res.status(500).json({ message: 'Failed to fetch inventory items' });
    }
  });

  app.get('/api/inventory/low-stock', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const items = await storage.getLowStockItems(req.query.locationId as string);
      res.json(items);
    } catch (error) {
      console.error('Error fetching low stock items:', error);
      res.status(500).json({ message: 'Failed to fetch low stock items' });
    }
  });

  app.get('/api/inventory/stock-levels', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (!locationId) return res.status(400).json({ message: 'Location ID is required' });
      const stockLevels = await storage.getRemainingStockLevels(locationId);
      res.json(stockLevels);
    } catch (error) {
      console.error('Error fetching stock levels:', error);
      res.status(500).json({ message: 'Failed to fetch stock levels' });
    }
  });

  app.get('/api/inventory/:id', isAuthenticated, async (req, res) => {
    try {
      const item = await storage.getInventoryItem(req.params.id);
      if (!item) return res.status(404).json({ message: 'Inventory item not found' });
      if (item.locationId && !await assertLocationAccess(req, res, item.locationId)) return;
      res.json(item);
    } catch (error) {
      console.error('Error fetching inventory item:', error);
      res.status(500).json({ message: 'Failed to fetch inventory item' });
    }
  });

  app.post('/api/inventory', isAuthenticated, async (req, res) => {
    try {
      const itemData = insertInventoryItemSchema.parse(req.body);
      if (!itemData.locationId || !await assertLocationAccess(req, res, itemData.locationId)) return;
      if (!itemData.name.trim()) return res.status(400).json({ message: 'Item name is required' });
      for (const field of ['quantity', 'costPerUnit', 'reorderLevel', 'costPerPurchaseUnit'] as const) {
        const value = itemData[field];
        if (value !== undefined && value !== null && !/^(?:\d{1,8}(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) {
          return res.status(400).json({ message: `${field} must be zero or more, with at most two decimal places` });
        }
      }
      if (itemData.categoryId) {
        const category = await storage.getCategory(itemData.categoryId);
        if (!category || (category.locationId && category.locationId !== itemData.locationId)) {
          return res.status(400).json({ message: 'Category does not belong to this restaurant' });
        }
      }
      if (itemData.vendorId) {
        const vendor = await storage.getVendor(itemData.vendorId);
        if (!vendor || vendor.locationId !== itemData.locationId) {
          return res.status(400).json({ message: 'Vendor does not belong to this restaurant' });
        }
      }
      if (!assertPermission(req, res, Permission.MANAGE_INVENTORY)) return;
      const item = await storage.createInventoryItem({ ...itemData, name: itemData.name.trim() }, req.user!.id);
      res.status(201).json(item);
    } catch (error) {
      console.error('Error creating inventory item:', error);
      res.status(400).json({ message: 'Failed to create inventory item' });
    }
  });

  app.put('/api/inventory/:id', isAuthenticated, async (req, res) => {
    try {
      const existing = await storage.getInventoryItem(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Inventory item not found' });
      if (existing.locationId && !await assertLocationAccess(req, res, existing.locationId)) return;
      if (!assertSameLocation(res, existing.locationId, req.body.locationId) || !assertPermission(req, res, Permission.MANAGE_INVENTORY)) return;
      for (const key of ['categoryId', 'vendorId'] as const) {
        if (!req.body[key]) continue;
        const linked = key === 'categoryId' ? await storage.getCategory(req.body[key]) : await storage.getVendor(req.body[key]);
        if (!linked || (linked.locationId !== existing.locationId && !(key === 'categoryId' && !linked.locationId))) return res.status(400).json({ message: 'Category or vendor belongs to a different restaurant.' });
      }
      const item = await storage.updateInventoryItem(req.params.id, insertInventoryItemSchema.partial().parse(req.body), req.user!.id);
      res.json(item);
    } catch (error) {
      console.error('Error updating inventory item:', error);
      res.status(400).json({ message: 'Failed to update inventory item' });
    }
  });

  app.delete('/api/inventory/:id', isAuthenticated, async (req, res) => {
    try {
      const existing = await storage.getInventoryItem(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Inventory item not found' });
      if (existing.locationId && !await assertLocationAccess(req, res, existing.locationId)) return;
      if (!assertPermission(req, res, Permission.MANAGE_INVENTORY)) return;
      await storage.deleteInventoryItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      res.status(400).json({ message: 'Failed to delete inventory item' });
    }
  });

  // CSV Import
  app.post('/api/inventory/import', isAuthenticated, csvUpload.single('file'), async (req, res) => {
    try {
      const locationId = req.body.locationId;
      const vendorId = req.body.vendorId;
      const userId = req.user!.id;
      if (!locationId) return res.status(400).json({ message: 'Location ID is required' });
      if (!await assertLocationAccess(req, res, locationId)) return;
      if (!assertPermission(req, res, Permission.MANAGE_INVENTORY)) return;
      if (vendorId) {
        const vendor = await storage.getVendor(vendorId);
        if (!vendor || vendor.locationId !== locationId) return res.status(400).json({ message: 'Vendor belongs to another restaurant.' });
      }
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      const results: any[] = [];
      const errors: Array<{ row: number; field: string; message: string; warning?: boolean }> = [];
      let rowNumber = 0;

      const categories = await storage.getCategories(locationId);
      const vendors = await storage.getVendors(locationId);
      const isExcel = req.file.originalname.endsWith('.xlsx') || req.file.originalname.endsWith('.xls');

      if (isExcel) {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execPromise = promisify(exec);
        const fs = await import('fs');
        const path = await import('path');
        const tempFilePath = path.join('/tmp', `import_${Date.now()}.xlsx`);
        fs.writeFileSync(tempFilePath, req.file.buffer);
        try {
          const { stdout } = await execPromise(`python3 -c "
import openpyxl
import json
wb = openpyxl.load_workbook('${tempFilePath}')
ws = wb.active
rows = []
header_found = False
for row in ws.iter_rows(values_only=True):
    if not any(row):
        continue
    if not header_found and row[0] == 'Category':
        header_found = True
        continue
    if header_found and row[0] and row[1]:
        rows.append({'Category': str(row[0]) if row[0] else '','Item': str(row[1]) if row[1] else '','Avg Price': float(row[2]) if row[2] else 0,'Cost': float(row[3]) if row[3] else 0})
print(json.dumps(rows))
"`);
          const excelData = JSON.parse(stdout);
          for (const row of excelData) { rowNumber++; results.push({ rowNumber, data: row }); }
          fs.unlinkSync(tempFilePath);
        } catch (error) {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          return res.status(400).json({ message: 'Failed to parse Excel file' });
        }
      } else {
        const csvText = req.file.buffer.toString('utf-8');
        const lines = csvText.split('\n');
        let headerLineIndex = 0;
        for (let i = 0; i < Math.min(20, lines.length); i++) {
          const line = lines[i].toLowerCase();
          if (line.includes('product description') || (line.includes('pack') && line.includes('size')) || line.includes('category name')) {
            headerLineIndex = i;
            break;
          }
        }
        const csvDataToRead = lines.slice(headerLineIndex).join('\n');
        const stream = Readable.from(Buffer.from(csvDataToRead, 'utf-8'));
        await new Promise<void>((resolve, reject) => {
          stream.pipe(csv()).on('data', (row) => { rowNumber++; results.push({ rowNumber, data: row }); }).on('end', resolve).on('error', reject);
        });
      }

      const firstRow = results[0]?.data || {};
      const columnNames = Object.keys(firstRow).map(k => k.toLowerCase().trim());
      const hasExcelColumns = columnNames.includes('category') && columnNames.includes('item') && (columnNames.includes('avg price') || columnNames.includes('cost'));
      const hasSizeColumn = columnNames.some(col => col.includes('pack') || col.includes('size') || col.match(/\b(pack|size|pkg|ct|count)\b/));

      let detectedFormat = 'standard';
      if (hasExcelColumns) {
        detectedFormat = 'excel_simple';
      } else if (hasSizeColumn) {
        const sampleRows = results.slice(0, Math.min(10, results.length));
        const vendorParseSuccesses = sampleRows.filter(r => { const p = parseVendorCsvRow(r.data, true); return p && p.parsed.parseSuccess; }).length;
        if (vendorParseSuccesses / sampleRows.length >= 0.5) detectedFormat = 'vendor';
      }

      let successCount = 0;
      let failedCount = 0;

      for (const result of results) {
        const { rowNumber: rn, data: row } = result;
        let itemData: any = null;
        let vendorPricingData: any = null;
        try {
          if (detectedFormat === 'vendor') {
            const parsed = parseVendorCsvRow(row);
            if (!parsed) { errors.push({ row: rn, field: 'general', message: 'Missing required fields for vendor format' }); failedCount++; continue; }
            if (!parsed.parsed.parseSuccess) errors.push({ row: rn, field: 'Pack Size', message: parsed.parsed.parseError || 'Failed to parse pack size', warning: true });
            if (parsed.costs.costMismatch) errors.push({ row: rn, field: 'Per Unit Cost', message: `Cost mismatch: Calculated $${parsed.costs.perPieceCost?.toFixed(4)} vs Vendor $${parsed.vendorPerUnitCost?.toFixed(4)} (${parsed.costs.costMismatchPercent?.toFixed(1)}% diff)`, warning: true });
            let selectedVendorId = vendorId;
            if (!selectedVendorId && vendors.length > 0) selectedVendorId = vendors[0].id;
            const categoryMatch = categories.find((c: any) => {
              const catName = c.name.toLowerCase();
              const itemLower = parsed.itemName.toLowerCase();
              return itemLower.includes(catName) || catName.includes(itemLower.split(' ')[0]);
            });
            const pricePerLb = parsed.parsed.innerUnit === 'lb' && parsed.costs.perBaseUnitCost ? parsed.costs.perBaseUnitCost.toString() : null;
            const pricePerGa = parsed.parsed.innerUnit === 'gal' && parsed.costs.perBaseUnitCost ? parsed.costs.perBaseUnitCost.toString() : null;
            const pricePerOz = parsed.parsed.innerUnit === 'oz' && parsed.costs.perBaseUnitCost ? parsed.costs.perBaseUnitCost.toString() : (pricePerLb ? (Number(pricePerLb) / 16).toString() : null);
            itemData = {
              name: parsed.itemName.trim(), description: `${parsed.rawPackSize} ${parsed.purchaseUom}`,
              categoryId: categoryMatch?.id || null, vendorId: selectedVendorId, locationId, quantity: '0',
              unit: parsed.purchaseUom || 'case', costPerUnit: parsed.caseCost.toString(),
              purchaseUnit: parsed.purchaseUom || 'case', recipeUnit: parsed.parsed.innerUnit || 'oz',
              conversionFactor: parsed.parsed.totalBaseUnits?.toString() || '1', costPerPurchaseUnit: parsed.caseCost.toString(),
              reorderLevel: '0', barcode: parsed.vendorSku || null, packSize: parsed.rawPackSize,
              caseQuantity: parsed.parsed.packQty?.toString(), casePrice: parsed.caseCost.toString(),
              pricePerLb, pricePerGa, pricePerOz, pricePerInnerUnit: parsed.costs.perPieceCost?.toString(),
              innerUnit: parsed.parsed.innerUnit, piecesPerLb: parsed.conversion.piecesPerLb?.toString(),
              ozPerPiece: parsed.conversion.ozPerPiece?.toString(), ozPerCup: parsed.conversion.ozPerCup?.toString(),
              cupsPerGa: parsed.conversion.cupsPerGa?.toString(), yieldPct: parsed.conversion.yieldPct?.toString(),
              gradeLow: parsed.conversion.gradeLow, gradeHigh: parsed.conversion.gradeHigh,
            };
            if (selectedVendorId && parsed.parsed.parseSuccess) {
              vendorPricingData = {
                vendorId: selectedVendorId, costPerUnit: parsed.caseCost.toString(), unit: parsed.purchaseUom || 'case',
                caseCost: parsed.caseCost.toString(), purchaseUom: parsed.purchaseUom || 'case', packQty: parsed.parsed.packQty,
                innerSize: parsed.parsed.innerSize?.toString(), innerUnit: parsed.parsed.innerUnit,
                perPieceCost: parsed.costs.perPieceCost?.toString(), perBaseUnitCost: parsed.costs.perBaseUnitCost?.toString(),
                totalBaseUnits: parsed.parsed.totalBaseUnits?.toString(), vendorSku: parsed.vendorSku, packSizeRaw: parsed.rawPackSize,
              };
            }
          } else if (detectedFormat === 'excel_simple') {
            const categoryName = row.Category || row.category;
            const itemName = row.Item || row.item;
            const cleanCurrency = (v: string | number): number => { if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(/[$,]/g, '').trim()); return isNaN(n) ? 0 : n; };
            const cost = cleanCurrency(row.Cost || row.cost || '');
            if (!itemName || itemName.trim() === '') { errors.push({ row: rn, field: 'Item', message: 'Item name is required' }); failedCount++; continue; }
            const categoryMatch = categories.find((c: any) => c.name.toLowerCase() === (categoryName || '').toLowerCase());
            let selectedVendorId = vendorId;
            if (!selectedVendorId && vendors.length > 0) selectedVendorId = vendors[0].id;
            itemData = {
              name: itemName.trim(), description: categoryName || null, categoryId: categoryMatch?.id || null,
              vendorId: selectedVendorId, locationId, quantity: '0', unit: 'each', costPerUnit: cost.toString(),
              purchaseUnit: 'each', recipeUnit: 'each', conversionFactor: '1', costPerPurchaseUnit: cost.toString(), reorderLevel: '0',
            };
          } else {
            if (!row.name?.trim()) { errors.push({ row: rn, field: 'name', message: 'Name is required' }); failedCount++; continue; }
            if (!row.quantity || isNaN(parseFloat(row.quantity))) { errors.push({ row: rn, field: 'quantity', message: 'Valid quantity is required' }); failedCount++; continue; }
            if (!row.unit?.trim()) { errors.push({ row: rn, field: 'unit', message: 'Unit is required' }); failedCount++; continue; }
            if (!row.costPerUnit || isNaN(parseFloat(row.costPerUnit))) { errors.push({ row: rn, field: 'costPerUnit', message: 'Valid cost per unit is required' }); failedCount++; continue; }
            let categoryId = null;
            if (row.categoryName?.trim()) {
              const cat = categories.find((c: any) => c.name.toLowerCase() === row.categoryName.trim().toLowerCase());
              if (!cat) { errors.push({ row: rn, field: 'categoryName', message: `Category '${row.categoryName}' not found` }); failedCount++; continue; }
              categoryId = cat.id;
            }
            let selectedVendorId = null;
            if (row.vendorName?.trim()) {
              const v = vendors.find((v: any) => v.name.toLowerCase() === row.vendorName.trim().toLowerCase());
              if (!v) { errors.push({ row: rn, field: 'vendorName', message: `Vendor '${row.vendorName}' not found` }); failedCount++; continue; }
              selectedVendorId = v.id;
            }
            itemData = {
              name: row.name.trim(), description: row.description?.trim() || null, categoryId, vendorId: selectedVendorId,
              locationId, quantity: parseFloat(row.quantity).toString(), unit: row.unit.trim(),
              costPerUnit: parseFloat(row.costPerUnit).toString(), reorderLevel: row.reorderLevel ? parseFloat(row.reorderLevel).toString() : '0',
              barcode: row.sku?.trim() || null,
            };
          }

          const validatedData = insertInventoryItemSchema.parse(itemData);
          const item = await storage.createInventoryItem(validatedData);
          if (vendorPricingData && item.id) {
            try { await db.insert(vendorPriceCatalog).values({ ...vendorPricingData, inventoryItemId: item.id }); } catch (e) { console.error('Failed to create vendor pricing:', e); }
          }
          if (detectedFormat === 'standard' && parseFloat(validatedData.quantity || '0') > 0) {
            await storage.createInventoryTransaction({ inventoryItemId: item.id, locationId, type: 'in', quantity: validatedData.quantity?.toString() || '0', reference: 'CSV Import', createdBy: userId });
          }
          successCount++;
        } catch (error: any) {
          errors.push({ row: rn, field: 'general', message: error.message || 'Failed to process row' });
          failedCount++;
        }
      }

      res.json({ success: successCount, failed: failedCount, errors: errors.slice(0, 100), totalRows: results.length, format: detectedFormat });
    } catch (error: any) {
      console.error('Error importing CSV:', error);
      res.status(500).json({ message: error.message || 'Failed to import CSV file' });
    }
  });

  // Purchase Orders
  app.get('/api/purchase-orders', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const orders = await storage.getPurchaseOrders(req.query.locationId as string);
      res.json(orders);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      res.status(500).json({ message: 'Failed to fetch purchase orders' });
    }
  });

  app.get('/api/purchase-orders/:id', isAuthenticated, async (req, res) => {
    try {
      const order = await storage.getPurchaseOrder(req.params.id);
      if (!order) return res.status(404).json({ message: 'Purchase order not found' });
      if (order.locationId && !await assertLocationAccess(req, res, order.locationId)) return;
      res.json(order);
    } catch (error) {
      console.error('Error fetching purchase order:', error);
      res.status(500).json({ message: 'Failed to fetch purchase order' });
    }
  });

  app.post('/api/purchase-orders', isAuthenticated, async (req, res) => {
    try {
      const orderData = {
        orderNumber: `PO-${Date.now()}`,
        vendorId: req.body.vendorId,
        locationId: req.body.locationId,
        status: req.body.status || 'draft',
        orderDate: req.body.orderDate ? new Date(req.body.orderDate) : new Date(),
        expectedDeliveryDate: req.body.expectedDeliveryDate?.trim() ? new Date(req.body.expectedDeliveryDate) : null,
        totalAmount: req.body.totalAmount,
        notes: req.body.notes || null,
        createdBy: req.user!.id,
      };
      if (!orderData.locationId) return res.status(400).json({ message: 'Restaurant required' });
      if (!await assertLocationAccess(req, res, orderData.locationId) || !assertPermission(req, res, Permission.MANAGE_PURCHASE_ORDERS)) return;
      if (orderData.status === 'delivered') return res.status(400).json({ message: 'Create the order, add items, then receive it.' });
      if (orderData.vendorId) {
        const vendor = await storage.getVendor(orderData.vendorId);
        if (!vendor || vendor.locationId !== orderData.locationId) return res.status(400).json({ message: 'Vendor belongs to another restaurant' });
      }
      const order = await storage.createPurchaseOrder(orderData);
      res.status(201).json(order);
    } catch (error) {
      console.error('Error creating purchase order:', error);
      res.status(400).json({ message: 'Failed to create purchase order' });
    }
  });

  app.put('/api/purchase-orders/:id', isAuthenticated, async (req, res) => {
    try {
      const currentOrder = await storage.getPurchaseOrder(req.params.id);
      if (!currentOrder) return res.status(404).json({ message: 'Purchase order not found' });
      if (currentOrder.locationId && !await assertLocationAccess(req, res, currentOrder.locationId)) return;
      const orderData = {
        vendorId: req.body.vendorId,
        status: req.body.status,
        orderDate: req.body.orderDate ? new Date(req.body.orderDate) : undefined,
        expectedDeliveryDate: req.body.expectedDeliveryDate?.trim() ? new Date(req.body.expectedDeliveryDate) : null,
        totalAmount: req.body.totalAmount,
        notes: req.body.notes || null,
      };
      if (!assertPermission(req, res, Permission.MANAGE_PURCHASE_ORDERS)) return;
      if (!assertSameLocation(res, currentOrder.locationId, req.body.locationId)) return;
      if (orderData.vendorId) {
        const vendor = await storage.getVendor(orderData.vendorId);
        if (!vendor || vendor.locationId !== currentOrder.locationId) return res.status(400).json({ message: 'Vendor belongs to another restaurant' });
      }
      let confirmedItems;
      if (req.body.receivedItems !== undefined) {
        if (!Array.isArray(req.body.receivedItems) || req.body.receivedItems.some((item: unknown) => !item || typeof item !== 'object' || typeof (item as { id?: unknown }).id !== 'string' || typeof (item as { quantity?: unknown }).quantity !== 'string')) {
          return res.status(400).json({ message: 'Invalid received item quantities.' });
        }
        confirmedItems = req.body.receivedItems as Array<{ id: string; quantity: string }>;
      }
      const order = await storage.updatePurchaseOrder(req.params.id, orderData, req.user!.id, confirmedItems);
      res.json(order);
    } catch (error) {
      console.error('Error updating purchase order:', error);
      res.status(error instanceof ReceivingError ? 400 : 500).json({ message: error instanceof ReceivingError ? error.message : 'Failed to update purchase order. No inventory was received.' });
    }
  });

  app.delete('/api/purchase-orders/:id', isAuthenticated, async (req, res) => {
    try {
      const order = await storage.getPurchaseOrder(req.params.id);
      if (!order) return res.status(404).json({ message: 'Purchase order not found' });
      if (order.locationId && !await assertLocationAccess(req, res, order.locationId)) return;
      if (!assertPermission(req, res, Permission.MANAGE_PURCHASE_ORDERS)) return;
      if (order.status === 'delivered') return res.status(400).json({ message: 'Received orders cannot be deleted.' });
      await storage.deletePurchaseOrder(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      res.status(400).json({ message: 'Failed to delete purchase order' });
    }
  });

  app.get('/api/purchase-orders/:id/items', isAuthenticated, async (req, res) => {
    try {
      const order = await storage.getPurchaseOrder(req.params.id);
      if (!order) return res.status(404).json({ message: 'Purchase order not found' });
      if (order.locationId && !await assertLocationAccess(req, res, order.locationId)) return;
      res.json(order.items || []);
    } catch (error) {
      console.error('Error fetching purchase order items:', error);
      res.status(500).json({ message: 'Failed to fetch purchase order items' });
    }
  });

  app.post('/api/purchase-order-items', isAuthenticated, async (req, res) => {
    try {
      const itemData = insertPurchaseOrderItemSchema.parse(req.body);
      if (!itemData.purchaseOrderId) return res.status(400).json({ message: "Purchase order ID required" });
      const order = await storage.getPurchaseOrder(itemData.purchaseOrderId);
      if (!order) return res.status(404).json({ message: 'Purchase order not found' });
      if (order.locationId && !await assertLocationAccess(req, res, order.locationId)) return;
      if (!assertPermission(req, res, Permission.MANAGE_PURCHASE_ORDERS)) return;
      const linked = itemData.inventoryItemId ? await storage.getInventoryItem(itemData.inventoryItemId) : undefined;
      if (!linked || linked.locationId !== order.locationId) return res.status(400).json({ message: 'Order item must belong to this restaurant.' });
      const item = await storage.addPurchaseOrderItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      console.error('Error adding purchase order item:', error);
      res.status(400).json({ message: 'Failed to add purchase order item' });
    }
  });

  app.delete('/api/purchase-order-items/:id', isAuthenticated, async (req, res) => {
    try {
      const item = await storage.getPurchaseOrderItem(req.params.id);
      if (!item?.purchaseOrderId) return res.status(404).json({ message: 'Order item not found' });
      const order = await storage.getPurchaseOrder(item.purchaseOrderId);
      if (!order || !await assertLocationAccess(req, res, order.locationId)) return;
      if (!assertPermission(req, res, Permission.MANAGE_PURCHASE_ORDERS)) return;
      await storage.removePurchaseOrderItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error removing purchase order item:', error);
      res.status(400).json({ message: 'Failed to remove purchase order item' });
    }
  });

  // Waste Tracking
  app.get('/api/waste', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const entries = await storage.getWasteEntries(req.query.locationId as string);
      res.json(entries);
    } catch (error) {
      console.error('Error fetching waste entries:', error);
      res.status(500).json({ message: 'Failed to fetch waste entries' });
    }
  });

  app.post('/api/waste', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const wasteData = insertWasteEntrySchema.parse({ ...req.body, reportedBy: req.user!.id });
      const entry = await storage.createWasteEntry(wasteData);
      res.status(201).json(entry);
    } catch (error) {
      console.error('Error creating waste entry:', error);
      res.status(error instanceof StockError ? 400 : 500).json({ message: error instanceof StockError ? error.message : 'Failed to record waste. No stock was changed.' });
    }
  });

  app.get('/api/waste/stats', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const locationId = req.query.locationId as string;
      const stats = await storage.getWasteStats(startDate ? new Date(startDate as string) : undefined, endDate ? new Date(endDate as string) : undefined, locationId);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching waste stats:', error);
      res.status(500).json({ message: 'Failed to fetch waste stats' });
    }
  });

  // Inventory Transactions
  app.get('/api/transactions', isAuthenticated, async (req, res) => {
    try {
      const itemId = req.query.itemId as string;
      const locationId = req.query.locationId as string;
      if (itemId) {
        const item = await storage.getInventoryItem(itemId);
        if (!item) return res.status(404).json({ message: 'Inventory item not found' });
        if (item.locationId && !await assertLocationAccess(req, res, item.locationId)) return;
      } else {
        if (!locationId) return res.status(400).json({ message: 'locationId required' });
        if (!await assertLocationAccess(req, res, locationId)) return;
      }
      const transactions = await storage.getInventoryTransactions(itemId, locationId);
      res.json(transactions);
    } catch (error) {
      console.error('Error fetching inventory transactions:', error);
      res.status(500).json({ message: 'Failed to fetch inventory transactions' });
    }
  });

  app.post('/api/transactions', isAuthenticated, async (req, res) => {
    try {
      const transactionData = insertInventoryTransactionSchema.parse({ ...req.body, createdBy: req.user!.id });
      if (transactionData.locationId && !await assertLocationAccess(req, res, transactionData.locationId)) return;
      if (!assertPermission(req, res, Permission.MANAGE_INVENTORY)) return;
      const linked = transactionData.inventoryItemId ? await storage.getInventoryItem(transactionData.inventoryItemId) : undefined;
      if (!linked || linked.locationId !== transactionData.locationId) return res.status(400).json({ message: 'Transaction item belongs to another restaurant.' });
      const transaction = await storage.createInventoryTransaction({ ...transactionData, createdBy: req.user!.id });
      res.status(201).json(transaction);
    } catch (error) {
      console.error('Error creating inventory transaction:', error);
      res.status(400).json({ message: 'Failed to create inventory transaction' });
    }
  });

  // Sales
  app.post('/api/sales/transactions', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const { locationId, totalAmount, paymentMethod, customerCount, posTransactionId, items } = req.body;
      if (!locationId || !totalAmount || !items || !Array.isArray(items)) return res.status(400).json({ message: 'Missing required fields' });
      const transactionId = await storage.recordSalesTransaction(locationId, parseFloat(totalAmount), paymentMethod || 'cash', customerCount || 1, posTransactionId || null, items, req.user!.id);
      res.json({ transactionId, message: 'Sales transaction recorded successfully' });
    } catch (error) {
      console.error('Error recording sales transaction:', error);
      res.status(500).json({ message: 'Failed to record sales transaction' });
    }
  });

  app.get('/api/sales/transactions/:locationId', isAuthenticated, async (req, res) => {
    try {
      const { locationId } = req.params;
      if (!await assertLocationAccess(req, res, locationId)) return;
      const limit = parseInt(req.query.limit as string) || 50;
      const transactions = await storage.getSalesTransactions(locationId, limit);
      res.json(transactions);
    } catch (error) {
      console.error('Error fetching sales transactions:', error);
      res.status(500).json({ message: 'Failed to fetch sales transactions' });
    }
  });

  app.get('/api/sales/analytics/:locationId', isAuthenticated, async (req, res) => {
    try {
      const { locationId } = req.params;
      if (!await assertLocationAccess(req, res, locationId)) return;
      const transactions = await storage.getSalesTransactions(locationId, 1000);
      const totalRevenue = transactions.reduce((sum: number, t: any) => sum + parseFloat(t.totalAmount), 0);
      const totalTransactions = transactions.length;
      const averageTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
      const stockLevels = await storage.getRemainingStockLevels(locationId);
      const totalInventoryValue = stockLevels.reduce((sum: number, item: any) => sum + item.totalValue, 0);
      const lowStockItems = stockLevels.filter((item: any) => item.isLowStock);
      res.json({
        salesSummary: { totalRevenue, totalTransactions, averageTransaction },
        inventorySummary: { totalInventoryValue, totalItems: stockLevels.length, lowStockItems: lowStockItems.length },
        stockLevels,
        recentTransactions: transactions.slice(0, 10),
      });
    } catch (error) {
      console.error('Error fetching sales analytics:', error);
      res.status(500).json({ message: 'Failed to fetch sales analytics' });
    }
  });
}
