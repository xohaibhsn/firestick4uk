import type { Metadata } from "next";
import { defaultSocialImages, FALLBACK_OG_IMAGE } from "@/lib/socialMetadata";

const social = defaultSocialImages(FALLBACK_OG_IMAGE);

export const metadata: Metadata = {
  title: "Terms & Conditions — Firestick4UK",
  description: "Read the Terms & Conditions for Firestick4UK. Covers orders, payments, refunds, and your rights as a UK customer.",
  openGraph: {
    title: "Terms & Conditions — Firestick4UK",
    url: "https://firestick4uk.com/terms",
    siteName: "Firestick4UK",
    type: "website",
    images: social.images,
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms & Conditions — Firestick4UK",
    images: social.twitterImages,
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
