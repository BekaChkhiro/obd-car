# The scroll film

`public/story-video/` holds the frames the landing page scrubs as you scroll.
They are sliced from `story_hq.mp4`, which is ten AI-generated clips cut
together — one per beat of the story, from the driver stuck at the bonnet to
walking away with it fixed.

## What is tracked, and what is not

| | |
| --- | --- |
| `scenes/*.png` | **tracked** — the still that starts each clip. These are the irreplaceable input: nothing here can recreate them. |
| `*.sh`, `*.py` | **tracked** — the whole pipeline. |
| `clips/`, `clips-hq/`, `*.mp4` | ignored — regenerable, and ~140 MB. |

## Regenerating a clip

Clips were rendered with Wan 2.2 I2V-A14B on a rented GPU (RTX 6000 Ada, about
$0.63/hr). Roughly seven minutes and $0.08 a clip at the settings below.

```sh
# on the box, with ComfyUI running and the weights in place
python3 wan_hq.py --image 06_obd_adapter.png --prefix s06_obd --seed 1106 \
  --prompt "<style preamble> <what moves in this shot>"
```

Two settings matter more than the rest:

* **10 steps with the lightx2v LoRA at 0.5**, cfg 1.0. The LoRA is a 4-step
  distillation; at full strength it flattens skin, fabric and engine-bay
  detail. Backing it off and doubling the steps buys that detail back.
* **cfg stays at 1.0.** Raising it needs a second forward pass per step for the
  negative prompt — 40 passes a clip instead of 10, about half an hour each.
  That was tried and abandoned: it does not fit any sensible budget.

Prompts describe **motion only**. Composition, cast, set and lighting are
already fixed by the scene still, and re-describing them just invites the
sampler to reinterpret what is already correct.

## Assembling

```sh
python3 assemble_hq.py          # grade, join, export the three formats
./publish_frames.sh story_hq.mp4  # slice into public/story-video
```

`assemble_hq.py` measures each clip's average luminance and nudges it toward
the run's median before joining. That grade match is what makes the cuts
disappear — the dissolve on its own only blurs them. It also carries two
per-clip corrections that the generation got wrong and are cheaper to fix here
than to re-roll: scene 9 came back running backwards, and scenes 9 and 10 came
back mirrored.

After publishing, update the frame counts in `src/app/[lang]/page.tsx`.
