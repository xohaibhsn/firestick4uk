import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "./lib/cartContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Firestick4UK — Premium IPTV & Firestick UK",
  description: "Buy Firestick, IPTV subscriptions and Android boxes in the UK. Fast delivery, easy setup, real support.",
  keywords: "Firestick UK, IPTV subscription, Android box, streaming device, buy firestick UK",
  authors: [{ name: "Firestick4UK" }],
  openGraph: {
    title: "Firestick4UK — Premium IPTV & Firestick UK",
    description: "Buy Firestick, IPTV subscriptions and Android boxes in the UK. Fast delivery, easy setup, real support.",
    url: "https://firestick4uk.com",
    siteName: "Firestick4UK",
    type: "website",
    images: [{ url: "https://firestick4uk.com/og-image.jpg", width: 1200, height: 630, alt: "Firestick4UK" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Firestick4UK — Premium IPTV & Firestick UK",
    description: "Buy Firestick, IPTV subscriptions and Android boxes in the UK. Fast delivery, easy setup, real support.",
    images: ["https://firestick4uk.com/og-image.jpg"],
  },
  metadataBase: new URL("https://firestick4uk.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <CartProvider>
          {children}
        </CartProvider>
      </body>
    </html>
  );
}