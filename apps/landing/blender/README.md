# Scroll-driven hero animation

The `story` section on the home page is a Blender render played back as an image
sequence, scrubbed by scroll position. Not a video: `video.currentTime` scrubbing
is unreliable on iOS Safari, while decoded images seek instantly.

`build_scene.py` is the whole source of truth. It builds the set, the car, the
figure, the poses and the camera move from primitives — there is no `.blend` to
hand-edit and no binary asset to keep in sync (the only external file is the app
screenshot mapped onto the phone).

## Change the animation

Almost everything worth touching lives in three places:

| What | Where |
| --- | --- |
| Body poses per beat | `POSES` — a dict of joint angles, read it as the storyboard |
| Beat timing, badges, data dots, camera | `animate()` |
| Staging: where the man stands, which way he faces | `MAN_LOC` / `FACE_START` / `FACE_END` / `BADGE_LOC` |
| Colours per theme | `set_theme()` — hexes are lifted from `globals.css` |

Preview a few frames without rendering the lot:

```sh
blender --background --factory-startup --python build_scene.py -- \
  --theme light --preview 1,30,60,90,120 --res 900x560
blender --background --python montage.py -- "$PWD/out/preview_light_*.png" "$PWD/out/sheet.png" 3
```

`out/sheet.png` is then a contact sheet of those beats.

## Re-render and publish

Four sequences: two themes × two sizes. EEVEE renders each in about a minute.

```sh
for t in light dark; do
  blender --background --factory-startup --python build_scene.py -- \
    --theme $t --render --res 1280x800 --out "$PWD/out-$t"
  blender --background --factory-startup --python build_scene.py -- \
    --theme $t --render --res 760x475 --out "$PWD/out-$t-sm"
done

python3 publish.py out-light    ../public/story/light    1
python3 publish.py out-light-sm ../public/story/light-sm 2
python3 publish.py out-dark     ../public/story/dark     1
python3 publish.py out-dark-sm  ../public/story/dark-sm  2
```

The `2` stride halves the phone sequence to 60 frames: scroll input is coarse
enough that it still scrubs smoothly, and it halves the download. Frame counts
are declared per source in `page.tsx`, so if you change a stride, change it
there too.

Working renders under `out*/` are gitignored; only the published frames in
`public/story/` are tracked (~7.7 MB, and only one theme's set is ever fetched
by a given visitor).

## Preview as video

Handy for judging timing, not used by the site:

```sh
ffmpeg -y -framerate 24 -i out-light/f%04d.webp -vf scale=900:-2 \
  -c:v libx264 -pix_fmt yuv420p -crf 24 out/preview-light.mp4
```
