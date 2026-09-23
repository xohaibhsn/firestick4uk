import { getContactConfig } from "@/lib/contact-config";
import { getPublicSiteContent } from "@/lib/publicSiteContentServer";
import PrivacyPolicyClient from "./PrivacyPolicyClient";

export const dynamic = "force-dynamic";

const PRIVACY_KEYS = [
  "privacy_tag",
  "privacy_title",
  "privacy_updated",
  "privacy_body",
] as const;

export default async function PrivacyPolicyPage() {
  const [initialContent, initialContact] = await Promise.all([
    getPublicSiteContent(PRIVACY_KEYS),
    getContactConfig(),
  ]);

  return (
    <PrivacyPolicyClient
      initialContent={initialContent}
      initialContact={initialContact}
    />
  );
}
