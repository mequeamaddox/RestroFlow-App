import { and, eq, sql, desc } from 'drizzle-orm';
import { inventoryItems, inventoryTransactions, recipeIngredients, recipeProductions, recipes, posSales, posSaleItems, posMenuItems, posIntegrations, posItemMappings } from '@shared/schema';
import { toPurchaseQuantity, precise, positive, convertMeasure, type UnitItem } from '@shared/inventoryUnits';
import type { db } from './db';

type Database = Pick<typeof db, 'transaction'>;
export interface BatchDraft { recipeId: string; locationId: string; batchMultiplier: string; actualYield: string; requestKey: string; batchNumber?: string; notes?: string; }
export function planIngredients(lines: Array<{inventoryItemId: string | null; quantity: string; unit: string}>, items: Array<UnitItem & {id: string; locationId: string}>, locationId: string, multiplier: number) {
  if (!lines.length) throw new Error('Add ingredients before using this recipe.');
  const totals=new Map<string,number>();
  for(const line of lines) {
    const item=items.find(i=>i.id===line.inventoryItemId && i.locationId===locationId);
    if(!item) throw new Error('An ingredient is missing or belongs to another restaurant.');
    const qty=toPurchaseQuantity(item,positive(line.quantity,'Ingredient quantity')*multiplier,line.unit);
    totals.set(item.id,(totals.get(item.id)||0)+qty);
  }
  return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([id,quantity])=>({id,quantity:precise(quantity)}));
}
export async function produceBatch(database: Database, draft: BatchDraft, actor: string) {
  const multiplier=positive(draft.batchMultiplier,'Number of batches'), actual=positive(draft.actualYield,'Actual yield');
  if(!actor || !draft.requestKey || draft.requestKey.length>100) throw new Error('A signed-in user and production request key are required.');
  return database.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${draft.locationId+':'+draft.requestKey}))`);
    const [previous]=await tx.select().from(recipeProductions).where(and(eq(recipeProductions.locationId,draft.locationId),eq(recipeProductions.requestKey,draft.requestKey)));
    if(previous) {
      if(previous.recipeId!==draft.recipeId || Number(previous.batchMultiplier)!==multiplier || Number(previous.quantityProduced)!==actual) throw new Error('This production request was already used for a different batch.');
      return previous;
    }
    const [recipe]=await tx.select().from(recipes).where(and(eq(recipes.id,draft.recipeId),eq(recipes.locationId,draft.locationId))).for('update');
    if(!recipe || recipe.recipeKind!=='batch' || !recipe.outputInventoryItemId || !recipe.yieldUnit || !recipe.expectedYield) throw new Error('Configure this as a batch recipe with an output item and expected yield first.');
    const lines=await tx.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId,recipe.id));
    const items=await tx.select().from(inventoryItems).where(eq(inventoryItems.locationId,draft.locationId)).orderBy(inventoryItems.id).for('update');
    const output=items.find(i=>i.id===recipe.outputInventoryItemId);
    if(!output || output.itemKind!=='prepared') throw new Error('Prepared output does not belong to this restaurant.');
    if(Number(output.quantity)<0) throw new Error('Count the prepared stock before making another batch; its balance is below zero.');
    const usage=planIngredients(lines,items,draft.locationId,multiplier);
    if(usage.some(u=>u.id===output.id)) throw new Error('A batch cannot consume its own output.');
    let totalCost=0;
    const snapshot=usage.map(u=>{
      const item=items.find(i=>i.id===u.id)!;
      if(Number(item.quantity)<Number(u.quantity)) throw new Error(`Not enough ${item.name}. Count or receive stock before making this batch.`);
      totalCost+=Number(u.quantity)*Number(item.costPerUnit);
      return {...u,name:item.name,stockUnit:item.purchaseUnit,ingredientQuantity:Number(u.quantity)*Number(item.conversionFactor),ingredientUnit:item.recipeUnit,unitCost:item.costPerUnit};
    });
    const outputQty=toPurchaseQuantity(output,actual,recipe.yieldUnit);
    const balance=Number(output.quantity)+outputQty;
    const outputCost=(Number(output.quantity)*Number(output.costPerUnit)+totalCost)/balance;
    const [production]=await tx.insert(recipeProductions).values({recipeId:recipe.id,locationId:draft.locationId,quantityProduced:precise(actual),batchMultiplier:precise(multiplier),yieldUnit:recipe.yieldUnit,requestKey:draft.requestKey,batchNumber:draft.batchNumber,notes:draft.notes,ingredientSnapshot:snapshot,actualCost:totalCost.toFixed(4),theoreticalCost:totalCost.toFixed(4),variance:'0',variancePercentage:'0',producedBy:actor}).returning();
    for(const u of usage) {
      const item=items.find(i=>i.id===u.id)!;
      await tx.update(inventoryItems).set({quantity:sql`${inventoryItems.quantity} - ${u.quantity}::numeric`,updatedAt:new Date()}).where(eq(inventoryItems.id,u.id));
      await tx.insert(inventoryTransactions).values({inventoryItemId:u.id,locationId:draft.locationId,type:'production_usage',quantity:precise(-Number(u.quantity)),unitCost:Number(item.costPerUnit).toFixed(6),totalCost:(Number(u.quantity)*Number(item.costPerUnit)).toFixed(2),reference:`Batch-${production.id}`,stockUnit:item.purchaseUnit,conversionSnapshot:item,createdBy:actor});
    }
    await tx.update(inventoryItems).set({quantity:precise(balance),costPerUnit:outputCost.toFixed(6),costPerPurchaseUnit:outputCost.toFixed(6),updatedAt:new Date()}).where(eq(inventoryItems.id,output.id));
    await tx.insert(inventoryTransactions).values({inventoryItemId:output.id,locationId:draft.locationId,type:'in',quantity:precise(outputQty),totalCost:totalCost.toFixed(2),reference:`Batch-${production.id}`,stockUnit:output.purchaseUnit,conversionSnapshot:output,createdBy:actor});
    return production;
  });
}

/** Entire sale either consumes all mapped ingredients once, or leaves stock unchanged for retry. */
export async function consumePosSale(database: Database, saleId: string) {
  return database.transaction(async tx=>{
    const [sale]=await tx.select().from(posSales).where(eq(posSales.id,saleId)).for('update');
    if(!sale || sale.inventoryProcessed) return;
    // Separate imported rows for the same provider order cannot consume stock twice.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sale.posIntegrationId+':'+sale.posOrderId}))`);
    const duplicates=await tx.select().from(posSales).where(and(eq(posSales.posIntegrationId,sale.posIntegrationId),eq(posSales.posOrderId,sale.posOrderId),eq(posSales.inventoryProcessed,true)));
    if(duplicates.length) { await tx.update(posSales).set({inventoryProcessed:true,processedAt:new Date()}).where(eq(posSales.id,saleId)); return; }
    const [integration]=await tx.select().from(posIntegrations).where(eq(posIntegrations.id,sale.posIntegrationId));
    if(!integration || integration.locationId!==sale.locationId) throw new Error('POS integration does not belong to the sale restaurant.');
    const sold=await tx.select().from(posSaleItems).where(eq(posSaleItems.posSaleId,saleId));
    if(!sold.length) throw new Error('Sale has no lines yet.');
    const menus=await tx.select().from(posMenuItems).where(eq(posMenuItems.posIntegrationId,sale.posIntegrationId));
    const items=await tx.select().from(inventoryItems).where(eq(inventoryItems.locationId,sale.locationId)).orderBy(inventoryItems.id).for('update');
    const total=new Map<string,number>();
    const add=(lines: Array<{inventoryItemId:string|null;quantity:string;unit:string}>, mult:number)=>{for(const u of planIngredients(lines,items,sale.locationId,mult))total.set(u.id,(total.get(u.id)||0)+Number(u.quantity));};
    for(const line of sold) {
      if(line.quantity<=0) throw new Error('Voids and refunds require review before changing stock.');
      const matches=menus.filter(m=>m.isActive && (line.posMenuItemId ? m.id===line.posMenuItemId : m.name.toLowerCase()===line.itemName.toLowerCase()));
      if(matches.length!==1) throw new Error(`Map ${line.itemName} to one POS menu item before processing stock.`);
      const menu=matches[0];
      const mappings=await tx.select().from(posItemMappings).where(eq(posItemMappings.posMenuItemId,menu.id));
      if(mappings.length) add(mappings.map(m=>({...m,quantity:m.quantityUsed})),line.quantity);
      else if(menu.recipeId) {
        const [recipe]=await tx.select().from(recipes).where(and(eq(recipes.id,menu.recipeId),eq(recipes.locationId,sale.locationId)));
        if(!recipe) throw new Error('POS recipe belongs to another restaurant.');
        if(recipe.recipeKind==='batch') throw new Error('Map sales to a dish recipe using prepared stock, rather than the batch-production recipe.');
        const ingredients=await tx.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId,recipe.id));
        add(ingredients,line.quantity/recipe.servingSize);
      } else if(menu.inventoryItemId) {
        const item=items.find(i=>i.id===menu.inventoryItemId);
        if(!item) throw new Error('POS inventory item belongs to another restaurant.');
        // A direct sale means one inner container, or one each for count-based ingredients.
        const unit=item.containerUnit || item.recipeUnit;
        if(!item.containerUnit && !['each','piece','pieces','ea'].includes(unit)) throw new Error(`Set a portion mapping for ${menu.name}; a sale has no weight or volume amount.`);
        add([{inventoryItemId:item.id,quantity:'1',unit}],line.quantity);
      } else throw new Error(`Map ${menu.name} to inventory or a dish recipe before processing stock.`);
    }
    for(const [id,quantity] of [...total].sort(([a],[b])=>a.localeCompare(b))) {
      const item=items.find(i=>i.id===id)!;
      // POS reflects sales that already happened. Negative stock is visible and must be counted, not silently ignored.
      await tx.update(inventoryItems).set({quantity:sql`${inventoryItems.quantity} - ${precise(quantity)}::numeric`,updatedAt:new Date()}).where(eq(inventoryItems.id,id));
      await tx.insert(inventoryTransactions).values({inventoryItemId:id,locationId:sale.locationId,type:'recipe_consumption',quantity:precise(-quantity),unitCost:Number(item.costPerUnit).toFixed(6),totalCost:(quantity*Number(item.costPerUnit)).toFixed(2),reference:`POS-${sale.posIntegrationId}-${sale.posOrderId}`,stockUnit:item.purchaseUnit,conversionSnapshot:item});
    }
    await tx.update(posSales).set({inventoryProcessed:true,processedAt:new Date()}).where(eq(posSales.id,saleId));
  });
}
