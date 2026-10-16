# Part 1 · brand files: logos, the mark, favicons, the bot avatar, the loader sheet and its CSS.
import os, math, random, numpy as np
from PIL import Image
from brand import lockup, square, campfire, spark_px, caps, FIRE, wordmark, i_cols, logs, flame, outline
OUT = '/home/claude/firelight/p1/out/'
B = OUT + 'packages/client/public/assets/brand/'; PUB = OUT + 'packages/client/public/'
for d in (B, PUB + 'icons/', OUT + 'docs/telegram/', OUT + 'docs/github/'): os.makedirs(d, exist_ok=True)
VOID = (11, 11, 9, 255)
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
def up(im, k): return im.resize((im.width * k, im.height * k), Image.NEAREST)
def on(im, bg=VOID, pad=0):
    b = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), bg); b.alpha_composite(im, (pad, pad)); return b

# 1. logos: 1x art (for the game, scaled with image-rendering: pixelated) and x4 for docs; transparent and on void
for lang in ('en', 'ru'):
    lk = lockup(lang); lk.save(B + f'logo-{lang}.png', optimize=True)
    up(lk, 4).save(B + f'logo-{lang}@4x.png', optimize=True)
    up(on(lk, pad=6), 4).save(B + f'logo-{lang}-dark@4x.png', optimize=True)
    sq = square(lang); sq.save(B + f'logo-square-{lang}.png', optimize=True)
    up(sq, 4).save(B + f'logo-square-{lang}@4x.png', optimize=True)
cf = campfire(); cf.save(B + 'mark.png', optimize=True); up(cf, 4).save(B + 'mark@4x.png', optimize=True)
wordmark().save(B + 'wordmark.png', optimize=True)

# 2. the round-friendly mark on void with the fire's light: favicons (32, 64, 180), app icon and bot avatar (512)
def glow_disc(n, cx, cy, r, col=FIRE['flame'], k=1.0):
    a = np.zeros((n, n, 4), np.int32); a[..., :3] = VOID[:3]; a[..., 3] = 255
    for y in range(n):
        for x in range(n):
            d = math.hypot(x + .5 - cx, (y + .5 - cy) * 1.1) / r; th = (BAYER[y % 4][x % 4] + .5) / 16
            v = .22 if d < .45 else (.22 if th < .5 else .12) if d < .55 else .12 if d < .75 else (.12 if th < .4 else .05) if d < .85 else .05 if d < .97 else 0
            a[y, x, :3] = np.minimum(255, a[y, x, :3] + np.array(col) * v * k)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')
def icon(n, sparks=True):
    im = glow_disc(n, n / 2, n / 2 + 3, n * 0.47, k=1.7)
    m = campfire()
    x, y = (n - m.width) // 2, (n - m.height) // 2 + (1 if n >= 32 else 0)
    im.alpha_composite(m, (x, y))
    if sparks and n >= 32:
        for sx, sy, k in [(x + 4, y + 2, 1), (x + 15, y + 0, 2), (x + 17, y + 5, 1)]: spark_px(im, sx, sy, k)
    return im
ic32 = icon(32); ic32.save(PUB + 'favicon-32.png', optimize=True)
up(ic32, 2).save(PUB + 'favicon-64.png', optimize=True)
up(icon(36), 5).save(PUB + 'icons/apple-touch-icon-180.png', optimize=True)
up(ic32, 16).save(PUB + 'icons/icon-512.png', optimize=True)
up(ic32, 6).save(PUB + 'icons/icon-192.png', optimize=True)
up(ic32, 16).convert('RGB').save(OUT + 'docs/telegram/bot-avatar-512.png', optimize=True)

