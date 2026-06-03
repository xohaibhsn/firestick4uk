import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found — Firestick4UK",
};

export default function NotFound() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
        body{background:#FFFFFF;color:#111111;font-family:'Raleway',sans-serif;}
        nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:18px 60px;display:flex;align-items:center;justify-content:space-between;background:#FFFFFF;border-bottom:1px solid #E5E5E5;box-shadow:0 1px 4px rgba(0,0,0,0.06);}
        .nav-logo{font-family:'Cinzel',serif;font-size:20px;font-weight:900;color:#111111;text-decoration:none;letter-spacing:2px;}
        .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:100px 24px 60px;text-align:center;background:#FFFFFF;}
        .content{max-width:560px;}
        .code{font-family:'Cinzel',serif;font-size:clamp(80px,15vw,140px);font-weight:900;line-height:1;color:#5B21B6;margin-bottom:8px;}
        .icon{font-size:48px;margin-bottom:20px;display:block;}
        .title{font-family:'Cinzel',serif;font-size:clamp(20px,3vw,28px);font-weight:700;color:#111111;margin-bottom:14px;}
        .sub{color:#555555;font-size:15px;line-height:1.7;margin-bottom:40px;}
        .btns{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;}
        .btn-primary{background:#5B21B6;color:#FFFFFF;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;transition:all 0.2s;}
        .btn-primary:hover{background:#4C1D95;transform:translateY(-1px);box-shadow:0 4px 12px rgba(91,33,182,0.3);}
        .btn-secondary{background:transparent;color:#111111;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;border:2px solid #E5E5E5;transition:all 0.2s;}
        .btn-secondary:hover{border-color:#5B21B6;color:#5B21B6;}
        .links{display:flex;gap:24px;justify-content:center;flex-wrap:wrap;margin-top:40px;border-top:1px solid #E5E5E5;padding-top:32px;}
        .links a{color:#666666;text-decoration:none;font-size:13px;transition:color 0.2s;}
        .links a:hover{color:#5B21B6;}
        @media(max-width:600px){nav{padding:16px 24px;}}
      `}</style>

      <nav>
        <a href="/" className="nav-logo">FIRESTICK4UK</a>
      </nav>

      <div className="wrap">
        <div className="content">
          <div className="code">404</div>
          <span className="icon">🔍</span>
          <h1 className="title">Page Not Found</h1>
          <p className="sub">
            Oops! The page you&apos;re looking for doesn&apos;t exist or has been moved.
            Let&apos;s get you back on track.
          </p>
          <div className="btns">
            <a href="/" className="btn-primary">Go Home</a>
            <a href="/products" className="btn-secondary">Browse Products</a>
          </div>
          <div className="links">
            <a href="/order-tracking">Track Order</a>
            <a href="/contact">Contact Us</a>
            <a href="/faq">FAQ</a>
            <a href="/blog">Blog</a>
          </div>
        </div>
      </div>
    </>
  );
}
