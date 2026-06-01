"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function MyLedger() {
  return <ERPLayout title="My Ledger" active="my-ledger">{(user, currency) => <MyLedgerContent user={user} currency={currency} />}</ERPLayout>;
}

function MyLedgerContent({ user, currency: _c }: { user: any; currency: string }) {
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
  const [account, setAccount] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get all accounts, find own employee account
    fetch("/api/erp/ledger")
      .then(r => r.json())
      .then((accounts: any[]) => {
        const own = accounts.find(a => a.reference_id === user.id && a.type === "employee");
        if (own) {
          setAccount(own);
          return fetch(`/api/erp/ledger?account_id=${own.id}`).then(r => r.json());
        }
        return null;
      })
      .then(d => {
        if (d) { setTxns(d.transactions||[]); setBalance(d.balance||0); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user.id]);

  const typeColor: any = { credit:"badge-green", debit:"badge-red" };

  return (
    <div>
      {loading ? <div className="erp-empty">Loading...</div> : !account ? (
        <div className="erp-card"><div className="erp-empty">No ledger account found. Contact your administrator.</div></div>
      ) : (
        <>
          <div className="erp-card" style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
            <div>
              <div style={{fontSize:16,fontWeight:700}}>{user.name}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>Personal Ledger Account</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:"1px",textTransform:"uppercase"}}>Current Balance</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:900,color:balance>=0?"#00c864":"#ff6666"}}>{fmt(balance)}</div>
              <div style={{fontSize:11,color:balance>=0?"rgba(0,200,100,0.6)":"rgba(255,68,68,0.6)"}}>{balance>=0?"Company owes you":"You owe company"}</div>
            </div>
          </div>

          <div className="erp-card">
            <div className="erp-section-title" style={{marginBottom:14}}>Transaction History</div>
            <div className="erp-table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th><th>Reference</th></tr></thead>
                <tbody>
                  {txns.length===0 && <tr><td colSpan={5} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No transactions yet</td></tr>}
                  {txns.map((t:any)=>(
                    <tr key={t.id}>
                      <td style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>{new Date(t.created_at).toLocaleDateString("en-GB")}</td>
                      <td><span className={`badge ${typeColor[t.type]||"badge-purple"}`}>{t.type}</span></td>
                      <td style={{fontWeight:700,color:t.type==="credit"?"#00c864":"#ff6666"}}>{fmt(Number(t.amount))}</td>
                      <td style={{fontSize:12,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description||"—"}</td>
                      <td style={{fontSize:11,color:"rgba(255,255,255,0.3)"}}>{t.reference_type||"manual"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
