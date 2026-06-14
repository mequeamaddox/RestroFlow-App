import crypto from "crypto";

/**
 * Field-level encryption for sensitive PII (SSN, bank account/routing numbers).
 *
 * Uses AES-256-GCM (authenticated encryption) with a key derived from the
 * PII_ENCRYPTION_KEY secret. Encrypted values are stored as:
 *
 *   enc:v1:<ivBase64>:<authTagBase64>:<ciphertextBase64>
 *
 * The "enc:v1:" prefix lets us tell encrypted values apart from legacy
 * plaintext rows, so existing data stays readable and is re-encrypted on the
 * next write (no separate data-migration step required).
 */

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.PII_ENCRYPTION_KEY;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      "PII_ENCRYPTION_KEY is not set. Sensitive employee data (SSN, bank " +
        "account, routing number) cannot be encrypted. Set this secret before " +
        "collecting onboarding data.",
    );
  }
  // Derive a stable 32-byte key from a secret of any length.
  cachedKey = crypto.createHash("sha256").update(secret, "utf8").digest();
  return cachedKey;
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptField<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined) return value;
  const str = String(value);
  if (str.length === 0) return value;
  // SECURITY: never trust the prefix on the write path. The input here is
  // user-controlled plaintext, so a value that happens to start with the
  // prefix must still be encrypted — otherwise a crafted "enc:v1:..." input
  // would be stored verbatim and bypass encryption.

  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(str, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return (PREFIX +
    iv.toString("base64") +
    ":" +
    tag.toString("base64") +
    ":" +
    ciphertext.toString("base64")) as T;
}

export function decryptField<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined) return value;
  const str = String(value);
  if (!isEncrypted(str)) return value; // legacy plaintext — return as-is

  try {
    const [ivB64, tagB64, ctB64] = str.slice(PREFIX.length).split(":");
    if (!ivB64 || !tagB64 || !ctB64) throw new Error("malformed ciphertext");

    const key = getKey();
    const decipher = crypto.createDecipheriv(
      ALGO,
      key,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8") as T;
  } catch (err: any) {
    // AVAILABILITY: a single malformed/undecryptable row must not crash the
    // request path (profile/onboarding endpoints). Log a security event and
    // return null so the caller masks it as "no value" instead of 500-ing.
    console.error(
      "[Encryption] Failed to decrypt PII field — bad data or wrong key:",
      err.message,
    );
    return null as T;
  }
}

/**
 * Startup self-check. Logs whether the PII encryption key is configured so a
 * misconfiguration is caught immediately rather than at first write.
 */
export function logEncryptionStatus(): void {
  const configured = !!process.env.PII_ENCRYPTION_KEY?.trim();
  if (configured) {
    console.log("🔐 [Encryption] PII_ENCRYPTION_KEY configured — SSN & bank data encrypted at rest.");
  } else {
    console.warn(
      "⚠️ [Encryption] PII_ENCRYPTION_KEY is NOT set. Employee SSN / bank " +
        "details cannot be saved until this secret is configured.",
    );
  }
}

// Fields on employee_onboarding_data that must be encrypted at rest.
const PII_FIELDS = [
  "socialSecurityNumber",
  "accountNumber",
  "routingNumber",
] as const;

/** Encrypts PII fields present on an onboarding-data insert/update object. */
export function encryptOnboardingPII<T extends Record<string, any>>(data: T): T {
  const out: any = { ...data };
  for (const field of PII_FIELDS) {
    if (field in out) out[field] = encryptField(out[field] ?? null);
  }
  return out;
}

/** Decrypts PII fields on an onboarding-data row read from the database. */
export function decryptOnboardingPII<T extends Record<string, any> | null | undefined>(
  row: T,
): T {
  if (!row) return row;
  const out: any = { ...row };
  for (const field of PII_FIELDS) {
    if (field in out) out[field] = decryptField(out[field] ?? null);
  }
  return out;
}
