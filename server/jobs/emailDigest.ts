import cron from "node-cron";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { wasteEntries, inventoryItems, businessIntelligence } from "../../shared/schema";
import { storage } from "../storage";
import { sendWeeklyCostDigest } from "../transactionalEmails";

export function startEmailDigestScheduler() {
  console.log("Starting email digest scheduler...");

  // Every Monday at 8 AM
  cron.schedule("0 8 * * 1", async () => {
    console.log("📧 Starting weekly cost digest emails...");
    try {
      await sendWeeklyDigests();
      console.log("✅ Weekly cost digest emails sent");
    } catch (error) {
      console.error("❌ Weekly cost digest failed:", error);
    }
  });

  console.log("Email digest scheduler started (runs Mondays at 8 AM)");
}

async function sendWeeklyDigests() {
  const locations = await db.execute(sql`
    SELECT l.id, l.name, l.owner_id
    FROM locations l
    INNER JOIN users u ON u.id = l.owner_id
    WHERE u.subscription_status = 'active'
  `);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  await Promise.allSettled(
    locations.rows.map(async (loc: any) => {
      try {
        const owner = await storage.getUser(loc.owner_id);
        if (!owner?.email) return;

        const [biRows, wasteRows, lowStockItems, inventoryValue] = await Promise.all([
          // 7-day aggregate from businessIntelligence
          db.execute(sql`
            SELECT
              COALESCE(SUM(CAST(total_revenue AS DECIMAL)), 0)   AS weekly_revenue,
              COALESCE(SUM(CAST(total_cogs AS DECIMAL)), 0)      AS weekly_cogs,
              CASE WHEN SUM(CAST(total_revenue AS DECIMAL)) > 0
                THEN (SUM(CAST(total_cogs AS DECIMAL)) / SUM(CAST(total_revenue AS DECIMAL))) * 100
                ELSE 0 END                                        AS food_cost_pct
            FROM business_intelligence
            WHERE location_id = ${loc.id}
              AND report_date >= ${weekAgoIso}::timestamptz
          `),
          // Top waste items this week
          db.execute(sql`
            SELECT i.name, COALESCE(SUM(CAST(w.cost AS DECIMAL)), 0) AS total_cost
            FROM waste_entries w
            INNER JOIN inventory_items i ON i.id = w.inventory_item_id
            WHERE w.location_id = ${loc.id}
              AND w.created_at >= ${weekAgoIso}::timestamptz
            GROUP BY i.name
            ORDER BY total_cost DESC
            LIMIT 5
          `),
          storage.getLowStockItems(loc.id),
          storage.getTotalInventoryValue(loc.id),
        ]);

        const bi = biRows.rows[0] as any;
        const weeklyRevenue = Number(bi?.weekly_revenue ?? 0);
        const weeklyCogs = Number(bi?.weekly_cogs ?? 0);
        const foodCostPct = Number(bi?.food_cost_pct ?? 0);

        const weeklyWasteCost = (wasteRows.rows as any[]).reduce(
          (sum: number, r: any) => sum + Number(r.total_cost), 0,
        );
        const wastePct = weeklyRevenue > 0 ? (weeklyWasteCost / weeklyRevenue) * 100 : 0;

        const topWasteItems = (wasteRows.rows as any[]).map((r: any) => ({
          name: String(r.name),
          cost: Number(r.total_cost),
        }));

        const now = new Date();
        const weekStart = new Date(weekAgo);
        const fmtDate = (d: Date) =>
          d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const weekLabel = `${fmtDate(weekStart)} – ${fmtDate(now)}`;

        await sendWeeklyCostDigest(owner.email, {
          locationName: loc.name,
          weekLabel,
          totalInventoryValue: inventoryValue,
          weeklyRevenue,
          weeklyCogs,
          weeklyWasteCost,
          foodCostPct,
          wastePct,
          lowStockCount: lowStockItems.length,
          topWasteItems,
        });
      } catch (err) {
        console.error(`Failed to send digest for location ${loc.id}:`, err);
      }
    }),
  );
}
