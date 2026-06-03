import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "./lib/cartContext";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

async function getSiteSettings(): Promise<Record<string,string>> {
  try {
    const mysql = require("mysql2/promise");
    const conn = await Promise.race([
      mysql.createConnection({ host: process.env.DB_HOST||"srv497.hstgr.io", user: process.env.DB_USER||"u992747032_firestick4uk", password: process.env.DB_PASSWORD||"Firestick@2026", database: process.env.DB_NAME||"u992747032_firestick4uk", port: 3306, connectTimeout: 4000 }),
      new Promise((_,reject) => setTimeout(()=>reject(new Error("timeout")),5000)),
    ]) as any;
    const [rows]: any = await conn.query("SELECT content_key, content_value FROM site_content WHERE page_name='settings'");
    await conn.end();
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
  const tagline = settings.site_tagline || "Premium IPTV & Firestick UK";
  const favicon = settings.favicon_url || "/favicon.ico";

  return {
    title: `${title} — ${tagline}`,
    description: "Buy Firestick, IPTV subscriptions and Android boxes in the UK. Fast delivery, easy setup, real support.",
    keywords: "Firestick UK, IPTV subscription, Android box, streaming device, buy firestick UK",
    authors: [{ name: title }],
    icons: { icon: favicon },
    openGraph: {
      title: `${title} — ${tagline}`,
      description: "Buy Firestick, IPTV subscriptions and Android boxes in the UK. Fast delivery, easy setup, real support.",
      url: "https://firestick4uk.com",
      siteName: title,
      type: "website",
      images: [{ url: "https://firestick4uk.com/og-image.jpg", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${tagline}`,
      description: "Buy Firestick, IPTV subscriptions and Android boxes in the UK.",
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
