import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "@/contexts/LocationContext";
import { BarUpgradePrompt } from "@/components/bar/bar-upgrade-prompt";
import { apiRequest } from "@/lib/queryClient";
import { DollarSign, Beer, Martini, FlaskConical, Package, Percent, ArrowRight, Save } from "lucide-react";
import { Link, useLocation as useRoute } from "wouter";

/**
 * BeverageCostingPage
 *
 * Calculator-first page for Spirits, Kegs/Draft, Cocktails, and Mixers.
 * Pulls from Inventory when available but works with ad-hoc inputs too.
 *
 * Assumptions for inventory rows if selected via dropdowns:
 *  - `family`: 'spirit' | 'beer_keg' | 'mixer_can' (optional but helps filtering)
 *  - `baseUnit`: 'ml' | 'oz' | 'piece'
 *  - `costPerBaseUnit`: number (server-normalized recommended)
 *  - Optional helpers: packageMl, packageCost, gallons, canSizeOz, caseCost, cansPerCase
 */

// --- Helpers (kept local to make this file drop-in) ---
const ML_PER_OUNCE = 29.5735;
const OZ_PER_GALLON = 128;

function ozToMl(oz: number) { return oz * ML_PER_OUNCE; }
function mlToOz(ml: number) { return ml / ML_PER_OUNCE; }

function spiritCostPerOunceFromInventory(item: any) {
  // Prefer costPerBaseUnit if baseUnit is ml; otherwise derive from package fields
  if (!item) return 0;
  if (item.baseUnit === 'ml' && typeof item.costPerBaseUnit === 'number') {
    return item.costPerBaseUnit * ML_PER_OUNCE;
  }
  const bottleMl = Number(item.packageMl) || 0;
  const bottleCost = Number(item.packageCost) || 0;
  if (bottleMl > 0 && bottleCost > 0) return bottleCost / mlToOz(bottleMl);
  return 0;
}

function spiritCostPerOunce(bottleMl: number, bottleCost: number) {
  if (!bottleMl || !bottleCost) return 0;
  return bottleCost / mlToOz(bottleMl);
}

function poursPerBottle(bottleMl: number, pourOz: number, lossPct = 0) {
  if (!bottleMl || !pourOz) return 0;
  const usableMl = bottleMl * (1 - lossPct / 100);
  return usableMl / ozToMl(pourOz);
}

function priceFromTarget(cost: number, targetPct: number) {
  if (!cost || !targetPct) return 0;
  return cost / (targetPct / 100);
}

function kegPints(kegGallons: number, pintOz: number, wastePct = 0) {
  if (!kegGallons || !pintOz) return 0;
  const totalOz = kegGallons * OZ_PER_GALLON;
  return (totalOz * (1 - wastePct / 100)) / pintOz;
}

