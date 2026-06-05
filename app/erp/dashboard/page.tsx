"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPDashboard() {
  return (
    <ERPLayout title="Dashboard" active="dashboard">
      {(user, currency) => {
        // Vendor should never reach here (ERPLayout redirects them)
        // Hard safety net: if they somehow slip through, redirect immediately
        if (user.role === "vendor") {
          if (typeof window !== "undefined") window.location.href = "/erp/my-ledger";
          return null;
        }
        return <DashboardContent user={user} currency={currency} />;
      }}
    </ERPLayout>
  );
}


function DashboardContent({ user, currency }: { user: any; currency: string }) {
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
  const [stats, setStats] = useState({ employees:0, pendingExpenses:0, pendingLeaves:0, todayAttendance:0 });
  const [officeExpSummary, setOfficeExpSummary] = useState<any>({ total:0, categories:[] });
  const [todayStatus, setTodayStatus] = useState<any>(null);
  const [myExpenses, setMyExpenses] = useState<any[]>([]);
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [clockMsg, setClockMsg] = useState("");

  useEffect(() => {
    const today = new Date().toISOString().slice(0,10);
    const curMonth = new Date().toISOString().slice(0,7);
    fetch(`/api/erp/attendance?employee_id=${user.id}&date=${today}`).then(r=>r.json()).then(d=>{ if(d[0]) setTodayStatus(d[0]); }).catch(()=>{});
    if (user.role === "admin") {
      fetch("/api/erp/employees").then(r=>r.json()).then(d=>setStats(s=>({...s,employees:d.filter((e:any)=>e.active).length}))).catch(()=>{});
      fetch("/api/erp/expenses").then(r=>r.json()).then(d=>setStats(s=>({...s,pendingExpenses:d.filter((e:any)=>e.status==="pending").length}))).catch(()=>{});
      fetch("/api/erp/leaves").then(r=>r.json()).then(d=>setStats(s=>({...s,pendingLeaves:d.filter((l:any)=>l.status==="pending").length}))).catch(()=>{});
      fetch(`/api/erp/office-expenses?summary=1&month=${curMonth}`).then(r=>r.json()).then(d=>setOfficeExpSummary(d||{total:0,categories:[]})).catch(()=>{});
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
          <div style={{fontSize:13,color:"#666666",marginBottom:4}}>Today — {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
          {todayStatus ? (
            <div style={{display:"flex",gap:20,flexWrap:"wrap",marginTop:8}}>
              <div><div style={{fontSize:11,color:"#777777",letterSpacing:"1px",textTransform:"uppercase"}}>Clock In</div><div style={{fontSize:15,fontWeight:600}}>{todayStatus.time_in ? new Date(todayStatus.time_in).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"}</div></div>
              <div><div style={{fontSize:11,color:"#777777",letterSpacing:"1px",textTransform:"uppercase"}}>Clock Out</div><div style={{fontSize:15,fontWeight:600}}>{todayStatus.time_out ? new Date(todayStatus.time_out).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"}</div></div>
              <div><div style={{fontSize:11,color:"#777777",letterSpacing:"1px",textTransform:"uppercase"}}>Hours</div><div style={{fontSize:15,fontWeight:600}}>{todayStatus.working_hours || "—"}</div></div>
              <div style={{display:"flex",alignItems:"center"}}><span className={statusBadge(todayStatus.status)}>{todayStatus.status}</span></div>
            </div>
          ) : <div style={{color:"#777777",fontSize:13,marginTop:8}}>Not clocked in today</div>}
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
              {icon:"👥",label:"Users",val:stats.employees,href:"/erp/employees"},
              {icon:"💸",label:"Pending Expenses",val:stats.pendingExpenses,href:"/erp/expenses"},
              {icon:"🌿",label:"Pending Leaves",val:stats.pendingLeaves,href:"/erp/leaves"},
            ].map((s,i)=>(
              <a key={i} href={s.href} style={{textDecoration:"none",cursor:"pointer",display:"block"}}>
                <div className="erp-stat" style={{cursor:"pointer",transition:"transform 0.15s,box-shadow 0.15s"}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(-3px)";(e.currentTarget as HTMLElement).style.boxShadow="0 6px 18px rgba(0,0,0,0.12)";}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="";(e.currentTarget as HTMLElement).style.boxShadow="";}}>
                  <div className="erp-stat-icon">{s.icon}</div>
                  <div className="erp-stat-val">{s.val}</div>
                  <div className="erp-stat-label">{s.label}</div>
                </div>
              </a>
            ))}
          </div>

          {/* Office Expenses Summary */}
          <div className="erp-card" style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:officeExpSummary.categories?.length?14:0}}>
              <div>
                <div style={{fontSize:13,fontWeight:700}}>🏢 This Month Office Expenses</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:900,color:"#ff8c00",marginTop:4}}>{fmt(officeExpSummary.total||0)}</div>
              </div>
              <a href="/erp/office-expenses" style={{color:"#5B21B6",fontSize:12,textDecoration:"none"}}>View All →</a>
            </div>
            {(officeExpSummary.categories||[]).length > 0 && (
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {(officeExpSummary.categories||[]).slice(0,3).map((c:any)=>(
                  <div key={c.category} style={{flex:1,minWidth:100,background:"rgba(255,140,0,0.08)",border:"1px solid rgba(255,140,0,0.2)",borderRadius:10,padding:"8px 12px"}}>
                    <div style={{fontSize:12,color:"#555555",marginBottom:2}}>{c.category}</div>
                    <div style={{fontWeight:700,color:"#ff8c00"}}>{fmt(Number(c.total))}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="erp-card">
            <div className="erp-section-header"><div className="erp-section-title">Quick Actions</div></div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              {[{href:"/erp/employees",label:"👥 Manage Users"},{href:"/erp/expenses",label:"💸 Review Expenses"},{href:"/erp/leaves",label:"🌿 Review Leaves"},{href:"/erp/attendance",label:"⏰ View Attendance"},{href:"/erp/ledger",label:"📒 Open Ledger"}].map(a=>(
                <a key={a.href} href={a.href} style={{padding:"10px 18px",background:"#111111",border:"1px solid #111111",borderRadius:10,color:"#FFFFFF",textDecoration:"none",fontSize:13,fontWeight:600,transition:"all 0.2s"}}
                  onMouseEnter={e=>(e.currentTarget.style.background="#5B21B6")}
                  onMouseLeave={e=>(e.currentTarget.style.background="#111111")}
                >{a.label}</a>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <div className="erp-card">
            <div className="erp-section-header"><div className="erp-section-title">My Expenses</div><a href="/erp/expenses" style={{color:"#5B21B6",fontSize:12,textDecoration:"none"}}>View All →</a></div>
            {myExpenses.length===0 ? <div className="erp-empty">No expenses yet</div> : myExpenses.map((e:any)=>(
              <div key={e.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(139,0,255,0.07)"}}>
                <div><div style={{fontSize:13,fontWeight:600}}>{fmt(Number(e.amount))}</div><div style={{fontSize:11,color:"#777777"}}>{e.category}</div></div>
                <span className={statusBadge(e.status)}>{e.status}</span>
              </div>
            ))}
          </div>
          <div className="erp-card">
            <div className="erp-section-header"><div className="erp-section-title">My Leaves</div><a href="/erp/leaves" style={{color:"#5B21B6",fontSize:12,textDecoration:"none"}}>View All →</a></div>
            {myLeaves.length===0 ? <div className="erp-empty">No leave requests</div> : myLeaves.map((l:any)=>(
              <div key={l.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(139,0,255,0.07)"}}>
                <div><div style={{fontSize:13,fontWeight:600}}>{l.leave_type}</div><div style={{fontSize:11,color:"#777777"}}>{l.from_date} → {l.to_date}</div></div>
                <span className={statusBadge(l.status)}>{l.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
