"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

// Client-side last completed month (mirrors lib/payrollUtils)
const _n = new Date();
const LEDGER_CUTOFF = _n.getMonth() === 0
  ? `${_n.getFullYear()-1}-12`
  : `${_n.getFullYear()}-${String(_n.getMonth()).padStart(2,'0')}`;

export default function MyLedger() {
  return (
    <ERPLayout title="My Ledger" active="my-ledger">
      {(user) => <MyLedgerContent user={user} />}
    </ERPLayout>
  );
}

function fmt(n: number) {
  return `Rs. ${Math.abs(Math.round(n)).toLocaleString("en-PK")}`;
}

function withRunningBalance(txns: any[], openingBalance: number) {
  let running = Number(openingBalance || 0);
  return txns.map(t => {
    if (t.type === "credit") running += Number(t.amount);
    else running -= Number(t.amount);
    return { ...t, runningBalance: running };
  });
}

function MyLedgerContent({ user }: { user: any }) {
  const [account, setAccount] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [openingBal, setOpeningBal] = useState(0);
  const [empData, setEmpData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [msg, setMsg] = useState("");

  // Modal state
  const [modal, setModal] = useState<"request"|null>(null);
  const [form, setForm] = useState({ amount:"", description:"", date:new Date().toISOString().slice(0,10), type:"credit", category:"Salary" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const emp = await fetch(`/api/erp/employees?id=${user.id}`).then(r=>r.json());
        setEmpData(emp);
        const accounts: any[] = await fetch(`/api/erp/ledger?self=1&user_id=${user.id}&user_role=${user.role}`).then(r=>r.json());
        const own = Array.isArray(accounts) ? accounts[0] : null;
        if (own) {
          setAccount(own);
          setOpeningBal(Number(own.opening_balance||0));
          const data = await fetch(`/api/erp/ledger?account_id=${own.id}`).then(r=>r.json());
          setTxns(data.transactions||[]);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [user.id]);

  const requestEntry = async () => {
    if (!form.amount || !form.description || !account) return;
    setSaving(true);
    const res = await fetch("/api/erp/ledger", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        account_id: account.id,
        type: form.type,
        amount: form.amount,
        description: `[Request] ${form.description}`,
        reference_type: "employee_request",
        created_by: user.id,
      }),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setMsg("✅ Entry request submitted");
      setModal(null);
      setForm({ amount:"", description:"", date:new Date().toISOString().slice(0,10), type:"credit", category:"Salary" });
      const data = await fetch(`/api/erp/ledger?account_id=${account.id}`).then(r=>r.json()).catch(()=>({transactions:[]}));
      setTxns(data.transactions||[]);
    } else { setMsg(`❌ ${res.error||"Failed"}`); }
    setSaving(false);
    setTimeout(()=>setMsg(""),3000);
  };

  const filtered = txns.filter(t => {
    // Fix 2 — smart filter: payroll uses payroll_month, not created_at
    if (t.reference_type === 'payroll') {
      const pm = t.payroll_month || String(t.created_at||"").slice(0,7);
      if (pm > LEDGER_CUTOFF) return false;
    } else {
      const txMonth = String(t.created_at || "").slice(0, 7);
      if (txMonth && txMonth > LEDGER_CUTOFF) return false;
    }
    if (filterFrom && new Date(t.created_at) < new Date(filterFrom)) return false;
    if (filterTo && new Date(t.created_at) > new Date(filterTo+"T23:59:59")) return false;
    return true;
  });
  const withBal = withRunningBalance(filtered, openingBal);
  const totalGave = filtered.filter(t=>t.type==="debit").reduce((s,t)=>s+Number(t.amount),0);
  const totalGot = filtered.filter(t=>t.type==="credit").reduce((s,t)=>s+Number(t.amount),0);
  const netBal = totalGot - totalGave;

  if (loading) return <div style={{textAlign:"center",padding:60,color:"#888"}}>Loading ledger...</div>;

  return (
    <div style={{paddingBottom:90}}>
      {/* Header card */}
      <div className="erp-card" style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:"#111"}}>{user.name}</div>
          <div style={{fontSize:12,color:"#888",textTransform:"capitalize"}}>{user.role} · Personal Ledger</div>
          {empData?.salary>0 && <div style={{fontSize:12,color:"#5B21B6",marginTop:2,fontWeight:600}}>Monthly Salary: {fmt(Number(empData.salary))}</div>}
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,color:"#888",letterSpacing:"1px",textTransform:"uppercase"}}>Net Balance</div>
          <div style={{fontSize:24,fontWeight:900,color:netBal>=0?"#16A34A":"#DC2626"}}>{fmt(Math.abs(netBal))}</div>
          <div style={{fontSize:11,color:netBal>=0?"#16A34A":"#DC2626"}}>{netBal>=0?"Company owes you":"You owe company"}</div>
        </div>
      </div>

      {msg && <div style={{marginBottom:12,padding:"10px 14px",background:msg.startsWith("✅")?"#DCFCE7":"#FEE2E2",borderRadius:10,fontSize:13,color:msg.startsWith("✅")?"#166534":"#DC2626",border:`1px solid ${msg.startsWith("✅")?"#BBF7D0":"#FECACA"}`}}>{msg}</div>}

      {/* Summary Cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
        <div style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:12,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:"#DC2626",fontWeight:600,letterSpacing:"0.5px",marginBottom:3}}>↑ YOU GAVE</div>
          <div style={{fontSize:16,fontWeight:800,color:"#DC2626"}}>{fmt(totalGave)}</div>
          <div style={{fontSize:9,color:"#EF4444",marginTop:1}}>Credit (Cr)</div>
        </div>
        <div style={{background:"#DCFCE7",border:"1px solid #BBF7D0",borderRadius:12,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:"#16A34A",fontWeight:600,letterSpacing:"0.5px",marginBottom:3}}>↓ YOU GOT</div>
          <div style={{fontSize:16,fontWeight:800,color:"#16A34A"}}>{fmt(totalGot)}</div>
          <div style={{fontSize:9,color:"#22C55E",marginTop:1}}>Debit (Dr)</div>
        </div>
        <div style={{background:"#EDE9FE",border:"1px solid #DDD6FE",borderRadius:12,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:"#5B21B6",fontWeight:600,letterSpacing:"0.5px",marginBottom:3}}>⚖️ BALANCE</div>
          <div style={{fontSize:16,fontWeight:800,color:netBal>=0?"#16A34A":"#DC2626"}}>{fmt(Math.abs(netBal))}</div>
          <div style={{fontSize:9,color:netBal>=0?"#16A34A":"#DC2626",marginTop:1}}>{netBal>=0?"Co. owes you":"You owe co."}</div>
        </div>
      </div>

      {/* Date filter */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input type="date" className="erp-input" style={{flex:1,minWidth:120,padding:"7px 10px",fontSize:12}} value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} />
        <span style={{color:"#888",fontSize:12}}>to</span>
        <input type="date" className="erp-input" style={{flex:1,minWidth:120,padding:"7px 10px",fontSize:12}} value={filterTo} onChange={e=>setFilterTo(e.target.value)} />
        {(filterFrom||filterTo)&&<button className="erp-btn erp-btn-outline erp-btn-sm" onClick={()=>{setFilterFrom("");setFilterTo("");}}>✕</button>}
      </div>

      {/* Transactions */}
      <div className="erp-card" style={{padding:0,overflow:"hidden"}}>
        {/* Header */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px",background:"#F9F9F9",borderBottom:"2px solid #E5E5E5",padding:"10px 14px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#555",letterSpacing:"1px",textTransform:"uppercase"}}>Date & Details</div>
          <div style={{fontSize:11,fontWeight:700,color:"#DC2626",textAlign:"right"}}>You Gave<br/><span style={{fontSize:9,opacity:0.7}}>Credit (Cr)</span></div>
          <div style={{fontSize:11,fontWeight:700,color:"#16A34A",textAlign:"right"}}>You Got<br/><span style={{fontSize:9,opacity:0.7}}>Debit (Dr)</span></div>
        </div>

        {!account ? (
          <div style={{textAlign:"center",padding:"50px 20px",color:"#888"}}>
            <div style={{fontSize:32,marginBottom:10}}>📒</div>
            <div>No ledger account found. Contact your administrator.</div>
          </div>
        ) : withBal.length === 0 ? (
          <div style={{textAlign:"center",padding:"60px 20px",color:"#888"}}>
            <div style={{fontSize:32,marginBottom:10}}>📒</div>
            <div style={{fontWeight:600}}>No transactions yet</div>
            <div style={{fontSize:13,marginTop:4}}>Use the buttons below to request an entry!</div>
          </div>
        ) : withBal.map((t:any, i:number) => (
          <div key={t.id} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px",padding:"12px 14px",borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFFFFF":"#FAFAFA"}}>
            <div>
              {/* Fix 4 — payroll shows its month, not physical created_at */}
              <div style={{fontSize:11,color:"#888",marginBottom:2}}>
                {t.reference_type==="payroll" && t.payroll_month
                  ? `Salary — ${new Date(t.payroll_month+"-01").toLocaleDateString("en-GB",{month:"long",year:"numeric"})}`
                  : new Date(t.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
              </div>
              <div style={{fontSize:13,fontWeight:600,color:"#111",marginBottom:4}}>{t.description||"—"}</div>
              <span style={{background:"#F5F5F5",border:"1px solid #E5E5E5",borderRadius:12,padding:"2px 8px",fontSize:11,color:"#666"}}>
                Bal. {fmt(t.runningBalance)}
              </span>
              {t.reference_type==="payroll"     && <span style={{marginLeft:6,background:"#DCFCE7",border:"1px solid #BBF7D0",borderRadius:12,padding:"2px 8px",fontSize:10,color:"#16A34A",fontWeight:700}}>💰 payroll</span>}
              {t.reference_type==="salary"      && <span style={{marginLeft:6,background:"#DCFCE7",border:"1px solid #BBF7D0",borderRadius:12,padding:"2px 8px",fontSize:10,color:"#16A34A"}}>salary</span>}
              {t.reference_type==="expense"     && <span style={{marginLeft:6,background:"#EDE9FE",border:"1px solid #DDD6FE",borderRadius:12,padding:"2px 8px",fontSize:10,color:"#5B21B6"}}>expense</span>}
              {t.reference_type==="employee_request" && <span style={{marginLeft:6,background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:12,padding:"2px 8px",fontSize:10,color:"#92400E"}}>request</span>}
            </div>
            <div style={{textAlign:"right",paddingTop:4}}>
              {t.type==="debit"
                ? <span style={{color:"#DC2626",fontWeight:700,fontSize:14}}>{fmt(Number(t.amount))}</span>
                : <span style={{color:"#CCCCCC",fontSize:14}}>—</span>}
            </div>
            <div style={{textAlign:"right",paddingTop:4}}>
              {t.type==="credit"
                ? <span style={{color:"#16A34A",fontWeight:700,fontSize:14}}>{fmt(Number(t.amount))}</span>
                : <span style={{color:"#CCCCCC",fontSize:14}}>—</span>}
            </div>
          </div>
        ))}

        {withBal.length > 0 && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px",padding:"12px 14px",background:"#F9F9F9",borderTop:"2px solid #E5E5E5"}}>
            <div style={{fontWeight:700,fontSize:13,color:"#111"}}>Total</div>
            <div style={{textAlign:"right",fontWeight:800,color:"#DC2626",fontSize:14}}>{fmt(totalGave)}</div>
            <div style={{textAlign:"right",fontWeight:800,color:"#16A34A",fontSize:14}}>{fmt(totalGot)}</div>
          </div>
        )}
      </div>

      {/* Sticky Buttons */}
      <div style={{position:"fixed",bottom:0,left:220,right:0,display:"grid",gridTemplateColumns:"1fr 1fr",zIndex:50,boxShadow:"0 -4px 12px rgba(0,0,0,0.12)"}}>
        <button onClick={()=>{setForm(f=>({...f,type:"debit"}));setModal("request");}} style={{background:"#DC2626",color:"#fff",padding:"18px",fontSize:15,fontWeight:700,border:"none",cursor:"pointer"}}>
          ↑ YOU GAVE (Cr)
        </button>
        <button onClick={()=>{setForm(f=>({...f,type:"credit"}));setModal("request");}} style={{background:"#16A34A",color:"#fff",padding:"18px",fontSize:15,fontWeight:700,border:"none",cursor:"pointer"}}>
          ↓ YOU GOT (Dr)
        </button>
      </div>

      {/* Request Modal */}
      {modal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setModal(null)}>
          <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:"28px 24px 36px",width:"100%",maxWidth:520}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:"#E5E5E5",borderRadius:2,margin:"0 auto 20px"}}/>
            <div style={{fontSize:18,fontWeight:700,color:form.type==="debit"?"#DC2626":"#16A34A",marginBottom:4}}>
              {form.type==="debit" ? "↑ Record Payment Given" : "↓ Record Amount Received"}
            </div>
            <div style={{fontSize:12,color:"#888",marginBottom:20}}>Request entry · Pending admin review</div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Amount (Rs.) *</label>
              <input autoFocus type="number" className="erp-input" placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={{width:"100%",fontSize:18,fontWeight:700,color:form.type==="debit"?"#DC2626":"#16A34A"}} />
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Description *</label>
              <input type="text" className="erp-input" placeholder="e.g. June salary received" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={{width:"100%"}} />
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Type</label>
                <select className="erp-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={{width:"100%"}}>
                  <option value="credit">↓ You Got (Dr)</option>
                  <option value="debit">↑ You Gave (Cr)</option>
                </select>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Category</label>
                <select className="erp-select" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{width:"100%"}}>
                  {["Salary","Expense","Advance","Bonus","Deduction","Other"].map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>setModal(null)} style={{background:"#F5F5F5",color:"#555",border:"none",borderRadius:10,padding:"14px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Cancel</button>
              <button onClick={requestEntry} disabled={saving||!form.amount||!form.description} style={{background:form.type==="debit"?"#DC2626":"#16A34A",color:"#fff",border:"none",borderRadius:10,padding:"14px",fontSize:14,fontWeight:700,cursor:"pointer",opacity:(saving||!form.amount||!form.description)?0.5:1}}>
                {saving ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
