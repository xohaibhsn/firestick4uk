import type { Metadata } from "next";
import { defaultSocialImages, FALLBACK_OG_IMAGE } from "@/lib/socialMetadata";

const social = defaultSocialImages(FALLBACK_OG_IMAGE);

export const metadata: Metadata = {
  title: "FAQ — Firestick4UK | Frequently Asked Questions",
  description: "Find answers to common questions about ordering, delivery, Firestick setup, Firestick Subscriptions and more.",
  alternates: { canonical: "https://firestick4uk.com/faq" },
  openGraph: {
    title: "FAQ — Firestick4UK",
    description: "Answers to common questions about ordering and streaming.",
    url: "https://firestick4uk.com/faq",
    siteName: "Firestick4UK",
    type: "website",
    images: social.images,
  },
  twitter: {
    card: "summary_large_image",
    title: "FAQ — Firestick4UK",
    description: "Answers to common questions about ordering and streaming.",
    images: social.twitterImages,
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
