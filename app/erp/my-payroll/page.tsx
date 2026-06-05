"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function MyPayroll() {
  return <ERPLayout title="My Payroll" active="my-payroll">{(user, currency) => <MyPayrollContent user={user} currency={currency} />}</ERPLayout>;
}

// Fix 2E: clamp to last completed month
const _mp = new Date();
const MP_CUTOFF = _mp.getMonth() === 0
  ? `${_mp.getFullYear()-1}-12`
  : `${_mp.getFullYear()}-${String(_mp.getMonth()).padStart(2,'0')}`;

function MyPayrollContent({ user, currency: _c }: { user: any; currency: string }) {
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
  const [data, setData] = useState<any>(null);
  const [month, setMonth] = useState(MP_CUTOFF);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/erp/payroll?month=${month}&employee_id=${user.id}`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) && d.length ? d[0] : null); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{marginBottom:20,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <input type="month" className="erp-input" style={{width:"auto",padding:"8px 14px"}} value={month} max={MP_CUTOFF} onChange={e=>setMonth(e.target.value > MP_CUTOFF ? MP_CUTOFF : e.target.value)} />
        <button className="erp-btn erp-btn-primary" onClick={load}>Load</button>
      </div>

      {loading ? <div className="erp-empty">Loading...</div> : !data ? (
        <div className="erp-card"><div className="erp-empty">No payroll data for {month}</div></div>
      ) : (
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14,marginBottom:20}}>
            {[
              {label:"Base Salary",val:fmt(Number(data.base_salary||0)),icon:"💼",color:"#bf5fff"},
              {label:"Approved Expenses",val:fmt(Number(data.approved_expenses||0)),icon:"💸",color:"#00c864"},
              {label:"Advances Deducted",val:fmt(Number(data.advances||0)),icon:"⬇",color:"#ff6666"},
              {label:"Net Pay",val:fmt(Number(data.net_pay||0)),icon:"💰",color:"#ffd700"},
            ].map(s=>(
              <div key={s.label} className="erp-stat">
                <div className="erp-stat-icon">{s.icon}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:18,fontWeight:700,color:s.color}}>{s.val}</div>
                <div className="erp-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="erp-card">
            <div className="erp-section-title" style={{marginBottom:14}}>Payroll Breakdown — {month}</div>
            <div className="erp-table-wrap">
            <table>
              <tbody>
                {[
                  ["Employee",data.name],
                  ["Department",data.department||"—"],
                  ["Days Present",`${data.present_days||0} days`],
                  ["Base Salary",fmt(Number(data.base_salary||0))],
                  ["Approved Expenses",`+ ${fmt(Number(data.approved_expenses||0))}`],
                  ["Advances / Deductions",`- ${fmt(Number(data.advances||0))}`],
                ].map(([label,val])=>(
                  <tr key={label as string}>
                    <td style={{color:"#666666",fontSize:13,padding:"10px 14px",width:"45%",borderBottom:"1px solid rgba(139,0,255,0.07)"}}>{label}</td>
                    <td style={{fontWeight:600,padding:"10px 14px",borderBottom:"1px solid rgba(139,0,255,0.07)"}}>{val}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{padding:"14px",fontWeight:700,fontSize:15}}>Net Pay</td>
                  <td style={{padding:"14px",fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:900,color:"#5B21B6"}}>{fmt(Number(data.net_pay||0))}</td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
