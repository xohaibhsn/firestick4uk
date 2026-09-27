import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "A1 IPTV Player Download — Firestick4UK",
  description:
    "Download the A1 IPTV Player APK for Firestick and Android devices.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  alternates: {
    canonical: "https://firestick4uk.com/A1iptvDownload",
  },
};

export default function A1iptvDownloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
