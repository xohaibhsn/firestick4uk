"use client";

type Props = {
  selectedCount: number;
  maxSelection: number;
  selectionCapped: boolean;
  disabled: boolean;
  running: boolean;
  progressText: string | null;
  priceValue: string;
  stockValue: string;
  onPriceChange: (value: string) => void;
  onStockChange: (value: string) => void;
  onMakePublic: () => void;
  onMakePrivate: () => void;
  onSetPrice: () => void;
  onSetStock: () => void;
  onClear: () => void;
};

/**
 * WooCommerce-style bulk actions bar for Products list.
 * Parent owns selection + sequential runners; this is UI only.
 */
export default function ProductBulkBar({
  selectedCount,
  maxSelection,
  selectionCapped,
  disabled,
  running,
  progressText,
  priceValue,
  stockValue,
  onPriceChange,
  onStockChange,
  onMakePublic,
  onMakePrivate,
  onSetPrice,
  onSetStock,
  onClear,
}: Props) {
  if (selectedCount < 1) return null;

  const busy = disabled || running;

  return (
    <div
      data-testid="product-bulk-bar"
      style={{
        marginBottom: 12,
        padding: "12px 14px",
        background: "rgba(91,33,182,0.10)",
        border: "1px solid rgba(91,33,182,0.28)",
        borderRadius: 10,
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span
        data-testid="product-bulk-count"
        style={{ fontSize: 13, fontWeight: 700, marginRight: 4 }}
      >
        {selectedCount} selected
        {running && progressText ? (
          <span data-testid="product-bulk-progress" style={{ fontWeight: 500, marginLeft: 8, opacity: 0.85 }}>
            {progressText}
          </span>
        ) : null}
      </span>

      {selectionCapped ? (
        <span
          data-testid="product-bulk-max-note"
          style={{ fontSize: 12, color: "#EA580C", fontWeight: 600 }}
        >
          Max {maxSelection} selected — deselect to add more
        </span>
      ) : null}

      <button
        type="button"
        className="action-btn btn-verify"
        data-testid="product-bulk-make-public"
        onClick={onMakePublic}
        disabled={busy}
      >
        Make Public
      </button>
      <button
        type="button"
        className="action-btn btn-view"
        data-testid="product-bulk-make-private"
        onClick={onMakePrivate}
        disabled={busy}
      >
        Make Private
      </button>

      <div
        data-testid="product-bulk-price-form"
        style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}
      >
        <input
          type="text"
          data-testid="product-bulk-price-input"
          placeholder="Price"
          value={priceValue}
          onChange={(e) => onPriceChange(e.target.value)}
          disabled={busy}
          style={{
            width: 96,
            background: "#FFFFFF",
            border: "1px solid #E5E5E5",
            borderRadius: 8,
            padding: "6px 8px",
            color: "#111111",
            fontSize: 12,
          }}
        />
        <button
          type="button"
          className="action-btn btn-edit"
          data-testid="product-bulk-set-price"
          onClick={onSetPrice}
          disabled={busy}
        >
          Set price
        </button>
      </div>

      <div
        data-testid="product-bulk-stock-form"
        style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}
      >
        <input
          type="text"
          data-testid="product-bulk-stock-input"
          placeholder="Stock / Digital"
          value={stockValue}
          onChange={(e) => onStockChange(e.target.value)}
          disabled={busy}
          style={{
            width: 110,
            background: "#FFFFFF",
            border: "1px solid #E5E5E5",
            borderRadius: 8,
            padding: "6px 8px",
            color: "#111111",
            fontSize: 12,
          }}
        />
        <button
          type="button"
          className="action-btn btn-edit"
          data-testid="product-bulk-set-stock"
          onClick={onSetStock}
          disabled={busy}
        >
          Set stock
        </button>
      </div>

      <button
        type="button"
        className="action-btn btn-view"
        data-testid="product-bulk-clear"
        onClick={onClear}
        disabled={running}
        style={{ marginLeft: "auto" }}
      >
        Clear
      </button>
    </div>
  );
}
