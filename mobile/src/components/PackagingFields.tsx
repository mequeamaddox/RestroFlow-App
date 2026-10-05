import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { colors } from '../lib/colors';
import { packagingFactor, type Packaging } from '../../../shared/inventoryUnits';
export function PackagingFields({value,onChange,recipeUnit,disabled=false}:{value:Packaging;onChange:(pack:Packaging)=>void;recipeUnit:string;disabled?:boolean}) {
  let summary='Example: 4 jars × 1 gallon. Use fl oz for volume; oz for weight.';
  try{summary=`Total per purchase: ${Number(packagingFactor(value,recipeUnit).toFixed(4))} ${recipeUnit}`;}catch(error){if(value.containersPerPurchase && value.amountPerContainer)summary=error instanceof Error?error.message:summary;}
  return <View style={{gap:10,marginVertical:14}}><Text style={{color:colors.text,fontWeight:'700'}}>Case / package contents</Text>
    {([['containersPerPurchase','Containers per purchase','4'],['containerUnit','Container type','jar'],['amountPerContainer','Amount in each container','1'],['contentUnit','Contents unit (each, lb, gallon, fl oz, ml…)','gallon']] as const).map(([key,label,placeholder])=><View key={key}><Text style={{color:colors.muted,marginBottom:6}}>{label}</Text><TextInput accessibilityLabel={label} style={{color:colors.text,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12}} value={String(value[key]??'')} editable={!disabled} onChangeText={v=>onChange({...value,[key]:v || null})} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={key==='containersPerPurchase'||key==='amountPerContainer'?'decimal-pad':'default'} autoCapitalize="none"/></View>)}
    <Text selectable style={{color:colors.muted,fontSize:13}}>{summary}</Text>
  </View>;
}
