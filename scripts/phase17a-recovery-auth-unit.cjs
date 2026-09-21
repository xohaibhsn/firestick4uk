/**
 * CJS mirror of lib/recoveryAdminAuth.ts for Phase 17A unit tests.
 * Keep behavior aligned with the TypeScript module.
 */
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

function isBcryptHash(hash) {
  if (typeof hash !== "string") return false;
  const h = hash;
  const m = /^\$2([aby])\$([0-3]\d)\$([./A-Za-z0-9]{53})$/.exec(h);
  if (!m) return false;
  const cost = Number(m[2]);
  if (!Number.isInteger(cost) || cost < 4 || cost > 31) return false;
  try {
    return bcrypt.getRounds(h) === cost;
  } catch {
    return false;
  }
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function envConfigured(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function verifyRecoveryAdminPassword(password, config) {
  const hashEnv = envConfigured(config.adminPasswordHash) ? String(config.adminPasswordHash).trim() : "";
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

module.exports = {
  isBcryptHash,
  sha256Hex,
  timingSafeEqualString,
  verifyRecoveryAdminPassword,
};
