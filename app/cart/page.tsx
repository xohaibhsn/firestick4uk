"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "../lib/cartContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CopyButton from "@/components/CopyButton";
import { useContactConfig } from "@/hooks/useContactConfig";
import { useSiteContent } from "@/hooks/useSiteContent";
import {
  DIGITAL_SUPPLY_ACK_TEXT,
  PHYSICAL_SHIPPING_GBP,
  cartShippingPounds,
  isDigitalProduct,
} from "@/lib/productFulfilment";
import {
  CUSTOMER_IDENTITY_REQUIRED_MSG,
  hasMeaningfulCustomerIdentity,
  normalizeOrderCustomerIdentity,
} from "@/lib/orderCustomerIdentity";
import {
  RECEIPT_ACCEPT_ATTR,
  RECEIPT_ERROR_DEFAULTS,
  RECEIPT_HELP_DEFAULT,
} from "@/lib/receiptUploadContract";
import {
  EMPTY_RECEIPT_SELECTION,
  applyReceiptFileChoice,
  clearReceiptSelectionState,
  receiptSelectionBlocksBankSubmit,
  receiptStatusLabel,
  uploadReceiptDuringCheckout,
  type ReceiptSelectionState,
} from "@/lib/receiptCheckoutClient";

type ProductFacts = {
  id: number;
  name: string;
  category?: string | null;
  stock?: string | null;
  active?: number | boolean;
};

const UNRESOLVED_CART_MSG =
  "One or more items in your cart are no longer available. Please remove them and try again.";

