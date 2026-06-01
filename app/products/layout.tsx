import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Products — Firestick4UK | IPTV & Streaming Devices UK",
  description: "Browse our full range of Firestick devices, IPTV subscription plans, and Android boxes. Best prices in the UK.",
  openGraph: {
    title: "Products — Firestick4UK | IPTV & Streaming Devices UK",
    description: "Browse our full range of Firestick devices, IPTV subscription plans, and Android boxes. Best prices in the UK.",
    url: "https://firestick4uk.com/products",
    siteName: "Firestick4UK",
    type: "website",
  },
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
