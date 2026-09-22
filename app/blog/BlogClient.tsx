"use client";
import { useState } from "react";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useSiteContent } from "@/hooks/useSiteContent";
import type { PublicBlogPost } from "@/lib/publicBlogServer";

const styles = `
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { background:#FFFFFF; color:#111111; font-family:var(--font-body); overflow-x:hidden; }


  nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:18px 60px;
    display:flex; align-items:center; justify-content:space-between;
    background:#FFFFFF; border-bottom:1px solid #E5E5E5; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
  .nav-logo { font-family:var(--font-logo); font-size:20px; font-weight:800; color:#111111; text-decoration:none; letter-spacing:2px; }
  .nav-links { display:flex; gap:36px; list-style:none; }
  .nav-links a { color:#111111; text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.3s; }
  .nav-links a:hover { color:#5B21B6; }
  .nav-cta { background:#5B21B6 !important; color:white !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; }
  .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:5px; z-index:101; }
  .hamburger span { display:block; width:25px; height:2px; background:#111111; }
  @media(max-width:768px){
    nav{padding:16px 24px;}
    .nav-links{display:none;}
    .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;background:#FFFFFF;align-items:center;justify-content:center;gap:28px;z-index:9999;margin:0;padding:0;}
    .hamburger{display:flex;}
  }

  .page-wrapper { position:relative; z-index:1; padding-top:100px; min-height:100vh; }

  .page-header { max-width:900px; margin:0 auto; padding:50px 24px 40px; text-align:center; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#5B21B6; margin-bottom:12px; }
  .page-title { font-family:var(--font-display); font-size:clamp(1.8rem,3vw,2.5rem); font-weight:800; letter-spacing:-0.03em; color:#111111; margin-bottom:14px; }
  .page-title span { color:#5B21B6; -webkit-text-fill-color:#5B21B6; }
  .page-sub { color:#555555; font-size:15px; line-height:1.7; }

  /* CATEGORIES */
  .categories { max-width:1100px; margin:0 auto; padding:0 24px 40px;
    display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
  .cat-btn { padding:8px 22px; border-radius:30px; font-size:13px; font-weight:500;
    cursor:pointer; transition:all 0.3s; border:1px solid #E5E5E5;
    background:#F5F5F5; color:#111111; letter-spacing:0.5px; }
  .cat-btn:hover { border-color:#5B21B6; color:#5B21B6; background:#FFFFFF; }
  .cat-btn.active { background:#5B21B6; color:#FFFFFF !important;
    border-color:transparent; box-shadow:0 2px 8px rgba(91,33,182,0.3); }

  /* FEATURED POST */
  .featured-post { max-width:1100px; margin:0 auto; padding:0 24px 50px; }
  .featured-card { background:#111111;
    border:1px solid rgba(255,255,255,0.1); border-radius:24px; overflow:hidden;
    display:grid; grid-template-columns:1fr 1fr; transition:all 0.3s; }
  .featured-card:hover { border-color:rgba(91,33,182,0.6); box-shadow:0 20px 60px rgba(0,0,0,0.3); transform:translateY(-4px); }
  .featured-card * { color:#FFFFFF; }
  .featured-image { background:linear-gradient(135deg,rgba(74,0,128,0.8),rgba(91,33,182,0.6));
    display:flex; align-items:center; justify-content:center; font-size:80px; min-height:280px;
    border-right:1px solid rgba(255,255,255,0.08); }
  a.featured-image-link { text-decoration:none; color:inherit; display:block; min-height:280px; }
  .featured-content { padding:40px; display:flex; flex-direction:column; justify-content:center; }
  .post-badge { display:inline-block; background:#5B21B6;
    color:#FFFFFF !important; font-size:10px; font-weight:700; padding:4px 14px; border-radius:20px;
    letter-spacing:1.5px; text-transform:uppercase; margin-bottom:16px; width:fit-content; }
  .post-badge.guide { background:#16A34A; color:#FFFFFF !important; }
  .post-badge.news { background:#EA580C; color:#FFFFFF !important; }
  .post-badge.tips { background:#2563EB; color:#FFFFFF !important; }
  .featured-title { font-family:var(--font-display); font-size:clamp(1.5rem,2.5vw,2rem); font-weight:700;
    color:#FFFFFF !important; margin-bottom:14px; line-height:1.3; }
  a.featured-title { text-decoration:none; display:block; }
  .featured-excerpt { font-size:14px; color:#CCCCCC !important; line-height:1.8; margin-bottom:20px; }
  .post-meta { display:flex; gap:16px; align-items:center; font-size:12px; color:#AAAAAA !important; margin-bottom:20px; }
  .read-more { color:#FFFFFF !important; font-size:14px; font-weight:600; text-decoration:none; border-bottom:1px solid rgba(255,255,255,0.4); transition:all 0.2s; }
  .read-more:hover { color:#BFA5FF !important; border-bottom-color:#BFA5FF; }

  /* BLOG GRID */
  .blog-grid { max-width:1100px; margin:0 auto; padding:0 24px 80px;
    display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:24px; }
  .blog-card { background:#FFFFFF;
    border:1px solid #E5E5E5; border-radius:16px; overflow:hidden;
    transition:all 0.3s; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
  .blog-card:hover { transform:translateY(-4px); border-color:#5B21B6; box-shadow:0 8px 24px rgba(0,0,0,0.12); }
  .card-image { height:160px; display:flex; align-items:center; justify-content:center;
    font-size:52px; background:#F5F5F5;
    border-bottom:1px solid #E5E5E5; overflow:hidden; }
  .card-image img { width:100%; height:100%; object-fit:cover; }
  a.card-image-link { text-decoration:none; color:inherit; display:block; }
  .card-body { padding:20px; }
  .card-title { font-family:var(--font-display); font-size:15px; font-weight:700; color:#111111 !important; margin-bottom:8px; line-height:1.4; }
  a.card-title { text-decoration:none; display:block; }
  .card-excerpt { font-size:13px; color:#555555 !important; line-height:1.7; margin-bottom:14px; }
  .card-footer { display:flex; justify-content:space-between; align-items:center; }
  .card-meta { font-size:11px; color:#888888 !important; }

  /* NEWSLETTER */
  .newsletter { max-width:700px; margin:0 auto 80px; padding:0 24px; }
  .newsletter-box { background:#111111;
    border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:50px 40px; text-align:center; }
  .newsletter-title { font-family:var(--font-display); font-size:clamp(20px,3vw,30px); font-weight:700; color:#FFFFFF !important; margin-bottom:12px; }
  .newsletter-sub { color:#CCCCCC !important; font-size:14px; margin-bottom:28px; }
  .newsletter-form { display:flex; gap:12px; max-width:450px; margin:0 auto; }
  .newsletter-input { flex:1; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2);
    border-radius:8px; padding:14px 20px; color:#FFFFFF !important; font-family:var(--font-body);
    font-size:14px; outline:none; transition:all 0.3s; }
  .newsletter-input::placeholder { color:rgba(255,255,255,0.5) !important; }
  .newsletter-input:focus { border-color:#BFA5FF; background:rgba(255,255,255,0.15); }
  .newsletter-btn { background:#5B21B6;
    color:#FFFFFF !important; border:none; padding:14px 28px; border-radius:8px; font-size:14px;
    font-weight:600; cursor:pointer; transition:all 0.2s; white-space:nowrap; }
  .newsletter-btn:hover { background:#4C1D95; transform:translateY(-1px); }

  footer { position:relative; z-index:1; padding:40px 60px;
    border-top:1px solid rgba(139,0,255,0.15);
    display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
  .footer-logo { font-family:var(--font-display); font-size:16px; font-weight:800; color:#FFFFFF; }
  .footer-links { display:flex; gap:20px; list-style:none; flex-wrap:wrap; }
  .footer-links a { color:rgba(255,255,255,0.65); text-decoration:none; font-size:13px; transition:color 0.3s; }
  .footer-links a:hover { color:#5B21B6; }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.55); }

  .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px;
    border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
  .whatsapp-btn:hover { transform:scale(1.15); }

  @media(max-width:768px){
    .featured-card{grid-template-columns:1fr;}
    .featured-image{min-height:180px;}
    a.featured-image-link{min-height:180px;}
    .newsletter-form{flex-direction:column;}
    .newsletter-box{padding:36px 24px;}
    footer{padding:30px 24px;flex-direction:column;text-align:center;}
  }
`;

