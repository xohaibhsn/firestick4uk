import type { Metadata } from "next";
import { defaultSocialImages, FALLBACK_OG_IMAGE } from "@/lib/socialMetadata";

const social = defaultSocialImages(FALLBACK_OG_IMAGE);

export const metadata: Metadata = {
  title: "Cart & Checkout — Firestick4UK",
  description: "Complete your order for Firestick devices, Streaming Plans and Android boxes. Secure checkout with bank transfer or cash on delivery.",
  openGraph: {
    title: "Cart & Checkout — Firestick4UK",
    description: "Complete your order for Firestick devices, Streaming Plans and Android boxes. Secure checkout.",
    url: "https://firestick4uk.com/cart",
    siteName: "Firestick4UK",
    type: "website",
    images: social.images,
  },
  twitter: {
    card: "summary_large_image",
    title: "Cart & Checkout — Firestick4UK",
    description: "Complete your order for Firestick devices, Streaming Plans and Android boxes. Secure checkout.",
    images: social.twitterImages,
  },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
