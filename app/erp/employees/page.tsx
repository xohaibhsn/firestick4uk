"use client";
import { useEffect, useState } from "react";
import ERPLayout from "../ERPLayout";

export default function ERPEmployees() {
  return <ERPLayout title="Users" active="employees">{(user, currency) => user.role==="admin" ? <EmpContent user={user} currency={currency} /> : <div style={{padding:40,textAlign:"center",color:"#777777"}}>⛔ Admin access only</div>}</ERPLayout>;
}

function EmpContent({ user, currency }: { user: any; currency: string }) {
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
  const [employees, setEmployees] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [modal, setModal] = useState<any>(null);
  const [vendorMode, setVendorMode] = useState(false);
  const [form, setForm] = useState({ name:"", email:"", password:"", role:"employee", department:"", salary:"", joining_date:"", reports_to:"" });
  const [msg, setMsg] = useState("");

  const load = () => {
    fetch("/api/erp/employees").then(r=>r.json()).then(d=>setEmployees(Array.isArray(d)?d:[])).catch(()=>{});
    fetch("/api/erp/employees?role_filter=manager,admin").then(r=>r.json()).then(d=>setManagers(Array.isArray(d)?d:[])).catch(()=>{});
    fetch("/api/erp/employees?role_filter=admin").then(r=>r.json()).then(d=>setAdmins(Array.isArray(d)?d:[])).catch(()=>{});
  };
  useEffect(()=>{ load(); },[]);

  const openNew = () => { setForm({name:"",email:"",password:"",role:"employee",department:"",salary:"",joining_date:"",reports_to:""}); setModal("new"); setVendorMode(false); setMsg(""); };
  const openEdit = (e:any) => { setForm({name:e.name,email:e.email,password:"",role:e.role,department:e.department||"",salary:e.salary||"",joining_date:e.joining_date||"",reports_to:e.reports_to||""}); setModal(e); setVendorMode(false); setMsg(""); };

  const save = async () => {
    if (modal === "new" && vendorMode) {
      if (!form.name || !form.email || !form.password) { setMsg("❌ Name, email and password required"); return; }
      const res = await fetch("/api/erp/employees", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password, role: "vendor", department:"", salary:"0", joining_date:"", reports_to:"" })
      }).then(r=>r.json()).catch(()=>({}));
      if (res.success) { setModal(null); setVendorMode(false); load(); }
      else setMsg(`❌ ${res.error||"Failed"}`);
      return;
    }
    if (!form.name||!form.email) { setMsg("❌ Name and email required"); return; }
    let res;
    if (modal==="new") {
      if (!form.password) { setMsg("❌ Password required"); return; }
      res = await fetch("/api/erp/employees",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)}).then(r=>r.json()).catch(()=>({}));
    } else {
      res = await fetch("/api/erp/employees",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,id:modal.id,active:1})}).then(r=>r.json()).catch(()=>({}));
    }
    if (res.success) { setModal(null); setVendorMode(false); load(); } else setMsg(`❌ ${res.error||"Failed"}`);
  };

  const deactivate = async (id:number) => {
    if (!confirm("Deactivate this user? They will be unable to log in.")) return;
    await fetch(`/api/erp/employees?id=${id}`,{method:"DELETE"});
    load();
  };

  const deleteUser = async (id:number, name:string) => {
    if (!confirm(`PERMANENTLY DELETE "${name}"?\n\nThis removes the user AND all their records (attendance, leaves, expenses, payroll, ledger).\nThis CANNOT be undone.`)) return;
    if (!confirm(`Last chance — delete "${name}" forever?`)) return;
    const res = await fetch(`/api/erp/employees?id=${id}&permanent=1`,{method:"DELETE"}).then(r=>r.json()).catch(()=>({}));
    if (res.success) { load(); }
    else alert("Delete failed. Please try again.");
  };

  const roleColor: any = {admin:"badge-purple",manager:"badge-blue",employee:"badge-green",vendor:"badge-orange"};
  const depts = ["","Management","Sales","Support","Technical","Finance","Marketing","Operations"];

  // Reports To dropdown options based on selected role
  const reportsToOptions = form.role === "manager" ? admins : managers;

  return (
    <div>
      <div style={{marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div className="erp-page-title">Manage <span>Users</span></div>
        <button className="erp-btn erp-btn-primary" onClick={openNew}>+ Add User</button>
      </div>
      <div className="erp-card">
        <div className="erp-table-wrap">
          <table>
            <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Reports To</th><th>Salary</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {employees.length===0 && <tr><td colSpan={10} style={{textAlign:"center",color:"#999999",padding:24}}>No employees found</td></tr>}
              {employees.map((e:any)=>(
                <tr key={e.id}>
                  <td style={{color:"#777777",fontSize:12}}>#{e.id}</td>
                  <td style={{fontWeight:600}}>{e.name}</td>
                  <td style={{fontSize:12,color:"#555555"}}>{e.email}</td>
                  <td><span className={`badge ${roleColor[e.role]||"badge-purple"}`}>{e.role}</span></td>
                  <td style={{fontSize:12}}>{e.department||"—"}</td>
                  <td style={{fontSize:12,color:e.reports_to_name?"rgba(255,255,255,0.8)":"rgba(255,255,255,0.25)"}}>{e.reports_to_name||"—"}</td>
                  <td style={{fontWeight:600,color:"#5B21B6"}}>{e.salary>0?fmt(Number(e.salary)):"—"}</td>
                  <td style={{fontSize:12,color:"#666666"}}>{e.joining_date||"—"}</td>
                  <td><span className={`badge ${e.active?"badge-green":"badge-red"}`}>{e.active?"Active":"Inactive"}</span></td>
                  <td style={{whiteSpace:"nowrap"}}>
                    <button className="erp-btn erp-btn-outline erp-btn-sm" style={{marginRight:6}} onClick={()=>openEdit(e)}>Edit</button>
                    {e.id!==user.id&&e.active&&<button className="erp-btn erp-btn-red erp-btn-sm" onClick={()=>deactivate(e.id)}>Deactivate</button>}
                    {e.id!==user.id&&<button className="erp-btn erp-btn-sm" style={{background:'#7F1D1D',color:'#fff',marginLeft:4}} onClick={()=>deleteUser(e.id,e.name)}>🗑 Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="erp-modal-overlay">
          <div className="erp-modal" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
            <div className="erp-modal-title">{modal==="new"?"Add User":"Edit User"}</div>
            {modal === "new" && (
              <div style={{display:"flex",gap:8,marginBottom:16}}>
                <button
                  type="button"
                  onClick={()=>{ setVendorMode(false); setMsg(""); }}
                  style={{flex:1,padding:"8px 0",borderRadius:6,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,background:!vendorMode?"#5B21B6":"#F5F5F5",color:!vendorMode?"#fff":"#222"}}
                >👥 Staff / Employee</button>
                <button
                  type="button"
                  onClick={()=>{ setVendorMode(true); setMsg(""); }}
                  style={{flex:1,padding:"8px 0",borderRadius:6,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,background:vendorMode?"#5B21B6":"#F5F5F5",color:vendorMode?"#fff":"#222"}}
                >🏢 Vendor</button>
              </div>
            )}
            {msg && <div style={{marginBottom:12,color:"#ff8888",fontSize:13}}>{msg}</div>}
            {vendorMode && modal === "new" ? (
              <>
                <div className="erp-grid-2">
                  <div className="erp-field"><label>Full Name *</label><input className="erp-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="John Smith" /></div>
                  <div className="erp-field"><label>Email *</label><input className="erp-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="john@example.com" /></div>
                </div>
                <div className="erp-grid-2">
                  <div className="erp-field"><label>Password *</label><input className="erp-input" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Password" /></div>
                </div>
              </>
            ) : (
              <>
                <div className="erp-grid-2">
                  <div className="erp-field"><label>Full Name *</label><input className="erp-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="John Smith" /></div>
                  <div className="erp-field"><label>Email *</label><input className="erp-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="john@example.com" /></div>
                </div>
                <div className="erp-grid-2">
                  <div className="erp-field"><label>{modal==="new"?"Password *":"New Password (leave blank)"}</label><input className="erp-input" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Password" /></div>
                  <div className="erp-field">
                    <label>Role</label>
                    <select className="erp-select" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value,reports_to:""}))}>
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                      <option value="vendor">Vendor</option>
                    </select>
                  </div>
                </div>
                <div className="erp-grid-2">
                  <div className="erp-field"><label>Department</label><select className="erp-select" value={form.department} onChange={e=>setForm(f=>({...f,department:e.target.value}))}>{depts.map(d=><option key={d} value={d}>{d||"— Select —"}</option>)}</select></div>
                  <div className="erp-field"><label>Monthly Salary (Rs.)</label><input className="erp-input" type="number" value={form.salary} onChange={e=>setForm(f=>({...f,salary:e.target.value}))} placeholder="0.00" /></div>
                </div>
                <div className="erp-grid-2">
                  <div className="erp-field"><label>Joining Date</label><input className="erp-input" type="date" value={form.joining_date} onChange={e=>setForm(f=>({...f,joining_date:e.target.value}))} /></div>
                  {form.role !== "admin" && (
                    <div className="erp-field">
                      <label>Reports To {form.role==="manager"?"(Admin)":"(Manager/Admin)"}</label>
                      <select className="erp-select" value={form.reports_to} onChange={e=>setForm(f=>({...f,reports_to:e.target.value}))}>
                        <option value="">— None —</option>
                        {reportsToOptions.map((m:any)=>(
                          <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="erp-modal-actions">
              <button className="erp-btn erp-btn-outline" onClick={()=>{ setModal(null); setVendorMode(false); }}>Cancel</button>
              <button className="erp-btn erp-btn-primary" onClick={save}>{modal==="new" && vendorMode ? "Add Vendor" : modal==="new" ? "Add User" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
