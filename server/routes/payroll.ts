import type { Express } from 'express';
import { storage } from '../storage';
import { isAuthenticated } from './helpers';
import { requireLocationAccess } from '../securityMiddleware';
import { requirePermission, Permission } from '../permissions';

// HR Payroll access middleware
async function requireHRAccess(req: any, res: any, next: any) {
  try {
    const locationId = req.query.locationId as string;
    if (!locationId) return res.status(400).json({ message: 'Location ID required', code: 'LOCATION_REQUIRED' });
    const user = req.user;
    if (user?.role === 'owner') return next();
    const locations = await storage.getLocations();
    const location = locations.find((loc: any) => loc.id === locationId);
    if (!location) return res.status(404).json({ message: 'Location not found' });
    if (!location.hrAddonEnabled) return res.status(403).json({ message: 'HR add-on not enabled for this location', code: 'HR_ADDON_REQUIRED', upgradeUrl: '/upgrade' });
    next();
  } catch (error) {
    console.error('Error checking HR access:', error);
    res.status(500).json({ message: 'Failed to verify HR access' });
  }
}

export function registerPayrollRoutes(app: Express): void {
  // ─── HR Payroll (legacy /api/hr/payroll/... prefix) ──────────────────────

  app.get('/api/hr/payroll/pay-periods', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const payPeriods = await storage.getPayPeriods();
      res.json(payPeriods);
    } catch (error) {
      console.error('Error fetching pay periods:', error);
      res.status(500).json({ message: 'Failed to fetch pay periods' });
    }
  });

  app.post('/api/hr/payroll/pay-periods', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const payPeriod = await storage.createPayPeriod(req.body);
      res.status(201).json(payPeriod);
    } catch (error) {
      console.error('Error creating pay period:', error);
      res.status(500).json({ message: 'Failed to create pay period' });
    }
  });

  app.post('/api/hr/payroll/pay-periods/:id/calculate', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const paystubs = await storage.calculatePayroll(req.params.id);
      res.json(paystubs);
    } catch (error) {
      console.error('Error calculating payroll:', error);
      res.status(500).json({ message: 'Failed to calculate payroll' });
    }
  });

  app.post('/api/hr/payroll/pay-periods/:id/recalculate', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const paystubs = await storage.recalculatePayroll(req.params.id);
      res.json(paystubs);
    } catch (error) {
      console.error('Error recalculating payroll:', error);
      res.status(500).json({ message: 'Failed to recalculate payroll' });
    }
  });

  app.post('/api/hr/payroll/pay-periods/:id/approve', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const payPeriod = await storage.approvePayroll(req.params.id, req.user!.id);
      res.json({ payPeriod });
    } catch (error) {
      console.error('Error approving payroll:', error);
      res.status(500).json({ message: 'Failed to approve payroll' });
    }
  });

  app.post('/api/hr/payroll/pay-periods/:id/generate-pdfs', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const { generatePaycheckPDF } = await import('../pdf-generators/paycheck-simple.js');
      const payPeriod = await storage.getPayrollPeriod(req.params.id);
      if (!payPeriod) return res.status(404).json({ message: 'Pay period not found' });
      const paystubs = await storage.getPaystubsByPeriod(req.params.id);
      const settings = await storage.getPaycheckSettings();
      let checkNumberCounter = settings.lastCheckNumber || 1000;

      const pdfs = await Promise.all(paystubs.map(async (paystub: any, index: number) => {
        const checkNum = paystub.checkNumber || (checkNumberCounter + index + 1).toString();
        const payDate = paystub.payDate || payPeriod.endDate || new Date().toISOString();
        const employeeAddress = paystub.employee.address ||
          [paystub.employee.street, paystub.employee.city, paystub.employee.state, paystub.employee.zip].filter(Boolean).join(', ') || 'N/A';

        const pdfData = {
          checkNumber: checkNum, payDate, employeeName: `${paystub.employee.firstName} ${paystub.employee.lastName}`,
          employeeAddress, netPay: paystub.netPay, regularHours: paystub.regularHours, overtimeHours: paystub.overtimeHours,
          regularRate: paystub.regularRate, overtimeRate: paystub.overtimeRate, regularPay: paystub.regularPay, overtimePay: paystub.overtimePay,
          grossPay: paystub.grossPay, federalTax: paystub.federalTax, stateTax: paystub.stateTax, socialSecurity: paystub.socialSecurity,
          medicare: paystub.medicare, totalDeductions: paystub.totalDeductions, bonuses: paystub.bonuses, tips: paystub.tips,
          companyName: settings.companyName || '', companyAddress: settings.companyAddress || '', companyPhone: settings.companyPhone || '',
          companyEin: settings.companyEin || '', bankName: settings.bankName || '', periodStart: payPeriod.startDate, periodEnd: payPeriod.endDate,
          paycheckLayout: settings.paycheckLayout || 'check_stub_only', displayBusinessName: settings.displayBusinessName || false,
          displayTaxFilingName: settings.displayTaxFilingName || false, taxFilingName: settings.taxFilingName || '',
          printSignature: settings.printSignature || false, displayLast4Ssn: settings.displayLast4Ssn || false,
          employeeSsn: paystub.employee.ssn || '', employeeNumber: paystub.employee.employeeNumber || '',
        };
        const pdfBuffer = await generatePaycheckPDF(pdfData);
        return { paystubId: paystub.id, employeeId: paystub.employeeId, employeeName: pdfData.employeeName, checkNumber: pdfData.checkNumber, pdfBase64: pdfBuffer.toString('base64') };
      }));

      res.json({ pdfs });
    } catch (error) {
      console.error('Error generating PDFs:', error);
      res.status(500).json({ message: 'Failed to generate PDFs' });
    }
  });

  // Manual payroll entry
  app.post('/api/payroll-periods/:id/manual-paycheck', isAuthenticated, async (req, res) => {
    try {
      const paystub = await storage.createManualPaystub(req.params.id, req.body);
      res.status(201).json(paystub);
    } catch (error) {
      console.error('Error creating manual paycheck:', error);
      res.status(500).json({ message: 'Failed to create manual paycheck' });
    }
  });

  // Employee pay stubs (legacy prefix)
  app.get('/api/employee/:employeeId/pay-stubs', isAuthenticated, async (req, res) => {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
      let actualEmployeeId = req.params.employeeId;
      const directEmployee = await storage.getEmployee(req.params.employeeId);
      if (!directEmployee) {
        const user = await storage.getUser(req.user!.id);
        if (user?.email) {
          const employees = await storage.getEmployees();
          const byEmail = employees.find((emp: any) => emp.email === user.email);
          if (byEmail) actualEmployeeId = byEmail.id;
        }
      }
      const payStubs = await storage.getEmployeePayStubs(actualEmployeeId, year);
      res.json(payStubs);
    } catch (error) {
      console.error('Error fetching employee pay stubs:', error);
      res.status(500).json({ message: 'Failed to fetch pay stubs' });
    }
  });

  app.get('/api/employee/:employeeId/payroll-summary', isAuthenticated, async (req, res) => {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
      let actualEmployeeId = req.params.employeeId;
      const directEmployee = await storage.getEmployee(req.params.employeeId);
      if (!directEmployee) {
        const user = await storage.getUser(req.user!.id);
        if (user?.email) {
          const employees = await storage.getEmployees();
          const byEmail = employees.find((emp: any) => emp.email === user.email);
          if (byEmail) actualEmployeeId = byEmail.id;
        }
      }
      const summary = await storage.getEmployeePayrollSummary(actualEmployeeId, year);
      res.json(summary);
    } catch (error) {
      console.error('Error fetching employee payroll summary:', error);
      res.status(500).json({ message: 'Failed to fetch payroll summary' });
    }
  });

  app.delete('/api/hr/payroll/pay-periods/:id', isAuthenticated, requirePermission(Permission.MANAGE_PAYROLL), async (req, res) => {
    try {
      await storage.deletePayPeriod(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting pay period:', error);
      res.status(500).json({ message: 'Failed to delete pay period' });
    }
  });

  app.get('/api/hr/payroll/paystubs/:payPeriodId', isAuthenticated, async (req, res) => {
    try {
      const paystubs = await storage.getPaystubsByPeriod(req.params.payPeriodId);
      res.json(paystubs);
    } catch (error) {
      console.error('Error fetching paystubs:', error);
      res.status(500).json({ message: 'Failed to fetch paystubs' });
    }
  });

  app.get('/api/hr/payroll/deductions', isAuthenticated, async (_req, res) => {
    try {
      const deductions = await storage.getPayrollDeductions();
      res.json(deductions);
    } catch (error) {
      console.error('Error fetching deductions:', error);
      res.status(500).json({ message: 'Failed to fetch deductions' });
    }
  });

  app.get('/api/hr/payroll/summary', isAuthenticated, async (_req, res) => {
    try {
      const summary = await storage.getPayrollSummary();
      res.json(summary);
    } catch (error) {
      console.error('Error fetching payroll summary:', error);
      res.status(500).json({ message: 'Failed to fetch payroll summary' });
    }
  });

  // ─── Modern /api/payroll-periods/... prefix ──────────────────────────────

  app.get('/api/payroll-periods', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const periods = await storage.getPayrollPeriods(req.query.locationId as string);
      res.json(periods);
    } catch (error) {
      console.error('Error fetching payroll periods:', error);
      res.status(500).json({ error: 'Failed to fetch payroll periods' });
    }
  });

  app.post('/api/payroll-periods', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const userId = req.user!.id;
      const requestData = req.body.body || req.body;
      const { frequency, startDate, endDate, locationId, payDate } = requestData;
      const startDateObj = new Date(startDate + 'T00:00:00');
      const endDateObj = new Date(endDate + 'T00:00:00');
      const payDateObj = payDate ? new Date(payDate + 'T00:00:00') : endDateObj;
      const safeFrequency = frequency || 'biweekly';
      const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const name = `${safeFrequency.charAt(0).toUpperCase() + safeFrequency.slice(1)} - ${formatDate(startDateObj)} to ${formatDate(endDateObj)}, ${startDateObj.getFullYear()}`;
      const periodData = {
        name: name || `${safeFrequency} Period`,
        startDate: startDateObj.toISOString().split('T')[0],
        endDate: endDateObj.toISOString().split('T')[0],
        payDate: payDateObj.toISOString().split('T')[0],
        frequency: safeFrequency,
        locationId: locationId || null,
        status: 'draft',
        totalGrossPay: '0.00', totalNetPay: '0.00', totalDeductions: '0.00',
        createdBy: userId,
      };
      const period = await storage.createPayrollPeriod(periodData);
      res.status(201).json(period);
    } catch (error) {
      console.error('Error creating payroll period:', error);
      res.status(500).json({ error: 'Failed to create payroll period' });
    }
  });

  app.get('/api/payroll-periods/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const period = await storage.getPayrollPeriod(req.params.id);
      if (!period) return res.status(404).json({ error: 'Payroll period not found' });
      res.json(period);
    } catch (error) {
      console.error('Error fetching payroll period:', error);
      res.status(500).json({ error: 'Failed to fetch payroll period' });
    }
  });

  app.delete('/api/payroll-periods/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      await storage.deletePayPeriod(req.params.id);
      res.status(200).json({ message: 'Payroll period deleted successfully' });
    } catch (error) {
      console.error('Error deleting payroll period:', error);
      res.status(500).json({ error: 'Failed to delete payroll period' });
    }
  });

  app.get('/api/payroll-periods/:id/paychecks', isAuthenticated, async (req, res) => {
    try {
      const paychecks = await storage.getPaychecks(req.params.id);
      res.json(paychecks);
    } catch (error) {
      console.error('Error fetching paychecks:', error);
      res.status(500).json({ error: 'Failed to fetch paychecks' });
    }
  });

  app.post('/api/paychecks', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const paycheck = await storage.createPaycheck(req.body);
      res.status(201).json(paycheck);
    } catch (error) {
      console.error('Error creating paycheck:', error);
      res.status(500).json({ error: 'Failed to create paycheck' });
    }
  });

  // NOTE: use PUT /api/paychecks/:id (not PATCH) — the PATCH at old line 3762 is superseded
  app.put('/api/paychecks/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const paycheck = await storage.updatePaycheck(req.params.id, req.body);
      res.json(paycheck);
    } catch (error) {
      console.error('Error updating paycheck:', error);
      res.status(500).json({ error: 'Failed to update paycheck' });
    }
  });

  app.post('/api/payroll-periods/:id/recalculate-totals', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      await storage.recalculatePayPeriodTotals(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error recalculating pay period totals:', error);
      res.status(500).json({ error: 'Failed to recalculate totals' });
    }
  });

  app.get('/api/employees/:employeeId/time-off-requests', isAuthenticated, async (req, res) => {
    try {
      const requests = await storage.getEmployeeTimeOffRequests(req.params.employeeId);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching employee time-off requests:', error);
      res.status(500).json({ message: 'Failed to fetch time-off requests' });
    }
  });

  // Paycheck settings
  app.get('/api/payroll/paycheck-settings', isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getPaycheckSettings(req.query.locationId as string);
      res.json(settings);
    } catch (error) {
      console.error('Error fetching paycheck settings:', error);
      res.status(500).json({ error: 'Failed to fetch paycheck settings' });
    }
  });

  app.put('/api/payroll/paycheck-settings', isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.updatePaycheckSettings(req.body, req.query.locationId as string);
      res.json(settings);
    } catch (error) {
      console.error('Error updating paycheck settings:', error);
      res.status(500).json({ error: 'Failed to update paycheck settings' });
    }
  });

  app.get('/api/employees/:employeeId/pay-stubs', isAuthenticated, async (req, res) => {
    try {
      const payStubs = await storage.getEmployeePayStubs(req.params.employeeId);
      res.json(payStubs);
    } catch (error) {
      console.error('Error fetching pay stubs:', error);
      res.status(500).json({ error: 'Failed to fetch pay stubs' });
    }
  });

  app.put('/api/pay-stubs/:id/viewed', isAuthenticated, async (req, res) => {
    try {
      await storage.markPayStubViewed(req.params.id);
      res.json({ message: 'Pay stub marked as viewed' });
    } catch (error) {
      console.error('Error marking pay stub as viewed:', error);
      res.status(500).json({ error: 'Failed to mark pay stub as viewed' });
    }
  });

  // Calculated hours for payroll period
  app.get('/api/payroll-periods/:periodId/calculated-hours', isAuthenticated, async (req, res) => {
    try {
      const calculatedHours = await storage.calculatePayrollHoursFromTimeEntries(req.params.periodId);
      res.json(calculatedHours);
    } catch (error) {
      console.error('Error calculating payroll hours:', error);
      res.status(500).json({ message: 'Failed to calculate payroll hours' });
    }
  });

  // Payroll provider export — sends employee hours/pay data as CSV for import into Gusto, ADP, QuickBooks, Paychex, etc.
  app.get('/api/payroll/export/:periodId', isAuthenticated, async (req, res) => {
    try {
      const { periodId } = req.params;
      const format = (req.query.format as string) || 'csv';
      const paystubs = await storage.getPaystubsByPeriod(periodId);
      if (!paystubs.length) return res.status(404).json({ message: 'No paystubs found for this period' });

      const headers = [
        'employee_id', 'first_name', 'last_name', 'email',
        'regular_hours', 'overtime_hours',
        'regular_rate', 'overtime_rate',
        'regular_pay', 'overtime_pay',
        'gross_pay', 'tips', 'bonuses',
        'pay_date', 'period_start', 'period_end',
      ];

      const rows = paystubs.map((stub: any) => [
        stub.employeeId,
        stub.employee?.firstName || '',
        stub.employee?.lastName || '',
        stub.employee?.email || '',
        parseFloat(stub.regularHours || '0').toFixed(2),
        parseFloat(stub.overtimeHours || '0').toFixed(2),
        parseFloat(stub.regularRate || '0').toFixed(2),
        parseFloat(stub.overtimeRate || '0').toFixed(2),
        parseFloat(stub.regularPay || '0').toFixed(2),
        parseFloat(stub.overtimePay || '0').toFixed(2),
        parseFloat(stub.grossPay || '0').toFixed(2),
        parseFloat(stub.tips || '0').toFixed(2),
        parseFloat(stub.bonuses || '0').toFixed(2),
        stub.payDate || '',
        stub.payPeriod?.startDate || '',
        stub.payPeriod?.endDate || '',
      ]);

      const csv = [headers.join(','), ...rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="payroll-${format}-${periodId}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error('Error exporting payroll:', error);
      res.status(500).json({ message: 'Failed to export payroll data' });
    }
  });

  // Test email
  app.post('/api/test/email', isAuthenticated, async (_req, res) => {
    try {
      const { sendEmail } = await import('../email');
      await sendEmail({ to: 'mequeamaddox@gmail.com', from: 'mequeamaddox@gmail.com', subject: 'RestroFlow Email Test', text: 'This is a test email from RestroFlow to verify Resend is working.', html: '<p>This is a <strong>test email</strong> from RestroFlow to verify Resend is working.</p>' });
      res.json({ success: true, message: 'Test email sent successfully!' });
    } catch (error) {
      console.error('Test email failed:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Document management
  app.get('/api/document-templates', async (_req, res) => {
    try {
      const templates = await storage.getDocumentTemplates();
      res.json(templates);
    } catch (error) {
      console.error('Error fetching document templates:', error);
      res.status(500).json({ message: 'Failed to fetch document templates' });
    }
  });

  app.post('/api/document-templates', isAuthenticated, async (req, res) => {
    try {
      const template = await storage.createDocumentTemplate({ ...req.body, createdBy: req.user!.id });
      res.status(201).json(template);
    } catch (error) {
      console.error('Error creating document template:', error);
      res.status(500).json({ message: 'Failed to create document template' });
    }
  });

  app.get('/api/employees/:employeeId/documents', async (req, res) => {
    try {
      const documents = await storage.getEmployeeDocuments(req.params.employeeId);
      const transformedDocuments = documents.map((doc: any) => ({
        id: doc.id, templateId: doc.templateId || null, status: doc.status, deadline: doc.expiresAt || null,
        notes: doc.notes || null, assignedAt: doc.sentAt || null, completedAt: doc.completedAt || null, filePath: doc.completedFilePath || null,
        template: { name: doc.templateName || 'Unknown Template', type: doc.templateType || 'document', description: doc.description || 'No description available', requirements: doc.isRequired ? 'This document is required for employment' : undefined },
      }));
      res.json(transformedDocuments);
    } catch (error) {
      console.error('Error fetching employee documents:', error);
      res.status(500).json({ message: 'Failed to fetch employee documents' });
    }
  });

  app.post('/api/employee-documents/assign', isAuthenticated, async (req, res) => {
    try {
      const assignmentData = { ...req.body, sentBy: req.user!.id, sentAt: new Date(), status: 'assigned' };
      const assignment = await storage.createDocumentAssignment(assignmentData);
      const employeeId = assignmentData.employeeId;
      const existingOnboarding = await storage.getEmployeeOnboarding(employeeId);
      const hasActive = existingOnboarding && existingOnboarding.some((ob: any) => ob.status === 'in-progress' || ob.status === 'not-started');
      if (!hasActive) {
        const templates = await storage.getOnboardingTemplates();
        if (templates.length > 0) {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + 14);
          await storage.createEmployeeOnboarding({ employeeId, templateId: templates[0].id, totalSteps: 5, status: 'in-progress', startDate: new Date(), targetCompletionDate: targetDate, notes: 'Auto-created from document assignment' });
        }
      }
      res.status(201).json(assignment);
    } catch (error) {
      console.error('Error assigning document:', error);
      res.status(500).json({ message: 'Failed to assign document' });
    }
  });

  app.put('/api/employee-documents/:id/status', async (req, res) => {
    try {
      const { status } = req.body;
      const updateData: any = { status };
      if (status === 'viewed') updateData.viewedAt = new Date();
      if (status === 'completed') updateData.completedAt = new Date();
      if (status === 'signed') updateData.signedAt = new Date();
      const assignment = await storage.updateDocumentAssignment(req.params.id, updateData);
      res.json(assignment);
    } catch (error) {
      console.error('Error updating document status:', error);
      res.status(500).json({ message: 'Failed to update document status' });
    }
  });

  app.post('/api/employee-documents/:id/signature', async (req, res) => {
    try {
      const { signatureData, signedName, employeeId } = req.body;
      const signature = await storage.createEmployeeSignature({ documentAssignmentId: req.params.id, employeeId, signatureData, signedName, ipAddress: req.ip, userAgent: req.get('User-Agent') });
      await storage.updateDocumentAssignment(req.params.id, { status: 'signed', signedAt: new Date(), signaturePath: `/signatures/${signature.id}` });
      const allDocuments = await storage.getEmployeeDocuments(employeeId);
      const completedStatuses = ['completed', 'signed', 'uploaded', 'approved'];
      const allCompleted = allDocuments.every((doc: any) => doc.status && completedStatuses.includes(doc.status));
      if (allCompleted) {
        const onboardingRecords = await storage.getEmployeeOnboarding(employeeId);
        if (onboardingRecords && onboardingRecords.length > 0) {
          const activeOnboarding = onboardingRecords.find((o: any) => o.status === 'in-progress');
          if (activeOnboarding) await storage.updateEmployeeOnboarding(activeOnboarding.id, { status: 'completed', actualCompletionDate: new Date() });
        }
      }
      res.status(201).json(signature);
    } catch (error) {
      console.error('Error creating signature:', error);
      res.status(500).json({ message: 'Failed to create signature' });
    }
  });

  app.put('/api/employee-documents/:id/start', async (req, res) => {
    try {
      const assignment = await storage.updateDocumentAssignment(req.params.id, { status: 'viewed' });
      res.json(assignment);
    } catch (error) {
      console.error('Error starting document:', error);
      res.status(500).json({ message: 'Failed to start document' });
    }
  });

  app.put('/api/employee-documents/:id/manager-upload', isAuthenticated, async (req, res) => {
    try {
      const assignment = await storage.updateDocumentAssignment(req.params.id, { status: 'completed', notes: 'Paper copy uploaded by manager' });
      res.json(assignment);
    } catch (error) {
      console.error('Error uploading paper copy:', error);
      res.status(500).json({ message: 'Failed to upload paper copy' });
    }
  });

  app.post('/api/employee-documents/:id/upload', async (req, res) => {
    try {
      const assignment = await storage.updateDocumentAssignment(req.params.id, { status: 'completed', completedAt: new Date() });
      res.json(assignment);
    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ message: 'Failed to upload document' });
    }
  });

  app.get('/api/document-templates/:id/fields', async (req, res) => {
    try {
      const fields = await storage.getDocumentFormFields(req.params.id);
      res.json(fields);
    } catch (error) {
      console.error('Error fetching form fields:', error);
      res.status(500).json({ message: 'Failed to fetch form fields' });
    }
  });

  app.get('/api/employee-documents/:id/responses', async (req, res) => {
    try {
      const responses = await storage.getDocumentFormResponses(req.params.id);
      res.json(responses);
    } catch (error) {
      console.error('Error fetching form responses:', error);
      res.status(500).json({ message: 'Failed to fetch form responses' });
    }
  });

  app.post('/api/employee-documents/:id/responses', async (req, res) => {
    try {
      const { fieldId, fieldValue } = req.body;
      const response = await storage.saveDocumentFormResponse({ assignmentId: req.params.id, fieldId, fieldValue });
      res.json(response);
    } catch (error) {
      console.error('Error saving form response:', error);
      res.status(500).json({ message: 'Failed to save form response' });
    }
  });

  app.post('/api/employee-documents/:id/complete', async (req, res) => {
    try {
      const assignment = await storage.updateDocumentAssignment(req.params.id, { status: 'completed', completedAt: new Date() });
      res.json(assignment);
    } catch (error) {
      console.error('Error completing document:', error);
      res.status(500).json({ message: 'Failed to complete document' });
    }
  });
}
