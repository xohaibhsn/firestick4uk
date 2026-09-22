import type { Metadata } from "next";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { defaultSocialImages } from "@/lib/socialMetadata";
import { getDefaultOgImageFromSettings } from "@/lib/socialMetadataServer";

export async function generateMetadata(): Promise<Metadata> {
  const social = defaultSocialImages(await getDefaultOgImageFromSettings());

  return {
    title: "About Us — Firestick4UK | UK Streaming Specialists",
    description:
      "Learn about Firestick4UK — a UK-based team dedicated to providing premium streaming devices and Firestick Subscriptions at fair prices.",
    alternates: { canonical: "https://firestick4uk.com/about" },
    openGraph: {
      title: "About Us — Firestick4UK",
      description: "UK-based streaming specialists.",
      url: "https://firestick4uk.com/about",
      siteName: "Firestick4UK",
      type: "website",
      images: social.images,
    },
    twitter: {
      card: "summary_large_image",
      title: "About Us — Firestick4UK",
      description: "UK-based streaming specialists.",
      images: social.twitterImages,
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://firestick4uk.com" },
          { name: "About", url: "https://firestick4uk.com/about" },
        ]}
      />
      {children}
    </>
  );
}
