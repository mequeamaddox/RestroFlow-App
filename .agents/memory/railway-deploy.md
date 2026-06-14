---
name: Railway deployment setup
description: How this project is built/deployed on Railway — the exact working config and what breaks it
---

## Working config (do NOT change without strong reason)
- Builder: **NIXPACKS** (the Railway dashboard is set to Nixpacks; a custom Dockerfile gets ignored and only adds conflicting signals — do not add one)
- `railway.json`: builder NIXPACKS, buildCommand `npm run build`, startCommand `npm run start`
- `nixpacks.toml` install: `NODE_ENV=development NPM_CONFIG_PRODUCTION=false npm install --include=dev --cache /tmp/npm-cache --no-fund --no-audit` (the `NPM_CONFIG_PRODUCTION=false --include=dev` is load-bearing — see root cause below)
- `nixpacks.toml` build: explicit binary paths `/app/node_modules/.bin/vite build && /app/node_modules/.bin/esbuild ...`

## The REAL root cause of `sh: vite: not found` (confirmed from build logs)
The Railway service has a **production config in its env vars** (NODE_ENV=production and/or NPM_CONFIG_PRODUCTION=true). npm honors this as `production=true` (you'll see `npm warn config production Use --omit=dev instead` in the log) and **skips ALL devDependencies**. vite + esbuild are devDeps → not installed → build fails with `vite: not found` (exit 127).
- A bare `NODE_ENV=development` prefix on the install command is NOT enough — npm's `production`/`NPM_CONFIG_PRODUCTION` setting overrides it.
- **Fix that works:** install command must be `NODE_ENV=development NPM_CONFIG_PRODUCTION=false npm install --include=dev --cache /tmp/npm-cache --no-fund --no-audit`. The `NPM_CONFIG_PRODUCTION=false` + `--include=dev` force devDeps in regardless of the ambient production env var.

## Build command precedence
`railway.json` buildCommand (`npm run build`) OVERRIDES nixpacks.toml `[phases.build]`. So the build actually runs the package.json script `vite build && esbuild ...`. Once devDeps are installed, vite is on PATH (Nixpacks appends `/app/node_modules/.bin` to PATH). The explicit `.bin/` paths in nixpacks `[phases.build]` are effectively dead config — the install phase is what matters.

## About `--cache /tmp/npm-cache` and "Exit handler never called!"
`--cache /tmp/npm-cache` is kept, but it does NOT fully suppress the `npm error Exit handler never called!` message (Nixpacks still mounts `/root/.npm` as a cache). That message turned out to be **non-fatal noise** — the build proceeded past install. The fatal error was always `vite: not found`, caused by the production config above.

## Do NOT do these (all tried, all broke the build)
- `npm ci` instead of `npm install` — fails hard whenever package-lock.json drifts from package.json
- Custom Dockerfile + `"builder": "DOCKERFILE"` — dashboard is Nixpacks, so it conflicts/gets ignored
- Removing `--cache /tmp/npm-cache` — brings back the npm Exit-handler crash

## Other
- A leftover `uv.lock` at repo root (no Python code, no pyproject.toml) makes Railway try to detect/build Python. Keep it deleted.
