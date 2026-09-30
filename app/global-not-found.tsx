import { permanentRedirect } from "next/navigation";
import { resolveManagedRedirectForCurrentRequest } from "@/lib/urlRedirectRuntime";

/**
 * True routing-level unmatched URLs (no leaf route).
 * Skips normal root layout — keep this document self-contained.
 */
export default async function GlobalNotFound() {
  const target = await resolveManagedRedirectForCurrentRequest();
  if (target) {
    permanentRedirect(target);
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Page Not Found — Firestick4UK</title>
        <style>{`
          *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
          body{background:#FFFFFF;color:#111111;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
          .bar{padding:18px 24px;border-bottom:1px solid #E5E5E5;box-shadow:0 1px 4px rgba(0,0,0,0.06);}
          .logo{font-size:20px;font-weight:800;color:#111111;text-decoration:none;letter-spacing:2px;}
          .wrap{min-height:calc(100vh - 64px);display:flex;align-items:center;justify-content:center;padding:60px 24px;text-align:center;}
          .content{max-width:560px;}
          .code{font-size:clamp(80px,15vw,140px);font-weight:800;line-height:1;color:#5B21B6;margin-bottom:8px;}
          .title{font-size:clamp(20px,3vw,28px);font-weight:700;color:#111111;margin-bottom:14px;}
          .sub{color:#555555;font-size:15px;line-height:1.7;margin-bottom:40px;}
          .btns{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;}
          .btn-primary{background:#5B21B6;color:#FFFFFF;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;}
          .btn-secondary{background:transparent;color:#111111;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;border:2px solid #E5E5E5;}
          .links{display:flex;gap:24px;justify-content:center;flex-wrap:wrap;margin-top:40px;border-top:1px solid #E5E5E5;padding-top:32px;}
          .links a{color:#666666;text-decoration:none;font-size:13px;}
        `}</style>
      </head>
      <body>
        <div className="bar">
          <a className="logo" href="/">
            FIRESTICK4UK
          </a>
        </div>
        <div className="wrap">
          <div className="content">
            <div className="code">404</div>
            <h1 className="title">Page Not Found</h1>
            <p className="sub">
              Oops! The page you&apos;re looking for doesn&apos;t exist or has been moved.
              Let&apos;s get you back on track.
            </p>
            <div className="btns">
              <a className="btn-primary" href="/">
                Go Home
              </a>
              <a className="btn-secondary" href="/products">
                Browse Products
              </a>
            </div>
            <div className="links">
              <a href="/contact">Contact Us</a>
              <a href="/faq">FAQ</a>
              <a href="/blog">Blog</a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
