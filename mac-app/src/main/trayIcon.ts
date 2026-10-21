import path from 'node:path';
import { nativeImage, type NativeImage } from 'electron';

/**
 * Tray icon: the ILink mark, rendered by `brand/generate-icons.py` into
 * `assets/trayTemplate.png` (+ `@2x`, which nativeImage picks up for Retina by name).
 *
 * Marked as a template image, so macOS recolours it for light and dark menu bars.
 */
export function createTrayIcon(): NativeImage {
  // Compiled to dist/main/, so the repo's assets/ folder is two levels up.
  const image = nativeImage.createFromPath(path.join(__dirname, '../../assets/trayTemplate.png'));
  image.setTemplateImage(true);
  return image;
}
