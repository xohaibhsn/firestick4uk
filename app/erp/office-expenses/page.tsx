"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function OfficeExpenses() {
  return <ERPLayout title="Office Expenses" active="office-expenses">{(user, currency) => <OEContent user={user} currency={currency} />}</ERPLayout>;
}

const CATEGORIES = [
  { value:"Rent",        icon:"🏢" },
  { value:"Utilities",   icon:"💡" },
  { value:"Stationary",  icon:"🖨️" },
  { value:"Kitchen",     icon:"🍽️" },
  { value:"Transport",   icon:"🚗" },
  { value:"Maintenance", icon:"🔧" },
  { value:"Supplies",    icon:"📦" },
  { value:"Miscellaneous", icon:"💼" },
];
const catIcon = (c:string) => CATEGORIES.find(x=>x.value===c)?.icon||"💼";

function OEContent({ user, currency: _c }: { user: any; currency: string }) {
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
  const isAdmin = user.role === "admin";
  const today = new Date().toISOString().slice(0,10);
  const curMonth = new Date().toISOString().slice(0,7);

  const [expenses, setExpenses] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ categories:[], total:0 });
  const [filterMonth, setFilterMonth] = useState(curMonth);
  const [filterCat, setFilterCat] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editModal, setEditModal] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  const initForm = { date:today, category:"Rent", description:"", amount:"", paid_by:user.name, receipt_path:"", notes:"" };
  const [form, setForm] = useState(initForm);

  const load = () => {
    let url = `/api/erp/office-expenses?month=${filterMonth}`;
    if (filterCat) url += `&category=${encodeURIComponent(filterCat)}`;
    fetch(url).then(r=>r.json()).then(d=>setExpenses(Array.isArray(d)?d:[])).catch(()=>{});
    fetch(`/api/erp/office-expenses?summary=1&month=${filterMonth}`).then(r=>r.json()).then(d=>setSummary(d||{categories:[],total:0})).catch(()=>{});
  };
  useEffect(()=>{ load(); },[]);

  const uploadReceipt = async (file:File) => {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result as string); r.onerror=rej; r.readAsDataURL(file); });
      const data = await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file:base64,name:file.name})}).then(r=>r.json());
      if (data.path) {
        if (editModal) setEditModal((m:any)=>({...m,receipt_path:data.path}));
        else setForm(f=>({...f,receipt_path:data.path}));
      }
    } catch {}
    setUploading(false);
  };

  const submit = async () => {
    if (!form.amount) { setMsg("❌ Amount required"); return; }
    const res = await fetch("/api/erp/office-expenses",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,added_by:user.name})}).then(r=>r.json()).catch(()=>({}));
    if (res.success) { setMsg("✅ Expense added"); setForm(initForm); setShowForm(false); load(); }
    else setMsg(`❌ ${res.error||"Failed"}`);
  };

  const saveEdit = async () => {
    const res = await fetch("/api/erp/office-expenses",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(editModal)}).then(r=>r.json()).catch(()=>({}));
    if (res.success) { setEditModal(null); load(); }
  };

  const del = async (id:number) => {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/erp/office-expenses?id=${id}`,{method:"DELETE"});
    load();
  };

  const totalFiltered = expenses.reduce((s,e)=>s+Number(e.amount||0),0);

  return (
    <div>
      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:20}}>
        <div className="erp-stat" style={{gridColumn:"span 1"}}>
          <div className="erp-stat-icon">💰</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:700,color:"#ff8c00"}}>{fmt(summary.total)}</div>
          <div className="erp-stat-label">This Month Total</div>
        </div>
        {(summary.categories||[]).slice(0,4).map((c:any)=>(
          <div key={c.category} className="erp-stat" style={{padding:"14px 12px"}}>
            <div style={{fontSize:22,marginBottom:6}}>{catIcon(c.category)}</div>
            <div style={{fontWeight:700,color:"#5B21B6",fontSize:15}}>{fmt(Number(c.total))}</div>
            <div className="erp-stat-label">{c.category}</div>
            <div style={{fontSize:10,color:"#888888",marginTop:2}}>{c.count} entries</div>
          </div>
        ))}
      </div>

      {/* Filter + Add */}
      <div style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input type="month" className="erp-input" style={{width:"auto",padding:"7px 12px"}} value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} />
          <select className="erp-select" style={{width:"auto",padding:"7px 12px"}} value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.icon} {c.value}</option>)}
          </select>
          <button className="erp-btn erp-btn-primary erp-btn-sm" onClick={load}>Filter</button>
        </div>
        {isAdmin && <button className="erp-btn erp-btn-primary" onClick={()=>{ setShowForm(!showForm); setMsg(""); }}>+ Add Expense</button>}
      </div>

      {/* Add Form */}
      {showForm && isAdmin && (
        <div className="erp-card" style={{marginBottom:20}}>
          <div className="erp-section-title" style={{marginBottom:16}}>Add Office Expense</div>
          {msg&&<div style={{marginBottom:12,padding:"8px 12px",background:msg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",borderRadius:8,fontSize:13,color:msg.startsWith("✅")?"#00c864":"#ff6666"}}>{msg}</div>}
          <div className="erp-grid-3">
            <div className="erp-field"><label>Date *</label><input type="date" className="erp-input" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} /></div>
            <div className="erp-field">
              <label>Category</label>
              <select className="erp-select" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                {CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.icon} {c.value}</option>)}
              </select>
            </div>
            <div className="erp-field"><label>Amount (Rs.) *</label><input type="number" className="erp-input" placeholder="0" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} /></div>
          </div>
          <div className="erp-grid-2">
            <div className="erp-field"><label>Description</label><input className="erp-input" placeholder="What was this expense for?" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} /></div>
            <div className="erp-field"><label>Paid By</label><input className="erp-input" placeholder="Who paid?" value={form.paid_by} onChange={e=>setForm(f=>({...f,paid_by:e.target.value}))} /></div>
          </div>
          <div className="erp-grid-2">
            <div className="erp-field">
              <label>Receipt</label>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {form.receipt_path && <span style={{fontSize:12,color:"#00c864"}}>✅ Uploaded</span>}
                <label style={{cursor:"pointer",background:"rgba(139,0,255,0.15)",border:"1px solid rgba(139,0,255,0.3)",padding:"7px 14px",borderRadius:8,fontSize:12,color:"#5B21B6"}}>
                  {uploading?"Uploading...":"📎 Upload Receipt"}
                  <input type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&uploadReceipt(e.target.files[0])} disabled={uploading} />
                </label>
              </div>
            </div>
            <div className="erp-field"><label>Notes</label><input className="erp-input" placeholder="Additional notes..." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <button className="erp-btn erp-btn-primary" onClick={submit}>Save Expense</button>
            <button className="erp-btn erp-btn-outline" onClick={()=>{ setShowForm(false); setMsg(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Expenses Table */}
      <div className="erp-card">
        <div className="erp-section-header">
          <div className="erp-section-title">Expenses — {filterMonth}{filterCat?` · ${catIcon(filterCat)} ${filterCat}`:""}</div>
          <div style={{fontWeight:700,color:"#ff8c00"}}>{fmt(totalFiltered)}</div>
        </div>
        <div className="erp-table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Paid By</th><th>Receipt</th><th>Notes</th><th>Added By</th>{isAdmin&&<th>Actions</th>}</tr></thead>
            <tbody>
              {expenses.length===0&&<tr><td colSpan={9} style={{textAlign:"center",color:"#999999",padding:24}}>No expenses found for this period</td></tr>}
              {expenses.map((e:any)=>(
                <tr key={e.id}>
                  <td style={{fontSize:12,color:"#555555",whiteSpace:"nowrap"}}>{e.date}</td>
                  <td><span style={{background:"#111111",border:"1px solid #E5E5E5",padding:"3px 9px",borderRadius:10,fontSize:12}}>{catIcon(e.category)} {e.category}</span></td>
                  <td style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:13}}>{e.description||"—"}</td>
                  <td style={{fontWeight:700,color:"#ff8c00"}}>{fmt(Number(e.amount))}</td>
                  <td style={{fontSize:12}}>{e.paid_by||"—"}</td>
                  <td>{e.receipt_path?<a href={e.receipt_path} target="_blank" rel="noreferrer" style={{color:"#5B21B6",fontSize:12}}>📎 View</a>:<span style={{color:"#AAAAAA",fontSize:12}}>—</span>}</td>
                  <td style={{fontSize:11,color:"#666666",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.notes||"—"}</td>
                  <td style={{fontSize:11,color:"#777777"}}>{e.added_by||"—"}</td>
                  {isAdmin&&<td style={{whiteSpace:"nowrap"}}>
                    <button className="erp-btn erp-btn-outline erp-btn-sm" style={{marginRight:4}} onClick={()=>setEditModal({...e})}>Edit</button>
                    <button className="erp-btn erp-btn-red erp-btn-sm" onClick={()=>del(e.id)}>Del</button>
                  </td>}
                </tr>
              ))}
              {expenses.length>0&&(
                <tr style={{borderTop:"2px solid rgba(139,0,255,0.2)"}}>
                  <td colSpan={3} style={{fontWeight:700,fontSize:12,color:"#555555",padding:"12px 14px",textTransform:"uppercase",letterSpacing:"1px"}}>Total</td>
                  <td style={{fontWeight:900,color:"#ff8c00",fontFamily:"'Cinzel',serif",fontSize:16,padding:"12px 14px"}}>{fmt(totalFiltered)}</td>
                  <td colSpan={isAdmin?5:4}/>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editModal&&(
        <div className="erp-modal-overlay">
          <div className="erp-modal" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
            <div className="erp-modal-title">Edit Office Expense</div>
            <div className="erp-grid-2">
              <div className="erp-field"><label>Date</label><input type="date" className="erp-input" value={editModal.date} onChange={e=>setEditModal((m:any)=>({...m,date:e.target.value}))} /></div>
              <div className="erp-field"><label>Category</label><select className="erp-select" value={editModal.category} onChange={e=>setEditModal((m:any)=>({...m,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.icon} {c.value}</option>)}</select></div>
            </div>
            <div className="erp-grid-2">
              <div className="erp-field"><label>Amount (Rs.)</label><input type="number" className="erp-input" value={editModal.amount} onChange={e=>setEditModal((m:any)=>({...m,amount:e.target.value}))} /></div>
              <div className="erp-field"><label>Paid By</label><input className="erp-input" value={editModal.paid_by||""} onChange={e=>setEditModal((m:any)=>({...m,paid_by:e.target.value}))} /></div>
            </div>
            <div className="erp-field"><label>Description</label><input className="erp-input" value={editModal.description||""} onChange={e=>setEditModal((m:any)=>({...m,description:e.target.value}))} /></div>
            <div className="erp-field">
              <label>Receipt</label>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                {editModal.receipt_path&&<a href={editModal.receipt_path} target="_blank" rel="noreferrer" style={{color:"#5B21B6",fontSize:12}}>📎 Current</a>}
                <label style={{cursor:"pointer",background:"rgba(139,0,255,0.15)",border:"1px solid rgba(139,0,255,0.3)",padding:"6px 12px",borderRadius:8,fontSize:12,color:"#5B21B6"}}>
                  {uploading?"Uploading...":"Change Receipt"}
                  <input type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&uploadReceipt(e.target.files[0])} disabled={uploading} />
                </label>
              </div>
            </div>
            <div className="erp-field"><label>Notes</label><input className="erp-input" value={editModal.notes||""} onChange={e=>setEditModal((m:any)=>({...m,notes:e.target.value}))} /></div>
            <div className="erp-modal-actions">
              <button className="erp-btn erp-btn-outline" onClick={()=>setEditModal(null)}>Cancel</button>
              <button className="erp-btn erp-btn-primary" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
