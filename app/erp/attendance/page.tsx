"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPAttendance() {
  return <ERPLayout title="Attendance" active="attendance">{(user) => <AttContent user={user} />}</ERPLayout>;
}

function AttContent({ user }: { user: any }) {
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [filterEmp, setFilterEmp] = useState(user.role === "admin" ? "" : String(user.id));
  const [filterDate, setFilterDate] = useState("");
  const [clockMsg, setClockMsg] = useState("");
  const [todayStatus, setTodayStatus] = useState<any>(null);

  const load = () => {
    let url = `/api/erp/attendance?all=1`;
    if (filterEmp) url += `&employee_id=${filterEmp}`;
    if (filterDate) url += `&date=${filterDate}`;
    fetch(url).then(r=>r.json()).then(d=>setRecords(Array.isArray(d)?d:[])).catch(()=>{});
  };

  useEffect(() => {
    load();
    const today = new Date().toISOString().slice(0,10);
    fetch(`/api/erp/attendance?employee_id=${user.id}&date=${today}`).then(r=>r.json()).then(d=>{if(d[0])setTodayStatus(d[0]);}).catch(()=>{});
    if (user.role === "admin") fetch("/api/erp/employees").then(r=>r.json()).then(d=>setEmployees(d.filter((e:any)=>e.active))).catch(()=>{});
  }, []);

  const clock = async (action: string) => {
    const res = await fetch("/api/erp/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({employee_id:user.id,action})}).then(r=>r.json()).catch(()=>({}));
    setClockMsg(res.success ? `✅ ${res.message}` : `❌ ${res.error}`);
    load();
    const today = new Date().toISOString().slice(0,10);
    fetch(`/api/erp/attendance?employee_id=${user.id}&date=${today}`).then(r=>r.json()).then(d=>{if(d[0])setTodayStatus(d[0]);}).catch(()=>{});
  };

  const statusColor: any = {present:"badge-green",late:"badge-orange",absent:"badge-red",half_day:"badge-blue"};

  return (
    <div>
      {/* Clock In/Out Card */}
      <div className="erp-card" style={{marginBottom:24,display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,marginBottom:4}}>Today: {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
          {todayStatus
            ? <div style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>In: {todayStatus.time_in ? new Date(todayStatus.time_in).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"} &nbsp;|&nbsp; Out: {todayStatus.time_out ? new Date(todayStatus.time_out).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"} &nbsp;|&nbsp; Hours: {todayStatus.working_hours || "—"}</div>
            : <div style={{fontSize:13,color:"rgba(255,255,255,0.35)"}}>Not clocked in today</div>
          }
          {clockMsg && <div style={{marginTop:8,fontSize:13,color:clockMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{clockMsg}</div>}
        </div>
        <div style={{display:"flex",gap:10}}>
          {(!todayStatus||!todayStatus.time_in) && <button className="erp-clock-btn erp-clock-in" onClick={()=>clock("in")}>⏱ Clock In</button>}
          {todayStatus&&todayStatus.time_in&&!todayStatus.time_out && <button className="erp-clock-btn erp-clock-out" onClick={()=>clock("out")}>⏹ Clock Out</button>}
          {todayStatus&&todayStatus.time_out && <div style={{padding:"14px 24px",background:"rgba(0,200,100,0.1)",border:"1px solid rgba(0,200,100,0.25)",borderRadius:50,color:"#00c864",fontSize:14,fontWeight:600}}>✅ Day Complete</div>}
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-section-header">
          <div className="erp-section-title">Attendance History</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {user.role==="admin" && (
              <select className="erp-select" style={{width:"auto",padding:"6px 12px"}} value={filterEmp} onChange={e=>setFilterEmp(e.target.value)}>
                <option value="">All Employees</option>
                {employees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            )}
            <input type="date" className="erp-input" style={{width:"auto",padding:"6px 12px"}} value={filterDate} onChange={e=>setFilterDate(e.target.value)} />
            <button className="erp-btn erp-btn-primary erp-btn-sm" onClick={load}>Filter</button>
          </div>
        </div>
        <div className="erp-table-wrap">
          <table>
            <thead><tr><th>Date</th>{user.role==="admin"&&<th>Employee</th>}<th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Status</th></tr></thead>
            <tbody>
              {records.length===0 && <tr><td colSpan={6} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No records found</td></tr>}
              {records.map((r:any)=>(
                <tr key={r.id}>
                  <td>{r.date}</td>
                  {user.role==="admin"&&<td style={{fontWeight:600}}>{r.employee_name}</td>}
                  <td>{r.time_in ? new Date(r.time_in).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"}</td>
                  <td>{r.time_out ? new Date(r.time_out).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"}</td>
                  <td>{r.working_hours ? `${r.working_hours}h` : "—"}</td>
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
