import { nativeImage, type NativeImage } from 'electron';

/**
 * Tray icon: the Bootstrap `phone-fill` glyph, rasterised to base64 PNGs by
 * `scripts/generate-tray-icon.js` so the app needs no asset pipeline or SVG rasteriser.
 * Re-run that script if the glyph changes.
 *
 * Marked as a template image, so macOS recolours it for light and dark menu bars.
 */
const ICON_16 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANklEQVR42mNgQAUhDAwMrxkYGP7jwK+hanAC' +
  'fJqRDcEJ/hOJRw0YNYC+BhhAMf0MoDgzkZydAcMPmNlsoK0pAAAAAElFTkSuQmCC';

/** Retina variant; without it the icon is visibly soft on modern displays. */
const ICON_32 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAcklEQVR42u3XMQrAIAyF4f8QHsK7O3o0h4yW' +
  'goXSoWCwDbQv8DZDPnB6cD8ZqIABfTI2djPO2Reb4/A1zYuoC44fqR6ALQSYB9AXRwABBBBAAAEEEECA7wEK' +
  'kEZKBCCd3qZfAh7/gvBiEl7NwsvpK/V8A0dmY3d6Bw48AAAAAElFTkSuQmCC';

export function createTrayIcon(): NativeImage {
  const image = nativeImage.createFromDataURL(`data:image/png;base64,${ICON_16}`);
  image.addRepresentation({
    scaleFactor: 2,
    dataURL: `data:image/png;base64,${ICON_32}`,
  });
  image.setTemplateImage(true);
  return image;
}
