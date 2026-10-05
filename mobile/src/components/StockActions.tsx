import React,{useState} from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { colors } from '../lib/colors';
import { apiFetch } from '../lib/api';
import { countPurchaseQuantity, type UnitItem } from '../../../shared/inventoryUnits';
export function StockActions({item}:{item:UnitItem & {id:string};}) {
  const qc=useQueryClient();const [mode,setMode]=useState<'count'|'receive'>('count');
  const [purchases,setPurchases]=useState('0'),[containers,setContainers]=useState('0'),[loose,setLoose]=useState('0'),[received,setReceived]=useState('1'),[unit,setUnit]=useState(item.purchaseUnit);
  const [key,setKey]=useState(()=>`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const mutation=useMutation({mutationFn:()=>apiFetch(`/api/inventory/${item.id}/${mode}`,{method:'POST',body:JSON.stringify(mode==='count'?{purchases,containers,loose}:{quantity:received,unit,requestKey:key})}),onSuccess:()=>{qc.invalidateQueries({queryKey:['inventory']});qc.invalidateQueries({queryKey:['dashboard']});setKey(`${Date.now()}-${Math.random().toString(36).slice(2)}`);}});
  let summary='';try{summary=`Total: ${Number(countPurchaseQuantity(item,purchases,containers,loose))} ${item.purchaseUnit}`;}catch(error){summary=error instanceof Error?error.message:'';}
  const button=(label:string,action:()=>void,disabled=false)=><TouchableOpacity disabled={mutation.isPending || disabled} accessibilityRole="button" onPress={action} style={{backgroundColor:colors.accent,padding:12,borderRadius:10}}><Text style={{color:'#fff',fontWeight:'600'}}>{label}</Text></TouchableOpacity>;
  return <View style={{gap:12,marginVertical:16}}><View style={{flexDirection:'row',gap:10}}>{button('Physical count',()=>{setMode('count');mutation.reset();})}{button('Receive stock',()=>{setMode('receive');mutation.reset();})}</View>
    {(mode==='count'?[[`Full ${item.purchaseUnit}`,purchases,setPurchases],[`Loose ${item.containerUnit || 'containers'}`,containers,setContainers],[`Loose ${item.recipeUnit}`,loose,setLoose]]:[['Received quantity',received,setReceived],['Received unit',unit,setUnit]]).map(([label,value,set]:any)=><View key={label}><Text style={{color:colors.muted,marginBottom:6}}>{label}</Text><TextInput accessibilityLabel={label} style={{padding:12,color:colors.text,borderWidth:1,borderColor:colors.border,borderRadius:10}} editable={!mutation.isPending} value={value} keyboardType={label==='Received unit'?'default':'decimal-pad'} autoCapitalize="none" onChangeText={v=>{set(v);mutation.reset();}}/></View>)}
    <Text selectable style={{color:colors.muted}}>{mode==='count'?summary:`Receive in ${[item.purchaseUnit,item.containerUnit,item.recipeUnit].filter(Boolean).join(', ')}.`}</Text>
    {mutation.error && <Text selectable accessibilityRole="alert" style={{color:colors.danger}}>{mutation.error.message}</Text>}{mutation.isSuccess && <Text style={{color:colors.success}}>Stock saved.</Text>}
    {mutation.isPending?<ActivityIndicator color={colors.accent}/>:button(mode==='count'?'Save Physical Count':'Receive Stock',()=>mutation.mutate(),mutation.isSuccess)}
  </View>;
}
