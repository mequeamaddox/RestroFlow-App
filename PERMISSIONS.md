# Permissions & Multi-Tenant Isolation

Two layers protect data:

1. **RBAC** — what a role is allowed to do (roles + a permission matrix).
2. **Tenant isolation** — which *locations'* data a user may touch.

Authentication (who the user is) is covered in [AUTH](AUTH.md).

## Roles

Defined in `server/permissions.ts` (backend) and mirrored in
`client/src/contexts/PermissionContext.tsx` (frontend):

- `owner`
- `gm` (General Manager)
- `foh_manager` (Front of House Manager)
- `boh_manager` (Back of House Manager)
- `team_lead`
- `employee`

## Permission matrix

`ROLE_PERMISSIONS` maps each role to an array of `Permission` enum values. Permission
categories include user management (e.g. `MANAGE_EMPLOYEES`), inventory (e.g.
`VIEW_INVENTORY`, `MANAGE_INVENTORY`), financials (e.g. `VIEW_FINANCIAL_DATA`), tasks
(e.g. `VIEW_ALL_TASKS`), and system admin (e.g. `MANAGE_LOCATIONS`).

- `owner` has the full set (28+ permissions).
- `employee` is restricted to basic views (e.g. `VIEW_INVENTORY`, `VIEW_ALL_TASKS`).

When adding a permission, update the enum **and** every relevant role entry in
`ROLE_PERMISSIONS`, on both the backend (`server/permissions.ts`) and the frontend
context if the UI needs to gate on it.

## Frontend enforcement

`PermissionProvider` wraps the authenticated app and exposes, via `usePermissions()`:

- `hasPermission(permission)`
- `hasAnyPermission([...])`

Helpers:

- `withPermission(Component, permission)` — HOC that renders a "Forbidden" state if the
  user lacks the permission.
- `usePermissionGuard()` — semantic helpers like `canViewHR()`, `canManageInventory()`,
  `isOwnerOrGM()`.

> Frontend gating is UX only. **Every protected endpoint must also enforce on the
> backend** — never rely on the client to hide a capability.

## Multi-tenant isolation (the critical part)

Tenancy is anchored on **locations**. A `location` row has an `ownerId`. Users either
**own** locations or are **assigned** to them.

### `server/securityMiddleware.ts`

- `assertLocationAccess(req, res, locationId)` — core check:
  - **Owners/admins:** access granted only if `location.ownerId === req.user.id`.
  - **Employees/managers:** access granted only if they have an active permission/
    assignment record for that specific `locationId`.
  - On denial it logs a `high`/`critical` security event to the audit log.
- `requireLocationAccess(locationId?)` — middleware wrapper. It resolves the target
  location from the route param, `?locationId` / `?location` query, or request body,
  then calls `assertLocationAccess`.
  - **Returns `400` "Location ID required"** when no location id is present.
  - **Returns `403`** when the user lacks access.
  - (Note: a missing/invalid location surfaces as 400/403 here, not 404.)

### `server/locationContext.ts`

- `locationContextMiddleware` attaches `req.locationId` (from the `X-Location-Id`
  header, `?locationId`, or the user's default) and a `req.withLocation(fn)` helper.
- `withLocation(locationId, fn)` runs `fn` inside a Drizzle transaction after
  `SELECT set_config('app.location_id', <id>, true)` — a transaction-local GUC that
  works safely with Neon's PgBouncer (transaction-mode) pooler and backs row-level
  scoping on tenant-aware tables.

### Frontend wiring

The TanStack Query fetcher (`client/src/lib/queryClient.ts`) appends
`?locationId=<currentLocation.id>` to location-scoped endpoints. The current location
lives in `LocationContext`. If no location is selected, the param is omitted and
location-scoped endpoints will reject with 400.

## Billing relevance

Owner-scoped location counts also drive HR add-on billing — counts must filter
`loc.ownerId === userId` so one tenant is never billed for another's locations. See
[BILLING](BILLING.md).
