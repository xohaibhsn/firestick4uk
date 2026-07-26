import type { Metadata } from "next";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

export const metadata: Metadata = {
  title: "Contact Us — Firestick4UK | UK Support",
  description: "Get in touch with Firestick4UK. WhatsApp support, email, and contact form available. We reply within 24 hours.",
  alternates: { canonical: "https://firestick4uk.com/contact" },
  openGraph: { title: "Contact Firestick4UK", description: "WhatsApp, email and form support available.", url: "https://firestick4uk.com/contact", siteName: "Firestick4UK", type: "website" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://firestick4uk.com" },
          { name: "Contact", url: "https://firestick4uk.com/contact" },
        ]}
      />
      {children}
    </>
  );
}
