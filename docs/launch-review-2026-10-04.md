# RestroFlow launch review — October 4, 2026

Decision: do not open general customer onboarding yet. Owner sign-in and restaurant switching work on the user's rebuilt Android app, but the code review identified functional and authorization blockers. Stripe and mobile two-step verification are excluded at the user's direction.

## Verified

- User confirmed Android sign-in, restaurant loading, and switching.
- Public production homepage returned HTTP 200.
- `/health` returned HTTP 200 with `status: ok` (includes a database SELECT).
- Anonymous locations, inventory, and platform-user requests returned HTTP 401.
- Backend/web TypeScript, mobile TypeScript, production web/server build, and Android JavaScript export passed.
- Automated suite: 39 tests passed. These include mocked route/transaction adapters, not a live PostgreSQL or signed-in production test.
- Reviewed route registrations and key paths for inventory, purchasing, waste, recipes, invoice upload/approval, object access, analytics, staff invitations, HR/documents, subscriptions, POS, bar features, mobile networking/session handling, and all current mobile screens. This is a targeted code review, not proof that every UI control or external integration works.

## Implemented in this change

- Mobile Inventory has an Add button and a single-item form.
- Unknown inventory scans offer Add Item with the scanned barcode prefilled.
- Form includes item name, unit, starting quantity, cost per unit, reorder level, barcode, optional category, and optional vendor.
- Uses the currently selected restaurant. Failed saves retain the draft, and pending saves disable submission/inputs.
- Single-unit defaults keep purchase/recipe units and unit costs consistent.
- UPC-A and zero-prefixed EAN-13 compare equivalently. Immediate scanner callback lock prevents repeated alerts.
- Fresh inventory is checked before saving a scanned duplicate; this is a client check, not a database uniqueness constraint.
- API single-item creation rejects malformed/negative amounts and category/vendor links belonging to another restaurant.
- No new dependencies or database migration. New APK required; installed APK has no configured OTA update delivery.

## Unresolved launch blockers

### 1. Restaurant isolation on writes — high priority

`server/routes/inventory.ts` purchase-order-item DELETE verifies the caller's query location, then removes a line by ID without deriving its actual purchase order/location. An authorized location parameter must not authorize a record from another restaurant.

Inventory, vendor, recipe, and POS-integration updates check the existing location but accept a replacement location in the parsed payload without checking it. Linked inventory IDs in recipes, purchase-order lines, and waste need validation against the record's restaurant too.

`requireLocationAccess` selects query parameters before the body; routes using that middleware and then writing `req.body.locationId` can authorize one restaurant and write to a different one. The invoice upload route independently checks its saved location, but generic POST routes need the same consistency.

These are code findings; no destructive or unauthorized request was sent to production.

### 2. Staff onboarding and access — high priority

Invitation acceptance creates a Clerk account/user and attempts an employee record, but does not create an active `user_permissions` restaurant assignment. It also swallows employee-record failure and marks the invitation accepted.

`GET /api/locations` only queries locations owned by the current user; an invited employee does not own the restaurant and cannot select their assigned restaurant through this path.

`requirePlan` checks the employee's personal subscription instead of the assigned restaurant owner's subscription. Staff should inherit the restaurant's entitlement.

`getUserPermissions` returns raw SQL snake_case keys (`location_id`, `is_active`), while `assertLocationAccess` expects camelCase (`locationId`, `isActive`). Map these fields explicitly.

Permission checks on administrative mutations also need review: restaurant membership alone should not allow staff to change location ownership/settings or invite roles above their authority.

### 3. Waste does not reduce current inventory — high priority

`POST /api/waste` inserts a waste record and an out transaction, but neither called storage method decrements `inventory_items.quantity`. Inventory screens and low-stock/value calculations read that quantity directly, so logging waste leaves current stock overstated. Waste record, stock decrement, and audit entry should commit together after validating the item/location and quantity/unit.

### 4. Invoice approval does not receive inventory — product blocker if promised

The upload path stores OCR results. Approval calls `updateInvoice`, which updates the invoice fields/status only. It does not map received line items into stock or supplier pricing. Invoice approval must be connected to an explicit receiving/import workflow before promising automatic inventory updates from invoices. It must be idempotent to prevent duplicate receiving.

### 5. POS readiness depends on provider — limited support

The generic sync method logs unsupported providers without throwing, which can let a route report successful syncing without importing anything. Do not advertise all listed providers as verified. Real provider credentials/webhooks and reconciliation remain untested. Scheduler enablement (`ENABLE_SCHEDULERS=true`) cannot be confirmed from this workspace.

## Additional improvements

- Inventory manual edits need strict numeric validation and a stock-adjustment audit entry; currently they directly replace quantity.
- Purchase-order lines can still be edited after delivery; enforce order-state rules and consistent transaction locking.
- Some stock/audit writes outside purchase-order receiving are separate operations and can partially succeed.
- Invitation acceptance needs a recoverable path for already-existing Clerk accounts and partial failures.
- Production frontend bundle is approximately 2 MB before gzip (650 KB gzipped); split heavy report/PDF modules as a performance improvement.
- Backups/restore, production secrets and object storage, delivery of invitation emails, real OCR accuracy, real POS sync, and staff-role behavior remain unverified. No account changes, invoices, payments, or stock were created in production during this review.

## On-device acceptance test for the new build

1. Select restaurant A and tap Inventory → Add. Save one item with a recognizable name, unit `each`, quantity `2`, and unit cost `3.50`.
2. Confirm it appears in restaurant A on both app and website, with quantity 2 and cost 3.50.
3. Scan its barcode: open that existing item rather than offering another addition.
4. Scan an unknown barcode: choose Add Item, confirm the barcode is filled in, and enter the details. Cancel once to confirm cancellation creates nothing, then save.
5. Switch to restaurant B: the new items must not appear there.
6. Try a failed save/offline save: retain the draft, show an error, and allow retry. Confirm invalid quantities cannot be saved.
7. Test waste, staff invitations, invoice receiving, and forbidden cross-restaurant access after their blockers are fixed.
