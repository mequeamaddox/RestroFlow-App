import { and, eq, sql } from 'drizzle-orm';
import { inventoryItems, inventoryTransactions } from '@shared/schema';
import { countPurchaseQuantity, positive, precise, toPurchaseQuantity, type Packaging } from '@shared/inventoryUnits';
import type { db } from './db';
type Database=Pick<typeof db,'transaction'>;
export async function countStock(database:Database,id:string,data:{purchases:string;containers:string;loose:string},actor:string) {
  return database.transaction(async tx=>{
    const [item]=await tx.select().from(inventoryItems).where(eq(inventoryItems.id,id)).for('update');
    if(!item)throw new Error('Item not found.');
    const quantity=countPurchaseQuantity(item,data.purchases,data.containers,data.loose);
    const [saved]=await tx.update(inventoryItems).set({quantity,updatedAt:new Date()}).where(eq(inventoryItems.id,id)).returning();
    await tx.insert(inventoryTransactions).values({inventoryItemId:id,locationId:item.locationId,type:'adjustment',quantity:precise(Number(quantity)-Number(item.quantity)),stockUnit:item.purchaseUnit,conversionSnapshot:item,reference:'Physical count',notes:JSON.stringify(data),createdBy:actor});
    return saved;
  });
}
export async function receiveSingleItem(database:Database,id:string,data:{quantity:string;unit:string;requestKey:string;packaging?:Packaging},actor:string) {
  if(!data.requestKey || data.requestKey.length>100)throw new Error('A receiving request key is required.');
  return database.transaction(async tx=>{
    const [item]=await tx.select().from(inventoryItems).where(eq(inventoryItems.id,id)).for('update');
    if(!item)throw new Error('Item not found.');
    const reference=`Receive-${id}-${data.requestKey}`;
    const [previous]=await tx.select().from(inventoryTransactions).where(and(eq(inventoryTransactions.inventoryItemId,id),eq(inventoryTransactions.reference,reference)));
    if(previous)return item;
    const quantity=precise(toPurchaseQuantity(item,positive(data.quantity,'Received quantity'),data.unit,data.packaging));
    const [saved]=await tx.update(inventoryItems).set({quantity:sql`${inventoryItems.quantity} + ${quantity}::numeric`,updatedAt:new Date()}).where(eq(inventoryItems.id,id)).returning();
    await tx.insert(inventoryTransactions).values({inventoryItemId:id,locationId:item.locationId,type:'in',quantity,stockUnit:item.purchaseUnit,conversionSnapshot:data.packaging || item,reference,createdBy:actor});
    return saved;
  });
}
