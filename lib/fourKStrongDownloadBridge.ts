/**
 * 4K Strong OneDrive download bridge helpers (pure; no APK proxy).
 */

/** Verified OneDrive view-only direct-download target (do not alter). */
export const FOUR_K_STRONG_ONEDRIVE_URL =
  "https://1drv.ms/u/c/8b504e12d9968aae/IQBD5Da7pks6S5nf0LYmJcX-ARhEGcWCT7sKcr8M4vZPZDo?download=1";

function escapeHtmlAttr(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildFourKStrongBridgeHtml(destinationUrl: string): string {
  const href = escapeHtmlAttr(destinationUrl);
  const jsUrl = JSON.stringify(destinationUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<meta http-equiv="refresh" content="0;url=${href}"/>
<title>Download 4K Strong — Firestick4UK</title>
<script>
(function () {
  try {
    window.location.replace(${jsUrl});
  } catch (e) {
    window.location.href = ${jsUrl};
  }
})();
</script>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#ffffff;color:#111111;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;">
  <main>
    <p style="font-size:16px;line-height:1.5;margin:0 0 20px;">Your download should start automatically.</p>
    <p style="margin:0;">
      <a href="${href}" style="display:inline-block;background:#5B21B6;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Download 4K Strong</a>
    </p>
  </main>
</body>
</html>`;
}
