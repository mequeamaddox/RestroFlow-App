import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "./helpers";
import { requireLocationAccess, assertLocationAccess } from "../securityMiddleware";
import { getAuth } from "@clerk/express";

function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map(line => {
    const cols = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
    return row;
  });
}

function splitCSVLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function toCSVRow(values: (string | number | null | undefined)[]): string {
  return values.map(v => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

export function registerCsvRoutes(app: Express): void {
  // ── Export inventory to CSV ───────────────────────────────────────────────
  app.get("/api/csv/export-inventory", isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const locationId = req.query.locationId as string | undefined;
      const items = await storage.getInventoryItems(locationId);
      const header = ["name", "category", "unit", "quantity", "cost_per_unit", "min_quantity", "supplier"];
      const rows = items.map(i => toCSVRow([
        i.name, i.category?.name ?? "", i.unit, i.quantity, i.costPerUnit ?? "",
        i.reorderLevel ?? "", i.vendor?.name ?? "",
      ]));
      const csv = [header.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=inventory.csv");
      res.send(csv);
    } catch (err) {
      console.error("CSV export inventory error:", err);
      res.status(500).json({ message: "Export failed" });
    }
  });

  // ── Export sales to CSV ───────────────────────────────────────────────────
  app.get("/api/csv/export-sales", isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const locationId = req.query.locationId as string | undefined;
      const sales = await storage.getPosSales(locationId);
      const header = ["date", "order_id", "total", "item_count"];
      const rows = sales.map(s => toCSVRow([
        new Date(s.orderDate).toISOString().slice(0, 10),
        s.posOrderId,
        s.total,
        (s.items ?? []).length,
      ]));
      const csv = [header.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=sales.csv");
      res.send(csv);
    } catch (err) {
      console.error("CSV export sales error:", err);
      res.status(500).json({ message: "Export failed" });
    }
  });

  // ── Import inventory from CSV ─────────────────────────────────────────────
  // Expects multipart OR raw text/csv body with Content-Type text/csv
  // Alternatively accepts JSON body { csv: "<raw csv string>", locationId }
  app.post("/api/csv/import-inventory", isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const { csv: rawCsv, locationId } = req.body;
      if (!rawCsv || typeof rawCsv !== "string") {
        return res.status(400).json({ message: "Provide { csv: '<csv string>', locationId } in the request body" });
      }
      if (!locationId) {
        return res.status(400).json({ message: "locationId is required" });
      }
      if (!await assertLocationAccess(req, res, locationId)) return;

      const { userId } = getAuth(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const rows = parseCSV(rawCsv);
      if (rows.length === 0) return res.status(400).json({ message: "No data rows found in CSV" });

      const categories = await storage.getCategories(locationId);
      const vendors = await storage.getVendors(locationId);
      let created = 0;
      let updated = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = row.name;
        if (!name) { errors.push(`Row ${i + 2}: missing name`); continue; }

        const unit = row.unit || "unit";
        const quantity = parseFloat(row.quantity || row.qty || "0");
        const costPerUnit = parseFloat(row.cost_per_unit || row.cost || row.price || "0");
        const category = row.category || null;
        const minQuantity = row.min_quantity || row.minimum ? Number(row.min_quantity || row.minimum) : undefined;
        const supplier = row.supplier || null;

        if (minQuantity !== undefined && !Number.isFinite(minQuantity)) { errors.push(`Row ${i + 2}: invalid minimum quantity`); continue; }
        if (isNaN(quantity)) { errors.push(`Row ${i + 2}: invalid quantity "${row.quantity}"`); continue; }

        try {
          let categoryRecord = category ? categories.find(c => c.name.toLowerCase() === category.toLowerCase()) : undefined;
          if (category && !categoryRecord) {
            categoryRecord = await storage.createCategory({ name: category, locationId });
            categories.push(categoryRecord);
          }
          let vendorRecord = supplier ? vendors.find(v => v.name.toLowerCase() === supplier.toLowerCase()) : undefined;
          if (supplier && !vendorRecord) {
            vendorRecord = await storage.createVendor({ name: supplier, locationId });
            vendors.push(vendorRecord);
          }
          // Fetch all items each time so additions in the same import are found
          const allItems = await storage.getInventoryItems(locationId);
          const existing = allItems.find(i => i.name.toLowerCase() === name.toLowerCase());
          if (existing) {
            await storage.updateInventoryItem(existing.id, {
              unit,
              quantity: String(quantity),
              ...(isNaN(costPerUnit) ? {} : { costPerUnit: String(costPerUnit) }),
              ...(categoryRecord ? { categoryId: categoryRecord.id } : {}),
              ...(minQuantity !== undefined ? { reorderLevel: String(minQuantity) } : {}),
              ...(vendorRecord ? { vendorId: vendorRecord.id } : {}),
            });
            updated++;
          } else {
            await storage.createInventoryItem({
              name,
              locationId,
              unit,
              quantity: String(quantity),
              costPerUnit: isNaN(costPerUnit) ? "0" : String(costPerUnit),
              categoryId: categoryRecord?.id,
              reorderLevel: String(minQuantity ?? 0),
              vendorId: vendorRecord?.id,
            });
            created++;
          }
        } catch (rowErr) {
          errors.push(`Row ${i + 2} (${name}): ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`);
        }
      }

      res.json({ created, updated, errors, total: rows.length });
    } catch (err) {
      console.error("CSV import inventory error:", err);
      res.status(500).json({ message: "Import failed" });
    }
  });

  // ── Import sales from CSV ─────────────────────────────────────────────────
  // Expected columns: date (YYYY-MM-DD), item_name, quantity, unit_price, total
  // Optional: order_id (generated if omitted)
  app.post("/api/csv/import-sales", isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const { csv: rawCsv, locationId, integrationId } = req.body;
      if (!rawCsv || typeof rawCsv !== "string") {
        return res.status(400).json({ message: "Provide { csv: '<csv string>', locationId } in the request body" });
      }
      if (!locationId) return res.status(400).json({ message: "locationId is required" });
      if (!await assertLocationAccess(req, res, locationId)) return;

      const rows = parseCSV(rawCsv);
      if (rows.length === 0) return res.status(400).json({ message: "No data rows found in CSV" });

      // Group rows by order_id (or date if no order_id)
      const orderMap = new Map<string, typeof rows>();
      for (const row of rows) {
        const orderId = row.order_id || `csv-${row.date}-${Math.random().toString(36).slice(2, 8)}`;
        if (!orderMap.has(orderId)) orderMap.set(orderId, []);
        orderMap.get(orderId)!.push(row);
      }

      // Find or create a CSV pseudo-integration for this location
      let csvIntegrationId = integrationId;
      if (!csvIntegrationId) {
        const integrations = await storage.getPosIntegrations(locationId);
        const existing = integrations.find(i => i.provider === "csv");
        if (existing) {
          csvIntegrationId = existing.id;
        } else {
          const created = await storage.createPosIntegration({
            provider: "csv",
            name: "CSV Import",
            merchantId: `csv-${locationId}`,
            credentials: {},
            environment: "production",
            locationId,
            isActive: true,
          });
          csvIntegrationId = created.id;
        }
      }

      let ordersCreated = 0;
      const errors: string[] = [];

      for (const [orderId, items] of orderMap.entries()) {
        try {
          const existing = await storage.getPosSaleByOrderId(csvIntegrationId, orderId);
          if (existing) continue;

          const total = items.reduce((sum, r) => sum + parseFloat(r.total || "0"), 0);
          const dateStr = items[0].date || new Date().toISOString().slice(0, 10);

          const sale = await storage.createPosSale({
            posOrderId: orderId,
            posIntegrationId: csvIntegrationId,
            locationId,
            total: String(total),
            orderDate: new Date(dateStr),
            inventoryProcessed: false,
          });

          for (const item of items) {
            await storage.createPosSaleItem({
              posSaleId: sale.id,
              itemName: item.item_name || item.name || "Unknown",
              quantity: parseFloat(item.quantity || "1"),
              unitPrice: item.unit_price || item.price || "0",
              totalPrice: item.total || "0",
            });
          }

          ordersCreated++;
        } catch (orderErr) {
          errors.push(`Order ${orderId}: ${orderErr instanceof Error ? orderErr.message : String(orderErr)}`);
        }
      }

      res.json({ ordersCreated, errors, totalRows: rows.length });
    } catch (err) {
      console.error("CSV import sales error:", err);
      res.status(500).json({ message: "Import failed" });
    }
  });

  // ── Download CSV templates ────────────────────────────────────────────────
  app.get("/api/csv/template-inventory", isAuthenticated, (_req, res) => {
    const csv = [
      "name,category,unit,quantity,cost_per_unit,min_quantity,supplier",
      '"Chicken Breast",Proteins,lbs,50.00,3.99,10.00,"US Foods"',
      '"Roma Tomatoes",Produce,each,200,0.35,50,',
      '"House Red Wine",Beverages,bottle,24,8.50,6,"Republic National"',
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=inventory_template.csv");
    res.send(csv);
  });

  app.get("/api/csv/template-sales", isAuthenticated, (_req, res) => {
    const csv = [
      "date,order_id,item_name,quantity,unit_price,total",
      "2024-01-15,ORD-001,Burger,2,12.99,25.98",
      "2024-01-15,ORD-001,Fries,2,3.99,7.98",
      "2024-01-15,ORD-002,Chicken Sandwich,1,13.99,13.99",
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=sales_template.csv");
    res.send(csv);
  });
}
