"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --purple-deep:#0d0010; --purple-mid:#4a0080; --purple-bright:#8b00ff; --purple-glow:#bf5fff; --gold:#ffd700; --green:#00c864; --orange:#ff8c00; --red:#ff4444; --blue:#4488ff; }
  body { background:#0a0010; color:#fff; font-family:'Raleway',sans-serif; overflow-x:hidden; }

  /* LOGIN */
  .login-screen { min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:radial-gradient(ellipse at 30% 30%,#2d0050 0%,transparent 50%),
               radial-gradient(ellipse at 70% 70%,#1a0035 0%,transparent 50%),#0a0010; }
  .login-box { background:linear-gradient(135deg,rgba(74,0,128,0.3),rgba(26,0,37,0.9));
    border:1px solid rgba(139,0,255,0.3); border-radius:24px; padding:50px 40px;
    width:100%; max-width:420px; text-align:center; }
  .login-logo { font-family:'Cinzel',serif; font-size:22px; font-weight:900;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; margin-bottom:8px; }
  .login-sub { font-size:13px; color:rgba(255,255,255,0.4); margin-bottom:36px; letter-spacing:2px; text-transform:uppercase; }
  .login-input { width:100%; background:rgba(139,0,255,0.08); border:1px solid rgba(139,0,255,0.25);
    border-radius:12px; padding:14px 18px; color:white; font-family:'Raleway',sans-serif;
    font-size:14px; outline:none; margin-bottom:14px; transition:all 0.3s; }
  .login-input:focus { border-color:var(--purple-glow); background:rgba(139,0,255,0.15); }
  .login-input::placeholder { color:rgba(255,255,255,0.25); }
  .login-btn { width:100%; background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; border:none; padding:15px; border-radius:50px; font-size:15px;
    font-weight:600; cursor:pointer; box-shadow:0 0 25px rgba(139,0,255,0.4);
    transition:all 0.3s; margin-top:6px; }
  .login-btn:hover { box-shadow:0 0 40px rgba(139,0,255,0.7); transform:translateY(-2px); }
  .login-error { color:#ff6666; font-size:13px; margin-top:10px; }

  /* LAYOUT */
  .admin-layout { display:flex; min-height:100vh; }

  /* SIDEBAR */
  .sidebar { width:240px; flex-shrink:0; background:rgba(13,0,20,0.98);
    border-right:1px solid rgba(139,0,255,0.15);
    display:flex; flex-direction:column; position:fixed; top:0; left:0; bottom:0; z-index:50; }
  .sidebar-logo { padding:28px 24px 20px; border-bottom:1px solid rgba(139,0,255,0.1); }
  .sidebar-logo-text { font-family:'Cinzel',serif; font-size:16px; font-weight:900;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .sidebar-label { font-size:10px; color:rgba(255,255,255,0.3); letter-spacing:3px; text-transform:uppercase; margin-top:3px; }
  .sidebar-nav { flex:1; padding:20px 12px; display:flex; flex-direction:column; gap:4px; }
  .nav-item { display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:12px;
    cursor:pointer; transition:all 0.2s; color:rgba(255,255,255,0.5); font-size:14px; font-weight:500; border:none; background:none; width:100%; text-align:left; }
  .nav-item:hover { background:rgba(139,0,255,0.1); color:rgba(255,255,255,0.8); }
  .nav-item.active { background:linear-gradient(135deg,rgba(74,0,128,0.4),rgba(139,0,255,0.2));
    color:white; border:1px solid rgba(139,0,255,0.3); }
  .nav-icon { font-size:18px; width:22px; text-align:center; }
  .nav-badge { margin-left:auto; background:var(--purple-bright); color:white; font-size:10px;
    font-weight:700; padding:2px 8px; border-radius:20px; }
  .nav-badge.orange { background:var(--orange); }
  .sidebar-footer { padding:16px 12px; border-top:1px solid rgba(139,0,255,0.1); }
  .logout-btn { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:10px;
    cursor:pointer; color:rgba(255,100,100,0.7); font-size:13px; border:none; background:none; width:100%; transition:all 0.2s; }
  .logout-btn:hover { background:rgba(255,0,0,0.08); color:#ff6666; }

  /* MAIN */
  .main-content { margin-left:240px; flex:1; padding:28px; min-height:100vh; background:radial-gradient(ellipse at 80% 10%,rgba(74,0,128,0.08) 0%,transparent 50%),#0a0010; }
  .top-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:28px; }
  .page-heading { font-family:'Cinzel',serif; font-size:24px; font-weight:700; color:white; }
  .page-heading span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .top-right { display:flex; align-items:center; gap:14px; }
  .admin-badge { background:rgba(139,0,255,0.15); border:1px solid rgba(139,0,255,0.3); color:var(--purple-glow); font-size:12px; padding:6px 16px; border-radius:20px; }

  /* STATS */
  .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin-bottom:28px; }
  .stat-card { background:linear-gradient(135deg,rgba(74,0,128,0.2),rgba(26,0,37,0.8));
    border:1px solid rgba(139,0,255,0.2); border-radius:16px; padding:22px 20px; }
  .stat-card-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; }
  .stat-icon { font-size:28px; }
  .stat-trend { font-size:11px; color:var(--green); background:rgba(0,200,100,0.1); padding:3px 8px; border-radius:10px; }
  .stat-value { font-family:'Cinzel',serif; font-size:28px; font-weight:700; color:white; margin-bottom:4px; }
  .stat-label { font-size:12px; color:rgba(255,255,255,0.4); letter-spacing:1px; text-transform:uppercase; }

  /* TABLE */
  .section-card { background:linear-gradient(135deg,rgba(74,0,128,0.15),rgba(26,0,37,0.85));
    border:1px solid rgba(139,0,255,0.15); border-radius:20px; overflow:hidden; margin-bottom:24px; }
  .section-header { padding:20px 24px; border-bottom:1px solid rgba(139,0,255,0.1);
    display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
  .section-title { font-family:'Cinzel',serif; font-size:16px; font-weight:700; color:white; }
  .section-actions { display:flex; gap:10px; flex-wrap:wrap; }
  .filter-select { background:rgba(139,0,255,0.1); border:1px solid rgba(139,0,255,0.25); color:white;
    padding:8px 14px; border-radius:10px; font-size:13px; outline:none; cursor:pointer; }
  .filter-select option { background:#1a0025; }
  .add-btn { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; border:none; padding:8px 18px; border-radius:10px; font-size:13px;
    font-weight:600; cursor:pointer; transition:all 0.2s; }
  .add-btn:hover { box-shadow:0 0 15px rgba(139,0,255,0.5); }

  .table-wrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; }
  th { padding:12px 16px; text-align:left; font-size:11px; letter-spacing:2px; text-transform:uppercase;
    color:rgba(255,255,255,0.4); border-bottom:1px solid rgba(139,0,255,0.1); white-space:nowrap; }
  td { padding:14px 16px; font-size:14px; color:rgba(255,255,255,0.75); border-bottom:1px solid rgba(139,0,255,0.07); vertical-align:middle; }
  tr:last-child td { border-bottom:none; }
  tr:hover td { background:rgba(139,0,255,0.05); }

  .status-badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
  .status-pending { background:rgba(255,180,0,0.15); border:1px solid rgba(255,180,0,0.3); color:#ffb400; }
  .status-confirmed { background:rgba(139,0,255,0.15); border:1px solid rgba(139,0,255,0.4); color:var(--purple-glow); }
  .status-dispatched { background:rgba(68,136,255,0.15); border:1px solid rgba(68,136,255,0.4); color:var(--blue); }
  .status-delivered { background:rgba(0,200,100,0.15); border:1px solid rgba(0,200,100,0.4); color:var(--green); }

  .action-btn { padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; border:none; transition:all 0.2s; margin-right:6px; }
  .btn-view { background:rgba(139,0,255,0.15); color:var(--purple-glow); border:1px solid rgba(139,0,255,0.3); }
  .btn-view:hover { background:rgba(139,0,255,0.3); }
  .btn-verify { background:rgba(0,200,100,0.15); color:var(--green); border:1px solid rgba(0,200,100,0.3); }
  .btn-verify:hover { background:rgba(0,200,100,0.3); }
  .btn-delete { background:rgba(255,68,68,0.12); color:var(--red); border:1px solid rgba(255,68,68,0.25); }
  .btn-delete:hover { background:rgba(255,68,68,0.25); }
  .btn-edit { background:rgba(255,140,0,0.12); color:var(--orange); border:1px solid rgba(255,140,0,0.25); }
  .btn-edit:hover { background:rgba(255,140,0,0.25); }

  /* BLOG EDITOR */
  .modal-blog { max-width:900px; width:96vw; max-height:92vh; }
  .editor-toolbar { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; padding:8px; background:rgba(139,0,255,0.06); border:1px solid rgba(139,0,255,0.2); border-radius:8px; }
  .tool-btn { background:rgba(139,0,255,0.1); border:1px solid rgba(139,0,255,0.2); color:rgba(255,255,255,0.8); padding:5px 10px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; transition:all 0.2s; }
  .tool-btn:hover { background:rgba(139,0,255,0.3); color:white; }
  .tool-sep { width:1px; background:rgba(139,0,255,0.2); margin:2px 4px; }
  .rich-editor { min-height:200px; max-height:300px; overflow-y:auto; background:rgba(139,0,255,0.05); border:1px solid rgba(139,0,255,0.25); border-radius:10px; padding:14px 16px; color:white; font-size:14px; line-height:1.7; outline:none; }
  .rich-editor:focus { border-color:var(--purple-glow); }
  .rich-editor h2 { font-size:20px; font-weight:700; margin:12px 0 6px; color:var(--purple-glow); }
  .rich-editor h3 { font-size:16px; font-weight:600; margin:10px 0 4px; color:rgba(191,95,255,0.8); }
  .rich-editor ul, .rich-editor ol { padding-left:20px; margin:6px 0; }
  .rich-editor li { margin:3px 0; }
  .rich-editor blockquote { border-left:3px solid var(--purple-glow); padding-left:12px; color:rgba(255,255,255,0.6); margin:8px 0; font-style:italic; }
  .rich-editor a { color:var(--purple-glow); }
  .seo-section { background:rgba(139,0,255,0.04); border:1px solid rgba(139,0,255,0.12); border-radius:10px; padding:16px; margin-top:4px; }
  .seo-section h5 { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:rgba(255,255,255,0.4); margin-bottom:12px; }
  .char-count { font-size:11px; color:rgba(255,255,255,0.3); text-align:right; margin-top:3px; }
  .char-warn { color:#ffb400; }
  .toggle-row { display:flex; align-items:center; justify-content:space-between; padding:8px 0; }
  .toggle-label { font-size:13px; color:rgba(255,255,255,0.7); }
  .toggle-switch { position:relative; width:44px; height:24px; }
  .toggle-switch input { display:none; }
  .toggle-track { position:absolute; inset:0; background:rgba(255,255,255,0.1); border-radius:12px; cursor:pointer; transition:background 0.2s; }
  .toggle-track.on { background:var(--purple-bright); }
  .toggle-thumb { position:absolute; top:3px; left:3px; width:18px; height:18px; background:white; border-radius:50%; transition:left 0.2s; }
  .toggle-track.on .toggle-thumb { left:23px; }
  /* RECEIPT */
  .receipt-thumb { width:40px; height:40px; border-radius:8px; background:rgba(139,0,255,0.15);
    border:1px solid rgba(139,0,255,0.3); display:flex; align-items:center; justify-content:center; font-size:18px; cursor:pointer; }

  /* PRODUCT IMAGE */
  .product-thumb { width:44px; height:44px; border-radius:8px; background:rgba(139,0,255,0.15);
    border:1px solid rgba(139,0,255,0.2); display:flex; align-items:center; justify-content:center; font-size:22px; }

  /* MODAL */
  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:200;
    display:flex; align-items:center; justify-content:center; padding:20px; }
  .modal { background:linear-gradient(135deg,rgba(26,0,40,0.98),rgba(13,0,20,0.99));
    border:1px solid rgba(139,0,255,0.3); border-radius:20px; padding:32px;
    max-width:550px; width:100%; max-height:90vh; overflow-y:auto; }
  .modal-title { font-family:'Cinzel',serif; font-size:18px; font-weight:700; color:white; margin-bottom:24px; }
  .modal-field { margin-bottom:16px; }
  .modal-field label { display:block; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:rgba(255,255,255,0.4); margin-bottom:7px; }
  .modal-field input, .modal-field select, .modal-field textarea {
    width:100%; background:rgba(139,0,255,0.08); border:1px solid rgba(139,0,255,0.25);
    border-radius:10px; padding:11px 14px; color:white; font-family:'Raleway',sans-serif;
    font-size:14px; outline:none; transition:all 0.3s; }
  .modal-field input:focus, .modal-field select:focus, .modal-field textarea:focus { border-color:var(--purple-glow); }
  .modal-field select option { background:#1a0025; }
  .modal-actions { display:flex; gap:12px; justify-content:flex-end; margin-top:24px; }
  .modal-cancel { background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.6); border:1px solid rgba(255,255,255,0.1); padding:10px 22px; border-radius:10px; cursor:pointer; font-size:14px; }
  .modal-save { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)); color:white; border:none; padding:10px 22px; border-radius:10px; cursor:pointer; font-size:14px; font-weight:600; }
  .modal-save:hover { box-shadow:0 0 20px rgba(139,0,255,0.5); }

  /* RECEIPT MODAL */
  .receipt-preview { background:rgba(139,0,255,0.08); border:1px solid rgba(139,0,255,0.2); border-radius:12px; padding:24px; text-align:center; font-size:40px; margin-bottom:16px; }

  /* CUSTOMERS */
  .customer-avatar { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:white; }

  @media(max-width:900px){
    .sidebar{display:none;}
    .main-content{margin-left:0;padding:20px 16px;}
    .table-wrap{overflow-x:auto;}
    .stats-grid{grid-template-columns:1fr 1fr;}
    .section-header{flex-direction:column;align-items:flex-start;gap:12px;}
  }
  @media(max-width:500px){
    .stats-grid{grid-template-columns:1fr;}
    .modal{padding:24px 20px;}
  }
`;

// DEMO DATA
const demoOrders = [
  { id:"FK44-62305", customer:"John Smith", email:"john@example.com", phone:"+44 7000 000000", items:"B1G 6 Month Plan + Firestick 4K", total:"£89.98", status:"confirmed", date:"30 May 2026", receipt:true },
  { id:"FK44-22222", customer:"Ali Hassan", email:"ali@example.com", phone:"+44 7222 222222", items:"B1G 1 Year Plan", total:"£79.99", status:"pending", date:"30 May 2026", receipt:true },
  { id:"FK44-11111", customer:"Sarah Jones", email:"sarah@example.com", phone:"+44 7111 111111", items:"Android Box Ultra", total:"£73.98", status:"dispatched", date:"28 May 2026", receipt:true },
  { id:"FK44-33333", customer:"David Brown", email:"david@example.com", phone:"+44 7333 333333", items:"Firestick 4K Max", total:"£54.99", status:"delivered", date:"25 May 2026", receipt:false },
  { id:"FK44-44444", customer:"Emma Wilson", email:"emma@example.com", phone:"+44 7444 444444", items:"B1G 1 Month Plan", total:"£9.99", status:"pending", date:"31 May 2026", receipt:true },
];

const demoProducts = [
  { id:1, name:"B1G 1 Month Plan", category:"Subscription", price:"£9.99", stock:"Digital", emoji:"📦" },
  { id:2, name:"B1G 6 Month Plan", category:"Subscription", price:"£49.99", stock:"Digital", emoji:"📦" },
  { id:3, name:"B1G 1 Year Plan", category:"Subscription", price:"£79.99", stock:"Digital", emoji:"📦" },
  { id:4, name:"Firestick 4K", category:"Device", price:"£39.99", stock:"12", emoji:"🔥" },
  { id:5, name:"Firestick 4K Max", category:"Device", price:"£54.99", stock:"8", emoji:"🔥" },
  { id:6, name:"Android Box Pro", category:"Device", price:"£49.99", stock:"5", emoji:"📺" },
  { id:7, name:"Android Box Ultra", category:"Device", price:"£69.99", stock:"3", emoji:"📺" },
  { id:8, name:"Starter Bundle", category:"Bundle", price:"£44.99", stock:"10", emoji:"⭐" },
];

const demoCustomers = [
  { name:"John Smith", email:"john@example.com", phone:"+44 7000 000000", orders:3, spent:"£219.96", joined:"Jan 2026" },
  { name:"Sarah Jones", email:"sarah@example.com", phone:"+44 7111 111111", orders:2, spent:"£123.97", joined:"Feb 2026" },
  { name:"Ali Hassan", email:"ali@example.com", phone:"+44 7222 222222", orders:1, spent:"£79.99", joined:"May 2026" },
  { name:"David Brown", email:"david@example.com", phone:"+44 7333 333333", orders:4, spent:"£189.95", joined:"Dec 2025" },
  { name:"Emma Wilson", email:"emma@example.com", phone:"+44 7444 444444", orders:1, spent:"£9.99", joined:"May 2026" },
];

type Tab = "dashboard"|"orders"|"products"|"customers"|"blog";
type OrderStatus = "pending"|"confirmed"|"dispatched"|"delivered";
type BlogPost = { id:number; title:string; slug:string; excerpt:string; content:string; category:string; emoji:string; badge:string; badgeText:string; featured_image:string; meta_title:string; meta_description:string; focus_keyword:string; status:"published"|"draft"; featured:boolean; };

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [orders, setOrders] = useState(demoOrders);
  const [products, setProducts] = useState(demoProducts);
  const [statusFilter, setStatusFilter] = useState("all");
  const [receiptModal, setReceiptModal] = useState<string|null>(null);
  const [orderModal, setOrderModal] = useState<typeof demoOrders[0]|null>(null);
  const [productModal, setProductModal] = useState<typeof demoProducts[0]|null|"new">(null);
  const [editProduct, setEditProduct] = useState({ name:"", category:"", price:"", stock:"", image:"" });
  const [imageUploading, setImageUploading] = useState(false);
  const [customers, setCustomers] = useState(demoCustomers);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogModal, setBlogModal] = useState<BlogPost|"new"|null>(null);
  const [featImgUploading, setFeatImgUploading] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const defaultBlog = { title:"", slug:"", excerpt:"", content:"", category:"Guides", emoji:"📝", badge:"guide", badgeText:"Guide", featured_image:"", meta_title:"", meta_description:"", focus_keyword:"", status:"published" as const, featured:false };
  const [editBlog, setEditBlog] = useState(defaultBlog);

  useEffect(() => {
    if (localStorage.getItem("adminLoggedIn") === "true") setLoggedIn(true);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    fetch("/api/admin-products")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data) && data.length > 0) setProducts(data); })
      .catch(() => {});
    fetch("/api/admin-orders")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setOrders(data.map((o: any) => ({
            id: o.order_id,
            customer: o.customer_name,
            email: o.customer_email,
            phone: o.customer_phone,
            items: o.items_list || o.payment_method || "—",
            total: `£${parseFloat(o.total || 0).toFixed(2)}`,
            status: o.status,
            date: o.created_at ? new Date(o.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "—",
            receipt: !!o.receipt_path,
            receipt_path: o.receipt_path || "",
            address: [o.delivery_address, o.city, o.postcode].filter(Boolean).join(", "),
            payment: o.payment_method || "",
          })));
        }
      })
      .catch(() => {});
    fetch("/api/blog")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setBlogPosts(data); })
      .catch(() => {});
    fetch("/api/admin-orders?customers=1")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setCustomers(data.map((c: any) => ({
            name: c.customer_name || "",
            email: c.customer_email || "",
            phone: c.customer_phone || "",
            orders: Number(c.order_count) || 0,
            spent: `£${parseFloat(c.total_spent || 0).toFixed(2)}`,
            joined: c.first_order ? new Date(c.first_order).toLocaleDateString("en-GB",{month:"short",year:"numeric"}) : "—",
          })));
        }
      })
      .catch(() => {});
  }, [loggedIn]);

  const handleLogin = async () => {
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }).then(r => r.json());
      if (res.success) {
        localStorage.setItem("adminLoggedIn", "true");
        setLoggedIn(true);
        setLoginError("");
      } else {
        setLoginError("❌ Incorrect username or password");
      }
    } catch {
      setLoginError("❌ Login failed. Please try again.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminLoggedIn");
    setLoggedIn(false);
  };

  const updateStatus = (id: string, status: OrderStatus) => {
    fetch("/api/admin-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: id, status }),
    }).catch(() => {});
    setOrders(orders.map(o => o.id === id ? { ...o, status } : o));
    setOrderModal(null);
  };

  const toSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  const handleFeatImg = async (file: File) => {
    setFeatImgUploading(true);
    try {
      const base64 = await new Promise<string>((resolve,reject) => { const r=new FileReader(); r.onload=()=>resolve(r.result as string); r.onerror=reject; r.readAsDataURL(file); });
      const res = await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file:base64,name:file.name})}).then(r=>r.json());
      if (res.path) setEditBlog(p=>({...p,featured_image:res.path}));
    } catch {}
    setFeatImgUploading(false);
  };

  const execCmd = useCallback((cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) setEditBlog(p=>({...p,content:editorRef.current!.innerHTML}));
  }, []);

  const saveBlog = async () => {
    const content = editorRef.current?.innerHTML || editBlog.content;
    const payload = { ...editBlog, content };
    if (blogModal === "new") {
      const res = await fetch("/api/blog",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).then(r=>r.json()).catch(()=>({}));
      setBlogPosts([...blogPosts, { ...payload, id: res.id || Date.now() } as BlogPost]);
    } else if (blogModal) {
      await fetch("/api/blog",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,id:(blogModal as BlogPost).id})}).catch(()=>{});
      setBlogPosts(blogPosts.map(p=>p.id===(blogModal as BlogPost).id?{...p,...payload} as BlogPost:p));
    }
    setBlogModal(null);
  };

  const deleteBlog = (id: number) => {
    fetch(`/api/blog?id=${id}`, { method: "DELETE" }).catch(() => {});
    setBlogPosts(blogPosts.filter(p => p.id !== id));
  };

  const deleteProduct = (id: number) => {
    fetch(`/api/admin-products?id=${id}`, { method: "DELETE" }).catch(() => {});
    setProducts(products.filter(p => p.id !== id));
  };

  const handleProductImage = async (file: File) => {
    setImageUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: base64, name: file.name }),
      }).then(r => r.json());
      if (res.path) setEditProduct(p => ({ ...p, image: res.path }));
    } catch {}
    setImageUploading(false);
  };

  const saveProduct = async () => {
    const rawPrice = String(editProduct.price).replace(/[^0-9.]/g, "");
    const payload = {
      name: editProduct.name,
      description: "",
      price: rawPrice,
      category: editProduct.category,
      badge: null,
      image: editProduct.image || null,
      stock: editProduct.stock || "Digital",
    };
    if (productModal === "new") {
      const res = await fetch("/api/admin-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(r => r.json()).catch(() => ({}));
      const newId = res.id || Date.now();
      setProducts([...products, { ...editProduct, id: newId }]);
    } else if (productModal) {
      await fetch("/api/admin-products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, id: productModal.id, active: 1 }),
      }).catch(() => {});
      setProducts(products.map(p => p.id === productModal.id ? { ...p, ...editProduct } : p));
    }
    setProductModal(null);
  };

  const openEditProduct = (p: any) => {
    const rawPrice = p.price ? `£${Number(String(p.price).replace(/[^0-9.]/g,'')).toFixed(2)}` : "";
    setEditProduct({ name:p.name||"", category:p.category||"Subscription", price:rawPrice, stock:p.stock||"Digital", image:p.image||"" });
    setProductModal(p);
  };

  const openNewProduct = () => {
    setEditProduct({ name:"", category:"Subscription", price:"", stock:"Digital", image:"" });
    setProductModal("new");
  };

  const filteredOrders = statusFilter === "all" ? orders : orders.filter(o => o.status === statusFilter);
  const pendingCount = orders.filter(o => o.status === "pending").length;

  const statusClass = (s: string) => `status-badge status-${s}`;

  if (!loggedIn) {
    return (
      <>
        <style>{styles}</style>
        <div className="login-screen">
          <div className="login-box">
            <div className="login-logo">FIRESTICK4UK</div>
            <div className="login-sub">Admin Panel</div>
            <input className="login-input" type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key==="Enter" && handleLogin()} />
            <input className="login-input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==="Enter" && handleLogin()} />
            <button className="login-btn" onClick={handleLogin}>Login to Admin Panel</button>
            {loginError && <div className="login-error">{loginError}</div>}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>

      {/* RECEIPT MODAL */}
      {receiptModal && (
        <div className="modal-overlay" onClick={() => setReceiptModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Payment Receipt — {receiptModal}</div>
            {(() => { const o = orders.find(x => x.id === receiptModal); const path = (o as any)?.receipt_path; return path ? (
              <img src={path} alt="Receipt" style={{width:"100%",borderRadius:12,marginBottom:16,border:"1px solid rgba(139,0,255,0.3)"}} />
            ) : (
              <div className="receipt-preview">🧾<br /><span style={{fontSize:"14px",color:"rgba(255,255,255,0.4)"}}>No receipt image uploaded</span></div>
            ); })()}
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setReceiptModal(null)}>Close</button>
              <button className="modal-save" onClick={() => { updateStatus(receiptModal,"confirmed"); setReceiptModal(null); }}>✅ Verify & Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ORDER MODAL */}
      {orderModal && (
        <div className="modal-overlay" onClick={() => setOrderModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Order — {orderModal.id}</div>
            <div className="modal-field"><label>Customer</label><input readOnly value={orderModal.customer} /></div>
            <div className="modal-field"><label>Email</label><input readOnly value={orderModal.email} /></div>
            <div className="modal-field"><label>Phone / WhatsApp</label><input readOnly value={orderModal.phone} /></div>
            <div className="modal-field"><label>Items</label><input readOnly value={orderModal.items} /></div>
            <div className="modal-field"><label>Delivery Address</label><input readOnly value={(orderModal as any).address || "—"} /></div>
            <div className="modal-field"><label>Payment Method</label><input readOnly value={(orderModal as any).payment || "—"} /></div>
            <div className="modal-field"><label>Total</label><input readOnly value={orderModal.total} /></div>
            <div className="modal-field">
              <label>Update Status</label>
              <select defaultValue={orderModal.status} onChange={e => updateStatus(orderModal.id, e.target.value as OrderStatus)}>
                <option value="pending">⏳ Pending</option>
                <option value="confirmed">✅ Confirmed</option>
                <option value="dispatched">🚚 Dispatched</option>
                <option value="delivered">📦 Delivered</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setOrderModal(null)}>Close</button>
              {orderModal.receipt && <button className="modal-save" onClick={() => { setOrderModal(null); setReceiptModal(orderModal.id); }}>View Receipt</button>}
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT MODAL */}
      {productModal && (
        <div className="modal-overlay" onClick={() => setProductModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{productModal === "new" ? "Add New Product" : "Edit Product"}</div>
            <div className="modal-field"><label>Product Name</label><input placeholder="e.g. B1G 1 Year Plan" value={editProduct.name} onChange={e => setEditProduct({...editProduct,name:e.target.value})} /></div>
            <div className="modal-field">
              <label>Category</label>
              <select value={editProduct.category} onChange={e => setEditProduct({...editProduct,category:e.target.value})}>
                <option>Subscription</option><option>Device</option><option>Bundle</option>
              </select>
            </div>
            <div className="modal-field"><label>Price</label><input placeholder="e.g. £9.99" value={editProduct.price} onChange={e => setEditProduct({...editProduct,price:e.target.value})} /></div>
            <div className="modal-field"><label>Stock / Type</label><input placeholder="e.g. 10 or Digital" value={editProduct.stock} onChange={e => setEditProduct({...editProduct,stock:e.target.value})} /></div>
            <div className="modal-field">
              <label>Product Image</label>
              <div style={{display:"flex",alignItems:"center",gap:"12px",flexWrap:"wrap"}}>
                {editProduct.image
                  ? <img src={editProduct.image} alt="product" style={{width:60,height:60,objectFit:"cover",borderRadius:8,border:"1px solid rgba(139,0,255,0.3)"}} />
                  : <div style={{width:60,height:60,background:"rgba(139,0,255,0.1)",border:"1px dashed rgba(139,0,255,0.4)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>📦</div>
                }
                <label style={{cursor:"pointer",background:"rgba(139,0,255,0.15)",border:"1px solid rgba(139,0,255,0.35)",padding:"8px 16px",borderRadius:8,fontSize:13,color:"var(--purple-glow)"}}>
                  {imageUploading ? "Uploading..." : "Upload Image"}
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={e => e.target.files?.[0] && handleProductImage(e.target.files[0])} disabled={imageUploading} />
                </label>
                {editProduct.image && <button style={{background:"none",border:"none",color:"rgba(255,100,100,0.7)",cursor:"pointer",fontSize:13}} onClick={() => setEditProduct(p=>({...p,image:""}))}>Remove</button>}
              </div>
            </div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setProductModal(null)}>Cancel</button>
              <button className="modal-save" onClick={saveProduct} disabled={imageUploading}>Save Product</button>
            </div>
          </div>
        </div>
      )}

      {/* BLOG MODAL — Rich Editor */}
      {blogModal && (
        <div className="modal-overlay" onClick={() => setBlogModal(null)}>
          <div className="modal modal-blog" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{blogModal==="new"?"New Blog Post":"Edit Blog Post"}</div>

            {/* Title + Slug */}
            <div className="modal-field"><label>Title *</label><input placeholder="Post title" value={editBlog.title} onChange={e => { const t=e.target.value; setEditBlog(p=>({...p,title:t,slug:p.slug===toSlug(p.title)||p.slug===""?toSlug(t):p.slug})); }} /></div>
            <div className="modal-field"><label>Slug</label><input placeholder="auto-generated-from-title" value={editBlog.slug} onChange={e => setEditBlog(p=>({...p,slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-")}))} /></div>

            {/* Featured Image */}
            <div className="modal-field">
              <label>Featured Image</label>
              <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
                {editBlog.featured_image && <img src={editBlog.featured_image} alt="" style={{width:80,height:50,objectFit:"cover",borderRadius:6,border:"1px solid rgba(139,0,255,0.3)"}} />}
                <label style={{cursor:"pointer",background:"rgba(139,0,255,0.15)",border:"1px solid rgba(139,0,255,0.35)",padding:"7px 14px",borderRadius:8,fontSize:13,color:"var(--purple-glow)"}}>
                  {featImgUploading?"Uploading...":"Upload Image"}
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&handleFeatImg(e.target.files[0])} disabled={featImgUploading} />
                </label>
                {editBlog.featured_image && <button style={{background:"none",border:"none",color:"rgba(255,100,100,0.7)",cursor:"pointer",fontSize:12}} onClick={()=>setEditBlog(p=>({...p,featured_image:""}))}>Remove</button>}
              </div>
            </div>

            {/* Rich Text Editor */}
            <div className="modal-field">
              <label>Content</label>
              <div className="editor-toolbar">
                {[["bold","B"],["italic","I"]].map(([cmd,lbl])=><button key={cmd} className="tool-btn" onMouseDown={e=>{e.preventDefault();execCmd(cmd);}}><strong>{lbl}</strong></button>)}
                <div className="tool-sep"/>
                <button className="tool-btn" onMouseDown={e=>{e.preventDefault();execCmd("formatBlock","h2");}}>H2</button>
                <button className="tool-btn" onMouseDown={e=>{e.preventDefault();execCmd("formatBlock","h3");}}>H3</button>
                <button className="tool-btn" onMouseDown={e=>{e.preventDefault();execCmd("formatBlock","p");}}>P</button>
                <div className="tool-sep"/>
                <button className="tool-btn" onMouseDown={e=>{e.preventDefault();execCmd("insertUnorderedList");}}>• List</button>
                <button className="tool-btn" onMouseDown={e=>{e.preventDefault();execCmd("insertOrderedList");}}>1. List</button>
                <button className="tool-btn" onMouseDown={e=>{e.preventDefault();execCmd("formatBlock","blockquote");}}>❝</button>
                <div className="tool-sep"/>
                <button className="tool-btn" onMouseDown={e=>{e.preventDefault();const url=prompt("URL:");if(url)execCmd("createLink",url);}}>🔗</button>
                <button className="tool-btn" onMouseDown={e=>{e.preventDefault();execCmd("removeFormat");}}>✕ Clear</button>
              </div>
              <div ref={editorRef} className="rich-editor" contentEditable suppressContentEditableWarning onInput={e=>setEditBlog(p=>({...p,content:e.currentTarget.innerHTML}))} />
            </div>

            {/* Excerpt */}
            <div className="modal-field"><label>Excerpt (SEO description)</label><textarea rows={2} placeholder="Short description shown on blog listing..." value={editBlog.excerpt} onChange={e=>setEditBlog(p=>({...p,excerpt:e.target.value}))} style={{resize:"vertical"}} /></div>

            {/* Category + Badge */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px"}}>
              <div className="modal-field">
                <label>Category</label>
                <select value={editBlog.category} onChange={e=>setEditBlog(p=>({...p,category:e.target.value}))}>
                  <option>Guides</option><option>Tips</option><option>News</option>
                </select>
              </div>
              <div className="modal-field"><label>Badge Text</label><input placeholder="e.g. Guide" value={editBlog.badgeText} onChange={e=>setEditBlog(p=>({...p,badgeText:e.target.value,badge:e.target.value.toLowerCase()}))} /></div>
            </div>

            {/* SEO Section */}
            <div className="seo-section">
              <h5>🔍 SEO Settings</h5>
              <div className="modal-field"><label>Meta Title</label><input placeholder="SEO title (50-60 chars)" value={editBlog.meta_title} onChange={e=>setEditBlog(p=>({...p,meta_title:e.target.value}))} /></div>
              <div className="modal-field">
                <label>Meta Description</label>
                <textarea rows={2} placeholder="SEO description (max 160 chars)" value={editBlog.meta_description} onChange={e=>setEditBlog(p=>({...p,meta_description:e.target.value.slice(0,160)}))} style={{resize:"none"}} />
                <div className={`char-count ${editBlog.meta_description.length>140?"char-warn":""}`}>{editBlog.meta_description.length}/160</div>
              </div>
              <div className="modal-field"><label>Focus Keyword</label><input placeholder="e.g. firestick uk" value={editBlog.focus_keyword} onChange={e=>setEditBlog(p=>({...p,focus_keyword:e.target.value}))} /></div>
            </div>

            {/* Status + Featured toggles */}
            <div style={{marginTop:"16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
              <div className="toggle-row" style={{background:"rgba(139,0,255,0.05)",borderRadius:10,padding:"10px 14px"}}>
                <span className="toggle-label">Status: <strong>{editBlog.status==="published"?"Published":"Draft"}</strong></span>
                <div className="toggle-switch" onClick={()=>setEditBlog(p=>({...p,status:p.status==="published"?"draft":"published"}))}>
                  <div className={`toggle-track ${editBlog.status==="published"?"on":""}`}><div className="toggle-thumb"/></div>
                </div>
              </div>
              <div className="toggle-row" style={{background:"rgba(139,0,255,0.05)",borderRadius:10,padding:"10px 14px"}}>
                <span className="toggle-label">⭐ Featured Post</span>
                <div className="toggle-switch" onClick={()=>setEditBlog(p=>({...p,featured:!p.featured}))}>
                  <div className={`toggle-track ${editBlog.featured?"on":""}`}><div className="toggle-thumb"/></div>
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{marginTop:"20px"}}>
              <button className="modal-cancel" onClick={()=>setBlogModal(null)}>Cancel</button>
              <button className="modal-save" onClick={saveBlog} disabled={!editBlog.title}>
                {editBlog.status==="published"?"Publish Post":"Save Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-layout">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="sidebar-logo-text">FIRESTICK4UK</div>
            <div className="sidebar-label">Admin Panel</div>
          </div>
          <nav className="sidebar-nav">
            {([
              { id:"dashboard", icon:"📊", label:"Dashboard" },
              { id:"orders", icon:"🛒", label:"Orders", badge: pendingCount > 0 ? String(pendingCount) : null, badgeColor:"orange" },
              { id:"products", icon:"📦", label:"Products" },
              { id:"customers", icon:"👥", label:"Customers" },
              { id:"blog", icon:"📝", label:"Blog" },
            ] as const).map(item => (
              <button key={item.id} className={`nav-item ${tab===item.id?"active":""}`} onClick={() => setTab(item.id)}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
                {"badge" in item && item.badge && <span className={`nav-badge ${item.badgeColor||""}`}>{item.badge}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button className="logout-btn" onClick={handleLogout}>
              <span>🚪</span> Logout
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="main-content">
          <div className="top-bar">
            <h1 className="page-heading">
              {tab==="dashboard" && <>Dashboard <span>Overview</span></>}
              {tab==="orders" && <>Manage <span>Orders</span></>}
              {tab==="products" && <>Manage <span>Products</span></>}
              {tab==="customers" && <>Customer <span>Data</span></>}
              {tab==="blog" && <>Manage <span>Blog</span></>}
            </h1>
            <div className="top-right">
              <span className="admin-badge">👤 Admin</span>
            </div>
          </div>

          {/* DASHBOARD */}
          {tab==="dashboard" && (
            <>
              <div className="stats-grid">
                {[
                  { icon:"🛒", label:"Total Orders", value:orders.length, trend:"+3 today" },
                  { icon:"⏳", label:"Pending Orders", value:pendingCount, trend:"Needs action" },
                  { icon:"💰", label:"Total Revenue", value:"£408.93", trend:"This month" },
                  { icon:"👥", label:"Customers", value:demoCustomers.length, trend:"+2 this week" },
                  { icon:"📦", label:"Products", value:products.length, trend:"Active" },
                  { icon:"✅", label:"Delivered", value:orders.filter(o=>o.status==="delivered").length, trend:"All time" },
                ].map((s,i) => (
                  <div className="stat-card" key={i}>
                    <div className="stat-card-top">
                      <span className="stat-icon">{s.icon}</span>
                      <span className="stat-trend">{s.trend}</span>
                    </div>
                    <div className="stat-value">{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* RECENT ORDERS */}
              <div className="section-card">
                <div className="section-header">
                  <div className="section-title">Recent Orders</div>
                  <button className="add-btn" onClick={() => setTab("orders")}>View All →</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                      {orders.slice(0,4).map(o => (
                        <tr key={o.id}>
                          <td style={{fontFamily:"monospace",color:"var(--purple-glow)"}}>{o.id}</td>
                          <td>{o.customer}</td>
                          <td style={{maxWidth:"180px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.items}</td>
                          <td style={{fontWeight:700}}>{o.total}</td>
                          <td><span className={statusClass(o.status)}>{o.status}</span></td>
                          <td><button className="action-btn btn-view" onClick={() => setOrderModal(o)}>View</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ORDERS */}
          {tab==="orders" && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-title">All Orders ({filteredOrders.length})</div>
                <div className="section-actions">
                  <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="dispatched">Dispatched</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Date</th><th>Payment</th><th>Receipt</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredOrders.map(o => (
                      <tr key={o.id}>
                        <td style={{fontFamily:"monospace",color:"var(--purple-glow)",whiteSpace:"nowrap"}}>{o.id}</td>
                        <td style={{whiteSpace:"nowrap"}}>{o.customer}</td>
                        <td style={{maxWidth:"140px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.items}</td>
                        <td style={{fontWeight:700,whiteSpace:"nowrap"}}>{o.total}</td>
                        <td style={{whiteSpace:"nowrap",color:"rgba(255,255,255,0.4)",fontSize:"12px"}}>{o.date}</td>
                        <td>
                          {(o as any).payment === "cod"
                            ? <span style={{fontSize:"11px",padding:"3px 9px",borderRadius:"10px",background:"rgba(0,200,100,0.1)",border:"1px solid rgba(0,200,100,0.3)",color:"#00c864",fontWeight:700}}>💵 COD</span>
                            : <span style={{fontSize:"11px",padding:"3px 9px",borderRadius:"10px",background:"rgba(68,136,255,0.1)",border:"1px solid rgba(68,136,255,0.3)",color:"#6699ff",fontWeight:700}}>🏦 Bank</span>
                          }
                        </td>
                        <td>
                          {o.receipt
                            ? <button className="action-btn btn-view" style={{fontSize:"11px",padding:"4px 10px"}} onClick={() => setReceiptModal(o.id)}>View Receipt</button>
                            : <span style={{color:"rgba(255,255,255,0.25)",fontSize:"11px"}}>No Receipt</span>
                          }
                        </td>
                        <td><span className={statusClass(o.status)}>{o.status}</span></td>
                        <td style={{whiteSpace:"nowrap"}}>
                          <button className="action-btn btn-view" onClick={() => setOrderModal(o)}>View</button>
                          {o.status==="pending" && o.receipt && <button className="action-btn btn-verify" onClick={() => setReceiptModal(o.id)}>Verify</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PRODUCTS */}
          {tab==="products" && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-title">Products ({products.length})</div>
                <button className="add-btn" onClick={openNewProduct}>+ Add Product</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Image</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id}>
                        <td><div className="product-thumb">{p.emoji}</div></td>
                        <td style={{fontWeight:600}}>{p.name}</td>
                        <td><span style={{background:"rgba(139,0,255,0.1)",border:"1px solid rgba(139,0,255,0.2)",padding:"3px 10px",borderRadius:"10px",fontSize:"12px"}}>{p.category}</span></td>
                        <td style={{fontWeight:700,color:"var(--purple-glow)"}}>{p.price}</td>
                        <td>{p.stock}</td>
                        <td>
                          <button className="action-btn btn-edit" onClick={() => openEditProduct(p)}>Edit</button>
                          <button className="action-btn btn-delete" onClick={() => deleteProduct(p.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BLOG */}
          {tab==="blog" && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-title">Blog Posts ({blogPosts.length})</div>
                <button className="add-btn" onClick={() => { setEditBlog(defaultBlog); setTimeout(()=>{if(editorRef.current)editorRef.current.innerHTML="";},50); setBlogModal("new"); }}>+ Add Post</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Image</th><th>Title</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {blogPosts.length === 0 && (
                      <tr><td colSpan={5} style={{textAlign:"center",color:"rgba(255,255,255,0.3)",padding:"24px"}}>No blog posts yet. Add your first post above.</td></tr>
                    )}
                    {blogPosts.map(p => (
                      <tr key={p.id}>
                        <td>{p.featured_image ? <img src={p.featured_image} alt="" style={{width:44,height:44,objectFit:"cover",borderRadius:6,border:"1px solid rgba(139,0,255,0.3)"}} /> : <span style={{fontSize:"20px"}}>{p.emoji||"📝"}</span>}</td>
                        <td style={{fontWeight:600,maxWidth:"240px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.featured?<span style={{color:"var(--gold)",marginRight:4}}>⭐</span>:null}{p.title}</td>
                        <td><span style={{background:"rgba(139,0,255,0.1)",border:"1px solid rgba(139,0,255,0.2)",padding:"3px 10px",borderRadius:"10px",fontSize:"12px"}}>{p.category}</span></td>
                        <td><span style={{fontSize:"11px",padding:"3px 10px",borderRadius:"10px",fontWeight:700,background:p.status==="published"?"rgba(0,200,100,0.12)":"rgba(255,180,0,0.12)",border:p.status==="published"?"1px solid rgba(0,200,100,0.3)":"1px solid rgba(255,180,0,0.3)",color:p.status==="published"?"#00c864":"#ffb400"}}>{p.status==="published"?"Published":"Draft"}</span></td>
                        <td style={{whiteSpace:"nowrap"}}>
                          <button className="action-btn btn-edit" onClick={() => { setEditBlog({title:p.title,slug:p.slug||"",excerpt:p.excerpt||"",content:p.content||"",category:p.category||"Guides",emoji:p.emoji||"📝",badge:p.badge||"guide",badgeText:p.badgeText||"Guide",featured_image:p.featured_image||"",meta_title:p.meta_title||"",meta_description:p.meta_description||"",focus_keyword:p.focus_keyword||"",status:p.status||"published",featured:!!p.featured}); setBlogModal(p); setTimeout(()=>{if(editorRef.current)editorRef.current.innerHTML=p.content||"";},80); }}>Edit</button>
                          <button className="action-btn btn-delete" onClick={() => deleteBlog(p.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CUSTOMERS */}
          {tab==="customers" && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-title">Customers ({customers.length})</div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th></th><th>Name</th><th>Email</th><th>Phone / WhatsApp</th><th>Orders</th><th>Total Spent</th><th>Joined</th><th>Actions</th></tr></thead>
                  <tbody>
                    {customers.map((c,i) => (
                      <tr key={i}>
                        <td><div className="customer-avatar">{c.name[0]}</div></td>
                        <td style={{fontWeight:600}}>{c.name}</td>
                        <td style={{color:"rgba(255,255,255,0.5)",fontSize:"13px"}}>{c.email}</td>
                        <td style={{fontSize:"13px"}}>{c.phone}</td>
                        <td><span style={{fontWeight:700,color:"var(--purple-glow)"}}>{c.orders}</span></td>
                        <td style={{fontWeight:700}}>{c.spent}</td>
                        <td style={{color:"rgba(255,255,255,0.4)",fontSize:"12px"}}>{c.joined}</td>
                        <td>
                          <a href={`https://wa.me/${c.phone.replace(/\s+/g,"").replace("+","")}`} target="_blank" rel="noopener noreferrer">
                            <button className="action-btn btn-verify">WhatsApp</button>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}