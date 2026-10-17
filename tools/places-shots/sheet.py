"""A contact sheet of some screenshots, their middles side by side: python tools/places-shots/sheet.py out.png name name ... (names without .png)."""
import os
import sys
from PIL import Image

src = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'places')
out = sys.argv[1]
names = sys.argv[2:]
box = (60, 380, 700, 1000)
ims = [Image.open(os.path.join(src, n + '.png')).crop(box) for n in names]
w, h = ims[0].size
scale = 0.6
sheet = Image.new('RGB', (int(w * scale) * len(ims), int(h * scale)))
for i, im in enumerate(ims):
    sheet.paste(im.resize((int(w * scale), int(h * scale))), (int(w * scale) * i, 0))
sheet.save(out)
