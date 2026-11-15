"use client";

import { isCmsPreviewSsrOnlyKey } from "@/lib/cmsPreview";

/** Small chip for fields that cannot update live in the preview iframe. */
export default function CmsUpdatesAfterSaveChip({
  fieldKey,
}: {
  fieldKey: string;
}) {
  if (!isCmsPreviewSsrOnlyKey(fieldKey)) return null;
  return (
    <span
      data-cms-updates-after-save={fieldKey}
      title="This text is rendered from the server — preview updates after you save"
      style={{
        display: "inline-block",
        marginLeft: 6,
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.02em",
        color: "#92400E",
        background: "#FEF3C7",
        border: "1px solid #FCD34D",
        verticalAlign: "middle",
      }}
    >
      updates after save
    </span>
  );
}