const navStyles = `
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  body { background:#FFFFFF; color:#111111; font-family:var(--font-body); overflow-x:hidden; }

  nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:18px 60px;
    display:flex; align-items:center; justify-content:space-between;
    background:#FFFFFF; border-bottom:1px solid #E5E5E5; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
  .nav-logo { font-family:var(--font-logo); font-size:20px; font-weight:800; color:#111111; text-decoration:none; letter-spacing:2px; }
  .nav-links { display:flex; gap:36px; list-style:none; }
  .nav-links a { color:#111111; text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.2s; }
  .nav-links a:hover { color:#5B21B6; }
  .nav-cta { background:#5B21B6 !important; color:#FFFFFF !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; }
  .nav-cta:hover { background:#4C1D95 !important; }
  .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:6px; z-index:101; }
  .hamburger span { display:block; width:25px; height:2px; background:#111111; border-radius:2px; }
  @media(max-width:768px){
    nav{padding:16px 24px;}
    .nav-links{display:none;}
    .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;background:#FFFFFF;align-items:center;justify-content:center;gap:28px;z-index:9999;margin:0;padding:0;}
    .nav-links.open a{color:#111111;font-size:18px;}
    .hamburger{display:flex;}
  }

  .page-wrapper { padding-top:100px; min-height:100vh; background:#FFFFFF; }
  .page-header { max-width:1200px; margin:0 auto; padding:50px 60px 30px; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#5B21B6; margin-bottom:12px; font-weight:600; }
  .page-title { font-family:var(--font-display); font-size:clamp(1.8rem,3vw,2.5rem); font-weight:800; letter-spacing:-0.03em; color:#111111; }
  .page-title span { color:#5B21B6; -webkit-text-fill-color:#5B21B6; }

  /* CART LAYOUT */
  .cart-layout { max-width:1200px; margin:0 auto; padding:0 60px 80px; display:grid; grid-template-columns:1fr 380px; gap:30px; }
  .cart-items { display:flex; flex-direction:column; gap:16px; }

  /* CART EMPTY */
  .cart-empty { text-align:center; padding:70px 40px; background:#F5F5F5; border:1px solid #E5E5E5; border-radius:16px; }
  .cart-empty-icon { font-size:60px; margin-bottom:20px; display:block; }
  .cart-empty h3 { font-family:var(--font-display); font-size:22px; color:#111111; margin-bottom:10px; }
  .cart-empty p { color:#666666; font-size:14px; margin-bottom:28px; }

  /* CART ITEM */
  .cart-item { display:flex; flex-direction:row; align-items:flex-start; gap:20px; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:14px; padding:20px; transition:all 0.2s; box-shadow:0 1px 4px rgba(0,0,0,0.04); }
  .cart-item:hover { border-color:#5B21B6; box-shadow:0 4px 14px rgba(91,33,182,0.1); }
  .cart-item-image { width:72px; height:72px; border-radius:10px; background:#F5F3FF; border:1px solid #DDD6FE; display:flex; align-items:center; justify-content:center; font-size:36px; flex-shrink:0; overflow:hidden; }
  .cart-item-details { flex:1 1 auto; min-width:0; }
  .cart-item-name { font-family:var(--font-display); font-size:16px; font-weight:700; color:#111111; margin-bottom:6px; overflow-wrap:anywhere; word-break:break-word; }
  .cart-item-price { font-size:17px; font-weight:700; color:#5B21B6; font-family:var(--font-display); }
  .cart-item-actions { display:flex; flex-direction:column; align-items:flex-end; gap:12px; flex-shrink:0; }
  .qty-control { display:flex; align-items:center; gap:10px; }
  .qty-btn { width:44px; height:44px; min-width:44px; min-height:44px; border-radius:50%; border:1px solid #E5E5E5; background:#F5F5F5; color:#111111; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
  .qty-btn:hover { background:#5B21B6; color:#FFFFFF; border-color:#5B21B6; }
  .cart-item-image img { width:100%; height:100%; object-fit:cover; border-radius:10px; display:block; }
  .copy-btn-wrap { display:inline-flex; align-items:center; gap:8px; flex:0 0 auto; }
  .copy-btn { min-height:44px; min-width:44px; padding:6px 12px; border-radius:8px; border:1px solid #DDD6FE; background:#F5F3FF; color:#5B21B6; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
  .copy-btn:hover, .copy-btn:focus-visible { border-color:#5B21B6; outline:2px solid #5B21B6; outline-offset:2px; }
  .copy-btn-live { font-size:11px; color:#16A34A; min-width:0; }
  .copy-btn-live:not(:empty) { min-width:3.5em; }
  .bank-row-value { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; column-gap:8px; color:#111111; font-weight:600; min-width:0; width:100%; }
  .bank-row-value__text { min-width:0; max-width:100%; text-align:right; }
  .bank-row-value__text--nowrap { white-space:nowrap; }
  .bank-row-value__text--wrap { white-space:normal; overflow-wrap:break-word; word-break:normal; }
  .bank-row-value .copy-btn-wrap { justify-self:end; }
  .checkout-steps { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:16px 0 18px; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; color:#888888; }
  .checkout-steps span { color:#888888; }
  .checkout-steps .step-current { color:#5B21B6; font-weight:700; }
  .checkout-steps .step-done { color:#16A34A; font-weight:600; }
  .cart-help-wa { display:inline-flex; align-items:center; gap:6px; margin:0 20px 16px; font-size:13px; color:#25d366; text-decoration:none; font-weight:600; }
  .checkout-btn.preparing { opacity:0.75; cursor:wait; }
  .checkout-btn.preparing::after { content:""; display:inline-block; width:12px; height:12px; margin-left:8px; border:2px solid rgba(255,255,255,0.35); border-top-color:#fff; border-radius:50%; vertical-align:-1px; animation:cartPrepSpin 0.7s linear infinite; }
  @keyframes cartPrepSpin { to { transform:rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .checkout-btn.preparing::after { animation:none; opacity:0.5; }
  }
  .sticky-place-order {
    display:none;
  }
  @media (max-width:900px) {
    .sticky-place-order {
      display:flex; position:fixed; z-index:10001;
      left:max(12px, env(safe-area-inset-left, 0px));
      right:max(12px, env(safe-area-inset-right, 0px));
      bottom:max(0px, env(safe-area-inset-bottom, 0px));
      width:auto; max-width:calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
      box-sizing:border-box;
      align-items:center; justify-content:space-between; gap:12px;
      padding:10px 12px; padding-bottom:max(10px, env(safe-area-inset-bottom, 0px));
      background:#111111; color:#FFFFFF; box-shadow:0 -4px 20px rgba(0,0,0,0.18);
      border-radius:12px 12px 0 0;
    }
    .sticky-place-order.is-keyboard-hidden { display:none; }
    .sticky-place-order__total { font-size:14px; font-weight:600; white-space:nowrap; flex-shrink:0; }
    .sticky-place-order__total strong { color:#C4B5FD; font-size:16px; }
    .sticky-place-order .place-order-btn {
      margin:0; width:auto; flex:1 1 auto; min-width:0; max-width:220px;
      padding:12px 14px; font-size:13px; box-sizing:border-box;
    }
    .checkout-section { padding-bottom:calc(88px + env(safe-area-inset-bottom, 0px)); }
    .bank-details { padding-bottom:24px; margin-right:0; width:100%; max-width:100%; box-sizing:border-box; }
    .order-summary { padding-bottom:8px; }
  }
  .qty-num { font-size:16px; font-weight:700; color:#111111; min-width:20px; text-align:center; }
  .remove-btn { background:none; border:none; color:#CCCCCC; font-size:13px; cursor:pointer; transition:color 0.2s; }
  .remove-btn:hover { color:#DC2626; }

  /* ORDER SUMMARY */
  .order-summary { position:sticky; top:100px; height:fit-content; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:16px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.06); }
  .summary-header { padding:22px 26px; border-bottom:1px solid #F0F0F0; background:#FAFAFA; }
  .summary-header h3 { font-family:var(--font-display); font-size:17px; font-weight:700; color:#111111; }
  .summary-body { padding:20px 26px; display:flex; flex-direction:column; gap:12px; }
  .summary-row { display:flex; justify-content:space-between; align-items:center; font-size:14px; }
  .summary-row span:first-child { color:#666666; }
  .summary-row span:last-child { color:#111111; font-weight:500; }
  .summary-divider { border:none; border-top:1px solid #F0F0F0; margin:4px 0; }
  .summary-total span:first-child { color:#111111 !important; font-weight:700; font-family:var(--font-display); font-size:15px; }
  .summary-total span:last-child { color:#5B21B6 !important; font-weight:700; font-family:var(--font-display); font-size:22px; }
  .checkout-btn { margin:0 20px 20px; background:#5B21B6; color:#FFFFFF; border:none; padding:15px; border-radius:8px; width:calc(100% - 40px); font-size:15px; font-weight:600; cursor:pointer; transition:all 0.2s; }
  .checkout-btn:hover { background:#4C1D95; transform:translateY(-1px); box-shadow:0 4px 12px rgba(91,33,182,0.3); }
  .checkout-btn:disabled { opacity:0.4; cursor:not-allowed; transform:none; }

  /* CHECKOUT */
  .checkout-section { max-width:1200px; margin:0 auto; padding:0 60px 80px; }
  .checkout-grid { display:grid; grid-template-columns:1fr 1fr; gap:28px; }
  .form-section { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:16px; padding:30px; box-shadow:0 2px 8px rgba(0,0,0,0.05); }
  .form-section h3 { font-family:var(--font-display); font-size:17px; font-weight:700; color:#111111; margin-bottom:22px; padding-bottom:14px; border-bottom:1px solid #F0F0F0; }
  .form-group { margin-bottom:16px; }
  .form-group label { display:block; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#666666; margin-bottom:7px; font-weight:600; }
  .form-group input, .form-group textarea { width:100%; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:9px; padding:11px 14px; color:#111111; font-family:var(--font-body); font-size:14px; transition:all 0.2s; outline:none; }
  .form-group input:focus, .form-group textarea:focus { border-color:#5B21B6; box-shadow:0 0 0 3px rgba(91,33,182,0.1); }
  .form-group input::placeholder, .form-group textarea::placeholder { color:#AAAAAA; }
  .form-group textarea { resize:vertical; min-height:80px; }

  /* PAYMENT */
  .payment-options { display:flex; flex-direction:column; gap:10px; margin-bottom:18px; }
  .payment-option { display:flex; align-items:center; gap:14px; padding:14px 18px; border:1px solid #E5E5E5; border-radius:10px; cursor:pointer; transition:all 0.2s; background:#FFFFFF; }
  .payment-option:hover { border-color:#5B21B6; background:#F5F3FF; }
  .payment-option.selected { border-color:#5B21B6; background:#F5F3FF; }
  .payment-option input[type="radio"] { accent-color:#5B21B6; width:16px; height:16px; }
  .payment-option-label { font-size:15px; font-weight:600; color:#111111; }
  .payment-option-sub { font-size:12px; color:#888888; margin-top:2px; }

  /* BANK DETAILS */
  .bank-details { background:#F9F9F9; border:1px solid #E5E5E5; border-radius:10px; padding:18px; margin-bottom:18px; width:100%; max-width:100%; box-sizing:border-box; }
  .bank-details h4 { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#5B21B6; margin-bottom:12px; font-weight:700; }
  .bank-row { display:grid; grid-template-columns:auto minmax(0,1fr); column-gap:12px; align-items:start; padding:7px 0; border-bottom:1px solid #F0F0F0; font-size:14px; width:100%; box-sizing:border-box; }
  .bank-row:last-child { border:none; }
  .bank-row > span:first-child { color:#777777; white-space:nowrap; }
  .bank-row > span:last-child { color:#111111; font-weight:600; min-width:0; }

  /* UPLOAD */
  .upload-area { border:2px dashed #CCCCCC; border-radius:10px; padding:28px; text-align:center; cursor:pointer; transition:all 0.2s; position:relative; background:#FAFAFA; }
  .upload-area:hover { border-color:#5B21B6; background:#F5F3FF; }
  .upload-area.has-file { border-color:#5B21B6; background:#F5F3FF; cursor:default; }
  .upload-icon { font-size:32px; margin-bottom:8px; display:block; }
  .upload-text { font-size:14px; color:#666666; }
  .upload-text strong { color:#111111; }
  .upload-hint { font-size:12px; color:#666666; margin-top:8px; line-height:1.5; }
  .upload-selected-actions { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:12px; position:relative; z-index:2; }
  .upload-selected-actions button, .upload-selected-actions label {
    background:#FFFFFF; border:1px solid #D4D4D8; color:#111111; padding:7px 14px; border-radius:8px;
    font-size:12px; cursor:pointer; font-family:inherit;
  }
  .upload-selected-actions button:hover, .upload-selected-actions label:hover { border-color:#5B21B6; color:#5B21B6; }
  .upload-area input[type="file"].upload-overlay {
    position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%; z-index:1;
  }
  .upload-area input[type="file"].upload-replace { display:none; }

  /* PLACE ORDER */
  .place-order-btn { width:100%; background:#5B21B6; color:#FFFFFF; border:none; padding:16px; border-radius:9px; font-size:15px; font-weight:700; letter-spacing:1px; text-transform:uppercase; cursor:pointer; transition:all 0.2s; margin-top:10px; }
  .place-order-btn:hover { background:#4C1D95; transform:translateY(-1px); box-shadow:0 4px 14px rgba(91,33,182,0.35); }
  .place-order-btn:disabled { opacity:0.45; cursor:not-allowed; transform:none; }
  .digital-ack { background:#FAFAFA; border:1px solid #E5E5E5; border-radius:12px; padding:14px 16px; margin-bottom:14px; }
  .digital-ack-row { display:flex; gap:12px; align-items:flex-start; }
  .digital-ack input[type="checkbox"] { width:18px; height:18px; margin-top:2px; flex-shrink:0; accent-color:#5B21B6; }
  .digital-ack label { font-size:13px; line-height:1.55; color:#333333; cursor:pointer; }
  .digital-ack-error { margin-top:8px; font-size:12px; color:#DC2626; }
  .checkout-policy-links { font-size:12px; line-height:1.6; color:#666666; margin:0 0 14px; }
  .checkout-policy-links a { color:#5B21B6; text-decoration:underline; text-underline-offset:2px; }

  /* SUCCESS */
  .success-screen { max-width:600px; margin:60px auto; padding:0 24px 80px; text-align:center; }
  .success-icon { font-size:80px; margin-bottom:24px; display:block; animation:popIn 0.5s ease; }
  @keyframes popIn { from{transform:scale(0)} to{transform:scale(1)} }
  .success-title { font-family:var(--font-display); font-size:32px; font-weight:700; color:#111111; margin-bottom:14px; }
  .success-title span { color:#5B21B6; }
  .success-sub { color:#555555; font-size:15px; line-height:1.7; margin-bottom:10px; }
  .order-id-box { font-family:var(--font-display); font-size:17px; color:#5B21B6; background:#F5F3FF; border:1px solid #DDD6FE; border-radius:10px; padding:12px 20px; margin:20px 0; display:inline-block; }
  .status-box { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:14px; padding:22px; margin:24px 0; text-align:left; box-shadow:0 2px 8px rgba(0,0,0,0.05); }
  .status-step { display:flex; align-items:center; gap:14px; padding:10px 0; border-bottom:1px solid #F5F5F5; }
  .status-step:last-child { border:none; }
  .step-dot { width:10px; height:10px; border-radius:50%; background:#CCCCCC; flex-shrink:0; }
  .step-dot.active { background:#5B21B6; box-shadow:0 0 8px rgba(91,33,182,0.5); }
  .step-dot.inactive { background:#E5E5E5; }
  .step-text strong { color:#111111; display:block; margin-bottom:2px; font-size:14px; }
  .step-text span { color:#888888; font-size:12px; }
  .btn-primary { background:#5B21B6; color:#FFFFFF; padding:14px 36px; border-radius:8px; font-size:14px; font-weight:600; letter-spacing:1px; text-decoration:none; transition:all 0.2s; display:inline-block; margin-top:10px; }
  .btn-primary:hover { background:#4C1D95; transform:translateY(-1px); box-shadow:0 4px 12px rgba(91,33,182,0.3); }

  /* FOOTER */
  footer { background:#111111; padding:50px 60px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; }
  .footer-logo { font-family:var(--font-display); font-size:17px; font-weight:800; color:#FFFFFF; }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.4); }

  .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px; border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
  .whatsapp-btn:hover { transform:scale(1.1); }

  @media(max-width:900px){
    .cart-layout{grid-template-columns:1fr;padding:0 24px 60px;}
    .order-summary{position:static;}
    .checkout-grid{grid-template-columns:1fr;}
    .checkout-section{padding:0 24px 60px;}
    .page-header{padding:36px 24px 20px;}
    footer{padding:36px 24px;flex-direction:column;text-align:center;}
  }
  @media(max-width:500px){
    .cart-item{gap:12px;padding:14px;}
    .cart-item-image{width:64px;height:64px;font-size:28px;}
    .place-order-btn{font-size:14px;padding:14px;}
    .bank-details{padding:14px;}
    .bank-row{gap:8px;font-size:13px;}
    .copy-btn{min-width:44px;padding:6px 10px;}
  }
`;

