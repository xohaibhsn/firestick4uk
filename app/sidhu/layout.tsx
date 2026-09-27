import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — Firestick4UK",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  alternates: {
    canonical: "https://firestick4uk.com/sidhu",
  },
};

export default function SidhuLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
