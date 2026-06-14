---
name: Railway deployment setup
description: How this project is built/deployed on Railway — the exact working config and what breaks it
---

## Working config (do NOT change without strong reason)
- Builder: **NIXPACKS** (the Railway dashboard is set to Nixpacks; a custom Dockerfile gets ignored and only adds conflicting signals — do not add one)
- `railway.json`: builder NIXPACKS, buildCommand `npm run build`, startCommand `npm run start`
- `nixpacks.toml` install: `NODE_ENV=development npm install --cache /tmp/npm-cache --no-fund --no-audit`
- `nixpacks.toml` build: explicit binary paths `/app/node_modules/.bin/vite build && /app/node_modules/.bin/esbuild ...`

## The two things that actually matter
1. **`--cache /tmp/npm-cache`** is the real fix for `npm error Exit handler never called!`. The crash comes from Docker's shared `--mount=type=cache` on `/root/.npm`; pointing npm at a fresh `/tmp/npm-cache` avoids it. Removing this flag reintroduces the crash.
2. **`NODE_ENV=development` + explicit `.bin/` paths** guarantee vite/esbuild (devDeps) are installed and found, regardless of Railway injecting NODE_ENV=production. Fixes `sh: vite: not found`.

## Do NOT do these (all tried, all broke the build)
- `npm ci` instead of `npm install` — fails hard whenever package-lock.json drifts from package.json
- Custom Dockerfile + `"builder": "DOCKERFILE"` — dashboard is Nixpacks, so it conflicts/gets ignored
- Removing `--cache /tmp/npm-cache` — brings back the npm Exit-handler crash

## Other
- A leftover `uv.lock` at repo root (no Python code, no pyproject.toml) makes Railway try to detect/build Python. Keep it deleted.
