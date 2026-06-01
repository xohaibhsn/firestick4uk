"use client";
import { useState, useEffect } from "react";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --purple-deep:#0d0010; --purple-mid:#4a0080; --purple-bright:#8b00ff; --purple-glow:#bf5fff; --purple-light:#e0b3ff; --gold:#ffd700; }
  body { background:var(--purple-deep); color:#fff; font-family:'Raleway',sans-serif; overflow-x:hidden; }
  .bg-fixed { position:fixed; inset:0; z-index:0;
    background:radial-gradient(ellipse at 20% 20%,#2d0050 0%,transparent 50%),
               radial-gradient(ellipse at 80% 80%,#1a0035 0%,transparent 50%),#0a0010; }

  nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:18px 60px;
    display:flex; align-items:center; justify-content:space-between;
    background:rgba(13,0,16,0.96); backdrop-filter:blur(20px);
    border-bottom:1px solid rgba(139,0,255,0.2); }
  .nav-logo { font-family:'Cinzel',serif; font-size:20px; font-weight:900;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    text-decoration:none; letter-spacing:2px; }
  .nav-links { display:flex; gap:36px; list-style:none; }
  .nav-links a { color:rgba(255,255,255,0.8); text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.3s; }
  .nav-links a:hover { color:var(--purple-glow); }
  .nav-cta { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)) !important; color:white !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; }
  .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:5px; z-index:101; }
  .hamburger span { display:block; width:25px; height:2px; background:var(--purple-glow); }
  @media(max-width:768px){
    nav{padding:16px 24px;}
    .nav-links{display:none;}
    .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(13,0,16,0.98);align-items:center;justify-content:center;gap:28px;z-index:99;}
    .hamburger{display:flex;}
  }

  .page-wrapper { position:relative; z-index:1; padding-top:100px; min-height:100vh; }

  .page-header { max-width:900px; margin:0 auto; padding:50px 24px 40px; text-align:center; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:var(--purple-glow); margin-bottom:12px; }
  .page-title { font-family:'Cinzel',serif; font-size:clamp(28px,4vw,48px); font-weight:700; color:white; margin-bottom:14px; }
  .page-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .page-sub { color:rgba(255,255,255,0.5); font-size:15px; line-height:1.7; }

  /* CATEGORIES */
  .categories { max-width:1100px; margin:0 auto; padding:0 24px 40px;
    display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
  .cat-btn { padding:8px 22px; border-radius:30px; font-size:13px; font-weight:500;
    cursor:pointer; transition:all 0.3s; border:1px solid rgba(139,0,255,0.3);
    background:rgba(139,0,255,0.06); color:rgba(255,255,255,0.6); letter-spacing:0.5px; }
  .cat-btn:hover { border-color:rgba(139,0,255,0.6); color:var(--purple-glow); }
  .cat-btn.active { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; border-color:transparent; box-shadow:0 0 15px rgba(139,0,255,0.4); }

  /* FEATURED POST */
  .featured-post { max-width:1100px; margin:0 auto; padding:0 24px 50px; }
  .featured-card { background:linear-gradient(135deg,rgba(74,0,128,0.3),rgba(26,0,37,0.9));
    border:1px solid rgba(139,0,255,0.25); border-radius:24px; overflow:hidden;
    display:grid; grid-template-columns:1fr 1fr; transition:all 0.3s; cursor:pointer; }
  .featured-card:hover { border-color:rgba(139,0,255,0.6); box-shadow:0 20px 60px rgba(139,0,255,0.2); transform:translateY(-4px); }
  .featured-image { background:linear-gradient(135deg,rgba(74,0,128,0.5),rgba(139,0,255,0.2));
    display:flex; align-items:center; justify-content:center; font-size:80px; min-height:280px;
    border-right:1px solid rgba(139,0,255,0.15); }
  .featured-content { padding:40px; display:flex; flex-direction:column; justify-content:center; }
  .post-badge { display:inline-block; background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; font-size:10px; font-weight:700; padding:4px 14px; border-radius:20px;
    letter-spacing:1.5px; text-transform:uppercase; margin-bottom:16px; width:fit-content; }
  .post-badge.guide { background:linear-gradient(135deg,#006400,#00c864); }
  .post-badge.news { background:linear-gradient(135deg,#8b4500,#ff8c00); }
  .post-badge.tips { background:linear-gradient(135deg,#00408b,#0080ff); }
  .featured-title { font-family:'Cinzel',serif; font-size:clamp(18px,2.5vw,26px); font-weight:700;
    color:white; margin-bottom:14px; line-height:1.3; }
  .featured-excerpt { font-size:14px; color:rgba(255,255,255,0.5); line-height:1.8; margin-bottom:20px; }
  .post-meta { display:flex; gap:16px; align-items:center; font-size:12px; color:rgba(255,255,255,0.35); margin-bottom:20px; }
  .read-more { color:var(--purple-glow); font-size:14px; font-weight:600; text-decoration:none; transition:color 0.3s; }
  .read-more:hover { color:var(--gold); }

  /* BLOG GRID */
  .blog-grid { max-width:1100px; margin:0 auto; padding:0 24px 80px;
    display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:24px; }
  .blog-card { background:linear-gradient(135deg,rgba(74,0,128,0.2),rgba(26,0,37,0.85));
    border:1px solid rgba(139,0,255,0.15); border-radius:20px; overflow:hidden;
    transition:all 0.3s; cursor:pointer; }
  .blog-card:hover { transform:translateY(-6px); border-color:rgba(139,0,255,0.5); box-shadow:0 16px 40px rgba(139,0,255,0.2); }
  .card-image { height:160px; display:flex; align-items:center; justify-content:center;
    font-size:52px; background:linear-gradient(135deg,rgba(74,0,128,0.35),rgba(139,0,255,0.15));
    border-bottom:1px solid rgba(139,0,255,0.1); }
  .card-body { padding:24px; }
  .card-title { font-family:'Cinzel',serif; font-size:16px; font-weight:700; color:white; margin-bottom:10px; line-height:1.4; }
  .card-excerpt { font-size:13px; color:rgba(255,255,255,0.45); line-height:1.7; margin-bottom:16px; }
  .card-footer { display:flex; justify-content:space-between; align-items:center; }
  .card-meta { font-size:11px; color:rgba(255,255,255,0.3); }

  /* NEWSLETTER */
  .newsletter { max-width:700px; margin:0 auto 80px; padding:0 24px; }
  .newsletter-box { background:linear-gradient(135deg,rgba(74,0,128,0.35),rgba(139,0,255,0.15));
    border:1px solid rgba(139,0,255,0.3); border-radius:24px; padding:50px 40px; text-align:center; }
  .newsletter-title { font-family:'Cinzel',serif; font-size:clamp(20px,3vw,30px); font-weight:700; color:white; margin-bottom:12px; }
  .newsletter-sub { color:rgba(255,255,255,0.5); font-size:14px; margin-bottom:28px; }
  .newsletter-form { display:flex; gap:12px; max-width:450px; margin:0 auto; }
  .newsletter-input { flex:1; background:rgba(139,0,255,0.1); border:1px solid rgba(139,0,255,0.3);
    border-radius:50px; padding:14px 20px; color:white; font-family:'Raleway',sans-serif;
    font-size:14px; outline:none; transition:all 0.3s; }
  .newsletter-input::placeholder { color:rgba(255,255,255,0.3); }
  .newsletter-input:focus { border-color:var(--purple-glow); background:rgba(139,0,255,0.18); }
  .newsletter-btn { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; border:none; padding:14px 28px; border-radius:50px; font-size:14px;
    font-weight:600; cursor:pointer; transition:all 0.3s; white-space:nowrap; }
  .newsletter-btn:hover { box-shadow:0 0 25px rgba(139,0,255,0.6); transform:translateY(-2px); }

  footer { position:relative; z-index:1; padding:40px 60px;
    border-top:1px solid rgba(139,0,255,0.15);
    display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
  .footer-logo { font-family:'Cinzel',serif; font-size:16px; font-weight:900;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .footer-links { display:flex; gap:20px; list-style:none; flex-wrap:wrap; }
  .footer-links a { color:rgba(255,255,255,0.4); text-decoration:none; font-size:13px; transition:color 0.3s; }
  .footer-links a:hover { color:var(--purple-glow); }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.3); }

  .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px;
    border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
  .whatsapp-btn:hover { transform:scale(1.15); }

  @media(max-width:768px){
    .featured-card{grid-template-columns:1fr;}
    .featured-image{min-height:180px;}
    .newsletter-form{flex-direction:column;}
    .newsletter-box{padding:36px 24px;}
    footer{padding:30px 24px;flex-direction:column;text-align:center;}
  }
`;

const posts = [
  {
    id: 1, featured: true, emoji: "🔥", badge: "guide", badgeText: "Guide",
    title: "How to Set Up Your Firestick in 5 Minutes",
    excerpt: "Just received your Firestick? This step-by-step guide walks you through the complete setup process — from plugging in to streaming your first show.",
    date: "28 May 2026", readTime: "5 min read", category: "Guides",
  },
  {
    id: 2, emoji: "📦", badge: "tips", badgeText: "Tips",
    title: "Firestick vs Android Box — Which Should You Buy?",
    excerpt: "Not sure whether to go for a Firestick or an Android Box? We break down the differences so you can make the right choice for your home.",
    date: "25 May 2026", readTime: "4 min read", category: "Guides",
  },
  {
    id: 3, emoji: "💡", badge: "tips", badgeText: "Tips",
    title: "5 Tips to Get the Most Out of Your Subscription Plan",
    excerpt: "Make the most of your subscription with these simple tips — from managing profiles to optimising your internet connection for 4K streaming.",
    date: "22 May 2026", readTime: "3 min read", category: "Tips",
  },
  {
    id: 4, emoji: "🔒", badge: "guide", badgeText: "Guide",
    title: "Is Your Streaming Setup Secure? Here's What to Check",
    excerpt: "Online security matters. Here are the key things to check to make sure your devices and accounts are protected while you stream.",
    date: "18 May 2026", readTime: "4 min read", category: "Guides",
  },
  {
    id: 5, emoji: "📶", badge: "tips", badgeText: "Tips",
    title: "Slow Buffering? Here Are 6 Fixes That Actually Work",
    excerpt: "Tired of your stream buffering at the worst moment? These 6 practical fixes will help you get smooth, uninterrupted playback every time.",
    date: "14 May 2026", readTime: "5 min read", category: "Tips",
  },
  {
    id: 6, emoji: "📺", badge: "news", badgeText: "News",
    title: "What's New at Firestick44UK — May 2026 Update",
    excerpt: "We've added new products, improved our order tracking system, and launched our brand new website. Here's everything that's changed this month.",
    date: "10 May 2026", readTime: "2 min read", category: "News",
  },
  {
    id: 7, emoji: "🛒", badge: "guide", badgeText: "Guide",
    title: "How to Place an Order on Firestick44UK",
    excerpt: "New to our store? This quick guide walks you through exactly how to browse products, add them to your cart, and complete your order in minutes.",
    date: "5 May 2026", readTime: "3 min read", category: "Guides",
  },
];

const categories = ["All", "Guides", "Tips", "News"];

export default function BlogPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [allPosts, setAllPosts] = useState(posts);

  useEffect(() => {
    fetch("/api/blog")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAllPosts(data.map((p: any) => ({
            id: p.id,
            emoji: p.emoji || "📝",
            badge: p.badge || "guide",
            badgeText: p.badgeText || "Guide",
            title: p.title,
            excerpt: p.excerpt,
            date: p.created_at ? new Date(p.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}) : "",
            readTime: "3 min read",
            category: p.category || "Guides",
            featured: false,
          })));
        }
      })
      .catch(() => {});
  }, []);

  const featuredPost = allPosts.find(p => p.featured);
  const filteredPosts = allPosts.filter(p => !p.featured && (activeCategory === "All" || p.category === activeCategory));

  return (
    <>
      <style>{styles}</style>
      <div className="bg-fixed" />

      <nav>
        <a href="/" className="nav-logo">FIRESTICK4UK</a>
        <ul className={`nav-links ${menuOpen ? "open" : ""}`}>
          <li><a href="/" onClick={() => setMenuOpen(false)}>Home</a></li>
          <li><a href="/products" onClick={() => setMenuOpen(false)}>Products</a></li>
          <li><a href="/order-tracking" onClick={() => setMenuOpen(false)}>Track Order</a></li>
          <li><a href="/blog" onClick={() => setMenuOpen(false)}>Blog</a></li>
          <li><a href="/contact" onClick={() => setMenuOpen(false)}>Contact</a></li>
          <li><a href="/" className="nav-cta" onClick={() => setMenuOpen(false)}>Shop Now</a></li>
        </ul>
        <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </nav>

      <div className="page-wrapper">
        <div className="page-header">
          <div className="section-tag">✦ Our Blog</div>
          <h1 className="page-title">Tips, Guides & <span>Updates</span></h1>
          <p className="page-sub">Everything you need to get the most out of your devices and subscription plans.</p>
        </div>

        {/* CATEGORIES */}
        <div className="categories">
          {categories.map(cat => (
            <button key={cat} className={`cat-btn ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}>
              {cat}
            </button>
          ))}
        </div>

        {/* FEATURED */}
        {featuredPost && (activeCategory === "All" || activeCategory === featuredPost.category) && (
          <div className="featured-post">
            <div className="featured-card">
              <div className="featured-image">{featuredPost.emoji}</div>
              <div className="featured-content">
                <span className={`post-badge ${featuredPost.badge}`}>⭐ Featured — {featuredPost.badgeText}</span>
                <div className="featured-title">{featuredPost.title}</div>
                <p className="featured-excerpt">{featuredPost.excerpt}</p>
                <div className="post-meta">
                  <span>📅 {featuredPost.date}</span>
                  <span>⏱ {featuredPost.readTime}</span>
                </div>
                <a href="/contact" className="read-more">Enquire →</a>
              </div>
            </div>
          </div>
        )}

        {/* GRID */}
        <div className="blog-grid">
          {filteredPosts.map(post => (
            <div className="blog-card" key={post.id}>
              <div className="card-image">{post.emoji}</div>
              <div className="card-body">
                <span className={`post-badge ${post.badge}`}>{post.badgeText}</span>
                <div className="card-title" style={{ marginTop: "12px" }}>{post.title}</div>
                <p className="card-excerpt">{post.excerpt}</p>
                <div className="card-footer">
                  <div className="card-meta">📅 {post.date} · ⏱ {post.readTime}</div>
                  <a href="/contact" className="read-more">Enquire →</a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* NEWSLETTER */}
        <div className="newsletter">
          <div className="newsletter-box">
            <div className="newsletter-title">Stay in the Loop</div>
            <p className="newsletter-sub">Get the latest guides, tips and offers delivered to your inbox.</p>
            {subscribed ? (
              <p style={{ color: "var(--purple-glow)", fontWeight: 600, fontSize: "15px" }}>✅ You&apos;re subscribed! Thank you.</p>
            ) : (
              <div className="newsletter-form">
                <input className="newsletter-input" type="email" placeholder="your@email.com"
                  value={email} onChange={e => setEmail(e.target.value)} />
                <button className="newsletter-btn" onClick={() => email && setSubscribed(true)}>Subscribe</button>
              </div>
            )}
          </div>
        </div>

        <footer>
          <div className="footer-logo">FIRESTICK4UK</div>
          <ul className="footer-links">
            <li><a href="/privacy-policy">Privacy Policy</a></li>
            <li><a href="/terms">Terms & Conditions</a></li>
            <li><a href="/refund-policy">Refund Policy</a></li>
            <li><a href="/faq">FAQ</a></li>
          </ul>
          <div className="footer-copy">© 2026 Firestick4UK. All rights reserved.</div>
        </footer>
      </div>

      <a href="https://wa.me/447934519060" className="whatsapp-btn" target="_blank" rel="noopener noreferrer">💬</a>
    </>
  );
}