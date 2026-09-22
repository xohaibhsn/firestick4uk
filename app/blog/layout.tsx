import type { Metadata } from "next";
import { defaultSocialImages } from "@/lib/socialMetadata";
import { getDefaultOgImageFromSettings } from "@/lib/socialMetadataServer";

export async function generateMetadata(): Promise<Metadata> {
  const social = defaultSocialImages(await getDefaultOgImageFromSettings());

  return {
    title: "Blog — Firestick4UK | Streaming Tips & Guides",
    description:
      "Read our latest guides, tips and news about Firestick, streaming services, Android boxes and live TV in the UK.",
    alternates: { canonical: "https://firestick4uk.com/blog" },
    openGraph: {
      title: "Blog — Firestick4UK | Streaming Tips & Guides",
      description:
        "Read our latest guides, tips and news about Firestick, streaming services, Android boxes and live TV in the UK.",
      url: "https://firestick4uk.com/blog",
      siteName: "Firestick4UK",
      type: "website",
      images: social.images,
    },
    twitter: {
      card: "summary_large_image",
      title: "Blog — Firestick4UK | Streaming Tips & Guides",
      description:
        "Read our latest guides, tips and news about Firestick, streaming services, Android boxes and live TV in the UK.",
      images: social.twitterImages,
    },
  };
}

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
