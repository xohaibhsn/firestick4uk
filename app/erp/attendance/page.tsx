"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPAttendance() {
  return <ERPLayout title="Attendance" active="attendance">{(user, currency) => <AttContent user={user} currency={currency} />}</ERPLayout>;
}

const STATUS_OPTIONS = [
  { value:"present",      label:"✅ Present" },
  { value:"half_day",     label:"🕐 Half Day" },
  { value:"absent",       label:"❌ Absent" },
  { value:"weekly_off",   label:"🏖️ Weekly Off" },
  { value:"sick_leave",   label:"🤒 Sick Leave" },
  { value:"annual_leave", label:"🌴 Annual Leave" },
  { value:"emergency_leave", label:"🚨 Emergency Leave" },
  { value:"public_holiday",  label:"📅 Public Holiday" },
  { value:"late",         label:"⏰ Late" },
];

const STATUS_COLOR: Record<string,string> = {
  present:"badge-green", late:"badge-orange", absent:"badge-red",
  half_day:"badge-blue", sick_leave:"badge-red", annual_leave:"badge-green",
  emergency_leave:"badge-orange", weekly_off:"badge-purple", public_holiday:"badge-blue",
};

function AttContent({ user, currency: _c }: { user: any; currency: string }) {
  const isAdmin = user.role === "admin" || user.role === "manager";
  const today = new Date().toISOString().slice(0,10);

  // Personal clock
  const [todayStatus, setTodayStatus] = useState<any>(null);
  const [clockMsg, setClockMsg] = useState("");

  // View tabs (admin/manager)
  const [view, setView] = useState<"personal"|"manual"|"bulk"|"history">("personal");

  // History
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [filterEmp, setFilterEmp] = useState(user.role==="employee" ? String(user.id) : "");
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0,7));

  // Manual marking
  const [manualForm, setManualForm] = useState({ employee_id:"", date:today, status:"present", time_in:"", time_out:"", admin_note:"" });
  const [empBalance, setEmpBalance] = useState<any>(null);
  const [manualMsg, setManualMsg] = useState("");

  // Edit modal
  const [editModal, setEditModal] = useState<any>(null);
  const [editForm, setEditForm] = useState({ status:"", time_in:"", time_out:"", admin_note:"" });
  const [editMsg, setEditMsg] = useState("");

  // Bulk
  const [bulkDate, setBulkDate] = useState(today);
  const [bulkRecords, setBulkRecords] = useState<any[]>([]);
  const [bulkMsg, setBulkMsg] = useState("");

  const loadHistory = () => {
    let url = `/api/erp/attendance?month=${filterMonth}`;
    const eid = user.role==="employee" ? user.id : filterEmp;
    if (eid) url += `&employee_id=${eid}`;
    fetch(url).then(r=>r.json()).then(d=>setRecords(Array.isArray(d)?d:[])).catch(()=>{});
    const empId = user.role==="employee" ? user.id : (filterEmp||user.id);
    fetch(`/api/erp/attendance?summary=1&employee_id=${empId}&month=${filterMonth}`).then(r=>r.json()).then(d=>setSummary(d)).catch(()=>{});
  };

  const loadToday = () => {
    fetch(`/api/erp/attendance?employee_id=${user.id}&date=${today}`).then(r=>r.json()).then(d=>{ if(d[0]) setTodayStatus(d[0]); else setTodayStatus(null); }).catch(()=>{});
  };

  useEffect(() => {
    loadToday();
    loadHistory();
    if (isAdmin) {
      // Admin: all employees. Manager: only reporting employees
      const empUrl = user.role==="manager"
        ? `/api/erp/employees?reports_to=${user.id}`
        : "/api/erp/employees";
      fetch(empUrl).then(r=>r.json()).then(d=>{
        // Manager cannot manage other admins or managers
        const allowed = user.role==="admin"
          ? d.filter((e:any)=>e.active)
          : d.filter((e:any)=>e.active && e.role==="employee");
        setEmployees(allowed);
        setBulkRecords(allowed.map((e:any)=>({employee_id:e.id,name:e.name,status:"present",admin_note:""})));
      }).catch(()=>{});
    }
  }, []);

  // Load leave balance when manual form employee changes
  useEffect(() => {
    if (!manualForm.employee_id) { setEmpBalance(null); return; }
    const year = new Date().getFullYear();
    fetch(`/api/erp/leaves?balance=1&employee_id=${manualForm.employee_id}&year=${year}`).then(r=>r.json()).then(d=>setEmpBalance(d)).catch(()=>{});
  }, [manualForm.employee_id]);

  const clock = async (action:string) => {
    const res = await fetch("/api/erp/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,employee_id:user.id})}).then(r=>r.json()).catch(()=>({}));
    setClockMsg(res.success?`✅ ${res.message}${action==="out"&&res.hours?` — ${res.hours}h`:""}`:`❌ ${res.error}`);
    loadToday(); loadHistory();
  };

  const submitManual = async () => {
    if (!manualForm.employee_id||!manualForm.date) { setManualMsg("❌ Employee and date required"); return; }
    const res = await fetch("/api/erp/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"manual_mark",...manualForm,marked_by:user.id})}).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setManualMsg(`✅ Attendance marked${res.warning?` — ⚠️ ${res.warning}`:""}`);
      loadHistory();
    } else setManualMsg(`❌ ${res.error||"Failed"}`);
  };

  const submitEdit = async () => {
    if (!editModal) return;
    const res = await fetch("/api/erp/attendance",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:editModal.id,...editForm,marked_by:user.id})}).then(r=>r.json()).catch(()=>({}));
    if (res.success) { setEditModal(null); setEditMsg(""); loadHistory(); }
    else setEditMsg(`❌ ${res.error||"Failed"}`);
  };

  const submitBulk = async () => {
    const res = await fetch("/api/erp/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"bulk_mark",date:bulkDate,records:bulkRecords,marked_by:user.id})}).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      const warn = res.warnings?.length ? ` ⚠️ ${res.warnings.length} quota warnings` : "";
      setBulkMsg(`✅ Bulk attendance saved for ${bulkRecords.length} employees${warn}`);
      loadHistory();
    } else setBulkMsg(`❌ ${res.error||"Failed"}`);
  };

  const exportCSV = () => {
    const eid = user.role==="employee" ? user.id : (filterEmp||"");
    let url = `/api/erp/attendance?format=csv&month=${filterMonth}`;
    if (eid) url += `&employee_id=${eid}`;
    window.location.href = url;
  };

  const openEdit = (r:any) => {
    setEditForm({ status:r.status, time_in:r.time_in?new Date(r.time_in).toTimeString().slice(0,5):"", time_out:r.time_out?new Date(r.time_out).toTimeString().slice(0,5):"", admin_note:r.admin_note||"" });
    setEditModal(r); setEditMsg("");
  };

  return (
    <div>
      {/* ── Personal Clock ─────────────────────────────────────────────── */}
      <div className="erp-card" style={{marginBottom:20,display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,marginBottom:4}}>Today — {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
          {todayStatus
            ? <div style={{fontSize:13,color:"#555555"}}>
                In: {todayStatus.time_in?new Date(todayStatus.time_in).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):"—"}
                &nbsp;|&nbsp;Out: {todayStatus.time_out?new Date(todayStatus.time_out).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):"—"}
                &nbsp;|&nbsp;<span className={`badge ${STATUS_COLOR[todayStatus.status]||"badge-purple"}`}>{todayStatus.status}</span>
              </div>
            : <div style={{fontSize:13,color:"#777777"}}>Not clocked in yet</div>
          }
          {clockMsg&&<div style={{marginTop:8,fontSize:13,color:clockMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{clockMsg}</div>}
        </div>
        <div style={{display:"flex",gap:10}}>
          {(!todayStatus||!todayStatus.time_in)&&<button className="erp-clock-btn erp-clock-in" onClick={()=>clock("in")}>⏱ Clock In</button>}
          {todayStatus&&todayStatus.time_in&&!todayStatus.time_out&&<button className="erp-clock-btn erp-clock-out" onClick={()=>clock("out")}>⏹ Clock Out</button>}
          {todayStatus&&todayStatus.time_out&&<div style={{padding:"14px 24px",background:"rgba(0,200,100,0.1)",border:"1px solid rgba(0,200,100,0.25)",borderRadius:50,color:"#00c864",fontSize:14,fontWeight:600}}>✅ Day Complete</div>}
        </div>
      </div>

      {/* ── Admin/Manager Tabs ─────────────────────────────────────────── */}
      {isAdmin && (
        <>
          <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
            {([["personal","👤 My Attendance"],["manual","✏️ Manual Mark"],["bulk","📋 Bulk Mark"],["history","📅 History"]] as const).map(([k,l])=>(
              <button key={k} className={`erp-btn ${view===k?"erp-btn-primary":"erp-btn-outline"}`} onClick={()=>setView(k)}>{l}</button>
            ))}
          </div>

          {/* ── MANUAL MARK ─────────────────────────────────────── */}
          {view==="manual" && (
            <div className="erp-card" style={{marginBottom:20}}>
              <div className="erp-section-title" style={{marginBottom:16}}>Manual Attendance Marking</div>
              {manualMsg&&<div style={{marginBottom:12,padding:"10px 14px",background:manualMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",borderRadius:10,fontSize:13,color:manualMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{manualMsg}</div>}

              <div className="erp-grid-3">
                <div className="erp-field">
                  <label>Employee *</label>
                  <select className="erp-select" value={manualForm.employee_id} onChange={e=>setManualForm(f=>({...f,employee_id:e.target.value}))}>
                    <option value="">— Select Employee —</option>
                    {employees.map(e=><option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
                  </select>
                </div>
                <div className="erp-field">
                  <label>Date *</label>
                  <input type="date" className="erp-input" value={manualForm.date} onChange={e=>setManualForm(f=>({...f,date:e.target.value}))} />
                </div>
                <div className="erp-field">
                  <label>Status *</label>
                  <select className="erp-select" value={manualForm.status} onChange={e=>setManualForm(f=>({...f,status:e.target.value}))}>
                    {STATUS_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Leave balance warning */}
              {empBalance && manualForm.employee_id && (
                <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
                  {[
                    {label:"Annual",taken:empBalance.annual_taken,limit:14},
                    {label:"Sick",taken:empBalance.sick_taken,limit:10},
                    {label:"Emergency",taken:empBalance.emergency_taken,limit:3},
                  ].map(b=>{
                    const remaining = b.limit - b.taken;
                    const isWarn = remaining <= 0;
                    return (
                      <div key={b.label} style={{padding:"6px 12px",background:isWarn?"rgba(255,68,68,0.1)":"rgba(139,0,255,0.08)",border:`1px solid ${isWarn?"rgba(255,68,68,0.3)":"rgba(139,0,255,0.2)"}`,borderRadius:8,fontSize:12}}>
                        <span style={{color:"#555555"}}>{b.label}: </span>
                        <strong style={{color:isWarn?"#ff6666":"#00c864"}}>{remaining}</strong>
                        <span style={{color:"#888888"}}> / {b.limit}</span>
                        {isWarn&&<span style={{color:"#ff6666",marginLeft:4}}>⚠️ Exceeded</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="erp-grid-2">
                <div className="erp-field">
                  <label>Time In (optional)</label>
                  <input type="time" className="erp-input" value={manualForm.time_in} onChange={e=>setManualForm(f=>({...f,time_in:e.target.value}))} />
                </div>
                <div className="erp-field">
                  <label>Time Out (optional)</label>
                  <input type="time" className="erp-input" value={manualForm.time_out} onChange={e=>setManualForm(f=>({...f,time_out:e.target.value}))} />
                </div>
              </div>
              <div className="erp-field">
                <label>Notes / Reason</label>
                <input className="erp-input" placeholder="Reason for manual marking..." value={manualForm.admin_note} onChange={e=>setManualForm(f=>({...f,admin_note:e.target.value}))} />
              </div>
              <button className="erp-btn erp-btn-primary" onClick={submitManual}>Mark Attendance</button>
            </div>
          )}

          {/* ── BULK MARK ───────────────────────────────────────── */}
          {view==="bulk" && (
            <div className="erp-card" style={{marginBottom:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
                <div className="erp-section-title">Bulk Attendance Marking</div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <input type="date" className="erp-input" style={{width:"auto",padding:"7px 12px"}} value={bulkDate} onChange={e=>setBulkDate(e.target.value)} />
                </div>
              </div>
              {bulkMsg&&<div style={{marginBottom:12,padding:"10px 14px",background:bulkMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",borderRadius:10,fontSize:13,color:bulkMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{bulkMsg}</div>}
              <div className="erp-table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Employee</th><th>Status</th><th>Notes</th></tr></thead>
                  <tbody>
                    {bulkRecords.map((rec,i)=>(
                      <tr key={rec.employee_id}>
                        <td style={{color:"#888888",fontSize:12}}>{i+1}</td>
                        <td style={{fontWeight:600}}>{rec.name}</td>
                        <td>
                          <select className="erp-select" style={{padding:"5px 8px",fontSize:12}} value={rec.status} onChange={e=>setBulkRecords(r=>r.map((x,j)=>j===i?{...x,status:e.target.value}:x))}>
                            {STATUS_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </td>
                        <td>
                          <input className="erp-input" style={{padding:"5px 8px",fontSize:12}} placeholder="Optional note" value={rec.admin_note} onChange={e=>setBulkRecords(r=>r.map((x,j)=>j===i?{...x,admin_note:e.target.value}:x))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{marginTop:14,display:"flex",gap:10,flexWrap:"wrap"}}>
                <button className="erp-btn erp-btn-primary" onClick={submitBulk}>💾 Save Bulk Attendance</button>
                <button className="erp-btn erp-btn-outline" onClick={()=>setBulkRecords(r=>r.map(x=>({...x,status:"present"})))}>Set All Present</button>
                <button className="erp-btn erp-btn-outline" onClick={()=>setBulkRecords(r=>r.map(x=>({...x,status:"weekly_off"})))}>Set All Off</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Monthly Summary ────────────────────────────────────────────── */}
      {(view==="personal"||view==="history"||!isAdmin) && summary && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:12,marginBottom:20}}>
          {[
            {label:"Present",val:summary.present||0,color:"#00c864"},
            {label:"Late",val:summary.late||0,color:"#ff8c00"},
            {label:"Absent",val:summary.absent||0,color:"#ff4444"},
            {label:"Half Day",val:summary.half_day||0,color:"#6699ff"},
            {label:"Sick Leave",val:summary.sick_leave||0,color:"#ff6699"},
            {label:"Annual Leave",val:summary.annual_leave||0,color:"#66ff99"},
            {label:"Weekly Off",val:summary.weekly_off||0,color:"#9988ff"},
            {label:"Hours",val:`${summary.total_hours||0}h`,color:"#bf5fff"},
          ].map(s=>(
            <div key={s.label} className="erp-stat" style={{padding:"12px 10px",textAlign:"center"}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:700,color:s.color}}>{s.val}</div>
              <div style={{fontSize:10,color:"#666666",letterSpacing:"0.5px",textTransform:"uppercase",marginTop:3}}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── History Table ──────────────────────────────────────────────── */}
      {(view==="personal"||view==="history"||!isAdmin) && (
        <div className="erp-card">
          <div className="erp-section-header">
            <div className="erp-section-title">Attendance History</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {isAdmin&&(
                <select className="erp-select" style={{width:"auto",padding:"6px 10px"}} value={filterEmp} onChange={e=>setFilterEmp(e.target.value)}>
                  <option value="">All Employees</option>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              )}
              <input type="month" className="erp-input" style={{width:"auto",padding:"6px 10px"}} value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} />
              <button className="erp-btn erp-btn-primary erp-btn-sm" onClick={loadHistory}>Filter</button>
              <button className="erp-btn erp-btn-outline erp-btn-sm" onClick={exportCSV}>⬇ CSV</button>
            </div>
          </div>
          <div className="erp-table-wrap">
            <table>
              <thead><tr><th>Date</th>{isAdmin&&<th>Employee</th>}<th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Status</th><th>Notes</th>{isAdmin&&<th>Marked By</th>}<th>Actions</th></tr></thead>
              <tbody>
                {records.length===0&&<tr><td colSpan={9} style={{textAlign:"center",color:"#999999",padding:24}}>No records found</td></tr>}
                {records.map((r:any)=>(
                  <tr key={r.id}>
                    <td style={{fontWeight:500}}>{r.date}</td>
                    {isAdmin&&<td style={{fontWeight:600}}>{r.employee_name}</td>}
                    <td>{r.time_in?new Date(r.time_in).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):"—"}</td>
                    <td>{r.time_out?new Date(r.time_out).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):r.time_in&&!r.time_out?<span style={{color:"rgba(255,200,0,0.7)",fontSize:11}}>Still in</span>:"—"}</td>
                    <td style={{fontWeight:600}}>{r.working_hours?`${r.working_hours}h`:"—"}</td>
                    <td>
                      <span className={`badge ${STATUS_COLOR[r.status]||"badge-purple"}`}>{r.status}</span>
                      {r.is_manual&&<span style={{marginLeft:4,fontSize:9,color:"rgba(255,180,0,0.7)",background:"rgba(255,180,0,0.1)",padding:"1px 6px",borderRadius:8}}>ADMIN</span>}
                      {/* Fix 5 — auto clock-out badge */}
                      {r.admin_note?.includes('Auto clock-out')&&<span style={{marginLeft:4,background:"#FEF3C7",color:"#92400E",padding:"2px 7px",borderRadius:12,fontSize:10,fontWeight:700}}>⏰ Auto</span>}
                      {/* Night shift badge */}
                      {r.shift_type==="night"&&<span style={{marginLeft:4,background:"#EDE9FE",color:"#5B21B6",padding:"2px 7px",borderRadius:12,fontSize:10,fontWeight:700}}>🌙 Night</span>}
                    </td>
                    <td style={{fontSize:11,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#666666"}}>{r.admin_note||"—"}</td>
                    {isAdmin&&<td style={{fontSize:11,color:"#777777"}}>{r.marked_by_name||<span style={{color:"#AAAAAA"}}>Self</span>}</td>}
                    <td>{isAdmin&&(user.role==="admin"||(user.role==="manager"&&employees.some(e=>e.employee_id===r.employee_id||e.id===r.employee_id)))&&<button className="erp-btn erp-btn-outline erp-btn-sm" onClick={()=>openEdit(r)}>Edit</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────── */}
      {editModal&&(
        <div className="erp-modal-overlay">
          <div className="erp-modal" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
            <div className="erp-modal-title">Edit Attendance — {editModal.employee_name} / {editModal.date}</div>
            {editMsg&&<div style={{marginBottom:12,color:"#ff8888",fontSize:13}}>{editMsg}</div>}
            <div className="erp-field">
              <label>Status</label>
              <select className="erp-select" value={editForm.status} onChange={e=>setEditForm(f=>({...f,status:e.target.value}))}>
                {STATUS_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="erp-grid-2">
              <div className="erp-field"><label>Time In</label><input type="time" className="erp-input" value={editForm.time_in} onChange={e=>setEditForm(f=>({...f,time_in:e.target.value}))} /></div>
              <div className="erp-field"><label>Time Out</label><input type="time" className="erp-input" value={editForm.time_out} onChange={e=>setEditForm(f=>({...f,time_out:e.target.value}))} /></div>
            </div>
            <div className="erp-field"><label>Admin Note</label><input className="erp-input" placeholder="Reason for edit..." value={editForm.admin_note} onChange={e=>setEditForm(f=>({...f,admin_note:e.target.value}))} /></div>
            <div className="erp-modal-actions">
              <button className="erp-btn erp-btn-outline" onClick={()=>setEditModal(null)}>Cancel</button>
              <button className="erp-btn erp-btn-primary" onClick={submitEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
