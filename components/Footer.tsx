"use client";

import { useSiteContent } from "@/hooks/useSiteContent";

export default function Footer() {
  const { t } = useSiteContent();
  const logo = t("footer_logo_text", t("site_title", "FIRESTICK4UK")).toUpperCase();
  const copy = t("footer_text", "© 2026 Firestick4UK. All rights reserved.");
  const tagline = t("footer_tagline", "");
  const fb = t("social_facebook", "");
  const ig = t("social_instagram", "");
  const yt = t("social_youtube", "");
  const tk = t("social_tiktok", "");

  const links = [
    { href: t("footer_privacy_link", "/privacy-policy"), label: t("footer_privacy_text", "Privacy Policy") },
    { href: t("footer_terms_link", "/terms"), label: t("footer_terms_text", "Terms & Conditions") },
    { href: t("footer_refund_link", "/refund-policy"), label: t("footer_refund_text", "Refund Policy") },
    { href: t("footer_faq_link", "/faq"), label: t("footer_faq_text", "FAQ") },
  ];

  return (
    <>
      <style>{`
        .site-footer {
          background:#111111; padding:50px 60px;
          display:flex; justify-content:space-between; align-items:center;
          flex-wrap:wrap; gap:20px;
        }
        .site-footer .footer-logo {
          font-family:var(--font-display); font-size:17px; font-weight:800; color:#FFFFFF;
        }
        .site-footer .footer-tagline { font-size:12px; color:rgba(255,255,255,0.45); margin-top:4px; }
        .site-footer .footer-links { display:flex; gap:24px; list-style:none; flex-wrap:wrap; margin:0; padding:0; }
        .site-footer .footer-links a { color:rgba(255,255,255,0.6); text-decoration:none; font-size:13px; transition:color 0.2s; }
        .site-footer .footer-links a:hover { color:#FFFFFF; }
        .site-footer .footer-copy { font-size:12px; color:rgba(255,255,255,0.4); }
        .site-footer .footer-social { display:flex; gap:12px; }
        .site-footer .footer-social a { color:rgba(255,255,255,0.7); font-size:13px; text-decoration:none; }
        .site-footer .footer-social a:hover { color:#FFFFFF; }
        @media(max-width:768px){
          .site-footer { padding:36px 24px; flex-direction:column; text-align:center; }
          .site-footer .footer-links { justify-content:center; }
          .site-footer .footer-social { justify-content:center; }
        }
      `}</style>
      <footer className="site-footer">
        <div>
          <div className="footer-logo">{logo}</div>
          {tagline ? <div className="footer-tagline">{tagline}</div> : null}
        </div>
        <ul className="footer-links">
          {links.map((l) => (
            <li key={l.href}><a href={l.href}>{l.label}</a></li>
          ))}
        </ul>
        {(fb || ig || yt || tk) && (
          <div className="footer-social">
            {fb ? <a href={fb} target="_blank" rel="noopener noreferrer">Facebook</a> : null}
            {ig ? <a href={ig} target="_blank" rel="noopener noreferrer">Instagram</a> : null}
            {yt ? <a href={yt} target="_blank" rel="noopener noreferrer">YouTube</a> : null}
            {tk ? <a href={tk} target="_blank" rel="noopener noreferrer">TikTok</a> : null}
          </div>
        )}
        <div className="footer-copy">{copy}</div>
      </footer>
    </>
  );
}
