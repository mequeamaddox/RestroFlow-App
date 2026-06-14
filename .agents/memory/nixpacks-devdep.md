---
name: nixpacks devDep install
description: Railway Docker sets NODE_ENV=production which skips devDependencies; correct fix is --include=dev flag
---

## The rule
In `nixpacks.toml`, the install command must use `npm install --include=dev`, NOT `NODE_ENV=development npm install`.

**Why:** Railway's Docker build environment injects `NODE_ENV=production` as a Docker ENV instruction. This overrides any inline `NODE_ENV=development` prefix on the install command. npm then treats devDependencies as optional and skips them, so `vite`, `esbuild`, `tsx`, etc. are not installed → build fails with `sh: 1: vite: not found`. The `--include=dev` flag is an explicit npm CLI flag that cannot be overridden by environment variables.

**How to apply:**
```toml
[phases.install]
cmds = ["npm install --include=dev --no-fund --no-audit"]
```
This pattern recurs whenever Docker layer cache is busted (any file change), forcing a fresh install. Without `--include=dev`, every fresh deploy fails.
