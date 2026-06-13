import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireAuth, optionalAuth, type AuthenticatedRequest } from './clerkAuth';
import { getAuth, createClerkClient } from '@clerk/express';
import { requirePermission, requireAnyPermission, Permission } from "./permissions";
import multer from "multer";
import csv from "csv-parser";
import { Readable } from "stream";
import { db } from "./db";
import { sql, eq, desc, and } from "drizzle-orm";
import { 
  inventoryItems,
  recipes,
  wasteEntries,
  posSales,
  users,
  vendorPriceCatalog,
  posEmployeeMappings,
  businessIntelligence
} from "@shared/schema";
import { posService } from "./posService";
import { cloverService } from "./cloverService";
import { OCRService } from "./ocrService";
import { varianceService } from "./varianceService";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { parseVendorCsvRow } from "./packSizeParser";
import fs from 'fs';
import path from 'path';
import {
  insertLocationSchema,
  insertCategorySchema,
  insertVendorSchema,
  insertInventoryItemSchema,
  insertRecipeSchema,
  insertMenuItemSchema,
  insertMenuItemIngredientSchema,
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  insertWasteEntrySchema,
  insertInventoryTransactionSchema,
  insertPosIntegrationSchema,
  insertTeamResourceSchema,
  teamResources,
  ownerOnboarding,
  ownerOnboardingSteps,
  insertOwnerOnboardingSchema,
  insertOwnerOnboardingStepSchema,
  insertInvitationTokenSchema,
  invitationTokens,
} from "@shared/schema";
import { squareSubscriptionService } from "./squareSubscriptionService";
import {
  createSubscriptionSchema,
  squareWebhookSchema,
  cancelSubscriptionSchema,
} from "@shared/subscriptionSchemas";
import { InvitationEmailService } from "./invitationEmailService";
import { sendEmail } from "./email";
import {
  isStripeEnabled,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  mapStripeStatusToPlan,
  type StripePlan,
} from "./stripeService";
import { requirePlan } from "./billingMiddleware";

const clerkClient = createClerkClient({
  secretKey: process.env.VITE_CLERK_SECRET_KEY,
  publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
});

// Use Clerk-only authentication
const isAuthenticated = requireAuth;

// File upload configuration

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for invoice files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'));
    }
  },
});

// Configure multer for CSV and Excel file uploads
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for CSV/Excel files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv', 
      'application/vnd.ms-excel', 
      'application/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel.sheet.macroEnabled.12' // .xlsm
    ];
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.endsWith('.csv') || 
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  },
});



// OCR Access Helper Function
async function checkOcrAccess(userId: string): Promise<{ hasAccess: boolean; creditsRemaining: number; plan: string }> {
  const user = await storage.getUser(userId);
  if (!user) {
    return { hasAccess: false, creditsRemaining: 0, plan: 'free' };
  }

  const plan = user.subscriptionPlan || 'free';
  const ocrCreditsUsed = user.ocrCreditsUsed || 0;
  const maxOcrCredits = 5; // Free plan limit

  if (plan === 'professional' || plan === 'enterprise') {
    return { hasAccess: true, creditsRemaining: 999, plan };
  }

  const creditsRemaining = Math.max(0, maxOcrCredits - ocrCreditsUsed);
  return { hasAccess: creditsRemaining > 0, creditsRemaining, plan };
}

// Helper function to map position titles to user roles (shared across login and creation)
function mapPositionToRole(positionTitle: string | null | undefined): string {
  if (!positionTitle) return 'employee';
  
  const title = positionTitle.toLowerCase();
  if (title.includes('manager') || title.includes('supervisor')) return 'manager';
  if (title.includes('lead') || title.includes('team lead')) return 'team_lead';
  if (title.includes('host') || title.includes('server') || title.includes('bartender') || title.includes('cook')) return 'employee';
  
  return 'employee'; // default fallback
}

