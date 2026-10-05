import { and, eq } from 'drizzle-orm';
import { recipes, recipeIngredients, inventoryItems, type InsertRecipe } from '@shared/schema';
import { planIngredients } from './ingredientStock';
import { positive, convertMeasure, MEASURE_UNITS, unitKey } from '@shared/inventoryUnits';
import type { db } from './db';
export async function saveRecipe(database: Pick<typeof db,'transaction'>, id: string | undefined, data: Partial<InsertRecipe>, ingredients?: Array<{inventoryItemId:string;quantity:string;unit:string}>) {
  return database.transaction(async tx=>{
    const [old]=id ? await tx.select().from(recipes).where(eq(recipes.id,id)).for('update') : [];
    if(id && !old) throw new Error('Recipe not found.');
    const draft={...old,...data};
    if(!draft.locationId || !['dish','batch'].includes(draft.recipeKind || 'dish')) throw new Error('Choose a dish or batch recipe.');
    if(old && old.locationId!==draft.locationId) throw new Error('Recipes cannot move between restaurants.');
    if(old?.recipeKind==='batch' && draft.recipeKind!=='batch') throw new Error('Keep this batch recipe for its prepared stock; create a separate dish recipe.');
    const items=await tx.select().from(inventoryItems).where(eq(inventoryItems.locationId,draft.locationId)).orderBy(inventoryItems.id).for('update');
    if(ingredients!==undefined) planIngredients(ingredients,items,draft.locationId,1);
    if(draft.recipeKind==='batch') {
      positive(draft.expectedYield,'Expected batch yield');
      if(!draft.yieldUnit || !MEASURE_UNITS.some(u=>unitKey(u)===unitKey(draft.yieldUnit!))) throw new Error('Choose a weight, volume, or each yield unit.');
      convertMeasure(1,draft.yieldUnit,draft.yieldUnit);
      let output=draft.outputInventoryItemId ? items.find(i=>i.id===draft.outputInventoryItemId) : undefined;
      if(draft.outputInventoryItemId && (!output || output.itemKind!=='prepared')) throw new Error('Batch output must be prepared stock in this restaurant.');
      if(old?.outputInventoryItemId && old.outputInventoryItemId!==draft.outputInventoryItemId) throw new Error('A saved batch recipe must retain its output item.');
      if(output) convertMeasure(1,draft.yieldUnit,output.recipeUnit);
      if(!output) [output]=await tx.insert(inventoryItems).values({name:draft.name!,locationId:draft.locationId,itemKind:'prepared',unit:draft.yieldUnit,purchaseUnit:draft.yieldUnit,recipeUnit:draft.yieldUnit,conversionFactor:'1',quantity:'0',costPerUnit:'0',costPerPurchaseUnit:'0'}).returning();
      draft.outputInventoryItemId=output.id;
      if(ingredients?.some(i=>i.inventoryItemId===output.id)) throw new Error('A batch cannot consume its own output.');
    } else { draft.outputInventoryItemId=null; draft.expectedYield=null; draft.yieldUnit=null; }
    const values={...data,recipeKind:draft.recipeKind || 'dish',outputInventoryItemId:draft.outputInventoryItemId,expectedYield:draft.expectedYield,yieldUnit:draft.yieldUnit};
    const [saved]=id ? await tx.update(recipes).set({...values,updatedAt:new Date()}).where(eq(recipes.id,id)).returning() : await tx.insert(recipes).values(values as InsertRecipe).returning();
    if(ingredients!==undefined) {
      await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId,saved.id));
      if(ingredients.length) await tx.insert(recipeIngredients).values(ingredients.map(i=>({...i,recipeId:saved.id})));
    }
    return saved;
  });
}
