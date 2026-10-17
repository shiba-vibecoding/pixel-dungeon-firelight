# Firelight · part 11: the GIFs of the moments, from frames named <name>-0000.png ... (one shared palette, no dither).
import os, re, sys
from collections import defaultdict
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
STEP = {'shine-A-tiers': 50, 'shine-B-tiers': 40, 'shine-C-magic': 100, 'shine-A-magic': 60}
groups = defaultdict(list)
for f in sorted(os.listdir(src)):
    m = re.match(r'(.+)-(\d{4})\.png$', f)
    if m: groups[m.group(1)].append(os.path.join(src, f))
for name, files in sorted(groups.items()):
    frames = [Image.open(f).convert('RGB') for f in files]
    if name.startswith('shine'):
        frames = [im.resize((im.width * 3 // 4, im.height * 3 // 4), Image.NEAREST) if im.width > 700 else im for im in frames]
    w, h = frames[0].size
    strip = Image.new('RGB', (w, h * min(len(frames), 8)))
    for i, im in enumerate(frames[:: max(1, len(frames) // 8)][:8]): strip.paste(im, (0, i * h))
    pal = strip.quantize(colors=200, method=Image.Quantize.MEDIANCUT)
    q = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in frames]
    # the bloom of the 3D view stirs every pixel a little each frame: what changes less than this stays as it was (smaller GIFs)
    import numpy as np
    keep, prev_rgb = [q[0]], np.asarray(frames[0], dtype=np.int16)
    for im, qi in zip(frames[1:], q[1:]):
        rgb = np.asarray(im, dtype=np.int16)
        still = np.abs(rgb - prev_rgb).sum(axis=2) < 36
        idx = np.asarray(qi).copy(); last = np.asarray(keep[-1])
        idx[still] = last[still]
        prev_rgb = np.where(still[..., None], prev_rgb, rgb)
        n = Image.fromarray(idx.astype(np.uint8), 'P'); n.putpalette(qi.getpalette()); keep.append(n)
    q = keep
    step = STEP.get(name, 33)
    dur = [step] * len(q)
    if not name.startswith('shine'): dur[-1] = 900   # the end state held: what the player is left with
    q[0].save(os.path.join(dst, f'{name}.gif'), save_all=True, append_images=q[1:], duration=dur, loop=0, optimize=False, disposal=1)
    print(name, len(q), os.path.getsize(os.path.join(dst, f'{name}.gif')) // 1024, 'KB')
