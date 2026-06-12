/**
 * Hostinger wipes public_html on git deploy (including public_html/_apk_storage).
 * Store APKs OUTSIDE public_html so they survive redeploys.
 *
 * Create on Hostinger (File Manager):
 *   domains/firestick4uk.com/apk_storage/
 * One level ABOVE public_html — NOT inside public_html.
 */
const fs = require('fs');
const path = require('path');

const targetDir = path.join(process.cwd(), 'public', 'downloads');

function copyApks(fromDir, label) {
  if (!fromDir || !fs.existsSync(fromDir)) return 0;

  fs.mkdirSync(targetDir, { recursive: true });
  let copied = 0;

  for (const name of fs.readdirSync(fromDir)) {
    if (!name.toLowerCase().endsWith('.apk')) continue;
    fs.copyFileSync(path.join(fromDir, name), path.join(targetDir, name));
    copied += 1;
    console.log(`[sync-apks] ${label}: ${name}`);
  }

  return copied;
}

function getPersistentDirs() {
  const cwd = process.cwd();
  const dirs = [];

  if (process.env.APK_STORAGE_DIR) {
    dirs.push({ path: process.env.APK_STORAGE_DIR, label: 'APK_STORAGE_DIR env' });
  }

  dirs.push(
    { path: path.resolve(cwd, '../../../apk_storage'), label: 'domain apk_storage (outside public_html)' },
    { path: path.resolve(cwd, '../../../../apk_storage'), label: 'alternate domain apk_storage' },
    { path: path.resolve(cwd, '../../_apk_storage'), label: 'legacy public_html/_apk_storage (may be wiped on deploy)' }
  );

  return dirs;
}

let copied = 0;
const checked = [];

for (const { path: dir, label } of getPersistentDirs()) {
  checked.push(dir);
  copied = copyApks(dir, label);
  if (copied > 0) break;
}

if (copied === 0) {
  copied = copyApks(targetDir, 'repo public/downloads');
  if (copied > 0) {
    console.log('[sync-apks] Fallback: using APKs from git/local public/downloads.');
  }
}

console.log('[sync-apks] Checked paths:');
for (const dir of checked) {
  console.log(`  - ${dir} ${fs.existsSync(dir) ? '(exists)' : '(missing)'}`);
}

if (copied === 0) {
  console.warn('[sync-apks] No APK files copied.');
  console.warn('[sync-apks] On Hostinger: open File Manager, go ONE LEVEL UP from public_html.');
  console.warn('[sync-apks] Create folder: apk_storage');
  console.warn('[sync-apks] Upload A1IPTVPlayer-latest.apk and 5GNext-vpn.apk there, then redeploy.');
} else {
  console.log(`[sync-apks] Ready: ${copied} APK file(s) in public/downloads/`);
}
