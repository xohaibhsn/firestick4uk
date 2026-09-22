import type { Metadata } from "next";
import { defaultSocialImages, FALLBACK_OG_IMAGE } from "@/lib/socialMetadata";

const social = defaultSocialImages(FALLBACK_OG_IMAGE);

export const metadata: Metadata = {
  title: "Products — Firestick4UK | Streaming Devices UK",
  description: "Browse our full range of Firestick devices, Firestick Subscription plans, and Android boxes. Best prices in the UK.",
  alternates: { canonical: "https://firestick4uk.com/products" },
  openGraph: {
    title: "Products — Firestick4UK | Streaming Devices UK",
    description: "Browse our full range of Firestick devices, Firestick Subscription plans, and Android boxes. Best prices in the UK.",
    url: "https://firestick4uk.com/products",
    siteName: "Firestick4UK",
    type: "website",
    images: social.images,
  },
  twitter: {
    card: "summary_large_image",
    title: "Products — Firestick4UK | Streaming Devices UK",
    description: "Browse our full range of Firestick devices, Firestick Subscription plans, and Android boxes. Best prices in the UK.",
    images: social.twitterImages,
  },
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
