"use client";

/**
 * Sidhu Insights screens.
 * Fetches /api/admin-insights/* with credentials. Settings is shown only with insights.settings.
 * Export is shown only with insights.export.
 */
import { useState } from "react";
import { hasAdminPermission, type AdminRoleName } from "@/lib/adminPermissions";
import { rangeFromPreset, type InsightsRangeState } from "./insightsTypes";
import { InsightsStyles } from "./shared";
import TodayScreen from "./TodayScreen";
import JourneysScreen from "./JourneysScreen";
import PageBehaviourScreen from "./PageBehaviourScreen";
import ClickMapScreen from "./ClickMapScreen";
import FunnelScreen from "./FunnelScreen";
import CheckoutProblemsScreen from "./CheckoutProblemsScreen";
import OrdersAttributionScreen from "./OrdersAttributionScreen";
import ExportScreen from "./ExportScreen";
import SettingsScreen from "./SettingsScreen";

type View =
  | "today"
  | "journeys"
  | "behaviour"
  | "clickmap"
  | "funnel"
  | "checkout"
  | "orders"
  | "export"
  | "settings";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "today", label: "Today" },
  { id: "journeys", label: "Journeys" },
  { id: "behaviour", label: "Page behaviour" },
  { id: "clickmap", label: "Click map" },
  { id: "funnel", label: "Funnel" },
  { id: "checkout", label: "Checkout problems" },
  { id: "orders", label: "Orders attribution" },
  { id: "export", label: "Export" },
  { id: "settings", label: "Settings" },
];

export default function SidhuInsightsPanel({ adminRole }: { adminRole: AdminRoleName }) {
  const [view, setView] = useState<View>("today");
  const [range, setRange] = useState<InsightsRangeState>(() => rangeFromPreset("7d"));
  const [includeBots, setIncludeBots] = useState(false);

  if (!hasAdminPermission(adminRole, "insights.view")) return null;

  const canSettings = hasAdminPermission(adminRole, "insights.settings");
  const canExport = hasAdminPermission(adminRole, "insights.export");
  const items = VIEWS.filter((v) => {
    if (v.id === "settings") return canSettings;
    if (v.id === "export") return canExport;
    return true;
  });
  let active: View = view;
  if (view === "settings" && !canSettings) active = "today";
  if (view === "export" && !canExport) active = "today";

  const shared = { range, onRange: setRange, includeBots, onIncludeBots: setIncludeBots };

  return (
    <div className="sin-root">
      <InsightsStyles />
      <nav className="sin-subnav" aria-label="Insights sections">
        {items.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-current={active === v.id ? "page" : undefined}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {active === "today" && <TodayScreen />}
      {active === "journeys" && <JourneysScreen {...shared} />}
      {active === "behaviour" && <PageBehaviourScreen {...shared} />}
      {active === "clickmap" && <ClickMapScreen {...shared} />}
      {active === "funnel" && <FunnelScreen {...shared} />}
      {active === "checkout" && <CheckoutProblemsScreen {...shared} />}
      {active === "orders" && <OrdersAttributionScreen {...shared} />}
      {active === "export" && canExport && <ExportScreen adminRole={adminRole} {...shared} />}
      {active === "settings" && canSettings && <SettingsScreen />}
    </div>
  );
}
