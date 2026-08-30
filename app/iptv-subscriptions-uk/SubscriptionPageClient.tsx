"use client";

import { useMemo, useState } from "react";
import xss from "xss";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/app/lib/cartContext";
import { cms } from "@/lib/cms";
import { fixContentLinkRels } from "@/lib/seoLinks";
import { looksLikeHtml } from "@/lib/contentHtml";

type CardItem = { icon?: string; title: string; desc: string; step?: string };

type Product = {
  id: number;
  name: string;
  price: number | string;
  slug: string;
  image?: string | null;
  badge?: string | null;
  features?: string | null;
  short_description?: string | null;
};

type Faq = {
  id: number;
  question: string;
  answer: string;
};

const richXss = {
  whiteList: {
    h2: [],
    h3: [],
    h4: [],
    p: ["style", "class"],
    strong: [],
    em: [],
    u: [],
    s: [],
    b: [],
    i: [],
    ul: [],
    ol: [],
    li: [],
    blockquote: [],
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height", "class"],
    br: [],
    hr: [],
    span: ["style", "class"],
    div: ["style", "class"],
  } as Record<string, string[]>,
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style", "iframe", "object", "embed"],
};

/** Demote accidental H1 tags so the hero keeps the only H1. */
function sanitizeRichHtml(html: string): string {
  const demoted = String(html || "")
    .replace(/<h1(\s[^>]*)?>/gi, "<h2$1>")
    .replace(/<\/h1>/gi, "</h2>");
  return fixContentLinkRels(xss(demoted, richXss));
}

function stripHtml(input: string): string {
  return String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function featureLines(features?: string | null): string[] {
  if (!features?.trim()) return [];
  return features
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);
}

