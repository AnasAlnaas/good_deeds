# Regenerates assets/brand from the logo geometry in scripts/brand-tree.json,
# which holds the same paths as src/components/brand/geometry.ts (both traced
# from assets/brand/logo-source.jpg). Change them together.
# Run from mobile/:  python scripts/make-brand-assets.py   (needs Pillow)
import json, pathlib, re
from PIL import Image, ImageChops, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / 'assets' / 'brand'
OUT.mkdir(parents=True, exist_ok=True)
G = json.loads((HERE / 'brand-tree.json').read_text(encoding='utf-8'))

# The palette (src/theme/tokens.ts).
FOREST = '#1E5E3B'  # the tree; brandGreen / primary
SAGE = '#9BB896'    # the ring; brandSage
GOLD = '#CDA650'    # accent
PAPER = '#F4F0E6'   # the page; surfaceAlt
WHITE = '#FFFFFF'

def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

RING, BADGE, TREE = G['ring'], G['badge'], G['tree_box']
TREE_PATHS = [G['body']] + [l['d'] for l in G['leaves']]

# ---- SVG files
def tree_svg(color):
    return ''.join(f'<path d="{d}" fill="{color}" fill-rule="evenodd"/>' for d in TREE_PATHS)

def ring_svg(color, width=None, opacity=1):
    op = f' stroke-opacity="{opacity}"' if opacity != 1 else ''
    return (f'<circle cx="{RING["cx"]}" cy="{RING["cy"]}" r="{RING["r"]}" fill="none" stroke="{color}" '
            f'stroke-width="{width or RING["width"]}"{op}/>')

def svg(body, box, bg=None):
    x, y, s = box
    back = f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {s} {s}">{back}{body}</svg>\n'

# The app icon: cream tree and a gold ring on forest, with room around the ring.
ICON_BOX = (RING['cx'] - 512, RING['cy'] - 512, 1024)
ICON_RING_W = RING['width'] * 1.4
files = {
    'logo-mark.svg': svg(ring_svg(SAGE) + tree_svg(FOREST), BADGE),
    'logo-mark-reverse.svg': svg(ring_svg(PAPER, opacity=0.55) + tree_svg(PAPER), BADGE),
    'logo-mark-mono-forest.svg': svg(ring_svg(FOREST) + tree_svg(FOREST), BADGE),
    'logo-mark-mono-white.svg': svg(ring_svg(WHITE) + tree_svg(WHITE), BADGE),
    'logo-tree.svg': svg(tree_svg(FOREST), TREE),
    'app-icon.svg': svg(ring_svg(GOLD, ICON_RING_W) + tree_svg(PAPER), ICON_BOX, bg=FOREST),
}
for old in ('logo-mark-mono-navy.svg',):
    (OUT / old).unlink(missing_ok=True)
for n, s in files.items():
    (OUT / n).write_text(s, encoding='utf-8')
    print('wrote', n)

# ---- PNG files: the paths flattened to polygons, 4x supersampled, real alpha.
SS = 4

def subpaths(dstr):
    toks = re.findall(r'[MLCZ]|-?\d+(?:\.\d+)?', dstr)
    i, cur, pts, out = 0, (0.0, 0.0), [], []
    while i < len(toks):
        t = toks[i]; i += 1
        if t == 'M':
            cur = (float(toks[i]), float(toks[i + 1])); i += 2; pts = [cur]
        elif t == 'L':
            cur = (float(toks[i]), float(toks[i + 1])); i += 2; pts.append(cur)
        elif t == 'C':
            p = [cur] + [(float(toks[i + k]), float(toks[i + k + 1])) for k in (0, 2, 4)]; i += 6
            for k in range(1, 13):
                s = k / 12
                pts.append(tuple((1 - s) ** 3 * a + 3 * (1 - s) ** 2 * s * b + 3 * (1 - s) * s ** 2 * c + s ** 3 * e for a, b, c, e in zip(*p)))
            cur = p[3]
        elif t == 'Z':
            out.append(pts)
    return out

TREE_POLYS = [sp for d in TREE_PATHS for sp in subpaths(d)]

def tree_mask(W, place):
    """The tree as an even-odd mask, with `place` mapping logo coordinates to pixels."""
    m = Image.new('1', (W, W), 0)
    for sp in TREE_POLYS:
        one = Image.new('1', (W, W), 0)
        ImageDraw.Draw(one).polygon([place(x, y) for x, y in sp], fill=1)
        m = ImageChops.logical_xor(m, one)
    return m.convert('L')

def ring_mask(W, place, k, width):
    m = Image.new('L', (W, W), 0)
    cx, cy = place(RING['cx'], RING['cy'])
    r, w = RING['r'] * k, width * k
    ImageDraw.Draw(m).ellipse((cx - r - w / 2, cy - r - w / 2, cx + r + w / 2, cy + r + w / 2), outline=255, width=max(1, round(w)))
    return m

def render(name, px, layers, *, box, fill=1.0, bg=None):
    """`box` (x, y, side) in logo coordinates fills `fill` of the image, centred.
    layers: ('tree', color) or ('ring', color, width)."""
    W = px * SS
    x0, y0, side = box
    k = W * fill / side
    off = W * (1 - fill) / 2
    place = lambda x, y: (off + (x - x0) * k, off + (y - y0) * k)
    img = Image.new('RGBA', (W, W), rgb(bg) + (255,) if bg else (0, 0, 0, 0))
    for layer in layers:
        if layer[0] == 'tree':
            m = tree_mask(W, place)
        else:
            m = ring_mask(W, place, k, layer[2] if len(layer) > 2 else RING['width'])
        img.paste(Image.new('RGBA', (W, W), rgb(layer[1]) + (255,)), (0, 0), m)
    img.resize((px, px), Image.LANCZOS).save(OUT / name, optimize=True)
    print('wrote', name)

BADGE_T = tuple(BADGE)
TREE_T = tuple(TREE)
icon = [('ring', GOLD, ICON_RING_W), ('tree', PAPER)]
color = [('ring', SAGE), ('tree', FOREST)]

# Launcher icon (iOS and the store): the ring fills 80% of the square.
render('icon.png', 1024, icon, box=BADGE_T, fill=0.8, bg=FOREST)
# Android adaptive icon: the launcher crops to a circle or squircle inside the
# middle 66/108 of the canvas, so the ring stays within ~58%.
render('android-icon-foreground.png', 1024, icon, box=BADGE_T, fill=0.58)
render('android-icon-background.png', 1024, [], box=BADGE_T, bg=FOREST)
render('android-icon-monochrome.png', 1024, [('tree', WHITE)], box=TREE_T, fill=0.5)
# Splash: the colour mark on the cream page (app.json backgroundColor).
render('splash-icon.png', 512, color, box=BADGE_T)
# Browser tab: the tree alone reads better than the ring at 48 px.
render('favicon.png', 48, [('tree', FOREST)], box=TREE_T, fill=0.94)
# Android status bar: a white silhouette on transparent (the system tints it).
render('notification-icon.png', 96, [('tree', WHITE)], box=TREE_T, fill=0.86)
render('logo-mark@1024.png', 1024, color, box=BADGE_T)
render('logo-mark-reverse@1024.png', 1024, [('ring', PAPER), ('tree', PAPER)], box=BADGE_T)
