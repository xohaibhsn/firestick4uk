import crypto from "crypto";
import bcrypt from "bcryptjs";

export type RecoveryAuthConfig = {
  adminPasswordHash?: string | null;
  adminPasswordSha256?: string | null;
  adminPassword?: string | null;
};

export type RecoveryAuthResult = {
  ok: boolean;
  mode?: "bcrypt" | "sha256" | "plaintext";
  configError?: boolean;
  legacy?: boolean;
  /** True when ADMIN_PASSWORD_HASH was set but unusable; legacy may still apply. */
  ignoredMalformedHash?: boolean;
};

export function isBcryptHash(hash: string): boolean {
  return typeof hash === "string" && /^\$2[aby]?\$/.test(hash);
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

/** Constant-time compare for equal-length strings (hex digests / plaintext). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function envConfigured(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Strict Recovery Admin precedence:
 * 1) Valid bcrypt ADMIN_PASSWORD_HASH → authenticate only against bcrypt (no legacy)
 * 2) else ADMIN_PASSWORD_SHA256
 * 3) else ADMIN_PASSWORD plaintext
 *
 * A present but malformed HASH does not authenticate and does not block legacy
 * fallback (avoids lockout when env expansion mangles `$2a$...`). Server logs it.
 * Malformed HASH with no legacy credentials → configError.
 */
export async function verifyRecoveryAdminPassword(
  password: string,
  config: RecoveryAuthConfig
): Promise<RecoveryAuthResult> {
  const hashEnv = envConfigured(config.adminPasswordHash)
    ? String(config.adminPasswordHash).trim()
    : "";
  const shaEnv = envConfigured(config.adminPasswordSha256)
    ? String(config.adminPasswordSha256).trim()
    : "";
  const plainEnv = envConfigured(config.adminPassword) ? String(config.adminPassword) : "";

  let ignoredMalformedHash = false;

  if (hashEnv) {
    if (!isBcryptHash(hashEnv)) {
      ignoredMalformedHash = true;
    } else {
      try {
        const match = await bcrypt.compare(String(password), hashEnv);
        return match ? { ok: true, mode: "bcrypt", legacy: false } : { ok: false, mode: "bcrypt" };
      } catch {
        ignoredMalformedHash = true;
      }
    }
  }

  if (shaEnv) {
    const digest = sha256Hex(String(password));
    const match = timingSafeEqualString(digest, shaEnv);
    return match
      ? { ok: true, mode: "sha256", legacy: true, ignoredMalformedHash }
      : { ok: false, mode: "sha256", legacy: true, ignoredMalformedHash };
  }

  if (plainEnv) {
    const match = timingSafeEqualString(String(password), plainEnv);
    return match
      ? { ok: true, mode: "plaintext", legacy: true, ignoredMalformedHash }
      : { ok: false, mode: "plaintext", legacy: true, ignoredMalformedHash };
  }

  return { ok: false, configError: true, ignoredMalformedHash };
}

export function readRecoveryAuthConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): RecoveryAuthConfig {
  return {
    adminPasswordHash: env.ADMIN_PASSWORD_HASH || "",
    adminPasswordSha256: env.ADMIN_PASSWORD_SHA256 || "",
    adminPassword: env.ADMIN_PASSWORD || "",
  };
}
