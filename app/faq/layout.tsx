import type { Metadata } from "next";
import { defaultSocialImages } from "@/lib/socialMetadata";
import { getDefaultOgImageFromSettings } from "@/lib/socialMetadataServer";

export async function generateMetadata(): Promise<Metadata> {
  const social = defaultSocialImages(await getDefaultOgImageFromSettings());

  return {
    title: "FAQ — Firestick4UK | Frequently Asked Questions",
    description:
      "Find answers to common questions about ordering, delivery, Firestick setup, Firestick Subscriptions and more.",
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
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
