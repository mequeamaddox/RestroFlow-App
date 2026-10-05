import type { Express } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { isAuthenticated, requireHRAccess } from './helpers';
import { assertLocationAccess } from '../securityMiddleware';
import { requirePermission, Permission } from '../permissions';
const optionalText = z.string().max(5000).nullable().optional();
const departmentInput = z.object({name:z.string().trim().min(1).max(100),description:optionalText,managerId:z.string().uuid().nullable().optional()});
const amount = z.union([z.string(),z.number()]).nullable().optional().transform(v => v === null || v === undefined || v === '' ? null : String(v)).refine(v => v === null || /^(?:\d{1,8})(?:\.\d{1,2})?$/.test(v), 'Enter a valid hourly rate');
const positionInput = z.object({title:z.string().trim().min(1).max(100),departmentId:z.string().uuid(),description:optionalText,requirements:optionalText,responsibilities:optionalText,hourlyRate:amount,hourlyRateMin:amount,hourlyRateMax:amount});

export function registerHROrganizationRoutes(app:Express) {
  // Resolve the actual restaurant before paid-feature and permission checks.
  const scope = (kind:'department'|'position') => async (req:any,res:any,next:any) => {
    try {
      const query = req.query.locationId, body = req.body?.locationId;
      if (query && body && query !== body) return res.status(400).json({message:'Conflicting restaurant IDs in request.'});
      let locationId = query || body;
      if (req.params.id) {
        const record = kind === 'department' ? await storage.getDepartment(req.params.id) : await storage.getPosition(req.params.id);
        if (!record) return res.status(404).json({message:'Record not found.'});
        const department = kind === 'department' ? record : await storage.getDepartment((record as any).departmentId);
        if (!department) return res.status(404).json({message:'Department not found.'});
        if (locationId && locationId !== (department as any).locationId) return res.status(400).json({message:'Record belongs to another restaurant.'});
        locationId = (department as any).locationId;
      }
      if (!z.string().uuid().safeParse(locationId).success) return res.status(400).json({message:'Select a restaurant before managing departments or positions.'});
      if (!await assertLocationAccess(req,res,locationId)) return;
      req.query.locationId = locationId;
      req.organizationLocationId = locationId;
      next();
    } catch(error) { console.error('Organization scope error:',error);res.status(500).json({message:'Could not check restaurant access.'}); }
  };
  const failure = (res:any,error:unknown) => res.status(error instanceof z.ZodError ? 400 : 500).json({message:error instanceof z.ZodError ? error.issues[0]?.message : 'Could not save the organization change.'});
  async function validDepartment(id:string,locationId:string) {
    const department = await storage.getDepartment(id);
    return department?.locationId === locationId;
  }
  const managed = requirePermission(Permission.MANAGE_EMPLOYEES);
  app.get('/api/hr/departments',isAuthenticated,scope('department'),requireHRAccess,async(req:any,res)=>{
    try {res.json(await storage.getDepartments(req.organizationLocationId));}catch(error){failure(res,error);}
  });
  for (const method of ['post','put'] as const) app[method](method === 'post' ? '/api/hr/departments' : '/api/hr/departments/:id',isAuthenticated,scope('department'),requireHRAccess,managed,async(req:any,res)=>{
    try {
      const values = departmentInput.parse({...req.body,managerId:req.body.managerId || null});
      if (values.managerId) {
        const manager = await storage.getEmployee(values.managerId);
        if (!manager || manager.locationId !== req.organizationLocationId) return res.status(400).json({message:'Choose a department manager from this restaurant.'});
      }
      const data = {...values,locationId:req.organizationLocationId};
      res.status(method === 'post' ? 201 : 200).json(method === 'post' ? await storage.createDepartment(data) : await storage.updateDepartment(req.params.id,data));
    }catch(error){failure(res,error);}
  });
  app.delete('/api/hr/departments/:id',isAuthenticated,scope('department'),requireHRAccess,managed,async(req:any,res)=>{
    try {await storage.deleteDepartment(req.params.id);res.status(204).send();}catch(error){res.status(400).json({message:'This department is in use. Reassign its positions and employees before deleting it.'});}
  });
  app.get('/api/hr/positions',isAuthenticated,scope('position'),requireHRAccess,async(req:any,res)=>{
    try {
      const [positions,departments] = await Promise.all([storage.getPositions(req.organizationLocationId),storage.getDepartments(req.organizationLocationId)]);
      res.json(positions.map(p=>({...p,department:departments.find(d=>d.id===p.departmentId),hourlyRate:p.hourlyRateMin === null ? undefined : Number(p.hourlyRateMin)})));
    }catch(error){failure(res,error);}
  });
  for (const method of ['post','put'] as const) app[method](method === 'post' ? '/api/hr/positions' : '/api/hr/positions/:id',isAuthenticated,scope('position'),requireHRAccess,managed,async(req:any,res)=>{
    try {
      const values = positionInput.parse(req.body);
      if (!await validDepartment(values.departmentId,req.organizationLocationId)) return res.status(400).json({message:'Choose a department in this restaurant.'});
      const {hourlyRate,...data} = values;
      if (req.body.hourlyRate !== undefined) {data.hourlyRateMin=hourlyRate;data.hourlyRateMax=hourlyRate;}
      if (data.hourlyRateMin && data.hourlyRateMax && Number(data.hourlyRateMin)>Number(data.hourlyRateMax)) return res.status(400).json({message:'Minimum pay cannot exceed maximum pay.'});
      res.status(method === 'post' ? 201 : 200).json(method === 'post' ? await storage.createPosition(data) : await storage.updatePosition(req.params.id,data));
    }catch(error){failure(res,error);}
  });
  app.delete('/api/hr/positions/:id',isAuthenticated,scope('position'),requireHRAccess,managed,async(req:any,res)=>{
    try {await storage.deletePosition(req.params.id);res.status(204).send();}catch(error){res.status(400).json({message:'This position is in use. Reassign its employees before deleting it.'});}
  });
}
