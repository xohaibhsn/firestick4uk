"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPDashboard() {
  return (
    <ERPLayout title="Dashboard" active="dashboard">
      {(user, currency) => <DashboardContent user={user} currency={currency} />}
    </ERPLayout>
  );
}

function DashboardContent({ user, currency }: { user: any; currency: string }) {
  const fmt = (n: number) => currency==="PKR" ? `PKR ${Math.round(n).toLocaleString()}` : `£${Number(n).toFixed(2)}`;
  const [stats, setStats] = useState({ employees:0, pendingExpenses:0, pendingLeaves:0, todayAttendance:0 });
  const [todayStatus, setTodayStatus] = useState<any>(null);
  const [myExpenses, setMyExpenses] = useState<any[]>([]);
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [clockMsg, setClockMsg] = useState("");

  useEffect(() => {
    const today = new Date().toISOString().slice(0,10);
    fetch(`/api/erp/attendance?employee_id=${user.id}&date=${today}`).then(r=>r.json()).then(d=>{ if(d[0]) setTodayStatus(d[0]); }).catch(()=>{});
    if (user.role === "admin") {
      fetch("/api/erp/employees").then(r=>r.json()).then(d=>setStats(s=>({...s,employees:d.filter((e:any)=>e.active).length}))).catch(()=>{});
      fetch("/api/erp/expenses").then(r=>r.json()).then(d=>setStats(s=>({...s,pendingExpenses:d.filter((e:any)=>e.status==="pending").length}))).catch(()=>{});
      fetch("/api/erp/leaves").then(r=>r.json()).then(d=>setStats(s=>({...s,pendingLeaves:d.filter((l:any)=>l.status==="pending").length}))).catch(()=>{});
    } else {
      fetch(`/api/erp/expenses?employee_id=${user.id}`).then(r=>r.json()).then(d=>setMyExpenses(d.slice(0,4))).catch(()=>{});
      fetch(`/api/erp/leaves?employee_id=${user.id}`).then(r=>r.json()).then(d=>setMyLeaves(d.slice(0,4))).catch(()=>{});
    }
  }, [user]);

  const clock = async (action: string) => {
    setClockMsg("");
    const res = await fetch("/api/erp/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({employee_id:user.id,action})}).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setClockMsg(`✅ ${res.message}${res.hours ? ` — ${res.hours}h worked` : ""}`);
      const today = new Date().toISOString().slice(0,10);
      fetch(`/api/erp/attendance?employee_id=${user.id}&date=${today}`).then(r=>r.json()).then(d=>{ if(d[0]) setTodayStatus(d[0]); }).catch(()=>{});
    } else { setClockMsg(`❌ ${res.error}`); }
  };

  const statusBadge = (s: string) => {
    const map: any = { pending:"badge-orange", approved:"badge-green", rejected:"badge-red", present:"badge-green", late:"badge-orange", absent:"badge-red", half_day:"badge-blue" };
    return `badge ${map[s]||"badge-purple"}`;
  };

  return (
    <div>
      {/* Clock In/Out */}
      <div className="erp-card" style={{marginBottom:24,display:"flex",alignItems:"center",gap:28,flexWrap:"wrap"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.4)",marginBottom:4}}>Today — {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
          {todayStatus ? (
            <div style={{display:"flex",gap:20,flexWrap:"wrap",marginTop:8}}>
              <div><div style={{fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:"1px",textTransform:"uppercase"}}>Clock In</div><div style={{fontSize:15,fontWeight:600}}>{todayStatus.time_in ? new Date(todayStatus.time_in).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"}</div></div>
              <div><div style={{fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:"1px",textTransform:"uppercase"}}>Clock Out</div><div style={{fontSize:15,fontWeight:600}}>{todayStatus.time_out ? new Date(todayStatus.time_out).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"}</div></div>
              <div><div style={{fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:"1px",textTransform:"uppercase"}}>Hours</div><div style={{fontSize:15,fontWeight:600}}>{todayStatus.working_hours || "—"}</div></div>
              <div style={{display:"flex",alignItems:"center"}}><span className={statusBadge(todayStatus.status)}>{todayStatus.status}</span></div>
            </div>
          ) : <div style={{color:"rgba(255,255,255,0.35)",fontSize:13,marginTop:8}}>Not clocked in today</div>}
          {clockMsg && <div style={{marginTop:10,fontSize:13,color:clockMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{clockMsg}</div>}
        </div>
        <div style={{display:"flex",gap:12}}>
          {(!todayStatus || !todayStatus.time_in) && <button className="erp-clock-btn erp-clock-in" onClick={()=>clock("in")}>⏱ Clock In</button>}
          {todayStatus && todayStatus.time_in && !todayStatus.time_out && <button className="erp-clock-btn erp-clock-out" onClick={()=>clock("out")}>⏹ Clock Out</button>}
          {todayStatus && todayStatus.time_out && <div style={{padding:"14px 24px",background:"rgba(0,200,100,0.1)",border:"1px solid rgba(0,200,100,0.25)",borderRadius:50,color:"#00c864",fontSize:14,fontWeight:600}}>✅ Day Complete</div>}
        </div>
      </div>

      {user.role === "admin" ? (
        <>
          <div className="erp-stat-grid">
            {[
              {icon:"👥",label:"Employees",val:stats.employees},
              {icon:"💸",label:"Pending Expenses",val:stats.pendingExpenses},
              {icon:"🌿",label:"Pending Leaves",val:stats.pendingLeaves},
            ].map((s,i)=>(
              <div className="erp-stat" key={i}><div className="erp-stat-icon">{s.icon}</div><div className="erp-stat-val">{s.val}</div><div className="erp-stat-label">{s.label}</div></div>
            ))}
          </div>
          <div className="erp-card">
            <div className="erp-section-header"><div className="erp-section-title">Quick Actions</div></div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              {[{href:"/erp/employees",label:"👥 Manage Employees"},{href:"/erp/expenses",label:"💸 Review Expenses"},{href:"/erp/leaves",label:"🌿 Review Leaves"},{href:"/erp/attendance",label:"⏰ View Attendance"},{href:"/erp/ledger",label:"📒 Open Ledger"}].map(a=>(
                <a key={a.href} href={a.href} style={{padding:"10px 18px",background:"rgba(139,0,255,0.12)",border:"1px solid rgba(139,0,255,0.25)",borderRadius:10,color:"rgba(255,255,255,0.8)",textDecoration:"none",fontSize:13,transition:"all 0.2s"}}>{a.label}</a>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <div className="erp-card">
            <div className="erp-section-header"><div className="erp-section-title">My Expenses</div><a href="/erp/expenses" style={{color:"var(--pg)",fontSize:12,textDecoration:"none"}}>View All →</a></div>
            {myExpenses.length===0 ? <div className="erp-empty">No expenses yet</div> : myExpenses.map((e:any)=>(
              <div key={e.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(139,0,255,0.07)"}}>
                <div><div style={{fontSize:13,fontWeight:600}}>{fmt(Number(e.amount))}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.35)"}}>{e.category}</div></div>
                <span className={statusBadge(e.status)}>{e.status}</span>
              </div>
            ))}
          </div>
          <div className="erp-card">
            <div className="erp-section-header"><div className="erp-section-title">My Leaves</div><a href="/erp/leaves" style={{color:"var(--pg)",fontSize:12,textDecoration:"none"}}>View All →</a></div>
            {myLeaves.length===0 ? <div className="erp-empty">No leave requests</div> : myLeaves.map((l:any)=>(
              <div key={l.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(139,0,255,0.07)"}}>
                <div><div style={{fontSize:13,fontWeight:600}}>{l.leave_type}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.35)"}}>{l.from_date} → {l.to_date}</div></div>
                <span className={statusBadge(l.status)}>{l.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
