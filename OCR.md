# OCR Invoice Processing

Vendor invoices (PDF/image) are uploaded, run through OCR, parsed into line items, and
stored so they can feed inventory and cost tracking. Usage is metered by subscription
credits (see [BILLING](BILLING.md)).

## Files

| File | Responsibility |
|------|----------------|
| `server/routes/invoices.ts` | Upload endpoint, sanitization, persistence |
| `server/ocrService.ts` | The OCR pipeline (`OCRService`) |
| `server/storage.ts` | Credit accounting + invoice persistence |
| `client/src/components/subscription/upgrade-prompt.tsx` | "OCR credits exhausted" UI |

## Upload

- **Route:** `POST /api/invoices/upload`.
- **Handling:** `multer` (`upload.single('invoice')`) for multipart uploads.
- **File storage:** `ObjectStorageService` (AWS S3 / Replit Object Storage); falls back
  to local disk at `uploads/invoices/` when object storage is unavailable.

## OCR pipeline (`server/ocrService.ts`)

The pipeline tries the cheapest/most accurate path first and falls back:

1. **Direct text extraction** — `OCRService.extractTextFromPDF` uses `pdf-parse` for
   PDFs that already contain a text layer.
2. **AWS Textract** — for scanned/image PDFs, `AnalyzeDocumentCommand` with
   `FeatureTypes: ['FORMS', 'TABLES']`.
3. **Tesseract.js fallback** — if Textract is unavailable or low-confidence,
   `pdf2pic` converts pages to 300 DPI PNGs which are OCR'd with `createWorker('eng')`.

**Multi-page PDFs:** `extractTextFromScannedPDF` uses `convert.bulk(-1)` to render all
pages, then concatenates the per-page text.

## Parsing & sanitization

- **Sanitization:** raw OCR text is stripped of non-printable characters and truncated
  (~2000 chars) before storage (`invoices.ts`).
- **Parsing:** `OCRService.parseInvoiceFromText` uses regex scoring
  (`calculateLineScore`) to pull out vendor, line items, and prices, with food-service
  keyword heuristics.

## Storage

Results are written to the `invoice_processing` table (`shared/schema.ts`), including
`invoice_number`, `invoice_date`, `subtotal`, `tax`, `total`, `line_items` (JSONB),
`fees` (JSONB), and `attachment_path`.

## Credit gating

- The `users` table holds `ocr_credits_used` / `ocr_credits_limit` (default **5** on
  free, **999** on paid).
- `storage.checkOcrAccess(userId)` verifies remaining credits before processing;
  `updateOcrCreditsUsed` increments afterward; `resetOcrCredits` clears the counter.
- When exhausted, the frontend shows an upgrade prompt steering users to the
  professional plan.

## External config

OCR depends on AWS credentials (Textract + S3). If Textract/S3 are not configured the
pipeline degrades to `pdf-parse` + Tesseract where possible. Confirm AWS env vars in
the deployment environment — see [DEPLOYMENT](DEPLOYMENT.md).
