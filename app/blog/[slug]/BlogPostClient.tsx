"use client";
import { useState } from "react";

interface Post {
  id: number; title: string; slug: string; content: string; excerpt: string;
  category: string; emoji: string; badge: string; badgeText: string;
  featured_image: string; meta_title: string; meta_description: string;
  created_at: string; canonical_url: string | null;
  faqs: Array<{question:string;answer:string}> | null;
}

export default function BlogPostClient({ post }: { post: Post | null }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const dateStr = post?.created_at
    ? new Date(post.created_at).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" })
    : "";

  const faqs = post?.faqs
    ? (typeof post.faqs === "string" ? JSON.parse(post.faqs) : post.faqs) as Array<{question:string;answer:string}>
    : [];

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
        .breadcrumb{font-size:12px;color:rgba(255,255,255,0.3);margin-bottom:16px;display:flex;gap:8px;align-items:center;}
        .breadcrumb a{color:rgba(255,255,255,0.4);text-decoration:none;transition:color 0.2s;}
        .breadcrumb a:hover{color:var(--purple-glow);}
        .breadcrumb span{color:rgba(255,255,255,0.2);}
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
        .faq-section{margin-top:40px;}
        .faq-title{font-family:'Cinzel',serif;font-size:20px;font-weight:700;color:white;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid rgba(139,0,255,0.15);}
        .faq-item{border:1px solid rgba(139,0,255,0.15);border-radius:12px;margin-bottom:10px;overflow:hidden;transition:border-color 0.2s;}
        .faq-item.open{border-color:rgba(139,0,255,0.4);}
        .faq-q{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;cursor:pointer;background:rgba(139,0,255,0.05);transition:background 0.2s;}
        .faq-q:hover{background:rgba(139,0,255,0.1);}
        .faq-item.open .faq-q{background:rgba(139,0,255,0.1);}
        .faq-q-text{font-size:15px;font-weight:600;color:white;flex:1;}
        .faq-chevron{font-size:14px;color:var(--purple-glow);transition:transform 0.25s;flex-shrink:0;}
        .faq-item.open .faq-chevron{transform:rotate(180deg);}
        .faq-a{max-height:0;overflow:hidden;transition:max-height 0.3s ease,padding 0.3s;}
        .faq-item.open .faq-a{max-height:400px;padding:0 20px 16px;}
        .faq-a-text{font-size:14px;color:rgba(255,255,255,0.65);line-height:1.8;padding-top:12px;border-top:1px solid rgba(139,0,255,0.1);}
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
        {!post ? (
          <div className="loading-state">
            Post not found. <a href="/blog" style={{color:"var(--purple-glow)"}}>Back to Blog →</a>
          </div>
        ) : (
          <>
            <div className="breadcrumb">
              <a href="/">Home</a><span>›</span>
              <a href="/blog">Blog</a><span>›</span>
              <span style={{color:"rgba(255,255,255,0.6)"}}>{post.title}</span>
            </div>
            <a href="/blog" className="back">← Back to Blog</a>
            {post.badgeText && <div className="post-badge">{post.badgeText}</div>}
            <h1 className="post-title">{post.title}</h1>
            <div className="post-meta">
              <span>📅 {dateStr}</span>
              <span>📁 {post.category}</span>
            </div>
            {post.featured_image && <img src={post.featured_image} alt={post.title} className="featured-img" loading="eager" />}
            {post.excerpt && <div className="post-excerpt">{post.excerpt}</div>}
            {post.content && (
              <div className="post-content" dangerouslySetInnerHTML={{ __html: post.content }} />
            )}

            {/* FAQ Accordion */}
            {faqs.length > 0 && (
              <div className="faq-section">
                <div className="faq-title">Frequently Asked Questions</div>
                {faqs.map((faq, i) => (
                  <div key={i} className={`faq-item ${openFaq === i ? "open" : ""}`}>
                    <div className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                      <span className="faq-q-text">{faq.question}</span>
                      <span className="faq-chevron">▼</span>
                    </div>
                    <div className="faq-a">
                      <div className="faq-a-text">{faq.answer}</div>
                    </div>
                  </div>
                ))}
              </div>
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
