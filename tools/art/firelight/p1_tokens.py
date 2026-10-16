# Part 1 · the --fire-* tokens: added to tokens.json (repo docs/design/system and the DS), with contrast checked.
import json, os, shutil
def lum(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def cr(a, b):
    la, lb = lum(a), lum(b); return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
VOID, S700, S800, COLD = '#0b0b09', '#3b3e36', '#282a24', '#1d2232'
T = [
    ('fire-spark', '#fffad6', 'Сердце искры: одна-две точки — точки над «i» в логотипе, искры загрузчика, вспышка «+1». Не для текста и не для заливок.'),
    ('fire-light', '#ffeba4', 'Тёплый свет костра: светлая грань букв логотипа, подпись «У костра», заголовки на тёмном (= gold). На void {void}:1, на stone-700 {s700}:1.'),
    ('fire-gold', '#ffcc66', 'Золото пламени: верх букв, цифры очков и цена, текст на fire-coal-deep (плашка «Подземелье дня»). На void {void}:1.'),
    ('fire-flame', '#ff9a3a', 'Язык пламени: середина букв, свет факела и костра на карте (заливка «lighter»), тёплая кромка окна в части 2. Как текст — {void}:1 на void.'),
    ('fire-ember', '#e8641f', 'Уголь в силе: низ букв, тлеющий кадр загрузчика, полоска «горит» у предмета. Как текст — {void}:1 на void; на stone-700 только крупно ({s700}:1).'),
    ('fire-coal', '#b22a2a', 'Красный уголь (= blood): подножие букв, заливка главной кнопки «Играть» и её плашки; подпись на ней — fire-light {onCoal}:1.'),
    ('fire-coal-deep', '#6e161a', 'Остывающий уголь: нижняя кромка букв, заливка плашки «Подземелье дня», тень под огнём. Подпись — fire-gold {onDeep}:1.'),
    ('fire-ash', '#1a0a06', 'Пепел: контур логотипа и костра — тёплый вместо чёрного, чтобы огонь не «вырезался» из темноты.'),
    ('fire-glow', 'rgba(255, 154, 58, 0.18)', 'Отсвет костра: полупрозрачный тёплый слой у кромки окон и под огнём; рисуется поверх камня, не меняет его цвет больше чем на треть.'),
    ('stone-cold', '#1d2232', 'Холодный камень подземелья — то, против чего горит огонь: холм и стены Привала, фон баннеров. Огненные цвета ставятся только на него или на void, не на тёплый фон.'),
]
def usage(t):
    return t.format(void=f'{cr(T_[0], VOID):.1f}' if False else '', s700='', onCoal='', onDeep='')
rows = []
for name, val, u in T:
    v = val if val.startswith('#') else None
    u = u.replace('{void}', f'{cr(v, VOID):.1f}' if v else '').replace('{s700}', f'{cr(v, S700):.1f}' if v else '')
    u = u.replace('{onCoal}', f'{cr("#ffeba4", "#b22a2a"):.1f}').replace('{onDeep}', f'{cr("#ffcc66", "#6e161a"):.1f}')
    rows.append({'name': name, 'value': val, 'usage': u})
for p in ['/home/claude/pdf/docs/design/system/tokens.json', '/home/claude/ds/project/tokens.json']:
    t = json.load(open(p))
    toks = [x for x in t['color']['tokens'] if not x['name'].startswith('fire-') and x['name'] != 'stone-cold']
    toks += rows; t['color']['tokens'] = toks
    out = '/home/claude/firelight/p1/out/docs/design/system/tokens.json' if '/pdf/' in p else '/home/claude/firelight/p1/ds-tokens.json'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(t, open(out, 'w'), ensure_ascii=False, indent=1)
for r in rows: print(r['name'], r['value'], '|', r['usage'][:90])
print('contrast void', {n: round(cr(v, VOID), 1) for n, v, _ in T if v.startswith('#')})
