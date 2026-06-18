import type { Express } from 'express';
import { storage } from '../storage';
import { isAuthenticated, upload } from './helpers';
import { requireLocationAccess, assertLocationAccess } from '../securityMiddleware';
import { OCRService } from '../ocrService';
import { ObjectStorageService } from '../objectStorage';
import fs from 'fs';
import path from 'path';

export function registerInvoiceRoutes(app: Express): void {
  app.get('/api/invoices', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const { status, locationId } = req.query;
      const invoices = await storage.getInvoices(status as string, locationId as string);
      res.json(invoices);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      res.status(500).json({ message: 'Failed to fetch invoices' });
    }
  });

  app.post('/api/invoices', isAuthenticated, async (req, res) => {
    try {
      const invoice = await storage.createInvoice(req.body);
      res.status(201).json(invoice);
    } catch (error) {
      console.error('Error creating invoice:', error);
      res.status(400).json({ message: 'Failed to create invoice' });
    }
  });

  app.put('/api/invoices/:id/status', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const inv = await storage.getInvoiceById(id);
      if (!inv) return res.status(404).json({ message: 'Invoice not found' });
      if (!await assertLocationAccess(req, res, inv.location_id)) return;
      const invoice = await storage.updateInvoiceStatus(id, status);
      res.json(invoice);
    } catch (error) {
      console.error('Error updating invoice status:', error);
      res.status(400).json({ message: 'Failed to update invoice status' });
    }
  });

  app.delete('/api/invoices/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const inv = await storage.getInvoiceById(id);
      if (!inv) return res.status(404).json({ message: 'Invoice not found' });
      if (!await assertLocationAccess(req, res, inv.location_id)) return;
      await storage.deleteInvoice(id);
      res.json({ message: 'Invoice deleted successfully' });
    } catch (error) {
      console.error('Error deleting invoice:', error);
      res.status(400).json({ message: 'Failed to delete invoice' });
    }
  });

  app.get('/api/invoices/stats', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const { locationId } = req.query;
      const stats = await storage.getInvoiceStats(locationId as string);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching invoice stats:', error);
      res.status(500).json({ message: 'Failed to fetch invoice stats' });
    }
  });

  app.post('/api/invoices/upload', isAuthenticated, requireLocationAccess(), upload.single('invoice'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      // C5: Atomically claim one OCR credit before running OCR (eliminates race condition)
      const userId = (req as any).user!.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: 'User not found' });
      if ((user.subscriptionPlan || 'free') !== 'professional') {
        const claimed = await storage.claimOcrCredit(userId);
        if (!claimed) {
          return res.status(402).json({
            message: 'OCR credit limit reached. Upgrade to Professional for unlimited processing.',
            code: 'OCR_CREDITS_EXHAUSTED',
            upgradeUrl: '/subscription',
          });
        }
      }

      const filename = req.file.originalname.toLowerCase();
      let vendorHint = '';
      if (filename.includes('atlantic')) vendorHint = 'Atlantic Food Service Repairs';
      else if (filename.includes('inland')) vendorHint = 'Inland Foods';
      else if (filename.includes('food lion')) vendorHint = 'Food Lion';
      else if (filename.includes('c&c')) vendorHint = 'C&C Seafood';

      let ocrResult: { text: string; confidence: number };

      if (req.file.mimetype === 'application/pdf') {
        ocrResult = await OCRService.extractTextFromPDF(req.file.buffer);
      } else if (req.file.mimetype.startsWith('image/')) {
        ocrResult = await OCRService.extractTextFromImage(req.file.buffer);
      } else if (req.file.mimetype === 'text/plain') {
        const text = req.file.buffer.toString('utf-8')
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
          .trim();
        ocrResult = { text, confidence: 100 };
      } else {
        throw new Error('Unsupported file type. Please upload PDF, image, or text files.');
      }

      let filePath: string;
      const isProduction = process.env.NODE_ENV === 'production';
      try {
        const objService = new ObjectStorageService();
        filePath = await objService.uploadBuffer(req.file.buffer, req.file.mimetype, 'invoices');
      } catch (storageErr) {
        if (isProduction) {
          console.error('Object storage failed in production:', storageErr);
          return res.status(503).json({ message: 'File storage unavailable. Please try again later.', error: 'object_storage_unavailable' });
        }
        console.warn('Object storage unavailable (dev), falling back to local disk:', storageErr);
        const timestamp = Date.now();
        const sanitizedFilename = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileExtension = path.extname(sanitizedFilename);
        const baseFilename = path.basename(sanitizedFilename, fileExtension);
        const fileName = `${timestamp}_${baseFilename}${fileExtension}`;
        filePath = path.join('uploads', 'invoices', fileName);
        const uploadDir = path.dirname(filePath);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(filePath, req.file.buffer);
      }

      const locationId = req.body.locationId;
      if (!locationId) throw new Error('Location ID is required to save invoice');

      const parsedData = OCRService.parseInvoiceFromText(ocrResult.text);

      if (!parsedData.vendorName || parsedData.vendorName === 'Unknown Vendor') {
        if (vendorHint) parsedData.vendorName = vendorHint;
      }

      let vendorId = null;
      if (parsedData.vendorName && parsedData.vendorName !== 'Unknown Vendor') {
        const vendors = await storage.getVendors(locationId);
        const existingVendor = vendors.find((v: any) =>
          v.name.toLowerCase().includes(parsedData.vendorName.toLowerCase()) ||
          parsedData.vendorName.toLowerCase().includes(v.name.toLowerCase())
        );

        if (existingVendor) {
          vendorId = existingVendor.id;
          if ((parsedData.vendorPhone && !existingVendor.phone) || (parsedData.vendorAddress && !existingVendor.address)) {
            await storage.updateVendor(existingVendor.id, {
              phone: parsedData.vendorPhone || existingVendor.phone,
              address: parsedData.vendorAddress || existingVendor.address,
            });
          }
        } else {
          const newVendor = await storage.createVendor({
            name: parsedData.vendorName,
            contactPerson: null,
            email: null,
            phone: parsedData.vendorPhone || null,
            address: parsedData.vendorAddress || null,
            locationId,
          });
          vendorId = newVendor.id;
        }
      }

      const sanitizedText = ocrResult.text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
        .substring(0, 2000)
        .trim();

      const taxAmount = parsedData.total - parsedData.subtotal;
      const calculatedTax = taxAmount >= 0 ? taxAmount : 0;

      const invoiceData = {
        invoiceNumber: parsedData.invoiceNumber,
        vendorId,
        invoiceDate: parsedData.invoiceDate,
        subtotal: parsedData.subtotal.toString(),
        total: parsedData.total.toString(),
        tax: calculatedTax.toString(),
        ocrConfidence: Math.round(ocrResult.confidence),
        uploadMethod: req.body.uploadMethod || 'upload',
        status: 'pending',
        lineItems: parsedData.lineItems,
        fees: parsedData.fees,
        attachmentPath: filePath,
        originalText: sanitizedText,
        processedAt: new Date(),
        locationId,
      };

      const invoice = await storage.createInvoice(invoiceData);
      res.status(201).json({
        ...invoice,
        ocrConfidence: invoiceData.ocrConfidence,
        extractedData: parsedData,
        message: 'Invoice processed successfully with AWS Textract OCR',
      });
    } catch (error) {
      console.error('Error processing invoice upload:', error);
      res.status(500).json({ message: 'Failed to process invoice upload', error: (error as Error).message });
    }
  });

  app.get('/api/invoices/:id/attachment', isAuthenticated, async (req, res) => {
    try {
      const invoice = await storage.getInvoiceById(req.params.id);
      if (!invoice || !invoice.attachment_path) return res.status(404).json({ message: 'Invoice attachment not found' });
      if (!await assertLocationAccess(req, res, invoice.location_id)) return;

      const attachmentPath: string = invoice.attachment_path;
      if (attachmentPath.startsWith('/objects/')) {
        const objService = new ObjectStorageService();
        const objectFile = await objService.getObjectEntityFile(attachmentPath);
        return objService.downloadObject(objectFile, res);
      }

      if (!fs.existsSync(attachmentPath)) return res.status(404).json({ message: 'Attachment file not found' });
      const fileName = path.basename(attachmentPath);
      const ext = path.extname(fileName).toLowerCase();
      const contentTypes: Record<string, string> = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain' };
      res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      fs.createReadStream(attachmentPath).pipe(res);
    } catch (error) {
      console.error('Error serving invoice attachment:', error);
      res.status(500).json({ message: 'Failed to serve attachment' });
    }
  });

  app.put('/api/invoices/:id/approve', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = req.params.id;
      const inv = await storage.getInvoiceById(invoiceId);
      if (!inv) return res.status(404).json({ message: 'Invoice not found' });
      if (!await assertLocationAccess(req, res, inv.location_id)) return;
      const { invoiceNumber, invoiceDate, total, subtotal, lineItems, fees } = req.body;
      const result = await storage.updateInvoice(invoiceId, {
        invoiceNumber,
        invoiceDate,
        total: parseFloat(total || '0'),
        subtotal: parseFloat(subtotal || '0'),
        lineItems: lineItems || [],
        fees: fees || [],
        status: 'approved',
      });
      res.json({ message: 'Invoice approved successfully', invoice: result });
    } catch (error) {
      console.error('Error approving invoice:', error);
      res.status(500).json({ message: 'Failed to approve invoice' });
    }
  });
}
