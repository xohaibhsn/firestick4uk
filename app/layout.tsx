import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "./lib/cartContext";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

async function getSiteSettings(): Promise<Record<string,string>> {
  try {
    const pool = (await import("../lib/db")).default;
    const [rows]: any = await pool.query("SELECT content_key, content_value FROM site_content WHERE page_name='settings'");
    const result: Record<string,string> = {};
    for (const r of rows) result[r.content_key] = r.content_value || "";
    return result;
  } catch {
    return {};
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const title = settings.site_title || "Firestick4UK";
  const tagline = settings.site_tagline || "Best Firestick Service in UK";
  const favicon = settings.favicon_url || "/favicon.ico";
  const ogImage = settings.og_default_image || "https://firestick4uk.com/og-default.jpg";
  const description = "Buy Firestick, streaming subscriptions and Android boxes in the UK. Fast delivery, easy setup, real support.";

  return {
    title: `${title} — ${tagline}`,
    description,
    keywords: "Firestick UK, Firestick subscription, Android box, streaming device, buy firestick UK",
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
    authors: [{ name: title }],
    icons: { icon: favicon },
    openGraph: {
      title: `${title} — ${tagline}`,
      description,
      url: "https://firestick4uk.com",
      siteName: title,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${tagline}`,
      description,
      images: [ogImage],
    },
    metadataBase: new URL("https://firestick4uk.com"),
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
