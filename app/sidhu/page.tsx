"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
const TipTapEditor = dynamic(() => import("../../components/admin/TipTapEditor"), { ssr: false });

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  :root { --purple:#5B21B6; --purple-dark:#4C1D95; --black:#1A1A1A; --text:#111111; --border:#E5E5E5; --gray:#F5F5F5; --gray-text:#666666; --green:#16A34A; --red:#DC2626; --orange:#EA580C; --blue:#2563EB; }
  body { background:#F5F5F5; color:#111111; font-family:'Raleway',sans-serif; overflow-x:hidden; }

  /* LOGIN */
  .login-screen { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#F5F5F5; }
  .login-box { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:16px; padding:48px 40px; width:100%; max-width:420px; text-align:center; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
  .login-logo { font-family:'Cinzel',serif; font-size:22px; font-weight:900; color:#111111; margin-bottom:6px; }
  .login-sub { font-size:12px; color:#666666; margin-bottom:32px; letter-spacing:2px; text-transform:uppercase; }
  .login-input { width:100%; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:8px; padding:12px 16px; color:#111111; font-family:'Raleway',sans-serif; font-size:14px; outline:none; margin-bottom:12px; transition:border-color 0.2s; }
  .login-input:focus { border-color:#5B21B6; box-shadow:0 0 0 3px rgba(91,33,182,0.1); }
  .login-input::placeholder { color:#999999; }
  .login-btn { width:100%; background:#5B21B6; color:#FFFFFF; border:none; padding:14px; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer; transition:all 0.2s; margin-top:4px; }
  .login-btn:hover { background:#4C1D95; transform:translateY(-1px); box-shadow:0 4px 12px rgba(91,33,182,0.3); }
  .login-error { color:#DC2626; font-size:13px; margin-top:10px; }

  /* LAYOUT */
  .admin-layout { display:flex; min-height:100vh; }

  /* SIDEBAR */
  .sidebar { width:240px; flex-shrink:0; background:#111111; border-right:none; display:flex; flex-direction:column; position:fixed; top:0; left:0; bottom:0; z-index:50; color:#FFFFFF; }
  .sidebar * { color:#FFFFFF; }
  .sidebar-logo { padding:24px 20px 18px; border-bottom:1px solid rgba(255,255,255,0.1); }
  .sidebar-logo-text { font-family:'Cinzel',serif; font-size:15px; font-weight:900; color:#FFFFFF !important; letter-spacing:1px; }
  .sidebar-label { font-size:10px; color:#AAAAAA !important; letter-spacing:3px; text-transform:uppercase; margin-top:3px; }
  .sidebar-nav { flex:1; padding:16px 10px; display:flex; flex-direction:column; gap:3px; }
  .nav-item { display:flex; align-items:center; gap:10px; padding:11px 12px; border-radius:8px; cursor:pointer; transition:all 0.15s; color:#CCCCCC !important; font-size:13px; font-weight:500; border:none; background:none; width:100%; text-align:left; }
  .nav-item:hover { background:rgba(255,255,255,0.08); color:#FFFFFF !important; }
  .nav-item.active { background:#5B21B6; color:#FFFFFF !important; }
  .nav-icon { font-size:16px; width:20px; text-align:center; color:#FFFFFF !important; }
  .nav-badge { margin-left:auto; background:#EA580C; color:#FFFFFF !important; font-size:10px; font-weight:700; padding:2px 7px; border-radius:20px; }
  .nav-badge.orange { background:#EA580C; color:#FFFFFF !important; }
  .sidebar-footer { padding:14px 10px; border-top:1px solid rgba(255,255,255,0.1); }
  .logout-btn { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px; cursor:pointer; color:#FF9999 !important; font-size:13px; border:none; background:none; width:100%; transition:all 0.15s; }
  .logout-btn:hover { background:rgba(220,38,38,0.15); color:#FF6666 !important; }

  /* MAIN */
  .main-content { margin-left:240px; flex:1; padding:28px; min-height:100vh; background:#F5F5F5; }
  .top-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
  .page-heading { font-family:'Cinzel',serif; font-size:22px; font-weight:700; color:#111111; }
  .page-heading span { color:#5B21B6; }
  .top-right { display:flex; align-items:center; gap:14px; position:relative; }
  .admin-badge { background:#F5F5F5; border:1px solid #E5E5E5; color:#666666; font-size:12px; padding:6px 14px; border-radius:20px; }
  .admin-user-btn { display:flex; align-items:center; gap:6px; background:#F5F5F5; border:1px solid #E5E5E5; color:#111111; font-size:13px; font-weight:500; padding:7px 14px; border-radius:20px; cursor:pointer; transition:all 0.15s; }
  .admin-user-btn:hover { background:#EEEEEE; border-color:#CCCCCC; }
  .admin-dropdown { position:absolute; top:calc(100% + 8px); right:0; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:10px; min-width:160px; box-shadow:0 4px 20px rgba(0,0,0,0.12); z-index:200; overflow:hidden; }
  .admin-dropdown-header { padding:12px 16px 10px; border-bottom:1px solid #F0F0F0; }
  .admin-dropdown-name { font-size:14px; font-weight:600; color:#111111; }
  .admin-dropdown-role { font-size:11px; color:#888888; margin-top:1px; }
  .admin-dropdown-item { display:flex; align-items:center; gap:10px; padding:11px 16px; font-size:13px; cursor:pointer; color:#111111; transition:background 0.15s; border:none; background:none; width:100%; text-align:left; }
  .admin-dropdown-item:hover { background:#F5F5F5; }
  .admin-dropdown-item.danger { color:#DC2626; }
  .admin-dropdown-item.danger:hover { background:#FEF2F2; }

  /* STATS */
  .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; margin-bottom:24px; }
  .stat-card { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:12px; padding:20px 18px; box-shadow:0 1px 4px rgba(0,0,0,0.04); }
  .stat-card-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; }
  .stat-icon { font-size:26px; }
  .stat-trend { font-size:11px; color:#16A34A; background:rgba(22,163,74,0.1); padding:3px 8px; border-radius:8px; }
  .stat-value { font-family:'Cinzel',serif; font-size:26px; font-weight:700; color:#111111; margin-bottom:3px; }
  .stat-label { font-size:11px; color:#666666; letter-spacing:1px; text-transform:uppercase; }

  /* TABLE */
  .section-card { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:12px; overflow:hidden; margin-bottom:20px; box-shadow:0 1px 4px rgba(0,0,0,0.04); }
  .section-header { padding:18px 20px; border-bottom:1px solid #E5E5E5; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
  .section-title { font-family:'Cinzel',serif; font-size:15px; font-weight:700; color:#111111; }
  .section-actions { display:flex; gap:8px; flex-wrap:wrap; }
  .filter-select { background:#F5F5F5; border:1px solid #E5E5E5; color:#111111; padding:7px 12px; border-radius:8px; font-size:13px; outline:none; cursor:pointer; }
  .filter-select option { background:#FFFFFF; color:#111111; }
  .add-btn { background:#5B21B6; color:#FFFFFF; border:none; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.15s; }
  .add-btn:hover { background:#4C1D95; }

  .table-wrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; }
  th { padding:11px 16px; text-align:left; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#666666; border-bottom:1px solid #E5E5E5; white-space:nowrap; background:#F9F9F9; font-weight:600; }
  td { padding:13px 16px; font-size:13px; color:#333333; border-bottom:1px solid #F0F0F0; vertical-align:middle; }
  tr:last-child td { border-bottom:none; }
  tr:hover td { background:#FAFAFA; }

  .status-badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; }
  .status-pending { background:rgba(234,88,12,0.1); border:1px solid rgba(234,88,12,0.25); color:#EA580C; }
  .status-confirmed { background:rgba(91,33,182,0.1); border:1px solid rgba(91,33,182,0.3); color:#5B21B6; }
  .status-dispatched { background:rgba(37,99,235,0.1); border:1px solid rgba(37,99,235,0.25); color:#2563EB; }
  .status-delivered { background:rgba(22,163,74,0.1); border:1px solid rgba(22,163,74,0.3); color:#16A34A; }

  .action-btn { padding:5px 11px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; border:none; transition:all 0.15s; margin-right:4px; }
  .btn-view { background:#F5F5F5; color:#5B21B6; border:1px solid #E5E5E5; }
  .btn-view:hover { background:#5B21B6; color:#FFFFFF; border-color:#5B21B6; }
  .btn-verify { background:rgba(22,163,74,0.08); color:#16A34A; border:1px solid rgba(22,163,74,0.25); }
  .btn-verify:hover { background:#16A34A; color:#FFFFFF; }
  .btn-delete { background:rgba(220,38,38,0.08); color:#DC2626; border:1px solid rgba(220,38,38,0.2); }
  .btn-delete:hover { background:#DC2626; color:#FFFFFF; }
  .btn-edit { background:rgba(91,33,182,0.08); color:#5B21B6; border:1px solid rgba(91,33,182,0.2); }
  .btn-edit:hover { background:#5B21B6; color:#FFFFFF; }

  .modal-product { max-width:760px; width:96vw; max-height:92vh; }
  .seo-box { background:#F9F9F9; border:1px solid #E5E5E5; border-radius:10px; padding:16px; margin-top:4px; }
  .seo-box-title { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#666666; margin-bottom:12px; }
  .char-bar { height:3px; border-radius:3px; margin-top:5px; transition:width 0.2s; }

  /* BLOG EDITOR */
  .modal-blog { max-width:900px; width:96vw; max-height:92vh; }
  .editor-toolbar { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; padding:8px; background:#F5F5F5; border:1px solid #E5E5E5; border-radius:8px; }
  .tool-btn { background:#FFFFFF; border:1px solid #E5E5E5; color:#333333; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; transition:all 0.15s; }
  .tool-btn:hover { background:#5B21B6; color:#FFFFFF; border-color:#5B21B6; }
  .tool-sep { width:1px; background:#E5E5E5; margin:2px 4px; }
  .rich-editor { min-height:200px; max-height:300px; overflow-y:auto; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:10px; padding:14px 16px; color:#111111; font-size:14px; line-height:1.7; outline:none; }
  .rich-editor:focus { border-color:#5B21B6; }
  .rich-editor h2 { font-size:20px; font-weight:700; margin:12px 0 6px; color:#111111; }
  .rich-editor h3 { font-size:16px; font-weight:600; margin:10px 0 4px; color:#5B21B6; }
  .rich-editor ul, .rich-editor ol { padding-left:20px; margin:6px 0; }
  .rich-editor li { margin:3px 0; }
  .rich-editor blockquote { border-left:3px solid #5B21B6; padding-left:12px; color:#666666; margin:8px 0; font-style:italic; }
  .rich-editor a { color:#5B21B6; }
  .seo-section { background:#F9F9F9; border:1px solid #E5E5E5; border-radius:10px; padding:16px; margin-top:4px; }
  .seo-section h5 { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#666666; margin-bottom:12px; }
  .char-count { font-size:11px; color:#999999; text-align:right; margin-top:3px; }
  .char-warn { color:#EA580C; }
  .toggle-row { display:flex; align-items:center; justify-content:space-between; padding:8px 0; }
  .toggle-label { font-size:13px; color:#333333; }
  .toggle-switch { position:relative; width:44px; height:24px; }
  .toggle-switch input { display:none; }
  .toggle-track { position:absolute; inset:0; background:#E5E5E5; border-radius:12px; cursor:pointer; transition:background 0.2s; }
  .toggle-track.on { background:#5B21B6; }
  .toggle-thumb { position:absolute; top:3px; left:3px; width:18px; height:18px; background:white; border-radius:50%; transition:left 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.2); }
  .toggle-track.on .toggle-thumb { left:23px; }
  /* RECEIPT */
  .receipt-thumb { width:40px; height:40px; border-radius:8px; background:#F5F5F5; border:1px solid #E5E5E5; display:flex; align-items:center; justify-content:center; font-size:18px; cursor:pointer; }

  /* PRODUCT IMAGE */
  .product-thumb { width:44px; height:44px; border-radius:8px; background:#F5F5F5; border:1px solid #E5E5E5; display:flex; align-items:center; justify-content:center; font-size:22px; }

  /* MODAL */
  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:200; display:flex; align-items:center; justify-content:center; padding:20px; }
  .modal { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:16px; padding:32px; max-width:550px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 8px 32px rgba(0,0,0,0.12); }
  .modal-title { font-family:'Cinzel',serif; font-size:18px; font-weight:700; color:#111111; margin-bottom:24px; }
  .modal-field { margin-bottom:16px; }
  .modal-field label { display:block; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#666666; margin-bottom:7px; font-weight:600; }
  .modal-field input, .modal-field select, .modal-field textarea { width:100%; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:8px; padding:11px 14px; color:#111111; font-family:'Raleway',sans-serif; font-size:14px; outline:none; transition:border-color 0.2s; }
  .modal-field input:focus, .modal-field select:focus, .modal-field textarea:focus { border-color:#5B21B6; box-shadow:0 0 0 3px rgba(91,33,182,0.1); }
  .modal-field select option { background:#FFFFFF; color:#111111; }
  .modal-actions { display:flex; gap:12px; justify-content:flex-end; margin-top:24px; }
  .modal-cancel { background:#F5F5F5; color:#666666; border:1px solid #E5E5E5; padding:10px 22px; border-radius:8px; cursor:pointer; font-size:14px; transition:all 0.15s; }
  .modal-cancel:hover { background:#E5E5E5; }
  .modal-save { background:#5B21B6; color:#FFFFFF; border:none; padding:10px 22px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.15s; }
  .modal-save:hover { background:#4C1D95; }
  .btn-primary { background:#5B21B6; color:#FFFFFF; border:none; padding:10px 22px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.15s; }
  .btn-primary:hover { background:#4C1D95; }

  /* RECEIPT MODAL */
  .receipt-preview { background:#F5F5F5; border:1px solid #E5E5E5; border-radius:12px; padding:24px; text-align:center; font-size:40px; margin-bottom:16px; }

  /* CUSTOMERS */
  .customer-avatar { width:36px; height:36px; border-radius:50%; background:#5B21B6; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:#FFFFFF; }

  .sidebar-hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;background:#111111;border:none;padding:10px;margin-right:12px;border-radius:8px;min-width:44px;min-height:44px;align-items:center;justify-content:center;}
  .sidebar-hamburger:hover{background:#5B21B6;}
  .sidebar-hamburger span{display:block;width:22px;height:2px;background:#FFFFFF;border-radius:2px;transition:all 0.2s;}
  .sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:49;}
  @media(max-width:900px){
    .sidebar{transform:translateX(-100%);transition:transform 0.28s ease;z-index:50;}
    .sidebar.open{transform:translateX(0);}
    .sidebar-overlay{display:block;}
    .sidebar-hamburger{display:flex;}
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
  { id:"FK44-62305", customer:"John Smith", email:"john@example.com", phone:"+447934519060", items:"B1G 6 Month Plan + Firestick 4K", total:"£89.98", status:"confirmed", date:"30 May 2026", receipt:true },
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
  { name:"John Smith", email:"john@example.com", phone:"+447934519060", orders:3, spent:"£219.96", joined:"Jan 2026" },
  { name:"Sarah Jones", email:"sarah@example.com", phone:"+44 7111 111111", orders:2, spent:"£123.97", joined:"Feb 2026" },
  { name:"Ali Hassan", email:"ali@example.com", phone:"+44 7222 222222", orders:1, spent:"£79.99", joined:"May 2026" },
  { name:"David Brown", email:"david@example.com", phone:"+44 7333 333333", orders:4, spent:"£189.95", joined:"Dec 2025" },
  { name:"Emma Wilson", email:"emma@example.com", phone:"+44 7444 444444", orders:1, spent:"£9.99", joined:"May 2026" },
];

type Tab = "dashboard"|"orders"|"products"|"customers"|"leads"|"training"|"blog"|"settings"|"pages"|"coupons"|"builder"|"faqadmin"|"staff";
type AdminRole = "super_admin"|"manager"|"writer";
type OrderStatus = "pending"|"confirmed"|"dispatched"|"delivered";
type BlogPost = { id:number; title:string; slug:string; excerpt:string; content:string; category:string; emoji:string; badge:string; badgeText:string; featured_image:string; meta_title:string; meta_description:string; focus_keyword:string; status:"published"|"draft"; featured:boolean; canonical_url:string; faqs:Array<{question:string;answer:string}>; };
type ChatLead = { id:number; customer_name:string; customer_whatsapp:string; customer_email:string|null; interested_in:string; chat_history:string; ip_address:string; created_at:string; };
type BerlinTraining = { id:number; title:string; content:string; is_active:number; created_at:string; updated_at:string; };
type TrainingChatMessage = { role:"user"|"assistant"; content:string; saved?:boolean; };

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole>("super_admin");
  const [adminName, setAdminName] = useState("Admin");
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [staffForm, setStaffForm] = useState({ name:"", email:"", password:"", role:"writer" });
  const [staffModal, setStaffModal] = useState<any>(null);
  const [staffMsg, setStaffMsg] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminDropOpen, setAdminDropOpen] = useState(false);
  const [orders, setOrders] = useState(demoOrders);
  const [products, setProducts] = useState(demoProducts);
  const [statusFilter, setStatusFilter] = useState("all");
  const [ordersPage, setOrdersPage] = useState(1);
  const ORDERS_PER_PAGE = 20;
  const [receiptModal, setReceiptModal] = useState<string|null>(null);
  const [orderModal, setOrderModal] = useState<typeof demoOrders[0]|null>(null);
  const [productModal, setProductModal] = useState<typeof demoProducts[0]|null|"new">(null);
  const [editProduct, setEditProduct] = useState({ name:"", category:"", price:"", stock:"", image:"", short_description:"", full_description:"", features:"", seo_title:"", meta_description:"", focus_keyword:"" });
  const [imageUploading, setImageUploading] = useState(false);
  const [heroImgUploading, setHeroImgUploading] = useState(false);
  const [customers, setCustomers] = useState(demoCustomers);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponForm, setCouponForm] = useState({ code:"", type:"percentage", value:"", minimum_order:"0", usage_limit:"", expires_at:"" });
  const [couponMsg, setCouponMsg] = useState("");
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogMsg, setBlogMsg] = useState("");
  const [blogModal, setBlogModal] = useState<BlogPost|"new"|null>(null);
  const [featImgUploading, setFeatImgUploading] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const defaultBlog = { title:"", slug:"", excerpt:"", content:"", category:"Guides", emoji:"📝", badge:"guide", badgeText:"Guide", featured_image:"", meta_title:"", meta_description:"", focus_keyword:"", status:"published" as "published"|"draft", featured:false, canonical_url:"", faqs:[] as Array<{question:string;answer:string}> };
  const [editBlog, setEditBlog] = useState<typeof defaultBlog>(defaultBlog);

  // Site Content
  const [siteContent, setSiteContent] = useState<Record<string,string>>({});
  const [contentSaving, setContentSaving] = useState(false);
  const [contentMsg, setContentMsg] = useState("");
  const [activePage, setActivePage] = useState("home");
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [ogImgUploading, setOgImgUploading] = useState(false);

  // Page Builder
  type SectionItem = { key:string; label:string; page:string; order:number; visible:boolean; data:any; };
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [builderPage, setBuilderPage] = useState("home");
  const [sectionModal, setSectionModal] = useState<SectionItem|null>(null);
  const [sectionEditing, setSectionEditing] = useState<any>({});
  const [sectionMsg, setSectionMsg] = useState("");

  // FAQs
  type FAQ = { id:number; question:string; answer:string; category:string; sort_order:number; is_visible:number; };
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [faqModal, setFaqModal] = useState<FAQ|"new"|null>(null);
  const [editFaq, setEditFaq] = useState({ question:"", answer:"", category:"General" });
  const [faqMsg, setFaqMsg] = useState("");
  const [chatLeads, setChatLeads] = useState<ChatLead[]>([]);
  const [leadModal, setLeadModal] = useState<ChatLead|null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [leadWindowStart] = useState(() => Date.now() - 24 * 60 * 60 * 1000);
  const [berlinTraining, setBerlinTraining] = useState<BerlinTraining[]>([]);
  const [trainingForm, setTrainingForm] = useState({ id:0, title:"", content:"", is_active:true });
  const [trainingMsg, setTrainingMsg] = useState("");
  const [trainingChat, setTrainingChat] = useState<TrainingChatMessage[]>([
    { role:"assistant", content:"Professor, Berlin is ready. Ask me what I know, test my answers, or say 'save this' when you want a correction added to my training." },
  ]);
  const [trainingChatInput, setTrainingChatInput] = useState("");
  const [trainingChatLoading, setTrainingChatLoading] = useState(false);
  const trainingChatInputRef = useRef<HTMLInputElement>(null);
  const trainingChatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localStorage.getItem("sAdminSession") === "true") {
      setLoggedIn(true);
      setAdminRole((localStorage.getItem("sAdminRole") || "super_admin") as AdminRole);
      setAdminName(localStorage.getItem("sAdminName") || "Admin");
    }
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    // Fix 2 — include session header for admin API auth
    const session = localStorage.getItem("sAdminSession") || "";
    const adminHeaders = { "x-admin-session": session };
    fetch("/api/admin-products", { headers: adminHeaders })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data) && data.length > 0) setProducts(data); })
      .catch(() => {});
    fetch("/api/admin-orders", { headers: adminHeaders })
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
            payment_reference: o.payment_reference || "",
          })));
        }
      })
      .catch(() => {});
    fetch("/api/blog")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setBlogPosts(data); })
      .catch(() => {});
    fetch("/api/admin-orders?customers=1", { headers: adminHeaders })
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
    fetch("/api/coupons").then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setCoupons(d); }).catch(()=>{});
    fetch("/api/site-content?page=all")
      .then(r => r.json())
      .then(d => { if (d && typeof d === "object") setSiteContent(d); })
      .catch(() => {});
    fetch("/api/sections?page=home&all=1").then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setSections(d); }).catch(()=>{});
    fetch("/api/faqs?admin=true").then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setFaqs(d); }).catch(()=>{});
    fetch("/api/admin/leads", { headers: adminHeaders })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          setChatLeads(d);
          setSelectedLeadIds([]);
        }
      })
      .catch(() => {});
    fetch("/api/admin/berlin-training", { headers: adminHeaders })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setBerlinTraining(d); })
      .catch(() => {});
    fetch("/api/admin/berlin-training-chat", { headers: adminHeaders })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setTrainingChat(d.map((m: TrainingChatMessage) => ({ role:m.role, content:m.content, saved:!!m.saved })));
        }
      })
      .catch(() => {});
    if (adminRole === "super_admin") {
      fetch("/api/admin-staff", { headers: { "x-admin-session": localStorage.getItem("sAdminSession")||"", "x-admin-role": "super_admin" } })
        .then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setStaffUsers(d); }).catch(()=>{});
    }
  }, [loggedIn]);

  useEffect(() => {
    if (tab !== "training") return;
    trainingChatEndRef.current?.scrollIntoView({ behavior:"smooth", block:"end" });
    if (!trainingChatLoading) {
      const focusTimer = window.setTimeout(() => trainingChatInputRef.current?.focus(), 50);
      return () => window.clearTimeout(focusTimer);
    }
  }, [tab, trainingChat, trainingChatLoading]);

  const saveContent = async (keys: string[]) => {
    setContentSaving(true); setContentMsg("");
    const updates = keys.map(k => ({ key: k, value: siteContent[k] || "" }));
    const res = await fetch("/api/site-content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }) }).then(r => r.json()).catch(() => ({}));
    setContentSaving(false);
    setContentMsg(res.success ? "✅ Saved!" : "❌ Save failed");
    setTimeout(() => setContentMsg(""), 3000);
  };

  const uploadFaviconAdmin = async (file: File) => {
    setFaviconUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
      const data = await fetch("/api/upload-favicon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: base64, name: file.name }) }).then(r => r.json());
      if (data.url) setSiteContent(s => ({ ...s, favicon_url: data.url }));
      setContentMsg("✅ Favicon uploaded!");
    } catch { setContentMsg("❌ Upload failed"); }
    setFaviconUploading(false);
    setTimeout(() => setContentMsg(""), 3000);
  };

  const handleLogin = async () => {
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }).then(r => r.json());
      if (res.success) {
        localStorage.setItem("sAdminSession", "true");
        localStorage.setItem("sAdminRole", res.role || "super_admin");
        localStorage.setItem("sAdminName", res.name || "Admin");
        setAdminRole((res.role || "super_admin") as AdminRole);
        setAdminName(res.name || "Admin");
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
    localStorage.removeItem("sAdminSession");
    localStorage.removeItem("sAdminRole");
    localStorage.removeItem("sAdminName");
    setLoggedIn(false);
    setAdminRole("super_admin");
  };

  // Helper: pass role in all admin API headers (SSR-safe)
  const getRoleHeaders = () => ({
    "x-admin-session": typeof window !== "undefined" ? localStorage.getItem("sAdminSession")||"" : "",
    "x-admin-role": adminRole,
  });

  const loadStaff = () => {
    fetch("/api/admin-staff", { headers: getRoleHeaders() })
      .then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setStaffUsers(d); }).catch(()=>{});
  };

  const saveStaff = async () => {
    if (!staffForm.name||!staffForm.email) { setStaffMsg("❌ Name and email required"); return; }
    if (staffModal==="new" && !staffForm.password) { setStaffMsg("❌ Password required"); return; }
    const method = staffModal==="new" ? "POST" : "PUT";
    const body = staffModal==="new" ? staffForm : { ...staffForm, id: staffModal.id };
    const res = await fetch("/api/admin-staff",{method,headers:{...getRoleHeaders(),"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json()).catch(()=>({}));
    if (res.success) { setStaffMsg("✅ Saved!"); setStaffModal(null); loadStaff(); }
    else setStaffMsg(`❌ ${res.error||"Failed"}`);
    setTimeout(()=>setStaffMsg(""),3000);
  };

  const deleteStaff = async (id:number) => {
    if (!confirm("Delete this staff user?")) return;
    await fetch(`/api/admin-staff?id=${id}`,{method:"DELETE",headers:getRoleHeaders()});
    loadStaff();
  };

  const updateStatus = (id: string, status: OrderStatus) => {
    fetch("/api/admin-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-session": localStorage.getItem("sAdminSession")||"" },
      body: JSON.stringify({ order_id: id, status }),
    }).catch(() => {});
    setOrders(orders.map(o => o.id === id ? { ...o, status } : o));
    setOrderModal(null);
  };

  const deleteOrder = async (orderId: string, total: string, status: string) => {
    const amountNum = parseFloat((total||"0").replace("£","").replace(",",""));
    const isRevenue = ["confirmed","dispatched","delivered"].includes(status);
    const msg = `⚠️ Delete order ${orderId}?\n\nAmount: ${total}\nStatus: ${status.toUpperCase()}${isRevenue ? `\n\n💰 This will reverse £${amountNum.toFixed(2)} from confirmed revenue.` : ""}\n\nThis cannot be undone.`;
    if (!confirm(msg)) return;
    const res = await fetch("/api/admin-orders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-admin-session": localStorage.getItem("sAdminSession")||"" },
      body: JSON.stringify({ order_id: orderId }),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setOrders(prev => prev.filter(o => o.id !== orderId));
      setOrderModal(null);
    } else {
      alert(`❌ Delete failed: ${res.error || "Unknown error"}`);
    }
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
    try {
      document.execCommand(cmd, false, val ?? undefined);
    } catch (_) {}
    const html = editorRef.current?.innerHTML ?? "";
    if (html) setEditBlog(p=>({...p, content: html}));
  }, []);

  const fetchBlogs = () => {
    fetch("/api/blog").then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setBlogPosts(d); }).catch(()=>{});
  };

  const saveBlog = async () => {
    const content = editorRef.current?.innerHTML || editBlog.content;
    const payload = { ...editBlog, content };
    const isNew = blogModal === "new";
    const res = await fetch("/api/blog", {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json", "x-admin-session": localStorage.getItem("sAdminSession")||"" },
      body: JSON.stringify(isNew ? payload : { ...payload, id: (blogModal as BlogPost).id }),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setBlogMsg(isNew ? "✅ Post published!" : "✅ Post updated!");
      setBlogModal(null);
      fetchBlogs();
    } else {
      setBlogMsg(`❌ ${res.error || "Save failed"}`);
    }
    setTimeout(()=>setBlogMsg(""),3000);
  };

  const deleteBlog = async (id: number) => {
    if (!confirm("Delete this blog post?")) return;
    const res = await fetch(`/api/blog?id=${id}`, { method: "DELETE", headers: { "x-admin-session": localStorage.getItem("sAdminSession")||"" } }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setBlogPosts(blogPosts.filter(p => p.id !== id));
      setBlogMsg("✅ Post deleted");
    } else {
      setBlogMsg(`❌ ${res.error || "Delete failed"}`);
    }
    setTimeout(()=>setBlogMsg(""),3000);
  };

  const deleteProduct = (id: number) => {
    fetch(`/api/admin-products?id=${id}`, { method: "DELETE", headers: { "x-admin-session": localStorage.getItem("sAdminSession")||"" } }).catch(() => {});
    setProducts(products.filter(p => p.id !== id));
  };

  const deleteLead = async (id: number) => {
    if (!confirm("Delete this chat lead?")) return;
    const res = await fetch(`/api/admin/leads?id=${id}`, {
      method: "DELETE",
      headers: { "x-admin-session": localStorage.getItem("sAdminSession")||"" },
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setChatLeads(prev => prev.filter(lead => lead.id !== id));
      setSelectedLeadIds(prev => prev.filter(leadId => leadId !== id));
      setLeadModal(null);
    }
  };

  const toggleLeadSelection = (id: number) => {
    setSelectedLeadIds(prev => prev.includes(id) ? prev.filter(leadId => leadId !== id) : [...prev, id]);
  };

  const toggleAllLeads = () => {
    setSelectedLeadIds(prev => prev.length === chatLeads.length ? [] : chatLeads.map(lead => lead.id));
  };

  const deleteSelectedLeads = async () => {
    if (selectedLeadIds.length === 0) return;
    if (!confirm(`Delete ${selectedLeadIds.length} selected Berlin chat lead${selectedLeadIds.length === 1 ? "" : "s"}?`)) return;
    const res = await fetch("/api/admin/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-admin-session": localStorage.getItem("sAdminSession")||"" },
      body: JSON.stringify({ ids:selectedLeadIds }),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setChatLeads(prev => prev.filter(lead => !selectedLeadIds.includes(lead.id)));
      setSelectedLeadIds([]);
      setLeadModal(null);
    } else {
      alert(`❌ Bulk delete failed: ${res.error || "Unknown error"}`);
    }
  };

  const loadBerlinTraining = () => {
    fetch("/api/admin/berlin-training", { headers: { "x-admin-session": localStorage.getItem("sAdminSession")||"" } })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setBerlinTraining(d); })
      .catch(() => {});
  };

  const loadBerlinTrainingChat = () => {
    fetch("/api/admin/berlin-training-chat", { headers: { "x-admin-session": localStorage.getItem("sAdminSession")||"" } })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setTrainingChat(d.map((m: TrainingChatMessage) => ({ role:m.role, content:m.content, saved:!!m.saved })));
        }
        trainingChatInputRef.current?.focus();
      })
      .catch(() => {});
  };

  const sendTrainingChat = async () => {
    const message = trainingChatInput.trim();
    if (!message || trainingChatLoading) return;

    const nextMessages: TrainingChatMessage[] = [...trainingChat, { role:"user", content:message }];
    setTrainingChat(nextMessages);
    setTrainingChatInput("");
    setTrainingChatLoading(true);

    const res = await fetch("/api/admin/berlin-training-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-session": localStorage.getItem("sAdminSession")||"" },
      body: JSON.stringify({ message }),
    }).then(r => r.json()).catch(() => ({ error:"Training chat failed" }));

    setTrainingChatLoading(false);
    if (res.response) {
      setTrainingChat(prev => [...prev, { role:"assistant", content:res.response, saved:!!res.saved }]);
      if (res.saved) {
        setTrainingMsg("✅ Berlin saved that correction to training");
        loadBerlinTraining();
        setTimeout(() => setTrainingMsg(""), 3000);
      }
    } else {
      setTrainingChat(prev => [...prev, { role:"assistant", content:`Sorry Professor, ${res.error || "I could not process that training message."}` }]);
    }
  };

  const saveBerlinTraining = async () => {
    if (!trainingForm.title.trim() || !trainingForm.content.trim()) {
      setTrainingMsg("❌ Title and instruction required");
      return;
    }
    const isEdit = trainingForm.id > 0;
    const res = await fetch("/api/admin/berlin-training", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", "x-admin-session": localStorage.getItem("sAdminSession")||"" },
      body: JSON.stringify(trainingForm),
    }).then(r => r.json()).catch(() => ({}));
    if (res.success) {
      setTrainingMsg(isEdit ? "✅ Berlin training updated" : "✅ Berlin training added");
      setTrainingForm({ id:0, title:"", content:"", is_active:true });
      loadBerlinTraining();
    } else {
      setTrainingMsg(`❌ ${res.error || "Save failed"}`);
    }
    setTimeout(() => setTrainingMsg(""), 3000);
  };

  const editBerlinTraining = (item: BerlinTraining) => {
    setTrainingForm({ id:item.id, title:item.title || "", content:item.content || "", is_active:!!item.is_active });
    setTab("training");
  };

  const toggleBerlinTraining = async (item: BerlinTraining) => {
    await fetch("/api/admin/berlin-training", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-session": localStorage.getItem("sAdminSession")||"" },
      body: JSON.stringify({ ...item, is_active: !item.is_active }),
    });
    loadBerlinTraining();
  };

  const deleteBerlinTraining = async (id: number) => {
    if (!confirm("Delete this Berlin training note?")) return;
    await fetch(`/api/admin/berlin-training?id=${id}`, {
      method: "DELETE",
      headers: { "x-admin-session": localStorage.getItem("sAdminSession")||"" },
    });
    loadBerlinTraining();
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
      description: editProduct.short_description || "",
      price: rawPrice,
      category: editProduct.category,
      badge: null,
      image: editProduct.image || null,
      stock: editProduct.stock || "Digital",
      short_description: editProduct.short_description || "",
      full_description: editProduct.full_description || "",
      features: editProduct.features || "",
      seo_title: editProduct.seo_title || "",
      meta_description: editProduct.meta_description || "",
      focus_keyword: editProduct.focus_keyword || "",
    };
    const adminSess = localStorage.getItem("sAdminSession")||"";
    if (productModal === "new") {
      const res = await fetch("/api/admin-products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-session": adminSess },
        body: JSON.stringify(payload),
      }).then(r => r.json()).catch(() => ({}));
      const newId = res.id || Date.now();
      setProducts([...products, { ...editProduct, id: newId, emoji: "" }]);
    } else if (productModal) {
      await fetch("/api/admin-products", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-session": adminSess },
        body: JSON.stringify({ ...payload, id: productModal.id, active: 1 }),
      }).catch(() => {});
      setProducts(products.map(p => p.id === productModal.id ? { ...p, ...editProduct } : p));
    }
    setProductModal(null);
  };

  const openEditProduct = (p: any) => {
    const rawPrice = p.price ? `£${Number(String(p.price).replace(/[^0-9.]/g,'')).toFixed(2)}` : "";
    setEditProduct({ name:p.name||"", category:p.category||"Subscription", price:rawPrice, stock:p.stock||"Digital", image:p.image||"", short_description:p.short_description||"", full_description:p.full_description||"", features:p.features||"", seo_title:p.seo_title||"", meta_description:p.meta_description||"", focus_keyword:p.focus_keyword||"" });
    setProductModal(p);
  };

  const openNewProduct = () => {
    setEditProduct({ name:"", category:"Subscription", price:"", stock:"Digital", image:"", short_description:"", full_description:"", features:"", seo_title:"", meta_description:"", focus_keyword:"" });
    setProductModal("new");
  };

  const filteredOrders = statusFilter === "all" ? orders : orders.filter(o => o.status === statusFilter);
  const pendingCount = orders.filter(o => o.status === "pending").length;
  // Fix 1 — dynamic dashboard stats from real data
  const revenueOrders = orders.filter(o => ["confirmed","dispatched","delivered"].includes(o.status));
  const totalRevenue = revenueOrders.reduce((s, o) => s + parseFloat((o.total||"0").replace("£","").replace(",","")), 0);
  const deliveredCount = orders.filter(o => o.status === "delivered").length;
  const leadsLast24 = chatLeads.filter(lead => new Date(lead.created_at).getTime() >= leadWindowStart).length;

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
        <div className="modal-overlay">
          <div className="modal" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
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
        <div className="modal-overlay">
          <div className="modal" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
            <div className="modal-title">Order — {orderModal.id}</div>
            <div className="modal-field"><label>Customer</label><input readOnly value={orderModal.customer} /></div>
            <div className="modal-field"><label>Email</label><input readOnly value={orderModal.email} /></div>
            <div className="modal-field"><label>Phone / WhatsApp</label><input readOnly value={orderModal.phone} /></div>
            <div className="modal-field"><label>Items</label><input readOnly value={orderModal.items} /></div>
            <div className="modal-field"><label>Delivery Address</label><input readOnly value={(orderModal as any).address || "—"} /></div>
            <div className="modal-field"><label>Payment Method</label><input readOnly value={(orderModal as any).payment || "—"} /></div>
            {(orderModal as any).payment_reference && (
              <div className="modal-field"><label>Payment Reference</label><input readOnly value={(orderModal as any).payment_reference} style={{background:"#F5F3FF",borderColor:"#DDD6FE",fontWeight:600}} /></div>
            )}
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
            <div className="modal-actions" style={{justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <button
                className="modal-cancel"
                style={{background:"rgba(220,38,38,0.1)",color:"#DC2626",border:"1px solid rgba(220,38,38,0.25)"}}
                onClick={() => deleteOrder(orderModal.id, orderModal.total, orderModal.status)}
              >
                🗑 Delete Order
              </button>
              <div style={{display:"flex",gap:8}}>
                <button className="modal-cancel" onClick={() => setOrderModal(null)}>Close</button>
                {orderModal.receipt && <button className="modal-save" onClick={() => { setOrderModal(null); setReceiptModal(orderModal.id); }}>View Receipt</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHAT LEAD MODAL */}
      {leadModal && (
        <div className="modal-overlay">
          <div className="modal" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()} style={{maxWidth:680}}>
            <div className="modal-title">Berlin Chat Lead — {leadModal.customer_name || "Unknown"}</div>
            <div className="modal-field"><label>Name</label><input readOnly value={leadModal.customer_name || "—"} /></div>
            <div className="modal-field"><label>WhatsApp</label><input readOnly value={leadModal.customer_whatsapp || "—"} /></div>
            <div className="modal-field"><label>Interested In</label><input readOnly value={leadModal.interested_in || "—"} /></div>
            <div className="modal-field"><label>Date</label><input readOnly value={leadModal.created_at ? new Date(leadModal.created_at).toLocaleString("en-GB") : "—"} /></div>
            <div className="modal-field">
              <label>Chat History</label>
              <textarea readOnly rows={12} value={leadModal.chat_history || "No chat history saved."} style={{resize:"vertical",fontFamily:"monospace",fontSize:12,lineHeight:1.6}} />
            </div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setLeadModal(null)}>Close</button>
              {(leadModal.customer_whatsapp || "").replace(/\D/g,"") ? (
                <a href={`https://wa.me/${(leadModal.customer_whatsapp||"").replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer">
                  <button className="modal-save">💬 WhatsApp</button>
                </a>
              ) : (
                <button className="modal-save" disabled style={{opacity:0.5,cursor:"not-allowed"}}>💬 WhatsApp unavailable</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT MODAL */}
      {productModal && (
        <div className="modal-overlay">
          <div className="modal modal-product" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
            <div className="modal-title">{productModal === "new" ? "Add New Product" : "Edit Product"}</div>

            {/* Basic Info */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div className="modal-field"><label>Product Name *</label><input placeholder="e.g. B1G 1 Year Plan" value={editProduct.name} onChange={e => setEditProduct({...editProduct,name:e.target.value})} /></div>
              <div className="modal-field">
                <label>Category</label>
                <select value={editProduct.category} onChange={e => setEditProduct({...editProduct,category:e.target.value})}>
                  <option>Subscription</option><option>Device</option><option>Bundle</option>
                </select>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div className="modal-field"><label>Price</label><input placeholder="e.g. £9.99" value={editProduct.price} onChange={e => setEditProduct({...editProduct,price:e.target.value})} /></div>
              <div className="modal-field"><label>Stock / Type</label><input placeholder="e.g. 10 or Digital" value={editProduct.stock} onChange={e => setEditProduct({...editProduct,stock:e.target.value})} /></div>
            </div>

            {/* Image */}
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

            {/* Descriptions */}
            <div className="modal-field">
              <label style={{display:"flex",justifyContent:"space-between"}}>
                Short Description
                <span style={{fontSize:11,color:editProduct.short_description.length>180?"#ff6666":"rgba(255,255,255,0.3)"}}>{editProduct.short_description.length}/200</span>
              </label>
              <textarea rows={2} placeholder="Brief product summary shown on listing page..." maxLength={200} value={editProduct.short_description} onChange={e => setEditProduct({...editProduct,short_description:e.target.value})} style={{resize:"vertical"}} />
            </div>
            <div className="modal-field">
              <label>Full Description</label>
              <textarea rows={3} placeholder="Detailed product description for the product page..." value={editProduct.full_description} onChange={e => setEditProduct({...editProduct,full_description:e.target.value})} style={{resize:"vertical"}} />
            </div>
            <div className="modal-field">
              <label>Features (one per line)</label>
              <textarea rows={3} placeholder={"✅ 1 Year Streaming Access\n✅ 10,000+ Channels\n✅ Free Setup Support"} value={editProduct.features} onChange={e => setEditProduct({...editProduct,features:e.target.value})} style={{resize:"vertical"}} />
            </div>

            {/* SEO Section */}
            <div className="seo-box">
              <div className="seo-box-title">🔍 SEO Settings</div>
              <div className="modal-field">
                <label style={{display:"flex",justifyContent:"space-between"}}>
                  SEO Title <span style={{fontSize:11,color:editProduct.seo_title.length>55?"#ff6666":editProduct.seo_title.length>40?"#00c864":"rgba(255,255,255,0.3)"}}>{editProduct.seo_title.length}/60</span>
                </label>
                <input placeholder={`Auto: "${editProduct.name || 'Product Name'} | Firestick4UK"`} maxLength={60} value={editProduct.seo_title} onChange={e => setEditProduct({...editProduct,seo_title:e.target.value})} />
                <div className="char-bar" style={{background:"rgba(255,255,255,0.08)",width:"100%"}}><div className="char-bar" style={{width:`${Math.min(100,(editProduct.seo_title.length/60)*100)}%`,background:editProduct.seo_title.length>55?"#ff6666":editProduct.seo_title.length>40?"#00c864":"rgba(139,0,255,0.5)"}} /></div>
              </div>
              <div className="modal-field">
                <label style={{display:"flex",justifyContent:"space-between"}}>
                  Meta Description <span style={{fontSize:11,color:editProduct.meta_description.length>=175?"#ff6666":editProduct.meta_description.length>=140?"#00c864":"rgba(255,255,255,0.3)"}}>{editProduct.meta_description.length}/180</span>
                </label>
                <textarea rows={2} placeholder={`Auto: Short description will be used if empty (max 180 chars)`} maxLength={180} value={editProduct.meta_description} onChange={e => setEditProduct({...editProduct,meta_description:e.target.value})} style={{resize:"none"}} />
                <div className="char-bar" style={{background:"rgba(255,255,255,0.08)",width:"100%"}}><div className="char-bar" style={{width:`${Math.min(100,(editProduct.meta_description.length/180)*100)}%`,background:editProduct.meta_description.length>=175?"#ff6666":editProduct.meta_description.length>=140?"#00c864":"rgba(139,0,255,0.5)"}} /></div>
              </div>
              <div className="modal-field" style={{marginBottom:0}}><label>Focus Keyword</label><input placeholder="e.g. firestick 4k uk" value={editProduct.focus_keyword} onChange={e => setEditProduct({...editProduct,focus_keyword:e.target.value})} /></div>
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
        <div className="modal-overlay">
          <div className="modal modal-blog" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
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
                {editBlog.featured_image && <button type="button" style={{background:"none",border:"none",color:"rgba(255,100,100,0.7)",cursor:"pointer",fontSize:12}} onClick={()=>setEditBlog(p=>({...p,featured_image:""}))}>Remove</button>}
              </div>
            </div>

            {/* Rich Text Editor — TipTap */}
            <div className="modal-field">
              <label>Content</label>
              <TipTapEditor
                content={editBlog.content}
                onChange={(html) => setEditBlog(p => ({ ...p, content: html }))}
                placeholder="Write your blog post here... Paste from Word/Google Docs supported!"
              />
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
                <textarea rows={2} placeholder="SEO description (max 180 chars)" value={editBlog.meta_description} onChange={e=>setEditBlog(p=>({...p,meta_description:e.target.value.slice(0,180)}))} style={{resize:"none"}} />
                <div className="char-count" style={{color:editBlog.meta_description.length>=175?"#DC2626":editBlog.meta_description.length>=140?"#16A34A":"#999999"}}>{editBlog.meta_description.length}/180</div>
              </div>
              <div className="modal-field"><label>Focus Keyword</label><input placeholder="e.g. firestick uk" value={editBlog.focus_keyword} onChange={e=>setEditBlog(p=>({...p,focus_keyword:e.target.value}))} /></div>
              <div className="modal-field" style={{marginBottom:0}}>
                <label>Canonical URL</label>
                <input placeholder={`https://firestick4uk.com/blog/${editBlog.slug||"post-slug"}`} value={editBlog.canonical_url} onChange={e=>setEditBlog(p=>({...p,canonical_url:e.target.value}))} />
                <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:3}}>Leave empty to auto-generate from slug</div>
              </div>
            </div>

            {/* FAQ Section */}
            <div className="seo-section" style={{marginTop:8}}>
              <h5 style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",color:"rgba(255,255,255,0.4)",marginBottom:"12px"}}>❓ FAQ Section (Schema Markup)</h5>
              {editBlog.faqs.map((faq,i)=>(
                <div key={i} style={{marginBottom:10,padding:"12px",background:"rgba(139,0,255,0.05)",border:"1px solid rgba(139,0,255,0.12)",borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>FAQ #{i+1}</span>
                    <button type="button" style={{background:"none",border:"none",color:"rgba(255,100,100,0.6)",cursor:"pointer",fontSize:12}} onClick={()=>setEditBlog(p=>({...p,faqs:p.faqs.filter((_,j)=>j!==i)}))}>Remove</button>
                  </div>
                  <input className="modal-field" style={{width:"100%",background:"rgba(139,0,255,0.07)",border:"1px solid rgba(139,0,255,0.2)",borderRadius:8,padding:"8px 12px",color:"white",fontSize:13,marginBottom:6,outline:"none"}} placeholder="Question" value={faq.question} onChange={e=>setEditBlog(p=>({...p,faqs:p.faqs.map((f,j)=>j===i?{...f,question:e.target.value}:f)}))} />
                  <textarea style={{width:"100%",background:"rgba(139,0,255,0.07)",border:"1px solid rgba(139,0,255,0.2)",borderRadius:8,padding:"8px 12px",color:"white",fontSize:13,resize:"vertical",outline:"none",minHeight:60,fontFamily:"inherit"}} placeholder="Answer" value={faq.answer} onChange={e=>setEditBlog(p=>({...p,faqs:p.faqs.map((f,j)=>j===i?{...f,answer:e.target.value}:f)}))} />
                </div>
              ))}
              <button type="button" className="erp-btn" style={{background:"rgba(139,0,255,0.15)",border:"1px solid rgba(139,0,255,0.3)",color:"var(--purple-glow)",padding:"7px 16px",borderRadius:8,cursor:"pointer",fontSize:13}} onClick={()=>setEditBlog(p=>({...p,faqs:[...p.faqs,{question:"",answer:""}]}))}>+ Add FAQ</button>
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

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      {adminDropOpen && <div style={{position:"fixed",inset:0,zIndex:199}} onClick={() => setAdminDropOpen(false)} />}

      <div className="admin-layout">
        {/* SIDEBAR */}
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-logo">
            <div className="sidebar-logo-text">FIRESTICK4UK</div>
            <div className="sidebar-label">Admin Panel</div>
          </div>
          <nav className="sidebar-nav">
            {([
              { id:"dashboard", icon:"📊", label:"Dashboard", roles:["super_admin","manager","writer"] },
              { id:"orders",    icon:"🛒", label:"Orders",       badge: pendingCount > 0 ? String(pendingCount) : null, badgeColor:"orange", roles:["super_admin","manager"] },
              { id:"products",  icon:"📦", label:"Products",     roles:["super_admin","manager"] },
              { id:"customers", icon:"👥", label:"Customers",    roles:["super_admin","manager"] },
              { id:"leads",     icon:"💬", label:"Leads",        badge: leadsLast24 > 0 ? String(leadsLast24) : null, badgeColor:"orange", roles:["super_admin","manager"] },
              { id:"training",  icon:"🧠", label:"Berlin Training", roles:["super_admin","manager"] },
              { id:"blog",      icon:"📝", label:"Blog",         roles:["super_admin","manager","writer"] },
              { id:"coupons",   icon:"🎟️", label:"Coupons",      roles:["super_admin"] },
              { id:"builder",   icon:"🎨", label:"Page Builder", roles:["super_admin"] },
              { id:"faqadmin",  icon:"❓", label:"FAQs",         roles:["super_admin","manager"] },
              { id:"pages",     icon:"📄", label:"Pages",        roles:["super_admin"] },
              { id:"staff",     icon:"👤", label:"Staff Users",  roles:["super_admin"] },
              { id:"settings",  icon:"⚙️", label:"Site Settings",roles:["super_admin"] },
            ] as const).filter(item => ([...item.roles] as string[]).includes(adminRole)).map(item => (
              <button key={item.id} className={`nav-item ${tab===item.id?"active":""}`} onClick={() => { setTab(item.id); setSidebarOpen(false); }}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
                {"badge" in item && item.badge && <span className={`nav-badge ${item.badgeColor||""}`}>{item.badge}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer" style={{padding:"12px 10px"}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",textAlign:"center",letterSpacing:"1px"}}>FIRESTICK4UK ADMIN</div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="main-content">
          <div className="top-bar">
            <div style={{display:"flex",alignItems:"center"}}>
              <button className="sidebar-hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
                <span/><span/><span/>
              </button>
              <h1 className="page-heading">
                {tab==="dashboard" && <>Dashboard <span>Overview</span></>}
                {tab==="orders" && <>Manage <span>Orders</span></>}
                {tab==="products" && <>Manage <span>Products</span></>}
                {tab==="customers" && <>Customer <span>Data</span></>}
                {tab==="leads" && <>Berlin <span>Leads</span></>}
                {tab==="training" && <>Berlin <span>Training</span></>}
                {tab==="blog" && <>Manage <span>Blog</span></>}
                {tab==="coupons" && <>Manage <span>Coupons</span></>}
                {tab==="builder" && <>Page <span>Builder</span></>}
                {tab==="faqadmin" && <>Manage <span>FAQs</span></>}
                {tab==="pages" && <>Page <span>Editor</span></>}
                {tab==="settings" && <>Site <span>Settings</span></>}
              </h1>
            </div>
            <div className="top-right">
              <button className="admin-user-btn" onClick={() => setAdminDropOpen(o => !o)}>
                👤 {adminName} <span style={{fontSize:10,color:"#888888"}}>{adminDropOpen?"▲":"▼"}</span>
              </button>
              {adminDropOpen && (
                <div className="admin-dropdown" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
                  <div className="admin-dropdown-header">
                    <div className="admin-dropdown-name">{adminName}</div>
                    <div className="admin-dropdown-role">{adminRole==="super_admin"?"Super Admin":adminRole==="manager"?"Manager":"Writer"}</div>
                  </div>
                  <button className="admin-dropdown-item danger" onClick={() => { setAdminDropOpen(false); handleLogout(); }}>
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* DASHBOARD */}
          {tab==="dashboard" && (
            <>
              <div className="stats-grid">
                {[
                  { icon:"🛒", label:"Total Orders", value:orders.length, trend:"All time" },
                  { icon:"⏳", label:"Pending Orders", value:pendingCount, trend:"Needs action" },
                  { icon:"💰", label:"Total Revenue", value:`£${totalRevenue.toFixed(2)}`, trend:"Confirmed only" },
                  { icon:"👥", label:"Customers", value:customers.length, trend:"Unique" },
                  { icon:"📦", label:"Products", value:products.length, trend:"Active" },
                  { icon:"✅", label:"Delivered", value:deliveredCount, trend:"All time" },
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
                      {orders.slice(0,10).map(o => (
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
          {tab==="orders" && (() => {
            const totalOrderPages = Math.ceil(filteredOrders.length / ORDERS_PER_PAGE);
            const pagedOrders = filteredOrders.slice((ordersPage-1)*ORDERS_PER_PAGE, ordersPage*ORDERS_PER_PAGE);
            const from = filteredOrders.length === 0 ? 0 : (ordersPage-1)*ORDERS_PER_PAGE+1;
            const to = Math.min(ordersPage*ORDERS_PER_PAGE, filteredOrders.length);
            return (
            <div className="section-card">
              <div className="section-header">
                <div className="section-title">All Orders ({filteredOrders.length})</div>
                <div className="section-actions">
                  <select className="filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setOrdersPage(1); }}>
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="dispatched">Dispatched</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </div>
              </div>
              {/* Pagination info */}
              {filteredOrders.length > 0 && (
                <div style={{padding:"8px 20px",fontSize:12,color:"#888888",borderBottom:"1px solid #F0F0F0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>Showing {from}–{to} of {filteredOrders.length} orders</span>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <button className="action-btn btn-view" disabled={ordersPage===1} onClick={()=>setOrdersPage(p=>p-1)} style={{opacity:ordersPage===1?0.4:1}}>← Prev</button>
                    {Array.from({length:totalOrderPages},(_,i)=>i+1).filter(p=>p===1||p===totalOrderPages||Math.abs(p-ordersPage)<=1).map((p,i,arr)=>(
                      <span key={p}>
                        {i>0 && arr[i-1]!==p-1 && <span style={{color:"#888",padding:"0 2px"}}>…</span>}
                        <button className={`action-btn ${p===ordersPage?"btn-verify":"btn-view"}`} onClick={()=>setOrdersPage(p)} style={{minWidth:32}}>{p}</button>
                      </span>
                    ))}
                    <button className="action-btn btn-view" disabled={ordersPage===totalOrderPages} onClick={()=>setOrdersPage(p=>p+1)} style={{opacity:ordersPage===totalOrderPages?0.4:1}}>Next →</button>
                  </div>
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Date</th><th>Payment</th><th>Receipt</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {pagedOrders.map(o => (
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
                          <button className="action-btn btn-delete" onClick={() => deleteOrder(o.id, o.total, o.status)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}

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
            <div>
              {blogMsg && <div style={{marginBottom:16,padding:"10px 16px",background:blogMsg.startsWith("✅")?"rgba(22,163,74,0.1)":"rgba(220,38,38,0.1)",border:`1px solid ${blogMsg.startsWith("✅")?"rgba(22,163,74,0.3)":"rgba(220,38,38,0.25)"}`,borderRadius:10,fontSize:13,color:blogMsg.startsWith("✅")?"#16A34A":"#DC2626"}}>{blogMsg}</div>}
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
                          <button className="action-btn btn-edit" onClick={() => { const faqsParsed = p.faqs ? (typeof p.faqs==="string" ? JSON.parse(p.faqs) : p.faqs) : []; setEditBlog({title:p.title,slug:p.slug||"",excerpt:p.excerpt||"",content:p.content||"",category:p.category||"Guides",emoji:p.emoji||"📝",badge:p.badge||"guide",badgeText:p.badgeText||"Guide",featured_image:p.featured_image||"",meta_title:p.meta_title||"",meta_description:p.meta_description||"",focus_keyword:p.focus_keyword||"",status:p.status||"published",featured:!!p.featured,canonical_url:p.canonical_url||"",faqs:faqsParsed}); setBlogModal(p); setTimeout(()=>{if(editorRef.current)editorRef.current.innerHTML=p.content||"";},80); }}>Edit</button>
                          <button className="action-btn btn-delete" onClick={() => deleteBlog(p.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

          {/* 💬 CHAT LEADS */}
          {tab==="leads" && (
            <div>
              <div className="stats-grid" style={{marginBottom:20}}>
                <div className="stat-card">
                  <div className="stat-card-top">
                    <span className="stat-icon">💬</span>
                    <span className="stat-trend">Last 24 hours</span>
                  </div>
                  <div className="stat-value">{leadsLast24}</div>
                  <div className="stat-label">{leadsLast24} new leads (last 24 hours)</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-top">
                    <span className="stat-icon">📈</span>
                    <span className="stat-trend">All time</span>
                  </div>
                  <div className="stat-value">{chatLeads.length}</div>
                  <div className="stat-label">Total leads count</div>
                </div>
              </div>

              <div className="section-card">
                <div className="section-header">
                  <div className="section-title">Berlin Chat Leads ({chatLeads.length})</div>
                  {selectedLeadIds.length > 0 && (
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:12,color:"#666666"}}>{selectedLeadIds.length} selected</span>
                      <button className="action-btn btn-delete" onClick={deleteSelectedLeads}>🗑️ Delete Selected</button>
                    </div>
                  )}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th><input type="checkbox" checked={chatLeads.length > 0 && selectedLeadIds.length === chatLeads.length} onChange={toggleAllLeads} aria-label="Select all leads" /></th><th>Name</th><th>WhatsApp</th><th>Interested In</th><th>Date</th><th>Actions</th></tr></thead>
                    <tbody>
                      {chatLeads.length === 0 && (
                        <tr><td colSpan={6} style={{textAlign:"center",color:"rgba(255,255,255,0.3)",padding:"24px"}}>No Berlin chat leads yet.</td></tr>
                      )}
                      {chatLeads.map(lead => {
                        const waNumber = (lead.customer_whatsapp || "").replace(/\D/g,"");
                        return (
                          <tr key={lead.id}>
                            <td><input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggleLeadSelection(lead.id)} aria-label={`Select lead ${lead.customer_name || lead.id}`} /></td>
                            <td style={{fontWeight:600}}>{lead.customer_name || "—"}</td>
                            <td style={{fontSize:13}}>{lead.customer_whatsapp || "—"}</td>
                            <td><span style={{background:"rgba(139,0,255,0.1)",border:"1px solid rgba(139,0,255,0.2)",padding:"3px 10px",borderRadius:"10px",fontSize:"12px"}}>{lead.interested_in || "—"}</span></td>
                            <td style={{color:"rgba(255,255,255,0.4)",fontSize:"12px",whiteSpace:"nowrap"}}>{lead.created_at ? new Date(lead.created_at).toLocaleString("en-GB") : "—"}</td>
                            <td style={{whiteSpace:"nowrap"}}>
                              <button className="action-btn btn-view" onClick={() => setLeadModal(lead)}>👁️ View</button>
                              {waNumber ? (
                                <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer">
                                  <button className="action-btn btn-verify">💬 WhatsApp</button>
                                </a>
                              ) : (
                                <button className="action-btn btn-verify" disabled style={{opacity:0.5,cursor:"not-allowed"}}>💬 WhatsApp</button>
                              )}
                              <button className="action-btn btn-delete" onClick={() => deleteLead(lead.id)}>🗑️ Delete</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 🧠 BERLIN TRAINING */}
          {tab==="training" && (
            <div>
              {trainingMsg && (
                <div style={{marginBottom:14,padding:"10px 14px",background:trainingMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",borderRadius:10,fontSize:13,color:trainingMsg.startsWith("✅")?"#00c864":"#ff6666"}}>
                  {trainingMsg}
                </div>
              )}

              <div className="section-card" style={{padding:0,marginBottom:20,overflow:"hidden"}}>
                <div style={{padding:"16px 20px",background:"linear-gradient(135deg,#111111,#4C1D95)",color:"#FFFFFF",display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
                  <div>
                    <div style={{fontFamily:"Cinzel,serif",fontWeight:900,fontSize:16,color:"#FFFFFF"}}>Professor ↔ Berlin Training Chat</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.72)",marginTop:4}}>
                      Test Berlin, ask what he knows, then say “save this” or “remember this” to add training automatically.
                    </div>
                  </div>
                  <button
                    className="action-btn btn-view"
                    onClick={loadBerlinTrainingChat}
                    style={{background:"rgba(255,255,255,0.12)",borderColor:"rgba(255,255,255,0.22)",color:"#FFFFFF"}}
                  >
                    Refresh History
                  </button>
                </div>
                <div style={{height:360,overflowY:"auto",padding:18,background:"#F8F8FA",display:"flex",flexDirection:"column",gap:12}}>
                  {trainingChat.map((msg, idx) => (
                    <div key={idx} style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start"}}>
                      <div style={{maxWidth:"78%",background:msg.role==="user"?"#5B21B6":"#FFFFFF",color:msg.role==="user"?"#FFFFFF":"#111111",border:msg.role==="user"?"none":"1px solid #E5E5E5",borderRadius:msg.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",padding:"11px 13px",boxShadow:"0 2px 8px rgba(0,0,0,0.05)",whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.55}}>
                        <div style={{fontSize:10,fontWeight:800,letterSpacing:1,textTransform:"uppercase",opacity:0.68,marginBottom:4}}>
                          {msg.role==="user" ? "Professor" : "Berlin"} {msg.saved ? "• Saved to Training" : ""}
                        </div>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {trainingChatLoading && (
                    <div style={{alignSelf:"flex-start",background:"#FFFFFF",border:"1px solid #E5E5E5",borderRadius:"16px 16px 16px 4px",padding:"11px 13px",fontSize:13,color:"#666666"}}>
                      Berlin is thinking, Professor...
                    </div>
                  )}
                  <div ref={trainingChatEndRef} />
                </div>
                <div style={{padding:14,borderTop:"1px solid #E5E5E5",display:"flex",gap:10,background:"#FFFFFF"}}>
                  <input
                    ref={trainingChatInputRef}
                    value={trainingChatInput}
                    onChange={e => setTrainingChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendTrainingChat();
                      }
                    }}
                    placeholder="Professor: ask Berlin something, or say 'save this correction: ...'"
                    disabled={trainingChatLoading}
                    style={{flex:1,border:"1px solid #E5E5E5",borderRadius:10,padding:"12px 14px",fontSize:13,outline:"none"}}
                  />
                  <button className="btn-primary" onClick={sendTrainingChat} disabled={trainingChatLoading || !trainingChatInput.trim()}>
                    Send
                  </button>
                </div>
              </div>

              <div className="section-card" style={{padding:20,marginBottom:20}}>
                <div className="section-header" style={{padding:0,marginBottom:16,borderBottom:"none"}}>
                  <div>
                    <div className="section-title">{trainingForm.id ? "Edit Manual Training" : "Add Manual Training"}</div>
                    <div style={{fontSize:12,color:"#888888",marginTop:6}}>
                      You can still add corrections manually if you do not want to use chat.
                    </div>
                  </div>
                  {trainingForm.id > 0 && (
                    <button className="action-btn btn-view" onClick={() => setTrainingForm({ id:0, title:"", content:"", is_active:true })}>Cancel Edit</button>
                  )}
                </div>
                <div className="modal-field">
                  <label>Training Title *</label>
                  <input
                    placeholder="e.g. Do not mention reseller pricing"
                    value={trainingForm.title}
                    onChange={e => setTrainingForm(f => ({ ...f, title:e.target.value }))}
                  />
                </div>
                <div className="modal-field">
                  <label>Knowledge / Instruction *</label>
                  <textarea
                    rows={7}
                    placeholder={"Example:\nIf a customer asks about buffering, tell them to try VPN first, then mobile hotspot. Do not blame their device unless they have tried both."}
                    value={trainingForm.content}
                    onChange={e => setTrainingForm(f => ({ ...f, content:e.target.value }))}
                    style={{resize:"vertical"}}
                  />
                </div>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#555555",marginBottom:14}}>
                  <input
                    type="checkbox"
                    checked={trainingForm.is_active}
                    onChange={e => setTrainingForm(f => ({ ...f, is_active:e.target.checked }))}
                  />
                  Active and used by Berlin
                </label>
                <button className="btn-primary" onClick={saveBerlinTraining}>
                  {trainingForm.id ? "💾 Update Training" : "+ Add Training"}
                </button>
              </div>

              <div className="section-card">
                <div className="section-header">
                  <div className="section-title">Training Knowledge ({berlinTraining.length})</div>
                  <button className="action-btn btn-view" onClick={loadBerlinTraining}>🔄 Refresh</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Title</th><th>Instruction</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
                    <tbody>
                      {berlinTraining.length === 0 && (
                        <tr><td colSpan={5} style={{textAlign:"center",color:"rgba(255,255,255,0.3)",padding:"24px"}}>No Berlin training added yet.</td></tr>
                      )}
                      {berlinTraining.map(item => (
                        <tr key={item.id}>
                          <td style={{fontWeight:600,minWidth:180}}>{item.title}</td>
                          <td style={{maxWidth:420,whiteSpace:"pre-wrap",fontSize:12,lineHeight:1.6,color:"rgba(255,255,255,0.65)"}}>{item.content}</td>
                          <td>
                            <span
                              style={{fontSize:11,background:item.is_active?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",border:`1px solid ${item.is_active?"rgba(0,200,100,0.3)":"rgba(255,68,68,0.25)"}`,color:item.is_active?"#00c864":"#ff6666",padding:"3px 10px",borderRadius:20,cursor:"pointer"}}
                              onClick={() => toggleBerlinTraining(item)}
                            >
                              {item.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td style={{fontSize:12,color:"rgba(255,255,255,0.4)",whiteSpace:"nowrap"}}>{item.updated_at ? new Date(item.updated_at).toLocaleString("en-GB") : "—"}</td>
                          <td style={{whiteSpace:"nowrap"}}>
                            <button className="action-btn btn-edit" onClick={() => editBerlinTraining(item)}>Edit</button>
                            <button className="action-btn btn-delete" onClick={() => deleteBerlinTraining(item.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 🎟️ COUPONS */}
          {tab==="coupons" && (
            <div>
              {couponMsg && <div style={{marginBottom:16,padding:"10px 16px",background:couponMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",border:`1px solid ${couponMsg.startsWith("✅")?"rgba(0,200,100,0.3)":"rgba(255,68,68,0.25)"}`,borderRadius:10,fontSize:13,color:couponMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{couponMsg}</div>}
              {/* Add Coupon Form */}
              <div className="section-card" style={{padding:20,marginBottom:20}}>
                <div className="section-title" style={{marginBottom:16}}>Add New Coupon</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
                  <div className="modal-field"><label>Code *</label><input placeholder="SAVE10" style={{width:"100%",textTransform:"uppercase"}} value={couponForm.code} onChange={e=>setCouponForm(f=>({...f,code:e.target.value.toUpperCase()}))} /></div>
                  <div className="modal-field"><label>Type</label><select style={{width:"100%"}} value={couponForm.type} onChange={e=>setCouponForm(f=>({...f,type:e.target.value}))}><option value="percentage">% Percentage</option><option value="fixed">£ Fixed</option></select></div>
                  <div className="modal-field"><label>Value</label><input type="number" placeholder="10" style={{width:"100%"}} value={couponForm.value} onChange={e=>setCouponForm(f=>({...f,value:e.target.value}))} /></div>
                  <div className="modal-field"><label>Min Order (£)</label><input type="number" placeholder="0" style={{width:"100%"}} value={couponForm.minimum_order} onChange={e=>setCouponForm(f=>({...f,minimum_order:e.target.value}))} /></div>
                  <div className="modal-field"><label>Usage Limit</label><input type="number" placeholder="Unlimited" style={{width:"100%"}} value={couponForm.usage_limit} onChange={e=>setCouponForm(f=>({...f,usage_limit:e.target.value}))} /></div>
                  <div className="modal-field"><label>Expires</label><input type="date" style={{width:"100%"}} value={couponForm.expires_at} onChange={e=>setCouponForm(f=>({...f,expires_at:e.target.value}))} /></div>
                </div>
                <button className="btn-primary" style={{marginTop:8}} onClick={async()=>{
                  if(!couponForm.code||!couponForm.value){setCouponMsg("❌ Code and value required");return;}
                  const r=await fetch("/api/coupons",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(couponForm)}).then(x=>x.json()).catch(()=>({}));
                  if(r.success){setCouponMsg("✅ Coupon created!");setCouponForm({code:"",type:"percentage",value:"",minimum_order:"0",usage_limit:"",expires_at:""});fetch("/api/coupons").then(x=>x.json()).then(d=>Array.isArray(d)&&setCoupons(d));}
                  else setCouponMsg(`❌ ${r.error||"Failed"}`);
                  setTimeout(()=>setCouponMsg(""),3000);
                }}>+ Create Coupon</button>
              </div>
              {/* Coupons Table */}
              <div className="section-card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Min Order</th><th>Used / Limit</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {coupons.length===0&&<tr><td colSpan={8} style={{textAlign:"center",color:"rgba(255,255,255,0.25)",padding:24}}>No coupons yet</td></tr>}
                      {coupons.map((c:any)=>(
                        <tr key={c.id}>
                          <td style={{fontFamily:"monospace",color:"var(--purple-glow)",fontWeight:700}}>{c.code}</td>
                          <td><span className="status-badge status-pending" style={{fontSize:11}}>{c.type==="percentage"?`${c.value}%`:`£${c.value}`}</span></td>
                          <td style={{fontWeight:600}}>{c.type==="percentage"?`${c.value}%`:`£${Number(c.value).toFixed(2)}`}</td>
                          <td>{c.minimum_order>0?`£${c.minimum_order}`:"None"}</td>
                          <td>{c.used_count}{c.usage_limit?`/${c.usage_limit}`:" / ∞"}</td>
                          <td style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>{c.expires_at?new Date(c.expires_at).toLocaleDateString("en-GB"):"Never"}</td>
                          <td>
                            <span className={`status-badge ${c.is_active?"status-confirmed":"status-pending"}`} style={{cursor:"pointer"}} onClick={async()=>{await fetch("/api/coupons",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...c,is_active:!c.is_active})});fetch("/api/coupons").then(r=>r.json()).then(d=>Array.isArray(d)&&setCoupons(d));}}>
                              {c.is_active?"Active":"Inactive"}
                            </span>
                          </td>
                          <td><button className="action-btn btn-delete" onClick={async()=>{if(!confirm("Delete?"))return;await fetch(`/api/coupons?id=${c.id}`,{method:"DELETE"});setCoupons(prev=>prev.filter(x=>x.id!==c.id));}}>Delete</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 🎨 PAGE BUILDER */}
          {tab==="builder" && (
            <div>
              {sectionMsg && <div style={{marginBottom:14,padding:"10px 14px",background:sectionMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",borderRadius:10,fontSize:13,color:sectionMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{sectionMsg}</div>}
              {/* Page selector */}
              <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
                {[["home","🏠 Home"],["about","ℹ️ About"]].map(([k,l])=>(
                  <button key={k} className={`action-btn ${builderPage===k?"btn-verify":"btn-view"}`} style={{padding:"10px 20px",fontSize:13}} onClick={()=>{
                    setBuilderPage(k);
                    fetch(`/api/sections?page=${k}&all=1`).then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setSections(d); else setSections([]); }).catch(()=>setSections([]));
                  }}>{l}</button>
                ))}
                <button className="action-btn btn-view" style={{padding:"10px 16px",fontSize:13,marginLeft:"auto"}} onClick={()=>fetch(`/api/sections?page=${builderPage}&all=1`).then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setSections(d); }).catch(()=>{})}>🔄 Refresh</button>
              </div>
              {/* Sections list */}
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {sections.filter(s=>s.page===builderPage).length===0 && (
                  <div style={{textAlign:"center",padding:"40px",background:"#F9F9F9",borderRadius:12,border:"1px solid #E5E5E5",color:"#888888"}}>
                    <div style={{fontSize:32,marginBottom:12}}>📋</div>
                    <div style={{fontWeight:600,marginBottom:6}}>No sections found for {builderPage} page</div>
                    <div style={{fontSize:13,marginBottom:16}}>Click Refresh or visit the live website first to auto-create sections.</div>
                    <button className="add-btn" onClick={()=>fetch(`/api/sections?page=${builderPage}&all=1`).then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setSections(d); }).catch(()=>{})}>🔄 Load Sections</button>
                  </div>
                )}
                {sections.filter(s=>s.page===builderPage).sort((a,b)=>a.order-b.order).map((sec,i,arr)=>(
                  <div key={sec.key} className="section-card" style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:14}}>
                    {/* Reorder arrows */}
                    <div style={{display:"flex",flexDirection:"column",gap:2}}>
                      <button className="action-btn btn-view" style={{padding:"2px 6px",fontSize:10}} disabled={i===0} onClick={async()=>{
                        const prev=arr[i-1]; const newOrder=[{key:sec.key,section_order:prev.order},{key:prev.key,section_order:sec.order}];
                        await fetch("/api/sections?action=reorder",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:newOrder})});
                        setSections(s=>s.map(x=>x.key===sec.key?{...x,order:prev.order}:x.key===prev.key?{...x,order:sec.order}:x));
                      }}>▲</button>
                      <button className="action-btn btn-view" style={{padding:"2px 6px",fontSize:10}} disabled={i===arr.length-1} onClick={async()=>{
                        const next=arr[i+1]; const newOrder=[{key:sec.key,section_order:next.order},{key:next.key,section_order:sec.order}];
                        await fetch("/api/sections?action=reorder",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:newOrder})});
                        setSections(s=>s.map(x=>x.key===sec.key?{...x,order:next.order}:x.key===next.key?{...x,order:sec.order}:x));
                      }}>▼</button>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:14,marginBottom:3}}>{sec.label}</div>
                      <div style={{fontSize:11,color:"#888888"}}>{JSON.stringify(sec.data).slice(0,80)}...</div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      {/* Visibility toggle */}
                      <span style={{fontSize:11,background:sec.visible?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",border:`1px solid ${sec.visible?"rgba(0,200,100,0.3)":"rgba(255,68,68,0.25)"}`,color:sec.visible?"#00c864":"#ff6666",padding:"3px 10px",borderRadius:20,cursor:"pointer"}} onClick={async()=>{
                        await fetch("/api/sections?action=visibility",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:sec.key,is_visible:!sec.visible})});
                        setSections(s=>s.map(x=>x.key===sec.key?{...x,visible:!sec.visible}:x));
                      }}>{sec.visible?"👁 Visible":"🚫 Hidden"}</span>
                      {/* Edit button */}
                      <button className="action-btn btn-edit" onClick={()=>{ setSectionEditing(JSON.parse(JSON.stringify(sec.data))); setSectionModal(sec); setSectionMsg(""); }}>✏️ Edit</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section Edit Modal */}
          {sectionModal && (
            <div className="modal-overlay">
              <div className="modal" style={{maxWidth:600,width:"96vw"}} onClick={e=>e.stopPropagation()}>
                <div className="modal-title">Edit: {sectionModal.label}</div>

                {/* HERO */}
                {['hero','_hero'].some(k=>sectionModal.key.includes(k)) && (
                  <div>
                    <div className="modal-field"><label>Title</label><input value={sectionEditing.title||""} onChange={e=>setSectionEditing((p:any)=>({...p,title:e.target.value}))} /></div>
                    <div className="modal-field"><label>Subtitle</label><textarea rows={2} value={sectionEditing.subtitle||""} onChange={e=>setSectionEditing((p:any)=>({...p,subtitle:e.target.value}))} /></div>
                    <div className="modal-field"><label>Primary Button Text</label><input value={sectionEditing.button_text||""} onChange={e=>setSectionEditing((p:any)=>({...p,button_text:e.target.value}))} /></div>
                    <div className="modal-field"><label>Primary Button Link</label><input value={sectionEditing.button_link||""} onChange={e=>setSectionEditing((p:any)=>({...p,button_link:e.target.value}))} /></div>
                    <div className="modal-field"><label>Secondary Button Text</label><input value={sectionEditing.secondary_button_text||""} onChange={e=>setSectionEditing((p:any)=>({...p,secondary_button_text:e.target.value}))} /></div>
                    <div className="modal-field"><label>Secondary Button Link</label><input value={sectionEditing.secondary_button_link||""} onChange={e=>setSectionEditing((p:any)=>({...p,secondary_button_link:e.target.value}))} /></div>
                    {/* Hero Image Upload */}
                    <div className="modal-field">
                      <label>Hero Visual Image</label>
                      <div style={{fontSize:11,color:"#888",marginBottom:8}}>📐 Recommended: <strong>800×600px</strong> (4:3 ratio) — JPG or PNG, max 5MB</div>
                      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                        {sectionEditing.hero_image && (
                          <img src={sectionEditing.hero_image} alt="Hero preview" style={{width:120,height:80,objectFit:"cover",borderRadius:8,border:"1px solid #E5E5E5"}} />
                        )}
                        <label style={{cursor:"pointer",background:"#F5F5F5",border:"1px solid #E5E5E5",padding:"8px 16px",borderRadius:8,fontSize:13,color:"#5B21B6",fontWeight:600,display:"inline-block"}}>
                          {heroImgUploading?"⏳ Uploading...":"📷 Upload Image"}
                          <input type="file" accept="image/*" style={{display:"none"}} disabled={heroImgUploading} onChange={async(e)=>{
                            const file=e.target.files?.[0]; if(!file) return;
                            setHeroImgUploading(true);
                            try {
                              const base64=await new Promise<string>((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result as string); r.onerror=rej; r.readAsDataURL(file); });
                              const data=await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file:base64,name:file.name})}).then(r=>r.json());
                              if(data.path) setSectionEditing((p:any)=>({...p,hero_image:data.path}));
                            } catch {}
                            setHeroImgUploading(false);
                          }} />
                        </label>
                        {sectionEditing.hero_image && <button type="button" style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:12}} onClick={()=>setSectionEditing((p:any)=>({...p,hero_image:""}))}>✕ Remove</button>}
                      </div>
                    </div>
                  </div>
                )}

                {/* FEATURES/VALUES/ITEMS */}
                {(['features','values','testimonials'].some(k=>sectionModal.key.includes(k))) && (
                  <div>
                    <div className="modal-field"><label>Section Title</label><input value={sectionEditing.title||""} onChange={e=>setSectionEditing((p:any)=>({...p,title:e.target.value}))} /></div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontWeight:600,fontSize:12,letterSpacing:"1px",textTransform:"uppercase",color:"#666",marginBottom:8}}>Items</div>
                      {(sectionEditing.items||[]).map((item:any,i:number)=>(
                        <div key={i} style={{marginBottom:10,padding:12,background:"#F9F9F9",borderRadius:8,border:"1px solid #E5E5E5"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                            <span style={{fontSize:12,color:"#888"}}>Item #{i+1}</span>
                            <button style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:12}} onClick={()=>setSectionEditing((p:any)=>({...p,items:p.items.filter((_:any,j:number)=>j!==i)}))}>Remove</button>
                          </div>
                          {sectionModal.key.includes('testimonial') ? (
                            <>
                              <div className="modal-field" style={{marginBottom:6}}><label>Name</label><input value={item.name||""} onChange={e=>setSectionEditing((p:any)=>({...p,items:p.items.map((x:any,j:number)=>j===i?{...x,name:e.target.value}:x)}))} /></div>
                              <div className="modal-field" style={{marginBottom:6}}><label>Rating (1-5)</label><input type="number" min={1} max={5} value={item.rating||5} onChange={e=>setSectionEditing((p:any)=>({...p,items:p.items.map((x:any,j:number)=>j===i?{...x,rating:Number(e.target.value)}:x)}))} /></div>
                              <div className="modal-field" style={{marginBottom:0}}><label>Review Text</label><textarea rows={2} value={item.text||""} onChange={e=>setSectionEditing((p:any)=>({...p,items:p.items.map((x:any,j:number)=>j===i?{...x,text:e.target.value}:x)}))} /></div>
                            </>
                          ) : (
                            <>
                              <div className="modal-field" style={{marginBottom:6}}><label>Icon (emoji)</label><input value={item.icon||""} onChange={e=>setSectionEditing((p:any)=>({...p,items:p.items.map((x:any,j:number)=>j===i?{...x,icon:e.target.value}:x)}))} /></div>
                              <div className="modal-field" style={{marginBottom:6}}><label>Title</label><input value={item.title||""} onChange={e=>setSectionEditing((p:any)=>({...p,items:p.items.map((x:any,j:number)=>j===i?{...x,title:e.target.value}:x)}))} /></div>
                              <div className="modal-field" style={{marginBottom:0}}><label>Description</label><textarea rows={2} value={item.description||""} onChange={e=>setSectionEditing((p:any)=>({...p,items:p.items.map((x:any,j:number)=>j===i?{...x,description:e.target.value}:x)}))} /></div>
                            </>
                          )}
                        </div>
                      ))}
                      <button className="action-btn btn-view" onClick={()=>setSectionEditing((p:any)=>({...p,items:[...(p.items||[]),sectionModal.key.includes('testimonial')?{name:"",rating:5,text:""}:{icon:"⭐",title:"",description:""}]}))} >+ Add Item</button>
                    </div>
                  </div>
                )}

                {/* NEWSLETTER/MISSION */}
                {(['newsletter','mission','featured_products'].some(k=>sectionModal.key.includes(k))) && (
                  <div>
                    <div className="modal-field"><label>Title</label><input value={sectionEditing.title||""} onChange={e=>setSectionEditing((p:any)=>({...p,title:e.target.value}))} /></div>
                    {sectionEditing.subtitle!==undefined&&<div className="modal-field"><label>Subtitle</label><textarea rows={2} value={sectionEditing.subtitle||""} onChange={e=>setSectionEditing((p:any)=>({...p,subtitle:e.target.value}))} /></div>}
                    {sectionEditing.text!==undefined&&<div className="modal-field"><label>Text</label><textarea rows={3} value={sectionEditing.text||""} onChange={e=>setSectionEditing((p:any)=>({...p,text:e.target.value}))} /></div>}
                    {sectionEditing.button_text!==undefined&&<div className="modal-field"><label>Button Text</label><input value={sectionEditing.button_text||""} onChange={e=>setSectionEditing((p:any)=>({...p,button_text:e.target.value}))} /></div>}
                    {sectionEditing.show_count!==undefined&&<div className="modal-field"><label>Show Count</label><select value={sectionEditing.show_count||6} onChange={e=>setSectionEditing((p:any)=>({...p,show_count:Number(e.target.value)}))}><option value={3}>3</option><option value={6}>6</option><option value={9}>9</option></select></div>}
                  </div>
                )}

                <div className="modal-actions">
                  <button className="modal-cancel" onClick={()=>setSectionModal(null)}>Cancel</button>
                  <button className="modal-save" onClick={async()=>{
                    const res=await fetch("/api/sections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:sectionModal.key,value:sectionEditing})}).then(r=>r.json()).catch(()=>({}));
                    if(res.success){setSectionMsg("✅ Section saved!");setSections(s=>s.map(x=>x.key===sectionModal.key?{...x,data:sectionEditing}:x));setSectionModal(null);}
                    else setSectionMsg(`❌ ${res.error||"Failed"}`);
                    setTimeout(()=>setSectionMsg(""),3000);
                  }}>💾 Save Section</button>
                </div>
              </div>
            </div>
          )}

          {/* ❓ FAQ ADMIN */}
          {tab==="faqadmin" && (
            <div>
              {faqMsg && <div style={{marginBottom:14,padding:"10px 14px",background:faqMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",borderRadius:10,fontSize:13,color:faqMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{faqMsg}</div>}
              <div style={{marginBottom:16,display:"flex",justifyContent:"flex-end"}}>
                <button className="add-btn" onClick={()=>{setEditFaq({question:"",answer:"",category:"General"});setFaqModal("new");}}>+ Add FAQ</button>
              </div>
              {/* Group by category */}
              {Array.from(new Set(faqs.map((f:FAQ)=>f.category))).map(cat=>(
                <div key={cat} className="section-card" style={{marginBottom:16,overflow:"hidden"}}>
                  <div className="section-header"><div className="section-title">{cat}</div></div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Question</th><th>Visible</th><th>Actions</th></tr></thead>
                      <tbody>
                        {faqs.filter((f:FAQ)=>f.category===cat).map((f:FAQ)=>(
                          <tr key={f.id}>
                            <td style={{maxWidth:320,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.question}</td>
                            <td><span style={{fontSize:11,background:f.is_visible?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",border:`1px solid ${f.is_visible?"rgba(0,200,100,0.3)":"rgba(255,68,68,0.25)"}`,color:f.is_visible?"#00c864":"#ff6666",padding:"3px 10px",borderRadius:20,cursor:"pointer"}} onClick={async()=>{await fetch("/api/faqs",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...f,is_visible:f.is_visible?0:1})});setFaqs(prev=>prev.map((x:FAQ)=>x.id===f.id?{...x,is_visible:f.is_visible?0:1}:x));}}>{f.is_visible?"Visible":"Hidden"}</span></td>
                            <td>
                              <button className="action-btn btn-edit" style={{marginRight:6}} onClick={()=>{setEditFaq({question:f.question,answer:f.answer,category:f.category});setFaqModal(f);}}>Edit</button>
                              <button className="action-btn btn-delete" onClick={async()=>{if(!confirm("Delete this FAQ?"))return;await fetch(`/api/faqs?id=${f.id}`,{method:"DELETE"});setFaqs(prev=>prev.filter((x:FAQ)=>x.id!==f.id));}}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* FAQ Modal */}
          {faqModal && (
            <div className="modal-overlay">
              <div className="modal" onClick={e=>e.stopPropagation()}>
                <div className="modal-title">{faqModal==="new"?"Add New FAQ":"Edit FAQ"}</div>
                <div className="modal-field"><label>Category</label><select value={editFaq.category} onChange={e=>setEditFaq(f=>({...f,category:e.target.value}))}><option>Orders & Payment</option><option>Delivery & Shipping</option><option>Products & Setup</option><option>Returns & Refunds</option><option>General</option></select></div>
                <div className="modal-field"><label>Question *</label><textarea rows={2} value={editFaq.question} onChange={e=>setEditFaq(f=>({...f,question:e.target.value}))} placeholder="Enter question..." /></div>
                <div className="modal-field"><label>Answer *</label><textarea rows={4} value={editFaq.answer} onChange={e=>setEditFaq(f=>({...f,answer:e.target.value}))} placeholder="Enter answer..." /></div>
                <div className="modal-actions">
                  <button className="modal-cancel" onClick={()=>setFaqModal(null)}>Cancel</button>
                  <button className="modal-save" onClick={async()=>{
                    if(!editFaq.question||!editFaq.answer){setFaqMsg("❌ Question and answer required");return;}
                    let res: any;
                    if(faqModal==="new"){res=await fetch("/api/faqs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(editFaq)}).then(r=>r.json()).catch(()=>({}));if(res.success){setFaqMsg("✅ FAQ added");setFaqs(prev=>[...prev,{id:res.id,...editFaq,sort_order:0,is_visible:1} as FAQ]);}}
                    else{res=await fetch("/api/faqs",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...(faqModal as FAQ),...editFaq})}).then(r=>r.json()).catch(()=>({}));if(res.success){setFaqMsg("✅ FAQ updated");setFaqs(prev=>prev.map((x:FAQ)=>x.id===(faqModal as FAQ).id?{...x,...editFaq}:x));}}
                    setFaqModal(null);setTimeout(()=>setFaqMsg(""),3000);
                  }}>Save FAQ</button>
                </div>
              </div>
            </div>
          )}

          {/* 👤 STAFF USERS */}
          {tab==="staff" && adminRole==="super_admin" && (
            <div>
              {staffMsg && <div style={{marginBottom:14,padding:"10px 14px",background:staffMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",borderRadius:10,fontSize:13,color:staffMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{staffMsg}</div>}
              <div style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:12,color:"#888",marginBottom:4}}>Role permissions: <strong>super_admin</strong> = full access · <strong>manager</strong> = products + blogs · <strong>writer</strong> = blogs only</div>
                </div>
                <button className="add-btn" onClick={()=>{ setStaffForm({name:"",email:"",password:"",role:"writer"}); setStaffModal("new"); setStaffMsg(""); }}>+ Add Staff</button>
              </div>
              <div className="section-card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                    <tbody>
                      {staffUsers.length===0&&<tr><td colSpan={7} style={{textAlign:"center",color:"#888",padding:24}}>No staff users yet. Add staff to delegate access.</td></tr>}
                      {staffUsers.map((s:any)=>(
                        <tr key={s.id}>
                          <td style={{color:"#888",fontSize:12}}>#{s.id}</td>
                          <td style={{fontWeight:600}}>{s.name}</td>
                          <td style={{fontSize:12,color:"#888"}}>{s.email}</td>
                          <td><span className={`status-badge ${s.role==="super_admin"?"status-confirmed":s.role==="manager"?"status-dispatched":"status-pending"}`}>{s.role}</span></td>
                          <td><span className={`status-badge ${s.active?"status-delivered":"status-pending"}`}>{s.active?"Active":"Inactive"}</span></td>
                          <td style={{fontSize:12,color:"#888"}}>{s.created_at ? new Date(s.created_at).toLocaleDateString("en-GB") : "—"}</td>
                          <td style={{whiteSpace:"nowrap"}}>
                            <button className="action-btn btn-edit" style={{marginRight:6}} onClick={()=>{ setStaffForm({name:s.name,email:s.email,password:"",role:s.role}); setStaffModal(s); setStaffMsg(""); }}>Edit</button>
                            <button className="action-btn btn-delete" onClick={()=>deleteStaff(s.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {staffModal && (
                <div className="modal-overlay">
                  <div className="modal" onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
                    <div className="modal-title">{staffModal==="new"?"Add Staff User":"Edit Staff User"}</div>
                    {staffMsg&&<div style={{marginBottom:10,color:staffMsg.startsWith("✅")?"#00c864":"#ff6666",fontSize:13}}>{staffMsg}</div>}
                    <div className="modal-field"><label>Full Name *</label><input value={staffForm.name} onChange={e=>setStaffForm(f=>({...f,name:e.target.value}))} placeholder="Jane Smith" /></div>
                    <div className="modal-field"><label>Email *</label><input type="email" value={staffForm.email} onChange={e=>setStaffForm(f=>({...f,email:e.target.value}))} placeholder="jane@example.com" /></div>
                    <div className="modal-field"><label>{staffModal==="new"?"Password *":"New Password (leave blank to keep)"}</label><input type="password" value={staffForm.password} onChange={e=>setStaffForm(f=>({...f,password:e.target.value}))} placeholder="Password" /></div>
                    <div className="modal-field">
                      <label>Role *</label>
                      <select value={staffForm.role} onChange={e=>setStaffForm(f=>({...f,role:e.target.value}))} style={{width:"100%",padding:"10px 12px",border:"1px solid #E5E5E5",borderRadius:8,fontSize:14,background:"#fff",color:"#111"}}>
                        <option value="writer">Writer — Blog access only</option>
                        <option value="manager">Manager — Products + Blogs</option>
                        <option value="super_admin">Super Admin — Full access</option>
                      </select>
                    </div>
                    <div style={{fontSize:12,color:"#888",padding:"8px 0",lineHeight:1.6}}>
                      🔒 <strong>writer</strong>: view/add/edit blogs only<br/>
                      📦 <strong>manager</strong>: products, blogs, orders, customers<br/>
                      ⚙️ <strong>super_admin</strong>: everything including staff and settings
                    </div>
                    <div className="modal-actions">
                      <button className="modal-cancel" onClick={()=>setStaffModal(null)}>Cancel</button>
                      <button className="modal-save" onClick={saveStaff}>{staffModal==="new"?"Add Staff":"Save Changes"}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ⚙️ SITE SETTINGS */}
          {tab==="settings" && (
            <div className="section-card" style={{padding:28}}>
              <div className="section-header" style={{marginBottom:24}}>
                <div className="section-title">Site Settings</div>
                {contentMsg && <span style={{fontSize:13,color:contentMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{contentMsg}</span>}
              </div>

              <div style={{maxWidth:600}}>
                <div className="modal-field"><label>Website Title</label><input className="modal-field" style={{width:"100%"}} value={siteContent.site_title||""} onChange={e=>setSiteContent(s=>({...s,site_title:e.target.value}))} placeholder="Firestick4UK" /></div>
                <div className="modal-field"><label>Website Tagline</label><input className="modal-field" style={{width:"100%"}} value={siteContent.site_tagline||""} onChange={e=>setSiteContent(s=>({...s,site_tagline:e.target.value}))} placeholder="Best Firestick Service in UK" /></div>

                <div className="modal-field">
                  <label>Favicon</label>
                  <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",marginTop:8}}>
                    {siteContent.favicon_url && <img src={siteContent.favicon_url} alt="favicon" style={{width:32,height:32,borderRadius:4,border:"1px solid rgba(139,0,255,0.3)",objectFit:"contain",background:"rgba(255,255,255,0.05)"}} />}
                    <label style={{cursor:"pointer",background:"rgba(139,0,255,0.15)",border:"1px solid rgba(139,0,255,0.3)",padding:"8px 16px",borderRadius:8,fontSize:13,color:"var(--purple-glow)"}}>
                      {faviconUploading ? "Uploading..." : "Upload Favicon (.ico/.png/.svg)"}
                      <input type="file" accept=".ico,.png,.jpg,.svg" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&uploadFaviconAdmin(e.target.files[0])} disabled={faviconUploading} />
                    </label>
                    {siteContent.favicon_url && <span style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>{siteContent.favicon_url}</span>}
                  </div>
                </div>

                <div className="modal-field" style={{marginTop:8}}>
                  <label>Default Share Image (OG Image)</label>
                  <div style={{fontSize:11,color:"#888888",marginBottom:8}}>
                    📐 Recommended: <strong>1200×630px</strong> — shown when sharing homepage on WhatsApp/Facebook
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    {siteContent.og_default_image && <img src={siteContent.og_default_image} alt="OG preview" style={{width:120,height:63,borderRadius:6,border:"1px solid #E5E5E5",objectFit:"cover"}} />}
                    <label style={{cursor:"pointer",background:"#F5F5F5",border:"1px solid #E5E5E5",padding:"8px 16px",borderRadius:8,fontSize:13,color:"#5B21B6",fontWeight:600}}>
                      {ogImgUploading ? "⏳ Uploading..." : "📷 Upload OG Image"}
                      <input type="file" accept="image/*" style={{display:"none"}} disabled={ogImgUploading} onChange={async(e)=>{
                        const file=e.target.files?.[0]; if(!file) return;
                        setOgImgUploading(true);
                        try {
                          const base64=await new Promise<string>((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result as string); r.onerror=rej; r.readAsDataURL(file); });
                          const data=await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file:base64,name:file.name,folder:"firestick4uk/og"})}).then(r=>r.json());
                          if(data.path){
                            setSiteContent(s=>({...s,og_default_image:data.path}));
                            await fetch("/api/site-content",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:"og_default_image",value:data.path})});
                            setContentMsg("✅ OG image saved!");
                          }
                        } catch { setContentMsg("❌ Upload failed"); }
                        setOgImgUploading(false);
                        setTimeout(()=>setContentMsg(""),3000);
                      }} />
                    </label>
                    {siteContent.og_default_image && <button type="button" style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:12}} onClick={()=>{setSiteContent(s=>({...s,og_default_image:""}));saveContent(["og_default_image"]);}}>✕ Remove</button>}
                  </div>
                </div>

                <button className="btn-primary" style={{marginTop:12}} disabled={contentSaving} onClick={()=>saveContent(["site_title","site_tagline"])}>
                  {contentSaving?"Saving...":"💾 Save Settings"}
                </button>
              </div>
            </div>
          )}

          {/* 📄 PAGES EDITOR */}
          {tab==="pages" && (
            <div>
              {contentMsg && <div style={{marginBottom:16,padding:"10px 16px",background:contentMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",border:`1px solid ${contentMsg.startsWith("✅")?"rgba(0,200,100,0.3)":"rgba(255,68,68,0.25)"}`,borderRadius:10,fontSize:13,color:contentMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{contentMsg}</div>}

              <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
                {[["home","🏠 Home"],["about","ℹ️ About"],["contact","📞 Contact"],["footer","🔻 Footer"]].map(([k,l])=>(
                  <button key={k} className={`action-btn ${activePage===k?"btn-verify":"btn-view"}`} style={{padding:"10px 20px",fontSize:13}} onClick={()=>setActivePage(k)}>{l}</button>
                ))}
              </div>

              {/* HOME */}
              {activePage==="home" && (
                <div className="section-card" style={{padding:24}}>
                  <div className="section-header" style={{marginBottom:20}}><div className="section-title">🏠 Home Page Content</div></div>
                  <div className="modal-field"><label>Hero Title</label><input style={{width:"100%"}} value={siteContent.home_hero_title||""} onChange={e=>setSiteContent(s=>({...s,home_hero_title:e.target.value}))} placeholder="Best Firestick Service in UK" /></div>
                  <div className="modal-field"><label>Hero Subtitle</label><textarea rows={2} style={{width:"100%",resize:"vertical"}} value={siteContent.home_hero_subtitle||""} onChange={e=>setSiteContent(s=>({...s,home_hero_subtitle:e.target.value}))} placeholder="Premium Streaming Solutions" /></div>
                  <div className="modal-field"><label>Tagline</label><input style={{width:"100%"}} value={siteContent.home_tagline||""} onChange={e=>setSiteContent(s=>({...s,home_tagline:e.target.value}))} placeholder="Fast. Reliable. Affordable." /></div>
                  <button className="btn-primary" disabled={contentSaving} onClick={()=>saveContent(["home_hero_title","home_hero_subtitle","home_tagline"])}>{contentSaving?"Saving...":"💾 Save Home"}</button>
                </div>
              )}

              {/* ABOUT */}
              {activePage==="about" && (
                <div className="section-card" style={{padding:24}}>
                  <div className="section-header" style={{marginBottom:20}}><div className="section-title">ℹ️ About Page Content</div></div>
                  <div className="modal-field"><label>Page Title</label><input style={{width:"100%"}} value={siteContent.about_title||""} onChange={e=>setSiteContent(s=>({...s,about_title:e.target.value}))} /></div>
                  <div className="modal-field"><label>Main Description</label><textarea rows={4} style={{width:"100%",resize:"vertical"}} value={siteContent.about_description||""} onChange={e=>setSiteContent(s=>({...s,about_description:e.target.value}))} /></div>
                  <div className="modal-field"><label>Mission Statement</label><textarea rows={3} style={{width:"100%",resize:"vertical"}} value={siteContent.about_mission||""} onChange={e=>setSiteContent(s=>({...s,about_mission:e.target.value}))} /></div>
                  <button className="btn-primary" disabled={contentSaving} onClick={()=>saveContent(["about_title","about_description","about_mission"])}>{contentSaving?"Saving...":"💾 Save About"}</button>
                </div>
              )}

              {/* CONTACT */}
              {activePage==="contact" && (
                <div className="section-card" style={{padding:24}}>
                  <div className="section-header" style={{marginBottom:20}}><div className="section-title">📞 Contact Page Content</div></div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                    <div className="modal-field"><label>Phone Number</label><input style={{width:"100%"}} value={siteContent.contact_phone||""} onChange={e=>setSiteContent(s=>({...s,contact_phone:e.target.value}))} /></div>
                    <div className="modal-field"><label>Email Address</label><input style={{width:"100%"}} value={siteContent.contact_email||""} onChange={e=>setSiteContent(s=>({...s,contact_email:e.target.value}))} /></div>
                    <div className="modal-field"><label>WhatsApp (numbers only)</label><input style={{width:"100%"}} value={siteContent.contact_whatsapp||""} onChange={e=>setSiteContent(s=>({...s,contact_whatsapp:e.target.value}))} placeholder="447934519060" /></div>
                    <div className="modal-field"><label>Business Hours</label><input style={{width:"100%"}} value={siteContent.contact_hours||""} onChange={e=>setSiteContent(s=>({...s,contact_hours:e.target.value}))} /></div>
                    <div className="modal-field"><label>Address</label><input style={{width:"100%"}} value={siteContent.contact_address||""} onChange={e=>setSiteContent(s=>({...s,contact_address:e.target.value}))} /></div>
                  </div>
                  <button className="btn-primary" disabled={contentSaving} onClick={()=>saveContent(["contact_phone","contact_email","contact_whatsapp","contact_hours","contact_address"])}>{contentSaving?"Saving...":"💾 Save Contact"}</button>
                </div>
              )}

              {/* FOOTER */}
              {activePage==="footer" && (
                <div className="section-card" style={{padding:24}}>
                  <div className="section-header" style={{marginBottom:20}}><div className="section-title">🔻 Footer Content</div></div>
                  <div className="modal-field"><label>Footer Text (copyright)</label><input style={{width:"100%"}} value={siteContent.footer_text||""} onChange={e=>setSiteContent(s=>({...s,footer_text:e.target.value}))} /></div>
                  <div className="modal-field"><label>Footer Tagline</label><input style={{width:"100%"}} value={siteContent.footer_tagline||""} onChange={e=>setSiteContent(s=>({...s,footer_tagline:e.target.value}))} /></div>
                  <button className="btn-primary" disabled={contentSaving} onClick={()=>saveContent(["footer_text","footer_tagline"])}>{contentSaving?"Saving...":"💾 Save Footer"}</button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}