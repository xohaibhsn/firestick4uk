import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Refund Policy — Firestick4UK",
  description: "Firestick4UK Refund & Return Policy. 7-day returns on physical devices. Full details on how to request a refund.",
  openGraph: { title: "Refund Policy — Firestick4UK", url: "https://firestick4uk.com/refund-policy", siteName: "Firestick4UK", type: "website" },
};
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
