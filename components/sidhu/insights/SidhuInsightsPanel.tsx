"use client";

/**
 * Sidhu Insights (Phase 1) — Today, Overview, Sources, Geography, Pages, Journeys, Settings.
 * Fetches /api/admin-insights/* with credentials. Settings is shown only with insights.settings.
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
import SettingsScreen from "./SettingsScreen";

type View = "today" | "overview" | "sources" | "geography" | "pages" | "journeys" | "settings";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "today", label: "Today" },
  { id: "overview", label: "Overview" },
  { id: "sources", label: "Sources" },
  { id: "geography", label: "Geography" },
  { id: "pages", label: "Pages" },
  { id: "journeys", label: "Journeys" },
  { id: "settings", label: "Settings" },
];

export default function SidhuInsightsPanel({ adminRole }: { adminRole: AdminRoleName }) {
  const [view, setView] = useState<View>("today");
  const [range, setRange] = useState<InsightsRangeState>(() => rangeFromPreset("7d"));
  const [includeBots, setIncludeBots] = useState(false);

  if (!hasAdminPermission(adminRole, "insights.view")) return null;

  const canSettings = hasAdminPermission(adminRole, "insights.settings");
  const items = VIEWS.filter((v) => v.id !== "settings" || canSettings);
  const active: View = view === "settings" && !canSettings ? "today" : view;

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
      {active === "settings" && canSettings && <SettingsScreen />}
    </div>
  );
}
