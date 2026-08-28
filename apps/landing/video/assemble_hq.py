#!/usr/bin/env python3
"""Grade, join and export the ten scene clips.

Each clip is generated from its own still, so the cast and set match but the
exposure does not: one shot sits a stop brighter than its neighbour and the
join reads as a jump even under a dissolve. So this measures every clip's
average luminance and saturation, then nudges each toward the run's median
before joining. Matching the grade is what makes the cuts disappear — the
dissolve on its own only blurs them.

Usage:  python3 assemble_hq.py [--clips DIR] [--fade 0.35]
"""

import argparse, json, os, re, statistics, subprocess, sys

ORDER = [
    's01_confused', 's02_angry', 's03_walk', 's04_phone', 's05_getin',
    's06_obd', 's07_app', 's08_fix', 's09_close', 's10_happy',
]

# Scenes 9 and 10 came back with the driveway mirrored: car left, garage right,
# where scenes 1-3 and 5 have car right, garage left. Cut together that reads as
# the camera crossing the line — the viewer thinks the man walked around to the
# other side. Flipping the two outliers costs a wristwatch swapping arms and
# buys back a consistent geography, which is much the louder of the two errors.
# Nothing in frame carries readable text, so nothing else breaks under a mirror.
MIRROR = {'s09_close', 's10_happy'}

# Scene 9 came back running backwards: given a still of a nearly-shut bonnet and
# asked to close it, the model raised it instead. Played in reverse the same
# footage is exactly the shot that was wanted — open, swung down, latched — so
# it is cheaper and steadier to flip time than to re-roll the scene.
REVERSE = {'s09_close'}


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def probe_stats(path):
    """Average luminance (0-255) and saturation for a clip, via signalstats."""
    out = subprocess.run(
        ['ffmpeg', '-hide_banner', '-i', path, '-vf',
         'signalstats,metadata=print:file=-', '-f', 'null', '-'],
        capture_output=True, text=True).stdout
    y = [float(m) for m in re.findall(r'lavfi\.signalstats\.YAVG=([\d.]+)', out)]
    s = [float(m) for m in re.findall(r'lavfi\.signalstats\.SATAVG=([\d.]+)', out)]
    if not y:
        return None
    return {'y': statistics.mean(y), 's': statistics.mean(s) if s else None}


def duration(path):
    out = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
               '-of', 'csv=p=0', path]).stdout.strip()
    return float(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--clips', default='clips-hq')
    ap.add_argument('--fade', type=float, default=0.35)
    ap.add_argument('--out', default='story_hq.mp4')
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    os.chdir(here)

    # Missing scenes are skipped rather than fatal, so a partial run still cuts
    # together — useful while the tail of the film is still rendering.
    paths, missing = [], []
    for name in ORDER:
        hits = [f for f in os.listdir(args.clips) if f.startswith(name) and f.endswith('.mp4')]
        if not hits:
            missing.append(name)
            continue
        paths.append(os.path.join(args.clips, sorted(hits)[-1]))
    if not paths:
        sys.exit('no clips found in ' + args.clips)
    if missing:
        print('skipping (not rendered yet): ' + ', '.join(missing))

    print('measuring exposure…')
    stats = [probe_stats(p) for p in paths]
    ys = [s['y'] for s in stats]
    target_y = statistics.median(ys)
    ss = [s['s'] for s in stats if s['s']]
    target_s = statistics.median(ss) if ss else None
    for p, s in zip(paths, stats):
        print('  %-34s Y=%6.2f  S=%s' % (os.path.basename(p), s['y'],
                                         ('%.2f' % s['s']) if s['s'] else '-'))
    print('  target Y=%.2f  S=%s' % (target_y, ('%.2f' % target_s) if target_s else '-'))

    # Build one filter chain: per-input grade, then a chain of crossfades, then
    # the frame-rate lift. Doing it in a single graph avoids a generation of
    # re-encoding between the grade and the join.
    inputs, filters, labels = [], [], []
    for i, (p, s) in enumerate(zip(paths, stats)):
        inputs += ['-i', p]
        # Brightness in eq is a -1..1 offset on normalised luma; the measured
        # gap is in 0-255, hence the /255. Clamped so a badly exposed outlier
        # cannot be dragged into looking flat.
        delta = max(-0.10, min(0.10, (target_y - s['y']) / 255.0))
        sat = 1.0
        if s['s'] and target_s:
            sat = max(0.85, min(1.18, target_s / s['s']))
        base = os.path.basename(p)
        pre = ''
        if any(m in base for m in REVERSE):
            pre += 'reverse,'
        if any(m in base for m in MIRROR):
            pre += 'hflip,'
        filters.append(
            f"[{i}:v]{pre}eq=brightness={delta:.4f}:saturation={sat:.3f},"
            f"format=yuv420p[g{i}]")
        labels.append(f'g{i}')

    offset = 0.0
    prev = labels[0]
    for i in range(1, len(labels)):
        offset += duration(paths[i - 1]) - args.fade
        out = f'x{i}'
        filters.append(
            f"[{prev}][{labels[i]}]xfade=transition=fade:"
            f"duration={args.fade}:offset={offset:.4f}[{out}]")
        prev = out

    # 16 -> 30fps with motion interpolation. Wan renders at 16fps, which reads
    # as judder on anything larger than a phone.
    filters.append(
        f"[{prev}]minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:vsbmc=1,"
        f"format=yuv420p[v]")

    print('joining…')
    run(['ffmpeg', '-y', '-loglevel', 'error'] + inputs +
        ['-filter_complex', ';'.join(filters), '-map', '[v]',
         '-c:v', 'libx264', '-crf', '16', '-preset', 'slower',
         '-pix_fmt', 'yuv420p', args.out])

    print('exporting crops…')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', args.out,
         '-vf', 'crop=720:720:280:0', '-c:v', 'libx264', '-crf', '17',
         '-preset', 'slower', '-pix_fmt', 'yuv420p', 'story_hq_square.mp4'])
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', args.out,
         '-vf', 'crop=405:720:340:0,scale=720:1280:flags=lanczos',
         '-c:v', 'libx264', '-crf', '17', '-preset', 'slower',
         '-pix_fmt', 'yuv420p', 'story_hq_vertical.mp4'])

    for f in (args.out, 'story_hq_square.mp4', 'story_hq_vertical.mp4'):
        size = os.path.getsize(f) / 1e6
        dims = run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height',
                    '-of', 'csv=p=0:s=x', f]).stdout.strip()
        print('  %-24s %-11s %5.1f MB  %.2fs' % (f, dims, size, duration(f)))


main()
