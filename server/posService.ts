import { storage } from "./storage";
import { safeFetch } from "./lib/safeFetch";

interface PosCredentials {
  accessToken?: string | null;
  apiKey?: string | null;
  [key: string]: any;
}

export class PosService {
  private getBaseUrl(provider: string, environment: string): string {
    const urls: Record<string, Record<string, string>> = {
      clover: {
        sandbox: "https://sandbox.dev.clover.com",
        production: "https://api.clover.com",
      },
      spoton: {
        sandbox: "https://restaurantapi-qa.spoton.com/posexport/v1",
        production: "https://restaurantapi.spoton.com/posexport/v1",
      },
      toast: {
        sandbox: "https://ws-api-sandbox.toasttab.com",
        production: "https://ws-api.toasttab.com",
      },
      revel: {
        sandbox: "https://sandbox.revelup.com/api/v1",
        production: "https://api.revelup.com/api/v1",
      },
    };
    return urls[provider]?.[environment] || "";
  }

  async testConnection(integrationId: string): Promise<boolean> {
    try {
      const integration = await storage.getPosIntegration(integrationId);
      if (!integration) return false;
      if (!integration.environment) {
        console.error('POS integration missing environment configuration');
        return false;
      }

      const credentials = integration.credentials as PosCredentials;
      const baseUrl = this.getBaseUrl(integration.provider, integration.environment);
      
      if (!baseUrl || !integration.merchantId) return false;

      // Provider-specific connection test
      switch (integration.provider) {
        case "spoton":
          return await this.testSpotOnConnection(baseUrl, credentials, integration.merchantId);
        case "clover":
          if (!credentials?.accessToken) return false;
          return await this.testCloverConnection(baseUrl, integration.merchantId, credentials.accessToken);
        default:
          // For unsupported providers, return true if credentials exist
          return !!(credentials.accessToken || credentials.apiKey);
      }
    } catch (error) {
      console.error("POS connection test failed:", error);
      return false;
    }
  }

  private async testCloverConnection(baseUrl: string, merchantId: string, accessToken: string): Promise<boolean> {
    const response = await fetch(`${baseUrl}/v3/merchants/${merchantId}/orders`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.ok;
  }

  private async testSpotOnConnection(
    baseUrl: string,
    credentials: PosCredentials,
    locationId: string
  ): Promise<boolean> {
    if (!credentials.apiKey) return false;
    const response = await fetch(`${baseUrl}/locations/${encodeURIComponent(locationId)}`, {
      headers: { "x-api-key": credentials.apiKey! },
    });
    return response.ok;
  }

  async syncMenuItems(integrationId: string): Promise<void> {
    try {
      const integration = await storage.getPosIntegration(integrationId);
      if (!integration) throw new Error("Integration not found");
      if (!integration.environment) {
        throw new Error("POS integration missing environment configuration");
      }

      const credentials = integration.credentials as PosCredentials;
      const baseUrl = this.getBaseUrl(integration.provider, integration.environment);
      
      if (!integration.merchantId) {
        throw new Error("Merchant ID is required for menu sync");
      }
      
      // Provider-specific credential validation
      if (integration.provider === "spoton") {
        if (!credentials?.apiKey) {
          throw new Error("API key is required for SpotOn menu sync");
        }
      } else {
        if (!credentials?.accessToken) {
          throw new Error("Access token is required for menu sync");
        }
      }

      // Provider-specific menu sync
      switch (integration.provider) {
        case "clover":
          await this.syncCloverMenuItems(baseUrl, integration, credentials);
          break;
        case "spoton":
          await this.syncSpotOnMenuItems(baseUrl, integration, credentials);
          break;
        default:
          console.log(`Menu sync not implemented for provider: ${integration.provider}`);
      }

      await storage.updatePosIntegration(integrationId, {
        lastSyncAt: new Date().toISOString() as any,
      });
    } catch (error) {
      console.error("Menu items sync failed:", error);
      throw error;
    }
  }

  async syncHistoricalSales(integrationId: string): Promise<number> {
    try {
      const integration = await storage.getPosIntegration(integrationId);
      if (!integration) throw new Error("Integration not found");

      // For now, only Clover is supported
      if (integration.provider === "clover") {
        const { cloverService } = await import("./cloverService");
        return await cloverService.syncHistoricalOrders(integrationId);
      }

      throw new Error(`Historical sales sync not yet supported for ${integration.provider}`);
    } catch (error) {
      console.error("Historical sales sync failed:", error);
      throw error;
    }
  }

  private async syncCloverMenuItems(baseUrl: string, integration: any, credentials: PosCredentials): Promise<void> {
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
      const url = `${baseUrl}/v3/merchants/${integration.merchantId}/items?limit=${limit}&offset=${offset}`;
      const res = await safeFetch(url, { 
        headers: { Authorization: `Bearer ${credentials.accessToken}` } 
      });
      const data = await res.json();
      const items = data.elements ?? [];
      
      for (const item of items) {
        await storage.upsertPosMenuItem({
          posItemId: item.id,
          posIntegrationId: integration.id,
          name: item.name,
          price: item.price != null ? (item.price / 100).toString() : null,
          category: item.categories?.[0]?.name ?? null,
          sku: item.sku ?? null,
        });
      }
      
      if (items.length < limit) break;
    }
  }

