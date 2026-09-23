import { getContactConfig } from "@/lib/contact-config";
import { getPublicSiteContent } from "@/lib/publicSiteContentServer";
import RefundPolicyClient from "./RefundPolicyClient";

export const dynamic = "force-dynamic";

const REFUND_KEYS = [
  "refund_tag",
  "refund_title",
  "refund_updated",
  "refund_body",
  "refund_cta_title",
  "refund_cta_sub",
  "refund_wa_btn",
  "refund_email_btn",
] as const;

export default async function RefundPolicyPage() {
  const [initialContent, initialContact] = await Promise.all([
    getPublicSiteContent(REFUND_KEYS),
    getContactConfig(),
  ]);

  return (
    <RefundPolicyClient
      initialContent={initialContent}
      initialContact={initialContact}
    />
  );
}
