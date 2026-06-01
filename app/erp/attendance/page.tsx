"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPAttendance() {
  return <ERPLayout title="Attendance" active="attendance">{(user) => <AttContent user={user} />}</ERPLayout>;
}

function AttContent({ user }: { user: any }) {
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [filterEmp, setFilterEmp] = useState(user.role==="employee" ? String(user.id) : "");
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0,7));
  const [clockMsg, setClockMsg] = useState("");
  const [todayStatus, setTodayStatus] = useState<any>(null);

  const load = () => {
    let url = `/api/erp/attendance?month=${filterMonth}`;
    const eid = user.role==="employee" ? user.id : filterEmp;
    if (eid) url += `&employee_id=${eid}`;
    fetch(url).then(r=>r.json()).then(d=>setRecords(Array.isArray(d)?d:[])).catch(()=>{});
    // Monthly summary
    const empId = user.role==="employee" ? user.id : (filterEmp||user.id);
    fetch(`/api/erp/attendance?summary=1&employee_id=${empId}&month=${filterMonth}`).then(r=>r.json()).then(d=>setSummary(d)).catch(()=>{});
  };

  useEffect(() => {
    load();
    const today = new Date().toISOString().slice(0,10);
    fetch(`/api/erp/attendance?employee_id=${user.id}&date=${today}`).then(r=>r.json()).then(d=>{if(d[0])setTodayStatus(d[0]);}).catch(()=>{});
    if (user.role==="admin"||user.role==="manager") fetch("/api/erp/employees").then(r=>r.json()).then(d=>setEmployees(d.filter((e:any)=>e.active))).catch(()=>{});
  }, []);

  const clock = async (action: string) => {
    const res = await fetch("/api/erp/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({employee_id:user.id,action})}).then(r=>r.json()).catch(()=>({}));
    setClockMsg(res.success ? `✅ ${res.message}${action==="out"&&res.hours?` — ${res.hours}h worked`:""}` : `❌ ${res.error}`);
    load();
    const today = new Date().toISOString().slice(0,10);
    fetch(`/api/erp/attendance?employee_id=${user.id}&date=${today}`).then(r=>r.json()).then(d=>{if(d[0])setTodayStatus(d[0]);}).catch(()=>{});
  };

  const exportCSV = () => {
    const eid = user.role==="employee" ? user.id : (filterEmp||"");
    let url = `/api/erp/attendance?format=csv&month=${filterMonth}`;
    if (eid) url += `&employee_id=${eid}`;
    window.location.href = url;
  };

  const statusColor: any = {present:"badge-green",late:"badge-orange",absent:"badge-red",half_day:"badge-blue"};

  return (
    <div>
      {/* Clock card */}
      <div className="erp-card" style={{marginBottom:20,display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,marginBottom:4}}>Today — {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
          {todayStatus
            ? <div style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>
                In: {todayStatus.time_in ? new Date(todayStatus.time_in).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"}
                &nbsp;|&nbsp;Out: {todayStatus.time_out ? new Date(todayStatus.time_out).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"}
                &nbsp;|&nbsp;Hours: {todayStatus.working_hours||"—"}
                &nbsp;|&nbsp;<span className={`badge ${statusColor[todayStatus.status]||"badge-purple"}`}>{todayStatus.status}</span>
              </div>
            : <div style={{fontSize:13,color:"rgba(255,255,255,0.35)"}}>Not clocked in yet</div>
          }
          {clockMsg && <div style={{marginTop:8,fontSize:13,color:clockMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{clockMsg}</div>}
        </div>
        <div style={{display:"flex",gap:10}}>
          {(!todayStatus||!todayStatus.time_in) && <button className="erp-clock-btn erp-clock-in" onClick={()=>clock("in")}>⏱ Clock In</button>}
          {todayStatus&&todayStatus.time_in&&!todayStatus.time_out && <button className="erp-clock-btn erp-clock-out" onClick={()=>clock("out")}>⏹ Clock Out</button>}
          {todayStatus&&todayStatus.time_out && <div style={{padding:"14px 24px",background:"rgba(0,200,100,0.1)",border:"1px solid rgba(0,200,100,0.25)",borderRadius:50,color:"#00c864",fontSize:14,fontWeight:600}}>✅ Day Complete</div>}
        </div>
      </div>

      {/* Monthly Summary */}
      {summary && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:14,marginBottom:20}}>
          {[
            {label:"Present",val:summary.present||0,color:"#00c864"},
            {label:"Late",val:summary.late||0,color:"#ff8c00"},
            {label:"Absent",val:summary.absent||0,color:"#ff4444"},
            {label:"Half Day",val:summary.half_day||0,color:"#6699ff"},
            {label:"Total Hours",val:`${summary.total_hours||0}h`,color:"#bf5fff"},
          ].map(s=>(
            <div key={s.label} className="erp-stat" style={{textAlign:"center",padding:"16px 12px"}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:700,color:s.color}}>{s.val}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",letterSpacing:"1px",textTransform:"uppercase",marginTop:4}}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="erp-card">
        <div className="erp-section-header">
          <div className="erp-section-title">Attendance History</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {(user.role==="admin"||user.role==="manager") && (
              <select className="erp-select" style={{width:"auto",padding:"6px 12px"}} value={filterEmp} onChange={e=>setFilterEmp(e.target.value)}>
                <option value="">All Employees</option>
                {employees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            )}
            <input type="month" className="erp-input" style={{width:"auto",padding:"6px 12px"}} value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} />
            <button className="erp-btn erp-btn-primary erp-btn-sm" onClick={load}>Filter</button>
            <button className="erp-btn erp-btn-outline erp-btn-sm" onClick={exportCSV}>⬇ CSV</button>
          </div>
        </div>
        <div className="erp-table-wrap">
          <table>
            <thead><tr><th>Date</th>{(user.role==="admin"||user.role==="manager")&&<th>Employee</th>}<th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Status</th></tr></thead>
            <tbody>
              {records.length===0 && <tr><td colSpan={6} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No records found</td></tr>}
              {records.map((r:any)=>(
                <tr key={r.id}>
                  <td style={{fontWeight:500}}>{r.date}</td>
                  {(user.role==="admin"||user.role==="manager")&&<td style={{fontWeight:600}}>{r.employee_name}</td>}
                  <td>{r.time_in ? new Date(r.time_in).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"}</td>
                  <td>{r.time_out ? new Date(r.time_out).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : <span style={{color:"rgba(255,200,0,0.7)"}}>Still in</span>}</td>
                  <td style={{fontWeight:600}}>{r.working_hours ? `${r.working_hours}h` : "—"}</td>
                  <td><span className={`badge ${statusColor[r.status]||"badge-purple"}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
