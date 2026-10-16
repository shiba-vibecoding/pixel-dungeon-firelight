# Firelight · part 5: profile (8 portrait frames, title plates and their icons), photo mode (6 frames, 12 stickers) and the season banner.
import json, math
from PIL import Image
from common import *


def ring_frame(size, slice_, band, outer, inner, corner=None, seed=0, spot=None):
    """A border-image frame: size x size, ring `slice_` wide; band(x, y, t) -> rgb, t = 0..1 around the ring from the top-left."""
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); px = im.load(); n = size
    for y in range(n):
        for x in range(n):
            d = min(x, y, n - 1 - x, n - 1 - y)
            if d >= slice_: continue
            if d == 0: px[x, y] = outer + (255,)
            elif d == slice_ - 1: px[x, y] = inner + (255,)
            else:
                lit = 1 - (x + y) / (2 * n)          # top-left lit, bottom-right in shadow
                px[x, y] = band(x, y, lit, d) + (255,)
    if corner:
        c = grid(corner[0], {k: hx(v) for k, v in corner[1].items()})
        for cx, cy, fx, fy in ((0, 0, 0, 0), (n - c.width, 0, 1, 0), (0, n - c.height, 0, 1), (n - c.width, n - c.height, 1, 1)):
            cc = c.transpose(Image.FLIP_LEFT_RIGHT) if fx else c; cc = cc.transpose(Image.FLIP_TOP_BOTTOM) if fy else cc
            im.alpha_composite(cc, (cx, cy))
    if spot:
        r = rnd(seed)
        for _ in range(spot[0]):
            x, y = r.randrange(n), r.randrange(n)
            d = min(x, y, n - 1 - x, n - 1 - y)
            if 1 <= d < slice_ - 1: px[x, y] = hx(spot[1][r.randrange(len(spot[1]))]) + (255,)
    return im


def tone(*stops):
    cs = [hx(s) for s in stops]
    return lambda x, y, lit, d: cs[min(len(cs) - 1, int((1 - lit) * len(cs)))]


