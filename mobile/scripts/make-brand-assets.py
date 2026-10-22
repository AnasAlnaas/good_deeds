# Regenerates assets/brand from the logo geometry.
# Keep the paths here in step with src/components/brand/geometry.ts.
# Run from mobile/:  python scripts/make-brand-assets.py   (needs Pillow)
import math, pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'brand'
OUT.mkdir(parents=True, exist_ok=True)
NAVY, GREEN, WHITE = (16, 48, 72), (18, 161, 80), (255, 255, 255)
HEX = {NAVY: '#103048', GREEN: '#12A150', WHITE: '#FFFFFF'}

# ---- SVG files
PIN_D = 'M32 61C26.5 53.5 11 41.5 11 25A21 21 0 0 1 53 25C53 41.5 37.5 53.5 32 61Z'
STEM = 'M32 38V26'
LS = 'M32 31C25 31.5 21.5 27.5 21.5 21.5C28 21.5 32 25 32 31Z'
LB = 'M32 27C32.5 19.5 37 15.5 43 15.5C43 22.5 38.5 27 32 27Z'

def seed(c): return f'<path d="{STEM}" stroke="{c}" stroke-width="3.4" stroke-linecap="round"/><path d="{LS}" fill="{c}"/><path d="{LB}" fill="{c}"/>'
def mark(pin, sd): return f'<path d="{PIN_D}" fill="{pin}"/>{seed(sd)}'
def mono(c, mid='k'):
    return (f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">'
            f'<rect width="64" height="64" fill="#fff"/>{seed("#000")}</mask><path d="{PIN_D}" fill="{c}" mask="url(#{mid})"/>')
def svg(body, vb='0 0 64 64', w=None):
    size = f' width="{w}" height="{w}"' if w else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{size}>{body}</svg>\n'
def placed(body, scale):  # mark centred on a 64 canvas at `scale` of it
    off = 32 - 32 * scale
    return f'<g transform="translate({off:.3f} {off:.3f}) scale({scale})">{body}</g>'

files = {
  'logo-mark.svg': svg(mark(HEX[GREEN], HEX[WHITE])),
  'logo-mark-reverse.svg': svg(mark(HEX[WHITE], HEX[GREEN])),
  'logo-mark-mono-navy.svg': svg(mono(HEX[NAVY])),
  'logo-mark-mono-white.svg': svg(mono(HEX[WHITE])),
  'app-icon.svg': svg(f'<rect width="64" height="64" fill="{HEX[NAVY]}"/>' + placed(mark(HEX[GREEN], HEX[WHITE]), 0.62)),
}
for n, s in files.items():
    (OUT / n).write_text(s, encoding='utf-8')
    print('wrote', n)


# ---- PNG files (4x supersampled, real alpha)
SS = 4

def cubic(p0, p1, p2, p3, n=48):
    return [tuple((1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t**2*c + t**3*d for a, b, c, d in zip(p0, p1, p2, p3))
            for t in (i / n for i in range(1, n + 1))]

PIN = [(32, 61)] + cubic((32, 61), (26.5, 53.5), (11, 41.5), (11, 25)) \
    + [(32 + 21 * math.cos(a), 25 + 21 * math.sin(a)) for a in (math.pi + math.pi * i / 96 for i in range(1, 97))] \
    + cubic((53, 25), (53, 41.5), (37.5, 53.5), (32, 61))
LEAF_S = [(32, 31)] + cubic((32, 31), (25, 31.5), (21.5, 27.5), (21.5, 21.5)) + cubic((21.5, 21.5), (28, 21.5), (32, 25), (32, 31))
LEAF_B = [(32, 27)] + cubic((32, 27), (32.5, 19.5), (37, 15.5), (43, 15.5)) + cubic((43, 15.5), (43, 22.5), (38.5, 27), (32, 27))

def mask(px, shapes, scale, stem=False):
    W = px * SS
    m = Image.new('L', (W, W), 0)
    d = ImageDraw.Draw(m)
    k = W / 64 * scale
    off = W / 2 - 32 * k
    tr = lambda pts: [(off + x * k, off + y * k) for x, y in pts]
    for s in shapes:
        d.polygon(tr(s), fill=255)
    if stem:
        (x0, y0), (x1, y1) = tr([(32, 38), (32, 26)])
        r = 1.7 * k
        d.rectangle([x0 - r, y1, x0 + r, y0], fill=255)
        for y in (y0, y1):
            d.ellipse([x0 - r, y - r, x0 + r, y + r], fill=255)
    return m

def render(name, px, scale, layers, bg=None):
    W = px * SS
    img = Image.new('RGBA', (W, W), bg + (255,) if bg else (0, 0, 0, 0))
    pin = mask(px, [PIN], scale)
    seed = mask(px, [LEAF_S, LEAF_B], scale, stem=True)
    for what, color in layers:
        if what == 'pin': m = pin
        elif what == 'seed': m = seed
        else:  # pin with the seedling cut out
            m = Image.composite(Image.new('L', (W, W), 0), pin, seed)
        img.paste(Image.new('RGBA', (W, W), color + (255,)), (0, 0), m)
    img.resize((px, px), Image.LANCZOS).save(OUT / name, optimize=True)
    print('wrote', name)

color = [('pin', GREEN), ('seed', WHITE)]
render('icon.png', 1024, 0.62, color, bg=NAVY)
render('android-icon-foreground.png', 1024, 0.5, color)
render('android-icon-background.png', 1024, 1, [], bg=NAVY)
render('android-icon-monochrome.png', 1024, 0.5, [('cut', WHITE)])
render('splash-icon.png', 512, 1, color)
render('favicon.png', 48, 1, color)
render('logo-mark@1024.png', 1024, 1, color)
render('logo-mark-reverse@1024.png', 1024, 1, [('pin', WHITE), ('seed', GREEN)])
