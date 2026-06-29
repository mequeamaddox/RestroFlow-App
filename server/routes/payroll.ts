import type { Express } from 'express';
import { storage } from '../storage';
import { isAuthenticated } from './helpers';
import { assertLocationAccess } from '../securityMiddleware';

export function registerDocumentRoutes(app: Express): void {
  app.get('/api/employees/:employeeId/time-off-requests', isAuthenticated, async (req, res) => {
    try {
      const employee = await storage.getEmployee(req.params.employeeId);
      if (!employee) return res.status(404).json({ message: 'Employee not found' });
      if (employee.locationId && !await assertLocationAccess(req, res, employee.locationId)) return;
      const requests = await storage.getEmployeeTimeOffRequests(req.params.employeeId);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching employee time-off requests:', error);
      res.status(500).json({ message: 'Failed to fetch time-off requests' });
    }
  });

  // Test email
  app.post('/api/test/email', isAuthenticated, async (_req, res) => {
    try {
      const { sendEmail } = await import('../email');
      await sendEmail({ to: 'mequeamaddox@gmail.com', from: process.env.FROM_EMAIL || 'noreply@restroflowsolutions.com', subject: 'RestroFlow Email Test', text: 'This is a test email from RestroFlow to verify Resend is working.', html: '<p>This is a <strong>test email</strong> from RestroFlow to verify Resend is working.</p>' });
      res.json({ success: true, message: 'Test email sent successfully!' });
    } catch (error) {
      console.error('Test email failed:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Document management
  app.get('/api/document-templates', isAuthenticated, async (_req, res) => {
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

  app.get('/api/employees/:employeeId/documents', isAuthenticated, async (req, res) => {
    try {
      const requesterId = req.user!.id;
      const paramId = req.params.employeeId;

      // Resolve employee — param may be a UUID (manager lookup) or a Clerk user ID (employee self-service)
      let employee = await (async () => {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paramId);
        if (isUUID) {
          try { return await storage.getEmployee(paramId); } catch {}
        }
        // Fall back: Clerk user ID → look up by email
        const user = await storage.getUser(paramId);
        if (user?.email) return storage.getEmployeeByEmail(user.email);
        return undefined;
      })();

      if (!employee) return res.status(404).json({ message: 'Employee not found' });

      // Access control: employee can view their own docs; managers need location access
      const isSelf = requesterId === paramId ||
        (req.user!.role === 'employee' && !!employee);
      if (!isSelf && employee.locationId) {
        const userId = requesterId;
        const userRole = req.user!.role;
        let hasAccess = false;
        if (userRole === 'owner') {
          const loc = await storage.getLocationById(employee.locationId);
          hasAccess = !!(loc && loc.ownerId === userId);
        } else {
          const perms = await storage.getUserPermissions(userId);
          hasAccess = perms.some((p: any) => p.locationId === employee!.locationId && p.isActive);
        }
        if (!hasAccess) return res.status(404).json({ message: 'Employee not found' });
      }
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
      const assignmentData = { ...req.body, sentBy: req.user!.id, sentAt: new Date(), status: 'sent' };
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

  app.put('/api/employee-documents/:id/status', isAuthenticated, async (req, res) => {
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

  app.post('/api/employee-documents/:id/signature', isAuthenticated, async (req, res) => {
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

  app.put('/api/employee-documents/:id/start', isAuthenticated, async (req, res) => {
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

  app.post('/api/employee-documents/:id/upload', isAuthenticated, async (req, res) => {
    try {
      const assignment = await storage.updateDocumentAssignment(req.params.id, { status: 'completed', completedAt: new Date() });
      res.json(assignment);
    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ message: 'Failed to upload document' });
    }
  });

  app.get('/api/document-templates/:id/fields', isAuthenticated, async (req, res) => {
    try {
      const fields = await storage.getDocumentFormFields(req.params.id);
      res.json(fields);
    } catch (error) {
      console.error('Error fetching form fields:', error);
      res.status(500).json({ message: 'Failed to fetch form fields' });
    }
  });

  app.get('/api/employee-documents/:id/responses', isAuthenticated, async (req, res) => {
    try {
      const responses = await storage.getDocumentFormResponses(req.params.id);
      res.json(responses);
    } catch (error) {
      console.error('Error fetching form responses:', error);
      res.status(500).json({ message: 'Failed to fetch form responses' });
    }
  });

  app.post('/api/employee-documents/:id/responses', isAuthenticated, async (req, res) => {
    try {
      const { fieldId, fieldValue } = req.body;
      const response = await storage.saveDocumentFormResponse({ assignmentId: req.params.id, fieldId, fieldValue });
      res.json(response);
    } catch (error) {
      console.error('Error saving form response:', error);
      res.status(500).json({ message: 'Failed to save form response' });
    }
  });

  app.post('/api/employee-documents/:id/complete', isAuthenticated, async (req, res) => {
    try {
      const assignment = await storage.updateDocumentAssignment(req.params.id, { status: 'completed', completedAt: new Date() });
      res.json(assignment);
    } catch (error) {
      console.error('Error completing document:', error);
      res.status(500).json({ message: 'Failed to complete document' });
    }
  });
}
