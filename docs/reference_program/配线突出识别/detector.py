"""
Static helper for spot detection — exact port of original JS algorithms.
No GUI dependency.  Called from main_window.py.
"""

import numpy as np
import cv2
import math


def find_spots_on_line(gray, yF, xF1, xF2):
    """Exact port of original JS findSpotsOnLine().

    Args:
        gray:  grayscale image (uint8).
        yF:    Y-coordinate of the scan line (image coords).
        xF1:   left-most X of the line (image coords).
        xF2:   right-most X of the line (image coords).
    Returns:
        list of 3 (x, y) tuples in image coords, or [None, None, None].
    """
    if xF2 < xF1: xF1, xF2 = xF2, xF1
    xLen = xF2 - xF1 + 1
    if xLen < 10: return [None, None, None]

    bandH = 12
    h, w = gray.shape
    y0 = max(0, int(yF) - bandH)
    y1 = min(h, int(yF) + bandH + 1)

    # Sum brightness vertically for each X column
    roi = gray[y0:y1, xF1:xF2 + 1]
    prof = np.sum(roi.astype(np.float64), axis=0)
    if np.max(prof) <= 0: return [None, None, None]

    third = xLen // 3
    if third < 1: return [None, None, None]

    segs = [(0, third), (third, 2 * third), (2 * third, xLen)]
    res = []
    for a, b in segs:
        if a >= b: res.append(None); continue
        seg = prof[a:b]
        if len(seg) == 0 or np.max(seg) <= 0: res.append(None); continue
        pi = int(np.argmax(seg))
        if seg[pi] <= 0: res.append(None); continue

        # ±4 weighted centroid
        ws = max(0, pi - 4)
        we = min(len(seg), pi + 5)
        wnd = seg[ws:we]
        idx = np.arange(ws, we)
        sw = np.sum(wnd)
        cx = xF1 + (np.sum(idx * wnd) / sw if sw > 0 else float(a + pi))
        res.append((cx, float(yF)))
    return res


def track_spot(gray, refX, refY, sx, sy, ix, iy):
    """Exact port of original trackSpot().

    Args:
        gray:  grayscale image (uint8).
        refX, refY:  reference position in display coords.
        sx, sy:  scale factors (display_width/img_width, display_height/img_height).
        ix, iy:  offset of image in display.
    Returns:
        (tracked_x, tracked_y) in display coords.
    """
    sh, sw = gray.shape

    # display → image coords
    fbX = int(round((refX - ix) / sx))
    fbY = int(round((refY - iy) / sy))

    sr = 50
    x0 = max(0, fbX - sr); y0 = max(0, fbY - sr)
    x1 = min(sw - 1, fbX + sr); y1 = min(sh - 1, fbY + sr)
    ww, hh = x1 - x0 + 1, y1 - y0 + 1
    if ww < 3 or hh < 3: return refX, refY

    roi = gray[y0:y1, x0:x1].astype(np.float64)
    maxB = np.max(roi)
    if maxB <= 0: return refX, refY

    thr = maxB * 0.5
    yy, xx = np.ogrid[:hh, :ww]
    mask = roi >= thr
    if not np.any(mask): return refX, refY

    wgt = roi[mask] - thr + 1
    sw2 = np.sum(wgt)
    if sw2 <= 0: return refX, refY

    cx = float(x0) + np.sum(xx[mask] * wgt) / sw2
    cy = float(y0) + np.sum(yy[mask] * wgt) / sw2
    return ix + cx * sx, iy + cy * sy


def draw_overlay(bgr, ix, iy, iw, ih, baseline, current, allDev,
                 calib_mode, dragging, dx1, dy, dx2):
    """Draw all overlays: guide lines, baseline, tracked spots, calib line."""
    frame = bgr.copy()
    h, w = frame.shape[:2]

    # guide lines at 33% and 66%
    for f in [0.33, 0.66]:
        px = int(ix + iw * f)
        if 0 <= px < w:
            cv2.line(frame, (px, 0), (px, h), (15, 15, 15), 1)

    # baseline markers
    for wi in range(2):
        bl = baseline[wi]
        if len(bl) != 3: continue
        bc = (80, 80, 255) if wi == 0 else (36, 212, 255)
        sc = (255, 165, 96) if wi == 0 else (250, 160, 210)
        for i in range(3):
            b = bl[i]
            cx = int(ix + b['rx'] * iw); cy = int(iy + b['ry'] * ih)
            clr = bc if b.get('wire') == 'B' else sc
            lbl = f"L{wi + 1}" if b.get('wire') == 'L' \
                else (f"R{wi + 1}" if b.get('wire') == 'R' else f"B{wi + 1}")

            cv2.circle(frame, (cx, cy), 8, clr, 2, cv2.LINE_AA)
            cv2.circle(frame, (cx, cy), 3, clr, -1, cv2.LINE_AA)
            cv2.line(frame, (cx - 8, cy), (cx + 8, cy), clr, 1, cv2.LINE_AA)
            cv2.line(frame, (cx, cy - 8), (cx, cy + 8), clr, 1, cv2.LINE_AA)
            cv2.putText(frame, lbl, (cx - 10, cy - 16),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1, cv2.LINE_AA)

    # tracked spots
    for wi in range(2):
        if wi >= len(current): continue
        sp = current[wi]
        if not sp or len(sp) != 3: continue
        bc = (80, 80, 255) if wi == 0 else (36, 212, 255)
        sc = (255, 165, 96) if wi == 0 else (250, 160, 210)
        if sp[0] and sp[2]:
            _dashed(frame, (int(sp[0]['x']), int(sp[0]['y'])),
                    (int(sp[2]['x']), int(sp[2]['y'])), bc)
        for i in range(3):
            s = sp[i]; clr = bc if i == 1 else sc
            sx, sy = int(s['x']), int(s['y'])
            cv2.circle(frame, (sx, sy), 6, clr, -1, cv2.LINE_AA)
            cv2.circle(frame, (sx, sy), 6, (255, 255, 255), 1, cv2.LINE_AA)
            cv2.putText(frame, f"{wi + 1}.{i + 1}", (sx - 10, sy - 12),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1, cv2.LINE_AA)
            if i == 1:
                dev = s.get('deviation', 0)
                cv2.putText(frame, f"{dev:.1f}°", (sx + 10, sy + 16),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, clr, 1, cv2.LINE_AA)

    # calibration drag line (green dashed)
    if calib_mode and dragging:
        cv2.line(frame, (int(dx1), int(dy)), (int(dx2), int(dy)),
                 (100, 255, 34), 2, cv2.LINE_AA)

    return frame


def _dashed(img, p1, p2, color, thickness=1, gap=10):
    d = math.dist(p1, p2)
    if d == 0: return
    dx, dy = (p2[0] - p1[0]) / d, (p2[1] - p1[1]) / d
    for i in range(0, int(d / gap), 2):
        s, e = i * gap, min((i + 1) * gap, d)
        cv2.line(img, (int(p1[0] + dx * s), int(p1[1] + dy * s)),
                 (int(p1[0] + dx * e), int(p1[1] + dy * e)), color, thickness, cv2.LINE_AA)
