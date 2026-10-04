# RestroFlow launch review — October 4, 2026

Update: the four confirmed blockers below are now fixed in code and covered by regression tests. Production acceptance checks are still required; this is not a blanket certification of every external integration. Owner sign-in and restaurant switching were confirmed by the user on Android. Stripe and mobile two-step verification are excluded at the user's direction.

## Verified

- User confirmed Android sign-in, restaurant loading, and switching.
- Public production homepage returned HTTP 200.
- `/health` returned HTTP 200 with `status: ok` (includes a database SELECT).
- Anonymous locations, inventory, and platform-user requests returned HTTP 401.
- Backend/web TypeScript, mobile TypeScript, production web/server build, and Android JavaScript export passed.
- Automated suite: 62 tests passed. These include mocked route/transaction adapters, not a live PostgreSQL or signed-in production test.
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

## Fixes applied after review

- Invitations now commit user, employee, membership, and acceptance together. Existing accounts can sign in and accept; failed local setup remains retryable. The Add Employee flow uses the same invitation path.
- Restaurant listing includes active assignments. Permission fields are mapped by Drizzle, and membership roles scope authorization. Staff inherit the owner subscription, including OCR entitlement. New migrations restore missing memberships for previously accepted invitations with employee records.
- Query/body restaurant conflicts are rejected; generic record moves, unrelated linked items, ownership changes, and order-line deletion through another restaurant are blocked. Closed order-line mutations use the order lock.
- Waste commits stock decrement, calculated cost, waste record, and audit together; invalid units, foreign items, and excess waste are rejected.
- Invoice review supports inventory mapping and creation. Approval receives stock, updates inventory/supplier costs, and saves a persistent receipt timestamp in one transaction. Repeated approvals do not receive twice. An explicit Stock already received option avoids counting stock received through a purchase order again. Received invoices cannot be reopened or deleted; status changes/deletion recheck under the invoice lock.
- Inventory initial stock and manual adjustments commit with audit entries; invalid stock amounts are rejected.
- Unsupported POS menu sync returns an error instead of reporting a successful import.
- These follow-up changes affect the backend and website. They do not add native dependencies or require a further APK rebuild beyond the earlier Add Item feature.

## Original findings and resolution

### 1. Restaurant isolation on writes — addressed

`server/routes/inventory.ts` purchase-order-item DELETE verifies the caller's query location, then removes a line by ID without deriving its actual purchase order/location. An authorized location parameter must not authorize a record from another restaurant.

Inventory, vendor, recipe, and POS-integration updates check the existing location but accept a replacement location in the parsed payload without checking it. Linked inventory IDs in recipes, purchase-order lines, and waste need validation against the record's restaurant too.

`requireLocationAccess` selects query parameters before the body; routes using that middleware and then writing `req.body.locationId` can authorize one restaurant and write to a different one. The invoice upload route independently checks its saved location, but generic POST routes need the same consistency.

These are code findings; no destructive or unauthorized request was sent to production.

### 2. Staff onboarding and access — addressed

Invitation acceptance creates a Clerk account/user and attempts an employee record, but does not create an active `user_permissions` restaurant assignment. It also swallows employee-record failure and marks the invitation accepted.

`GET /api/locations` only queries locations owned by the current user; an invited employee does not own the restaurant and cannot select their assigned restaurant through this path.

`requirePlan` checks the employee's personal subscription instead of the assigned restaurant owner's subscription. Staff should inherit the restaurant's entitlement.

`getUserPermissions` returns raw SQL snake_case keys (`location_id`, `is_active`), while `assertLocationAccess` expects camelCase (`locationId`, `isActive`). Map these fields explicitly.

Permission checks on administrative mutations also need review: restaurant membership alone should not allow staff to change location ownership/settings or invite roles above their authority.

### 3. Waste does not reduce current inventory — addressed

`POST /api/waste` inserts a waste record and an out transaction, but neither called storage method decrements `inventory_items.quantity`. Inventory screens and low-stock/value calculations read that quantity directly, so logging waste leaves current stock overstated. Waste record, stock decrement, and audit entry should commit together after validating the item/location and quantity/unit.

### 4. Invoice approval does not receive inventory — addressed

The upload path stores OCR results. Approval calls `updateInvoice`, which updates the invoice fields/status only. It does not map received line items into stock or supplier pricing. Invoice approval must be connected to an explicit receiving/import workflow before promising automatic inventory updates from invoices. It must be idempotent to prevent duplicate receiving.

### 5. POS readiness depends on provider — limited support

The generic sync method now rejects unsupported providers. Real provider integrations still need production acceptance testing. Do not advertise all listed providers as verified. Real provider credentials/webhooks and reconciliation remain untested. Scheduler enablement (`ENABLE_SCHEDULERS=true`) cannot be confirmed from this workspace.

## Additional improvements

- Addressed: inventory manual edits validate quantities and save a stock-adjustment audit entry in the same transaction.
- Addressed: purchase-order line additions/removals lock the order and reject delivered/cancelled orders.
- Some stock/audit writes outside purchase-order receiving are separate operations and can partially succeed.
- Addressed: signed-in existing accounts can accept invitations; failed local setup leaves the invitation pending.
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

## Deployment notes for the fixes

- Railway release migrations and startup migrations both add `invoice_processing.inventory_received_at` idempotently and restore missing memberships for accepted invitations with employee records. Production execution is not verified from this workspace.
- Historical waste and invoices are not automatically replayed into stock. Correct existing counts deliberately before receiving older invoices that may already have been counted manually.
- For new invoices, review names, units, quantities, and item mappings, then use Approve & Receive. Old approvals with no receipt timestamp need deliberate review before using the new receiving flow.
- Stripe and mobile two-step verification remain deferred by request.
