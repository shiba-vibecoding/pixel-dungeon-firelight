# Firelight · part 5: hero looks. 5 recolours per class on the whole PD 1.9 hero sheet (7 armour tiers x 21 frames), and one
# legendary animated look per class: a recoloured sheet, its glow mask (same layout) and an 8-frame aura of sparks around it.
import json, math
from PIL import Image
from common import *

SKIN = {'#dcb497', '#b89778', '#ffdabf', '#855938', '#be7f59', '#ffba8f', '#000000'}
HAIR = {'warrior': {'#be390c', '#97310d', '#dc7937', '#752b0e', '#ad693c', '#c4703a'},
        'mage': {'#e8e8e9', '#a6abad', '#f3f3f4', '#6d7477', '#ced1d2'},
        'rogue': {'#85490c', '#ab5e10', '#623709', '#b88837', '#d19b3f'},
        'ranger': {'#c8ba23', '#9e791c', '#e2da5f', '#f9ed43'}}


def ramp(v, stops):
    for t, c in stops:
        if v >= t: return c
    return stops[-1][1]


# armour(h, s, v) -> (h, s, v); hair(h, s, v) -> rgb or None (keep)
THEMES = {
    'moss':  dict(armor=lambda h, s, v: (88 / 360, .32 + s * .15, .1 + v * .78) if s < .28 else (128 / 360, .55, .12 + v * .8), hair=None),
    'frost': dict(armor=lambda h, s, v: (205 / 360, .14 + (1 - v) * .22, .42 + v * .58) if s < .28 else (196 / 360, .6, .3 + v * .7),
                  hair=lambda h, s, v: ramp(v, [(.9, (236, 246, 255)), (.75, (196, 220, 240)), (.6, (150, 182, 210)), (0, (104, 130, 160))])),
    'ember': dict(armor=lambda h, s, v: (14 / 360, .42, .08 + v * .5) if s < .28 else (16 / 360, .92, .45 + v * .55), hair=None),
    'dusk':  dict(armor=lambda h, s, v: (250 / 360, .24, .08 + v * .74) if s < .28 else (286 / 360, .62, .22 + v * .72),
                  hair=lambda h, s, v: ramp(v, [(.9, (178, 160, 220)), (.75, (138, 118, 186)), (.6, (100, 84, 146)), (0, (66, 54, 104))])),
    'brass': dict(armor=lambda h, s, v: (40 / 360, .66, .08 + (v ** 1.4) * .9) if s < .28 else (352 / 360, .76, .18 + v * .66), hair=None),
}
# the legendary looks: base recolour, which armour pixels glow (v above), their glow colour, and the aura
LEGEND = {
    'warrior': dict(id='forgeborn', armor=lambda h, s, v: (20 / 360, .18, .06 + v * .42), hair=None, glow=.74, glowc=(255, 176, 64), aura='sparks'),
    'mage':    dict(id='starflame', armor=lambda h, s, v: (226 / 360, .62, .12 + v * .52), hair=lambda h, s, v: ramp(v, [(.9, (232, 244, 255)), (.75, (190, 214, 246)), (.6, (140, 170, 220)), (0, (96, 120, 180))]),
                    glow=.72, glowc=(143, 216, 255), aura='stars'),
    'rogue':   dict(id='smoulder', armor=lambda h, s, v: (0, .06, .05 + v * .36), hair=lambda h, s, v: ramp(v, [(.9, (90, 84, 80)), (.75, (66, 60, 58)), (.6, (48, 44, 42)), (0, (32, 30, 30))]),
                    glow=.7, glowc=(255, 90, 42), aura='smoke'),
    'ranger':  dict(id='wildfire', armor=lambda h, s, v: (102 / 360, .5, .08 + v * .55), hair=None, glow=.72, glowc=(200, 240, 110), aura='fireflies'),
}


