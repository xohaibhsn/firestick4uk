import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "5G Next VPN Download — Firestick4UK",
  description:
    "Download the 5G Next VPN APK for Firestick and Android devices.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  alternates: {
    canonical: "https://firestick4uk.com/5GNextDownload",
  },
};

export default function FiveGNextDownloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
