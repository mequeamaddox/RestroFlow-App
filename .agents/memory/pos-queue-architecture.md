---
name: POS queue architecture
description: SpotOn webhook-first design with Postgres job queue; why polling was replaced and how the new system works
---

## The rule
SpotOn POS events flow through `pos_event_queue` (Postgres table). Webhooks enqueue instantly; fallback polling only fires when `last_webhook_at` on the integration is older than `SPOTON_WEBHOOK_STALE_MINUTES` (default 10 min). The queue processor runs every 5 s via `setInterval`.

**Why:** 1 cron/minute × N locations = O(N) API calls/minute. At 50 restaurants that's 72,000 SpotOn API calls/day, hitting rate limits and wasting CPU. The new design is O(1) polling (queue processor) + webhook push per event.

**How to apply:**
- New SpotOn webhook endpoint: `POST /api/webhooks/spoton` → calls `posService.enqueueSpotOnWebhook()` and returns 200 immediately
- Fallback scheduler (`server/jobs/spoton.scheduler.ts`): every 5 min, skips any integration with a fresh webhook, spreads remaining integrations across a 240 s window, caps concurrent SpotOn calls at `SPOTON_MAX_CONCURRENT_POLLS` (default 3)
- Queue worker: `posService.processNextQueueBatch(limit)` → `storage.claimQueueEvents()` uses `SELECT … FOR UPDATE SKIP LOCKED` — safe for multi-instance deploys
- Retry: exponential backoff (30 s → 2 min → 8 min), max 3 attempts, then status = 'failed'
- Idempotency: poll jobs keyed by `poll:{integrationId}:{type}:{5-min-window}` so duplicate enqueues are no-ops

## Key env vars
- `SPOTON_WEBHOOK_STALE_MINUTES` (default 10) — how long before an integration is considered webhook-unhealthy
- `SPOTON_MAX_CONCURRENT_POLLS` (default 3) — max concurrent SpotOn API calls during fallback polling
- `SPOTON_WEBHOOK_SECRET` — optional HMAC-SHA256 secret for webhook signature verification
- `POS_QUEUE_BATCH_SIZE` (default 5) — events claimed per queue processor tick