def recolour(cls, th):
    src = hero(cls); im = src.copy(); px = im.load(); glow = Image.new('RGBA', im.size, (0, 0, 0, 0)); gp = glow.load(); cand = {}
    for y in range(im.height):
        fy = y % FH
        for x in range(im.width):
            p = px[x, y]
            if p[3] == 0 or 8 <= x // FW <= 12: continue      # the tomb frames (8-12) keep the original skull
            c = to_hex(p)
            if c in SKIN: continue
            h, s, v = hsv(p)
            if fy < 9 and c in HAIR[cls]:
                if th.get('hair') is None: continue
                n = th['hair'](h, s, v)
            else:
                n = rgb(*th['armor'](h, s, v))
                if 'glow' in th and v >= th['glow'] and fy >= 6: cand.setdefault((x // FW, y // FH), []).append((v, x, y))
            px[x, y] = n + (p[3],)
    for k, lst in cand.items():     # the brightest armour pixels of each frame (studs, buckles, edges) become molten seams
        for v, x, y in sorted(lst, reverse=True)[:5]:
            px[x, y] = th['glowc'] + (255,); gp[x, y] = th['glowc'] + (255,)
    return im, glow


def aura(kind, seed):
    """8 frames 24 x 28, the feet at (12, 26): particles rising, twinkling or drifting around a 12 x 15 figure."""
    W, H, N = 24, 28, 8; r = rnd(seed); frames = [Image.new('RGBA', (W, H), (0, 0, 0, 0)) for _ in range(N)]
    cols = dict(sparks=[(255, 250, 214), (255, 204, 102), (255, 154, 58), (232, 100, 31)],
                stars=[(240, 250, 255), (143, 216, 255), (90, 160, 255)],
                smoke=[(70, 66, 64), (52, 48, 46), (255, 90, 42)],
                fireflies=[(240, 255, 170), (216, 255, 106), (140, 200, 60)])[kind]
    parts = []
    for i in range(12):
        parts.append(dict(x=r.uniform(3, 21), y0=r.uniform(14, 26), ph=r.randrange(N), life=r.randint(5, 8)))
    for f in range(N):
        px = frames[f].load()
        for k, p in enumerate(parts):
            t = (f + p['ph']) % N
            if t >= p['life']: continue
            a = t / p['life']
            if kind == 'sparks':
                x = p['x'] + math.sin(a * 6 + k) * 1.2; y = p['y0'] - a * 14
                c = cols[min(3, int(a * 4))]
            elif kind == 'stars':
                x = p['x']; y = p['y0'] - 6 - a * 4; c = cols[0 if t % 3 == 0 else (1 if a < .6 else 2)]
            elif kind == 'smoke':
                x = p['x'] + a * 3 * (1 if k % 2 else -1); y = p['y0'] - a * 12; c = cols[2] if a < .25 else cols[0 if a < .6 else 1]
            else:
                x = p['x'] + math.sin(a * 6.28 + k) * 2.5; y = p['y0'] - 4 + math.cos(a * 6.28 + k) * 2; c = cols[0 if t % 2 == 0 else 1]
            xi, yi = int(round(x)), int(round(y))
            if 0 <= xi < W and 0 <= yi < H:
                px[xi, yi] = c + (255,)
                if kind == 'sparks' and a < .7 and 0 <= yi + 1 < H: px[xi, yi + 1] = cols[min(3, int(a * 4) + 1)] + (170,)
                if kind == 'stars' and t % 3 == 0:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        if 0 <= xi + dx < W and 0 <= yi + dy < H: px[xi + dx, yi + dy] = cols[1] + (200,)
                if kind == 'smoke' and a >= .25 and xi + 1 < W: px[xi + 1, yi] = c + (180,)
                if kind == 'fireflies' and t % 2 == 0:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        if 0 <= xi + dx < W and 0 <= yi + dy < H and px[xi + dx, yi + dy][3] == 0: px[xi + dx, yi + dy] = cols[2] + (120,)
    return frames


def idle_gif(sheet, glow, fx, path, tier=1):
    """The look by the fire: idle frames, its glow pulsing, the aura around it, x4 on the void."""
    seq = [0, 0, 0, 1, 0, 0, 1, 1]; out_frames = []
    for i in range(16):
        f = seq[i % 8]; c = Image.new('RGBA', (24, 28), (0, 0, 0, 0))
        body = frame(sheet, f, tier); c.alpha_composite(body, (6, 26 - FH + 1))
        if glow is not None:
            g = frame(glow, f, tier); k = 0.55 + 0.45 * math.sin(i / 16 * 6.283 * 2)
            gl = Image.new('RGBA', (24, 28), (0, 0, 0, 0)); gl.alpha_composite(g, (6, 26 - FH + 1))
            gl.putalpha(gl.getchannel('A').point(lambda a: int(a * k)))
            hal = gl.resize((12, 14), Image.BILINEAR).resize((24, 28), Image.BILINEAR)
            c.alpha_composite(hal); c.alpha_composite(gl)
        if fx is not None: c.alpha_composite(fx[i % 8])
        out_frames.append(x_n(c, 4))
    return gif(out_frames, path, 120)


catalog = []
NAMES = {'moss': ('Moss', 'Моховой'), 'frost': ('Frost', 'Морозный'), 'ember': ('Ember', 'Угольный'), 'dusk': ('Dusk', 'Сумеречный'), 'brass': ('Brass', 'Латунный')}
PRICE = {'moss': 100, 'frost': 150, 'ember': 150, 'dusk': 200, 'brass': 250}
LNAMES = {'forgeborn': ('Forgeborn', 'Рождённый в горне'), 'starflame': ('Starflame', 'Звёздное пламя'), 'smoulder': ('Smouldering Shade', 'Тлеющая тень'), 'wildfire': ('Wildfire', 'Лесной пожар')}
LPRICE = {'forgeborn': 600, 'starflame': 600, 'smoulder': 500, 'wildfire': 500}
for cls in CLASSES:
    for key, th in THEMES.items():
        im, _ = recolour(cls, th); save(im, f'looks/{cls}-{key}.png')
        save(x_n(frame(im, 0, 1), 1), f'looks/icons/{cls}-{key}.png')
        catalog.append(dict(sku=f'skin.{cls}.{key}', kind='skin', heroClass=cls, skin=key, stars=PRICE[key], name=dict(zip(('en', 'ru'), NAMES[key])),
                            sheet=f'mart/fl/looks/{cls}-{key}.png', icon=f'mart/fl/looks/icons/{cls}-{key}.png'))
    L = LEGEND[cls]; im, glow = recolour(cls, L); fx = aura(L['aura'], CLASSES.index(cls) * 101 + 7)
    save(im, f'legendary/{cls}-{L["id"]}.png'); save(glow, f'legendary/{cls}-{L["id"]}-glow.png'); save(strip(fx), f'legendary/{cls}-{L["id"]}-aura.png')
    save(frame(im, 0, 1), f'legendary/icons/{cls}-{L["id"]}.png')
    idle_gif(im, glow, fx, f'legendary/preview/{cls}-{L["id"]}-x4.gif')
    catalog.append(dict(sku=f'skin.{cls}.{L["id"]}', kind='skin', legendary=True, heroClass=cls, skin=L['id'], stars=LPRICE[L['id']], name=dict(zip(('en', 'ru'), LNAMES[L['id']])),
                        sheet=f'mart/fl/legendary/{cls}-{L["id"]}.png', glow=f'mart/fl/legendary/{cls}-{L["id"]}-glow.png',
                        aura=dict(sheet=f'mart/fl/legendary/{cls}-{L["id"]}-aura.png', frames=8, w=24, h=28, feet=[12, 26], ms=120),
                        glowPulse=dict(hz=1.0, min=0.55, max=1.0), icon=f'mart/fl/legendary/icons/{cls}-{L["id"]}.png'))
json.dump(catalog, open(out('catalog-looks.json'), 'w'), ensure_ascii=False, indent=1)
print('looks', len(catalog))
