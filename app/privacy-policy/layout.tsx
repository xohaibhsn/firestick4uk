import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Privacy Policy — Firestick4UK",
  description: "Firestick4UK Privacy Policy. Learn how we collect, use, and protect your personal data in line with UK GDPR.",
  openGraph: { title: "Privacy Policy — Firestick4UK", url: "https://firestick4uk.com/privacy-policy", siteName: "Firestick4UK", type: "website" },
};
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
