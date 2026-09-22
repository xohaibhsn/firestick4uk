import type { Metadata } from "next";
import { defaultSocialImages, FALLBACK_OG_IMAGE } from "@/lib/socialMetadata";

const social = defaultSocialImages(FALLBACK_OG_IMAGE);

export const metadata: Metadata = {
  title: "Blog — Firestick4UK | Streaming Tips & Guides",
  description: "Read our latest guides, tips and news about Firestick, streaming services, Android boxes and live TV in the UK.",
  alternates: { canonical: "https://firestick4uk.com/blog" },
  openGraph: {
    title: "Blog — Firestick4UK | Streaming Tips & Guides",
    description: "Read our latest guides, tips and news about Firestick, streaming services, Android boxes and live TV in the UK.",
    url: "https://firestick4uk.com/blog",
    siteName: "Firestick4UK",
    type: "website",
    images: social.images,
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog — Firestick4UK | Streaming Tips & Guides",
    description: "Read our latest guides, tips and news about Firestick, streaming services, Android boxes and live TV in the UK.",
    images: social.twitterImages,
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
