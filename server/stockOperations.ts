import { and, eq, sql } from 'drizzle-orm';
import { inventoryItems, inventoryTransactions, invoiceProcessing, vendorPriceCatalog, vendors, wasteEntries, type InsertWasteEntry } from '@shared/schema';
import { toPurchaseQuantity, positive, precise, hasPackaging, type UnitItem, type Packaging } from '@shared/inventoryUnits';
import type { db } from './db';

export class StockError extends Error {}
export function amount(value: unknown, label: string, positive = false): string {
  const text = String(value ?? '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text) || (positive && Number(text) <= 0)) throw new StockError(`${label} must be ${positive ? 'greater than zero' : 'zero or more'}, with at most two decimal places.`);
  return Number(text).toFixed(2);
}
export { unitKey } from '@shared/inventoryUnits';
export function stockQuantity(item: UnitItem, quantity: string, unit: string, receiptPack?: Packaging): string {
  let value: number;
  try { value = toPurchaseQuantity(item, positive(quantity, 'Quantity'), unit, receiptPack); }
  catch(error) { throw new StockError(error instanceof Error ? error.message : 'Invalid conversion'); }
  if (value < 0.00000001) throw new StockError('Quantity is too small to track.');
  return precise(value);
}
export async function recordWaste(database: Pick<typeof db, 'transaction'>, entry: InsertWasteEntry) {
  positive(entry.quantity, 'Waste quantity');
  return database.transaction(async tx => {
    if (!entry.inventoryItemId || !entry.reportedBy) throw new StockError('An inventory item and signed-in user are required.');
    const [item] = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id, entry.inventoryItemId), eq(inventoryItems.locationId, entry.locationId))).for('update');
    if (!item) throw new StockError('Inventory item does not belong to this restaurant.');
    const quantity = stockQuantity(item, entry.quantity, entry.unit);
    if (Number(quantity) > Number(item.quantity)) throw new StockError('Waste exceeds available stock. Confirm the inventory count first.');
    const cost = (Number(quantity) * Number(item.costPerUnit)).toFixed(2);
    await tx.update(inventoryItems).set({ quantity: sql`${inventoryItems.quantity} - ${quantity}::numeric`, updatedAt: new Date() }).where(eq(inventoryItems.id, item.id));
    const [saved] = await tx.insert(wasteEntries).values({ ...entry, cost }).returning();
    await tx.insert(inventoryTransactions).values({ inventoryItemId: item.id, locationId: entry.locationId, type: 'out', quantity, stockUnit: item.purchaseUnit, conversionSnapshot: item, reference: `Waste-${saved.id}`, notes: entry.notes, createdBy: entry.reportedBy });
    return saved;
  });
}
export interface InvoiceLine { description: string; quantity: number | string; unitType?: string; unitPrice: number | string; inventoryItemId?: string; packaging?: Packaging; }
export async function receiveInvoice(database: Pick<typeof db, 'transaction'>, id: string, data: any, actor: string) {
  return database.transaction(async tx => {
    const [invoice] = await tx.select().from(invoiceProcessing).where(eq(invoiceProcessing.id, id)).for('update');
    if (!invoice?.locationId) throw new StockError('Invoice has no restaurant assigned.');
    if (invoice.inventoryReceivedAt) return invoice; // repeat approval is a successful no-op
    if (['cancelled', 'disputed'].includes(invoice.status || '')) throw new StockError('Resolve this invoice before receiving it.');
    // Serialize new product creation and stock rows across invoices for a restaurant.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${invoice.locationId}))`);
    let raw = data.lineItems ?? invoice.lineItems;
    if (typeof raw === 'string') raw = JSON.parse(raw);
    if (!Array.isArray(raw) || !raw.length) throw new StockError('Review and add invoice line items before approving.');
    if (invoice.vendorId) {
      const [vendor] = await tx.select().from(vendors).where(and(eq(vendors.id, invoice.vendorId), eq(vendors.locationId, invoice.locationId)));
      if (!vendor) throw new StockError('Invoice vendor belongs to a different restaurant.');
    }
    if (data.receiveInventory !== undefined && typeof data.receiveInventory !== 'boolean') throw new StockError('Invalid inventory receiving choice.');
    const shouldReceive = data.receiveInventory !== false;
    const receivedLines = [];
    for (const line of raw as InvoiceLine[]) {
      const name = line.description?.trim();
      if (!name || name.length > 200) throw new StockError('Each invoice line needs an item name of up to 200 characters.');
      const quantity = amount(line.quantity, 'Invoice quantity', true);
      const price = amount(line.unitPrice, 'Invoice unit price');
      const unit = line.unitType?.trim() || 'each';
      if (unit.length > 20) throw new StockError('Invoice units must be at most 20 characters.');
      if (!shouldReceive) {
        receivedLines.push({ ...line, quantity: Number(quantity), unitPrice: Number(price), unitType: unit, totalPrice: Number(quantity) * Number(price) });
        continue;
      }
      const candidates = await tx.select().from(inventoryItems).where(eq(inventoryItems.locationId, invoice.locationId)).orderBy(inventoryItems.id).for('update');
      const matches = candidates.filter(item => item.name.trim().toLowerCase() === name.toLowerCase() && (!invoice.vendorId || !item.vendorId || item.vendorId === invoice.vendorId));
      let item = line.inventoryItemId ? candidates.find(item => item.id === line.inventoryItemId) : matches.length === 1 ? matches[0] : undefined;
      if (line.inventoryItemId && !item) throw new StockError('Selected inventory item does not belong to this restaurant.');
      if (!line.inventoryItemId && matches.length > 1) throw new StockError(`More than one inventory item matches ${name}. Select the item in invoice review.`);
      if (!item) [item] = await tx.insert(inventoryItems).values({ name, locationId: invoice.locationId, vendorId: invoice.vendorId, quantity: '0', unit, purchaseUnit: unit, recipeUnit: unit, conversionFactor: '1', costPerUnit: price, costPerPurchaseUnit: price }).returning();
      if (item.itemKind === 'prepared') throw new StockError('Prepared items are received through batch production, not vendor invoices.');
      const received = stockQuantity(item, quantity, unit, line.packaging);
      const stockPrice = (Number(price) * Number(quantity) / Number(received)).toFixed(6);
      await tx.update(inventoryItems).set({ quantity: sql`${inventoryItems.quantity} + ${received}::numeric`, costPerUnit: stockPrice, costPerPurchaseUnit: stockPrice, updatedAt: new Date() }).where(and(eq(inventoryItems.id, item.id), eq(inventoryItems.locationId, invoice.locationId)));
      await tx.insert(inventoryTransactions).values({ inventoryItemId: item.id, locationId: invoice.locationId, type: 'in', quantity: received, unitCost: stockPrice, stockUnit: item.purchaseUnit, conversionSnapshot: line.packaging || item, reference: `Invoice-${id}`, createdBy: actor });
      if (invoice.vendorId) {
        const [catalog] = await tx.select().from(vendorPriceCatalog).where(and(eq(vendorPriceCatalog.vendorId, invoice.vendorId), eq(vendorPriceCatalog.inventoryItemId, item.id)));
        const values = { costPerUnit: price, unit, updatedAt: new Date() };
        if (catalog) await tx.update(vendorPriceCatalog).set(values).where(eq(vendorPriceCatalog.id, catalog.id));
        else await tx.insert(vendorPriceCatalog).values({ ...values, vendorId: invoice.vendorId, inventoryItemId: item.id });
      }
      receivedLines.push({ ...line, inventoryItemId: item.id, quantity: Number(quantity), unitPrice: Number(price), unitType: unit, totalPrice: Number(quantity) * Number(price) });
    }
    const [saved] = await tx.update(invoiceProcessing).set({
      invoiceNumber: data.invoiceNumber ?? invoice.invoiceNumber,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : invoice.invoiceDate,
      total: data.total !== undefined ? amount(data.total, 'Invoice total') : invoice.total,
      subtotal: data.subtotal !== undefined ? amount(data.subtotal, 'Invoice subtotal') : invoice.subtotal,
      lineItems: receivedLines, fees: data.fees ?? invoice.fees,
      notes: !shouldReceive ? `${invoice.notes || ''}\nStock confirmed as already received; approval did not add inventory.`.trim() : invoice.notes,
      status: invoice.status === 'paid' ? 'paid' : 'approved', approvedBy: actor, inventoryReceivedAt: new Date(),
    }).where(eq(invoiceProcessing.id, id)).returning();
    return saved;
  });
}
