"use client";
import { useState, useEffect } from "react";
import xss from "xss";
import { fixContentLinkRels } from "@/lib/seoLinks";
import { looksLikeHtml } from "@/lib/contentHtml";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { cms, cmsJson } from "@/lib/cms";

const richXss = {
  whiteList: {
    h1: [], h2: [], h3: [], h4: [],
    p: ["style", "class"],
    strong: [], em: [], u: [], s: [], b: [], i: [],
    ul: [], ol: [], li: [],
    blockquote: [],
    a: ["href", "target", "rel"],
    br: [], hr: [],
    span: ["style", "class"],
    div: ["style", "class"],
  } as Record<string, string[]>,
  stripIgnoreTag: true,
};

function renderRichOrPlain(htmlOrText: string, fallback: string) {
  const value = (htmlOrText || "").trim() || fallback;
  if (looksLikeHtml(value)) {
    return { __html: fixContentLinkRels(xss(value, richXss)) };
  }
  return { __html: xss(`<p>${value}</p>`, richXss) };
}

const styles = `
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body { background:#FFFFFF; color:#111111; font-family:var(--font-body); overflow-x:hidden; }

  nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:18px 60px;
    display:flex; align-items:center; justify-content:space-between;
    background:#FFFFFF; border-bottom:1px solid #E5E5E5; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
  .nav-logo { font-family:var(--font-logo); font-size:20px; font-weight:800; color:#111111;
    text-decoration:none; letter-spacing:2px; }
  .nav-links { display:flex; gap:36px; list-style:none; }
  .nav-links a { color:#111111; text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.2s; }
  .nav-links a:hover { color:#5B21B6; }
  .nav-cta { background:#5B21B6 !important; color:#FFFFFF !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; }
  .nav-cta:hover { background:#4C1D95 !important; }
  .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:6px; z-index:101; }
  .hamburger span { display:block; width:25px; height:2px; background:#111111; border-radius:2px; }
  @media(max-width:768px){
    nav{padding:16px 24px;}
    .nav-links{display:none;}
    .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;background:#FFFFFF;align-items:center;justify-content:center;gap:28px;z-index:9999;margin:0;padding:0;}
    .nav-links.open a{color:#111111;font-size:18px;}
    .hamburger{display:flex;}
  }

  .page-wrapper { padding-top:100px; min-height:100vh; background:#FFFFFF; }

  /* HERO — light bg, dark text */
  .about-hero { max-width:900px; margin:0 auto; padding:60px 24px 50px; text-align:center; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#5B21B6; margin-bottom:12px; display:block; font-weight:600; }
  .page-title { font-family:var(--font-display); font-size:clamp(1.8rem,3vw,2.5rem); font-weight:800; letter-spacing:-0.03em; color:#111111; margin-bottom:20px; line-height:1.1; }
  .page-title span { color:#5B21B6; -webkit-text-fill-color:#5B21B6; }
  .hero-text { font-size:clamp(15px,2vw,18px); color:#555555; line-height:1.8; max-width:700px; margin:0 auto 40px; }
  .hero-text p { margin:0 0 12px; }
  .hero-text a { color:#5B21B6; }
  .hero-text ul, .hero-text ol { text-align:left; margin:0 auto 12px; max-width:640px; padding-left:1.2em; }
  .hero-text strong { color:#111111; }

  /* STATS — white cards, dark text */
  .stats-bar { max-width:900px; margin:0 auto; padding:0 24px 70px;
    display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:20px; }
  .stat-card { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:18px; padding:28px 20px; text-align:center;
    box-shadow:0 2px 8px rgba(0,0,0,0.05); transition:all 0.3s; }
  .stat-card:hover { transform:translateY(-5px); border-color:#5B21B6; box-shadow:0 8px 24px rgba(91,33,182,0.12); }
  .stat-number { font-family:var(--font-display); font-size:36px; font-weight:800; color:#5B21B6; }
  .stat-label { font-size:12px; color:#666666; letter-spacing:2px; text-transform:uppercase; margin-top:6px; }

  /* STORY — light bg, dark text, light purple visual card */
  .story-section { max-width:1100px; margin:0 auto; padding:0 24px 80px;
    display:grid; grid-template-columns:1fr 1fr; gap:50px; align-items:center; }
  .story-text .section-tag { text-align:left; }
  .story-title { font-family:var(--font-display); font-size:clamp(24px,3vw,38px); font-weight:700; color:#111111; margin-bottom:20px; }
  .story-title span { color:#5B21B6; -webkit-text-fill-color:#5B21B6; }
  .story-para { font-size:15px; color:#444444; line-height:1.9; margin-bottom:16px; }
  .story-para p { margin:0 0 12px; }
  .story-para a { color:#5B21B6; }
  .story-para ul, .story-para ol { margin:0 0 12px; padding-left:1.2em; }
  .story-para strong { color:#111111; }
  .story-para h2, .story-para h3, .story-para h4 { color:#111111; font-family:var(--font-display); margin:0 0 10px; }
  .story-visual { background:#F5F3FF; border:1px solid #DDD6FE; border-radius:24px; padding:36px;
    display:flex; flex-direction:column; gap:16px; }
  .story-point { display:flex; gap:14px; align-items:flex-start; }
  .point-icon { font-size:24px; flex-shrink:0; margin-top:2px; }
  .point-text h4 { font-size:15px; font-weight:700; color:#111111; margin-bottom:4px; }
  .point-text p { font-size:13px; color:#555555; line-height:1.6; }

  /* VALUES — white cards, dark text */
  .values-section { background:#F5F5F5; padding:60px 0 80px; }
  .values-inner { max-width:1100px; margin:0 auto; padding:0 24px; }
  .section-header { margin-bottom:40px; }
  .section-title { font-family:var(--font-display); font-size:clamp(24px,3vw,38px); font-weight:700; color:#111111; }
  .section-title span { color:#5B21B6; -webkit-text-fill-color:#5B21B6; }
  .values-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:20px; }
  .value-card { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:16px; padding:28px 24px;
    box-shadow:0 1px 4px rgba(0,0,0,0.04); transition:all 0.3s; }
  .value-card:hover { transform:translateY(-4px); border-color:#5B21B6; box-shadow:0 8px 24px rgba(91,33,182,0.1); }
  .value-icon { font-size:32px; margin-bottom:14px; display:block; }
  .value-title { font-family:var(--font-display); font-size:16px; font-weight:700; color:#111111; margin-bottom:8px; }
  .value-desc { font-size:14px; color:#666666; line-height:1.7; }

  /* TIMELINE — light bg, dark text */
  .timeline-section { max-width:800px; margin:0 auto; padding:60px 24px 80px; }
  .timeline { display:flex; flex-direction:column; gap:0; margin-top:40px; }
  .timeline-item { display:flex; gap:20px; }
  .tl-left { display:flex; flex-direction:column; align-items:center; width:40px; flex-shrink:0; }
  .tl-dot { width:40px; height:40px; border-radius:50%; flex-shrink:0;
    background:#5B21B6; display:flex; align-items:center; justify-content:center; font-size:16px;
    box-shadow:0 4px 12px rgba(91,33,182,0.3); }
  .tl-line { width:2px; flex:1; min-height:20px; background:#E5E5E5; margin:4px 0; }
  .tl-content { padding:4px 0 32px; flex:1; }
  .tl-year { font-size:11px; letter-spacing:3px; text-transform:uppercase; color:#5B21B6; margin-bottom:6px; font-weight:600; }
  .tl-title { font-family:var(--font-display); font-size:17px; font-weight:700; color:#111111; margin-bottom:6px; }
  .tl-desc { font-size:14px; color:#555555; line-height:1.6; }

  /* CTA — DARK section (like homepage CTA) */
  .cta-section { margin:0 60px 80px; }
  .cta-box { background:#111111; border-radius:20px; padding:70px 60px; text-align:center; }
  .cta-title { font-family:var(--font-display); font-size:clamp(22px,3vw,36px); font-weight:700; color:#FFFFFF; margin-bottom:14px; }
  .cta-sub { color:rgba(255,255,255,0.65); font-size:15px; margin-bottom:36px; }
  .cta-btns { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; }
  .btn-primary { background:#5B21B6; color:#FFFFFF; padding:15px 40px; border-radius:8px;
    font-size:14px; font-weight:600; letter-spacing:1px; text-transform:uppercase; text-decoration:none;
    transition:all 0.2s; display:inline-block; }
  .btn-primary:hover { background:#4C1D95; transform:translateY(-2px); box-shadow:0 4px 14px rgba(91,33,182,0.4); }
  .btn-secondary { background:transparent; color:#FFFFFF; padding:15px 40px; border-radius:8px;
    font-size:14px; font-weight:600; letter-spacing:1px; text-transform:uppercase;
    text-decoration:none; border:2px solid rgba(255,255,255,0.4); transition:all 0.2s; display:inline-block; }
  .btn-secondary:hover { background:rgba(255,255,255,0.08); border-color:#FFFFFF; transform:translateY(-2px); }

  /* FOOTER — dark */
  footer { background:#111111; padding:50px 60px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; }
  .footer-logo { font-family:var(--font-display); font-size:17px; font-weight:800; color:#FFFFFF; }
  .footer-links { display:flex; gap:24px; list-style:none; flex-wrap:wrap; }
  .footer-links a { color:rgba(255,255,255,0.6); text-decoration:none; font-size:13px; transition:color 0.2s; }
  .footer-links a:hover { color:#FFFFFF; }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.4); }

  .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px;
    border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
  .whatsapp-btn:hover { transform:scale(1.1); }

  @media(max-width:768px){
    .story-section{grid-template-columns:1fr;gap:30px;}
    .cta-section{margin:0 16px 60px;}
    .cta-box{padding:48px 24px;}
    footer{padding:36px 24px;flex-direction:column;text-align:center;}
  }
`;

