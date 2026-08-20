#!/usr/bin/env python3
"""Render the brand artwork derived from `assets/Tally-Slogan.png`.

Two outputs:

1. Locale cuts of the marketing logo. Only the *text* below the pie/hash mark is
   redrawn — the mark is copied pixel-for-pixel — so every locale shares one
   artwork. Fonts come from the Vazirmatn family the app already bundles
   (`@expo-google-fonts/vazirmatn`), so the Farsi wordmark matches in-app type.

2. The language-neutral native splash (`assets/splash-mark.png` + the Android and
   iOS resources). The OS launch screen renders before JS picks the user's
   locale, so it must carry no words: it shows the mark alone, then the JS
   `StartupGreeting` fades in the localized wordmark over it.

Usage:  python3 generate_slogan_logo_locales.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "assets" / "Tally-Slogan.png"
FONT_DIR = ROOT / "node_modules" / "@expo-google-fonts" / "vazirmatn"

# Geometry measured off the English original (1024x1024).
MARK_BOTTOM = 545  # everything at/below this y is text and gets redrawn
WORDMARK_BOX = (593, 908)  # top / bottom of the "Tally" wordmark incl. descender
SLOGAN_BOX = (935, 1022)  # top / bottom of the slogan line
MAX_WORDMARK_WIDTH = 790
MAX_SLOGAN_WIDTH = 1010

# One splash source, downscaled per platform, so what is on disk matches what
# `expo prebuild` would regenerate from `app.json` (`android/` is gitignored).
SPLASH_SIZE = 1024
# Fraction of the canvas the mark covers. Two constraints meet here:
#   * Android 12+ draws `windowSplashScreenAnimatedIcon` on a 288dp canvas and
#     masks it to a 192dp circle — that mask is what was slicing the wordmark
#     off. 0.49 x 288dp = 141dp, safely inside it.
#   * iOS pins the imageset edge-to-edge with `scaleAspectFit`
#     (SplashScreen.storyboard), so this is also the mark's share of the screen
#     width. Holding it at the share it has inside the 1024px logo keeps the
#     mark roughly the same size when `StartupGreeting` fades in over it.
SPLASH_MARK_FRACTION = 500 / 1024
ANDROID_SPLASH_DENSITIES = {
    "mdpi": 288,
    "hdpi": 432,
    "xhdpi": 576,
    "xxhdpi": 864,
    "xxxhdpi": 1152,
}

# Colours sampled from the original artwork.
WORDMARK_TOP = (248, 247, 248)
WORDMARK_BOTTOM = (219, 219, 219)
SLOGAN_COLOR = (195, 230, 199)

LOCALES = {
    "fa": {
        "wordmark": "تالی",
        "slogan": "دنگت رو پاک کن. دوستی‌هات رو صاف کن.",
        "wordmark_font": "900Black/Vazirmatn_900Black.ttf",
        "slogan_font": "700Bold/Vazirmatn_700Bold.ttf",
        # Persian ink spans dots-to-descender, so filling the Latin band makes
        # the wordmark read larger than "Tally" does. Hold it back a little.
        "wordmark_scale": 0.74,
        "out": "Tally-Slogan-fa.png",
    },
}


def fit_font(path: Path, text: str, max_w: int, max_h: int) -> ImageFont.FreeTypeFont:
    """Largest font size whose rendered `text` fits inside `max_w` x `max_h`."""
    lo, hi, best = 8, 400, None
    while lo <= hi:
        mid = (lo + hi) // 2
        font = ImageFont.truetype(str(path), mid)
        x0, y0, x1, y1 = font.getbbox(text, anchor="ls")
        if (x1 - x0) <= max_w and (y1 - y0) <= max_h:
            best, lo = font, mid + 1
        else:
            hi = mid - 1
    if best is None:
        raise RuntimeError(f"text does not fit at any size: {text!r}")
    return best


def draw_centered(
    img: Image.Image,
    text: str,
    font: ImageFont.FreeTypeFont,
    top: int,
    bottom: int,
) -> Image.Image:
    """Draw `text` centred in the [top, bottom] band, returning a text-only mask layer."""
    layer = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(layer)
    _x0, y0, _x1, y1 = font.getbbox(text, anchor="ls")
    cx = img.size[0] // 2
    # `anchor="ls"` puts (x, y) at the baseline; offset so the ink box is centred.
    baseline = top + (bottom - top - (y1 - y0)) // 2 - y0
    d.text((cx, baseline), text, font=font, fill=255, anchor="ms")
    return layer


def vertical_gradient(size, top_rgb, bottom_rgb, y_top, y_bottom) -> Image.Image:
    grad = Image.new("RGB", size, bottom_rgb)
    px = grad.load()
    span = max(1, y_bottom - y_top)
    for y in range(size[1]):
        t = min(1.0, max(0.0, (y - y_top) / span))
        row = tuple(round(a + (b - a) * t) for a, b in zip(top_rgb, bottom_rgb))
        for x in range(size[0]):
            px[x, y] = row
    return grad


def mark_only() -> Image.Image:
    """The pie/hash mark on transparency, cropped to its own ink bounds."""
    logo = Image.open(SOURCE).convert("RGBA")
    above_text = logo.crop((0, 0, logo.width, MARK_BOTTOM))
    box = above_text.getbbox()
    if box is None:
        raise RuntimeError("no mark found above the text band")
    return above_text.crop(box)


def centered_on_canvas(mark: Image.Image, canvas: int, fraction: float) -> Image.Image:
    """`mark` scaled so its longest side is `fraction` of a square transparent canvas."""
    target = max(1, round(canvas * fraction))
    scaled = mark.copy()
    scaled.thumbnail((target, target), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(scaled, ((canvas - scaled.width) // 2, (canvas - scaled.height) // 2), scaled)
    return out


def build_native_splash() -> None:
    mark = mark_only()

    source = centered_on_canvas(mark, SPLASH_SIZE, SPLASH_MARK_FRACTION)
    source.save(ROOT / "assets" / "splash-mark.png", "PNG")
    print(f"✓ splash: assets/splash-mark.png ({SPLASH_SIZE}px, mark only)")

    ios_dir = ROOT / "ios" / "Tally" / "Images.xcassets" / "SplashScreenLegacy.imageset"
    if ios_dir.is_dir():
        for name in ("image.png", "image@2x.png", "image@3x.png"):
            source.save(ios_dir / name, "PNG")
        print(f"  ↳ iOS SplashScreenLegacy.imageset ({SPLASH_SIZE}px x3)")

    res = ROOT / "android" / "app" / "src" / "main" / "res"
    written = 0
    for density, px in ANDROID_SPLASH_DENSITIES.items():
        dest = res / f"drawable-{density}" / "splashscreen_logo.png"
        if not dest.parent.is_dir():
            continue
        source.resize((px, px), Image.Resampling.LANCZOS).save(dest, "PNG")
        written += 1
    if written:
        print(f"  ↳ Android drawable-* splashscreen_logo.png ({written} densities)")


def build(locale: str, spec: dict) -> Path:
    base = Image.open(SOURCE).convert("RGBA")
    w, h = base.size

    # Keep the mark, drop the English text.
    out = base.copy()
    out.paste((0, 0, 0, 0), (0, MARK_BOTTOM, w, h))

    wm_scale = spec.get("wordmark_scale", 1.0)
    wm_font = fit_font(
        FONT_DIR / spec["wordmark_font"],
        spec["wordmark"],
        round(MAX_WORDMARK_WIDTH * wm_scale),
        round((WORDMARK_BOX[1] - WORDMARK_BOX[0]) * wm_scale),
    )
    sl_font = fit_font(
        FONT_DIR / spec["slogan_font"],
        spec["slogan"],
        MAX_SLOGAN_WIDTH,
        SLOGAN_BOX[1] - SLOGAN_BOX[0],
    )

    wm_mask = draw_centered(out, spec["wordmark"], wm_font, *WORDMARK_BOX)
    grad = vertical_gradient((w, h), WORDMARK_TOP, WORDMARK_BOTTOM, *WORDMARK_BOX)
    out.paste(grad, (0, 0), wm_mask)

    sl_mask = draw_centered(out, spec["slogan"], sl_font, *SLOGAN_BOX)
    out.paste(Image.new("RGB", (w, h), SLOGAN_COLOR), (0, 0), sl_mask)

    dest = ROOT / "assets" / spec["out"]
    out.save(dest, "PNG")
    print(f"✓ {locale}: {dest.name}  wordmark={wm_font.size}px slogan={sl_font.size}px")
    return dest


def main() -> None:
    build_native_splash()
    for locale, spec in LOCALES.items():
        dest = build(locale, spec)
        # Web export serves a static copy from `public/` (see groupExportBrandImage.ts).
        public = ROOT / "public" / dest.name.lower()
        public.write_bytes(dest.read_bytes())
        print(f"  ↳ mirrored to public/{public.name}")


if __name__ == "__main__":
    main()
