# Firelight · part 10: shared paths for the doors' 3D pieces.
import os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))      # tools/art/firelight/p10 -> the repository
SRC = os.environ.get('PD_ASSETS', os.path.join(ROOT, 'packages/client/public/assets')) + '/'
OUT = os.environ.get('P10_OUT', SRC) + '/'                                # writes assets/doors/** only
REGIONS = ['sewers', 'prison', 'caves', 'city', 'halls']                  # tiles0 .. tiles4


def hx(c): c = c.lstrip('#'); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
