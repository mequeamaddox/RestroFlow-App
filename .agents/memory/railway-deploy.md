---
name: Railway deployment setup
description: How this project is built and deployed on Railway — what breaks and why
---

## Rule
Always use a custom `Dockerfile` (builder: DOCKERFILE in railway.json), never Nixpacks, for Railway deploys.

**Why:** Railway's Nixpacks Metal builder crashes npm during large installs (`npm error Exit handler never called!`), then serves a stale Docker cache layer that is missing devDependencies (vite, esbuild). This failed 4+ times before switching to a custom Dockerfile.

## How to apply
- `railway.json` must have `"builder": "DOCKERFILE"` pointing to the repo's `Dockerfile`
- `Dockerfile` uses two stages: `builder` (NODE_ENV=development npm ci) and `production` (--omit=dev)
- Builder stage calls binaries with explicit paths (`./node_modules/.bin/vite build`) — never rely on PATH
- `package-lock.json` MUST be in sync with `package.json`. After adding packages, the Replit workflow (which runs `npm install` on startup) updates the lockfile — ensure a checkpoint is created after so the updated lockfile is committed. `npm ci` on Railway is strict and will fail if out of sync.
