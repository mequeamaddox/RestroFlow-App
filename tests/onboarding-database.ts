import { randomUUID } from 'node:crypto';
import { getTableName, getTableColumns } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../shared/schema';
export function onboardingDatabase() {
  let state:any = Object.fromEntries(['users','locations','departments','positions','invitation_tokens','owner_onboarding','owner_onboarding_steps','employees','user_permissions','onboarding_tokens','employee_onboarding_data'].map(t=>[t,[]]));
  state.users.push({id:'owner',email:'owner@example.com',role:'owner',accountState:'active',subscriptionPlan:'core'});
  state.owner_onboarding.push({id:randomUUID(),userId:'owner',data:{},skippedSteps:[],currentStep:'restaurant_info',completedSteps:0,isCompleted:false});
  const dialect = new PgDialect();
  let failTable = '';
  const matches = (table:any,row:any,condition:any) => {
    const {sql,params} = dialect.sqlToQuery(condition);
    const columns = Object.entries(getTableColumns(table)).map(([key,c]:any)=>[c.name,key]);
    return [...sql.matchAll(/"([^"]+)"\s*=\s*\$(\d+)/g)].every(m => {
      const key = columns.find(([name])=>name===m[1])?.[1];
      return key && row[key]===params[Number(m[2])-1];
    });
  };
  const query=(work:()=>any) => { const result:any={then:(resolve:any,reject:any)=>Promise.resolve().then(work).then(resolve,reject),returning:()=>result,for:()=>result,limit:()=>result};return result; };
  const adapter=(data:any)=>({
    execute:async()=>{},
    select:()=>({from:(table:any)=>({where:(condition:any)=>query(()=>data[getTableName(table)].filter((row:any)=>matches(table,row,condition)))})}),
    insert:(table:any)=>({values:(values:any)=>query(()=>{if(failTable===getTableName(table))throw new Error('Simulated database failure');const row={id:randomUUID(),isActive:true,status:'pending',isUsed:false,accountState:'active',...structuredClone(values)};data[getTableName(table)].push(row);return [row];})}),
    update:(table:any)=>({set:(values:any)=>({where:(condition:any)=>query(()=>{if(failTable===getTableName(table))throw new Error('Simulated database failure');const rows=data[getTableName(table)].filter((r:any)=>matches(table,r,condition));rows.forEach((row:any)=>Object.assign(row,structuredClone(values)));return rows;})})}),
  });
  let tail=Promise.resolve();
  const client:any={transaction:(work:any)=>{const next=tail.then(async()=>{const copy=structuredClone(state);const result=await work(adapter(copy));state=copy;return result;});tail=next.catch(()=>{});return next;}};
  return {client,read:()=>state,fail:(table:string)=>failTable=table};
}
