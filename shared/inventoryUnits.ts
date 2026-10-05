/** Inventory balances remain in purchase units; ingredient amounts are derived, never guessed. */
export interface Packaging {
  containersPerPurchase?: string | number | null;
  containerUnit?: string | null;
  amountPerContainer?: string | number | null;
  contentUnit?: string | null;
}
export interface UnitItem extends Packaging {
  unit: string; purchaseUnit: string; recipeUnit: string; conversionFactor: string;
  quantity?: string | null; costPerUnit?: string; reorderLevel?: string;
}
export const MEASURE_UNITS = ['each', 'oz', 'lb', 'g', 'kg', 'fl oz', 'ml', 'L', 'cup', 'tbsp', 'tsp', 'gallon'] as const;
export function unitKey(unit: string): string {
  const key = unit.trim().toLowerCase();
  const aliases: Record<string, string> = { lbs:'lb', pound:'lb', pounds:'lb', ounces:'oz', pieces:'each', piece:'each', ea:'each', ct:'each', count:'each', cases:'case', boxes:'box', bottles:'bottle', cans:'can', jars:'jar', bags:'bag', packs:'pack', cups:'cup', gallons:'gallon', ga:'gallon', gal:'gallon', liter:'l', liters:'l', litre:'l', litres:'l', 'fluid ounce':'fl oz', 'fluid ounces':'fl oz', floz:'fl oz', fl_oz:'fl oz', milliliters:'ml' };
  return aliases[key] || key;
}
const measures: Record<string, [string, number]> = {
  each:['count',1], oz:['weight',28.349523125], lb:['weight',453.59237], g:['weight',1], kg:['weight',1000],
  'fl oz':['volume',29.5735295625], ml:['volume',1], l:['volume',1000], cup:['volume',236.5882365], tbsp:['volume',14.78676478125], tsp:['volume',4.92892159375], gallon:['volume',3785.411784],
};
export function convertMeasure(quantity: number, from: string, to: string): number {
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Quantity must be a finite, nonnegative number.');
  if (unitKey(from) === unitKey(to)) return quantity;
  const a=measures[unitKey(from)], b=measures[unitKey(to)];
  if (!a || !b || a[0] !== b[0]) throw new Error(`Cannot convert ${from} to ${to}. Weight, volume, and counts must stay separate.`);
  return quantity * a[1] / b[1];
}
export function positive(value: unknown, label: string): number {
  const text=String(value ?? '');
  if (!/^\d{1,8}(\.\d{1,8})?$/.test(text) || Number(text)<=0) throw new Error(`${label} must be greater than zero, with at most eight decimal places.`);
  return Number(text);
}
export function precise(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value)>=1e10) throw new Error('Converted quantity is outside the supported range.');
  return value.toFixed(8);
}
export function hasPackaging(item: Packaging): boolean { return item.containersPerPurchase != null && item.amountPerContainer != null && !!item.contentUnit && !!item.containerUnit; }
export function packagingFactor(pack: Packaging, recipeUnit: string): number {
  if (!pack.containerUnit?.trim() || pack.containerUnit.length>20) throw new Error('Enter the inner container unit, such as jar, bag, or bottle.');
  if (!pack.contentUnit || !measures[unitKey(pack.contentUnit)] || !measures[unitKey(recipeUnit)]) throw new Error('Choose a weight, volume, or each unit for the contents and ingredient tracking.');
  return convertMeasure(positive(pack.containersPerPurchase,'Containers per purchase') * positive(pack.amountPerContainer,'Amount per container'), pack.contentUnit, recipeUnit);
}
export function toPurchaseQuantity(item: UnitItem, quantity: number, fromUnit: string, receiptPack?: Packaging): number {
  const factor=positive(item.conversionFactor,'Ingredient conversion');
  const overridePresent=receiptPack && ['containersPerPurchase','containerUnit','amountPerContainer','contentUnit'].some(k=>(receiptPack as any)[k]!=null && (receiptPack as any)[k]!=='');
  if (overridePresent) {
    if (unitKey(fromUnit)!==unitKey(item.purchaseUnit)) throw new Error('Alternate packaging applies to purchase units only.');
    return quantity * packagingFactor(receiptPack!,item.recipeUnit) / factor;
  }
  if (unitKey(fromUnit)===unitKey(item.purchaseUnit)) return quantity;
  if (hasPackaging(item) && unitKey(fromUnit)===unitKey(item.containerUnit!)) return quantity / positive(item.containersPerPurchase,'Containers per purchase');
  if (unitKey(fromUnit)===unitKey(item.recipeUnit)) return quantity/factor;
  if (factor===1 && unitKey(fromUnit)===unitKey(item.unit)) return quantity;
  return convertMeasure(quantity,fromUnit,item.recipeUnit)/factor;
}
export function ingredientCost(item: UnitItem, quantity: number, unit: string): number { return toPurchaseQuantity(item,quantity,unit)*Number(item.costPerUnit || 0); }
export function packagingSummary(item: UnitItem): string {
  return hasPackaging(item) ? `1 ${item.purchaseUnit} = ${item.containersPerPurchase} ${item.containerUnit} × ${item.amountPerContainer} ${item.contentUnit} (${Number(item.conversionFactor)} ${item.recipeUnit})` : `1 ${item.purchaseUnit} = ${Number(item.conversionFactor)} ${item.recipeUnit}`;
}
export function stockSummary(item: UnitItem): string {
  const qty=Number(item.quantity || 0);
  return `${Number((qty*Number(item.conversionFactor)).toFixed(4))} ${item.recipeUnit} available`;
}
export function countPurchaseQuantity(item: UnitItem, purchases: string, containers: string, loose: string): string {
  const parse=(v:string)=> { if(!/^(\d{1,8}(\.\d{1,8})?)$/.test(v||'0')) throw new Error('Counts must be zero or more, with at most eight decimal places.'); return Number(v||0); };
  const a=parse(purchases),b=parse(containers),c=parse(loose);
  if (b && !hasPackaging(item)) throw new Error('Set the case contents before counting individual containers.');
  return precise(a+(b ? b/Number(item.containersPerPurchase):0)+c/positive(item.conversionFactor,'Ingredient conversion'));
}
export function normalizePackaging<T extends Record<string, any>>(draft:T): T {
  const present=['containersPerPurchase','containerUnit','amountPerContainer','contentUnit'].some(k=>draft[k]!=null && draft[k]!=='');
  if(!present) return draft;
  const result={...draft};
  const factor=packagingFactor(result,result.recipeUnit || result.unit);
  Object.assign(result,{purchaseUnit:result.purchaseUnit || result.unit,recipeUnit:result.recipeUnit || result.unit,conversionFactor:precise(factor),unit:result.purchaseUnit || result.unit});
  if(result.costPerUnit!=null) Object.assign(result,{costPerPurchaseUnit:result.costPerUnit});
  else if(result.costPerPurchaseUnit!=null) Object.assign(result,{costPerUnit:result.costPerPurchaseUnit});
  return result;
}
/** Changing an established pack preserves ingredient stock, reorder amount and total value. */
export function rebasePackaging(current: UnitItem, changes: Record<string,any>): Record<string,any> {
  const next=normalizePackaging({...current,...changes});
  if(hasPackaging(current) && !hasPackaging(next)) throw new Error('Keep the case contents for established stock; update the packaging instead of clearing it.');
  if(!hasPackaging(current)) return changes;
  const ratio=convertMeasure(Number(current.conversionFactor),current.recipeUnit,next.recipeUnit)/Number(next.conversionFactor);
  if(Math.abs(ratio-1)<1e-10) return changes;
  if(changes.quantity!==undefined && Number(changes.quantity)!==Number(current.quantity)) throw new Error('Save packaging changes separately from a stock count.');
  return {...changes,quantity:precise(Number(current.quantity)*ratio),reorderLevel:precise(Number(current.reorderLevel || 0)*ratio),costPerUnit:(Number(current.costPerUnit)/ratio).toFixed(6),costPerPurchaseUnit:(Number(current.costPerUnit)/ratio).toFixed(6)};
}
