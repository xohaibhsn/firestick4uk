import type { Metadata } from "next";
import { defaultSocialImages } from "@/lib/socialMetadata";
import { getDefaultOgImageFromSettings } from "@/lib/socialMetadataServer";

export async function generateMetadata(): Promise<Metadata> {
  const social = defaultSocialImages(await getDefaultOgImageFromSettings());

  return {
    title: "Refund Policy — Firestick4UK",
    description:
      "Firestick4UK Refund & Return Policy. 7-day returns on physical devices. Full details on how to request a refund.",
    openGraph: {
      title: "Refund Policy — Firestick4UK",
      url: "https://firestick4uk.com/refund-policy",
      siteName: "Firestick4UK",
      type: "website",
      images: social.images,
    },
    twitter: {
      card: "summary_large_image",
      title: "Refund Policy — Firestick4UK",
      images: social.twitterImages,
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