const styles = `
*, *::before, *::after { box-sizing: border-box; }
.sub-page { padding-top: 100px; min-height: 100vh; background: #FFFFFF; color: #111111; font-family: var(--font-body), Inter, system-ui, sans-serif; overflow-x: hidden; }
.sub-wrap { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
.sub-hero { max-width: 900px; margin: 0 auto; padding: 56px 24px 40px; text-align: center; }
.sub-eyebrow { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: #5B21B6; font-weight: 700; margin-bottom: 12px; display: block; }
.sub-h1 { font-family: var(--font-display), Georgia, serif; font-size: clamp(1.7rem, 3.2vw, 2.55rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; color: #111111; margin: 0 0 16px; }
.sub-intro { font-size: clamp(15px, 2vw, 18px); color: #555555; line-height: 1.75; max-width: 720px; margin: 0 auto 28px; }
.sub-ctas { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.btn-p { background: #5B21B6; color: #FFFFFF; padding: 14px 28px; border-radius: 8px; font-size: 13px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; text-decoration: none; border: none; cursor: pointer; display: inline-block; transition: all 0.2s; }
.btn-p:hover { background: #4C1D95; transform: translateY(-1px); }
.btn-s { background: transparent; color: #5B21B6; padding: 13px 26px; border-radius: 8px; font-size: 13px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; text-decoration: none; border: 2px solid #5B21B6; display: inline-block; transition: all 0.2s; }
.btn-s:hover { background: #F5F3FF; }
.sub-section { padding: 56px 0; }
.sub-section.alt { background: #F7F7F8; }
.sub-tag { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: #5B21B6; font-weight: 700; margin-bottom: 10px; display: block; }
.sub-h2 { font-family: var(--font-display), Georgia, serif; font-size: clamp(1.4rem, 2.6vw, 2rem); font-weight: 800; color: #111111; margin: 0 0 12px; }
.sub-lead { color: #555555; font-size: 15px; line-height: 1.7; max-width: 720px; margin: 0 0 28px; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }
.sub-card { background: #FFFFFF; border: 1px solid #E5E5E5; border-radius: 16px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); transition: all 0.25s; }
.sub-card:hover { border-color: #5B21B6; box-shadow: 0 8px 24px rgba(91,33,182,0.1); transform: translateY(-3px); }
.sub-card .ico { width: 42px; height: 42px; border-radius: 12px; background: #F5F3FF; color: #5B21B6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; margin-bottom: 14px; }
.sub-card h3 { font-family: var(--font-display), Georgia, serif; font-size: 16px; font-weight: 700; margin: 0 0 8px; color: #111; }
.sub-card p { font-size: 14px; color: #666; line-height: 1.65; margin: 0; }
.plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
.plan-card { background: #FFFFFF; border: 1px solid #E5E5E5; border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.plan-img { width: 100%; height: 160px; object-fit: cover; background: #F5F3FF; }
.plan-body { padding: 22px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.plan-badge { display: inline-block; align-self: flex-start; background: #F5F3FF; color: #5B21B6; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; }
.plan-name { font-family: var(--font-display), Georgia, serif; font-size: 18px; font-weight: 800; margin: 0; color: #111; }
.plan-price { font-size: 28px; font-weight: 800; color: #5B21B6; margin: 0; }
.plan-price span { font-size: 13px; font-weight: 600; color: #666; }
.plan-desc { font-size: 13px; color: #555; line-height: 1.6; margin: 0; }
.plan-feats { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.plan-feats li { font-size: 13px; color: #444; padding-left: 18px; position: relative; }
.plan-feats li::before { content: "✓"; position: absolute; left: 0; color: #5B21B6; font-weight: 700; }
.plan-actions { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
.plan-actions .btn-p, .plan-actions .btn-s { text-align: center; width: 100%; }
.guarantee { margin-top: 22px; padding: 14px 18px; background: #F5F3FF; border: 1px solid #DDD6FE; border-radius: 12px; font-size: 14px; color: #4C1D95; line-height: 1.6; }
.guarantee a { color: #5B21B6; font-weight: 600; }
.how-list { display: flex; flex-direction: column; gap: 0; max-width: 760px; }
.how-item { display: flex; gap: 16px; }
.how-left { display: flex; flex-direction: column; align-items: center; width: 44px; flex-shrink: 0; }
.how-dot { width: 44px; height: 44px; border-radius: 50%; background: #5B21B6; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; box-shadow: 0 4px 12px rgba(91,33,182,0.28); }
.how-line { width: 2px; flex: 1; min-height: 18px; background: #E5E5E5; margin: 4px 0; }
.how-content { padding: 4px 0 26px; }
.how-content h3 { font-family: var(--font-display), Georgia, serif; font-size: 16px; margin: 0 0 6px; }
.how-content p { margin: 0; font-size: 14px; color: #555; line-height: 1.65; }
.rich-block { max-width: 760px; }
.rich-block h2 { font-family: var(--font-display), Georgia, serif; font-size: 1.45rem; margin: 28px 0 12px; color: #111; }
.rich-block h3 { font-family: var(--font-display), Georgia, serif; font-size: 1.15rem; margin: 22px 0 10px; color: #111; }
.rich-block h4 { font-size: 1rem; margin: 18px 0 8px; color: #222; }
.rich-block p { font-size: 15px; color: #444; line-height: 1.8; margin: 0 0 14px; }
.rich-block ul, .rich-block ol { margin: 0 0 16px; padding-left: 1.25em; color: #444; }
.rich-block li { margin-bottom: 6px; line-height: 1.7; }
.rich-block a { color: #5B21B6; }
.rich-block img { max-width: 100%; height: auto; border-radius: 12px; margin: 12px 0; }
.faq-list { display: flex; flex-direction: column; gap: 10px; max-width: 800px; }
.faq-item { border: 1px solid #E5E5E5; border-radius: 12px; background: #fff; overflow: hidden; padding: 0; }
.faq-item summary { list-style: none; cursor: pointer; padding: 16px 18px; font-size: 15px; font-weight: 700; color: #111; display: flex; justify-content: space-between; gap: 12px; }
.faq-item summary::-webkit-details-marker { display: none; }
.faq-item summary:hover { color: #5B21B6; }
.faq-item summary::after { content: "+"; font-weight: 700; }
.faq-item[open] summary::after { content: "−"; }
.faq-a { padding: 0 18px 16px; font-size: 14px; color: #555; line-height: 1.7; }
.cta-band { margin: 20px 24px 80px; }
.cta-box { background: #111111; border-radius: 20px; padding: 64px 40px; text-align: center; }
.cta-box h2 { font-family: var(--font-display), Georgia, serif; color: #fff; font-size: clamp(1.4rem, 2.8vw, 2rem); margin: 0 0 12px; }
.cta-box p { color: rgba(255,255,255,0.7); margin: 0 0 28px; font-size: 15px; }
.cta-box .btn-s { color: #fff; border-color: rgba(255,255,255,0.45); }
.cta-box .btn-s:hover { background: rgba(255,255,255,0.08); border-color: #fff; }
@media (max-width: 768px) {
  .sub-hero { padding: 40px 20px 28px; }
  .sub-section { padding: 44px 0; }
  .cta-band { margin: 10px 16px 60px; }
  .cta-box { padding: 44px 22px; }
}
`;