  private async syncSpotOnMenuItems(baseUrl: string, integration: any, credentials: PosCredentials): Promise<void> {
    if (!credentials.apiKey) throw new Error("Missing SpotOn API key");
    const url = `${baseUrl}/locations/${encodeURIComponent(integration.merchantId)}/menu-items`;
    const res = await safeFetch(url, { headers: { "x-api-key": credentials.apiKey! } });
    const items = await res.json();
    
    for (const item of items ?? []) {
      await storage.upsertPosMenuItem({
        posItemId: item.id,
        posIntegrationId: integration.id,
        name: item.name,
        price: item.standardPriceAmount ?? null,
        category: item.reportCategoryId ?? null,
        sku: item.plu ?? null,
      });
    }
  }

  async pollSpotOnOrders(integrationId: string): Promise<{ ordersProcessed: number }> {
    const integration = await storage.getPosIntegration(integrationId);
    if (!integration || !integration.isActive) return { ordersProcessed: 0 };
    if (!integration.environment) {
      console.error('SpotOn integration missing environment configuration');
      return { ordersProcessed: 0 };
    }
    const credentials = integration.credentials as PosCredentials;
    if (!credentials.apiKey) throw new Error("Missing SpotOn API key");

    const baseUrl = this.getBaseUrl("spoton", integration.environment);
    if (!baseUrl) {
      console.error('Unable to determine SpotOn API base URL');
      return { ordersProcessed: 0 };
    }
    const lagMin = Number(process.env.SPOTON_LAG_MINUTES ?? 5);
    const intervalMin = Number(process.env.SPOTON_POLL_INTERVAL_MINUTES ?? 1);

    const now = new Date();
    const windowEnd = new Date(now.getTime() - lagMin * 60 * 1000);
    const windowStart = new Date(windowEnd.getTime() - intervalMin * 60 * 1000);

    const params = new URLSearchParams({
      updatedAtStart: toRFC3339Z(windowStart),
      updatedAtEnd: toRFC3339Z(windowEnd),
    });

    const url = `${baseUrl}/locations/${encodeURIComponent(integration.merchantId)}/orders?${params}`;
    const res = await safeFetch(url, { headers: { "x-api-key": credentials.apiKey! } });
    const orders = await res.json();

    let count = 0;
    for (const order of orders ?? []) {
      const existing = await storage.getPosSaleByOrderId(integration.id, order.id);
      if (existing) continue;

      const total = order.totalAmount?.amount ?? "0";
      const createdAt = order.createdAt ?? new Date().toISOString();

      const posSale = await storage.createPosSale({
        posOrderId: order.id,
        posIntegrationId: integration.id,
        locationId: integration.locationId,
        total,
        orderDate: new Date(createdAt),
        inventoryProcessed: false,
      });

      const addItem = async (li: any) => {
        const qty = Number(li.quantity ?? "1");
        const unit = li.preDiscountsAmount?.amount ?? "0";
        const totalLine = li.totalAmount?.amount ?? "0";
        await storage.createPosSaleItem({
          posSaleId: posSale.id,
          itemName: li.name,
          quantity: qty,
          unitPrice: unit,
          totalPrice: totalLine,
        });
      };

      for (const check of order.checks ?? []) {
        for (const li of check.items ?? []) await addItem(li);
        for (const guest of check.guests ?? []) {
          for (const li of guest.items ?? []) await addItem(li);
        }
      }

      await this.processInventoryDeductions(posSale.id);
      count++;
    }

    await storage.updatePosIntegration(integration.id, { lastSyncAt: new Date() });
    return { ordersProcessed: count };
  }

