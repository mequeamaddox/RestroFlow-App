import React,{useState,useEffect} from 'react';
import { View,Text,TextInput,TouchableOpacity,ScrollView,ActivityIndicator,KeyboardAvoidingView,Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { colors } from '../lib/colors';
import { useSelectedLocation } from '../contexts/LocationContext';
import { QueryNotice } from '../components/QueryNotice';
import type { InventoryItem } from './InventoryScreen';

type Ingredient={inventoryItemId:string;quantity:string;unit:string};
type Recipe={id:string;name:string;recipeKind:string;expectedYield:string;yieldUnit:string;servingSize:number;description?:string;category:string;instructions:string;prepTime:number;cookTime:number;sellingPrice?:string;outputInventoryItemId?:string;ingredients?:Ingredient[]};
const newDraft=()=>({name:'',recipeKind:'batch',expectedYield:'',yieldUnit:'fl oz',servingSize:'1',category:'Prepared',instructions:'',prepTime:'15',cookTime:'0'});
const requestKey=()=>`${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function RecipesScreen() {
  const navigation=useNavigation();const insets=useSafeAreaInsets();const {locationId}=useSelectedLocation();const qc=useQueryClient();
  const [draft,setDraft]=useState(newDraft),[ingredients,setIngredients]=useState<Ingredient[]>([]),[creating,setCreating]=useState(false),[editId,setEditId]=useState<string|null>(null),[chosen,setChosen]=useState<Recipe|null>(null),[picker,setPicker]=useState<number|null>(null),[search,setSearch]=useState('');
  const [multiplier,setMultiplier]=useState('1'),[actual,setActual]=useState(''),[label,setLabel]=useState(''),[key,setKey]=useState(requestKey);
  const recipes=useQuery<Recipe[]>({queryKey:['recipes',locationId],queryFn:()=>apiFetch(`/api/recipes?locationId=${locationId}`),enabled:!!locationId});
  const stock=useQuery<InventoryItem[]>({queryKey:['inventory',locationId],queryFn:()=>apiFetch(`/api/inventory?locationId=${locationId}`),enabled:!!locationId});
  useEffect(()=>{setCreating(false);setChosen(null);setIngredients([]);setDraft(newDraft());setEditId(null);setKey(requestKey());},[locationId]);
  const invalidate=()=>{qc.invalidateQueries({queryKey:['inventory',locationId]});qc.invalidateQueries({queryKey:['recipes',locationId]});qc.invalidateQueries({queryKey:['dashboard']});};
  const save=useMutation({mutationFn:async()=>{
    if(!draft.name.trim() || !draft.instructions.trim() || !ingredients.length)throw new Error('Enter a name, instructions, and at least one ingredient.');
    if(!Number.isInteger(Number(draft.servingSize)) || Number(draft.servingSize)<1)throw new Error('Servings must be a whole number of at least one.');
    return apiFetch<Recipe>(editId?`/api/recipes/${editId}`:'/api/recipes',{method:editId?'PUT':'POST',body:JSON.stringify({...draft,servingSize:Number(draft.servingSize),prepTime:Number(draft.prepTime),cookTime:Number(draft.cookTime),expectedYield:draft.recipeKind==='batch'?draft.expectedYield:null,yieldUnit:draft.recipeKind==='batch'?draft.yieldUnit:null,outputInventoryItemId:editId?chosen?.outputInventoryItemId:undefined,locationId,ingredients})});
  },onSuccess:()=>{invalidate();setCreating(false);setIngredients([]);setDraft(newDraft());setEditId(null);setChosen(null);}});
  const edit=useMutation({mutationFn:(id:string)=>apiFetch<Recipe>(`/api/recipes/${id}`),onSuccess:r=>{setChosen(r);setDraft({name:r.name,recipeKind:r.recipeKind,expectedYield:r.expectedYield || '',yieldUnit:r.yieldUnit || 'fl oz',servingSize:String(r.servingSize),category:r.category,instructions:r.instructions,prepTime:String(r.prepTime),cookTime:String(r.cookTime)});setIngredients(r.ingredients || []);setEditId(r.id);setCreating(true);save.reset();}});
  const production=useMutation({mutationFn:()=>apiFetch('/api/variance/production',{method:'POST',body:JSON.stringify({recipeId:chosen!.id,locationId,batchMultiplier:multiplier,actualYield:actual,batchNumber:label,requestKey:key})}),onSuccess:()=>{invalidate();setKey(requestKey());}});
  const input=(label:string,value:string,onChange:(value:string)=>void,numeric=false)=><View style={{gap:6}}><Text style={{color:colors.muted}}>{label}</Text><TextInput accessibilityLabel={label} style={{color:colors.text,padding:12,borderWidth:1,borderColor:colors.border,borderRadius:10,backgroundColor:colors.surface}} placeholder={label} placeholderTextColor={colors.muted} value={value} onChangeText={onChange} editable={!save.isPending && !production.isPending} keyboardType={numeric?'decimal-pad':'default'}/></View>;
  const button=(text:string,action:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={action} style={{padding:12,backgroundColor:colors.accent,borderRadius:10,opacity:disabled?0.5:1}}><Text style={{color:'#fff',fontWeight:'700'}}>{text}</Text></TouchableOpacity>;
  return <KeyboardAvoidingView style={{flex:1,backgroundColor:colors.bg,paddingTop:insets.top}} behavior={Platform.OS==='ios'?'padding':'height'}>
    <View style={{flexDirection:'row',gap:16,padding:16,backgroundColor:colors.surface}}><TouchableOpacity accessibilityRole="button" onPress={()=>navigation.goBack()}><Text style={{color:colors.accent}}>← Back</Text></TouchableOpacity><Text style={{color:colors.text,fontSize:18,fontWeight:'700'}}>Recipes & Batches</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:insets.bottom+24,gap:14}}>
      {!creating && button('Add Recipe',()=>{setDraft(newDraft());setIngredients([]);setChosen(null);setEditId(null);setCreating(true);save.reset();})}
      {recipes.isLoading && <ActivityIndicator color={colors.accent}/>} {recipes.error && <QueryNotice message={recipes.error.message} onRetry={()=>{void recipes.refetch();}}/>}
      {stock.error && <QueryNotice message={`Could not load ingredients: ${stock.error.message}`} onRetry={()=>{void stock.refetch();}}/>}
      {creating ? <>
        <View style={{flexDirection:'row',gap:10}}>{button('Dish recipe',()=>setDraft({...draft,recipeKind:'dish'}),!!editId && chosen?.recipeKind==='batch')}{button('Prepared batch',()=>setDraft({...draft,recipeKind:'batch'}))}</View><Text style={{color:colors.text}}>Type: {draft.recipeKind==='batch'?'Prepared batch':'Dish / menu recipe'}</Text>
        {input('Recipe name',draft.name,name=>setDraft({...draft,name}))}{input('Category',draft.category,category=>setDraft({...draft,category}))}{input('Instructions',draft.instructions,instructions=>setDraft({...draft,instructions}))}
        {draft.recipeKind==='batch'?<>{input('Expected yield per batch',draft.expectedYield,expectedYield=>setDraft({...draft,expectedYield}),true)}{input('Yield unit (fl oz, lb, each…)',draft.yieldUnit,yieldUnit=>setDraft({...draft,yieldUnit}))}</>:input('Number of servings in recipe',draft.servingSize,servingSize=>setDraft({...draft,servingSize}),true)}
        {input('Prep minutes',draft.prepTime,prepTime=>setDraft({...draft,prepTime}),true)}
        <Text style={{color:colors.text,fontWeight:'700'}}>Ingredients for one recipe / batch</Text>
        {ingredients.map((ing,index)=><View key={index} style={{gap:10,padding:12,borderWidth:1,borderColor:colors.border,borderRadius:10}}><TouchableOpacity accessibilityRole="button" onPress={()=>{setPicker(index);setSearch('');}}><Text style={{color:colors.accent}}>{stock.data?.find(i=>i.id===ing.inventoryItemId)?.name || 'Choose ingredient'} ▾</Text></TouchableOpacity>{input('Ingredient quantity',ing.quantity,quantity=>setIngredients(ingredients.map((i,n)=>n===index?{...i,quantity}:i)),true)}{input('Ingredient unit',ing.unit,unit=>setIngredients(ingredients.map((i,n)=>n===index?{...i,unit}:i)))}{button('Remove ingredient',()=>setIngredients(ingredients.filter((_,n)=>n!==index)))}</View>)}
        {button('Add ingredient',()=>{setIngredients([...ingredients,{inventoryItemId:'',quantity:'1',unit:'each'}]);setPicker(ingredients.length);})}
        {picker!==null && <View style={{gap:8,borderWidth:1,borderColor:colors.border,padding:12}}>{input('Search ingredients',search,setSearch)}{(stock.data || []).filter(i=>i.name.toLowerCase().includes(search.toLowerCase()) && i.id!==chosen?.outputInventoryItemId).map(i=><TouchableOpacity key={i.id} accessibilityRole="button" style={{padding:10}} onPress={()=>{setIngredients(ingredients.map((ing,n)=>n===picker?{...ing,inventoryItemId:i.id,unit:i.recipeUnit}:ing));setPicker(null);}}><Text style={{color:colors.text}}>{i.name} • {i.recipeUnit}</Text></TouchableOpacity>)}{button('Close ingredient choices',()=>setPicker(null))}</View>}
        {save.error && <Text selectable accessibilityRole="alert" style={{color:colors.danger}}>{save.error.message}</Text>}{button(save.isPending?'Saving…':'Save Recipe',()=>save.mutate(),save.isPending || stock.data===undefined)}{button('Cancel',()=>setCreating(false),save.isPending)}
      </> : <>
        {recipes.data?.length===0 && <Text style={{color:colors.muted}}>No recipes yet. Add a batch recipe to produce prepared stock, or a dish recipe to use ingredients.</Text>}
        {(recipes.data || []).map(r=><View key={r.id} style={{padding:14,borderWidth:1,borderColor:colors.border,borderRadius:12,gap:10}}><Text style={{color:colors.text,fontWeight:'700'}}>{r.name}</Text><Text style={{color:colors.muted}}>{r.recipeKind==='batch'?`Batch yield: ${Number(r.expectedYield)} ${r.yieldUnit}`:`Dish recipe: ${r.servingSize} servings`}</Text><View style={{flexDirection:'row',gap:10}}>{button('Edit',()=>edit.mutate(r.id),edit.isPending)}{r.recipeKind==='batch' && button('Make batch',()=>{setChosen(r);setMultiplier('1');setActual(r.expectedYield);setLabel('');setKey(requestKey());production.reset();})}</View></View>)}
        {edit.error && <Text selectable style={{color:colors.danger}}>{edit.error.message}</Text>}
        {chosen?.recipeKind==='batch' && <View style={{padding:14,borderWidth:1,borderColor:colors.border,borderRadius:12,gap:12}}><Text style={{color:colors.text,fontWeight:'700'}}>Make {chosen.name}</Text><Text style={{color:colors.muted}}>Consumes ingredients once and adds your actual yield to prepared inventory.</Text>{input('Number of batches',multiplier,v=>{setMultiplier(v);setActual(String(Number(v)*Number(chosen.expectedYield)));production.reset();},true)}{input(`Actual yield (${chosen.yieldUnit})`,actual,v=>{setActual(v);production.reset();},true)}{input('Batch label (optional)',label,setLabel)}{production.error && <Text selectable accessibilityRole="alert" style={{color:colors.danger}}>{production.error.message}</Text>}{production.isSuccess && <Text style={{color:colors.success}}>Batch recorded; stock updated.</Text>}{button(production.isPending?'Recording…':'Record Batch',()=>production.mutate(),production.isPending || production.isSuccess)}{production.isSuccess && button('Make another batch',()=>production.reset())}</View>}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
