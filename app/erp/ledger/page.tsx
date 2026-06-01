"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPLedger() {
  return <ERPLayout title="Ledger" active="ledger">{(user) => user.role==="admin" ? <LedgerContent user={user} /> : <div style={{padding:40,textAlign:"center",color:"rgba(255,255,255,0.35)"}}>⛔ Admin access only</div>}</ERPLayout>;
}

function LedgerContent({ user }: { user: any }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [entryForm, setEntryForm] = useState({type:"credit",amount:"",description:""});
  const [accForm, setAccForm] = useState({name:"",type:"client",opening_balance:""});
  const [showAccForm, setShowAccForm] = useState(false);
  const [msg, setMsg] = useState("");

  const loadAccounts = () => { fetch("/api/erp/ledger").then(r=>r.json()).then(d=>setAccounts(Array.isArray(d)?d:[])).catch(()=>{}); };
  useEffect(()=>{ loadAccounts(); },[]);

  const selectAccount = (acc:any) => {
    setSelected(acc);
    fetch(`/api/erp/ledger?account_id=${acc.id}`).then(r=>r.json()).then(d=>{ setTxns(d.transactions||[]); setBalance(d.balance||0); }).catch(()=>{});
  };

  const addEntry = async () => {
    if (!entryForm.amount||!selected) { setMsg("❌ Amount required"); return; }
    const res = await fetch("/api/erp/ledger",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...entryForm,account_id:selected.id,created_by:user.id})}).then(r=>r.json()).catch(()=>({}));
    if (res.success) { setMsg("✅ Entry added"); setEntryForm({type:"credit",amount:"",description:""}); selectAccount(selected); loadAccounts(); }
    else setMsg(`❌ ${res.error}`);
  };

  const addAccount = async () => {
    if (!accForm.name) { setMsg("❌ Name required"); return; }
    const res = await fetch("/api/erp/ledger",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(accForm)}).then(r=>r.json()).catch(()=>({}));
    if (res.success) { setMsg("✅ Account created"); setAccForm({name:"",type:"client",opening_balance:""}); setShowAccForm(false); loadAccounts(); }
    else setMsg(`❌ ${res.error}`);
  };

  const typeColor: any = {employee:"badge-green",vendor:"badge-orange",client:"badge-blue"};

  return (
    <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:20,alignItems:"start"}}>
      {/* Accounts List */}
      <div>
        <div className="erp-card" style={{marginBottom:14}}>
          <div className="erp-section-header"><div className="erp-section-title">Accounts</div><button className="erp-btn erp-btn-primary erp-btn-sm" onClick={()=>setShowAccForm(!showAccForm)}>+</button></div>
          {showAccForm && (
            <div style={{marginBottom:14}}>
              <div className="erp-field"><label>Name</label><input className="erp-input" placeholder="Account name" value={accForm.name} onChange={e=>setAccForm(f=>({...f,name:e.target.value}))} /></div>
              <div className="erp-field"><label>Type</label><select className="erp-select" value={accForm.type} onChange={e=>setAccForm(f=>({...f,type:e.target.value}))}><option value="employee">Employee</option><option value="vendor">Vendor</option><option value="client">Client</option></select></div>
              <div className="erp-field"><label>Opening Balance (£)</label><input className="erp-input" type="number" placeholder="0.00" value={accForm.opening_balance} onChange={e=>setAccForm(f=>({...f,opening_balance:e.target.value}))} /></div>
              <button className="erp-btn erp-btn-primary" style={{width:"100%"}} onClick={addAccount}>Create Account</button>
            </div>
          )}
          {accounts.map((a:any)=>(
            <div key={a.id} onClick={()=>selectAccount(a)} style={{padding:"10px 12px",borderRadius:10,cursor:"pointer",marginBottom:4,border:`1px solid ${selected?.id===a.id?"rgba(139,0,255,0.5)":"rgba(139,0,255,0.1)"}`,background:selected?.id===a.id?"rgba(139,0,255,0.14)":"transparent",transition:"all 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontSize:13,fontWeight:600}}>{a.name}</div><span className={`badge ${typeColor[a.type]||"badge-purple"}`} style={{marginTop:3}}>{a.type}</span></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:700,color:Number(a.balance)>=0?"#00c864":"#ff6666"}}>£{Number(a.balance||0).toFixed(2)}</div></div>
              </div>
            </div>
          ))}
          {accounts.length===0 && <div className="erp-empty">No accounts yet</div>}
        </div>
      </div>

      {/* Transactions */}
      <div>
        {msg && <div style={{marginBottom:14,padding:"10px 14px",background:msg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",borderRadius:10,fontSize:13,color:msg.startsWith("✅")?"#00c864":"#ff6666"}}>{msg}</div>}
        {selected ? (
          <>
            <div className="erp-card" style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
                <div>
                  <div style={{fontSize:16,fontWeight:700}}>{selected.name}</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",textTransform:"capitalize"}}>{selected.type}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:"1px",textTransform:"uppercase"}}>Running Balance</div>
                  <div style={{fontSize:28,fontWeight:900,fontFamily:"'Cinzel',serif",color:balance>=0?"#00c864":"#ff6666"}}>£{balance.toFixed(2)}</div>
                </div>
              </div>
              <hr style={{border:"none",borderTop:"1px solid rgba(139,0,255,0.12)",margin:"16px 0"}} />
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div className="erp-field" style={{margin:0,flex:"0 0 90px"}}>
                  <label>Type</label>
                  <select className="erp-select" value={entryForm.type} onChange={e=>setEntryForm(f=>({...f,type:e.target.value}))} style={{padding:"8px 10px"}}>
                    <option value="credit">Credit</option><option value="debit">Debit</option>
                  </select>
                </div>
                <div className="erp-field" style={{margin:0,flex:"0 0 120px"}}><label>Amount (£)</label><input className="erp-input" type="number" placeholder="0.00" value={entryForm.amount} onChange={e=>setEntryForm(f=>({...f,amount:e.target.value}))} style={{padding:"8px 10px"}} /></div>
                <div className="erp-field" style={{margin:0,flex:1}}><label>Description</label><input className="erp-input" placeholder="Entry description" value={entryForm.description} onChange={e=>setEntryForm(f=>({...f,description:e.target.value}))} style={{padding:"8px 10px"}} /></div>
                <button className="erp-btn erp-btn-primary" onClick={addEntry} style={{height:38,whiteSpace:"nowrap"}}>Add Entry</button>
              </div>
            </div>

            <div className="erp-card">
              <div className="erp-section-title" style={{marginBottom:14}}>Transactions</div>
              <div className="erp-table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th><th>Reference</th></tr></thead>
                  <tbody>
                    {txns.length===0 && <tr><td colSpan={5} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No transactions yet</td></tr>}
                    {txns.map((t:any)=>(
                      <tr key={t.id}>
                        <td style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>{new Date(t.created_at).toLocaleDateString("en-GB")}</td>
                        <td><span className={`badge ${t.type==="credit"?"badge-green":"badge-red"}`}>{t.type}</span></td>
                        <td style={{fontWeight:700,color:t.type==="credit"?"#00c864":"#ff6666"}}>£{Number(t.amount).toFixed(2)}</td>
                        <td style={{maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description||"—"}</td>
                        <td style={{fontSize:11,color:"rgba(255,255,255,0.3)"}}>{t.reference_type||"manual"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="erp-card"><div className="erp-empty" style={{padding:60}}>← Select an account to view transactions</div></div>
        )}
      </div>
    </div>
  );
}
