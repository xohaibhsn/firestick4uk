/** Internal links should be dofollow (no rel=nofollow). External get noopener only. */

export function isInternalHref(href: string): boolean {
  const h = (href || "").trim();
  if (!h) return false;
  if (
    h.startsWith("/") ||
    h.startsWith("#") ||
    h.startsWith("?") ||
    h.startsWith("mailto:") ||
    h.startsWith("tel:")
  ) {
    return true;
  }
  try {
    const url = new URL(h, "https://firestick4uk.com");
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    return host === "firestick4uk.com";
  } catch {
    return false;
  }
}

export function linkMarkAttrs(href: string): {
  href: string;
  target: string | null;
  rel: string | null;
} {
  if (isInternalHref(href)) {
    return { href, target: null, rel: null };
  }
  return { href, target: "_blank", rel: "noopener noreferrer" };
}

/** Fix TipTap/saved HTML: strip nofollow on internal links; external = noopener noreferrer only. */
export function fixContentLinkRels(html: string): string {
  if (!html) return html;
  return html.replace(/<a\b([^>]*)>/gi, (_full, rawAttrs: string) => {
    const hrefMatch = rawAttrs.match(
      /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
    );
    const href = hrefMatch
      ? hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || ""
      : "";

    let attrs = String(rawAttrs)
      .replace(/\s*rel\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
      .replace(/\s*target\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");

    if (isInternalHref(href)) {
      return `<a${attrs}>`;
    }

    attrs += ' target="_blank" rel="noopener noreferrer"';
    return `<a${attrs}>`;
  });
}
