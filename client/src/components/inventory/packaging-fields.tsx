import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MEASURE_UNITS, packagingFactor, type Packaging } from '@shared/inventoryUnits';
export function PackagingFields({value,onChange,recipeUnit,disabled=false}:{value:Packaging;onChange:(pack:Packaging)=>void;recipeUnit:string;disabled?:boolean}) {
  let summary='Enter every packaging field to calculate the ingredient total.';
  try {summary=`Total per purchase: ${Number(packagingFactor(value,recipeUnit).toFixed(4))} ${recipeUnit}`;} catch(error) {if(value.containersPerPurchase && value.amountPerContainer) summary=error instanceof Error ? error.message : summary;}
  return <div className="space-y-3 rounded-lg border border-slate-700 p-3">
    <p className="text-sm font-semibold">Case / package contents</p>
    <div className="grid grid-cols-2 gap-3">
      {([['containersPerPurchase','Containers per purchase','4'],['containerUnit','Container type','jar'],['amountPerContainer','Amount in each container','1']] as const).map(([key,label,placeholder])=><div key={key}><Label>{label}</Label><Input aria-label={label} disabled={disabled} type={key==='containerUnit'?'text':'number'} min="0" step="any" placeholder={placeholder} value={value[key] ?? ''} onChange={e=>onChange({...value,[key]:e.target.value || null})}/></div>)}
      <div><Label>Contents measured in</Label><select aria-label="Contents measured in" disabled={disabled} className="h-10 w-full rounded-md border bg-background px-3" value={value.contentUnit || ''} onChange={e=>onChange({...value,contentUnit:e.target.value || null})}><option value="">Select measurement</option>{MEASURE_UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
    </div><p className="text-xs text-slate-400">{summary}</p>
  </div>;
}
