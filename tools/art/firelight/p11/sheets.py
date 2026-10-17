# Firelight · part 11: the overview sheets — each area's screens, variants A | B | C side by side (phone), and the 3D shine.
# python3 sheets.py <previews dir> <fonts dir with Galmuri11.ttf, Galmuri9.ttf>
import os, sys
from PIL import Image, ImageDraw, ImageFont
P, FD = sys.argv[1], sys.argv[2]
F = lambda n, s: ImageFont.truetype(os.path.join(FD, n), s)
TITLE, CAP, SMALL = F('Galmuri11.ttf', 33), F('Galmuri11.ttf', 22), F('Galmuri9.ttf', 15)
BG, INK, GOLD, MUT, LINE = (11, 11, 9), (255, 235, 164), (255, 204, 102), (176, 181, 163), (74, 52, 36)

VARIANTS = {
    'levelup': ('Spark', 'Hearth', 'Chronicle', 'Искра', 'Костёр', 'Летопись'),
    'strength': ('Feathers', 'Ladder', 'Weight', 'Перья', 'Лестница', 'Вес'),
    'passport': ('Passport', 'Paper doll', 'By depth', 'Паспорт', 'Кукла', 'По глубинам'),
    'ceremony': ('Seal', 'By the fire', 'Chapter', 'Печать', 'У костра', 'Глава'),
    'ceremony-armor': ('Seal', 'By the fire', 'Chapter', 'Печать', 'У костра', 'Глава'),
    'bag': ('Corners + chips', 'Frames + rail', 'Tags + lenses', 'Уголки + чипы', 'Рамки + рельс', 'Ярлыки + линзы'),
    'item': ('Was / will be', 'Side by side', 'Verdict', 'Было / станет', 'Рядом', 'Вердикт'),
    'truth-upgrade': ('Slot', 'Card', 'Quiet', 'Ячейка', 'Карточка', 'Тихо'),
    'truth-identify': ('Slot', 'Card', 'Quiet', 'Ячейка', 'Карточка', 'Тихо'),
    'truth-enchant': ('Slot', 'Card', 'Quiet', 'Ячейка', 'Карточка', 'Тихо'),
    'truth-uncurse': ('Slot', 'Card', 'Quiet', 'Ячейка', 'Карточка', 'Тихо'),
    'catalog': ('Showcase', 'Alchemist\'s book', 'Elimination', 'Витрина', 'Книга алхимика', 'Исключение'),
    'bestiary': ('Cards', 'By region', 'Trophies', 'Карточки', 'По регионам', 'Трофеи'),
    'chronicle': ('Ribbon', 'Descent map', 'Pages', 'Лента', 'Карта спуска', 'Страницы'),
    'mechanic': ('Card', 'Diagram', 'Cheat sheet', 'Карточка', 'Схема', 'Шпаргалка'),
    'mechanics': ('Card', 'Diagram', 'Cheat sheet', 'Карточка', 'Схема', 'Шпаргалка'),
    'end': ('Growth card', 'Scroll', 'Was / is', 'Карточка роста', 'Свиток', 'Было / стало'),
}
AREAS = [
    ('hero', ('1 · The hero grows', '1 · Рост героя'), ['levelup', 'strength', 'passport', 'ceremony', 'ceremony-armor'], True),
    ('bag', ('2 · The pack', '2 · Рюкзак'), ['bag', 'item', 'truth-upgrade', 'truth-identify', 'truth-enchant', 'truth-uncurse'], False),
    ('know', ('3 · What the player knows', '3 · Знания игрока'), ['catalog', 'bestiary', 'chronicle'], False),
    ('mech', ('4 · How it works', '4 · Как это работает'), ['mechanic', 'mechanics'], False),
    ('end', ('5 · The end of the run', '5 · Конец забега'), ['end'], False),
]
TW, TH = 300, 650
for lang in ('en', 'ru'):
    ru = lang == 'ru'
    for key, titles, screens, shine in AREAS:
        rows = len(screens)
        W = 40 + 3 * (TW + 30) + 30
        extra = 0
        if shine: extra = 3 * (int(TW * 3 * 800 / 1280) // 3 + 70) if False else 3 * 560
        if key == 'end': extra = 470
        H = 110 + rows * (TH + 80) + extra + 40
        im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
        d.text((40, 30), titles[1 if ru else 0], font=TITLE, fill=INK)
        d.text((40, 72), 'Firelight · ' + ('часть 11 · варианты A / B / C · телефон 375×812' if ru else 'part 11 · variants A / B / C · phone 375×812'), font=SMALL, fill=MUT)
        y = 110
        for s in screens:
            names = VARIANTS[s]
            for i, v in enumerate('ABC'):
                x = 40 + i * (TW + 30)
                d.text((x, y), f'{v} · {names[i + 3] if ru else names[i]}', font=CAP, fill=GOLD)
                d.text((x, y + 30), s, font=SMALL, fill=MUT)
                pic = Image.open(os.path.join(P, f'{lang}-375x812', f'{s}-{v}.png')).convert('RGB').resize((TW, TH), Image.LANCZOS)
                im.paste(pic, (x, y + 56)); d.rectangle((x - 1, y + 55, x + TW, y + 56 + TH), outline=LINE)
            y += TH + 80
        if shine:
            for i, v in enumerate('ABC'):
                pic = Image.open(os.path.join(P, '3d', f'shine-{v}-tiers-{lang}-1280x800.png')).convert('RGB')
                pic = pic.resize((W - 80, int((W - 80) * 800 / 1280)), Image.LANCZOS)
                im.paste(pic, (40, y)); y += pic.height + 20
        if key == 'end':
            for i, v in enumerate('ABC'):
                pic = Image.open(os.path.join(P, 'share', f'end-share-{v}-{lang}.png')).convert('RGB').resize((300, 400), Image.LANCZOS)
                im.paste(pic, (40 + i * (TW + 30), y + 30))
            d.text((40, y), 'Карточка для шеринга' if ru else 'The card to share', font=CAP, fill=GOLD)
            y += 450
        im = im.crop((0, 0, W, y + 20))
        os.makedirs(os.path.join(P, 'sheets'), exist_ok=True)
        im.save(os.path.join(P, 'sheets', f'sheet-{key}-{lang}.png'), optimize=True)
        print(key, lang, im.size)
