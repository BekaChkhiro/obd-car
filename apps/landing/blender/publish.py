#!/usr/bin/env python3
"""Copy a rendered frame directory into public/, optionally thinning it.

    python3 blender/publish.py blender/out/light public/story/lg 1
    python3 blender/publish.py blender/out-sm/light public/story/sm 2

The stride lets the phone-sized sequence carry half the frames: scroll input is
coarse enough that 60 frames still scrub smoothly, and it halves the download.
"""
import os, shutil, sys

src, dst, stride = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1
frames = sorted(f for f in os.listdir(src) if f.endswith('.webp'))
shutil.rmtree(dst, ignore_errors=True)
os.makedirs(dst, exist_ok=True)
kept = frames[::stride]
for i, name in enumerate(kept, start=1):
    shutil.copy2(os.path.join(src, name), os.path.join(dst, 'f%04d.webp' % i))
total = sum(os.path.getsize(os.path.join(dst, f)) for f in os.listdir(dst))
print('%s -> %s : %d frames, %.2f MB' % (src, dst, len(kept), total / 1e6))
