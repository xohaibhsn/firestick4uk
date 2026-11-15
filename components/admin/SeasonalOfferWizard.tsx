"use client";

import { useMemo, useState } from "react";
import {
  applyBaseProduct,
  buildDuplicateEditProduct,
  customerWindowPhase,
  datetimeLocalFromWall,
  emptyWizardState,
  formatLondonPreview,
  prefillSeoFromBase,
  runSeasonalOfferCreate,
  suggestLondonOffsetForWall,
  toProductSlug,
  wallFromDatetimeLocal,
  type CreateStepName,
  type WizardBaseProduct,
  type WizardFormState,
} from "@/lib/seasonalOfferWizard";

type Props = {
  open: boolean;
  onClose: () => void;
  products: WizardBaseProduct[];
  onCreated?: () => void | Promise<void>;
  fetchImpl?: typeof fetch;
  /** Opens the existing Media Library picker; callback receives selected URL. */
  onPickImage?: (onSelected: (url: string) => void) => void;
};

const STEPS = [
  "Base product",
  "Names",
  "Price",
  "Window",
  "Image + alternatives",
  "Review",
] as const;

export default function SeasonalOfferWizard({
  open,
  onClose,
  products,
  onCreated,
  fetchImpl,
  onPickImage,
}: Props) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardFormState>(() => emptyWizardState());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryFrom, setRetryFrom] = useState<CreateStepName | null>(null);
  const [createdId, setCreatedId] = useState<number | undefined>();
  const [createdVersion, setCreatedVersion] = useState<number | undefined>();

  const base = useMemo(
    () => products.find((p) => Number(p.id) === Number(state.baseProductId)) || null,
    [products, state.baseProductId]
  );

  const windowPreview = useMemo(() => {
    if (!state.startsWall || !state.endsWall) return null;
    const starts = { wall: state.startsWall, offset: state.startsOffset };
    const ends = { wall: state.endsWall, offset: state.endsOffset };
    return {
      label: formatLondonPreview(starts, ends),
      phase: customerWindowPhase(starts, ends),
    };
  }, [state.startsWall, state.startsOffset, state.endsWall, state.endsOffset]);

  if (!open) return null;

  const reset = () => {
    setStep(0);
    setState(emptyWizardState());
    setError("");
    setBusy(false);
    setRetryFrom(null);
    setCreatedId(undefined);
    setCreatedVersion(undefined);
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickBase = (id: number) => {
    const p = products.find((x) => Number(x.id) === id);
    if (!p) return;
    const season = state.season_name;
    setState((s) => ({
      ...s,
      ...applyBaseProduct(p, season),
      baseProductId: id,
    }));
  };

  const onSeasonName = (season_name: string) => {
    setState((s) => {
      const next = { ...s, season_name };
      if (base) {
        const seo = prefillSeoFromBase(base, season_name);
        next.seo_title = seo.seo_title;
        next.meta_description = seo.meta_description;
      }
      return next;
    });
  };

  const onName = (name: string) => {
    setState((s) => ({
      ...s,
      name,
      slug: toProductSlug(name),
    }));
  };

  const canNext = (): boolean => {
    if (step === 0) return state.baseProductId != null;
    if (step === 1) {
      return (
        !!state.name.trim() &&
        !!state.slug.trim() &&
        !!state.season_name.trim() &&
        state.seo_title.length <= 65 &&
        state.meta_description.length <= 160
      );
    }
    if (step === 2) return state.price.trim().length > 0;
    if (step === 3) {
      return (
        !!state.startsWall &&
        !!state.endsWall &&
        windowPreview?.phase !== "invalid"
      );
    }
    if (step === 4) return true;
    return true;
  };

  const createOrRetry = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await runSeasonalOfferCreate(state, {
        fetchImpl,
        startFrom: retryFrom || undefined,
        existingProductId: createdId,
        existingVersion: createdVersion,
      });
      if (result.productId != null) setCreatedId(result.productId);
      if (result.productVersion != null) setCreatedVersion(result.productVersion);
      if (!result.ok) {
        const failed = result.results.find((r) => !r.ok);
        setError(failed?.error || "Create failed");
        setRetryFrom(failed?.step || "create_product");
        return;
      }
      setRetryFrom(null);
      await onCreated?.();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" data-testid="seasonal-offer-wizard">
      <div
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, maxHeight: "90vh", overflow: "auto" }}
      >
        <div className="modal-title">New seasonal offer</div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 14,
            fontSize: 11,
          }}
        >
          {STEPS.map((label, i) => (
            <span
              key={label}
              data-wizard-step-chip={i}
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                background: i === step ? "rgba(91,33,182,0.2)" : "rgba(0,0,0,0.04)",
                color: i === step ? "#5B21B6" : "#666",
                fontWeight: i === step ? 700 : 500,
              }}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>

        {error ? (
          <div
            data-testid="seasonal-wizard-error"
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              background: "rgba(220,38,38,0.1)",
              border: "1px solid rgba(220,38,38,0.25)",
              borderRadius: 8,
              fontSize: 13,
              color: "#DC2626",
            }}
          >
            {error}
          </div>
        ) : null}

        {step === 0 && (
          <div className="modal-field">
            <label>Base product to copy</label>
            <select
              data-testid="wizard-base-product"
              value={state.baseProductId ?? ""}
              onChange={(e) => pickBase(Number(e.target.value))}
            >
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} — {p.name}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
              Copies category, type, stock, shop listing, descriptions, features and image.
              The base product is never modified.
            </p>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="modal-field">
              <label>Product name</label>
              <input
                data-testid="wizard-name"
                value={state.name}
                onChange={(e) => onName(e.target.value)}
                placeholder="e.g. TEST WIZARD"
              />
            </div>
            <div className="modal-field">
              <label>Slug</label>
              <input
                data-testid="wizard-slug"
                value={state.slug}
                onChange={(e) =>
                  setState((s) => ({ ...s, slug: toProductSlug(e.target.value) }))
                }
              />
            </div>
            <div className="modal-field">
              <label>Season name</label>
              <input
                data-testid="wizard-season-name"
                value={state.season_name}
                onChange={(e) => onSeasonName(e.target.value)}
                placeholder="e.g. Black Friday"
              />
            </div>
            <div className="modal-field">
              <label>
                SEO title{" "}
                <span style={{ color: state.seo_title.length > 65 ? "#DC2626" : "#888" }}>
                  ({state.seo_title.length}/65)
                </span>
              </label>
              <input
                data-testid="wizard-seo-title"
                maxLength={65}
                value={state.seo_title}
                onChange={(e) =>
                  setState((s) => ({ ...s, seo_title: e.target.value.slice(0, 65) }))
                }
              />
            </div>
            <div className="modal-field">
              <label>
                Meta description{" "}
                <span
                  style={{
                    color: state.meta_description.length > 160 ? "#DC2626" : "#888",
                  }}
                >
                  ({state.meta_description.length}/160)
                </span>
              </label>
              <textarea
                data-testid="wizard-meta-description"
                rows={3}
                maxLength={160}
                value={state.meta_description}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    meta_description: e.target.value.slice(0, 160),
                  }))
                }
              />
            </div>
          </>
        )}

        {step === 2 && (
          <div className="modal-field">
            <label>Price (GBP, VAT-inclusive)</label>
            <input
              data-testid="wizard-price"
              placeholder="e.g. 78.00"
              value={state.price}
              onChange={(e) => setState((s) => ({ ...s, price: e.target.value }))}
            />
            <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              Prices include VAT (prices_include_vat ON). Parsed with the existing
              strict GBP validator.
            </p>
          </div>
        )}

        {step === 3 && (
          <>
            <div className="modal-field">
              <label>Starts (Europe/London)</label>
              <input
                data-testid="wizard-starts"
                type="datetime-local"
                value={datetimeLocalFromWall(state.startsWall)}
                onChange={(e) => {
                  const wall = wallFromDatetimeLocal(e.target.value);
                  const off = suggestLondonOffsetForWall(wall) || "+00:00";
                  setState((s) => ({
                    ...s,
                    startsWall: wall,
                    startsOffset: off,
                  }));
                }}
              />
              <span style={{ fontSize: 11, color: "#888" }}>
                Offset {state.startsOffset}
              </span>
            </div>
            <div className="modal-field">
              <label>Ends (Europe/London)</label>
              <input
                data-testid="wizard-ends"
                type="datetime-local"
                value={datetimeLocalFromWall(state.endsWall)}
                onChange={(e) => {
                  const wall = wallFromDatetimeLocal(e.target.value);
                  const off = suggestLondonOffsetForWall(wall) || "+00:00";
                  setState((s) => ({
                    ...s,
                    endsWall: wall,
                    endsOffset: off,
                  }));
                }}
              />
              <span style={{ fontSize: 11, color: "#888" }}>
                Offset {state.endsOffset}
              </span>
            </div>
            {windowPreview ? (
              <div
                data-testid="wizard-window-preview"
                style={{
                  padding: "10px 12px",
                  background: "#F5F3FF",
                  borderRadius: 8,
                  fontSize: 13,
                  marginBottom: 10,
                }}
              >
                <div>{windowPreview.label}</div>
                <div style={{ marginTop: 4, fontWeight: 700 }}>
                  Customer view: {windowPreview.phase}
                </div>
              </div>
            ) : null}
          </>
        )}

        {step === 4 && (
          <>
            <div className="modal-field">
              <label>Image</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className="action-btn btn-view"
                  data-testid="wizard-choose-image"
                  onClick={() => {
                    if (!onPickImage) return;
                    onPickImage((url) =>
                      setState((s) => ({ ...s, image: url }))
                    );
                  }}
                >
                  Choose from Library
                </button>
                {state.image ? (
                  <span style={{ fontSize: 12, wordBreak: "break-all" }}>
                    {state.image}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: "#888" }}>None</span>
                )}
              </div>
            </div>
            <div className="modal-field">
              <label>Available alternative product IDs (comma-separated)</label>
              <input
                data-testid="wizard-available-ids"
                value={state.availableIds.join(", ")}
                onChange={(e) => {
                  const ids = e.target.value
                    .split(/[\s,]+/)
                    .map((x) => Number(x.trim()))
                    .filter((n) => Number.isInteger(n) && n > 0);
                  setState((s) => ({ ...s, availableIds: ids }));
                }}
                placeholder="e.g. 4, 7"
              />
            </div>
            <div className="modal-field">
              <label>Upcoming alternative product IDs (comma-separated)</label>
              <input
                data-testid="wizard-upcoming-ids"
                value={state.upcomingIds.join(", ")}
                onChange={(e) => {
                  const ids = e.target.value
                    .split(/[\s,]+/)
                    .map((x) => Number(x.trim()))
                    .filter((n) => Number.isInteger(n) && n > 0);
                  setState((s) => ({ ...s, upcomingIds: ids }));
                }}
              />
            </div>
          </>
        )}

        {step === 5 && (
          <div data-testid="wizard-review" style={{ fontSize: 13, lineHeight: 1.55 }}>
            <p>
              <strong>Name:</strong> {state.name}
            </p>
            <p>
              <strong>Slug:</strong> {state.slug}
            </p>
            <p>
              <strong>Season:</strong> {state.season_name}
            </p>
            <p>
              <strong>Price:</strong> £{state.price} (VAT-inclusive)
            </p>
            <p>
              <strong>Window:</strong> {windowPreview?.label || "—"}
            </p>
            <p>
              <strong>Base product:</strong> #{state.baseProductId} (untouched)
            </p>
            <p>
              <strong>SEO title:</strong> {state.seo_title} ({state.seo_title.length}/65)
            </p>
            <p>
              <strong>Meta:</strong> {state.meta_description} (
              {state.meta_description.length}/160)
            </p>
            <p>
              <strong>Alternatives:</strong> available [{state.availableIds.join(", ") || "—"}]
              ; upcoming [{state.upcomingIds.join(", ") || "—"}]
            </p>
          </div>
        )}

        <div className="modal-actions" style={{ justifyContent: "space-between", gap: 8 }}>
          <button type="button" className="modal-cancel" onClick={close} disabled={busy}>
            Cancel
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 ? (
              <button
                type="button"
                className="action-btn btn-view"
                disabled={busy}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Back
              </button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                className="modal-save"
                data-testid="wizard-next"
                disabled={!canNext() || busy}
                onClick={() => setStep((s) => s + 1)}
              >
                Next
              </button>
            ) : retryFrom ? (
              <button
                type="button"
                className="modal-save"
                data-testid="wizard-retry"
                disabled={busy}
                onClick={() => void createOrRetry()}
              >
                {busy ? "Retrying…" : "Retry remaining steps"}
              </button>
            ) : (
              <button
                type="button"
                className="modal-save"
                data-testid="wizard-create"
                disabled={busy || !canNext()}
                onClick={() => void createOrRetry()}
              >
                {busy ? "Creating…" : "Create offer"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { buildDuplicateEditProduct };
