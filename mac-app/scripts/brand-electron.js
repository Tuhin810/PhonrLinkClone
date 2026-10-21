#!/usr/bin/env node
/**
 * Dev runs launch node_modules' stock Electron.app, so macOS labels notifications, the
 * permission prompts and Activity Monitor as "Electron" with Electron's icon. This rebrands
 * that local copy as ILink: app icon plus bundle name, then re-signs it ad hoc so the edited
 * bundle still launches. Idempotent and quick when already applied; a no-op off macOS.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const NAME = 'ILink';
const app = path.join(__dirname, '../node_modules/electron/dist/Electron.app');
const contents = path.join(app, 'Contents');
const plist = path.join(contents, 'Info.plist');
const sourceIcon = path.join(__dirname, '../assets/icon.icns');
const bundleIcon = path.join(contents, 'Resources/electron.icns');

if (process.platform !== 'darwin' || !fs.existsSync(plist) || !fs.existsSync(sourceIcon)) {
  process.exit(0);
}

function plistValue(key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist]).toString().trim();
  } catch {
    return null;
  }
}

const iconCurrent = fs.readFileSync(sourceIcon).equals(fs.readFileSync(bundleIcon));
if (iconCurrent && plistValue('CFBundleName') === NAME && plistValue('CFBundleDisplayName') === NAME) {
  process.exit(0);
}

fs.copyFileSync(sourceIcon, bundleIcon);
for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
  execFileSync('plutil', ['-replace', key, '-string', NAME, plist]);
}
// Editing Info.plist and resources breaks the bundle's seal; an ad hoc signature restores it.
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' });
// Nudge LaunchServices so Notification Center and Finder pick up the new name and icon.
fs.utimesSync(app, new Date(), new Date());
const lsregister =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
try {
  execFileSync(lsregister, ['-f', app], { stdio: 'ignore' });
} catch {
  // Cosmetic only: the cache refreshes on its own eventually.
}
console.log(`[brand] Electron.app rebranded as ${NAME}`);