  async pollSpotOnTimeclock(integrationId: string): Promise<{ punchesProcessed: number }> {
    const integration = await storage.getPosIntegration(integrationId);
    if (!integration || !integration.isActive) return { punchesProcessed: 0 };
    if (!integration.environment) {
      console.error('SpotOn integration missing environment configuration');
      return { punchesProcessed: 0 };
    }
    const credentials = integration.credentials as PosCredentials;
    if (!credentials.apiKey) throw new Error("Missing SpotOn API key");
    const baseUrl = this.getBaseUrl("spoton", integration.environment);
    if (!baseUrl) {
      console.error('Unable to determine SpotOn API base URL');
      return { punchesProcessed: 0 };
    }

    const lagMin = Number(process.env.SPOTON_LAG_MINUTES ?? 5);
    const intervalMin = Number(process.env.SPOTON_POLL_INTERVAL_MINUTES ?? 1);
    const now = new Date();
    const windowEnd = new Date(now.getTime() - lagMin * 60 * 1000);
    const windowStart = new Date(windowEnd.getTime() - intervalMin * 60 * 1000);
    const params = new URLSearchParams({
      updatedAtStart: toRFC3339Z(windowStart),
      updatedAtEnd: toRFC3339Z(windowEnd),
    });

    const url = `${baseUrl}/locations/${encodeURIComponent(integration.merchantId)}/time-clock-entries?${params}`;
    const res = await safeFetch(url, { headers: { "x-api-key": credentials.apiKey! } });
    const punches = await res.json();

    let count = 0;
    for (const p of punches ?? []) {
      try {
        // Find matching POS employee by posEmployeeId
        const posEmployees = await storage.getPosEmployees(integration.id);
        const posEmployee = posEmployees.find(emp => emp.posEmployeeId === p.employeeId);
        
        if (!posEmployee) {
          console.warn(`No POS employee found for employeeId: ${p.employeeId}`);
          continue;
        }

        const timeclockData = {
          posIntegrationId: integration.id,
          posTimeEntryId: p.id,
          posEmployeeId: posEmployee.id,
          locationId: integration.locationId,
          clockInAt: new Date(p.clockInAt),
          clockOutAt: p.clockOutAt ? new Date(p.clockOutAt) : null,
          breakSeconds: p.breakSeconds || 0,
          roleTitle: p.roleTitle || posEmployee.roleTitle,
          status: p.clockOutAt ? 'closed' : 'open',
          raw: p,
        };

        await storage.upsertPosTimeclock(timeclockData);
        count++;
      } catch (err) {
        console.error(`Error processing timeclock entry ${p.id}:`, err);
      }
    }
    return { punchesProcessed: count };
  }

  async processOrderWebhook(payload: any): Promise<void> {
    try {
      console.log('Processing webhook payload:', JSON.stringify(payload, null, 2));
      
      // Determine provider from webhook payload structure
      let provider = "unknown";
      let merchantId = "";
      
      if (payload.merchantId) {
        provider = "clover";
        merchantId = payload.merchantId;
      } else if (payload.location_id) {
        provider = "spoton";
        merchantId = payload.location_id;
      }

      const integrations = await storage.getPosIntegrations();
      const integration = integrations.find(i => i.merchantId === merchantId && i.isActive);
      
      if (!integration) {
        console.log(`No active integration found for merchant ${merchantId}`);
        return;
      }

      console.log(`Processing ${provider} webhook for integration ${integration.id}`);

      // Process based on provider
      switch (provider) {
        case "clover":
          await this.processCloverWebhook(payload, integration);
          break;
        case "spoton":
          await this.processSpotOnOrder(payload, integration);
          break;
        default:
          console.log(`Unknown provider for webhook payload`);
      }
      
      // Update last sync time
      await storage.updatePosIntegration(integration.id, {
        lastSyncAt: new Date().toISOString() as any,
      });
    } catch (error) {
      console.error("Webhook processing failed:", error);
      throw error;
    }
  }

  private async processCloverWebhook(payload: any, integration: any): Promise<void> {
    const eventType = payload.eventType;
    
    switch (eventType) {
      case 'ORDER_CREATED':
      case 'ORDER_UPDATED':
        await this.processCloverOrder(payload, integration);
        break;
      case 'PAYMENT_CREATED':
        await this.processCloverPayment(payload, integration);
        break;
      case 'INVENTORY_UPDATED':
        await this.processCloverInventoryUpdate(payload, integration);
        break;
      default:
        console.log(`Unhandled Clover event type: ${eventType}`);
    }
  }

