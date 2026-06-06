"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPLedger() {
  return (
    <ERPLayout title="Ledger" active="ledger">
      {(user) => user.role === "admin" || user.role === "manager"
        ? <LedgerContent user={user} />
        : <div style={{padding:40,textAlign:"center",color:"#888"}}>⛔ Admin / Manager access only</div>}
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

function LedgerContent({ user }: { user: any }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [selected, setSelected] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [openingBal, setOpeningBal] = useState(0);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [msg, setMsg] = useState("");

  // Add entry modal
  const [modal, setModal] = useState<"debit"|"credit"|null>(null);
  const [form, setForm] = useState({ amount:"", description:"", date:new Date().toISOString().slice(0,10), category:"Salary", payment_coa_id:"" });
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState("");

  // Edit/Delete transaction modal
  const [editTxn, setEditTxn] = useState<any>(null);
  const [editForm, setEditForm] = useState({ type:"credit", amount:"", description:"" });
  const [editSaving, setEditSaving] = useState(false);

  // P&L tab
  const [activeView, setActiveView] = useState<"ledger"|"pnl">("ledger");
  const [pnl, setPnl] = useState<any>(null);
  const [pnlLoading, setPnlLoading] = useState(false);

  // Inject Funds
  const [injectModal, setInjectModal]   = useState(false);
  const [injectForm, setInjectForm]     = useState({ amount:"", injection_type:"loan", destination_account_id:"", description:"" });
  const [injectSaving, setInjectSaving] = useState(false);
  const [assetAccounts, setAssetAccounts] = useState<any[]>([]);
  const [loanBalance, setLoanBalance]   = useState<number | null>(null);

  const loadLoanBalance = async () => {
    const d = await fetch('/api/erp/coa?balances=1&type=liability').then(r=>r.json()).catch(()=>[]);
    if (Array.isArray(d)) {
      const loan = d.find((a: any) => a.account_name === 'Zohaib Hassan Loan Account');
      setLoanBalance(loan ? Number(loan.balance ?? 0) : 0);
    }
  };

  const submitInject = async () => {
    if (!injectForm.amount || !injectForm.destination_account_id) return;
    setInjectSaving(true);
    const res = await fetch('/api/erp/ledger/inject-funds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...injectForm, admin_user_id: user.id }),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setMsg('✅ Funds injected successfully');
      setInjectModal(false);
      setInjectForm({ amount:'', injection_type:'loan', destination_account_id:'', description:'' });
      loadLoanBalance();
      if (activeView === 'pnl') loadPnl();
    } else {
      setMsg(`❌ ${res.error || 'Injection failed'}`);
    }
    setInjectSaving(false);
    setTimeout(() => setMsg(''), 5000);
  };

  useEffect(() => {
    fetch("/api/erp/employees").then(r=>r.json()).then(d=>{
      if (Array.isArray(d)) setEmployees(d.filter((e:any)=>e.active));
    }).catch(()=>{});
    fetch("/api/erp/ledger").then(r=>r.json()).then(d=>{
      if (Array.isArray(d)) setAccounts(d);
    }).catch(()=>{});
    fetch('/api/erp/coa?type=asset').then(r=>r.json()).then((d:any[]) => {
      if (Array.isArray(d)) setAssetAccounts(d);
    }).catch(()=>{});
    loadLoanBalance();
  }, []);

  const loadEmployee = async (empId: string) => {
    setSelectedEmpId(empId);
    if (!empId) { setSelected(null); setTxns([]); return; }

    const empRecord = employees.find((e: any) => String(e.id) === empId);
    const selectedRole = empRecord?.role || 'employee';

    const accsData: any[] = await fetch(
      `/api/erp/ledger?self=1&user_id=${empId}&user_role=${selectedRole}`
    ).then(r=>r.json()).catch(()=>[]);

    const acc = Array.isArray(accsData) && accsData.length ? accsData[0] : null;

    if (acc) {
      setSelected(acc);
      setOpeningBal(Number(acc.opening_balance || 0));

      const [txnData, poData] = await Promise.all([
        fetch(`/api/erp/ledger?account_id=${acc.id}`).then(r=>r.json()).catch(()=>({})),
        selectedRole === 'vendor'
          ? fetch('/api/erp/iptv/purchases').then(r=>r.json()).catch(()=>({}))
          : Promise.resolve(null),
      ]);

      let allTxns: any[] = txnData.transactions || [];
      if (selectedRole === 'vendor' && Array.isArray(poData?.orders)) {
        const vendorPOs = (poData.orders as any[]).filter((o: any) => String(o.vendor_id) === empId);
        const synthetic = vendorPOs.map((o: any) => ({
          id: `po-${o.id}`, account_id: acc.id,
          type: 'credit', amount: o.total_amount,
          description: o.vendor_description || `PO #${o.id} — ${o.server_name}`,
          reference_type: 'iptv_purchase', created_at: o.created_at,
          voucher_ref: o.voucher_ref, payroll_month: null,
        }));
        allTxns = [...allTxns, ...synthetic].sort(
          (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }
      setTxns(allTxns);
    } else if (selectedRole === 'vendor') {
      // Vendor has no ledger account yet — render purchase order history as synthetic entries
      const poData = await fetch('/api/erp/iptv/purchases').then(r=>r.json()).catch(()=>({}));
      const vendorPOs = Array.isArray(poData?.orders)
        ? (poData.orders as any[]).filter((o: any) => String(o.vendor_id) === empId)
        : [];
      setSelected({ name: empRecord?.name || empId, type: 'vendor', id: null, opening_balance: 0 });
      setOpeningBal(0);
      const synthetic = vendorPOs.map((o: any) => ({
        id: `po-${o.id}`, account_id: null,
        type: 'credit', amount: o.total_amount,
        description: o.vendor_description || `PO #${o.id} — ${o.server_name}`,
        reference_type: 'iptv_purchase', created_at: o.created_at,
        voucher_ref: o.voucher_ref, payroll_month: null,
      }));
      setTxns(synthetic.sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ));
    } else {
      setSelected({ name: empRecord?.name || empId, type: 'employee', id: null });
      setTxns([]);
      setMsg("⚠️ No ledger account found for this employee. Credit a salary to auto-create their account.");
      setTimeout(()=>setMsg(""),5000);
    }
  };

  const submit = async () => {
    if (!form.amount || !form.description || !selected || !selected.id) return;
    setModalErr("");
    setSaving(true);
    const body: any = {
      account_id: selected.id,
      type: modal === "debit" ? "debit" : "credit",
      amount: form.amount,
      description: form.description,
      reference_type: "manual_entry",
      created_by: user.id,
    };
    if (modal === "debit" && form.payment_coa_id) body.payment_coa_id = form.payment_coa_id;
    const res = await fetch("/api/erp/ledger", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(body),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setMsg(modal==="debit" ? "✅ Payment recorded — cash balance updated" : "✅ Credit entry recorded");
      setForm({ amount:"", description:"", date:new Date().toISOString().slice(0,10), category:"Salary", payment_coa_id:"" });
      setModal(null); setModalErr("");
      loadEmployee(selectedEmpId);
    } else { setModalErr(res.error||"Failed to save"); }
    setSaving(false);
    setTimeout(()=>setMsg(""),4000);
  };

  const openEdit = (t: any) => {
    setEditTxn(t);
    setEditForm({ type: t.type, amount: String(t.amount), description: t.description||"" });
  };

  const saveEdit = async () => {
    if (!editTxn || !editForm.amount) return;
    setEditSaving(true);
    const res = await fetch("/api/erp/ledger", {
      method:"PUT", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        transaction_id: editTxn.id,
        type: editForm.type,
        amount: editForm.amount,
        description: editForm.description,
        created_by: user.id,
      }),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setMsg("✅ Transaction updated");
      setEditTxn(null);
      loadEmployee(selectedEmpId);
    } else { setMsg(`❌ ${res.error||"Failed"}`); }
    setEditSaving(false);
    setTimeout(()=>setMsg(""),3000);
  };

  const loadPnl = async () => {
    setPnlLoading(true);
    const data = await fetch('/api/erp/coa?pnl=1').then(r=>r.json()).catch(()=>null);
    if (data) setPnl(data);
    setPnlLoading(false);
  };

  const deleteTxn = async (t: any) => {
    if (!confirm(`Permanently delete this entry?\n\n${t.type === "debit" ? "↑ Debit" : "↓ Credit"} ${fmt(Number(t.amount))} — ${t.description||"no description"}\n\nBalance will recalculate automatically.`)) return;
    const res = await fetch("/api/erp/ledger", {
      method:"DELETE", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ transaction_id: t.id, created_by: user.id }),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setMsg("✅ Transaction deleted — balance recalculated");
      loadEmployee(selectedEmpId);
    } else { setMsg(`❌ ${res.error||"Failed"}`); }
    setTimeout(()=>setMsg(""),3000);
  };

  const filtered = txns.filter(t => {
    // Fix 2 — payroll transactions: check payroll_month not created_at
    if (t.reference_type === 'payroll') {
      const pm = t.payroll_month || String(t.created_at||"").slice(0,7);
      // Don't filter payroll by date pickers since they use anchor month
    }
    if (filterFrom && new Date(t.created_at) < new Date(filterFrom)) return false;
    if (filterTo && new Date(t.created_at) > new Date(filterTo+"T23:59:59")) return false;
    return true;
  });
  const withBal = withRunningBalance(filtered, openingBal);
  const totalGave = filtered.filter(t=>t.type==="debit").reduce((s,t)=>s+Number(t.amount),0);
  const totalGot = filtered.filter(t=>t.type==="credit").reduce((s,t)=>s+Number(t.amount),0);
  const netBal = totalGot - totalGave;

  const emp = employees.find((e:any)=>String(e.id)===String(selectedEmpId));

  return (
    <>
      {/* Print-only header + print CSS */}
      <style>{`
        @media print {
          .erp-sidebar, .erp-hamburger, .erp-header, .erp-footer-brand,
          .no-print, .erp-btn, select, input[type="date"],
          .erp-modal-overlay { display: none !important; }
          .erp-main { margin-left: 0 !important; padding: 20px !important; }
          body { background: #fff !important; color: #111 !important; }
          .erp-card { border: 1px solid #ddd !important; box-shadow: none !important; }
          th, td { color: #111 !important; border-color: #ccc !important; }
          .print-header { display: block !important; }
        }
        .print-header { display: none; }
      `}</style>

      <div style={{paddingBottom:90}}>

      {/* ── View Tabs + Inject Funds ─────────────────────────────────────────── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:16}}>
        <div style={{display:"flex",gap:3,background:"#EBEBEB",padding:3,borderRadius:10}}>
          <button
            style={{padding:"8px 18px",borderRadius:7,border:"none",background:activeView==="ledger"?"#111111":"transparent",color:activeView==="ledger"?"#FFFFFF":"#666666",fontWeight:600,fontSize:13,cursor:"pointer",transition:"all 0.15s"}}
            onClick={()=>setActiveView("ledger")}
          >📒 Employee Ledger</button>
          <button
            style={{padding:"8px 18px",borderRadius:7,border:"none",background:activeView==="pnl"?"#111111":"transparent",color:activeView==="pnl"?"#FFFFFF":"#666666",fontWeight:600,fontSize:13,cursor:"pointer",transition:"all 0.15s"}}
            onClick={()=>{ setActiveView("pnl"); if(!pnl) loadPnl(); }}
          >📈 P&amp;L Statement</button>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          {loanBalance !== null && loanBalance > 0 && (
            <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(234,179,8,0.08)",border:"1px solid rgba(234,179,8,0.3)",borderRadius:10,padding:"7px 14px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#92400E",letterSpacing:"0.5px",textTransform:"uppercase",whiteSpace:"nowrap"}}>💳 Owed to Zohaib</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:800,color:"#92400E",whiteSpace:"nowrap"}}>Rs.&nbsp;{Math.round(loanBalance).toLocaleString()}</div>
            </div>
          )}
          <button
            onClick={()=>setInjectModal(true)}
            style={{background:"#111111",color:"#FFFFFF",border:"none",borderRadius:9,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",transition:"background 0.15s"}}
            onMouseEnter={e=>(e.currentTarget.style.background="#5B21B6")}
            onMouseLeave={e=>(e.currentTarget.style.background="#111111")}
          >➕ Inject Funds / Capital</button>
        </div>
      </div>

      {/* ── Global message (inject result, etc.) ────────────────────────────── */}
      {msg && activeView === "pnl" && (
        <div style={{marginBottom:12,padding:"10px 14px",background:msg.startsWith("✅")?"#DCFCE7":"#FEE2E2",borderRadius:10,fontSize:13,color:msg.startsWith("✅")?"#166534":"#DC2626",border:`1px solid ${msg.startsWith("✅")?"#BBF7D0":"#FECACA"}`}}>{msg}</div>
      )}

      {/* ── P&L Panel ─────────────────────────────────────────────────────────── */}
      {activeView === "pnl" && <PnLPanel pnl={pnl} loading={pnlLoading} onRefresh={loadPnl} />}

      {/* ── Employee Ledger ───────────────────────────────────────────────────── */}
      {activeView === "ledger" && <>
      {/* Employee Selector + Export button */}
      <div className="erp-card no-print" style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:11,letterSpacing:"1.5px",textTransform:"uppercase",color:"#888",marginBottom:8,fontWeight:600}}>Select Employee</div>
            <select className="erp-select" value={selectedEmpId} onChange={e=>loadEmployee(e.target.value)} style={{width:"100%",padding:"10px 14px",fontSize:14}}>
              <option value="">— Choose employee —</option>
              {employees.map((e:any)=><option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
            </select>
          </div>
          {selected?.id && (
            <button onClick={()=>window.print()} style={{background:"#5B21B6",color:"#fff",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",alignSelf:"flex-end"}}>
              📥 Export PDF / Print
            </button>
          )}
        </div>
        {selected && (
          <div style={{marginTop:10,fontSize:12,color:"#888"}}>
            Account: <strong style={{color:"#111"}}>{selected.name}</strong> · Type: <span className="badge badge-green">{selected.type}</span>
          </div>
        )}
      </div>

      {/* Print-only statement header */}
      <div className="print-header" style={{marginBottom:20,paddingBottom:14,borderBottom:"2px solid #111"}}>
        <div style={{fontSize:22,fontWeight:900,fontFamily:"serif"}}>FIRESTICK4UK — Employee Ledger Statement</div>
        <div style={{fontSize:13,color:"#444",marginTop:4}}>Employee: <strong>{selected?.name}</strong> · Generated: {new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div>
      </div>

      {msg && <div style={{marginBottom:12,padding:"10px 14px",background:msg.startsWith("✅")?"#DCFCE7":"#FEE2E2",borderRadius:10,fontSize:13,color:msg.startsWith("✅")?"#166534":"#DC2626",border:`1px solid ${msg.startsWith("✅")?"#BBF7D0":"#FECACA"}`}}>{msg}</div>}

      {!selected ? (
        <div style={{textAlign:"center",padding:"60px 20px",color:"#888",background:"#FAFAFA",borderRadius:14,border:"1px solid #E5E5E5"}}>
          <div style={{fontSize:36,marginBottom:12}}>📒</div>
          <div style={{fontWeight:600,color:"#555"}}>Select an employee above to view their ledger</div>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
            <div style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,color:"#DC2626",fontWeight:600,letterSpacing:"0.5px",marginBottom:4}}>↑ TOTAL YOU GAVE</div>
              <div style={{fontSize:18,fontWeight:800,color:"#DC2626"}}>{fmt(totalGave)}</div>
              <div style={{fontSize:10,color:"#EF4444",marginTop:2}}>Credit (Cr)</div>
            </div>
            <div style={{background:"#DCFCE7",border:"1px solid #BBF7D0",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,color:"#16A34A",fontWeight:600,letterSpacing:"0.5px",marginBottom:4}}>↓ TOTAL PAYABLE</div>
              <div style={{fontSize:18,fontWeight:800,color:"#16A34A"}}>{fmt(totalGot)}</div>
              <div style={{fontSize:10,color:"#22C55E",marginTop:2}}>Debit (Dr)</div>
            </div>
            <div style={{background:"#EDE9FE",border:"1px solid #DDD6FE",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,color:"#5B21B6",fontWeight:600,letterSpacing:"0.5px",marginBottom:4}}>⚖️ NET PAYABLE</div>
              <div style={{fontSize:18,fontWeight:800,color:netBal>=0?"#16A34A":"#DC2626"}}>{fmt(Math.abs(netBal))}</div>
              <div style={{fontSize:10,color:netBal>=0?"#16A34A":"#DC2626",marginTop:2}}>{netBal>=0?"Co. owes employee":"Employee owes co."}</div>
            </div>
          </div>

          {/* Date filter */}
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <input type="date" className="erp-input" style={{flex:1,minWidth:120,padding:"7px 10px",fontSize:12}} value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} />
            <span style={{color:"#888",fontSize:12}}>to</span>
            <input type="date" className="erp-input" style={{flex:1,minWidth:120,padding:"7px 10px",fontSize:12}} value={filterTo} onChange={e=>setFilterTo(e.target.value)} />
            {(filterFrom||filterTo)&&<button className="erp-btn erp-btn-outline erp-btn-sm" onClick={()=>{setFilterFrom("");setFilterTo("");}}>✕ Clear</button>}
          </div>

          {/* Transactions Table */}
          <div className="erp-card" style={{padding:0,overflow:"hidden"}}>
            {/* Table Header */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 80px",gap:0,background:"#F9F9F9",borderBottom:"2px solid #E5E5E5",padding:"10px 14px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#555",letterSpacing:"1px",textTransform:"uppercase"}}>Date & Details</div>
              <div style={{fontSize:11,fontWeight:700,color:"#DC2626",textAlign:"right",letterSpacing:"0.5px"}}>
                You Gave<br/><span style={{fontSize:9,opacity:0.7}}>Credit (Cr)</span>
              </div>
              <div style={{fontSize:11,fontWeight:700,color:"#16A34A",textAlign:"right",letterSpacing:"0.5px"}}>
                You Got<br/><span style={{fontSize:9,opacity:0.7}}>Debit (Dr)</span>
              </div>
              <div style={{fontSize:11,fontWeight:700,color:"#888",textAlign:"center",letterSpacing:"1px",textTransform:"uppercase"}}>Actions</div>
            </div>

            {/* Rows */}
            {withBal.length === 0 ? (
              <div style={{textAlign:"center",padding:"60px 20px",color:"#888"}}>
                <div style={{fontSize:32,marginBottom:10}}>📒</div>
                <div style={{fontWeight:600}}>No transactions yet</div>
                <div style={{fontSize:13,marginTop:4}}>Use the buttons below to add entries!</div>
              </div>
            ) : withBal.map((t:any, i:number) => (
              <div key={t.id} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 80px",gap:0,padding:"12px 14px",borderBottom:"1px solid #F5F5F5",background:i%2===0?"#FFFFFF":"#FAFAFA"}}>
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
                  {t.reference_type==="payroll"
                    ? <span style={{marginLeft:6,background:"#DCFCE7",border:"1px solid #BBF7D0",borderRadius:12,padding:"2px 8px",fontSize:10,color:"#16A34A",fontWeight:700}}>💰 payroll</span>
                    : t.reference_type && t.reference_type!=="manual_entry" && (
                      <span style={{marginLeft:6,background:"#EDE9FE",border:"1px solid #DDD6FE",borderRadius:12,padding:"2px 8px",fontSize:10,color:"#5B21B6"}}>{t.reference_type}</span>
                    )}
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
                {/* Actions */}
                <div style={{display:"flex",gap:4,alignItems:"center",justifyContent:"center",paddingTop:2}} className="no-print">
                  <button onClick={()=>openEdit(t)} title="Edit" style={{background:"#EDE9FE",border:"1px solid #DDD6FE",color:"#5B21B6",borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>✏️</button>
                  <button onClick={()=>deleteTxn(t)} title="Delete" style={{background:"#FEE2E2",border:"1px solid #FECACA",color:"#DC2626",borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑</button>
                </div>
              </div>
            ))}

            {/* Total row */}
            {withBal.length > 0 && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 80px",gap:0,padding:"12px 14px",background:"#F9F9F9",borderTop:"2px solid #E5E5E5"}}>
                <div style={{fontWeight:700,fontSize:13,color:"#111"}}>Total</div>
                <div style={{textAlign:"right",fontWeight:800,color:"#DC2626",fontSize:14}}>{fmt(totalGave)}</div>
                <div style={{textAlign:"right",fontWeight:800,color:"#16A34A",fontSize:14}}>{fmt(totalGot)}</div>
                <div/>
              </div>
            )}
          </div>
        </>
      )}

      {/* Edit Transaction Modal */}
      {editTxn && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#fff",borderRadius:16,maxWidth:420,width:"100%",padding:"28px 24px",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
            <div style={{fontWeight:700,fontSize:16,color:"#111",marginBottom:4}}>✏️ Edit Transaction</div>
            <div style={{fontSize:12,color:"#888",marginBottom:18}}>ID #{editTxn.id} · Balance will recalculate automatically</div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Type</label>
              <select className="erp-select" value={editForm.type} onChange={e=>setEditForm(f=>({...f,type:e.target.value}))} style={{width:"100%"}}>
                <option value="credit">↓ Credit (You Got)</option>
                <option value="debit">↑ Debit (You Gave)</option>
              </select>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Amount (Rs.) *</label>
              <input type="number" className="erp-input" value={editForm.amount} onChange={e=>setEditForm(f=>({...f,amount:e.target.value}))} style={{width:"100%",fontSize:16,fontWeight:700,color:editForm.type==="debit"?"#DC2626":"#16A34A"}} />
            </div>
            <div style={{marginBottom:20}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Description</label>
              <input type="text" className="erp-input" value={editForm.description} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))} style={{width:"100%"}} />
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>setEditTxn(null)} style={{background:"#F5F5F5",color:"#555",border:"none",borderRadius:9,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Cancel</button>
              <button onClick={saveEdit} disabled={editSaving||!editForm.amount} style={{background:"#5B21B6",color:"#fff",border:"none",borderRadius:9,padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer",opacity:(editSaving||!editForm.amount)?0.5:1}}>
                {editSaving?"Saving...":"💾 Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Action Buttons — hidden on print */}
      {selected && (
        <div className="no-print" style={{position:"fixed",bottom:0,left:220,right:0,display:"grid",gridTemplateColumns:"1fr 1fr",zIndex:50,boxShadow:"0 -4px 12px rgba(0,0,0,0.12)"}}>
          <button onClick={()=>setModal("debit")} style={{background:"#DC2626",color:"#fff",padding:"18px",fontSize:15,fontWeight:700,border:"none",cursor:"pointer",letterSpacing:"0.5px"}}>
            ↑ YOU GAVE (Cr)
          </button>
          <button onClick={()=>setModal("credit")} style={{background:"#16A34A",color:"#fff",padding:"18px",fontSize:15,fontWeight:700,border:"none",cursor:"pointer",letterSpacing:"0.5px"}}>
            ↓ YOU GOT (Dr)
          </button>
        </div>
      )}

      {/* Entry Modal */}
      {modal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>{setModal(null);setModalErr("");}}>
          <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:"28px 24px 36px",width:"100%",maxWidth:520}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:"#E5E5E5",borderRadius:2,margin:"0 auto 20px"}}/>
            <div style={{fontSize:18,fontWeight:700,color:modal==="debit"?"#DC2626":"#16A34A",marginBottom:4}}>
              {modal==="debit" ? "↑ Record Payment Given" : "↓ Record Amount Received"}
            </div>
            <div style={{fontSize:12,color:"#888",marginBottom:20}}>
              {emp?.name} · {modal==="debit" ? "Debit (You Gave)" : "Credit (You Got)"}
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Amount (Rs.) *</label>
              <input autoFocus type="number" className="erp-input" placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={{width:"100%",fontSize:18,fontWeight:700,color:modal==="debit"?"#DC2626":"#16A34A"}} />
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Description *</label>
              <input type="text" className="erp-input" placeholder="e.g. June salary payment" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={{width:"100%"}} />
            </div>
            {modal === "debit" && (
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>💳 Pay From Source Account *</label>
                <select className="erp-select" value={form.payment_coa_id} onChange={e=>setForm(f=>({...f,payment_coa_id:e.target.value}))} style={{width:"100%"}}>
                  <option value="">— Select cash/bank source —</option>
                  {assetAccounts.map((a:any)=>(
                    <option key={a.id} value={a.id}>{a.account_name}</option>
                  ))}
                </select>
                {form.payment_coa_id && (
                  <div style={{marginTop:6,padding:"6px 10px",background:"rgba(220,38,38,0.04)",border:"1px solid rgba(220,38,38,0.15)",borderRadius:7,fontSize:11,color:"#7F1D1D",fontFamily:"monospace"}}>
                    DR Employee Account ↑ &nbsp;·&nbsp; CR {assetAccounts.find((a:any)=>String(a.id)===form.payment_coa_id)?.account_name||"…"} ↓
                  </div>
                )}
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Date</label>
                <input type="date" className="erp-input" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{width:"100%"}} />
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Category</label>
                <select className="erp-select" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{width:"100%"}}>
                  {modal==="debit"
                    ? ["Salary","Advance","Deduction","Other"].map(c=><option key={c}>{c}</option>)
                    : ["Salary","Expense","Bonus","Other"].map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {modalErr && (
              <div style={{marginBottom:14,padding:"10px 13px",background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:9,fontSize:13,color:"#DC2626",fontWeight:500}}>{modalErr}</div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>{setModal(null);setModalErr("");}} style={{background:"#F5F5F5",color:"#555",border:"none",borderRadius:10,padding:"14px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Cancel</button>
              <button onClick={submit} disabled={saving||!form.amount||!form.description||(modal==="debit"&&!form.payment_coa_id)} style={{background:modal==="debit"?"#DC2626":"#16A34A",color:"#fff",border:"none",borderRadius:10,padding:"14px",fontSize:14,fontWeight:700,cursor:"pointer",opacity:(saving||!form.amount||!form.description||(modal==="debit"&&!form.payment_coa_id))?0.5:1}}>
                {saving ? "Saving..." : modal==="debit" ? "Record Payment" : "Record Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>}

      {/* ── Inject Funds Modal ───────────────────────────────────────────────── */}
      {injectModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setInjectModal(false)}>
          <div style={{background:"#fff",borderRadius:16,maxWidth:460,width:"100%",padding:"28px 24px",boxShadow:"0 12px 40px rgba(0,0,0,0.22)"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:17,color:"#111",marginBottom:4}}>➕ Inject Funds / Capital</div>
            <div style={{fontSize:12,color:"#888",marginBottom:20}}>Inject cash into company accounts via a director loan or sales revenue conversion</div>

            {/* Injection Purpose Toggle */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",marginBottom:8}}>Injection Purpose *</div>
              <div style={{display:"flex",gap:3,background:"#EBEBEB",padding:3,borderRadius:10}}>
                <button
                  style={{flex:1,padding:"10px 12px",borderRadius:7,border:"none",background:injectForm.injection_type==="loan"?"#111111":"transparent",color:injectForm.injection_type==="loan"?"#FFFFFF":"#666666",fontWeight:600,fontSize:12,cursor:"pointer",transition:"all 0.15s",lineHeight:1.4}}
                  onClick={()=>setInjectForm(f=>({...f,injection_type:"loan"}))}
                >🤝 Company Loan<br/><span style={{fontSize:10,opacity:0.75}}>Udhaar from Zohaib</span></button>
                <button
                  style={{flex:1,padding:"10px 12px",borderRadius:7,border:"none",background:injectForm.injection_type==="sales"?"#111111":"transparent",color:injectForm.injection_type==="sales"?"#FFFFFF":"#666666",fontWeight:600,fontSize:12,cursor:"pointer",transition:"all 0.15s",lineHeight:1.4}}
                  onClick={()=>setInjectForm(f=>({...f,injection_type:"sales"}))}
                >💰 Website Sales<br/><span style={{fontSize:10,opacity:0.75}}>PKR Revenue Conversion</span></button>
              </div>
              <div style={{marginTop:8,padding:"8px 12px",background:injectForm.injection_type==="loan"?"rgba(234,179,8,0.07)":"rgba(22,163,74,0.06)",border:`1px solid ${injectForm.injection_type==="loan"?"rgba(234,179,8,0.28)":"rgba(22,163,74,0.2)"}`,borderRadius:8,fontSize:11,color:injectForm.injection_type==="loan"?"#92400E":"#166534",fontFamily:"monospace"}}>
                {injectForm.injection_type==="loan"
                  ? "DR Cash/Bank ↑  ·  CR Zohaib Hassan Loan Account ↑ (Liability)"
                  : "DR Cash/Bank ↑  ·  CR IPTV Manual Sales Revenue ↑ (P&L Revenue)"}
              </div>
            </div>

            {/* Amount */}
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Amount (Rs.) *</label>
              <input autoFocus type="number" className="erp-input" placeholder="0.00" value={injectForm.amount} onChange={e=>setInjectForm(f=>({...f,amount:e.target.value}))} style={{width:"100%",fontSize:16,fontWeight:700}} />
            </div>

            {/* Destination */}
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Deposit Into *</label>
              <select className="erp-select" value={injectForm.destination_account_id} onChange={e=>setInjectForm(f=>({...f,destination_account_id:e.target.value}))} style={{width:"100%"}}>
                <option value="">— Select account —</option>
                {assetAccounts.map((a:any)=>(
                  <option key={a.id} value={a.id}>{a.account_name}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div style={{marginBottom:22}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:"#666",display:"block",marginBottom:6}}>Description (Optional)</label>
              <input type="text" className="erp-input" placeholder={injectForm.injection_type==="loan"?"e.g. June loan from Zohaib":"e.g. Website sales PKR conversion Jun 2026"} value={injectForm.description} onChange={e=>setInjectForm(f=>({...f,description:e.target.value}))} style={{width:"100%"}} />
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>setInjectModal(false)} style={{background:"#F5F5F5",color:"#555",border:"none",borderRadius:9,padding:"13px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Cancel</button>
              <button
                onClick={submitInject}
                disabled={injectSaving||!injectForm.amount||!injectForm.destination_account_id}
                style={{background:"#111111",color:"#fff",border:"none",borderRadius:9,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",opacity:(injectSaving||!injectForm.amount||!injectForm.destination_account_id)?0.45:1,transition:"background 0.15s"}}
                onMouseEnter={e=>{ if(!injectSaving&&injectForm.amount&&injectForm.destination_account_id) e.currentTarget.style.background="#16A34A"; }}
                onMouseLeave={e=>e.currentTarget.style.background="#111111"}
              >
                {injectSaving ? "Injecting…" : "💉 Inject Funds"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

// ── P&L Panel ─────────────────────────────────────────────────────────────────
function PnLPanel({ pnl, loading, onRefresh }: { pnl: any; loading: boolean; onRefresh: () => void }) {
  const fmt = (n: number) => `Rs. ${Math.abs(Math.round(n)).toLocaleString("en-PK")}`;

  if (loading) {
    return (
      <div style={{textAlign:"center",padding:"80px 20px",color:"#888"}}>
        <div style={{fontSize:32,marginBottom:12}}>⏳</div>
        <div style={{fontWeight:600}}>Loading P&amp;L data…</div>
      </div>
    );
  }

  if (!pnl) {
    return (
      <div style={{textAlign:"center",padding:"80px 20px",color:"#888",background:"#FAFAFA",borderRadius:14,border:"1px solid #E5E5E5"}}>
        <div style={{fontSize:36,marginBottom:12}}>📈</div>
        <div style={{fontWeight:600,color:"#555",marginBottom:12}}>Profit &amp; Loss Statement</div>
        <button onClick={onRefresh} style={{background:"#111111",color:"#fff",border:"none",borderRadius:9,padding:"12px 24px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          Load P&amp;L Report
        </button>
      </div>
    );
  }

  const net = Number(pnl.netProfit ?? 0);
  const totalRev = Number(pnl.totalRevenue ?? 0);
  const totalExp = Number(pnl.totalExpenses ?? 0);
  const netPos = net >= 0;

  return (
    <div>
      {/* Hero net profit card */}
      <div style={{
        background: netPos
          ? "linear-gradient(135deg,#052e16 0%,#166534 100%)"
          : "linear-gradient(135deg,#450a0a 0%,#991b1b 100%)",
        borderRadius:16,padding:"32px 28px",marginBottom:20,
        boxShadow:"0 8px 32px rgba(0,0,0,0.18)",position:"relative",overflow:"hidden"
      }}>
        <div style={{position:"absolute",top:-20,right:-20,fontSize:100,opacity:0.07,userSelect:"none"}}>{netPos?"📈":"📉"}</div>
        <div style={{fontSize:12,letterSpacing:"2px",textTransform:"uppercase",color:"rgba(255,255,255,0.6)",marginBottom:8,fontWeight:600}}>
          Net {netPos ? "Profit" : "Loss"}
        </div>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:42,fontWeight:900,color:"#FFFFFF",lineHeight:1,marginBottom:10}}>
          {netPos ? "" : "−"}{fmt(Math.abs(net))}
        </div>
        <div style={{display:"flex",gap:24,flexWrap:"wrap",marginTop:16}}>
          <div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.55)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:2}}>Total Revenue</div>
            <div style={{fontSize:18,fontWeight:700,color:"#4ADE80"}}>{fmt(totalRev)}</div>
          </div>
          <div style={{width:1,background:"rgba(255,255,255,0.15)"}}/>
          <div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.55)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:2}}>Total Expenses</div>
            <div style={{fontSize:18,fontWeight:700,color:"#FCA5A5"}}>{fmt(totalExp)}</div>
          </div>
        </div>
        <button onClick={onRefresh} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.12)",color:"#fff",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          ↻ Refresh
        </button>
      </div>

      {/* Revenue + Expenses side by side */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>

        {/* Revenue table */}
        <div className="erp-card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 16px",background:"rgba(22,163,74,0.06)",borderBottom:"2px solid rgba(22,163,74,0.15)"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#16A34A",letterSpacing:"1.5px",textTransform:"uppercase"}}>💰 Revenue Streams</div>
          </div>
          {(pnl.revenues || []).length === 0
            ? <div style={{padding:"28px 16px",textAlign:"center",color:"#AAA",fontSize:13}}>No revenue entries yet</div>
            : (pnl.revenues || []).map((r: any) => (
              <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 16px",borderBottom:"1px solid #F5F5F5"}}>
                <div style={{fontSize:13,color:"#333",fontWeight:500}}>{r.account_name}</div>
                <div style={{fontSize:14,fontWeight:700,color:"#16A34A"}}>{fmt(Number(r.total))}</div>
              </div>
            ))
          }
          <div style={{display:"flex",justifyContent:"space-between",padding:"12px 16px",background:"rgba(22,163,74,0.05)",borderTop:"2px solid rgba(22,163,74,0.15)"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#16A34A",letterSpacing:"0.5px",textTransform:"uppercase"}}>Total</div>
            <div style={{fontSize:15,fontWeight:800,color:"#16A34A"}}>{fmt(totalRev)}</div>
          </div>
        </div>

        {/* Expense table */}
        <div className="erp-card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 16px",background:"rgba(220,38,38,0.06)",borderBottom:"2px solid rgba(220,38,38,0.15)"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#DC2626",letterSpacing:"1.5px",textTransform:"uppercase"}}>💸 Expense Heads</div>
          </div>
          {(pnl.expenses || []).length === 0
            ? <div style={{padding:"28px 16px",textAlign:"center",color:"#AAA",fontSize:13}}>No expense entries yet</div>
            : (pnl.expenses || []).map((e: any) => (
              <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 16px",borderBottom:"1px solid #F5F5F5"}}>
                <div style={{fontSize:13,color:"#333",fontWeight:500}}>{e.account_name}</div>
                <div style={{fontSize:14,fontWeight:700,color:"#DC2626"}}>{fmt(Number(e.total))}</div>
              </div>
            ))
          }
          <div style={{display:"flex",justifyContent:"space-between",padding:"12px 16px",background:"rgba(220,38,38,0.05)",borderTop:"2px solid rgba(220,38,38,0.15)"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#DC2626",letterSpacing:"0.5px",textTransform:"uppercase"}}>Total</div>
            <div style={{fontSize:15,fontWeight:800,color:"#DC2626"}}>{fmt(totalExp)}</div>
          </div>
        </div>
      </div>

      {/* Summary footer */}
      <div className="erp-card" style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"12px 20px",background:"#F9F9F9",borderBottom:"1px solid #EEEEEE"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#555"}}>Summary</div>
        </div>
        {[
          { label:"Total Revenue",  val:totalRev,        colour:"#16A34A" },
          { label:"Total Expenses", val:totalExp,        colour:"#DC2626", minus:true },
          { label:`Net ${netPos?"Profit":"Loss"}`, val:net, colour: netPos?"#16A34A":"#DC2626", bold:true },
        ].map((row,i) => (
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 20px",borderBottom:"1px solid #F5F5F5",background:row.bold?"#F9F9F9":"#FFFFFF"}}>
            <div style={{fontSize:13,fontWeight:row.bold?700:500,color:row.bold?"#111":"#444"}}>
              {row.minus ? "−  " : ""}{row.label}
            </div>
            <div style={{fontSize:row.bold?17:14,fontWeight:row.bold?800:600,color:row.colour,fontFamily:row.bold?"'Cinzel',serif":undefined}}>
              {row.val < 0 ? "−" : ""}{fmt(Math.abs(row.val))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