PROFILE = {   # 14 x 14, border-image slice 4 (the format of mart/frame-*.png)
    'ember':   dict(band=tone('#ffb02e', '#e8641f', '#b22a2a', '#6e161a'), outer='#1a0a06', inner='#0b0b09', corner=(['ll.', 'ly.', '...'], dict(l='#fff6c8', y='#ffcc66')), anim=True, en='Ember', ru='Угли', stars=50),
    'frost':   dict(band=tone('#f0faff', '#ace8ff', '#6ac8f0', '#3a90c8'), outer='#0a1420', inner='#0b0b09', corner=(['w..', '.w.', '...'], dict(w='#ffffff')), en='Frost', ru='Иней', stars=50),
    'moss':    dict(band=tone('#8adc5a', '#5a9a3a', '#3a6a2a', '#22401c'), outer='#0e1a0a', inner='#0b0b09', corner=(['ff.', 'f..', '...'], dict(f='#ff8aa8')), en='Moss', ru='Мох', stars=25),
    'bone':    dict(band=tone('#f2eee0', '#d8d0bc', '#a89c90', '#6a6058'), outer='#1a1010', inner='#0b0b09', corner=(['www', 'wdw', 'www'], dict(w='#ffffff', d='#1a1010')), en='Bone', ru='Кость', stars=50),
    'stars':   dict(band=tone('#3a4a8a', '#2a3470', '#1c2450', '#121834'), outer='#06080f', inner='#0b0b09', corner=(['.w.', 'www', '.w.'], dict(w='#fff6c8')), spot=(10, ['#ffffff', '#8fd8ff']), anim=True, en='Night Sky', ru='Звёздная ночь', stars=75),
    'runes':   dict(band=tone('#8a2a1a', '#6a1410', '#4a0c0a', '#2a0606'), outer='#100204', inner='#0b0b09', corner=(['rr.', 'r..', '...'], dict(r='#ff3a1a')), spot=(8, ['#ff5a1a', '#ff2a1a']), en='Demon Runes', ru='Демонские руны', stars=75),
    'crystal': dict(band=tone('#d8b8ff', '#a87ae0', '#7a4ab8', '#4a2a7a'), outer='#140a20', inner='#0b0b09', corner=(['g..', 'gg.', '...'], dict(g='#9be36a')), en='Cave Crystal', ru='Пещерный кристалл', stars=75),
    'sunforge':dict(band=tone('#fffce4', '#ffec8e', '#ffd040', '#c08a2a'), outer='#2a1804', inner='#0b0b09', corner=(['ww.', 'wr.', '...'], dict(w='#ffffff', r='#b22a2a')), en='Sunforge', ru='Солнечная кузня', stars=100),
}
TITLES = [  # key, en, ru, rarity, how (bought | badge id | season)
    ('kindler', 'Kindler', 'Разжигатель', 'common', 25), ('keeper', 'Keeper of the Fire', 'Хранитель костра', 'rare', 50),
    ('ratking', 'Rat Whisperer', 'Крысиный шептун', 'common', 25), ('deepdiver', 'Deep Diver', 'Ныряльщик в глубины', 'rare', 'badge:depth20'),
    ('slayer', 'Goo Slayer', 'Гроза Жижи', 'common', 'badge:boss1'), ('alchemist', 'Mad Alchemist', 'Безумный алхимик', 'rare', 50),
    ('lucky', 'Lucky Fool', 'Везучий дурак', 'common', 25), ('ghost', 'Friend of Ghosts', 'Друг призраков', 'rare', 'season:1'),
    ('sage', 'Sage of the Halls', 'Мудрец залов', 'legend', 'badge:victory'), ('ember', 'Ember Soul', 'Душа углей', 'legend', 'season:1'),
    ('patron', 'Patron of the Fire', 'Покровитель костра', 'legend', 'patron'), ('first', 'First Spark', 'Первая искра', 'legend', 'season:1'),
]
PLATES = dict(common=('#4a4e45', '#62665b', '#2a2c26'), rare=('#3a5a8e', '#6a86b8', '#1c2a46'), legend=('#c08a2a', '#ffcc66', '#5a3404'))
NAMECOL = [('ember', '#ff9a3a', 'Ember', 'Угольный', 25), ('gold', '#ffcc66', 'Gold', 'Золотой', 50), ('frost', '#9fdcff', 'Frost', 'Морозный', 25), ('moss', '#8adc5a', 'Moss', 'Моховой', 25),
           ('rose', '#ff8aa8', 'Rose', 'Розовый', 25), ('violet', '#b48aff', 'Violet', 'Фиалковый', 25), ('ash', '#c8c2b8', 'Ash', 'Пепельный', 25),
           ('flame', 'linear-gradient(#fff6c8, #ffcc66 35%, #ff9a3a 65%, #e8641f)', 'Living Flame', 'Живое пламя', 75)]
