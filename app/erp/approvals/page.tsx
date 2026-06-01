"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPApprovals() {
  return <ERPLayout title="Approvals" active="approvals">{(user, currency) => (user.role==="admin"||user.role==="manager") ? <ApprovalsContent user={user} currency={currency} /> : <div style={{padding:40,textAlign:"center",color:"rgba(255,255,255,0.35)"}}>⛔ Access restricted</div>}</ERPLayout>;
}

function ApprovalsContent({ user, currency: _c }: { user: any; currency: string }) {
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
  const [tab, setTab] = useState<"expenses"|"leaves">("expenses");
  const [expenses, setExpenses] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [noteModal, setNoteModal] = useState<any>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => {
    fetch("/api/erp/expenses").then(r=>r.json()).then(d=>setExpenses((Array.isArray(d)?d:[]).filter((e:any)=>e.status==="pending"))).catch(()=>{});
    fetch("/api/erp/leaves").then(r=>r.json()).then(d=>setLeaves((Array.isArray(d)?d:[]).filter((l:any)=>l.status==="pending"))).catch(()=>{});
  };
  useEffect(()=>{ load(); },[]);

  const decideExp = async (id:number, status:string) => {
    await fetch("/api/erp/expenses",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status,admin_note:note,approved_by:user.id})});
    setNoteModal(null); setNote(""); setMsg(`✅ Expense ${status}`); load();
  };

  const decideLeave = async (id:number, status:string) => {
    await fetch("/api/erp/leaves",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});
    setMsg(`✅ Leave ${status}`); load();
  };

  const statusBadge = (s:string) => ({ pending:"badge-orange",approved:"badge-green",rejected:"badge-red" })[s]||"badge-purple";

  return (
    <div>
      {msg&&<div style={{marginBottom:16,padding:"10px 16px",background:"rgba(0,200,100,0.1)",border:"1px solid rgba(0,200,100,0.25)",borderRadius:10,fontSize:13,color:"#00c864"}}>{msg}</div>}

      <div style={{display:"flex",gap:10,marginBottom:20}}>
        <button className={`erp-btn ${tab==="expenses"?"erp-btn-primary":"erp-btn-outline"}`} onClick={()=>setTab("expenses")}>
          💸 Pending Expenses {expenses.length>0&&<span style={{marginLeft:6,background:"rgba(255,140,0,0.3)",padding:"1px 7px",borderRadius:10,fontSize:11}}>{expenses.length}</span>}
        </button>
        <button className={`erp-btn ${tab==="leaves"?"erp-btn-primary":"erp-btn-outline"}`} onClick={()=>setTab("leaves")}>
          🌿 Pending Leaves {leaves.length>0&&<span style={{marginLeft:6,background:"rgba(255,140,0,0.3)",padding:"1px 7px",borderRadius:10,fontSize:11}}>{leaves.length}</span>}
        </button>
      </div>

      {tab==="expenses" && (
        <div className="erp-card">
          <div className="erp-section-title" style={{marginBottom:14}}>Pending Expense Claims</div>
          <div className="erp-table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Employee</th><th>Amount</th><th>Category</th><th>Description</th><th>Receipt</th><th>Actions</th></tr></thead>
              <tbody>
                {expenses.length===0&&<tr><td colSpan={7} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No pending expenses ✅</td></tr>}
                {expenses.map((e:any)=>(
                  <tr key={e.id}>
                    <td style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>{new Date(e.created_at).toLocaleDateString("en-GB")}</td>
                    <td style={{fontWeight:600}}>{e.employee_name}</td>
                    <td style={{fontWeight:700,color:"var(--pg)"}}>{fmt(Number(e.amount))}</td>
                    <td><span className="badge badge-purple">{e.category}</span></td>
                    <td style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12}}>{e.description||"—"}</td>
                    <td>{e.receipt_path?<a href={e.receipt_path} target="_blank" rel="noreferrer" style={{color:"var(--pg)",fontSize:12}}>📎 View</a>:<span style={{color:"rgba(255,255,255,0.2)",fontSize:12}}>—</span>}</td>
                    <td><div style={{display:"flex",gap:6}}>
                      <button className="erp-btn erp-btn-green erp-btn-sm" onClick={()=>{setNoteModal({id:e.id,action:"approved"});setNote("");}}>✅ Approve</button>
                      <button className="erp-btn erp-btn-red erp-btn-sm" onClick={()=>{setNoteModal({id:e.id,action:"rejected"});setNote("");}}>❌ Reject</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="leaves" && (
        <div className="erp-card">
          <div className="erp-section-title" style={{marginBottom:14}}>Pending Leave Requests</div>
          <div className="erp-table-wrap">
            <table>
              <thead><tr><th>Filed</th><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Actions</th></tr></thead>
              <tbody>
                {leaves.length===0&&<tr><td colSpan={8} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No pending leaves ✅</td></tr>}
                {leaves.map((l:any)=>(
                  <tr key={l.id}>
                    <td style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>{new Date(l.created_at).toLocaleDateString("en-GB")}</td>
                    <td style={{fontWeight:600}}>{l.employee_name}</td>
                    <td><span className={`badge ${{sick:"badge-red",annual:"badge-green",emergency:"badge-orange",unpaid:"badge-purple"}[l.leave_type as string]||"badge-purple"}`}>{l.leave_type}</span></td>
                    <td style={{fontSize:13}}>{l.from_date}</td>
                    <td style={{fontSize:13}}>{l.to_date}</td>
                    <td style={{fontWeight:600,color:"var(--pg)"}}>{Math.round((new Date(l.to_date).getTime()-new Date(l.from_date).getTime())/(86400000))+1}d</td>
                    <td style={{fontSize:12,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"rgba(255,255,255,0.5)"}}>{l.reason||"—"}</td>
                    <td><div style={{display:"flex",gap:6}}>
                      <button className="erp-btn erp-btn-green erp-btn-sm" onClick={()=>decideLeave(l.id,"approved")}>✅</button>
                      <button className="erp-btn erp-btn-red erp-btn-sm" onClick={()=>decideLeave(l.id,"rejected")}>❌</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {noteModal&&(
        <div className="erp-modal-overlay" onClick={()=>setNoteModal(null)}>
          <div className="erp-modal" onClick={e=>e.stopPropagation()}>
            <div className="erp-modal-title">{noteModal.action==="approved"?"✅ Approve Expense":"❌ Reject Expense"}</div>
            <div className="erp-field"><label>Note for employee</label><textarea className="erp-textarea" placeholder="Optional note..." value={note} onChange={e=>setNote(e.target.value)} /></div>
            <div className="erp-modal-actions">
              <button className="erp-btn erp-btn-outline" onClick={()=>setNoteModal(null)}>Cancel</button>
              <button className={`erp-btn ${noteModal.action==="approved"?"erp-btn-green":"erp-btn-red"}`} onClick={()=>decideExp(noteModal.id,noteModal.action)}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
