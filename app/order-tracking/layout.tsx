import type { Metadata } from "next";
import { defaultSocialImages } from "@/lib/socialMetadata";
import { getDefaultOgImageFromSettings } from "@/lib/socialMetadataServer";

export async function generateMetadata(): Promise<Metadata> {
  const social = defaultSocialImages(await getDefaultOgImageFromSettings());

  return {
    title: "Track Your Order — Firestick4UK",
    description:
      "Enter your Order ID to track your Firestick4UK order in real time. Check payment, dispatch and delivery status.",
    openGraph: {
      title: "Track Your Order — Firestick4UK",
      description: "Real-time order tracking for Firestick4UK customers.",
      url: "https://firestick4uk.com/order-tracking",
      siteName: "Firestick4UK",
      type: "website",
      images: social.images,
    },
    twitter: {
      card: "summary_large_image",
      title: "Track Your Order — Firestick4UK",
      description: "Real-time order tracking for Firestick4UK customers.",
      images: social.twitterImages,
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
