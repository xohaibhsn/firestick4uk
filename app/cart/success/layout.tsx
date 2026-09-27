import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order Confirmation — Firestick4UK",
  description:
    "Your Firestick4UK order confirmation. This page is for customers completing checkout.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  alternates: {
    canonical: "https://firestick4uk.com/cart/success",
  },
};

export default function CartSuccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
