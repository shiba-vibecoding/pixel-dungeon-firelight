# Firelight · part 7: the weekly leagues. Five tiers, Spark -> Coal -> Flame -> Bonfire -> Beacon («Искра -> Уголь -> Пламя ->
# Костёр -> Маяк»). Per tier: a profile frame 14 x 14 (border-image slice 4, the format of mart/frame-*.png; the Beacon's also
# animated, 4 frames in a row 56 x 14: a beam of light running round the ring), a badge 16 x 16 and a mini badge 9 x 9 for rows.
import json
from PIL import Image
import c7
from c7 import hx, grid, save, out, strip, mix

TIERS = [   # key, en, ru, rim (light, mid, dark, deep), accent, corner art (3 x 3)
    dict(key='spark', en='Spark', ru='Искра', band=['#a8a296', '#7e796e', '#5a564e', '#3a3832'], outer='#14120e', accent='#ffb02e',
         corner=(['y..', '...', '...'], dict(y='#ffcc66'))),
    dict(key='coal', en='Coal', ru='Уголь', band=['#4a3a34', '#33282a', '#241c1e', '#161012'], outer='#0a0606', accent='#e8441f',
         corner=(['rr.', 'r..', '...'], dict(r='#e8441f')), spots=(9, ['#b22a2a', '#e8641f', '#ff9a3a'])),
    dict(key='flame', en='Flame', ru='Пламя', band=['#ffb02e', '#e8641f', '#b22a2a', '#6e161a'], outer='#1a0a06', accent='#ff9a3a',
         corner=(['ly.', 'y..', '...'], dict(l='#fff6c8', y='#ffcc66'))),
    dict(key='bonfire', en='Bonfire', ru='Костёр', band=['#ffe48a', '#ffb02e', '#c86a1a', '#7a3a10'], outer='#1e1004', accent='#ffcc66',
         corner=(['llb', 'lyb', 'bb.'], dict(l='#fff6c8', y='#ffcc66', b='#7a4a24'))),
    dict(key='beacon', en='Beacon', ru='Маяк', band=['#fff2c0', '#e8c870', '#b08a3a', '#6a4a18'], outer='#1a1406', accent='#bff4ff',
         corner=(['ww.', 'wc.', '...'], dict(w='#ffffff', c='#bff4ff')), anim=True),
]

ICONS = {   # 10 x 10 on the badge plate; y gold, l light, o flame, r coal red, k coal, b/c logs and stone, w white, s sky
    'spark':   ['....l.....', '....l.....', '..l.y.l...', '...yyy....', 'lyyylyyyl.', '...yyy....', '..l.y.l...', '....l.....', '....l.....', '..........'],
    'coal':    ['..........', '...gggg...', '..ggrkkk..', '.gkrokrkk.', '.grkoyokk.', '.kkokrkrk.', '..kkrokk..', '...kkkk...', '..........', '..........'],
    'flame':   ['....y.....', '....yo....', '...yoo....', '...yooo...', '..yoloor..', '..olllor..', '.rollllor.', '.rolllor..', '..rooor...', '...rrr....'],
    'bonfire': ['....l.....', '...yo.....', '...yoo....', '..yolor...', '..ollloy..', '.rollllor.', '..rooor...', 'bbbbbbbbb.', '.cbcbbcbc.', '..c....c..'],
    'beacon':  ['s..lll..s.', '.s.lyl.s..', '...ccc....', '..ddddd...', '...www....', '...rrr....', '...www....', '..rrrrr...', '..wwwww...', '.ddddddd..'],
}
IPAL = dict(y=hx('#ffcc66'), l=hx('#fff6c8'), o=hx('#ff9a3a'), r=hx('#b22a2a'), k=hx('#2a2224'), g=hx('#5a4a44'), b=hx('#8a5a30'), c=hx('#6a6c66'), d=hx('#3a3c38'),
            w=hx('#ffffff'), s=hx('#bff4ff'))
MINI = {   # 9 x 9: the plate and its fire at a glance
    'spark':   ['...y.....', '..yly....', '...y.....'],
    'coal':    ['..ggk....', '.groyk...', '..kkk....'],
    'flame':   ['...y.....', '..yoo....', '..olo....', '..ror....'],
    'bonfire': ['...y.....', '..yoo....', '..olo....', '.bbbbb...'],
    'beacon':  ['s.l.s....', '.ddd.....', '..r......', '.www.....'],
}