  private async processCloverOrder(payload: any, integration: any): Promise<void> {
    const order = payload.data || payload;
    
    // Check if order already exists
    const existingSales = await storage.getPosSales(integration.locationId);
    const existingSale = existingSales.find(sale => sale.posOrderId === order.id);
    
    if (existingSale) {
      console.log(`Order ${order.id} already processed`);
      return;
    }
    
    const posSale = await storage.createPosSale({
      posOrderId: order.id,
      posIntegrationId: integration.id,
      locationId: integration.locationId,
      total: (order.total / 100).toString(),
      orderDate: new Date(order.createdTime || Date.now()),
      inventoryProcessed: false,
    });

    if (order.lineItems) {
      for (const lineItem of order.lineItems) {
        await storage.createPosSaleItem({
          posSaleId: posSale.id,
          itemName: lineItem.name,
          quantity: lineItem.unitQty || 1,
          unitPrice: (lineItem.price / 100).toString(),
          totalPrice: ((lineItem.price * (lineItem.unitQty || 1)) / 100).toString(),
        });
      }
    }

    await this.processInventoryDeductions(posSale.id);
    
    console.log(`Successfully processed Clover order ${order.id}`);
  }

  private async processCloverPayment(payload: any, integration: any): Promise<void> {
    console.log('Processing Clover payment webhook:', payload.data?.id);
    // Payment webhooks can be used for accounting/reporting
    // For now, just log the payment
  }

  private async processCloverInventoryUpdate(payload: any, integration: any): Promise<void> {
    console.log('Processing Clover inventory update:', payload.data?.id);
    // Re-sync menu items when inventory changes in Clover
    try {
      await this.syncMenuItems(integration.id);
    } catch (error) {
      console.error('Failed to sync menu items after inventory update:', error);
    }
  }

  private async processSpotOnOrder(payload: any, integration: any): Promise<void> {
    const order = payload.order;
    
    // Check if order already exists (idempotency)
    const existing = await storage.getPosSaleByOrderId(integration.id, order.id);
    if (existing) {
      console.log(`SpotOn order ${order.id} already processed`);
      return;
    }
    
    const posSale = await storage.createPosSale({
      posOrderId: order.id,
      posIntegrationId: integration.id,
      locationId: integration.locationId,
      total: order.total.toString(),
      orderDate: new Date(order.created_at),
      inventoryProcessed: false,
    });

    if (order.items) {
      for (const item of order.items) {
        await storage.createPosSaleItem({
          posSaleId: posSale.id,
          itemName: item.name,
          quantity: item.quantity,
          unitPrice: item.price.toString(),
          totalPrice: (item.price * item.quantity).toString(),
        });
      }
    }

    await this.processInventoryDeductions(posSale.id);
  }

  // ── Queue API ────────────────────────────────────────────────────────────

  /** Called by the SpotOn webhook route — enqueues the event and stamps lastWebhookAt. */
  async enqueueSpotOnWebhook(integrationId: string, payload: any, idempotencyKey: string): Promise<void> {
    await storage.enqueueEvent({
      integrationId,
      provider: "spoton",
      eventType: payload.type?.toLowerCase() ?? "order",
      source: "webhook",
      idempotencyKey,
      payload,
      status: "pending",
      attempts: 0,
    });
    await storage.updatePosIntegrationWebhookAt(integrationId);
  }

  /** Enqueues a fallback-poll job for a single integration (deduped per 5-min window). */
  async enqueuePollBatch(integrationId: string, eventType: "order" | "timeclock"): Promise<void> {
    const window = Math.floor(Date.now() / (5 * 60 * 1000));
    await storage.enqueueEvent({
      integrationId,
      provider: "spoton",
      eventType,
      source: "poll",
      idempotencyKey: `poll:${integrationId}:${eventType}:${window}`,
      payload: {},
      status: "pending",
      attempts: 0,
    });
  }

