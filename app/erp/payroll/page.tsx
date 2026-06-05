"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPPayroll() {
  return (
    <ERPLayout title="Payroll" active="payroll">
      {(user) => (user.role==="admin"||user.role==="manager")
        ? <PayrollContent user={user} />
        : <div style={{padding:40,textAlign:"center",color:"#888"}}>⛔ Access restricted</div>}
    </ERPLayout>
  );
}

const _now = new Date();
const NOW  = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}`;
// Last completed month (same logic as lib/payrollUtils)
const PREV_MONTH = _now.getMonth() === 0
  ? `${_now.getFullYear()-1}-12`
  : `${_now.getFullYear()}-${String(_now.getMonth()).padStart(2,'0')}`;

const fmt  = (n: number) => `Rs. ${Math.abs(Math.round(n)).toLocaleString("en-PK")}`;
const fmtD = (n: number) => `${n % 1 === 0 ? n : n.toFixed(1)} day${n !== 1 ? 's' : ''}`;

function statusBadge(s: string) {
  if (s==="credited") return <span style={{background:"#DCFCE7",color:"#166534",border:"1px solid #BBF7D0",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700}}>✅ Credited</span>;
  if (s==="pending")  return <span style={{background:"#FEF3C7",color:"#92400E",border:"1px solid #FDE68A",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700}}>⏳ Pending</span>;
  return <span style={{background:"#F5F5F5",color:"#888",border:"1px solid #E5E5E5",borderRadius:20,padding:"3px 10px",fontSize:11}}>{s||"—"}</span>;
}

function PayrollContent({ user }: { user: any }) {
  const [tab,         setTab]         = useState<"summary"|"pending"|"credited">("summary");
  const [month,       setMonth]       = useState(PREV_MONTH);
  const [payroll,     setPayroll]     = useState<any[]>([]);
  const [pendingRows, setPendingRows] = useState<any[]>([]);
  const [creditedRows,setCreditedRows]= useState<any[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState("");
  const [deductModal, setDeductModal] = useState<any>(null); // holds payroll row

  const showMsg = (m: string) => { setMsg(m); setTimeout(()=>setMsg(""),4000); };

  // Clamp to previous month maximum
  const safeMonth = (m: string) => m >= NOW ? PREV_MONTH : m;

  const loadSummary = () => {
    setLoading(true);
    const m = safeMonth(month);
    const url = user.role==="manager"
      ? `/api/erp/payroll?month=${m}&manager_id=${user.id}`
      : `/api/erp/payroll?month=${m}`;
    fetch(url).then(r=>r.json()).then(d=>{ setPayroll(Array.isArray(d)?d:[]); setLoading(false); }).catch(()=>setLoading(false));
  };

  const loadPending = () => {
    setLoading(true);
    const q = user.role==="manager" ? `&manager_id=${user.id}` : "";
    fetch(`/api/erp/payroll?view=pending${q}`).then(r=>r.json()).then(d=>{ setPendingRows(Array.isArray(d)?d:[]); setLoading(false); }).catch(()=>setLoading(false));
  };

  const loadCredited = () => {
    setLoading(true);
    const q = user.role==="manager" ? `&manager_id=${user.id}` : "";
    fetch(`/api/erp/payroll?view=credited${q}`).then(r=>r.json()).then(d=>{ setCreditedRows(Array.isArray(d)?d:[]); setLoading(false); }).catch(()=>setLoading(false));
  };

  useEffect(()=>{
    if (tab==="summary") loadSummary();
    else if (tab==="pending") loadPending();
    else loadCredited();
  }, [tab]);

  // Fix 1 — May 2026 exception: full salary, no deductions
  const generateMay2026 = async () => {
    if (!confirm("Generate May 2026 payroll as an EXCEPTION?\n\nThis will set full salary for all employees with NO attendance deductions.")) return;
    const res = await fetch("/api/erp/payroll-generate",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ month_year: "2026-05", exception: true, created_by: user.id }),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      showMsg(`✅ May 2026 exception payroll generated for ${res.generated} employees!`);
      setTab("pending"); loadPending();
    } else showMsg(`❌ ${res.error||"Failed"}`);
  };

  const generatePayroll = async () => {
    const m = safeMonth(month);
    if (!confirm(`Generate attendance-based payroll for ${m}?\n\nThis will:\n• Calculate actual working days\n• Deduct absent/half-day days\n• Include only approved expenses\n• Create pending records for review`)) return;
    const res = await fetch("/api/erp/payroll-generate",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ month_year: m, created_by: user.id }),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      showMsg(`✅ Generated attendance-based payroll for ${res.generated} employees — ${res.month_year}`);
      setTab("pending");
      loadPending();
    } else showMsg(`❌ ${res.error||"Failed"}`);
  };

  const approveCredit = async (id: number) => {
    if (!confirm("Approve & Credit this employee's salary to their ledger?")) return;
    const res = await fetch("/api/erp/payroll",{
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ id, action:"credit", created_by: user.id }),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) { showMsg("✅ Salary credited to employee ledger!"); loadPending(); }
    else showMsg(`❌ ${res.error||"Failed"}`);
  };

  const bulkCredit = async () => {
    const m = safeMonth(month);
    if (!confirm(`Credit salary for all employees for ${m}?`)) return;
    const res = await fetch("/api/erp/payroll",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({month:m,created_by:user.id})}).then(r=>r.json()).catch(()=>({}));
    if (res.success) showMsg(`✅ Salary credited for ${res.credited} employees`);
    else showMsg(`❌ ${res.error||"Failed"}`);
  };

  const total = {
    base:     payroll.reduce((s,e)=>s+Number(e.base_salary||0),0),
    expenses: payroll.reduce((s,e)=>s+Number(e.approved_expenses||0),0),
    advances: payroll.reduce((s,e)=>s+Number(e.advances||0),0),
    net:      payroll.reduce((s,e)=>s+Number(e.net_pay||0),0),
  };

  const parseDeductions = (raw: any): {date:string;reason:string}[] => {
    if (!raw) return [];
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
    if (Array.isArray(raw)) return raw;
    return [];
  };

  return (
    <div>
      {msg && (
        <div style={{marginBottom:14,padding:"10px 16px",background:msg.startsWith("✅")?"#DCFCE7":"#FEE2E2",border:`1px solid ${msg.startsWith("✅")?"#BBF7D0":"#FECACA"}`,borderRadius:10,fontSize:13,color:msg.startsWith("✅")?"#166534":"#DC2626"}}>
          {msg}
        </div>
      )}

      {/* Controls */}
      <div style={{marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <input type="month" className="erp-input" style={{padding:"8px 14px"}}
            value={month} max={PREV_MONTH}
            onChange={e=>setMonth(safeMonth(e.target.value))} />
          <button className="erp-btn erp-btn-primary" onClick={()=>{ if(tab==="summary") loadSummary(); }}>Load</button>
        </div>
        {user.role==="admin" && (
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className="erp-btn" style={{background:"#5B21B6",color:"#fff",border:"none",fontWeight:700}}
              onClick={generatePayroll}>
              📊 Generate {month} Payroll
            </button>
            <button className="erp-btn" style={{background:"#EA580C",color:"#fff",border:"none",fontWeight:700}}
              onClick={generateMay2026}>
              🔄 May 2026 Exception
            </button>
            <button className="erp-btn erp-btn-green" onClick={bulkCredit}>💰 Credit All Salaries</button>
            <button className="erp-btn erp-btn-outline" onClick={()=>window.print()}>🖨 Print</button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",gap:0,marginBottom:18,borderRadius:10,overflow:"hidden",border:"1px solid #E5E5E5"}}>
        {([
          {key:"summary",  label:"📋 Summary"},
          {key:"pending",  label:`⏳ Pending Approval ${pendingRows.length>0?`(${pendingRows.length})`:""}`.trim()},
          {key:"credited", label:"✅ Credited"},
        ] as const).map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{flex:1,padding:"10px",border:"none",background:tab===t.key?"#5B21B6":"#FFFFFF",color:tab===t.key?"#fff":"#444",fontWeight:tab===t.key?700:400,fontSize:13,cursor:"pointer",borderRight:"1px solid #E5E5E5"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SUMMARY ── */}
      {tab==="summary" && (
        <>
          <div className="erp-stat-grid" style={{marginBottom:18}}>
            {[
              {label:"Total Base Salary",val:fmt(total.base),icon:"💼"},
              {label:"Approved Expenses",val:fmt(total.expenses),icon:"💸"},
              {label:"Total Advances",val:fmt(total.advances),icon:"⬇"},
              {label:"Net Payroll",val:fmt(total.net),icon:"💰"},
            ].map(s=>(
              <div key={s.label} className="erp-stat">
                <div className="erp-stat-icon">{s.icon}</div>
                <div className="erp-stat-val" style={{fontSize:18}}>{s.val}</div>
                <div className="erp-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="erp-card">
            <div className="erp-section-header"><div className="erp-section-title">Payroll Summary — {month}</div></div>
            {loading ? <div className="erp-empty">Loading...</div> : (
              <div className="erp-table-wrap">
                <table>
                  <thead><tr><th>Employee</th><th>Dept</th><th>Days Present</th><th>Base Salary</th><th>Expenses</th><th>Advances</th><th>Net Pay</th><th>Status</th></tr></thead>
                  <tbody>
                    {payroll.length===0&&<tr><td colSpan={8} style={{textAlign:"center",color:"#888",padding:24}}>No payroll data for {month}. Use "Generate Payroll" button.</td></tr>}
                    {payroll.map((e:any)=>(
                      <tr key={e.id}>
                        <td style={{fontWeight:600}}>{e.name}</td>
                        <td style={{fontSize:12,color:"#888"}}>{e.department||"—"}</td>
                        <td style={{textAlign:"center"}}><span className="badge badge-green">{e.present_days}d</span></td>
                        <td style={{fontWeight:600}}>{fmt(e.base_salary||0)}</td>
                        <td style={{color:"#16A34A"}}>+{fmt(e.approved_expenses||0)}</td>
                        <td style={{color:"#DC2626"}}>-{fmt(e.advances||0)}</td>
                        <td style={{fontWeight:700,color:"#5B21B6",fontSize:14}}>{fmt(e.net_pay||0)}</td>
                        <td>{statusBadge(e.payroll_status)}</td>
                      </tr>
                    ))}
                    {payroll.length>0&&(
                      <tr style={{borderTop:"2px solid #E5E5E5",background:"#F9F9F9"}}>
                        <td colSpan={3} style={{fontWeight:700,fontSize:11,letterSpacing:"1px",textTransform:"uppercase",color:"#666"}}>TOTAL</td>
                        <td style={{fontWeight:700}}>{fmt(total.base)}</td>
                        <td style={{fontWeight:700,color:"#16A34A"}}>+{fmt(total.expenses)}</td>
                        <td style={{fontWeight:700,color:"#DC2626"}}>-{fmt(total.advances)}</td>
                        <td style={{fontWeight:900,color:"#5B21B6",fontSize:15}}>{fmt(total.net)}</td>
                        <td/>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── PENDING ── */}
      {tab==="pending" && (
        <div>
          {loading ? <div className="erp-empty">Loading...</div>
          : pendingRows.length===0 ? (
            <div className="erp-card">
              <div className="erp-empty">
                No pending payroll. Click <strong>"📊 Generate {month} Payroll"</strong> to create attendance-based payroll records.
              </div>
            </div>
          ) : pendingRows.map((p:any)=>{
            const deductions = parseDeductions(p.deduction_details);
            const hasDed = Number(p.deduction_days||0) > 0;
            return (
              <div key={p.id} className="erp-card" style={{marginBottom:14}}>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:16,paddingBottom:14,borderBottom:"1px solid #F0F0F0"}}>
                  <div>
                    <div style={{fontSize:16,fontWeight:700,color:"#111"}}>{p.name}</div>
                    <div style={{fontSize:12,color:"#888",marginTop:2}}>{p.department||"—"} · <span style={{fontFamily:"monospace",color:"#5B21B6",fontWeight:600}}>{p.month_year}</span></div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    {statusBadge(p.status)}
                    {p.generated_at && <div style={{fontSize:10,color:"#AAA",marginTop:4}}>Generated {new Date(p.generated_at).toLocaleDateString("en-GB")}</div>}
                  </div>
                </div>

                {/* Breakdown */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                  {[
                    {label:"Base Salary",     val:fmt(p.base_salary||0),        color:"#111",  prefix:""},
                    {label:"Daily Rate",       val:fmt(p.daily_rate||0)+"/day",  color:"#666",  prefix:""},
                    {label:"Deduction Days",   val:fmtD(Number(p.deduction_days||0)),color:hasDed?"#DC2626":"#16A34A",prefix:""},
                    {label:"Total Deductions", val:"-"+fmt(p.total_deductions||0), color:hasDed?"#DC2626":"#888",prefix:""},
                    {label:"Approved Expenses",val:"+"+fmt(p.total_expenses||0),  color:"#16A34A",prefix:""},
                    {label:"Advances",         val:"-"+fmt(p.advances||0),         color:Number(p.advances)>0?"#DC2626":"#888",prefix:""},
                  ].map(row=>(
                    <div key={row.label} style={{background:"#F9F9F9",borderRadius:8,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:11,color:"#666",fontWeight:600,letterSpacing:"0.3px"}}>{row.label}</span>
                      <span style={{fontSize:13,fontWeight:700,color:row.color}}>{row.val}</span>
                    </div>
                  ))}
                </div>

                {/* Net Pay */}
                <div style={{background:"#EDE9FE",border:"1px solid #DDD6FE",borderRadius:10,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <span style={{fontWeight:700,fontSize:14,color:"#5B21B6"}}>NET PAY</span>
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:900,color:"#5B21B6"}}>{fmt(p.net_pay||0)}</span>
                </div>

                {/* Actions */}
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {deductions.length > 0 && (
                    <button className="erp-btn erp-btn-outline" onClick={()=>setDeductModal(p)}>
                      📋 View Deductions ({deductions.length})
                    </button>
                  )}
                  {!deductions.length && (
                    <div style={{fontSize:12,color:"#16A34A",padding:"8px 12px",background:"#DCFCE7",borderRadius:8,border:"1px solid #BBF7D0"}}>
                      ✅ Full attendance — no deductions
                    </div>
                  )}
                  {user.role==="admin" && (
                    <button className="erp-btn erp-btn-green" style={{marginLeft:"auto"}} onClick={()=>approveCredit(p.id)}>
                      ✅ Approve & Credit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREDITED ── */}
      {tab==="credited" && (
        <div className="erp-card">
          <div className="erp-section-header">
            <div className="erp-section-title">Credited Payroll ({creditedRows.length})</div>
            <button className="erp-btn erp-btn-sm erp-btn-outline" onClick={loadCredited}>🔄 Refresh</button>
          </div>
          {loading ? <div className="erp-empty">Loading...</div> : creditedRows.length===0 ? (
            <div className="erp-empty">No credited payroll records yet.</div>
          ) : (
            <div className="erp-table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Month</th><th>Base</th><th>Deductions</th><th>Expenses</th><th>Net Pay</th><th>Credited On</th></tr></thead>
                <tbody>
                  {creditedRows.map((p:any)=>(
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>{p.name}</td>
                      <td style={{fontFamily:"monospace",color:"#5B21B6"}}>{p.month_year}</td>
                      <td>{fmt(p.base_salary||0)}</td>
                      <td style={{color:"#DC2626"}}>
                        {Number(p.deduction_days||0)>0
                          ? `-${fmt(p.total_deductions||0)} (${fmtD(Number(p.deduction_days||0))})`
                          : <span style={{color:"#16A34A"}}>—</span>}
                      </td>
                      <td style={{color:"#16A34A"}}>+{fmt(p.total_expenses||0)}</td>
                      <td style={{fontWeight:700,color:"#5B21B6"}}>{fmt(p.net_pay||0)}</td>
                      <td style={{fontSize:12,color:"#888"}}>
                        {p.credited_at ? new Date(p.credited_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── DEDUCTION DETAILS MODAL ── */}
      {deductModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#fff",borderRadius:16,maxWidth:500,width:"100%",maxHeight:"80vh",overflow:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
            <div style={{padding:"20px 24px",borderBottom:"1px solid #F0F0F0",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff",zIndex:1}}>
              <div>
                <div style={{fontWeight:700,fontSize:16,color:"#DC2626"}}>📋 Deduction Details</div>
                <div style={{fontSize:12,color:"#888",marginTop:2}}>{deductModal.name} · {deductModal.month_year}</div>
              </div>
              <button onClick={()=>setDeductModal(null)} style={{background:"#F5F5F5",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13,color:"#555"}}>✕ Close</button>
            </div>

            {/* Summary */}
            <div style={{padding:"14px 24px",background:"#FEF2F2",borderBottom:"1px solid #FECACA",display:"flex",gap:20,flexWrap:"wrap"}}>
              {[
                {label:"Deduction Days",val:fmtD(Number(deductModal.deduction_days||0))},
                {label:"Daily Rate",val:fmt(deductModal.daily_rate||0)},
                {label:"Total Deducted",val:"-"+fmt(deductModal.total_deductions||0)},
              ].map(s=>(
                <div key={s.label}>
                  <div style={{fontSize:10,color:"#DC2626",fontWeight:600,letterSpacing:"0.5px"}}>{s.label}</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#DC2626"}}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Date list */}
            <div style={{padding:"16px 24px"}}>
              {parseDeductions(deductModal.deduction_details).length === 0 ? (
                <div style={{textAlign:"center",color:"#16A34A",padding:20,fontWeight:600}}>✅ No deductions found</div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {parseDeductions(deductModal.deduction_details).map((d:{date:string;reason:string}, i:number) => (
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:d.reason.includes("Half")?"#FEF3C7":"#FEE2E2",borderRadius:8,border:`1px solid ${d.reason.includes("Half")?"#FDE68A":"#FECACA"}`}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"#111"}}>
                          {new Date(d.date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"long",year:"numeric"})}
                        </div>
                        <div style={{fontSize:11,color:d.reason.includes("Half")?"#92400E":"#DC2626",marginTop:2}}>{d.reason}</div>
                      </div>
                      <div style={{fontSize:13,fontWeight:700,color:d.reason.includes("Half")?"#92400E":"#DC2626"}}>
                        -{fmt(Number(deductModal.daily_rate||0) * (d.reason.includes("Half")?0.5:1))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
