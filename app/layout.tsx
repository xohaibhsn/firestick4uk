import type { Metadata } from "next";
import { Inter, Playfair_Display, Cinzel } from "next/font/google";
import "./globals.css";
import { CartProvider } from "./lib/cartContext";
// import ChatWidget from "@/components/ChatWidget"; // BERLIN TEMPORARILY HIDDEN
import WhatsAppButton from "@/components/WhatsAppButton";
import JsonLd from "@/components/JsonLd";
import { getContactConfig } from "@/lib/contact-config";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "700", "800", "900"],
});

/** Logo text fallback only — do not use elsewhere */
const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
  weight: ["400", "700", "900"],
});

async function getSiteSettings(): Promise<Record<string, string>> {
  try {
    const pool = (await import("../lib/db")).default;
    const [rows]: any = await pool.query(
      "SELECT content_key, content_value FROM site_content WHERE page_name='settings'"
    );
    const result: Record<string, string> = {};
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
  const description =
    "Buy Firestick, streaming subscriptions and Android boxes in the UK. Fast delivery, easy setup, real support.";

  return {
    title: `${title} — ${tagline}`,
    description,
    keywords:
      "Firestick UK, Firestick subscription, Android box, streaming device, buy firestick UK",
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
    alternates: {
      canonical: "https://firestick4uk.com",
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const settings = await getSiteSettings();
  const contact = await getContactConfig();
  const logoUrl = settings.site_logo_url || "https://firestick4uk.com/logo.png";
  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Firestick4UK",
    url: "https://firestick4uk.com",
    logo: logoUrl,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: contact.phone,
      email: contact.email,
      contactType: "customer service",
      availableLanguage: "English",
    },
    sameAs: [contact.telegramUrl],
  };

  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${cinzel.variable} h-full antialiased`}
    >
      <head>
        <meta
          name="google-site-verification"
          content="bE3BpMEsptGDckTW4IX1nVwGibbaaiphTCCbQp9y-FY"
        />
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-055GHH06KD"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-055GHH06KD');
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <JsonLd data={organizationLd} />
        <CartProvider>{children}</CartProvider>
        {/* BERLIN TEMPORARILY HIDDEN
        <ChatWidget />
        */}
        <WhatsAppButton />
      </body>
    </html>
  );
}
