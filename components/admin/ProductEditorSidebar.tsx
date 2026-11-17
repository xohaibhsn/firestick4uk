"use client";

import type { ReactNode } from "react";

export type ProductPublishStatus = {
  isPublic: boolean;
  shopListed: boolean;
  seasonal: boolean;
  lastUpdated?: string | null;
  isNew: boolean;
};

type Props = {
  publish: ProductPublishStatus;
  canManage: boolean;
  canViewHistory: boolean;
  visibilityPending: boolean;
  onToggleVisibility: () => void;
  onOpenHistory: () => void;
  onScrollToSeasonal: () => void;
  priceStockSlot: ReactNode;
  categorySlot: ReactNode;
  featuredImageSlot: ReactNode;
  seasonalSummary?: ReactNode;
  aiAssistantSlot?: ReactNode;
  aiCollapsedDefault?: boolean;
};

/**
 * WooCommerce-style product editor sidebar boxes.
 * Shop listing is read-only here — change via Seasonal settings.
 * Visibility toggle calls existing toggleProductVisibility (parent).
 */
export default function ProductEditorSidebar({
  publish,
  canManage,
  canViewHistory,
  visibilityPending,
  onToggleVisibility,
  onOpenHistory,
  onScrollToSeasonal,
  priceStockSlot,
  categorySlot,
  featuredImageSlot,
  seasonalSummary,
  aiAssistantSlot,
  aiCollapsedDefault = true,
}: Props) {
  return (
    <aside
      data-testid="product-editor-sidebar"
      className="product-editor-sidebar"
      style={{ display: "grid", gap: 14, alignContent: "start" }}
    >
      <section
        data-testid="product-editor-publish-box"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, opacity: 0.7, marginBottom: 10 }}>
          Publish
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }} data-testid="product-editor-publish-status">
          <div>
            Status:{" "}
            <strong>{publish.isNew ? "New (will be Public)" : publish.isPublic ? "Public" : "Private"}</strong>
          </div>
          <div>
            Shop listed:{" "}
            <strong>{publish.isNew ? "Yes (default)" : publish.shopListed ? "Yes" : "No"}</strong>
            {!publish.isNew ? (
              <>
                {" "}
                <button
                  type="button"
                  className="action-btn btn-view"
                  data-testid="product-editor-shop-listed-change-link"
                  onClick={onScrollToSeasonal}
                  style={{ padding: "2px 8px", fontSize: 11 }}
                >
                  Change in Seasonal settings
                </button>
              </>
            ) : null}
          </div>
          <div>
            Seasonal: <strong>{publish.seasonal ? "Yes" : "No"}</strong>
          </div>
          {publish.lastUpdated ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
              Last updated: {publish.lastUpdated}
            </div>
          ) : null}
        </div>
        {!publish.isNew && canManage ? (
          <button
            type="button"
            className={`action-btn ${publish.isPublic ? "btn-view" : "btn-verify"}`}
            data-testid="product-editor-visibility-toggle"
            onClick={onToggleVisibility}
            disabled={visibilityPending}
            style={{ marginBottom: 8 }}
          >
            {visibilityPending
              ? publish.isPublic
                ? "Privatising…"
                : "Publishing…"
              : publish.isPublic
                ? "Make Private"
                : "Make Public"}
          </button>
        ) : null}
        <p style={{ margin: "8px 0 0", fontSize: 11, lineHeight: 1.45, opacity: 0.55 }}>
          Seasonal archives must stay Public and use Pause / End Early / Hidden from shop — never Private —
          when an offer ends. Shop listing is not editable from this box.
        </p>
        {!publish.isNew && canViewHistory ? (
          <button
            type="button"
            className="modal-cancel"
            data-testid="product-editor-sidebar-history"
            onClick={onOpenHistory}
            style={{ marginTop: 10, width: "100%" }}
          >
            🕘 History
          </button>
        ) : null}
      </section>

      <section
        data-testid="product-editor-price-stock-box"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, opacity: 0.7, marginBottom: 10 }}>
          Price &amp; stock
        </div>
        {priceStockSlot}
      </section>

      <section
        data-testid="product-editor-category-box"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, opacity: 0.7, marginBottom: 10 }}>
          Category
        </div>
        {categorySlot}
      </section>

      <section
        data-testid="product-editor-featured-image-box"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, opacity: 0.7, marginBottom: 10 }}>
          Featured image
        </div>
        {featuredImageSlot}
      </section>

      {seasonalSummary ? (
        <section
          data-testid="product-editor-seasonal-summary-box"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, opacity: 0.7, marginBottom: 10 }}>
            Seasonal offer
          </div>
          {seasonalSummary}
          <button
            type="button"
            className="action-btn btn-view"
            data-testid="product-editor-edit-seasonal"
            onClick={onScrollToSeasonal}
            style={{ marginTop: 10 }}
          >
            Edit seasonal settings
          </button>
        </section>
      ) : null}

      {aiAssistantSlot ? (
        <details
          data-testid="product-editor-ai-box"
          open={!aiCollapsedDefault ? true : undefined}
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: 14,
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              fontWeight: 700,
              opacity: 0.7,
              marginBottom: 10,
            }}
          >
            AI assistant
          </summary>
          {aiAssistantSlot}
        </details>
      ) : null}
    </aside>
  );
}
