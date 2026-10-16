# Firelight · part 5: effects. Footstep trails (6, 4 frames 8 x 8 left at each step), kill effects (6, 6 frames 24 x 24 on the
# slain), death effects (4, 8 frames 32 x 32 on the hero's tomb) and damage-number styles (4 pixel digit fonts, 7 x 9 glyphs).
import json, math
from PIL import Image
from common import *


def canvas(w, h): return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def put(im, x, y, c, a=255):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < im.width and 0 <= y < im.height:
        p = im.load(); old = p[x, y]
        if old[3] <= a: p[x, y] = tuple(c[:3]) + (a,)


def plus(im, x, y, c, a=255, arm=1):
    put(im, x, y, c, a)
    for d in range(1, arm + 1):
        for dx, dy in ((d, 0), (-d, 0), (0, d), (0, -d)): put(im, x + dx, y + dy, c, int(a * .7))


def disc(im, cx, cy, r, c, a=255):
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r: put(im, x, y, c, a)


def ring(im, cx, cy, r, c, a=255):
    for k in range(int(8 + r * 6)):
        t = k / (8 + r * 6) * 6.283; put(im, cx + math.cos(t) * r, cy + math.sin(t) * r, c, a)


# ---- footstep trails: 4 frames 8 x 8, the step at (4, 6)
def trail(kind):
    R = rnd(len(kind)); fr = []
    for f in range(4):
        im = canvas(8, 8); a = int(255 * (1 - f / 4))
        if kind == 'embers':
            for i in range(3): put(im, 2 + i * 2, 6 - f - (i % 2), [P['spark'], P['gold'], P['flame'], P['ember']][min(3, f + (i % 2))], a)
        elif kind == 'frost':
            for x, y in ((2, 6), (5, 6), (3, 5), (4, 7)): put(im, x, y, (220, 240, 255) if f < 2 else (150, 190, 230), a)
            if f == 0: plus(im, 4, 4, (240, 250, 255), 220)
        elif kind == 'petals':
            for i, (x, y) in enumerate(((2, 6), (5, 5), (4, 7))): put(im, x + (f if i == 1 else 0), y - f + (1 if i == 2 else 0), [(255, 138, 168), (255, 200, 220), (255, 235, 164)][i], a)
        elif kind == 'gold':
            plus(im, 4, 5 - f, P['light'], a, 1 if f < 2 else 0); put(im, 2, 7, P['gold'], a); put(im, 6, 6, P['gold'], int(a * .8))
        elif kind == 'shadow':
            for i in range(4): put(im, 2 + i + (f % 2), 6 - f * .7 - (i % 2), (110, 98, 150) if f < 2 else (80, 72, 112), int(a * .8))
        elif kind == 'ghost':   # a pale footprint that fades
            for x, y in ((3, 5), (4, 5), (3, 6), (4, 6), (3, 7), (5, 4)): put(im, x, y, (180, 240, 236), int(a * .7))
        fr.append(im)
    return fr


TRAILS = dict(embers=('Ember Steps', 'Угольки под ногами', 25), frost=('Frost Steps', 'Иней', 25), petals=('Petals', 'Лепестки', 25),
              gold=('Gold Dust', 'Золотая пыль', 50), shadow=('Shadow Steps', 'Теневой след', 50), ghost=('Ghost Prints', 'Призрачные следы', 50))


# ---- kill effects: 6 frames 24 x 24, centred on the slain
def kill(kind):
    fr = []; R = rnd(len(kind) * 3)
    for f in range(6):
        im = canvas(24, 24); t = f / 5; a = int(255 * (1 - t * .75))
        if kind == 'ember_burst':
            for k in range(10):
                ang = k / 10 * 6.283 + .3; r = 2 + t * 10
                put(im, 12 + math.cos(ang) * r, 12 + math.sin(ang) * r, [P['spark'], P['gold'], P['flame'], P['ember'], P['coal'], P['coal']][f], a)
                if f < 3: put(im, 12 + math.cos(ang) * (r - 1.5), 12 + math.sin(ang) * (r - 1.5), P['gold'], int(a * .6))
            if f < 2: disc(im, 12, 12, 3 - f, P['spark'])
        elif kind == 'soul':
            disc(im, 12, 16 - t * 12, 2.2, (200, 236, 255), a); put(im, 12, 19 - t * 12, (120, 180, 230), a); put(im, 11, 20 - t * 12, (90, 140, 210), int(a * .7))
            put(im, 11, 15 - t * 12, (20, 30, 60), a); put(im, 13, 15 - t * 12, (20, 30, 60), a)
        elif kind == 'coins':
            for k in range(4):
                vx = (k - 1.5) * 2.4; x = 12 + vx * t * 2; y = 14 - (math.sin(min(1, t * 1.2) * 3.1416) * 8) + t * 4
                c = P['gold'] if (f + k) % 2 else P['light']
                disc(im, x, y, 1.7, c, a); put(im, x, y, (168, 112, 20), a) if (f + k) % 3 == 0 else None
        elif kind == 'pillar':
            h = [6, 14, 20, 20, 14, 6][f]
            for y in range(24 - h, 24):
                w = 2 + (y - (24 - h)) / max(1, h) * 3
                for x in range(int(12 - w), int(12 + w) + 1): put(im, x, y, P['spark'] if abs(x - 12) < w * .35 else (P['gold'] if abs(x - 12) < w * .7 else P['flame']), a)
        elif kind == 'stars':
            for k in range(6):
                ang = k / 6 * 6.283; r = 3 + t * 8; plus(im, 12 + math.cos(ang) * r, 12 + math.sin(ang) * r, (255, 255, 255) if f < 3 else P['light'], a, 1 if f < 4 else 0)
        elif kind == 'smoke_ring':
            ring(im, 12, 14, 2 + t * 8, (120, 116, 112), a); ring(im, 12, 14, 1 + t * 8, (70, 66, 64), int(a * .7))
        fr.append(im)
    return fr


