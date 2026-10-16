# Firelight · part 5: hats and accessories, 12 overlays. Each is drawn into a sheet of the hero layout (256 x 128: 7 armour
# tiers x 21 frames) for each class, sitting on that frame's head: found from the frame itself (top of the head, the eye, the neck).
# On the tomb frames (8-12) a hat rests on the skull; face and neck pieces are hidden there.
import json
from PIL import Image
from common import *
SKIN = {'#dcb497', '#b89778', '#ffdabf', '#855938', '#be7f59', '#ffba8f', '#000000'}

H = dict
HATS = {   # rows, palette, sink (rows of the hat below the head top), where: head | eye | neck, glow
    'straw':   H(rows=['...aaaa...', '..abbbba..', '.cdddddddc', 'cccccccccc'], pal=dict(a='#f0d890', b='#d8b860', c='#b08a40', d='#8a2a2a'), sink=2, en='Straw Hat', ru='Соломенная шляпа', stars=50),
    'tricorn': H(rows=['...aaaa....', '..abbbbaa..', '.abbcbbbba.', 'aabbbbbbbaa'], pal=dict(a='#1a1418', b='#3a2c36', c='#ffcc66'), sink=2, en='Pirate Tricorn', ru='Треуголка', stars=50),
    'wizard':  H(rows=['....a...', '...ab...', '...abb..', '..abbb..', '..abcbb.', '.abbbbbb', 'aaaaaaaa'], pal=dict(a='#3a2470', b='#5a3aa0', c='#ffeba4'), sink=1, en='Stargazer Cap', ru='Колпак звездочёта', stars=50),
    'crown':   H(rows=['a..a..a', 'abbbbba', 'bcbbbcb'], pal=dict(a='#fff6c8', b='#ff9a3a', c='#b22a2a'), sink=1, glow=True, en='Crown of Embers', ru='Корона углей', stars=100),
    'horns':   H(rows=['a........a', 'ab......ba', '.bcccccccb', '..cdddddc.'], pal=dict(a='#f6eedc', b='#c8b890', c='#8a9080', d='#4a4e45'), sink=2, en='Horned Helm', ru='Рогатый шлем', stars=75),
    'tophat':  H(rows=['.aaaaa.', '.abbba.', '.abbba.', '.accca.', 'aaaaaaa'], pal=dict(a='#151612', b='#33362e', c='#b22a2a'), sink=1, en='Top Hat', ru='Цилиндр', stars=50),
    'wreath':  H(rows=['.a.b.c.a.', 'ddadddbdd'], pal=dict(a='#ff8aa8', b='#ffeba4', c='#8ac8ff', d='#4a8a3a'), sink=1, en='Flower Wreath', ru='Венок', stars=25),
    'bandana': H(rows=['..aaaaa..', '.abababaa', 'aaaaaaaa.', 'a........'], pal=dict(a='#a8241e', b='#e8641f'), sink=4, en='Bandana', ru='Бандана', stars=25),
    'pompom':  H(rows=['...a...', '..bab..', '.bcbcb.', 'bbbbbbb', 'ddddddd'], pal=dict(a='#ffffff', b='#b22a2a', c='#e8e2c8', d='#f2eee0'), sink=2, en='Pompom Hat', ru='Шапка с помпоном', stars=25, season='winter'),
    'halo':    H(rows=['.aaaaa.', 'a.....a', '.aaaaa.'], pal=dict(a='#ffeba4'), sink=-2, glow=True, en='Halo', ru='Нимб', stars=100),
    'eyepatch': H(rows=None, pal=dict(a='#151612', b='#3b3e36'), where='eye', en='Eyepatch', ru='Повязка на глаз', stars=25),
    'scarf':   H(rows=['aaaaaaa', 'abababa', 'aa.....', 'ab.....', 'a......'], pal=dict(a='#b22a2a', b='#e8a040'), where='neck', en='Fire Scarf', ru='Огненный шарф', stars=25),
}


def anchors(sheet, f, tier):
    pts = cell_opaque(sheet, f, tier)
    if not pts: return None
    fr = frame(sheet, f, tier).load(); y0 = min(y for x, y in pts)
    top = [x for x, y in pts if y <= y0 + 1]; cx = (min(top) + max(top)) / 2
    head = [x for x, y in pts if y0 <= y <= y0 + 5]; hx0, hx1 = min(head), max(head)
    eye = None
    for y in range(y0 + 2, min(FH, y0 + 7)):
        for x in range(hx1, hx0 - 1, -1):      # the dark pixel of the face nearest the front (sprites face right)
            p = fr[x, y]
            if p[3] and (to_hex(p) == '#000000' or (to_hex(p) not in SKIN and hsv(p)[2] < .35)) and x > hx0 and fr[x - 1, y][3] and to_hex(fr[x - 1, y]) in SKIN - {'#000000'}:
                eye = (x, y); break
        if eye: break
    neck = y0 + 7
    row = [x for x, y in pts if y == neck]
    return dict(top=(cx, y0), head=(hx0, hx1), eye=eye, neck=(((min(row) + max(row)) / 2) if row else cx, neck))


