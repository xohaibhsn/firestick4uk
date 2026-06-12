/**
 * Hostinger rebuilds the app inside public_html/.builds on every git deploy.
 * Manual uploads to public/downloads are wiped each time.
 *
 * Put APK files once in: public_html/_apk_storage/
 * This script copies them into public/downloads/ after every build.
 */
const fs = require('fs');
const path = require('path');

const targetDir = path.join(process.cwd(), 'public', 'downloads');
const persistentDir = path.resolve(process.cwd(), '../../_apk_storage');

function copyApks(fromDir, label) {
  if (!fs.existsSync(fromDir)) return 0;

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

let copied = copyApks(persistentDir, 'Hostinger storage');

if (copied === 0) {
  copied = copyApks(targetDir, 'repo public/downloads');
  if (copied > 0) {
    console.log('[sync-apks] Using APKs already in public/downloads (git or local).');
  }
}

if (copied === 0) {
  console.warn('[sync-apks] No APK files found.');
  console.warn('[sync-apks] Create public_html/_apk_storage/ on Hostinger and upload your APK files there.');
} else {
  console.log(`[sync-apks] Ready: ${copied} APK file(s) in public/downloads/`);
}