KILLS = dict(ember_burst=('Ember Burst', 'Взрыв углей', 50), soul=('Soul Wisp', 'Улетающая душа', 50), coins=('Coin Pop', 'Монетки', 50),
             pillar=('Flame Pillar', 'Огненный столб', 75), stars=('Starshatter', 'Звёздный осколок', 75), smoke_ring=('Smoke Ring', 'Кольцо дыма', 25))


# ---- death effects: 8 frames 32 x 32 on the hero's tomb (feet at 16, 30)
def death(kind):
    fr = []
    for f in range(8):
        im = canvas(32, 32); t = f / 7
        if kind == 'ascend':
            for y in range(0, 31):
                w = (1 + t * 4) * (y / 31)
                for x in range(int(16 - w), int(16 + w) + 1): put(im, x, y, P['light'], int(110 * (y / 31) * (1 - abs(t - .5))))
            for k in range(6): put(im, 10 + k * 2.4, 28 - ((f * 4 + k * 7) % 28), P['spark'], 230)
        elif kind == 'ash':
            for k in range(14):
                x = 9 + (k * 37 % 15); y = 30 - (k % 4) + t * 0
                if k < 14 * (1 - t * .3): put(im, x, y, (110, 104, 98) if k % 2 else (150, 144, 136))
            for k in range(6): put(im, 10 + k * 2 + t * 6, 26 - t * 14 - k, (90, 86, 82), int(200 * (1 - t)))
        elif kind == 'ghost':
            y = 26 - t * 18; a = int(220 * (1 - max(0, t - .6) / .4))
            disc(im, 16, y - 3, 4, (210, 240, 236), a)
            for x in range(12, 21): put(im, x, y, (210, 240, 236), a); put(im, x, y + 1 + (x % 2), (170, 220, 214), a) if x % 2 == f % 2 else None
            put(im, 14, y - 4, (20, 30, 40), a); put(im, 18, y - 4, (20, 30, 40), a)
        elif kind == 'eruption':
            if f < 5:
                for k in range(16):
                    ang = k / 16 * 6.283; r = 2 + t * 22
                    put(im, 16 + math.cos(ang) * r, 22 + math.sin(ang) * r * .6 - t * 6, [P['spark'], P['gold'], P['flame'], P['ember'], P['coal']][f], 240)
            disc(im, 16, 24, max(0, 6 - f * 1.2), P['gold'] if f < 2 else P['flame'], int(255 * (1 - t)))
            for k in range(5): put(im, 12 + k * 2, 26 - f * 3 - k % 2, P['ember'], int(200 * (1 - t)))
        fr.append(im)
    return fr


DEATHS = dict(ascend=('Ascension', 'Вознесение', 100), ash=('Ash to Ash', 'Прах к праху', 75), ghost=('Restless Ghost', 'Неупокоенный дух', 100), eruption=('Last Flame', 'Последнее пламя', 150))

# ---- damage numbers: 5 x 7 digits with a gradient fill and a 1 px outline -> 7 x 9 glyphs: 0-9 - + !
DIG = {'0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
       '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['####.', '....#', '...#.', '..##.', '....#', '#...#', '.###.'],
       '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
       '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
       '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
       '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
       '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..']}
