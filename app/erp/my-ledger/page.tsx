"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function MyLedger() {
  return <ERPLayout title="My Ledger" active="my-ledger">{(user, currency) => <MyLedgerContent user={user} currency={currency} />}</ERPLayout>;
}

function MyLedgerContent({ user, currency: _c }: { user: any; currency: string }) {
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
  const [empData, setEmpData] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [salaryRows, setSalaryRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // Get own employee data (salary)
        const emp = await fetch(`/api/erp/employees?id=${user.id}`).then(r=>r.json());
        setEmpData(emp);

        // Get ledger account and transactions
        const accounts: any[] = await fetch("/api/erp/ledger").then(r=>r.json());
        const own = accounts.find(a => Number(a.reference_id) === Number(user.id) && a.type === "employee");
        if (own) {
          setAccount(own);
          const data = await fetch(`/api/erp/ledger?account_id=${own.id}`).then(r=>r.json());
          const transactions = data.transactions || [];
          setTxns(transactions);
          setBalance(data.balance || 0);

          // Build salary rows: last 6 months
          const salary = Number(emp?.salary || 0);
          if (salary > 0) {
            const months = [];
            for (let i = 5; i >= 0; i--) {
              const d = new Date();
              d.setDate(1);
              d.setMonth(d.getMonth() - i);
              const monthStr = d.toISOString().slice(0,7);
              const label = d.toLocaleDateString("en-GB",{month:"long",year:"numeric"});
              const paid = transactions.find((t:any) => t.reference_type==="salary" && t.created_at?.startsWith(monthStr));
              months.push({ month:monthStr, label, amount:salary, paid:!!paid, txn:paid });
            }
            setSalaryRows(months);
          }
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [user.id]);

  const paidSalary = salaryRows.filter(r=>r.paid).reduce((s,r)=>s+r.amount,0);
  const pendingSalary = salaryRows.filter(r=>!r.paid).reduce((s,r)=>s+r.amount,0);
  const approvedExpenses = txns.filter(t=>t.reference_type==="expense").reduce((s:number,t:any)=>s+Number(t.amount),0);

  return (
    <div>
      {loading ? <div className="erp-empty">Loading...</div> : (
        <>
          {/* Balance Summary */}
          <div className="erp-card" style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16,marginBottom:empData?.salary>0?16:0}}>
              <div>
                <div style={{fontSize:16,fontWeight:700}}>{user.name}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>Personal Ledger — {user.role}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:"1px",textTransform:"uppercase"}}>Net Balance</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:900,color:balance>=0?"#00c864":"#ff6666"}}>{fmt(balance)}</div>
                <div style={{fontSize:11,color:balance>=0?"rgba(0,200,100,0.6)":"rgba(255,68,68,0.6)"}}>{balance>=0?"Company owes you":"You owe company"}</div>
              </div>
            </div>
            {empData?.salary>0 && (
              <div style={{display:"flex",gap:12,flexWrap:"wrap",borderTop:"1px solid rgba(139,0,255,0.1)",paddingTop:14}}>
                {[
                  {label:"Monthly Salary",val:fmt(Number(empData.salary)),color:"#bf5fff"},
                  {label:"Salary Paid (6mo)",val:fmt(paidSalary),color:"#00c864"},
                  {label:"Salary Pending",val:fmt(pendingSalary),color:pendingSalary>0?"#ff8c00":"rgba(255,255,255,0.3)"},
                  {label:"Expense Reimbursements",val:fmt(approvedExpenses),color:"#6699ff"},
                ].map(s=>(
                  <div key={s.label} style={{flex:1,minWidth:120,background:"rgba(139,0,255,0.05)",border:"1px solid rgba(139,0,255,0.12)",borderRadius:10,padding:"10px 14px"}}>
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginBottom:4}}>{s.label}</div>
                    <div style={{fontWeight:700,color:s.color,fontSize:14}}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Salary Status Table */}
          {salaryRows.length > 0 && (
            <div className="erp-card" style={{marginBottom:16}}>
              <div className="erp-section-title" style={{marginBottom:14}}>Monthly Salary Status</div>
              <div className="erp-table-wrap">
                <table>
                  <thead><tr><th>Month</th><th>Description</th><th>Amount</th><th>Status</th><th>Date Paid</th></tr></thead>
                  <tbody>
                    {salaryRows.map(r=>(
                      <tr key={r.month}>
                        <td style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>{r.month}</td>
                        <td style={{fontWeight:500}}>{r.label} Salary</td>
                        <td style={{fontWeight:700,color:"var(--pg)"}}>{fmt(r.amount)}</td>
                        <td>
                          <span className={`badge ${r.paid?"badge-green":"badge-orange"}`}>
                            {r.paid?"✅ Paid":"⏳ Pending"}
                          </span>
                        </td>
                        <td style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>
                          {r.txn ? new Date(r.txn.created_at).toLocaleDateString("en-GB") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* All Transactions */}
          <div className="erp-card">
            <div className="erp-section-title" style={{marginBottom:14}}>All Ledger Transactions</div>
            {!account ? (
              <div className="erp-empty">No ledger account found. Contact your administrator.</div>
            ) : (
              <div className="erp-table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th><th>Reference</th></tr></thead>
                  <tbody>
                    {txns.length===0 && <tr><td colSpan={5} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No transactions yet</td></tr>}
                    {txns.map((t:any)=>(
                      <tr key={t.id}>
                        <td style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>{new Date(t.created_at).toLocaleDateString("en-GB")}</td>
                        <td><span className={`badge ${t.type==="credit"?"badge-green":"badge-red"}`}>{t.type}</span></td>
                        <td style={{fontWeight:700,color:t.type==="credit"?"#00c864":"#ff6666"}}>{fmt(Number(t.amount))}</td>
                        <td style={{fontSize:12,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description||"—"}</td>
                        <td style={{fontSize:11,color:"rgba(255,255,255,0.3)"}}>{t.reference_type||"manual"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
