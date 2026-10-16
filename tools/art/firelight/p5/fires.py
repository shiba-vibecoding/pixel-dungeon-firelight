# Firelight · part 5: campfire styles for the camp («Привал»). Each style: 6 flame frames 13 x 17 (the layout of camp/fire.png),
# logs 16 x 6 laid over the stone ring (their middle under the flame), 4 spark frames 3 x 3 and the colour of the light.
import json, math
from PIL import Image, ImageFilter
from common import *

FIRE = Image.open(SRC + 'camp/fire.png').convert('RGBA')
SRCRAMP = ['#fff6c8', '#ffe066', '#ffb02e', '#f06a1e', '#c0301a', '#6a1410']
STYLES = {
    'classic': dict(ramp=SRCRAMP, light='#ff9a3a', spark=['#fff6c8', '#ffb02e', '#f06a1e'], logs='wood', en='Classic', ru='Классический', stars=0),
    'blue':    dict(ramp=['#eef8ff', '#a8e0ff', '#58b0ff', '#2a6ae8', '#1a3aa8', '#0e1a5a'], light='#4aa8ff', spark=['#eef8ff', '#58b0ff', '#2a6ae8'], logs='slate', en='Blue Flame', ru='Синее пламя', stars=50),
    'green':   dict(ramp=['#f2ffd8', '#c0ff70', '#72e04a', '#2aa83a', '#1a6a2a', '#0e3a16'], light='#72e04a', spark=['#f2ffd8', '#c0ff70', '#2aa83a'], logs='moss', en='Witch Green', ru='Ведьмин зелёный', stars=50),
    'ghost':   dict(ramp=['#f4ffff', '#cdf6f2', '#92e0dc', '#5aa8b0', '#3a7080', '#1a3a48'], light='#92e0dc', spark=['#f4ffff', '#92e0dc', '#5aa8b0'], logs='bone', alpha=200, en='Ghost Fire', ru='Призрачный огонь', stars=75),
    'rainbow': dict(ramp=None, light='#ff6ad8', spark=['#ff5a5a', '#ffd040', '#5aff8a', '#5ab8ff', '#c06aff'], logs='birch', en='Rainbow', ru='Радужный', stars=100),
    'cursed':  dict(ramp=['#fae4ff', '#dc96ff', '#a44aff', '#6a1ae0', '#3a0a8a', '#1a0440'], light='#a44aff', spark=['#fae4ff', '#a44aff', '#6a1ae0'], logs='skull', en='Cursed Purple', ru='Проклятый лиловый', stars=75),
    'golden':  dict(ramp=['#fffce4', '#ffec8e', '#ffd040', '#e0a018', '#a86a0a', '#5a3404'], light='#ffd040', spark=['#fffce4', '#ffd040', '#e0a018'], logs='gilded', en='Golden', ru='Золотой', stars=100),
    'ice':     dict(ramp=['#ffffff', '#e4f8ff', '#ace8ff', '#6ac8f0', '#3a90c8', '#1a4a7a'], light='#ace8ff', spark=['#ffffff', '#ace8ff', '#6ac8f0'], logs='crystal', en='Ice Flame', ru='Ледяное пламя', stars=75),
}
LOGS = {   # 16 x 6, middle under the flame; keys: a light, b mid, c dark, e ember
    'wood':   (['......aab.......', '..aabbbbccaab...', '.abbcceebbbbcc..', 'abbccceeecbbbcca', '.cccbbbbbbbccc..', '...cc......cc...'], '#a8784a', '#7a5030', '#4a2c18'),
    'slate':  (['......aab.......', '..aabbbbccaab...', '.abbcceebbbbcc..', 'abbccceeecbbbcca', '.cccbbbbbbbccc..', '...cc......cc...'], '#6a7488', '#454c5e', '#262a36'),
    'moss':   (['......aab.......', '..aabbbbccaab...', '.abbcceebbbbcc..', 'abbccceeecbbbcca', '.cccbbbbbbbccc..', '...cc......cc...'], '#7aa04a', '#5a6a30', '#34401c'),
    'birch':  (['......aac.......', '..aaacaaacaaa...', '.aacaaeeaacaaa..', 'aacaaaeeeaacaaca', '.caaacaaacaaac..', '...cc......cc...'], '#f0ece0', '#c8c2b0', '#2a2622'),
    'gilded': (['......aab.......', '..aabbbbccaab...', '.abbcceebbbbcc..', 'abbccceeecbbbcca', '.cccbbbbbbbccc..', '...cc......cc...'], '#ffe28a', '#d0a040', '#7a5418'),
    'bone':   (['.....aaa........', '..aaaabbaaaab...', '.abbaaeeaabbaa..', 'aabbaaeeeaaabbaa', '..bb..bbbb..bb..', '................'], '#e8eee8', '#a8b8b4', '#5a6a68'),
    'skull':  (['.....aaaa.......', '....abccba..aab.', '.aabaaeeaabbaab.', 'aabbaaeeeaaabbaa', '..bb.abaab..bb..', '.....b..b.......'], '#e4dcd0', '#a89c90', '#2a2030'),
    'crystal':(['....a....a......', '...aba..abaa..a.', '..abcbaabcba.aba', '.abccbeeabcbabcb', 'abbcbbeeebbbccba', '.ccccccccccccc..'], '#ffffff', '#a8e8ff', '#4a90c8'),
}


