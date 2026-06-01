import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Terms & Conditions — Firestick4UK",
  description: "Read the Terms & Conditions for Firestick4UK. Covers orders, payments, refunds, and your rights as a UK customer.",
  openGraph: { title: "Terms & Conditions — Firestick4UK", url: "https://firestick4uk.com/terms", siteName: "Firestick4UK", type: "website" },
};
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
