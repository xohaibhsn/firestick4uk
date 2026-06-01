import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — Firestick4UK | Streaming Tips & Guides",
  description: "Read our latest guides, tips and news about Firestick, IPTV, Android boxes and streaming in the UK.",
  openGraph: {
    title: "Blog — Firestick4UK | Streaming Tips & Guides",
    description: "Read our latest guides, tips and news about Firestick, IPTV, Android boxes and streaming in the UK.",
    url: "https://firestick4uk.com/blog",
    siteName: "Firestick4UK",
    type: "website",
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
