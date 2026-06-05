"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

interface Server        { id:number; server_name:string; available_credits:number; }
interface PurchaseOrder {
  id:number; server_id:number; server_name:string;
  credits_purchased:number; cost_per_credit:number; total_amount:number;
  status:'pending_payable'|'paid'; voucher_ref:string; vendor_description:string;
  vendor_id:number|null; vendor_name:string|null; created_at:string;
}
interface SaleLog { id:number; server_id:number; server_name:string; employee_id:number; employee_name:string; credits_sold:number; price_per_credit:number; total_revenue:number; voucher_ref:string; created_at:string; }

const fmt  = (n:number) => `Rs. ${Math.abs(Math.round(n)).toLocaleString("en-PK")}`;
const fmtD = (s:string) => new Date(s).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});

const SERVER_COLORS = [
  {bg:"#EDE9FE",border:"#DDD6FE",text:"#5B21B6",accent:"#7C3AED"},
  {bg:"#DCFCE7",border:"#BBF7D0",text:"#15803D",accent:"#16A34A"},
  {bg:"#FEF3C7",border:"#FDE68A",text:"#92400E",accent:"#D97706"},
  {bg:"#FEE2E2",border:"#FECACA",text:"#991B1B",accent:"#DC2626"},
  {bg:"#DBEAFE",border:"#BFDBFE",text:"#1E3A8A",accent:"#2563EB"},
];

export default function SubscriptionsHubPage() {
  return (
    <ERPLayout title="📡 Subscriptions Hub" active="subscriptions-hub">
      {(user) => user.role === "admin"
        ? <SubscriptionsHubContent user={user} />
        : <div style={{padding:40,textAlign:"center",color:"#888"}}>⛔ Admin access only</div>}
    </ERPLayout>
  );
}

