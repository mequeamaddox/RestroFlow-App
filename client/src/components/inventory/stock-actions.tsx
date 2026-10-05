import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/queryClient';
import { countPurchaseQuantity, packagingSummary, stockSummary, type UnitItem } from '@shared/inventoryUnits';
export function StockActions({item,onSuccess}:{item:UnitItem & {id:string;locationId:string};onSuccess:()=>void}) {
  const qc=useQueryClient();const [mode,setMode]=useState<'count'|'receive'>('count');
  const [purchases,setPurchases]=useState('0'),[containers,setContainers]=useState('0'),[loose,setLoose]=useState('0');
  const [received,setReceived]=useState('1'),[unit,setUnit]=useState(item.purchaseUnit),[key,setKey]=useState(()=>crypto.randomUUID());
  const mutation=useMutation({mutationFn:async()=>apiRequest('POST',`/api/inventory/${item.id}/${mode}`,mode==='count'?{purchases,containers,loose}:{quantity:received,unit,requestKey:key}),onSuccess:()=>{qc.invalidateQueries({queryKey:['/api/inventory']});qc.invalidateQueries({queryKey:['/api/dashboard/metrics']});setKey(crypto.randomUUID());onSuccess();}});
  let total='';try{total=`Count total: ${Number(countPurchaseQuantity(item,purchases,containers,loose))} ${item.purchaseUnit}`;}catch(error){total=error instanceof Error?error.message:'';}
  return <div className="space-y-3 border border-slate-700 rounded-lg p-3">
    <p className="text-sm">{packagingSummary(item)}</p><p className="text-sm text-slate-400">{stockSummary(item)}</p>
    <div className="flex gap-2"><Button type="button" variant={mode==='count'?'default':'outline'} disabled={mutation.isPending} onClick={()=>{setMode('count');mutation.reset();}}>Physical count</Button><Button type="button" variant={mode==='receive'?'default':'outline'} disabled={mutation.isPending} onClick={()=>{setMode('receive');mutation.reset();}}>Receive stock</Button></div>
    {mode==='count'?<><p className="text-xs text-slate-400">Enter separate amounts; do not include loose containers in the case count.</p><div className="grid grid-cols-3 gap-2">{[[`Full ${item.purchaseUnit}`,purchases,setPurchases],[`Loose ${item.containerUnit || 'containers'}`,containers,setContainers],[`Loose ${item.recipeUnit}`,loose,setLoose]].map(([label,value,set]:any)=><div key={label}><Label>{label}</Label><Input aria-label={label} type="number" min="0" step="any" value={value} onChange={e=>set(e.target.value)} disabled={mutation.isPending}/></div>)}</div><p className="text-xs">{total}</p></>:<div className="grid grid-cols-2 gap-2"><div><Label>Received quantity</Label><Input type="number" min="0" step="any" value={received} onChange={e=>setReceived(e.target.value)} disabled={mutation.isPending}/></div><div><Label>Unit</Label><select className="h-10 w-full border rounded-md bg-background" value={unit} onChange={e=>setUnit(e.target.value)} disabled={mutation.isPending}>{[...new Set([item.purchaseUnit,item.containerUnit,item.recipeUnit].filter(Boolean))].map(u=><option key={u!}>{u}</option>)}</select></div></div>}
    {mutation.error && <p role="alert" className="text-sm text-red-400">{mutation.error.message}</p>}
    <Button type="button" disabled={mutation.isPending} onClick={()=>mutation.mutate()}>{mutation.isPending?'Saving…':mode==='count'?'Save Physical Count':'Receive Stock'}</Button>
  </div>;
}
