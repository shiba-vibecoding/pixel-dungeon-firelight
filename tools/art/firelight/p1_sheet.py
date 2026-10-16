# Part 1 · identity sheet (1280x800, RU and EN): the logo on void, on stone, on transparent; square; the mark and icons; the palette.
import json, numpy as np
from PIL import Image, ImageDraw, ImageFont
from brand import lockup, square, campfire
OUT = '/home/claude/firelight/p1/out/'
P = OUT + 'docs/design/previews/firelight/'
G = '/home/claude/firelight/p1/Galmuri11.ttf'; F = lambda n: ImageFont.truetype(G, n)
def up(im, k): return im.resize((im.width * k, im.height * k), Image.NEAREST)
TOK = [t for t in json.load(open(OUT + 'docs/design/system/tokens.json'))['color']['tokens'] if t['name'].startswith('fire-') or t['name'] == 'stone-cold']
L = {
 'ru': {'t': 'Firelight · айдентика', 'a': 'Горизонтальный — титул, загрузка, README', 'b': 'На камне окна (stone-700)', 'c': 'На прозрачном',
        'd': 'Квадратный', 'e': 'Знак: аватар, фавиконки 32 · 64 · 180', 'f': 'Палитра огня --fire-* против холодного камня',
        'rule': 'Огонь горит только на холодном: void, stone-cold, stone-700. Пиксель — целый, масштаб ×N, nearest-neighbour.'},
 'en': {'t': 'Firelight · identity', 'a': 'Horizontal: title screen, loader, README', 'b': 'On window stone (stone-700)', 'c': 'On transparent',
        'd': 'Square', 'e': 'Mark: avatar, favicons 32 · 64 · 180', 'f': 'The fire palette --fire-* against the cold stone',
        'rule': 'Fire burns only on the cold: void, stone-cold, stone-700. Whole pixels, ×N scale, nearest-neighbour.'},
}
def sheet(lang):
    s = L[lang]; im = Image.new('RGBA', (1280, 800), (11, 11, 9, 255)); d = ImageDraw.Draw(im); d.fontmode = '1'
    def lab(xy, t, c='#b0b5a3', f=15): d.text(xy, t, font=F(f if f in (12, 24, 36) else 12), fill=c)
    d.text((32, 22), s['t'], font=F(24), fill='#ffeba4')
    lk = lockup(lang)
    lab((32, 70), s['a']); im.alpha_composite(up(lk, 4), (32, 92))
    lab((440, 70), s['b']); d.rectangle((440, 92, 440 + lk.width * 3 + 24, 92 + lk.height * 3 + 24), fill=(59, 62, 54)); im.alpha_composite(up(lk, 3), (452, 104))
    lab((760, 70), s['c'])
    ck = Image.new('RGBA', (lk.width * 3 + 24, lk.height * 3 + 24)); cd = ImageDraw.Draw(ck)
    for y in range(0, ck.height, 12):
        for x in range(0, ck.width, 12): cd.rectangle((x, y, x + 11, y + 11), fill=(200, 200, 200) if (x // 12 + y // 12) % 2 else (240, 240, 240))
    ck.alpha_composite(up(lk, 3), (12, 12)); im.alpha_composite(ck, (760, 92))
    sq = square(lang); lab((32, 300), s['d']); im.alpha_composite(up(sq, 3), (32, 322))
    lab((330, 300), s['e'])
    av = Image.open(OUT + 'docs/telegram/bot-avatar-512.png').convert('RGBA').resize((192, 192), Image.NEAREST)
    m = Image.new('L', (192, 192), 0); ImageDraw.Draw(m).ellipse((0, 0, 191, 191), fill=255); avc = Image.new('RGBA', (192, 192)); avc.paste(av, (0, 0), m)
    im.alpha_composite(avc, (330, 322))
    x = 540
    for n in ('favicon-32.png', 'favicon-64.png', 'icons/apple-touch-icon-180.png'):
        f = Image.open(OUT + 'packages/client/public/' + n).convert('RGBA'); im.alpha_composite(f, (x, 322)); x += f.width + 16
    lab((32, 560), s['f'])
    for k, t in enumerate(TOK):
        x, y = 32 + (k % 5) * 244, 584 + (k // 5) * 96
        v = t['value']
        if v.startswith('#'): d.rectangle((x, y, x + 56, y + 56), fill=v, outline=(98, 102, 91))
        else:
            d.rectangle((x, y, x + 56, y + 56), fill=(59, 62, 54)); ov = Image.new('RGBA', (57, 57), (255, 154, 58, 46)); im.alpha_composite(ov, (x, y))
        d.text((x + 66, y + 4), '--' + t['name'], font=F(12), fill='#e8e2c8'); d.text((x + 66, y + 22), v[:22], font=F(12), fill='#b0b5a3')
    d.text((32, 772), s['rule'], font=F(12), fill='#ffcc66')
    return im.convert('RGB')
for lang in ('ru', 'en'): sheet(lang).save(P + f'identity-{lang}-1280x800.png', optimize=True)
print('sheet ok')
