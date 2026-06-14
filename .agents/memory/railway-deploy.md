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

## ACTUAL ROOT CAUSE (finally found): private proxy URLs baked into package-lock.json
`package-lock.json` had **70 `resolved` URLs pointing to `http://package-firewall.replit.local/npm/...`** — Replit's INTERNAL proxy registry. That host is unreachable from Railway's network, so npm hangs trying to download those tarballs and ~60s later dies with `Exit handler never called!`. This explains EVERYTHING: the consistent ~60s timing (network timeout to a dead host), why no install-command/flag change ever helped (bad URLs are baked into the lockfile, not the command), and "it worked before" (a recent in-Replit `npm install` rewrote 70 entries — the newly-added Sentry/@opentelemetry tree — to the proxy).
- **Why it happens:** running `npm install` INSIDE the Replit environment resolves packages through the firewall proxy and writes `http://package-firewall.replit.local/npm/<pkg>/-/...` into the lockfile's `resolved` fields. Public registry equivalent is `https://registry.npmjs.org/<pkg>/-/...` (identical path minus the `/npm` prefix). Integrity hashes are content-based so they stay valid across the host swap.
- **Fix (deterministic, no proxy dependency):** `sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json`. Then verify `rg -c package-firewall package-lock.json` == 0 and lockfile still valid JSON + in sync with package.json.
- **Guard before every deploy:** check `rg -c package-firewall package-lock.json`. If >0, the lockfile is poisoned for any non-Replit builder. The committed lockfile is what reaches Railway — make sure the CLEAN version is what gets committed (don't let a workflow `npm install` re-poison it right before the auto-checkpoint).
- The repo `.npmrc` (`registry=https://registry.npmjs.org/` + `legacy-peer-deps=true`) is correct and IS shipped to Railway's build context — keep it; it forces the public registry there.

## Build command precedence
`railway.json` buildCommand (`npm run build`) OVERRIDES nixpacks.toml `[phases.build]`. So the build actually runs the package.json script `vite build && esbuild ...`. Once devDeps are installed, vite is on PATH (Nixpacks appends `/app/node_modules/.bin` to PATH). The explicit `.bin/` paths in nixpacks `[phases.build]` are effectively dead config — the install phase is what matters.

## Notes / corrections to earlier wrong theories
- `npm ci` is FINE and preferred once the lockfile is verified clean + in sync (it skips re-resolution, the step where npm was hanging on the dead proxy host). It only hard-fails if the lockfile drifts from package.json — so validate sync first.
- The `--cache /tmp/npm-cache` flag was NOT load-bearing and `/tmp` RAM-OOM was NOT the cause — those were wrong guesses. Removing it is fine. The real cause was the proxy URLs in the lockfile (see ACTUAL ROOT CAUSE above).
- Custom Dockerfile + `"builder": "DOCKERFILE"` — don't; the Railway dashboard is set to Nixpacks, so a Dockerfile conflicts/gets ignored.

## Other
- A leftover `uv.lock` at repo root (no Python code, no pyproject.toml) makes Railway try to detect/build Python. Keep it deleted.
