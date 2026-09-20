/**
 * Shared guard for mutating integration/security test scripts.
 * Read-only tests may run without this.
 *
 * Require:
 *   ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND
 */
function requireMutationOptIn(scriptName = "test") {
  if (process.env.ALLOW_DB_MUTATION_TESTS !== "YES_I_UNDERSTAND") {
    console.error(
      `[${scriptName}] Refusing DB mutations.\n` +
        `This environment likely points at a real/remote database.\n` +
        `Set ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND to run mutating tests intentionally.`
    );
    process.exit(1);
  }
}

function isTestEmail(email) {
  const e = String(email || "").toLowerCase();
  return e.endsWith("@test.local") || /^phase[0-9]+\./.test(e);
}

module.exports = {
  requireMutationOptIn,
  isTestEmail,
  MUTATION_OPT_IN_VALUE: "YES_I_UNDERSTAND",
};
