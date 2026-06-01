import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "FAQ — Firestick4UK | Frequently Asked Questions",
  description: "Find answers to common questions about ordering, delivery, Firestick setup, IPTV subscriptions and more.",
  openGraph: { title: "FAQ — Firestick4UK", description: "Answers to common questions about ordering and streaming.", url: "https://firestick4uk.com/faq", siteName: "Firestick4UK", type: "website" },
};
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
