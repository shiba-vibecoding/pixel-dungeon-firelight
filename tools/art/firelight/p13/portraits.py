# Firelight · part 13: the quest-givers' dialog portraits, 48 x 48, three moods each (calm, pleased, annoyed), lit from below by
# the fire as everything in Firelight. Drawn after their PD 1.9.2a sprites: the sad ghost (a grey sheet with a white face), the old
# wandmaker (bald, grey sides and moustache, a red coat), the troll blacksmith (grey hide, green crest, leather apron, tusks),
# the ambitious imp (red, small horns, green eyes). ui/quest/portraits.png: a row an NPC, a column a mood.
from PIL import Image
from bust import Bust
from px import save, strip, rows

MOODS = ['calm', 'pleased', 'annoyed']
NPCS = ['ghost', 'wandmaker', 'blacksmith', 'imp']
E, P = Bust.ellipse, Bust.poly


def ghost(mood):
    b = Bust()
    sheet = ['#3e4c5e', '#7f93ad', '#b4c4d8', '#ffe2b0']
    hem = P([(10, 24), (6, 47), (12, 44), (17, 47), (23, 44), (29, 47), (35, 44), (41, 47), (38, 24)])
    body = Bust.union(E(24, 21, 14, 15), hem)
    # the sheet grows faint toward its hem: it is a ghost
    b.fill(body, sheet, alpha=lambda x, y: 255 if y < 40 else (205 if y < 44 else 160))
    # the folds of the sheet
    b.dots([(15, 34), (15, 35), (16, 36), (31, 33), (32, 34), (32, 35), (24, 38), (24, 39)], '#5c6f88')
    face = E(24, 22, 9, 9)
    b.fill(face, ['#9aa8ba', '#dfe6ee', '#f4f7fa', '#fff6dc'], light=0.7)
    pal = {'k': '#11141c', 'b': '#7fd0ff', 'w': '#f4f7fa', 'm': '#3a4252', 'g': '#c4ccd6'}
    if mood == 'calm':        # sad, as he always is: eyes round, a small mouth turned down
        b.art(19, 18, ['kk...kk', 'kk...kk', 'bk...kb', 'kk...kk'], pal)
        b.art(22, 26, ['.mm.', 'm..m'], pal)
    elif mood == 'pleased':   # the eyes soften, a faint smile
        b.art(19, 19, ['.k...k.', 'k.k.k.k'], pal)
        b.art(22, 25, ['m..m', '.mm.'], pal)
    else:                     # the eyes slant, a jagged frown
        b.art(18, 17, ['k.....k', '.kk.kk.', '.kk.kk.', '.bk.kb.'], pal)
        b.art(21, 26, ['.mmmm.', 'm....m'], pal)
    return b.image()


def wandmaker(mood):
    b = Bust()
    skin = ['#7a4a32', '#c38662', '#e2ad86', '#ffd29a']
    coat = ['#4a1010', '#8e2620', '#bb3a2a', '#ff8a4a']
    grey = ['#55524c', '#92908a', '#c8c6c0', '#fff2d8']
    shirt = ['#7c786c', '#d2cec0', '#eeeae0', '#fff6dc']
    # coat and collar
    b.fill(E(24, 49, 21, 13), coat)
    b.fill(P([(18, 37), (24, 47), (30, 37), (27, 36), (24, 41), (21, 36)]), shirt, light=0.3)
    b.dots([(24, 44), (24, 46)], '#d8b04a')
    # neck, head, ears
    b.fill(E(24, 34, 5, 4), skin)
    b.fill(E(13.5, 20, 2.5, 4), skin); b.fill(E(34.5, 20, 2.5, 4), skin)
    b.fill(E(24, 19, 10, 12), skin, light=0.55)
    b.dots([(19, 9), (20, 9), (21, 10)], '#fff2d8')                                  # the shine of the bald head
    # grey hair at the sides, eyebrows
    b.fill(Bust.union(E(14.5, 17, 3, 6), E(15.5, 23, 2, 3)), grey)
    b.fill(Bust.union(E(33.5, 17, 3, 6), E(32.5, 23, 2, 3)), grey)
    pal = {'k': '#1a120c', 'w': '#fff6e6', 'g': '#c8c6c0', 'n': '#a86a4a', 'm': '#5a2a1a', 'r': '#e07a5a'}
    # nose
    b.art(23, 20, ['.n', 'nn', 'nn'], pal)
    # eyes and brows by mood
    if mood == 'calm':
        b.art(18, 15, ['ggg.....ggg', '...........', '.k.......k.'], pal)
    elif mood == 'pleased':
        b.art(18, 15, ['.gg.....gg.', '...........', 'k.k.....k.k'], pal)
        b.dots([(17, 21), (18, 21), (30, 21), (31, 21)], '#e07a5a')                  # rosy cheeks
    else:
        b.art(18, 14, ['g.........g', '.gg.....gg.', '...g...g...', '.k.......k.'], pal)
    # moustache (and the mouth under it)
    b.fill(P([(17, 25), (24, 22.5), (31, 25), (29, 27), (24, 25), (19, 27)]), grey, light=0.7)
    if mood == 'pleased': b.art(21, 27, ['m.....m', '.mmmmm.'], pal)
    elif mood == 'annoyed': b.art(21, 27, ['.mmmmm.', 'm.....m'], pal)
    else: b.art(22, 27, ['mmmmm'], pal)
    return b.image()


