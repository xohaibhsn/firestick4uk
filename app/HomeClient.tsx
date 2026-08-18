"use client";
import { useEffect, useState } from "react";
import xss from "xss";
import { fixContentLinkRels } from "@/lib/seoLinks";
import { looksLikeHtml, plainLinesToListHtml } from "@/lib/contentHtml";
import { useCart } from "./lib/cartContext";
import Navbar from "@/components/Navbar";
import HeroSlider from "@/components/HeroSlider";
import Footer from "@/components/Footer";
import { cms } from "@/lib/cms";

const cardDescXss = {
  whiteList: {
    p: [], strong: [], em: [], u: [],
    br: [], span: [], a: ["href"],
    ul: [], ol: [], li: [],
  } as Record<string, string[]>,
  stripIgnoreTag: true,
};

const richContentXss = {
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

interface Product {
  id: number;
  name: string;
  description: string;
  short_description?: string | null;
  slug?: string | null;
  price: number;
  badge: string | null;
  image: string | null;
}

interface HomeClientProps {
  topHeroTitle?: string;
  topHeroSubtitle?: string;
  heroTitle?: string;
  heroSubtitle?: string;
}

function formatHeroTitle(title: string) {
  const words = title.trim().split(/\s+/);
  if (words.length <= 2) {
    return <>{title}</>;
  }
  const lead = words.slice(0, -2).join(" ");
  const accent = words.slice(-2).join(" ");
  return (
    <>
      {lead}
      <br />
      <span>{accent}</span>
    </>
  );
}

export default function HomeClient({
  topHeroTitle = "Best Firestick Service in UK",
  topHeroSubtitle = "Premium Streaming Solutions for the UK",
  heroTitle = "Premium UK Streaming Service",
  heroSubtitle = "Firestick4UK provides premium UK streaming services for Firestick and Android Box users.",
}: HomeClientProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [hoveringId, setHoveringId] = useState<number | null>(null);
  const [slides, setSlides] = useState<string[]>([]);
  const [featureList, setFeatureList] = useState<string[]>([
    "HD & 4K Streaming Quality",
    "Live Sports & Entertainment",
    "Movies & TV Series On Demand",
    "Catch-up TV Available",
    "Compatible with All Devices",
    "Fast Setup & Activation",
    "24/7 Customer Support",
    "UK Based Service",
    "Easy Remote Setup Help",
    "No Hidden Fees",
    "Same-Day Order Processing",
    "Secure Payment Options",
    "Multi-Device Compatibility",
    "Regular Channel Updates",
  ]);
  const [cmsData, setCmsData] = useState<Record<string, string>>({});
  const [featuresHtml, setFeaturesHtml] = useState("");
  const [heroBtns, setHeroBtns] = useState({
    primaryText: "Shop Now",
    primaryLink: "/products",
    primaryShow: true,
    secondaryText: "Learn More",
    secondaryLink: "/about",
    secondaryShow: true,
  });
  const [heroStats, setHeroStats] = useState([
    { num: "500+", label: "Happy Customers" },
    { num: "4.9★", label: "Average Rating" },
    { num: "24/7", label: "Support" },
  ]);
  const { addToCart, removeFromCart, cart } = useCart();

  const t = (key: string, fallback = "") => cms(cmsData, key, fallback);
  const handleSearch = () => {
    const q = searchTerm.trim();
    if (q) window.location.href = `/products?q=${encodeURIComponent(q)}`;
  };

  // Section data from DB
  const [sec, setSec] = useState<Record<string,any>>({
    home_hero: { title:"Premium UK Streaming Service", subtitle:"Firestick4UK provides premium UK streaming services for Firestick and Android Box users.", button_text:"Shop Now", button_link:"/products", secondary_button_text:"Learn More", secondary_button_link:"/about" },
    home_features: { title:"Why Choose Us", items:[{icon:"⚡",title:"Fast Setup",description:"Ready in minutes"},{icon:"🔒",title:"Secure",description:"Safe & reliable"},{icon:"💬",title:"24/7 Support",description:"Always here for you"},{icon:"🚀",title:"Fast Delivery",description:"Quick & efficient"}] },
    home_testimonials: { title:"What Our Customers Say", items:[{name:"John Smith",rating:5,text:"Amazing service!"},{name:"Sarah Jones",rating:5,text:"Best firestick service in UK!"}] },
    home_newsletter: { title:"Stay in the Loop", subtitle:"Get the latest guides, tips and offers", button_text:"Subscribe" },
  });

  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => { setProducts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
    fetch('/api/sections?page=home')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map: Record<string,any> = {};
          data.forEach(s => { map[s.key] = s.data; });
          setSec(prev => ({ ...prev, ...map }));
        }
      })
      .catch(() => {});
    fetch('/api/site-content?page=all')
      .then(r => r.json())
      .then(data => {
        if (!data || typeof data !== 'object') return;
        setCmsData(data);
        const slideUrls = [
          data.hero_slide_1,
          data.hero_slide_2,
          data.hero_slide_3,
          data.hero_slide_4,
        ].filter((u): u is string => typeof u === 'string' && !!u.trim());
        setSlides(slideUrls);
        if (typeof data.home_features_list === 'string' && data.home_features_list.trim()) {
          const raw = data.home_features_list.trim();
          if (looksLikeHtml(raw)) {
            setFeaturesHtml(raw);
            setFeatureList([]);
          } else {
            const items = raw
              .split(/\r?\n/)
              .map((s: string) => s.trim())
              .filter(Boolean);
            if (items.length) {
              setFeatureList(items);
              setFeaturesHtml(plainLinesToListHtml(raw));
            }
          }
        }
        setHeroBtns({
          primaryText: (data.home_hero_btn_text || "").trim() || "Shop Now",
          primaryLink: (data.home_hero_btn_link || "").trim() || "/products",
          primaryShow: data.home_hero_btn_show !== "0",
          secondaryText: (data.home_hero_btn2_text || "").trim() || "Learn More",
          secondaryLink: (data.home_hero_btn2_link || "").trim() || "/about",
          secondaryShow: data.home_hero_btn2_show !== "0",
        });
        setHeroStats([
          {
            num: (data.home_stat1_num || "").trim() || "500+",
            label: (data.home_stat1_label || "").trim() || "Happy Customers",
          },
          {
            num: (data.home_stat2_num || "").trim() || "4.9★",
            label: (data.home_stat2_label || "").trim() || "Average Rating",
          },
          {
            num: (data.home_stat3_num || "").trim() || "24/7",
            label: (data.home_stat3_label || "").trim() || "Support",
          },
        ]);
      })
      .catch(() => {});
    return () => {};
  }, []);

  const handleAddToCart = (p: Product) => {
    addToCart({ id: p.id, name: p.name, price: Number(p.price), qty: 1 });
    setAdded(p.id);
    setTimeout(() => setAdded(null), 1500);
  };

  return (
    <>
      <style>{`
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        :root { --purple:#5B21B6; --purple-dark:#4C1D95; --black:#1A1A1A; --text:#111111; --border:#E5E5E5; --gray:#F5F5F5; --gray-text:#666666; }
        body { background:#FFFFFF; color:#111111; font-family:var(--font-body); overflow-x:hidden; }
        nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:18px 60px; display:flex; align-items:center; justify-content:space-between; background:#FFFFFF; border-bottom:1px solid #E5E5E5; box-shadow:0 1px 4px rgba(0,0,0,0.06); transition:all 0.3s; }
        .nav-logo { font-family:var(--font-logo); font-size:20px; font-weight:800; color:#111111; text-decoration:none; letter-spacing:2px; }
        .nav-links { display:flex; gap:36px; list-style:none; }
        .nav-links a { color:#111111; text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.2s; }
        .nav-links a:hover { color:#5B21B6; }
        .nav-cta { background:#5B21B6 !important; color:#FFFFFF !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; }
        .nav-cta:hover { background:#1A1A1A !important; }
        .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:5px; z-index:101; }
        .hamburger span { display:block; width:25px; height:2px; background:#111111; border-radius:2px; }
        .page-wrapper { position:relative; z-index:1; padding-top:80px; background:#FFFFFF; }
        /* SEO HERO — clean, above products */
        /* SEO HERO SLIDER */
        .home-seo-hero { display:none; }
        .slider-hero-inner { max-width:640px; }
        .slider-hero-inner h1 {
          font-family:var(--font-display);
          font-size:clamp(2rem,4vw,3.2rem);
          font-weight:800;
          letter-spacing:-0.02em;
          color:#FFFFFF !important;
          -webkit-text-fill-color:#FFFFFF !important;
          line-height:1.1;
          margin:0 0 14px;
          text-shadow:0 2px 8px rgba(0,0,0,0.8);
        }
        .slider-hero-inner h1 span,
        .slider-hero-inner h1 * {
          color:#FFFFFF !important;
          -webkit-text-fill-color:#FFFFFF !important;
        }
        .slider-hero-inner h1 span {
          color:#c4b5fd !important;
          -webkit-text-fill-color:#c4b5fd !important;
          text-shadow:0 2px 8px rgba(0,0,0,0.8);
        }
        .slider-hero-inner p {
          font-family:var(--font-body);
          font-size:clamp(0.95rem,1.5vw,1.1rem);
          font-weight:400;
          color:rgba(255,255,255,0.95) !important;
          -webkit-text-fill-color:rgba(255,255,255,0.95) !important;
          line-height:1.7;
          margin:0 0 28px;
          max-width:500px;
          text-shadow:0 1px 4px rgba(0,0,0,0.8);
        }
        .slider-hero-btns { display:flex; gap:14px; flex-wrap:wrap; }
        .slider-btn-primary {
          font-family:var(--font-body);
          background:#5B21B6; color:#FFFFFF;
          padding:14px 32px; border-radius:50px;
          font-size:14px; font-weight:600; letter-spacing:0.01em;
          text-decoration:none; display:inline-block; transition:all 0.2s;
        }
        .slider-btn-primary:hover { background:#4C1D95; transform:translateY(-1px); }
        .slider-btn-secondary {
          font-family:var(--font-body);
          background:rgba(255,255,255,0.15);
          border:2px solid rgba(255,255,255,0.6);
          color:#FFFFFF; padding:14px 32px; border-radius:50px;
          font-size:14px; font-weight:600; letter-spacing:0.01em;
          text-decoration:none; display:inline-block;
          backdrop-filter:blur(4px); transition:all 0.2s;
        }
        .slider-btn-secondary:hover { background:rgba(255,255,255,0.25); }
        /* PRODUCTS HEADER */
        .products-header { max-width:1300px; margin:0 auto; padding:50px 60px 28px; display:flex; justify-content:space-between; align-items:flex-end; }
        .products-header-left {}
        .section-tag { font-family:var(--font-body); font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#5B21B6; margin-bottom:10px; display:block; font-weight:700; }
        .section-title { font-family:var(--font-display); font-size:clamp(1.5rem,2.5vw,2.2rem); font-weight:800; letter-spacing:-0.02em; color:#111111; }
        .section-title span { color:#5B21B6; }
        .view-all-link { font-size:13px; font-weight:600; color:#5B21B6; text-decoration:none; border:1px solid #5B21B6; padding:8px 20px; border-radius:8px; transition:all 0.2s; white-space:nowrap; }
        .view-all-link:hover { background:#5B21B6; color:#FFFFFF; }
        .search-wrap { max-width:1300px; margin:0 auto; padding:0 60px 28px; }
        .search-bar { display:flex; align-items:center; gap:10px; background:#FFFFFF; border:2px solid #E5E5E5; border-radius:50px; padding:6px 6px 6px 24px; transition:border-color 0.2s; }
        .search-bar:focus-within { border-color:#5B21B6; }
        .search-input { flex:1; border:none; outline:none; font-size:16px; color:#111111; background:transparent; font-family:var(--font-body); padding:8px 0; }
        .search-input::placeholder { color:#AAAAAA; }
        .search-btn { background:#5B21B6; color:#FFFFFF; border:none; border-radius:50px; padding:12px 28px; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; white-space:nowrap; font-family:var(--font-body); }
        .search-btn:hover { background:#1A1A1A; }
        .products-grid { max-width:1300px; margin:0 auto; padding:0 60px 20px; display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:22px; }
        .products-grid > * { min-width:0; }
        .view-all-wrap { max-width:1300px; margin:0 auto; padding:20px 60px 50px; text-align:center; }
        .view-all-btn { display:inline-block; background:#111111; color:#FFFFFF; padding:14px 40px; border-radius:8px; font-size:14px; font-weight:600; text-decoration:none; transition:all 0.2s; }
        .view-all-btn:hover { background:#5B21B6; transform:translateY(-1px); }
        /* HERO — LIGHT SECTION (combined scroll + stats outside) */
        .hero-outer { background:#FFFFFF; border-top:1px solid #E5E5E5; }
        .hero {
          background:transparent;
          padding:56px 60px 64px;
          max-width:1300px;
          margin:0 auto;
          display:block;
        }
        .hero-combined {
          border:1px solid #E5E5E5;
          border-radius:16px;
          background:linear-gradient(180deg,#FFFFFF 0%,#FAFAFA 100%);
          overflow:hidden;
          box-shadow:0 4px 24px rgba(0,0,0,0.04);
        }
        .hero-combined-scroll {
          height: 420px;
          max-height: 420px;
          overflow-x: hidden;
          overflow-y: auto;
          scroll-behavior: smooth;
          padding: 36px 40px 32px;
          box-sizing: border-box;
          -webkit-overflow-scrolling: touch;
          display: flex;
          flex-direction: column;
          gap: 0;
          align-items: stretch;
        }
        .hero-combined-scroll::-webkit-scrollbar { width: 5px; }
        .hero-combined-scroll::-webkit-scrollbar-track { background: #F3F4F6; border-radius: 4px; }
        .hero-combined-scroll::-webkit-scrollbar-thumb { background: #5B21B6; border-radius: 4px; }
        .hero-content { max-width: 820px; }
        .hero-tag { font-family:var(--font-body); font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#5B21B6; margin-bottom:14px; display:block; font-weight:700; }
        .hero-title { font-family:var(--font-display); font-size:clamp(1.7rem,3.2vw,2.5rem); font-weight:800; letter-spacing:-0.02em; color:#111111 !important; -webkit-text-fill-color:#111111 !important; line-height:1.15; margin-bottom:16px; }
        .hero-title span { color:#5B21B6 !important; -webkit-text-fill-color:#5B21B6 !important; }
        .hero-subtitle { font-family:var(--font-body); font-size:clamp(0.95rem,1.6vw,1.15rem); font-weight:400; color:#64748b; line-height:1.7; margin-bottom:22px; max-width:720px; }
        .hero-btns { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:0; }
        .hero-btn-primary { font-family:var(--font-body); background:#5B21B6; color:#FFFFFF; padding:14px 28px; border-radius:8px; font-size:14px; font-weight:600; letter-spacing:0.01em; text-decoration:none; transition:all 0.2s; display:inline-block; }
        .hero-btn-primary:hover { background:#4C1D95; transform:translateY(-2px); box-shadow:0 6px 20px rgba(91,33,182,0.35); }
        .hero-btn-secondary { font-family:var(--font-body); background:#111111; color:#FFFFFF; padding:14px 28px; border-radius:8px; font-size:14px; font-weight:600; letter-spacing:0.01em; text-decoration:none; transition:all 0.2s; display:inline-block; }
        .hero-btn-secondary:hover { background:#5B21B6; transform:translateY(-2px); }
        .hero-features-wrap {
          min-width: 0;
          width: 100%;
          max-width: 820px;
          margin: 28px 0 0;
          padding: 28px 0 0;
          border-top: 1px solid #E5E5E5;
        }
        .hero-service-content {
          font-family: var(--font-body);
          font-size: 16px;
          font-weight: 500;
          color: #374151;
          line-height: 1.75;
        }
        .hero-service-content h1,
        .hero-service-content h2,
        .hero-service-content h3,
        .hero-service-content h4 {
          font-family: var(--font-display);
          color: #111111;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.3;
          margin: 0 0 12px;
        }
        .hero-service-content h2 { font-size: 1.35rem; }
        .hero-service-content h3 { font-size: 1.15rem; }
        .hero-service-content h4 { font-size: 1.05rem; }
        .hero-service-content p { margin: 0 0 14px; }
        .hero-service-content p:last-child { margin-bottom: 0; }
        .hero-service-content ul,
        .hero-service-content ol { margin: 0 0 14px; padding-left: 1.25em; }
        .hero-service-content li { margin-bottom: 8px; }
        .hero-service-content a { color: #5B21B6; text-decoration: underline; }
        .hero-service-content strong, .hero-service-content b { color: #111111; font-weight: 700; }
        .hero-service-content blockquote {
          margin: 0 0 14px;
          padding: 10px 14px;
          border-left: 3px solid #5B21B6;
          background: #F5F3FF;
          color: #4C1D95;
        }
        .hero-features {
          display:grid;
          grid-template-columns:1fr;
          gap:12px;
          align-content:start;
        }
        .hero-features.feature-list {
          height: auto;
          max-height: none;
          overflow: visible;
          padding: 0;
          border: none;
          border-radius: 0;
          background: transparent;
        }
        .hero-feature-item {
          display:flex;
          align-items:flex-start;
          gap:10px;
          font-family:var(--font-body);
          font-size:15px;
          font-weight:500;
          color:#374151;
          line-height:1.45;
          padding:8px 12px;
          background:#FFFFFF;
          border:1px solid #EEE;
          border-radius:10px;
        }
        .hero-feature-check {
          flex-shrink:0;
          width:20px;
          height:20px;
          margin-top:1px;
          color:#16A34A;
          font-size:16px;
          line-height:1;
        }
        .hero-stats {
          display:flex;
          justify-content:center;
          gap:48px;
          margin-top:28px;
          padding:22px 16px 0;
          border-top:1px solid #E5E5E5;
          text-align:center;
        }
        .stat-item { min-width: 110px; }
        .stat-num { font-family:var(--font-display); font-size:2rem; font-weight:800; color:#111111; letter-spacing:-0.02em; display:block; }
        .stat-label { font-family:var(--font-body); font-size:0.75rem; font-weight:600; color:#64748b; letter-spacing:0.08em; text-transform:uppercase; }
        /* FEATURES — LIGHT SECTION */
        .features-outer { background:#F5F5F5; }
        .product-card { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:12px; overflow:hidden; transition:all 0.3s; cursor:pointer; position:relative; box-shadow:0 2px 8px rgba(0,0,0,0.06); min-width:0; }
        .product-card:hover { transform:translateY(-4px); box-shadow:0 8px 24px rgba(0,0,0,0.12); border-color:#5B21B6; }
        .product-image { width:100%; aspect-ratio:1/1; background:#F5F5F5; border-bottom:1px solid #E5E5E5; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden; }
        .product-image img { width:100%; height:100%; object-fit:cover; }
        .image-placeholder { display:flex; flex-direction:column; align-items:center; gap:10px; color:#CCCCCC; }
        .image-placeholder svg { width:48px; height:48px; opacity:0.4; }
        .image-placeholder span { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#AAAAAA; }
        .badge { position:absolute; top:10px; right:10px; z-index:2; background:#5B21B6; color:#FFFFFF; font-size:10px; font-weight:700; padding:4px 10px; border-radius:20px; }
        .badge.gold { background:#1A1A1A; color:#FFFFFF; }
        .badge.new { background:#16A34A; color:#FFFFFF; }
        .badge.bundle { background:#EA580C; color:#FFFFFF; }
        .product-info { padding:16px 18px; }
        .product-name { font-family:var(--font-display); font-size:15px; font-weight:700; letter-spacing:-0.01em; color:#111111; margin-bottom:6px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; word-break:break-word; }
        .product-desc,.product-short-desc { font-family:var(--font-body); font-size:14px; font-weight:400; color:#374151; line-height:1.7; margin-bottom:14px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
        .product-short-desc p { margin:0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; font-size:14px; color:#374151; font-family:var(--font-body); }
        .product-short-desc strong,.product-desc strong { font-weight:700; color:#333333; }
        .product-short-desc a,.product-desc a { color:#5B21B6; text-decoration:none; }
        .product-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .product-price { font-size:1.3rem; font-weight:800; letter-spacing:-0.02em; color:#111111; font-family:var(--font-display); white-space:nowrap; }
        .add-btn { font-family:var(--font-body); background:#5B21B6; color:#FFFFFF; border:none; padding:9px 18px; border-radius:8px; font-size:13px; font-weight:600; letter-spacing:0.01em; cursor:pointer; transition:all 0.2s; white-space:nowrap; }
        .add-btn:hover { background:#1A1A1A; transform:translateY(-1px); }
        .add-btn.added { background:#16A34A; }
        .loading { text-align:center; padding:60px; color:#666666; font-size:18px; }
        .features-section { max-width:1300px; margin:0 auto; padding:60px 60px 70px; background:transparent; }
        .features-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin-top:40px; }
        .feature-item { padding:28px 24px; border-radius:12px; background:#FFFFFF; border:1px solid #E5E5E5; transition:all 0.3s; }
        .feature-item:hover { box-shadow:0 4px 16px rgba(0,0,0,0.08); transform:translateY(-2px); border-color:#5B21B6; }
        .feature-icon { font-size:28px; margin-bottom:14px; display:block; }
        .feature-title { font-weight:700; font-size:15px; color:#111111; margin-bottom:7px; }
        .feature-desc { font-size:13px; color:#666666; line-height:1.6; }
        footer { background:#111111; padding:50px 60px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; }
        .footer-logo { font-family:var(--font-display); font-size:17px; font-weight:800; color:#FFFFFF; }
        .footer-links { display:flex; gap:24px; list-style:none; flex-wrap:wrap; }
        .footer-links a { color:rgba(255,255,255,0.6); text-decoration:none; font-size:13px; transition:color 0.2s; }
        .footer-links a:hover { color:#FFFFFF; }
        .footer-copy { font-size:12px; color:rgba(255,255,255,0.4); }
        .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px; border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
        .whatsapp-btn:hover { transform:scale(1.1); }
        @media (max-width: 1024px) and (min-width: 641px) {
          .slider-hero-inner h1 { font-size: clamp(1.8rem, 3.5vw, 2.4rem); }
        }
        @media(max-width:768px){
          nav{padding:16px 24px;}
          .nav-links{display:none;}
          .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;background:#FFFFFF;align-items:center;justify-content:center;gap:28px;z-index:9999;margin:0;padding:0;}
          .nav-links.open a{font-size:18px;color:#111111;}
          .hamburger{display:flex;}
          .home-seo-hero{padding:28px 16px 12px;}
          .home-seo-hero h1{font-size:1.75rem;}
          .home-seo-hero p{font-size:1rem;}
          .slider-hero-inner h1{font-size:clamp(1.6rem,5vw,2rem);}
          .slider-hero-inner p{
            display:block;
            margin:0 0 20px;
            font-size:0.95rem;
            line-height:1.55;
            max-width:100%;
          }
          .slider-hero-btns{flex-direction:column;gap:10px;}
          .slider-btn-primary,.slider-btn-secondary{width:100%;text-align:center;box-sizing:border-box;}
          .products-header{padding:28px 16px 16px;flex-direction:column;align-items:flex-start;gap:12px;}
          .search-wrap{padding:0 16px 16px;}
          .search-bar{padding:5px 5px 5px 16px;}
          .search-input{font-size:14px;}
          .search-btn{padding:10px 16px;font-size:13px;}
          .products-grid{grid-template-columns:repeat(2,1fr);gap:12px;padding:0 12px 16px;}
          .product-info{padding:10px 12px;}
          .product-name{font-size:12px;}
          .product-desc,.product-short-desc{font-size:11px;margin-bottom:8px;}
          .product-short-desc p{font-size:11px;}
          .product-price{font-size:14px;}
          .add-btn{padding:7px 10px;font-size:11px;}
          .badge{font-size:9px;padding:3px 7px;top:6px;right:6px;}
          .view-all-wrap{padding:14px 16px 36px;}
          .hero{padding:36px 16px 44px;}
          .hero-combined-scroll{
            height:380px;
            max-height:380px;
            overflow-x:hidden;
            overflow-y:auto;
            padding:24px 18px 22px;
          }
          .hero-features-wrap{
            margin-top:22px;
            padding-top:22px;
            max-width:none;
          }
          .hero-service-content{font-size:15px;line-height:1.7;}
          .hero-features{grid-template-columns:1fr;}
          .hero-stats{gap:20px;flex-wrap:wrap;margin-top:22px;justify-content:space-around;}
          .features-section{padding:40px 24px 50px;}
          footer{padding:36px 24px;flex-direction:column;text-align:center;}
        }
        @media (max-width: 640px) {
          .hero-combined-scroll {
            height: 360px;
            max-height: 360px;
            padding: 20px 14px 18px;
          }
          .hero-content { max-width: none; }
          .hero-subtitle { max-width: none; }
          .hero-btns { flex-direction: column; }
          .hero-btn-primary, .hero-btn-secondary { width: 100%; text-align: center; box-sizing: border-box; }
          .hero-stats { gap: 16px; }
          .stat-item { min-width: 90px; }
          .stat-num { font-size: 1.6rem; }
        }
      `}</style>

      <Navbar cartCount={cart.length} cta="cart" />

      <div className="page-wrapper">
        <HeroSlider slides={slides}>
          <div className="slider-hero-inner">
            <h1>{formatHeroTitle(topHeroTitle)}</h1>
            <p>{topHeroSubtitle}</p>
            {(heroBtns.primaryShow || heroBtns.secondaryShow) && (
              <div className="slider-hero-btns">
                {heroBtns.primaryShow && (
                  <a href={heroBtns.primaryLink} className="slider-btn-primary">
                    {heroBtns.primaryText} →
                  </a>
                )}
                {heroBtns.secondaryShow && (
                  <a href={heroBtns.secondaryLink} className="slider-btn-secondary">
                    {heroBtns.secondaryText}
                  </a>
                )}
              </div>
            )}
          </div>
        </HeroSlider>

        {/* PRODUCTS GRID */}
        <div className="products-header">
          <div className="products-header-left">
            <span className="section-tag">✦ {t("home_store_tag", "Our Store")}</span>
            <h2 className="section-title">{t("home_store_title", "Featured Products")}</h2>
          </div>
          <a href={t("home_view_all_link", "/products")} className="view-all-link">{t("home_view_all_text", "View All Products →")}</a>
        </div>

        <div className="search-wrap">
          <div className="search-bar">
            <input
              className="search-input"
              type="text"
              placeholder={t("home_search_placeholder", "Search products...")}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
            />
            <button className="search-btn" onClick={handleSearch}>{t("home_search_btn", "Search")}</button>
          </div>
        </div>

        <div className="products-grid">
          {loading ? (
            <div className="loading">{t("home_loading", "Loading products...")}</div>
          ) : products.length === 0 ? (
            <div className="loading">{t("home_empty", "No products found.")}</div>
          ) : (
            products.slice(0, 8).map((p) => (
              <div className="product-card" key={p.id} style={{cursor:"pointer"}} onClick={()=>window.location.href=`/products/${p.slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`}>
                <div className="product-image">
                  {p.badge && (
                    <span className={`badge ${p.badge==="BEST VALUE"?"gold":p.badge==="NEW"?"new":p.badge==="BUNDLE"?"bundle":""}`}>
                      {p.badge}
                    </span>
                  )}
                  {p.image ? (
                    <img src={p.image} alt={p.name} />
                  ) : (
                    <div className="image-placeholder">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span>Product Image</span>
                    </div>
                  )}
                </div>
                <div className="product-info">
                  <div className="product-name">{p.name}</div>
                  <div
                    className="product-short-desc"
                    dangerouslySetInnerHTML={{
                      __html: fixContentLinkRels(
                        xss(
                          p.short_description || p.description || "",
                          cardDescXss
                        )
                      ),
                    }}
                  />
                  <div className="product-footer">
                    <div className="product-price">£{Number(p.price).toFixed(2)}</div>
                    {(() => {
                      const inCart = cart.some(i => i.id === p.id);
                      const hovering = hoveringId === p.id;
                      return (
                      <button
                        className="add-btn"
                        style={{background: inCart ? (hovering ? "#DC2626" : "#16A34A") : "#5B21B6", cursor: inCart && !hovering ? "default" : "pointer"}}
                        onMouseEnter={() => inCart && setHoveringId(p.id)}
                        onMouseLeave={() => setHoveringId(null)}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); inCart ? removeFromCart(p.id) : handleAddToCart(p); }}
                      >
                        {inCart ? (hovering ? t("home_remove", "Remove") : t("home_added", "Added!")) : t("home_add_cart", "Add to Cart →")}
                      </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="view-all-wrap">
          <a href={t("home_view_all_link", "/products")} className="view-all-btn">{t("home_view_all_text", "View All Products →")}</a>
        </div>

        {/* HERO — DARK section */}
        {/* HERO — DARK section */}
        <div className="hero-outer">
          <div className="hero">
            <div className="hero-combined">
              <div className="hero-combined-scroll">
                <div className="hero-content">
                  <span className="hero-tag">✦ {t("home_hero_tag", "UK's #1 Firestick Service")}</span>
                  <h2 className="hero-title">
                    {formatHeroTitle(heroTitle)}
                  </h2>
                  <p className="hero-subtitle">{heroSubtitle}</p>
                  {(heroBtns.primaryShow || heroBtns.secondaryShow) && (
                    <div className="hero-btns">
                      {heroBtns.primaryShow && (
                        <a href={heroBtns.primaryLink} className="hero-btn-primary">{heroBtns.primaryText} →</a>
                      )}
                      {heroBtns.secondaryShow && (
                        <a href={heroBtns.secondaryLink} className="hero-btn-secondary">{heroBtns.secondaryText}</a>
                      )}
                    </div>
                  )}
                </div>
                <div className="hero-features-wrap">
                  {featuresHtml ? (
                    <div
                      className="hero-service-content"
                      dangerouslySetInnerHTML={{
                        __html: fixContentLinkRels(xss(featuresHtml, richContentXss)),
                      }}
                    />
                  ) : (
                    <div className="hero-features feature-list">
                      {featureList.map((item, i) => (
                        <div className="hero-feature-item" key={`${item}-${i}`}>
                          <span className="hero-feature-check" aria-hidden>✓</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="hero-stats">
              {heroStats.map((s, i) => (
                <div className="stat-item" key={`${s.num}-${i}`}>
                  <span className="stat-num">{s.num}</span>
                  <span className="stat-label">{s.label}</span>
                </div>
              ))}
            </div>
            {t("home_tagline", "") ? (
              <p style={{textAlign:"center",marginTop:16,color:"#64748b",fontWeight:600,letterSpacing:"0.04em"}}>{t("home_tagline")}</p>
            ) : null}
          </div>
        </div>

        {/* Features + Testimonials — LIGHT section */}
        <div className="features-outer">
          <div className="features-section">
            <div className="section-tag">✦ {t("home_why_tag", "Why Choose Us")}</div>
            <h2 className="section-title">{sec.home_features?.title || "Why Choose Us"}</h2>
            <div className="features-grid">
              {(sec.home_features?.items || []).map((f:any,i:number)=>(
                <div className="feature-item" key={i}>
                  <span className="feature-icon">{f.icon}</span>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-desc">{f.description}</div>
                </div>
              ))}
            </div>
          </div>
          {sec.home_testimonials?.items?.length > 0 && (
            <div className="features-section" style={{paddingTop:0}}>
              <h2 className="section-title" style={{marginBottom:32}}>{sec.home_testimonials.title || "What Our Customers Say"}</h2>
              <div className="features-grid">
                {sec.home_testimonials.items.map((item:any,i:number)=>(
                  <div className="feature-item" key={i}>
                    <div style={{fontSize:20,marginBottom:8}}>{"⭐".repeat(item.rating||5)}</div>
                    <div className="feature-desc" style={{marginBottom:10}}>"{item.text}"</div>
                    <div className="feature-title" style={{fontSize:14}}>— {item.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {sec.home_newsletter && (
            <div className="features-section" style={{paddingTop:0}}>
              <h2 className="section-title">{sec.home_newsletter.title || "Stay in the Loop"}</h2>
              <p className="hero-subtitle" style={{maxWidth:640}}>{sec.home_newsletter.subtitle || ""}</p>
            </div>
          )}
        </div>

        <Footer />
      </div>

    </>
  );
}