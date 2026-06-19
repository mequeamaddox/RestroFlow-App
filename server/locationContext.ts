/**
 * Neon-compatible location context enforcement
 *
 * Neon uses PgBouncer in TRANSACTION mode, so session-level SET commands don't
 * persist across queries. We use set_config(..., true) — "local" scope — which
 * pins the GUC to the current transaction only, working safely with any pooler.
 *
 * Usage:
 *   // In a route handler that needs tenant isolation:
 *   const result = await withLocation(locationId, async (tx) => {
 *     return await tx.select().from(inventoryItems);
 *   });
 *
 *   // In Express middleware (attaches helpers to req):
 *   app.use(locationContextMiddleware);
 */

import { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { isOwnerLevel, isManagerLevel } from "@shared/roles";

// ─── Core transaction wrapper ─────────────────────────────────────────────────

/**
 * Runs `fn` inside a Drizzle transaction with `app.location_id` set for the
 * duration. All RLS policies on tenant tables will use this value.
 *
 * @example
 * const items = await withLocation(req.locationId!, (tx) =>
 *   tx.select().from(inventoryItems)
 * );
 */
export async function withLocation<T>(
  locationId: string,
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(key, value, is_local=true) — scoped to this transaction only
    await tx.execute(
      sql`SELECT set_config('app.location_id', ${locationId}, true)`
    );
    return fn(tx as unknown as typeof db);
  });
}

// ─── Express middleware ───────────────────────────────────────────────────────

/**
 * Adds `req.locationId` from:
 *   1. X-Location-Id request header  (trusted internal header set by API client)
 *   2. ?locationId query parameter
 *   3. req.user.defaultLocationId    (fallback to user's default)
 *
 * Also attaches `req.withLocation(fn)` so handlers can just call
 * `await req.withLocation(tx => tx.select()...)` without threading locationId.
 */
export function locationContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const locationId: string | undefined =
    (req.headers["x-location-id"] as string) ||
    (req.query.locationId as string) ||
    (req.user as any)?.defaultLocationId;

  req.locationId = locationId;

  req.withLocation = function <T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
    if (!locationId) {
      return Promise.reject(
        new Error("No location context — set X-Location-Id header or query param")
      );
    }
    return withLocation(locationId, fn);
  };

  next();
}

// ─── Guard middleware ─────────────────────────────────────────────────────────

/**
 * Blocks the request with 400 if no location is resolved.
 * Apply after locationContextMiddleware on routes that require a location.
 *
 * @example
 * app.get('/api/inventory', requireLocation, async (req, res) => { ... });
 */
export function requireLocation(req: Request, res: Response, next: NextFunction) {
  if (!req.locationId) {
    return res.status(400).json({
      error: "Location required",
      message: "Provide a location via X-Location-Id header or ?locationId param.",
    });
  }
  next();
}

// ─── User location access guard ───────────────────────────────────────────────

/**
 * Verifies the authenticated user has access to req.locationId.
 * Owners see all locations; employees only see their assigned location.
 *
 * Apply after locationContextMiddleware + requireLocation.
 */
export async function verifyLocationAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  const locationId = req.locationId;

  if (!userId || !locationId) return next(); // handled by upstream guards

  try {
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ error: "User not found" });

    // Owners, platform_admin, and GM-level users can access any location they own
    if (isOwnerLevel(user.role) || user.role === "gm" || user.role === "admin") {
      const locations = await storage.getLocations();
      const hasAccess = locations.some((l: { id: string }) => l.id === locationId);
      if (!hasAccess) {
        return res.status(403).json({
          error: "Location access denied",
          message: "You do not own this location.",
        });
      }
      return next();
    }

    // Employees and frontline managers can only access their assigned location
    if (!isOwnerLevel(user.role) && !isManagerLevel(user.role)) {
      if ((user as any).defaultLocationId !== locationId) {
        return res.status(403).json({
          error: "Location access denied",
          message: "You are not assigned to this location.",
        });
      }
      return next();
    }

    next();
  } catch (err) {
    console.error("verifyLocationAccess error:", err);
    res.status(500).json({ error: "Failed to verify location access" });
  }
}

// ─── TypeScript augmentation ──────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      locationId?: string;
      withLocation: <T>(fn: (tx: typeof db) => Promise<T>) => Promise<T>;
    }
  }
}
