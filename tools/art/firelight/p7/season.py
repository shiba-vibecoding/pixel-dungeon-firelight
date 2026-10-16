# Firelight · part 7: the season's cup and the season's profile frame, as templates. The template is drawn in four exact greys
# (KEYS) that the season's palette replaces (four shades, light to deep): code recolours it at load (a canvas pass, see
# migration-p7.md), and the PNG of each season is also written. Outline, glints and the flame emblem keep their colours.
import json
from PIL import Image
import c7
from c7 import hx, grid, save, out, strip, to_hex

KEYS = ['#e0e0e0', '#a0a0a0', '#606060', '#303030']
SEASONS = [   # id, name, the palette (light .. deep); a new season adds a line, nothing else changes
    dict(id='s1', en='Embers of the Deep', ru='Угли глубин', palette=['#ffd08a', '#ff9a3a', '#c8501a', '#6e1e10']),
    dict(id='s2', en='Frost of the Caves', ru='Иней пещер', palette=['#e4f8ff', '#8ad0f0', '#3a86c0', '#1a3a6a']),
    dict(id='s3', en='Moss of the Sewers', ru='Мох стоков', palette=['#d8f8a0', '#8adc5a', '#3a8a3a', '#163a1a']),
    dict(id='s4', en='Shadow of the Halls', ru='Тень залов', palette=['#ecd4ff', '#b48aff', '#6a3ab8', '#2a1250']),
]
FIX = dict(o=hx('#0b0b09'), w=hx('#ffffff'), y=hx('#ffcc66'), l=hx('#fff6c8'), f=hx('#ff9a3a'))
TPL = {k: hx(KEYS[i]) for i, k in enumerate('abcd')}

CUP = [   # 20 x 20: two handles, the bowl with a flame emblem, the stem, the plinth (the season's number is written on it by code)
    '...oooooooooooooo...',
    '..oaaaaaaaaaaaaabo..',
    '.oooabbbbbbbbbbcooo.',
    'oaa.oabbbbylbbbco.co',
    'oa.oabbbbyllbbbbco.o',
    'oa.oabbbbylfybbbco.o',
    'oaa.oabbbyfffbbco.co',
    '.oaaoabbbbyfybbcoco.',
    '..oo.oabbbbbbbco.oo.',
    '......oabbbbbco.....',
    '.......oabbbco......',
    '........oabco.......',
    '.........obo........',
    '.........obo........',
    '........oabco.......',
    '......ooabbbcoo.....',
    '.....oaaaaaaaaco....',
    '....occcccccccccco..',
    '....oddddddddddddo..',
    '.....oooooooooooo...',
]
FRAME_CORNER = ['wa.', 'ab.', '...']


def frame_tpl():
    n, sl = 14, 4; im = Image.new('RGBA', (n, n), (0, 0, 0, 0)); px = im.load(); keys = [TPL[k] for k in 'abcd']
    for y in range(n):
        for x in range(n):
            d = min(x, y, n - 1 - x, n - 1 - y)
            if d >= sl: continue
            if d == 0: c = FIX['o']
            elif d == sl - 1: c = FIX['o']
            else:
                lit = 1 - (x + y) / (2 * n); c = keys[min(3, int((1 - lit) * 4))]
                if d == 1 and (x + y) % 4 == 0: c = keys[0]          # a stitched highlight round the outer edge
            px[x, y] = c + (255,)
    c = grid(FRAME_CORNER, dict(w=FIX['w'], a=TPL['a'], b=TPL['b']))
    for cx, cy, fx, fy in ((0, 0, 0, 0), (n - 3, 0, 1, 0), (0, n - 3, 0, 1), (n - 3, n - 3, 1, 1)):
        cc = c.transpose(Image.FLIP_LEFT_RIGHT) if fx else c; cc = cc.transpose(Image.FLIP_TOP_BOTTOM) if fy else cc
        im.alpha_composite(cc, (cx, cy))
    for x, y in ((6, 0), (7, 0), (6, 13), (7, 13)): px[x, y] = FIX['y'] + (255,)        # a gold stud top and bottom
    return im


def cup_tpl(): return grid(CUP, dict(TPL, **FIX))


def recolour(im, palette):
    im = im.copy(); px = im.load(); m = {hx(k): hx(v) for k, v in zip(KEYS, palette)}
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] and p[:3] in m: px[x, y] = m[p[:3]] + (p[3],)
    return im


def main():
    cup, fr = cup_tpl(), frame_tpl()
    save(cup, 'season/cup-template.png'); save(fr, 'season/frame-template.png')
    for s in SEASONS:
        save(recolour(cup, s['palette']), f'season/cup-{s["id"]}.png'); save(recolour(fr, s['palette']), f'season/frame-{s["id"]}.png')
    data = dict(template=dict(keys=KEYS, cup='compete/season/cup-template.png', frame=dict(sprite='compete/season/frame-template.png', slice=4),
                              note='replace each key grey by the palette shade of the same index; other colours stay'),
                seasons=[dict(id=s['id'], name=dict(en=s['en'], ru=s['ru']), palette=s['palette'], cup=f'compete/season/cup-{s["id"]}.png',
                              frame=dict(sprite=f'compete/season/frame-{s["id"]}.png', slice=4)) for s in SEASONS])
    json.dump(data, open(out('season/seasons.json'), 'w'), ensure_ascii=False, indent=1)
    print('season ok')


if __name__ == '__main__':
    main()
