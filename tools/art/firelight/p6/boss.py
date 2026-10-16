# Firelight · part 6: the boss cards' art. A portrait 32 x 32 per boss (its own sprite, frame 0, on a backdrop of its arena's accent,
# shown x2 on a phone and x3 on a monitor) and the plate under the name (32 x 32, border-image slice 10, coal with an ember edge).
from PIL import Image
from px import *

BOSSES = {   # sheet, frame w, h, accent, backdrop
    'goo':   ('goo.png', 20, 14, '#7fdc4a', '#16300e'),
    'tengu': ('tengu.png', 14, 16, '#d8e4ff', '#1a2030'),
    'dm300': ('dm300.png', 22, 20, '#ff3a2a', '#2a1210'),
    'king':  ('king.png', 16, 16, '#ffcc66', '#2a2010'),
    'yog':   ('yog.png', 20, 19, '#ff2a4a', '#2a0610'),
}


def portrait(key):
    sheet, w, h, acc, back = BOSSES[key]; a, b = hx(acc), hx(back)
    c = Cv(32, 32)
    for y in range(32):
        for x in range(32):
            if (x in (0, 31) and y in (0, 31)): continue
            edge = x in (0, 31) or y in (0, 31)
            d = ((x - 15.5) ** 2 + (y - 18) ** 2) ** 0.5
            col = hx('#0b0b09') if edge else (mix(b, a, 0.35) if d < 9 else (mix(b, a, 0.18) if d < 13 else b))
            c.put(x, y, col)
    for x in range(1, 31): c.put(x, 1, mix(a, (255, 255, 255), 0.3), 140)    # the lit top edge
    c.ring(15.5, 18, 13, a, 90)
    spr = Image.open(SRC + sheet).convert('RGBA').crop((0, 0, w, h))
    sh = Cv(32, 32); sh.disc(16, 27, w / 2.4, (0, 0, 0), 120, sq=0.3); c.blit(sh, 0, 0)
    c.blit(spr, 16 - w // 2, 28 - h)
    return c.im


def plate():
    c = Cv(32, 32); coal, deep, ember, gold = hx('#6e161a'), hx('#2a0a0c'), hx('#e8641f'), hx('#ffcc66')
    for y in range(32):
        for x in range(32):
            if (x in (0, 31) and y in (0, 31)): continue
            edge = x in (0, 31) or y in (0, 31)
            col = hx('#0b0b09') if edge else (gold if y == 1 else (ember if y in (2, 30) else (coal if y < 6 or y > 26 or x < 3 or x > 28 else deep)))
            c.put(x, y, col)
    for x in (4, 27):
        for y in (4, 27): c.put(x, y, gold)
    return c.im


if __name__ == '__main__':
    for k in BOSSES: save(portrait(k), f'boss/portrait-{k}.png')
    save(plate(), 'boss/plate.png')
    print('boss ok')
