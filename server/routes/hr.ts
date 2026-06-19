import type { Express } from 'express';
import { storage } from '../storage';
import { isAuthenticated, clerkClient, mapPositionToRole, requireHRAccess } from './helpers';
import { requireLocationAccess, assertLocationAccess } from '../securityMiddleware';
import { requirePermission, requireAnyPermission, Permission } from '../permissions';
import { isOwnerLevel, isManagerLevel } from '@shared/roles';
import { teamResources, insertTeamResourceSchema, timeEntries, timeOffRequests, employeeDocuments, employeeOnboarding, employeeOnboardingSteps } from '@shared/schema';
import { db } from '../db';
import { eq, desc, sql, or, isNull } from 'drizzle-orm';


export function registerHRRoutes(app: Express): void {
  // Departments
  app.get('/api/hr/departments', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const departments = await storage.getDepartments(req.query.locationId as string);
      res.json(departments);
    } catch (error) {
      console.error('Error fetching departments:', error);
      res.status(500).json({ message: 'Failed to fetch departments' });
    }
  });

  app.post('/api/hr/departments', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const department = await storage.createDepartment({ ...req.body, locationId: req.query.locationId });
      res.status(201).json(department);
    } catch (error) {
      console.error('Error creating department:', error);
      res.status(500).json({ message: 'Failed to create department' });
    }
  });

  app.put('/api/hr/departments/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const existing = await storage.getDepartment(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Department not found' });
      if (!await assertLocationAccess(req, res, existing.locationId)) return;
      const department = await storage.updateDepartment(req.params.id, req.body);
      res.json(department);
    } catch (error) {
      console.error('Error updating department:', error);
      res.status(500).json({ message: 'Failed to update department' });
    }
  });

  app.delete('/api/hr/departments/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const existing = await storage.getDepartment(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Department not found' });
      if (!await assertLocationAccess(req, res, existing.locationId)) return;
      await storage.deleteDepartment(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting department:', error);
      res.status(400).json({ message: 'Failed to delete department' });
    }
  });

  // Positions
  app.get('/api/hr/positions', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const positions = await storage.getPositions(req.query.locationId as string | undefined);
      res.json(positions);
    } catch (error) {
      console.error('Error fetching positions:', error);
      res.status(500).json({ message: 'Failed to fetch positions' });
    }
  });

  app.post('/api/hr/positions', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const position = await storage.createPosition(req.body);
      res.status(201).json(position);
    } catch (error) {
      console.error('Error creating position:', error);
      res.status(500).json({ message: 'Failed to create position' });
    }
  });

  app.delete('/api/hr/positions/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const existing = await storage.getPosition(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Position not found' });
      const dept = await storage.getDepartment(existing.departmentId);
      if (dept && !await assertLocationAccess(req, res, dept.locationId)) return;
      await storage.deletePosition(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting position:', error);
      res.status(400).json({ message: 'Failed to delete position' });
    }
  });

  // Employees (general endpoint)
  app.get('/api/employees', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (!locationId) return res.status(400).json({ message: 'Location ID required' });
      if (!await assertLocationAccess(req, res, locationId)) return;
      const employees = await storage.getEmployees(locationId);
      res.json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ message: 'Failed to fetch employees' });
    }
  });

  // HR Employees (with permission + HR add-on checks)
  app.get('/api/hr/employees', isAuthenticated, requireAnyPermission([Permission.VIEW_ALL_EMPLOYEES, Permission.VIEW_EMPLOYEE_DETAILS]), requireHRAccess, async (req, res) => {
    try {
      const employees = await storage.getEmployees(req.query.locationId as string);
      res.json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ message: 'Failed to fetch employees' });
    }
  });

  app.post('/api/hr/employees', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), requireHRAccess, async (req, res) => {
    try {
      const employeeData = req.body;
      const employee = await storage.createEmployee(employeeData);

      if (employee.email) {
        try {
          const { randomBytes } = await import('crypto');
          const randomPassword = randomBytes(32).toString('base64url') + 'Aa1!';
          const clerkUser = await clerkClient.users.createUser({
            emailAddress: [employee.email],
            password: randomPassword,
            firstName: employee.firstName,
            lastName: employee.lastName,
          });
          const userId = clerkUser.id;
          const employeeWithPosition = await storage.getEmployee(employee.id);
          const userRole = mapPositionToRole(employeeWithPosition?.position?.title);
          await storage.upsertUser({ id: userId, email: employee.email, firstName: employee.firstName, lastName: employee.lastName, role: userRole });
          await storage.updateEmployee(employee.id, { notes: `Clerk ID: ${userId}` });

          let loginUrl = `${req.protocol}://${req.get('host')}`;
          try {
            const signInToken = await clerkClient.signInTokens.createSignInToken({ userId, expiresInSeconds: 60 * 60 * 24 * 3 });
            loginUrl = `${req.protocol}://${req.get('host')}?__clerk_ticket=${signInToken.token}`;
          } catch (tokenError) {
            console.error('Could not generate sign-in token:', tokenError);
          }

          try {
            const { sendEmail } = await import('../email');
            await sendEmail({
              to: employee.email,
              from: process.env.FROM_EMAIL || 'noreply@restroflowsolutions.com',
              subject: 'Welcome to RestroFlow - Activate Your Account',
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><h2>Welcome to RestroFlow!</h2><p>Hi ${employee.firstName},</p><p>Your employee account has been created. Click below to activate your account (link valid for 3 days).</p><div style="text-align:center;margin:30px 0;"><a href="${loginUrl}" style="background-color:#f97316;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Activate My Account</a></div><p>After signing in, go to Settings → Privacy & Security to set your own password.</p><p>Best regards,<br>The RestroFlow Team</p></div>`,
            });
          } catch (emailError) {
            console.error('Failed to send welcome email:', emailError);
          }

          return res.status(201).json({ ...employee, loginInstructions: { email: employee.email, message: 'Welcome email with one-time login link sent to employee.' } });
        } catch (userCreationError) {
          console.error('User account creation failed:', userCreationError);
          return res.status(201).json({ ...employee, warning: 'Employee created but login account setup failed. Employee will need manual account setup.' });
        }
      } else {
        return res.status(201).json({ ...employee, warning: 'Employee created without email. Login account cannot be created without email address.' });
      }
    } catch (error) {
      console.error('Error creating employee:', error);
      res.status(500).json({ message: 'Failed to create employee' });
    }
  });

  app.put('/api/hr/employees/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), requireHRAccess, async (req, res) => {
    try {
      const existing = await storage.getEmployee(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Employee not found' });
      if (!await assertLocationAccess(req, res, existing.locationId)) return;
      const employee = await storage.updateEmployee(req.params.id, req.body);
      res.json(employee);
    } catch (error) {
      console.error('Error updating employee:', error);
      res.status(500).json({ message: 'Failed to update employee' });
    }
  });

  app.delete('/api/hr/employees/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), requireHRAccess, async (req, res) => {
    try {
      const existing = await storage.getEmployee(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Employee not found' });
      if (!await assertLocationAccess(req, res, existing.locationId)) return;
      await storage.deleteEmployee(req.params.id);
      res.json({ message: 'Employee deleted successfully' });
    } catch (error) {
      console.error('Error deleting employee:', error);
      res.status(500).json({ message: 'Failed to delete employee' });
    }
  });

  // Scheduling
  app.get('/api/hr/shifts', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const shifts = await storage.getShifts(req.query.locationId as string);
      res.json(shifts);
    } catch (error) {
      console.error('Error fetching shifts:', error);
      res.status(500).json({ message: 'Failed to fetch shifts' });
    }
  });

  app.post('/api/hr/shifts', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const shift = await storage.createShift({ ...req.body, locationId: req.query.locationId });
      res.status(201).json(shift);
    } catch (error) {
      console.error('Error creating shift:', error);
      res.status(500).json({ message: 'Failed to create shift' });
    }
  });

  app.put('/api/hr/shifts/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const existing = await storage.getShift(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Shift not found' });
      if (!await assertLocationAccess(req, res, existing.locationId)) return;
      const shift = await storage.updateShift(req.params.id, req.body);
      res.json(shift);
    } catch (error) {
      console.error('Error updating shift:', error);
      res.status(500).json({ message: 'Failed to update shift' });
    }
  });

  app.delete('/api/hr/shifts/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const existing = await storage.getShift(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Shift not found' });
      if (!await assertLocationAccess(req, res, existing.locationId)) return;
      await storage.deleteShift(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting shift:', error);
      res.status(500).json({ message: 'Failed to delete shift' });
    }
  });

  // Time-off Requests
  app.get('/api/hr/time-off-requests', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      // requireHRAccess has already validated locationId exists and user has access
      const locationId = req.query.locationId as string;
      const requests = await storage.getTimeOffRequests(locationId);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching time-off requests:', error);
      res.status(500).json({ message: 'Failed to fetch time-off requests' });
    }
  });

  app.post('/api/hr/time-off-requests', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      if (req.body.employeeId) {
        const employee = await storage.getEmployee(req.body.employeeId);
        if (!employee) return res.status(404).json({ message: 'Employee not found' });
        if (!await assertLocationAccess(req, res, employee.locationId)) return;
      }
      const request = await storage.createTimeOffRequest(req.body);
      res.status(201).json(request);
    } catch (error) {
      console.error('Error creating time-off request:', error);
      res.status(500).json({ message: 'Failed to create time-off request' });
    }
  });

  app.put('/api/hr/time-off-requests/:id/status', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const [existing] = await db.select().from(timeOffRequests).where(eq(timeOffRequests.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: 'Time-off request not found' });
      const employee = await storage.getEmployee(existing.employeeId);
      if (employee && !await assertLocationAccess(req, res, employee.locationId)) return;
      const { status, notes } = req.body;
      const request = await storage.updateTimeOffRequestStatus(req.params.id, status, notes, req.user!.id);
      res.json(request);
    } catch (error) {
      console.error('Error updating time-off request status:', error);
      res.status(500).json({ message: 'Failed to update time-off request status' });
    }
  });

  // HR Analytics
  app.get('/api/hr/analytics', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const analytics = await storage.getHRAnalytics(req.query.locationId as string);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.json(analytics);
    } catch (error) {
      console.error('Error fetching HR analytics:', error);
      res.status(500).json({ message: 'Failed to fetch HR analytics' });
    }
  });

  // HR Tasks
  app.get('/api/hr/tasks', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const tasks = await storage.getTasks(req.query.locationId as string);
      res.json(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ message: 'Failed to fetch tasks' });
    }
  });

  app.post('/api/hr/tasks', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const task = await storage.createTask({ ...req.body, locationId: req.query.locationId });
      res.status(201).json(task);
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ message: 'Failed to create task' });
    }
  });

  app.put('/api/hr/tasks/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const existing = await storage.getTask(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Task not found' });
      if (existing.locationId && !await assertLocationAccess(req, res, existing.locationId)) return;
      const task = await storage.updateTask(req.params.id, req.body);
      res.json(task);
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ message: 'Failed to update task' });
    }
  });

  app.put('/api/hr/tasks/:id/status', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const existing = await storage.getTask(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Task not found' });
      if (existing.locationId && !await assertLocationAccess(req, res, existing.locationId)) return;
      const task = await storage.updateTaskStatus(req.params.id, req.body.status);
      res.json(task);
    } catch (error) {
      console.error('Error updating task status:', error);
      res.status(500).json({ message: 'Failed to update task status' });
    }
  });

  // Time Clock (HR admin view)
  app.get('/api/hr/time-entries', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const { locationId, includeHistory = 'false' } = req.query;
      const manualResult = await db.execute(sql`
        SELECT te.id, te.employee_id, te.status, te.notes, te.total_hours,
               te.clock_in_time::text as clock_in_time,
               te.clock_out_time::text as clock_out_time,
               te.created_at::text as created_at,
               e.first_name, e.last_name, e.employee_number
        FROM time_entries te
        INNER JOIN employees e ON te.employee_id = e.id
        WHERE e.location_id = ${locationId}::uuid
        ${includeHistory === 'true' ? sql`` : sql`AND te.status = 'clocked-in'`}
        ORDER BY te.created_at DESC LIMIT ${includeHistory === 'true' ? sql`100` : sql`50`}
      `);
      const manualEntries = manualResult.rows.map((row: any) => ({
        id: row.id, employeeId: row.employee_id,
        clockInTime: row.clock_in_time ? new Date(row.clock_in_time).toISOString() : new Date().toISOString(),
        clockOutTime: row.clock_out_time ? new Date(row.clock_out_time).toISOString() : null,
        breakStartTime: null, breakEndTime: null, totalHours: row.total_hours,
        status: row.status || 'clocked-in', notes: row.notes, source: 'manual',
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updatedAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        employee: row.first_name ? { id: row.employee_id, employeeNumber: row.employee_number, firstName: row.first_name, lastName: row.last_name } : undefined,
      }));

      const posResult = await db.execute(sql`
        SELECT pt.id, pt.clock_in_at::text as clock_in_at, pt.clock_out_at::text as clock_out_at,
               pt.break_seconds, pt.status, pt.role_title,
               pe.display_name as pos_employee_name,
               pem.employee_id as hr_employee_id,
               e.first_name, e.last_name, e.employee_number, pi.provider
        FROM pos_timeclocks pt
        INNER JOIN pos_employees pe ON pt.pos_employee_id = pe.id
        LEFT JOIN pos_employee_mappings pem ON pe.id = pem.pos_employee_id
        LEFT JOIN employees e ON pem.employee_id = e.id
        INNER JOIN pos_integrations pi ON pt.pos_integration_id = pi.id
        WHERE ${locationId ? sql`pt.location_id = ${locationId}::uuid AND` : sql``}
        ${includeHistory === 'true' ? sql`TRUE` : sql`pt.status = 'open'`}
        ORDER BY pt.clock_in_at DESC LIMIT 100
      `);
      const posEntries = posResult.rows.map((row: any) => {
        const clockIn = row.clock_in_at ? new Date(row.clock_in_at) : new Date();
        const clockOut = row.clock_out_at ? new Date(row.clock_out_at) : null;
        let totalHours = null;
        if (clockOut) {
          const hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
          totalHours = (hours - (row.break_seconds || 0) / 3600).toFixed(2);
        }
        return {
          id: `pos-${row.id}`, employeeId: row.hr_employee_id || null,
          clockInTime: clockIn.toISOString(), clockOutTime: clockOut ? clockOut.toISOString() : null,
          breakStartTime: null, breakEndTime: null, totalHours,
          status: row.status === 'open' ? 'clocked-in' : 'clocked-out',
          notes: `Synced from ${row.provider?.toUpperCase() || 'POS'} - ${row.role_title || 'Employee'}`,
          source: 'pos', posProvider: row.provider,
          createdAt: clockIn.toISOString(), updatedAt: clockIn.toISOString(),
          employee: row.hr_employee_id
            ? { id: row.hr_employee_id, employeeNumber: row.employee_number, firstName: row.first_name, lastName: row.last_name }
            : { id: null, employeeNumber: null, firstName: row.pos_employee_name?.split(' ')[0] || 'Unknown', lastName: row.pos_employee_name?.split(' ').slice(1).join(' ') || 'POS Employee' },
        };
      });

      const allEntries = [...manualEntries, ...posEntries].sort((a, b) => new Date(b.clockInTime).getTime() - new Date(a.clockInTime).getTime());
      res.json(allEntries);
    } catch (error) {
      console.error('Error fetching time entries:', error);
      res.status(500).json({ message: 'Failed to fetch time entries' });
    }
  });

  app.post('/api/hr/time-clock/in/:employeeId', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const employee = await storage.getEmployee(req.params.employeeId);
      if (!employee) return res.status(404).json({ message: 'Employee not found' });
      if (!await assertLocationAccess(req, res, employee.locationId)) return;
      const entry = await storage.clockIn(req.params.employeeId, req.body.shiftId);
      res.status(201).json(entry);
    } catch (error) {
      console.error('Error clocking in:', error);
      res.status(500).json({ message: 'Failed to clock in' });
    }
  });

  app.post('/api/hr/time-clock/out/:entryId', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, req.params.entryId)).limit(1);
      if (!entry) return res.status(404).json({ message: 'Time entry not found' });
      const employee = await storage.getEmployee(entry.employeeId);
      if (employee && !await assertLocationAccess(req, res, employee.locationId)) return;
      const updated = await storage.clockOut(req.params.entryId);
      res.json(updated);
    } catch (error) {
      console.error('Error clocking out:', error);
      res.status(500).json({ message: 'Failed to clock out' });
    }
  });

  // Employee self-service time clock
  app.get('/api/employees/:employeeId/time-entries', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      const isOwnerOrAdmin = isManagerLevel(user?.role);
      if (!isOwnerOrAdmin && req.params.employeeId !== userId) return res.status(403).json({ message: 'Access denied - can only view your own time entries' });
      const targetEmployee = await storage.getEmployee(req.params.employeeId);
      if (!targetEmployee) return res.status(404).json({ message: 'Employee not found' });
      if (!await assertLocationAccess(req, res, targetEmployee.locationId)) return;
      const manualTimeEntries = await storage.getEmployeeTimeEntries(req.params.employeeId);
      const posResult = await db.execute(sql`
        SELECT pt.id, pt.clock_in_at::text as clock_in_at, pt.clock_out_at::text as clock_out_at,
               pt.break_seconds, pt.status, pt.role_title, pi.provider
        FROM pos_timeclocks pt
        INNER JOIN pos_employee_mappings pem ON pt.pos_employee_id = pem.pos_employee_id
        INNER JOIN pos_integrations pi ON pt.pos_integration_id = pi.id
        WHERE pem.employee_id = ${req.params.employeeId}
        ORDER BY pt.clock_in_at DESC LIMIT 100
      `);
      const posTimeEntries = posResult.rows.map((row: any) => {
        const clockIn = row.clock_in_at ? new Date(row.clock_in_at) : new Date();
        const clockOut = row.clock_out_at ? new Date(row.clock_out_at) : null;
        let totalHours = null;
        if (clockOut) {
          const hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
          totalHours = (hours - (row.break_seconds || 0) / 3600).toFixed(2);
        }
        return { id: `pos-${row.id}`, employeeId: req.params.employeeId, clockInTime: clockIn.toISOString(), clockOutTime: clockOut ? clockOut.toISOString() : null, totalHours, status: row.status === 'open' ? 'clocked-in' : 'clocked-out', notes: `Synced from ${row.provider?.toUpperCase() || 'POS'} - ${row.role_title || 'Employee'}`, source: 'pos', posProvider: row.provider };
      });
      const allEntries = [...manualTimeEntries, ...posTimeEntries].sort((a: any, b: any) => new Date(b.clockInTime).getTime() - new Date(a.clockInTime).getTime());
      res.json(allEntries);
    } catch (error) {
      console.error('Error fetching employee time entries:', error);
      res.status(500).json({ message: 'Failed to fetch time entries' });
    }
  });

  app.get('/api/employees/:employeeId/shifts', isAuthenticated, async (req, res) => {
    try {
      if (req.params.employeeId !== req.user!.id) return res.status(403).json({ message: 'Access denied - can only view your own shifts' });
      const shifts = await storage.getEmployeeShifts(req.params.employeeId);
      res.json(shifts);
    } catch (error) {
      console.error('Error fetching employee shifts:', error);
      res.status(500).json({ message: 'Failed to fetch shifts' });
    }
  });

  app.post('/api/employees/:employeeId/clock-in', isAuthenticated, async (req, res) => {
    try {
      if (req.params.employeeId !== req.user!.id) return res.status(403).json({ message: 'Access denied - can only clock in for yourself' });
      const entry = await storage.clockIn(req.params.employeeId);
      res.status(201).json(entry);
    } catch (error) {
      console.error('Error clocking in:', error);
      res.status(500).json({ message: 'Failed to clock in' });
    }
  });

  app.post('/api/employees/:employeeId/clock-out', isAuthenticated, async (req, res) => {
    try {
      if (req.params.employeeId !== req.user!.id) return res.status(403).json({ message: 'Access denied - can only clock out for yourself' });
      const activeEntry = await storage.getActiveTimeEntry(req.params.employeeId);
      if (!activeEntry) return res.status(400).json({ message: 'No active time entry found' });
      const entry = await storage.clockOut(activeEntry.id);
      res.json(entry);
    } catch (error) {
      console.error('Error clocking out:', error);
      res.status(500).json({ message: 'Failed to clock out' });
    }
  });

  app.post('/api/employees/:employeeId/break-start', isAuthenticated, async (req, res) => {
    try {
      if (req.params.employeeId !== req.user!.id) return res.status(403).json({ message: 'Access denied - can only start break for yourself' });
      const activeEntry = await storage.getActiveTimeEntry(req.params.employeeId);
      if (!activeEntry) return res.status(400).json({ message: 'No active time entry found' });
      const entry = await storage.startBreak(activeEntry.id);
      res.json(entry);
    } catch (error) {
      console.error('Error starting break:', error);
      res.status(500).json({ message: 'Failed to start break' });
    }
  });

  app.post('/api/employees/:employeeId/break-end', isAuthenticated, async (req, res) => {
    try {
      if (req.params.employeeId !== req.user!.id) return res.status(403).json({ message: 'Access denied - can only end break for yourself' });
      const activeEntry = await storage.getActiveTimeEntry(req.params.employeeId);
      if (!activeEntry) return res.status(400).json({ message: 'No active time entry found' });
      const entry = await storage.endBreak(activeEntry.id);
      res.json(entry);
    } catch (error) {
      console.error('Error ending break:', error);
      res.status(500).json({ message: 'Failed to end break' });
    }
  });

  // Time entry CRUD (manager edits)
  app.put('/api/hr/time-entries/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const [existing] = await db.select().from(timeEntries).where(eq(timeEntries.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: 'Time entry not found' });
      const employee = await storage.getEmployee(existing.employeeId);
      if (employee && !await assertLocationAccess(req, res, employee.locationId)) return;
      const { clockInTime, clockOutTime, breakStartTime, breakEndTime, notes } = req.body;
      const updateData: any = {};
      if (clockInTime) updateData.clockInTime = new Date(clockInTime);
      if (clockOutTime) updateData.clockOutTime = new Date(clockOutTime);
      if (breakStartTime) updateData.breakStartTime = new Date(breakStartTime);
      if (breakEndTime) updateData.breakEndTime = new Date(breakEndTime);
      if (notes !== undefined) updateData.notes = notes;
      const timeEntry = await storage.updateTimeEntry(req.params.id, updateData);
      res.json(timeEntry);
    } catch (error) {
      console.error('Error updating time entry:', error);
      res.status(500).json({ message: 'Failed to update time entry' });
    }
  });

  app.delete('/api/hr/time-entries/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const [existing] = await db.select().from(timeEntries).where(eq(timeEntries.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: 'Time entry not found' });
      const employee = await storage.getEmployee(existing.employeeId);
      if (employee && !await assertLocationAccess(req, res, employee.locationId)) return;
      await storage.deleteTimeEntry(req.params.id);
      res.json({ message: 'Time entry deleted successfully' });
    } catch (error) {
      console.error('Error deleting time entry:', error);
      res.status(500).json({ message: 'Failed to delete time entry' });
    }
  });

  app.post('/api/hr/time-entries/manual', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { employeeId, clockInTime, clockOutTime, breakStartTime, breakEndTime, notes } = req.body;
      if (!employeeId || !clockInTime) return res.status(400).json({ message: 'Employee ID and clock in time are required' });
      const employee = await storage.getEmployee(employeeId);
      if (!employee) return res.status(404).json({ message: 'Employee not found' });
      if (!await assertLocationAccess(req, res, employee.locationId)) return;
      let totalHours = null;
      if (clockOutTime) {
        const diffMs = new Date(clockOutTime).getTime() - new Date(clockInTime).getTime();
        totalHours = diffMs / (1000 * 60 * 60);
      }
      const timeEntry = await storage.createTimeEntry({
        employeeId, clockInTime: new Date(clockInTime), clockOutTime: clockOutTime ? new Date(clockOutTime) : null,
        breakStartTime: breakStartTime ? new Date(breakStartTime) : null, breakEndTime: breakEndTime ? new Date(breakEndTime) : null,
        totalHours: totalHours ? totalHours.toString() : null, status: clockOutTime ? 'clocked-out' : 'clocked-in',
        notes: notes || 'Manual entry added by supervisor', isManual: true, addedBy: userId,
      });
      res.status(201).json(timeEntry);
    } catch (error) {
      console.error('Error creating manual time entry:', error);
      res.status(500).json({ message: 'Failed to create manual time entry' });
    }
  });

  // Messaging
  app.get('/api/hr/messages', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const messages = await storage.getMessages(req.query.locationId as string);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ message: 'Failed to fetch messages' });
    }
  });

  app.post('/api/hr/messages', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const message = await storage.createMessage({ ...req.body, senderId: req.user!.id });
      res.status(201).json(message);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ message: 'Failed to create message' });
    }
  });

  // Team Resources
  app.get('/api/hr/team-resources', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const resources = await db.select().from(teamResources)
        .where(or(eq(teamResources.locationId, locationId), isNull(teamResources.locationId)))
        .orderBy(desc(teamResources.uploadedAt));
      res.json(resources);
    } catch (error) {
      console.error('Error fetching team resources:', error);
      res.status(500).json({ message: 'Failed to fetch team resources' });
    }
  });

  app.post('/api/hr/team-resources', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const resourceData = insertTeamResourceSchema.parse({ ...req.body, uploadedBy: req.user!.id });
      const [resource] = await db.insert(teamResources).values(resourceData).returning();
      res.status(201).json(resource);
    } catch (error) {
      console.error('Error creating team resource:', error);
      res.status(500).json({ message: 'Failed to create team resource' });
    }
  });

  app.delete('/api/hr/team-resources/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      await db.delete(teamResources).where(eq(teamResources.id, req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting team resource:', error);
      res.status(500).json({ message: 'Failed to delete team resource' });
    }
  });

  // Employee Documents
  app.get('/api/hr/documents', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const { employeeId } = req.query;
      if (employeeId) {
        const employee = await storage.getEmployee(employeeId as string);
        if (!employee) return res.status(404).json({ message: 'Employee not found' });
        if (!await assertLocationAccess(req, res, employee.locationId)) return;
      }
      const documents = await storage.getEmployeeDocuments(employeeId as string);
      res.json(documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ message: 'Failed to fetch documents' });
    }
  });

  app.post('/api/hr/documents', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const document = await storage.createEmployeeDocument({ ...req.body, uploadedBy: req.user!.id });
      res.status(201).json(document);
    } catch (error) {
      console.error('Error creating document:', error);
      res.status(500).json({ message: 'Failed to create document' });
    }
  });

  app.put('/api/hr/documents/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const [doc] = await db.select().from(employeeDocuments).where(eq(employeeDocuments.id, req.params.id)).limit(1);
      if (!doc) return res.status(404).json({ message: 'Document not found' });
      const employee = await storage.getEmployee(doc.employeeId);
      if (employee && !await assertLocationAccess(req, res, employee.locationId)) return;
      const document = await storage.updateEmployeeDocument(req.params.id, { ...req.body, reviewedBy: req.user!.id, reviewedAt: new Date() });
      res.json(document);
    } catch (error) {
      console.error('Error updating document:', error);
      res.status(500).json({ message: 'Failed to update document' });
    }
  });

  app.delete('/api/hr/documents/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const [doc] = await db.select().from(employeeDocuments).where(eq(employeeDocuments.id, req.params.id)).limit(1);
      if (!doc) return res.status(404).json({ message: 'Document not found' });
      const employee = await storage.getEmployee(doc.employeeId);
      if (employee && !await assertLocationAccess(req, res, employee.locationId)) return;
      await storage.deleteEmployeeDocument(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ message: 'Failed to delete document' });
    }
  });

  // Document Requirements
  app.get('/api/hr/document-requirements', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const { locationId, positionId } = req.query;
      if (locationId && !await assertLocationAccess(req, res, locationId as string)) return;
      const requirements = await storage.getDocumentRequirements(locationId as string, positionId as string);
      res.json(requirements);
    } catch (error) {
      console.error('Error fetching document requirements:', error);
      res.status(500).json({ message: 'Failed to fetch document requirements' });
    }
  });

  app.post('/api/hr/document-requirements', isAuthenticated, requireHRAccess, requireLocationAccess(), async (req, res) => {
    try {
      const requirement = await storage.createDocumentRequirement(req.body);
      res.status(201).json(requirement);
    } catch (error) {
      console.error('Error creating document requirement:', error);
      res.status(500).json({ message: 'Failed to create document requirement' });
    }
  });

  // Onboarding Templates
  app.get('/api/hr/onboarding/templates', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const { locationId, positionId } = req.query;
      if (locationId && !await assertLocationAccess(req, res, locationId as string)) return;
      const templates = await storage.getOnboardingTemplates(locationId as string, positionId as string);
      res.json(templates);
    } catch (error) {
      console.error('Error fetching onboarding templates:', error);
      res.status(500).json({ message: 'Failed to fetch onboarding templates' });
    }
  });

  app.post('/api/hr/onboarding/templates', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const template = await storage.createOnboardingTemplate({ ...req.body, createdBy: req.user!.id });
      res.status(201).json(template);
    } catch (error) {
      console.error('Error creating onboarding template:', error);
      res.status(500).json({ message: 'Failed to create onboarding template' });
    }
  });

  app.get('/api/hr/onboarding/templates/:id/steps', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const steps = await storage.getOnboardingSteps(req.params.id);
      res.json(steps);
    } catch (error) {
      console.error('Error fetching onboarding steps:', error);
      res.status(500).json({ message: 'Failed to fetch onboarding steps' });
    }
  });

  app.post('/api/hr/onboarding/steps', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const step = await storage.createOnboardingStep(req.body);
      res.status(201).json(step);
    } catch (error) {
      console.error('Error creating onboarding step:', error);
      res.status(500).json({ message: 'Failed to create onboarding step' });
    }
  });

  // Employee Onboarding Progress
  app.get('/api/hr/onboarding/analytics', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const analytics = await storage.getOnboardingProgress(req.query.locationId as string);
      res.json(analytics);
    } catch (error) {
      console.error('Error fetching onboarding analytics:', error);
      res.status(500).json({ message: 'Failed to fetch onboarding analytics' });
    }
  });

  app.get('/api/hr/onboarding', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const { employeeId } = req.query;
      if (employeeId) {
        const employee = await storage.getEmployee(employeeId as string);
        if (!employee) return res.status(404).json({ message: 'Employee not found' });
        if (!await assertLocationAccess(req, res, employee.locationId)) return;
      }
      const onboarding = await storage.getEmployeeOnboarding(employeeId as string);
      res.json(onboarding);
    } catch (error) {
      console.error('Error fetching employee onboarding:', error);
      res.status(500).json({ message: 'Failed to fetch employee onboarding' });
    }
  });

  app.post('/api/hr/onboarding', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const { employeeId, templateId, startDate, targetCompletionDate, assignedMentorId, notes } = req.body;
      if (!employeeId || !templateId) {
        return res.status(400).json({ message: 'employeeId and templateId are required' });
      }
      // Count steps in the template so totalSteps is never null
      const steps = await storage.getOnboardingSteps(templateId);
      const totalSteps = steps.length > 0 ? steps.length : 1;
      const onboarding = await storage.createEmployeeOnboarding({
        employeeId,
        templateId,
        totalSteps,
        status: 'in-progress',
        startDate: startDate ? new Date(startDate) : new Date(),
        targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate) : null,
        assignedMentorId: assignedMentorId || null,
        notes: notes || null,
      });
      res.status(201).json(onboarding);
    } catch (error) {
      console.error('Error creating employee onboarding:', error);
      res.status(500).json({ message: 'Failed to start onboarding' });
    }
  });

  app.put('/api/hr/onboarding/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const [existing] = await db.select().from(employeeOnboarding).where(eq(employeeOnboarding.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: 'Onboarding record not found' });
      const employee = await storage.getEmployee(existing.employeeId);
      if (employee && !await assertLocationAccess(req, res, employee.locationId)) return;
      const onboarding = await storage.updateEmployeeOnboarding(req.params.id, req.body);
      res.json(onboarding);
    } catch (error) {
      console.error('Error updating employee onboarding:', error);
      res.status(500).json({ message: 'Failed to update employee onboarding' });
    }
  });

  app.get('/api/hr/onboarding/:id/steps', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const [existing] = await db.select().from(employeeOnboarding).where(eq(employeeOnboarding.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: 'Onboarding record not found' });
      const employee = await storage.getEmployee(existing.employeeId);
      if (employee && !await assertLocationAccess(req, res, employee.locationId)) return;
      const steps = await storage.getEmployeeOnboardingSteps(req.params.id);
      res.json(steps);
    } catch (error) {
      console.error('Error fetching onboarding progress steps:', error);
      res.status(500).json({ message: 'Failed to fetch onboarding progress steps' });
    }
  });

  app.put('/api/hr/onboarding/steps/:id', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const [existingStep] = await db.select().from(employeeOnboardingSteps).where(eq(employeeOnboardingSteps.id, req.params.id)).limit(1);
      if (!existingStep) return res.status(404).json({ message: 'Onboarding step not found' });
      const [onboarding] = await db.select().from(employeeOnboarding).where(eq(employeeOnboarding.id, existingStep.employeeOnboardingId)).limit(1);
      if (onboarding) {
        const employee = await storage.getEmployee(onboarding.employeeId);
        if (employee && !await assertLocationAccess(req, res, employee.locationId)) return;
      }
      const step = await storage.updateEmployeeOnboardingStep(req.params.id, {
        ...req.body, completedBy: req.user!.id,
        completedDate: req.body.status === 'completed' ? new Date() : req.body.completedDate,
      });
      res.json(step);
    } catch (error) {
      console.error('Error updating onboarding step:', error);
      res.status(500).json({ message: 'Failed to update onboarding step' });
    }
  });

  app.post('/api/hr/onboarding/invite', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const { employeeId, email, phone, sendMethod = 'email' } = req.body;
      const token = await storage.createOnboardingToken(employeeId, 72);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const inviteUrl = `${baseUrl}/onboarding/${token.token}`;

      if (email) {
        try {
          const { sendEmail } = await import('../email');
          const employee = await storage.getEmployee(employeeId);
          await sendEmail({ to: email, from: process.env.FROM_EMAIL || 'noreply@restroflowsolutions.com', subject: 'Welcome to RestroFlow - Complete Your Onboarding', html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2>Welcome to RestroFlow!</h2><p>Hi ${employee?.firstName || 'there'},</p><p>Please complete your onboarding by clicking the link below:</p><div style="text-align:center;margin:30px 0;"><a href="${inviteUrl}" style="background-color:#f97316;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Complete Onboarding</a></div><p>This invitation will expire in 3 days.</p><p>Best regards,<br>The RestroFlow Team</p></div>` });
        } catch (emailError) { console.error('Failed to send email:', emailError); }
      }

      res.status(201).json({ token: token.token, inviteUrl, expiresAt: token.expiresAt, message: 'Onboarding invitation created successfully' });
    } catch (error) {
      console.error('Error creating onboarding invitation:', error);
      res.status(500).json({ message: 'Failed to create onboarding invitation' });
    }
  });

  // Public onboarding (no auth required)
  app.get('/api/onboarding/:token', async (req, res) => {
    try {
      const validation = await storage.validateOnboardingToken(req.params.token);
      if (!validation.isValid) return res.status(404).json({ error: 'Invalid or expired invitation link', message: 'This invitation link is no longer valid. Please contact your manager for a new link.' });
      res.json({ isValid: true, employee: { firstName: validation.employee?.firstName, lastName: validation.employee?.lastName, email: validation.employee?.email, positionId: validation.employee?.positionId, departmentId: validation.employee?.departmentId } });
    } catch (error) {
      console.error('Error validating onboarding token:', error);
      res.status(500).json({ message: 'Failed to validate invitation' });
    }
  });

  app.post('/api/onboarding/:token/complete', async (req, res) => {
    try {
      const validation = await storage.validateOnboardingToken(req.params.token);
      if (!validation.isValid) return res.status(404).json({ error: 'Invalid or expired invitation link' });
      const { personalInfo, emergencyContact, bankingInfo } = req.body;
      if (validation.employee) {
        const tokenRecord = await storage.getOnboardingTokenByToken(req.params.token);
        await storage.saveEmployeeOnboardingData({
          employeeId: validation.employee.id, tokenId: tokenRecord?.id,
          phone: personalInfo?.phone, address: personalInfo?.address, city: personalInfo?.city, state: personalInfo?.state, zipCode: personalInfo?.zipCode, dateOfBirth: personalInfo?.dateOfBirth, socialSecurityNumber: personalInfo?.ssn,
          emergencyContactName: emergencyContact?.name, emergencyContactPhone: emergencyContact?.phone, emergencyContactRelationship: emergencyContact?.relationship,
          bankName: bankingInfo?.bankName, accountNumber: bankingInfo?.accountNumber, routingNumber: bankingInfo?.routingNumber, accountType: bankingInfo?.accountType,
          ipAddress: req.ip, userAgent: req.get('User-Agent'),
        });
        await storage.updateEmployee(validation.employee.id, { status: 'active' });
      }
      await storage.markOnboardingTokenAsUsed(req.params.token);
      res.json({ success: true, message: 'Onboarding completed successfully! Welcome to the team!' });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      res.status(500).json({ message: 'Failed to complete onboarding' });
    }
  });

  // Employee profile & password (self-service)
  app.get('/api/employees/:id/profile', isAuthenticated, async (req, res) => {
    try {
      const { employee, onboardingData } = await storage.getEmployeeWithOnboardingData(req.params.id);
      if (!employee) return res.status(404).json({ error: 'Employee not found' });
      if (req.params.id !== req.user!.id) {
        if (!await assertLocationAccess(req, res, employee.locationId)) return;
      }
      res.json({
        employee,
        onboardingData: onboardingData ? {
          ...onboardingData,
          socialSecurityNumber: onboardingData.socialSecurityNumber ? '***-**-' + onboardingData.socialSecurityNumber.slice(-4) : null,
          accountNumber: onboardingData.accountNumber ? '*****' + onboardingData.accountNumber.slice(-4) : null,
          routingNumber: onboardingData.routingNumber ? '*****' + onboardingData.routingNumber.slice(-4) : null,
        } : null,
      });
    } catch (error) {
      console.error('Error fetching employee profile:', error);
      res.status(500).json({ error: 'Failed to fetch employee profile' });
    }
  });

  app.put('/api/employees/:id/profile', isAuthenticated, async (req, res) => {
    try {
      if (req.params.id !== req.user!.id) return res.status(403).json({ error: 'You can only update your own profile' });
      const { firstName, lastName, phone, emergencyContactName, emergencyContactPhone } = req.body;
      const existingUser = await storage.getUser(req.params.id);
      await Promise.all([
        storage.updateEmployee(req.params.id, { firstName, lastName, phone, emergencyContactName, emergencyContactPhone }),
        existingUser ? storage.upsertUser({ id: req.params.id, email: existingUser.email, firstName, lastName, role: existingUser.role }) : Promise.resolve(),
      ]);
      res.json({ message: 'Profile updated successfully' });
    } catch (error) {
      console.error('Error updating employee profile:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  app.put('/api/employees/:id/password', isAuthenticated, async (req, res) => {
    try {
      if (req.params.id !== req.user!.id) return res.status(403).json({ error: 'You can only change your own password' });
      const { newPassword } = req.body;
      if (!newPassword) return res.status(400).json({ error: 'New password is required' });
      if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters long' });
      await clerkClient.users.updateUser(req.params.id, { password: newPassword });
      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error('Error updating password:', error);
      res.status(500).json({ error: 'Failed to update password' });
    }
  });

  // Recipe assignments (build sheets)
  app.get('/api/employees/:employeeId/recipe-assignments', isAuthenticated, async (req, res) => {
    try {
      const employee = await storage.getEmployee(req.params.employeeId);
      if (!employee) return res.status(404).json({ error: 'Employee not found' });
      if (employee.locationId && !await assertLocationAccess(req, res, employee.locationId)) return;
      const assignments = await storage.getRecipeAssignmentsForEmployee(req.params.employeeId);
      res.json(assignments);
    } catch (error) {
      console.error('Error fetching recipe assignments:', error);
      res.status(500).json({ error: 'Failed to fetch recipe assignments' });
    }
  });

  app.post('/api/recipe-assignments', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const assignment = await storage.createRecipeAssignment(req.body);
      res.json(assignment);
    } catch (error) {
      console.error('Error creating recipe assignment:', error);
      res.status(500).json({ error: 'Failed to create recipe assignment' });
    }
  });

  app.put('/api/recipe-assignments/:id/status', isAuthenticated, async (req, res) => {
    try {
      const assignment = await storage.updateRecipeAssignmentStatus(req.params.id, req.body.status);
      res.json(assignment);
    } catch (error) {
      console.error('Error updating recipe assignment status:', error);
      res.status(500).json({ error: 'Failed to update assignment status' });
    }
  });

  // Employee onboarding data (manager view with masking)
  app.get('/api/employees/:id/onboarding-data', isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!isOwnerLevel(user?.role)) return res.status(403).json({ error: 'Access denied' });
      const { employee, onboardingData } = await storage.getEmployeeWithOnboardingData(req.params.id);
      if (!employee) return res.status(404).json({ error: 'Employee not found' });
      if (!await assertLocationAccess(req, res, employee.locationId)) return;
      res.json({
        employee,
        onboardingData: onboardingData ? {
          ...onboardingData,
          socialSecurityNumber: onboardingData.socialSecurityNumber ? '***-**-' + onboardingData.socialSecurityNumber.slice(-4) : null,
          accountNumber: onboardingData.accountNumber ? '*****' + onboardingData.accountNumber.slice(-4) : null,
          routingNumber: onboardingData.routingNumber ? '*****' + onboardingData.routingNumber.slice(-4) : null,
        } : null,
      });
    } catch (error) {
      console.error('Error fetching onboarding data:', error);
      res.status(500).json({ error: 'Failed to fetch onboarding data' });
    }
  });
}
