import test from 'node:test';
import assert from 'node:assert/strict';
import { getTableColumns, getTableName, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../shared/schema';
import { produceBatch, consumePosSale } from '../server/ingredientStock';
import { countStock, receiveSingleItem } from '../server/stockAdjustments';
import { saveRecipe } from '../server/recipeSetup';
import { normalizePackaging, packagingFactor, convertMeasure, toPurchaseQuantity, ingredientCost, countPurchaseQuantity, rebasePackaging } from '../shared/inventoryUnits';
const mayo={id:'mayo',name:'Mayonnaise',locationId:'restaurant',quantity:'2',unit:'case',purchaseUnit:'case',recipeUnit:'fl oz',conversionFactor:'512',containersPerPurchase:'4',containerUnit:'jar',amountPerContainer:'1',contentUnit:'gallon',costPerUnit:'48',reorderLevel:'1',itemKind:'ingredient'};
const sauce={id:'sauce',name:'Sauce',locationId:'restaurant',quantity:'0',unit:'fl oz',purchaseUnit:'fl oz',recipeUnit:'fl oz',conversionFactor:'1',costPerUnit:'0',itemKind:'prepared'};
const seed={
 inventory_items:[mayo,sauce], recipes:[{id:'batch',name:'Sauce',locationId:'restaurant',recipeKind:'batch',outputInventoryItemId:'sauce',expectedYield:'100',yieldUnit:'fl oz',servingSize:1},{id:'dish',name:'Fish sandwich',locationId:'restaurant',recipeKind:'dish',servingSize:1}],
 recipe_ingredients:[{id:'b-ing',recipeId:'batch',inventoryItemId:'mayo',quantity:'100',unit:'fl oz'},{id:'d-ing',recipeId:'dish',inventoryItemId:'sauce',quantity:'2',unit:'fl oz'}],
 recipe_productions:[],inventory_transactions:[],pos_sales:[{id:'sale',posIntegrationId:'integration',posOrderId:'order-1',locationId:'restaurant',inventoryProcessed:false}],pos_sale_items:[{id:'sale-item',posSaleId:'sale',itemName:'Fish sandwich',quantity:2}],pos_integrations:[{id:'integration',locationId:'restaurant'}],pos_menu_items:[{id:'menu',posIntegrationId:'integration',name:'Fish sandwich',recipeId:'dish',isActive:true}],pos_item_mappings:[],
};
function database(change?:(state:any)=>void,failAudit=0) {
 let state:any=structuredClone(seed);change?.(state);let queue=Promise.resolve();let sequence=0;const dialect=new PgDialect();
 const client={async transaction(work:(tx:any)=>Promise<any>){const previous=queue;let release!:()=>void;queue=new Promise(r=>release=r);await previous;const draft=structuredClone(state);let audits=0;
 const matches=(table:any,row:any,condition:any)=>{if(!condition)return true;const {sql,params}=dialect.sqlToQuery(condition);const columns=Object.entries(getTableColumns(table)).map(([key,c]:any)=>[c.name,key]);const clauses=[...sql.matchAll(/"([^"]+)"\s*=\s*\$(\d+)/g)];return clauses.every(m=>{const key=columns.find(([col])=>col===m[1])?.[1];return key && row[key]===params[Number(m[2])-1];});};
 const query=(run:()=>any)=>{const q:any={then:(a:any,b:any)=>Promise.resolve().then(run).then(a,b),for:()=>q,orderBy:()=>q,limit:()=>q,returning:()=>q};return q;};
 const tx={execute:async()=>{},select:()=>({from:(table:any)=>({where:(condition:any)=>query(()=>draft[getTableName(table)].filter((r:any)=>matches(table,r,condition)).map((r:any)=>({...r})))})}),
 update:(table:any)=>({set:(values:any)=>({where:(condition:any)=>query(()=>{const rows=draft[getTableName(table)].filter((r:any)=>matches(table,r,condition));for(const row of rows)for(const [key,value]of Object.entries(values)){if(value instanceof SQL){const q=dialect.sqlToQuery(value);row[key]=String(Number(row[key])+(q.sql.includes(' - ')?-1:1)*Number(q.params[0]));}else row[key]=value;}return rows;})})}),
 insert:(table:any)=>({values:(values:any)=>query(()=>{if(table===schema.inventoryTransactions && ++audits===failAudit)throw new Error('simulated audit failure');const rows=(Array.isArray(values)?values:[values]).map(v=>({id:`generated-${++sequence}`,quantity:'0',conversionFactor:'1',costPerUnit:'0',...v}));draft[getTableName(table)].push(...rows);return rows;})}),
 delete:(table:any)=>({where:(condition:any)=>query(()=>{draft[getTableName(table)]=draft[getTableName(table)].filter((r:any)=>!matches(table,r,condition));return [];})})};
 try{const result=await work(tx);state=draft;return result;}finally{release();}
 }};return {client:client as unknown as Parameters<typeof produceBatch>[0],read:()=>state};
}
const batch={recipeId:'batch',locationId:'restaurant',batchMultiplier:'1',actualYield:'80',requestKey:'request-1'};
test('case contents convert gallons to fluid ounces while weight remains distinct',()=>{
 assert.equal(packagingFactor(mayo,'fl oz'),512);assert.equal(ingredientCost(mayo,2,'fl oz'),0.1875);assert.equal(toPurchaseQuantity(mayo,1,'jar'),0.25);assert.equal(toPurchaseQuantity(mayo,2,'fl oz'),0.00390625);
 assert.throws(()=>convertMeasure(1,'oz','fl oz'),/Weight, volume/);assert.throws(()=>packagingFactor({...mayo,contentUnit:'lb'},'fl oz'));
 assert.equal(packagingFactor({...mayo,containersPerPurchase:'12',amountPerContainer:'8',contentUnit:'each'},'each'),96);
});
test('mixed stock count totals cases, loose containers and loose ingredient quantities',()=>assert.equal(countPurchaseQuantity(mayo,'2','1','32'),'2.31250000'));
test('established packaging changes preserve ingredient quantity, reorder amount and inventory value',()=>{
 const updated=normalizePackaging({...mayo,containersPerPurchase:'2'});const changes=rebasePackaging(mayo,updated);
 assert.equal(changes.quantity,'4.00000000');assert.equal(changes.costPerUnit,'24.000000');assert.equal(Number(changes.quantity)*Number(changes.costPerUnit),96);
 assert.throws(()=>rebasePackaging(mayo,{...updated,quantity:'3'}),/separately/);
});
test('alternate supplier packaging receives equivalent ingredients without changing standard pack',()=>assert.equal(toPurchaseQuantity(mayo,1,'case',{...mayo,containersPerPurchase:'2'}),0.5));
test('a batch consumes raw ingredients and adds actual prepared yield with its real unit cost',async()=>{
 const db=database();await produceBatch(db.client,batch,'user');const state=db.read();
 assert.equal(Number(state.inventory_items[0].quantity),2-100/512);assert.equal(Number(state.inventory_items[1].quantity),80);assert.equal(Number(state.inventory_items[1].costPerUnit),0.117188);assert.equal(state.inventory_transactions.length,2);assert.equal(state.recipe_productions[0].actualCost,'9.3750');
 assert.equal(state.recipe_productions[0].ingredientSnapshot[0].ingredientUnit,'fl oz');
});
test('concurrent retries of one batch request consume ingredients exactly once',async()=>{
 const db=database();await Promise.all([produceBatch(db.client,batch,'user'),produceBatch(db.client,batch,'user')]);assert.equal(db.read().recipe_productions.length,1);assert.equal(Number(db.read().inventory_items[1].quantity),80);
 await assert.rejects(produceBatch(db.client,{...batch,actualYield:'90'},'user'),/different batch/);
});
test('failure after ingredient write rolls back consumption, prepared stock and production record',async()=>{
 const db=database(undefined,2);await assert.rejects(produceBatch(db.client,batch,'user'),/audit failure/);assert.equal(db.read().inventory_items[0].quantity,'2');assert.equal(db.read().inventory_items[1].quantity,'0');assert.equal(db.read().recipe_productions.length,0);assert.equal(db.read().inventory_transactions.length,0);
});
test('insufficient or foreign ingredients cannot partially produce a batch',async()=>{
 for(const change of [(s:any)=>s.inventory_items[0].quantity='0',(s:any)=>s.recipe_ingredients[0].inventoryItemId='foreign']){const db=database(change);await assert.rejects(produceBatch(db.client,batch,'user'));assert.equal(db.read().recipe_productions.length,0);assert.equal(db.read().inventory_items[1].quantity,'0');}
});
test('selling dishes consumes prepared stock without deducting the original ingredients twice',async()=>{
 const db=database();await produceBatch(db.client,batch,'user');const raw=db.read().inventory_items[0].quantity;
 await Promise.all([consumePosSale(db.client,'sale'),consumePosSale(db.client,'sale')]);assert.equal(db.read().inventory_items[0].quantity,raw);assert.equal(Number(db.read().inventory_items[1].quantity),76);assert.equal(db.read().pos_sales[0].inventoryProcessed,true);assert.equal(db.read().inventory_transactions.length,3);
});
test('a separately imported duplicate provider order cannot consume stock again',async()=>{
 const db=database(s=>{s.inventory_items[1].quantity='80';s.pos_sales.push({...s.pos_sales[0],id:'duplicate'});s.pos_sale_items.push({...s.pos_sale_items[0],id:'duplicate-line',posSaleId:'duplicate'});});
 await Promise.all([consumePosSale(db.client,'sale'),consumePosSale(db.client,'duplicate')]);assert.equal(Number(db.read().inventory_items[1].quantity),76);assert.equal(db.read().inventory_transactions.length,1);
});
test('a sale with one unmapped line leaves every stock item unchanged for retry',async()=>{
 const db=database(s=>{s.inventory_items[1].quantity='80';s.pos_sale_items.push({...s.pos_sale_items[0],id:'unknown',itemName:'Unknown'});});
 await assert.rejects(consumePosSale(db.client,'sale'),/Map Unknown/);assert.equal(db.read().inventory_items[1].quantity,'80');assert.equal(db.read().pos_sales[0].inventoryProcessed,false);assert.equal(db.read().inventory_transactions.length,0);
});
test('POS write failure rolls back all stock deductions and leaves sale retryable',async()=>{
 const db=database(s=>s.inventory_items[1].quantity='80',1);await assert.rejects(consumePosSale(db.client,'sale'),/audit failure/);assert.equal(db.read().inventory_items[1].quantity,'80');assert.equal(db.read().pos_sales[0].inventoryProcessed,false);
});
test('POS direct bottled product consumes a bottle rather than an entire case',async()=>{
 const db=database(s=>{s.pos_menu_items[0].recipeId=null;s.pos_menu_items[0].inventoryItemId='mayo';});await consumePosSale(db.client,'sale');assert.equal(Number(db.read().inventory_items[0].quantity),1.5);
});
test('physical counts and single-container receiving update the same balance and retain audit',async()=>{
 const db=database();await countStock(db.client,'mayo',{purchases:'2',containers:'1',loose:'32'},'user');assert.equal(Number(db.read().inventory_items[0].quantity),2.3125);
 const draft={quantity:'1',unit:'jar',requestKey:'receive-one'};await Promise.all([receiveSingleItem(db.client,'mayo',draft,'user'),receiveSingleItem(db.client,'mayo',draft,'user')]);assert.equal(Number(db.read().inventory_items[0].quantity),2.5625);assert.equal(db.read().inventory_transactions.length,2);
});
test('saving a batch recipe creates prepared output and rejects incompatible recipe units atomically',async()=>{
 const db=database();const r=await saveRecipe(db.client,undefined,{name:'New sauce',locationId:'restaurant',recipeKind:'batch',expectedYield:'100',yieldUnit:'fl oz',servingSize:1,category:'Prepared',instructions:'Mix',prepTime:1},[{inventoryItemId:'mayo',quantity:'100',unit:'fl oz'}]);
 assert.ok(r.outputInventoryItemId);assert.equal(db.read().inventory_items[2].itemKind,'prepared');assert.equal(db.read().recipe_ingredients.length,3);
 const invalid=database();await assert.rejects(saveRecipe(invalid.client,undefined,{name:'Wrong units',locationId:'restaurant',recipeKind:'batch',expectedYield:'100',yieldUnit:'fl oz',category:'Prepared'},[{inventoryItemId:'mayo',quantity:'1',unit:'oz'}]));assert.equal(invalid.read().inventory_items.length,2);assert.equal(invalid.read().recipes.length,2);
});

test('partial supplier packaging, cleared established packs, and unsupported batch yields are rejected',async()=>{
 assert.throws(()=>toPurchaseQuantity(mayo,1,'case',{containersPerPurchase:'2'}));
 assert.throws(()=>rebasePackaging(mayo,{containersPerPurchase:null,containerUnit:null,amountPerContainer:null,contentUnit:null}));
 const db=database();await assert.rejects(saveRecipe(db.client,undefined,{name:'Invalid output',locationId:'restaurant',recipeKind:'batch',expectedYield:'1',yieldUnit:'case'},[{inventoryItemId:'mayo',quantity:'1',unit:'fl oz'}]),/yield unit/);
 assert.equal(db.read().inventory_items.length,2);
});

test('negative prepared stock requires a physical count before batch costing',async()=>{
 const db=database(s=>s.inventory_items[1].quantity='-80');
 await assert.rejects(produceBatch(db.client,{recipeId:'batch',locationId:'restaurant',batchMultiplier:'1',actualYield:'80',requestKey:'negative-stock'},'user'),/below zero/);
 assert.equal(db.read().inventory_transactions.length,0);
});
