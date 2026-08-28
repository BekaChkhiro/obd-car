#!/bin/bash
# Slice the finished film into the scroll-scrubbed frame sets under public/.
#
# 300 frames over ~50s is twice the first pass. Scroll input is coarse, but the
# scrubbing is eased rather than snapped, so the eye does follow the extra
# temporal resolution — 150 frames read as a flipbook on a slow drag.
#
# The desktop set is AVIF at the film's native 1280x720. Measured on three
# representative frames, AVIF q42 lands near 24 KB where WebP q52 needs 33 KB
# for the same picture — which buys the full generation resolution for the byte
# budget the downscaled 1024-wide WebP set was already spending. That matters
# because the canvas covers the viewport: a 1024-wide frame on a 1440px window
# at DPR 2 was being stretched almost threefold, and that stretch, not the
# codec, was what looked soft.
#
# The phone set stays WebP. It doubles as the fallback for anything that cannot
# decode AVIF, so it has to be the universally supported format.
set -e
cd "$(dirname "$0")"

SRC=${1:-story_hq.mp4}
OUT=../public/story-video
TMP=.frames_tmp
LG_COUNT=300
LG_W=1280
LG_H=720
SM_W=640
SM_H=360

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
FPS=$(python3 -c "print($LG_COUNT / $DUR)")

rm -rf "$TMP" "$OUT"; mkdir -p "$TMP/lg" "$TMP/sm" "$OUT/lg" "$OUT/sm"
ffmpeg -y -loglevel error -i "$SRC" -vf "fps=$FPS,scale=$LG_W:$LG_H" "$TMP/lg/f%04d.png"
ffmpeg -y -loglevel error -i "$SRC" -vf "fps=$FPS,scale=$SM_W:$SM_H" "$TMP/sm/f%04d.png"

i=0
for f in "$TMP"/lg/*.png; do
  i=$((i+1)); avifenc -q 42 -s 6 --jobs all "$f" -o "$(printf "$OUT/lg/f%04d.avif" $i)" >/dev/null
done
# The phone set keeps every second frame — half the bytes, and a phone's scroll
# is coarser still.
i=0; n=0
for f in "$TMP"/sm/*.png; do
  n=$((n+1)); [ $((n % 2)) -eq 1 ] || continue
  i=$((i+1)); cwebp -quiet -q 50 -m 6 "$f" -o "$(printf "$OUT/sm/f%04d.webp" $i)"
done
rm -rf "$TMP"

LG=$(ls "$OUT/lg" | wc -l | tr -d ' ')
SM=$(ls "$OUT/sm" | wc -l | tr -d ' ')
echo "lg: $LG frames ${LG_W}x${LG_H}, $(du -sh $OUT/lg | cut -f1)"
echo "sm: $SM frames ${SM_W}x${SM_H}, $(du -sh $OUT/sm | cut -f1)"
echo
echo "Update the frame counts in src/app/[lang]/layout.tsx: lg=$LG sm=$SM"