export default function AboutPage() {
  const [sc, setSc] = useState<Record<string,string>>({});

  useEffect(() => {
    fetch("/api/site-content?page=all").then(r=>r.json()).then(d=>{ if(d&&typeof d==="object") setSc(d); }).catch(()=>{});
  }, []);

  const t = (key: string, fallback = "") => cms(sc, key, fallback);
  const stats = cmsJson(sc, "about_stats_json", []);
  const points = cmsJson(sc, "about_points_json", []);
  const values = cmsJson(sc, "about_values_json", []);
  const timeline = cmsJson(sc, "about_timeline_json", []);

  return (
    <>
      <style>{styles}</style>

      <Navbar cta="shop" shopHref="/" />

      <div className="page-wrapper">

        {/* HERO */}
        <div className="about-hero">
          <div className="section-tag">✦ {t("about_hero_tag", "Our Story")}</div>
          <h1 className="page-title">{t("about_title", "About Firestick4UK")}{t("about_title_accent", "") ? (<><br /><span>{t("about_title_accent", "")}</span></>) : null}</h1>
          <div
            className="hero-text"
            dangerouslySetInnerHTML={renderRichOrPlain(
              sc.about_description || "",
              "Firestick4UK supplies streaming devices and subscription plans for customers across the UK."
            )}
          />
        </div>

        {/* STATS */}
        {stats.length > 0 ? (
        <div className="stats-bar">
          {stats.map((s: any, i: number) => (
            <div className="stat-card" key={i}>
              <div className="stat-number">{s.num || s.number}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
        ) : null}

        {/* STORY */}
        <div className="story-section">
          <div className="story-text">
            <div className="section-tag">✦ {t("about_who_tag", "Who We Are")}</div>
            <h2 className="story-title">{t("about_story_title", "Built on")} <span>{t("about_story_accent", "Trust")}</span></h2>
            <div
              className="story-para"
              dangerouslySetInnerHTML={renderRichOrPlain(
                sc.about_mission || "",
                "We focus on clear product options, straightforward ordering, and practical support for UK customers."
              )}
            />
            {t("about_story_html", "") ? (
            <div
              className="story-para"
              dangerouslySetInnerHTML={renderRichOrPlain(
                t("about_story_html", ""),
                ""
              )}
            />
            ) : null}
          </div>
          {points.length > 0 ? (
          <div className="story-visual">
            {points.map((p: any, i: number) => (
              <div className="story-point" key={i}>
                <span className="point-icon">{p.icon}</span>
                <div className="point-text">
                  <h4>{p.title}</h4>
                  <p>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
          ) : null}
        </div>

        {/* VALUES */}
        {values.length > 0 ? (
        <div className="values-section">
          <div className="values-inner">
          <div className="section-header">
            <div className="section-tag">✦ {t("about_values_tag", "What We Stand For")}</div>
            <h2 className="section-title">{t("about_values_title", "Our")} <span>{t("about_values_accent", "Values")}</span></h2>
          </div>
          <div className="values-grid">
            {values.map((v: any, i: number) => (
              <div className="value-card" key={i}>
                <span className="value-icon">{v.icon}</span>
                <div className="value-title">{v.title}</div>
                <div className="value-desc">{v.desc}</div>
              </div>
            ))}
          </div>
          </div>
        </div>
        ) : null}

        {/* TIMELINE */}
        {timeline.length > 0 ? (
        <div className="timeline-section">
          <div className="section-tag">✦ {t("about_journey_tag", "Our Journey")}</div>
          <h2 className="section-title">{t("about_journey_title", "How We")} <span>{t("about_journey_accent", "Grew")}</span></h2>
          <div className="timeline">
            {timeline.map((item: any, i: number) => (
              <div className="timeline-item" key={i}>
                <div className="tl-left">
                  <div className="tl-dot">{item.icon}</div>
                  {i < timeline.length - 1 && <div className="tl-line" />}
                </div>
                <div className="tl-content">
                  <div className="tl-year">{item.year}</div>
                  <div className="tl-title">{item.title}</div>
                  <div className="tl-desc">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        ) : null}

        {/* CTA */}
        <div className="cta-section">
          <div className="cta-box">
            <h2 className="cta-title">{t("about_cta_title", "Ready to Shop With Us?")}</h2>
            <p className="cta-sub">{t("about_cta_subtitle", "Browse our products or get in touch if you need help choosing.")}</p>
            <div className="cta-btns">
              <a href={t("about_cta_btn1_link", "/products")} className="btn-primary">{t("about_cta_btn1", "Browse Products")}</a>
              <a href={t("about_cta_btn2_link", "/contact")} className="btn-secondary">{t("about_cta_btn2", "Get In Touch")}</a>
            </div>
          </div>
        </div>

        <Footer />
      </div>

    </>
  );
}