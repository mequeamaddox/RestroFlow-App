import { ingredientCost } from '@shared/inventoryUnits';
export type InventoryItem = {
  id: string;
  name: string;
  unit?: string; purchaseUnit?: string; recipeUnit?: string; conversionFactor?: string;
  containersPerPurchase?: string | null; containerUnit?: string | null; amountPerContainer?: string | null; contentUnit?: string | null;
  innerUnit?: string | null;
  pricePerInnerUnit?: number | string | null;
  pricePerOz?: number | string | null;
  pricePerLb?: number | string | null;
  pricePerGa?: number | string | null;
  costPerUnit?: number | string | null;
  // Conversion fields for universal recipe costing
  piecesPerLb?: number | string | null;
  ozPerPiece?: number | string | null;
  ozPerCup?: number | string | null;
  cupsPerGa?: number | string | null;
  yieldPct?: number | string | null;
  gradeLow?: number | null;
  gradeHigh?: number | null;
};

const OZ_PER_LB = 16;
const OZ_PER_GA = 128;
const G_PER_OZ = 28.349523125;
const TBSP_PER_OZ = 2;
const TSP_PER_TBSP = 3;
const CUP_OZ_DEFAULT = 8;

export function getPricePerOz(item: InventoryItem): number | null {
  if (item.pricePerOz != null) return Number(item.pricePerOz);

  if (item.pricePerLb != null) return Number(item.pricePerLb) / OZ_PER_LB;
  if (item.pricePerGa != null) return Number(item.pricePerGa) / OZ_PER_GA;

  if (
    item.innerUnit &&
    item.innerUnit.toUpperCase() === "OZ" &&
    item.pricePerInnerUnit != null
  ) {
    return Number(item.pricePerInnerUnit);
  }

  if (item.costPerUnit != null) return null;
  return null;
}

export function computeLineCost(
  item: InventoryItem,
  quantity: number,
  unit: string
): number {
  if(item.purchaseUnit && item.recipeUnit && item.conversionFactor) {
    try { return ingredientCost({...item,unit:item.unit || item.purchaseUnit,purchaseUnit:item.purchaseUnit,recipeUnit:item.recipeUnit,conversionFactor:item.conversionFactor,costPerUnit:String(item.costPerUnit || 0)},quantity,unit); }
    catch { return NaN; } // Never show a guessed zero cost for incompatible units.
  }
  const u = (unit || "").toLowerCase();
  
  // Parse conversion values (handle both string and number types from database)
  const piecesPerLb = item.piecesPerLb != null ? Number(item.piecesPerLb) : null;
  const ozPerPiece = item.ozPerPiece != null ? Number(item.ozPerPiece) : null;
  const ozPerCup = item.ozPerCup != null ? Number(item.ozPerCup) : CUP_OZ_DEFAULT;
  const cupsPerGa = item.cupsPerGa != null ? Number(item.cupsPerGa) : 16;
  const yieldPct = item.yieldPct != null ? Number(item.yieldPct) : 100;

  // Universal oz price if possible
  const pricePerOz =
    (item.pricePerOz != null ? Number(item.pricePerOz) : null) ??
    (item.pricePerLb != null ? Number(item.pricePerLb) / OZ_PER_LB : null) ??
    (item.pricePerGa != null ? Number(item.pricePerGa) / OZ_PER_GA : null);

  // Helper: apply yield (need more raw to end cooked qty)
  const applyYield = (cookedQty: number) => cookedQty / (yieldPct / 100);

  // PIECE pricing
  if (u === "piece") {
    // Try ozPerPiece conversion first (e.g., 6oz burger patties)
    if (ozPerPiece && pricePerOz != null) {
      const cookedOz = quantity * ozPerPiece;
      const rawOz = applyYield(cookedOz);
      return rawOz * pricePerOz;
    }
    
    // Try piecesPerLb conversion (e.g., wings, shrimp)
    const pplb = piecesPerLb ?? (
      item.gradeLow && item.gradeHigh ? (item.gradeLow + item.gradeHigh) / 2 : null
    );
    if (item.pricePerLb != null && pplb && pplb > 0) {
      const rawLb = applyYield(quantity / pplb);
      return rawLb * Number(item.pricePerLb);
    }
    
    // Try count-based pricing (e.g., disposables)
    if (item.innerUnit?.toUpperCase() === "CT" && item.pricePerInnerUnit != null) {
      return quantity * Number(item.pricePerInnerUnit);
    }
    
    // Fallback to costPerUnit for legacy items
    if (item.costPerUnit != null) {
      return quantity * Number(item.costPerUnit);
    }
    
    return 0;
  }

  // MASS/VOLUME → price via oz if possible
  if (pricePerOz != null) {
    let cookedOz = 0;
    if (u === "oz") cookedOz = quantity;
    else if (u === "lb") cookedOz = quantity * OZ_PER_LB;
    else if (u === "ga") cookedOz = quantity * OZ_PER_GA;
    else if (u === "cup") cookedOz = quantity * ozPerCup;
    else if (u === "tbsp") cookedOz = quantity / TBSP_PER_OZ;
    else if (u === "tsp") cookedOz = quantity / (TBSP_PER_OZ * TSP_PER_TBSP);
    else if (u === "g") cookedOz = quantity / G_PER_OZ;
    else if (u === "kg") cookedOz = (quantity * 1000) / G_PER_OZ;

    if (cookedOz > 0) {
      const rawOz = applyYield(cookedOz);
      return rawOz * pricePerOz;
    }
  }

  // Fallback to exact matching unit prices
  if (u === "lb" && item.pricePerLb != null) return applyYield(quantity) * Number(item.pricePerLb);
  if (u === "ga" && item.pricePerGa != null) return applyYield(quantity) * Number(item.pricePerGa);
  if (
    item.pricePerInnerUnit != null &&
    item.innerUnit &&
    item.innerUnit.toLowerCase() === u
  ) {
    return applyYield(quantity) * Number(item.pricePerInnerUnit);
  }

  // Final fallback to costPerUnit for legacy items
  if (item.costPerUnit != null) return quantity * Number(item.costPerUnit);
  return 0;
}
