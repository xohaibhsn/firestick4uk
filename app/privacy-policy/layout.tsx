import type { Metadata } from "next";
import { defaultSocialImages, FALLBACK_OG_IMAGE } from "@/lib/socialMetadata";

const social = defaultSocialImages(FALLBACK_OG_IMAGE);

export const metadata: Metadata = {
  title: "Privacy Policy — Firestick4UK",
  description: "Firestick4UK Privacy Policy. Learn how we collect, use, and protect your personal data in line with UK GDPR.",
  openGraph: {
    title: "Privacy Policy — Firestick4UK",
    url: "https://firestick4uk.com/privacy-policy",
    siteName: "Firestick4UK",
    type: "website",
    images: social.images,
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy — Firestick4UK",
    images: social.twitterImages,
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
