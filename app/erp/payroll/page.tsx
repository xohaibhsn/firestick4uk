"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPPayroll() {
  return <ERPLayout title="Payroll" active="payroll">{(user, currency) => (user.role==="admin"||user.role==="manager") ? <PayrollContent user={user} currency={currency} /> : <div style={{padding:40,textAlign:"center",color:"rgba(255,255,255,0.35)"}}>⛔ Access restricted</div>}</ERPLayout>;
}

function PayrollContent({ user, currency }: { user: any; currency: string }) {
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
  const [payroll, setPayroll] = useState<any[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7));
  const [loading, setLoading] = useState(false);
  const [creditMsg, setCreditMsg] = useState("");

  const load = () => {
    setLoading(true);
    // Fix 3 — manager sees their team, not just themselves
    const url = user.role === "manager"
      ? `/api/erp/payroll?month=${month}&manager_id=${user.id}`
      : user.role === "employee"
      ? `/api/erp/payroll?month=${month}&employee_id=${user.id}`
      : `/api/erp/payroll?month=${month}`;
    fetch(url).then(r=>r.json()).then(d=>{ setPayroll(Array.isArray(d)?d:[]); setLoading(false); }).catch(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[]);

  const bulkSalary = async () => {
    if (!confirm(`Credit salary for all employees for ${month}?`)) return;
    const res = await fetch("/api/erp/payroll",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({month,created_by:user.id})}).then(r=>r.json()).catch(()=>({}));
    if (res.success) setCreditMsg(`✅ Salary credited for ${res.credited} employees`);
    else setCreditMsg(`❌ ${res.error||"Failed"}`);
  };

  const printPayroll = () => window.print();

  const total = { base:payroll.reduce((s,e)=>s+Number(e.base_salary||0),0), expenses:payroll.reduce((s,e)=>s+Number(e.approved_expenses||0),0), advances:payroll.reduce((s,e)=>s+Number(e.advances||0),0), net:payroll.reduce((s,e)=>s+Number(e.net_pay||0),0) };

  return (
    <div>
      <div style={{marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <input type="month" className="erp-input" style={{width:"auto",padding:"8px 14px"}} value={month} onChange={e=>setMonth(e.target.value)} />
          <button className="erp-btn erp-btn-primary" onClick={load}>Load</button>
        </div>
        <div style={{display:"flex",gap:10}}>
          {user.role==="admin"&&<button className="erp-btn erp-btn-green" onClick={bulkSalary}>💰 Credit All Salaries</button>}
          <button className="erp-btn erp-btn-outline" onClick={printPayroll}>🖨 Print</button>
        </div>
      </div>

      {creditMsg&&<div style={{marginBottom:16,padding:"10px 16px",background:creditMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",border:`1px solid ${creditMsg.startsWith("✅")?"rgba(0,200,100,0.3)":"rgba(255,68,68,0.25)"}`,borderRadius:10,fontSize:13,color:creditMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{creditMsg}</div>}

      {/* Summary cards */}
      <div className="erp-stat-grid" style={{marginBottom:20}}>
        {[
          {label:"Total Base Salary",val:fmt(total.base),icon:"💼"},
          {label:"Total Expenses",val:fmt(total.expenses),icon:"💸"},
          {label:"Total Advances",val:fmt(total.advances),icon:"⬇"},
          {label:"Net Payroll",val:fmt(total.net),icon:"💰"},
        ].map(s=>(
          <div key={s.label} className="erp-stat">
            <div className="erp-stat-icon">{s.icon}</div>
            <div className="erp-stat-val" style={{fontSize:20}}>{s.val}</div>
            <div className="erp-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="erp-card">
        <div className="erp-section-header"><div className="erp-section-title">Payroll Summary — {month}</div></div>
        {loading ? <div className="erp-empty">Loading...</div> : (
          <div className="erp-table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Department</th><th>Days Present</th><th>Base Salary</th><th>Expenses</th><th>Advances</th><th>Net Pay</th></tr></thead>
              <tbody>
                {payroll.length===0&&<tr><td colSpan={7} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No payroll data for this month</td></tr>}
                {payroll.map((e:any)=>(
                  <tr key={e.id}>
                    <td style={{fontWeight:600}}>{e.name}</td>
                    <td style={{fontSize:12,color:"rgba(255,255,255,0.45)"}}>{e.department||"—"}</td>
                    <td style={{textAlign:"center"}}><span className="badge badge-green">{e.present_days}d</span></td>
                    <td style={{fontWeight:600}}>{fmt(Number(e.base_salary||0))}</td>
                    <td style={{color:"#00c864"}}>+{fmt(Number(e.approved_expenses||0))}</td>
                    <td style={{color:"#ff6666"}}>-{fmt(Number(e.advances||0))}</td>
                    <td style={{fontWeight:700,fontFamily:"'Cinzel',serif",color:Number(e.net_pay)>0?"#bf5fff":"#ff6666",fontSize:15}}>{fmt(Number(e.net_pay||0))}</td>
                  </tr>
                ))}
                {payroll.length>0&&(
                  <tr style={{borderTop:"2px solid rgba(139,0,255,0.25)"}}>
                    <td colSpan={3} style={{fontWeight:700,color:"rgba(255,255,255,0.6)",fontSize:12,letterSpacing:"1px",textTransform:"uppercase"}}>TOTAL</td>
                    <td style={{fontWeight:700}}>{fmt(total.base)}</td>
                    <td style={{fontWeight:700,color:"#00c864"}}>+{fmt(total.expenses)}</td>
                    <td style={{fontWeight:700,color:"#ff6666"}}>-{fmt(total.advances)}</td>
                    <td style={{fontWeight:900,fontFamily:"'Cinzel',serif",color:"var(--pg)",fontSize:16}}>{fmt(total.net)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
