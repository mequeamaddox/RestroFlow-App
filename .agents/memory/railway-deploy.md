---
name: Railway deployment setup
description: How this project is built/deployed on Railway — the exact working config and what breaks it
---

## Working config (do NOT change without strong reason)
- Builder: **NIXPACKS** (the Railway dashboard is set to Nixpacks; a custom Dockerfile gets ignored and only adds conflicting signals — do not add one)
- `railway.json`: builder NIXPACKS, buildCommand `npm run build`, startCommand `npm run start`
- `nixpacks.toml` install: `NODE_ENV=development npm install --include=dev --no-fund --no-audit --maxsockets=3` (NO `--cache /tmp/...` — that caused RAM OOM; see root cause below)
- `nixpacks.toml` build: explicit binary paths `/app/node_modules/.bin/vite build && /app/node_modules/.bin/esbuild ...`

## The REAL root cause of `sh: vite: not found` (confirmed across MANY build logs)
`vite: not found` is a SYMPTOM, not the cause. The actual failure is **`npm error Exit handler never called!` during the install phase** — npm gets killed before it finishes, so vite/esbuild never land in node_modules, and the later build step then can't find vite.
- This crash is **independent of the install command** — verified it persists across `npm ci`, `npm install`, with/without NODE_ENV, with/without NPM_CONFIG_PRODUCTION, with/without `--include=dev`. Changing install flags does NOT fix it. Stop tweaking flags expecting a fix.
- The `npm warn config production Use --omit=dev instead` line is a red herring (it fires just because the deprecated `production` key is set to ANY value, incl. false). It does not mean devDeps were skipped.
- Pattern in logs: `scheduling build on Metal builder` → ~60s later `Exit handler never called!`. Strongly indicates the Railway builder is **OOM-killing** the npm process (or the Metal-builder migration kills it).
- Most likely trigger of the regression: the dependency tree grew (Sentry, jsdom, @testing-library, @csstools added) AND the old install command wrote npm cache to `--cache /tmp/npm-cache`. `/tmp` is RAM-backed on the builder, so a bigger cache → RAM exhaustion → OOM kill. Smaller old tree fit in RAM; new one doesn't.
- **Fix being tried:** drop `--cache /tmp/npm-cache` (use the disk-backed BuildKit cache mount `/root/.npm` instead) and add `--maxsockets=3` to cut peak memory/concurrency: `NODE_ENV=development npm install --include=dev --no-fund --no-audit --maxsockets=3`.
- Memory/concurrency tweaks (disk cache, --maxsockets=3) did NOT help — same ~60s kill confirmed 3x (61s/60s/63s after "scheduling build on Metal builder"). The consistent timing = a fixed-time interruption, NOT random OOM.
- **Actual fix applied:** the install was bloated. `dependencies` (NOT devDependencies) carried the whole unused test stack (vitest, @vitest/ui, jsdom, msw, @testing-library/*) plus `canvas` (native node-gyp compile needing system libs absent from the Nixpacks image — a prime suspect for the ~60s hang). The repo has ZERO test files and none of these are imported in source. Removed all 8 via uninstallLanguagePackages. Local install dropped to 827 packages in ~15s. A smaller/faster install (no native canvas compile) should finish before Railway's ~60s window.
- **Lesson:** when Railway/Nixpacks build install crashes at a consistent ~60s, stop tweaking npm flags — audit what's actually being installed. Test-only and native-compile packages in `dependencies` are the usual culprits. `rg` for imports + count test files to find dead weight safely.
- If it STILL crashes after slimming, it is a **Railway build-environment limit** (Metal builder), not repo-fixable — user must raise build resources or contact Railway support.

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
