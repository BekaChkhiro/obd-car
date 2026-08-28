#!/bin/bash
# Stitch the ten-beat story into one cut and export the three delivery formats.
#
# Every clip is 81 frames @16fps = 5.0625s and every crossfade overlaps 0.4s, so
# the nth xfade offset is simply n * (5.0625 - 0.4) = n * 4.6625.
#
# Beats (see video/README.md for the prompts):
#   1 wide push-in   2 frustration   3 walks to garage   4 picks up phone
#   5 back to car    6 plugs in OBD  7 app finds fault   8 fixes it
#   9 closes bonnet 10 walks away happy
set -e
cd "$(dirname "$0")"
C=clips
D=0.4

CLIPS=(
  b1_wide b2_angry b3_walk b4b_phone b5b_getin
  b6_obd b7_connect b8_fix b9_close b10_happy
)

args=()
for c in "${CLIPS[@]}"; do args+=(-i "$C/${c}_00001_.mp4"); done

# Chain the crossfades: [0]+[1]->[f1], [f1]+[2]->[f2], …
filter=""
prev="0"
for ((i = 1; i < ${#CLIPS[@]}; i++)); do
  off=$(echo "$i * 4.6625" | bc)
  filter+="[$prev][$i]xfade=transition=fade:duration=$D:offset=$off[f$i];"
  prev="f$i"
done
# Interpolate 16 -> 30fps; Wan's native 16fps reads as judder on a big screen.
filter+="[$prev]minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:vsbmc=1,format=yuv420p[v]"

ffmpeg -y -loglevel error "${args[@]}" \
  -filter_complex "$filter" -map "[v]" \
  -c:v libx264 -crf 18 -preset slow story.mp4

# The man sits left of centre for most of the film, so the square and vertical
# crops are shifted right of a true centre crop to keep him in frame.
ffmpeg -y -loglevel error -i story.mp4 \
  -vf "crop=720:720:280:0" \
  -c:v libx264 -crf 19 -preset slow -pix_fmt yuv420p story_square.mp4

ffmpeg -y -loglevel error -i story.mp4 \
  -vf "crop=405:720:340:0,scale=720:1280:flags=lanczos" \
  -c:v libx264 -crf 19 -preset slow -pix_fmt yuv420p story_vertical.mp4

for f in story story_square story_vertical; do
  printf "%-16s %-11s %6s  %ss\n" "$f" \
    "$(ffprobe -v error -show_entries stream=width,height -of csv=p=0:s=x "$f.mp4")" \
    "$(du -h "$f.mp4" | cut -f1)" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f.mp4")"
done
