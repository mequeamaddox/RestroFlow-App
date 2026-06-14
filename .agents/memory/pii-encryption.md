---
name: PII encryption (onboarding SSN / bank)
description: How employee_onboarding_data SSN & bank fields are encrypted at rest, and the key requirement.
---

# PII encryption for employee_onboarding_data

`socialSecurityNumber`, `accountNumber`, `routingNumber` on `employee_onboarding_data`
are encrypted at rest with AES-256-GCM via `server/encryption.ts`.

- Storage format: `enc:v1:<ivB64>:<authTagB64>:<ciphertextB64>`. The `enc:v1:` prefix
  distinguishes ciphertext from legacy plaintext rows.
- Key: derived with SHA-256 from the `PII_ENCRYPTION_KEY` secret (any passphrase length works).
- These columns are `text` (NOT varchar) — ciphertext is ~65–75 chars, far longer than the raw values.

**Rules (learned from code review):**
- **Write path must ALWAYS encrypt** non-empty strings — never skip based on the `enc:v1:`
  prefix. Onboarding input is user-controlled, so a crafted `enc:v1:...` value would otherwise
  be stored verbatim and bypass encryption.
- **Decrypt must never throw on the request path.** `decryptField` returns `null` (and logs) on a
  malformed/undecryptable value, so one bad row or a wrong key can't 500 the profile/onboarding endpoints.
- Backward compatible: legacy plaintext rows read through unchanged and get encrypted on next write.

**Why:** prevents at-rest PII/GLBA exposure if the Neon DB is breached; the masking in `hr.ts`
(last-4) relies on the storage layer decrypting first.

**How to apply:** encrypt/decrypt happens centrally in the `saveEmployeeOnboardingData` /
`updateEmployeeOnboardingData` / `getEmployeeOnboardingData` / `getEmployeeProfile` storage methods
via `encryptOnboardingPII` / `decryptOnboardingPII`. Any new read path that selects these columns
directly must also decrypt.

**Operational:** `PII_ENCRYPTION_KEY` must be set in BOTH environments (Replit dev AND Railway prod);
use the SAME value if data ever moves between them. Startup logs `🔐 [Encryption] ... configured`
or a loud warning if missing (`logEncryptionStatus()` in server/index.ts).
