"use client";
import { useEffect, useState } from "react";

export const erpStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
  :root{--pm:#4a0080;--pb:#8b00ff;--pg:#bf5fff;--gold:#ffd700;--green:#00c864;--red:#ff4444;--orange:#ff8c00;--blue:#4488ff;}
  body{background:#F5F5F5;color:#111111;font-family:'Raleway',sans-serif;overflow-x:hidden;}
  .erp-layout{display:flex;min-height:100vh;}
  /* ERP SIDEBAR — dark bg (matching admin), white text */
  .erp-sidebar{width:220px;flex-shrink:0;background:#111111;border-right:none;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:50;overflow-y:auto;color:#FFFFFF;}
  .erp-sidebar *{color:#FFFFFF;}
  .erp-logo{padding:24px 20px 16px;border-bottom:1px solid rgba(255,255,255,0.08);}
  .erp-logo-text{font-family:'Cinzel',serif;font-size:13px;font-weight:900;color:#FFFFFF !important;-webkit-text-fill-color:#FFFFFF !important;letter-spacing:1px;}
  .erp-logo-sub{font-size:10px;color:#AAAAAA !important;letter-spacing:2px;text-transform:uppercase;margin-top:2px;}
  .erp-nav{flex:1;padding:14px 10px;display:flex;flex-direction:column;gap:3px;}
  .erp-nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;color:#CCCCCC !important;font-size:13px;font-weight:500;text-decoration:none;transition:all 0.15s;border:1px solid transparent;}
  .erp-nav-item:hover{background:rgba(255,255,255,0.08);color:#FFFFFF !important;}
  .erp-nav-item.active{background:#5B21B6;color:#FFFFFF !important;border-color:transparent;}
  .erp-nav-icon{font-size:16px;width:20px;text-align:center;color:#FFFFFF !important;}
  .erp-nav-section{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888888 !important;padding:10px 12px 4px;margin-top:6px;}
  /* ERP footer — branding only */
  .erp-footer{padding:12px 16px;border-top:1px solid rgba(255,255,255,0.08);}
  .erp-footer-brand{font-size:11px;color:#666666 !important;text-align:center;letter-spacing:1px;}
  /* ERP header user dropdown */
  .erp-header-user-wrap{position:relative;}
  .erp-header-user-btn{display:flex;align-items:center;gap:6px;font-size:13px;color:#444444;background:#F0F0F0;border:1px solid #E5E5E5;padding:6px 14px;border-radius:20px;cursor:pointer;transition:all 0.15s;font-family:'Raleway',sans-serif;font-weight:600;}
  .erp-header-user-btn:hover{background:#E8E0F8;border-color:#5B21B6;color:#5B21B6;}
  .erp-header-dropdown{position:absolute;right:0;top:calc(100% + 6px);background:#FFFFFF;border:1px solid #E5E5E5;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,0.1);min-width:190px;overflow:hidden;z-index:9999;}
  .erp-header-dropdown-header{padding:12px 14px;border-bottom:1px solid #F0F0F0;}
  .erp-header-dropdown-name{font-size:13px;font-weight:700;color:#111111 !important;}
  .erp-header-dropdown-role{font-size:11px;color:#888888 !important;text-transform:capitalize;margin-top:2px;}
  .erp-header-dropdown-item{display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:13px;cursor:pointer;color:#333333 !important;transition:background 0.15s;border:none;background:none;width:100%;text-align:left;font-family:'Raleway',sans-serif;}
  .erp-header-dropdown-item:hover{background:#F9F9F9;}
  .erp-header-dropdown-item.danger{color:#DC2626 !important;}
  .erp-header-dropdown-item.danger:hover{background:#FEF2F2;}
  /* ERP MAIN — light bg */
  .erp-main{margin-left:220px;flex:1;padding:28px;background:#F5F5F5;min-height:100vh;color:#111111;}
  .erp-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px;}
  .erp-page-title{font-family:'Cinzel',serif;font-size:22px;font-weight:700;color:#111111 !important;}
  .erp-page-title span{color:#5B21B6 !important;-webkit-text-fill-color:#5B21B6 !important;}
  .erp-card{background:#FFFFFF;border:1px solid #E5E5E5;border-radius:12px;padding:22px;color:#111111;}
  .erp-card *{color:#111111;}
  .erp-stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:24px;}
  .erp-stat{background:#FFFFFF;border:1px solid #E5E5E5;border-radius:12px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,0.04);}
  .erp-stat-icon{font-size:26px;margin-bottom:8px;}
  .erp-stat-val{font-family:'Cinzel',serif;font-size:26px;font-weight:700;color:#111111 !important;}
  .erp-stat-label{font-size:11px;color:#666666 !important;letter-spacing:1px;text-transform:uppercase;margin-top:3px;}
  .erp-table-wrap{overflow-x:auto;}
  table{width:100%;border-collapse:collapse;}
  th{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#666666 !important;font-weight:600;padding:10px 14px;text-align:left;border-bottom:1px solid #E5E5E5;background:#F9F9F9;}
  td{padding:11px 14px;font-size:13px;color:#333333 !important;border-bottom:1px solid #F0F0F0;}
  tr:last-child td{border:none;}
  tr:hover td{background:#FAFAFA;}
  .erp-section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
  .erp-section-title{font-size:15px;font-weight:700;color:#111111 !important;}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;}
  .badge-green{background:rgba(22,163,74,0.1);border:1px solid rgba(22,163,74,0.3);color:#16A34A !important;}
  .badge-red{background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.25);color:#DC2626 !important;}
  .badge-orange{background:rgba(234,88,12,0.1);border:1px solid rgba(234,88,12,0.25);color:#EA580C !important;}
  .badge-blue{background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.25);color:#2563EB !important;}
  .badge-purple{background:rgba(91,33,182,0.1);border:1px solid rgba(91,33,182,0.25);color:#5B21B6 !important;}
  .erp-btn{padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all 0.2s;}
  .erp-btn-primary{background:#5B21B6;color:#FFFFFF !important;}
  .erp-btn-primary:hover{background:#4C1D95;transform:translateY(-1px);}
  .erp-btn-sm{padding:5px 12px;font-size:12px;}
  .erp-btn-green{background:rgba(22,163,74,0.1);color:#16A34A !important;border:1px solid rgba(22,163,74,0.3);}
  .erp-btn-green:hover{background:rgba(22,163,74,0.2);}
  .erp-btn-red{background:rgba(220,38,38,0.08);color:#DC2626 !important;border:1px solid rgba(220,38,38,0.25);}
  .erp-btn-red:hover{background:rgba(220,38,38,0.15);}
  .erp-btn-outline{background:transparent;color:#444444 !important;border:1px solid #CCCCCC;}
  .erp-btn-outline:hover{border-color:#5B21B6;color:#5B21B6 !important;}
  .erp-input,.erp-select,.erp-textarea{width:100%;background:#FFFFFF;border:1px solid #E5E5E5;border-radius:9px;padding:10px 14px;color:#111111 !important;font-family:'Raleway',sans-serif;font-size:13px;outline:none;transition:all 0.2s;}
  .erp-input:focus,.erp-select:focus,.erp-textarea:focus{border-color:#5B21B6;box-shadow:0 0 0 3px rgba(91,33,182,0.1);}
  .erp-input::placeholder,.erp-textarea::placeholder{color:#999999 !important;}
  .erp-select option{background:#FFFFFF;color:#111111;}
  .erp-textarea{resize:vertical;min-height:70px;}
  .erp-field{margin-bottom:14px;}
  .erp-field label{display:block;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#666666 !important;margin-bottom:6px;font-weight:600;}
  .erp-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .erp-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
  .erp-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;}
  .erp-modal{background:#FFFFFF;border:1px solid #E5E5E5;border-radius:16px;padding:28px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;color:#111111;box-shadow:0 8px 32px rgba(0,0,0,0.12);}
  .erp-modal *{color:#111111;}
  .erp-modal-title{font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#111111 !important;margin-bottom:20px;}
  .erp-modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;}
  .erp-empty{text-align:center;padding:40px;color:#888888 !important;font-size:14px;}
  .erp-clock-btn{padding:14px 32px;border-radius:50px;font-size:15px;font-weight:700;cursor:pointer;border:none;letter-spacing:0.5px;transition:all 0.2s;color:#FFFFFF !important;}
  .erp-clock-in{background:#16A34A;color:#FFFFFF !important;}
  .erp-clock-in:hover{background:#15803D;transform:translateY(-1px);}
  .erp-clock-out{background:#DC2626;color:#FFFFFF !important;}
  .erp-clock-out:hover{background:#B91C1C;transform:translateY(-1px);}
  .erp-hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;background:#111111;border:none;padding:10px;margin-right:10px;border-radius:8px;min-width:44px;min-height:44px;align-items:center;justify-content:center;}
  .erp-hamburger:hover{background:#5B21B6;}
  .erp-hamburger span{display:block;width:22px;height:2px;background:#FFFFFF;border-radius:2px;transition:all 0.2s;}
  .erp-sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:49;}
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
  { href:"/erp/employees", icon:"👥", label:"Users", key:"employees" },
  { href:"/erp/ledger", icon:"📒", label:"Ledger", key:"ledger" },
  { href:"/erp/payroll", icon:"💰", label:"Payroll", key:"payroll" },
  { href:"/erp/audit", icon:"🔍", label:"Audit Log", key:"audit" },
];

// Step 1 — Vendor nav: only My Ledger and Expense Claims (as Bill Submissions)
const vendorNav = [
  { href:"/erp/my-ledger", icon:"📒", label:"My Ledger", key:"my-ledger" },
  { href:"/erp/expenses", icon:"🧾", label:"Bill Submissions", key:"expenses" },
];

const routeRoles: Record<string, string[]> = {
  "/erp/ledger":        ["admin"],
  "/erp/employees":     ["admin"],
  "/erp/payroll":       ["admin"],
  "/erp/approvals":     ["admin","manager"],
  "/erp/my-payroll":    ["admin","manager","employee"],
  "/erp/my-ledger":     ["admin","manager","employee","vendor"],
  "/erp/audit":         ["admin"],
  "/erp/office-expenses": ["admin","manager"],
  "/erp/attendance":    ["admin","manager","employee"],
  "/erp/leaves":        ["admin","manager","employee"],
  "/erp/expenses":      ["admin","manager","employee","vendor"],
  "/erp/dashboard":     ["admin","manager","employee"],
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
        // Vendor can't access most pages — redirect to their ledger
        window.location.href = u.role === "vendor" ? "/erp/my-ledger" : "/erp/dashboard";
        return;
      }
      setUser(u);
    } catch { window.location.href = "/erp"; }
  }, []);

  const [userDropOpen, setUserDropOpen] = useState(false);

  // Fix 4 — auto clock-out sweeper: runs every 15 min silently
  useEffect(() => {
    const runSweeper = () => fetch('/api/erp/attendance-sweeper').catch(()=>{});
    runSweeper();
    const interval = setInterval(runSweeper, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!user) return <><style>{erpStyles}</style><div style={{minHeight:"100vh",background:"#F5F5F5"}} /></>;

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
            {(user.role==="admin" ? adminNav : user.role==="manager" ? managerNav : user.role==="vendor" ? vendorNav : employeeNav).map(item => (
              <a key={item.key} href={item.href} className={`erp-nav-item ${active===item.key?"active":""}`} onClick={() => setSidebarOpen(false)}>
                <span className="erp-nav-icon">{item.icon}</span>{item.label}
              </a>
            ))}
          </nav>
          <div className="erp-footer">
            <div className="erp-footer-brand">FIRESTICK4UK ERP</div>
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
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div className="erp-header-user-wrap">
                <button className="erp-header-user-btn" onClick={() => setUserDropOpen(o => !o)}>
                  👤 {user.name} {userDropOpen ? "▲" : "▼"}
                </button>
                {userDropOpen && (
                  <>
                    <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={() => setUserDropOpen(false)} />
                    <div className="erp-header-dropdown">
                      <div className="erp-header-dropdown-header">
                        <div className="erp-header-dropdown-name">{user.name}</div>
                        <div className="erp-header-dropdown-role">{user.role}</div>
                      </div>
                      <button className="erp-header-dropdown-item danger" onClick={() => { setUserDropOpen(false); logout(); }}>
                        🚪 Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {children(user, currency)}
        </main>
      </div>
    </>
  );
}
