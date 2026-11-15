"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  canAccessSidhuTab,
  hasAdminPermission,
  type AdminRoleName,
  type SidhuTab,
} from "@/lib/adminPermissions";
import {
  SIDEBAR_GROUPS,
  readSidebarOpenState,
  sumBadgeNumbers,
  tabToGroupId,
  writeSidebarOpenState,
  type SidhuNavTabId,
  type SidebarOpenState,
} from "@/lib/adminSidebarGroups";

export type SidebarBadges = {
  orders?: string | null;
  leads?: string | null;
  reviews?: string | null;
};

type Props = {
  tab: string;
  adminRole: AdminRoleName;
  badges: SidebarBadges;
  requestTab: (id: string) => void;
  onCloseMobile: () => void;
  onOpenSeasonalWizard?: () => void;
  canManageProducts?: boolean;
};

function itemPermitted(
  adminRole: AdminRoleName,
  itemId: SidhuNavTabId,
  shortcut: string | undefined,
  canManageProducts: boolean
): boolean {
  if (shortcut === "seasonal_offer") {
    return canManageProducts && hasAdminPermission(adminRole, "products.manage");
  }
  if (itemId === "insights") {
    return hasAdminPermission(adminRole, "insights.view");
  }
  return canAccessSidhuTab(adminRole, itemId as SidhuTab);
}

export default function AdminSidebarNav({
  tab,
  adminRole,
  badges,
  requestTab,
  onCloseMobile,
  onOpenSeasonalWizard,
  canManageProducts = false,
}: Props) {
  const [openState, setOpenState] = useState<SidebarOpenState>(() =>
    readSidebarOpenState(tab, null)
  );

  // Hydrate from localStorage after mount; force active group open.
  useEffect(() => {
    const storage =
      typeof window !== "undefined" ? window.localStorage : null;
    setOpenState(readSidebarOpenState(tab, storage));
  }, [tab]);

  const persist = useCallback((next: SidebarOpenState) => {
    setOpenState(next);
    const storage =
      typeof window !== "undefined" ? window.localStorage : null;
    writeSidebarOpenState(next, storage);
  }, []);

  const toggleGroup = useCallback(
    (groupId: string) => {
      const activeGroup = tabToGroupId(tab);
      // Never collapse the active tab's group
      if (groupId === activeGroup && openState[groupId]) return;
      const next = { ...openState, [groupId]: !openState[groupId] };
      persist(next);
    },
    [openState, persist, tab]
  );

  const badgeFor = useCallback(
    (id: string): string | null => {
      if (id === "orders") return badges.orders || null;
      if (id === "leads") return badges.leads || null;
      if (id === "reviews") return badges.reviews || null;
      return null;
    },
    [badges]
  );

  const groups = useMemo(() => {
    return SIDEBAR_GROUPS.map((g) => {
      const items = g.items.filter((item) =>
        itemPermitted(adminRole, item.id, item.shortcut, canManageProducts)
      );
      return { ...g, items };
    }).filter((g) => g.items.length > 0);
  }, [adminRole, canManageProducts]);

  return (
    <nav className="sidebar-nav" data-testid="sidhu-sidebar-nav">
      {groups.map((g) => {
        const isSingle = g.label == null;
        const activeGroup = tabToGroupId(tab) === g.id;
        const expanded = isSingle || !!openState[g.id] || activeGroup;
        const panelId = `sidebar-group-${g.id}`;

        const itemBadges = g.items
          .filter((i) => !i.shortcut)
          .map((i) => badgeFor(i.id));
        const badgeSum = sumBadgeNumbers(itemBadges);
        const showHeaderBadge = !expanded && badgeSum > 0;

        const renderItems = () =>
          g.items.map((item) => {
            const key = item.navKey || item.id;
            const isShortcut = !!item.shortcut;
            const active = !isShortcut && tab === item.id;
            const badge = !isShortcut ? badgeFor(item.id) : null;
            return (
              <button
                key={key}
                type="button"
                className={`nav-item ${active ? "active" : ""}`}
                data-testid={
                  isShortcut
                    ? "sidebar-seasonal-offer-shortcut"
                    : `sidebar-tab-${item.id}`
                }
                data-sidebar-tab={isShortcut ? undefined : item.id}
                onClick={() => {
                  if (item.shortcut === "seasonal_offer") {
                    onOpenSeasonalWizard?.();
                    onCloseMobile();
                    return;
                  }
                  if (item.id === "history") {
                    /* history filter cleared by parent via requestTab side-effect if needed */
                  }
                  requestTab(item.id);
                  onCloseMobile();
                }}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
                {badge ? (
                  <span className="nav-badge orange">{badge}</span>
                ) : null}
              </button>
            );
          });

        if (isSingle) {
          return (
            <div key={g.id} data-sidebar-group={g.id}>
              {renderItems()}
            </div>
          );
        }

        return (
          <div
            key={g.id}
            data-sidebar-group={g.id}
            style={{ marginBottom: 4 }}
          >
            <button
              type="button"
              className="nav-item"
              data-testid={`sidebar-group-toggle-${g.id}`}
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => toggleGroup(g.id)}
              style={{
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                opacity: 0.92,
                cursor: activeGroup && expanded ? "default" : "pointer",
              }}
            >
              <span className="nav-icon">{g.icon}</span>
              <span style={{ flex: 1 }}>{g.label}</span>
              <span aria-hidden="true" style={{ fontSize: 14, opacity: 0.8 }}>
                {expanded ? "−" : "+"}
              </span>
              {showHeaderBadge ? (
                <span
                  className="nav-badge orange"
                  data-testid={`sidebar-group-badge-${g.id}`}
                >
                  {String(badgeSum)}
                </span>
              ) : null}
            </button>
            <div
              id={panelId}
              role="region"
              hidden={!expanded}
              style={{
                display: expanded ? "flex" : "none",
                flexDirection: "column",
                gap: 3,
                paddingLeft: 6,
              }}
            >
              {renderItems()}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
