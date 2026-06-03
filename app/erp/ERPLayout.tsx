"use client";
import { useEffect, useState } from "react";

export const erpStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
  :root{--pm:#4a0080;--pb:#8b00ff;--pg:#bf5fff;--gold:#ffd700;--green:#00c864;--red:#ff4444;--orange:#ff8c00;--blue:#4488ff;}
  body{background:#0F0520;color:#FFFFFF;font-family:'Raleway',sans-serif;overflow-x:hidden;}
  .erp-layout{display:flex;min-height:100vh;}
  /* ERP SIDEBAR — dark bg, all text WHITE */
  .erp-sidebar{width:220px;flex-shrink:0;background:#0F0520;border-right:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:50;overflow-y:auto;color:#FFFFFF;}
  .erp-sidebar *{color:#FFFFFF;}
  .erp-logo{padding:24px 20px 16px;border-bottom:1px solid rgba(255,255,255,0.08);}
  .erp-logo-text{font-family:'Cinzel',serif;font-size:13px;font-weight:900;color:#FFFFFF !important;-webkit-text-fill-color:#FFFFFF !important;letter-spacing:1px;}
  .erp-logo-sub{font-size:10px;color:#AAAAAA !important;letter-spacing:2px;text-transform:uppercase;margin-top:2px;}
  .erp-nav{flex:1;padding:14px 10px;display:flex;flex-direction:column;gap:3px;}
  .erp-nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;color:#BBBBBB !important;font-size:13px;font-weight:500;text-decoration:none;transition:all 0.2s;border:1px solid transparent;}
  .erp-nav-item:hover{background:rgba(255,255,255,0.08);color:#FFFFFF !important;}
  .erp-nav-item.active{background:#5B21B6;color:#FFFFFF !important;border-color:rgba(91,33,182,0.4);}
  .erp-nav-icon{font-size:16px;width:20px;text-align:center;color:#FFFFFF !important;}
  .erp-nav-section{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888888 !important;padding:10px 12px 4px;margin-top:6px;}
  .erp-footer{padding:12px 10px;border-top:1px solid rgba(255,255,255,0.08);}
  .erp-user-card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 12px;margin-bottom:8px;}
  .erp-user-name{font-size:13px;font-weight:600;color:#FFFFFF !important;}
  .erp-user-role{font-size:11px;color:#AAAAAA !important;text-transform:capitalize;}
  .erp-logout{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;cursor:pointer;color:#FF9999 !important;font-size:12px;border:none;background:none;width:100%;transition:all 0.2s;}
  .erp-logout:hover{background:rgba(220,38,38,0.15);color:#FF6666 !important;}
  /* ERP MAIN — dark bg, all text WHITE */
  .erp-main{margin-left:220px;flex:1;padding:28px;background:#0F0520;min-height:100vh;color:#FFFFFF;}
  .erp-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px;}
  .erp-page-title{font-family:'Cinzel',serif;font-size:22px;font-weight:700;color:#FFFFFF !important;}
  .erp-page-title span{color:#BFA5FF !important;-webkit-text-fill-color:#BFA5FF !important;}
  .erp-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:22px;color:#FFFFFF;}
  .erp-card *{color:#FFFFFF;}
  .erp-stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:24px;}
  .erp-stat{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:18px;}
  .erp-stat-icon{font-size:26px;margin-bottom:8px;}
  .erp-stat-val{font-family:'Cinzel',serif;font-size:26px;font-weight:700;color:#FFFFFF !important;}
  .erp-stat-label{font-size:11px;color:#AAAAAA !important;letter-spacing:1px;text-transform:uppercase;margin-top:3px;}
  .erp-table-wrap{overflow-x:auto;}
  table{width:100%;border-collapse:collapse;}
  th{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#AAAAAA !important;font-weight:600;padding:10px 14px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);}
  td{padding:11px 14px;font-size:13px;color:#DDDDDD !important;border-bottom:1px solid rgba(255,255,255,0.05);}
  tr:last-child td{border:none;}
  tr:hover td{background:rgba(255,255,255,0.03);}
  .erp-section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
  .erp-section-title{font-size:15px;font-weight:700;color:#FFFFFF !important;}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;}
  .badge-green{background:rgba(0,200,100,0.15);border:1px solid rgba(0,200,100,0.3);color:#4ADE80 !important;}
  .badge-red{background:rgba(255,68,68,0.15);border:1px solid rgba(255,68,68,0.3);color:#FCA5A5 !important;}
  .badge-orange{background:rgba(255,140,0,0.15);border:1px solid rgba(255,140,0,0.3);color:#FCD34D !important;}
  .badge-blue{background:rgba(68,136,255,0.15);border:1px solid rgba(68,136,255,0.3);color:#93C5FD !important;}
  .badge-purple{background:rgba(139,0,255,0.2);border:1px solid rgba(139,0,255,0.4);color:#C4B5FD !important;}
  .erp-btn{padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all 0.2s;color:#FFFFFF !important;}
  .erp-btn-primary{background:#5B21B6;color:#FFFFFF !important;}
  .erp-btn-primary:hover{background:#4C1D95;transform:translateY(-1px);}
  .erp-btn-sm{padding:5px 12px;font-size:12px;}
  .erp-btn-green{background:rgba(0,200,100,0.15);color:#4ADE80 !important;border:1px solid rgba(0,200,100,0.3);}
  .erp-btn-green:hover{background:rgba(0,200,100,0.3);}
  .erp-btn-red{background:rgba(255,68,68,0.15);color:#FCA5A5 !important;border:1px solid rgba(255,68,68,0.3);}
  .erp-btn-red:hover{background:rgba(255,68,68,0.3);}
  .erp-btn-outline{background:transparent;color:#CCCCCC !important;border:1px solid rgba(255,255,255,0.2);}
  .erp-btn-outline:hover{border-color:#BFA5FF;color:#BFA5FF !important;}
  .erp-input,.erp-select,.erp-textarea{width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:9px;padding:10px 14px;color:#FFFFFF !important;font-family:'Raleway',sans-serif;font-size:13px;outline:none;transition:all 0.2s;}
  .erp-input:focus,.erp-select:focus,.erp-textarea:focus{border-color:#BFA5FF;background:rgba(255,255,255,0.1);}
  .erp-input::placeholder,.erp-textarea::placeholder{color:rgba(255,255,255,0.35) !important;}
  .erp-select option{background:#1a0035;color:#FFFFFF;}
  .erp-textarea{resize:vertical;min-height:70px;}
  .erp-field{margin-bottom:14px;}
  .erp-field label{display:block;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#AAAAAA !important;margin-bottom:6px;}
  .erp-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .erp-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
  .erp-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;}
  .erp-modal{background:#1A0A2E;border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:28px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;color:#FFFFFF;}
  .erp-modal *{color:#FFFFFF;}
  .erp-modal-title{font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#FFFFFF !important;margin-bottom:20px;}
  .erp-modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;}
  .erp-empty{text-align:center;padding:40px;color:#888888 !important;font-size:14px;}
  .erp-clock-btn{padding:14px 32px;border-radius:50px;font-size:15px;font-weight:700;cursor:pointer;border:none;letter-spacing:0.5px;transition:all 0.3s;color:#FFFFFF !important;}
  .erp-clock-in{background:linear-gradient(135deg,#00804a,#00c864);color:#FFFFFF !important;}
  .erp-clock-in:hover{box-shadow:0 0 25px rgba(0,200,100,0.5);}
  .erp-clock-out{background:linear-gradient(135deg,#800000,#CC0000);color:#FFFFFF !important;}
  .erp-clock-out:hover{box-shadow:0 0 25px rgba(220,38,38,0.5);}
  .erp-hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;background:none;border:none;padding:6px;margin-right:10px;}
  .erp-hamburger span{display:block;width:22px;height:2px;background:#FFFFFF;border-radius:2px;transition:all 0.2s;}
  .erp-sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:49;}
  @media(max-width:900px){
    .erp-sidebar{transform:translateX(-100%);transition:transform 0.28s ease;}
    .erp-sidebar.open{transform:translateX(0);}
    .erp-sidebar-overlay{display:block;}
    .erp-hamburger{display:flex;}
    .erp-main{margin-left:0;}
    .erp-stat-grid{grid-template-columns:1fr 1fr;}
    .erp-grid-2,.erp-grid-3{grid-template-columns:1fr;}
  }
`;

interface ERPUser { id: number; name: string; email: string; role: string; }
type ERPLayoutProps = { children: (user: ERPUser, currency: string) => React.ReactNode; title: string; active?: string; };

const employeeNav = [
  { href:"/erp/dashboard", icon:"📊", label:"Dashboard", key:"dashboard" },
  { href:"/erp/attendance", icon:"⏰", label:"Attendance", key:"attendance" },
  { href:"/erp/expenses", icon:"💸", label:"My Expenses", key:"expenses" },
  { href:"/erp/leaves", icon:"🌿", label:"My Leaves", key:"leaves" },
  { href:"/erp/my-payroll", icon:"💰", label:"My Payroll", key:"my-payroll" },
  { href:"/erp/my-ledger", icon:"📒", label:"My Ledger", key:"my-ledger" },
];

const managerNav = [
  { href:"/erp/dashboard", icon:"📊", label:"Dashboard", key:"dashboard" },
  { href:"/erp/attendance", icon:"⏰", label:"Attendance", key:"attendance" },
  { href:"/erp/expenses", icon:"💸", label:"My Expenses", key:"expenses" },
  { href:"/erp/leaves", icon:"🌿", label:"My Leaves", key:"leaves" },
  { href:"/erp/my-payroll", icon:"💰", label:"My Payroll", key:"my-payroll" },
  { href:"/erp/my-ledger", icon:"📒", label:"My Ledger", key:"my-ledger" },
  { href:"/erp/approvals", icon:"✅", label:"Approvals", key:"approvals" },
  { href:"/erp/office-expenses", icon:"🏢", label:"Office Expenses", key:"office-expenses" },
];

const adminNav = [
  { href:"/erp/dashboard", icon:"📊", label:"Dashboard", key:"dashboard" },
  { href:"/erp/attendance", icon:"⏰", label:"Attendance", key:"attendance" },
  { href:"/erp/expenses", icon:"💸", label:"Expenses", key:"expenses" },
  { href:"/erp/leaves", icon:"🌿", label:"Leaves", key:"leaves" },
  { href:"/erp/office-expenses", icon:"🏢", label:"Office Expenses", key:"office-expenses" },
  { href:"/erp/employees", icon:"👥", label:"Employees", key:"employees" },
  { href:"/erp/ledger", icon:"📒", label:"Ledger", key:"ledger" },
  { href:"/erp/payroll", icon:"💰", label:"Payroll", key:"payroll" },
  { href:"/erp/audit", icon:"🔍", label:"Audit Log", key:"audit" },
];

const routeRoles: Record<string, string[]> = {
  "/erp/ledger": ["admin"],
  "/erp/employees": ["admin"],
  "/erp/payroll": ["admin"],
  "/erp/approvals": ["admin","manager"],
  "/erp/my-payroll": ["admin","manager","employee"],
  "/erp/my-ledger": ["admin","manager","employee"],
  "/erp/audit": ["admin"],
  "/erp/office-expenses": ["admin","manager"],
};

export default function ERPLayout({ children, title, active }: ERPLayoutProps) {
  const [user, setUser] = useState<ERPUser | null>(null);
  const currency = "PKR";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem("erp_session");
    if (!s) { window.location.href = "/erp"; return; }
    try {
      const u = JSON.parse(s);
      const path = window.location.pathname;
      const allowed = routeRoles[path];
      if (allowed && !allowed.includes(u.role)) {
        window.location.href = "/erp/dashboard";
        return;
      }
      setUser(u);
    } catch { window.location.href = "/erp"; }
  }, []);

  if (!user) return <><style>{erpStyles}</style><div style={{minHeight:"100vh",background:"#0a0010"}} /></>;

  const logout = () => { localStorage.removeItem("erp_session"); window.location.href = "/erp"; };


  return (
    <>
      <style>{erpStyles}</style>
      {sidebarOpen && <div className="erp-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <div className="erp-layout">
        <aside className={`erp-sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="erp-logo">
            <div className="erp-logo-text">FIRESTICK4UK</div>
            <div className="erp-logo-sub">ERP System</div>
          </div>
          <nav className="erp-nav">
            {(user.role==="admin" ? adminNav : user.role==="manager" ? managerNav : employeeNav).map(item => (
              <a key={item.key} href={item.href} className={`erp-nav-item ${active===item.key?"active":""}`} onClick={() => setSidebarOpen(false)}>
                <span className="erp-nav-icon">{item.icon}</span>{item.label}
              </a>
            ))}
          </nav>
          <div className="erp-footer">
            <div className="erp-user-card">
              <div className="erp-user-name">{user.name}</div>
              <div className="erp-user-role">{user.role}</div>
            </div>
            <button className="erp-logout" onClick={() => { setSidebarOpen(false); logout(); }}>🚪 Logout</button>
          </div>
        </aside>
        <main className="erp-main">
          <div className="erp-header">
            <div style={{display:"flex",alignItems:"center"}}>
              <button className="erp-hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
                <span/><span/><span/>
              </button>
              <h1 className="erp-page-title">{title}</h1>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <span style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",background:"rgba(0,200,100,0.1)",border:"1px solid rgba(0,200,100,0.2)",padding:"4px 10px",borderRadius:16}}>₨ PKR</span>
              <span style={{fontSize:"13px",color:"rgba(255,255,255,0.35)"}}>👤 {user.name}</span>
            </div>
          </div>
          {children(user, currency)}
        </main>
      </div>
    </>
  );
}
