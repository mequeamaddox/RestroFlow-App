import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/queryClient';
export function BatchProduction({recipe,locationId}:{recipe:any;locationId:string}) {
  const qc=useQueryClient();const [multiplier,setMultiplier]=useState('1'),[actual,setActual]=useState(String(recipe.expectedYield || '')),[batchNumber,setBatchNumber]=useState(''),[key,setKey]=useState(()=>crypto.randomUUID());
  const history=useQuery<any[]>({queryKey:['/api/variance/production',locationId],queryFn:()=>apiRequest('GET',`/api/variance/production?locationId=${locationId}&startDate=2000-01-01&endDate=2100-01-01`).then(r=>r.json())});
  const mutation=useMutation({mutationFn:()=>apiRequest('POST','/api/variance/production',{recipeId:recipe.id,locationId,batchMultiplier:multiplier,actualYield:actual,requestKey:key,batchNumber}),onSuccess:()=>{setKey(crypto.randomUUID());qc.invalidateQueries({queryKey:['/api/inventory']});qc.invalidateQueries({queryKey:['/api/recipes']});qc.invalidateQueries({queryKey:['/api/variance/production']});qc.invalidateQueries({queryKey:['/api/dashboard/metrics']});}});
  return <div className="space-y-3 rounded-lg border border-slate-700 p-4">
    <h3 className="font-semibold">Make prepared batch</h3><p className="text-sm text-slate-400">One batch expects {Number(recipe.expectedYield)} {recipe.yieldUnit}. Ingredients are consumed once; the actual yield is added to prepared stock.</p>
    <div className="grid grid-cols-3 gap-3"><div><Label>Number of batches</Label><Input min="0" step="any" type="number" value={multiplier} disabled={mutation.isPending} onChange={e=>{setMultiplier(e.target.value);setActual(String(Number(e.target.value)*Number(recipe.expectedYield)));mutation.reset();}}/></div><div><Label>Actual yield ({recipe.yieldUnit})</Label><Input min="0" step="any" type="number" value={actual} disabled={mutation.isPending} onChange={e=>{setActual(e.target.value);mutation.reset();}}/></div><div><Label>Batch label (optional)</Label><Input value={batchNumber} disabled={mutation.isPending} onChange={e=>setBatchNumber(e.target.value)}/></div></div>
    {mutation.error && <p role="alert" className="text-red-400">{mutation.error.message}</p>}{mutation.isSuccess && <p role="status" className="text-green-400">Batch recorded. Ingredient and prepared stock updated.</p>}
    <Button type="button" disabled={mutation.isPending || mutation.isSuccess} onClick={()=>mutation.mutate()}>{mutation.isPending?'Recording…':'Record Batch'}</Button>{mutation.isSuccess && <Button type="button" variant="outline" onClick={()=>mutation.reset()}>Make another batch</Button>}
    {history.isError && <p className="text-sm text-red-400">Could not load history. <button type="button" onClick={()=>history.refetch()}>Retry</button></p>}
    {(history.data || []).filter(p=>p.recipeId===recipe.id).slice(0,5).map((p:any,index)=><p key={index} className="text-sm text-slate-400">Produced {p.quantityProduced} {recipe.yieldUnit} • ingredient cost ${Number(p.actualCost).toFixed(2)}</p>)}
  </div>;
}
