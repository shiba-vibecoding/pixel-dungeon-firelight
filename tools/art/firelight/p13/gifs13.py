# Firelight · part 13: the sheets alive — one GIF a group (quest, places, minor, glyphs, arena), every effect of the group in its cell
# playing at its own fps, x3, on the dark ground; the additive ones added as the game adds them. Then the portraits x4.
import json, math, os, sys
from PIL import Image, ImageDraw
from px import OUT, add_over, x_n

DST = sys.argv[1] if len(sys.argv) > 1 else OUT + 'gifs/'
GROUPS = {'quest': 'quest.', 'places': 'place.', 'minor': ('minor.', 'status.'), 'glyphs': 'glyph.', 'arena': 'arena.'}
STEP = 50                     # ms a GIF frame
LEN = 2400                    # ms a loop


def cell_frames(d):
    im = Image.open(OUT + d['sheet']).convert('RGBA')
    return [im.crop((f * d['w'], d['row'] * d['h'], (f + 1) * d['w'], (d['row'] + 1) * d['h'])) for f in range(d['frames'])]


def group_gif(name, prefix, fx, scale=3):
    ids = [k for k in fx if k.startswith(prefix)]
    cw, ch = 64, 64
    cols = 6 if len(ids) > 6 else len(ids)
    rows_ = math.ceil(len(ids) / cols)
    frames = {k: cell_frames(fx[k]) for k in ids}
    out = []
    for t in range(0, LEN, STEP):
        bg = Image.new('RGBA', (cols * cw * scale, rows_ * ch * scale), (18, 19, 16, 255))
        d = ImageDraw.Draw(bg)
        for i, k in enumerate(ids):
            e = fx[k]; fr = frames[k]
            n = int(t / 1000 * e['fps'])
            idx = n % len(fr) if e.get('loop') else min(n % (len(fr) + 6), len(fr) - 1)    # one-shots hold their last frame a moment
            im = x_n(fr[idx], scale)
            x = (i % cols) * cw * scale + (cw * scale - im.width) // 2; y = (i // cols) * ch * scale + (ch * scale - im.height) // 2
            d.rectangle(((i % cols) * cw * scale, (i // cols) * ch * scale, (i % cols + 1) * cw * scale - 1, (i // cols + 1) * ch * scale - 1), outline=(40, 38, 32))
            if e['blend'] == 'add':
                region = bg.crop((x, y, x + im.width, y + im.height)); bg.paste(add_over(region, im), (x, y))
            else: bg.alpha_composite(im, (x, y))
        out.append(bg.convert('RGB'))
    pal = out[len(out) // 2].quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in out]
    os.makedirs(DST, exist_ok=True)
    q[0].save(DST + f'{name}.gif', save_all=True, append_images=q[1:], duration=STEP, loop=0, disposal=1)
    return ids


if __name__ == '__main__':
    fx = json.load(open(OUT + 'fx/fx.json'))['fx']
    legend = {}
    for name, prefix in GROUPS.items():
        legend[name] = group_gif(name, prefix, fx)
    json.dump(legend, open(DST + 'legend.json', 'w'), indent=1)
    p = Image.open(OUT + 'ui/quest/portraits.png'); bg = Image.new('RGBA', p.size, (34, 30, 26, 255)); bg.alpha_composite(p)
    x_n(bg, 4).save(DST + 'portraits-x4.png', optimize=True)
    print({k: len(v) for k, v in legend.items()})
