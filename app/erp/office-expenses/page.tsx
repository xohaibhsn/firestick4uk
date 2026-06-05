"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function OfficeExpenses() {
  return <ERPLayout title="Office Expenses" active="office-expenses">{(user, currency) => <OEContent user={user} currency={currency} />}</ERPLayout>;
}

const CATEGORIES = [
  { value:"Rent",                         icon:"🏢" },
  { value:"Utilities",                    icon:"💡" },
  { value:"Stationary",                   icon:"🖨️" },
  { value:"Kitchen",                      icon:"🍽️" },
  { value:"Transport",                    icon:"🚗" },
  { value:"Maintenance",                  icon:"🔧" },
  { value:"Supplies",                     icon:"📦" },
  { value:"Building Maintenance Charges", icon:"🏗️" },
  { value:"Online Subscriptions",         icon:"🌐" },
  { value:"Miscellaneous",                icon:"💼" },
];
const catIcon = (c: string) => CATEGORIES.find(x => x.value === c)?.icon || "💼";

function OEContent({ user, currency: _c }: { user: any; currency: string }) {
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
  const isAdmin = user.role === "admin";
  const today = new Date().toISOString().slice(0, 10);
  const curMonth = new Date().toISOString().slice(0, 7);

  const [activeTab, setActiveTab] = useState<"paid" | "due">("paid");
  const [expenses, setExpenses] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ categories: [], total: 0 });
  const [filterMonth, setFilterMonth] = useState(curMonth);
  const [filterCat, setFilterCat] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editModal, setEditModal] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [varAmounts, setVarAmounts] = useState<Record<number, string>>({});
  const [markingPaid, setMarkingPaid] = useState<number | null>(null);

  const initForm = {
    date: today, category: "Rent", description: "", amount: "",
    paid_by: user.name, receipt_path: "", notes: "",
    expense_type: "one_time", due_date: "",
  };
  const [form, setForm] = useState(initForm);

  const load = () => {
    let url = `/api/erp/office-expenses?month=${filterMonth}`;
    if (filterCat) url += `&category=${encodeURIComponent(filterCat)}`;
    fetch(url).then(r => r.json()).then(d => setExpenses(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`/api/erp/office-expenses?summary=1&month=${filterMonth}`).then(r => r.json()).then(d => setSummary(d || { categories: [], total: 0 })).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const uploadReceipt = async (file: File, target: "form" | "edit") => {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
      const data = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: base64, name: file.name }) }).then(r => r.json());
      if (data.path) {
        if (target === "edit") setEditModal((m: any) => ({ ...m, receipt_path: data.path }));
        else setForm(f => ({ ...f, receipt_path: data.path }));
      }
    } catch {}
    setUploading(false);
  };

  const handleTypeChange = (et: string) => setForm(f => ({ ...f, expense_type: et, amount: et === "recurring_variable" ? "0" : f.amount }));

  const submit = async () => {
    if (!form.amount && form.expense_type !== "recurring_variable") { setMsg("❌ Amount required"); return; }
    const res = await fetch("/api/erp/office-expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: form.expense_type === "recurring_variable" ? 0 : form.amount, added_by: user.name }),
    }).then(r => r.json()).catch(() => ({}));
    if (res.success) { setMsg("✅ Saved"); setForm(initForm); setShowForm(false); load(); }
    else setMsg(`❌ ${res.error || "Failed"}`);
  };

  const saveEdit = async () => {
    const res = await fetch("/api/erp/office-expenses", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editModal) }).then(r => r.json()).catch(() => ({}));
    if (res.success) { setEditModal(null); load(); }
  };

  const del = async (id: number) => {
    if (!confirm("Delete this expense?")) return;
    const res = await fetch(`/api/erp/office-expenses?id=${id}`, { method: "DELETE" })
      .then(r => r.json()).catch(() => ({}));
    if (res.success) {
      // Instant local removal — no re-fetch so the generation hook cannot
      // immediately re-insert a just-deleted due instance.
      setExpenses(prev => prev.filter(e => e.id !== id));
    }
  };

  const markPaid = async (expense: any) => {
    const finalAmount = expense.expense_type === "recurring_variable"
      ? Number(varAmounts[expense.id] || 0)
      : Number(expense.amount);
    if (expense.expense_type === "recurring_variable" && !(varAmounts[expense.id])) {
      alert("Enter the final amount before marking as paid."); return;
    }
    setMarkingPaid(expense.id);
    const res = await fetch("/api/erp/office-expenses", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: expense.id, amount: finalAmount, paid_by: user.name, mark_paid: true, paid_by_user_id: user.id, category: expense.category, description: expense.description }),
    }).then(r => r.json()).catch(() => ({}));
    setMarkingPaid(null);
    if (res.success) { setVarAmounts(v => { const n = { ...v }; delete n[expense.id]; return n; }); load(); }
    else alert(res.error || "Failed to mark as paid");
  };

  const paidExpenses = expenses.filter(e => e.status === "paid");
  const dueExpenses  = expenses.filter(e => e.status === "due" || e.status === "overdue");
  const paidTotal    = paidExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  const statusBadge = (s: string) => {
    if (s === "paid")    return <span className="badge badge-green">Paid</span>;
    if (s === "overdue") return <span className="badge badge-red">Overdue</span>;
    return <span className="badge badge-orange">Due</span>;
  };

  const typeBadge = (t: string) => {
    if (t === "recurring_fixed")    return <span className="badge badge-blue" style={{fontSize:10}}>Fixed</span>;
    if (t === "recurring_variable") return <span className="badge badge-purple" style={{fontSize:10}}>Variable</span>;
    return null;
  };

  return (
    <div>
      {/* ── Summary Cards ──────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
        <div className="erp-stat">
          <div className="erp-stat-icon">💰</div>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 20, fontWeight: 700, color: "#ff8c00" }}>{fmt(summary.total)}</div>
          <div className="erp-stat-label">Paid This Month</div>
        </div>
        {dueExpenses.length > 0 && (
          <div className="erp-stat" style={{ border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.03)" }}>
            <div className="erp-stat-icon">⚠️</div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 20, fontWeight: 700, color: "#DC2626" }}>{dueExpenses.length}</div>
            <div className="erp-stat-label" style={{ color: "#DC2626" }}>Outstanding Bills</div>
          </div>
        )}
        {(summary.categories || []).slice(0, 3).map((c: any) => (
          <div key={c.category} className="erp-stat" style={{ padding: "14px 12px" }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{catIcon(c.category)}</div>
            <div style={{ fontWeight: 700, color: "#5B21B6", fontSize: 15 }}>{fmt(Number(c.total))}</div>
            <div className="erp-stat-label">{c.category}</div>
            <div style={{ fontSize: 10, color: "#888888", marginTop: 2 }}>{c.count} entries</div>
          </div>
        ))}
      </div>

      {/* ── Controls Row ────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 3, background: "#EBEBEB", padding: 3, borderRadius: 10 }}>
            <button
              style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: activeTab === "paid" ? "#111111" : "transparent", color: activeTab === "paid" ? "#FFFFFF" : "#666666", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s" }}
              onClick={() => setActiveTab("paid")}
            >✅ Paid Expenses</button>
            <button
              style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: activeTab === "due" ? "#111111" : "transparent", color: activeTab === "due" ? "#FFFFFF" : "#666666", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s" }}
              onClick={() => setActiveTab("due")}
            >⏳ Due / Overdue{dueExpenses.length > 0 ? ` (${dueExpenses.length})` : ""}</button>
          </div>
          <input type="month" className="erp-input" style={{ width: "auto", padding: "7px 12px" }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
          <select className="erp-select" style={{ width: "auto", padding: "7px 12px" }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.value}</option>)}
          </select>
          <button className="erp-btn erp-btn-primary erp-btn-sm" onClick={load}>Filter</button>
        </div>
        {isAdmin && <button className="erp-btn erp-btn-primary" onClick={() => { setShowForm(!showForm); setMsg(""); }}>+ Add Expense</button>}
      </div>

      {/* ── Add Form ────────────────────────────────────────────────────────────── */}
      {showForm && isAdmin && (
        <div className="erp-card" style={{ marginBottom: 20 }}>
          <div className="erp-section-title" style={{ marginBottom: 16 }}>Add Office Expense</div>
          {msg && <div style={{ marginBottom: 12, padding: "8px 12px", background: msg.startsWith("✅") ? "rgba(0,200,100,0.1)" : "rgba(255,68,68,0.1)", borderRadius: 8, fontSize: 13, color: msg.startsWith("✅") ? "#00c864" : "#ff6666" }}>{msg}</div>}
          <div className="erp-grid-3">
            <div className="erp-field">
              <label>Expense Type</label>
              <select className="erp-select" value={form.expense_type} onChange={e => handleTypeChange(e.target.value)}>
                <option value="one_time">One-Time</option>
                <option value="recurring_fixed">Recurring Fixed (e.g. Rent)</option>
                <option value="recurring_variable">Recurring Variable (e.g. Utilities)</option>
              </select>
            </div>
            <div className="erp-field"><label>Date *</label><input type="date" className="erp-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="erp-field">
              <label>Category</label>
              <select className="erp-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.value}</option>)}
              </select>
            </div>
          </div>
          <div className="erp-grid-3">
            <div className="erp-field">
              <label>Amount (Rs.) {form.expense_type === "recurring_variable" ? "— auto-zero for variable" : "*"}</label>
              <input type="number" className="erp-input" placeholder="0" value={form.expense_type === "recurring_variable" ? "0" : form.amount} disabled={form.expense_type === "recurring_variable"} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="erp-field"><label>Description</label><input className="erp-input" placeholder="e.g. June Rent" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="erp-field"><label>Paid By</label><input className="erp-input" placeholder="Who paid?" value={form.paid_by} onChange={e => setForm(f => ({ ...f, paid_by: e.target.value }))} /></div>
          </div>
          {form.expense_type !== "one_time" && (
            <div style={{ padding: "10px 14px", background: "rgba(91,33,182,0.05)", border: "1px solid rgba(91,33,182,0.15)", borderRadius: 8, marginBottom: 12, fontSize: 13, color: "#5B21B6" }}>
              🔄 Creates a recurring template. Each month a <strong>{form.expense_type === "recurring_fixed" ? "fixed-amount copy" : "Rs. 0 variable bill"}</strong> is auto-generated with status <em>Due</em> for your review.
            </div>
          )}
          <div className="erp-grid-2">
            <div className="erp-field">
              <label>Receipt</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {form.receipt_path && <span style={{ fontSize: 12, color: "#00c864" }}>✅ Uploaded</span>}
                <label style={{ cursor: "pointer", background: "rgba(139,0,255,0.12)", border: "1px solid rgba(139,0,255,0.25)", padding: "7px 14px", borderRadius: 8, fontSize: 12, color: "#5B21B6" }}>
                  {uploading ? "Uploading…" : "📎 Upload Receipt"}
                  <input type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={e => e.target.files?.[0] && uploadReceipt(e.target.files[0], "form")} disabled={uploading} />
                </label>
              </div>
            </div>
            <div className="erp-field"><label>Notes</label><input className="erp-input" placeholder="Additional notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button className="erp-btn erp-btn-primary" onClick={submit}>Save {form.expense_type !== "one_time" ? "Template" : "Expense"}</button>
            <button className="erp-btn erp-btn-outline" onClick={() => { setShowForm(false); setMsg(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── PAID EXPENSES TAB ──────────────────────────────────────────────────── */}
      {activeTab === "paid" && (
        <div className="erp-card">
          <div className="erp-section-header">
            <div className="erp-section-title">Paid Expenses — {filterMonth}{filterCat ? ` · ${catIcon(filterCat)} ${filterCat}` : ""}</div>
            <div style={{ fontWeight: 700, color: "#ff8c00" }}>{fmt(paidTotal)}</div>
          </div>
          <div className="erp-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Category</th><th>Type</th><th>Description</th>
                  <th>Amount</th><th>Paid By</th><th>Receipt</th><th>Notes</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paidExpenses.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", color: "#999999", padding: 24 }}>No paid expenses for this period</td></tr>}
                {paidExpenses.map((e: any) => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 12, color: "#555555", whiteSpace: "nowrap" }}>{e.date}</td>
                    <td><span style={{ background: "#F0F0F0", border: "1px solid #E5E5E5", padding: "3px 9px", borderRadius: 10, fontSize: 12, color: "#111111" }}>{catIcon(e.category)} {e.category}</span></td>
                    <td>{typeBadge(e.expense_type)}</td>
                    <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, color: "#111111" }}>{e.description || "—"}</td>
                    <td style={{ fontWeight: 700, color: "#ff8c00" }}>{fmt(Number(e.amount))}</td>
                    <td style={{ fontSize: 12, color: "#333333" }}>{e.paid_by || "—"}</td>
                    <td>{e.receipt_path ? <a href={e.receipt_path} target="_blank" rel="noreferrer" style={{ color: "#5B21B6", fontSize: 12 }}>📎 View</a> : <span style={{ color: "#AAAAAA", fontSize: 12 }}>—</span>}</td>
                    <td style={{ fontSize: 11, color: "#666666", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.notes || "—"}</td>
                    {isAdmin && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="erp-btn erp-btn-outline erp-btn-sm" style={{ marginRight: 4 }} onClick={() => setEditModal({ ...e })}>Edit</button>
                        <button className="erp-btn erp-btn-red erp-btn-sm" onClick={() => del(e.id)}>Del</button>
                      </td>
                    )}
                  </tr>
                ))}
                {paidExpenses.length > 0 && (
                  <tr style={{ borderTop: "2px solid rgba(91,33,182,0.12)" }}>
                    <td colSpan={4} style={{ fontWeight: 700, fontSize: 12, color: "#555555", padding: "12px 14px", textTransform: "uppercase", letterSpacing: "1px" }}>Total</td>
                    <td style={{ fontWeight: 900, color: "#ff8c00", fontFamily: "'Cinzel',serif", fontSize: 16, padding: "12px 14px" }}>{fmt(paidTotal)}</td>
                    <td colSpan={isAdmin ? 4 : 3} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DUE / OVERDUE TAB ──────────────────────────────────────────────────── */}
      {activeTab === "due" && (
        <div className="erp-card">
          <div className="erp-section-header">
            <div className="erp-section-title">⏳ Due &amp; Overdue Bills — {filterMonth}</div>
            <div style={{ fontSize: 13, color: "#888888" }}>{dueExpenses.length} pending</div>
          </div>
          {dueExpenses.length === 0 ? (
            <div className="erp-empty">✅ No outstanding bills for this period</div>
          ) : (
            <div className="erp-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Due Date</th><th>Category</th><th>Type</th><th>Description</th>
                    <th>Amount</th><th>Status</th>
                    {isAdmin && <th style={{ minWidth: 220 }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {dueExpenses.map((e: any) => (
                    <tr key={e.id} style={{ background: e.status === "overdue" ? "rgba(220,38,38,0.025)" : "transparent" }}>
                      <td style={{ fontSize: 12, whiteSpace: "nowrap", fontWeight: e.status === "overdue" ? 700 : 400, color: e.status === "overdue" ? "#DC2626" : "#555555" }}>
                        {e.due_date || e.date}
                      </td>
                      <td><span style={{ background: "#F0F0F0", border: "1px solid #E5E5E5", padding: "3px 9px", borderRadius: 10, fontSize: 12, color: "#111111" }}>{catIcon(e.category)} {e.category}</span></td>
                      <td>{typeBadge(e.expense_type)}</td>
                      <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, color: "#111111" }}>{e.description || "—"}</td>
                      <td style={{ fontWeight: 700, color: e.expense_type === "recurring_variable" ? "#AAAAAA" : "#ff8c00" }}>
                        {e.expense_type === "recurring_variable" ? "—" : fmt(Number(e.amount))}
                      </td>
                      <td>{statusBadge(e.status)}</td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
                            {e.expense_type === "recurring_variable" && (
                              <input
                                type="number"
                                className="erp-input"
                                placeholder="Enter amount"
                                style={{ width: 120, padding: "5px 10px", fontSize: 12 }}
                                value={varAmounts[e.id] || ""}
                                onChange={ev => setVarAmounts(va => ({ ...va, [e.id]: ev.target.value }))}
                              />
                            )}
                            <button
                              className="erp-btn erp-btn-sm"
                              style={{ background: "#16A34A", color: "#FFFFFF", opacity: markingPaid === e.id ? 0.65 : 1, whiteSpace: "nowrap" }}
                              disabled={markingPaid === e.id || (e.expense_type === "recurring_variable" && !varAmounts[e.id])}
                              onClick={() => markPaid(e)}
                            >
                              {markingPaid === e.id ? "Saving…" : "✓ Mark Paid"}
                            </button>
                            <button className="erp-btn erp-btn-red erp-btn-sm" onClick={() => del(e.id)}>Del</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Edit Modal ──────────────────────────────────────────────────────────── */}
      {editModal && (
        <div className="erp-modal-overlay">
          <div className="erp-modal" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <div className="erp-modal-title">Edit Office Expense</div>
            <div className="erp-grid-2">
              <div className="erp-field"><label>Date</label><input type="date" className="erp-input" value={editModal.date} onChange={e => setEditModal((m: any) => ({ ...m, date: e.target.value }))} /></div>
              <div className="erp-field"><label>Category</label>
                <select className="erp-select" value={editModal.category} onChange={e => setEditModal((m: any) => ({ ...m, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.value}</option>)}
                </select>
              </div>
            </div>
            <div className="erp-grid-2">
              <div className="erp-field"><label>Amount (Rs.)</label><input type="number" className="erp-input" value={editModal.amount} onChange={e => setEditModal((m: any) => ({ ...m, amount: e.target.value }))} /></div>
              <div className="erp-field"><label>Status</label>
                <select className="erp-select" value={editModal.status || "paid"} onChange={e => setEditModal((m: any) => ({ ...m, status: e.target.value }))}>
                  <option value="paid">Paid</option>
                  <option value="due">Due</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>
            <div className="erp-grid-2">
              <div className="erp-field"><label>Due Date</label><input type="date" className="erp-input" value={editModal.due_date || ""} onChange={e => setEditModal((m: any) => ({ ...m, due_date: e.target.value }))} /></div>
              <div className="erp-field"><label>Paid By</label><input className="erp-input" value={editModal.paid_by || ""} onChange={e => setEditModal((m: any) => ({ ...m, paid_by: e.target.value }))} /></div>
            </div>
            <div className="erp-field"><label>Description</label><input className="erp-input" value={editModal.description || ""} onChange={e => setEditModal((m: any) => ({ ...m, description: e.target.value }))} /></div>
            <div className="erp-field">
              <label>Receipt</label>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {editModal.receipt_path && <a href={editModal.receipt_path} target="_blank" rel="noreferrer" style={{ color: "#5B21B6", fontSize: 12 }}>📎 Current</a>}
                <label style={{ cursor: "pointer", background: "rgba(139,0,255,0.12)", border: "1px solid rgba(139,0,255,0.25)", padding: "6px 12px", borderRadius: 8, fontSize: 12, color: "#5B21B6" }}>
                  {uploading ? "Uploading…" : "Change Receipt"}
                  <input type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={e => e.target.files?.[0] && uploadReceipt(e.target.files[0], "edit")} disabled={uploading} />
                </label>
              </div>
            </div>
            <div className="erp-field"><label>Notes</label><input className="erp-input" value={editModal.notes || ""} onChange={e => setEditModal((m: any) => ({ ...m, notes: e.target.value }))} /></div>
            <div className="erp-modal-actions">
              <button className="erp-btn erp-btn-outline" onClick={() => setEditModal(null)}>Cancel</button>
              <button className="erp-btn erp-btn-primary" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
