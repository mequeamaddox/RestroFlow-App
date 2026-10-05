import React,{useState} from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { PackagingFields } from './PackagingFields';
import { apiFetch } from '../lib/api';
import { colors } from '../lib/colors';
import type { UnitItem } from '../../../shared/inventoryUnits';
export function PackagingEdit({item}:{item:UnitItem & {id:string}}) {
  const qc=useQueryClient();const [open,setOpen]=useState(false),[draft,setDraft]=useState({...item});
  const mutation=useMutation({mutationFn:()=>apiFetch(`/api/inventory/${item.id}`,{method:'PUT',body:JSON.stringify({containersPerPurchase:draft.containersPerPurchase,containerUnit:draft.containerUnit,amountPerContainer:draft.amountPerContainer,contentUnit:draft.contentUnit,recipeUnit:draft.recipeUnit})}),onSuccess:()=>{qc.invalidateQueries({queryKey:['inventory']});setOpen(false);}});
  return <View style={{marginBottom:16}}><TouchableOpacity accessibilityRole="button" disabled={mutation.isPending} onPress={()=>{setDraft({...item});setOpen(!open);mutation.reset();}}><Text style={{color:colors.accent,fontWeight:'600'}}> {open?'Close packaging':'Edit case contents'}</Text></TouchableOpacity>
    {open && <View><Text style={{color:colors.muted,marginTop:12}}>Ingredient tracking unit</Text><TextInput accessibilityLabel="Ingredient tracking unit" style={{color:colors.text,padding:12,borderColor:colors.border,borderWidth:1,borderRadius:10}} value={draft.recipeUnit} editable={!mutation.isPending} autoCapitalize="none" onChangeText={recipeUnit=>setDraft({...draft,recipeUnit})}/><PackagingFields value={draft} recipeUnit={draft.recipeUnit} disabled={mutation.isPending} onChange={pack=>setDraft({...draft,...pack})}/><Text style={{color:colors.muted,fontSize:12}}>Changing an established pack preserves ingredient stock and inventory value. First-time setup confirms what is inside the existing purchase unit.</Text>{mutation.error && <Text selectable style={{color:colors.danger}}>{mutation.error.message}</Text>}<TouchableOpacity accessibilityRole="button" disabled={mutation.isPending} style={{padding:12,backgroundColor:colors.accent,borderRadius:10,marginTop:12}} onPress={()=>mutation.mutate()}><Text style={{color:'#fff',fontWeight:'700'}}>{mutation.isPending?'Saving…':'Save Packaging'}</Text></TouchableOpacity></View>}
  </View>;
}
