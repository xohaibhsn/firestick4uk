"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { toEditorHtml } from "@/lib/contentHtml";

const TipTapEditor = dynamic(() => import("./TipTapEditor"), { ssr: false });

type Props = {
  siteContent: Record<string, string>;
  setSiteContent: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (keys: string[]) => void;
  saving: boolean;
};

type CardItem = { icon?: string; title: string; desc: string; step?: string };
type ProductOpt = { id: number; name: string; price: number | string; slug?: string; active?: number };
type FaqOpt = { id: number; question: string; category?: string; is_visible?: number };

const SAVE_KEYS = [
  "subscription_hero_eyebrow",
  "subscription_hero_title",
  "subscription_hero_intro",
  "subscription_hero_primary_cta",
  "subscription_hero_wa_cta",
  "subscription_benefits_title",
  "subscription_benefits_intro",
  "subscription_benefits_json",
  "subscription_plans_title",
  "subscription_plans_intro",
  "subscription_plans_cta",
  "subscription_plans_help_cta",
  "subscription_guarantee_text",
  "subscription_product_ids",
  "subscription_devices_title",
  "subscription_devices_intro",
  "subscription_devices_json",
  "subscription_how_title",
  "subscription_how_intro",
  "subscription_how_json",
  "subscription_rich_title",
  "subscription_rich_content",
  "subscription_faq_title",
  "subscription_faq_intro",
  "subscription_faq_ids",
  "subscription_cta_title",
  "subscription_cta_desc",
  "subscription_cta_primary",
  "subscription_cta_wa",
  "subscription_meta_title",
  "subscription_meta_description",
  "subscription_focus_keyword",
  "subscription_canonical",
  "subscription_og_image",
  "nav_subscription_label",
];

