"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPAudit() {
  return <ERPLayout title="Audit Log" active="audit">{(user, currency) => user.role==="admin" ? <AuditContent user={user} currency={currency} /> : <div style={{padding:40,textAlign:"center",color:"rgba(255,255,255,0.35)"}}>⛔ Admin access only</div>}</ERPLayout>;
}

function AuditContent({ user: _u, currency: _c }: { user: any; currency: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const url = filter ? `/api/erp/audit?action=${encodeURIComponent(filter)}` : "/api/erp/audit?limit=200";
    fetch(url).then(r=>r.json()).then(d=>{ setLogs(Array.isArray(d)?d:[]); setLoading(false); }).catch(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[]);

  const actionColor: Record<string,string> = {
    LOGIN:"badge-green", LOGIN_FAILED:"badge-red",
    CLOCK_IN:"badge-blue", CLOCK_OUT:"badge-blue",
    EXPENSE_APPROVED:"badge-green", EXPENSE_REJECTED:"badge-red",
    LEAVE_APPROVED:"badge-green", LEAVE_REJECTED:"badge-red",
    SALARY_BULK_CREDIT:"badge-purple",
  };

  return (
    <div>
      <div style={{marginBottom:20,display:"flex",gap:10,flexWrap:"wrap"}}>
        <select className="erp-select" style={{width:"auto",padding:"8px 14px"}} value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="">All Actions</option>
          <option value="LOGIN">Login</option>
          <option value="CLOCK">Attendance</option>
          <option value="EXPENSE">Expenses</option>
          <option value="LEAVE">Leaves</option>
          <option value="SALARY">Salary</option>
        </select>
        <button className="erp-btn erp-btn-primary" onClick={load}>Filter</button>
      </div>

      <div className="erp-card">
        <div className="erp-section-title" style={{marginBottom:14}}>System Activity Log</div>
        {loading ? <div className="erp-empty">Loading...</div> : (
          <div className="erp-table-wrap">
            <table>
              <thead><tr><th>Date & Time</th><th>User</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
              <tbody>
                {logs.length===0&&<tr><td colSpan={5} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No audit logs found</td></tr>}
                {logs.map((l:any)=>(
                  <tr key={l.id}>
                    <td style={{fontSize:11,color:"rgba(255,255,255,0.4)",whiteSpace:"nowrap"}}>{new Date(l.created_at).toLocaleString("en-GB")}</td>
                    <td style={{fontSize:12,fontWeight:500}}>{l.user_name||<span style={{color:"rgba(255,255,255,0.25)"}}>System</span>}</td>
                    <td><span className={`badge ${actionColor[l.action]||"badge-orange"}`} style={{fontSize:10}}>{l.action}</span></td>
                    <td style={{fontSize:12,color:"rgba(255,255,255,0.6)",maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.details||"—"}</td>
                    <td style={{fontSize:11,color:"rgba(255,255,255,0.25)"}}>{l.ip_address||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