type Step = "cart" | "checkout" | "success";

export default function CartPage() {
  const { cart, removeFromCart, updateQty, clearCart, total } = useCart();
  const contact = useContactConfig();
  const { t } = useSiteContent();
  const router = useRouter();
  const [step, setStep] = useState<Step>("cart");
  const [paymentMethod, setPaymentMethod] = useState<"bank" | "cod">("bank");
  const [receiptSelection, setReceiptSelection] = useState<ReceiptSelectionState>(EMPTY_RECEIPT_SELECTION);
  const receiptFile = receiptSelection.file;
  const receiptSelectError = receiptSelection.selectError;
  const receiptUiStatus = receiptStatusLabel(receiptSelection);
  const [paymentReference, setPaymentReference] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState("");
  const receiptInputId = useId();

  const clearReceiptSelection = () => {
    setReceiptSelection(clearReceiptSelectionState());
  };

  const onReceiptFileChosen = (file: File | null, reason: "pick" | "cancel" | "clear" = "pick") => {
    setOrderError("");
    setReceiptSelection((prev) =>
      applyReceiptFileChoice(prev, file, {
        reason,
        formatError: (code) =>
          t(
            code === "file_too_large"
              ? "bank_upload_err_too_large"
              : code === "empty_file"
                ? "bank_upload_err_empty"
                : "bank_upload_err_type",
            RECEIPT_ERROR_DEFAULTS[code]
          ),
      })
    );
  };

  const choosePaymentMethod = (next: "bank" | "cod") => {
    setPaymentMethod(next);
    if (next !== "bank") {
      // Optional receipt must not block COD after a leftover selection/rejection.
      clearReceiptSelection();
      setOrderError("");
    }
  };

  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "", city: "", postcode: "", notes: ""
  });

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<{code:string;type:string;value:number;discount_amount:number;message:string}|null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);

  const [productMap, setProductMap] = useState<Map<number, ProductFacts> | null>(null);
  const [classificationLoading, setClassificationLoading] = useState(true);
  const [classificationFetchError, setClassificationFetchError] = useState(false);
  const [digitalSupplyAcknowledged, setDigitalSupplyAcknowledged] = useState(false);
  const [ackError, setAckError] = useState("");
  const digitalAckRef = useRef<HTMLInputElement | null>(null);
  const digitalAckId = useId();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Mark cart page for WA float clearance (coupon / CTAs).
  useEffect(() => {
    document.body.setAttribute("data-cart-page", "1");
    return () => {
      document.body.removeAttribute("data-cart-page");
    };
  }, []);

  // Soft-keyboard heuristic: hide sticky Place Order while a field is focused
  // (visualViewport not available in all environments — documented limitation).
  useEffect(() => {
    if (step !== "checkout") {
      setKeyboardOpen(false);
      return;
    }
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        setKeyboardOpen(true);
      }
    };
    const onFocusOut = () => {
      window.setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
          setKeyboardOpen(false);
        }
      }, 50);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const map = new Map<number, ProductFacts>();
        for (const p of list) {
          const id = Number(p?.id);
          if (!Number.isInteger(id) || id <= 0) continue;
          map.set(id, {
            id,
            name: String(p.name || ""),
            category: p.category ?? null,
            stock: p.stock ?? null,
            active: p.active,
          });
        }
        setProductMap(map);
        setClassificationFetchError(false);
        setClassificationLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProductMap(null);
        setClassificationFetchError(true);
        setClassificationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  let classification: {
    ready: boolean;
    error: string | null;
    hasDigitalItems: boolean;
    hasPhysicalItems: boolean;
  };
  if (classificationLoading) {
    classification = {
      ready: false,
      error: null,
      hasDigitalItems: false,
      hasPhysicalItems: false,
    };
  } else if (classificationFetchError || !productMap) {
    classification = {
      ready: false,
      error: UNRESOLVED_CART_MSG,
      hasDigitalItems: false,
      hasPhysicalItems: false,
    };
  } else if (cart.length === 0) {
    classification = {
      ready: true,
      error: null,
      hasDigitalItems: false,
      hasPhysicalItems: false,
    };
  } else {
    let hasDigitalItems = false;
    let hasPhysicalItems = false;
    let unresolved = false;
    for (const item of cart) {
      const facts = productMap.get(Number(item.id));
      if (!facts) {
        unresolved = true;
        break;
      }
      if (isDigitalProduct(facts)) hasDigitalItems = true;
      else hasPhysicalItems = true;
    }
    classification = unresolved
      ? {
          ready: false,
          error: UNRESOLVED_CART_MSG,
          hasDigitalItems: false,
          hasPhysicalItems: false,
        }
      : {
          ready: true,
          error: null,
          hasDigitalItems,
          hasPhysicalItems,
        };
  }

  const effectiveDigitalAck =
    classification.hasDigitalItems && digitalSupplyAcknowledged;

  // Second payment option (stored/posted value always "cod") on every cart type
  // once classification is ready (digital-only, mixed, physical).
  // Pending strategy: keep the option HIDDEN until ready so a digital-only cart
  // never flashes "Cash on Delivery" then switches to the digital label.
  const showSecondPaymentOption = classification.ready === true;
  const digitalOnlyCart =
    classification.ready &&
    classification.hasDigitalItems &&
    !classification.hasPhysicalItems;
  const codOptionLabel = digitalOnlyCart
    ? t("cart_pay_cod_digital", "Pay on Delivery / Activation")
    : t("cart_pay_cod", "Cash on Delivery");
  const codOptionSub = digitalOnlyCart
    ? t(
        "cart_pay_cod_digital_sub",
        "Pay when your order is delivered or activated"
      )
    : t("cart_pay_cod_sub", "Pay when your order arrives");

  useEffect(() => {
    if (!showSecondPaymentOption && paymentMethod === "cod") {
      setPaymentMethod("bank");
    }
  }, [showSecondPaymentOption, paymentMethod]);

  // Signal sticky checkout bar for WA float hide (mobile checkout only).
  useEffect(() => {
    const stickyActive = step === "checkout" && !keyboardOpen;
    if (stickyActive) {
      document.body.classList.add("sticky-checkout-bar-visible");
      document.documentElement.setAttribute("data-sticky-checkout", "1");
    } else {
      document.body.classList.remove("sticky-checkout-bar-visible");
      document.documentElement.removeAttribute("data-sticky-checkout");
    }
    return () => {
      document.body.classList.remove("sticky-checkout-bar-visible");
      document.documentElement.removeAttribute("data-sticky-checkout");
    };
  }, [step, keyboardOpen]);

  const shipping =
    cart.length === 0
      ? 0
      : classification.ready
        ? cartShippingPounds({
            cartLength: cart.length,
            hasPhysicalItems: classification.hasPhysicalItems,
          })
        : PHYSICAL_SHIPPING_GBP;
  const subtotal = total;
  const vatAmount = Math.round(subtotal * 0.20 * 100) / 100;
  const discountAmount = couponApplied ? couponApplied.discount_amount : 0;
  const grandTotal = Math.round((subtotal + shipping + vatAmount - discountAmount) * 100) / 100;
  const classificationBlocked = !classification.ready || !!classification.error;

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponChecking(true); setCouponError(""); setCouponApplied(null);
    const res = await fetch("/api/coupons?action=validate", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ code: couponCode, cart_total: subtotal + shipping }) }).then(r=>r.json()).catch(()=>({}));
    if (res.valid) { setCouponApplied(res); setCouponError(""); }
    else { setCouponError(res.message || "Invalid coupon"); }
    setCouponChecking(false);
  };

  const handleOrder = async () => {
    if (cart.length === 0) return;
    setOrderError("");
    setAckError("");

    if (classificationBlocked) {
      setOrderError(classification.error || UNRESOLVED_CART_MSG);
      return;
    }

    if (classification.hasDigitalItems && !effectiveDigitalAck) {
      setAckError("Please confirm the digital supply acknowledgement before placing your order.");
      digitalAckRef.current?.focus();
      return;
    }

    const identity = normalizeOrderCustomerIdentity({
      customer_name: form.name,
      customer_email: form.email,
      customer_phone: form.phone,
    });
    if (!hasMeaningfulCustomerIdentity(identity)) {
      setOrderError(CUSTOMER_IDENTITY_REQUIRED_MSG);
      return;
    }

    // Rejected selection must not silently become "no receipt" on bank checkout.
    if (paymentMethod === "bank" && receiptSelectionBlocksBankSubmit(receiptSelection)) {
      setOrderError(
        receiptSelectError ||
          t(
            "bank_upload_err_type",
            RECEIPT_ERROR_DEFAULTS.unsupported_type
          )
      );
      return;
    }

    setPlacing(true);

    try {
      let receiptPath = "";
      if (receiptFile) {
        const uploaded = await uploadReceiptDuringCheckout(receiptFile);
        if (!uploaded.ok) {
          const kind = uploaded.kind;
          const key =
            kind === "unsupported_type"
              ? "bank_upload_err_type"
              : kind === "file_too_large"
                ? "bank_upload_err_too_large"
                : kind === "empty_file"
                  ? "bank_upload_err_empty"
                  : kind === "invalid_file"
                    ? "bank_upload_err_invalid"
                    : kind === "rate_limited"
                      ? "bank_upload_err_rate"
                      : kind === "gateway"
                        ? "bank_upload_err_gateway"
                        : kind === "network"
                          ? "bank_upload_err_network"
                          : kind === "file_read"
                            ? "bank_upload_err_read"
                            : "bank_upload_err_failed";
          setOrderError(t(key, RECEIPT_ERROR_DEFAULTS[kind]));
          setPlacing(false);
          return;
        }
        receiptPath = uploaded.path;
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: identity.customer_name,
          customer_email: identity.customer_email,
          customer_phone: identity.customer_phone,
          delivery_address: form.address,
          city: form.city,
          postcode: form.postcode,
          notes: form.notes,
          payment_method: paymentMethod,
          receipt_path: receiptPath,
          payment_reference: paymentReference || null,
          items: cart,
          total: grandTotal,
          coupon_code: couponApplied?.code || null,
          discount_amount: discountAmount,
          vat_amount: vatAmount,
          ...(classification.hasDigitalItems
            ? { digital_supply_acknowledgement: true }
            : {}),
        })
      });

      const data = await res.json();
      if (data.order_id) {
        const oid = data.order_id;

        // After success, server pricing/items are authoritative (ignore client/tampered figures).
        const serverItems: { id: number; name: string; price: number; qty: number }[] =
          Array.isArray(data.items) && data.items.length
            ? data.items.map((i: any) => ({
                id: Number(i.id),
                name: String(i.name),
                price: Number(i.price),
                qty: Number(i.qty),
              }))
            : cart.map((i) => ({
                id: i.id,
                name: i.name,
                price: i.price,
                qty: i.qty,
              }));
        const p = data.pricing || {};
        const authSubtotal = Number.isFinite(Number(p.subtotal)) ? Number(p.subtotal) : subtotal;
        const authShipping = Number.isFinite(Number(p.shipping)) ? Number(p.shipping) : shipping;
        const authVat = Number.isFinite(Number(p.vat_amount)) ? Number(p.vat_amount) : vatAmount;
        const authDiscount = Number.isFinite(Number(p.discount_amount))
          ? Number(p.discount_amount)
          : discountAmount;
        const authTotal = Number.isFinite(Number(p.total)) ? Number(p.total) : grandTotal;
        const authCouponCode =
          typeof p.coupon_code === "string" && p.coupon_code
            ? p.coupon_code
            : couponApplied?.code || null;
        const authCouponApplied = authCouponCode
          ? {
              code: authCouponCode,
              type: couponApplied?.type || "",
              value: couponApplied?.value ?? 0,
              discount_amount: authDiscount,
              message: couponApplied?.message || "",
            }
          : null;

        const itemsList = serverItems
          .map((i) => `• ${i.name} x${i.qty} — £${(i.price * i.qty).toFixed(2)}`)
          .join("\n");
        const fullAddress = [form.address, form.city, form.postcode].filter(Boolean).join(', ');
        const waMessage = [
          '🛍️ *NEW ORDER — firestick4uk.com*',
          '',
          `📋 *Order ID:* ${oid}`,
          `👤 *Name:* ${identity.customer_name}`,
          `📧 *Email:* ${identity.customer_email}`,
          `📱 *Phone:* ${identity.customer_phone}`,
          `📍 *Address:* ${fullAddress}`,
          form.notes ? `📝 *Notes:* ${form.notes}` : null,
          '',
          '🛒 *Items:*',
          itemsList,
          '',
          `💰 *Subtotal:* £${authSubtotal.toFixed(2)}`,
          `🚚 *Shipping:* ${authShipping === 0 ? 'Free' : '£' + authShipping.toFixed(2)}`,
          `🧾 *VAT (20%):* £${authVat.toFixed(2)}`,
          authCouponApplied ? `🎟️ *Discount (${authCouponApplied.code}):* -£${authDiscount.toFixed(2)}` : null,
          `💵 *Total: £${authTotal.toFixed(2)}*`,
          '',
          `💳 *Payment:* ${paymentMethod === 'bank' ? 'Bank Transfer' : 'Cash on Delivery'}`,
          paymentMethod === 'bank' && receiptPath ? '✅ Payment receipt uploaded' : '',
          paymentReference ? `🏷️ *Payment Reference:* ${paymentReference}` : '💳 *Payment Reference:* Not provided',
          '',
          '📦 *Status:* Pending ⏳',
          '— Sent from firestick4uk.com',
        ].filter(Boolean).join('\n');

        const normalizedForm = {
          ...form,
          name: identity.customer_name,
          email: identity.customer_email,
          phone: identity.customer_phone,
        };

        sessionStorage.setItem('orderSuccess', JSON.stringify({
          orderId: oid, items: serverItems, subtotal: authSubtotal, shipping: authShipping, vatAmount: authVat,
          discountAmount: authDiscount, grandTotal: authTotal, couponApplied: authCouponApplied, form: normalizedForm, paymentMethod, waMessage,
          digitalSupplyAcknowledged: classification.hasDigitalItems,
        }));
        clearCart();
        router.push("/cart/success");
      } else {
        setOrderError(data.error?.includes("connect") || data.error?.includes("timeout")
          ? t("cart_err_unavailable", "Our system is temporarily unavailable. Please try again in a moment.")
          : (data.error || t("cart_err_failed", "Order could not be placed. Please try again or contact us on WhatsApp or Telegram.")));
      }
    } catch {
      setOrderError(t("cart_err_network", "Network error. Please check your connection and try again."));
    }
    setPlacing(false);
  };

  return (
    <>
      <style>{navStyles}</style>

      <Navbar cta="none" />

      <div className="page-wrapper" data-clarity-mask="True">
        <div className="page-header">
          <div className="section-tag">✦ {step === "cart" ? t("cart_tag", "Your Cart") : t("checkout_tag", "Checkout")}</div>
          <h1 className="page-title">{step === "cart" ? t("cart_title", "My Cart") : t("checkout_title", "Complete Order")}</h1>
          <div className="checkout-steps" aria-label="Checkout progress" data-checkout-steps="1">
            <span className={step === "cart" ? "step-current" : "step-done"}>Cart</span>
            <span aria-hidden="true">→</span>
            <span className={step === "checkout" ? "step-current" : step === "success" ? "step-done" : ""}>Checkout</span>
            <span aria-hidden="true">→</span>
            <span className={step === "success" ? "step-current" : ""}>Done</span>
          </div>
        </div>

        {step === "cart" && (
          <div className="cart-layout">
            <div className="cart-items">
              {cart.length === 0 ? (
                <div className="cart-empty">
                  <span className="cart-empty-icon">🛒</span>
                  <h3>{t("cart_empty_title", "Your cart is empty")}</h3>
                  <p>{t("cart_empty_body", "Add some products to get started!")}</p>
                  <a href={t("cart_empty_link", "/products")} className="btn-primary">{t("cart_empty_btn", "Browse Products")}</a>
                </div>
              ) : (
                cart.map(item => (
                  <div className="cart-item" key={item.id}>
                    <div className="cart-item-image">
                      {item.image ? (
                        <img src={item.image} alt="" loading="lazy" />
                      ) : (
                        "📦"
                      )}
                    </div>
                    <div className="cart-item-details">
                      <div className="cart-item-name">{item.name}</div>
                      <div className="cart-item-price">£{(item.price * item.qty).toFixed(2)}</div>
                    </div>
                    <div className="cart-item-actions">
                      <div className="qty-control">
                        <button type="button" className="qty-btn" aria-label="Decrease quantity" onClick={() => updateQty(item.id, -1)}>−</button>
                        <span className="qty-num">{item.qty}</span>
                        <button type="button" className="qty-btn" aria-label="Increase quantity" onClick={() => updateQty(item.id, 1)}>+</button>
                      </div>
                      <button className="remove-btn" onClick={() => removeFromCart(item.id)}>✕ {t("cart_remove", "Remove")}</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="order-summary">
              <div className="summary-header"><h3>{t("cart_summary", "Order Summary")}</h3></div>
              <div className="summary-body">
                <div className="summary-row"><span>{t("cart_subtotal", "Subtotal")}</span><span>£{subtotal.toFixed(2)}</span></div>
                <div className="summary-row"><span>{t("cart_shipping", "Shipping")}</span><span>{shipping === 0 ? t("cart_shipping_free", "Free") : `£${shipping.toFixed(2)}`}</span></div>
                <div className="summary-row"><span>{t("cart_vat_label", "VAT (20%)")}</span><span>£{vatAmount.toFixed(2)}</span></div>
                {couponApplied && <div className="summary-row" style={{color:"#00c864"}}><span>{t("cart_discount", "Discount")} ({couponApplied.code})</span><span>-£{discountAmount.toFixed(2)}</span></div>}
                <hr className="summary-divider" />
                <div className="summary-row summary-total"><span>{t("cart_total", "Total")}</span><span>£{grandTotal.toFixed(2)}</span></div>
              </div>
              {/* Coupon input */}
              <div style={{padding:"0 20px 16px"}}>
                <div style={{display:"flex",gap:8,marginBottom:6}} className="coupon-row">
                  <input style={{flex:1,background:"rgba(139,0,255,0.08)",border:"1px solid rgba(139,0,255,0.25)",borderRadius:8,padding:"8px 12px",color:"white",fontSize:13,outline:"none"}} placeholder={t("cart_coupon_ph", "Coupon code")} value={couponCode} onChange={e=>setCouponCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&applyCoupon()} />
                  <button type="button" style={{background:"rgba(139,0,255,0.2)",border:"1px solid rgba(139,0,255,0.4)",color:"#5B21B6",padding:"8px 16px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,whiteSpace:"nowrap",minHeight:44,minWidth:44}} onClick={applyCoupon} disabled={couponChecking}>{couponChecking?"...":t("cart_apply", "Apply")}</button>
                </div>
                {couponApplied && <div style={{fontSize:12,color:"#00c864"}}>✅ {couponApplied.message} — Save £{discountAmount.toFixed(2)}</div>}
                {couponError && <div style={{fontSize:12,color:"#ff6666"}}>❌ {couponError}</div>}
              </div>
              <a
                className="cart-help-wa"
                href={contact.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-cart-help-wa="1"
              >
                💬 {t("cart_wa_btn", "WhatsApp Us")}
              </a>
              <button
                className={`checkout-btn${classificationLoading ? " preparing" : ""}`}
                disabled={cart.length === 0 || classificationBlocked}
                aria-busy={classificationLoading ? true : undefined}
                onClick={() => setStep("checkout")}
              >
                {classificationLoading
                  ? "Preparing checkout..."
                  : t("cart_checkout_btn", "Proceed to Checkout →")}
              </button>
              {classification.error && cart.length > 0 && (
                <div style={{padding:"0 20px 16px",fontSize:12,color:"#DC2626",lineHeight:1.5}}>
                  {classification.error}
                </div>
              )}
            </div>
          </div>
        )}

        {step === "checkout" && (
          <div className="checkout-section">
            <div className="checkout-grid">
              <div>
                <div className="form-section">
                  <h3>{t("cart_details", "Your Details")}</h3>
                  {[
                    {label: t("cart_lbl_name", "Full Name"), key:"name", type:"text", placeholder:"John Smith", name:"name", autoComplete:"name", inputMode: undefined as string | undefined, autoCapitalize:"words", enterKeyHint:"next"},
                    {label: t("cart_lbl_email", "Email Address"), key:"email", type:"email", placeholder:"john@example.com", name:"email", autoComplete:"email", inputMode:"email", autoCapitalize:"off", enterKeyHint:"next"},
                    {label: t("cart_lbl_phone", "WhatsApp / Phone"), key:"phone", type:"tel", placeholder:contact.phone, name:"tel", autoComplete:"tel", inputMode:"tel", autoCapitalize:"off", enterKeyHint:"next"},
                    {label: t("cart_lbl_address", "Delivery Address"), key:"address", type:"text", placeholder:"123 High Street", name:"street-address", autoComplete:"street-address", inputMode: undefined, autoCapitalize:"sentences", enterKeyHint:"next"},
                  ].map(f => (
                    <div className="form-group" key={f.key}>
                      <label htmlFor={`checkout-${f.key}`}>{f.label}</label>
                      <input
                        id={`checkout-${f.key}`}
                        type={f.type}
                        name={f.name}
                        autoComplete={f.autoComplete}
                        inputMode={f.inputMode as "email" | "tel" | undefined}
                        autoCapitalize={f.autoCapitalize}
                        enterKeyHint={f.enterKeyHint as "next" | "done" | undefined}
                        placeholder={f.placeholder}
                        value={(form as any)[f.key]}
                        onChange={e => setForm({...form, [f.key]: e.target.value})}
                      />
                    </div>
                  ))}
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px"}}>
                    <div className="form-group">
                      <label htmlFor="checkout-city">{t("cart_lbl_city", "City")}</label>
                      <input
                        id="checkout-city"
                        type="text"
                        name="address-level2"
                        autoComplete="address-level2"
                        autoCapitalize="words"
                        enterKeyHint="next"
                        placeholder="London"
                        value={form.city}
                        onChange={e => setForm({...form, city: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="checkout-postcode">{t("cart_lbl_postcode", "Postcode")}</label>
                      <input
                        id="checkout-postcode"
                        type="text"
                        name="postal-code"
                        autoComplete="postal-code"
                        autoCapitalize="characters"
                        enterKeyHint="next"
                        placeholder="SW1A 1AA"
                        value={form.postcode}
                        onChange={e => setForm({...form, postcode: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="checkout-notes">{t("cart_lbl_notes", "Order Notes (Optional)")}</label>
                    <textarea
                      id="checkout-notes"
                      name="order-notes"
                      enterKeyHint="done"
                      placeholder="Any special instructions..."
                      value={form.notes}
                      onChange={e => setForm({...form, notes: e.target.value})}
                    />
                  </div>
                  <input type="hidden" name="country" autoComplete="country" value="GB" readOnly aria-hidden="true" />
                </div>
              </div>

              <div>
                <div className="form-section">
                  <h3>{t("cart_pay_heading", "Payment Method")}</h3>
                  <div className="payment-options" role="radiogroup" aria-label={t("cart_pay_heading", "Payment Method")}>
                    {[
                      {val:"bank" as const, label: t("cart_pay_bank", "Bank Transfer"), sub: t("cart_pay_bank_sub", "Transfer to our UK bank & upload receipt")},
                      ...(showSecondPaymentOption
                        ? [{val:"cod" as const, label: codOptionLabel, sub: codOptionSub}]
                        : []),
                    ].map(p => (
                      <label
                        key={p.val}
                        className={`payment-option ${paymentMethod === p.val ? "selected" : ""}`}
                        data-payment-option={p.val}
                        data-digital-only={digitalOnlyCart ? "1" : "0"}
                      >
                        <input
                          type="radio"
                          name="payment_method"
                          value={p.val}
                          checked={paymentMethod === p.val}
                          onChange={() => choosePaymentMethod(p.val)}
                          aria-label={p.label}
                        />
                        <div>
                          <div className="payment-option-label">{p.label}</div>
                          <div className="payment-option-sub">{p.sub}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {paymentMethod === "bank" && (
                    <>
                      <div className="bank-details" data-bank-details="1">
                        <h4>{t("bank_heading", "Bank Account Details")}</h4>
                        <div className="bank-row bank-row--name">
                          <span>{t("bank_lbl_name", "Account Name")}</span>
                          <span className="bank-row-value">
                            <span className="bank-row-value__text bank-row-value__text--wrap">{t("bank_account_name", "Robert George Bennett")}</span>
                            <CopyButton value={t("bank_account_name", "Robert George Bennett")} label="Copy" />
                          </span>
                        </div>
                        <div className="bank-row bank-row--sort">
                          <span>{t("bank_lbl_sort", "Sort Code")}</span>
                          <span className="bank-row-value">
                            <span className="bank-row-value__text bank-row-value__text--nowrap">{t("bank_sort_code", "60-84-07")}</span>
                            <CopyButton value={t("bank_sort_code", "60-84-07")} label="Copy" />
                          </span>
                        </div>
                        <div className="bank-row bank-row--account">
                          <span>{t("bank_lbl_no", "Account No.")}</span>
                          <span className="bank-row-value">
                            <span className="bank-row-value__text bank-row-value__text--nowrap">{t("bank_account_no", "70745518")}</span>
                            <CopyButton value={t("bank_account_no", "70745518")} label="Copy" />
                          </span>
                        </div>
                        <div className="bank-row"><span>{t("bank_lbl_ref", "Reference")}</span><span>{t("bank_reference_value", "Your name only")}</span></div>
                        <div className="bank-row bank-row--amount">
                          <span>{t("bank_lbl_amount", "Amount")}</span>
                          <span className="bank-row-value">
                            <span className="bank-row-value__text bank-row-value__text--nowrap">£{grandTotal.toFixed(2)}</span>
                            <CopyButton value={grandTotal.toFixed(2)} label="Copy" />
                          </span>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>{t("bank_upload_label", "Upload Payment Receipt (Optional)")}</label>
                        <div className={`upload-area ${receiptUiStatus !== "empty" ? "has-file" : ""}`}>
                          <span className="upload-icon">📎</span>
                          <div className="upload-text">
                            {receiptUiStatus === "selected" && receiptFile ? (
                              <>
                                <strong>{receiptFile.name}</strong>
                                <div className="upload-hint">
                                  {t(
                                    "bank_upload_selected",
                                    "Selected — not uploaded yet. It uploads when you place the order."
                                  )}
                                </div>
                              </>
                            ) : receiptUiStatus === "rejected" ? (
                              <>
                                <strong>{receiptSelection.rejectedName || "receipt"}</strong>
                                <div className="upload-hint">
                                  {t(
                                    "bank_upload_rejected",
                                    "Not accepted — choose another file or remove to continue without a receipt."
                                  )}
                                </div>
                              </>
                            ) : (
                              t("bank_upload_text", "Click to upload your receipt")
                            )}
                          </div>
                          {receiptUiStatus === "empty" ? (
                            <input
                              id={receiptInputId}
                              className="upload-overlay"
                              type="file"
                              accept={RECEIPT_ACCEPT_ATTR}
                              onChange={(e) => {
                                const next = e.target.files?.[0] || null;
                                // Empty files list after open usually means cancel — do not clear state.
                                onReceiptFileChosen(next, next ? "pick" : "cancel");
                                e.target.value = "";
                              }}
                            />
                          ) : (
                            <div className="upload-selected-actions">
                              <label htmlFor={`${receiptInputId}-replace`}>
                                {t("bank_upload_replace", "Choose another file")}
                                <input
                                  id={`${receiptInputId}-replace`}
                                  className="upload-replace"
                                  type="file"
                                  accept={RECEIPT_ACCEPT_ATTR}
                                  onChange={(e) => {
                                    const next = e.target.files?.[0] || null;
                                    onReceiptFileChosen(next, next ? "pick" : "cancel");
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  onReceiptFileChosen(null, "clear");
                                  setOrderError("");
                                }}
                              >
                                {t("bank_upload_remove", "Remove receipt")}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="upload-hint">
                          {t("bank_upload_help", RECEIPT_HELP_DEFAULT)}
                        </div>
                        {receiptSelectError ? (
                          <div style={{ marginTop: 8, fontSize: 12, color: "#DC2626", lineHeight: 1.5 }}>
                            {receiptSelectError}
                          </div>
                        ) : null}
                      </div>
                      <div className="form-group">
                        <label>{t("bank_ref_input_label", "Payment Reference")}</label>
                        <input
                          type="text"
                          placeholder={t("bank_ref_ph", "Enter your first name as payment reference")}
                          value={paymentReference}
                          onChange={e => setPaymentReference(e.target.value)}
                        />
                        <div style={{fontSize:12,color:"#666666",marginTop:6,lineHeight:1.5}}>
                          💡 {t("bank_ref_hint", "Use your first name as the payment reference when making the bank transfer — this helps us identify your payment quickly!")}
                        </div>
                      </div>
                    </>
                  )}

                  {paymentMethod === "cod" && (
                    <div className="bank-details" data-cod-note="1">
                      <h4>
                        {digitalOnlyCart
                          ? t("cart_pay_cod_digital", "Pay on Delivery / Activation")
                          : t("cart_cod_heading", "Cash on Delivery")}
                      </h4>
                      <div className="bank-row"><span>{t("cart_amount_due", "Amount Due")}</span><span>£{grandTotal.toFixed(2)}</span></div>
                    </div>
                  )}

                  <div className="summary-body" style={{background:"rgba(139,0,255,0.05)", borderRadius:"12px", marginBottom:"16px"}}>
                    <div className="summary-row"><span>{t("cart_subtotal", "Subtotal")}</span><span>£{subtotal.toFixed(2)}</span></div>
                    <div className="summary-row"><span>{t("cart_shipping", "Shipping")}</span><span>{shipping === 0 ? t("cart_shipping_free", "Free") : `£${shipping.toFixed(2)}`}</span></div>
                    <div className="summary-row"><span>{t("cart_vat_label", "VAT (20%)")}</span><span>£{vatAmount.toFixed(2)}</span></div>
                    {couponApplied && <div className="summary-row" style={{color:"#00c864"}}><span>{t("cart_discount", "Discount")} ({couponApplied.code})</span><span>-£{discountAmount.toFixed(2)}</span></div>}
                    <hr className="summary-divider" />
                    <div className="summary-row summary-total"><span>{t("cart_total", "Total")}</span><span>£{grandTotal.toFixed(2)}</span></div>
                  </div>
                  <div style={{background:"rgba(91,33,182,0.08)",border:"1px solid rgba(91,33,182,0.2)",borderRadius:"12px",padding:"12px 14px",fontSize:"13px",lineHeight:1.6,color:"#444444",marginBottom:"16px"}}>
                    {t("cart_activation", "Subscription services are active within 1 hour of payment confirmation.")}
                  </div>

                  {classification.hasDigitalItems && (
                    <div className="digital-ack">
                      <div className="digital-ack-row">
                        <input
                          ref={digitalAckRef}
                          id={digitalAckId}
                          type="checkbox"
                          checked={digitalSupplyAcknowledged}
                          onChange={(e) => {
                            setDigitalSupplyAcknowledged(e.target.checked);
                            if (e.target.checked) setAckError("");
                          }}
                        />
                        <label htmlFor={digitalAckId}>{DIGITAL_SUPPLY_ACK_TEXT}</label>
                      </div>
                      {ackError ? <div className="digital-ack-error">{ackError}</div> : null}
                    </div>
                  )}

                  {classification.error && (
                    <div style={{marginBottom:"12px",fontSize:"13px",color:"#DC2626",lineHeight:1.5}}>
                      {classification.error}
                    </div>
                  )}

                  <p className="checkout-policy-links">
                    Please review our{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>,{" "}
                    <a href="/refund-policy" target="_blank" rel="noopener noreferrer">Refund Policy</a>
                    {" "}and{" "}
                    <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                    {" "}before placing your order.
                  </p>

                  <button
                    className="place-order-btn place-order-btn--inline"
                    data-place-order="inline"
                    disabled={placing || cart.length === 0 || classificationBlocked}
                    onClick={handleOrder}
                  >
                    {placing ? t("cart_placing", "Placing Order...") : t("cart_place_order", "Place Order →")}
                  </button>
                  {orderError && (
                    <div style={{marginTop:"14px",background:"rgba(255,68,68,0.1)",border:"1px solid rgba(255,68,68,0.3)",borderRadius:"12px",padding:"14px 16px"}}>
                      <p style={{color:"#ff8888",fontSize:"13px",marginBottom:"10px"}}>⚠️ {orderError}</p>
                      <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
                        <button onClick={handleOrder} style={{background:"rgba(255,68,68,0.2)",border:"1px solid rgba(255,68,68,0.4)",color:"#ff8888",padding:"7px 16px",borderRadius:"8px",fontSize:"12px",cursor:"pointer"}}>
                          🔄 {t("cart_retry", "Retry")}
                        </button>
                        <a href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer" style={{background:"rgba(37,211,102,0.15)",border:"1px solid rgba(37,211,102,0.3)",color:"#25d366",padding:"7px 16px",borderRadius:"8px",fontSize:"12px",textDecoration:"none"}}>
                          💬 {t("cart_wa_btn", "WhatsApp Us")}
                        </a>
                        <a href={contact.telegramUrl} target="_blank" rel="noopener noreferrer" style={{background:"rgba(34,158,217,0.15)",border:"1px solid rgba(34,158,217,0.3)",color:"#229ED9",padding:"7px 16px",borderRadius:"8px",fontSize:"12px",textDecoration:"none"}}>
                          ✈️ Telegram {contact.telegram}
                        </a>
                      </div>
                    </div>
                  )}
                  <button onClick={() => setStep("cart")} style={{width:"100%", background:"none", border:"none", color:"rgba(255,255,255,0.4)", fontSize:"13px", marginTop:"12px", cursor:"pointer"}}>
                    {t("cart_back", "← Back to Cart")}
                  </button>
                </div>
              </div>
            </div>
            <div
              className={`sticky-place-order${keyboardOpen ? " is-keyboard-hidden" : ""}`}
              data-sticky-place-order="1"
              role="region"
              aria-label="Place order"
            >
              <div className="sticky-place-order__total">
                Total <strong>£{grandTotal.toFixed(2)}</strong>
              </div>
              <button
                className="place-order-btn"
                data-place-order="sticky"
                disabled={placing || cart.length === 0 || classificationBlocked}
                onClick={handleOrder}
              >
                {placing ? t("cart_placing", "Placing Order...") : t("cart_place_order", "Place Order →")}
              </button>
            </div>
          </div>
        )}
        <Footer />
      </div>
    </>
  );
}