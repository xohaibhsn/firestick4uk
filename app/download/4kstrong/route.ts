/**
 * Public APK download bridge for AFTVnews / Firestick Downloader.
 * Returns HTTP 200 HTML on firestick4uk.com, then navigates the client
 * to the OneDrive view-only direct-download URL. Does NOT proxy the APK.
 */

import {
  FOUR_K_STRONG_ONEDRIVE_URL,
  buildFourKStrongBridgeHtml,
} from "@/lib/fourKStrongDownloadBridge";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const html = buildFourKStrongBridgeHtml(FOUR_K_STRONG_ONEDRIVE_URL);
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}