PHOTO = {   # 24 x 24, border-image slice 8 (fl-photo-frame.png)
    'polaroid': dict(band=lambda x, y, lit, d: hx('#f2eee0') if lit > .45 else hx('#d8d0bc'), outer='#a89c90', inner='#3b3e36', en='Instant Photo', ru='Моментальное фото', stars=25),
    'film':     dict(band=lambda x, y, lit, d: (hx('#e8e2c8') if (d in (3, 4) and (x if y < 8 or y > 15 else y) % 4 < 2 and (y < 8 or y > 15)) else hx('#151612')), outer='#0b0b09', inner='#2a2c26', en='Film Strip', ru='Плёнка', stars=25),
    'dungeon':  dict(band=lambda x, y, lit, d: hx(['#7a8173', '#62665b', '#4a4e45'][(x // 4 + y // 3 + (y // 3) % 2) % 3]) if (x % 4 and y % 3) else hx('#2a2c26'), outer='#151612', inner='#0b0b09',
                     corner=(['vv.', 'v..', '...'], dict(v='#5a9a3a')), en='Dungeon Stone', ru='Камень подземелья', stars=25),
    'gilded':   dict(band=tone('#fffce4', '#ffec8e', '#ffd040', '#e0a018', '#a86a0a'), outer='#3a2004', inner='#5a3404', corner=(['.rr', 'rgr', 'rr.'], dict(r='#b22a2a', g='#fff6c8')), en='Gilded', ru='Позолота', stars=50),
    'frost':    dict(band=tone('#ffffff', '#e4f8ff', '#ace8ff', '#6ac8f0', '#3a90c8'), outer='#0a1420', inner='#1a4a7a', corner=(['w.w', '.w.', 'w.w'], dict(w='#ffffff')), en='Frozen', ru='Изморозь', stars=50),
    'embers':   dict(band=tone('#3a1a10', '#2a120c', '#1a0a06'), outer='#0b0b09', inner='#6e161a', spot=(26, ['#ffb02e', '#e8641f', '#ff9a3a', '#fff6c8']), corner=(['yy.', 'y..', '...'], dict(y='#ffcc66')), en='Glowing Coals', ru='Тлеющие угли', stars=50),
}
STICKER = dict(o='#1a1010', w='#ffffff', r='#b22a2a', R='#e8641f', y='#ffcc66', l='#fff6c8', f='#ff9a3a', g='#c08a2a', s='#e8e2c8', S='#a89c90',
               b='#3a90c8', B='#ace8ff', p='#a44aff', P='#dc96ff', m='#9aa4a8', M='#5a6268', k='#7a5030', v='#5a9a3a', x='#151612')
STICKERS = {
    'fire':   ["....r.......", "...rfr..r...", "...rffr.rr..", "..rffyfrfr..", "..rfyyyffr..", ".rffyllyffr.", ".rfylllyyfr.", ".rfyllllyfr.", ".rffylllyfr.", "..rffyyyfr..", "...rrffffr..", ".....rrrr..."],
    'skull':  ["...oooooo...", "..osssssso..", ".osssssssso.", ".osooossooso", ".osoxosoxoso", ".osooossooso", ".ossssxsssso", "..ossssssso.", "...osSsSso..", "...oSoSoSo..", "....ooooo...", "............"],
    'heart':  ["............", "..rr....rr..", ".rRRr..rRRr.", "rRllRrrRRRRr", "rRlRRRRRRRRr", "rRRRRRRRRRRr", ".rRRRRRRRRr.", "..rRRRRRRr..", "...rRRRRr...", "....rRRr....", ".....rr.....", "............"],
    'crown':  ["............", ".y...y...y..", ".yy.yyy.yy..", ".yyyyyyyyy..", ".ylyyryylyy.", ".yyyyyyyyyy.", ".gggggggggg.", ".grgggbgggr.", ".gggggggggg.", "............", "............", "............"],
    'star':   [".....y......", ".....y......", "....yly.....", "....yly.....", "yyyyylyyyyy.", ".yyllllllyy.", "..yyllllyy..", "...yllllly..", "..yylyyylyy.", "..yy.....yy.", ".y.........y", "............"],
    'amulet': ["...oooooo...", "..oyyyyyyo..", "..oy....yo..", "...oy..yo...", "....oyyo....", "...oyrryo...", "..oyrRRryo..", "..oyrRlryo..", "..oyrrrryo..", "...oyyyyo...", "....oooo....", "............"],
    'sword':  ["..........ml", ".........mlm", "........mlm.", ".......mlm..", "......mlm...", ".g...mlm....", ".gg.mlm.....", "..gglm......", "...gg.......", "..kggg......", ".kk..g......", "kk.........."],
    'potion': ["....oooo....", "....okko....", ".....oo.....", "....oPPo....", "...oPPPPo...", "..oPlPPPPo..", "..oPpPPPPo..", "..oppppppo..", "..oppppppo..", "...oppppo...", "....oooo....", "............"],
    'rat':    ["............", "............", "...SS.......", "..SsSS......", ".SSSSSSSS...", "xSxSSSSSSS..", "SSSSSSSSSSS.", ".SSSSSSSSSSr", "..S..S..S..r", "............", "............", "............"],
    'ghost':  ["....wwww....", "...wwwwww...", "..wwwwwwww..", "..wxxwwxxw..", "..wxxwwxxw..", "..wwwwwwww..", "..wwwxxwww..", "..wwwwwwww..", "..wwwwwwww..", "..w.ww.ww.w.", "............", "............"],
    'gg':     ["............", ".yyyy..yyyy.", "yy....yy....", "y.....y.....", "y..yy.y..yy.", "y...y.y...y.", "yy..y.yy..y.", ".yyyy..yyyy.", "............", "............", "............", "............"],
    'wow':    ["....y.......", "....y..ffff.", "....y.ff..ff", "....y.....ff", "....y....ff.", "....y...ff..", "........ff..", "....y.......", "....y...ff..", "............", "............", "............"],
}
STN = dict(fire=('Fire', 'Огонь'), skull=('Skull', 'Череп'), heart=('Heart', 'Сердце'), crown=('Crown', 'Корона'), star=('Star', 'Звезда'), amulet=('Amulet', 'Амулет'),
           sword=('Sword', 'Меч'), potion=('Potion', 'Зелье'), rat=('Rat', 'Крыса'), ghost=('Ghost', 'Призрак'), gg=('GG', 'GG'), wow=('!?', '!?'))
TICONS = {   # 9 x 9 title icons
    'kindler': ["....r....", "...rf....", "...rfr...", "..rfyfr..", "..fyyyf..", "..fylyf..", "kkkkkkkkk", ".kk...kk.", "........."],
    'keeper': ["....y....", "...yfy...", "..yflfy..", "..yflfy..", ".yffffffy", "mmmmmmmmm", ".m.....m.", ".m.....m.", "........."],
    'ratking': [".y.y.y...", ".yyyyy...", "..SSS....", ".SsSSS...", "SSSSSSSS.", "xSSSSSSSS", ".S..S..Sr", "........r", "........."],
    'deepdiver': ["...ss....", "...ss....", "...ss....", "...ss....", ".sssssss.", "..sssss..", "...sss...", "....s....", "........."],
    'slayer': ["....v....", "..vvvvv..", ".vvBvvBv.", ".vvvvvvv.", "vvvvvvvvv", "vv.vvv.vv", "m.......m", ".m.....m.", "..mmmmm.."],
    'alchemist': ["...ooo...", "...okk...", "....o....", "...oPo...", "..oPPPo..", ".oPlPPPo.", ".opppppo.", ".opppppo.", "..ooooo.."],
    'lucky': ["..vv.vv..", ".vvvvvvv.", ".vvvvvvv.", "..vvvvv..", "vvvvvvvvv", "vvvvvvvvv", "..vv.vv..", "....k....", "....k...."],
    'ghost': ["..wwwww..", ".wwwwwww.", ".wxwwwxw.", ".wwwwwww.", ".wwwxwww.", ".wwwwwww.", ".wwwwwww.", ".w.w.w.w.", "........."],
    'sage': ["...yyy...", "..y...y..", "..ssss...", ".ssssss..", ".sxssxs..", ".ssssss..", ".wwwwww..", "..wwww...", "...ww...."],
    'ember': ["....l....", "...lyl...", "..lyfyl..", "..yfRfy..", ".yfRrRfy.", ".fRrrrRf.", "..RrrrR..", "...RRR...", "........."],
    'patron': ["....y....", "....y....", "...yly...", "yyyylyyyy", ".yyllly..", "..yllly..", "..yy.yy..", ".yy...yy.", "........."],
    'first': ["....l....", "....l....", "..l.l.l..", "...lll...", "lllllllll", "...lll...", "..l.l.l..", "....l....", "....l...."],
}


def plate(rar):
    """A title plate in badge style: 24 x 12, border-image slice 4 (stretched under the text), its icon at the left."""
    a, b, c = (hx(x) for x in PLATES[rar]); im = Image.new('RGBA', (24, 12), (0, 0, 0, 0)); px = im.load()
    for y in range(12):
        for x in range(24):
            if (x in (0, 23) and y in (0, 11)): continue
            edge = x in (0, 23) or y in (0, 11)
            px[x, y] = (hx('#151612') if edge else (b if y == 1 else (c if y == 10 else a))) + (255,)
    for x in (1, 22):
        for y in (1, 10): px[x, y] = hx('#fff6c8' if rar == 'legend' else ('#ace8ff' if rar == 'rare' else '#9fa896')) + (255,)
    return im


def banner():
    """The season banner art, 160 x 60 (shown x2 / x3): the gate of the dungeon at night, a great fire, the four heroes."""
    bg = Image.open(SRC + 'camp/camp-outdoor-winter.png').convert('RGBA')
    sky = bg.crop((0, 0, 94, 60)).resize((160, 60), Image.NEAREST)
    sp = sky.load()
    for y in range(14, 40):       # no moon behind the rogue
        for x in range(92, 124):
            if sum(sp[x, y][:3]) > 330: sp[x, y] = sp[x, 12]
    im = Image.new('RGBA', (160, 60), (0, 0, 0, 255)); im.alpha_composite(sky)
    gate = bg.crop((24, 40, 70, 100)).copy(); skyc = {bg.getpixel((x, y))[:3] for y in range(0, 40) for x in range(94)}
    gp_ = gate.load()
    for y in range(gate.height):
        for x in range(gate.width):
            if gp_[x, y][:3] in skyc: gp_[x, y] = (0, 0, 0, 0)
    im.alpha_composite(gate, (57, 4))
    ground = Image.new('RGBA', (160, 12), hx('#1c2232') + (255,)); im.alpha_composite(ground, (0, 48))
    glow = Image.new('RGBA', (160, 60), (0, 0, 0, 0)); gp = glow.load()
    for y in range(60):
        for x in range(160):
            d = math.hypot(x - 80, (y - 46) * 1.4); a = max(0, 1 - d / 60) ** 1.8 * 190
            if a > 0: gp[x, y] = hx('#ff9a3a') + (int(a),)
    im.alpha_composite(glow)
    fire = Image.open(SRC + 'camp/fire.png').convert('RGBA').crop((26, 0, 39, 17)); fire2 = x_n(fire, 2); im.alpha_composite(fire2, (80 - 13, 52 - 34))
    logs = Image.open(OUT + 'fires/classic-logs.png'); im.alpha_composite(x_n(logs, 2), (80 - 16, 46))
    LEG = dict(warrior='forgeborn', mage='starflame', rogue='smoulder', ranger='wildfire')
    for i, (cls, x, flip) in enumerate((('warrior', 22, False), ('mage', 44, False), ('rogue', 116, True), ('ranger', 138, True))):
        f = frame(Image.open(OUT + f'legendary/{cls}-{LEG[cls]}.png'), 0, 1); f = f.transpose(Image.FLIP_LEFT_RIGHT) if flip else f
        im.alpha_composite(x_n(f, 2), (x - 6, 56 - 30))
    r = rnd(5)
    for _ in range(40):
        x, y = r.randint(50, 110), r.randint(2, 40); im.putpixel((x, y), hx(['#fff6c8', '#ffcc66', '#ff9a3a'][r.randrange(3)]) + (255,))
    return im


if __name__ == '__main__':
    cat = []
    for k, d in PROFILE.items():
        im = ring_frame(14, 4, d['band'], hx(d['outer']), hx(d['inner']), d.get('corner'), seed=len(k), spot=d.get('spot'))
        save(im, f'profile/frame-{k}.png')
        if d.get('anim'):     # 4 frames: the corner sparks wander round the ring
            frs = [ring_frame(14, 4, d['band'], hx(d['outer']), hx(d['inner']), d.get('corner'), seed=len(k) + i * 13, spot=(d.get('spot') or (6, ['#fff6c8', '#ffcc66']))) for i in range(4)]
            save(strip(frs), f'profile/frame-{k}-anim.png')
        cat.append(dict(sku=f'frame.{k}', kind='frame', frame=k, stars=d['stars'], name=dict(en=d['en'], ru=d['ru']), sprite=f'mart/fl/profile/frame-{k}.png', slice=4,
                        **({'anim': dict(sheet=f'mart/fl/profile/frame-{k}-anim.png', frames=4, ms=180)} if d.get('anim') else {})))
    for rar in PLATES: save(plate(rar), f'profile/title-plate-{rar}.png')
    pal = {k: hx(v) for k, v in STICKER.items()}
    for key, en, ru, rar, how in TITLES:
        save(grid(TICONS[key], pal), f'profile/title-{key}.png')
        cat.append(dict(sku=f'title.{key}', kind='title', title=key, rarity=rar, name=dict(en=en, ru=ru), icon=f'mart/fl/profile/title-{key}.png', plate=f'mart/fl/profile/title-plate-{rar}.png',
                        **({'stars': how} if isinstance(how, int) else {'stars': 0, 'how': how})))
    for k, c, en, ru, st in NAMECOL:
        cat.append(dict(sku=f'name.{k}', kind='name', color=c, stars=st, name=dict(en=en, ru=ru), css=f'fl-name-{k}'))
    for k, d in PHOTO.items():
        im = ring_frame(24, 8, d['band'], hx(d['outer']), hx(d['inner']), d.get('corner'), seed=len(k) * 3, spot=d.get('spot'))
        save(im, f'photo/frame-{k}.png')
        cat.append(dict(sku=f'photo.{k}', kind='photoframe', stars=d['stars'], name=dict(en=d['en'], ru=d['ru']), sprite=f'mart/fl/photo/frame-{k}.png', slice=8))
    for k, rows in STICKERS.items():
        im = grid(rows, pal); st = outline(outline(im, (255, 255, 255, 255), diag=True), (26, 16, 16, 255))
        b = Image.new('RGBA', (16, 16), (0, 0, 0, 0)); b.alpha_composite(st, ((16 - st.width) // 2, (16 - st.height) // 2)); save(b, f'photo/sticker-{k}.png')
        cat.append(dict(sku=f'sticker.{k}', kind='sticker', stars=0, pack='stickers', name=dict(en=STN[k][0], ru=STN[k][1]), sprite=f'mart/fl/photo/sticker-{k}.png'))
    cat.append(dict(sku='stickers.pack1', kind='stickers', stars=50, name=dict(en='Sticker Pack: Deep Night', ru='Набор наклеек «Глубокая ночь»'), items=[f'sticker.{k}' for k in STICKERS], icon='mart/fl/photo/sticker-fire.png'))
    save(banner(), 'season/banner.png')
    json.dump(cat, open(out('catalog-profile.json'), 'w'), ensure_ascii=False, indent=1)
    # check
    chk = Image.new('RGBA', (200, 120), (40, 40, 40, 255)); x = 0
    for k in PROFILE: chk.alpha_composite(Image.open(OUT + f'profile/frame-{k}.png'), (x, 0)); x += 16
    x = 0
    for k in PHOTO: chk.alpha_composite(Image.open(OUT + f'photo/frame-{k}.png'), (x, 18)); x += 26
    x = 0
    for k in STICKERS: chk.alpha_composite(Image.open(OUT + f'photo/sticker-{k}.png'), (x, 44)); x += 16
    x = 0
    for key, *_ in TITLES: chk.alpha_composite(Image.open(OUT + f'profile/title-{key}.png'), (x, 62)); x += 11
    for i, rar in enumerate(PLATES): chk.alpha_composite(plate(rar), (i * 26, 74))
    x_n(chk, 4).save(os.path.join(os.environ.get('P5_CHECK', '/tmp'), 'prof.png')); x_n(banner(), 4).save(os.path.join(os.environ.get('P5_CHECK', '/tmp'), 'banner.png')); print('profile', len(cat))
