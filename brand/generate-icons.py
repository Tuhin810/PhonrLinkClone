#!/usr/bin/env python3
"""
Builds every ILink icon from brand/ilink-icon.png (the full square artwork).

  python3 brand/generate-icons.py

Writes the white mark (brand/ilink-mark.png), the Android launcher + notification icons,
and the Mac app icon (.icns) and menu bar template icons. Needs Pillow; macOS for iconutil.
"""
import os
import shutil
import subprocess
import tempfile

from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND = os.path.join(ROOT, 'brand')
ANDROID_RES = os.path.join(ROOT, 'android-app/android/app/src/main/res')
MAC_ASSETS = os.path.join(ROOT, 'mac-app/assets')

DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def extract_mark(artwork: Image.Image) -> Image.Image:
    """The white logo on its own: alpha from how white each pixel is, cropped tight."""
    r, g, b = artwork.convert('RGB').split()
    darkest = ImageChops.darker(ImageChops.darker(r, g), b)
    # The texture never gets near white, so a ramp over the darkest channel separates them.
    alpha = darkest.point(lambda v: 0 if v <= 140 else 255 if v >= 230 else int((v - 140) * 255 / 90))
    bbox = alpha.point(lambda v: 255 if v > 20 else 0).getbbox()
    mark = Image.new('RGBA', artwork.size, (255, 255, 255, 0))
    mark.putalpha(alpha)
    return mark.crop(bbox)


def fit(mark: Image.Image, canvas: int, box: float, color=(255, 255, 255)) -> Image.Image:
    """Centre the mark inside `box` pixels of a transparent `canvas`-pixel square."""
    scale = box / max(mark.size)
    size = (max(1, round(mark.width * scale)), max(1, round(mark.height * scale)))
    alpha = mark.getchannel('A').resize(size, Image.LANCZOS)
    tinted = Image.new('RGBA', size, color + (0,))
    tinted.putalpha(alpha)
    out = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    out.alpha_composite(tinted, ((canvas - size[0]) // 2, (canvas - size[1]) // 2))
    return out


def masked(artwork: Image.Image, size: int, radius: int) -> Image.Image:
    """Artwork resized to `size`, clipped to a rounded square (radius = size/2 is a circle)."""
    img = artwork.convert('RGBA').resize((size, size), Image.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    img.putalpha(mask)
    return img


def deep_water(size: int) -> Image.Image:
    """The artwork's backdrop without the mark: a diagonal from its top-right navy down
    to its near-black bottom-left. Adaptive icons need the mark on a separate layer."""
    top_right, bottom_left = (26, 36, 96), (2, 6, 18)
    small = Image.new('RGB', (64, 64))
    for y in range(64):
        for x in range(64):
            t = ((63 - x) + y) / 126
            small.putpixel((x, y), tuple(round(a + (b - a) * t) for a, b in zip(top_right, bottom_left)))
    return small.resize((size, size), Image.BICUBIC)


def android(artwork: Image.Image, mark: Image.Image) -> None:
    for name, d in DENSITIES.items():
        mipmap = os.path.join(ANDROID_RES, f'mipmap-{name}')
        drawable = os.path.join(ANDROID_RES, f'drawable-{name}')
        os.makedirs(mipmap, exist_ok=True)
        os.makedirs(drawable, exist_ok=True)

        # Adaptive icon layers are 108dp; launchers show the middle 72dp, so the mark
        # sits well inside that safe zone at 48dp.
        layer = round(108 * d)
        deep_water(layer).save(os.path.join(mipmap, 'ic_launcher_background.png'))
        fit(mark, layer, 48 * d).save(os.path.join(mipmap, 'ic_launcher_foreground.png'))

        # Pre-adaptive fallbacks, kept in step so nothing anywhere shows the old icon.
        legacy = round(48 * d)
        masked(artwork, legacy, round(legacy * 0.22)).save(os.path.join(mipmap, 'ic_launcher.png'))
        masked(artwork, legacy, legacy // 2).save(os.path.join(mipmap, 'ic_launcher_round.png'))

        # Status bar icons must be a white silhouette; Android ignores their colour.
        fit(mark, round(24 * d), 20 * d).save(os.path.join(drawable, 'ic_stat_ilink.png'))

    adaptive = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@mipmap/ic_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '</adaptive-icon>\n'
    )
    anydpi = os.path.join(ANDROID_RES, 'mipmap-anydpi-v26')
    os.makedirs(anydpi, exist_ok=True)
    for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        with open(os.path.join(anydpi, name), 'w') as handle:
            handle.write(adaptive)


def mac(artwork: Image.Image, mark: Image.Image) -> None:
    os.makedirs(MAC_ASSETS, exist_ok=True)

    # macOS app icon grid: an 824px rounded square centred on a 1024px canvas.
    def app_icon(size: int) -> Image.Image:
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        body = round(size * 824 / 1024)
        canvas.alpha_composite(masked(artwork, body, round(body * 0.225)), ((size - body) // 2,) * 2)
        return canvas

    app_icon(1024).save(os.path.join(MAC_ASSETS, 'icon.png'))
    iconset = tempfile.mkdtemp(suffix='.iconset')
    try:
        for base in (16, 32, 128, 256, 512):
            app_icon(base).save(os.path.join(iconset, f'icon_{base}x{base}.png'))
            app_icon(base * 2).save(os.path.join(iconset, f'icon_{base}x{base}@2x.png'))
        subprocess.run(
            ['iconutil', '-c', 'icns', iconset, '-o', os.path.join(MAC_ASSETS, 'icon.icns')],
            check=True,
        )
    finally:
        shutil.rmtree(iconset)

    # Menu bar: a black template image; macOS recolours it for light and dark bars.
    fit(mark, 18, 16, (0, 0, 0)).save(os.path.join(MAC_ASSETS, 'trayTemplate.png'))
    fit(mark, 36, 32, (0, 0, 0)).save(os.path.join(MAC_ASSETS, 'trayTemplate@2x.png'))


def main() -> None:
    artwork = Image.open(os.path.join(BRAND, 'ilink-icon.png'))
    mark = extract_mark(artwork)
    mark.save(os.path.join(BRAND, 'ilink-mark.png'))
    android(artwork, mark)
    mac(artwork, mark)
    print('icons written')


if __name__ == '__main__':
    main()
