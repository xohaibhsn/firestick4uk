"use client";
import { useState, useEffect } from "react";

export default function ERPLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem("erp_session");
    if (s) window.location.href = "/erp/dashboard";
  }, []);

  const handleLogin = async () => {
    if (!email || !password) { setError("Please enter email and password"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/erp/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password}) }).then(r=>r.json());
      if (res.success) {
        localStorage.setItem("erp_session", JSON.stringify(res.user));
        window.location.href = "/erp/dashboard";
      } else {
        setError(res.error || "Invalid credentials");
      }
    } catch { setError("Connection error. Please try again."); }
    setLoading(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0010;color:#fff;font-family:'Raleway',sans-serif;}
        .bg{position:fixed;inset:0;z-index:0;background:radial-gradient(ellipse at 30% 30%,#2d0050 0%,transparent 50%),radial-gradient(ellipse at 70% 70%,#1a0035 0%,transparent 55%),#0a0010;}
        .wrap{position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
        .box{background:linear-gradient(135deg,rgba(74,0,128,0.28),rgba(26,0,37,0.92));border:1px solid rgba(139,0,255,0.28);border-radius:24px;padding:48px 40px;width:100%;max-width:420px;text-align:center;}
        .logo{font-family:'Cinzel',serif;font-size:18px;font-weight:900;background:linear-gradient(135deg,#bf5fff,#ffd700);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px;}
        .sub{font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:3px;text-transform:uppercase;margin-bottom:36px;}
        .title{font-family:'Cinzel',serif;font-size:22px;font-weight:700;color:white;margin-bottom:8px;}
        .desc{color:rgba(255,255,255,0.4);font-size:13px;margin-bottom:28px;}
        input{width:100%;background:rgba(139,0,255,0.08);border:1px solid rgba(139,0,255,0.22);border-radius:11px;padding:13px 16px;color:white;font-family:'Raleway',sans-serif;font-size:14px;outline:none;margin-bottom:12px;transition:all 0.2s;}
        input:focus{border-color:#bf5fff;background:rgba(139,0,255,0.14);}
        input::placeholder{color:rgba(255,255,255,0.22);}
        .btn{width:100%;background:linear-gradient(135deg,#4a0080,#8b00ff);color:white;border:none;padding:14px;border-radius:50px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 0 24px rgba(139,0,255,0.4);transition:all 0.3s;margin-top:4px;}
        .btn:hover{box-shadow:0 0 40px rgba(139,0,255,0.7);}
        .btn:disabled{opacity:0.5;cursor:not-allowed;}
        .err{color:#ff8888;font-size:13px;margin-top:12px;}
        .back{display:block;margin-top:20px;color:rgba(255,255,255,0.3);font-size:12px;text-decoration:none;transition:color 0.2s;}
        .back:hover{color:#bf5fff;}
      `}</style>
      <div className="bg" />
      <div className="wrap">
        <div className="box">
          <div className="logo">FIRESTICK4UK</div>
          <div className="sub">ERP System</div>
          <h1 className="title">Staff Login</h1>
          <p className="desc">Internal use only. Authorized personnel only.</p>
          <input type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
          <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
          <button className="btn" onClick={handleLogin} disabled={loading}>{loading?"Signing in...":"Sign In →"}</button>
          {error && <div className="err">⚠️ {error}</div>}
          <a href="/" className="back">← Back to main website</a>
        </div>
      </div>
    </>
  );
}
