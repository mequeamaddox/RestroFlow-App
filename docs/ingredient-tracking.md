# Ingredient inventory and prepared batches

Set the purchase unit, containers per purchase, container name, amount per container, contents unit, and ingredient tracking unit. Weight, volume, and counts stay separate: oz is weight; fl oz is volume. A case of four one-gallon jars contains 512 fl oz. At $48 per case, two fl oz costs $0.1875.

Existing balances retain their purchase-unit meaning. When setting packaging for the first time, confirm what an existing purchase unit contains. Changing established packaging preserves physical ingredient stock, reorder amounts, and inventory value. Save packaging changes separately from a stock count.

Receive cases, containers, or ingredient amounts from item details. Physical counts combine full purchases, loose containers, and loose ingredients. Both write stock and audit entries atomically. Receipt retries retain a request key to avoid duplicate additions. Invoice review accepts alternate supplier case contents per line. Purchase orders capture packaging when the line is created. Unfamiliar invoice products can be created as inventory; configure contents before using ingredient portions.

Create a batch recipe with ingredients, expected yield, and yield unit. It creates prepared output inventory. Record the number of batches and actual measured yield. Production consumes inputs and adds output atomically, saving ingredient amounts and costs. Insufficient ingredients or failed audit writes roll back production. Retries cannot duplicate batches. Prepared cost uses actual yield and the weighted average of existing output and new production.

Use prepared output as a dish ingredient. Map POS sales to that dish or explicit portions, rather than the production recipe. Selling it consumes prepared stock without deducting raw ingredients again. All sale lines process atomically once, including duplicate provider-order imports. Unmapped lines remain unprocessed for correction and retry with Process Stock. Sales may make stock negative because the sale already happened. Count negative prepared stock before making another batch. Refunds and voids require review.

Existing processed sales and receiving history are not replayed. New batch snapshots preserve input quantities across later packaging changes. Legacy production rows lack snapshots and use current recipe definitions. Batch variance compares batch inputs with production usage; POS portions remain separate movements.

Railway release and startup migrations add matching columns and increase quantity precision to eight decimals and unit-cost precision to six. Existing records remain in place. Website/backend deploy from main. Mobile screens require a new Android build from the mobile directory with the preview profile for an APK; production remains a Play Store app bundle.

Tests cover unit dimensions, packaging/rebasing, batch rollback/retries, location isolation, recipe setup, counts/receipts, and atomic/duplicate sales. They use transaction adapters rather than live PostgreSQL. Production migrations, actual provider imports, and device operation still require verification after deployment.
