"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPLeaves() {
  return <ERPLayout title="Leave Requests" active="leaves">{(user) => <LeavesContent user={user} />}</ERPLayout>;
}

function LeavesContent({ user }: { user: any }) {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leave_type:"annual", from_date:"", to_date:"", reason:"" });
  const [msg, setMsg] = useState("");

  const load = () => {
    const url = (user.role==="admin"||user.role==="manager") ? "/api/erp/leaves" : `/api/erp/leaves?employee_id=${user.id}`;
    fetch(url).then(r=>r.json()).then(d=>setLeaves(Array.isArray(d)?d:[])).catch(()=>{});
    const year = new Date().getFullYear();
    fetch(`/api/erp/leaves?balance=1&employee_id=${user.id}&year=${year}`).then(r=>r.json()).then(d=>setBalance(d)).catch(()=>{});
  };
  useEffect(()=>{ load(); },[]);

  const submit = async () => {
    if (!form.from_date||!form.to_date) { setMsg("❌ Dates are required"); return; }
    if (new Date(form.to_date) < new Date(form.from_date)) { setMsg("❌ End date must be after start date"); return; }
    const res = await fetch("/api/erp/leaves",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,employee_id:user.id})}).then(r=>r.json()).catch(()=>({}));
    if (res.success) { setMsg("✅ Leave request submitted"); setForm({leave_type:"annual",from_date:"",to_date:"",reason:""}); setShowForm(false); load(); }
    else setMsg(`❌ ${res.error}`);
  };

  const decide = async (id:number, status:string) => {
    await fetch("/api/erp/leaves",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});
    load();
  };

  const days = (from:string,to:string) => {
    const d = (new Date(to).getTime()-new Date(from).getTime())/(1000*60*60*24)+1;
    return isNaN(d)||d<0 ? "—" : `${d}d`;
  };

  const statusColor: any = {pending:"badge-orange",approved:"badge-green",rejected:"badge-red"};
  const typeColor: any = {sick:"badge-red",annual:"badge-green",emergency:"badge-orange",unpaid:"badge-purple"};

  return (
    <div>
      {/* Leave Balance Cards */}
      {balance && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14,marginBottom:20}}>
          {[
            {label:"Annual Leave",taken:balance.annual_taken,limit:14,color:"#00c864"},
            {label:"Sick Leave",taken:balance.sick_taken,limit:10,color:"#6699ff"},
            {label:"Emergency",taken:balance.emergency_taken,limit:3,color:"#ff8c00"},
          ].map(b=>(
            <div key={b.label} className="erp-stat" style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>{b.label}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:24,fontWeight:700,color:b.color}}>{b.limit-b.taken}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:4}}>of {b.limit} remaining</div>
              <div style={{marginTop:8,height:4,background:"rgba(255,255,255,0.08)",borderRadius:4}}>
                <div style={{height:"100%",width:`${Math.min(100,(b.taken/b.limit)*100)}%`,background:b.color,borderRadius:4,transition:"width 0.5s"}} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>{leaves.filter(l=>l.status==="pending").length>0&&<span className="badge badge-orange">{leaves.filter(l=>l.status==="pending").length} Pending</span>}</div>
        {user.role==="employee"&&<button className="erp-btn erp-btn-primary" onClick={()=>setShowForm(!showForm)}>+ Request Leave</button>}
      </div>

      {msg&&<div style={{marginBottom:16,padding:"10px 16px",background:msg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",border:`1px solid ${msg.startsWith("✅")?"rgba(0,200,100,0.3)":"rgba(255,68,68,0.25)"}`,borderRadius:10,fontSize:13,color:msg.startsWith("✅")?"#00c864":"#ff6666"}}>{msg}</div>}

      {showForm&&(
        <div className="erp-card" style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>New Leave Request</div>
          <div className="erp-grid-2">
            <div className="erp-field"><label>Leave Type</label><select className="erp-select" value={form.leave_type} onChange={e=>setForm(f=>({...f,leave_type:e.target.value}))}><option value="annual">Annual Leave</option><option value="sick">Sick Leave</option><option value="emergency">Emergency</option><option value="unpaid">Unpaid</option></select></div>
            <div style={{display:"flex",gap:10}}>
              <div className="erp-field" style={{flex:1}}><label>From</label><input type="date" className="erp-input" value={form.from_date} onChange={e=>setForm(f=>({...f,from_date:e.target.value}))} /></div>
              <div className="erp-field" style={{flex:1}}><label>To</label><input type="date" className="erp-input" value={form.to_date} onChange={e=>setForm(f=>({...f,to_date:e.target.value}))} /></div>
            </div>
          </div>
          <div className="erp-field"><label>Reason</label><textarea className="erp-textarea" rows={2} placeholder="Brief reason for leave..." value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} /></div>
          <div style={{display:"flex",gap:10}}>
            <button className="erp-btn erp-btn-primary" onClick={submit}>Submit Request</button>
            <button className="erp-btn erp-btn-outline" onClick={()=>setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="erp-card">
        <div className="erp-section-header"><div className="erp-section-title">Leave History</div></div>
        <div className="erp-table-wrap">
          <table>
            <thead><tr><th>Date Filed</th>{(user.role==="admin"||user.role==="manager")&&<th>Employee</th>}<th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th>{(user.role==="admin"||user.role==="manager")&&<th>Actions</th>}</tr></thead>
            <tbody>
              {leaves.length===0&&<tr><td colSpan={9} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No leave requests found</td></tr>}
              {leaves.map((l:any)=>(
                <tr key={l.id}>
                  <td style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>{new Date(l.created_at).toLocaleDateString("en-GB")}</td>
                  {(user.role==="admin"||user.role==="manager")&&<td style={{fontWeight:600}}>{l.employee_name}</td>}
                  <td><span className={`badge ${typeColor[l.leave_type]||"badge-purple"}`}>{l.leave_type}</span></td>
                  <td style={{fontSize:13}}>{l.from_date}</td>
                  <td style={{fontSize:13}}>{l.to_date}</td>
                  <td style={{fontWeight:600,color:"var(--pg)"}}>{days(l.from_date,l.to_date)}</td>
                  <td style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12,color:"rgba(255,255,255,0.5)"}}>{l.reason||"—"}</td>
                  <td><span className={`badge ${statusColor[l.status]}`}>{l.status}</span></td>
                  {(user.role==="admin"||user.role==="manager")&&<td>{l.status==="pending"&&<div style={{display:"flex",gap:6}}><button className="erp-btn erp-btn-green erp-btn-sm" onClick={()=>decide(l.id,"approved")}>Approve</button><button className="erp-btn erp-btn-red erp-btn-sm" onClick={()=>decide(l.id,"rejected")}>Reject</button></div>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