function SubscriptionsHubContent({ user }: { user:any }) {
  const [servers,       setServers]       = useState<Server[]>([]);
  const [orders,        setOrders]        = useState<PurchaseOrder[]>([]);
  const [salesLogs,     setSalesLogs]     = useState<SaleLog[]>([]);
  const [employees,     setEmployees]     = useState<any[]>([]);
  const [vendors,       setVendors]       = useState<any[]>([]);
  const [assetAccounts, setAssetAccounts] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  // ── Purchase form ──────────────────────────────────────────────────────────
  const [pForm, setPForm] = useState({ server_id:"", credits_purchased:"", cost_per_credit:"", vendor_description:"", vendor_id:"" });
  const [pSaving, setPSaving] = useState(false);

  // ── Sales form ─────────────────────────────────────────────────────────────
  const [sForm, setSForm] = useState({ server_id:"", employee_id:"", credits_sold:"", price_per_credit:"", destination_account_id:"" });
  const [sSaving, setSSaving] = useState(false);
  const [sErr,    setSErr]    = useState("");

  // ── Pay order modal ────────────────────────────────────────────────────────
  const [payingOrder, setPayingOrder] = useState<PurchaseOrder|null>(null);
  const [payCoaId,    setPayCoaId]    = useState("");
  const [paySaving,   setPaySaving]   = useState(false);
  const [payErr,      setPayErr]      = useState("");

  // ── Edit order modal ───────────────────────────────────────────────────────
  const [editOrder,   setEditOrder]   = useState<PurchaseOrder|null>(null);
  const [editForm,    setEditForm]    = useState({ credits_purchased:"", cost_per_credit:"", vendor_id:"", vendor_description:"" });
  const [editSaving,  setEditSaving]  = useState(false);
  const [editErr,     setEditErr]     = useState("");

  // ── Active table view ──────────────────────────────────────────────────────
  const [tableView, setTableView] = useState<"orders"|"sales">("orders");

  const load = async () => {
    const [inv, sl, emps, coa] = await Promise.all([
      fetch('/api/erp/iptv/purchases').then(r=>r.json()).catch(()=>({servers:[],orders:[]})),
      fetch('/api/erp/iptv/sales').then(r=>r.json()).catch(()=>({logs:[]})),
      fetch('/api/erp/employees').then(r=>r.json()).catch(()=>[]),
      fetch('/api/erp/coa?type=asset').then(r=>r.json()).catch(()=>[]),
    ]);
    setServers(inv.servers||[]);
    setOrders(inv.orders||[]);
    setSalesLogs(sl.logs||[]);
    const allEmps = Array.isArray(emps) ? emps : [];
    setEmployees(allEmps.filter((e:any) => e.active && e.role !== 'vendor'));
    setVendors(allEmps.filter((e:any) => e.role === 'vendor'));
    if (Array.isArray(coa)) setAssetAccounts(coa);
  };

  useEffect(()=>{ load(); },[]);

  const flash = (m:string) => { setMsg(m); setTimeout(()=>setMsg(""),4500); };

  // ── Computed totals ────────────────────────────────────────────────────────
  const pTotal = (() => {
    const c=parseFloat(pForm.credits_purchased), p=parseFloat(pForm.cost_per_credit);
    return (isNaN(c)||isNaN(p)||c<=0||p<=0) ? null : Math.round(c*p);
  })();

  const sTotal = (() => {
    const c=parseFloat(sForm.credits_sold), p=parseFloat(sForm.price_per_credit);
    return (isNaN(c)||isNaN(p)||c<=0||p<=0) ? null : Math.round(c*p);
  })();

  const editTotal = (() => {
    const c=parseFloat(editForm.credits_purchased), p=parseFloat(editForm.cost_per_credit);
    return (isNaN(c)||isNaN(p)||c<=0||p<=0) ? null : Math.round(c*p);
  })();

  const selectedSaleServer = servers.find(s=>String(s.id)===sForm.server_id);

  // ── Actions ────────────────────────────────────────────────────────────────
  const submitPurchase = async () => {
    if (!pForm.server_id||!pForm.credits_purchased||!pForm.cost_per_credit) return;
    setPSaving(true);
    const res = await fetch('/api/erp/iptv/purchases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pForm)}).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      flash(`✅ Payable recorded — ${fmt(res.totalAmount)} due (${res.voucherRef})`);
      setPForm({server_id:'',credits_purchased:'',cost_per_credit:'',vendor_description:'',vendor_id:''});
      load();
    } else { flash(`❌ ${res.error||'Failed to record'}`); }
    setPSaving(false);
  };

  const submitSale = async () => {
    if (!sForm.server_id||!sForm.employee_id||!sForm.credits_sold||!sForm.price_per_credit||!sForm.destination_account_id) return;
    setSSaving(true); setSErr('');
    const res = await fetch('/api/erp/iptv/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sForm)}).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      flash(`✅ Sale dispatched — ${fmt(res.totalRevenue)} revenue booked (${res.voucherRef})`);
      setSForm({server_id:'',employee_id:'',credits_sold:'',price_per_credit:'',destination_account_id:''});
      setSErr(''); setTableView('sales'); load();
    } else { setSErr(res.error||'Failed to process sale'); }
    setSSaving(false);
  };

  const submitPay = async () => {
    if (!payingOrder) return;
    setPaySaving(true); setPayErr('');
    const res = await fetch('/api/erp/iptv/purchases',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:payingOrder.id,payment_coa_id:payCoaId})}).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      flash(`✅ Payment settled — ${payingOrder.voucher_ref} closed`);
      setPayingOrder(null); setPayCoaId(''); setPayErr('');
      load();
    } else { setPayErr(res.error||'Payment failed'); }
    setPaySaving(false);
  };

  const submitEdit = async () => {
    if (!editOrder) return;
    setEditSaving(true); setEditErr('');
    const res = await fetch('/api/erp/iptv/purchases',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      id: editOrder.id,
      credits_purchased: editForm.credits_purchased || undefined,
      cost_per_credit:   editForm.cost_per_credit   || undefined,
      vendor_id:         editForm.vendor_id          || null,
      vendor_description: editForm.vendor_description,
    })}).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      flash(`✅ Order #${editOrder.id} updated`);
      setEditOrder(null); setEditErr(''); load();
    } else { setEditErr(res.error||'Update failed'); }
    setEditSaving(false);
  };

  const submitDelete = async (order: PurchaseOrder) => {
    const warn = order.status === 'paid'
      ? ' This will also reverse the payment entry from the ledger.'
      : ' This will reverse the payable entry from the ledger.';
    if (!window.confirm(`Delete PO #${order.id} (${order.server_name} — ${fmt(Number(order.total_amount))})?${warn}`)) return;
    const res = await fetch(`/api/erp/iptv/purchases?id=${order.id}`,{method:'DELETE'}).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      flash(`✅ Order #${order.id} deleted — ledger entries reversed`);
      load();
    } else { flash(`❌ ${res.error||'Delete failed'}`); }
  };

  const pendingCount = orders.filter(o=>o.status==='pending_payable').length;
  const totalRevenue = salesLogs.reduce((s,l)=>s+Number(l.total_revenue),0);
  const totalPending = orders.filter(o=>o.status==='pending_payable').reduce((s,o)=>s+Number(o.total_amount),0);

  return (
    <div style={{paddingBottom:60}}>

      {msg && (
        <div style={{marginBottom:14,padding:"10px 14px",background:msg.startsWith("✅")?"#DCFCE7":"#FEE2E2",border:`1px solid ${msg.startsWith("✅")?"#BBF7D0":"#FECACA"}`,borderRadius:10,fontSize:13,color:msg.startsWith("✅")?"#166534":"#DC2626",fontWeight:500}}>
          {msg}
        </div>
      )}

      {/* ── LIVE INVENTORY CHIPS ──────────────────────────────────────────────── */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,letterSpacing:"2px",textTransform:"uppercase",color:"#888",marginBottom:10,fontWeight:600}}>Live Credit Inventory</div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          {servers.map((s,i)=>{
            const c=SERVER_COLORS[i%SERVER_COLORS.length];
            const low = s.available_credits < 20;
            return (
              <div key={s.id} style={{background:c.bg,border:`1px solid ${low?"#FECACA":c.border}`,borderRadius:14,padding:"14px 20px",minWidth:148,flex:"1 1 135px",position:"relative",overflow:"hidden"}}>
                {low && <div style={{position:"absolute",top:7,right:9,fontSize:10,fontWeight:700,color:"#DC2626",letterSpacing:"0.5px"}}>LOW</div>}
                <div style={{fontSize:10,fontWeight:700,color:c.text,letterSpacing:"1.2px",textTransform:"uppercase",marginBottom:6}}>📡 {s.server_name}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:30,fontWeight:900,color:low?"#DC2626":c.accent,lineHeight:1,marginBottom:3}}>
                  {s.available_credits.toLocaleString()}
                </div>
                <div style={{fontSize:10,color:c.text,opacity:0.65}}>credits in stock</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SUMMARY STRIP ─────────────────────────────────────────────────────── */}
      <div className="erp-stat-grid" style={{marginBottom:22}}>
        <div className="erp-stat">
          <div className="erp-stat-icon">📦</div>
          <div className="erp-stat-val">{orders.length}</div>
          <div className="erp-stat-label">Total Purchase Orders</div>
        </div>
        <div className="erp-stat">
          <div className="erp-stat-icon">⏳</div>
          <div className="erp-stat-val" style={{color:pendingCount>0?"#D97706":"#16A34A"}}>{pendingCount}</div>
          <div className="erp-stat-label">Pending Payables</div>
        </div>
        <div className="erp-stat">
          <div className="erp-stat-icon">💸</div>
          <div className="erp-stat-val" style={{color:totalPending>0?"#DC2626":"#16A34A",fontSize:pendingCount>0?18:26}}>{totalPending>0?fmt(totalPending):"—"}</div>
          <div className="erp-stat-label">Outstanding Due</div>
        </div>
        <div className="erp-stat">
          <div className="erp-stat-icon">💰</div>
          <div className="erp-stat-val" style={{color:"#16A34A",fontSize:totalRevenue>0?18:26}}>{totalRevenue>0?fmt(totalRevenue):"—"}</div>
          <div className="erp-stat-label">Total Sales Revenue</div>
        </div>
        <div className="erp-stat">
          <div className="erp-stat-icon">📊</div>
          <div className="erp-stat-val">{salesLogs.length}</div>
          <div className="erp-stat-label">Sales Transactions</div>
        </div>
      </div>

      {/* ── FORMS GRID ────────────────────────────────────────────────────────── */}
      <div className="erp-grid-2" style={{marginBottom:24,alignItems:"start"}}>

        {/* PURCHASE FORM */}
        <div className="erp-card">
          <div style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,color:"#111",marginBottom:3}}>📦 Record Vendor Payable</div>
          <div style={{fontSize:12,color:"#888",marginBottom:18}}>Register a bulk credit purchase from a supplier</div>

          <div className="erp-field">
            <label>Server / Provider *</label>
            <select className="erp-select" value={pForm.server_id} onChange={e=>setPForm(f=>({...f,server_id:e.target.value}))}>
              <option value="">— Select server —</option>
              {servers.map(s=><option key={s.id} value={s.id}>{s.server_name} ({s.available_credits.toLocaleString()} in stock)</option>)}
            </select>
          </div>

          <div className="erp-field">
            <label>Vendor (Optional)</label>
            <select className="erp-select" value={pForm.vendor_id} onChange={e=>setPForm(f=>({...f,vendor_id:e.target.value}))}>
              <option value="">— No vendor assigned —</option>
              {vendors.length === 0
                ? <option disabled value="">No vendor accounts registered</option>
                : vendors.map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          <div className="erp-grid-2">
            <div className="erp-field">
              <label>Credits to Buy *</label>
              <input type="number" className="erp-input" placeholder="e.g. 500" min="1" value={pForm.credits_purchased} onChange={e=>setPForm(f=>({...f,credits_purchased:e.target.value}))} />
            </div>
            <div className="erp-field">
              <label>Cost / Credit (Rs.) *</label>
              <input type="number" className="erp-input" step="0.01" placeholder="e.g. 340" min="0.01" value={pForm.cost_per_credit} onChange={e=>setPForm(f=>({...f,cost_per_credit:e.target.value}))} />
            </div>
          </div>

          {pTotal !== null && (
            <div style={{marginBottom:14,padding:"10px 14px",background:"rgba(91,33,182,0.05)",border:"1px solid rgba(91,33,182,0.18)",borderRadius:9,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:"#5B21B6",fontWeight:600}}>Total Payable</span>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:19,fontWeight:900,color:"#5B21B6"}}>{fmt(pTotal)}</span>
            </div>
          )}

          <div className="erp-field">
            <label>Vendor Note (Optional)</label>
            <input type="text" className="erp-input" placeholder="e.g. June batch from Opplex reseller" value={pForm.vendor_description} onChange={e=>setPForm(f=>({...f,vendor_description:e.target.value}))} />
          </div>

          <div style={{marginBottom:14,padding:"7px 11px",background:"rgba(220,38,38,0.04)",border:"1px solid rgba(220,38,38,0.12)",borderRadius:7,fontSize:11,color:"#7F1D1D",fontFamily:"monospace"}}>
            DR IPTV Credit Purchases (Expense ↑) &nbsp;·&nbsp; CR IPTV Vendor Payable (Liability ↑)
          </div>

          <button
            onClick={submitPurchase}
            disabled={pSaving||!pForm.server_id||!pForm.credits_purchased||!pForm.cost_per_credit}
            className="erp-btn erp-btn-primary"
            style={{width:"100%",padding:"12px",fontSize:14,opacity:(pSaving||!pForm.server_id||!pForm.credits_purchased||!pForm.cost_per_credit)?0.45:1,transition:"opacity 0.15s"}}
          >
            {pSaving ? "Recording…" : "📦 Record Vendor Payable"}
          </button>
        </div>

        {/* SALES FORM */}
        <div className="erp-card">
          <div style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,color:"#111",marginBottom:3}}>💸 Staff Sales Dispatch</div>
          <div style={{fontSize:12,color:"#888",marginBottom:18}}>Log a credit sale and auto-post revenue to the ledger</div>

          <div className="erp-grid-2" style={{marginBottom:0}}>
            <div className="erp-field">
              <label>IPTV Server *</label>
              <select className="erp-select" value={sForm.server_id} onChange={e=>setSForm(f=>({...f,server_id:e.target.value}))}>
                <option value="">— Server —</option>
                {servers.map(s=><option key={s.id} value={s.id}>{s.server_name} ({s.available_credits})</option>)}
              </select>
            </div>
            <div className="erp-field">
              <label>Sales Agent *</label>
              <select className="erp-select" value={sForm.employee_id} onChange={e=>setSForm(f=>({...f,employee_id:e.target.value}))}>
                <option value="">— Employee —</option>
                {employees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>

          <div className="erp-grid-2" style={{marginBottom:0}}>
            <div className="erp-field">
              <label>Credits Sold *</label>
              <input type="number" className="erp-input" placeholder="e.g. 10" min="1" value={sForm.credits_sold} onChange={e=>setSForm(f=>({...f,credits_sold:e.target.value}))} />
            </div>
            <div className="erp-field">
              <label>Sale Price / Credit (Rs.) *</label>
              <input type="number" className="erp-input" step="0.01" placeholder="e.g. 500" min="0.01" value={sForm.price_per_credit} onChange={e=>setSForm(f=>({...f,price_per_credit:e.target.value}))} />
            </div>
          </div>

          <div className="erp-field">
            <label>💳 Cash Destination *</label>
            <select className="erp-select" value={sForm.destination_account_id} onChange={e=>setSForm(f=>({...f,destination_account_id:e.target.value}))}>
              <option value="">— Cash In Hand or Main Bank —</option>
              {assetAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.account_name}</option>)}
            </select>
          </div>

          {sTotal !== null && sForm.destination_account_id && (
            <div style={{marginBottom:14,padding:"12px 14px",background:"rgba(22,163,74,0.05)",border:"1px solid rgba(22,163,74,0.2)",borderRadius:9}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div>
                  <div style={{fontSize:10,letterSpacing:"1px",color:"#15803D",textTransform:"uppercase",fontWeight:600}}>Revenue Projection</div>
                  {selectedSaleServer && (
                    <div style={{fontSize:10,color:"#888",marginTop:2}}>
                      {selectedSaleServer.server_name}: {selectedSaleServer.available_credits} → {selectedSaleServer.available_credits - (parseInt(sForm.credits_sold)||0)} credits after sale
                    </div>
                  )}
                </div>
                <span style={{fontFamily:"'Cinzel',serif",fontSize:19,fontWeight:900,color:"#15803D"}}>{fmt(sTotal)}</span>
              </div>
              <div style={{fontSize:11,color:"#166534",fontFamily:"monospace"}}>
                DR {assetAccounts.find((a:any)=>String(a.id)===sForm.destination_account_id)?.account_name||"…"} ↑ &nbsp;·&nbsp; CR IPTV Manual Sales Revenue ↑
              </div>
            </div>
          )}

          {sErr && (
            <div style={{marginBottom:12,padding:"10px 13px",background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:9,fontSize:13,color:"#DC2626",fontWeight:500}}>{sErr}</div>
          )}

          <div style={{marginBottom:14,padding:"7px 11px",background:"rgba(22,163,74,0.04)",border:"1px solid rgba(22,163,74,0.14)",borderRadius:7,fontSize:11,color:"#14532D",fontFamily:"monospace"}}>
            Credits deducted instantly · Revenue auto-posted to P&amp;L · Balance guard active
          </div>

          <button
            onClick={submitSale}
            disabled={sSaving||!sForm.server_id||!sForm.employee_id||!sForm.credits_sold||!sForm.price_per_credit||!sForm.destination_account_id}
            style={{width:"100%",background:"#16A34A",color:"#fff",border:"none",borderRadius:9,padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
              opacity:(sSaving||!sForm.server_id||!sForm.employee_id||!sForm.credits_sold||!sForm.price_per_credit||!sForm.destination_account_id)?0.45:1,transition:"opacity 0.15s"}}
          >
            {sSaving ? "Processing…" : "💸 Dispatch Sale & Book Revenue"}
          </button>
        </div>
      </div>

      {/* ── TABLES ────────────────────────────────────────────────────────────── */}
      <div className="erp-card" style={{padding:0,overflow:"hidden"}}>
        {/* Tab bar */}
        <div style={{display:"flex",borderBottom:"2px solid #E5E5E5",background:"#F9F9F9"}}>
          <button
            onClick={()=>setTableView("orders")}
            style={{padding:"13px 20px",border:"none",background:"transparent",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer",
              color:tableView==="orders"?"#5B21B6":"#888",borderBottom:tableView==="orders"?"3px solid #5B21B6":"3px solid transparent",
              marginBottom:-2,transition:"color 0.15s"}}
          >
            📋 Purchase Orders {pendingCount>0&&<span style={{background:"#FEF3C7",border:"1px solid #FDE68A",color:"#92400E",borderRadius:10,padding:"1px 7px",fontSize:10,marginLeft:5,fontWeight:700}}>{pendingCount} pending</span>}
          </button>
          <button
            onClick={()=>setTableView("sales")}
            style={{padding:"13px 20px",border:"none",background:"transparent",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer",
              color:tableView==="sales"?"#16A34A":"#888",borderBottom:tableView==="sales"?"3px solid #16A34A":"3px solid transparent",
              marginBottom:-2,transition:"color 0.15s"}}
          >
            📊 Sales Log &nbsp;<span style={{fontSize:11,color:"#888",fontWeight:500}}>({salesLogs.length})</span>
          </button>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:16}}>
            {tableView==="sales"&&totalRevenue>0&&<span style={{fontSize:12,color:"#16A34A",fontWeight:700}}>{fmt(totalRevenue)} total</span>}
            {tableView==="orders"&&totalPending>0&&<span style={{fontSize:12,color:"#D97706",fontWeight:700}}>{fmt(totalPending)} outstanding</span>}
          </div>
        </div>

        {/* Purchase orders table */}
        {tableView==="orders" && (
          orders.length===0
            ? <div className="erp-empty"><div style={{fontSize:36,marginBottom:10}}>📦</div>No purchase orders yet — record a vendor payable above</div>
            : <div className="erp-table-wrap">
                <table>
                  <thead><tr>
                    <th>Date</th><th>Server</th><th>Vendor</th><th>Credits</th>
                    <th>Rate</th><th>Total</th><th>Status</th><th>Voucher</th><th>Action</th>
                  </tr></thead>
                  <tbody>
                    {orders.map(o=>(
                      <tr key={o.id}>
                        <td style={{color:"#888",fontSize:12}}>{fmtD(o.created_at)}</td>
                        <td style={{fontWeight:600}}>{o.server_name}</td>
                        <td style={{color:o.vendor_name?"#333":"#BBB",fontSize:12}}>{o.vendor_name||"—"}</td>
                        <td style={{fontWeight:700,color:"#5B21B6"}}>{Number(o.credits_purchased).toLocaleString()}</td>
                        <td style={{color:"#888"}}>Rs. {Number(o.cost_per_credit).toLocaleString()}</td>
                        <td style={{fontWeight:700}}>{fmt(Number(o.total_amount))}</td>
                        <td>
                          {o.status==="paid"
                            ? <span className="badge badge-green">✓ Paid</span>
                            : <span className="badge badge-orange">⏳ Due</span>}
                        </td>
                        <td style={{fontFamily:"monospace",fontSize:10,color:"#AAA"}}>{o.voucher_ref}</td>
                        <td>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            {o.status==="pending_payable" && (
                              <button
                                onClick={()=>{setPayingOrder(o);setPayCoaId('');setPayErr('');}}
                                style={{background:"#DCFCE7",border:"1px solid #BBF7D0",color:"#166534",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}
                              >💳 Pay</button>
                            )}
                            {o.status==="pending_payable" && (
                              <button
                                onClick={()=>{
                                  setEditOrder(o);
                                  setEditForm({credits_purchased:String(o.credits_purchased),cost_per_credit:String(o.cost_per_credit),vendor_id:o.vendor_id?String(o.vendor_id):'',vendor_description:o.vendor_description||''});
                                  setEditErr('');
                                }}
                                style={{background:"#EDE9FE",border:"1px solid #DDD6FE",color:"#5B21B6",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}
                              >✏️ Edit</button>
                            )}
                            <button
                              onClick={()=>submitDelete(o)}
                              style={{background:"#FEE2E2",border:"1px solid #FECACA",color:"#DC2626",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}
                            >🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        )}

        {/* Sales log table */}
        {tableView==="sales" && (
          salesLogs.length===0
            ? <div className="erp-empty"><div style={{fontSize:36,marginBottom:10}}>📊</div>No sales recorded yet — use the dispatch panel above</div>
            : <div className="erp-table-wrap">
                <table>
                  <thead><tr>
                    <th>Date</th><th>Server</th><th>Agent</th>
                    <th>Credits</th><th>Price/Credit</th><th>Revenue</th><th>Voucher</th>
                  </tr></thead>
                  <tbody>
                    {salesLogs.map(l=>(
                      <tr key={l.id}>
                        <td style={{color:"#888",fontSize:12}}>{fmtD(l.created_at)}</td>
                        <td style={{fontWeight:600}}>{l.server_name}</td>
                        <td>{l.employee_name}</td>
                        <td style={{fontWeight:700,color:"#DC2626"}}>{Number(l.credits_sold).toLocaleString()}</td>
                        <td style={{color:"#888"}}>Rs. {Number(l.price_per_credit).toLocaleString()}</td>
                        <td style={{fontWeight:700,color:"#16A34A"}}>{fmt(Number(l.total_revenue))}</td>
                        <td style={{fontFamily:"monospace",fontSize:10,color:"#AAA"}}>{l.voucher_ref}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        )}
      </div>

      {/* ── PAY ORDER MODAL ────────────────────────────────────────────────────── */}
      {payingOrder && (
        <div className="erp-modal-overlay" onClick={()=>{setPayingOrder(null);setPayErr('');}}>
          <div className="erp-modal" onClick={e=>e.stopPropagation()}>
            <div className="erp-modal-title">💳 Settle Vendor Payable</div>

            <div style={{marginBottom:18,padding:"14px 16px",background:"#F9F9F9",border:"1px solid #E5E5E5",borderRadius:10}}>
              <div style={{fontSize:11,color:"#888",marginBottom:4}}>Order #{payingOrder.id} · {payingOrder.server_name} · {fmtD(payingOrder.created_at)}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:24,fontWeight:900,color:"#5B21B6"}}>{fmt(Number(payingOrder.total_amount))}</div>
              <div style={{fontSize:10,color:"#AAA",marginTop:4,fontFamily:"monospace"}}>{payingOrder.voucher_ref}</div>
              {payingOrder.vendor_name && <div style={{fontSize:12,color:"#5B21B6",marginTop:5,fontWeight:600}}>Vendor: {payingOrder.vendor_name}</div>}
              {payingOrder.vendor_description && <div style={{fontSize:12,color:"#666",marginTop:3}}>{payingOrder.vendor_description}</div>}
            </div>

            <div className="erp-field">
              <label>💳 Pay From Account *</label>
              <select className="erp-select" value={payCoaId} onChange={e=>{setPayCoaId(e.target.value);setPayErr('');}}>
                <option value="">— Select cash / bank source —</option>
                {assetAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.account_name}</option>)}
              </select>
            </div>

            {payCoaId && (
              <div style={{marginBottom:14,padding:"7px 11px",background:"rgba(220,38,38,0.04)",border:"1px solid rgba(220,38,38,0.12)",borderRadius:7,fontSize:11,color:"#7F1D1D",fontFamily:"monospace"}}>
                DR IPTV Vendor Payable (Liability ↓) &nbsp;·&nbsp; CR {assetAccounts.find((a:any)=>String(a.id)===payCoaId)?.account_name||"…"} (Asset ↓)
              </div>
            )}

            {payErr && (
              <div style={{marginBottom:12,padding:"10px 13px",background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:9,fontSize:13,color:"#DC2626",fontWeight:500}}>{payErr}</div>
            )}

            <div className="erp-modal-actions">
              <button onClick={()=>{setPayingOrder(null);setPayErr('');}} className="erp-btn erp-btn-outline">Cancel</button>
              <button
                onClick={submitPay}
                disabled={paySaving||!payCoaId}
                style={{background:"#16A34A",color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:(paySaving||!payCoaId)?0.5:1}}
              >
                {paySaving?"Processing…":"✓ Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT ORDER MODAL ───────────────────────────────────────────────────── */}
      {editOrder && (
        <div className="erp-modal-overlay" onClick={()=>{setEditOrder(null);setEditErr('');}}>
          <div className="erp-modal" onClick={e=>e.stopPropagation()}>
            <div className="erp-modal-title">✏️ Edit Purchase Order</div>

            <div style={{marginBottom:18,padding:"12px 14px",background:"#F9F9F9",border:"1px solid #E5E5E5",borderRadius:10}}>
              <div style={{fontSize:11,color:"#888"}}>PO #{editOrder.id} · {editOrder.server_name}</div>
              <div style={{fontSize:10,color:"#AAA",marginTop:3,fontFamily:"monospace"}}>{editOrder.voucher_ref}</div>
            </div>

            <div className="erp-grid-2">
              <div className="erp-field">
                <label>Credits Purchased *</label>
                <input type="number" className="erp-input" min="1" value={editForm.credits_purchased} onChange={e=>setEditForm(f=>({...f,credits_purchased:e.target.value}))} />
              </div>
              <div className="erp-field">
                <label>Cost / Credit (Rs.) *</label>
                <input type="number" className="erp-input" step="0.01" min="0.01" value={editForm.cost_per_credit} onChange={e=>setEditForm(f=>({...f,cost_per_credit:e.target.value}))} />
              </div>
            </div>

            {editTotal !== null && (
              <div style={{marginBottom:14,padding:"10px 14px",background:"rgba(91,33,182,0.05)",border:"1px solid rgba(91,33,182,0.18)",borderRadius:9,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,color:"#5B21B6",fontWeight:600}}>New Total</span>
                <span style={{fontFamily:"'Cinzel',serif",fontSize:19,fontWeight:900,color:"#5B21B6"}}>{fmt(editTotal)}</span>
              </div>
            )}

            <div className="erp-field">
              <label>Vendor (Optional)</label>
              <select className="erp-select" value={editForm.vendor_id} onChange={e=>setEditForm(f=>({...f,vendor_id:e.target.value}))}>
                <option value="">— No vendor assigned —</option>
                {vendors.map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>

            <div className="erp-field">
              <label>Vendor Note</label>
              <input type="text" className="erp-input" value={editForm.vendor_description} onChange={e=>setEditForm(f=>({...f,vendor_description:e.target.value}))} />
            </div>

            {editErr && (
              <div style={{marginBottom:12,padding:"10px 13px",background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:9,fontSize:13,color:"#DC2626",fontWeight:500}}>{editErr}</div>
            )}

            <div className="erp-modal-actions">
              <button onClick={()=>{setEditOrder(null);setEditErr('');}} className="erp-btn erp-btn-outline">Cancel</button>
              <button
                onClick={submitEdit}
                disabled={editSaving||!editForm.credits_purchased||!editForm.cost_per_credit}
                style={{background:"#5B21B6",color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:(editSaving||!editForm.credits_purchased||!editForm.cost_per_credit)?0.5:1}}
              >
                {editSaving?"Saving…":"✓ Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
