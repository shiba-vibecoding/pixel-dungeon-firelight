# Firelight · part 2: camp icons (mail, Mart, settings, rankings) and photo mode icons, 16x16, outlined in void,
# lit warm from below-left like everything near the fire.
import numpy as np
from PIL import Image
UI = '/home/claude/firelight/p2/out/packages/client/public/assets/ui/'
CAMP = '/home/claude/firelight/p2/out/packages/client/public/assets/camp/'
P = {
 'o': '#0b0b09', 'p': '#f2e2b8', 'q': '#d8c08c', 'r': '#a8905e', 'R': '#6e5634',
 's': '#b22a2a', 't': '#e8641f', 'u': '#6e161a', 'y': '#ffcc66', 'Y': '#ffeba4', 'w': '#fffad6', 'f': '#ff9a3a',
 'b': '#c69a52', 'B': '#8a6430', 'n': '#5a3e1e', 'k': '#3a2a18', 'g': '#9fa896', 'G': '#62665b', 'd': '#3b3e36', 'D': '#1f211c',
 'W': '#7a5232', 'V': '#a87a48', 'c': '#b8c6d8', 'C': '#7a8aa0', 'x': '#282a24', 'v': '#e8e2c8',
}
def img(rows):
    h, w = len(rows), max(len(r) for r in rows); a = np.zeros((h, w, 4), np.uint8)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in P:
                c = P[ch].lstrip('#'); a[y, x] = (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)
    return Image.fromarray(a, 'RGBA')
