"use client";

import xss from "xss";
import { fixContentLinkRels } from "@/lib/seoLinks";

const bodyXss = {
  whiteList: {
    h1: [],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    p: ["style", "class"],
    strong: [],
    em: [],
    u: [],
    ul: [],
    ol: [],
    li: [],
    blockquote: [],
    a: ["href", "target", "rel"],
    br: [],
    hr: [],
    span: ["style", "class"],
    div: ["style", "class", "id"],
  } as Record<string, string[]>,
  stripIgnoreTag: true,
};

export default function CmsBody({
  html,
  className = "",
}: {
  html: string;
  className?: string;
}) {
  if (!html?.trim()) return null;
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{
        __html: fixContentLinkRels(xss(html, bodyXss)),
      }}
    />
  );
}
