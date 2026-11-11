"use client";

/**
 * Compatibility export — /sidhu mounts SidhuInsightsPanel; keep InsightsPanel as an alias.
 */
import type { AdminRoleName } from "@/lib/adminPermissions";
import SidhuInsightsPanel from "./SidhuInsightsPanel";

export default function InsightsPanel({
  role,
  adminRole,
}: {
  role?: AdminRoleName;
  adminRole?: AdminRoleName;
}) {
  const resolved = adminRole || role;
  if (!resolved) return null;
  return <SidhuInsightsPanel adminRole={resolved} />;
}
