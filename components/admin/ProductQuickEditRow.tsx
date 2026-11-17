"use client";

import { useEffect, useRef } from "react";

type Props = {
  productId: number;
  price: string;
  stock: string;
  saving: boolean;
  error: string | null;
  conflictReload: boolean;
  onPriceChange: (value: string) => void;
  onStockChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onReload: () => void;
  colSpan?: number;
};

/**
 * Inline Quick Edit row for price + stock only.
 * Enter = save, Esc = cancel. Parent owns PUT + 409 handling.
 */
export default function ProductQuickEditRow({
  productId,
  price,
  stock,
  saving,
  error,
  conflictReload,
  onPriceChange,
  onStockChange,
  onSave,
  onCancel,
  onReload,
  colSpan = 9,
}: Props) {
  const priceRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    priceRef.current?.focus();
    priceRef.current?.select();
  }, [productId]);

  return (
    <tr data-testid={`product-quick-edit-row-${productId}`} className="product-quick-edit-row">
      <td colSpan={colSpan} style={{ background: "rgba(91,33,182,0.08)", padding: "12px 14px" }}>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!saving && !conflictReload) onSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
        >
          <div className="modal-field" style={{ marginBottom: 0, minWidth: 140, flex: "0 1 160px" }}>
            <label htmlFor={`qe-price-${productId}`}>Price</label>
            <input
              id={`qe-price-${productId}`}
              ref={priceRef}
              data-testid={`product-quick-edit-price-${productId}`}
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              placeholder="e.g. £9.99"
              disabled={saving || conflictReload}
            />
          </div>
          <div className="modal-field" style={{ marginBottom: 0, minWidth: 140, flex: "0 1 160px" }}>
            <label htmlFor={`qe-stock-${productId}`}>Stock / Type</label>
            <input
              id={`qe-stock-${productId}`}
              data-testid={`product-quick-edit-stock-${productId}`}
              value={stock}
              onChange={(e) => onStockChange(e.target.value)}
              placeholder="e.g. 10 or Digital"
              disabled={saving || conflictReload}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {conflictReload ? (
              <button
                type="button"
                className="action-btn btn-verify"
                data-testid={`product-quick-edit-reload-${productId}`}
                onClick={onReload}
              >
                Reload
              </button>
            ) : (
              <button
                type="button"
                className="modal-save"
                data-testid={`product-quick-edit-save-${productId}`}
                onClick={onSave}
                disabled={saving}
                style={{ padding: "8px 16px", fontSize: 13 }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
            <button
              type="button"
              className="modal-cancel"
              data-testid={`product-quick-edit-cancel-${productId}`}
              onClick={onCancel}
              disabled={saving}
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              Cancel
            </button>
          </div>
        </div>
        {error ? (
          <div
            data-testid={`product-quick-edit-error-${productId}`}
            style={{ marginTop: 8, fontSize: 12, color: "#DC2626" }}
          >
            {error}
          </div>
        ) : null}
      </td>
    </tr>
  );
}
