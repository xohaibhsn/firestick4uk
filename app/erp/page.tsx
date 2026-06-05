"use client";
import { useState, useEffect } from "react";

export default function ERPLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const roleHome = (role: string) =>
    role === "vendor" ? "/erp/my-ledger" : "/erp/dashboard";

  useEffect(() => {
    const s = localStorage.getItem("erp_session");
    if (s) {
      try {
        const u = JSON.parse(s);
        window.location.href = roleHome(u.role || "employee");
      } catch { window.location.href = "/erp/dashboard"; }
    }
  }, []);

  const handleLogin = async () => {
    if (!email || !password) { setError("Please enter email and password"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/erp/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password}) }).then(r=>r.json());
      if (res.success) {
        localStorage.setItem("erp_session", JSON.stringify(res.user));
        window.location.href = roleHome(res.user.role || "employee");
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
        body{background:#F5F5F5;color:#111111;font-family:'Raleway',sans-serif;}
        .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#F5F5F5;}
        .box{background:#FFFFFF;border:1px solid #E5E5E5;border-radius:16px;padding:48px 40px;width:100%;max-width:420px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08);}
        .logo{font-family:'Cinzel',serif;font-size:22px;font-weight:900;color:#111111;margin-bottom:6px;}
        .sub{font-size:12px;color:#666666;letter-spacing:2px;text-transform:uppercase;margin-bottom:32px;}
        .title{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:#111111;margin-bottom:6px;}
        .desc{color:#888888;font-size:13px;margin-bottom:24px;}
        input{width:100%;background:#FFFFFF;border:1px solid #E5E5E5;border-radius:8px;padding:12px 16px;color:#111111;font-family:'Raleway',sans-serif;font-size:14px;outline:none;margin-bottom:12px;transition:border-color 0.2s;}
        input:focus{border-color:#5B21B6;box-shadow:0 0 0 3px rgba(91,33,182,0.1);}
        input::placeholder{color:#999999;}
        .btn{width:100%;background:#5B21B6;color:#FFFFFF;border:none;padding:14px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s;margin-top:4px;}
        .btn:hover{background:#4C1D95;transform:translateY(-1px);box-shadow:0 4px 12px rgba(91,33,182,0.3);}
        .btn:disabled{opacity:0.5;cursor:not-allowed;}
        .err{color:#DC2626;font-size:13px;margin-top:10px;}
        .back{display:block;margin-top:20px;color:#888888;font-size:12px;text-decoration:none;transition:color 0.2s;}
        .back:hover{color:#5B21B6;}
      `}</style>
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