function toMoney(n: number) {
  if (!isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

export default function BeverageCostingPage() {
  const { currentLocation, hasBarAccess } = useLocation();
  const { toast } = useToast();
  const [, navigate] = useRoute();

  // Inventory fetch (single query, we filter client-side by family hints)
  const { data: inventoryItems = [], isLoading: invLoading } = useQuery<any[]>({
    queryKey: ['/api/inventory', currentLocation?.id],
    queryFn: () => apiRequest('GET', `/api/inventory?locationId=${currentLocation?.id}`).then(r => r.json()),
    enabled: !!currentLocation,
  });

  // --- Spirits Card State ---
  const spirits = useMemo(() => (inventoryItems as any[]).filter(i => (i.family === 'spirit') || i.baseUnit === 'ml'), [inventoryItems]);
  const [spiritId, setSpiritId] = useState<string>('');
  const [bottleMl, setBottleMl] = useState<number>(1000);
  const [bottleCost, setBottleCost] = useState<number>(16.25);
  const [pourOz, setPourOz] = useState<number>(1.5);
  const [lossPct, setLossPct] = useState<number>(3);
  const [targetPourPct, setTargetPourPct] = useState<number>(20);

  const selectedSpirit = spirits.find(s => s.id === spiritId);
  const spiritCPO = useMemo(() => {
    if (selectedSpirit) return spiritCostPerOunceFromInventory(selectedSpirit);
    return spiritCostPerOunce(bottleMl, bottleCost);
  }, [selectedSpirit, bottleMl, bottleCost]);

  const spiritCostPerPour = spiritCPO * pourOz;
  const spiritSuggested = priceFromTarget(spiritCostPerPour, targetPourPct);
  const spiritPours = useMemo(() => {
    const ml = selectedSpirit ? Number(selectedSpirit.packageMl) || bottleMl : bottleMl;
    return poursPerBottle(ml, pourOz, lossPct);
  }, [selectedSpirit, bottleMl, pourOz, lossPct]);

  // --- Keg Card State ---
  const kegs = useMemo(() => (inventoryItems as any[]).filter(i => i.family === 'beer_keg'), [inventoryItems]);
  const [kegId, setKegId] = useState<string>('');
  const [kegGallons, setKegGallons] = useState<number>(15.5); // 1/2 bbl default
  const [kegCost, setKegCost] = useState<number>(180);
  const [pintOz, setPintOz] = useState<number>(16);
  const [wastePct, setWastePct] = useState<number>(8);
  const [targetBeerPct, setTargetBeerPct] = useState<number>(25);

  const selectedKeg = kegs.find(k => k.id === kegId);
  const kegPintsCount = useMemo(() => {
    const gal = selectedKeg ? Number(selectedKeg.gallons) || kegGallons : kegGallons;
    return Math.floor(kegPints(gal, pintOz, wastePct));
  }, [selectedKeg, kegGallons, pintOz, wastePct]);

  const costPerPint = useMemo(() => {
    const gal = selectedKeg ? Number(selectedKeg.gallons) || kegGallons : kegGallons;
    const totalOz = gal * OZ_PER_GALLON;
    const usableOz = totalOz * (1 - wastePct / 100);
    const cpo = usableOz > 0 ? (kegCost / usableOz) : 0;
    return cpo * pintOz;
  }, [selectedKeg, kegGallons, pintOz, wastePct, kegCost]);

  const kegSuggested = priceFromTarget(costPerPint, targetBeerPct);

  // --- Mixers Card State (cans) ---
  const mixers = useMemo(() => (inventoryItems as any[]).filter(i => (i.family === 'mixer_can') || i.baseUnit === 'piece'), [inventoryItems]);
  const [mixerId, setMixerId] = useState<string>('');
  const [caseCost, setCaseCost] = useState<number>(39);
  const [cansPerCase, setCansPerCase] = useState<number>(24); // e.g., 6 four-packs
  const [canSizeOz, setCanSizeOz] = useState<number>(8.4); // Red Bull small can
  const [sellCanPrice, setSellCanPrice] = useState<number>(4.0);
  const [targetMixerPct, setTargetMixerPct] = useState<number>(70); // higher margin typical for NAs
  const [usedOz, setUsedOz] = useState<number>(4); // how many oz used in a mixed drink

  const selectedMixer = mixers.find(m => m.id === mixerId);
  const cans = cansPerCase || 1;
  const costPerCan = (caseCost || 0) / cans;
  const costPerOzMixer = canSizeOz ? costPerCan / canSizeOz : 0;
  const costUsedPortion = costPerOzMixer * usedOz;
  const suggestedCanPrice = priceFromTarget(costPerCan, targetMixerPct);
  const suggestedUpcharge = priceFromTarget(costUsedPortion, targetMixerPct);

  // --- Cocktail Card State (simple builder) ---
  type CtLine = { id: string; name: string; qtyOz: number; costPerOz: number };
  const [ctLines, setCtLines] = useState<CtLine[]>([
    { id: crypto.randomUUID(), name: 'Base Spirit', qtyOz: 1.5, costPerOz: spiritCPO || 0 },
  ]);
  const [ctGarnishCost, setCtGarnishCost] = useState<number>(0.2);
  const [ctLossPct, setCtLossPct] = useState<number>(2);
  const [ctTargetPct, setCtTargetPct] = useState<number>(22);

  // Update first line costPerOz when spirit changes
  const baseSpiritCPO = spiritCPO;
  const cocktailLines = useMemo(() => {
    if (!ctLines.length) return [] as CtLine[];
    return ctLines.map((l, idx) => idx === 0 ? { ...l, costPerOz: baseSpiritCPO } : l);
  }, [ctLines, baseSpiritCPO]);

  const cocktailCost = useMemo(() => {
    const ingCost = cocktailLines.reduce((s, l) => s + (l.qtyOz * (l.costPerOz || 0)), 0);
    const lossAdj = ingCost * (ctLossPct / 100);
    return ingCost + lossAdj + (ctGarnishCost || 0);
  }, [cocktailLines, ctGarnishCost, ctLossPct]);

  const cocktailSuggested = priceFromTarget(cocktailCost, ctTargetPct);

  function addCtLine() {
    setCtLines(prev => [...prev, { id: crypto.randomUUID(), name: '', qtyOz: 1, costPerOz: 0 }]);
  }
  function updateCtLine(id: string, patch: Partial<CtLine>) {
    setCtLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }
  function removeCtLine(id: string) {
    setCtLines(prev => prev.filter(l => l.id !== id));
  }

  async function saveToMenu() {
    // Build cocktail name from ingredients
    const cocktailName = cocktailLines[0]?.name || 'Cocktail';
    
    // Convert calculator lines to menu item ingredients
    const ingredients = cocktailLines
      .filter(line => line.name && line.qtyOz > 0)
      .map(line => {
        // Try to find matching inventory item by name
        const inventoryItem = (inventoryItems as any[]).find(
          item => item.name?.toLowerCase().includes(line.name.toLowerCase()) || 
                  item.displayName?.toLowerCase().includes(line.name.toLowerCase())
        );
        
        return {
          inventoryItemId: inventoryItem?.id || '',
          quantity: line.qtyOz,
          unit: 'oz'
        };
      })
      .filter(ing => ing.inventoryItemId); // Only include items we found in inventory
    
    if (ingredients.length === 0) {
      toast({
        title: "Cannot save",
        description: "Add ingredients from your inventory to save to menu",
        variant: "destructive"
      });
      return;
    }

    try {
      await apiRequest('POST', '/api/menu-items', {
        name: cocktailName,
        description: `Cost: $${cocktailCost.toFixed(2)} | Suggested: $${cocktailSuggested.toFixed(2)}`,
        category: 'cocktail',
        price: cocktailSuggested.toFixed(2),
        locationId: currentLocation?.id,
        ingredients
      });

      toast({
        title: "Success!",
        description: `${cocktailName} saved to menu`,
      });

      // Navigate to menu page
      navigate('/beverage-menu');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save to menu",
        variant: "destructive"
      });
    }
  }

  // Autofill selection handlers
  function onPickSpirit(id: string) {
    setSpiritId(id);
    const s = spirits.find(x => x.id === id);
    if (!s) return;
    const ml = Number(s.packageMl) || 1000;
    const cost = Number(s.packageCost) || (s.costPerBaseUnit && s.baseUnit === 'ml' ? s.costPerBaseUnit * ml : 0) || 0;
    setBottleMl(ml);
    setBottleCost(cost);
  }

  function onPickKeg(id: string) {
    setKegId(id);
    const k = kegs.find(x => x.id === id);
    if (!k) return;
    const gal = Number(k.gallons) || kegGallons;
    const cost = Number(k.packageCost) || Number(k.kegCost) || kegCost;
    setKegGallons(gal);
    setKegCost(cost);
  }

  function onPickMixer(id: string) {
    setMixerId(id);
    const m = mixers.find(x => x.id === id);
    if (!m) return;
    const cpc = Number(m.cansPerCase) || cansPerCase;
    const cc = Number(m.caseCost) || caseCost;
    const csize = Number(m.canSizeOz) || canSizeOz;
    setCansPerCase(cpc);
    setCaseCost(cc);
    setCanSizeOz(csize);
  }

  if (!hasBarAccess) return <BarUpgradePrompt locationName={currentLocation?.name || "this location"} />;

  return (
    <div className="p-3 lg:p-6 space-y-6 bg-slate-950 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-3xl font-bold text-white">Beer & Liquor Costing</h1>
          <p className="text-xs lg:text-sm text-slate-400 mt-1">Use inventory presets or type ad‑hoc values. All prices are suggestions based on your target %.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/beverage-menu">
            <Button variant="outline" className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700">
              <Martini className="h-4 w-4 mr-2" />
              Go to Menu
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
          {currentLocation && (
            <Badge variant="secondary" className="bg-slate-800 text-slate-300">{currentLocation.name}</Badge>
          )}
        </div>
      </div>

      {/* Spirits (Bottle) */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2"><FlaskConical className="h-5 w-5"/> Spirits (Bottle)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400">Pick from Inventory</label>
              <Select disabled={invLoading || !spirits.length} value={spiritId} onValueChange={onPickSpirit}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white"><SelectValue placeholder={invLoading? 'Loading…' : spirits.length? 'Select spirit' : 'No spirits in inventory'} /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600 max-h-72">
                  {spirits.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.displayName || s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Bottle Size (mL)</label>
                <Input type="number" value={bottleMl} onChange={e=>setBottleMl(Number(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Bottle Cost ($)</label>
                <Input type="number" step="0.01" value={bottleCost} onChange={e=>setBottleCost(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400">Pour (oz)</label>
                <Input type="number" step="0.25" value={pourOz} onChange={e=>setPourOz(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Loss/Spillage %</label>
                <Input type="number" step="0.1" value={lossPct} onChange={e=>setLossPct(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Target Pour Cost %</label>
                <Input type="number" step="0.1" value={targetPourPct} onChange={e=>setTargetPourPct(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Cost / oz</span><span className="font-semibold">{toMoney(spiritCPO)}</span></div>
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Cost / pour</span><span className="font-semibold">{toMoney(spiritCostPerPour)}</span></div>
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Suggested price</span><span className="font-semibold">{toMoney(spiritSuggested)}</span></div>
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Pours / bottle (net)</span><span className="font-semibold">{Math.floor(spiritPours)}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Kegs / Draft */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2"><Beer className="h-5 w-5"/> Draft Beer (Kegs)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400">Pick Keg (Inventory)</label>
              <Select disabled={invLoading || !kegs.length} value={kegId} onValueChange={onPickKeg}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white"><SelectValue placeholder={invLoading? 'Loading…' : kegs.length? 'Select keg' : 'No kegs in inventory'} /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600 max-h-72">
                  {kegs.map(k => (
                    <SelectItem key={k.id} value={k.id}>{(k.displayName || k.name)}{k.gallons? ` • ${k.gallons} gal` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Keg Size (gal)</label>
                <Input type="number" step="0.01" value={kegGallons} onChange={e=>setKegGallons(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Keg Cost ($)</label>
                <Input type="number" step="0.01" value={kegCost} onChange={e=>setKegCost(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400">Pour (oz)</label>
                <Input type="number" value={pintOz} onChange={e=>setPintOz(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Waste %</label>
                <Input type="number" step="0.1" value={wastePct} onChange={e=>setWastePct(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Target Pour Cost %</label>
                <Input type="number" step="0.1" value={targetBeerPct} onChange={e=>setTargetBeerPct(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Cost / pint</span><span className="font-semibold">{toMoney(costPerPint)}</span></div>
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Suggested price</span><span className="font-semibold">{toMoney(kegSuggested)}</span></div>
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Pints / keg (net)</span><span className="font-semibold">{kegPintsCount}</span></div>
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Gross / keg @ suggested</span><span className="font-semibold">{toMoney(kegPintsCount * kegSuggested)}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Mixers & Cans */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2"><Package className="h-5 w-5"/> Mixers & Cans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400">Pick Mixer (Inventory)</label>
              <Select disabled={invLoading || !mixers.length} value={mixerId} onValueChange={onPickMixer}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white"><SelectValue placeholder={invLoading? 'Loading…' : mixers.length? 'Select mixer' : 'No mixers in inventory'} /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600 max-h-72">
                  {mixers.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.displayName || m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400">Case Cost ($)</label>
                <Input type="number" step="0.01" value={caseCost} onChange={e=>setCaseCost(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Cans / Case</label>
                <Input type="number" value={cansPerCase} onChange={e=>setCansPerCase(parseInt(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Can Size (oz)</label>
                <Input type="number" step="0.1" value={canSizeOz} onChange={e=>setCanSizeOz(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400">Use in Drink (oz)</label>
                <Input type="number" step="0.1" value={usedOz} onChange={e=>setUsedOz(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Target Margin %</label>
                <Input type="number" step="0.1" value={targetMixerPct} onChange={e=>setTargetMixerPct(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Sell Price / Can ($)</label>
                <Input type="number" step="0.01" value={sellCanPrice} onChange={e=>setSellCanPrice(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Cost / can</span><span className="font-semibold">{toMoney(costPerCan)}</span></div>
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Cost / oz</span><span className="font-semibold">{toMoney(costPerOzMixer)}</span></div>
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Cost used (drink)</span><span className="font-semibold">{toMoney(costUsedPortion)}</span></div>
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Suggested can price</span><span className="font-semibold">{toMoney(suggestedCanPrice)}</span></div>
            <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Suggested mixer upcharge</span><span className="font-semibold">{toMoney(suggestedUpcharge)}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Cocktails (Simple Builder) */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2"><Martini className="h-5 w-5"/> Cocktail Builder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {cocktailLines.map((l, idx) => (
              <div key={l.id} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <label className="text-xs text-slate-400">Ingredient {idx === 0 ? '(Base Spirit)' : ''}</label>
                  <Input value={l.name} onChange={e=>updateCtLine(l.id,{name:e.target.value})} className="bg-slate-800 border-slate-600 text-white"/>
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-slate-400">Qty (oz)</label>
                  <Input type="number" step="0.1" value={l.qtyOz} onChange={e=>updateCtLine(l.id,{qtyOz:parseFloat(e.target.value)||0})} className="bg-slate-800 border-slate-600 text-white"/>
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-slate-400">Cost / oz ($)</label>
                  <Input type="number" step="0.001" value={idx===0? baseSpiritCPO : l.costPerOz} onChange={e=>idx!==0 && updateCtLine(l.id,{costPerOz:parseFloat(e.target.value)||0})} disabled={idx===0} className="bg-slate-800 border-slate-600 text-white"/>
                </div>
                <div className="col-span-1">
                  {idx>0 && (
                    <Button variant="outline" onClick={()=>removeCtLine(l.id)} className="w-full">−</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={addCtLine}>+ Add ingredient</Button>
            <div className="grid grid-cols-3 gap-3 ml-auto">
              <div>
                <label className="text-xs text-slate-400">Garnish/Glass ($)</label>
                <Input type="number" step="0.01" value={ctGarnishCost} onChange={e=>setCtGarnishCost(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Loss %</label>
                <Input type="number" step="0.1" value={ctLossPct} onChange={e=>setCtLossPct(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
              <div>
                <label className="text-xs text-slate-400">Target Cost %</label>
                <Input type="number" step="0.1" value={ctTargetPct} onChange={e=>setCtTargetPct(parseFloat(e.target.value)||0)} className="bg-slate-800 border-slate-600 text-white"/>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Total cost</span><span className="font-semibold">{toMoney(cocktailCost)}</span></div>
              <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>Suggested price</span><span className="font-semibold">{toMoney(cocktailSuggested)}</span></div>
              <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>At 20% pour</span><span className="font-semibold">{toMoney(priceFromTarget(cocktailCost, 20))}</span></div>
              <div className="p-3 bg-slate-800 rounded flex items-center justify-between"><span>At 25% pour</span><span className="font-semibold">{toMoney(priceFromTarget(cocktailCost, 25))}</span></div>
            </div>
            <Button 
              onClick={saveToMenu}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Cocktail to Menu
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-slate-400 flex items-center gap-1"><Percent className="h-3 w-3"/> All suggestions are computed as price = cost ÷ (target%/100). Adjust targets to match your program.</p>
    </div>
  );
}