# 3. the loader: an ember, a flame, sparks flying into the letters, the word lit, the name; 14 frames x 100 ms = 1.4 s
def loader_frames():
    base = lockup('en', sparks=False)
    W, H = base.size
    cfw = campfire().width
    x0 = cfw + 2; top = 9
    wm_full = wordmark(); wm_dark = wordmark(lit=0.0, dots=False)
    frames = []
    rnd = random.Random(3)
    plan = [  # (ember glow, flame rows, fire frame, reveal 0..1, caps alpha, dots)
        (0.35, 0, 0, 0, 0, 0), (0.7, 0, 0, 0, 0, 0), (1, 4, 1, 0, 0, 0), (1, 9, 2, 0, 0, 0), (1, 14, 3, 0, 0, 0), (1, 17, 4, 0, 0, 0),
        (1, 17, 5, .15, 0, 0), (1, 17, 0, .38, 0, 0), (1, 17, 1, .62, 0, 0), (1, 17, 2, .86, 0, 1), (1, 17, 3, 1, 1, 1),
        (1, 17, 4, 1, 1, 2), (1, 17, 5, 1, 1, 1), (0.6, 8, 0, 1, .5, 0),
    ]
    for i, (glow, rows, fr, rev, cap, dots) in enumerate(plan):
        im = Image.new('RGBA', (W, H))
        if cap: 
            cp = caps('PIXEL DUNGEON')
            if cap < 1: cp = Image.fromarray((np.array(cp) * [1, 1, 1, cap]).astype(np.uint8))
            im.alpha_composite(cp, (W - cp.width - 1, 0))
        base_y = top + 1 + 15
        c = Image.new('RGBA', (19, 26))
        if rows: c.alpha_composite(outline(np.array(flame(fr, rows).crop((0, 0, 13, 17))))[0:20, 0:16] if False else Image.new('RGBA', (1, 1)), (0, 0))
        mark = Image.new('RGBA', (17, 24))
        if rows: mark.alpha_composite(flame(fr, rows), (2, 0))
        mark.alpha_composite(logs(glow), (0, 14))
        mark = Image.fromarray(outline(np.array(mark)), 'RGBA')
        im.alpha_composite(mark, (0, base_y - mark.height + 3))
        # the word: dark until lit, then column by column from the left as the sparks land
        if rev > 0:
            wd = np.array(wm_dark); wf = np.array(wm_full) if dots else np.array(wordmark(dots=False))
            cut = int(round(rev * wd.shape[1]))
            w = wd.copy(); w[:, :cut] = wf[:, :cut]
            if rev < 1: w[..., 3] = np.where(np.arange(w.shape[1])[None, :] < cut, w[..., 3], (w[..., 3] * 0.6).astype(np.uint8))
            im.alpha_composite(Image.fromarray(w, 'RGBA'), (x0, top))
            if rev < 1:   # sparks on the front
                for k in range(3):
                    sx = x0 + cut + rnd.randint(-1, 1); sy = top + rnd.randint(3, 17)
                    spark_px(im, sx, sy, 0 if k == 0 else 1)
                # and sparks in the air between the fire and the front
                for k in range(3):
                    t = (k + 1) / 4; sx = int(9 + (x0 + cut - 9) * t); sy = int(base_y - 22 - 6 * math.sin(math.pi * t))
                    spark_px(im, sx, max(0, sy + rnd.randint(-1, 1)), 1 if k % 2 else 2)
        elif rows >= 14:
            for k in range(2): spark_px(im, 8 + k * 3, base_y - 24 - k * 2, 2)
        if dots == 2:   # the dots twinkle
            for xi in i_cols(): spark_px(im, x0 + 1 + xi + 1, top + 1 + 2, 0); spark_px(im, x0 + 1 + xi + 1, top - 1, 1)
        frames.append(im)
    return frames
fr = loader_frames(); W, H = fr[0].size
sheet = Image.new('RGBA', (W * len(fr), H))
for i, f in enumerate(fr): sheet.alpha_composite(f, (i * W, 0))
sheet.save(B + 'loader.png', optimize=True)
n = len(fr)
css = f'''/* Firelight loader (design part 1): an ember, a flame, sparks flying into the letters; {n} frames x 100 ms = {n / 10:.1f} s, looping.
   Sheet: assets/brand/loader.png, {n} frames of {W}x{H} art pixels side by side. Scale with --fl-s (whole numbers keep the pixels crisp). */
.fl-loader {{
  --fl-s: 4;
  width: calc({W}px * var(--fl-s)); height: calc({H}px * var(--fl-s));
  background: url("loader.png") 0 0 / calc({W * n}px * var(--fl-s)) calc({H}px * var(--fl-s)) no-repeat;
  image-rendering: pixelated;
  animation: fl-loader {n / 10:.1f}s steps({n}) infinite;
}}
@keyframes fl-loader {{ to {{ background-position: calc(-{W * n}px * var(--fl-s)) 0; }} }}
@media (prefers-reduced-motion: reduce) {{ .fl-loader {{ animation: none; background-position: calc(-{W * 10}px * var(--fl-s)) 0; }} }}
'''
open(B + 'loader.css', 'w').write(css)
# loader preview gif x4 on void
gf = [up(on(f, pad=4), 4).convert('RGB') for f in fr]
big = Image.new('RGB', (gf[0].width, gf[0].height * n))
for i, g in enumerate(gf): big.paste(g, (0, i * g.height))
pal = big.quantize(colors=128, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
q = [g.quantize(palette=pal, dither=Image.Dither.NONE) for g in gf]
os.makedirs(OUT + 'docs/design/previews/firelight/', exist_ok=True)
q[0].save(OUT + 'docs/design/previews/firelight/loader-x4.gif', save_all=True, append_images=q[1:], duration=100, loop=0)
print('brand ok', W, H, n)