NUMS = dict(ember=(['#fff6c8', '#ffe066', '#ffb02e', '#f06a1e', '#f06a1e', '#c0301a', '#6a1410'], '#1a0a06', 'Ember Numbers', 'Огненные цифры', 50),
            frost=(['#ffffff', '#e4f8ff', '#ace8ff', '#6ac8f0', '#6ac8f0', '#3a90c8', '#1a4a7a'], '#0a1420', 'Frost Numbers', 'Ледяные цифры', 50),
            gold=(['#fffce4', '#ffec8e', '#ffd040', '#e0a018', '#e0a018', '#a86a0a', '#5a3404'], '#1a1004', 'Gold Numbers', 'Золотые цифры', 50),
            toxic=(['#f2ffd8', '#c0ff70', '#72e04a', '#2aa83a', '#2aa83a', '#1a6a2a', '#0e3a16'], '#06140a', 'Toxic Numbers', 'Ядовитые цифры', 25))


def font(style):
    ramp, ol = NUMS[style][0], NUMS[style][1]; glyphs = []
    for ch in '0123456789-+!':
        im = canvas(5, 7); px = im.load()
        for y, r in enumerate(DIG[ch]):
            for x, c in enumerate(r):
                if c == '#': px[x, y] = hx(ramp[y]) + (255,)
        glyphs.append(outline(im, hx(ol) + (255,), diag=True))
    return glyphs


if __name__ == '__main__':
    cat = []
    for k, (en, ru, st) in TRAILS.items():
        fr = trail(k); save(strip(fr), f'fx/trail-{k}.png'); save(fr[0].resize((8, 8)), f'fx/icons/trail-{k}.png')
        cat.append(dict(sku=f'trail.{k}', kind='trail', stars=st, name=dict(en=en, ru=ru), sheet=dict(file=f'mart/fl/fx/trail-{k}.png', w=8, h=8, frames=4, ms=110, at=[4, 6]), icon=f'mart/fl/fx/icons/trail-{k}.png'))
    for k, (en, ru, st) in KILLS.items():
        fr = kill(k); save(strip(fr), f'fx/kill-{k}.png'); save(fr[2], f'fx/icons/kill-{k}.png')
        gif([x_n(f, 5) for f in fr + [canvas(24, 24)] * 3], f'fx/preview/kill-{k}-x5.gif', 90)
        cat.append(dict(sku=f'kill.{k}', kind='kill', stars=st, name=dict(en=en, ru=ru), sheet=dict(file=f'mart/fl/fx/kill-{k}.png', w=24, h=24, frames=6, ms=80), icon=f'mart/fl/fx/icons/kill-{k}.png'))
    for k, (en, ru, st) in DEATHS.items():
        fr = death(k); save(strip(fr), f'fx/death-{k}.png'); save(fr[3], f'fx/icons/death-{k}.png')
        gif([x_n(f, 4) for f in fr + [canvas(32, 32)] * 2], f'fx/preview/death-{k}-x4.gif', 120)
        cat.append(dict(sku=f'death.{k}', kind='death', stars=st, name=dict(en=en, ru=ru), sheet=dict(file=f'mart/fl/fx/death-{k}.png', w=32, h=32, frames=8, ms=110, feet=[16, 30]), icon=f'mart/fl/fx/icons/death-{k}.png'))
    for k, v in NUMS.items():
        g = font(k); save(strip(g), f'fx/digits-{k}.png')
        cat.append(dict(sku=f'digits.{k}', kind='digits', stars=v[4], name=dict(en=v[2], ru=v[3]), sheet=dict(file=f'mart/fl/fx/digits-{k}.png', w=7, h=9, glyphs='0123456789-+!', advance=6),
                        icon=f'mart/fl/fx/digits-{k}.png'))
    json.dump(cat, open(out('catalog-fx.json'), 'w'), ensure_ascii=False, indent=1)
    # check
    chk = canvas(330, 210); y = 0
    for k in TRAILS: chk.alpha_composite(strip(trail(k)), (0, y)); y += 10
    y = 0
    for k in KILLS: chk.alpha_composite(strip(kill(k)), (40, y)); y += 25
    yy = 0
    for k in NUMS: chk.alpha_composite(strip(font(k)), (190, yy)); yy += 10
    b = Image.new('RGBA', chk.size, (40, 40, 40, 255)); b.alpha_composite(chk); x_n(b, 3).save(os.path.join(os.environ.get('P5_CHECK', '/tmp'), 'fx.png'))
    d = canvas(256, 4 * 33)
    for i, k in enumerate(DEATHS): d.alpha_composite(strip(death(k)), (0, i * 33))
    b = Image.new('RGBA', d.size, (40, 40, 40, 255)); b.alpha_composite(d); x_n(b, 3).save(os.path.join(os.environ.get('P5_CHECK', '/tmp'), 'death.png'))
    print('fx', len(cat))