def blacksmith(mood):
    b = Bust()
    hide = ['#33372f', '#636a5c', '#8e9584', '#ffae6a']
    crest = ['#22481a', '#4f8a24', '#8fd040', '#e4ff8a']
    apron = ['#2e1c10', '#5c3a20', '#83582e', '#ffae6a']
    # massive shoulders, the apron's bib and its strap
    b.fill(E(24, 50, 24, 15), hide)
    b.fill(P([(13, 39), (35, 39), (37, 48), (11, 48)]), apron, light=0.4)
    b.fill(P([(13, 39), (16, 39), (10, 48), (7, 48)]), apron); b.fill(P([(32, 39), (35, 39), (41, 48), (38, 48)]), apron)
    b.dots([(15, 42), (33, 42)], '#c8a060')                                           # rivets
    # head: brow ridge, wide jaw, pointed ears
    b.fill(P([(7, 14), (12, 20), (12, 25)]), hide); b.fill(P([(41, 14), (36, 20), (36, 25)]), hide)
    b.fill(Bust.union(E(24, 20, 12, 12), E(24, 28, 13, 8)), hide, light=0.55)
    # crest
    b.fill(P([(19, 10), (21, 2), (24, 6), (27, 1), (29, 9), (27, 13), (21, 13)]), crest, light=0.7)
    pal = {'k': '#120e08', 'y': '#ffcc66', 'd': '#3a3e34', 't': '#f0ead8', 'm': '#2a1410', 's': '#4a4e44', 'r': '#c04030'}
    b.dots([(17, 25), (18, 26), (31, 27), (30, 28)], '#4a4e44')                      # soot
    if mood == 'calm':
        b.art(16, 17, ['ddddd...ddddd', '.ky.......yk.'], pal)
        b.art(19, 30, ['t.mmmmmmm.t', 't.........t'], pal)
    elif mood == 'pleased':
        b.art(16, 17, ['.ddd.....ddd.', '.kyk.....kyk.'], pal)
        b.art(18, 29, ['t.........t', 'tmtttttttmt', '.mmmmmmmmm.'], pal)
    else:
        b.art(16, 16, ['dd.........dd', '.ddd.....ddd.', '..ky.....yk..'], pal)
        b.art(18, 29, ['t.mmmmmmm.t', 'tmrrrrrrrmt', '.mmmmmmmmm.'], pal)
    b.art(23, 22, ['ss', 'kk'], pal)                                                  # the broad nose
    return b.image()


def imp(mood):
    b = Bust()
    red = ['#4a0c0e', '#962018', '#cc3a2c', '#ffaa5a']
    horn = ['#3a2a1c', '#6e5038', '#a8865c', '#fff0c0']
    cloak = ['#1e0a0a', '#3c1412', '#5a2018', '#ff7a3a']
    b.fill(E(24, 50, 19, 13), cloak)
    b.fill(E(24, 37, 5, 4), red)
    # horns, ears (long and pointed), head
    b.fill(P([(15, 12), (12, 2), (19, 9)]), horn); b.fill(P([(33, 12), (36, 2), (29, 9)]), horn)
    b.fill(P([(13, 20), (3, 13), (13, 26)]), red); b.fill(P([(35, 20), (45, 13), (35, 26)]), red)
    b.fill(Bust.union(E(24, 21, 11, 12), P([(16, 26), (24, 34), (32, 26)])), red, light=0.55)
    pal = {'k': '#120606', 'g': '#7aff6a', 'G': '#2a8a2a', 'm': '#2a0606', 't': '#fff0d0', 'd': '#6a1410'}
    if mood == 'calm':        # sly: one brow up, a lopsided smile
        b.art(17, 15, ['ddd.....d..', '.....d...dd', 'Ggg.....ggG', '.kk.....kk.'], pal)
        b.art(20, 27, ['.......m', 'mmmmmmm.'], pal)
    elif mood == 'pleased':   # a wide grin with fangs
        b.art(17, 16, ['.dd.....dd.', 'Ggg.....ggG', '.kk.....kk.'], pal)
        b.art(18, 26, ['m..........m', '.mtmmmmmmtm.', '..mmmmmmmm..'], pal)
    else:                     # narrowed eyes, a scowl
        b.art(17, 15, ['dd.......dd', '.ddd...ddd.', '.Ggg...ggG.'], pal)
        b.art(20, 28, ['.mmmmmm.', 'm......m'], pal)
    b.art(23, 22, ['dd'], pal)
    return b.image()


DRAW = {'ghost': ghost, 'wandmaker': wandmaker, 'blacksmith': blacksmith, 'imp': imp}


def sheet():
    return rows([strip([DRAW[n](m) for m in MOODS]) for n in NPCS])


if __name__ == '__main__':
    save(sheet(), 'ui/quest/portraits.png')
    print('ui/quest/portraits.png')
