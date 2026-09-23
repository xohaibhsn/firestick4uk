import { getContactConfig } from "@/lib/contact-config";
import { getPublicSiteContent } from "@/lib/publicSiteContentServer";
import TermsClient from "./TermsClient";

export const dynamic = "force-dynamic";

const TERMS_KEYS = [
  "terms_tag",
  "terms_title",
  "terms_updated",
  "terms_body",
] as const;

export default async function TermsPage() {
  const [initialContent, initialContact] = await Promise.all([
    getPublicSiteContent(TERMS_KEYS),
    getContactConfig(),
  ]);

  return (
    <TermsClient
      initialContent={initialContent}
      initialContact={initialContact}
    />
  );
}
