import cron from "node-cron";
import { storage } from "../storage";
import { posService } from "../posService";

const WEBHOOK_STALE_MS = Number(process.env.SPOTON_WEBHOOK_STALE_MINUTES ?? 10) * 60 * 1000;
const MAX_CONCURRENT_POLLS = Number(process.env.SPOTON_MAX_CONCURRENT_POLLS ?? 3);
const BACKFILL_HOURS = Number(process.env.SPOTON_BACKFILL_HOURS ?? 26);
const QUEUE_BATCH_SIZE = Number(process.env.POS_QUEUE_BATCH_SIZE ?? 5);

let activePollCount = 0;

export function startSpotOnSchedulers() {
  console.log("Starting SpotOn schedulers (webhook-first, queue-backed)...");

  // ── Queue processor ────────────────────────────────────────────────────────
  // Runs every 5 seconds; claims up to QUEUE_BATCH_SIZE events atomically
  // using SELECT … FOR UPDATE SKIP LOCKED so multiple server instances
  // never double-process the same event.
  setInterval(async () => {
    try {
      await posService.processNextQueueBatch(QUEUE_BATCH_SIZE);
    } catch (e) {
      console.error("POS queue processor error:", e);
    }
  }, 5_000);

  // ── Fallback poll — every 5 minutes, staggered ────────────────────────────
  // Webhooks are primary. Polling only fires for integrations that haven't
  // received a webhook in WEBHOOK_STALE_MS (default 10 min). Integrations are
  // spread across the 4-minute window so they don't all hit the API at second 0.
  cron.schedule("*/5 * * * *", async () => {
    try {
      const integrations = await storage.getPosIntegrations();
      const spotOn = integrations.filter(i => i.isActive && i.provider === "spoton");
      if (spotOn.length === 0) return;

      // Spread evenly across 240 s (leaves 60 s buffer before next tick)
      const spreadMs = spotOn.length > 1 ? Math.floor(240_000 / (spotOn.length - 1)) : 0;

      spotOn.forEach((integration, idx) => {
        setTimeout(async () => {
          // Skip if a webhook arrived recently — webhooks are healthy
          const wh = (integration as any).lastWebhookAt as Date | null;
          if (wh && Date.now() - new Date(wh).getTime() < WEBHOOK_STALE_MS) return;

          // Respect concurrency cap to avoid thundering-herd on SpotOn API
          if (activePollCount >= MAX_CONCURRENT_POLLS) {
            console.log(`SpotOn poll skipped (${integration.id}): concurrency cap reached`);
            return;
          }

          activePollCount++;
          try {
            await posService.enqueuePollBatch(integration.id, "order");
            await posService.enqueuePollBatch(integration.id, "timeclock");
          } finally {
            activePollCount--;
          }
        }, idx * spreadMs);
      });
    } catch (e) {
      console.error("SpotOn fallback-poll scheduler error:", e);
    }
  });

  // ── Daily backfill — 03:10 AM ─────────────────────────────────────────────
  // Enqueues a single backfill job per integration; the queue processor
  // runs the actual 30-minute slices without blocking the event loop.
  cron.schedule("10 3 * * *", async () => {
    console.log("Enqueuing SpotOn daily backfill jobs...");
    const integrations = await storage.getPosIntegrations();
    for (const i of integrations) {
      if (!i.isActive || i.provider !== "spoton") continue;
      try {
        await posService.enqueueBackfill(i.id, BACKFILL_HOURS);
      } catch (e) {
        console.error("SpotOn backfill enqueue failed", { integrationId: i.id, err: String(e) });
      }
    }
  });

  console.log("SpotOn schedulers ready (webhook-first, staggered fallback, queue-backed)");
}
