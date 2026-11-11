"use client";

/**
 * Sidhu Insights — Phase 1 + Phase 2 screens.
 * Fetches /api/admin-insights/* with credentials. Settings is shown only with insights.settings.
 * Export is shown only with insights.export.
 */
import { useState } from "react";
import { hasAdminPermission, type AdminRoleName } from "@/lib/adminPermissions";
import { rangeFromPreset, type InsightsRangeState } from "./insightsTypes";
import { InsightsStyles } from "./shared";
import TodayScreen from "./TodayScreen";
import OverviewScreen from "./OverviewScreen";
import SourcesScreen from "./SourcesScreen";
import GeographyScreen from "./GeographyScreen";
import PagesScreen from "./PagesScreen";
import JourneysScreen from "./JourneysScreen";
import FunnelScreen from "./FunnelScreen";
import CheckoutProblemsScreen from "./CheckoutProblemsScreen";
import OrdersAttributionScreen from "./OrdersAttributionScreen";
import ReturningScreen from "./ReturningScreen";
import ExportScreen from "./ExportScreen";
import SettingsScreen from "./SettingsScreen";

type View =
  | "today"
  | "overview"
  | "sources"
  | "geography"
  | "pages"
  | "journeys"
  | "funnel"
  | "checkout"
  | "orders"
  | "returning"
  | "export"
  | "settings";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "today", label: "Today" },
  { id: "overview", label: "Overview" },
  { id: "sources", label: "Sources" },
  { id: "geography", label: "Geography" },
  { id: "pages", label: "Pages" },
  { id: "journeys", label: "Journeys" },
  { id: "funnel", label: "Funnel" },
  { id: "checkout", label: "Checkout problems" },
  { id: "orders", label: "Orders attribution" },
  { id: "returning", label: "Returning" },
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
      {active === "overview" && <OverviewScreen {...shared} />}
      {active === "sources" && <SourcesScreen {...shared} />}
      {active === "geography" && <GeographyScreen {...shared} />}
      {active === "pages" && <PagesScreen {...shared} />}
      {active === "journeys" && <JourneysScreen adminRole={adminRole} {...shared} />}
      {active === "funnel" && <FunnelScreen {...shared} />}
      {active === "checkout" && <CheckoutProblemsScreen {...shared} />}
      {active === "orders" && <OrdersAttributionScreen adminRole={adminRole} {...shared} />}
      {active === "returning" && <ReturningScreen {...shared} />}
      {active === "export" && canExport && <ExportScreen adminRole={adminRole} {...shared} />}
      {active === "settings" && canSettings && <SettingsScreen />}
    </div>
  );
}
