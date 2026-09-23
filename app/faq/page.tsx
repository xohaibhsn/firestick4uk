import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import JsonLd from "@/components/JsonLd";
import { getPublicVisibleFaqs } from "@/lib/publicFaqsServer";
import FAQClient from "./FAQClient";

export const dynamic = "force-dynamic";

export default async function FAQPage() {
  const initialFaqs = await getPublicVisibleFaqs();

  const faqLd =
    initialFaqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: initialFaqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }
      : null;

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://firestick4uk.com" },
          { name: "FAQ", url: "https://firestick4uk.com/faq" },
        ]}
      />
      <JsonLd data={faqLd} />
      <FAQClient initialFaqs={initialFaqs} />
    </>
  );
}
