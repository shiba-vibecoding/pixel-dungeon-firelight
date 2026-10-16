# Firelight · part 8: the Pixel-Mart looks (part 5) for the new facings. Part 5's own recolour is run on the front and back
# sheets: its themes and recolour() are taken from tools/art/firelight/p5/looks.py itself (the definitions above its build
# loop), with the class sheet swapped for the facing's. 20 looks and 4 legendary ones (sheet + glow mask; the aura is the same
# 8 sparks of part 5 in every facing).
import os, sys
import c8
from c8 import CLASSES, save

sys.path.insert(0, c8.P5)
os.environ.setdefault('PD_ASSETS', c8.SRC.rstrip('/'))
import common as p5c                                         # noqa: E402 (part 5 helpers)
p5c.SRC = c8.SRC


def part5_looks():
    src = open(os.path.join(c8.P5, 'looks.py'), encoding='utf-8').read()
    ns = {'__name__': 'p5looks'}
    exec(compile(src.split('\ncatalog = []')[0], 'p5/looks.py', 'exec'), ns)   # THEMES, LEGEND, recolour (no files written)
    return ns


def main():
    L = part5_looks(); from PIL import Image
    for facing in ('front', 'back'):
        for cls in CLASSES:
            sheet = Image.open(c8.OUT + f'dirs/{cls}-{facing}.png').convert('RGBA')
            L['hero'] = lambda _c, s=sheet: s.copy()
            for key, th in L['THEMES'].items():
                im, _ = L['recolour'](cls, th); save(im, f'mart/fl/looks/{cls}-{key}-{facing}.png')
            lg = L['LEGEND'][cls]; im, glow = L['recolour'](cls, lg)
            save(im, f'mart/fl/legendary/{cls}-{lg["id"]}-{facing}.png'); save(glow, f'mart/fl/legendary/{cls}-{lg["id"]}-glow-{facing}.png')
    print('looks ok')


if __name__ == '__main__':
    main()
