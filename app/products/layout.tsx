import type { Metadata } from "next";
import { defaultSocialImages } from "@/lib/socialMetadata";
import { getDefaultOgImageFromSettings } from "@/lib/socialMetadataServer";

export async function generateMetadata(): Promise<Metadata> {
  const social = defaultSocialImages(await getDefaultOgImageFromSettings());

  return {
    title: "Products — Firestick4UK | Streaming Devices UK",
    description:
      "Browse our full range of Firestick devices, Firestick Subscription plans, and Android boxes. Best prices in the UK.",
    alternates: { canonical: "https://firestick4uk.com/products" },
    openGraph: {
      title: "Products — Firestick4UK | Streaming Devices UK",
      description:
        "Browse our full range of Firestick devices, Firestick Subscription plans, and Android boxes. Best prices in the UK.",
      url: "https://firestick4uk.com/products",
      siteName: "Firestick4UK",
      type: "website",
      images: social.images,
    },
    twitter: {
      card: "summary_large_image",
      title: "Products — Firestick4UK | Streaming Devices UK",
      description:
        "Browse our full range of Firestick devices, Firestick Subscription plans, and Android boxes. Best prices in the UK.",
      images: social.twitterImages,
    },
  };
}

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
