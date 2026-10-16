# Firelight · part 5: quip pack icons, 16 x 16 portraits (head and shoulders, PD outline), shown x2-x3 on the shop card and the
# bubble's corner. Each pack restyles the hero's quips (the texts are the game's, quipsys.ts).
import json
from PIL import Image
from common import *

O = '#1a1010'
QUIPS = {
    'pirate': (dict(o=O, b='#2a2026', w='#f0eadc', s='#ffdabf', e='#1a1010', p='#151612', h='#5a3420', r='#b22a2a'), [
        "................", "...oooooooooo...", "..obbbbbbbbbbo..", "..obbbbwwbbbbo..", ".obbbbwbbwbbbbo.", "oooooooooooooooo",
        "...osssssssso...", "...oppppsesso...", "...ospposssso...", "...osssssssso...", "...ohhssssshho..", "...ohhhhhhhhho..",
        "....ohhhhhhho...", "..orrohhhhhorro.", ".orrrroooooorrro", ".orrrrrrrrrrrrro"], 'Pirate', 'Пират', 50),
    'gopnik': (dict(o=O, c='#6a6e66', C='#4a4e45', s='#ffdabf', e='#1a1010', m='#8a4a3a', b='#2a4aa8', w='#f2f2f2'), [
        "................", "....oooooooo....", "...occcccccco...", "..occCccccccco..", "..oooooooooooooo", "...osssssssso...",
        "...osessessso...", "...ossssssso....", "...osssmssso....", "....osssssso....", "....ossssso.....", "...owbbbbbwo....",
        "..obwbbbbbwbo...", ".obbwbbbbbwbbo..", ".obbwbbbbbwbbo..", ".obbbbbbbbbbbo.."], 'Gopnik', 'Гопник', 50),
    'knight': (dict(o=O, r='#c0301a', R='#ff6a3a', g='#9aa4a8', G='#d0d8dc', k='#1a1a22', y='#ffcc66'), [
        ".......rR.......", "......rRro......", ".....orrr.......", "....oggggggo....", "...ogGGGGGGgo...", "...ogGgggggGo...",
        "...ogkkkkkkgo...", "...oggggggggo...", "...ogkgkgkggo...", "...oggggggggo...", "....oggggggo....", "...oGGggggGGo...",
        "..ogggggggggggo.", ".oggggyggyggggo.", ".ogggggyygggggo.", ".oggggggggggggo."], 'Knight', 'Рыцарь', 50),
    'philosopher': (dict(o=O, s='#ffdabf', S='#dcb497', l='#5a9a3a', e='#1a1010', w='#f2f2ec', W='#c8c8c0', t='#e8e2c8', T='#b8b098'), [
        "................", ".....oooooo.....", "....osssssso....", "...olssSsssllo..", "...ossssssssso..", "...osessssesso..",
        "...ossssSsssso..", "...owwssssswwo..", "...owwwWwwwwwo..", "....owwwWwwwo...", "....owwwwwwwo...", ".....owwWwwo....",
        "...otttowwwotto.", "..otttttowottTto", "..ottTtttottttto", "..otttttttTtttto"], 'Philosopher', 'Философ', 50),
    'granny': (dict(o=O, r='#c0301a', d='#f2eee0', s='#ffdabf', g='#6a6e66', e='#1a1010', m='#b86a5a', k='#5a3a6a'), [
        "................", ".....oooooo.....", "....orrrrrro....", "...orrdrrdrro...", "..orrrrrrrrrro..", "..orroooooorro..",
        "..orossssssoro..", "..orogggsgggro..", "..orogegsgegro..", "..orossssssoro..", "..orossmmssoro..", "...orossssoro...",
        "...orrooooorro..", "..okkkrrrrkkko..", ".okkkkorrokkkko.", ".okkkkkkkkkkkko."], 'Granny', 'Бабка', 50),
    'robot': (dict(o=O, a='#ff3a2a', m='#8a949c', M='#c0c8d0', l='#7ff0ff', d='#3b3e36', y='#ffcc66'), [
        ".......a........", ".......o........", "....oooooooo....", "...oMMMMMMMMo...", "...omllmmllmo...", "...omllmmllmo...",
        "...ommmmmmmmo...", "...omddddddmo...", "...ommmmmmmmo...", "....oooooooo....", ".....ommmmo.....", "..oMMMMMMMMMMo..",
        ".ommmmmyymmmmmo.", ".ommmmmyymmmmmo.", ".ommmmmmmmmmmmo.", ".oooooooooooooo."], 'Robot', 'Робот', 50),
}

if __name__ == '__main__':
    cat = []; chk = Image.new('RGBA', (6 * 18, 18), (40, 40, 40, 255))
    for i, (k, (pal, rows, en, ru, st)) in enumerate(QUIPS.items()):
        im = grid([r.ljust(16, '.')[:16] for r in rows], {a: hx(b) for a, b in pal.items()})
        save(im, f'quips/{k}.png'); chk.alpha_composite(im, (1 + i * 18, 1))
        cat.append(dict(sku=f'quips.{k}', kind='quips', pack=k, stars=st, name=dict(en=en, ru=ru), icon=f'mart/fl/quips/{k}.png'))
    json.dump(cat, open(out('catalog-quips.json'), 'w'), ensure_ascii=False, indent=1)
    x_n(chk, 6).save(os.path.join(os.environ.get('P5_CHECK', '/tmp'), 'quips.png')); print('quips', len(cat))