function parseCards(raw: string, fallback: CardItem[]): CardItem[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) && parsed.length ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseIdList(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

function Field({
  label,
  value,
  onChange,
  wide,
  textarea,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
  textarea?: boolean;
  hint?: string;
}) {
  return (
    <div className="modal-field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <label>{label}</label>
      {hint ? <p style={{ fontSize: 12, color: "#666", margin: "0 0 6px" }}>{hint}</p> : null}
      {textarea ? (
        <textarea
          rows={3}
          style={{ width: "100%", resize: "vertical" }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input style={{ width: "100%" }} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function CardListEditor({
  title,
  items,
  onChange,
  withStep,
}: {
  title: string;
  items: CardItem[];
  onChange: (next: CardItem[]) => void;
  withStep?: boolean;
}) {
  const update = (index: number, patch: Partial<CardItem>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const move = (index: number, dir: -1 | 1) => {
    const next = [...items];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>{title}</div>
        <button
          type="button"
          className="btn-view"
          style={{ padding: "6px 12px", fontSize: 12 }}
          onClick={() =>
            onChange([
              ...items,
              withStep
                ? { step: String(items.length + 1), title: "New step", desc: "" }
                : { icon: "", title: "New item", desc: "" },
            ])
          }
        >
          + Add
        </button>
      </div>
      {items.map((item, index) => (
        <div
          key={index}
          style={{
            border: "1px solid #E5E5E5",
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
            background: "#FAFAFA",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: withStep ? "80px 1fr 1fr" : "90px 1fr 1fr", gap: 10 }}>
            {withStep ? (
              <div className="modal-field">
                <label>Step</label>
                <input
                  style={{ width: "100%" }}
                  value={item.step || ""}
                  onChange={(e) => update(index, { step: e.target.value })}
                />
              </div>
            ) : (
              <div className="modal-field">
                <label>Icon</label>
                <input
                  style={{ width: "100%" }}
                  value={item.icon || ""}
                  onChange={(e) => update(index, { icon: e.target.value })}
                  placeholder="UK"
                />
              </div>
            )}
            <div className="modal-field">
              <label>Title</label>
              <input
                style={{ width: "100%" }}
                value={item.title || ""}
                onChange={(e) => update(index, { title: e.target.value })}
              />
            </div>
            <div className="modal-field" style={{ gridColumn: withStep ? "1 / -1" : undefined }}>
              <label>Description</label>
              <textarea
                rows={2}
                style={{ width: "100%", resize: "vertical" }}
                value={item.desc || ""}
                onChange={(e) => update(index, { desc: e.target.value })}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn-view" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => move(index, -1)}>
              ↑
            </button>
            <button type="button" className="btn-view" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => move(index, 1)}>
              ↓
            </button>
            <button
              type="button"
              className="btn-view"
              style={{ padding: "4px 10px", fontSize: 12, color: "#b91c1c" }}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SubscriptionContentEditor({
  siteContent,
  setSiteContent,
  onSave,
  saving,
}: Props) {
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [faqs, setFaqs] = useState<FaqOpt[]>([]);

  const set = (key: string, value: string) =>
    setSiteContent((s) => ({ ...s, [key]: value }));

  const benefits = useMemo(
    () =>
      parseCards(siteContent.subscription_benefits_json || "", [
        { icon: "UK", title: "UK-Based Support", desc: "" },
      ]),
    [siteContent.subscription_benefits_json]
  );
  const devices = useMemo(
    () =>
      parseCards(siteContent.subscription_devices_json || "", [
        { icon: "FS", title: "Firestick / Fire TV", desc: "" },
      ]),
    [siteContent.subscription_devices_json]
  );
  const howSteps = useMemo(
    () =>
      parseCards(siteContent.subscription_how_json || "", [
        { step: "1", title: "Choose a subscription plan", desc: "" },
      ]),
    [siteContent.subscription_how_json]
  );
  const productIds = useMemo(
    () => parseIdList(siteContent.subscription_product_ids || ""),
    [siteContent.subscription_product_ids]
  );
  const faqIds = useMemo(
    () => parseIdList(siteContent.subscription_faq_ids || ""),
    [siteContent.subscription_faq_ids]
  );

  useEffect(() => {
    fetch("/api/products?category=Subscription")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setProducts(d);
      })
      .catch(() => {});
    fetch("/api/faqs?admin=true")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setFaqs(d);
      })
      .catch(() => {});
  }, []);

  const toggleProduct = (id: number) => {
    const next = productIds.includes(id)
      ? productIds.filter((x) => x !== id)
      : [...productIds, id];
    set("subscription_product_ids", JSON.stringify(next));
  };

  const moveProduct = (id: number, dir: -1 | 1) => {
    const idx = productIds.indexOf(id);
    if (idx < 0) return;
    const next = [...productIds];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    set("subscription_product_ids", JSON.stringify(next));
  };

  const toggleFaq = (id: number) => {
    const next = faqIds.includes(id) ? faqIds.filter((x) => x !== id) : [...faqIds, id];
    set("subscription_faq_ids", JSON.stringify(next));
  };

  const moveFaq = (id: number, dir: -1 | 1) => {
    const idx = faqIds.indexOf(id);
    if (idx < 0) return;
    const next = [...faqIds];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    set("subscription_faq_ids", JSON.stringify(next));
  };

  return (
    <div className="section-card" style={{ padding: 24 }}>
      <div className="section-header" style={{ marginBottom: 20 }}>
        <div className="section-title">📺 Subscription Page (IPTV Subscriptions UK)</div>
      </div>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 18, lineHeight: 1.5 }}>
        Edits the public page at <code>/iptv-subscriptions-uk/</code>. Plan prices always come from Products —
        only selection/order is stored here. WhatsApp uses Site Settings contact number.
      </p>

      <div style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>Navbar</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
        <Field
          label="Navbar label"
          value={siteContent.nav_subscription_label || ""}
          onChange={(v) => set("nav_subscription_label", v)}
          hint='Shown in the main menu (default: "IPTV Subscription").'
        />
      </div>

      <div style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>Hero</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
        <Field label="Eyebrow" value={siteContent.subscription_hero_eyebrow || ""} onChange={(v) => set("subscription_hero_eyebrow", v)} />
        <Field label="Primary CTA" value={siteContent.subscription_hero_primary_cta || ""} onChange={(v) => set("subscription_hero_primary_cta", v)} hint="Scrolls to plans." />
        <Field label="H1 / Title" value={siteContent.subscription_hero_title || ""} onChange={(v) => set("subscription_hero_title", v)} wide />
        <Field label="Intro" value={siteContent.subscription_hero_intro || ""} onChange={(v) => set("subscription_hero_intro", v)} wide textarea />
        <Field label="WhatsApp CTA label" value={siteContent.subscription_hero_wa_cta || ""} onChange={(v) => set("subscription_hero_wa_cta", v)} hint="Uses centralized WhatsApp number." />
      </div>

      <div style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>Benefits</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
        <Field label="Section title" value={siteContent.subscription_benefits_title || ""} onChange={(v) => set("subscription_benefits_title", v)} />
        <Field label="Section intro" value={siteContent.subscription_benefits_intro || ""} onChange={(v) => set("subscription_benefits_intro", v)} wide textarea />
      </div>
      <CardListEditor
        title="Benefit cards"
        items={benefits}
        onChange={(next) => set("subscription_benefits_json", JSON.stringify(next))}
      />

      <div style={{ margin: "18px 0 14px", fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>Subscription plans</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
        <Field label="Section title" value={siteContent.subscription_plans_title || ""} onChange={(v) => set("subscription_plans_title", v)} />
        <Field label="Plan button label" value={siteContent.subscription_plans_cta || ""} onChange={(v) => set("subscription_plans_cta", v)} />
        <Field label="Section intro" value={siteContent.subscription_plans_intro || ""} onChange={(v) => set("subscription_plans_intro", v)} wide textarea />
        <Field label="Help WhatsApp label" value={siteContent.subscription_plans_help_cta || ""} onChange={(v) => set("subscription_plans_help_cta", v)} />
        <Field
          label="Guarantee wording"
          value={siteContent.subscription_guarantee_text || ""}
          onChange={(v) => set("subscription_guarantee_text", v)}
          wide
          textarea
          hint="Must stay accurate: 1 Year plans and above only."
        />
      </div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#5B21B6", marginBottom: 8 }}>
          Products to show (optional)
        </div>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 10px" }}>
          Leave none selected to show all active Subscription products (price order). Selecting products stores IDs only —
          names and prices stay in Products admin.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {products.map((p) => {
            const selected = productIds.includes(p.id);
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: "1px solid #E5E5E5",
                  borderRadius: 8,
                  padding: "8px 10px",
                  background: selected ? "#F5F3FF" : "#fff",
                }}
              >
                <input type="checkbox" checked={selected} onChange={() => toggleProduct(p.id)} />
                <div style={{ flex: 1, fontSize: 13 }}>
                  <strong>{p.name}</strong> — £{Number(p.price).toFixed(2)}
                  <span style={{ color: "#888", marginLeft: 8 }}>#{p.id}</span>
                </div>
                {selected && (
                  <>
                    <button type="button" className="btn-view" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => moveProduct(p.id, -1)}>
                      ↑
                    </button>
                    <button type="button" className="btn-view" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => moveProduct(p.id, 1)}>
                      ↓
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {!products.length && <p style={{ fontSize: 13, color: "#888" }}>No active Subscription products found.</p>}
        </div>
        {productIds.length > 0 && (
          <button
            type="button"
            className="btn-view"
            style={{ marginTop: 8, padding: "6px 12px", fontSize: 12 }}
            onClick={() => set("subscription_product_ids", "[]")}
          >
            Clear selection (show all)
          </button>
        )}
      </div>

      <div style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>Compatible devices</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
        <Field label="Section title" value={siteContent.subscription_devices_title || ""} onChange={(v) => set("subscription_devices_title", v)} />
        <Field label="Section intro" value={siteContent.subscription_devices_intro || ""} onChange={(v) => set("subscription_devices_intro", v)} wide textarea />
      </div>
      <CardListEditor
        title="Device cards"
        items={devices}
        onChange={(next) => set("subscription_devices_json", JSON.stringify(next))}
      />

      <div style={{ margin: "18px 0 14px", fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>How it works</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
        <Field label="Section title" value={siteContent.subscription_how_title || ""} onChange={(v) => set("subscription_how_title", v)} />
        <Field label="Section intro" value={siteContent.subscription_how_intro || ""} onChange={(v) => set("subscription_how_intro", v)} wide textarea />
      </div>
      <CardListEditor
        title="Steps"
        items={howSteps}
        withStep
        onChange={(next) => set("subscription_how_json", JSON.stringify(next))}
      />

      <div style={{ margin: "18px 0 10px", fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>Rich SEO content</div>
      <Field label="Section title" value={siteContent.subscription_rich_title || ""} onChange={(v) => set("subscription_rich_title", v)} />
      <div className="modal-field" style={{ marginBottom: 18 }}>
        <label>Long description (TipTap — use H2/H3, not a second H1)</label>
        <TipTapEditor
          content={toEditorHtml(siteContent.subscription_rich_content || "")}
          onChange={(html) => set("subscription_rich_content", html)}
          placeholder="Write long-form SEO content with headings, lists and links…"
        />
      </div>

      <div style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>FAQs</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
        <Field label="Section title" value={siteContent.subscription_faq_title || ""} onChange={(v) => set("subscription_faq_title", v)} />
        <Field label="Section intro" value={siteContent.subscription_faq_intro || ""} onChange={(v) => set("subscription_faq_intro", v)} wide textarea />
      </div>
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 10px" }}>
          Select FAQs from the central FAQ manager. Order is preserved. Hidden FAQs will not render publicly.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto" }}>
          {faqs.map((f) => {
            const selected = faqIds.includes(f.id);
            return (
              <div
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: "1px solid #E5E5E5",
                  borderRadius: 8,
                  padding: "8px 10px",
                  background: selected ? "#F5F3FF" : "#fff",
                }}
              >
                <input type="checkbox" checked={selected} onChange={() => toggleFaq(f.id)} />
                <div style={{ flex: 1, fontSize: 13 }}>
                  <strong>#{f.id}</strong> {f.question}
                  <div style={{ fontSize: 11, color: "#888" }}>
                    {f.category || "General"} · {f.is_visible ? "Visible" : "Hidden"}
                  </div>
                </div>
                {selected && (
                  <>
                    <button type="button" className="btn-view" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => moveFaq(f.id, -1)}>
                      ↑
                    </button>
                    <button type="button" className="btn-view" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => moveFaq(f.id, 1)}>
                      ↓
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>Final CTA</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
        <Field label="Heading" value={siteContent.subscription_cta_title || ""} onChange={(v) => set("subscription_cta_title", v)} />
        <Field label="Purchase CTA" value={siteContent.subscription_cta_primary || ""} onChange={(v) => set("subscription_cta_primary", v)} />
        <Field label="Description" value={siteContent.subscription_cta_desc || ""} onChange={(v) => set("subscription_cta_desc", v)} wide textarea />
        <Field label="WhatsApp CTA" value={siteContent.subscription_cta_wa || ""} onChange={(v) => set("subscription_cta_wa", v)} />
      </div>

      <div style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>SEO</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
        <Field label="SEO title" value={siteContent.subscription_meta_title || ""} onChange={(v) => set("subscription_meta_title", v)} wide />
        <Field label="Meta description" value={siteContent.subscription_meta_description || ""} onChange={(v) => set("subscription_meta_description", v)} wide textarea />
        <Field label="Focus keyword" value={siteContent.subscription_focus_keyword || ""} onChange={(v) => set("subscription_focus_keyword", v)} />
        <Field
          label="Canonical URL"
          value={siteContent.subscription_canonical || ""}
          onChange={(v) => set("subscription_canonical", v)}
          hint="Defaults to https://firestick4uk.com/iptv-subscriptions-uk/ when empty."
        />
        <Field
          label="OG image URL"
          value={siteContent.subscription_og_image || ""}
          onChange={(v) => set("subscription_og_image", v)}
          wide
          hint="Optional. Falls back to Site Settings default OG image."
        />
      </div>

      <button className="btn-primary" disabled={saving} onClick={() => onSave(SAVE_KEYS)}>
        {saving ? "Saving..." : "💾 Save Subscription Page"}
      </button>
    </div>
  );
}

export { SAVE_KEYS as SUBSCRIPTION_CONTENT_KEYS };
