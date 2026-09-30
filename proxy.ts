/**
 * Lightweight Proxy — trusted original pathname/search headers ONLY.
 * No DB, cache, fetch, filesystem, or redirect decisions.
 * www → apex remains in next.config.ts.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  F4UK_ORIGINAL_PATH_HEADER,
  F4UK_ORIGINAL_SEARCH_HEADER,
} from "@/lib/urlRedirectHeaders";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // Always overwrite — never trust client-supplied values.
  headers.set(F4UK_ORIGINAL_PATH_HEADER, request.nextUrl.pathname);
  headers.set(F4UK_ORIGINAL_SEARCH_HEADER, request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    /*
     * Exclude infrastructure that can never be CMS redirect sources.
     * Do NOT blanket-exclude paths containing a dot (legacy .html sources allowed).
     */
    "/((?!api(?:/|$)|sidhu(?:/|$)|_next(?:/|$)|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).*)",
  ],
};