export default function SubscriptionPageClient({
  content,
  products,
  faqs,
  benefits,
  devices,
  howSteps,
  whatsappUrl,
}: {
  content: Record<string, string>;
  products: Product[];
  faqs: Faq[];
  benefits: CardItem[];
  devices: CardItem[];
  howSteps: CardItem[];
  whatsappUrl: string;
}) {
  const { addToCart, cart } = useCart();
  const [addedId, setAddedId] = useState<number | null>(null);

  const t = (key: string, fallback = "") => cms(content, key, fallback);
  const cartCount = useMemo(() => cart.reduce((n, i) => n + i.qty, 0), [cart]);

  const richHtml = useMemo(() => {
    const raw = t(
      "subscription_rich_content",
      "<h2>About IPTV Subscriptions in the UK</h2><p>Compare Firestick4UK streaming subscription plans and order through our store.</p>"
    );
    return sanitizeRichHtml(looksLikeHtml(raw) ? raw : `<p>${raw}</p>`);
  }, [content]);

  const onAdd = (p: Product) => {
    addToCart({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      qty: 1,
      image: p.image || undefined,
    });
    setAddedId(p.id);
    setTimeout(() => setAddedId(null), 1600);
  };

  return (
    <>
      <style>{styles}</style>
      <Navbar cartCount={cartCount} cta="cart" />
      <main className="sub-page">
        <section className="sub-hero">
          <span className="sub-eyebrow">{t("subscription_hero_eyebrow", "UK Streaming Subscriptions")}</span>
          <h1 className="sub-h1">{t("subscription_hero_title", "IPTV Subscriptions UK")}</h1>
          <p className="sub-intro">
            {t(
              "subscription_hero_intro",
              "Choose a Firestick4UK streaming subscription that suits your household."
            )}
          </p>
          <div className="sub-ctas">
            <a className="btn-p" href="#subscription-plans">
              {t("subscription_hero_primary_cta", "View Subscription Plans")}
            </a>
            <a className="btn-s" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              {t("subscription_hero_wa_cta", "Ask on WhatsApp")}
            </a>
          </div>
        </section>

        <section className="sub-section alt">
          <div className="sub-wrap">
            <span className="sub-tag">Benefits</span>
            <h2 className="sub-h2">{t("subscription_benefits_title", "Why Choose Firestick4UK")}</h2>
            <p className="sub-lead">{t("subscription_benefits_intro", "")}</p>
            <div className="card-grid">
              {benefits.map((b, i) => (
                <article className="sub-card" key={`${b.title}-${i}`}>
                  <div className="ico">{(b.icon || "✓").slice(0, 2)}</div>
                  <h3>{b.title}</h3>
                  <p>{b.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sub-section" id="subscription-plans">
          <div className="sub-wrap">
            <span className="sub-tag">Plans</span>
            <h2 className="sub-h2">{t("subscription_plans_title", "Subscription Plans")}</h2>
            <p className="sub-lead">{t("subscription_plans_intro", "")}</p>
            <div className="plans-grid">
              {products.map((p) => {
                const href = `/products/${p.slug || p.id}`;
                const desc = stripHtml(p.short_description || "").slice(0, 160);
                const feats = featureLines(p.features);
                return (
                  <article className="plan-card" key={p.id}>
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="plan-img" src={p.image} alt={p.name} />
                    ) : (
                      <div className="plan-img" />
                    )}
                    <div className="plan-body">
                      {p.badge ? <span className="plan-badge">{p.badge}</span> : null}
                      <h3 className="plan-name">{p.name}</h3>
                      <p className="plan-price">£{Number(p.price).toFixed(2)}</p>
                      {desc ? <p className="plan-desc">{desc}</p> : null}
                      {feats.length > 0 ? (
                        <ul className="plan-feats">
                          {feats.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="plan-actions">
                        <a className="btn-p" href={href}>
                          {t("subscription_plans_cta", "View Plan & Buy")}
                        </a>
                        <button type="button" className="btn-s" onClick={() => onAdd(p)}>
                          {addedId === p.id ? "Added!" : "Add to Cart"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {!products.length ? (
              <p className="sub-lead">No active subscription plans are available right now. Please check back soon or contact us on WhatsApp.</p>
            ) : null}
            <div className="sub-ctas" style={{ marginTop: 22, justifyContent: "flex-start" }}>
              <a className="btn-s" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                {t("subscription_plans_help_cta", "Need Help Choosing?")}
              </a>
            </div>
            <p className="guarantee">
              {t(
                "subscription_guarantee_text",
                "7-day money-back guarantee available on 1 Year subscription plans and above. Terms apply."
              )}{" "}
              <a href="/refund-policy">Refund Policy</a>
            </p>
          </div>
        </section>

        <section className="sub-section alt">
          <div className="sub-wrap">
            <span className="sub-tag">Devices</span>
            <h2 className="sub-h2">{t("subscription_devices_title", "Compatible Devices")}</h2>
            <p className="sub-lead">{t("subscription_devices_intro", "")}</p>
            <div className="card-grid">
              {devices.map((d, i) => (
                <article className="sub-card" key={`${d.title}-${i}`}>
                  <div className="ico">{(d.icon || "DV").slice(0, 2)}</div>
                  <h3>{d.title}</h3>
                  <p>{d.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sub-section">
          <div className="sub-wrap">
            <span className="sub-tag">Process</span>
            <h2 className="sub-h2">{t("subscription_how_title", "How It Works")}</h2>
            <p className="sub-lead">{t("subscription_how_intro", "")}</p>
            <div className="how-list">
              {howSteps.map((s, i) => (
                <div className="how-item" key={`${s.title}-${i}`}>
                  <div className="how-left">
                    <div className="how-dot">{s.step || String(i + 1)}</div>
                    {i < howSteps.length - 1 ? <div className="how-line" /> : null}
                  </div>
                  <div className="how-content">
                    <h3>{s.title}</h3>
                    <p>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sub-section alt">
          <div className="sub-wrap">
            <span className="sub-tag">Guide</span>
            <h2 className="sub-h2">{t("subscription_rich_title", "About IPTV Subscriptions in the UK")}</h2>
            <div className="rich-block" dangerouslySetInnerHTML={{ __html: richHtml }} />
          </div>
        </section>

        <section className="sub-section">
          <div className="sub-wrap">
            <span className="sub-tag">FAQ</span>
            <h2 className="sub-h2">{t("subscription_faq_title", "Frequently Asked Questions")}</h2>
            <p className="sub-lead">{t("subscription_faq_intro", "")}</p>
            <div className="faq-list">
              {faqs.map((f) => (
                <details className="faq-item" key={f.id}>
                  <summary>
                    <span>{f.question}</span>
                  </summary>
                  <div className="faq-a">{f.answer}</div>
                </details>
              ))}
            </div>
            {!faqs.length ? <p className="sub-lead">FAQs will appear here once selected in the Content Editor.</p> : null}
          </div>
        </section>

        <section className="cta-band">
          <div className="cta-box">
            <h2>{t("subscription_cta_title", "Ready to start your subscription?")}</h2>
            <p>{t("subscription_cta_desc", "Pick a plan above or message us on WhatsApp for help.")}</p>
            <div className="sub-ctas">
              <a className="btn-p" href="#subscription-plans">
                {t("subscription_cta_primary", "View Subscription Plans")}
              </a>
              <a className="btn-s" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                {t("subscription_cta_wa", "Chat on WhatsApp")}
              </a>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
}