  /** Enqueues a daily backfill job (deduped per calendar day). */
  async enqueueBackfill(integrationId: string, hours: number): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    await storage.enqueueEvent({
      integrationId,
      provider: "spoton",
      eventType: "backfill",
      source: "poll",
      idempotencyKey: `backfill:${integrationId}:${day}`,
      payload: { hours },
      status: "pending",
      attempts: 0,
    });
  }

  /** Called by the queue processor setInterval every 5 s. */
  async processNextQueueBatch(limit: number): Promise<void> {
    const events = await storage.claimQueueEvents(limit);
    await Promise.all(events.map(e => this.processQueuedEvent(e)));
  }

  private async processQueuedEvent(event: any): Promise<void> {
    try {
      const integration = await storage.getPosIntegration(event.integrationId);
      if (!integration || !integration.isActive) {
        await storage.markQueueEventDone(event.id);
        return;
      }

      switch (event.eventType) {
        case "order":
          if (event.source === "webhook") {
            await this.processSpotOnOrderPayload(event.payload, integration);
          } else {
            await this.pollSpotOnOrders(integration.id);
          }
          break;
        case "timeclock":
          await this.pollSpotOnTimeclock(integration.id);
          break;
        case "backfill":
          await this.runSpotOnBackfill(integration, (event.payload as any)?.hours ?? 26);
          break;
        default:
          console.warn(`Unknown POS queue event type: ${event.eventType}`);
      }

      await storage.markQueueEventDone(event.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Exponential backoff: 30 s, 2 min, 8 min
      const delaySec = Math.min(Math.pow(4, event.attempts ?? 0) * 30, 8 * 60);
      const processAfter = new Date(Date.now() + delaySec * 1000);
      await storage.markQueueEventFailed(event.id, msg, processAfter);
      console.error(`POS queue event ${event.id} (${event.eventType}) failed — retry after ${delaySec}s:`, msg);
    }
  }

  /** Normalises and persists a SpotOn order from a webhook payload. */
  private async processSpotOnOrderPayload(payload: any, integration: any): Promise<void> {
    const order = payload.order ?? payload;
    const existing = await storage.getPosSaleByOrderId(integration.id, order.id);
    if (existing) return;

    const posSale = await storage.createPosSale({
      posOrderId: order.id,
      posIntegrationId: integration.id,
      locationId: integration.locationId,
      total: order.totalAmount?.amount ?? order.total?.toString() ?? "0",
      orderDate: new Date(order.createdAt ?? order.created_at ?? Date.now()),
      inventoryProcessed: false,
    });

    const addLineItem = async (li: any) => {
      await storage.createPosSaleItem({
        posSaleId: posSale.id,
        itemName: li.name,
        quantity: Number(li.quantity ?? 1),
        unitPrice: li.preDiscountsAmount?.amount ?? li.price?.toString() ?? "0",
        totalPrice: li.totalAmount?.amount ?? "0",
      });
    };

    for (const check of order.checks ?? []) {
      for (const li of check.items ?? []) await addLineItem(li);
      for (const guest of check.guests ?? []) {
        for (const li of guest.items ?? []) await addLineItem(li);
      }
    }

    await this.processInventoryDeductions(posSale.id);
  }

  /** Runs the 26-hour slice-by-slice backfill for one integration. */
  private async runSpotOnBackfill(integration: any, hours: number): Promise<void> {
    const credentials = integration.credentials as { apiKey?: string };
    if (!credentials?.apiKey) return;

    const baseUrl = this.getBaseUrl("spoton", integration.environment);
    if (!baseUrl) return;

    const now = new Date();
    let totalOrders = 0;

    for (let offset = hours * 60; offset > 0; offset -= 30) {
      const end = new Date(now.getTime() - (offset - 30) * 60 * 1000);
      const start = new Date(now.getTime() - offset * 60 * 1000);
      const params = new URLSearchParams({
        updatedAtStart: toRFC3339Z(start),
        updatedAtEnd: toRFC3339Z(end),
      });

      try {
        const url = `${baseUrl}/locations/${encodeURIComponent(integration.merchantId)}/orders?${params}`;
        const res = await fetch(url, { headers: { "x-api-key": credentials.apiKey! } });
        if (!res.ok) { console.error(`SpotOn backfill slice ${res.status}`); continue; }

        const orders = await res.json();
        for (const order of orders ?? []) {
          if (await storage.getPosSaleByOrderId(integration.id, order.id)) continue;

          const posSale = await storage.createPosSale({
            posOrderId: order.id,
            posIntegrationId: integration.id,
            locationId: integration.locationId,
            total: order.totalAmount?.amount ?? "0",
            orderDate: new Date(order.createdAt ?? Date.now()),
            inventoryProcessed: false,
          });

          for (const check of order.checks ?? []) {
            for (const li of [...(check.items ?? []), ...(check.guests ?? []).flatMap((g: any) => g.items ?? [])]) {
              await storage.createPosSaleItem({
                posSaleId: posSale.id,
                itemName: li.name,
                quantity: Number(li.quantity ?? 1),
                unitPrice: li.preDiscountsAmount?.amount ?? "0",
                totalPrice: li.totalAmount?.amount ?? "0",
              });
            }
          }
          totalOrders++;
        }
      } catch (sliceErr) {
        console.error("SpotOn backfill slice error:", sliceErr);
      }
    }

    if (totalOrders > 0) {
      console.log(`SpotOn backfill: ${totalOrders} orders for integration ${integration.id}`);
      await storage.updatePosIntegration(integration.id, { lastSyncAt: new Date() });
    }
  }

  public async processInventoryDeductions(saleId: string): Promise<void> {
    try {
      const sale = await storage.getPosSaleById(saleId);
      if (!sale) return;

      // Fetch sale items separately
      const allSales = await storage.getPosSales();
      const saleWithItems = allSales.find(s => s.id === saleId);
      if (!saleWithItems || !saleWithItems.items || saleWithItems.items.length === 0) {
        console.log(`No items found for sale ${saleId}`);
        return;
      }

      console.log(`Processing inventory deductions for sale ${saleId} with ${saleWithItems.items.length} items`);

      const menuItems = await storage.getPosMenuItems(sale.posIntegrationId);
      const failures: string[] = [];

      for (const saleItem of saleWithItems.items) {
        try {
          const menuItem = menuItems.find(mi => 
            mi.name.toLowerCase() === saleItem.itemName.toLowerCase()
          );

          if (!menuItem) {
            console.warn(`No menu item found for sale item: ${saleItem.itemName}`);
            failures.push(`No menu item found: ${saleItem.itemName}`);
            continue;
          }

          // Check if this is a direct inventory item (beer, bottled drinks)
          if (menuItem.inventoryItemId) {
            console.log(`Deducting direct inventory item for "${menuItem.name}" (quantity: ${saleItem.quantity})`);
            
            await storage.createInventoryTransaction({
              inventoryItemId: menuItem.inventoryItemId,
              locationId: sale.locationId,
              type: "out",
              quantity: saleItem.quantity.toString(),
              reference: `POS Sale ${sale.posOrderId}`,
              createdBy: "system",
            });
          }
          // Check if this is a recipe-based item (cocktails, prepared food)
          else if (menuItem.recipeId) {
            const recipe = await storage.getRecipe(menuItem.recipeId);
            if (!recipe || !recipe.ingredients) {
              console.warn(`Recipe not found or has no ingredients for menu item: ${menuItem.name}`);
              failures.push(`Recipe missing or incomplete: ${menuItem.name}`);
              continue;
            }

            console.log(`Deducting recipe ingredients for "${menuItem.name}" (quantity: ${saleItem.quantity})`);

            for (const ingredient of recipe.ingredients) {
              const deductionAmount = Number(ingredient.quantity) * saleItem.quantity;
              
              await storage.createInventoryTransaction({
                inventoryItemId: ingredient.inventoryItemId,
                locationId: sale.locationId,
                type: "out",
                quantity: (-deductionAmount).toString(),
                reference: `POS-${sale.posOrderId}`,
                notes: `POS sale deduction: ${saleItem.quantity}x ${menuItem.name} (Recipe: ${recipe.name})`,
                createdBy: "system",
              });

              console.log(`  - Deducted ${deductionAmount} ${ingredient.unit} of ${ingredient.inventoryItem.name}`);
            }
          }
          // Neither recipe nor direct inventory item linked
          else {
            console.warn(`Menu item "${menuItem.name}" has no recipe or inventory item linked`);
            failures.push(`Not mapped: ${menuItem.name}`);
            continue;
          }
        } catch (itemError) {
          const errorMsg = `Failed to process ${saleItem.itemName}: ${itemError instanceof Error ? itemError.message : String(itemError)}`;
          console.error(errorMsg);
          failures.push(errorMsg);
        }
      }

      if (failures.length > 0) {
        console.error(`Inventory deduction incomplete for sale ${saleId}: ${failures.length} items could not be processed:`, failures);
        return;
      }

      await storage.updatePosSale(saleId, {
        inventoryProcessed: true,
        processedAt: new Date().toISOString() as any,
      });

      console.log(`Successfully processed inventory deductions for sale ${saleId}`);
    } catch (error) {
      console.error("Failed to process inventory deductions:", error);
      throw error;
    }
  }
}

function toRFC3339Z(d: Date): string {
  return new Date(Math.floor(d.getTime() / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export const posService = new PosService();