ICONS = {
 'mail': [
  '................',
  '................',
  '.oooooooooooooo.',
  '.oYppppppppppqo.',
  '.opYppppppppqro.',
  '.oppqppppppqrro.',
  '.opppqppppqrrro.',
  '.oppppqsstrrrro.',
  '.opppppstu.rrro.',
  '.oppppqpuprrrro.',
  '.opppqpppppqrro.',
  '.oppqpppppppqro.',
  '.oyqppppppppppo.',
  '.oyyrrrrrrrrrRo.',
  '.oooooooooooooo.',
  '................',
 ],
 'mart': [
  '................',
  '.oooooooooooooo.',
  '.osYsYsYsYsYsYo.',
  '.osYsYsYsYsYsYo.',
  '.ouyuyuyuyuyuyo.',
  '.oooooooooooooo.',
  '..oWo..yy..oWo..',
  '..oVo.yffy.oVo..',
  '..oVo.yffy.oVo..',
  '..oVo..yy..oVo..',
  '..oVo......oVo..',
  'oooooooooooooooo',
  'obbbbbbbbbbbbbbo',
  'onBBBBBBBBBBBBno',
  'oooooooooooooooo',
  '................',
 ],
 'prefs': [
  '................',
  '......oooo......',
  '..oo..obbo..oo..',
  '.obbooobbooobbo.',
  '.obbbbbbbbbbbbo.',
  '..obbbBBBBbbbo..',
  '.oobbBokkoBbboo.',
  'obbbbBokfoBbbbbo',
  'oBBbbBokkoBbBBBo',
  '.ooBbBBooBBbBoo.',
  '..oBBbBBBBbBBo..',
  '.oBBBBBBBBBBBBo.',
  '.oBBoooBBoooBBo.',
  '..oo..oBBo..oo..',
  '......oooo......',
  '................',
 ],
 'ranks': [
  '................',
  '.......Y........',
  '......wYf.......',
  '.ooooooffoooooo.',
  'oYooYyyyyyyboByo',
  'oYo.oYyyyyybo.Bo',
  'oYo.oYyyyyybo.Bo',
  '.oYooYyyyyyboBo.',
  '..oooYyyyyybooo.',
  '.....oYyyybo....',
  '......oyybo.....',
  '.......oyo......',
  '.......oyo......',
  '.....oYyybbo....',
  '....obbbbbbBo...',
  '....oooooooooo..',
 ],
 'camera': [
  '................',
  '................',
  '....oooo........',
  '...oGggGo.......',
  '.oooooooooooooo.',
  '.oggggggggggggo.',
  '.ogGGoooooGGygo.',
  '.ogGoCccCCoGGgo.',
  '.ogGoccwcCoGGgo.',
  '.ogGoCccCCoGGgo.',
  '.ogGGoooooGGGgo.',
  '.oGGGGGGGGGGGGo.',
  '.oooooooooooooo.',
  '................',
  '................',
  '................',
 ],
 'save': [
  '................',
  '.......oo.......',
  '......oyyo......',
  '......oyyo......',
  '......oyyo......',
  '...oooyyyyooo...',
  '....oyyyyyyo....',
  '.....oyyyyo.....',
  '......oyyo......',
  '.oo....oo....oo.',
  '.ovo........ovo.',
  '.ovooooooooooovo',
  '.ovvvvvvvvvvvvo.',
  '.oooooooooooooo.',
  '................',
  '................',
 ],
 'story': [
  '................',
  '.....oooooo.....',
  '...oottffyyoo...',
  '..otto....yYo...',
  '..oto......Yo...',
  '.oso..oooo..wo..',
  '.oso.oyyyyo.Yo..',
  '.oso.oyffyo.Yo..',
  '.oso.oyffyo.yo..',
  '.oso.oyyyyo.yo..',
  '.ouo..oooo..fo..',
  '..ouo......to...',
  '..ouuo....tto...',
  '...oouussttoo...',
  '.....oooooo.....',
  '................',
 ],
 'f-none': ['............', '...oooooo...', '..oggggggo..', '.oggggggGgo.', '.oggggggGGo.', '.ogggggGGgo.', '.oggggGGggo.', '.ogggGGgggo.', '.oggGGggggo.', '..oGGggggo..', '...oooooo...', '............'],
 'f-warm': ['............', '.....oo.....', '....oYYo....', '...oyYYyo...', '..oyffffyo..', '.oyfffftfyo.', '.oyfttttfyo.', '.oyfttsttfo.', '..oftssstfo.', '...oottttoo.', '.....oooo...', '............'],
 'f-noir': ['............', '...oooooo...', '..ovvvxxxo..', '.ovvvvxxxxo.', '.ovvvvxxxxo.', '.ovvvvxxxxo.', '.ovvvvxxxxo.', '.ovvvvxxxxo.', '.ovvvvxxxxo.', '..ovvvxxxo..', '...oooooo...', '............'],
 'f-dream': ['............', '.....oo.....', '.....ow.....', '....owwo....', '.oooowwoooo.', '.owwwwwwwwo.', '..ooccwcoo..', '....owcwo...', '...owo.owo..', '...oo...oo..', '............', '............'],
}
for name, rows in ICONS.items():
    im = img([r[:16] for r in rows])
    if name in ('mail', 'mart', 'prefs', 'ranks'): im.save(CAMP + f'icon-{name}.png', optimize=True)
    else: im.save(UI + f'fl-{name}.png', optimize=True)
# the photo frame (9-slice, 24x24, slice 8): dark wood lit warm from below, ember studs in the corners
fr = np.zeros((24, 24, 4), np.uint8)
def put(x, y, c): fr[y, x] = (*[int(c.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)], 255)
for y in range(24):
    for x in range(24):
        e = min(x, y, 23 - x, 23 - y)
        if e >= 6: continue
        bottom = y >= 12
        if e == 0: put(x, y, '#0b0b09')
        elif e == 1: put(x, y, '#e0b878' if bottom else '#a8804e')
        elif e in (2, 3, 4): put(x, y, ['#7a5232', '#5e3e22', '#4a3018'][e - 2] if (x + y) % 5 else '#3a2412')
        elif e == 5: put(x, y, '#0b0b09')
for cx, cy in ((3, 3), (20, 3), (3, 20), (20, 20)):
    bottom = cy > 12
    for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
        put(cx - 1 + dx, cy - 1 + dy, ('#ffcc66' if (dx, dy) == (0, 0) else '#e8641f') if bottom else ('#c9b48a' if (dx, dy) == (0, 0) else '#8c7a5a'))
Image.fromarray(fr, 'RGBA').save(UI + 'fl-photo-frame.png', optimize=True)
print('icons ok')
