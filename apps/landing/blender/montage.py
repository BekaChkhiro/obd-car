"""Tile the preview stills into one contact sheet -- reviewing six beats in one
image is far cheaper than opening six."""
import bpy, sys, os, glob
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
pattern, out, cols = argv[0], argv[1], int(argv[2]) if len(argv) > 2 else 3
files = sorted(glob.glob(pattern))
imgs = [bpy.data.images.load(f) for f in files]
w, h = imgs[0].size
rows = (len(imgs) + cols - 1) // cols
sheet = np.zeros((rows * h, cols * w, 4), dtype=np.float32)
for i, im in enumerate(imgs):
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    r, c = i // cols, i % cols
    # Blender image rows run bottom-up, so rows are placed in reverse.
    sheet[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = px
res = bpy.data.images.new('sheet', cols * w, rows * h, alpha=True)
res.pixels = sheet.ravel()
res.filepath_raw = out
res.file_format = 'PNG'
res.save()
print('SHEET', out, cols * w, rows * h)