def flames(st, k):
    frames = []
    src = [hx(c) for c in SRCRAMP]
    for f in range(6):
        fr = FIRE.crop((f * 13, 0, f * 13 + 13, 17)); px = fr.load()
        for y in range(17):
            for x in range(13):
                p = px[x, y]
                if not p[3]: continue
                i = min(range(6), key=lambda j: sum((p[t] - src[j][t]) ** 2 for t in range(3)))
                if st['ramp'] is None:      # rainbow: hue bands climbing with the frames
                    h = ((16 - y) / 17 * 0.9 + f / 6) % 1
                    c = rgb(h, [.08, .35, .65, .85, .9, .9][i], [1, 1, 1, .95, .75, .45][i])
                else:
                    c = hx(st['ramp'][i])
                px[x, y] = c + (st.get('alpha', 255) if i > 0 else 255,)
        frames.append(fr)
    return frames


def logs(st):
    rows, a, b, c = LOGS[st['logs']]; e = st['ramp'][3] if st['ramp'] else '#ff5aa0'
    return grid(rows, {'a': hx(a), 'b': hx(b), 'c': hx(c), 'e': hx(e)})


def sparks(st):
    cs = [hx(c) for c in st['spark']]; fr = []
    shapes = [[(1, 1)], [(1, 0), (0, 1), (1, 1), (2, 1), (1, 2)], [(1, 1)], [(1, 1)]]
    for f, sh in enumerate(shapes):
        im = Image.new('RGBA', (3, 3), (0, 0, 0, 0)); px = im.load()
        for x, y in sh: px[x, y] = cs[min(len(cs) - 1, f if f < 3 else 2)] + ((255, 255, 220, 140)[f],)
        fr.append(im)
    if st['logs'] == 'crystal':     # ice: the sparks are snow
        fr[1] = grid(['a.a', '.a.', 'a.a'], {'a': cs[0]})
    return fr


BG = Image.open(SRC + 'camp/camp-outdoor-summer.png').convert('RGBA')
FX, FY = 24, 118


def scene(key, f, t=0.0, lit=True):
    """A crop of the camp around the fire: the ring, the logs, the flame, sparks and its light."""
    st = STYLES[key]; c = BG.crop((4, 92, 44, 126)).copy()   # 40 x 34
    ox, oy = FX - 4, FY - 92
    if lit:
        glow = Image.new('RGBA', c.size, (0, 0, 0, 0)); g = glow.load(); lc = hx(st['light'])
        for y in range(c.height):
            for x in range(c.width):
                d = math.hypot(x - ox, (y - oy + 4) * 1.6)
                a = max(0, 1 - d / 22) ** 1.6 * 150
                if a > 0: g[x, y] = lc + (int(a),)
        c = Image.alpha_composite(c, glow)
    c.alpha_composite(logs(st), (ox - 8, oy - 4))
    fl = flames(st, key)[f % 6]; c.alpha_composite(fl, (ox - 6, oy - 17 - 1))
    r = rnd(f * 7 + 3)
    for i in range(4):
        sp = sparks(st)[(f + i) % 4]
        if st['ramp'] is None: sp = sparks(dict(st, spark=[st['spark'][(f + i) % 5]] * 3))[(f + i) % 4]
        c.alpha_composite(sp, (ox - 7 + r.randint(0, 12), oy - 19 - r.randint(0, 12)))
    return c


catalog = []
for key, st in STYLES.items():
    fl = flames(st, key)
    save(strip(fl), f'fires/{key}-flame.png'); save(logs(st), f'fires/{key}-logs.png'); save(strip(sparks(st)), f'fires/{key}-sparks.png')
    icon = Image.new('RGBA', (16, 16), (0, 0, 0, 0)); ic = scene(key, 2, lit=False).crop((ox := FX - 4 - 8, 0, ox + 16, 34))
    ic16 = Image.new('RGBA', (16, 24), (0, 0, 0, 0)); ic16.alpha_composite(logs(st), (0, 17)); ic16.alpha_composite(fl[2], (1, 1))
    save(ic16, f'fires/icons/{key}.png')
    gif([x_n(scene(key, i % 6), 4) for i in range(12)], f'fires/preview/{key}-x4.gif', 100)
    catalog.append(dict(sku=f'fire.{key}', kind='fire', fire=key, stars=st['stars'], name=dict(en=st['en'], ru=st['ru']),
                        flame=dict(sheet=f'mart/fl/fires/{key}-flame.png', frames=6, w=13, h=17, ms=100),
                        logs=f'mart/fl/fires/{key}-logs.png', logsAt=[-8, -4], sparks=dict(sheet=f'mart/fl/fires/{key}-sparks.png', frames=4, w=3, h=3),
                        light=st['light'], icon=f'mart/fl/fires/icons/{key}.png', **({'default': True} if key == 'classic' else {})))
json.dump(catalog, open(out('catalog-fires.json'), 'w'), ensure_ascii=False, indent=1)
sheet = Image.new('RGBA', (40 * 8 + 7 * 4, 34), (0, 0, 0, 0))
for i, key in enumerate(STYLES): sheet.alpha_composite(scene(key, 1), (i * 44, 0))
x_n(sheet, 4).save(os.path.join(os.environ.get('P5_CHECK', '/tmp'), 'fires.png'))
print('fires', len(catalog))