const categories = ["All", "Guides", "Tips", "News"];

type BlogListPost = {
  id: number;
  emoji: string;
  badge: string;
  badgeText: string;
  title: string;
  excerpt: string;
  slug: string;
  featured_image: string;
  date: string;
  readTime: string;
  category: string;
  featured: boolean;
};

function mapPublicPost(p: PublicBlogPost): BlogListPost {
  return {
    id: p.id,
    emoji: p.emoji || "📝",
    badge: p.badge || "guide",
    badgeText: p.badgeText || "Guide",
    title: p.title,
    excerpt: p.excerpt,
    slug: p.slug || String(p.id),
    featured_image: p.featured_image || "",
    date: p.created_at
      ? new Date(p.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "",
    readTime: "3 min read",
    category: p.category || "Guides",
    featured: !!p.featured,
  };
}

export default function BlogClient({
  initialPosts = [],
}: {
  initialPosts?: PublicBlogPost[];
}) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [allPosts] = useState<BlogListPost[]>(() =>
    initialPosts.map(mapPublicPost)
  );
  const { t } = useSiteContent();

  const featuredPost = allPosts.find((p) => p.featured);
  const filteredPosts = allPosts.filter(
    (p) =>
      !p.featured &&
      (activeCategory === "All" || p.category === activeCategory)
  );
  const showEmpty = allPosts.length === 0;

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://firestick4uk.com" },
          { name: "Blog", url: "https://firestick4uk.com/blog" },
        ]}
      />
      <style>{styles}</style>

      <Navbar cta="shop" shopHref="/" />

      <div className="page-wrapper">
        <div className="page-header">
          <div className="section-tag">✦ {t("blog_tag", "Our Blog")}</div>
          <h1 className="page-title">{t("blog_title", "Tips, Guides & Updates")}</h1>
          <p className="page-sub">{t("blog_subtitle", "Everything you need to get the most out of your devices and subscription plans.")}</p>
        </div>

        {/* CATEGORIES */}
        <div className="categories">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`cat-btn ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* FEATURED */}
        {featuredPost &&
          (activeCategory === "All" ||
            activeCategory === featuredPost.category) && (
            <div className="featured-post">
              <div className="featured-card">
                <a
                  href={`/blog/${featuredPost.slug}`}
                  className="featured-image-link"
                >
                  <div className="featured-image">
                    {featuredPost.featured_image ? (
                      <img
                        src={featuredPost.featured_image}
                        alt={featuredPost.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                        loading="lazy"
                      />
                    ) : (
                      featuredPost.emoji
                    )}
                  </div>
                </a>
                <div className="featured-content">
                  <span className={`post-badge ${featuredPost.badge}`}>
                    ⭐ Featured — {featuredPost.badgeText}
                  </span>
                  <a
                    href={`/blog/${featuredPost.slug}`}
                    className="featured-title"
                  >
                    {featuredPost.title}
                  </a>
                  <p className="featured-excerpt">{featuredPost.excerpt}</p>
                  <div className="post-meta">
                    <span>📅 {featuredPost.date}</span>
                    <span>⏱ {featuredPost.readTime}</span>
                  </div>
                  <a
                    href={`/blog/${featuredPost.slug}`}
                    className="read-more"
                  >
                    {t("blog_read", "Read Article →")}
                  </a>
                </div>
              </div>
            </div>
          )}

        {/* GRID */}
        {showEmpty ? (
          <p
            style={{
              textAlign: "center",
              color: "#666666",
              padding: "40px 24px",
              fontSize: 15,
            }}
          >
            No articles published yet.
          </p>
        ) : (
          <div className="blog-grid">
            {filteredPosts.map((post) => (
              <div className="blog-card" key={post.id}>
                <a href={`/blog/${post.slug}`} className="card-image-link">
                  <div className="card-image">
                    {post.featured_image ? (
                      <img
                        src={post.featured_image}
                        alt={post.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                        loading="lazy"
                      />
                    ) : (
                      post.emoji
                    )}
                  </div>
                </a>
                <div className="card-body">
                  <span className={`post-badge ${post.badge}`}>
                    {post.badgeText}
                  </span>
                  <a
                    href={`/blog/${post.slug}`}
                    className="card-title"
                    style={{ marginTop: "12px" }}
                  >
                    {post.title}
                  </a>
                  <p className="card-excerpt">{post.excerpt}</p>
                  <div className="card-footer">
                    <div className="card-meta">
                      📅 {post.date} · ⏱ {post.readTime}
                    </div>
                    <a href={`/blog/${post.slug}`} className="read-more">
                      {t("blog_read_short", "Read →")}
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* NEWSLETTER */}
        <div className="newsletter">
          <div className="newsletter-box">
            <div className="newsletter-title">
              {t("blog_newsletter_title", "Stay in the Loop")}
            </div>
            <p className="newsletter-sub">
              {t(
                "blog_newsletter_sub",
                "Get the latest guides, tips and offers delivered to your inbox."
              )}
            </p>
            {subscribed ? (
              <p
                style={{ color: "#5B21B6", fontWeight: 600, fontSize: "15px" }}
              >
                ✅ {t("blog_subscribed", "You are subscribed! Thank you.")}
              </p>
            ) : (
              <div className="newsletter-form">
                <input
                  className="newsletter-input"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button
                  className="newsletter-btn"
                  onClick={() => email && setSubscribed(true)}
                >
                  {t("blog_subscribe", "Subscribe")}
                </button>
              </div>
            )}
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}
