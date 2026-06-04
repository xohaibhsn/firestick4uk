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
        body{background:#FFFFFF;color:#111111;font-family:'Raleway',sans-serif;}

        nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:18px 60px;display:flex;align-items:center;justify-content:space-between;background:#FFFFFF;border-bottom:1px solid #E5E5E5;box-shadow:0 1px 4px rgba(0,0,0,0.06);}
        .nav-logo{font-family:'Cinzel',serif;font-size:20px;font-weight:900;color:#111111;text-decoration:none;letter-spacing:2px;}
        .nav-links{display:flex;gap:28px;list-style:none;}
        .nav-links a{color:#111111;text-decoration:none;font-size:13px;font-weight:500;letter-spacing:1px;text-transform:uppercase;transition:color 0.2s;}
        .nav-links a:hover{color:#5B21B6;}
        .nav-cta{background:#5B21B6 !important;color:#FFFFFF !important;padding:9px 22px !important;border-radius:30px !important;font-weight:600 !important;}

        .wrap{padding:110px 24px 80px;max-width:780px;margin:0 auto;}

        .breadcrumb{font-size:12px;color:#888888;margin-bottom:16px;display:flex;gap:8px;align-items:center;}
        .breadcrumb a{color:#666666;text-decoration:none;transition:color 0.2s;}
        .breadcrumb a:hover{color:#5B21B6;}
        .breadcrumb span{color:#CCCCCC;}

        .back{color:#666666;text-decoration:none;font-size:13px;display:inline-flex;align-items:center;gap:5px;margin-bottom:24px;transition:color 0.2s;}
        .back:hover{color:#5B21B6;}

        .post-badge{display:inline-block;background:#5B21B6;color:#FFFFFF;font-size:11px;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;}

        .post-title{font-family:'Cinzel',serif;font-size:clamp(24px,4vw,38px);font-weight:700;color:#111111;line-height:1.25;margin-bottom:16px;}

        .post-meta{color:#888888;font-size:13px;margin-bottom:28px;display:flex;gap:18px;flex-wrap:wrap;}

        .featured-img{width:100%;max-height:420px;object-fit:cover;border-radius:14px;margin-bottom:36px;border:1px solid #E5E5E5;box-shadow:0 4px 16px rgba(0,0,0,0.08);}

        .post-excerpt{font-size:16px;color:#555555;line-height:1.8;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #E5E5E5;font-style:italic;}

        .post-content{font-size:15px;color:#333333;line-height:1.9;}
        .post-content h1{font-family:'Cinzel',serif;font-size:2rem;font-weight:700;color:#111111;margin:1.5rem 0 1rem;}
        .post-content h2{font-family:'Cinzel',serif;font-size:1.75rem;font-weight:700;color:#111111;margin:1.5rem 0 1rem;padding-bottom:8px;border-bottom:1px solid #E5E5E5;}
        .post-content h3{font-family:'Cinzel',serif;font-size:1.4rem;font-weight:600;color:#5B21B6;margin:1.25rem 0 0.75rem;}
        .post-content h4{font-size:1.1rem;font-weight:600;color:#111111;margin:1rem 0 0.5rem;}
        .post-content p{margin:0 0 1rem;line-height:1.85;}
        .post-content ul{list-style:disc;padding-left:1.5rem;margin:1rem 0;}
        .post-content ol{list-style:decimal;padding-left:1.5rem;margin:1rem 0;}
        .post-content li{margin:0.4rem 0;color:#333333;}
        .post-content blockquote{border-left:4px solid #5B21B6;padding:1rem 1.5rem;background:#F5F3FF;margin:1.5rem 0;color:#444444;font-style:italic;border-radius:0 8px 8px 0;}
        .post-content a{color:#5B21B6;text-decoration:underline;}
        .post-content strong{font-weight:700;color:#111111;}
        .post-content u{text-decoration:underline;}
        .post-content s{text-decoration:line-through;color:#888888;}
        .post-content img{max-width:100%;border-radius:10px;margin:1.5rem 0;display:block;}
        .post-content hr{border:none;border-top:2px solid #E5E5E5;margin:2rem 0;}
        .post-content pre{background:#F9F9F9;border:1px solid #E5E5E5;border-radius:8px;padding:16px;overflow-x:auto;font-size:14px;}

        .cta-box{margin-top:48px;background:#111111;border-radius:16px;padding:36px;text-align:center;}
        .cta-title{font-family:'Cinzel',serif;font-size:20px;font-weight:700;color:#FFFFFF;margin-bottom:10px;}
        .cta-sub{color:rgba(255,255,255,0.65);font-size:14px;margin-bottom:22px;}
        .btn-primary{background:#5B21B6;color:#FFFFFF;padding:13px 30px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;transition:all 0.2s;}
        .btn-primary:hover{background:#4C1D95;transform:translateY(-1px);}

        .faq-section{margin-top:44px;}
        .faq-title{font-family:'Cinzel',serif;font-size:20px;font-weight:700;color:#111111;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #E5E5E5;}
        .faq-item{border:1px solid #E5E5E5;border-radius:10px;margin-bottom:10px;overflow:hidden;transition:border-color 0.2s;background:#FFFFFF;}
        .faq-item.open{border-color:#5B21B6;}
        .faq-q{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;cursor:pointer;background:#FAFAFA;transition:background 0.2s;}
        .faq-q:hover{background:#F5F3FF;}
        .faq-item.open .faq-q{background:#F5F3FF;}
        .faq-q-text{font-size:15px;font-weight:600;color:#111111;flex:1;}
        .faq-chevron{font-size:13px;color:#5B21B6;transition:transform 0.25s;flex-shrink:0;}
        .faq-item.open .faq-chevron{transform:rotate(180deg);}
        .faq-a{max-height:0;overflow:hidden;transition:max-height 0.3s ease,padding 0.3s;}
        .faq-item.open .faq-a{max-height:400px;padding:0 20px 16px;}
        .faq-a-text{font-size:14px;color:#555555;line-height:1.8;padding-top:12px;border-top:1px solid #F0F0F0;}

        .loading-state{text-align:center;padding:80px 24px;color:#888888;}
        .loading-state a{color:#5B21B6;}

        footer{background:#111111;padding:50px 60px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px;margin-top:80px;}
        .footer-logo{font-family:'Cinzel',serif;font-size:17px;font-weight:900;color:#FFFFFF;}
        .footer-links{display:flex;gap:24px;list-style:none;flex-wrap:wrap;}
        .footer-links a{color:rgba(255,255,255,0.6);text-decoration:none;font-size:13px;transition:color 0.2s;}
        .footer-links a:hover{color:#FFFFFF;}
        .footer-copy{font-size:12px;color:rgba(255,255,255,0.4);}

        @media(max-width:768px){
          nav{padding:16px 24px;}
          .nav-links{display:none;}
          .wrap{padding:90px 16px 60px;}
          footer{padding:36px 24px;flex-direction:column;text-align:center;}
        }
      `}</style>

      <nav>
        <a href="/" className="nav-logo">FIRESTICK4UK</a>
        <ul className="nav-links">
          <li><a href="/">Home</a></li>
          <li><a href="/products">Products</a></li>
          <li><a href="/blog">Blog</a></li>
          <li><a href="/contact">Contact</a></li>
          <li><a href="/products" className="nav-cta">Shop Now</a></li>
        </ul>
      </nav>

      <div className="wrap">
        {!post ? (
          <div className="loading-state">
            Post not found. <a href="/blog">← Back to Blog</a>
          </div>
        ) : (
          <>
            <div className="breadcrumb">
              <a href="/">Home</a><span>›</span>
              <a href="/blog">Blog</a><span>›</span>
              <span style={{color:"#444444"}}>{post.title}</span>
            </div>
            <a href="/blog" className="back">← Back to Blog</a>
            {post.badgeText && <div className="post-badge">{post.badgeText}</div>}
            <h1 className="post-title">{post.title}</h1>
            <div className="post-meta">
              <span>📅 {dateStr}</span>
              <span>📁 {post.category}</span>
            </div>
            {post.featured_image && (
              <img src={post.featured_image} alt={post.title} className="featured-img" loading="eager" />
            )}
            {post.excerpt && <div className="post-excerpt">{post.excerpt}</div>}
            {post.content && (
              <div className="post-content" dangerouslySetInnerHTML={{ __html: post.content }} />
            )}

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

      <a href="https://wa.me/447934519060" style={{position:"fixed",bottom:30,right:30,zIndex:999,width:58,height:58,borderRadius:"50%",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 25px rgba(37,211,102,0.5)",textDecoration:"none",fontSize:26}} target="_blank" rel="noopener noreferrer">💬</a>
    </>
  );
}
