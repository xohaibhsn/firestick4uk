import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Track Your Order — Firestick4UK",
  description: "Enter your Order ID to track your Firestick4UK order in real time. Check payment, dispatch and delivery status.",
  openGraph: { title: "Track Your Order — Firestick4UK", description: "Real-time order tracking for Firestick4UK customers.", url: "https://firestick4uk.com/order-tracking", siteName: "Firestick4UK", type: "website" },
};
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
