#!/usr/bin/env node
/**
 * Builds a standalone ILink.app (universal: Apple Silicon + Intel) and a drag-to-install DMG.
 *
 *   npm run package          -> out/ILink.app and ../release/ILink-mac.dmg
 *   npm run package -- --install   also copies ILink.app into /Applications
 *
 * The app is signed ad hoc, not with a Developer ID, so on another Mac Gatekeeper blocks the
 * first launch until the user right-clicks it and chooses Open. Proper signing + notarization
 * needs a paid Apple Developer account.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { packager } = require('@electron/packager');

const root = path.join(__dirname, '..');
const out = path.join(root, 'out');
const release = path.join(root, '..', 'release');
const install = process.argv.includes('--install');

async function main() {
  fs.rmSync(out, { recursive: true, force: true });
  const [appDir] = await packager({
    dir: root,
    out,
    name: 'ILink',
    platform: 'darwin',
    arch: 'universal',
    icon: path.join(root, 'assets/icon.icns'),
    appBundleId: 'com.ilink.mac',
    appCategoryType: 'public.app-category.utilities',
    // Menu bar only: no Dock icon, matching app.dock.hide() at runtime.
    extendInfo: { LSUIElement: true },
    asar: true,
    overwrite: true,
    prune: true,
    // Only the compiled app, its assets and runtime dependencies belong in the bundle.
    ignore: [/^\/src($|\/)/, /^\/test($|\/)/, /^\/dist-test($|\/)/, /^\/scripts($|\/)/, /^\/out($|\/)/, /^\/tsconfig/],
  });
  const app = path.join(appDir, 'ILink.app');

  // Packaging edits the bundle; re-seal it so Apple Silicon will launch it at all.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });

  // DMG with an Applications shortcut: the familiar drag-to-install window.
  fs.mkdirSync(release, { recursive: true });
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'ilink-dmg-'));
  execFileSync('ditto', [app, path.join(staging, 'ILink.app')]);
  fs.symlinkSync('/Applications', path.join(staging, 'Applications'));
  const dmg = path.join(release, 'ILink-mac.dmg');
  fs.rmSync(dmg, { force: true });
  execFileSync('hdiutil', ['create', '-volname', 'ILink', '-srcfolder', staging, '-ov', '-format', 'UDZO', dmg], {
    stdio: 'inherit',
  });
  fs.rmSync(staging, { recursive: true, force: true });
  console.log(`[package] ${app}\n[package] ${dmg}`);

  if (install) {
    const target = '/Applications/ILink.app';
    fs.rmSync(target, { recursive: true, force: true });
    execFileSync('ditto', [app, target]);
    console.log(`[package] installed ${target}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
