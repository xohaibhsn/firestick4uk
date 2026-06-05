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

  // READ-ONLY — no mutation state (FIX 1: all request/modal state removed)

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

  const filtered = txns.filter(t => {
    // Payroll: use payroll_month not created_at for cutoff
    if (t.reference_type === 'payroll') {
      const pm = t.payroll_month || String(t.created_at||"").slice(0,7);
      if (pm > LEDGER_CUTOFF) return false;
    }
    // Fix 2: manual_entry / salary / advance / employee_request — NEVER apply month cutoff
    // These are admin-initiated and can happen any time (current month is valid)
    else if (['manual_entry','salary','advance','employee_request','expense'].includes(t.reference_type)) {
      // No cutoff — always show
    }
    // Everything else: apply created_at cutoff
    else {
      const txMonth = String(t.created_at || "").slice(0, 7);
      if (txMonth && txMonth > LEDGER_CUTOFF) return false;
    }
    if (filterFrom && new Date(t.created_at) < new Date(filterFrom)) return false;
    if (filterTo && new Date(t.created_at) > new Date(filterTo+"T23:59:59")) return false;
    return true;
  });
  const withBal = withRunningBalance(filtered, openingBal);
  const totalGave = filtered.filter(t=>t.type==="debit").reduce((s,t)=>s+Number(t.amount),0);
  const totalGot  = filtered.filter(t=>t.type==="credit").reduce((s,t)=>s+Number(t.amount),0);
  const netBal    = totalGot - totalGave;

  if (loading) return <div style={{textAlign:"center",padding:60,color:"#888"}}>Loading ledger...</div>;

  return (
    <div>
      {/* Header card */}
      <div className="erp-card" style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:"#111"}}>{user.name}</div>
          <div style={{fontSize:12,color:"#888",textTransform:"capitalize"}}>{user.role} · Personal Ledger <span style={{background:"#DCFCE7",color:"#166534",border:"1px solid #BBF7D0",borderRadius:10,padding:"1px 8px",fontSize:10,fontWeight:700,marginLeft:4}}>Read-Only</span></div>
          {empData?.salary>0 && <div style={{fontSize:12,color:"#5B21B6",marginTop:2,fontWeight:600}}>Monthly Salary: {fmt(Number(empData.salary))}</div>}
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,color:"#888",letterSpacing:"1px",textTransform:"uppercase"}}>Net Receivable</div>
          <div style={{fontSize:24,fontWeight:900,color:netBal>=0?"#16A34A":"#DC2626"}}>{fmt(Math.abs(netBal))}</div>
          <div style={{fontSize:11,color:netBal>=0?"#16A34A":"#DC2626"}}>{netBal>=0?"Company owes you":"You owe company"}</div>
        </div>
      </div>

      {/* FIX 2B — Summary Cards with updated enterprise terminology */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
        <div style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:12,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:"#DC2626",fontWeight:600,letterSpacing:"0.5px",marginBottom:3}}>↑ YOU RECEIVED (Cr)</div>
          <div style={{fontSize:16,fontWeight:800,color:"#DC2626"}}>{fmt(totalGave)}</div>
          <div style={{fontSize:9,color:"#EF4444",marginTop:1}}>Credit (Cr)</div>
        </div>
        <div style={{background:"#DCFCE7",border:"1px solid #BBF7D0",borderRadius:12,padding:"12px 14px"}}>
          {/* FIX 2B: "YOU GOT" → "TOTAL YOU WILL GET" */}
          <div style={{fontSize:10,color:"#16A34A",fontWeight:600,letterSpacing:"0.5px",marginBottom:3}}>↓ TOTAL YOU WILL GET</div>
          <div style={{fontSize:16,fontWeight:800,color:"#16A34A"}}>{fmt(totalGot)}</div>
          <div style={{fontSize:9,color:"#22C55E",marginTop:1}}>Receivable (Dr)</div>
        </div>
        <div style={{background:"#EDE9FE",border:"1px solid #DDD6FE",borderRadius:12,padding:"12px 14px"}}>
          {/* FIX 2B: "BALANCE" → "NET RECEIVABLE" */}
          <div style={{fontSize:10,color:"#5B21B6",fontWeight:600,letterSpacing:"0.5px",marginBottom:3}}>⚖️ NET RECEIVABLE</div>
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

      {/* Transactions — READ-ONLY view */}
      <div className="erp-card" style={{padding:0,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px",background:"#F9F9F9",borderBottom:"2px solid #E5E5E5",padding:"10px 14px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#555",letterSpacing:"1px",textTransform:"uppercase"}}>Date & Details</div>
          <div style={{fontSize:11,fontWeight:700,color:"#DC2626",textAlign:"right"}}>You Received<br/><span style={{fontSize:9,opacity:0.7}}>Credit (Cr)</span></div>
          <div style={{fontSize:11,fontWeight:700,color:"#16A34A",textAlign:"right"}}>You Will Get<br/><span style={{fontSize:9,opacity:0.7}}>Debit (Dr)</span></div>
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
            <div style={{fontSize:13,marginTop:4}}>Your salary and expense reimbursements will appear here.</div>
          </div>
        ) : withBal.map((t:any, i:number) => (
          <div key={t.id} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px",padding:"12px 14px",borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFFFFF":"#FAFAFA"}}>
            <div>
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
            </div>
            <div style={{textAlign:"right",paddingTop:4}}>
              {t.type==="debit"  ? <span style={{color:"#DC2626",fontWeight:700,fontSize:14}}>{fmt(Number(t.amount))}</span> : <span style={{color:"#CCCCCC",fontSize:14}}>—</span>}
            </div>
            <div style={{textAlign:"right",paddingTop:4}}>
              {t.type==="credit" ? <span style={{color:"#16A34A",fontWeight:700,fontSize:14}}>{fmt(Number(t.amount))}</span> : <span style={{color:"#CCCCCC",fontSize:14}}>—</span>}
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
      {/* FIX 1: Sticky mutation buttons REMOVED — employee view is strictly READ-ONLY */}
    </div>
  );
}
