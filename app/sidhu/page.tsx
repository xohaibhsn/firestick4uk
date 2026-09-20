"use client";
import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import dynamic from "next/dynamic";
import { toEditorHtml } from "@/lib/contentHtml";
import AdminContentPanel from "@/components/admin/AdminContentPanel";
import SubscriptionContentEditor from "@/components/admin/SubscriptionContentEditor";
import { keysForPage } from "@/lib/adminContentFields";
import {
  canAccessSidhuTab,
  hasAdminPermission,
  ROLE_UI_DESCRIPTIONS,
  type SidhuTab,
} from "@/lib/adminPermissions";
const TipTapEditor = dynamic(() => import("../../components/admin/TipTapEditor"), { ssr: false });

const styles = `
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  :root { --purple:#5B21B6; --purple-dark:#4C1D95; --black:#1A1A1A; --text:#111111; --border:#E5E5E5; --gray:#F5F5F5; --gray-text:#666666; --green:#16A34A; --red:#DC2626; --orange:#EA580C; --blue:#2563EB; }
  body { background:#F5F5F5; color:#111111; font-family:var(--font-body); overflow-x:hidden; }

  /* LOGIN */
  .login-screen { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#F5F5F5; }
  .login-box { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:16px; padding:48px 40px; width:100%; max-width:420px; text-align:center; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
  .login-logo { font-family:var(--font-display); font-size:22px; font-weight:800; color:#111111; margin-bottom:6px; }
  .login-sub { font-size:12px; color:#666666; margin-bottom:32px; letter-spacing:2px; text-transform:uppercase; }
  .login-input { width:100%; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:8px; padding:12px 16px; color:#111111; font-family:var(--font-body); font-size:14px; outline:none; margin-bottom:12px; transition:border-color 0.2s; }
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
  .sidebar-logo-text { font-family:var(--font-display); font-size:15px; font-weight:800; color:#FFFFFF !important; letter-spacing:1px; }
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
  .page-heading { font-family:var(--font-display); font-size:22px; font-weight:700; color:#111111; }
  .page-heading span { color:#5B21B6; }
  .top-right { display:flex; align-items:center; gap:14px; position:relative; }
  .admin-badge { background:#F5F5F5; border:1px solid #E5E5E5; color:#666666; font-size:12px; padding:6px 14px; border-radius:20px; }
  .admin-user-btn { display:flex; align-items:center; gap:6px; background:#F5F5F5; border:1px solid #E5E5E5; color:#111111; font-size:13px; font-weight:500; padding:7px 14px; border-radius:20px; cursor:pointer; transition:all 0.15s; }
  .admin-user-btn:hover { background:#EEEEEE; border-color:#CCCCCC; }
  .admin-dropdown { position:absolute; top:calc(100% + 8px); right:0; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:10px; min-width:200px; box-shadow:0 4px 20px rgba(0,0,0,0.12); z-index:200; overflow:hidden; }
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
  .stat-value { font-family:var(--font-display); font-size:26px; font-weight:700; color:#111111; margin-bottom:3px; }
  .stat-label { font-size:11px; color:#666666; letter-spacing:1px; text-transform:uppercase; }

  /* TABLE */
  .section-card { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:12px; overflow:hidden; margin-bottom:20px; box-shadow:0 1px 4px rgba(0,0,0,0.04); }
  .section-header { padding:18px 20px; border-bottom:1px solid #E5E5E5; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
  .section-title { font-family:var(--font-display); font-size:15px; font-weight:700; color:#111111; }
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
  .modal-title { font-family:var(--font-display); font-size:18px; font-weight:700; color:#111111; margin-bottom:24px; }
  .modal-field { margin-bottom:16px; }
  .modal-field label { display:block; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#666666; margin-bottom:7px; font-weight:600; }
  .modal-field input, .modal-field select, .modal-field textarea { width:100%; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:8px; padding:11px 14px; color:#111111; font-family:var(--font-body); font-size:14px; outline:none; transition:border-color 0.2s; }
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
  { id:"FK44-62305", customer:"John Smith", email:"john@example.com", phone:"+447518787653", items:"B1G 6 Month Plan + Firestick 4K", total:"£89.98", status:"confirmed", date:"30 May 2026", receipt:true },
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
  { name:"John Smith", email:"john@example.com", phone:"+447518787653", orders:3, spent:"£219.96", joined:"Jan 2026" },
  { name:"Sarah Jones", email:"sarah@example.com", phone:"+44 7111 111111", orders:2, spent:"£123.97", joined:"Feb 2026" },
  { name:"Ali Hassan", email:"ali@example.com", phone:"+44 7222 222222", orders:1, spent:"£79.99", joined:"May 2026" },
  { name:"David Brown", email:"david@example.com", phone:"+44 7333 333333", orders:4, spent:"£189.95", joined:"Dec 2025" },
  { name:"Emma Wilson", email:"emma@example.com", phone:"+44 7444 444444", orders:1, spent:"£9.99", joined:"May 2026" },
];

type Tab = "dashboard"|"orders"|"products"|"customers"|"leads"|"training"|"blog"|"settings"|"pages"|"coupons"|"builder"|"faqadmin"|"staff"|"audit";
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
  const [adminPrincipalType, setAdminPrincipalType] = useState<"master"|"staff">("master");
  const [adminEmail, setAdminEmail] = useState<string|null>(null);
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [staffForm, setStaffForm] = useState({ name:"", email:"", password:"", confirmPassword:"", role:"writer", active:1 as 0|1 });
  const [staffModal, setStaffModal] = useState<any>(null);
  const [staffResetModal, setStaffResetModal] = useState<any>(null);
  const [staffResetForm, setStaffResetForm] = useState({ new_password:"", confirm_password:"" });
  const [staffConfirm, setStaffConfirm] = useState<{ type:"delete"|"disable"; user:any }|null>(null);
  const [staffMsg, setStaffMsg] = useState("");
  const [staffBusy, setStaffBusy] = useState(false);
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [primaryAdminOnboarding, setPrimaryAdminOnboarding] = useState(false);
  const [auditItems, setAuditItems] = useState<any[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditQ, setAuditQ] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditEntity, setAuditEntity] = useState("");
  const [auditExpanded, setAuditExpanded] = useState<number|null>(null);
  const [profileModal, setProfileModal] = useState<"profile"|"password"|null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [profileMsg, setProfileMsg] = useState("");
  const [passwordForm, setPasswordForm] = useState({ current_password:"", new_password:"", confirm_password:"" });
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminDropOpen, setAdminDropOpen] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [ordersHasFilters, setOrdersHasFilters] = useState(false);
  const [orderQ, setOrderQ] = useState("");
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<"all"|"bank"|"cod">("all");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [products, setProducts] = useState<any[]>(demoProducts);
  const [statusFilter, setStatusFilter] = useState("all");
  const [ordersPage, setOrdersPage] = useState(1);
  const ORDERS_PER_PAGE = 25;
  const [receiptModal, setReceiptModal] = useState<string|null>(null);
  const [orderModal, setOrderModal] = useState<any|null>(null);
  const [orderDetail, setOrderDetail] = useState<{ order: any; items: any[] }|null>(null);
  const [dashSummary, setDashSummary] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [productModal, setProductModal] = useState<any|null|"new">(null);
  const [editProduct, setEditProduct] = useState({ name:"", slug:"", category:"", price:"", stock:"", image:"", short_description:"", full_description:"", features:"", seo_title:"", meta_description:"", focus_keyword:"" });
  const [imageUploading, setImageUploading] = useState(false);
  const [heroImgUploading, setHeroImgUploading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customersPage, setCustomersPage] = useState(1);
  const [customersTotal, setCustomersTotal] = useState(0);
  const [customersTotalPages, setCustomersTotalPages] = useState(1);
  const [customersQ, setCustomersQ] = useState("");
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState("");
  const CUSTOMERS_PER_PAGE = 25;
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
  const [logoUploading, setLogoUploading] = useState(false);
  const [waIconUploading, setWaIconUploading] = useState(false);
  const [ogImgUploading, setOgImgUploading] = useState(false);
  const [heroSlideUploading, setHeroSlideUploading] = useState<number | null>(null);

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
  const [authChecking, setAuthChecking] = useState(true);
  const [permMsg, setPermMsg] = useState("");
  const trainingChatInputRef = useRef<HTMLInputElement>(null);
  const trainingChatEndRef = useRef<HTMLDivElement>(null);

  const can = (permission: Parameters<typeof hasAdminPermission>[1]) =>
    hasAdminPermission(adminRole, permission);

  const showPermError = (msg?: string) => {
    setPermMsg(msg || "You do not have permission for this action.");
    setTimeout(() => setPermMsg(""), 4000);
  };

  const handleSessionExpired = () => {
    setLoggedIn(false);
    setAdminRole("super_admin");
    setAdminName("Admin");
    setAdminPrincipalType("master");
    setTab("dashboard");
    setLoginError("Session expired. Please sign in again.");
  };

  const adminApi = async (url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> => {
    try {
      const res = await fetch(url, {
        ...init,
        credentials: "include",
        headers: { ...(init?.headers || {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        handleSessionExpired();
        return { ok: false, status: 401, data };
      }
      if (res.status === 403) {
        showPermError(data?.message || data?.error);
        return { ok: false, status: 403, data };
      }
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: {} };
    }
  };

  const mapOrderRow = (o: any) => ({
    id: o.order_id,
    customer: o.customer_name,
    email: o.customer_email,
    phone: o.customer_phone,
    items: o.items_list || o.payment_method || "—",
    total: `£${parseFloat(o.total || 0).toFixed(2)}`,
    status: o.status,
    date: o.created_at
      ? new Date(o.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—",
    receipt: !!o.receipt_path,
    receipt_path: o.receipt_path || "",
    address: [o.delivery_address, o.city, o.postcode].filter(Boolean).join(", "),
    payment: o.payment_method || "",
    payment_reference: o.payment_reference || "",
    city: o.city || "",
    postcode: o.postcode || "",
    notes: o.notes || "",
    coupon_code: o.coupon_code || "",
    discount_amount: o.discount_amount,
    vat_amount: o.vat_amount,
    created_at: o.created_at,
  });

  type OrderFilterOverrides = {
    q?: string;
    status?: string;
    payment?: "all"|"bank"|"cod";
    dateFrom?: string;
    dateTo?: string;
  };

  const refreshDashSummary = () => {
    if (!can("orders.view")) return;
    fetch("/api/admin-orders?summary=1", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) { handleSessionExpired(); return null; }
        if (r.status === 403) { showPermError(); return null; }
        return r.json();
      })
      .then((data) => { if (data && !data.error) setDashSummary(data); })
      .catch(() => {});
  };

  const loadOrders = async (page?: number, overrides?: OrderFilterOverrides) => {
    if (!can("orders.view")) return;
    const p = page ?? ordersPage;
    const q = overrides?.q !== undefined ? overrides.q : orderQ;
    const status = overrides?.status !== undefined ? overrides.status : statusFilter;
    const payment = overrides?.payment !== undefined ? overrides.payment : orderPaymentFilter;
    const dateFrom = overrides?.dateFrom !== undefined ? overrides.dateFrom : orderDateFrom;
    const dateTo = overrides?.dateTo !== undefined ? overrides.dateTo : orderDateTo;
    const hasFilters = !!(
      String(q || "").trim() ||
      (status && status !== "all") ||
      (payment && payment !== "all") ||
      dateFrom ||
      dateTo
    );
    setOrdersHasFilters(hasFilters);
    setOrdersLoading(true);
    setOrdersError("");
    const params = new URLSearchParams();
    params.set("page", String(p));
    params.set("limit", String(ORDERS_PER_PAGE));
    if (String(q || "").trim()) params.set("q", String(q).trim());
    if (status && status !== "all") params.set("status", status);
    if (payment && payment !== "all") params.set("payment_method", payment);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    try {
      const r = await fetch(`/api/admin-orders?${params.toString()}`, { credentials: "include" });
      if (r.status === 401) { handleSessionExpired(); return; }
      if (r.status === 403) { showPermError(); setOrdersError("You do not have permission to view orders."); return; }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setOrdersError(data?.error || "Failed to load orders");
        setOrders([]);
        setOrdersTotal(0);
        setOrdersTotalPages(1);
        return;
      }
      const items = Array.isArray(data?.items) ? data.items.map((o: any) => mapOrderRow(o)) : [];
      setOrders(items);
      setOrdersTotal(Number(data?.pagination?.total || 0));
      setOrdersTotalPages(Math.max(1, Number(data?.pagination?.totalPages || 1)));
      setOrdersPage(Number(data?.pagination?.page || p));
    } catch {
      setOrdersError("Failed to load orders");
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadCustomers = async (page?: number, overrides?: { q?: string }) => {
    if (!can("customers.view")) return;
    const p = page ?? customersPage;
    const q = overrides?.q !== undefined ? overrides.q : customersQ;
    setCustomersLoading(true);
    setCustomersError("");
    const params = new URLSearchParams();
    params.set("customers", "1");
    params.set("page", String(p));
    params.set("limit", String(CUSTOMERS_PER_PAGE));
    if (String(q || "").trim()) params.set("q", String(q).trim());
    try {
      const r = await fetch(`/api/admin-orders?${params.toString()}`, { credentials: "include" });
      if (r.status === 401) { handleSessionExpired(); return; }
      if (r.status === 403) { showPermError(); setCustomersError("You do not have permission to view customers."); return; }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setCustomersError(data?.error || "Failed to load customers");
        setCustomers([]);
        setCustomersTotal(0);
        setCustomersTotalPages(1);
        return;
      }
      const items = Array.isArray(data?.items)
        ? data.items.map((c: any) => ({
            name: c.customer_name || "",
            email: c.customer_email || "",
            phone: c.customer_phone || "",
            orders: Number(c.order_count) || 0,
            spent: `£${parseFloat(c.total_spent || 0).toFixed(2)}`,
            first_order: c.first_order
              ? new Date(c.first_order).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—",
            last_order: c.last_order
              ? new Date(c.last_order).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—",
          }))
        : [];
      setCustomers(items);
      setCustomersTotal(Number(data?.pagination?.total || 0));
      setCustomersTotalPages(Math.max(1, Number(data?.pagination?.totalPages || 1)));
      setCustomersPage(Number(data?.pagination?.page || p));
    } catch {
      setCustomersError("Failed to load customers");
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  };

  const clearOrderFilters = () => {
    setOrderQ("");
    setStatusFilter("all");
    setOrderPaymentFilter("all");
    setOrderDateFrom("");
    setOrderDateTo("");
    setOrdersPage(1);
    loadOrders(1, { q: "", status: "all", payment: "all", dateFrom: "", dateTo: "" });
  };

  const applyOrderFilters = () => {
    setOrdersPage(1);
    loadOrders(1);
  };

  const exportOrdersCsv = async () => {
    const params = new URLSearchParams();
    if (orderQ.trim()) params.set("q", orderQ.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (orderPaymentFilter !== "all") params.set("payment_method", orderPaymentFilter);
    if (orderDateFrom) params.set("date_from", orderDateFrom);
    if (orderDateTo) params.set("date_to", orderDateTo);
    try {
      const r = await fetch(`/api/admin-orders-export?${params.toString()}`, { credentials: "include" });
      if (r.status === 401) { handleSessionExpired(); return; }
      if (r.status === 403) { showPermError(); return; }
      if (r.status === 400) {
        const data = await r.json().catch(() => ({}));
        alert(data?.error || "Export failed");
        return;
      }
      if (!r.ok) {
        alert("Export failed");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "orders-export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed");
    }
  };

  const openOrderView = async (orderId: string) => {
    try {
      const r = await fetch(`/api/admin-orders?order_id=${encodeURIComponent(orderId)}`, {
        credentials: "include",
      });
      if (r.status === 401) { handleSessionExpired(); return; }
      if (r.status === 403) { showPermError(); return; }
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.order) {
        alert(data?.error || "Order not found");
        return;
      }
      setOrderDetail({ order: data.order, items: Array.isArray(data.items) ? data.items : [] });
      setOrderModal(mapOrderRow(data.order));
    } catch {
      alert("Failed to load order");
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin-session", { credentials: "include" }).then((r) => r.json());
        if (cancelled) return;
        if (res?.authenticated) {
          setLoggedIn(true);
          setAdminRole((res.role || "super_admin") as AdminRole);
          setAdminName(res.name || "Admin");
          setAdminPrincipalType(res.principalType === "staff" ? "staff" : "master");
          setAdminEmail(res.email || null);
        } else {
          setLoggedIn(false);
        }
      } catch {
        if (!cancelled) setLoggedIn(false);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loggedIn) return;

    // Blog is allowed for all CMS roles
    if (can("blog.manage")) {
      fetch("/api/blog", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setBlogPosts(data);
        })
        .catch(() => {});
    }

    if (can("products.view")) {
      fetch("/api/admin-products", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) setProducts(data);
        })
        .catch(() => {});
    } else {
      setProducts([]);
    }

    if (can("orders.view")) {
      fetch("/api/admin-orders?summary=1", { credentials: "include" })
        .then((r) => {
          if (r.status === 401) { handleSessionExpired(); return null; }
          if (r.status === 403) { showPermError(); return null; }
          return r.json();
        })
        .then((data) => { if (data && !data.error) setDashSummary(data); })
        .catch(() => {});
      fetch("/api/admin-orders?page=1&limit=10", { credentials: "include" })
        .then((r) => {
          if (r.status === 401) { handleSessionExpired(); return null; }
          if (r.status === 403) { showPermError(); return null; }
          return r.json();
        })
        .then((data) => {
          if (Array.isArray(data?.items)) {
            setRecentOrders(data.items.map((o: any) => mapOrderRow(o)));
          } else {
            setRecentOrders([]);
          }
        })
        .catch(() => {});
    } else {
      setDashSummary(null);
      setRecentOrders([]);
      setOrders([]);
    }

    if (!can("customers.view")) {
      setCustomers([]);
    }

    if (can("coupons.manage")) {
      fetch("/api/coupons", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setCoupons(d);
        })
        .catch(() => {});
    } else {
      setCoupons([]);
    }

    if (can("content.manage") || can("settings.manage")) {
      fetch("/api/site-content?page=all")
        .then((r) => r.json())
        .then((d) => {
          if (d && typeof d === "object") setSiteContent(d);
        })
        .catch(() => {});
    }

    if (can("page_builder.manage")) {
      fetch("/api/sections?page=home&all=1", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setSections(d);
        })
        .catch(() => {});
    } else {
      setSections([]);
    }

    if (can("faqs.manage")) {
      fetch("/api/faqs?admin=true", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setFaqs(d);
        })
        .catch(() => {});
    } else {
      setFaqs([]);
    }

    if (can("leads.view")) {
      fetch("/api/admin/leads", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) {
            setChatLeads(d);
            setSelectedLeadIds([]);
          }
        })
        .catch(() => {});
    } else {
      setChatLeads([]);
    }

    if (can("training.manage")) {
      fetch("/api/admin/berlin-training", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setBerlinTraining(d);
        })
        .catch(() => {});
      fetch("/api/admin/berlin-training-chat", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d) && d.length > 0) {
            setTrainingChat(
              d.map((m: TrainingChatMessage) => ({
                role: m.role,
                content: m.content,
                saved: !!m.saved,
              }))
            );
          }
        })
        .catch(() => {});
    }

    if (can("staff.manage")) {
      fetch("/api/admin-staff", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setStaffUsers(d);
        })
        .catch(() => {});
    } else {
      setStaffUsers([]);
    }
  }, [loggedIn, adminRole]);

  // Load orders/customers only when their tab is active (no polling)
  useEffect(() => {
    if (!loggedIn) return;
    if (tab === "orders" && can("orders.view")) {
      loadOrders(ordersPage || 1);
    }
    if (tab === "customers" && can("customers.view")) {
      loadCustomers(customersPage || 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, tab, adminRole]);

  // Keep current tab within role permissions (no hidden-tab bypass via state)
  useEffect(() => {
    if (!loggedIn) return;
    if (!canAccessSidhuTab(adminRole, tab as SidhuTab)) {
      setTab("dashboard");
    }
  }, [loggedIn, adminRole, tab]);

  const loadAuditLog = (page = 1) => {
    if (!can("audit.view")) return;
    setAuditLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (auditQ.trim()) params.set("q", auditQ.trim());
    if (auditAction.trim()) params.set("action", auditAction.trim());
    if (auditEntity.trim()) params.set("entity_type", auditEntity.trim());
    fetch(`/api/admin-audit?${params.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.items)) {
          setAuditItems(d.items);
          setAuditPage(Number(d.pagination?.page) || page);
          setAuditTotalPages(Number(d.pagination?.totalPages) || 1);
          setAuditTotal(Number(d.pagination?.total) || 0);
        } else {
          setAuditItems([]);
        }
      })
      .catch(() => setAuditItems([]))
      .finally(() => setAuditLoading(false));
  };

  useEffect(() => {
    if (!loggedIn || tab !== "audit" || !can("audit.view")) return;
    loadAuditLog(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, tab, adminRole]);

  useEffect(() => {
    if (tab !== "training") return;
    trainingChatEndRef.current?.scrollIntoView({ behavior:"smooth", block:"end" });
    if (!trainingChatLoading) {
      const focusTimer = window.setTimeout(() => trainingChatInputRef.current?.focus(), 50);
      return () => window.clearTimeout(focusTimer);
    }
  }, [tab, trainingChat, trainingChatLoading]);

  // Refresh all site_content when Site Settings or Content Editor opens
  useEffect(() => {
    if (!loggedIn) return;
    if (tab !== "settings" && tab !== "pages") return;
    if (!can("content.manage") && !can("settings.manage")) return;
    fetch("/api/site-content?page=all")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d === "object") setSiteContent(d);
      })
      .catch(() => {});
  }, [loggedIn, tab, adminRole]);

  // Cookie session carries auth — headers are only for Content-Type / optional metadata
  const getRoleHeaders = () => ({});

  const saveContent = async (keys: string[], overrides?: Record<string, string>) => {
    setContentSaving(true); setContentMsg("");
    const updates = keys.map(k => ({ key: k, value: overrides?.[k] ?? siteContent[k] ?? "" }));
    const res = await fetch("/api/site-content", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...getRoleHeaders() },
      body: JSON.stringify({ updates }),
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      return { status: r.status, ...data };
    }).catch(() => ({ status: 0 }));
    setContentSaving(false);
    if (res.status === 401) {
      handleSessionExpired();
      return;
    }
    if (res.status === 403) {
      setContentMsg(`❌ ${res.message || res.error || "You do not have permission for this action."}`);
      setTimeout(() => setContentMsg(""), 4000);
      return;
    }
    if (res.success && res.subscription_slug) {
      setSiteContent((s) => ({
        ...s,
        subscription_slug: res.subscription_slug,
        ...(res.subscription_previous_slug
          ? {
              subscription_previous_slug: res.subscription_previous_slug,
              subscription_canonical: "",
            }
          : {}),
      }));
    }
    setContentMsg(res.success ? "✅ Saved!" : `❌ ${res.error || "Save failed"}`);
    setTimeout(() => setContentMsg(""), 4000);
  };

  const uploadFaviconAdmin = async (file: File) => {
    setFaviconUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const data = await fetch("/api/upload-favicon", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...getRoleHeaders() },
        body: JSON.stringify({ file: base64, name: file.name }),
      }).then((r) => r.json());
      if (data.url) {
        setSiteContent((s) => ({ ...s, favicon_url: data.url }));
        await fetch("/api/site-content", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...getRoleHeaders() },
          body: JSON.stringify({ key: "favicon_url", value: data.url }),
        });
        setContentMsg("✅ Favicon uploaded!");
      } else {
        setContentMsg(`❌ ${data.error || "Upload failed"}`);
      }
    } catch {
      setContentMsg("❌ Upload failed");
    }
    setFaviconUploading(false);
    setTimeout(() => setContentMsg(""), 3000);
  };

  const uploadLogoAdmin = async (file: File) => {
    setLogoUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
      const data = await fetch("/api/upload", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...getRoleHeaders() },
        body: JSON.stringify({ file: base64, name: file.name, folder: "firestick4uk/logo" }),
      }).then(r => r.json());
      if (data.path) {
        setSiteContent(s => ({ ...s, site_logo_url: data.path }));
        await fetch("/api/site-content", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...getRoleHeaders() },
          body: JSON.stringify({ key: "site_logo_url", value: data.path }),
        });
        setContentMsg("✅ Logo saved!");
      } else {
        setContentMsg(`❌ ${data.error || "Upload failed"}`);
      }
    } catch { setContentMsg("❌ Upload failed"); }
    setLogoUploading(false);
    setTimeout(() => setContentMsg(""), 3000);
  };

  const uploadHeroSlideAdmin = async (slideNum: number, file: File) => {
    const key = `hero_slide_${slideNum}`;
    setHeroSlideUploading(slideNum);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const data = await fetch("/api/upload", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...getRoleHeaders() },
        body: JSON.stringify({ file: base64, name: file.name, folder: "firestick4uk/hero-slides" }),
      }).then((r) => r.json());
      if (data.path) {
        setSiteContent((s) => ({ ...s, [key]: data.path }));
        await fetch("/api/site-content", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...getRoleHeaders() },
          body: JSON.stringify({ key, value: data.path }),
        });
        setContentMsg(`✅ Slide ${slideNum} saved!`);
      } else {
        setContentMsg(`❌ ${data.error || "Upload failed"}`);
      }
    } catch {
      setContentMsg("❌ Upload failed");
    }
    setHeroSlideUploading(null);
    setTimeout(() => setContentMsg(""), 3000);
  };

  const uploadWhatsAppIconAdmin = async (file: File) => {
    setWaIconUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
      const data = await fetch("/api/upload", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...getRoleHeaders() },
        body: JSON.stringify({ file: base64, name: file.name, folder: "firestick4uk/whatsapp-icon" }),
      }).then(r => r.json());
      if (data.path) {
        const url = `${data.path}${data.path.includes("?") ? "&" : "?"}v=${Date.now()}`;
        setSiteContent(s => ({ ...s, whatsapp_icon_url: url }));
        await fetch("/api/site-content", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...getRoleHeaders() },
          body: JSON.stringify({ key: "whatsapp_icon_url", value: url }),
        });
        setContentMsg("✅ WhatsApp icon saved!");
      } else {
        setContentMsg(`❌ ${data.error || "Upload failed"}`);
      }
    } catch { setContentMsg("❌ Upload failed"); }
    setWaIconUploading(false);
    setTimeout(() => setContentMsg(""), 3000);
  };

  const uploadOgImageAdmin = async (file: File) => {
    setOgImgUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const data = await fetch("/api/upload", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...getRoleHeaders() },
        body: JSON.stringify({ file: base64, name: file.name, folder: "firestick4uk/og" }),
      }).then((r) => r.json());
      if (data.path) {
        const url = `${data.path}${data.path.includes("?") ? "&" : "?"}v=${Date.now()}`;
        setSiteContent((s) => ({ ...s, og_default_image: url }));
        await fetch("/api/site-content", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...getRoleHeaders() },
          body: JSON.stringify({ key: "og_default_image", value: url }),
        });
        setContentMsg("✅ OG image saved!");
      } else {
        setContentMsg(`❌ ${data.error || "Upload failed"}`);
      }
    } catch {
      setContentMsg("❌ Upload failed");
    }
    setOgImgUploading(false);
    setTimeout(() => setContentMsg(""), 3000);
  };

  const handleLogin = async () => {
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }).then(async (r) => {
        const data = await r.json().catch(() => ({}));
        return { status: r.status, ...data };
      });
      if (res.success) {
        setAdminRole((res.role || "super_admin") as AdminRole);
        setAdminName(res.name || "Admin");
        setAdminPrincipalType(res.principalType === "staff" ? "staff" : "master");
        setAdminEmail(null);
        setLoggedIn(true);
        setLoginError("");
      } else if (res.status === 429) {
        setLoginError("❌ Too many login attempts. Try again in 15 minutes.");
      } else if (res.error === "Account disabled") {
        setLoginError("❌ Account disabled");
      } else {
        setLoginError("❌ Invalid email or password");
      }
    } catch {
      setLoginError("❌ Login failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin-logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    setLoggedIn(false);
    setAdminRole("super_admin");
    setAdminName("Admin");
    setAdminPrincipalType("master");
    setAdminEmail(null);
    setProfileModal(null);
    setTab("dashboard");
  };

  const formatLastLogin = (value: any) => {
    if (!value) return "Never";
    try {
      return new Date(value).toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
    } catch {
      return "—";
    }
  };

  const roleLabel = (role: string) =>
    role === "super_admin" ? "Super Admin" : role === "manager" ? "Manager" : "Writer";

  const loadStaff = () => {
    fetch("/api/admin-staff", { credentials: "include", headers: getRoleHeaders() })
      .then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setStaffUsers(d); }).catch(()=>{});
  };

  const saveStaff = async () => {
    if (!staffForm.name.trim()||!staffForm.email.trim()) { setStaffMsg("❌ Name and email required"); return; }
    if (staffModal==="new") {
      if (!staffForm.password) { setStaffMsg("❌ Password required"); return; }
      if (staffForm.password.length < 10) { setStaffMsg("❌ Password must be at least 10 characters"); return; }
      if (staffForm.password !== staffForm.confirmPassword) { setStaffMsg("❌ Passwords do not match"); return; }
    }
    setStaffBusy(true);
    const role = primaryAdminOnboarding && staffModal==="new" ? "super_admin" : staffForm.role;
    const method = staffModal==="new" ? "POST" : "PUT";
    const body = staffModal==="new"
      ? { name: staffForm.name, email: staffForm.email, password: staffForm.password, role, active: 1 }
      : { id: staffModal.id, name: staffForm.name, email: staffForm.email, role: staffForm.role, active: staffForm.active };
    const res = await fetch("/api/admin-staff",{method,credentials:"include",headers:{...getRoleHeaders(),"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json()).catch(()=>({}));
    setStaffBusy(false);
    if (res.success) {
      if (primaryAdminOnboarding && staffModal==="new") {
        setStaffMsg("✅ Primary Admin created. Sign out of Recovery Admin and sign in with your Primary Admin account for everyday use.");
      } else {
        setStaffMsg("✅ Saved!");
      }
      setStaffModal(null);
      setPrimaryAdminOnboarding(false);
      loadStaff();
    }
    else setStaffMsg(`❌ ${res.error||"Failed"}`);
    setTimeout(()=>setStaffMsg(""), primaryAdminOnboarding ? 8000 : 4000);
  };

  const openPrimaryAdminCreate = () => {
    setPrimaryAdminOnboarding(true);
    setStaffForm({ name:"", email:"", password:"", confirmPassword:"", role:"super_admin", active:1 });
    setShowStaffPassword(false);
    setStaffModal("new");
    setStaffMsg("");
  };

  const confirmStaffAction = async () => {
    if (!staffConfirm) return;
    setStaffBusy(true);
    if (staffConfirm.type === "delete") {
      const res = await fetch(`/api/admin-staff?id=${staffConfirm.user.id}`, { method: "DELETE", credentials: "include", headers: getRoleHeaders()}).then(r=>r.json()).catch(()=>({}));
      setStaffBusy(false);
      setStaffConfirm(null);
      if (res.success) { setStaffMsg("✅ Staff user deleted"); loadStaff(); }
      else setStaffMsg(`❌ ${res.error||"Delete failed"}`);
    } else {
      const res = await fetch("/api/admin-staff", {
        method: "PUT",
        credentials: "include",
        headers: { ...getRoleHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          id: staffConfirm.user.id,
          name: staffConfirm.user.name,
          email: staffConfirm.user.email,
          role: staffConfirm.user.role,
          active: 0,
        }),
      }).then(r=>r.json()).catch(()=>({}));
      setStaffBusy(false);
      setStaffConfirm(null);
      if (res.success) { setStaffMsg("✅ Account disabled"); loadStaff(); }
      else setStaffMsg(`❌ ${res.error||"Disable failed"}`);
    }
    setTimeout(()=>setStaffMsg(""),4000);
  };

  const enableStaff = async (user: any) => {
    setStaffBusy(true);
    const res = await fetch("/api/admin-staff", {
      method: "PUT",
      credentials: "include",
      headers: { ...getRoleHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role, active: 1 }),
    }).then(r=>r.json()).catch(()=>({}));
    setStaffBusy(false);
    if (res.success) { setStaffMsg("✅ Account enabled"); loadStaff(); }
    else setStaffMsg(`❌ ${res.error||"Enable failed"}`);
    setTimeout(()=>setStaffMsg(""),4000);
  };

  const resetStaffPassword = async () => {
    if (!staffResetModal) return;
    if (staffResetForm.new_password.length < 10) { setStaffMsg("❌ Password must be at least 10 characters"); return; }
    if (staffResetForm.new_password !== staffResetForm.confirm_password) { setStaffMsg("❌ Passwords do not match"); return; }
    setStaffBusy(true);
    const res = await fetch("/api/admin-staff-password", {
      method: "POST",
      credentials: "include",
      headers: { ...getRoleHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ id: staffResetModal.id, ...staffResetForm }),
    }).then(r=>r.json()).catch(()=>({}));
    setStaffBusy(false);
    if (res.success) {
      setStaffMsg("✅ Password reset. Their sessions were revoked.");
      setStaffResetModal(null);
      setStaffResetForm({ new_password:"", confirm_password:"" });
    } else setStaffMsg(`❌ ${res.error||"Reset failed"}`);
    setTimeout(()=>setStaffMsg(""),4000);
  };

  const openProfile = async () => {
    setAdminDropOpen(false);
    setProfileMsg("");
    setProfileModal("profile");
    try {
      const res = await fetch("/api/admin-profile", { credentials: "include" }).then(r=>r.json());
      setProfileData(res);
      if (res?.name) setAdminName(res.name);
      if (res?.email) setAdminEmail(res.email);
      if (res?.principalType) setAdminPrincipalType(res.principalType);
    } catch {
      setProfileData(null);
      setProfileMsg("❌ Could not load profile");
    }
  };

  const openChangePassword = () => {
    setAdminDropOpen(false);
    setPasswordForm({ current_password:"", new_password:"", confirm_password:"" });
    setProfileMsg("");
    setShowPwCurrent(false); setShowPwNew(false); setShowPwConfirm(false);
    setProfileModal("password");
  };

  const submitChangePassword = async () => {
    if (adminPrincipalType === "master") {
      setProfileMsg("❌ Master password is managed via server environment");
      return;
    }
    if (passwordForm.new_password.length < 10) { setProfileMsg("❌ Password must be at least 10 characters"); return; }
    if (passwordForm.new_password !== passwordForm.confirm_password) { setProfileMsg("❌ Passwords do not match"); return; }
    setStaffBusy(true);
    const res = await fetch("/api/admin-profile", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(passwordForm),
    }).then(r=>r.json()).catch(()=>({}));
    setStaffBusy(false);
    if (res.success || res.reLoginRequired) {
      setProfileModal(null);
      setLoggedIn(false);
      setAdminRole("super_admin");
      setAdminName("Admin");
      setAdminPrincipalType("master");
      setLoginError("");
      setUsername("");
      setPassword("");
      alert("Password changed. Please sign in again.");
    } else {
      setProfileMsg(`❌ ${res.error||"Password change failed"}`);
    }
  };

  const updateStatus = (id: string, status: OrderStatus) => {
    fetch("/api/admin-orders", {
      method: "PATCH",
      credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: id, status }),
    })
      .then(async (r) => {
        if (r.status === 401) { handleSessionExpired(); return; }
        if (r.status === 403) { showPermError(); return; }
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          alert(data?.error || "Status update failed");
          return;
        }
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
        setRecentOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
        refreshDashSummary();
      })
      .catch(() => {});
    setOrderModal(null);
    setOrderDetail(null);
  };

  const deleteOrder = async (orderId: string, total: string, status: string) => {
    const amountNum = parseFloat((total||"0").replace("£","").replace(",",""));
    const isRevenue = ["confirmed","dispatched","delivered"].includes(status);
    const msg = `⚠️ Delete order ${orderId}?\n\nAmount: ${total}\nStatus: ${status.toUpperCase()}${isRevenue ? `\n\n💰 This will reverse £${amountNum.toFixed(2)} from confirmed revenue.` : ""}\n\nThis cannot be undone.`;
    if (!confirm(msg)) return;
    const res = await fetch("/api/admin-orders", {
      method: "DELETE",
      credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId }),
    }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setOrderModal(null);
      setOrderDetail(null);
      const nextLen = orders.length - 1;
      if (nextLen <= 0 && ordersPage > 1) {
        const prevPage = ordersPage - 1;
        setOrdersPage(prevPage);
        await loadOrders(prevPage);
      } else {
        await loadOrders(ordersPage);
      }
      refreshDashSummary();
    } else {
      alert(`❌ Delete failed: ${res.error || "Unknown error"}`);
    }
  };

  const toSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  const handleFeatImg = async (file: File) => {
    setFeatImgUploading(true);
    try {
      const base64 = await new Promise<string>((resolve,reject) => { const r=new FileReader(); r.onload=()=>resolve(r.result as string); r.onerror=reject; r.readAsDataURL(file); });
      const r = await fetch("/api/upload",{
        method:"POST",
        credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({file:base64,name:file.name,folder:"firestick4uk/blog"}),
      });
      if (r.status === 401) { handleSessionExpired(); return; }
      if (r.status === 403) { showPermError(); return; }
      const res = await r.json();
      if (res.path) setEditBlog(p=>({...p,featured_image:res.path}));
      else if (res.error) setBlogMsg(`❌ ${res.message || res.error}`);
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
      credentials: "include", headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`/api/blog?id=${id}`, { method: "DELETE", credentials: "include" }).then(r=>r.json()).catch(()=>({}));
    if (res.success) {
      setBlogPosts(blogPosts.filter(p => p.id !== id));
      setBlogMsg("✅ Post deleted");
    } else {
      setBlogMsg(`❌ ${res.error || "Delete failed"}`);
    }
    setTimeout(()=>setBlogMsg(""),3000);
  };

  const deleteProduct = (id: number) => {
    fetch(`/api/admin-products?id=${id}`, { method: "DELETE", credentials: "include" }).catch(() => {});
    setProducts(products.filter(p => p.id !== id));
  };

  const deleteLead = async (id: number) => {
    if (!confirm("Delete this chat lead?")) return;
    const res = await fetch(`/api/admin/leads?id=${id}`, {
      method: "DELETE",
      credentials: "include",
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
      credentials: "include", headers: { "Content-Type": "application/json" },
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
    fetch("/api/admin/berlin-training", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setBerlinTraining(d); })
      .catch(() => {});
  };

  const loadBerlinTrainingChat = () => {
    fetch("/api/admin/berlin-training-chat", { credentials: "include" })
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
      credentials: "include", headers: { "Content-Type": "application/json" },
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
      credentials: "include", headers: { "Content-Type": "application/json" },
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
      credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item, is_active: !item.is_active }),
    });
    loadBerlinTraining();
  };

  const deleteBerlinTraining = async (id: number) => {
    if (!confirm("Delete this Berlin training note?")) return;
    await fetch(`/api/admin/berlin-training?id=${id}`, {
      method: "DELETE",
      credentials: "include",
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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: base64, name: file.name, folder: "firestick4uk/products" }),
      }).then(async (r) => {
        if (r.status === 401) { handleSessionExpired(); return {}; }
        if (r.status === 403) { showPermError(); return {}; }
        return r.json();
      });
      if (res.path) setEditProduct(p => ({ ...p, image: res.path }));
    } catch {}
    setImageUploading(false);
  };

  const saveProduct = async () => {
    const rawPrice = String(editProduct.price).replace(/[^0-9.]/g, "");
    const slug = (editProduct.slug || toSlug(editProduct.name)).trim();
    if (!editProduct.name.trim()) return;
    if (!slug) return;
    const payload = {
      name: editProduct.name,
      slug,
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
    if (productModal === "new") {
      const res = await fetch("/api/admin-products", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(payload),
      }).then(r => r.json()).catch(() => ({}));
      if (res.error) { alert(res.error); return; }
      const newId = res.id || Date.now();
      setProducts([...products, { ...editProduct, slug, id: newId, emoji: "" }]);
    } else if (productModal) {
      const res = await fetch("/api/admin-products", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ ...payload, id: productModal.id, active: 1 }),
      }).then(r => r.json()).catch(() => ({}));
      if (res.error) { alert(res.error); return; }
      setProducts(products.map(p => p.id === productModal.id ? { ...p, ...editProduct, slug } : p));
    }
    setProductModal(null);
  };

  const openEditProduct = (p: any) => {
    const rawPrice = p.price ? `£${Number(String(p.price).replace(/[^0-9.]/g,'')).toFixed(2)}` : "";
    setEditProduct({ name:p.name||"", slug:p.slug||toSlug(p.name||""), category:p.category||"Subscription", price:rawPrice, stock:p.stock||"Digital", image:p.image||"", short_description:p.short_description||"", full_description:p.full_description||"", features:p.features||"", seo_title:p.seo_title||"", meta_description:p.meta_description||"", focus_keyword:p.focus_keyword||"" });
    setProductModal(p);
  };

  const openNewProduct = () => {
    setEditProduct({ name:"", slug:"", category:"Subscription", price:"", stock:"Digital", image:"", short_description:"", full_description:"", features:"", seo_title:"", meta_description:"", focus_keyword:"" });
    setProductModal("new");
  };

  const pendingCount = Number(dashSummary?.pending_orders || 0);
  const leadsLast24 = chatLeads.filter(lead => new Date(lead.created_at).getTime() >= leadWindowStart).length;

  const statusClass = (s: string) => `status-badge status-${s}`;

  if (authChecking) {
    return (
      <>
        <style>{styles}</style>
        <div className="login-screen">
          <div className="login-box">
            <div className="login-logo">FIRESTICK4UK</div>
            <div className="login-sub">Checking session…</div>
          </div>
        </div>
      </>
    );
  }

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
            {(() => { const o = orders.find(x => x.id === receiptModal) || recentOrders.find(x => x.id === receiptModal); const path = (o as any)?.receipt_path; return path ? (
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
          <div className="modal" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()} style={{maxWidth:640}}>
            <div className="modal-title">Order — {orderModal.id}</div>

            <div style={{fontSize:11,letterSpacing:1.5,textTransform:"uppercase",color:"#666",fontWeight:700,marginBottom:10}}>Order</div>
            <div className="modal-field"><label>Order ID</label><input readOnly value={orderModal.id} /></div>
            <div className="modal-field"><label>Date</label><input readOnly value={orderModal.date || "—"} /></div>
            <div className="modal-field"><label>Delivery Address</label><input readOnly value={orderModal.address || "—"} /></div>

            <div style={{fontSize:11,letterSpacing:1.5,textTransform:"uppercase",color:"#666",fontWeight:700,margin:"18px 0 10px"}}>Customer</div>
            <div className="modal-field"><label>Name</label><input readOnly value={orderModal.customer || "—"} /></div>
            <div className="modal-field"><label>Email</label><input readOnly value={orderModal.email || "—"} /></div>
            <div className="modal-field"><label>Phone / WhatsApp</label><input readOnly value={orderModal.phone || "—"} /></div>

            <div style={{fontSize:11,letterSpacing:1.5,textTransform:"uppercase",color:"#666",fontWeight:700,margin:"18px 0 10px"}}>Items</div>
            {orderDetail?.items?.length ? (
              <div className="table-wrap" style={{marginBottom:16,border:"1px solid #E5E5E5",borderRadius:8}}>
                <table>
                  <thead><tr><th>Product</th><th>Qty</th><th>Price</th></tr></thead>
                  <tbody>
                    {orderDetail.items.map((it: any) => (
                      <tr key={it.id || `${it.product_name}-${it.quantity}`}>
                        <td>{it.product_name || "—"}</td>
                        <td>{it.quantity ?? "—"}</td>
                        <td>£{parseFloat(it.price || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="modal-field"><label>Items</label><input readOnly value={orderModal.items || "—"} /></div>
            )}

            <div style={{fontSize:11,letterSpacing:1.5,textTransform:"uppercase",color:"#666",fontWeight:700,margin:"18px 0 10px"}}>Payment</div>
            <div className="modal-field"><label>Payment Method</label><input readOnly value={orderModal.payment || "—"} /></div>
            {orderModal.payment_reference && (
              <div className="modal-field"><label>Payment Reference</label><input readOnly value={orderModal.payment_reference} style={{background:"#F5F3FF",borderColor:"#DDD6FE",fontWeight:600}} /></div>
            )}

            <div style={{fontSize:11,letterSpacing:1.5,textTransform:"uppercase",color:"#666",fontWeight:700,margin:"18px 0 10px"}}>Totals</div>
            <div className="modal-field"><label>VAT</label><input readOnly value={orderModal.vat_amount != null && orderModal.vat_amount !== "" ? `£${parseFloat(orderModal.vat_amount || 0).toFixed(2)}` : "—"} /></div>
            <div className="modal-field"><label>Discount</label><input readOnly value={orderModal.discount_amount != null && orderModal.discount_amount !== "" ? `£${parseFloat(orderModal.discount_amount || 0).toFixed(2)}` : "—"} /></div>
            <div className="modal-field"><label>Coupon</label><input readOnly value={orderModal.coupon_code || "—"} /></div>
            <div className="modal-field"><label>Total</label><input readOnly value={orderModal.total} /></div>

            {(orderModal.notes || orderDetail?.order?.notes) && (
              <>
                <div style={{fontSize:11,letterSpacing:1.5,textTransform:"uppercase",color:"#666",fontWeight:700,margin:"18px 0 10px"}}>Notes</div>
                <div className="modal-field"><textarea readOnly value={orderModal.notes || orderDetail?.order?.notes || ""} rows={3} /></div>
              </>
            )}

            {(orderModal.receipt_path || orderDetail?.order?.receipt_path) && (
              <div className="modal-field" style={{marginTop:8}}>
                <label>Receipt</label>
                <a
                  href={orderModal.receipt_path || orderDetail?.order?.receipt_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{color:"#5B21B6",fontSize:14,fontWeight:600}}
                >
                  Open receipt ↗
                </a>
              </div>
            )}

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
                <button className="modal-cancel" onClick={() => { setOrderModal(null); setOrderDetail(null); }}>Close</button>
                {orderModal.receipt && <button className="modal-save" onClick={() => { setOrderModal(null); setOrderDetail(null); setReceiptModal(orderModal.id); }}>View Receipt</button>}
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
              <div className="modal-field">
                <label>Product Name *</label>
                <input
                  placeholder="e.g. B1G 1 Year Plan"
                  value={editProduct.name}
                  onChange={e => {
                    const name = e.target.value;
                    setEditProduct(p => {
                      const shouldAuto = productModal === "new" || !p.slug || p.slug === toSlug(p.name);
                      return { ...p, name, slug: shouldAuto ? toSlug(name) : p.slug };
                    });
                  }}
                />
              </div>
              <div className="modal-field">
                <label>Category</label>
                <select value={editProduct.category} onChange={e => setEditProduct({...editProduct,category:e.target.value})}>
                  <option>Subscription</option><option>Device</option><option>Bundle</option>
                </select>
              </div>
            </div>
            <div className="modal-field">
              <label>URL Slug</label>
              <input
                type="text"
                value={editProduct.slug || ""}
                onChange={e => setEditProduct({
                  ...editProduct,
                  slug: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/(^-|-$)/g, ""),
                })}
                placeholder="e.g. b1g-1-month-plan"
              />
              <small style={{display:"block",marginTop:4,fontSize:11,color:"rgba(255,255,255,0.35)"}}>
                URL: firestick4uk.com/products/{editProduct.slug || "product-slug"}
              </small>
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
                <label style={{cursor:"pointer",background:"rgba(139,0,255,0.15)",border:"1px solid rgba(139,0,255,0.35)",padding:"8px 16px",borderRadius:8,fontSize:13,color:"#5B21B6"}}>
                  {imageUploading ? "Uploading..." : "Upload Image"}
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={e => e.target.files?.[0] && handleProductImage(e.target.files[0])} disabled={imageUploading} />
                </label>
                {editProduct.image && <button style={{background:"none",border:"none",color:"rgba(255,100,100,0.7)",cursor:"pointer",fontSize:13}} onClick={() => setEditProduct(p=>({...p,image:""}))}>Remove</button>}
              </div>
            </div>

            {/* Descriptions — TipTap rich text */}
            <div className="modal-field">
              <label>Short Description</label>
              <TipTapEditor
                content={editProduct.short_description || ""}
                onChange={(html) => setEditProduct({ ...editProduct, short_description: html })}
                placeholder="Brief product summary shown on the product page..."
              />
            </div>
            <div className="modal-field">
              <label>Full Description</label>
              <TipTapEditor
                content={editProduct.full_description || ""}
                onChange={(html) => setEditProduct({ ...editProduct, full_description: html })}
                placeholder="Detailed product description for the product page..."
              />
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
                <label style={{cursor:"pointer",background:"rgba(139,0,255,0.15)",border:"1px solid rgba(139,0,255,0.35)",padding:"7px 14px",borderRadius:8,fontSize:13,color:"#5B21B6"}}>
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
              <button type="button" className="erp-btn" style={{background:"rgba(139,0,255,0.15)",border:"1px solid rgba(139,0,255,0.3)",color:"#5B21B6",padding:"7px 16px",borderRadius:8,cursor:"pointer",fontSize:13}} onClick={()=>setEditBlog(p=>({...p,faqs:[...p.faqs,{question:"",answer:""}]}))}>+ Add FAQ</button>
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
              { id:"pages",     icon:"✏️", label:"Content Editor", roles:["super_admin","manager"] },
              { id:"staff",     icon:"👤", label:"Staff Users",  roles:["super_admin"] },
              { id:"audit",     icon:"📜", label:"Activity Log", roles:["super_admin"] },
              { id:"settings",  icon:"⚙️", label:"Site Settings",roles:["super_admin"] },
            ] as const).filter(item => canAccessSidhuTab(adminRole, item.id as SidhuTab)).map(item => (
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
                {tab==="pages" && <>Content <span>Editor</span></>}
                {tab==="staff" && <>Staff <span>Users</span></>}
                {tab==="audit" && <>Activity <span>Log</span></>}
                {tab==="settings" && <>Site <span>Settings</span></>}
              </h1>
            </div>
            <div className="top-right">
              <button className="admin-user-btn" onClick={() => setAdminDropOpen(o => !o)}>
                👤{" "}
                {adminPrincipalType==="master"
                  ? "Recovery Admin"
                  : `${adminName} · ${roleLabel(adminRole)}`}{" "}
                <span style={{fontSize:10,color:"#888888"}}>{adminDropOpen?"▲":"▼"}</span>
              </button>
              {adminDropOpen && (
                <div className="admin-dropdown" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
                  <div className="admin-dropdown-header">
                    <div className="admin-dropdown-name">{adminPrincipalType==="master" ? "Recovery Admin" : adminName}</div>
                    <div className="admin-dropdown-role">
                      {adminPrincipalType==="master" ? "Environment-managed · " : ""}
                      {roleLabel(adminRole)}
                    </div>
                  </div>
                  <button className="admin-dropdown-item" onClick={() => { void openProfile(); }}>
                    👤 My Profile
                  </button>
                  {adminPrincipalType!=="master" && (
                    <button className="admin-dropdown-item" onClick={() => openChangePassword()}>
                      🔑 Change Password
                    </button>
                  )}
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
              {permMsg && (
                <div style={{marginBottom:14,padding:"10px 14px",background:"rgba(255,68,68,0.1)",borderRadius:10,fontSize:13,color:"#ff6666"}}>
                  ❌ {permMsg}
                </div>
              )}
              <div className="stats-grid">
                {(can("orders.view")
                  ? [
                      { icon:"🛒", label:"Total Orders", value:Number(dashSummary?.total_orders || 0), trend:"All time" },
                      { icon:"⏳", label:"Pending Orders", value:Number(dashSummary?.pending_orders || 0), trend:"Needs action" },
                      { icon:"💰", label:"Total Revenue", value:`£${Number(dashSummary?.confirmed_revenue || 0).toFixed(2)}`, trend:"Confirmed only" },
                      { icon:"👥", label:"Customers", value:Number(dashSummary?.customer_count || 0), trend:"Unique" },
                      { icon:"📦", label:"Products", value:Number(dashSummary?.product_count ?? products.length), trend:"Active" },
                      { icon:"✅", label:"Delivered", value:Number(dashSummary?.delivered_orders || 0), trend:"All time" },
                    ]
                  : [
                      { icon:"📝", label:"Blog Posts", value:blogPosts.length, trend:"All posts" },
                      { icon:"✅", label:"Published", value:blogPosts.filter((p)=>p.status==="published").length, trend:"Live" },
                      { icon:"📄", label:"Drafts", value:blogPosts.filter((p)=>p.status==="draft").length, trend:"In progress" },
                    ]
                ).map((s,i) => (
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
              {can("orders.view") && (
              <div className="section-card">
                <div className="section-header">
                  <div className="section-title">Recent Orders</div>
                  <button className="add-btn" onClick={() => setTab("orders")}>View All →</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                      {recentOrders.map(o => (
                        <tr key={o.id}>
                          <td style={{fontFamily:"monospace",color:"#5B21B6"}}>{o.id}</td>
                          <td>{o.customer}</td>
                          <td style={{maxWidth:"180px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.items}</td>
                          <td style={{fontWeight:700}}>{o.total}</td>
                          <td><span className={statusClass(o.status)}>{o.status}</span></td>
                          <td><button className="action-btn btn-view" onClick={() => openOrderView(o.id)}>View</button></td>
                        </tr>
                      ))}
                      {recentOrders.length === 0 && (
                        <tr><td colSpan={6} style={{textAlign:"center",color:"#999",padding:"20px"}}>No recent orders</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              )}
              {!can("orders.view") && can("blog.manage") && (
                <div className="section-card">
                  <div className="section-header">
                    <div className="section-title">Your Blog Posts</div>
                    <button className="add-btn" onClick={() => setTab("blog")}>Manage Blog →</button>
                  </div>
                  <div style={{fontSize:13,color:"#666",padding:"8px 0"}}>
                    You have access to Blog authoring. Use the Blog tab to create and edit posts.
                  </div>
                </div>
              )}
            </>
          )}

          {/* ORDERS */}
          {tab==="orders" && can("orders.view") && (() => {
            const from = ordersTotal === 0 ? 0 : (ordersPage - 1) * ORDERS_PER_PAGE + 1;
            const to = Math.min(ordersPage * ORDERS_PER_PAGE, ordersTotal);
            return (
            <div className="section-card">
              <div className="section-header">
                <div className="section-title">All Orders ({ordersTotal})</div>
                <div className="section-actions" style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
                  <input
                    className="filter-select"
                    style={{minWidth:160}}
                    placeholder="Search orders…"
                    value={orderQ}
                    onChange={(e) => setOrderQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") applyOrderFilters(); }}
                  />
                  <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="dispatched">Dispatched</option>
                    <option value="delivered">Delivered</option>
                  </select>
                  <select className="filter-select" value={orderPaymentFilter} onChange={e => setOrderPaymentFilter(e.target.value as "all"|"bank"|"cod")}>
                    <option value="all">All Payment</option>
                    <option value="bank">Bank</option>
                    <option value="cod">COD</option>
                  </select>
                  <input className="filter-select" type="date" value={orderDateFrom} onChange={e => setOrderDateFrom(e.target.value)} title="Date from" />
                  <input className="filter-select" type="date" value={orderDateTo} onChange={e => setOrderDateTo(e.target.value)} title="Date to" />
                  <button className="add-btn" type="button" onClick={applyOrderFilters}>Apply</button>
                  <button className="action-btn btn-view" type="button" onClick={clearOrderFilters}>Clear Filters</button>
                  <button className="action-btn btn-verify" type="button" onClick={exportOrdersCsv}>Export CSV</button>
                </div>
              </div>
              {ordersLoading && (
                <div style={{padding:"20px",textAlign:"center",color:"#888",fontSize:13}}>Loading orders…</div>
              )}
              {ordersError && !ordersLoading && (
                <div style={{padding:"20px",textAlign:"center",color:"#DC2626",fontSize:13}}>{ordersError}</div>
              )}
              {!ordersLoading && !ordersError && ordersTotal === 0 && (
                <div style={{padding:"24px",textAlign:"center",color:"#888",fontSize:13}}>
                  {ordersHasFilters ? "No orders match these filters" : "No orders yet"}
                </div>
              )}
              {!ordersLoading && !ordersError && ordersTotal > 0 && (
                <div style={{padding:"8px 20px",fontSize:12,color:"#888888",borderBottom:"1px solid #F0F0F0",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <span>Showing {from}–{to} of {ordersTotal} orders</span>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <button className="action-btn btn-view" disabled={ordersPage===1} onClick={()=>{ const p = ordersPage-1; setOrdersPage(p); loadOrders(p); }} style={{opacity:ordersPage===1?0.4:1}}>← Prev</button>
                    <span style={{fontSize:12,color:"#666"}}>Page {ordersPage} of {ordersTotalPages}</span>
                    <button className="action-btn btn-view" disabled={ordersPage>=ordersTotalPages} onClick={()=>{ const p = ordersPage+1; setOrdersPage(p); loadOrders(p); }} style={{opacity:ordersPage>=ordersTotalPages?0.4:1}}>Next →</button>
                  </div>
                </div>
              )}
              {!ordersLoading && !ordersError && orders.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Date</th><th>Payment</th><th>Receipt</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id}>
                        <td style={{fontFamily:"monospace",color:"#5B21B6",whiteSpace:"nowrap"}}>{o.id}</td>
                        <td style={{whiteSpace:"nowrap"}}>{o.customer}</td>
                        <td style={{maxWidth:"140px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.items}</td>
                        <td style={{fontWeight:700,whiteSpace:"nowrap"}}>{o.total}</td>
                        <td style={{whiteSpace:"nowrap",color:"#888888",fontSize:"12px"}}>{o.date}</td>
                        <td>
                          {o.payment === "cod"
                            ? <span style={{fontSize:"11px",padding:"3px 9px",borderRadius:"10px",background:"rgba(0,200,100,0.1)",border:"1px solid rgba(0,200,100,0.3)",color:"#00c864",fontWeight:700}}>💵 COD</span>
                            : <span style={{fontSize:"11px",padding:"3px 9px",borderRadius:"10px",background:"rgba(68,136,255,0.1)",border:"1px solid rgba(68,136,255,0.3)",color:"#6699ff",fontWeight:700}}>🏦 Bank</span>
                          }
                        </td>
                        <td>
                          {o.receipt
                            ? <button className="action-btn btn-view" style={{fontSize:"11px",padding:"4px 10px"}} onClick={() => setReceiptModal(o.id)}>View Receipt</button>
                            : <span style={{color:"#AAAAAA",fontSize:"11px"}}>No Receipt</span>
                          }
                        </td>
                        <td><span className={statusClass(o.status)}>{o.status}</span></td>
                        <td style={{whiteSpace:"nowrap"}}>
                          <button className="action-btn btn-view" onClick={() => openOrderView(o.id)}>View</button>
                          {o.status==="pending" && o.receipt && <button className="action-btn btn-verify" onClick={() => setReceiptModal(o.id)}>Verify</button>}
                          <button className="action-btn btn-delete" onClick={() => deleteOrder(o.id, o.total, o.status)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
            );
          })()}

          {/* PRODUCTS */}
          {tab==="products" && can("products.view") && (
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
                        <td style={{fontWeight:700,color:"#5B21B6"}}>{p.price}</td>
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
          {tab==="blog" && can("blog.manage") && (
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
                        <td style={{fontWeight:600,maxWidth:"240px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.featured?<span style={{color:"#5B21B6",marginRight:4}}>⭐</span>:null}{p.title}</td>
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
          {tab==="customers" && can("customers.view") && (() => {
            const from = customersTotal === 0 ? 0 : (customersPage - 1) * CUSTOMERS_PER_PAGE + 1;
            const to = Math.min(customersPage * CUSTOMERS_PER_PAGE, customersTotal);
            return (
            <div className="section-card">
              <div className="section-header">
                <div className="section-title">Customers ({customersTotal})</div>
                <div className="section-actions" style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
                  <input
                    className="filter-select"
                    style={{minWidth:180}}
                    placeholder="Search customers…"
                    value={customersQ}
                    onChange={(e) => setCustomersQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { setCustomersPage(1); loadCustomers(1); } }}
                  />
                  <button className="add-btn" type="button" onClick={() => { setCustomersPage(1); loadCustomers(1); }}>Apply</button>
                </div>
              </div>
              {customersLoading && (
                <div style={{padding:"20px",textAlign:"center",color:"#888",fontSize:13}}>Loading customers…</div>
              )}
              {customersError && !customersLoading && (
                <div style={{padding:"20px",textAlign:"center",color:"#DC2626",fontSize:13}}>{customersError}</div>
              )}
              {!customersLoading && !customersError && customersTotal === 0 && (
                <div style={{padding:"24px",textAlign:"center",color:"#888",fontSize:13}}>
                  {customersQ.trim() ? "No customers match this search" : "No customers yet"}
                </div>
              )}
              {!customersLoading && !customersError && customersTotal > 0 && (
                <div style={{padding:"8px 20px",fontSize:12,color:"#888888",borderBottom:"1px solid #F0F0F0",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <span>Showing {from}–{to} of {customersTotal} customers</span>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <button className="action-btn btn-view" disabled={customersPage===1} onClick={()=>{ const p = customersPage-1; setCustomersPage(p); loadCustomers(p); }} style={{opacity:customersPage===1?0.4:1}}>← Prev</button>
                    <span style={{fontSize:12,color:"#666"}}>Page {customersPage} of {customersTotalPages}</span>
                    <button className="action-btn btn-view" disabled={customersPage>=customersTotalPages} onClick={()=>{ const p = customersPage+1; setCustomersPage(p); loadCustomers(p); }} style={{opacity:customersPage>=customersTotalPages?0.4:1}}>Next →</button>
                  </div>
                </div>
              )}
              {!customersLoading && !customersError && customers.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th></th><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>First Order</th><th>Last Order</th><th>Actions</th></tr></thead>
                  <tbody>
                    {customers.map((c,i) => (
                      <tr key={`${c.email}-${i}`}>
                        <td><div className="customer-avatar">{(c.name||"?")[0]}</div></td>
                        <td style={{fontWeight:600}}>{c.name}</td>
                        <td style={{color:"#666666",fontSize:"13px"}}>{c.email}</td>
                        <td style={{fontSize:"13px"}}>{c.phone}</td>
                        <td><span style={{fontWeight:700,color:"#5B21B6"}}>{c.orders}</span></td>
                        <td style={{fontWeight:700}}>{c.spent}</td>
                        <td style={{color:"#888888",fontSize:"12px"}}>{c.first_order}</td>
                        <td style={{color:"#888888",fontSize:"12px"}}>{c.last_order}</td>
                        <td style={{whiteSpace:"nowrap"}}>
                          <button
                            className="action-btn btn-view"
                            onClick={() => {
                              setOrderQ(c.email || "");
                              setStatusFilter("all");
                              setOrderPaymentFilter("all");
                              setOrderDateFrom("");
                              setOrderDateTo("");
                              setOrdersPage(1);
                              setTab("orders");
                              loadOrders(1, {
                                q: c.email || "",
                                status: "all",
                                payment: "all",
                                dateFrom: "",
                                dateTo: "",
                              });
                            }}
                          >
                            View Orders
                          </button>
                          {c.phone && (
                            <a href={`https://wa.me/${String(c.phone).replace(/\s+/g,"").replace("+","")}`} target="_blank" rel="noopener noreferrer">
                              <button className="action-btn btn-verify">WhatsApp</button>
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
            );
          })()}

          {/* 💬 CHAT LEADS */}
          {tab==="leads" && can("leads.view") && (
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
          {tab==="training" && can("training.manage") && (
            <div>
              {trainingMsg && (
                <div style={{marginBottom:14,padding:"10px 14px",background:trainingMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",borderRadius:10,fontSize:13,color:trainingMsg.startsWith("✅")?"#00c864":"#ff6666"}}>
                  {trainingMsg}
                </div>
              )}

              <div className="section-card" style={{padding:0,marginBottom:20,overflow:"hidden"}}>
                <div style={{padding:"16px 20px",background:"linear-gradient(135deg,#111111,#4C1D95)",color:"#FFFFFF",display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
                  <div>
                    <div style={{fontFamily:"var(--font-display)",fontWeight:800,fontSize:16,color:"#FFFFFF"}}>Professor ↔ Berlin Training Chat</div>
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
          {tab==="coupons" && can("coupons.manage") && (
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
                          <td style={{fontFamily:"monospace",color:"#5B21B6",fontWeight:700}}>{c.code}</td>
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
          {tab==="builder" && can("page_builder.manage") && (
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
                    {sectionModal.key === "home_hero" && (
                      <div style={{marginBottom:14,padding:"10px 12px",background:"#F5F3FF",border:"1px solid #DDD6FE",borderRadius:10,fontSize:12,color:"#4C1D95",lineHeight:1.5}}>
                        Main Hero title, subtitle, Shop/Learn buttons, features list aur stats ab <strong>Content Editor → Home</strong> se update karein. Yahan se sirf section visibility / advanced JSON fields.
                      </div>
                    )}
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
                              const data=await fetch("/api/upload",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({file:base64,name:file.name,folder:"firestick4uk/products"})}).then(async r=>{
                                if(r.status===401){handleSessionExpired();return{};}
                                if(r.status===403){showPermError();return{};}
                                return r.json();
                              });
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
          {tab==="faqadmin" && can("faqs.manage") && (
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
          {tab==="staff" && can("staff.manage") && (
            <div>
              {staffMsg && <div style={{marginBottom:14,padding:"10px 14px",background:staffMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",borderRadius:10,fontSize:13,color:staffMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{staffMsg}</div>}

              {adminPrincipalType==="master" && (
                <div className="section-card" style={{marginBottom:16,padding:20,background:"#F8F5FF",border:"1px solid #E9E0FF"}}>
                  <div style={{fontWeight:700,fontSize:15,marginBottom:8,color:"#111"}}>Recovery Administrator</div>
                  <div style={{fontSize:13,color:"#444",lineHeight:1.7}}>
                    <div><strong>Role:</strong> Super Admin</div>
                    <div><strong>Status:</strong> Active</div>
                    <div><strong>Account type:</strong> Environment-managed</div>
                    <div><strong>Password:</strong> Managed in hosting environment</div>
                  </div>
                  <div style={{marginTop:12,fontSize:12,color:"#5B21B6"}}>
                    Use a Primary Admin account for everyday CMS access. Recovery Admin is for emergency / break-glass only.
                  </div>
                </div>
              )}

              {adminPrincipalType==="master" && !staffUsers.some((s:any)=>s.role==="super_admin" && Number(s.active)===1) && (
                <div style={{marginBottom:16,padding:"14px 16px",background:"rgba(180,83,9,0.08)",border:"1px solid rgba(180,83,9,0.25)",borderRadius:10}}>
                  <div style={{fontWeight:700,marginBottom:6,color:"#92400E"}}>Create your Primary Admin account</div>
                  <div style={{fontSize:13,color:"#666",marginBottom:10,lineHeight:1.5}}>
                    No active database Super Admin exists yet. Create a Primary Admin for daily CMS work (editable profile and password).
                  </div>
                  <button className="add-btn" type="button" onClick={openPrimaryAdminCreate}>Create Primary Admin</button>
                </div>
              )}

              <div style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                <div style={{fontSize:12,color:"#666",lineHeight:1.65,maxWidth:640}}>
                  <div><strong>Super Admin</strong> — {ROLE_UI_DESCRIPTIONS.super_admin}</div>
                  <div><strong>Manager</strong> — {ROLE_UI_DESCRIPTIONS.manager}</div>
                  <div><strong>Writer</strong> — {ROLE_UI_DESCRIPTIONS.writer}</div>
                </div>
                <button className="add-btn" onClick={()=>{ setPrimaryAdminOnboarding(false); setStaffForm({name:"",email:"",password:"",confirmPassword:"",role:"writer",active:1}); setShowStaffPassword(false); setStaffModal("new"); setStaffMsg(""); }}>+ Add User</button>
              </div>
              <div className="section-card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Created</th><th>Actions</th></tr></thead>
                    <tbody>
                      {staffUsers.length===0&&<tr><td colSpan={7} style={{textAlign:"center",color:"#888",padding:24}}>No staff users yet. Add staff to delegate access.</td></tr>}
                      {staffUsers.map((s:any)=>(
                        <tr key={s.id}>
                          <td style={{fontWeight:600}}>{s.name}</td>
                          <td style={{fontSize:12,color:"#666"}}>{s.email}</td>
                          <td><span className={`status-badge ${s.role==="super_admin"?"status-confirmed":s.role==="manager"?"status-dispatched":"status-pending"}`}>{roleLabel(s.role)}</span></td>
                          <td><span className={`status-badge ${Number(s.active)===1?"status-delivered":"status-pending"}`}>{Number(s.active)===1?"Active":"Disabled"}</span></td>
                          <td style={{fontSize:12,color:"#888"}}>{formatLastLogin(s.last_login_at)}</td>
                          <td style={{fontSize:12,color:"#888"}}>{s.created_at ? new Date(s.created_at).toLocaleDateString("en-GB") : "—"}</td>
                          <td style={{whiteSpace:"nowrap"}}>
                            <button className="action-btn btn-edit" style={{marginRight:4}} onClick={()=>{ setPrimaryAdminOnboarding(false); setStaffForm({name:s.name,email:s.email,password:"",confirmPassword:"",role:s.role,active:Number(s.active)===1?1:0}); setStaffModal(s); setStaffMsg(""); }}>Edit</button>
                            <button className="action-btn btn-edit" style={{marginRight:4}} onClick={()=>{ setStaffResetForm({new_password:"",confirm_password:""}); setShowResetPassword(false); setStaffResetModal(s); setStaffMsg(""); }}>Reset Password</button>
                            {Number(s.active)===1 ? (
                              <button className="action-btn btn-edit" style={{marginRight:4}} onClick={()=>setStaffConfirm({type:"disable",user:s})}>Disable</button>
                            ) : (
                              <button className="action-btn btn-edit" style={{marginRight:4}} disabled={staffBusy} onClick={()=>enableStaff(s)}>Enable</button>
                            )}
                            <button className="action-btn btn-delete" onClick={()=>setStaffConfirm({type:"delete",user:s})}>Delete</button>
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
                    <div className="modal-title">{primaryAdminOnboarding && staffModal==="new" ? "Create Primary Admin" : staffModal==="new"?"Add Staff User":"Edit Staff User"}</div>
                    {staffMsg&&<div style={{marginBottom:10,color:staffMsg.startsWith("✅")?"#00c864":"#ff6666",fontSize:13}}>{staffMsg}</div>}
                    <div className="modal-field"><label>Full Name *</label><input value={staffForm.name} onChange={e=>setStaffForm(f=>({...f,name:e.target.value}))} placeholder="Jane Smith" /></div>
                    <div className="modal-field"><label>Email *</label><input type="email" value={staffForm.email} onChange={e=>setStaffForm(f=>({...f,email:e.target.value}))} placeholder="jane@example.com" /></div>
                    {staffModal==="new" && (
                      <>
                        <div className="modal-field">
                          <label>Password * (min 10 characters)</label>
                          <div style={{display:"flex",gap:8}}>
                            <input style={{flex:1}} type={showStaffPassword?"text":"password"} value={staffForm.password} onChange={e=>setStaffForm(f=>({...f,password:e.target.value}))} placeholder="Password" autoComplete="new-password" />
                            <button type="button" className="modal-cancel" style={{padding:"8px 12px"}} onClick={()=>setShowStaffPassword(v=>!v)}>{showStaffPassword?"Hide":"Show"}</button>
                          </div>
                        </div>
                        <div className="modal-field"><label>Confirm Password *</label><input type={showStaffPassword?"text":"password"} value={staffForm.confirmPassword} onChange={e=>setStaffForm(f=>({...f,confirmPassword:e.target.value}))} placeholder="Confirm password" autoComplete="new-password" /></div>
                      </>
                    )}
                    <div className="modal-field">
                      <label>Role *</label>
                      {primaryAdminOnboarding && staffModal==="new" ? (
                        <input readOnly value={`Super Admin — ${ROLE_UI_DESCRIPTIONS.super_admin}`} style={{width:"100%",padding:"10px 12px",border:"1px solid #E5E5E5",borderRadius:8,fontSize:14,background:"#F5F5F5",color:"#111"}} />
                      ) : (
                      <select value={staffForm.role} onChange={e=>setStaffForm(f=>({...f,role:e.target.value}))} style={{width:"100%",padding:"10px 12px",border:"1px solid #E5E5E5",borderRadius:8,fontSize:14,background:"#fff",color:"#111"}}>
                        <option value="writer">Writer — {ROLE_UI_DESCRIPTIONS.writer}</option>
                        <option value="manager">Manager — {ROLE_UI_DESCRIPTIONS.manager}</option>
                        <option value="super_admin">Super Admin — {ROLE_UI_DESCRIPTIONS.super_admin}</option>
                      </select>
                      )}
                    </div>
                    {!(primaryAdminOnboarding && staffModal==="new") && (
                    <div className="modal-field">
                      <label>Status</label>
                      <select value={String(staffForm.active)} onChange={e=>setStaffForm(f=>({...f,active:(e.target.value==="1"?1:0) as 0|1}))} style={{width:"100%",padding:"10px 12px",border:"1px solid #E5E5E5",borderRadius:8,fontSize:14,background:"#fff",color:"#111"}}>
                        <option value="1">Active</option>
                        <option value="0">Disabled</option>
                      </select>
                    </div>
                    )}
                    {staffModal!=="new" && (
                      <div style={{fontSize:12,color:"#888",padding:"4px 0 8px"}}>To change password, use <strong>Reset Password</strong> on the staff list.</div>
                    )}
                    <div className="modal-actions">
                      <button className="modal-cancel" onClick={()=>{ setStaffModal(null); setPrimaryAdminOnboarding(false); }} disabled={staffBusy}>Cancel</button>
                      <button className="modal-save" onClick={saveStaff} disabled={staffBusy}>{staffBusy?"Saving…":primaryAdminOnboarding && staffModal==="new"?"Create Primary Admin":staffModal==="new"?"Add User":"Save Changes"}</button>
                    </div>
                  </div>
                </div>
              )}

              {staffResetModal && (
                <div className="modal-overlay">
                  <div className="modal" onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
                    <div className="modal-title">Reset Password</div>
                    <div style={{fontSize:13,color:"#666",marginBottom:12}}>Set a new password for <strong>{staffResetModal.name}</strong> ({staffResetModal.email}). Their existing sessions will be revoked.</div>
                    {staffMsg&&!staffMsg.startsWith("✅")&&<div style={{marginBottom:10,color:"#ff6666",fontSize:13}}>{staffMsg}</div>}
                    <div className="modal-field">
                      <label>New Password * (min 10 characters)</label>
                      <div style={{display:"flex",gap:8}}>
                        <input style={{flex:1}} type={showResetPassword?"text":"password"} value={staffResetForm.new_password} onChange={e=>setStaffResetForm(f=>({...f,new_password:e.target.value}))} autoComplete="new-password" />
                        <button type="button" className="modal-cancel" style={{padding:"8px 12px"}} onClick={()=>setShowResetPassword(v=>!v)}>{showResetPassword?"Hide":"Show"}</button>
                      </div>
                    </div>
                    <div className="modal-field"><label>Confirm Password *</label><input type={showResetPassword?"text":"password"} value={staffResetForm.confirm_password} onChange={e=>setStaffResetForm(f=>({...f,confirm_password:e.target.value}))} autoComplete="new-password" /></div>
                    <div className="modal-actions">
                      <button className="modal-cancel" onClick={()=>setStaffResetModal(null)} disabled={staffBusy}>Cancel</button>
                      <button className="modal-save" onClick={resetStaffPassword} disabled={staffBusy}>{staffBusy?"Saving…":"Reset Password"}</button>
                    </div>
                  </div>
                </div>
              )}

              {staffConfirm && (
                <div className="modal-overlay">
                  <div className="modal" onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
                    <div className="modal-title">{staffConfirm.type==="delete"?"Delete Staff User":"Disable Account"}</div>
                    <div style={{fontSize:14,color:"#444",lineHeight:1.55,marginBottom:18}}>
                      {staffConfirm.type==="delete"
                        ? <>Permanently delete <strong>{staffConfirm.user.name}</strong>? Their sessions will be revoked. This cannot be undone.</>
                        : <>Disable <strong>{staffConfirm.user.name}</strong>? They will be signed out immediately and cannot log in until re-enabled.</>}
                    </div>
                    <div className="modal-actions">
                      <button className="modal-cancel" onClick={()=>setStaffConfirm(null)} disabled={staffBusy}>Cancel</button>
                      <button className="modal-save" style={{background:staffConfirm.type==="delete"?"#DC2626":"#B45309"}} onClick={confirmStaffAction} disabled={staffBusy}>
                        {staffBusy?"Working…":staffConfirm.type==="delete"?"Delete":"Disable"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Profile / Change Password modals */}
          {profileModal==="profile" && (
            <div className="modal-overlay">
              <div className="modal" onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
                <div className="modal-title">My Profile</div>
                {profileMsg&&<div style={{marginBottom:10,color:"#ff6666",fontSize:13}}>{profileMsg}</div>}
                {adminPrincipalType==="master" || profileData?.principalType==="master" ? (
                  <div style={{fontSize:14,lineHeight:1.7,color:"#333"}}>
                    <div><strong>Name:</strong> Recovery Admin</div>
                    <div><strong>Account:</strong> Environment-managed Recovery Administrator</div>
                    <div><strong>Role:</strong> {roleLabel(profileData?.role || adminRole)}</div>
                    <div style={{marginTop:12,padding:"10px 12px",background:"#F8F5FF",borderRadius:8,fontSize:13,color:"#5B21B6"}}>
                      Recovery Admin credentials are managed in the hosting environment and cannot be changed in the CMS.
                    </div>
                  </div>
                ) : (
                  <div style={{fontSize:14,lineHeight:1.7,color:"#333"}}>
                    <div><strong>Name:</strong> {profileData?.name || adminName}</div>
                    <div><strong>Email:</strong> {profileData?.email || adminEmail || "—"}</div>
                    <div><strong>Role:</strong> {roleLabel(profileData?.role || adminRole)}</div>
                    <div><strong>Last Login:</strong> {formatLastLogin(profileData?.last_login_at)}</div>
                  </div>
                )}
                <div className="modal-actions">
                  <button className="modal-cancel" onClick={()=>setProfileModal(null)}>Close</button>
                  {adminPrincipalType!=="master" && (
                    <button className="modal-save" onClick={()=>{ setProfileModal(null); openChangePassword(); }}>Change Password</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {profileModal==="password" && (
            <div className="modal-overlay">
              <div className="modal" onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
                <div className="modal-title">Change Password</div>
                {adminPrincipalType==="master" ? (
                  <>
                    <div style={{fontSize:14,color:"#444",lineHeight:1.6,marginBottom:16}}>
                      Recovery Admin credentials are managed in the hosting environment and cannot be changed through the CMS.
                    </div>
                    <div className="modal-actions">
                      <button className="modal-cancel" onClick={()=>setProfileModal(null)}>Close</button>
                    </div>
                  </>
                ) : (
                  <>
                    {profileMsg&&<div style={{marginBottom:10,color:profileMsg.startsWith("✅")?"#00c864":"#ff6666",fontSize:13}}>{profileMsg}</div>}
                    <div className="modal-field">
                      <label>Current Password *</label>
                      <div style={{display:"flex",gap:8}}>
                        <input style={{flex:1}} type={showPwCurrent?"text":"password"} value={passwordForm.current_password} onChange={e=>setPasswordForm(f=>({...f,current_password:e.target.value}))} autoComplete="current-password" />
                        <button type="button" className="modal-cancel" style={{padding:"8px 12px"}} onClick={()=>setShowPwCurrent(v=>!v)}>{showPwCurrent?"Hide":"Show"}</button>
                      </div>
                    </div>
                    <div className="modal-field">
                      <label>New Password * (min 10 characters)</label>
                      <div style={{display:"flex",gap:8}}>
                        <input style={{flex:1}} type={showPwNew?"text":"password"} value={passwordForm.new_password} onChange={e=>setPasswordForm(f=>({...f,new_password:e.target.value}))} autoComplete="new-password" />
                        <button type="button" className="modal-cancel" style={{padding:"8px 12px"}} onClick={()=>setShowPwNew(v=>!v)}>{showPwNew?"Hide":"Show"}</button>
                      </div>
                    </div>
                    <div className="modal-field">
                      <label>Confirm New Password *</label>
                      <div style={{display:"flex",gap:8}}>
                        <input style={{flex:1}} type={showPwConfirm?"text":"password"} value={passwordForm.confirm_password} onChange={e=>setPasswordForm(f=>({...f,confirm_password:e.target.value}))} autoComplete="new-password" />
                        <button type="button" className="modal-cancel" style={{padding:"8px 12px"}} onClick={()=>setShowPwConfirm(v=>!v)}>{showPwConfirm?"Hide":"Show"}</button>
                      </div>
                    </div>
                    <div className="modal-actions">
                      <button className="modal-cancel" onClick={()=>setProfileModal(null)} disabled={staffBusy}>Cancel</button>
                      <button className="modal-save" onClick={submitChangePassword} disabled={staffBusy}>{staffBusy?"Saving…":"Update Password"}</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 📜 ACTIVITY LOG */}
          {tab==="audit" && can("audit.view") && (
            <div>
              <div style={{marginBottom:16,display:"flex",flexWrap:"wrap",gap:10,alignItems:"flex-end"}}>
                <div style={{flex:"1 1 180px"}}>
                  <label style={{display:"block",fontSize:11,color:"#888",marginBottom:4}}>Search</label>
                  <input
                    value={auditQ}
                    onChange={e=>setAuditQ(e.target.value)}
                    placeholder="Actor, summary, entity id…"
                    style={{width:"100%",padding:"9px 12px",border:"1px solid #E5E5E5",borderRadius:8,fontSize:13}}
                    onKeyDown={e=>{ if(e.key==="Enter") loadAuditLog(1); }}
                  />
                </div>
                <div style={{flex:"0 1 160px"}}>
                  <label style={{display:"block",fontSize:11,color:"#888",marginBottom:4}}>Action</label>
                  <select
                    value={auditAction}
                    onChange={e=>setAuditAction(e.target.value)}
                    style={{width:"100%",padding:"9px 12px",border:"1px solid #E5E5E5",borderRadius:8,fontSize:13,background:"#fff"}}
                  >
                    <option value="">All actions</option>
                    {[
                      "auth.login","auth.logout","profile.password_changed",
                      "staff.created","staff.updated","staff.enabled","staff.disabled","staff.deleted","staff.password_reset",
                      "order.status_changed","order.deleted","order.exported",
                      "product.created","product.updated","product.deleted",
                      "blog.created","blog.updated","blog.deleted",
                      "faq.created","faq.updated","faq.deleted",
                      "coupon.created","coupon.updated","coupon.deleted",
                      "content.updated","settings.updated",
                      "page_builder.updated",
                      "lead.deleted","lead.bulk_deleted",
                      "training.created","training.updated","training.deleted",
                    ].map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div style={{flex:"0 1 140px"}}>
                  <label style={{display:"block",fontSize:11,color:"#888",marginBottom:4}}>Entity</label>
                  <select
                    value={auditEntity}
                    onChange={e=>setAuditEntity(e.target.value)}
                    style={{width:"100%",padding:"9px 12px",border:"1px solid #E5E5E5",borderRadius:8,fontSize:13,background:"#fff"}}
                  >
                    <option value="">All entities</option>
                    {["session","staff","order","product","blog","faq","coupon","content","settings","page_builder","lead","training"].map(e=><option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <button className="add-btn" onClick={()=>loadAuditLog(1)} disabled={auditLoading}>
                  {auditLoading?"Loading…":"Apply"}
                </button>
                <button className="action-btn btn-view" onClick={()=>loadAuditLog(auditPage)} disabled={auditLoading}>Refresh</button>
              </div>
              <div style={{fontSize:12,color:"#888",marginBottom:10}}>
                {auditTotal} event{auditTotal===1?"":"s"} · page {auditPage} of {auditTotalPages}
              </div>
              <div className="section-card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Admin</th>
                        <th>Role</th>
                        <th>Action</th>
                        <th>Entity</th>
                        <th>Summary</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {!auditLoading && auditItems.length===0 && (
                        <tr><td colSpan={7} style={{textAlign:"center",color:"#888",padding:24}}>No audit events yet.</td></tr>
                      )}
                      {auditItems.map((row:any)=>(
                        <Fragment key={row.id}>
                          <tr>
                            <td style={{fontSize:12,whiteSpace:"nowrap",color:"#666"}}>
                              {row.createdAt ? new Date(row.createdAt).toLocaleString("en-GB") : "—"}
                            </td>
                            <td style={{fontWeight:600,fontSize:13}}>{row.actorName}</td>
                            <td><span className={`status-badge ${row.actorRole==="super_admin"?"status-confirmed":row.actorRole==="manager"?"status-dispatched":"status-pending"}`}>{roleLabel(row.actorRole)}</span></td>
                            <td style={{fontSize:12,fontFamily:"monospace"}}>{row.action}</td>
                            <td style={{fontSize:12}}>
                              {row.entityType}{row.entityId!=null && row.entityId!=="" ? ` #${row.entityId}` : ""}
                            </td>
                            <td style={{fontSize:13,maxWidth:280}}>{row.summary || "—"}</td>
                            <td>
                              {(row.metadata || row.ipAddress) && (
                                <button
                                  className="action-btn btn-view"
                                  onClick={()=>setAuditExpanded(auditExpanded===row.id?null:row.id)}
                                >
                                  {auditExpanded===row.id?"Hide":"Details"}
                                </button>
                              )}
                            </td>
                          </tr>
                          {auditExpanded===row.id && (
                            <tr>
                              <td colSpan={7} style={{background:"#fafafa",fontSize:12,color:"#555",padding:"12px 16px"}}>
                                {row.ipAddress && <div style={{marginBottom:6}}><strong>IP:</strong> {row.ipAddress}</div>}
                                {row.metadata && typeof row.metadata === "object" && (
                                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                                    {Object.entries(row.metadata).map(([k,v])=>(
                                      <span key={k} style={{background:"#eee",padding:"4px 8px",borderRadius:6}}>
                                        <strong>{k}:</strong>{" "}
                                        {Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {auditTotalPages > 1 && (
                <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:16,alignItems:"center"}}>
                  <button className="action-btn btn-view" disabled={auditPage<=1||auditLoading} onClick={()=>loadAuditLog(auditPage-1)} style={{opacity:auditPage<=1?0.4:1}}>← Prev</button>
                  <span style={{fontSize:13,color:"#666"}}>Page {auditPage} / {auditTotalPages}</span>
                  <button className="action-btn btn-view" disabled={auditPage>=auditTotalPages||auditLoading} onClick={()=>loadAuditLog(auditPage+1)} style={{opacity:auditPage>=auditTotalPages?0.4:1}}>Next →</button>
                </div>
              )}
            </div>
          )}

          {/* ⚙️ SITE SETTINGS */}
          {tab==="settings" && can("settings.manage") && (
            <div className="section-card" style={{padding:28}}>
              <div className="section-header" style={{marginBottom:24}}>
                <div className="section-title">Site Settings</div>
              </div>
              {contentMsg && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 16px",
                    background: contentMsg.startsWith("✅") ? "rgba(0,200,100,0.1)" : "rgba(255,68,68,0.1)",
                    border: `1px solid ${contentMsg.startsWith("✅") ? "rgba(0,200,100,0.3)" : "rgba(255,68,68,0.25)"}`,
                    borderRadius: 10,
                    fontSize: 13,
                    color: contentMsg.startsWith("✅") ? "#00c864" : "#ff6666",
                  }}
                >
                  {contentMsg}
                </div>
              )}

              <div style={{maxWidth:600}}>
                <div className="modal-field"><label>Website Title</label><input className="modal-field" style={{width:"100%"}} value={siteContent.site_title||""} onChange={e=>setSiteContent(s=>({...s,site_title:e.target.value}))} placeholder="Firestick4UK" /></div>
                <div className="modal-field"><label>Website Tagline</label><input className="modal-field" style={{width:"100%"}} value={siteContent.site_tagline||""} onChange={e=>setSiteContent(s=>({...s,site_tagline:e.target.value}))} placeholder="Best Firestick Service in UK" /></div>

                <div className="modal-field">
                  <label>Site Logo</label>
                  <div style={{fontSize:11,color:"#888888",marginBottom:8}}>
                    Recommended: <strong>360×80px</strong>, PNG transparent
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",marginTop:4}}>
                    {siteContent.site_logo_url && (
                      <img
                        src={siteContent.site_logo_url}
                        alt="Site logo"
                        style={{height:40,width:"auto",maxWidth:200,objectFit:"contain",border:"1px solid #E5E5E5",borderRadius:6,padding:6,background:"#fff"}}
                      />
                    )}
                    <label style={{cursor:"pointer",background:"#F5F5F5",border:"1px solid #E5E5E5",padding:"8px 16px",borderRadius:8,fontSize:13,color:"#5B21B6",fontWeight:600}}>
                      {logoUploading ? "Uploading..." : "Upload Logo"}
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&uploadLogoAdmin(e.target.files[0])} disabled={logoUploading} />
                    </label>
                    {siteContent.site_logo_url && (
                      <button
                        type="button"
                        style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:12}}
                        onClick={()=>{ setSiteContent(s=>({...s,site_logo_url:""})); saveContent(["site_logo_url"]); }}
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="modal-field">
                  <label>Favicon</label>
                  <div style={{fontSize:11,color:"#888888",marginBottom:8}}>
                    Recommended: <strong>180×180 or 512×512 PNG</strong> (works on mobile + desktop)
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",marginTop:4}}>
                    {siteContent.favicon_url ? (
                      <img
                        key={siteContent.favicon_url}
                        src={siteContent.favicon_url}
                        alt="favicon preview"
                        style={{width:48,height:48,borderRadius:8,border:"1px solid #E5E5E5",objectFit:"contain",background:"#fff",padding:4}}
                      />
                    ) : (
                      <div style={{width:48,height:48,borderRadius:8,border:"1px dashed #CCC",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#AAA"}}>None</div>
                    )}
                    <label style={{cursor:"pointer",background:"#F5F5F5",border:"1px solid #E5E5E5",padding:"8px 16px",borderRadius:8,fontSize:13,color:"#5B21B6",fontWeight:600}}>
                      {faviconUploading ? "Uploading..." : "Upload Favicon (.ico/.png/.svg)"}
                      <input
                        type="file"
                        accept=".ico,.png,.jpg,.svg,image/png,image/jpeg,image/svg+xml"
                        style={{display:"none"}}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadFaviconAdmin(f);
                          e.target.value = "";
                        }}
                        disabled={faviconUploading}
                      />
                    </label>
                    {siteContent.favicon_url && (
                      <button
                        type="button"
                        style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:12}}
                        onClick={() => {
                          setSiteContent((s) => ({ ...s, favicon_url: "" }));
                          saveContent(["favicon_url"]);
                        }}
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  {siteContent.favicon_url && (
                    <div style={{fontSize:11,color:"#888",marginTop:8,wordBreak:"break-all"}}>{siteContent.favicon_url}</div>
                  )}
                </div>

                <div className="modal-field" style={{marginTop:8}}>
                  <label>Default Share Image (OG Image)</label>
                  <div style={{fontSize:11,color:"#888888",marginBottom:8}}>
                    📐 Recommended: <strong>1200×630px</strong> — shown when sharing homepage on WhatsApp/Facebook
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    {siteContent.og_default_image ? (
                      <img
                        key={siteContent.og_default_image}
                        src={siteContent.og_default_image}
                        alt="OG preview"
                        style={{width:200,height:105,borderRadius:8,border:"1px solid #E5E5E5",objectFit:"cover",background:"#fff"}}
                      />
                    ) : (
                      <div style={{width:200,height:105,borderRadius:8,border:"1px dashed #CCC",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#AAA",background:"#FAFAFA"}}>
                        No OG image
                      </div>
                    )}
                    <label style={{cursor:"pointer",background:"#F5F5F5",border:"1px solid #E5E5E5",padding:"8px 16px",borderRadius:8,fontSize:13,color:"#5B21B6",fontWeight:600}}>
                      {ogImgUploading ? "⏳ Uploading..." : "📷 UPLOAD OG IMAGE"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/*"
                        style={{display:"none"}}
                        disabled={ogImgUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadOgImageAdmin(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {siteContent.og_default_image && (
                      <button
                        type="button"
                        style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:12}}
                        onClick={() => {
                          setSiteContent((s) => ({ ...s, og_default_image: "" }));
                          saveContent(["og_default_image"]);
                        }}
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  {siteContent.og_default_image && (
                    <div style={{fontSize:11,color:"#888",marginTop:8,wordBreak:"break-all"}}>{siteContent.og_default_image}</div>
                  )}
                </div>

                <div className="modal-field" style={{marginTop:8}}>
                  <label>WhatsApp Button Icon (PNG)</label>
                  <div style={{fontSize:11,color:"#888888",marginBottom:8}}>
                    Recommended: <strong>512×512px PNG</strong>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    {siteContent.whatsapp_icon_url ? (
                      <img
                        key={siteContent.whatsapp_icon_url}
                        src={siteContent.whatsapp_icon_url}
                        alt="WhatsApp icon"
                        style={{width:60,height:60,borderRadius:"50%",border:"1px solid #E5E5E5",objectFit:"cover",background:"#fff"}}
                      />
                    ) : (
                      <div style={{width:60,height:60,borderRadius:"50%",border:"1px dashed #CCC",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#AAA",background:"#FAFAFA"}}>
                        None
                      </div>
                    )}
                    <label style={{cursor:"pointer",background:"#F5F5F5",border:"1px solid #E5E5E5",padding:"8px 16px",borderRadius:8,fontSize:13,color:"#5B21B6",fontWeight:600}}>
                      {waIconUploading ? "Uploading..." : "UPLOAD ICON"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{display:"none"}}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadWhatsAppIconAdmin(f);
                          e.target.value = "";
                        }}
                        disabled={waIconUploading}
                      />
                    </label>
                    {siteContent.whatsapp_icon_url && (
                      <button
                        type="button"
                        style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:12}}
                        onClick={() => {
                          setSiteContent((s) => ({ ...s, whatsapp_icon_url: "" }));
                          saveContent(["whatsapp_icon_url"]);
                        }}
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  {siteContent.whatsapp_icon_url && (
                    <div style={{fontSize:11,color:"#888",marginTop:8,wordBreak:"break-all"}}>{siteContent.whatsapp_icon_url}</div>
                  )}
                </div>

                <div className="modal-field" style={{marginTop:24,paddingTop:20,borderTop:"1px solid #E5E5E5"}}>
                  <label style={{fontSize:15,fontWeight:700,marginBottom:6,display:"block"}}>🖼️ Hero Slider Images</label>
                  <div style={{fontSize:11,color:"#888888",marginBottom:16}}>
                    Recommended: <strong>1920×1080px</strong> — homepage background slides (auto-rotate every 3s)
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                    {[1, 2, 3, 4].map((n) => {
                      const key = `hero_slide_${n}`;
                      const url = siteContent[key] || "";
                      return (
                        <div key={key} style={{border:"1px solid #E5E5E5",borderRadius:10,padding:14,background:"#FAFAFA"}}>
                          <div style={{fontSize:13,fontWeight:600,color:"#111",marginBottom:10}}>Slide {n}</div>
                          {url ? (
                            <img
                              src={url}
                              alt={`Hero slide ${n}`}
                              style={{width:"100%",height:90,objectFit:"cover",borderRadius:8,border:"1px solid #E5E5E5",marginBottom:10,display:"block"}}
                            />
                          ) : (
                            <div style={{width:"100%",height:90,borderRadius:8,border:"1px dashed #CCC",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",color:"#AAA",fontSize:12,marginBottom:10}}>
                              No image
                            </div>
                          )}
                          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                            <label style={{cursor:"pointer",background:"#F5F5F5",border:"1px solid #E5E5E5",padding:"6px 12px",borderRadius:8,fontSize:12,color:"#5B21B6",fontWeight:600}}>
                              {heroSlideUploading === n ? "Uploading..." : "Upload"}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                style={{display:"none"}}
                                disabled={heroSlideUploading !== null}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) uploadHeroSlideAdmin(n, file);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            {url && (
                              <button
                                type="button"
                                style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:12}}
                                onClick={() => {
                                  setSiteContent((s) => ({ ...s, [key]: "" }));
                                  saveContent([key]);
                                }}
                              >
                                ✕ Remove
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{marginTop:16}}
                    disabled={contentSaving}
                    onClick={() => saveContent(["hero_slide_1", "hero_slide_2", "hero_slide_3", "hero_slide_4"])}
                  >
                    {contentSaving ? "Saving..." : "💾 Save All Slides"}
                  </button>
                </div>

                <div style={{marginTop:28,paddingTop:24,borderTop:"1px solid #E5E5E5"}}>
                  <div style={{fontSize:15,fontWeight:700,color:"#111",marginBottom:16}}>📞 Contact Details</div>
                  <div className="modal-field">
                    <label>WhatsApp Number</label>
                    <input
                      className="modal-field"
                      style={{width:"100%"}}
                      value={siteContent.contact_whatsapp||siteContent.whatsapp_number||""}
                      onChange={e=>setSiteContent(s=>({...s,contact_whatsapp:e.target.value,whatsapp_number:e.target.value}))}
                      placeholder="447518787653"
                    />
                    <div style={{fontSize:11,color:"#888",marginTop:4}}>(without + sign)</div>
                  </div>
                  <div className="modal-field">
                    <label>Phone Number</label>
                    <input
                      className="modal-field"
                      style={{width:"100%"}}
                      value={siteContent.contact_phone||""}
                      onChange={e=>setSiteContent(s=>({...s,contact_phone:e.target.value}))}
                      placeholder="+447518787653"
                    />
                  </div>
                  <div className="modal-field">
                    <label>Email Address</label>
                    <input
                      className="modal-field"
                      style={{width:"100%"}}
                      value={siteContent.contact_email||""}
                      onChange={e=>setSiteContent(s=>({...s,contact_email:e.target.value}))}
                      placeholder="firestick4uk@gmail.com"
                    />
                  </div>
                  <div className="modal-field">
                    <label>Telegram Handle</label>
                    <input
                      className="modal-field"
                      style={{width:"100%"}}
                      value={siteContent.contact_telegram||""}
                      onChange={e=>setSiteContent(s=>({...s,contact_telegram:e.target.value}))}
                      placeholder="@firestick44"
                    />
                  </div>
                  {contentMsg && (
                    <div
                      style={{
                        margin: "8px 0 10px",
                        padding: "10px 16px",
                        background: contentMsg.startsWith("✅") ? "rgba(0,200,100,0.1)" : "rgba(255,68,68,0.1)",
                        border: `1px solid ${contentMsg.startsWith("✅") ? "rgba(0,200,100,0.3)" : "rgba(255,68,68,0.25)"}`,
                        borderRadius: 10,
                        fontSize: 13,
                        color: contentMsg.startsWith("✅") ? "#00c864" : "#ff6666",
                      }}
                    >
                      {contentMsg}
                    </div>
                  )}
                  <button
                    className="btn-primary"
                    style={{marginTop:8}}
                    disabled={contentSaving}
                    onClick={()=>saveContent(["contact_whatsapp","whatsapp_number","contact_phone","contact_email","contact_telegram"])}
                  >
                    {contentSaving?"Saving...":"💾 Save Contact Details"}
                  </button>
                </div>

                {contentMsg && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 16px",
                      background: contentMsg.startsWith("✅") ? "rgba(0,200,100,0.1)" : "rgba(255,68,68,0.1)",
                      border: `1px solid ${contentMsg.startsWith("✅") ? "rgba(0,200,100,0.3)" : "rgba(255,68,68,0.25)"}`,
                      borderRadius: 10,
                      fontSize: 13,
                      color: contentMsg.startsWith("✅") ? "#00c864" : "#ff6666",
                    }}
                  >
                    {contentMsg}
                  </div>
                )}
                <button className="btn-primary" style={{marginTop:12}} disabled={contentSaving} onClick={()=>saveContent(["site_title","site_tagline"])}>
                  {contentSaving?"Saving...":"💾 Save Settings"}
                </button>
              </div>
            </div>
          )}

          {/* ✏️ CONTENT EDITOR */}
          {tab==="pages" && can("content.manage") && (
            <div>
              {contentMsg && <div style={{marginBottom:16,padding:"10px 16px",background:contentMsg.startsWith("✅")?"rgba(0,200,100,0.1)":"rgba(255,68,68,0.1)",border:`1px solid ${contentMsg.startsWith("✅")?"rgba(0,200,100,0.3)":"rgba(255,68,68,0.25)"}`,borderRadius:10,fontSize:13,color:contentMsg.startsWith("✅")?"#00c864":"#ff6666"}}>{contentMsg}</div>}

              <div style={{marginBottom:18,padding:"14px 16px",background:"#F5F3FF",border:"1px solid #DDD6FE",borderRadius:12,fontSize:13,color:"#4C1D95",lineHeight:1.55}}>
                <strong>Yahan se website ka saara text update hota hai</strong> (Products jaisa rich editor — bold, headings, links, lists).
                <br />Left menu → <strong>Content Editor</strong> → Home / About / Subscription / Contact / FAQ / Footer / Products / Cart / Tracking / Blog / Legal / Global → Save.
                <br /><span style={{opacity:0.85}}>Page Builder alag hai — sirf “Why Choose Us” cards / Testimonials icons ke liye. Service info, features, buttons, stats yahan Content Editor mein likhein.</span>
              </div>

              <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
                {[
                  ["home","🏠 Home"],
                  ["about","ℹ️ About"],
                  ["subscription","📺 Subscription"],
                  ["contact","📞 Contact"],
                  ["faq","❓ FAQ"],
                  ["footer","🔻 Footer"],
                  ["products","📦 Products"],
                  ["cart","🛒 Cart"],
                  ["tracking","📍 Tracking"],
                  ["blog","📝 Blog"],
                  ["legal","⚖️ Legal"],
                  ["global","🌐 Global"],
                ].map(([k,l])=>(
                  <button key={k} className={`action-btn ${activePage===k?"btn-verify":"btn-view"}`} style={{padding:"10px 20px",fontSize:13}} onClick={()=>setActivePage(k)}>{l}</button>
                ))}
              </div>

              {/* SUBSCRIPTION LANDING */}
              {activePage==="subscription" && (
                <SubscriptionContentEditor
                  siteContent={siteContent}
                  setSiteContent={setSiteContent}
                  onSave={saveContent}
                  saving={contentSaving}
                />
              )}

              {/* HOME */}
              {activePage==="home" && (
                <div className="section-card" style={{padding:24}}>
                  <div className="section-header" style={{marginBottom:20}}><div className="section-title">🏠 Home Page Content</div></div>
                  <div className="modal-field">
                    <label>Meta Title <span style={{fontSize:11,color:(siteContent.home_meta_title||"").length>55?"#ff6666":(siteContent.home_meta_title||"").length>40?"#00c864":"rgba(255,255,255,0.3)"}}>{(siteContent.home_meta_title||"").length}/60</span></label>
                    <input style={{width:"100%"}} maxLength={60} value={siteContent.home_meta_title||""} onChange={e=>setSiteContent(s=>({...s,home_meta_title:e.target.value}))} placeholder="Firestick4UK — Best Streaming Service UK" />
                  </div>
                  <div className="modal-field">
                    <label>Meta Description <span style={{fontSize:11,color:(siteContent.home_meta_description||"").length>160?"#ff6666":(siteContent.home_meta_description||"").length>120?"#00c864":"rgba(255,255,255,0.3)"}}>{(siteContent.home_meta_description||"").length}/180</span></label>
                    <textarea rows={3} style={{width:"100%",resize:"vertical"}} maxLength={180} value={siteContent.home_meta_description||""} onChange={e=>setSiteContent(s=>({...s,home_meta_description:e.target.value}))} placeholder="Premium Firestick subscriptions and streaming services in the UK..." />
                  </div>

                  <div style={{margin:"20px 0 12px",paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.08)",fontSize:13,fontWeight:700,color:"#5B21B6"}}>TOP HERO / SLIDER (title + subtitle above products)</div>
                  <div className="modal-field"><label>Top Hero Title</label><input style={{width:"100%"}} value={siteContent.home_top_hero_title||""} onChange={e=>setSiteContent(s=>({...s,home_top_hero_title:e.target.value}))} placeholder="Best Firestick Service in UK" /></div>
                  <div className="modal-field"><label>Top Hero Subtitle</label><textarea rows={2} style={{width:"100%",resize:"vertical"}} value={siteContent.home_top_hero_subtitle||""} onChange={e=>setSiteContent(s=>({...s,home_top_hero_subtitle:e.target.value}))} placeholder="Premium Streaming Solutions for the UK" /></div>

                  <div style={{margin:"20px 0 12px",paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.08)",fontSize:13,fontWeight:700,color:"#5B21B6"}}>MAIN HERO (below products — title, buttons, features, stats)</div>
                  <div className="modal-field"><label>Main Hero Title</label><input style={{width:"100%"}} value={siteContent.home_hero_title||""} onChange={e=>setSiteContent(s=>({...s,home_hero_title:e.target.value}))} placeholder="Premium UK Streaming Service" /></div>
                  <div className="modal-field"><label>Main Hero Subtitle</label><textarea rows={3} style={{width:"100%",resize:"vertical"}} value={siteContent.home_hero_subtitle||""} onChange={e=>setSiteContent(s=>({...s,home_hero_subtitle:e.target.value}))} placeholder="Firestick4UK provides premium UK streaming services for Firestick and Android Box users." /></div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                    <div className="modal-field"><label>Primary Button Text</label><input style={{width:"100%"}} value={siteContent.home_hero_btn_text||""} onChange={e=>setSiteContent(s=>({...s,home_hero_btn_text:e.target.value}))} placeholder="Shop Now" /></div>
                    <div className="modal-field"><label>Primary Button Link</label><input style={{width:"100%"}} value={siteContent.home_hero_btn_link||""} onChange={e=>setSiteContent(s=>({...s,home_hero_btn_link:e.target.value}))} placeholder="/products" /></div>
                    <div className="modal-field" style={{gridColumn:"1 / -1"}}>
                      <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
                        <input
                          type="checkbox"
                          checked={(siteContent.home_hero_btn_show ?? "1") !== "0"}
                          onChange={e=>setSiteContent(s=>({...s,home_hero_btn_show:e.target.checked?"1":"0"}))}
                        />
                        Show Primary Button (Shop Now) on website
                      </label>
                    </div>
                    <div className="modal-field"><label>Secondary Button Text</label><input style={{width:"100%"}} value={siteContent.home_hero_btn2_text||""} onChange={e=>setSiteContent(s=>({...s,home_hero_btn2_text:e.target.value}))} placeholder="Learn More" /></div>
                    <div className="modal-field"><label>Secondary Button Link</label><input style={{width:"100%"}} value={siteContent.home_hero_btn2_link||""} onChange={e=>setSiteContent(s=>({...s,home_hero_btn2_link:e.target.value}))} placeholder="/about" /></div>
                    <div className="modal-field" style={{gridColumn:"1 / -1"}}>
                      <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
                        <input
                          type="checkbox"
                          checked={(siteContent.home_hero_btn2_show ?? "1") !== "0"}
                          onChange={e=>setSiteContent(s=>({...s,home_hero_btn2_show:e.target.checked?"1":"0"}))}
                        />
                        Show Secondary Button (Learn More) on website
                      </label>
                    </div>
                  </div>
                  <div className="modal-field">
                    <label>Service / Features Content (rich editor — headings, bold, links, lists)</label>
                    <p style={{fontSize:12,color:"#666",margin:"0 0 8px",lineHeight:1.4}}>
                      Product description jaisa editor. Full service info, headings, bullet lists aur links add kar sakte ho. Ye Main Hero ke right side pe dikhega.
                    </p>
                    <TipTapEditor
                      content={toEditorHtml(siteContent.home_features_list || "")}
                      onChange={(html) => setSiteContent((s) => ({ ...s, home_features_list: html }))}
                      placeholder="Write about your service… Use headings, bold, lists, and links."
                    />
                  </div>

                  <div style={{margin:"16px 0 10px",fontSize:13,fontWeight:700,color:"#5B21B6"}}>STATS (shown under Main Hero)</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                    <div className="modal-field"><label>Stat 1 Number</label><input style={{width:"100%"}} value={siteContent.home_stat1_num||""} onChange={e=>setSiteContent(s=>({...s,home_stat1_num:e.target.value}))} placeholder="500+" /></div>
                    <div className="modal-field"><label>Stat 1 Label</label><input style={{width:"100%"}} value={siteContent.home_stat1_label||""} onChange={e=>setSiteContent(s=>({...s,home_stat1_label:e.target.value}))} placeholder="Happy Customers" /></div>
                    <div className="modal-field"><label>Stat 2 Number</label><input style={{width:"100%"}} value={siteContent.home_stat2_num||""} onChange={e=>setSiteContent(s=>({...s,home_stat2_num:e.target.value}))} placeholder="4.9★" /></div>
                    <div className="modal-field"><label>Stat 2 Label</label><input style={{width:"100%"}} value={siteContent.home_stat2_label||""} onChange={e=>setSiteContent(s=>({...s,home_stat2_label:e.target.value}))} placeholder="Average Rating" /></div>
                    <div className="modal-field"><label>Stat 3 Number</label><input style={{width:"100%"}} value={siteContent.home_stat3_num||""} onChange={e=>setSiteContent(s=>({...s,home_stat3_num:e.target.value}))} placeholder="24/7" /></div>
                    <div className="modal-field"><label>Stat 3 Label</label><input style={{width:"100%"}} value={siteContent.home_stat3_label||""} onChange={e=>setSiteContent(s=>({...s,home_stat3_label:e.target.value}))} placeholder="Support" /></div>
                  </div>

                  <div className="modal-field"><label>Tagline</label><input style={{width:"100%"}} value={siteContent.home_tagline||""} onChange={e=>setSiteContent(s=>({...s,home_tagline:e.target.value}))} placeholder="Fast. Reliable. Affordable." /></div>
                  <button className="btn-primary" disabled={contentSaving} onClick={()=>saveContent([
                    "home_meta_title","home_meta_description",
                    "home_top_hero_title","home_top_hero_subtitle",
                    "home_hero_title","home_hero_subtitle",
                    "home_hero_btn_text","home_hero_btn_link","home_hero_btn_show","home_hero_btn2_text","home_hero_btn2_link","home_hero_btn2_show",
                    "home_features_list",
                    "home_stat1_num","home_stat1_label","home_stat2_num","home_stat2_label","home_stat3_num","home_stat3_label",
                    "home_tagline",
                  ])}>{contentSaving?"Saving...":"💾 Save Home"}</button>
                  <div style={{marginTop:28,paddingTop:20,borderTop:"1px solid #E5E5E5"}}>
                    <div style={{marginBottom:16,fontSize:13,fontWeight:700,color:"#5B21B6"}}>Additional home labels</div>
                    <AdminContentPanel
                      page="home"
                      siteContent={siteContent}
                      setSiteContent={setSiteContent}
                      onSave={saveContent}
                      saving={contentSaving}
                      saveLabel="💾 Save Home Labels"
                    />
                  </div>
                </div>
              )}

              {/* ABOUT */}
              {activePage==="about" && (
                <div className="section-card" style={{padding:24}}>
                  <div className="section-header" style={{marginBottom:20}}><div className="section-title">ℹ️ About Page Content</div></div>
                  <div className="modal-field"><label>Page Title</label><input style={{width:"100%"}} value={siteContent.about_title||""} onChange={e=>setSiteContent(s=>({...s,about_title:e.target.value}))} /></div>
                  <div className="modal-field">
                    <label>Main Description (rich editor)</label>
                    <TipTapEditor
                      content={toEditorHtml(siteContent.about_description || "")}
                      onChange={(html) => setSiteContent((s) => ({ ...s, about_description: html }))}
                      placeholder="Full about / service story with formatting..."
                    />
                  </div>
                  <div className="modal-field">
                    <label>Mission Statement (rich editor)</label>
                    <TipTapEditor
                      content={toEditorHtml(siteContent.about_mission || "")}
                      onChange={(html) => setSiteContent((s) => ({ ...s, about_mission: html }))}
                      placeholder="Mission text with headings, bold, links..."
                    />
                  </div>
                  <button className="btn-primary" disabled={contentSaving} onClick={()=>saveContent(["about_title","about_description","about_mission", ...keysForPage("about")])}>{contentSaving?"Saving...":"💾 Save About"}</button>
                  <div style={{marginTop:28,paddingTop:20,borderTop:"1px solid #E5E5E5"}}>
                    <div style={{marginBottom:16,fontSize:13,fontWeight:700,color:"#5B21B6"}}>Additional about copy & JSON</div>
                    <AdminContentPanel
                      page="about"
                      siteContent={siteContent}
                      setSiteContent={setSiteContent}
                      onSave={saveContent}
                      saving={contentSaving}
                      saveLabel="💾 Save About Labels"
                    />
                  </div>
                </div>
              )}

              {/* CONTACT */}
              {activePage==="contact" && (
                <div className="section-card" style={{padding:24}}>
                  <div className="section-header" style={{marginBottom:20}}><div className="section-title">📞 Contact Page Content</div></div>
                  {can("settings.manage") ? (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                      <div className="modal-field"><label>Phone Number</label><input style={{width:"100%"}} value={siteContent.contact_phone||""} onChange={e=>setSiteContent(s=>({...s,contact_phone:e.target.value}))} /></div>
                      <div className="modal-field"><label>Email Address</label><input style={{width:"100%"}} value={siteContent.contact_email||""} onChange={e=>setSiteContent(s=>({...s,contact_email:e.target.value}))} /></div>
                      <div className="modal-field"><label>WhatsApp (numbers only)</label><input style={{width:"100%"}} value={siteContent.contact_whatsapp||""} onChange={e=>setSiteContent(s=>({...s,contact_whatsapp:e.target.value,whatsapp_number:e.target.value}))} placeholder="447518787653" /></div>
                      <div className="modal-field"><label>Telegram Handle</label><input style={{width:"100%"}} value={siteContent.contact_telegram||""} onChange={e=>setSiteContent(s=>({...s,contact_telegram:e.target.value}))} placeholder="@firestick44" /></div>
                      <div className="modal-field"><label>Business Hours</label><input style={{width:"100%"}} value={siteContent.contact_hours||""} onChange={e=>setSiteContent(s=>({...s,contact_hours:e.target.value}))} /></div>
                      <div className="modal-field"><label>Address</label><input style={{width:"100%"}} value={siteContent.contact_address||""} onChange={e=>setSiteContent(s=>({...s,contact_address:e.target.value}))} /></div>
                    </div>
                  ) : (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                      <div className="modal-field" style={{gridColumn:"1 / -1",padding:"10px 12px",background:"#F8F5FF",borderRadius:8,fontSize:12,color:"#5B21B6"}}>
                        Phone, email, WhatsApp and Telegram coordinates are <strong>Super Admin only</strong> (Site Settings). You can still edit hours, address and page labels.
                      </div>
                      <div className="modal-field"><label>Business Hours</label><input style={{width:"100%"}} value={siteContent.contact_hours||""} onChange={e=>setSiteContent(s=>({...s,contact_hours:e.target.value}))} /></div>
                      <div className="modal-field"><label>Address</label><input style={{width:"100%"}} value={siteContent.contact_address||""} onChange={e=>setSiteContent(s=>({...s,contact_address:e.target.value}))} /></div>
                    </div>
                  )}
                  <button className="btn-primary" disabled={contentSaving} onClick={()=>saveContent(
                    can("settings.manage")
                      ? ["contact_phone","contact_email","contact_whatsapp","whatsapp_number","contact_telegram","contact_hours","contact_address"]
                      : ["contact_hours","contact_address"]
                  )}>{contentSaving?"Saving...":"💾 Save Contact"}</button>
                  <div style={{marginTop:28,paddingTop:20,borderTop:"1px solid #E5E5E5"}}>
                    <div style={{marginBottom:16,fontSize:13,fontWeight:700,color:"#5B21B6"}}>Contact page labels</div>
                    <AdminContentPanel
                      page="contact"
                      siteContent={siteContent}
                      setSiteContent={setSiteContent}
                      onSave={saveContent}
                      saving={contentSaving}
                      saveLabel="💾 Save Contact Labels"
                    />
                  </div>
                </div>
              )}

              {/* FOOTER / FAQ / PRODUCTS / CART / TRACKING / BLOG / LEGAL / GLOBAL */}
              {["footer","faq","products","cart","tracking","blog","legal","global"].includes(activePage) && (
                <div className="section-card" style={{padding:24}}>
                  <AdminContentPanel
                    page={activePage}
                    siteContent={siteContent}
                    setSiteContent={setSiteContent}
                    onSave={saveContent}
                    saving={contentSaving}
                  />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}