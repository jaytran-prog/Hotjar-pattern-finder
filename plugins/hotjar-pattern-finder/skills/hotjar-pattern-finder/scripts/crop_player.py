#!/usr/bin/env python3
"""Crop raw Hotjar player screenshots down to just the replayed page.

Input screenshots are full Chrome viewports (Hotjar header, scrubber, panels).
This keeps the replay canvas (middle area), then trims the flat grey letterbox
Hotjar draws around the replayed page, and saves a PNG ready for the report.

Usage: python3 crop_player.py <in_dir> <out_dir>
Assumes the side panels were closed so the replay fills the centre (see SKILL.md).
"""
import os
import sys

from PIL import Image, ImageChops

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)

for name in sorted(os.listdir(src)):
    if not name.lower().endswith((".png", ".jpg", ".jpeg")):
        continue
    im = Image.open(os.path.join(src, name)).convert("RGB")
    w, h = im.size
    # Replay canvas sits between the left icon rail / right icon rail and
    # between the URL bar and the scrubber. Ratios measured on 1120x1066.
    box = (int(w * 0.062), int(h * 0.118), int(w * 0.938), int(h * 0.875))
    canvas = im.crop(box)
    # Trim the grey letterbox. A plain bbox fails because the mouse cursor and
    # Hotjar hover popovers also sit in the letterbox, so instead keep the
    # longest run of rows (then columns) that are mostly non-background.
    bg = Image.new("RGB", canvas.size, canvas.getpixel((2, 2)))
    mask = ImageChops.difference(canvas, bg).convert("L").point(lambda p: 1 if p > 4 else 0)
    px = mask.load()
    cw, ch = mask.size

    # Letterbox lines are ~0% non-background; page lines can be as low as ~4%
    # because a recorded site's own light greys can be close to Hotjar's. So: a low
    # threshold, and bridge short gaps so a pale band inside the page doesn't
    # split it, while a cursor far out in the letterbox stays a separate run.
    def longest_run(flags, max_gap=40):
        runs, start, gap = [], None, 0
        for i, f in enumerate(flags + [False] * (max_gap + 1)):
            if f:
                if start is None:
                    start = i
                gap, end = 0, i + 1
            elif start is not None:
                gap += 1
                if gap > max_gap:
                    runs.append((start, end))
                    start = None
        return max(runs, key=lambda r: r[1] - r[0]) if runs else (0, len(flags))

    rows = [sum(px[x, y] for x in range(0, cw, 4)) > (cw / 4) * 0.02 for y in range(ch)]
    top, bottom = longest_run(rows)
    cols = [sum(px[x, y] for y in range(top, bottom, 4)) > ((bottom - top) / 4) * 0.02 for x in range(cw)]
    left, right = longest_run(cols)
    if bottom - top > ch * 0.3 and right - left > cw * 0.3:
        canvas = canvas.crop((left, top, right, bottom))
    out = os.path.splitext(name)[0] + ".png"
    canvas.save(os.path.join(dst, out))
    print(f"{out}: {canvas.size[0]}x{canvas.size[1]}")
