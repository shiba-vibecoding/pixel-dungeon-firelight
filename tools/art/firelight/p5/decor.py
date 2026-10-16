# Firelight · part 5: camp decorations, 12 sprites for the camp («Привал»), drawn in the camp's pixel scale (1 px = 1 scene px),
# each with its place in the 94 x 203 scene (feet = the bottom-middle pixel), a glow mask where it shines.
import json
from PIL import Image
from common import *

PAL = dict(o='#1a1010', a='#a8784a', b='#7a5030', c='#4a2c18', C='#e8dcc0', D='#c0b090', E='#8a7a5a', r='#b22a2a', R='#e8641f',
           m='#9aa4a8', M='#5a6268', g='#ffcc66', G='#c08a2a', s='#9a9e94', S='#6a6e66', T='#3b3e36', l='#fff6c8', y='#ffb02e',
           d='#151612', p='#5a3aa0', P='#8a6ad0', k='#2a2026', w='#f2eee0', v='#4a8a3a', V='#2a5a2a', u='#3a90c8')
DECOR = {
    'tent': (['...........oo...........', '..........oCDo..........', '.........oCCDDo.........', '........oCCdDDDo........', '.......oCCddDDDEo.......',
              '......oCCdddDDDEEo......', '.....oCCddddDDDEEEo.....', '....oCCdddddDDDDEEEo....', '...oCCddddddDDDDEEEEo...', '..oCCdddddddDDDDDEEEEo..',
              '.oCCddddddddDDDDDEEEEEo.', 'oCCCdddddddddDDDDDEEEEEo', 'oooooooooooooooooooooooo', '.b......................b'], 'left', (12, 107), 'Tent', 'Палатка', 150),
    'banner': (['oo.........', 'ao.........', 'aooooooooo.', 'aorrrrrrro.', 'aorRrrrRro.', 'aorrgggrro.', 'aorrgygrro.', 'aorrgggrro.', 'aorrrrrrro.', 'aorrrrrro..',
                'aorrrrro...', 'aorrrro....', 'aoooo......', 'ao.........', 'ao.........', 'ao.........', 'ao.........', 'ao.........', 'bo.........', 'oo.........'], 'right', (89, 113), 'Firelight Banner', 'Знамя костра', 100),
    'lantern': (['..ooo..', '..oMo..', '.ooooo.', 'oMlllMo', 'omlylmo', 'omyyymo', 'omlylmo', 'oMlllMo', '.ooooo.', '..oMo..', '..oMo..', '..oMo..', '.ooooo.', 'oMMMMMo', 'ooooooo'],
                'path', (37, 124), 'Lantern', 'Фонарь', 50, 'ly'),
    'statue': (['.....ooo.....', '....osSso....', '....osssso...', '....oSsSo....', '.....osso....', '...oosssoo...', '..osssssssso.', '..osSsssSsso.', '..oo.sss.oo..',
                '....osSso....', '....osso.....', '...oossoo....', '..oSSSSSSSo..', '.oSsssssssSo.', '.ooooooooooo.'], 'back', (84, 104), 'Hero Statue', 'Статуя героя', 150),
    'musicbox': (['....o.....', '...oyo....', '..oooooo..', '.oaagaaao.', 'oaaaaaaaao', 'obbgggbbbo', 'obbgPgbbbo', 'obbgggbbbo', 'occcccccco', 'oooooooooo'],
                 'right', (63, 126), 'Music Box', 'Музыкальная шкатулка', 100),
    'chest': (['..oooooooooo..', '.oaaaaaaaaaao.', 'oaaGGaaaaGGaao', 'obbbbbggbbbbbo', 'oooooogyoooooo', 'obbbbbggbbbbbo', 'obbGbbbbbbGbbo', 'obbbbbbbbbbbbo', 'occccccccccccо', 'oooooooooooooo'],
              'left', (11, 131), 'Treasure Chest', 'Сундук', 75),
    'bedroll': (['....oooooooooooooo..', '..ooCCCrrrrrrrrrrro.', '.oCCCCCrRrrrRrrrrro.', '.oDDDDDrrrrrrrrrrro.', 'oDDDDDDrrrRrrrrRrro.', 'ooooooooooooooooooo.'],
                'left', (16, 141), 'Bedroll', 'Спальник', 50),
    'cauldron': (['..v.....v.....', '...v..v..v....', '.oooooooooooo.', 'oMMvVvvVvvVMMo', 'oTTTTTTTTTTTTo', '.oMMMMMMMMMMo.', '.oTTTTTTTTTTo.', '..oTTTTTTTTo..', '...oooooooo...', '...o......o...'],
                 'right', (80, 134), 'Witch Cauldron', 'Котёл ведьмы', 100, 'vV'),
    'bench': (['oooooooooooooooooooooo', 'oaaaaaaaaaaaaaaaaaaaao', 'obbcbbbbbbbbcbbbbbcbbo', 'oooooooooooooooooooooo', '.obo..............obo.', '.oco..............oco.'],
              'path', (24, 152), 'Log Bench', 'Скамья из бревна', 50),
    'dummy': (['.....ooo.....', '....oDDDo....', '....oDdDo....', '....oDDDo....', '.....ooo.....', 'oooooobooooo.', 'oDDDDDbDDDDDo', 'oooooDbDoooo.', '....oDbDo....', '....oDbDo....',
               '....oDbDo....', '....oooooo...', '.....obo.....', '.....obo.....', '.....obo.....', '...ooobooo...', '...ocooooc...'], 'back', (86, 152), 'Training Dummy', 'Чучело для тренировки', 75),
    'signpost': (['......oo......', 'ooooooaoooooo.', 'oCCCCCaCCCCCCo', 'oCEECEaECEECCo', 'ooooooaooooooo', '.ooooooaoooooo', '.oCCCCCaCCCCCo', '.oCECEEaEECECo', '.ooooooaoooooo', '......ao......',
                  '......ao......', '......ao......', '......ao......', '.....obbo.....', '....oooooo....'], 'path', (64, 105), 'Signpost', 'Указатель', 50),
    'woodpile': (['........oooooo....', '.....ooobaaaabo...', '...oobaaoababbaoo.', '..obaaobooooboabo.', '.oabbooaaaaoobbao.', 'obaaboobbbbooaabbo', 'oooooooooooooooooo'],
                 'left', (14, 146), 'Woodpile', 'Поленница', 25),
}

