"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPExpenses() {
  return <ERPLayout title="Expenses" active="expenses">{(user, currency) => <ExpContent user={user} currency={currency} />}</ERPLayout>;
}

function ExpContent({ user, currency }: { user: any; currency: string }) {
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
  const [expenses, setExpenses] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount:"", description:"", category:"Travel", receipt_path:"" });
  const [previewImg, setPreviewImg] = useState("");
  const [noteModal, setNoteModal] = useState<any>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => {
    const url = (user.role==="admin"||user.role==="manager") ? "/api/erp/expenses" : `/api/erp/expenses?employee_id=${user.id}`;
    fetch(url).then(r=>r.json()).then(d=>setExpenses(Array.isArray(d)?d:[])).catch(()=>{});
    if (user.role!=="admin") {
      fetch(`/api/erp/expenses?notifications=1&employee_id=${user.id}`).then(r=>r.json()).then(d=>setNotifications(Array.isArray(d)?d:[])).catch(()=>{});
    }
  };
  useEffect(()=>{ load(); },[]);

  const uploadReceipt = async (file: File) => {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result as string); r.onerror=rej; r.readAsDataURL(file); });
      setPreviewImg(base64);
      const data = await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file:base64,name:file.name})}).then(r=>r.json());
      if (data.path) setForm(f=>({...f,receipt_path:data.path}));
    } catch {}
    setUploading(false);
  };

  const submit = async () => {
    if (!form.amount) { setMsg("❌ Amount is required"); return; }
    const res = await fetch("/api/erp/expenses",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,employee_id:user.id})}).then(r=>r.json()).catch(()=>({}));
    if (res.success) { setMsg("✅ Expense submitted"); setForm({amount:"",description:"",category:"Travel",receipt_path:""}); setPreviewImg(""); setShowForm(false); load(); }
    else setMsg(`❌ ${res.error||"Failed"}`);
  };

  const decide = async (id:number, status:string) => {
    const res = await fetch("/api/erp/expenses",{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id,status,admin_note:note,approved_by:user.id,approver_role:user.role}),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.error || res.message) {
      alert(res.message || res.error);
      return;
    }
    setNoteModal(null); setNote(""); load();
  };

  const statusColor: any = {pending:"badge-orange",approved:"badge-green",rejected:"badge-red"};
  const cats = ["Travel","Food","Equipment","Software","Office","Marketing","Other"];
  const pending = expenses.filter(e=>e.status==="pending").length;
  const totalPending = expenses.filter(e=>e.status==="pending").reduce((s:number,e:any)=>s+Number(e.amount),0);

  return (
    <div>
      {/* Notifications for employee */}
      {notifications.length>0 && (
        <div style={{marginBottom:16}}>
          {notifications.slice(0,3).map((n:any)=>(
            <div key={n.id} style={{marginBottom:8,padding:"10px 16px",background:n.status==="approved"?"rgba(0,200,100,0.08)":"rgba(255,68,68,0.08)",border:`1px solid ${n.status==="approved"?"rgba(0,200,100,0.25)":"rgba(255,68,68,0.2)"}`,borderRadius:10,fontSize:13,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:18}}>{n.status==="approved"?"✅":"❌"}</span>
              <div><strong>{fmt(Number(n.amount))} ({n.category})</strong> expense {n.status}{n.admin_note?` — "${n.admin_note}"`:""}.</div>
            </div>
          ))}
        </div>
      )}

      <div style={{marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {pending>0&&<span className="badge badge-orange">{pending} Pending</span>}
          {(user.role==="admin"||user.role==="manager")&&pending>0&&<span style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>Total: {fmt(totalPending)}</span>}
        </div>
        {user.role!=="admin"&&<button className="erp-btn erp-btn-primary" onClick={()=>setShowForm(!showForm)}>+ Submit Expense</button>}
      </div>

      {msg&&<div style={{marginBottom:16,padding:"10px 16px",background:msg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",border:`1px solid ${msg.startsWith("✅")?"rgba(0,200,100,0.3)":"rgba(255,68,68,0.25)"}`,borderRadius:10,fontSize:13,color:msg.startsWith("✅")?"#00c864":"#ff6666"}}>{msg}</div>}

      {showForm&&(
        <div className="erp-card" style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>New Expense Claim</div>
          <div className="erp-grid-2">
            <div className="erp-field"><label>Amount ({currency==="PKR"?"PKR":"Rs. "}) *</label><input type="number" step="0.01" className="erp-input" placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} /></div>
            <div className="erp-field"><label>Category</label><select className="erp-select" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{cats.map(c=><option key={c}>{c}</option>)}</select></div>
          </div>
          <div className="erp-field"><label>Description</label><textarea className="erp-textarea" rows={2} placeholder="What was this expense for?" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} /></div>
          <div className="erp-field">
            <label>Receipt</label>
            <div style={{display:"flex",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
              {previewImg&&<img src={previewImg} alt="receipt" style={{width:80,height:80,objectFit:"cover",borderRadius:8,border:"1px solid rgba(139,0,255,0.3)"}} />}
              <div>
                <label style={{cursor:"pointer",background:"rgba(139,0,255,0.15)",border:"1px solid rgba(139,0,255,0.3)",padding:"8px 16px",borderRadius:8,fontSize:13,color:"var(--pg)",display:"inline-block"}}>
                  {uploading?"Uploading...":form.receipt_path?"✅ Change Receipt":"📎 Upload Receipt"}
                  <input type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&uploadReceipt(e.target.files[0])} disabled={uploading} />
                </label>
                {form.receipt_path&&<div style={{fontSize:11,color:"#00c864",marginTop:4}}>✅ Receipt uploaded</div>}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button className="erp-btn erp-btn-primary" onClick={submit}>Submit Claim</button>
            <button className="erp-btn erp-btn-outline" onClick={()=>{setShowForm(false);setPreviewImg("");}}>Cancel</button>
          </div>
        </div>
      )}

      <div className="erp-card">
        <div className="erp-section-header"><div className="erp-section-title">Expense Claims</div></div>
        <div className="erp-table-wrap">
          <table>
            <thead><tr><th>Date</th>{(user.role==="admin"||user.role==="manager")&&<th>Employee</th>}<th>Amount</th><th>Category</th><th>Description</th><th>Receipt</th><th>Status</th><th>Note</th>{(user.role==="admin"||user.role==="manager")&&<th>Actions</th>}</tr></thead>
            <tbody>
              {expenses.length===0&&<tr><td colSpan={9} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No expenses found</td></tr>}
              {expenses.map((e:any)=>(
                <tr key={e.id}>
                  <td style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>{new Date(e.created_at).toLocaleDateString("en-GB")}</td>
                  {(user.role==="admin"||user.role==="manager")&&<td style={{fontWeight:600}}>{e.employee_name}</td>}
                  <td style={{fontWeight:700,color:"var(--pg)"}}>{fmt(Number(e.amount))}</td>
                  <td><span className="badge badge-purple">{e.category}</span></td>
                  <td style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.description||"—"}</td>
                  <td>{e.receipt_path ? <a href={e.receipt_path} target="_blank" rel="noreferrer" style={{color:"var(--pg)",fontSize:12}}>📎 View</a> : <span style={{color:"rgba(255,255,255,0.2)",fontSize:12}}>—</span>}</td>
                  <td><span className={`badge ${statusColor[e.status]}`}>{e.status}</span></td>
                  <td style={{fontSize:11,color:"rgba(255,255,255,0.4)",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.admin_note||"—"}</td>
                  {(user.role==="admin"||user.role==="manager")&&<td>
                    {(() => {
                      // Fix 1 — strict 3-tier authorization
                      // Admin: can approve/reject anything (including own)
                      // Manager: can approve/reject ONLY if expense is NOT their own
                      // Employee: never shown (handled by outer condition)
                      const canAct = user.role === "admin"
                        ? true
                        : user.role === "manager" && Number(e.employee_id) !== Number(user.id);

                      return (
                        <>
                          {e.status==="pending" && canAct && (
                            <div style={{display:"flex",gap:6}}>
                              <button className="erp-btn erp-btn-green erp-btn-sm" onClick={()=>{setNoteModal({id:e.id,action:"approved"});setNote("");}}>Approve</button>
                              <button className="erp-btn erp-btn-red erp-btn-sm" onClick={()=>{setNoteModal({id:e.id,action:"rejected",requireNote:false});setNote("");}}>Reject</button>
                            </div>
                          )}
                          {e.status==="pending" && !canAct && (
                            <span style={{fontSize:11,color:"#AAAAAA",fontStyle:"italic"}}>Self-claim</span>
                          )}
                          {user.role==="admin" && e.status==="approved" && (
                            <button className="erp-btn erp-btn-red erp-btn-sm" onClick={()=>{setNoteModal({id:e.id,action:"rejected",requireNote:true,label:"Admin Override Reject"});setNote("");}}>
                              🔄 Override Reject
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {noteModal&&(
        <div className="erp-modal-overlay">
          <div className="erp-modal" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
            <div className="erp-modal-title">{noteModal.label||(noteModal.action==="approved"?"✅ Approve Expense":"❌ Reject Expense")}</div>
            {noteModal.requireNote&&<div style={{marginBottom:12,padding:"8px 12px",background:"rgba(255,68,68,0.08)",border:"1px solid rgba(255,68,68,0.25)",borderRadius:8,fontSize:12,color:"#ff8888"}}>⚠️ Admin override: reason is mandatory</div>}
            <div className="erp-field">
              <label>Reason / Note {noteModal.requireNote?"*":"(optional)"}</label>
              <textarea className="erp-textarea" placeholder={noteModal.requireNote?"Reason for rejecting approved expense (mandatory)...":"Add a note..."} value={note} onChange={e=>setNote(e.target.value)} />
            </div>
            <div className="erp-modal-actions">
              <button className="erp-btn erp-btn-outline" onClick={()=>setNoteModal(null)}>Cancel</button>
              <button
                className={`erp-btn ${noteModal.action==="approved"?"erp-btn-green":"erp-btn-red"}`}
                disabled={noteModal.requireNote&&!note.trim()}
                onClick={()=>{ if(noteModal.requireNote&&!note.trim()) return; decide(noteModal.id,noteModal.action); }}
              >
                {noteModal.action==="approved"?"✅ Approve & Credit Ledger":"❌ Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
