import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Player — Firestick4UK",
  description: "Firestick4UK media player application.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  alternates: {
    canonical: "https://firestick4uk.com/player",
  },
};

export default function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
