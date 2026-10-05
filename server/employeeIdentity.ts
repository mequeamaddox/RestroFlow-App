import { storage } from './storage';
import { assertLocationAccess } from './securityMiddleware';
export async function selectedEmployee(req:any,res:any) {
  const locationId = req.query.locationId || req.body?.locationId;
  if (typeof locationId !== 'string') {res.status(400).json({message:'Select a restaurant.'});return;}
  if (!await assertLocationAccess(req,res,locationId)) return;
  const user = await storage.getUser(req.user.id);
  const employee = user?.email ? await storage.getEmployeeByEmail(user.email,locationId) : undefined;
  if (!employee || employee.status !== 'active') {res.status(404).json({message:'No active employee profile for this restaurant.'});return;}
  return employee;
}
export async function ownEmployee(req:any,res:any,id:string) {
  const employee = await storage.getEmployee(id);
  const user = await storage.getUser(req.user.id);
  if (!employee || !user?.email || employee.email?.toLowerCase() !== user.email.toLowerCase() || employee.status !== 'active') {res.status(403).json({message:'You can only access your own active employee profile.'});return;}
  if (!await assertLocationAccess(req,res,employee.locationId)) return;
  return employee;
}

export function registerEmployeeIdentityRoute(app:any,authenticate:any) {
  app.get('/api/employees/me/identity',authenticate,async(req:any,res:any)=>{
    try {const employee=await selectedEmployee(req,res);if(employee)res.json({id:employee.id,locationId:employee.locationId});}
    catch(error){res.status(500).json({message:'Could not load employee profile.'});}
  });
}
