import { nativeImage, type NativeImage } from 'electron';

/**
 * A 16x16 template icon, inlined as base64 so the app needs no asset pipeline.
 * Template images are recoloured by macOS to match light/dark menu bars automatically.
 */
const ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJUlEQVR4nGNgoBH4jwNTpJloQ3ApHDVg1ACy' +
  'DKA4JdIkP1AfAADBAke5MJmXRAAAAABJRU5ErkJggg==';

export function createTrayIcon(): NativeImage {
  const image = nativeImage.createFromDataURL(`data:image/png;base64,${ICON_BASE64}`);
  image.setTemplateImage(true);
  return image;
}