if __name__ == '__main__':
    cat = []; pal = {k: hx(v) for k, v in PAL.items()}
    chk = Image.new('RGBA', (12 * 26, 26), (40, 40, 40, 255))
    for i, (k, d) in enumerate(DECOR.items()):
        rows = [r.replace('о', 'o') for r in d[0]]; w = max(len(r) for r in rows); im = grid([r.ljust(w, '.') for r in rows], pal)
        save(im, f'decor/{k}.png')
        glow = d[6] if len(d) > 6 else None
        if glow:
            g = Image.new('RGBA', im.size, (0, 0, 0, 0)); gp = g.load(); ip = im.load()
            for y in range(im.height):
                for x, ch in enumerate(rows[y].ljust(w, '.')):
                    if ch in glow: gp[x, y] = ip[x, y]
            save(g, f'decor/{k}-glow.png')
        ic = Image.new('RGBA', (26, 26), (0, 0, 0, 0)); sc = im if im.width <= 26 and im.height <= 26 else im.resize((min(26, im.width), min(26, im.height)), Image.NEAREST)
        ic.alpha_composite(sc, ((26 - sc.width) // 2, 26 - sc.height)); save(ic, f'decor/icons/{k}.png'); chk.alpha_composite(ic, (i * 26, 0))
        cat.append(dict(sku=f'decor.{k}', kind='decor', decor=k, stars=d[5], name=dict(en=d[3], ru=d[4]), sprite=f'mart/fl/decor/{k}.png', w=im.width, h=im.height,
                        place=dict(zone=d[1], feet=list(d[2])), **({'glow': f'mart/fl/decor/{k}-glow.png'} if glow else {}), icon=f'mart/fl/decor/icons/{k}.png'))
    json.dump(cat, open(out('catalog-decor.json'), 'w'), ensure_ascii=False, indent=1)
    x_n(chk, 4).save(os.path.join(os.environ.get('P5_CHECK', '/tmp'), 'decor.png')); print('decor', len(cat))
