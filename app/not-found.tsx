import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found — Firestick4UK",
};

export default function NotFound() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        :root { --purple-mid: #4a0080; --purple-bright: #8b00ff; --purple-glow: #bf5fff; --gold: #ffd700; }
        body { background: #0a0010; color: #fff; font-family: 'Raleway', sans-serif; }
        .bg { position: fixed; inset: 0; z-index: 0;
          background: radial-gradient(ellipse at 30% 30%, #2d0050 0%, transparent 55%),
                      radial-gradient(ellipse at 70% 70%, #1a0035 0%, transparent 55%), #0a0010; }
        nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; padding: 18px 60px;
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(13,0,16,0.96); backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(139,0,255,0.2); }
        .nav-logo { font-family: 'Cinzel', serif; font-size: 20px; font-weight: 900;
          background: linear-gradient(135deg, var(--purple-glow), var(--gold));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          text-decoration: none; letter-spacing: 2px; }
        .wrap { position: relative; z-index: 1; min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          padding: 100px 24px 60px; text-align: center; }
        .content { max-width: 560px; }
        .code { font-family: 'Cinzel', serif; font-size: clamp(80px, 15vw, 140px); font-weight: 900; line-height: 1;
          background: linear-gradient(135deg, var(--purple-glow), var(--gold));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 0 40px rgba(139,0,255,0.4)); margin-bottom: 8px; }
        .icon { font-size: 48px; margin-bottom: 20px; display: block; }
        .title { font-family: 'Cinzel', serif; font-size: clamp(20px, 3vw, 28px); font-weight: 700;
          color: white; margin-bottom: 14px; }
        .sub { color: rgba(255,255,255,0.5); font-size: 15px; line-height: 1.7; margin-bottom: 40px; }
        .btns { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
        .btn-primary { background: linear-gradient(135deg, var(--purple-mid), var(--purple-bright));
          color: white; padding: 14px 32px; border-radius: 50px; text-decoration: none;
          font-size: 14px; font-weight: 600; letter-spacing: 0.5px;
          box-shadow: 0 0 25px rgba(139,0,255,0.4); transition: all 0.3s; }
        .btn-primary:hover { box-shadow: 0 0 40px rgba(139,0,255,0.7); transform: translateY(-2px); }
        .btn-secondary { background: transparent; color: rgba(255,255,255,0.6);
          padding: 14px 32px; border-radius: 50px; text-decoration: none;
          font-size: 14px; font-weight: 500; border: 1px solid rgba(139,0,255,0.3);
          transition: all 0.3s; }
        .btn-secondary:hover { border-color: var(--purple-glow); color: var(--purple-glow); }
        .links { display: flex; gap: 24px; justify-content: center; flex-wrap: wrap;
          margin-top: 40px; border-top: 1px solid rgba(139,0,255,0.1); padding-top: 32px; }
        .links a { color: rgba(255,255,255,0.35); text-decoration: none; font-size: 13px; transition: color 0.2s; }
        .links a:hover { color: var(--purple-glow); }
        @media(max-width:600px){ nav{padding:16px 24px;} }
      `}</style>

      <div className="bg" />

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
