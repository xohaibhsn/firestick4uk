"use client";
import { use, useEffect, useState } from "react";

interface Post {
  id: number; title: string; slug: string; content: string; excerpt: string;
  category: string; emoji: string; badge: string; badgeText: string;
  featured_image: string; meta_title: string; meta_description: string;
  created_at: string;
}

export default function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/blog?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(data => { setPost(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  const dateStr = post?.created_at
    ? new Date(post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
        :root{--purple-mid:#4a0080;--purple-bright:#8b00ff;--purple-glow:#bf5fff;--gold:#ffd700;}
        body{background:#0a0010;color:#fff;font-family:'Raleway',sans-serif;}
        .bg{position:fixed;inset:0;z-index:0;background:radial-gradient(ellipse at 20% 20%,#2d0050 0%,transparent 50%),radial-gradient(ellipse at 80% 80%,#1a0035 0%,transparent 50%),#0a0010;}
        nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:18px 60px;display:flex;align-items:center;justify-content:space-between;background:rgba(13,0,16,0.96);backdrop-filter:blur(20px);border-bottom:1px solid rgba(139,0,255,0.2);}
        .nav-logo{font-family:'Cinzel',serif;font-size:20px;font-weight:900;background:linear-gradient(135deg,var(--purple-glow),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-decoration:none;letter-spacing:2px;}
        .nav-links{display:flex;gap:28px;list-style:none;}
        .nav-links a{color:rgba(255,255,255,0.7);text-decoration:none;font-size:13px;font-weight:500;letter-spacing:1px;text-transform:uppercase;transition:color 0.2s;}
        .nav-links a:hover{color:var(--purple-glow);}
        .wrap{position:relative;z-index:1;padding:110px 24px 80px;max-width:780px;margin:0 auto;}
        .back{color:rgba(255,255,255,0.4);text-decoration:none;font-size:13px;display:inline-flex;align-items:center;gap:5px;margin-bottom:28px;transition:color 0.2s;}
        .back:hover{color:var(--purple-glow);}
        .post-badge{display:inline-block;background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));color:white;font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;}
        .post-title{font-family:'Cinzel',serif;font-size:clamp(24px,4vw,38px);font-weight:700;color:white;line-height:1.25;margin-bottom:16px;}
        .post-meta{color:rgba(255,255,255,0.4);font-size:13px;margin-bottom:28px;display:flex;gap:18px;flex-wrap:wrap;}
        .featured-img{width:100%;max-height:420px;object-fit:cover;border-radius:16px;margin-bottom:36px;border:1px solid rgba(139,0,255,0.2);}
        .post-excerpt{font-size:16px;color:rgba(255,255,255,0.6);line-height:1.8;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid rgba(139,0,255,0.15);font-style:italic;}
        .post-content{font-size:15px;color:rgba(255,255,255,0.8);line-height:1.85;}
        .post-content h2{font-family:'Cinzel',serif;font-size:22px;font-weight:700;color:white;margin:32px 0 12px;padding-bottom:8px;border-bottom:1px solid rgba(139,0,255,0.15);}
        .post-content h3{font-family:'Cinzel',serif;font-size:18px;font-weight:600;color:var(--purple-glow);margin:24px 0 8px;}
        .post-content p{margin-bottom:16px;}
        .post-content ul,.post-content ol{padding-left:24px;margin-bottom:16px;}
        .post-content li{margin-bottom:6px;}
        .post-content blockquote{border-left:3px solid var(--purple-glow);padding:12px 16px;background:rgba(139,0,255,0.06);border-radius:0 8px 8px 0;margin:20px 0;color:rgba(255,255,255,0.6);font-style:italic;}
        .post-content a{color:var(--purple-glow);text-decoration:underline;}
        .post-content strong{color:white;font-weight:700;}
        .cta-box{margin-top:48px;background:linear-gradient(135deg,rgba(74,0,128,0.3),rgba(26,0,37,0.9));border:1px solid rgba(139,0,255,0.3);border-radius:16px;padding:32px;text-align:center;}
        .cta-title{font-family:'Cinzel',serif;font-size:20px;font-weight:700;margin-bottom:10px;}
        .cta-sub{color:rgba(255,255,255,0.5);font-size:14px;margin-bottom:20px;}
        .btn-primary{background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));color:white;padding:12px 28px;border-radius:50px;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;}
        .loading-state{text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);}
        @media(max-width:768px){nav{padding:16px 24px;}.nav-links{display:none;}}
      `}</style>

      <div className="bg" />
      <nav>
        <a href="/" className="nav-logo">FIRESTICK4UK</a>
        <ul className="nav-links">
          <li><a href="/">Home</a></li>
          <li><a href="/products">Products</a></li>
          <li><a href="/blog">Blog</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </nav>

      <div className="wrap">
        {loading ? (
          <div className="loading-state">Loading post...</div>
        ) : !post ? (
          <div className="loading-state">
            Post not found. <a href="/blog" style={{color:"var(--purple-glow)"}}>Back to Blog →</a>
          </div>
        ) : (
          <>
            <a href="/blog" className="back">← Back to Blog</a>
            {post.badgeText && <div className="post-badge">{post.badgeText}</div>}
            <h1 className="post-title">{post.title}</h1>
            <div className="post-meta">
              <span>📅 {dateStr}</span>
              <span>📁 {post.category}</span>
            </div>
            {post.featured_image && <img src={post.featured_image} alt={post.title} className="featured-img" loading="lazy" />}
            {post.excerpt && <div className="post-excerpt">{post.excerpt}</div>}
            {post.content && (
              <div className="post-content" dangerouslySetInnerHTML={{ __html: post.content }} />
            )}
            <div className="cta-box">
              <div className="cta-title">Ready to Shop?</div>
              <div className="cta-sub">Browse our full range of Firestick devices and IPTV plans.</div>
              <a href="/products" className="btn-primary">View Products →</a>
            </div>
          </>
        )}
      </div>

      <a href="https://wa.me/447934519060" style={{position:"fixed",bottom:30,right:30,zIndex:999,width:58,height:58,borderRadius:"50%",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 25px rgba(37,211,102,0.5)",textDecoration:"none",fontSize:26}} target="_blank" rel="noopener noreferrer">💬</a>
    </>
  );
}
