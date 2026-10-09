import { NextResponse } from "next/server";
import { getSitemapDynamicDataSafe } from "@/lib/sitemapDataServer";
import {
  buildSitemapEntries,
  serializeSitemapXml,
  staticSitemapXml,
} from "@/lib/sitemapXml";

/**
 * Explicit App Route handler (not metadata-route app/sitemap.ts).
 * Hostinger production returned HTTP 500 from the metadata sitemap pipeline
 * with no runtime exception logged; this path always emits valid XML and
 * degrades to static URLs if dynamic data resolution fails.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getSitemapDynamicDataSafe();
    const xml = serializeSitemapXml(buildSitemapEntries(data));
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new NextResponse(staticSitemapXml(), {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  }
}
