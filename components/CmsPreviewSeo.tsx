"use client";

/**
 * When ?cms_preview=1 is present: ensure robots noindex meta and keep canonical
 * pointing at the clean URL (no preview param). No other SEO changes.
 * Does not activate preview overrides — that requires iframe + /sidhu parent.
 */
import { useEffect } from "react";
import {
  cleanUrlWithoutCmsPreview,
  isCmsPreviewQueryParam,
} from "@/lib/cmsPreview";

export default function CmsPreviewSeo() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isCmsPreviewQueryParam(window.location.search)) return;

    const origin = window.location.origin;
    const cleanPath = cleanUrlWithoutCmsPreview(
      window.location.pathname,
      window.location.search
    );
    const cleanHref = `${origin}${cleanPath === "/" ? "" : cleanPath}` || origin;
    // Prefer absolute site canonical without trailing junk
    const canonicalHref =
      cleanPath === "/" || cleanPath === ""
        ? "https://firestick4uk.com"
        : `https://firestick4uk.com${cleanPath}`;

    let robots = document.querySelector(
      'meta[name="robots"]'
    ) as HTMLMetaElement | null;
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "noindex, nofollow");
    robots.setAttribute("data-cms-preview-robots", "1");

    let link = document.querySelector(
      'link[rel="canonical"]'
    ) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonicalHref);
    link.setAttribute("data-cms-preview-canonical", "1");

    void cleanHref;
  }, []);

  return null;
}
