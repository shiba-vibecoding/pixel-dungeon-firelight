# Firelight · part 11: shared paths and palette for the growth pieces (icons, 3D sparks, growth.json).
import os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))      # tools/art/firelight/p11 -> the repository
SRC = os.environ.get('PD_ASSETS', os.path.join(ROOT, 'packages/client/public/assets')) + '/'
OUT = os.environ.get('P11_OUT', SRC) + '/'                                # writes assets/ui/growth/** only
DIR = OUT + 'ui/growth/'


def hx(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


# One letter a colour; every one of them a token of ui.css (fire-*, lit-*, stone-*, ink, good, bad) or named in growth.json.
PAL = {
    'k': '#0b0b09',  # void: the outline
    'a': '#1a0a06',  # fire-ash
    'd': '#6e161a',  # fire-coal-deep
    'c': '#b22a2a',  # fire-coal
    'e': '#e8641f',  # fire-ember
    'f': '#ff9a3a',  # fire-flame
    'g': '#ffcc66',  # fire-gold
    'l': '#ffeba4',  # fire-light
    's': '#fffad6',  # fire-spark
    '1': '#4a3424',  # lit-dark
    '2': '#74583c',  # lit-lo
    '3': '#a8804e',  # lit-mid
    '4': '#e0b878',  # lit-hi
    '5': '#3b3e36',  # stone-700
    '6': '#555950',  # stone-500
    '7': '#7a8173',  # stone-300
    '8': '#9fa896',  # stone-200
    'i': '#e8e2c8',  # ink
    'm': '#b0b5a3',  # ink-muted
    'r': '#ff8585',  # bad
    'R': '#c24a4a',  # bad, shade
    'G': '#7ad05a',  # good (softened for pixels: the token #44ff44 burns at 8 px)
    'h': '#bf5039',  # hp-hi
    'H': '#992e2e',  # hp
    'v': '#a070e0',  # curse (known): violet
    'V': '#5a2c8c',  # curse, shade
    'b': '#5ec8c0',  # ally / cold
    'B': '#2e7c78',  # cold, shade
    'w': '#ffffff',  # white: masks tinted at run time (enchantments)
}
