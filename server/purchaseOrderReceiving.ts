import { stockQuantity } from './stockOperations';
import { precise, type Packaging } from '@shared/inventoryUnits';
import { and, eq, sql } from 'drizzle-orm';
import { inventoryItems, inventoryTransactions, purchaseOrderItems, purchaseOrders, type InsertPurchaseOrder } from '@shared/schema';
import type { db } from './db';

export class ReceivingError extends Error {}
export type ReceiptConfirmation = Array<{ id: string; quantity: string }>;

export function planReceipts(items: Array<{ inventoryItemId: string | null; quantity: string }>) {
  if (!items.length) throw new ReceivingError('Add line items before receiving this order.');
  const totals = new Map<string, bigint>();
  for (const item of items) {
    if (!item.inventoryItemId) throw new ReceivingError('Every order line must be linked to an inventory item before receiving.');
    if (!/^\d+(\.\d{1,2})?$/.test(item.quantity)) throw new ReceivingError('Order quantities must be positive numbers.');
    const [whole, fraction = ''] = item.quantity.split('.');
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (cents <= 0n) throw new ReceivingError('Order quantities must be positive numbers.');
    totals.set(item.inventoryItemId, (totals.get(item.inventoryItemId) ?? 0n) + cents);
  }
  // Consistent inventory row ordering avoids deadlocks across simultaneous orders.
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([id, cents]) => ({
    id, quantity: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`,
  }));
}

export async function updateOrderAndReceive(database: Pick<typeof db, 'transaction'>, id: string, changes: Partial<InsertPurchaseOrder>, receivedBy?: string, confirmedItems?: ReceiptConfirmation) {
  return database.transaction(async tx => {
    const [current] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for('update');
    if (!current) throw new ReceivingError('Purchase order not found.');
    if (current.status === 'delivered' && changes.status && changes.status !== 'delivered') {
      throw new ReceivingError('A received order cannot be reopened. Use an inventory adjustment to correct stock.');
    }
    if (changes.status === 'delivered' && current.status !== 'delivered') {
      if (!['draft', 'sent', 'confirmed'].includes(current.status ?? '')) throw new ReceivingError('This order cannot be received.');
      if (!receivedBy) throw new ReceivingError('A signed-in user is required to receive an order.');
      const lines = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id)).for('update');
      if (confirmedItems && (confirmedItems.length !== lines.length || new Set(confirmedItems.map(item => item.id)).size !== lines.length || lines.some(line => !confirmedItems.some(item => item.id === line.id && item.quantity === line.quantity)))) {
        throw new ReceivingError('This order changed after you checked its quantities. Refresh and confirm the items again.');
      }
      planReceipts(lines); // Validate every line before any stock write.
      const ids=[...new Set(lines.map(l=>l.inventoryItemId!))].sort();
      for (const itemId of ids) {
        const [item]=await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id,itemId),eq(inventoryItems.locationId,current.locationId))).for('update');
        if(!item) throw new ReceivingError('An order item is missing or belongs to a different restaurant. Inventory was not changed.');
        let total=0;
        for(const line of lines.filter(l=>l.inventoryItemId===itemId)) {
          const snapshot=line.packaging as (Packaging & {purchaseUnit?:string}) | null;
          total+=Number(stockQuantity(item,line.quantity,snapshot?.purchaseUnit || item.purchaseUnit,snapshot || undefined));
        }
        const quantity=precise(total);
        await tx.update(inventoryItems).set({quantity:sql`${inventoryItems.quantity} + ${quantity}::numeric`,updatedAt:new Date()}).where(and(eq(inventoryItems.id,itemId),eq(inventoryItems.locationId,current.locationId))).returning({id:inventoryItems.id});
        await tx.insert(inventoryTransactions).values({inventoryItemId:itemId,locationId:current.locationId,type:'in',quantity,reference:`PO-${current.orderNumber || id}`,stockUnit:item.purchaseUnit,conversionSnapshot:lines.filter(l=>l.inventoryItemId===itemId).map(l=>l.packaging || item),notes:'Received from purchase order',createdBy:receivedBy});
      }
    }
    const [result] = await tx.update(purchaseOrders).set({ ...changes, updatedAt: new Date() }).where(eq(purchaseOrders.id, id)).returning();
    return result;
  });
}
