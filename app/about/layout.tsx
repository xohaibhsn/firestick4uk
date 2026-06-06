import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "About Us — Firestick4UK | UK Streaming Specialists",
  description: "Learn about Firestick4UK — a UK-based team dedicated to providing premium streaming devices and Firestick Subscriptions at fair prices.",
  openGraph: { title: "About Us — Firestick4UK", description: "UK-based streaming specialists.", url: "https://firestick4uk.com/about", siteName: "Firestick4UK", type: "website" },
};
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
