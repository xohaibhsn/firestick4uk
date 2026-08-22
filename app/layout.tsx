import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Cinzel } from "next/font/google";
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

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
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
    // Fetch settings page + asset keys explicitly (never mix keys)
    const [rows]: any = await pool.query(
      `SELECT content_key, content_value FROM site_content
       WHERE page_name = 'settings'
          OR content_key IN (
            'favicon_url',
            'og_default_image',
            'whatsapp_icon_url',
            'site_logo_url'
          )`
    );
    const result: Record<string, string> = {};
    for (const r of rows) result[r.content_key] = r.content_value || "";
    return result;
  } catch {
    return {};
  }
}

function withCacheBust(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return raw;
  if (!raw.startsWith("http") && !raw.startsWith("/")) return raw;
  const base = raw.split("#")[0];
  if (/[?&]v=/.test(base)) {
    return base.replace(/([?&])v=[^&]*/, `$1v=${Date.now()}`);
  }
  return `${base}${base.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

/** Cloudinary on-the-fly resize — browsers need small PNGs, not 200KB originals */
function faviconSizeUrl(url: string, size: number): string {
  const clean = (url || "").trim().split("?")[0];
  if (!clean) return "/api/favicon";
  if (clean.includes("res.cloudinary.com") && clean.includes("/upload/")) {
    return withCacheBust(
      clean.replace("/upload/", `/upload/c_fit,w_${size},h_${size},f_png,q_auto/`)
    );
  }
  return withCacheBust(clean);
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const title = settings.site_title || "Firestick4UK";
  const tagline = settings.site_tagline || "Best Firestick Service in UK";

  // EACH KEY SEPARATE — never reuse across roles
  const faviconUrl = (settings.favicon_url || "").trim();
  const ogImageUrl = (settings.og_default_image || "").trim();
  const logoUrl = (settings.site_logo_url || "").trim();
  const whatsappIconUrl = (settings.whatsapp_icon_url || "").trim();

  console.log("[site-assets] favicon:", faviconUrl || "(empty)");
  console.log("[site-assets] og:", ogImageUrl || "(empty)");
  console.log("[site-assets] logo:", logoUrl || "(empty)");
  console.log("[site-assets] whatsapp:", whatsappIconUrl || "(empty)");

  const icon32 = faviconUrl ? faviconSizeUrl(faviconUrl, 32) : "/api/favicon";
  const icon48 = faviconUrl ? faviconSizeUrl(faviconUrl, 48) : "/api/favicon";
  const icon180 = faviconUrl ? faviconSizeUrl(faviconUrl, 180) : "/api/favicon";
  const ogFinal = ogImageUrl
    ? withCacheBust(ogImageUrl)
    : "https://firestick4uk.com/og-default.jpg";

  const description =
    (settings.site_meta_description || "").trim() ||
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
    icons: {
      icon: [
        { url: icon32, sizes: "32x32", type: "image/png" },
        { url: icon48, sizes: "48x48", type: "image/png" },
        { url: icon180, sizes: "180x180", type: "image/png" },
      ],
      apple: [{ url: icon180, sizes: "180x180", type: "image/png" }],
      shortcut: icon48,
    },
    openGraph: {
      title: `${title} — ${tagline}`,
      description,
      url: "https://firestick4uk.com",
      siteName: title,
      type: "website",
      images: [{ url: ogFinal, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${tagline}`,
      description,
      images: [ogFinal],
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
      className={`${inter.variable} ${jakarta.variable} ${cinzel.variable} h-full antialiased`}
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
              gtag('config', 'AW-18404353244');
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