def ring(t, sweep=None):
    """The frame: 14 x 14, ring 4 wide, lit from the top-left; sweep = position 0..1 of the Beacon's running light."""
    n, sl = 14, 4; cs = [hx(c) for c in t['band']]; im = Image.new('RGBA', (n, n), (0, 0, 0, 0)); px = im.load()
    per = []
    for y in range(n):
        for x in range(n):
            d = min(x, y, n - 1 - x, n - 1 - y)
            if d >= sl: continue
            if d == 0: c = hx(t['outer'])
            elif d == sl - 1: c = hx('#0b0b09')
            else:
                lit = 1 - (x + y) / (2 * n); c = cs[min(3, int((1 - lit) * 4))]
            px[x, y] = c + (255,)
            if 0 < d < sl - 1: per.append((x, y))
    if t.get('spots'):
        import random
        r = random.Random(7)
        for _ in range(t['spots'][0]):
            x, y = per[r.randrange(len(per))]; px[x, y] = hx(r.choice(t['spots'][1])) + (255,)
    if sweep is not None:      # a short bright arc running clockwise round the ring
        import math
        for x, y in per:
            a = (math.atan2(y - 6.5, x - 6.5) / (2 * math.pi) + 0.25) % 1
            dd = min(abs(a - sweep), 1 - abs(a - sweep))
            if dd < 0.07: px[x, y] = hx('#ffffff') + (255,)
            elif dd < 0.15: px[x, y] = hx('#bff4ff') + (255,)
    c = grid(t['corner'][0], {k: hx(v) for k, v in t['corner'][1].items()})
    for cx, cy, fx, fy in ((0, 0, 0, 0), (n - 3, 0, 1, 0), (0, n - 3, 0, 1), (n - 3, n - 3, 1, 1)):
        cc = c.transpose(Image.FLIP_LEFT_RIGHT) if fx else c; cc = cc.transpose(Image.FLIP_TOP_BOTTOM) if fy else cc
        im.alpha_composite(cc, (cx, cy))
    return im


def plate(t, size=16):
    """An octagonal plate of the tier's colours with a dark outline; the icon sits on it."""
    cs = [hx(c) for c in t['band']]; im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); px = im.load(); cut = 4 if size == 16 else 2
    for y in range(size):
        for x in range(size):
            if x + y < cut or (size - 1 - x) + y < cut or x + (size - 1 - y) < cut or (size - 1 - x) + (size - 1 - y) < cut: continue
            edge = (x + y == cut or (size - 1 - x) + y == cut or x + (size - 1 - y) == cut or (size - 1 - x) + (size - 1 - y) == cut or x in (0, size - 1) or y in (0, size - 1))
            if edge: px[x, y] = hx(t['outer']) + (255,)
            else:
                inner = min(x, y, size - 1 - x, size - 1 - y) >= 2 and x + y > cut + 1 and (size - 1 - x) + y > cut + 1 and x + (size - 1 - y) > cut + 1 and (size - 1 - x) + (size - 1 - y) > cut + 1
                px[x, y] = (mix(cs[3], hx('#0b0b09'), 0.45) if inner else (cs[0] if y < size / 2 else cs[2])) + (255,)
    return im


def badge(t):
    im = plate(t); ic = grid(ICONS[t['key']], IPAL); im.alpha_composite(ic, (3, 3)); return im


def mini(t):
    im = plate(t, 9); ic = grid(MINI[t['key']], IPAL); im.alpha_composite(ic, (2, 2 + (4 - len(MINI[t['key']])) // 2 + 1)); return im


def main():
    data = []
    for i, t in enumerate(TIERS):
        save(ring(t), f'league/frame-{t["key"]}.png'); save(badge(t), f'league/badge-{t["key"]}.png'); save(mini(t), f'league/mini-{t["key"]}.png')
        e = dict(key=t['key'], tier=i + 1, name=dict(en=t['en'], ru=t['ru']), color=t['band'][1], accent=t['accent'],
                 frame=dict(sprite=f'compete/league/frame-{t["key"]}.png', slice=4), badge=f'compete/league/badge-{t["key"]}.png', mini=f'compete/league/mini-{t["key"]}.png')
        if t.get('anim'):
            save(strip([ring(t, k / 4) for k in range(4)]), f'league/frame-{t["key"]}-anim.png')
            e['frame']['anim'] = dict(sheet=f'compete/league/frame-{t["key"]}-anim.png', frames=4, ms=160)
        data.append(e)
    json.dump(data, open(out('league/tiers.json'), 'w'), ensure_ascii=False, indent=1)
    print('league ok')


if __name__ == '__main__':
    main()