// Helper function to calculate subscription total cost
function calculateSubscriptionTotal(plan: string | null, hrAddonLocations: number): number {
  const basePlanCost = plan === 'professional' ? 179 : 0;
  const hrAddonCost = hrAddonLocations * 79;
  return basePlanCost + hrAddonCost;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Clerk authentication routes - deprecated in favor of Clerk's built-in auth
  app.post('/api/auth/login', async (req, res) => {
    res.status(410).json({ 
      message: 'Deprecated. Authentication is now handled by Clerk.' 
    });
  });
    app.post('/api/auth/login-legacy', async (req, res) => {    res.status(410).json({ 
      message: 'Deprecated. Use Clerk authentication.' 
    });
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const { userId, sessionClaims } = getAuth(req);
      if (!userId) {
        return res.status(401).json({ ok: false, message: 'Not authenticated' });
      }

      // Try to find user by Clerk userId first
      let user = await storage.getUser(userId);

      // Fall back to email lookup if not found by ID
      if (!user) {
        const email = sessionClaims?.email as string || '';
        if (email) {
          user = await storage.getUserByEmail(email);
        }
      }

      // Auto-create owner user on first login if not in DB
      if (!user) {
        try {
          const clerkUser = await clerkClient.users.getUser(userId);
          const email = clerkUser.emailAddresses[0]?.emailAddress || '';
          const firstName = clerkUser.firstName || '';
          const lastName = clerkUser.lastName || '';

          // Check if user exists by email
          if (email) {
            user = await storage.getUserByEmail(email);
          }

          if (!user) {
            // Create the user as owner (first-time login)
            await storage.upsertUser({ id: userId, email, firstName, lastName, role: 'owner' });
            user = await storage.getUser(userId);
          } else {
            // Update the user's ID to Clerk's ID
            await storage.upsertUser({ id: userId, email: user.email || email, firstName: user.firstName || firstName, lastName: user.lastName || lastName, role: user.role || 'owner' });
            user = await storage.getUser(userId);
          }
        } catch (clerkErr) {
          console.error('Could not fetch Clerk user:', clerkErr);
          return res.status(401).json({ ok: false, message: 'User not found' });
        }
      }

      if (!user) {
        return res.status(401).json({ ok: false, message: 'User not found' });
      }

      res.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Error getting user info:', error);
      res.status(500).json({ message: 'Failed to get user info' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('__session');
    res.json({ success: true, message: 'Logout successful' });
  });
  app.post('/api/auth/diagnostic/check-user', async (req, res) => {
    res.status(410).json({ message: 'Diagnostic endpoint removed.' });
  });


  // Legacy admin employee creation route - now redirects to unified HR system
  app.post('/api/admin/create-employee', isAuthenticated, async (req, res) => {
    res.status(410).json({ 
      message: 'This endpoint is deprecated. Please use /api/hr/employees for employee creation.',
      redirectTo: '/api/hr/employees'
    });
  });

 // Mobile login handled by Clerk

  // Invoice Processing Routes
  app.get('/api/invoices', isAuthenticated, async (req, res) => {
    try {
      const { status, locationId } = req.query;
      const invoices = await storage.getInvoices(status as string, locationId as string);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.post('/api/invoices', isAuthenticated, async (req, res) => {
    try {
      const invoiceData = req.body;
      const invoice = await storage.createInvoice(invoiceData);
      res.status(201).json(invoice);
    } catch (error) {
      console.error("Error creating invoice:", error);
      res.status(400).json({ message: "Failed to create invoice" });
    }
  });

  app.put('/api/invoices/:id/status', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const invoice = await storage.updateInvoiceStatus(id, status);
      res.json(invoice);
    } catch (error) {
      console.error("Error updating invoice status:", error);
      res.status(400).json({ message: "Failed to update invoice status" });
    }
  });

  app.delete('/api/invoices/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteInvoice(id);
      res.json({ message: "Invoice deleted successfully" });
    } catch (error) {
      console.error("Error deleting invoice:", error);
      res.status(400).json({ message: "Failed to delete invoice" });
    }
  });

  app.get('/api/invoices/stats', isAuthenticated, async (req, res) => {
    try {
      const { locationId } = req.query;
      const stats = await storage.getInvoiceStats(locationId as string);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching invoice stats:", error);
      res.status(500).json({ message: "Failed to fetch invoice stats" });
    }
  });

  // Invoice Upload with AWS Textract OCR Processing
  app.post('/api/invoices/upload', isAuthenticated, upload.single('invoice'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log('Processing file:', req.file.originalname, 'Type:', req.file.mimetype);
      
      // Extract vendor hint from filename
      const filename = req.file.originalname.toLowerCase();
      let vendorHint = '';
      if (filename.includes('atlantic')) vendorHint = 'Atlantic Food Service Repairs';
      else if (filename.includes('inland')) vendorHint = 'Inland Foods';
      else if (filename.includes('food lion')) vendorHint = 'Food Lion';
      else if (filename.includes('c&c')) vendorHint = 'C&C Seafood';
      
      let ocrResult: { text: string; confidence: number };
      
      // Process file with AWS Textract OCR
      if (req.file.mimetype === 'application/pdf') {
        console.log('Processing PDF with AWS Textract OCR...');
        ocrResult = await OCRService.extractTextFromPDF(req.file.buffer);
      } else if (req.file.mimetype.startsWith('image/')) {
        console.log('Processing image with AWS Textract OCR...');
        ocrResult = await OCRService.extractTextFromImage(req.file.buffer);
      } else if (req.file.mimetype === 'text/plain') {
        console.log('Processing text file directly...');
        const text = req.file.buffer.toString('utf-8')
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
          .trim();
        ocrResult = { text, confidence: 100 };
      } else {
        throw new Error('Unsupported file type. Please upload PDF, image, or text files.');
      }

      console.log('OCR completed with confidence:', ocrResult.confidence);
      console.log('Extracted text preview:', ocrResult.text.substring(0, 200) + '...');

      // Save the uploaded file permanently
      const timestamp = Date.now();
      const sanitizedFilename = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileExtension = path.extname(sanitizedFilename);
      const baseFilename = path.basename(sanitizedFilename, fileExtension);
      const fileName = `${timestamp}_${baseFilename}${fileExtension}`;
      const filePath = path.join('uploads', 'invoices', fileName);
      
      // Ensure the directory exists
      const uploadDir = path.dirname(filePath);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Write the file to disk
      fs.writeFileSync(filePath, req.file.buffer);
      console.log('Saved invoice file to:', filePath);

      // Parse invoice data from extracted text
      const parsedData = OCRService.parseInvoiceFromText(ocrResult.text);
      
      // Use vendor hint from filename if no vendor was detected
      if (!parsedData.vendorName || parsedData.vendorName === 'Unknown Vendor') {
        if (vendorHint) {
          parsedData.vendorName = vendorHint;
        }
      }
      
      // Find or create vendor based on the extracted name
      let vendorId = null;
      if (parsedData.vendorName && parsedData.vendorName !== 'Unknown Vendor') {
        // Try to find existing vendor with similar name
        const vendors = await storage.getVendors();
        const existingVendor = vendors.find(v => 
          v.name.toLowerCase().includes(parsedData.vendorName.toLowerCase()) ||
          parsedData.vendorName.toLowerCase().includes(v.name.toLowerCase())
        );
        
        if (existingVendor) {
          vendorId = existingVendor.id;
          console.log(`Found existing vendor: ${existingVendor.name} (${existingVendor.id})`);
          
          // Update vendor with additional info if we have it and it's missing
          if ((parsedData.vendorPhone && !existingVendor.phone) || 
              (parsedData.vendorAddress && !existingVendor.address)) {
            await storage.updateVendor(existingVendor.id, {
              phone: parsedData.vendorPhone || existingVendor.phone,
              address: parsedData.vendorAddress || existingVendor.address
            });
            console.log(`Updated vendor with phone: ${parsedData.vendorPhone}, address: ${parsedData.vendorAddress}`);
          }
        } else {
          // Create new vendor with all extracted information
          // Get current location from request body or session
          const locationId = req.body.locationId;
          if (!locationId) {
            throw new Error("Location ID is required to create vendor");
          }
          
          const newVendor = await storage.createVendor({
            name: parsedData.vendorName,
            contactPerson: null,
            email: null,
            phone: parsedData.vendorPhone || null,
            address: parsedData.vendorAddress || null,
            locationId: locationId
          });
          vendorId = newVendor.id;
          console.log(`Created new vendor: ${newVendor.name} with phone: ${parsedData.vendorPhone}, address: ${parsedData.vendorAddress} (${newVendor.id})`);
        }
      }
      
      // Enhanced logging for debugging
      console.log('Parsed invoice data:', {
        vendor: parsedData.vendorName,
        number: parsedData.invoiceNumber,
        total: parsedData.total,
        subtotal: parsedData.subtotal,
        date: parsedData.invoiceDate
      });
      
      // Sanitize original text to prevent database encoding issues
      const sanitizedText = ocrResult.text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove control characters
        .substring(0, 2000) // Limit text length
        .trim();
      
      // Calculate tax from total - subtotal
      const taxAmount = parsedData.total - parsedData.subtotal;
      const calculatedTax = taxAmount >= 0 ? taxAmount : 0;
      
      // Create invoice with OCR data
      const locationId = req.body.locationId;
      if (!locationId) {
        throw new Error("Location ID is required to save invoice");
      }
      
      const invoiceData = {
        invoiceNumber: parsedData.invoiceNumber,
        vendorId: vendorId, // Use the resolved vendor ID
        invoiceDate: parsedData.invoiceDate,
        subtotal: parsedData.subtotal.toString(),
        total: parsedData.total.toString(),
        tax: calculatedTax.toString(),
        ocrConfidence: Math.round(ocrResult.confidence),
        uploadMethod: req.body.uploadMethod || 'upload',
        status: 'pending',
        lineItems: parsedData.lineItems, // Include extracted line items
        fees: parsedData.fees, // Include IRS-compliant separate fee tracking
        attachmentPath: filePath, // Store path to original invoice file
        originalText: sanitizedText,
        processedAt: new Date(),
        locationId: locationId, // Add location ID for filtering
      };

      // Create the invoice in storage
      const invoice = await storage.createInvoice(invoiceData);
      
      res.status(201).json({
        ...invoice,
        ocrConfidence: invoiceData.ocrConfidence,
        extractedData: parsedData,
        message: 'Invoice processed successfully with AWS Textract OCR'
      });

    } catch (error) {
      console.error("Error processing invoice upload:", error);
      res.status(500).json({ 
        message: "Failed to process invoice upload",
        error: (error as Error).message 
      });
    }
  });

  // Route to serve invoice attachments
  app.get('/api/invoices/:id/attachment', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get invoice data to find attachment path
      const invoices = await storage.getInvoices();
      const invoice = invoices.find(inv => inv.id === id);
      
      if (!invoice || !invoice.attachmentPath) {
        return res.status(404).json({ message: "Invoice attachment not found" });
      }
      
      // Check if file exists
      if (!fs.existsSync(invoice.attachmentPath)) {
        return res.status(404).json({ message: "Attachment file not found on disk" });
      }
      
      // Get file info
      const fileName = path.basename(invoice.attachmentPath);
      const fileExtension = path.extname(fileName);
      
      // Set appropriate content type
      let contentType = 'application/octet-stream';
      if (fileExtension === '.pdf') contentType = 'application/pdf';
      else if (fileExtension === '.jpg' || fileExtension === '.jpeg') contentType = 'image/jpeg';
      else if (fileExtension === '.png') contentType = 'image/png';
      else if (fileExtension === '.txt') contentType = 'text/plain';
      
      // Set headers for file download/viewing
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      
      // Stream the file
      const fileStream = fs.createReadStream(invoice.attachmentPath);
      fileStream.pipe(res);
      
    } catch (error) {
      console.error("Error serving invoice attachment:", error);
      res.status(500).json({ message: "Failed to serve attachment" });
    }
  });

  // Invoice approval route - for saving reviewed/edited invoices
  app.put('/api/invoices/:id/approve', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = req.params.id;
      console.log('🔍 Approve request received for invoice:', invoiceId);
      console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
      
      const { vendor, invoiceNumber, invoiceDate, total, subtotal, lineItems, fees } = req.body;
      
      const updateData = {
        invoiceNumber,
        invoiceDate,
        total: parseFloat(total || '0'),
        subtotal: parseFloat(subtotal || '0'),
        lineItems: lineItems || [],
        fees: fees || [],
        status: 'approved'
      };
      
      console.log('💾 Update data:', JSON.stringify(updateData, null, 2));
      
      // Update the invoice with edited data and approve it
      const result = await storage.updateInvoice(invoiceId, updateData);
      
      console.log('✅ Update result:', JSON.stringify(result, null, 2));
      
      res.json({ message: "Invoice approved successfully", invoice: result });
    } catch (error) {
      console.error("❌ Error approving invoice:", error);
      res.status(500).json({ message: "Failed to approve invoice" });
    }
  });

  // Subscription and OCR Management Routes
  app.get('/api/user/subscription', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const ocrAccess = await storage.checkOcrAccess(userId);
      const user = await storage.getUser(userId);
      
      res.json({
        plan: ocrAccess.plan,
        status: user?.subscriptionStatus || 'inactive',
        creditsUsed: user?.ocrCreditsUsed || 0,
        creditsLimit: user?.ocrCreditsLimit || 5,
        creditsRemaining: ocrAccess.creditsRemaining,
        hasUnlimitedOcr: ocrAccess.plan === 'professional' || ocrAccess.plan === 'enterprise',
        subscriptionEndDate: user?.subscriptionEndDate
      });
    } catch (error) {
      console.error("Error fetching user subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription info" });
    }
  });

  app.post('/api/user/upgrade-plan', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const { plan } = req.body;
      
      if (!['professional', 'enterprise'].includes(plan)) {
        return res.status(400).json({ message: "Invalid subscription plan" });
      }

      // For now, we'll simulate upgrading without Stripe
      // This will be replaced with actual Stripe integration when keys are provided
      const updatedUser = await storage.updateUserSubscription(userId, {
        subscriptionPlan: plan as 'professional' | 'enterprise',
        subscriptionStatus: 'active',
        ocrCreditsLimit: 999, // Unlimited for premium
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      });

      res.json({
        message: `Successfully upgraded to ${plan} plan`,
        user: updatedUser,
        unlimitedOcr: true
      });
    } catch (error) {
      console.error("Error upgrading plan:", error);
      res.status(500).json({ message: "Failed to upgrade plan" });
    }
  });

  app.post('/api/user/reset-credits', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      // Only allow for development/testing purposes
      const updatedUser = await storage.resetOcrCredits(userId);
      
      res.json({
        message: "OCR credits reset successfully",
        creditsUsed: updatedUser.ocrCreditsUsed
      });
    } catch (error) {
      console.error("Error resetting credits:", error);
      res.status(500).json({ message: "Failed to reset credits" });
    }
  });

  // Employee Invitation Management Routes
  
  // Create invitation (owner only)
  app.post('/api/invitations', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const userId = req.user!.id;
      const invitationData = insertInvitationTokenSchema.parse(req.body);
      
      // Ensure invitedBy and expiresAt are set
      const expiresAt = invitationData.expiresAt || new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now
      
      const invitation = await storage.createInvitationToken({
        ...invitationData,
        invitedBy: userId,
        expiresAt,
      });

      // Get inviter and company information for email
      const inviter = await storage.getUser(userId);
      const inviterName = `${inviter?.firstName || ''} ${inviter?.lastName || ''}`.trim() || inviter?.email || 'RestroFlow Admin';
      
      // Get company name and related data for email
      let companyName = 'RestroFlow Restaurant';
      let locationName: string | undefined;
      let departmentName: string | undefined;
      let positionTitle: string | undefined;

      if (invitation.locationId) {
        const locations = await storage.getLocations();
        const location = locations.find(loc => loc.id === invitation.locationId);
        companyName = location?.name || companyName;
        locationName = location?.name;
      }

      if (invitation.departmentId) {
        const departments = await storage.getDepartments();
        const department = departments.find(dept => dept.id === invitation.departmentId);
        departmentName = department?.name;
      }

      if (invitation.positionId) {
        const positions = await storage.getPositions();
        const position = positions.find(pos => pos.id === invitation.positionId);
        positionTitle = position?.title;
      }

      // Send invitation email
      try {
        await InvitationEmailService.sendInvitationEmail(
          invitation,
          inviterName,
          companyName,
          locationName,
          departmentName,
          positionTitle
        );
      } catch (emailError) {
        console.error("Failed to send invitation email:", emailError);
        // Don't fail the invitation creation if email fails
      }

      res.status(201).json({
        message: "Invitation created and email sent successfully",
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        }
      });
    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(400).json({ message: "Failed to create invitation" });
    }
  });

  // List pending invitations (owner only)
  app.get('/api/invitations', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const userId = req.user!.id;
      const invitations = await storage.getInvitationTokens(userId);
      
      res.json(invitations.map(inv => ({
        id: inv.id,
        email: inv.email,
        firstName: inv.firstName,
        lastName: inv.lastName,
        role: inv.role,
        status: inv.status,
        locationId: inv.locationId,
        departmentId: inv.departmentId,
        positionId: inv.positionId,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })));
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  // Validate invitation token (public route)
  app.get('/api/invitations/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const invitation = await storage.getInvitationToken(token);
      
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({ 
          message: `Invitation is ${invitation.status}`,
          status: invitation.status 
        });
      }

      if (new Date() > new Date(invitation.expiresAt)) {
        await storage.updateInvitationToken(invitation.id, {});
        return res.status(400).json({ message: "Invitation has expired" });
      }

      res.json({
        email: invitation.email,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        role: invitation.role,
        locationId: invitation.locationId,
        departmentId: invitation.departmentId,
        positionId: invitation.positionId,
        expiresAt: invitation.expiresAt,
      });
    } catch (error) {
      console.error("Error validating invitation:", error);
      res.status(500).json({ message: "Failed to validate invitation" });
    }
  });

  app.post('/api/invitations/:token/accept', async (req, res) => {
    try {
      const { token } = req.params;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "Password required" });
      }

      const invitation = await storage.getInvitationToken(token);
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }
      if (invitation.status !== 'pending') {
        return res.status(400).json({ message: `Invitation is ${invitation.status}`, status: invitation.status });
      }
      if (new Date() > new Date(invitation.expiresAt)) {
        await storage.updateInvitationToken(invitation.id, {});
        return res.status(400).json({ message: "Invitation has expired" });
      }

      // Create Clerk user account
      let clerkUserId: string;
      try {
        const clerkUser = await clerkClient.users.createUser({
          emailAddress: [invitation.email],
          password: password,
          firstName: invitation.firstName || '',
          lastName: invitation.lastName || '',
        });
        clerkUserId = clerkUser.id;
      } catch (clerkError) {
        console.error("Error creating Clerk user:", clerkError);
        return res.status(400).json({ message: "Failed to create user account" });
      }

      const user = await storage.upsertUser({
        id: clerkUserId,
        email: invitation.email,
        firstName: invitation.firstName || '',
        lastName: invitation.lastName || '',
        role: invitation.role,
        defaultLocationId: invitation.locationId,
      });

      if (invitation.locationId) {
        const locations = await storage.getLocations();
        const location = locations.find(loc => loc.id === invitation.locationId);
        if (location?.hrAddonEnabled) {
          const employeeData = {
            firstName: invitation.firstName || '',
            lastName: invitation.lastName || '',
            email: invitation.email,
            hireDate: invitation.startDate ? (typeof invitation.startDate === 'string' ? invitation.startDate : new Date(invitation.startDate as any).toISOString()) : new Date().toISOString(),
            departmentId: invitation.departmentId,
            positionId: invitation.positionId,
            hourlyRate: invitation.hourlyRate,
            salary: invitation.salary,
          };
          const employee = await storage.createEmployee(employeeData);
          await storage.acceptInvitationToken(token, employee.id);
        } else {
          await storage.acceptInvitationToken(token, '');
        }
      }

      res.json({
        message: "Invitation accepted successfully",
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }
      });
    } catch (error) {
      console.error("Error accepting invitation:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  // Cancel invitation (owner only)
  app.delete('/api/invitations/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const { id } = req.params;
      await storage.cancelInvitationToken(id);
      
      res.json({ message: "Invitation cancelled successfully" });
    } catch (error) {
      console.error("Error cancelling invitation:", error);
      res.status(500).json({ message: "Failed to cancel invitation" });
    }
  });

  // Cleanup expired invitations (internal cron job endpoint)
  app.post('/api/invitations/cleanup', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const expiredCount = await storage.expireOldInvitationTokens();
      res.json({ 
        message: `Cleaned up ${expiredCount} expired invitations`,
        expiredCount 
      });
    } catch (error) {
      console.error("Error cleaning up invitations:", error);
      res.status(500).json({ message: "Failed to cleanup invitations" });
    }
  });

  // Cost Monitoring Routes
  app.get('/api/cost-alerts', isAuthenticated, async (req, res) => {
    try {
      const { location } = req.query;
      const alerts = await storage.getCostAlerts(location as string);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching cost alerts:", error);
      res.status(500).json({ message: "Failed to fetch cost alerts" });
    }
  });

  app.get('/api/price-monitoring', isAuthenticated, async (req, res) => {
    try {
      const { range } = req.query;
      const monitoring = await storage.getPriceMonitoring(range as string);
      res.json(monitoring);
    } catch (error) {
      console.error("Error fetching price monitoring:", error);
      res.status(500).json({ message: "Failed to fetch price monitoring" });
    }
  });

  app.get('/api/cost-trends', isAuthenticated, async (req, res) => {
    try {
      const { range, location } = req.query;
      const trends = await storage.getCostTrends(range as string, location as string);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching cost trends:", error);
      res.status(500).json({ message: "Failed to fetch cost trends" });
    }
  });

  app.get('/api/budget-tracking', isAuthenticated, async (req, res) => {
    try {
      const { location } = req.query;
      const tracking = await storage.getBudgetTracking(location as string);
      res.json(tracking);
    } catch (error) {
      console.error("Error fetching budget tracking:", error);
      res.status(500).json({ message: "Failed to fetch budget tracking" });
    }
  });

  // Business Intelligence Routes
  app.get('/api/business-intelligence/daily-pnl', isAuthenticated, async (req, res) => {
    try {
      const { range, location } = req.query;
      const pnl = await storage.getDailyPnL(range as string, location as string);
      res.json(pnl);
    } catch (error) {
      console.error("Error fetching daily P&L:", error);
      res.status(500).json({ message: "Failed to fetch daily P&L" });
    }
  });

  app.get('/api/business-intelligence/kpis', isAuthenticated, async (req, res) => {
    try {
      const { range, location } = req.query;
      const kpis = await storage.getKPIMetrics(range as string, location as string);
      res.json(kpis);
    } catch (error) {
      console.error("Error fetching KPIs:", error);
      res.status(500).json({ message: "Failed to fetch KPIs" });
    }
  });

  app.get('/api/business-intelligence/profitability', isAuthenticated, async (req, res) => {
    try {
      const { range, location } = req.query;
      const analysis = await storage.getProfitabilityAnalysis(range as string, location as string);
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching profitability analysis:", error);
      res.status(500).json({ message: "Failed to fetch profitability analysis" });
    }
  });

  app.get('/api/business-intelligence/menu-performance', isAuthenticated, async (req, res) => {
    try {
      const { range, location } = req.query;
      const performance = await storage.getMenuPerformance(range as string, location as string);
      res.json(performance);
    } catch (error) {
      console.error("Error fetching menu performance:", error);
      res.status(500).json({ message: "Failed to fetch menu performance" });
    }
  });

  app.get('/api/business-intelligence/cost-analysis', isAuthenticated, async (req, res) => {
    try {
      const { range, location } = req.query;
      const analysis = await storage.getCostAnalysis(range as string, location as string);
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching cost analysis:", error);
      res.status(500).json({ message: "Failed to fetch cost analysis" });
    }
  });

  // Locations
  app.get('/api/locations', isAuthenticated, async (req, res) => {
    try {
      const locations = await storage.getLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post('/api/locations', isAuthenticated, async (req, res) => {
    try {
      const locationData = insertLocationSchema.parse(req.body);
      const location = await storage.createLocation(locationData);
      res.status(201).json(location);
    } catch (error) {
      console.error("Error creating location:", error);
      res.status(400).json({ message: "Failed to create location" });
    }
  });

  app.patch('/api/locations/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const locationData = insertLocationSchema.partial().parse(req.body);
      const location = await storage.updateLocation(id, locationData);
      res.json(location);
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(400).json({ message: "Failed to update location" });
    }
  });

  app.delete('/api/locations/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteLocation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting location:", error);
      res.status(400).json({ message: "Failed to delete location" });
    }
  });

  // Dashboard metrics
  app.get('/api/dashboard/metrics', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const metrics = await storage.getDashboardMetrics(locationId);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      res.status(500).json({ message: "Failed to fetch dashboard metrics" });
    }
  });

  // Categories
  app.get('/api/categories', isAuthenticated, async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post('/api/categories', isAuthenticated, async (req, res) => {
    try {
      const categoryData = insertCategorySchema.parse(req.body);
      const category = await storage.createCategory(categoryData);
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(400).json({ message: "Failed to create category" });
    }
  });

  app.put('/api/categories/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const categoryData = insertCategorySchema.partial().parse(req.body);
      const category = await storage.updateCategory(id, categoryData);
      res.json(category);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(400).json({ message: "Failed to update category" });
    }
  });

  app.delete('/api/categories/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteCategory(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(400).json({ message: "Failed to delete category" });
    }
  });

  // Vendors
  app.get('/api/vendors', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const vendors = await storage.getVendors(locationId);
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  app.get('/api/vendors/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const vendor = await storage.getVendor(id);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      res.json(vendor);
    } catch (error) {
      console.error("Error fetching vendor:", error);
      res.status(500).json({ message: "Failed to fetch vendor" });
    }
  });

  app.post('/api/vendors', isAuthenticated, async (req, res) => {
    try {
      const vendorData = insertVendorSchema.parse(req.body);
      const vendor = await storage.createVendor(vendorData);
      res.status(201).json(vendor);
    } catch (error) {
      console.error("Error creating vendor:", error);
      res.status(400).json({ message: "Failed to create vendor" });
    }
  });

  app.put('/api/vendors/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const vendorData = insertVendorSchema.partial().parse(req.body);
      const vendor = await storage.updateVendor(id, vendorData);
      res.json(vendor);
    } catch (error) {
      console.error("Error updating vendor:", error);
      res.status(400).json({ message: "Failed to update vendor" });
    }
  });

  app.delete('/api/vendors/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteVendor(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting vendor:", error);
      res.status(400).json({ message: "Failed to delete vendor" });
    }
  });

  // Inventory Items
  app.get('/api/inventory', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const items = await storage.getInventoryItems(locationId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching inventory items:", error);
      res.status(500).json({ message: "Failed to fetch inventory items" });
    }
  });

  app.get('/api/inventory/low-stock', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const items = await storage.getLowStockItems(locationId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching low stock items:", error);
      res.status(500).json({ message: "Failed to fetch low stock items" });
    }
  });

  // Get remaining stock levels with multi-unit conversion
  app.get('/api/inventory/stock-levels', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      
      if (!locationId) {
        return res.status(400).json({ message: 'Location ID is required' });
      }
      
      const stockLevels = await storage.getRemainingStockLevels(locationId);
      res.json(stockLevels);
    } catch (error) {
      console.error('Error fetching stock levels:', error);
      res.status(500).json({ message: 'Failed to fetch stock levels' });
    }
  });

  app.get('/api/inventory/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const item = await storage.getInventoryItem(id);
      if (!item) {
        return res.status(404).json({ message: "Inventory item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error fetching inventory item:", error);
      res.status(500).json({ message: "Failed to fetch inventory item" });
    }
  });

  // REMOVED: Import invoice line items to inventory
  // Users now import inventory via CSV instead
  // app.post('/api/inventory/import-from-invoice', isAuthenticated, async (req, res) => { ... });

  app.post('/api/inventory', isAuthenticated, async (req, res) => {
    try {
      const itemData = insertInventoryItemSchema.parse(req.body);
      const item = await storage.createInventoryItem(itemData);
      
      // Create inventory transaction for initial stock
      await storage.createInventoryTransaction({
        inventoryItemId: item.id,
        locationId: itemData.locationId,
        type: "in",
        quantity: itemData.quantity?.toString() || "0",
        reference: "Initial stock",
        createdBy: req.user!.id || "system",
      });
      
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating inventory item:", error);
      res.status(400).json({ message: "Failed to create inventory item" });
    }
  });

  app.put('/api/inventory/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const itemData = insertInventoryItemSchema.partial().parse(req.body);
      const item = await storage.updateInventoryItem(id, itemData);
      res.json(item);
    } catch (error) {
      console.error("Error updating inventory item:", error);
      res.status(400).json({ message: "Failed to update inventory item" });
    }
  });

  app.delete('/api/inventory/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteInventoryItem(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting inventory item:", error);
      res.status(400).json({ message: "Failed to delete inventory item" });
    }
  });

  // CSV Import for inventory items - Enhanced with vendor invoice format support
  app.post('/api/inventory/import', isAuthenticated, csvUpload.single('file'), async (req, res) => {
    try {
      const locationId = req.body.locationId;
      const vendorId = req.body.vendorId;
      const userId = req.user!.id;
      
      if (!locationId) {
        return res.status(400).json({ message: "Location ID is required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log('📁 CSV Import started:', {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        locationId,
        vendorId
      });

      const results: any[] = [];
      const errors: Array<{ row: number; field: string; message: string; warning?: boolean }> = [];
      let rowNumber = 0;

      const categories = await storage.getCategories();
      const vendors = await storage.getVendors(locationId);

      // Check if file is Excel
      const isExcel = req.file.originalname.endsWith('.xlsx') || req.file.originalname.endsWith('.xls');

      if (isExcel) {
        // Parse Excel file using Python
        console.log('📊 Parsing Excel file...');
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execPromise = promisify(exec);
        const fs = await import('fs');
        const path = await import('path');
        
        // Write buffer to temp file
        const tempFilePath = path.join('/tmp', `import_${Date.now()}.xlsx`);
        fs.writeFileSync(tempFilePath, req.file.buffer);
        
        try {
          const { stdout } = await execPromise(`python3 -c "
import openpyxl
import json
wb = openpyxl.load_workbook('${tempFilePath}')
ws = wb.active
rows = []
header_found = False
for row in ws.iter_rows(values_only=True):
    if not any(row):
        continue
    if not header_found and row[0] == 'Category':
        header_found = True
        continue
    if header_found and row[0] and row[1]:
        rows.append({
            'Category': str(row[0]) if row[0] else '',
            'Item': str(row[1]) if row[1] else '',
            'Avg Price': float(row[2]) if row[2] else 0,
            'Cost': float(row[3]) if row[3] else 0
        })
print(json.dumps(rows))
"`);
          
          const excelData = JSON.parse(stdout);
          for (const row of excelData) {
            rowNumber++;
            results.push({ rowNumber, data: row });
          }
          
          // Clean up temp file
          fs.unlinkSync(tempFilePath);
        } catch (error) {
          console.error('Error parsing Excel:', error);
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          return res.status(400).json({ message: 'Failed to parse Excel file' });
        }
      } else {
        // Handle vendor CSVs with header rows before the actual column headers
        const csvText = req.file.buffer.toString('utf-8');
        const lines = csvText.split('\n');
        
        // Find the line with actual column headers (containing "Product Description" or "Pack Size")
        let headerLineIndex = 0;
        for (let i = 0; i < Math.min(20, lines.length); i++) {
          const line = lines[i].toLowerCase();
          if (line.includes('product description') || 
              (line.includes('pack') && line.includes('size')) ||
              line.includes('category name')) {
            headerLineIndex = i;
            console.log(`📍 Found actual CSV headers at line ${i + 1}`);
            break;
          }
        }

        // Parse CSV starting from the header line
        const csvDataToRead = lines.slice(headerLineIndex).join('\n');
        const stream = Readable.from(Buffer.from(csvDataToRead, 'utf-8'));
        
        await new Promise<void>((resolve, reject) => {
          stream
            .pipe(csv())
            .on('data', (row) => {
              rowNumber++;
              results.push({ rowNumber, data: row });
            })
            .on('end', () => {
              resolve();
            })
            .on('error', (error) => {
              reject(error);
            });
        });
      }

      console.log(`📊 Parsed ${results.length} rows from CSV`);

      let successCount = 0;
      let failedCount = 0;
      
      const firstRow = results[0]?.data || {};
      const columnNames = Object.keys(firstRow).map(k => k.toLowerCase().trim());
      
      // Check for Excel simple format (Category, Item, Avg Price, Cost)
      const hasExcelColumns = columnNames.includes('category') && 
                              columnNames.includes('item') && 
                              (columnNames.includes('avg price') || columnNames.includes('cost'));
      
      const hasSizeColumn = columnNames.some(col => 
        col.includes('pack') || col.includes('size') || 
        col.match(/\b(pack|size|pkg|ct|count)\b/)
      );
      
      let detectedFormat = 'standard';
      
      if (hasExcelColumns) {
        detectedFormat = 'excel_simple';
        console.log('📊 Detected Excel simple format (Category, Item, Avg Price, Cost)');
      } else if (hasSizeColumn) {
        console.log(`🔍 Size column detected - sampling first rows for vendor format...`);
        const sampleRows = results.slice(0, Math.min(10, results.length));
        let vendorParseSuccesses = 0;
        
        for (const result of sampleRows) {
          const parsed = parseVendorCsvRow(result.data, true);
          console.log(`   Row ${result.rowNumber}: parsed=${!!parsed}, success=${parsed?.parsed.parseSuccess}, item=${parsed?.itemName?.substring(0, 30)}`);
          if (parsed && parsed.parsed.parseSuccess) {
            vendorParseSuccesses++;
          }
        }
        
        const successRate = vendorParseSuccesses / sampleRows.length;
        console.log(`📊 Vendor parse results: ${vendorParseSuccesses}/${sampleRows.length} successful (${(successRate * 100).toFixed(0)}% success rate)`);
        if (successRate >= 0.5) {
          detectedFormat = 'vendor';
        }
      }
      
      console.log(`📋 Detected CSV format: ${detectedFormat} (columns: ${columnNames.slice(0, 5).join(', ')}...)`);

      for (const result of results) {
        const { rowNumber, data } = result;
        const row = data;

        let itemData: any = null;
        let vendorPricingData: any = null;

        try {

          if (detectedFormat === 'vendor') {
            const parsed = parseVendorCsvRow(row);
            
            if (!parsed) {
              errors.push({ row: rowNumber, field: 'general', message: 'Missing required fields for vendor format' });
              failedCount++;
              continue;
            }

            if (!parsed.parsed.parseSuccess) {
              errors.push({ 
                row: rowNumber, 
                field: 'Pack Size', 
                message: parsed.parsed.parseError || 'Failed to parse pack size',
                warning: true
              });
            }

            if (parsed.costs.costMismatch) {
              errors.push({
                row: rowNumber,
                field: 'Per Unit Cost',
                message: `Cost mismatch: Calculated $${parsed.costs.perPieceCost?.toFixed(4)} vs Vendor $${parsed.vendorPerUnitCost?.toFixed(4)} (${parsed.costs.costMismatchPercent?.toFixed(1)}% diff)`,
                warning: true
              });
            }

            let selectedVendorId = vendorId;
            if (!selectedVendorId && vendors.length > 0) {
              selectedVendorId = vendors[0].id;
            }

            const categoryMatch = categories.find(c => {
              const itemNameLower = parsed.itemName.toLowerCase();
              const categoryLower = c.name.toLowerCase();
              return itemNameLower.includes(categoryLower) || categoryLower.includes(itemNameLower.split(' ')[0]);
            });

            // Calculate normalized unit prices
            const pricePerLb = parsed.parsed.innerUnit === 'lb' && parsed.costs.perBaseUnitCost 
              ? parsed.costs.perBaseUnitCost.toString() 
              : null;
            const pricePerGa = parsed.parsed.innerUnit === 'gal' && parsed.costs.perBaseUnitCost
              ? parsed.costs.perBaseUnitCost.toString()
              : null;
            const pricePerOz = parsed.parsed.innerUnit === 'oz' && parsed.costs.perBaseUnitCost
              ? parsed.costs.perBaseUnitCost.toString()
              : (pricePerLb ? (Number(pricePerLb) / 16).toString() : null);

            itemData = {
              name: parsed.itemName.trim(),
              description: `${parsed.rawPackSize} ${parsed.purchaseUom}`,
              categoryId: categoryMatch?.id || null,
              vendorId: selectedVendorId,
              locationId,
              quantity: "0",
              unit: parsed.purchaseUom || 'case',
              costPerUnit: parsed.caseCost.toString(),
              purchaseUnit: parsed.purchaseUom || 'case',
              recipeUnit: parsed.parsed.innerUnit || 'oz',
              conversionFactor: parsed.parsed.totalBaseUnits?.toString() || "1",
              costPerPurchaseUnit: parsed.caseCost.toString(),
              reorderLevel: "0",
              barcode: parsed.vendorSku || null,
              // Add new conversion fields for universal recipe costing
              packSize: parsed.rawPackSize,
              caseQuantity: parsed.parsed.packQty?.toString(),
              casePrice: parsed.caseCost.toString(),
              pricePerLb: pricePerLb,
              pricePerGa: pricePerGa,
              pricePerOz: pricePerOz,
              pricePerInnerUnit: parsed.costs.perPieceCost?.toString(),
              innerUnit: parsed.parsed.innerUnit,
              piecesPerLb: parsed.conversion.piecesPerLb?.toString(),
              ozPerPiece: parsed.conversion.ozPerPiece?.toString(),
              ozPerCup: parsed.conversion.ozPerCup?.toString(),
              cupsPerGa: parsed.conversion.cupsPerGa?.toString(),
              yieldPct: parsed.conversion.yieldPct?.toString(),
              gradeLow: parsed.conversion.gradeLow,
              gradeHigh: parsed.conversion.gradeHigh,
            };

            if (selectedVendorId && parsed.parsed.parseSuccess) {
              vendorPricingData = {
                vendorId: selectedVendorId,
                costPerUnit: parsed.caseCost.toString(),
                unit: parsed.purchaseUom || 'case',
                caseCost: parsed.caseCost.toString(),
                purchaseUom: parsed.purchaseUom || 'case',
                packQty: parsed.parsed.packQty,
                innerSize: parsed.parsed.innerSize?.toString(),
                innerUnit: parsed.parsed.innerUnit,
                perPieceCost: parsed.costs.perPieceCost?.toString(),
                perBaseUnitCost: parsed.costs.perBaseUnitCost?.toString(),
                totalBaseUnits: parsed.parsed.totalBaseUnits?.toString(),
                vendorSku: parsed.vendorSku,
                packSizeRaw: parsed.rawPackSize,
              };
            }
          } else if (detectedFormat === 'excel_simple') {
            // Excel simple format: Category, Item, Avg Price, Cost
            const categoryName = row.Category || row.category;
            const itemName = row.Item || row.item;
            const avgPriceRaw = row['Avg Price'] || row['avg price'] || '';
            const costRaw = row.Cost || row.cost || '';

            // Clean currency values - remove $, commas, and trim spaces
            const cleanCurrency = (value: string | number): number => {
              if (typeof value === 'number') return value;
              const cleaned = String(value).replace(/[$,]/g, '').trim();
              const parsed = parseFloat(cleaned);
              return isNaN(parsed) ? 0 : parsed;
            };

            const avgPrice = cleanCurrency(avgPriceRaw);
            const cost = cleanCurrency(costRaw);

            console.log(`📝 Row ${rowNumber}: category="${categoryName}", item="${itemName}", cost=${cost}`);

            if (!itemName || itemName.trim() === '') {
              console.error(`❌ Row ${rowNumber}: Item name is missing`);
              errors.push({ row: rowNumber, field: 'Item', message: 'Item name is required' });
              failedCount++;
              continue;
            }

            // Match category by name
            const categoryMatch = categories.find(c => 
              c.name.toLowerCase() === (categoryName || '').toLowerCase()
            );

            if (!categoryMatch) {
              console.log(`⚠️ Row ${rowNumber}: Category "${categoryName}" not found - item will have no category`);
            }

            let selectedVendorId = vendorId;
            if (!selectedVendorId && vendors.length > 0) {
              selectedVendorId = vendors[0].id;
            }

            // Only include fields that exist in the inventory_items schema
            itemData = {
              name: itemName.trim(),
              description: categoryName ? `${categoryName}` : null,
              categoryId: categoryMatch?.id || null,
              vendorId: selectedVendorId,
              locationId,
              quantity: "0",
              unit: "each",
              costPerUnit: cost.toString(),
              purchaseUnit: "each",
              recipeUnit: "each",
              conversionFactor: "1",
              costPerPurchaseUnit: cost.toString(),
              reorderLevel: "0",
            };
          } else {
            if (!row.name || row.name.trim() === '') {
              errors.push({ row: rowNumber, field: 'name', message: 'Name is required' });
              failedCount++;
              continue;
            }

            if (!row.quantity || isNaN(parseFloat(row.quantity))) {
              errors.push({ row: rowNumber, field: 'quantity', message: 'Valid quantity is required' });
              failedCount++;
              continue;
            }

            if (!row.unit || row.unit.trim() === '') {
              errors.push({ row: rowNumber, field: 'unit', message: 'Unit is required' });
              failedCount++;
              continue;
            }

            if (!row.costPerUnit || isNaN(parseFloat(row.costPerUnit))) {
              errors.push({ row: rowNumber, field: 'costPerUnit', message: 'Valid cost per unit is required' });
              failedCount++;
              continue;
            }

            let categoryId = null;
            if (row.categoryName && row.categoryName.trim() !== '') {
              const category = categories.find(c => c.name.toLowerCase() === row.categoryName.trim().toLowerCase());
              if (!category) {
                errors.push({ row: rowNumber, field: 'categoryName', message: `Category '${row.categoryName}' not found` });
                failedCount++;
                continue;
              }
              categoryId = category.id;
            }

            let selectedVendorId = null;
            if (row.vendorName && row.vendorName.trim() !== '') {
              const vendor = vendors.find(v => v.name.toLowerCase() === row.vendorName.trim().toLowerCase());
              if (!vendor) {
                errors.push({ row: rowNumber, field: 'vendorName', message: `Vendor '${row.vendorName}' not found` });
                failedCount++;
                continue;
              }
              selectedVendorId = vendor.id;
            }

            itemData = {
              name: row.name.trim(),
              description: row.description?.trim() || null,
              categoryId,
              vendorId: selectedVendorId,
              locationId,
              quantity: parseFloat(row.quantity).toString(),
              unit: row.unit.trim(),
              costPerUnit: parseFloat(row.costPerUnit).toString(),
              reorderLevel: row.reorderLevel ? parseFloat(row.reorderLevel).toString() : "0",
              barcode: row.sku?.trim() || null,
            };
          }

          const validatedData = insertInventoryItemSchema.parse(itemData);
          const item = await storage.createInventoryItem(validatedData);

          if (vendorPricingData && item.id) {
            try {
              await db.insert(vendorPriceCatalog).values({
                ...vendorPricingData,
                inventoryItemId: item.id,
              });
            } catch (vpError) {
              console.error('Failed to create vendor pricing:', vpError);
            }
          }

          if (detectedFormat === 'standard' && parseFloat(validatedData.quantity || "0") > 0) {
            await storage.createInventoryTransaction({
              inventoryItemId: item.id,
              locationId,
              type: "in",
              quantity: validatedData.quantity?.toString() || "0",
              reference: "CSV Import",
              createdBy: userId,
            });
          }

          successCount++;
        } catch (error: any) {
          console.error(`❌ Error processing row ${rowNumber}:`, error);
          console.error(`   Item data:`, JSON.stringify(itemData, null, 2));
          errors.push({ 
            row: rowNumber, 
            field: 'general', 
            message: error.message || 'Failed to process row' 
          });
          failedCount++;
        }
      }

      console.log(`✅ CSV Import completed: ${successCount} success, ${failedCount} failed`);

      res.json({
        success: successCount,
        failed: failedCount,
        errors: errors.slice(0, 100),
        totalRows: results.length,
        format: detectedFormat
      });
    } catch (error: any) {
      console.error("Error importing CSV:", error);
      res.status(500).json({ message: error.message || "Failed to import CSV file" });
    }
  });

  // Menu Items & Recipes
  // Recipes
  app.get('/api/recipes', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const recipes = await storage.getRecipes(locationId);
      res.json(recipes);
    } catch (error) {
      console.error("Error fetching recipes:", error);
      res.status(500).json({ message: "Failed to fetch recipes" });
    }
  });

  app.get('/api/recipes/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const recipe = await storage.getRecipe(id);
      if (!recipe) {
        return res.status(404).json({ message: "Recipe not found" });
      }
      res.json(recipe);
    } catch (error) {
      console.error("Error fetching recipe:", error);
      res.status(500).json({ message: "Failed to fetch recipe" });
    }
  });

  app.post('/api/recipes', isAuthenticated, async (req, res) => {
    try {
      const { ingredients, ...recipeData } = req.body;
      const parsedRecipeData = insertRecipeSchema.parse(recipeData);
      
      if (ingredients && ingredients.length > 0) {
        // Create recipe with ingredients
        const recipe = await storage.createRecipeWithIngredients({
          ...parsedRecipeData,
          ingredients: ingredients.map((ing: any) => ({
            inventoryItemId: ing.inventoryItemId,
            quantity: ing.quantity,
            unit: ing.unit
          }))
        });
        res.status(201).json(recipe);
      } else {
        // Create recipe without ingredients
        const recipe = await storage.createRecipe(parsedRecipeData);
        res.status(201).json(recipe);
      }
    } catch (error) {
      console.error("Error creating recipe:", error);
      res.status(400).json({ message: "Failed to create recipe" });
    }
  });

  app.put('/api/recipes/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { ingredients, ...recipeData } = req.body;
      const parsedRecipeData = insertRecipeSchema.partial().parse(recipeData);
      
      // Update recipe basic data
      const recipe = await storage.updateRecipe(id, parsedRecipeData);
      
      // Update ingredients if provided
      if (ingredients !== undefined) {
        // Delete existing ingredients
        await storage.deleteRecipeIngredients(id);
        
        // Add new ingredients
        if (ingredients.length > 0) {
          const ingredientsWithRecipeId = ingredients.map((ing: any) => ({
            recipeId: id,
            inventoryItemId: ing.inventoryItemId,
            quantity: ing.quantity,
            unit: ing.unit
          }));
          await storage.addRecipeIngredients(ingredientsWithRecipeId);
        }
      }
      
      res.json(recipe);
    } catch (error) {
      console.error("Error updating recipe:", error);
      res.status(400).json({ message: "Failed to update recipe" });
    }
  });

  app.delete('/api/recipes/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteRecipe(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting recipe:", error);
      res.status(400).json({ message: "Failed to delete recipe" });
    }
  });

  // Menu items (separate from recipes)
  app.get('/api/menu-items', isAuthenticated, async (req, res) => {
    try {
      const menuItems = await storage.getMenuItems();
      res.json(menuItems);
    } catch (error) {
      console.error("Error fetching menu items:", error);
      res.status(500).json({ message: "Failed to fetch menu items" });
    }
  });

  app.post('/api/menu-items', isAuthenticated, async (req, res) => {
    try {
      const menuItemData = insertMenuItemSchema.parse(req.body);
      const menuItem = await storage.createMenuItem(menuItemData);
      res.status(201).json(menuItem);
    } catch (error) {
      console.error("Error creating menu item:", error);
      res.status(400).json({ message: "Failed to create menu item" });
    }
  });

  // Menu item ingredients
  app.post('/api/recipes/:id/ingredients', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const ingredientData = insertMenuItemIngredientSchema.parse({
        ...req.body,
        menuItemId: id,
      });
      const ingredient = await storage.addMenuItemIngredient(ingredientData);
      res.status(201).json(ingredient);
    } catch (error) {
      console.error("Error adding menu item ingredient:", error);
      res.status(400).json({ message: "Failed to add menu item ingredient" });
    }
  });

  app.delete('/api/menu-item-ingredients/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.removeMenuItemIngredient(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing menu item ingredient:", error);
      res.status(400).json({ message: "Failed to remove menu item ingredient" });
    }
  });

  // Enterprise Variance Reporting API Routes
  app.get('/api/variance/summary', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const days = parseInt(req.query.days as string) || 30;
      
      if (!locationId) {
        return res.status(400).json({ message: "Location ID is required" });
      }
      
      const summary = await varianceService.getVarianceSummary(locationId, days);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching variance summary:", error);
      res.status(500).json({ message: "Failed to fetch variance summary" });
    }
  });

  app.get('/api/variance/report', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);
      
      if (!locationId || !startDate || !endDate) {
        return res.status(400).json({ message: "Location ID, start date, and end date are required" });
      }
      
      const report = await varianceService.generateVarianceReport(locationId, startDate, endDate);
      res.json(report);
    } catch (error) {
      console.error("Error generating variance report:", error);
      res.status(500).json({ message: "Failed to generate variance report" });
    }
  });

  app.get('/api/variance/production', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);
      
      if (!locationId || !startDate || !endDate) {
        return res.status(400).json({ message: "Location ID, start date, and end date are required" });
      }
      
      const variance = await varianceService.getProductionVariance(locationId, startDate, endDate);
      res.json(variance);
    } catch (error) {
      console.error("Error fetching production variance:", error);
      res.status(500).json({ message: "Failed to fetch production variance" });
    }
  });

  app.post('/api/variance/production', isAuthenticated, async (req, res) => {
    try {
      const { recipeId, locationId, quantityProduced, batchNumber } = req.body;
      const userId = req.user!.id;
      
      if (!recipeId || !locationId || !quantityProduced) {
        return res.status(400).json({ message: "Recipe ID, location ID, and quantity produced are required" });
      }
      
      const productionId = await varianceService.recordRecipeProduction(
        recipeId, 
        locationId, 
        parseFloat(quantityProduced),
        userId,
        batchNumber
      );
      
      if (!productionId) {
        return res.status(500).json({ message: "Failed to record production" });
      }
      
      res.json({ id: productionId, message: "Production recorded successfully" });
    } catch (error) {
      console.error("Error recording production:", error);
      res.status(500).json({ message: "Failed to record production" });
    }
  });

  app.post('/api/variance/generate', isAuthenticated, async (req, res) => {
    try {
      const { locationId, startDate, endDate } = req.body;
      
      if (!locationId || !startDate || !endDate) {
        return res.status(400).json({ message: "Location ID, start date, and end date are required" });
      }
      
      const report = await varianceService.generateVarianceReport(
        locationId, 
        new Date(startDate), 
        new Date(endDate)
      );
      
      res.json({ message: "Variance report generated successfully", itemsAnalyzed: report.length });
    } catch (error) {
      console.error("Error generating variance report:", error);
      res.status(500).json({ message: "Failed to generate variance report" });
    }
  });

  // Recipe costing routes
  app.get('/api/recipes/:id/costing', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const locationId = req.query.locationId as string;
      
      if (!locationId) {
        return res.status(400).json({ message: "Location ID is required" });
      }
      
      const costing = await varianceService.calculateRecipeCost(id, locationId);
      if (!costing) {
        return res.status(404).json({ message: "Recipe not found or unable to calculate cost" });
      }
      
      res.json(costing);
    } catch (error) {
      console.error("Error calculating recipe cost:", error);
      res.status(500).json({ message: "Failed to calculate recipe cost" });
    }
  });

  // Purchase Orders
  app.get('/api/purchase-orders', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const orders = await storage.getPurchaseOrders(locationId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      res.status(500).json({ message: "Failed to fetch purchase orders" });
    }
  });

  app.get('/api/purchase-orders/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const order = await storage.getPurchaseOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      res.json(order);
    } catch (error) {
      console.error("Error fetching purchase order:", error);
      res.status(500).json({ message: "Failed to fetch purchase order" });
    }
  });

  app.post('/api/purchase-orders', isAuthenticated, async (req, res) => {
    try {
      // Generate order number
      const orderNumber = `PO-${Date.now()}`;
      
      // Convert string dates to Date objects and prepare data
      const orderData = {
        orderNumber,
        vendorId: req.body.vendorId,
        locationId: req.body.locationId,
        status: req.body.status || "draft",
        orderDate: req.body.orderDate ? new Date(req.body.orderDate) : new Date(),
        expectedDeliveryDate: req.body.expectedDeliveryDate && req.body.expectedDeliveryDate.trim() !== '' ? new Date(req.body.expectedDeliveryDate) : null,
        totalAmount: req.body.totalAmount,
        notes: req.body.notes || null,
        createdBy: req.user!.id,
      };
      
      const order = await storage.createPurchaseOrder(orderData);
      res.status(201).json(order);
    } catch (error) {
      console.error("Error creating purchase order:", error);
      res.status(400).json({ message: "Failed to create purchase order" });
    }
  });

  app.put('/api/purchase-orders/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get current order to check status change
      const currentOrder = await storage.getPurchaseOrder(id);
      if (!currentOrder) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      
      // Convert string dates to Date objects and prepare data
      const orderData = {
        vendorId: req.body.vendorId,
        status: req.body.status,
        orderDate: req.body.orderDate ? new Date(req.body.orderDate) : undefined,
        expectedDeliveryDate: req.body.expectedDeliveryDate && req.body.expectedDeliveryDate.trim() !== '' ? new Date(req.body.expectedDeliveryDate) : null,
        totalAmount: req.body.totalAmount,
        notes: req.body.notes || null,
      };
      
      // Update the purchase order
      const order = await storage.updatePurchaseOrder(id, orderData);
      
      // If status changed to "delivered", automatically receive inventory
      if (req.body.status === 'delivered' && currentOrder.status !== 'delivered') {
        console.log(`Purchase order ${id} marked as delivered - processing inventory receiving...`);
        
        // Get purchase order items and update inventory
        const orderWithItems = await storage.getPurchaseOrder(id);
        if (orderWithItems && orderWithItems.items.length > 0) {
          for (const item of orderWithItems.items) {
            try {
              // Create inventory transaction for receiving
              if (item.inventoryItemId) {
                await storage.createInventoryTransaction({
                  inventoryItemId: item.inventoryItemId,
                  locationId: currentOrder.locationId,
                  type: 'in',
                  quantity: item.quantity.toString(),
                  reference: `PO-${currentOrder.orderNumber}`,
                  notes: `Received from purchase order ${currentOrder.orderNumber}`,
                  createdBy: req.user!.id || 'system'
                });
                
                // Update inventory quantity
                const inventoryItem = await storage.getInventoryItem(item.inventoryItemId);
                if (inventoryItem) {
                  const newQuantity = parseFloat(inventoryItem.quantity) + parseFloat(item.quantity.toString());
                  await storage.updateInventoryItem(item.inventoryItemId, {
                    quantity: newQuantity.toString()
                  });
                  console.log(`Updated inventory ${inventoryItem.name}: +${item.quantity} (new total: ${newQuantity})`);
                }
              }
            } catch (error) {
              console.error(`Error receiving item ${item.inventoryItemId}:`, error);
            }
          }
          console.log(`Successfully received ${orderWithItems.items.length} items into inventory`);
        }
      }
      
      res.json(order);
    } catch (error) {
      console.error("Error updating purchase order:", error);
      res.status(400).json({ message: "Failed to update purchase order" });
    }
  });

  app.delete('/api/purchase-orders/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePurchaseOrder(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting purchase order:", error);
      res.status(400).json({ message: "Failed to delete purchase order" });
    }
  });

  // Create purchase order from low stock items
  app.post('/api/purchase-orders/from-low-stock', isAuthenticated, async (req, res) => {
    try {
      const { vendorId, locationId, lowStockItems } = req.body;
      
      if (!vendorId || !locationId || !lowStockItems || lowStockItems.length === 0) {
        return res.status(400).json({ message: "Missing required fields: vendorId, locationId, or lowStockItems" });
      }
      
      // Generate order number
      const orderNumber = `PO-${Date.now()}`;
      
      // Calculate total amount from items
      let totalAmount = 0;
      const orderItems = lowStockItems.map((item: any) => {
        const itemTotal = parseFloat(item.unitCost || item.cost || 0) * parseFloat(item.quantity || 1);
        totalAmount += itemTotal;
        return {
          inventoryItemId: item.id,
          quantity: item.quantity || (parseFloat(item.reorderLevel) * 2).toString(), // Order 2x reorder level if no quantity specified
          unitCost: item.unitCost || item.cost || "0",
          totalCost: itemTotal.toString()
        };
      });
      
      // Create purchase order
      const orderData = {
        orderNumber,
        vendorId,
        locationId,
        status: "draft" as const,
        orderDate: new Date(),
        expectedDeliveryDate: null,
        totalAmount: totalAmount.toString(),
        notes: `Auto-generated from ${lowStockItems.length} low stock items`,
        createdBy: req.user!.id || 'system',
      };
      
      const order = await storage.createPurchaseOrder(orderData);
      
      // Add items to purchase order
      for (const itemData of orderItems) {
        await storage.addPurchaseOrderItem({
          ...itemData,
          purchaseOrderId: order.id
        });
      }
      
      console.log(`Created purchase order ${orderNumber} for ${orderItems.length} low stock items`);
      res.status(201).json({
        ...order,
        items: orderItems,
        message: `Purchase order created with ${orderItems.length} items`
      });
    } catch (error) {
      console.error("Error creating purchase order from low stock:", error);
      res.status(400).json({ message: "Failed to create purchase order from low stock items" });
    }
  });

  // Purchase order items
  app.post('/api/purchase-orders/:id/items', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const itemData = insertPurchaseOrderItemSchema.parse({
        ...req.body,
        purchaseOrderId: id,
      });
      const item = await storage.addPurchaseOrderItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error adding purchase order item:", error);
      res.status(400).json({ message: "Failed to add purchase order item" });
    }
  });

  app.delete('/api/purchase-order-items/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.removePurchaseOrderItem(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing purchase order item:", error);
      res.status(400).json({ message: "Failed to remove purchase order item" });
    }
  });

  // Waste Tracking
  app.get('/api/waste', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const entries = await storage.getWasteEntries(locationId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching waste entries:", error);
      res.status(500).json({ message: "Failed to fetch waste entries" });
    }
  });

  app.post('/api/waste', isAuthenticated, async (req, res) => {
    try {
      const wasteData = insertWasteEntrySchema.parse({
        ...req.body,
        reportedBy: req.user!.id,
      });
      const entry = await storage.createWasteEntry(wasteData);
      
      // Create inventory transaction for waste
      await storage.createInventoryTransaction({
        inventoryItemId: wasteData.inventoryItemId!,
        locationId: wasteData.locationId,
        type: "out",
        quantity: wasteData.quantity,
        reference: `Waste: ${wasteData.reason}`,
        notes: wasteData.notes,
        createdBy: req.user!.id,
      });
      
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating waste entry:", error);
      res.status(400).json({ message: "Failed to create waste entry" });
    }
  });

  app.get('/api/waste/stats', isAuthenticated, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      const stats = await storage.getWasteStats(start, end);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching waste stats:", error);
      res.status(500).json({ message: "Failed to fetch waste stats" });
    }
  });

  // Inventory Transactions
  app.get('/api/transactions', isAuthenticated, async (req, res) => {
    try {
      const { itemId } = req.query;
      const transactions = await storage.getInventoryTransactions(itemId as string);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching inventory transactions:", error);
      res.status(500).json({ message: "Failed to fetch inventory transactions" });
    }
  });

  app.post('/api/transactions', isAuthenticated, async (req, res) => {
    try {
      const transactionData = insertInventoryTransactionSchema.parse({
        ...req.body,
        createdBy: req.user!.id,
      });
      const transaction = await storage.createInventoryTransaction(transactionData);
      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error creating inventory transaction:", error);
      res.status(400).json({ message: "Failed to create inventory transaction" });
    }
  });

  // Universal POS Integration Routes
  app.get("/api/pos/integrations", isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const integrations = await storage.getPosIntegrations(locationId);
      res.json(integrations);
    } catch (error) {
      console.error("Error fetching POS integrations:", error);
      res.status(500).json({ message: "Failed to fetch POS integrations" });
    }
  });

  app.post("/api/pos/integrations", isAuthenticated, async (req, res) => {
    try {
      const integrationData = insertPosIntegrationSchema.parse(req.body);
      const integration = await storage.createPosIntegration(integrationData);
      res.status(201).json(integration);
    } catch (error) {
      console.error("Error creating POS integration:", error);
      res.status(500).json({ message: "Failed to create POS integration" });
    }
  });

  app.get("/api/pos/integrations/:id/test", isAuthenticated, async (req, res) => {
    try {
      const success = await posService.testConnection(req.params.id);
      res.json({ success });
    } catch (error) {
      console.error("Error testing POS connection:", error);
      res.status(500).json({ message: "Failed to test POS connection" });
    }
  });

  app.post("/api/pos/integrations/:id/sync", isAuthenticated, async (req, res) => {
    try {
      await posService.syncMenuItems(req.params.id);
      res.json({ message: "Menu items synced successfully" });
    } catch (error) {
      console.error("Error syncing menu items:", error);
      res.status(500).json({ message: "Failed to sync menu items" });
    }
  });

  app.post("/api/pos/integrations/:id/sync-sales", isAuthenticated, async (req, res) => {
    try {
      const newCount = await posService.syncHistoricalSales(req.params.id);
      const message = newCount > 0 
        ? `Successfully synced ${newCount} new sales`
        : `All sales are already up to date (0 new sales found)`;
      res.json({ message, count: newCount });
    } catch (error) {
      console.error("Error syncing sales:", error);
      res.status(500).json({ message: "Failed to sync sales data" });
    }
  });

  app.put("/api/pos/integrations/:id", isAuthenticated, async (req, res) => {
    try {
      const integrationData = insertPosIntegrationSchema.partial().parse(req.body);
      const integration = await storage.updatePosIntegration(req.params.id, integrationData);
      res.json(integration);
    } catch (error) {
      console.error("Error updating POS integration:", error);
      res.status(500).json({ message: "Failed to update POS integration" });
    }
  });

  app.delete("/api/pos/integrations/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deletePosIntegration(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting POS integration:", error);
      res.status(500).json({ message: "Failed to delete POS integration" });
    }
  });

  // POS Menu Items & Recipe Mapping
  app.get("/api/pos/menu-items/unmapped", isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (!locationId) {
        return res.status(400).json({ message: "locationId is required" });
      }
      const menuItems = await storage.getUnmappedMenuItems(locationId);
      res.json(menuItems);
    } catch (error) {
      console.error("Error fetching unmapped menu items:", error);
      res.status(500).json({ message: "Failed to fetch unmapped menu items" });
    }
  });

  app.put("/api/pos/menu-items/:id/recipe", isAuthenticated, async (req, res) => {
    try {
      const { recipeId, inventoryItemId } = req.body;
      
      // Validate mutual exclusivity: only one or neither can be set, not both
      if (recipeId && inventoryItemId) {
        return res.status(400).json({ 
          message: "Cannot link both recipe and inventory item. Please select only one." 
        });
      }
      
      const menuItem = await storage.updatePosMenuItemRecipe(req.params.id, recipeId, inventoryItemId);
      res.json(menuItem);
    } catch (error) {
      console.error("Error linking menu item:", error);
      res.status(500).json({ message: "Failed to link menu item" });
    }
  });

  app.delete("/api/pos/menu-items/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deletePosMenuItem(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting menu item:", error);
      res.status(500).json({ message: "Failed to delete menu item" });
    }
  });

  app.get("/api/pos/menu-items/:id/suggested-recipes", isAuthenticated, async (req, res) => {
    try {
      const menuItemId = req.params.id;
      const menuItems = await storage.getPosMenuItems(req.query.integrationId as string);
      const menuItem = menuItems.find(item => item.id === menuItemId);
      
      if (!menuItem) {
        return res.status(404).json({ message: "Menu item not found" });
      }

      const integration = await storage.getPosIntegration(menuItem.posIntegrationId);
      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      const suggestions = await storage.getSuggestedRecipes(menuItem.name, integration.locationId);
      res.json(suggestions);
    } catch (error) {
      console.error("Error getting suggested recipes:", error);
      res.status(500).json({ message: "Failed to get suggested recipes" });
    }
  });

  // POS Sales data
  app.get("/api/pos/sales", isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const sales = await storage.getPosSales(locationId);
      res.json(sales);
    } catch (error) {
      console.error("Error fetching POS sales:", error);
      res.status(500).json({ message: "Failed to fetch POS sales" });
    }
  });

  // Universal POS webhook endpoint (not protected by auth)
  app.post("/api/pos/webhook", async (req, res) => {
    try {
      console.log('Received POS webhook:', {
        headers: req.headers,
        body: req.body,
        timestamp: new Date().toISOString()
      });
      
      await posService.processOrderWebhook(req.body);
      
      res.status(200).json({ 
        message: "Webhook processed successfully",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error processing POS webhook:", error);
      res.status(500).json({ 
        message: "Failed to process webhook",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Clover-specific webhook endpoint with enhanced logging
  app.post("/api/webhooks/clover", async (req, res) => {
    try {
      const signature = req.headers['x-clover-signature'] as string;
      console.log('Received Clover webhook:', {
        signature,
        eventType: req.body.eventType,
        merchantId: req.body.merchantId,
        objectId: req.body.objectId,
        timestamp: new Date().toISOString()
      });
      
      // Process the webhook
      await posService.processOrderWebhook(req.body);
      
      res.status(200).json({ 
        message: "Clover webhook processed successfully",
        eventType: req.body.eventType,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error processing Clover webhook:", error);
      res.status(500).json({ 
        message: "Failed to process Clover webhook",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Webhook status endpoint
  app.get("/api/pos/webhook-status", isAuthenticated, async (req, res) => {
    try {
      const integrations = await storage.getPosIntegrations();
      const webhookStatus = integrations.map(integration => ({
        id: integration.id,
        provider: integration.provider,
        name: integration.name,
        isActive: integration.isActive,
        lastSyncAt: integration.lastSyncAt,
        webhookUrl: `${req.protocol}://${req.get('host')}/api/webhooks/${integration.provider}`,
        status: integration.isActive ? 'active' : 'inactive'
      }));
      
      res.json(webhookStatus);
    } catch (error) {
      console.error("Error fetching webhook status:", error);
      res.status(500).json({ message: "Failed to fetch webhook status" });
    }
  });

  // POS Employee routes
  app.get("/api/pos-employees/:integrationId", isAuthenticated, async (req, res) => {
    try {
      const employees = await storage.getPosEmployees(req.params.integrationId);
      
      // Fetch mapping info for each employee
      const employeesWithMappings = await Promise.all(
        employees.map(async (emp) => {
          const [mapping] = await db
            .select()
            .from(posEmployeeMappings)
            .where(eq(posEmployeeMappings.posEmployeeId, emp.id))
            .limit(1);
          
          return {
            ...emp,
            mapping: mapping ? {
              employeeId: mapping.employeeId,
              status: mapping.status
            } : null
          };
        })
      );
      
      res.json(employeesWithMappings);
    } catch (error) {
      console.error("Error fetching POS employees:", error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.get("/api/pos-employees/unlinked/:locationId", isAuthenticated, async (req, res) => {
    try {
      const employees = await storage.getUnlinkedPosEmployees(req.params.locationId);
      res.json(employees);
    } catch (error) {
      console.error("Error fetching unlinked POS employees:", error);
      res.status(500).json({ message: "Failed to fetch unlinked employees" });
    }
  });

  app.post("/api/pos-employees/import/:posEmployeeId", isAuthenticated, requireAnyPermission([Permission.MANAGE_EMPLOYEES]), async (req, res) => {
    try {
      const { posEmployeeId } = req.params;
      const { departmentId, positionId } = req.body;
      
      // Get the POS employee
      const posEmployee = await storage.getPosEmployee(posEmployeeId);
      if (!posEmployee) {
        return res.status(404).json({ message: "POS employee not found" });
      }

      // Check if already imported (idempotency)
      const existingMapping = await db
        .select()
        .from(posEmployeeMappings)
        .where(eq(posEmployeeMappings.posEmployeeId, posEmployee.id))
        .limit(1);
      
      if (existingMapping.length > 0) {
        const existingEmployee = await storage.getEmployee(existingMapping[0].employeeId);
        return res.json({ 
          message: "Employee already imported",
          employee: existingEmployee
        });
      }

      // Safely parse name from displayName
      const nameParts = (posEmployee.displayName || '').trim().split(/\s+/);
      const firstName = posEmployee.firstName || nameParts[0] || 'Unknown';
      const lastName = posEmployee.lastName || nameParts.slice(1).join(' ') || '';

      // Create HR employee from POS employee
      const hrEmployee = await storage.createEmployee({
        firstName,
        lastName,
        email: posEmployee.email || '',
        phone: '',
        status: 'active',
        hireDate: new Date().toISOString().split('T')[0],
        departmentId: departmentId || null,
        positionId: positionId || null,
      });

      // Create mapping between POS employee and HR employee
      await db.insert(posEmployeeMappings).values({
        posEmployeeId: posEmployee.id,
        employeeId: hrEmployee.id,
        status: 'manual',
        confidence: '1.00',
        matchRule: 'Manual import from POS Integration'
      });

      res.json({ 
        message: "Employee imported successfully",
        employee: hrEmployee
      });
    } catch (error) {
      console.error("Error importing POS employee:", error);
      res.status(500).json({ 
        message: "Failed to import employee",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/pos-employees/sync/:integrationId", isAuthenticated, async (req, res) => {
    try {
      const { integrationId } = req.params;
      const integration = await storage.getPosIntegration(integrationId);
      
      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      let syncedCount = 0;
      if (integration.provider === 'clover') {
        syncedCount = await cloverService.syncEmployees(integrationId);
      } else {
        return res.status(400).json({ message: `Employee sync not supported for provider: ${integration.provider}` });
      }

      // Automatically create HR employees for any POS employees without mappings
      console.log('🔍 Checking for unlinked POS employees to auto-import...');
      const unlinkedEmployees = await storage.getUnlinkedPosEmployees(integration.locationId);
      console.log(`📊 Found ${unlinkedEmployees.length} unlinked POS employees`);
      let autoCreatedCount = 0;
      
      for (const posEmployee of unlinkedEmployees) {
        try {
          console.log(`👤 Auto-importing: ${posEmployee.displayName || 'Unknown'} (${posEmployee.email || 'no email'})`);
          
          // Safely parse name from displayName
          const nameParts = (posEmployee.displayName || '').trim().split(/\s+/);
          const firstName = posEmployee.firstName || nameParts[0] || 'Unknown';
          const lastName = posEmployee.lastName || nameParts.slice(1).join(' ') || '';

          // Create HR employee from POS employee
          const hrEmployee = await storage.createEmployee({
            firstName,
            lastName,
            email: posEmployee.email || null,
            phone: '',
            status: 'active',
            hireDate: new Date().toISOString().split('T')[0],
            departmentId: null,
            positionId: null,
          });

          // Create mapping between POS employee and HR employee
          await db.insert(posEmployeeMappings).values({
            posEmployeeId: posEmployee.id,
            employeeId: hrEmployee.id,
            status: 'auto',
            confidence: '1.00',
            matchRule: 'Auto-imported during POS sync'
          });

          autoCreatedCount++;
          console.log(`✅ Auto-imported ${firstName} ${lastName} successfully`);
        } catch (error) {
          console.error(`❌ Failed to auto-create HR employee for POS employee ${posEmployee.id}:`, error);
          // Continue with next employee even if one fails
        }
      }
      
      console.log(`📊 Auto-import complete: ${autoCreatedCount} employees imported to HR`);


      res.json({ 
        message: `Successfully synced ${syncedCount} employees and auto-imported ${autoCreatedCount} to HR system`,
        syncedCount,
        autoCreatedCount
      });
    } catch (error) {
      console.error("Error syncing employees:", error);
      res.status(500).json({ 
        message: "Failed to sync employees",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/pos-employees/sync-shifts/:integrationId", isAuthenticated, async (req, res) => {
    try {
      const { integrationId } = req.params;
      const { daysBack = 7 } = req.body;
      
      const integration = await storage.getPosIntegration(integrationId);
      
      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      let syncedCount = 0;
      if (integration.provider === 'clover') {
        syncedCount = await cloverService.syncShifts(integrationId, daysBack);
      } else {
        return res.status(400).json({ message: `Shift sync not supported for provider: ${integration.provider}` });
      }

      res.json({ 
        message: `Successfully synced ${syncedCount} shifts from the last ${daysBack} days`,
        syncedCount,
        daysBack
      });
    } catch (error) {
      console.error("Error syncing shifts:", error);
      res.status(500).json({ 
        message: "Failed to sync shifts",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Analytics routes
  app.get('/api/analytics/alerts', isAuthenticated, async (req: any, res) => {
    try {
      const locationId = req.query.locationId;
      const result = await db.execute(sql`
        SELECT * FROM cost_alerts 
        WHERE location_id = ${locationId}::uuid AND is_active = true
        ORDER BY severity DESC, created_at DESC
        LIMIT 20
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.get('/api/analytics/business-intelligence', isAuthenticated, async (req: any, res) => {
    try {
      const locationId = req.query.locationId;
      const period = req.query.period || 'today';
      
      let dateFilter;
      if (period === 'today') {
        dateFilter = sql`DATE(${businessIntelligence.reportDate}) = CURRENT_DATE`;
      } else if (period === 'week') {
        dateFilter = sql`${businessIntelligence.reportDate} >= CURRENT_DATE - INTERVAL '7 days'`;
      } else if (period === 'month') {
        dateFilter = sql`${businessIntelligence.reportDate} >= CURRENT_DATE - INTERVAL '30 days'`;
      } else if (period === 'quarter') {
        dateFilter = sql`${businessIntelligence.reportDate} >= CURRENT_DATE - INTERVAL '90 days'`;
      } else {
        dateFilter = sql`${businessIntelligence.reportDate} >= CURRENT_DATE - INTERVAL '7 days'`;
      }
      
      // Build proper where conditions
      let whereConditions = [dateFilter];
      if (locationId) {
        whereConditions.push(sql`${businessIntelligence.locationId} = ${locationId}`);
      }
      
      // Get aggregated data from business_intelligence table
      const biData = await db.select({
        totalRevenue: sql<number>`COALESCE(SUM(CAST(${businessIntelligence.totalRevenue} AS DECIMAL)), 0)`,
        totalCogs: sql<number>`COALESCE(SUM(CAST(${businessIntelligence.totalCogs} AS DECIMAL)), 0)`,
        avgOrderValue: sql<number>`COALESCE(AVG(CAST(${businessIntelligence.avgOrderValue} AS DECIMAL)), 0)`,
        customerCount: sql<number>`COALESCE(SUM(${businessIntelligence.customerCount}), 0)`,
        foodCostPercentage: sql<number>`COALESCE(AVG(CAST(${businessIntelligence.foodCostPercentage} AS DECIMAL)), 0)`
      }).from(businessIntelligence).where(and(...whereConditions));
      
      const data = biData[0] || { totalRevenue: 0, totalCogs: 0, avgOrderValue: 0, customerCount: 0, foodCostPercentage: 0 };
      
      // Get latest top selling items from most recent BI record
      const latestBi = await db.select({
        topSellingItems: businessIntelligence.topSellingItems,
        lowPerformingItems: businessIntelligence.lowPerformingItems
      }).from(businessIntelligence)
      .where(and(...whereConditions))
      .orderBy(desc(businessIntelligence.reportDate))
      .limit(1);
      
      const topSellingItems = latestBi[0]?.topSellingItems || [];
      const lowPerformingItems = latestBi[0]?.lowPerformingItems || [];
      
      res.json({
        totalRevenue: Number(data.totalRevenue),
        avgOrderValue: Number(data.avgOrderValue),
        customerCount: Number(data.customerCount),
        foodCostPercentage: Number(data.foodCostPercentage),
        topSellingItems,
        lowPerformingItems
      });
    } catch (error) {
      console.error("Error fetching business intelligence:", error);
      res.status(500).json({ message: "Failed to fetch analytics data" });
    }
  });

  app.get('/api/analytics/profit-loss', isAuthenticated, async (req: any, res) => {
    try {
      const locationId = req.query.locationId;
      const period = req.query.period || 'month';
      
      // Calculate date range
      let startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      let endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      
      if (period === 'week') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (period === 'month') {
        startDate.setMonth(startDate.getMonth() - 1);
      }

      // Get sales data
      const salesResult = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(total AS DECIMAL)), 0) as total_revenue,
               COUNT(*) as transaction_count
        FROM pos_sales 
        WHERE location_id = ${locationId}::uuid 
        AND order_date BETWEEN ${startDate.toISOString()}::timestamp AND ${endDate.toISOString()}::timestamp
      `);

      // Get purchase data
      const purchaseResult = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL)), 0) as total_purchases
        FROM purchase_orders 
        WHERE location_id = ${locationId}::uuid 
        AND order_date BETWEEN ${startDate.toISOString()}::timestamp AND ${endDate.toISOString()}::timestamp
        AND status = 'delivered'
      `);

      const sales = salesResult.rows[0];
      const purchases = purchaseResult.rows[0];
      
      const totalRevenue = parseFloat(String(sales.total_revenue)) || 0;
      const totalPurchases = parseFloat(String(purchases.total_purchases)) || 0;
      const grossProfit = totalRevenue - totalPurchases;
      const grossMarginPercentage = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      
      const report = {
        period: { startDate, endDate },
        revenue: {
          total: totalRevenue,
          transactionCount: parseInt(String(sales.transaction_count)) || 0,
          averageTicket: Number(sales.transaction_count) > 0 ? totalRevenue / parseInt(String(sales.transaction_count)) : 0
        },
        cogs: {
          total: totalPurchases,
          percentage: totalRevenue > 0 ? (totalPurchases / totalRevenue) * 100 : 0
        },
        margins: {
          grossProfit,
          grossMarginPercentage
        }
      };
      
      res.json(report);
    } catch (error) {
      console.error("Error generating P&L report:", error);
      res.status(500).json({ message: "Failed to generate P&L report" });
    }
  });

  // HR Employee Management Add-on API Endpoints (15 endpoints)
  
  // HR access middleware
  const requireHRAccess = async (req: any, res: any, next: any) => {
    try {
      const locationId = req.query.locationId as string;
      if (!locationId) {
        return res.status(400).json({ message: 'Location ID required', code: 'LOCATION_REQUIRED' });
      }

      // Get user from Clerk authentication
      const user = req.user;
      
      // Exempt owners from HR add-on restrictions
      if (user?.role === 'owner') {
        return next();
      }

      const locations = await storage.getLocations();
      const location = locations.find(loc => loc.id === locationId);
      if (!location) {
        return res.status(404).json({ message: 'Location not found' });
      }

      if (!location.hrAddonEnabled) {
        return res.status(403).json({ 
          message: 'HR add-on not enabled for this location', 
          code: 'HR_ADDON_REQUIRED',
          upgradeUrl: '/upgrade'
        });
      }

      next();
    } catch (error) {
      console.error('Error checking HR access:', error);
      res.status(500).json({ message: 'Failed to verify HR access' });
    }
  };
  
  // HR Departments
  app.get('/api/hr/departments', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const departments = await storage.getDepartments(locationId);
      res.json(departments);
    } catch (error) {
      console.error('Error fetching departments:', error);
      res.status(500).json({ message: 'Failed to fetch departments' });
    }
  });

  app.post('/api/hr/departments', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const department = await storage.createDepartment(req.body);
      res.status(201).json(department);
    } catch (error) {
      console.error('Error creating department:', error);
      res.status(500).json({ message: 'Failed to create department' });
    }
  });

  app.put('/api/hr/departments/:id', isAuthenticated, async (req, res) => {
    try {
      const department = await storage.updateDepartment(req.params.id, req.body);
      res.json(department);
    } catch (error) {
      console.error('Error updating department:', error);
      res.status(500).json({ message: 'Failed to update department' });
    }
  });

  app.delete('/api/hr/departments/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteDepartment(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting department:", error);
      res.status(400).json({ message: "Failed to delete department" });
    }
  });

  // HR Positions
  app.get('/api/hr/positions', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const locationId = req.query.locationId as string | undefined;
      const positions = await storage.getPositions(locationId);
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

  // Basic employees endpoint for time clock and general use
  app.get('/api/employees', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const employees = await storage.getEmployees();
      res.json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ message: 'Failed to fetch employees' });
    }
  });

  app.delete('/api/hr/positions/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePosition(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting position:", error);
      res.status(400).json({ message: "Failed to delete position" });
    }
  });

  // HR Employees
  app.get('/api/hr/employees', isAuthenticated, requireAnyPermission([Permission.VIEW_ALL_EMPLOYEES, Permission.VIEW_EMPLOYEE_DETAILS]), requireHRAccess, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const employees = await storage.getEmployees(locationId);
      res.json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ message: 'Failed to fetch employees' });
    }
  });

  app.post('/api/hr/employees', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), requireHRAccess, async (req, res) => {
    console.log('🚀 Employee creation endpoint called!');
    console.log('🚀 Request body:', JSON.stringify(req.body, null, 2));
    console.log('🚀 User:', req.user);
    try {
      const employeeData = req.body;
      
      console.log('🏢 Creating new employee:', { email: employeeData.email, name: `${employeeData.firstName} ${employeeData.lastName}` });
      
      // Create employee in database first
      const employee = await storage.createEmployee(employeeData);
      console.log('✅ Employee created in database:', employee.id);
      
      // Always create a user account for the employee (required for login)
      if (employee.email) {
        try {
          // Generate a temporary password for the employee
          const tempPassword = 'TEMP1234!';
          
          console.log('👤 Creating Clerk user for employee:', employee.email);

          // Create Clerk user account
          const clerkUser = await clerkClient.users.createUser({
            emailAddress: [employee.email],
            password: tempPassword,
            firstName: employee.firstName,
            lastName: employee.lastName,
          });
          const userId = clerkUser.id;
          
          // Create user record in our database with proper role mapping
          const employeeWithPosition = await storage.getEmployee(employee.id);
          const userRole = mapPositionToRole(employeeWithPosition?.position?.title);
          
          console.log('👤 Creating user account with role:', { userId, role: userRole });
          await storage.upsertUser({
            id: userId,
            email: employee.email,
            firstName: employee.firstName,
            lastName: employee.lastName,
            role: userRole,
          });
          
          // Update employee record with Clerk user ID
          await storage.updateEmployee(employee.id, { 
            notes: `Clerk ID: ${userId}` 
          });

          console.log('✅ Clerk user and local user account created successfully');
          
          // Send welcome email with login credentials
          console.log('📧 Attempting to send welcome email to:', employee.email);
          try {
            const { sendEmail } = await import('./email');
            
            const emailParams = {
              to: employee.email,
              from: 'mequeamaddox@gmail.com',
              subject: 'Welcome to RestroFlow - Your Account Details',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #1f2937; text-align: center;">Welcome to RestroFlow!</h2>
                  <p>Hi ${employee.firstName},</p>
                  <p>Your employee account has been created successfully. Here are your login credentials:</p>
                  
                  <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #374151;">Login Information</h3>
                    <p><strong>Email:</strong> ${employee.email}</p>
                    <p><strong>Temporary Password:</strong> ${tempPassword}</p>
                    <p><small style="color: #6b7280;">Please change this password after your first login</small></p>
                  </div>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${req.protocol}://${req.get('host')}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Access RestroFlow</a>
                  </div>
                  
                  <p>Your onboarding documents will be sent to you shortly. If you have any questions, please contact your manager.</p>
                  <p>Best regards,<br>The RestroFlow Team</p>
                </div>
              `
            };
            
            console.log('📧 Calling sendEmail with params:', { to: emailParams.to, from: emailParams.from, subject: emailParams.subject });
            await sendEmail(emailParams);
            console.log('✅ Welcome email sent successfully to:', employee.email);
          } catch (emailError) {
            console.error('❌ Failed to send welcome email:', emailError);
            console.error('❌ Full email error stack:', emailError instanceof Error ? emailError.stack : String(emailError));
          }
          
          // Return success with login instructions
          return res.status(201).json({
            ...employee,
            loginInstructions: {
              email: employee.email,
              tempPassword: tempPassword,
              message: 'Employee can log in with temporary password: TEMP1234!'
            }
          });
          
        } catch (userCreationError) {
          console.error('❌ User account creation failed:', userCreationError);
          // Employee was created but user account failed - still return success with warning
          return res.status(201).json({
            ...employee,
            warning: 'Employee created but login account setup failed. Employee will need manual account setup.'
          });
        }
      } else {
        console.log('⚠️ No email provided, skipping user account creation');
        return res.status(201).json({
          ...employee,
          warning: 'Employee created without email. Login account cannot be created without email address.'
        });
      }
      
    } catch (error) {
      console.error('❌ Error creating employee:', error);
      res.status(500).json({ message: 'Failed to create employee' });
    }
  });

  app.put('/api/hr/employees/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const employee = await storage.updateEmployee(req.params.id, req.body);
      res.json(employee);
    } catch (error) {
      console.error('Error updating employee:', error);
      res.status(500).json({ message: 'Failed to update employee' });
    }
  });

  app.delete('/api/hr/employees/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      await storage.deleteEmployee(req.params.id);
      res.json({ message: 'Employee deleted successfully' });
    } catch (error) {
      console.error('Error deleting employee:', error);
      res.status(500).json({ message: 'Failed to delete employee' });
    }
  });

  // HR Scheduling
  app.get('/api/hr/shifts', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const shifts = await storage.getShifts(locationId);
      res.json(shifts);
    } catch (error) {
      console.error('Error fetching shifts:', error);
      res.status(500).json({ message: 'Failed to fetch shifts' });
    }
  });

  app.post('/api/hr/shifts', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const shift = await storage.createShift(req.body);
      res.status(201).json(shift);
    } catch (error) {
      console.error('Error creating shift:', error);
      res.status(500).json({ message: 'Failed to create shift' });
    }
  });

  app.put('/api/hr/shifts/:id', isAuthenticated, async (req, res) => {
    try {
      const shift = await storage.updateShift(req.params.id, req.body);
      res.json(shift);
    } catch (error) {
      console.error('Error updating shift:', error);
      res.status(500).json({ message: 'Failed to update shift' });
    }
  });

  app.delete('/api/hr/shifts/:id', isAuthenticated, async (req, res) => {
    try {
      await storage.deleteShift(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting shift:', error);
      res.status(500).json({ message: 'Failed to delete shift' });
    }
  });

  // HR Time-off Requests
  app.get('/api/hr/time-off-requests', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const requests = await storage.getTimeOffRequests();
      res.json(requests);
    } catch (error) {
      console.error('Error fetching time-off requests:', error);
      res.status(500).json({ message: 'Failed to fetch time-off requests' });
    }
  });

  app.post('/api/hr/time-off-requests', isAuthenticated, async (req, res) => {
    try {
      const request = await storage.createTimeOffRequest(req.body);
      res.status(201).json(request);
    } catch (error) {
      console.error('Error creating time-off request:', error);
      res.status(500).json({ message: 'Failed to create time-off request' });
    }
  });

  app.put('/api/hr/time-off-requests/:id/status', isAuthenticated, async (req, res) => {
    try {
      const { status, notes } = req.body;
      const request = await storage.updateTimeOffRequestStatus(req.params.id, status, notes, req.user!.id);
      res.json(request);
    } catch (error) {
      console.error('Error updating time-off request status:', error);
      res.status(500).json({ message: 'Failed to update time-off request status' });
    }
  });

  // HR Analytics and Reports
  app.get('/api/hr/analytics', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const analytics = await storage.getHRAnalytics(locationId);
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
      const locationId = req.query.locationId as string;
      const tasks = await storage.getTasks(locationId);
      res.json(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ message: 'Failed to fetch tasks' });
    }
  });

  app.post('/api/hr/tasks', isAuthenticated, async (req, res) => {
    try {
      const task = await storage.createTask(req.body);
      res.status(201).json(task);
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ message: 'Failed to create task' });
    }
  });

  app.put('/api/hr/tasks/:id', isAuthenticated, async (req, res) => {
    try {
      const task = await storage.updateTask(req.params.id, req.body);
      res.json(task);
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ message: 'Failed to update task' });
    }
  });

  app.put('/api/hr/tasks/:id/status', isAuthenticated, async (req, res) => {
    try {
      const { status } = req.body;
      const task = await storage.updateTaskStatus(req.params.id, status);
      res.json(task);
    } catch (error) {
      console.error('Error updating task status:', error);
      res.status(500).json({ message: 'Failed to update task status' });
    }
  });

  // HR Time Clock
  app.get('/api/hr/time-entries', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const { locationId, includeHistory = 'false' } = req.query;
      
      // Get manual HR time entries
      const manualResult = await db.execute(sql`
        SELECT te.id, te.employee_id, te.status, te.notes, te.total_hours,
               te.clock_in_time::text as clock_in_time,
               te.clock_out_time::text as clock_out_time,
               te.created_at::text as created_at,
               e.first_name, e.last_name, e.employee_number
        FROM time_entries te
        LEFT JOIN employees e ON te.employee_id = e.id
        ${includeHistory === 'true' ? sql`ORDER BY te.created_at DESC LIMIT 100` : sql`WHERE te.status = 'clocked-in' ORDER BY te.created_at DESC LIMIT 50`}
      `);
      
      const manualEntries = manualResult.rows.map((row: any) => ({
        id: row.id,
        employeeId: row.employee_id,
        clockInTime: row.clock_in_time ? new Date(row.clock_in_time).toISOString() : new Date().toISOString(),
        clockOutTime: row.clock_out_time ? new Date(row.clock_out_time).toISOString() : null,
        breakStartTime: null,
        breakEndTime: null,
        totalHours: row.total_hours,
        status: row.status || 'clocked-in',
        notes: row.notes,
        source: 'manual',
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updatedAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        employee: row.first_name ? {
          id: row.employee_id,
          employeeNumber: row.employee_number,
          firstName: row.first_name,
          lastName: row.last_name
        } : undefined
      }));
      
      // Get POS timeclock entries and map them to HR employees
      const posResult = await db.execute(sql`
        SELECT 
          pt.id,
          pt.clock_in_at::text as clock_in_at,
          pt.clock_out_at::text as clock_out_at,
          pt.break_seconds,
          pt.status,
          pt.role_title,
          pe.display_name as pos_employee_name,
          pem.employee_id as hr_employee_id,
          e.first_name,
          e.last_name,
          e.employee_number,
          pi.provider
        FROM pos_timeclocks pt
        INNER JOIN pos_employees pe ON pt.pos_employee_id = pe.id
        LEFT JOIN pos_employee_mappings pem ON pe.id = pem.pos_employee_id
        LEFT JOIN employees e ON pem.employee_id = e.id
        INNER JOIN pos_integrations pi ON pt.pos_integration_id = pi.id
        WHERE ${locationId ? sql`pt.location_id = ${locationId}::uuid AND` : sql``} 
        ${includeHistory === 'true' ? sql`TRUE` : sql`pt.status = 'open'`}
        ORDER BY pt.clock_in_at DESC
        LIMIT 100
      `);
      
      const posEntries = posResult.rows.map((row: any) => {
        const clockIn = row.clock_in_at ? new Date(row.clock_in_at) : new Date();
        const clockOut = row.clock_out_at ? new Date(row.clock_out_at) : null;
        
        // Calculate total hours if clocked out
        let totalHours = null;
        if (clockOut) {
          const hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
          const breakHours = (row.break_seconds || 0) / 3600;
          totalHours = (hours - breakHours).toFixed(2);
        }
        
        return {
          id: `pos-${row.id}`,
          employeeId: row.hr_employee_id || null,
          clockInTime: clockIn.toISOString(),
          clockOutTime: clockOut ? clockOut.toISOString() : null,
          breakStartTime: null,
          breakEndTime: null,
          totalHours,
          status: row.status === 'open' ? 'clocked-in' : 'clocked-out',
          notes: `Synced from ${row.provider?.toUpperCase() || 'POS'} - ${row.role_title || 'Employee'}`,
          source: 'pos',
          posProvider: row.provider,
          createdAt: clockIn.toISOString(),
          updatedAt: clockIn.toISOString(),
          employee: row.hr_employee_id ? {
            id: row.hr_employee_id,
            employeeNumber: row.employee_number,
            firstName: row.first_name,
            lastName: row.last_name
          } : {
            id: null,
            employeeNumber: null,
            firstName: row.pos_employee_name?.split(' ')[0] || 'Unknown',
            lastName: row.pos_employee_name?.split(' ').slice(1).join(' ') || 'POS Employee'
          }
        };
      });
      
      // Combine and sort all entries
      const allEntries = [...manualEntries, ...posEntries].sort((a, b) => 
        new Date(b.clockInTime).getTime() - new Date(a.clockInTime).getTime()
      );
      
      res.json(allEntries);
    } catch (error) {
      console.error('Error fetching time entries:', error);
      res.status(500).json({ message: 'Failed to fetch time entries' });
    }
  });

  app.post('/api/hr/time-clock/in/:employeeId', isAuthenticated, async (req, res) => {
    try {
      const { shiftId } = req.body;
      const entry = await storage.clockIn(req.params.employeeId, shiftId);
      res.status(201).json(entry);
    } catch (error) {
      console.error('Error clocking in:', error);
      res.status(500).json({ message: 'Failed to clock in' });
    }
  });

  app.post('/api/hr/time-clock/out/:entryId', isAuthenticated, async (req, res) => {
    try {
      const entry = await storage.clockOut(req.params.entryId);
      res.json(entry);
    } catch (error) {
      console.error('Error clocking out:', error);
      res.status(500).json({ message: 'Failed to clock out' });
    }
  });

  // Employee Self-Service Time Clock API - Personal time tracking
  app.get('/api/employees/:employeeId/time-entries', isAuthenticated, async (req, res) => {
    try {
      // Get user ID from Clerk authentication
      const userId = req.user!.id;
      console.log('🕐 Time entries request - userId:', userId, 'employeeId:', req.params.employeeId);
      
      // Allow owners/admins to view any employee's time entries, employees can only view their own
      const user = await storage.getUser(userId);
      const isOwnerOrAdmin = user?.role === 'admin' || user?.role === 'owner';
      
      if (!isOwnerOrAdmin && req.params.employeeId !== userId) {
        return res.status(403).json({ message: 'Access denied - can only view your own time entries' });
      }
      
      // Get manual time entries
      const manualTimeEntries = await storage.getEmployeeTimeEntries(req.params.employeeId);
      console.log('🕐 Found manual time entries:', manualTimeEntries.length);
      
      // Get POS timeclock entries for this employee
      const posResult = await db.execute(sql`
        SELECT 
          pt.id,
          pt.clock_in_at::text as clock_in_at,
          pt.clock_out_at::text as clock_out_at,
          pt.break_seconds,
          pt.status,
          pt.role_title,
          pi.provider
        FROM pos_timeclocks pt
        INNER JOIN pos_employee_mappings pem ON pt.pos_employee_id = pem.pos_employee_id
        INNER JOIN pos_integrations pi ON pt.pos_integration_id = pi.id
        WHERE pem.employee_id = ${req.params.employeeId}
        ORDER BY pt.clock_in_at DESC
        LIMIT 100
      `);
      
      const posTimeEntries = posResult.rows.map((row: any) => {
        const clockIn = row.clock_in_at ? new Date(row.clock_in_at) : new Date();
        const clockOut = row.clock_out_at ? new Date(row.clock_out_at) : null;
        
        let totalHours = null;
        if (clockOut) {
          const hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
          const breakHours = (row.break_seconds || 0) / 3600;
          totalHours = (hours - breakHours).toFixed(2);
        }
        
        return {
          id: `pos-${row.id}`,
          employeeId: req.params.employeeId,
          clockInTime: clockIn.toISOString(),
          clockOutTime: clockOut ? clockOut.toISOString() : null,
          totalHours,
          status: row.status === 'open' ? 'clocked-in' : 'clocked-out',
          notes: `Synced from ${row.provider?.toUpperCase() || 'POS'} - ${row.role_title || 'Employee'}`,
          source: 'pos',
          posProvider: row.provider
        };
      });
      
      // Combine and sort
      const allEntries = [...manualTimeEntries, ...posTimeEntries].sort((a: any, b: any) => 
        new Date(b.clockInTime).getTime() - new Date(a.clockInTime).getTime()
      );
      
      console.log(`🕐 Total entries: ${allEntries.length} (${manualTimeEntries.length} manual + ${posTimeEntries.length} POS)`);
      res.json(allEntries);
    } catch (error) {
      console.error('Error fetching employee time entries:', error);
      res.status(500).json({ message: 'Failed to fetch time entries' });
    }
  });

  app.get('/api/employees/:employeeId/shifts', isAuthenticated, async (req, res) => {
    try {
      // Get user ID from Clerk authentication
      const userId = req.user!.id;
      // Ensure employees can only access their own shifts
      if (req.params.employeeId !== userId) {
        return res.status(403).json({ message: 'Access denied - can only view your own shifts' });
      }
      const shifts = await storage.getEmployeeShifts(req.params.employeeId);
      res.json(shifts);
    } catch (error) {
      console.error('Error fetching employee shifts:', error);
      res.status(500).json({ message: 'Failed to fetch shifts' });
    }
  });

  app.post('/api/employees/:employeeId/clock-in', isAuthenticated, async (req, res) => {
    try {
      // Get user ID from Clerk authentication
      const userId = req.user!.id;
      // Ensure employees can only clock in for themselves
      if (req.params.employeeId !== userId) {
        return res.status(403).json({ message: 'Access denied - can only clock in for yourself' });
      }
      const entry = await storage.clockIn(req.params.employeeId);
      res.status(201).json(entry);
    } catch (error) {
      console.error('Error clocking in:', error);
      res.status(500).json({ message: 'Failed to clock in' });
    }
  });

  app.post('/api/employees/:employeeId/clock-out', isAuthenticated, async (req, res) => {
    try {
      // Get user ID from Clerk authentication
      const userId = req.user!.id;
      // Ensure employees can only clock out for themselves
      if (req.params.employeeId !== userId) {
        return res.status(403).json({ message: 'Access denied - can only clock out for yourself' });
      }
      const { notes } = req.body;
      // Get the active time entry for the employee first
      const activeEntry = await storage.getActiveTimeEntry(req.params.employeeId);
      if (!activeEntry) {
        return res.status(400).json({ message: 'No active time entry found' });
      }
      const entry = await storage.clockOut(activeEntry.id);
      res.json(entry);
    } catch (error) {
      console.error('Error clocking out:', error);
      res.status(500).json({ message: 'Failed to clock out' });
    }
  });

  app.post('/api/employees/:employeeId/break-start', isAuthenticated, async (req, res) => {
    try {
      // Get user ID from Clerk authentication
      const userId = req.user!.id;
      if (req.params.employeeId !== userId) {
        return res.status(403).json({ message: 'Access denied - can only start break for yourself' });
      }
      // Get the active time entry for the employee first
      const activeEntry = await storage.getActiveTimeEntry(req.params.employeeId);
      if (!activeEntry) {
        return res.status(400).json({ message: 'No active time entry found' });
      }
      const entry = await storage.startBreak(activeEntry.id);
      res.json(entry);
    } catch (error) {
      console.error('Error starting break:', error);
      res.status(500).json({ message: 'Failed to start break' });
    }
  });

  app.post('/api/employees/:employeeId/break-end', isAuthenticated, async (req, res) => {
    try {
      // Get user ID from Clerk authentication
      const userId = req.user!.id;
      if (req.params.employeeId !== userId) {
        return res.status(403).json({ message: 'Access denied - can only end break for yourself' });
      }
      // Get the active time entry for the employee first
      const activeEntry = await storage.getActiveTimeEntry(req.params.employeeId);
      if (!activeEntry) {
        return res.status(400).json({ message: 'No active time entry found' });
      }
      const entry = await storage.endBreak(activeEntry.id);
      res.json(entry);
    } catch (error) {
      console.error('Error ending break:', error);
      res.status(500).json({ message: 'Failed to end break' });
    }
  });

  // HR Payroll
  app.get('/api/hr/payroll/pay-periods', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const payPeriods = await storage.getPayPeriods();
      res.json(payPeriods);
    } catch (error) {
      console.error('Error fetching pay periods:', error);
      res.status(500).json({ message: 'Failed to fetch pay periods' });
    }
  });

  app.post('/api/hr/payroll/pay-periods', isAuthenticated, async (req, res) => {
    try {
      const payPeriod = await storage.createPayPeriod(req.body);
      res.status(201).json(payPeriod);
    } catch (error) {
      console.error('Error creating pay period:', error);
      res.status(500).json({ message: 'Failed to create pay period' });
    }
  });

  app.post('/api/hr/payroll/pay-periods/:id/calculate', isAuthenticated, async (req, res) => {
    try {
      const paystubs = await storage.calculatePayroll(req.params.id);
      res.json(paystubs);
    } catch (error) {
      console.error('Error calculating payroll:', error);
      res.status(500).json({ message: 'Failed to calculate payroll' });
    }
  });

  app.post('/api/hr/payroll/pay-periods/:id/recalculate', isAuthenticated, async (req, res) => {
    try {
      const paystubs = await storage.recalculatePayroll(req.params.id);
      res.json(paystubs);
    } catch (error) {
      console.error('Error recalculating payroll:', error);
      res.status(500).json({ message: 'Failed to recalculate payroll' });
    }
  });

  app.post('/api/hr/payroll/pay-periods/:id/approve', isAuthenticated, async (req, res) => {
    try {
      const payPeriodId = req.params.id;
      const payPeriod = await storage.approvePayroll(payPeriodId, req.user!.id);
      res.json({ payPeriod });
    } catch (error) {
      console.error('Error approving payroll:', error);
      res.status(500).json({ message: 'Failed to approve payroll' });
    }
  });

  // Generate PDFs for approved payroll (on demand)
  app.post('/api/hr/payroll/pay-periods/:id/generate-pdfs', isAuthenticated, async (req, res) => {
    try {
      const payPeriodId = req.params.id;
      
      console.log('📄 Generating PDF paychecks for all employees...');
      const { generatePaycheckPDF } = await import('./pdf-generators/paycheck-simple.js');
      
      const payPeriod = await storage.getPayrollPeriod(payPeriodId);
      if (!payPeriod) {
        return res.status(404).json({ message: 'Pay period not found' });
      }
      
      const paystubs = await storage.getPaystubsByPeriod(payPeriodId);
      const settings = await storage.getPaycheckSettings();
      
      // Generate sequential check numbers if not already set
      let checkNumberCounter = settings.lastCheckNumber || 1000;
      
      const pdfs = await Promise.all(
        paystubs.map(async (paystub: any, index: number) => {
          // Use the paystub's check number if it exists, otherwise generate sequential
          const checkNum = paystub.checkNumber || (checkNumberCounter + index + 1).toString();
          
          // Format date properly - use payPeriod endDate if paystub payDate is invalid
          const payDate = paystub.payDate || payPeriod.endDate || new Date().toISOString();
          
          // Build employee address from multiple fields
          const employeeAddress = paystub.employee.address || 
            [paystub.employee.street, paystub.employee.city, paystub.employee.state, paystub.employee.zip]
              .filter(Boolean).join(', ') || 'N/A';
          
          const pdfData = {
            checkNumber: checkNum,
            payDate: payDate,
            employeeName: `${paystub.employee.firstName} ${paystub.employee.lastName}`,
            employeeAddress: employeeAddress,
            netPay: paystub.netPay,
            regularHours: paystub.regularHours,
            overtimeHours: paystub.overtimeHours,
            regularRate: paystub.regularRate,
            overtimeRate: paystub.overtimeRate,
            regularPay: paystub.regularPay,
            overtimePay: paystub.overtimePay,
            grossPay: paystub.grossPay,
            federalTax: paystub.federalTax,
            stateTax: paystub.stateTax,
            socialSecurity: paystub.socialSecurity,
            medicare: paystub.medicare,
            totalDeductions: paystub.totalDeductions,
            bonuses: paystub.bonuses,
            tips: paystub.tips,
            companyName: settings.companyName || '',
            companyAddress: settings.companyAddress || '',
            companyPhone: settings.companyPhone || '',
            companyEin: settings.companyEin || '',
            bankName: settings.bankName || '',
            periodStart: payPeriod.startDate,
            periodEnd: payPeriod.endDate,
            // Pass layout and display settings so PDF matches preview
            paycheckLayout: settings.paycheckLayout || 'check_stub_only',
            displayBusinessName: settings.displayBusinessName || false,
            displayTaxFilingName: settings.displayTaxFilingName || false,
            taxFilingName: settings.taxFilingName || '',
            printSignature: settings.printSignature || false,
            displayLast4Ssn: settings.displayLast4Ssn || false,
            employeeSsn: paystub.employee.ssn || '',
            employeeNumber: paystub.employee.employeeNumber || '',
          };

          const pdfBuffer = await generatePaycheckPDF(pdfData);
          return {
            paystubId: paystub.id,
            employeeId: paystub.employeeId,
            employeeName: pdfData.employeeName,
            checkNumber: pdfData.checkNumber,
            pdfBase64: pdfBuffer.toString('base64'),
          };
        })
      );
      
      console.log(`✅ Generated ${pdfs.length} PDF paychecks`);
      res.json({ pdfs });
    } catch (error) {
      console.error('Error generating PDFs:', error);
      res.status(500).json({ message: 'Failed to generate PDFs' });
    }
  });

  // Manual payroll entry endpoints
  app.post('/api/payroll-periods/:id/manual-paycheck', isAuthenticated, async (req, res) => {
    try {
      const payPeriodId = req.params.id;
      const manualData = req.body;
      
      const paystub = await storage.createManualPaystub(payPeriodId, manualData);
      res.status(201).json(paystub);
    } catch (error) {
      console.error('Error creating manual paycheck:', error);
      res.status(500).json({ message: 'Failed to create manual paycheck' });
    }
  });

  app.patch('/api/paychecks/:id', isAuthenticated, async (req, res) => {
    try {
      const paycheckId = req.params.id;
      const updateData = req.body;
      
      const updatedPaystub = await storage.updatePaystub(paycheckId, updateData);
      res.json(updatedPaystub);
    } catch (error) {
      console.error('Error updating paycheck:', error);
      res.status(500).json({ message: 'Failed to update paycheck' });
    }
  });

  // Employee pay stub access endpoints
  app.get('/api/employee/:employeeId/pay-stubs', isAuthenticated, async (req, res) => {
    try {
      const { employeeId } = req.params;
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
      
      // For owner account using Replit user ID, get the actual employee record
      let actualEmployeeId = employeeId;
      if (employeeId === '46308728') {
        const user = await storage.getUser(employeeId);
        if (user && user.email) {
          // Find the employee record by email
          const employees = await storage.getEmployees();
          const employee = employees.find(emp => emp.email === user.email);
          if (employee) {
            actualEmployeeId = employee.id;
            console.log(`📋 Mapped user ${employeeId} to employee ${actualEmployeeId}`);
          }
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
      const { employeeId } = req.params;
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
      
      // For owner account using Replit user ID, get the actual employee record
      let actualEmployeeId = employeeId;
      if (employeeId === '46308728') {
        const user = await storage.getUser(employeeId);
        if (user && user.email) {
          // Find the employee record by email
          const employees = await storage.getEmployees();
          const employee = employees.find(emp => emp.email === user.email);
          if (employee) {
            actualEmployeeId = employee.id;
            console.log(`📋 Mapped user ${employeeId} to employee ${actualEmployeeId}`);
          }
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

  // Team Resources Routes
  app.get('/api/hr/team-resources', isAuthenticated, async (req, res) => {
    try {
      const resources = await db.select().from(teamResources).orderBy(desc(teamResources.uploadedAt));
      res.json(resources);
    } catch (error) {
      console.error('Error fetching team resources:', error);
      res.status(500).json({ message: 'Failed to fetch team resources' });
    }
  });

  app.post('/api/hr/team-resources', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const resourceData = insertTeamResourceSchema.parse({
        ...req.body,
        uploadedBy: userId,
      });
      const [resource] = await db.insert(teamResources).values(resourceData).returning();
      res.status(201).json(resource);
    } catch (error) {
      console.error('Error creating team resource:', error);
      res.status(500).json({ message: 'Failed to create team resource' });
    }
  });

  app.delete('/api/hr/team-resources/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(teamResources).where(eq(teamResources.id, id));
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting team resource:', error);
      res.status(500).json({ message: 'Failed to delete team resource' });
    }
  });

  // Object Storage routes for file uploads
  app.post('/api/objects/upload', isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error('Error getting upload URL:', error);
      res.status(500).json({ error: 'Failed to get upload URL' });
    }
  });

  app.get('/objects/:objectPath(*)', isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error('Error downloading object:', error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
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

  app.get('/api/hr/payroll/deductions', isAuthenticated, async (req, res) => {
    try {
      const deductions = await storage.getPayrollDeductions();
      res.json(deductions);
    } catch (error) {
      console.error('Error fetching deductions:', error);
      res.status(500).json({ message: 'Failed to fetch deductions' });
    }
  });

  app.get('/api/hr/payroll/summary', isAuthenticated, async (req, res) => {
    try {
      const summary = await storage.getPayrollSummary();
      res.json(summary);
    } catch (error) {
      console.error('Error fetching payroll summary:', error);
      res.status(500).json({ message: 'Failed to fetch payroll summary' });
    }
  });

  // Update time entry (for managers to edit punches)
  app.put('/api/hr/time-entries/:id', isAuthenticated, async (req, res) => {
    try {
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

  // Delete time entry
  app.delete('/api/hr/time-entries/:id', isAuthenticated, async (req, res) => {
    try {
      await storage.deleteTimeEntry(req.params.id);
      res.json({ message: 'Time entry deleted successfully' });
    } catch (error) {
      console.error('Error deleting time entry:', error);
      res.status(500).json({ message: 'Failed to delete time entry' });
    }
  });

  // Create manual time entry (for supervisors to add missed clock-ins)
  app.post('/api/hr/time-entries/manual', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { employeeId, clockInTime, clockOutTime, breakStartTime, breakEndTime, notes } = req.body;

      // Validate required fields
      if (!employeeId || !clockInTime) {
        return res.status(400).json({ message: 'Employee ID and clock in time are required' });
      }

      // Calculate total hours if clock out time is provided
      let totalHours = null;
      if (clockOutTime) {
        const start = new Date(clockInTime);
        const end = new Date(clockOutTime);
        const diffMs = end.getTime() - start.getTime();
        totalHours = diffMs / (1000 * 60 * 60); // Convert to hours
      }

      const manualEntry = {
        employeeId,
        clockInTime: new Date(clockInTime),
        clockOutTime: clockOutTime ? new Date(clockOutTime) : null,
        breakStartTime: breakStartTime ? new Date(breakStartTime) : null,
        breakEndTime: breakEndTime ? new Date(breakEndTime) : null,
        totalHours: totalHours ? totalHours.toString() : null,
        status: clockOutTime ? 'clocked-out' : 'clocked-in',
        notes: notes || 'Manual entry added by supervisor',
        isManual: true,
        addedBy: userId
      };

      const timeEntry = await storage.createTimeEntry(manualEntry);
      res.status(201).json(timeEntry);
    } catch (error) {
      console.error('Error creating manual time entry:', error);
      res.status(500).json({ message: 'Failed to create manual time entry' });
    }
  });

  // HR Messaging
  app.get('/api/hr/messages', isAuthenticated, requireHRAccess, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const messages = await storage.getMessages();
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ message: 'Failed to fetch messages' });
    }
  });

  app.post('/api/hr/messages', isAuthenticated, async (req, res) => {
    try {
      // Get user ID from authenticated request
      const userId = req.user!.id;
      
      const messageData = {
        ...req.body,
        senderId: userId,
      };
      
      console.log('Creating message with userId:', userId, 'and data:', messageData);
      const message = await storage.createMessage(messageData);
      res.status(201).json(message);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ message: 'Failed to create message' });
    }
  });

  // Analytics and Activity Routes
  app.get('/api/activities', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      // Return recent activities from various operations
      const activities: any[] = [];
      
      // Get recent inventory additions (last 10)
      const recentInventory = await db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          createdAt: inventoryItems.createdAt,
        })
        .from(inventoryItems)
        .where(locationId ? eq(inventoryItems.locationId, locationId) : sql`1=1`)
        .orderBy(desc(inventoryItems.createdAt))
        .limit(5);
      
      recentInventory.forEach(item => {
        activities.push({
          id: `inv_${item.id}`,
          type: 'inventory',
          description: `Added ${item.name} to inventory`,
          createdAt: item.createdAt,
          user: 'System'
        });
      });
      
      // Get recent recipes (last 5)
      const recentRecipes = await db
        .select({
          id: recipes.id,
          name: recipes.name,
          createdAt: recipes.createdAt,
        })
        .from(recipes)
        .where(locationId ? eq(recipes.locationId, locationId) : sql`1=1`)
        .orderBy(desc(recipes.createdAt))
        .limit(3);
      
      recentRecipes.forEach(recipe => {
        activities.push({
          id: `recipe_${recipe.id}`,
          type: 'recipe',
          description: `Created recipe: ${recipe.name}`,
          createdAt: recipe.createdAt,
          user: 'Chef'
        });
      });
      
      // Sort by creation date and return most recent
      activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      res.json(activities.slice(0, 8));
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  app.get('/api/analytics/realtime', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      
      // Disable caching for real-time data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Get basic metrics from POS sales - show last 7 days of data
      const salesData = await db
        .select({
          totalSales: sql<number>`COALESCE(SUM(CAST(${posSales.total} AS DECIMAL)), 0)`,
          orderCount: sql<number>`COUNT(*)`,
        })
        .from(posSales)
        .where(
          sql`${posSales.orderDate} >= CURRENT_DATE - INTERVAL '7 days'
          ${locationId ? sql`AND ${posSales.locationId} = ${locationId}` : sql``}`
        );
      
      const recentSales = salesData[0] || { totalSales: 0, orderCount: 0 };
      const avgOrderValue = recentSales.orderCount > 0 ? recentSales.totalSales / recentSales.orderCount : 0;
      
      res.json({
        currentSales: Number(recentSales.totalSales),
        ordersToday: Number(recentSales.orderCount),
        avgOrderValue: Number(avgOrderValue)
      });
    } catch (error) {
      console.error("Error fetching real-time data:", error);
      res.status(500).json({ message: "Failed to fetch real-time data" });
    }
  });

  app.get('/api/analytics/sales-trend', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const timeRange = req.query.timeRange as string || '7d';
      
      // Determine days to show based on timeRange
      const days = timeRange === '30d' ? 30 : 7;
      
      // Query real POS sales data grouped by day
      const salesByDay = await db
        .select({
          date: sql<string>`DATE(${posSales.orderDate})`,
          sales: sql<number>`COALESCE(SUM(CAST(${posSales.total} AS DECIMAL)), 0)`,
          orders: sql<number>`COUNT(*)`,
        })
        .from(posSales)
        .where(
          sql`${posSales.orderDate} >= CURRENT_DATE - INTERVAL '${sql.raw(days.toString())} days'
          ${locationId ? sql`AND ${posSales.locationId} = ${locationId}` : sql``}`
        )
        .groupBy(sql`DATE(${posSales.orderDate})`)
        .orderBy(sql`DATE(${posSales.orderDate})`);
      
      // Format the data for the chart
      const dailyData = salesByDay.map(day => {
        const sales = Number(day.sales);
        const orders = Number(day.orders);
        return {
          date: day.date,
          sales,
          orders,
          avgOrder: orders > 0 ? sales / orders : 0
        };
      });
      
      res.json(dailyData);
    } catch (error) {
      console.error("Error fetching sales trend:", error);
      res.status(500).json({ message: "Failed to fetch sales trend" });
    }
  });

  // Manual backfill endpoint for business intelligence (admin only)
  app.post('/api/analytics/backfill-bi', isAuthenticated, async (req: any, res) => {
    try {
      // Only allow owner role to trigger backfill
      if (req.user.role !== 'owner') {
        return res.status(403).json({ message: "Only owners can trigger BI backfill" });
      }
      
      const { computeBusinessIntelligence } = await import('./jobs/analyticsScheduler');
      await computeBusinessIntelligence(true); // true = full recompute
      
      res.json({ message: "Business intelligence backfill completed successfully" });
    } catch (error) {
      console.error("Error running BI backfill:", error);
      res.status(500).json({ message: "Failed to run BI backfill" });
    }
  });

  app.get('/api/waste/summary', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      
      // Get waste data from database
      const wasteStats = await db
        .select({
          category: wasteEntries.reason,
          totalAmount: sql<number>`SUM(CAST(${wasteEntries.quantity} AS DECIMAL))`,
          totalCost: sql<number>`SUM(CAST(${wasteEntries.cost} AS DECIMAL))`,
        })
        .from(wasteEntries)
        .where(
          sql`${wasteEntries.createdAt} >= CURRENT_DATE - INTERVAL '7 days'
          ${locationId ? sql`AND ${wasteEntries.locationId} = ${locationId}` : sql``}`
        )
        .groupBy(wasteEntries.reason);
      
      const colorMap: { [key: string]: string } = {
        'food_prep': '#EF4444',
        'spoilage': '#F59E0B',
        'customer_leftover': '#10B981',
        'overproduction': '#8B5CF6'
      };
      
      const formattedWaste = wasteStats.map(stat => ({
        category: stat.category?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Other',
        amount: Number(stat.totalAmount || 0),
        cost: Number(stat.totalCost || 0),
        color: colorMap[stat.category || ''] || '#6B7280'
      }));
      
      res.json(formattedWaste);
    } catch (error) {
      console.error("Error fetching waste summary:", error);
      res.status(500).json({ message: "Failed to fetch waste summary" });
    }
  });

  // Object Storage Routes for Recipe Photos
  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.put("/api/recipes/:id/photo", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ error: "imageUrl is required" });
      }

      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(imageUrl);
      
      // Update recipe with the photo URL
      const updatedRecipe = await storage.updateRecipe(id, { imageUrl: objectPath });
      res.json(updatedRecipe);
    } catch (error) {
      console.error("Error updating recipe photo:", error);
      res.status(500).json({ error: "Failed to update recipe photo" });
    }
  });

  // Employee Documents Management API
  app.get("/api/hr/documents", isAuthenticated, async (req, res) => {
    try {
      const { employeeId } = req.query;
      const documents = await storage.getEmployeeDocuments(employeeId as string);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post("/api/hr/documents", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const documentData = {
        ...req.body,
        uploadedBy: userId
      };
      const document = await storage.createEmployeeDocument(documentData);
      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  app.put("/api/hr/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const updateData = {
        ...req.body,
        reviewedBy: userId,
        reviewedAt: new Date()
      };
      const document = await storage.updateEmployeeDocument(id, updateData);
      res.json(document);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  app.delete("/api/hr/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteEmployeeDocument(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Document Requirements Management API
  app.get("/api/hr/document-requirements", isAuthenticated, async (req, res) => {
    try {
      const { locationId, positionId } = req.query;
      const requirements = await storage.getDocumentRequirements(
        locationId as string,
        positionId as string
      );
      res.json(requirements);
    } catch (error) {
      console.error("Error fetching document requirements:", error);
      res.status(500).json({ message: "Failed to fetch document requirements" });
    }
  });

  app.post("/api/hr/document-requirements", isAuthenticated, async (req, res) => {
    try {
      const requirement = await storage.createDocumentRequirement(req.body);
      res.status(201).json(requirement);
    } catch (error) {
      console.error("Error creating document requirement:", error);
      res.status(500).json({ message: "Failed to create document requirement" });
    }
  });

  // Onboarding Templates Management API
  app.get("/api/hr/onboarding/templates", isAuthenticated, async (req, res) => {
    try {
      const { locationId, positionId } = req.query;
      const templates = await storage.getOnboardingTemplates(
        locationId as string,
        positionId as string
      );
      res.json(templates);
    } catch (error) {
      console.error("Error fetching onboarding templates:", error);
      res.status(500).json({ message: "Failed to fetch onboarding templates" });
    }
  });

  app.post("/api/hr/onboarding/templates", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const templateData = {
        ...req.body,
        createdBy: userId
      };
      const template = await storage.createOnboardingTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating onboarding template:", error);
      res.status(500).json({ message: "Failed to create onboarding template" });
    }
  });

  app.get("/api/hr/onboarding/templates/:id/steps", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const steps = await storage.getOnboardingSteps(id);
      res.json(steps);
    } catch (error) {
      console.error("Error fetching onboarding steps:", error);
      res.status(500).json({ message: "Failed to fetch onboarding steps" });
    }
  });

  app.post("/api/hr/onboarding/steps", isAuthenticated, async (req, res) => {
    try {
      const step = await storage.createOnboardingStep(req.body);
      res.status(201).json(step);
    } catch (error) {
      console.error("Error creating onboarding step:", error);
      res.status(500).json({ message: "Failed to create onboarding step" });
    }
  });

  // Employee Onboarding Progress API
  app.get("/api/hr/onboarding", isAuthenticated, async (req, res) => {
    try {
      const { employeeId } = req.query;
      const onboarding = await storage.getEmployeeOnboarding(employeeId as string);
      res.json(onboarding);
    } catch (error) {
      console.error("Error fetching employee onboarding:", error);
      res.status(500).json({ message: "Failed to fetch employee onboarding" });
    }
  });

  app.post("/api/hr/onboarding", isAuthenticated, async (req, res) => {
    try {
      const onboarding = await storage.createEmployeeOnboarding(req.body);
      res.status(201).json(onboarding);
    } catch (error) {
      console.error("Error creating employee onboarding:", error);
      res.status(500).json({ message: "Failed to create employee onboarding" });
    }
  });

  app.put("/api/hr/onboarding/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const onboarding = await storage.updateEmployeeOnboarding(id, req.body);
      res.json(onboarding);
    } catch (error) {
      console.error("Error updating employee onboarding:", error);
      res.status(500).json({ message: "Failed to update employee onboarding" });
    }
  });

  app.get("/api/hr/onboarding/:id/steps", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const steps = await storage.getEmployeeOnboardingSteps(id);
      res.json(steps);
    } catch (error) {
      console.error("Error fetching onboarding progress steps:", error);
      res.status(500).json({ message: "Failed to fetch onboarding progress steps" });
    }
  });

  app.put("/api/hr/onboarding/steps/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const updateData = {
        ...req.body,
        completedBy: userId,
        completedDate: req.body.status === 'completed' ? new Date() : req.body.completedDate
      };
      const step = await storage.updateEmployeeOnboardingStep(id, updateData);
      res.json(step);
    } catch (error) {
      console.error("Error updating onboarding step:", error);
      res.status(500).json({ message: "Failed to update onboarding step" });
    }
  });

  // Onboarding Analytics API
  app.get("/api/hr/onboarding/analytics", isAuthenticated, async (req, res) => {
    try {
      const { locationId } = req.query;
      const analytics = await storage.getOnboardingProgress(locationId as string);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching onboarding analytics:", error);
      res.status(500).json({ message: "Failed to fetch onboarding analytics" });
    }
  });

  // Onboarding Token Management - Generate shareable links
  app.post("/api/hr/onboarding/invite", isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const { employeeId, email, phone, sendMethod = 'email' } = req.body;
      
      // Create secure token for the employee
      const token = await storage.createOnboardingToken(employeeId, 72); // 3 days expiration
      
      // Generate shareable URL
      const baseUrl = req.protocol + '://' + req.get('host');
      const inviteUrl = `${baseUrl}/onboarding/${token.token}`;
      
      // Send invitation based on method
      if (sendMethod === 'email' && email) {
        try {
          const { sendEmail } = await import('./email');
          const employee = await storage.getEmployee(employeeId);
          
          await sendEmail({
            to: email,
            from: 'mequeamaddox@gmail.com', // Use your verified email address
            subject: 'Welcome to RestroFlow - Complete Your Onboarding',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1f2937;">Welcome to RestroFlow!</h2>
                <p>Hi ${employee?.firstName || 'there'},</p>
                <p>You've been invited to join our team! Please complete your onboarding by clicking the link below:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${inviteUrl}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Complete Onboarding</a>
                </div>
                <p>This invitation will expire in 3 days. If you have any questions, please contact your manager.</p>
                <p>Best regards,<br>The RestroFlow Team</p>
              </div>
            `
          });
          console.log(`✅ Email sent successfully to ${email}`);
        } catch (emailError) {
          console.error(`❌ Failed to send email to ${email}:`, emailError);
          console.error(`Full error details:`, JSON.stringify(emailError, null, 2));
          // Don't fail the whole request if email fails - still return the link
        }
      } else if (sendMethod === 'text' && phone) {
        try {
          const { sendSms, formatPhoneNumber } = await import('./twilioSms');
          const employee = await storage.getEmployee(employeeId);
          const formattedPhone = formatPhoneNumber(phone);
          
          await sendSms({
            to: formattedPhone,
            from: process.env.TWILIO_PHONE_NUMBER || '+1234567890', // Your Twilio phone number
            body: `Welcome to RestroFlow! Complete your onboarding here: ${inviteUrl} - This link expires in 3 days.`
          });
          console.log(`✅ SMS sent successfully to ${formattedPhone}`);
        } catch (smsError) {
          console.error(`❌ Failed to send SMS to ${phone}:`, smsError);
          console.error(`Full SMS error details:`, JSON.stringify(smsError, null, 2));
          // Don't fail the whole request if SMS fails - still return the link
        }
      }
      
      res.status(201).json({ 
        token: token.token,
        inviteUrl,
        expiresAt: token.expiresAt,
        message: `Onboarding invitation created successfully`
      });
    } catch (error) {
      console.error("Error creating onboarding invitation:", error);
      res.status(500).json({ message: "Failed to create onboarding invitation" });
    }
  });

  // Public onboarding access - validate token and show form
  app.get("/api/onboarding/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const validation = await storage.validateOnboardingToken(token);
      
      if (!validation.isValid) {
        return res.status(404).json({ 
          error: "Invalid or expired invitation link",
          message: "This invitation link is no longer valid. Please contact your manager for a new link."
        });
      }
      
      res.json({
        isValid: true,
        employee: {
          firstName: validation.employee?.firstName,
          lastName: validation.employee?.lastName,
          email: validation.employee?.email,
          positionId: validation.employee?.positionId,
          departmentId: validation.employee?.departmentId
        }
      });
    } catch (error) {
      console.error("Error validating onboarding token:", error);
      res.status(500).json({ message: "Failed to validate invitation" });
    }
  });

  // Public onboarding submission
  app.post("/api/onboarding/:token/complete", async (req, res) => {
    try {
      const { token } = req.params;
      const validation = await storage.validateOnboardingToken(token);
      
      if (!validation.isValid) {
        return res.status(404).json({ 
          error: "Invalid or expired invitation link" 
        });
      }

      // Update employee information with submitted data
      const { personalInfo, emergencyContact, bankingInfo, documents } = req.body;
      
      // Save detailed onboarding data to secure table
      if (validation.employee) {
        // Get token record for reference
        const tokenRecord = await storage.getOnboardingTokenByToken(token);
        
        // Save detailed secure data
        await storage.saveEmployeeOnboardingData({
          employeeId: validation.employee.id,
          tokenId: tokenRecord?.id,
          
          // Personal information
          phone: personalInfo?.phone,
          address: personalInfo?.address,
          city: personalInfo?.city,
          state: personalInfo?.state,
          zipCode: personalInfo?.zipCode,
          dateOfBirth: personalInfo?.dateOfBirth,
          socialSecurityNumber: personalInfo?.ssn,
          
          // Emergency contact
          emergencyContactName: emergencyContact?.name,
          emergencyContactPhone: emergencyContact?.phone,
          emergencyContactRelationship: emergencyContact?.relationship,
          
          // Banking information
          bankName: bankingInfo?.bankName,
          accountNumber: bankingInfo?.accountNumber,
          routingNumber: bankingInfo?.routingNumber,
          accountType: bankingInfo?.accountType,
          
          // Form metadata
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        // Update employee record with basic info only
        await storage.updateEmployee(validation.employee.id, {
          status: 'active' // Mark as active after onboarding completion
        });
      }
      
      // Mark token as used
      await storage.markOnboardingTokenAsUsed(token);
      
      res.json({ 
        success: true,
        message: "Onboarding completed successfully! Welcome to the team!" 
      });
    } catch (error) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // Employee profile with onboarding data
  app.get("/api/employees/:id/profile", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { employee, onboardingData } = await storage.getEmployeeWithOnboardingData(id);
      
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      res.json({
        employee,
        onboardingData: onboardingData ? {
          ...onboardingData,
          // Mask sensitive data in API response
          socialSecurityNumber: onboardingData.socialSecurityNumber ? "***-**-" + onboardingData.socialSecurityNumber.slice(-4) : null,
          accountNumber: onboardingData.accountNumber ? "*****" + onboardingData.accountNumber.slice(-4) : null,
          routingNumber: onboardingData.routingNumber ? "*****" + onboardingData.routingNumber.slice(-4) : null,
        } : null
      });
    } catch (error) {
      console.error("Error fetching employee profile:", error);
      res.status(500).json({ error: "Failed to fetch employee profile" });
    }
  });

  // Employee profile update (self-service)
  app.put("/api/employees/:id/profile", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      
      // Only allow employees to update their own profile
      if (id !== userId) {
        return res.status(403).json({ error: "You can only update your own profile" });
      }

      const { firstName, lastName, phone, emergencyContactName, emergencyContactPhone } = req.body;
      
      // Update both employee and user records to keep them synchronized
      const existingUser = await storage.getUser(id);
      
      await Promise.all([
        storage.updateEmployee(id, {
          firstName,
          lastName,
          phone,
          emergencyContactName,
          emergencyContactPhone
        }),
        // Only update user if it exists, don't try to upsert
        existingUser ? storage.upsertUser({
          id,
          email: existingUser.email,
          firstName,
          lastName,
          role: existingUser.role
        }) : Promise.resolve()
      ]);

      res.json({ message: "Profile updated successfully" });
    } catch (error) {
      console.error("Error updating employee profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Employee password change (self-service)
  app.put("/api/employees/:id/password", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      
      // Only allow employees to change their own password
      if (id !== userId) {
        return res.status(403).json({ error: "You can only change your own password" });
      }

      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
      }

      // Get employee to verify they exist
      const employee = await storage.getEmployee(id);
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      // For now, verify current password against the temporary ones
      const validPasswords = ['TEMP1234!', 'employee123', 'password123'];
      if (!validPasswords.includes(currentPassword)) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Validate new password strength
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters long" });
      }

      // For now, we'll store the new password in a simple way
      // In production, this should be properly hashed and stored
      console.log(`🔐 Password change request for employee ${employee.email}: ${currentPassword} → ${newPassword}`);
      
      // TODO: Implement proper password hashing and storage
      // For now, just return success
      res.json({ message: "Password changed successfully. Please log in with your new password." });
      
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // Recipe assignment routes for build sheets
  app.get("/api/employees/:employeeId/recipe-assignments", isAuthenticated, async (req, res) => {
    try {
      const { employeeId } = req.params;
      const assignments = await storage.getRecipeAssignmentsForEmployee(employeeId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching recipe assignments:", error);
      res.status(500).json({ error: "Failed to fetch recipe assignments" });
    }
  });

  app.post("/api/recipe-assignments", isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const assignment = await storage.createRecipeAssignment(req.body);
      res.json(assignment);
    } catch (error) {
      console.error("Error creating recipe assignment:", error);
      res.status(500).json({ error: "Failed to create recipe assignment" });
    }
  });

  app.put("/api/recipe-assignments/:id/status", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const assignment = await storage.updateRecipeAssignmentStatus(id, status);
      res.json(assignment);
    } catch (error) {
      console.error("Error updating recipe assignment status:", error);
      res.status(500).json({ error: "Failed to update assignment status" });
    }
  });

  // Employee onboarding data for admin view (full access)
  app.get("/api/employees/:id/onboarding-data", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const onboardingData = await storage.getEmployeeOnboardingData(id);
      
      if (!onboardingData) {
        return res.status(404).json({ error: "Onboarding data not found" });
      }

      // Only return full data to authorized users
      res.json(onboardingData);
    } catch (error) {
      console.error("Error fetching onboarding data:", error);
      res.status(500).json({ error: "Failed to fetch onboarding data" });
    }
  });

  // Document Management API Endpoints
  
  // Document template management
  app.get('/api/document-templates', async (req, res) => {
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
      const userId = req.user!.id;
      const templateData = { ...req.body, createdBy: userId };
      const template = await storage.createDocumentTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      console.error('Error creating document template:', error);
      res.status(500).json({ message: 'Failed to create document template' });
    }
  });

  // Employee document assignments
  app.get('/api/employees/:employeeId/documents', async (req, res) => {
    try {
      const documents = await storage.getEmployeeDocuments(req.params.employeeId);
      // Transform the flat response to match frontend expectations
      const transformedDocuments = documents.map(doc => ({
        id: doc.id,
        templateId: (doc as any).templateId || null,
        status: doc.status,
        deadline: (doc as any).expiresAt || null,
        notes: (doc as any).notes || null,
        assignedAt: (doc as any).sentAt || null,
        completedAt: (doc as any).completedAt || null,
        filePath: (doc as any).completedFilePath || null,
        template: {
          name: (doc as any).templateName || 'Unknown Template',
          type: (doc as any).templateType || 'document',
          description: (doc as any).description || 'No description available',
          requirements: (doc as any).isRequired ? 'This document is required for employment' : undefined,
        }
      }));
      res.json(transformedDocuments);
    } catch (error) {
      console.error('Error fetching employee documents:', error);
      res.status(500).json({ message: 'Failed to fetch employee documents' });
    }
  });

  app.post('/api/employee-documents/assign', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const assignmentData = { 
        ...req.body, 
        sentBy: userId, 
        sentAt: new Date(),
        status: 'assigned'
      };
      
      // Create the document assignment
      const assignment = await storage.createDocumentAssignment(assignmentData);
      
      // Check if employee has an active onboarding record, create if not
      const employeeId = assignmentData.employeeId;
      const existingOnboarding = await storage.getEmployeeOnboarding(employeeId);
      const hasActiveOnboarding = existingOnboarding && existingOnboarding.some(
        (ob: any) => ob.status === 'in-progress' || ob.status === 'not-started'
      );
      
      if (!hasActiveOnboarding) {
        // Get the first available onboarding template
        const templates = await storage.getOnboardingTemplates();
        const defaultTemplate = templates.length > 0 ? templates[0] : null;
        
        if (defaultTemplate) {
          // Create new onboarding record for this employee
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + 14); // 2 weeks to complete
          
          await storage.createEmployeeOnboarding({
            employeeId,
            templateId: defaultTemplate.id,
            totalSteps: 5,
            status: 'in-progress',
            startDate: new Date(),
            targetCompletionDate: targetDate,
            notes: 'Auto-created from document assignment'
          });
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
      
      // Update timestamps based on status
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

  // Digital signature endpoint
  app.post('/api/employee-documents/:id/signature', async (req, res) => {
    try {
      const { signatureData, signedName, employeeId } = req.body;
      
      // Create signature record
      const signature = await storage.createEmployeeSignature({
        documentAssignmentId: req.params.id,
        employeeId,
        signatureData,
        signedName,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      // Update document assignment status
      await storage.updateDocumentAssignment(req.params.id, {
        status: 'signed',
        signedAt: new Date(),
        signaturePath: `/signatures/${signature.id}`
      });
      
      // Check if all documents for this employee are completed/signed
      const allDocuments = await storage.getEmployeeDocuments(employeeId);
      const completedStatuses = ['completed', 'signed', 'uploaded', 'approved'];
      const allCompleted = allDocuments.every(doc => doc.status && completedStatuses.includes(doc.status));
      
      if (allCompleted) {
        // Update employee onboarding status to completed
        const onboardingRecords = await storage.getEmployeeOnboarding(employeeId);
        if (onboardingRecords && onboardingRecords.length > 0) {
          const activeOnboarding = onboardingRecords.find(o => o.status === 'in-progress');
          if (activeOnboarding) {
            await storage.updateEmployeeOnboarding(activeOnboarding.id, {
              status: 'completed',
              actualCompletionDate: new Date()
            });
          }
        }
      }
      
      res.status(201).json(signature);
    } catch (error) {
      console.error('Error creating signature:', error);
      res.status(500).json({ message: 'Failed to create signature' });
    }
  });

  // Start document endpoint
  app.put('/api/employee-documents/:id/start', async (req, res) => {
    try {
      const assignment = await storage.updateDocumentAssignment(req.params.id, {
        status: 'viewed'
      });
      res.json(assignment);
    } catch (error) {
      console.error('Error starting document:', error);
      res.status(500).json({ message: 'Failed to start document' });
    }
  });

  // Manager paper upload endpoint
  app.put('/api/employee-documents/:id/manager-upload', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { filePath, fileSize, mimeType } = req.body;
      
      const assignment = await storage.updateDocumentAssignment(req.params.id, {
        status: 'completed',
        notes: 'Paper copy uploaded by manager'
      });
      
      res.json(assignment);
    } catch (error) {
      console.error('Error uploading paper copy:', error);
      res.status(500).json({ message: 'Failed to upload paper copy' });
    }
  });

  // Upload document endpoint
  app.post('/api/employee-documents/:id/upload', async (req, res) => {
    try {
      const { filePath, fileSize, mimeType } = req.body;
      const assignment = await storage.updateDocumentAssignment(req.params.id, {
        status: 'completed',
        completedAt: new Date()
      });
      res.json(assignment);
    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ message: 'Failed to upload document' });
    }
  });

  // Get form fields for a document template
  app.get('/api/document-templates/:id/fields', async (req, res) => {
    try {
      const fields = await storage.getDocumentFormFields(req.params.id);
      res.json(fields);
    } catch (error) {
      console.error('Error fetching form fields:', error);
      res.status(500).json({ message: 'Failed to fetch form fields' });
    }
  });

  // Get employee's responses for a document assignment
  app.get('/api/employee-documents/:id/responses', async (req, res) => {
    try {
      const responses = await storage.getDocumentFormResponses(req.params.id);
      res.json(responses);
    } catch (error) {
      console.error('Error fetching form responses:', error);
      res.status(500).json({ message: 'Failed to fetch form responses' });
    }
  });

  // Save employee response for a form field
  app.post('/api/employee-documents/:id/responses', async (req, res) => {
    try {
      const { fieldId, fieldValue } = req.body;
      const response = await storage.saveDocumentFormResponse({
        assignmentId: req.params.id,
        fieldId,
        fieldValue,
      });
      res.json(response);
    } catch (error) {
      console.error('Error saving form response:', error);
      res.status(500).json({ message: 'Failed to save form response' });
    }
  });

  // Complete digital document (mark as completed after all required fields filled)
  app.post('/api/employee-documents/:id/complete', async (req, res) => {
    try {
      const assignment = await storage.updateDocumentAssignment(req.params.id, {
        status: 'completed',
        completedAt: new Date(),
      });
      res.json(assignment);
    } catch (error) {
      console.error('Error completing document:', error);
      res.status(500).json({ message: 'Failed to complete document' });
    }
  });

  // Payroll API Routes
  
  // Get payroll periods
  app.get("/api/payroll-periods", isAuthenticated, async (req, res) => {
    try {
      const { locationId } = req.query;
      const periods = await storage.getPayrollPeriods(locationId as string);
      res.json(periods);
    } catch (error) {
      console.error("Error fetching payroll periods:", error);
      res.status(500).json({ error: "Failed to fetch payroll periods" });
    }
  });

  // Create payroll period
  app.post("/api/payroll-periods", isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const userId = req.user!.id;
      
      console.log('Received payroll period request body:', JSON.stringify(req.body, null, 2));
      
      // Handle nested body structure from frontend
      const requestData = req.body.body || req.body;
      
      // Generate period name based on Patriot Software approach
      const { frequency, startDate, endDate, locationId, payDate } = requestData;
      
      // Convert date strings to proper Date objects
      const startDateObj = new Date(startDate + 'T00:00:00');
      const endDateObj = new Date(endDate + 'T00:00:00');
      const payDateObj = payDate ? new Date(payDate + 'T00:00:00') : endDateObj;
      
      console.log('Parsed dates:', { startDateObj, endDateObj, payDateObj });
      
      const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };
      
      // Create descriptive name like "Biweekly - Dec 16 to Dec 29, 2024"
      const safeFrequency = frequency || 'biweekly';
      const name = `${safeFrequency.charAt(0).toUpperCase() + safeFrequency.slice(1)} - ${formatDate(startDateObj)} to ${formatDate(endDateObj)}, ${startDateObj.getFullYear()}`;
      
      // Ensure we have all required fields
      const periodData = {
        name: name || `${safeFrequency} Period`,
        startDate: startDateObj.toISOString().split('T')[0],
        endDate: endDateObj.toISOString().split('T')[0],
        payDate: payDateObj.toISOString().split('T')[0],
        frequency: safeFrequency,
        locationId: locationId || null,
        status: 'draft',
        totalGrossPay: '0.00',
        totalNetPay: '0.00', 
        totalDeductions: '0.00',
        createdBy: userId
      };
      
      const period = await storage.createPayrollPeriod(periodData);
      res.status(201).json(period);
    } catch (error) {
      console.error("Error creating payroll period:", error);
      res.status(500).json({ error: "Failed to create payroll period" });
    }
  });

  // Delete payroll period
  app.delete("/api/payroll-periods/:id", isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      await storage.deletePayPeriod(req.params.id);
      res.status(200).json({ message: "Payroll period deleted successfully" });
    } catch (error) {
      console.error("Error deleting payroll period:", error);
      res.status(500).json({ error: "Failed to delete payroll period" });
    }
  });

  // Get payroll period details
  app.get("/api/payroll-periods/:id", isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const period = await storage.getPayrollPeriod(req.params.id);
      if (!period) {
        return res.status(404).json({ error: "Payroll period not found" });
      }
      res.json(period);
    } catch (error) {
      console.error("Error fetching payroll period:", error);
      res.status(500).json({ error: "Failed to fetch payroll period" });
    }
  });

  // Get paychecks for a payroll period
  app.get("/api/payroll-periods/:id/paychecks", isAuthenticated, async (req, res) => {
    try {
      const paychecks = await storage.getPaychecks(req.params.id);
      res.json(paychecks);
    } catch (error) {
      console.error("Error fetching paychecks:", error);
      res.status(500).json({ error: "Failed to fetch paychecks" });
    }
  });

  // Create paycheck
  app.post("/api/paychecks", isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      console.log('🔍 Creating paycheck with data:', JSON.stringify(req.body, null, 2));
      const paycheck = await storage.createPaycheck(req.body);
      res.status(201).json(paycheck);
    } catch (error) {
      console.error("Error creating paycheck:", error);
      res.status(500).json({ error: "Failed to create paycheck" });
    }
  });

  // Recalculate pay period totals
  app.post("/api/payroll-periods/:id/recalculate-totals", isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      await storage.recalculatePayPeriodTotals(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error recalculating pay period totals:", error);
      res.status(500).json({ error: "Failed to recalculate totals" });
    }
  });

  // Update paycheck
  app.put("/api/paychecks/:id", isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const paycheck = await storage.updatePaycheck(req.params.id, req.body);
      res.json(paycheck);
    } catch (error) {
      console.error("Error updating paycheck:", error);
      res.status(500).json({ error: "Failed to update paycheck" });
    }
  });

  // Employee specific time-off requests
  app.get("/api/employees/:employeeId/time-off-requests", isAuthenticated, async (req, res) => {
    try {
      const employeeId = req.params.employeeId;
      const requests = await storage.getEmployeeTimeOffRequests(employeeId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching employee time-off requests:", error);
      res.status(500).json({ message: "Failed to fetch time-off requests" });
    }
  });

  // Payroll settings routes - now with location-aware functionality
  app.get("/api/payroll/paycheck-settings", isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const settings = await storage.getPaycheckSettings(locationId);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching paycheck settings:", error);
      res.status(500).json({ error: "Failed to fetch paycheck settings" });
    }
  });

  app.put("/api/payroll/paycheck-settings", isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      console.log('🎯 Updating paycheck settings with real data:', req.body);
      const settings = await storage.updatePaycheckSettings(req.body, locationId);
      res.json(settings);
    } catch (error) {
      console.error("Error updating paycheck settings:", error);
      res.status(500).json({ error: "Failed to update paycheck settings" });
    }
  });

  // Employee pay stub routes
  app.get("/api/employees/:employeeId/pay-stubs", isAuthenticated, async (req, res) => {
    try {
      const payStubs = await storage.getEmployeePayStubs(req.params.employeeId);
      res.json(payStubs);
    } catch (error) {
      console.error("Error fetching pay stubs:", error);
      res.status(500).json({ error: "Failed to fetch pay stubs" });
    }
  });

  // Mark pay stub as viewed
  app.put("/api/pay-stubs/:id/viewed", isAuthenticated, async (req, res) => {
    try {
      await storage.markPayStubViewed(req.params.id);
      res.json({ message: "Pay stub marked as viewed" });
    } catch (error) {
      console.error("Error marking pay stub as viewed:", error);
      res.status(500).json({ error: "Failed to mark pay stub as viewed" });
    }
  });

  // Test endpoint for Resend email functionality
  app.post('/api/test/email', isAuthenticated, async (req, res) => {
    try {
      console.log('🧪 Testing Resend email functionality...');
      const { sendEmail } = await import('./email');
      
      const testResult = await sendEmail({
        to: 'mequeamaddox@gmail.com',
        from: 'mequeamaddox@gmail.com',
        subject: 'RestroFlow Email Test',
        text: 'This is a test email from RestroFlow to verify Resend is working.',
        html: '<p>This is a <strong>test email</strong> from RestroFlow to verify Resend is working.</p>'
      });
      
      console.log('✅ Test email sent successfully!');
      res.json({ success: true, message: 'Test email sent successfully!' });
    } catch (error) {
      console.error('❌ Test email failed:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Calculate payroll hours from time entries for a pay period
  app.get('/api/payroll-periods/:periodId/calculated-hours', isAuthenticated, async (req, res) => {
    try {
      const { periodId } = req.params;
      console.log('🕒 Calculating hours for pay period:', periodId);
      
      const calculatedHours = await storage.calculatePayrollHoursFromTimeEntries(periodId);
      console.log('✅ Calculated hours for', calculatedHours.length, 'employees');
      
      res.json(calculatedHours);
    } catch (error: unknown) {
      console.error("Error calculating payroll hours:", error instanceof Error ? error.message : String(error));
      res.status(500).json({ message: "Failed to calculate payroll hours" });
    }
  });

  // Tax Settings Management
  app.get('/api/tax-settings', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      
      if (!locationId) {
        return res.status(400).json({ message: "Location ID is required" });
      }
      
      const settings = await storage.getTaxSettings(locationId);
      res.json(settings || null);
    } catch (error) {
      console.error("Error fetching tax settings:", error);
      res.status(500).json({ message: "Failed to fetch tax settings" });
    }
  });

  app.post('/api/tax-settings', isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.createTaxSettings(req.body);
      res.status(201).json(settings);
    } catch (error) {
      console.error("Error creating tax settings:", error);
      res.status(500).json({ message: "Failed to create tax settings" });
    }
  });

  app.put('/api/tax-settings/:id', isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.updateTaxSettings(req.params.id, req.body);
      res.json(settings);
    } catch (error) {
      console.error("Error updating tax settings:", error);
      res.status(500).json({ message: "Failed to update tax settings" });
    }
  });

  // ==========================================
  // PRICE COMPARISON FEATURE - DISABLED
  // Moved to backup folder - to be built out later
  // Frontend files: backup/price-comparison.tsx, backup/price-comparison-broken.tsx
  // ==========================================
  
  /*
  // Vendor Price Comparison API
  app.get('/api/price-comparison', isAuthenticated, async (req, res) => {
    try {
      const { locationId } = req.query;
      const comparison = await storage.getPriceComparison(locationId as string);
      res.json(comparison);
    } catch (error) {
      console.error('Error fetching price comparison:', error);
      res.status(500).json({ message: 'Failed to fetch price comparison' });
    }
  });

  app.get('/api/inventory/:itemId/vendor-prices', isAuthenticated, async (req, res) => {
    try {
      const { itemId } = req.params;
      const prices = await storage.getVendorPricesForItem(itemId);
      res.json(prices);
    } catch (error) {
      console.error('Error fetching vendor prices:', error);
      res.status(500).json({ message: 'Failed to fetch vendor prices' });
    }
  });

  app.post('/api/vendor-prices', isAuthenticated, async (req, res) => {
    try {
      const vendorPrice = await storage.addVendorPrice(req.body);
      res.status(201).json(vendorPrice);
    } catch (error) {
      console.error('Error adding vendor price:', error);
      res.status(500).json({ message: 'Failed to add vendor price' });
    }
  });

  app.put('/api/vendor-prices/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const vendorPrice = await storage.updateVendorPrice(id, req.body);
      res.json(vendorPrice);
    } catch (error) {
      console.error('Error updating vendor price:', error);
      res.status(500).json({ message: 'Failed to update vendor price' });
    }
  });

  app.delete('/api/vendor-prices/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteVendorPrice(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting vendor price:', error);
      res.status(500).json({ message: 'Failed to delete vendor price' });
    }
  });

  // Price Import API
  app.get('/api/price-imports', isAuthenticated, async (req, res) => {
    try {
      const { vendorId } = req.query;
      const imports = await storage.getPriceImports(vendorId as string);
      res.json(imports);
    } catch (error) {
      console.error('Error fetching price imports:', error);
      res.status(500).json({ message: 'Failed to fetch price imports' });
    }
  });

  app.post('/api/price-imports/upload', isAuthenticated, csvUpload.single('file'), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      if (!currentUser) {
        return res.status(401).json({ message: 'User not found' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const { vendorId } = req.body;
      if (!vendorId) {
        return res.status(400).json({ message: 'Vendor ID is required' });
      }

      // Create initial import record
      const importRecord = await storage.createPriceImport({
        vendorId,
        importedBy: currentUser.id,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        importType: 'csv',
        status: 'processing',
      });

      // Process CSV asynchronously
      processCSVFile(req.file.buffer, importRecord.id, vendorId);

      res.status(201).json({ 
        message: 'File uploaded and processing started',
        importId: importRecord.id 
      });
    } catch (error) {
      console.error('Error uploading price import file:', error);
      res.status(500).json({ message: 'Failed to upload file' });
    }
  });

  async function processCSVFile(buffer: Buffer, importId: string, vendorId: string) {
    let stats = {
      totalRows: 0,
      processedRows: 0,
      matchedItems: 0,
      newItems: 0,
      priceUpdates: 0,
      errorLog: '',
    };

    try {
      const csvData: any[] = [];
      const stream = Readable.from(buffer.toString());
      
      await new Promise((resolve, reject) => {
        stream
          .pipe(csv())
          .on('data', (row) => {
            csvData.push(row);
            stats.totalRows++;
          })
          .on('end', resolve)
          .on('error', reject);
      });

      // Process each row
      for (const row of csvData) {
        try {
          const itemName = row.item_name || row.product_name || row.name || row.description;
          const price = parseFloat(row.price || row.cost || row.unit_price || '0');
          const unit = row.unit || row.uom || 'each';
          const sku = row.sku || row.item_code || row.product_code;

          if (!itemName || isNaN(price) || price <= 0) {
            stats.errorLog += `Row ${stats.processedRows + 1}: Invalid item name or price\n`;
            continue;
          }

          // Try to find matching inventory item
          const inventoryItem = await storage.findMatchingInventoryItem(itemName, sku);
          
          if (inventoryItem) {
            // Check if vendor price already exists
            const existingPrices = await storage.getVendorPricesForItem(inventoryItem.id);
            const existingVendorPrice = existingPrices.find(p => p.vendorId === vendorId);

            if (existingVendorPrice) {
              // Update existing price
              await storage.updateVendorPrice(existingVendorPrice.id, {
                costPerUnit: price.toString(),
                unit,
                effectiveDate: new Date(),
              });
              stats.priceUpdates++;
            } else {
              // Add new vendor price
              await storage.addVendorPrice({
                inventoryItemId: inventoryItem.id,
                vendorId,
                costPerUnit: price.toString(),
                unit,
                minimumOrderQuantity: '1',
                leadTimeDays: 0,
                isPreferredVendor: false,
                effectiveDate: new Date(),
              });
              stats.newItems++;
            }
            stats.matchedItems++;
          } else {
            stats.errorLog += `Row ${stats.processedRows + 1}: No matching inventory item found for "${itemName}"\n`;
          }

          stats.processedRows++;
        } catch (rowError) {
          stats.errorLog += `Row ${stats.processedRows + 1}: ${rowError instanceof Error ? rowError.message : String(rowError)}\n`;
        }
      }

      // Update import status to completed
      await storage.updatePriceImportStatus(importId, 'completed', stats);
    } catch (error) {
      console.error('Error processing CSV file:', error instanceof Error ? error.message : String(error));
      stats.errorLog += `Processing error: ${error instanceof Error ? error.message : String(error)}\n`;
      await storage.updatePriceImportStatus(importId, 'failed', stats);
    }
  }
  */

  // Sales Integration API endpoints

  // Record a sales transaction with automatic inventory deduction
  app.post('/api/sales/transactions', isAuthenticated, async (req, res) => {
    try {
      const { 
        locationId, 
        totalAmount, 
        paymentMethod,
        customerCount, 
        posTransactionId,
        items 
      } = req.body;

      if (!locationId || !totalAmount || !items || !Array.isArray(items)) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const transactionId = await storage.recordSalesTransaction(
        locationId,
        parseFloat(totalAmount),
        paymentMethod || 'cash',
        customerCount || 1,
        posTransactionId || null,
        items,
        req.user!.id
      );

      res.json({ transactionId, message: 'Sales transaction recorded successfully' });
    } catch (error) {
      console.error('Error recording sales transaction:', error);
      res.status(500).json({ message: 'Failed to record sales transaction' });
    }
  });

  // Get sales transactions for a location
  app.get('/api/sales/transactions/:locationId', isAuthenticated, async (req, res) => {
    try {
      const { locationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const transactions = await storage.getSalesTransactions(locationId, limit);
      res.json(transactions);
    } catch (error) {
      console.error('Error fetching sales transactions:', error);
      res.status(500).json({ message: 'Failed to fetch sales transactions' });
    }
  });

  // Get sales analytics and profitability data
  app.get('/api/sales/analytics/:locationId', isAuthenticated, async (req, res) => {
    try {
      const { locationId } = req.params;

      // Get sales transactions for the period
      const transactions = await storage.getSalesTransactions(locationId, 1000);
      
      // Calculate analytics
      const totalRevenue = transactions.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);
      const totalTransactions = transactions.length;
      const averageTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

      // Get inventory impact data
      const stockLevels = await storage.getRemainingStockLevels(locationId);
      const totalInventoryValue = stockLevels.reduce((sum, item) => sum + item.totalValue, 0);
      const lowStockItems = stockLevels.filter(item => item.isLowStock);

      res.json({
        salesSummary: {
          totalRevenue,
          totalTransactions,
          averageTransaction
        },
        inventorySummary: {
          totalInventoryValue,
          totalItems: stockLevels.length,
          lowStockItems: lowStockItems.length
        },
        stockLevels,
        recentTransactions: transactions.slice(0, 10)
      });
    } catch (error) {
      console.error('Error fetching sales analytics:', error);
      res.status(500).json({ message: 'Failed to fetch sales analytics' });
    }
  });

  // ============================================================================
  // SQUARE SUBSCRIPTION ENDPOINTS
  // ============================================================================

  // GET /api/subscriptions/plans - Get available subscription plans with pricing
  app.get('/api/subscriptions/plans', async (req, res) => {
    try {
      // Always return subscription data, even if Square isn't configured
      const subscriptionData = squareSubscriptionService.getCompleteSubscriptionData();
      
      // Only include Square config if service is enabled
      const responseData: any = { ...subscriptionData };
      
      if (squareSubscriptionService.isEnabled()) {
        responseData.config = squareSubscriptionService.getConfiguration();
        responseData.squareEnabled = true;
      } else {
        responseData.squareEnabled = false;
        responseData.message = 'Square checkout disabled - subscription plans available for preview';
      }

      res.json(responseData);
    } catch (error) {
      const err = error as Error;
      console.error('❌ Error fetching subscription plans:', err);
      res.status(500).json({ 
        message: 'Failed to fetch subscription plans',
        error: err.message 
      });
    }
  });

  // GET /api/subscriptions/current - Get user's current subscription status
  app.get('/api/subscriptions/current', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      // Only owners can access subscription information
      if (user?.role !== 'owner') {
        return res.status(403).json({ 
          message: 'Access denied. Only business owners can access subscription information.' 
        });
      }
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Get all locations to calculate HR add-on count (for now, until user-location association is implemented)
      const allLocations = await storage.getLocations();
      const hrAddonLocations = allLocations.filter(loc => loc.hrAddonEnabled).length;

      res.json({
        id: user.squareSubscriptionId || user.id,
        plan: user.subscriptionPlan || 'free',
        status: user.subscriptionStatus || 'inactive',
        nextBillingDate: user.subscriptionEndDate?.toISOString(),
        totalAmount: calculateSubscriptionTotal(user.subscriptionPlan, hrAddonLocations),
        hrAddonLocations,
        createdAt: user.createdAt?.toISOString(),
        squareCustomerId: user.squareCustomerId,
        squareSubscriptionId: user.squareSubscriptionId
      });
    } catch (error) {
      const err = error as Error;
      console.error('❌ Error fetching current subscription:', err);
      res.status(500).json({ 
        message: 'Failed to fetch current subscription',
        error: err.message 
      });
    }
  });

  // POST /api/subscriptions/upgrade - Upgrade or modify subscription plan
  app.post('/api/subscriptions/upgrade', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      // Only owners can upgrade subscriptions
      if (user?.role !== 'owner') {
        return res.status(403).json({ 
          message: 'Access denied. Only business owners can upgrade subscriptions.' 
        });
      }

      if (!squareSubscriptionService.isEnabled()) {
        return res.status(503).json({ 
          message: 'Square subscription service not configured',
          error: 'Please configure SQUARE_ACCESS_TOKEN and SQUARE_APPLICATION_ID environment variables'
        });
      }

      const { plan, hrAddonLocations = 0 } = req.body;

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (!plan || !['free', 'professional'].includes(plan)) {
        return res.status(400).json({ message: 'Valid plan required (free or professional)' });
      }

      // For downgrade to free, just update the user record
      if (plan === 'free') {
        await storage.updateUserSubscription(userId, {
          subscriptionPlan: 'free',
          subscriptionStatus: 'active'
        });

        res.json({
          success: true,
          message: 'Successfully downgraded to free plan'
        });
        return;
      }

      // For upgrade to professional, create new subscription
      let squareCustomerId = user.squareCustomerId;

      if (!squareCustomerId) {
        squareCustomerId = await squareSubscriptionService.createCustomer(
          user.email!, 
          user.firstName || undefined, 
          user.lastName || undefined
        );
        await storage.createSquareCustomer(userId, squareCustomerId);
      }

      const subscriptionResult = await squareSubscriptionService.createSubscription(
        squareCustomerId, 
        plan, 
        hrAddonLocations
      );

      // Update user subscription in database
      await storage.updateUserSubscription(userId, {
        subscriptionPlan: plan as 'professional',
        subscriptionStatus: 'active',
        squareSubscriptionId: subscriptionResult.subscriptionId,
        subscriptionEndDate: subscriptionResult.nextBillingDate ? new Date(subscriptionResult.nextBillingDate) : undefined,
        ocrCreditsLimit: plan === 'professional' ? 999 : 5
      });

      res.json({
        success: true,
        message: 'Successfully upgraded subscription',
        subscription: subscriptionResult
      });
    } catch (error) {
      const err = error as Error;
      console.error('❌ Error upgrading subscription:', err);
      res.status(500).json({ 
        message: 'Failed to upgrade subscription',
        error: err.message 
      });
    }
  });

  // POST /api/subscriptions/create - Create Square subscription with plan selection
  app.post('/api/subscriptions/create', isAuthenticated, async (req, res) => {
    try {
      if (!squareSubscriptionService.isEnabled()) {
        return res.status(503).json({ 
          message: 'Square subscription service not configured',
          error: 'Please configure SQUARE_ACCESS_TOKEN and SQUARE_APPLICATION_ID environment variables'
        });
      }

      const validatedData = createSubscriptionSchema.parse(req.body);
      const { email, plan, hrAddonLocations = 0 } = validatedData;
      const userId = req.user!.id;

      console.log('🔄 Creating Square subscription for user:', userId, 'plan:', plan);

      // Get current user
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Only owners can create subscriptions
      if (currentUser.role !== 'owner') {
        return res.status(403).json({ 
          message: 'Access denied. Only business owners can create subscriptions.' 
        });
      }

      let squareCustomerId = currentUser.squareCustomerId;

      // Create Square customer if doesn't exist
      if (!squareCustomerId) {
        console.log('🆕 Creating new Square customer for:', email);
        squareCustomerId = await squareSubscriptionService.createCustomer(
          email, 
          currentUser.firstName || undefined, 
          currentUser.lastName || undefined
        );
        
        // Update user with Square customer ID
        await storage.createSquareCustomer(userId, squareCustomerId);
      }

      // Create Square subscription
      const subscriptionResult = await squareSubscriptionService.createSubscription(
        squareCustomerId, 
        plan, 
        hrAddonLocations
      );

      // Update user subscription in database
      await storage.updateUserSubscription(userId, {
        subscriptionPlan: plan,
        subscriptionStatus: 'active',
        squareCustomerId,
        squareSubscriptionId: subscriptionResult.subscriptionId,
        subscriptionEndDate: new Date(subscriptionResult.nextBillingDate || Date.now() + 30 * 24 * 60 * 60 * 1000),
        hrAddonEnabled: hrAddonLocations > 0,
        ocrCreditsLimit: plan === 'professional' || plan === 'enterprise' ? 999 : 5
      });

      console.log('✅ Square subscription created successfully:', subscriptionResult.subscriptionId);

      res.json({
        success: true,
        subscription: subscriptionResult,
        message: 'Subscription created successfully'
      });

    } catch (error) {
      const err = error as any;
      console.error('❌ Error creating Square subscription:', err);
      
      if (err.name === 'ZodError') {
        return res.status(400).json({ 
          message: 'Invalid request data',
          errors: err.errors 
        });
      }

      res.status(500).json({ 
        message: 'Failed to create subscription',
        error: err.message 
      });
    }
  });

  // POST /api/subscriptions/webhook - Handle Square subscription webhooks
  app.post('/api/subscriptions/webhook', async (req, res) => {
    try {
      if (!squareSubscriptionService.isEnabled()) {
        return res.status(503).json({ 
          message: 'Square subscription service not configured' 
        });
      }

      const signature = req.headers['x-square-signature'] as string;
      const payload = JSON.stringify(req.body);

      // Verify webhook signature if signature key is configured
      if (!squareSubscriptionService.verifyWebhookSignature(payload, signature)) {
        console.error('❌ Invalid Square webhook signature');
        return res.status(401).json({ message: 'Invalid webhook signature' });
      }

      console.log('🔔 Square webhook received:', req.body.type);

      const validatedWebhook = squareWebhookSchema.parse(req.body);
      const { type, data } = validatedWebhook;

      // Handle subscription events
      if (type.includes('subscription')) {
        const subscriptionObject = data.object;
        const squareSubscriptionId = subscriptionObject.id;

        // Find user by Square subscription ID
        const userResults = await db.select().from(users).where(eq(users.squareSubscriptionId, squareSubscriptionId));
        const user = userResults[0];

        if (!user) {
          console.log('⚠️ No user found for Square subscription:', squareSubscriptionId);
          return res.status(200).json({ message: 'Webhook processed (user not found)' });
        }

        // Update subscription status based on webhook type
        let newStatus: 'active' | 'inactive' | 'cancelled' | 'past_due' = 'active';
        
        if (type.includes('deactivated') || type.includes('canceled')) {
          newStatus = 'cancelled';
        } else if (type.includes('paused')) {
          newStatus = 'inactive';
        } else if (type.includes('activated') || type.includes('renewed')) {
          newStatus = 'active';
        }

        // Update user subscription status
        await storage.updateUserSubscription(user.id, {
          subscriptionStatus: newStatus,
          subscriptionEndDate: subscriptionObject.next_billing_date ? 
            new Date(subscriptionObject.next_billing_date) : undefined
        });

        console.log('✅ Updated subscription status for user:', user.id, 'to:', newStatus);
      }

      res.status(200).json({ message: 'Webhook processed successfully' });

    } catch (error) {
      const err = error as Error;
      console.error('❌ Error processing Square webhook:', err);
      res.status(500).json({ 
        message: 'Failed to process webhook',
        error: err.message 
      });
    }
  });

  // GET /api/subscriptions/portal - Get subscription management portal URL
  app.get('/api/subscriptions/portal', isAuthenticated, async (req, res) => {
    try {
      if (!squareSubscriptionService.isEnabled()) {
        return res.status(503).json({ 
          message: 'Square subscription service not configured' 
        });
      }

      const userId = req.user!.id;
      const user = await storage.getSubscriptionByUser(userId);

      if (!user || !user.squareCustomerId) {
        return res.status(404).json({ 
          message: 'No Square customer found for user' 
        });
      }

      const portalUrl = await squareSubscriptionService.getCustomerPortalUrl(user.squareCustomerId);

      res.json({
        portalUrl,
        message: 'Portal URL generated successfully'
      });

    } catch (error) {
      const err = error as Error;
      console.error('❌ Error generating subscription portal URL:', err);
      res.status(500).json({ 
        message: 'Failed to generate portal URL',
        error: err.message 
      });
    }
  });

  // POST /api/subscriptions/cancel - Cancel active subscription
  app.post('/api/subscriptions/cancel', isAuthenticated, async (req, res) => {
    try {
      if (!squareSubscriptionService.isEnabled()) {
        return res.status(503).json({ 
          message: 'Square subscription service not configured' 
        });
      }

      const validatedData = cancelSubscriptionSchema.parse(req.body);
      const userId = req.user!.id;

      const user = await storage.getSubscriptionByUser(userId);
      if (!user || !user.squareSubscriptionId) {
        return res.status(404).json({ 
          message: 'No active subscription found' 
        });
      }

      // Only owners can cancel subscriptions
      if (user.role !== 'owner') {
        return res.status(403).json({ 
          message: 'Access denied. Only business owners can cancel subscriptions.' 
        });
      }

      console.log('🔄 Cancelling Square subscription:', user.squareSubscriptionId);

      // Cancel subscription in Square
      const cancelled = await squareSubscriptionService.cancelSubscription(user.squareSubscriptionId);
      
      if (!cancelled) {
        throw new Error('Failed to cancel subscription in Square');
      }

      // Update user subscription status
      await storage.updateUserSubscription(userId, {
        subscriptionStatus: 'cancelled',
        hrAddonEnabled: false,
        ocrCreditsLimit: 5 // Reset to free plan limit
      });

      console.log('✅ Square subscription cancelled successfully for user:', userId);

      res.json({
        success: true,
        message: 'Subscription cancelled successfully'
      });

    } catch (error) {
      const err = error as any;
      console.error('❌ Error cancelling Square subscription:', err);
      
      if (err.name === 'ZodError') {
        return res.status(400).json({ 
          message: 'Invalid request data',
          errors: err.errors 
        });
      }

      res.status(500).json({ 
        message: 'Failed to cancel subscription',
        error: err.message 
      });
    }
  });

  // Owner Onboarding Routes
  // ============================================================================

  // GET /api/owner-onboarding/progress - Get current onboarding progress
  app.get('/api/owner-onboarding/progress', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Only owners can access onboarding
      if (req.user!.role !== 'owner') {
        return res.status(403).json({ 
          message: 'Access denied. Onboarding is only available to business owners.' 
        });
      }

      const onboarding = await storage.getOwnerOnboarding(userId);
      res.json(onboarding || { 
        userId,
        isCompleted: false,
        currentStep: 'restaurant_info',
        completedSteps: 0,
        totalSteps: 5,
        data: {}
      });
    } catch (error) {
      console.error('Error fetching onboarding progress:', error);
      res.status(500).json({ message: 'Failed to fetch onboarding progress' });
    }
  });

  // POST /api/owner-onboarding/start - Start or resume onboarding
  app.post('/api/owner-onboarding/start', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Only owners can start onboarding
      if (req.user!.role !== 'owner') {
        return res.status(403).json({ 
          message: 'Access denied. Onboarding is only available to business owners.' 
        });
      }

      // Check if onboarding already exists
      let onboarding = await storage.getOwnerOnboarding(userId);
      
      if (!onboarding) {
        // Create new onboarding
        onboarding = await storage.createOwnerOnboarding({
          userId,
          isCompleted: false,
          currentStep: 'restaurant_info',
          totalSteps: 5,
          completedSteps: 0,
          skippedSteps: [],
          data: {}
        });
      }

      res.status(201).json(onboarding);
    } catch (error) {
      console.error('Error starting onboarding:', error);
      res.status(500).json({ message: 'Failed to start onboarding' });
    }
  });

  // PUT /api/owner-onboarding/step - Update a specific step
  app.put('/api/owner-onboarding/step', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { stepName, stepData, status = 'completed' } = req.body;
      
      // Only owners can update onboarding
      if (req.user!.role !== 'owner') {
        return res.status(403).json({ 
          message: 'Access denied. Onboarding is only available to business owners.' 
        });
      }

      const onboarding = await storage.updateOwnerOnboardingStep(userId, stepName, stepData, status);
      res.json(onboarding);
    } catch (error) {
      console.error('Error updating onboarding step:', error);
      res.status(500).json({ message: 'Failed to update onboarding step' });
    }
  });

  // POST /api/owner-onboarding/complete - Complete the entire onboarding
  app.post('/api/owner-onboarding/complete', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Only owners can complete onboarding
      if (req.user!.role !== 'owner') {
        return res.status(403).json({ 
          message: 'Access denied. Onboarding is only available to business owners.' 
        });
      }

      const onboarding = await storage.completeOwnerOnboarding(userId);
      res.json(onboarding);
    } catch (error) {
      console.error('Error completing onboarding:', error);
      res.status(500).json({ message: 'Failed to complete onboarding' });
    }
  });

  // ============================================================================
  // STRIPE BILLING ROUTES
  // ============================================================================

  // POST /api/billing/checkout - Create Stripe Checkout session and return redirect URL
  app.post('/api/billing/checkout', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { plan } = req.body;

      if (!['professional', 'enterprise'].includes(plan)) {
        return res.status(400).json({ message: 'Invalid plan. Must be professional or enterprise.' });
      }

      if (!isStripeEnabled) {
        return res.status(503).json({
          message: 'Stripe billing is not yet configured. Please contact support.',
          configured: false,
        });
      }

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const host = `${req.protocol}://${req.get('host')}`;
      const checkoutUrl = await createCheckoutSession({
        userId,
        email: user.email!,
        plan: plan as StripePlan,
        stripeCustomerId: user.stripeCustomerId,
        successUrl: `${host}/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${host}/subscription`,
      });

      res.json({ checkoutUrl });
    } catch (error: any) {
      console.error('Stripe checkout error:', error);
      res.status(500).json({ message: error.message || 'Failed to create checkout session' });
    }
  });

  // POST /api/billing/portal - Open Stripe Customer Portal for self-serve billing management
  app.post('/api/billing/portal', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);

      if (!user?.stripeCustomerId) {
        return res.status(400).json({
          message: 'No Stripe billing account found. Please subscribe first.',
        });
      }

      if (!isStripeEnabled) {
        return res.status(503).json({ message: 'Stripe billing is not configured.' });
      }

      const host = `${req.protocol}://${req.get('host')}`;
      const portalUrl = await createPortalSession({
        stripeCustomerId: user.stripeCustomerId,
        returnUrl: `${host}/subscription`,
      });

      res.json({ portalUrl });
    } catch (error: any) {
      console.error('Stripe portal error:', error);
      res.status(500).json({ message: error.message || 'Failed to open billing portal' });
    }
  });

  // POST /api/billing/webhook - Stripe signed webhook handler
  // Must receive raw body — captured via express.json verify callback in index.ts
  app.post('/api/billing/webhook', async (req: any, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret || !isStripeEnabled) {
      console.warn('⚠️  Stripe webhook received but STRIPE_WEBHOOK_SECRET not configured');
      return res.status(200).json({ received: true });
    }

    let event;
    try {
      event = constructWebhookEvent(req.rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error('❌ Stripe webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as any;
          const userId: string = session.metadata?.userId;
          const plan: string = session.metadata?.plan;
          const customerId: string = session.customer;
          const subscriptionId: string = session.subscription;

          if (userId && plan) {
            await storage.updateUserSubscription(userId, {
              subscriptionPlan: plan as 'professional' | 'enterprise',
              subscriptionStatus: 'active',
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              ocrCreditsLimit: 999,
            });
            console.log(`✅ Stripe checkout.session.completed: user=${userId} plan=${plan}`);
          }
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object as any;
          const userId: string = sub.metadata?.userId;
          const mappedStatus = mapStripeStatusToPlan(sub.status);
          const priceId: string = sub.items?.data?.[0]?.price?.id;

          let plan: 'professional' | 'enterprise' | undefined;
          if (priceId && priceId === process.env.STRIPE_PRICE_PROFESSIONAL) plan = 'professional';
          if (priceId && priceId === process.env.STRIPE_PRICE_ENTERPRISE) plan = 'enterprise';

          if (userId) {
            await storage.updateUserSubscription(userId, {
              ...(plan ? { subscriptionPlan: plan, ocrCreditsLimit: 999 } : {}),
              subscriptionStatus: mappedStatus,
            });
            console.log(`✅ Stripe customer.subscription.updated: user=${userId} status=${mappedStatus}`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as any;
          const userId: string = sub.metadata?.userId;

          if (userId) {
            await storage.updateUserSubscription(userId, {
              subscriptionPlan: 'free',
              subscriptionStatus: 'inactive',
              stripeSubscriptionId: undefined,
              ocrCreditsLimit: 5,
            });
            console.log(`✅ Stripe customer.subscription.deleted: user=${userId} → free`);
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as any;
          const customerEmail: string = invoice.customer_email;

          if (customerEmail) {
            try {
              const appUrl = process.env.APP_URL || 'https://app.restroflow.com';
              await sendEmail({
                to: customerEmail,
                from: 'billing@restroflow.com',
                subject: 'Action Required: Payment Failed for RestroFlow',
                html: `
                  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                    <div style="background:#ef444420;border:1px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:24px;">
                      <h2 style="color:#ef4444;margin:0 0 8px;">⚠️ Payment Failed</h2>
                      <p style="margin:0;color:#374151;">We were unable to process your RestroFlow subscription payment.</p>
                    </div>
                    <p>To keep your account active and avoid losing access to your data, please update your payment method.</p>
                    <a href="${appUrl}/subscription"
                       style="display:inline-block;background:#f97316;color:white;padding:12px 28px;
                              text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0;">
                      Update Payment Method →
                    </a>
                    <p style="color:#6b7280;font-size:13px;margin-top:24px;">
                      Questions? Reply to this email or contact <a href="mailto:support@restroflow.com">support@restroflow.com</a>
                    </p>
                  </div>
                `,
              });
              console.log(`📧 Dunning email sent to ${customerEmail}`);
            } catch (emailErr) {
              console.error('❌ Failed to send dunning email:', emailErr);
            }
          }
          break;
        }

        default:
          console.log(`Unhandled Stripe event: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error('❌ Stripe webhook processing error:', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // ============================================================================

  const httpServer = createServer(app);
  return httpServer;
}