def piece(key, a, tomb):
    """The accessory sprite and where its top-left goes in the 12 x 15 frame (it may stick out of the frame)."""
    h = HATS[key]; pal = {k: hx(v) for k, v in h['pal'].items()}
    where = h.get('where', 'head')
    if tomb and where != 'head': return None, None
    if where == 'eye':
        if not a['eye']: return None, None
        ex, ey = a['eye']; x0, x1 = a['head']; w = x1 - x0 + 1
        im = Image.new('RGBA', (w, 3), (0, 0, 0, 0)); px = im.load()
        for x in range(w): px[x, 0] = pal['b'] + (255,)          # the strap round the head
        for dx in (0, 1):
            for dy in (0, 1, 2):
                xx = ex - x0 - 1 + dx
                if 0 <= xx < w: px[xx, dy] = pal['a'] + (255,)
        return im, (x0, ey - 1)
    im = grid(h['rows'], pal)
    if where == 'neck':
        nx, ny = a['neck']; return im, (int(round(nx - im.width / 2)) - 1, ny)
    cx, y0 = a['top']; sink = h['sink'] - (1 if tomb else 0)
    return im, (int(round(cx - (im.width - 1) / 2)), y0 + sink - im.height + 1)


OW, OH, OX, OY = 16, 22, 2, 7     # an overlay cell: 16 x 22, the hero frame's top-left at (2, 7) in it (room for tall hats)


def overlay(cls, key):
    sheet = hero(cls); size = (COLS * OW, TIERS * OH)
    o = Image.new('RGBA', size, (0, 0, 0, 0)); g = Image.new('RGBA', size, (0, 0, 0, 0))
    for t in range(TIERS):
        for f in range(COLS):
            a = anchors(sheet, f, t)
            if not a: continue
            im, at = piece(key, a, 8 <= f <= 12)
            if im is None: continue
            # clip to the frame cell so neighbouring frames stay clean
            cell = Image.new('RGBA', (OW, OH), (0, 0, 0, 0)); cell.alpha_composite(im, (at[0] + OX, at[1] + OY))
            o.alpha_composite(cell, (f * OW, t * OH))
            if HATS[key].get('glow'): g.alpha_composite(cell, (f * OW, t * OH))
    return o, g


def worn(cls, key, f=0, t=1, sheet=None):
    sheet = sheet or hero(cls); o, _ = overlay(cls, key)
    c = Image.new('RGBA', (OW, OH), (0, 0, 0, 0)); c.alpha_composite(frame(sheet, f, t), (OX, OY))
    c.alpha_composite(o.crop((f * OW, t * OH, f * OW + OW, t * OH + OH))); return c


if __name__ == '__main__':
    catalog = []
    for key, h in HATS.items():
        for cls in CLASSES:
            o, g = overlay(cls, key); save(o, f'hats/{cls}-{key}.png')
            if h.get('glow'): save(g, f'hats/{cls}-{key}-glow.png')
        pal = {k: hx(v) for k, v in h['pal'].items()}
        ic = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        if h['rows']: im = grid(h['rows'], pal)
        else: im = grid(['bbbbbbbb', '..aa....', '..aa....'], pal)
        ic.alpha_composite(im, ((16 - im.width) // 2, (16 - im.height) // 2)); save(outline(ic, (11, 11, 9, 255)).crop((1, 1, 17, 17)), f'hats/icons/{key}.png')
        catalog.append(dict(sku=f'hat.{key}', kind='hat', hat=key, stars=h['stars'], name=dict(en=h['en'], ru=h['ru']), slot=h.get('where', 'head'),
                            sheets={c: f'mart/fl/hats/{c}-{key}.png' for c in CLASSES}, **({'glow': {c: f'mart/fl/hats/{c}-{key}-glow.png' for c in CLASSES}} if h.get('glow') else {}),
                            cell=dict(w=OW, h=OH, heroAt=[OX, OY]), icon=f'mart/fl/hats/icons/{key}.png', **({'season': h['season']} if h.get('season') else {})))
    json.dump(catalog, open(out('catalog-hats.json'), 'w'), ensure_ascii=False, indent=1)
    # check sheet: every class, hats on tier 1 frame 0, and one hat across tiers and frames
    chk = Image.new('RGBA', (12 * 17, 4 * 23 + 7 * 23 + 4), (40, 40, 40, 255))
    for r, cls in enumerate(CLASSES):
        for i, key in enumerate(HATS): chk.alpha_composite(worn(cls, key), (i * 17, r * 23))
    for t in range(7):
        for f in range(12): chk.alpha_composite(worn('warrior', ['tricorn', 'wizard', 'eyepatch', 'scarf', 'straw', 'crown', 'horns'][t], f, t), (f * 17, 4 * 23 + 4 + t * 23))
    x_n(chk, 4).save(os.path.join(os.environ.get('P5_CHECK', '/tmp'), 'hats.png')); print('hats', len(catalog))
