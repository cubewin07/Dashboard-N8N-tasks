"""Generate the 512x512 RGBA face ink-mask atlas (CHARACTER-PIPELINE.md §4).

Pure Python (math + struct + zlib): runs under plain `python3` or Blender's Python
with zero third-party dependencies and produces byte-identical output on every run.

Usage:
    python3 art/blender/gen_face_atlas.py
    python3 art/blender/gen_face_atlas.py --preview art/out/contact/face_atlas_preview.png
"""
import argparse
import math
import os
import struct
import sys
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUT = os.path.join(ROOT, "public", "assets", "textures", "face_atlas.png")
DEFAULT_PREVIEW = os.path.join(ROOT, "art", "out", "contact", "face_atlas_preview.png")

SIZE = 512
GRID = 8
CELL = SIZE // GRID  # 64 px per cell
SUPERSAMPLE = 4      # 4x4 subpixel AA


def _chunk(tag, data):
    body = tag + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def _write_png(path, width, height, color_type, raw_bytes):
    # color_type: 2 = RGB, 6 = RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0))
        + _chunk(b"sRGB", b"\x00")
        + _chunk(b"IDAT", zlib.compress(raw_bytes, 9))
        + _chunk(b"IEND", b"")
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(png)
    return len(png)


def _dist_seg(px, py, ax, ay, bx, by):
    dx = bx - ax
    dy = by - ay
    len2 = dx * dx + dy * dy
    if len2 <= 1e-9:
        return math.hypot(px - ax, py - ay), 0.0
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
    cx = ax + t * dx
    cy = ay + t * dy
    return math.hypot(px - cx, py - cy), t


def _in_polyline(px, py, pts, r0, r1=None):
    """True if (px, py) lies inside a polyline capsule with linearly tapered radius."""
    if r1 is None:
        r1 = r0
    n = len(pts) - 1
    for i in range(n):
        ax, ay = pts[i]
        bx, by = pts[i + 1]
        d, t = _dist_seg(px, py, ax, ay, bx, by)
        u = (i + t) / n
        r = r0 + (r1 - r0) * u
        if d <= r:
            return True
    return False


def _quad_bezier(p0, p1, p2, steps=20):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1.0 - t
        x = mt * mt * p0[0] + 2.0 * mt * t * p1[0] + t * t * p2[0]
        y = mt * mt * p0[1] + 2.0 * mt * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def _arc_points(cx, cy, rx, ry, a0_deg, a1_deg, steps=20):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        a = math.radians(a0_deg + (a1_deg - a0_deg) * t)
        pts.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    return pts


def _in_ellipse(px, py, cx, cy, rx, ry):
    nx = (px - cx) / rx
    ny = (py - cy) / ry
    return nx * nx + ny * ny <= 1.0


def _in_almond_eye(px, py, cx, cy, rx, ry, tilt=0.0):
    """Rounded almond/oval eye; +x is outer corner (character left eye from front)."""
    dx = px - cx
    dy = py - cy - tilt * (dx / rx)
    if abs(dx) >= rx:
        return False
    pinch = math.sqrt(max(0.0, 1.0 - (dx / rx) ** 2))
    half_h = ry * (0.9 * pinch + 0.1 * (pinch ** 1.5))
    return abs(dy) <= half_h


# Cell evaluators: input (x, y) in local cell coordinates [0, 64), return (ink, white).
# Character's LEFT eye / brow seen from the front: inner corner is -x (left), outer corner is +x (right).


def _eye_01_open(x, y):
    # Friendly round eye
    ink = _in_ellipse(x, y, 32.0, 32.5, 14.5, 16.5)
    if not ink:
        return False, False
    hi1 = _in_ellipse(x, y, 27.0, 25.0, 4.2, 4.2)
    hi2 = _in_ellipse(x, y, 36.5, 36.5, 1.8, 1.8)
    return True, (hi1 or hi2)


def _eye_01_half(x, y):
    # Half-lidded round eye: lower half + smooth relaxed upper lid
    u = (x - 32.0) / 16.0
    lid_y = 30.5 + 1.8 * (1.0 - min(1.0, u * u))
    ink_body = _in_ellipse(x, y, 32.0, 32.5, 14.5, 16.5) and y >= lid_y
    lid_pts = _quad_bezier((16.0, 30.5), (32.0, 34.0), (48.0, 30.5), 16)
    ink_lid = _in_polyline(x, y, lid_pts, 2.3)
    if not (ink_body or ink_lid):
        return False, False
    hi = ink_body and _in_ellipse(x, y, 27.5, 37.5, 2.9, 2.4)
    return True, hi


def _eye_01_closed(x, y):
    # Friendly downward arc with gentle downward lashes near outer half (+x)
    pts = _quad_bezier((16.5, 31.0), (32.0, 41.5), (47.5, 31.0), 20)
    ink = _in_polyline(x, y, pts, 2.5)
    lash1 = _in_polyline(x, y, [(40.5, 35.0), (43.0, 38.8)], 1.4, 1.0)
    lash2 = _in_polyline(x, y, [(45.5, 32.5), (49.0, 35.2)], 1.4, 1.0)
    return (ink or lash1 or lash2), False


def _eye_01_happy(x, y):
    # Joyful upward arc ^
    pts = _quad_bezier((16.5, 37.5), (32.0, 21.5), (47.5, 37.5), 20)
    return _in_polyline(x, y, pts, 2.8), False


def _eye_02_open(x, y):
    # Oval/almond eye with clean subtle outer lash flick (+x = right side of cell)
    body = _in_almond_eye(x, y, 31.0, 33.0, 15.8, 13.5, tilt=-0.8)
    upper_rim = _quad_bezier((15.5, 32.5), (31.0, 17.5), (46.5, 29.0), 20)
    flick = _quad_bezier((43.0, 27.5), (47.5, 26.0), (50.8, 22.8), 10)
    ink = body or _in_polyline(x, y, upper_rim, 1.9, 2.2) or _in_polyline(x, y, flick, 2.0, 0.9)
    if not ink:
        return False, False
    hi1 = body and _in_ellipse(x, y, 26.2, 27.5, 3.8, 3.4)
    hi2 = body and _in_ellipse(x, y, 35.5, 37.0, 1.6, 1.6)
    return True, (hi1 or hi2)


def _eye_02_half(x, y):
    u = (x - 31.0) / 16.0
    lid_y = 31.0 + 1.5 * (1.0 - min(1.0, u * u))
    body = _in_almond_eye(x, y, 31.0, 33.0, 15.8, 13.5, tilt=-0.8) and y >= lid_y
    lid_pts = _quad_bezier((15.0, 31.0), (31.0, 34.0), (46.5, 30.0), 16)
    flick = _quad_bezier((44.0, 30.3), (48.0, 29.2), (51.0, 27.0), 10)
    ink = body or _in_polyline(x, y, lid_pts, 2.3) or _in_polyline(x, y, flick, 1.9, 0.9)
    if not ink:
        return False, False
    hi = body and _in_ellipse(x, y, 26.8, 37.8, 2.7, 2.1)
    return True, hi


def _eye_02_closed(x, y):
    pts = _quad_bezier((15.5, 30.5), (31.0, 41.0), (46.5, 30.5), 20)
    lash1 = _in_polyline(x, y, [(39.5, 34.8), (42.5, 38.5)], 1.4, 0.9)
    lash2 = _in_polyline(x, y, [(44.5, 32.0), (48.8, 34.2)], 1.5, 0.9)
    return (_in_polyline(x, y, pts, 2.4) or lash1 or lash2), False


def _eye_02_happy(x, y):
    pts = _quad_bezier((15.5, 37.5), (31.0, 22.0), (46.5, 36.5), 20)
    flick = _quad_bezier((44.0, 34.5), (47.5, 34.0), (50.5, 31.8), 10)
    return (_in_polyline(x, y, pts, 2.7) or _in_polyline(x, y, flick, 2.0, 0.9)), False


def _eye_03_open(x, y):
    # Narrow / sleepy-friendly calm eye: smooth rounded pill-oval with relaxed top lid
    body = _in_ellipse(x, y, 32.0, 33.5, 16.5, 9.5)
    # Softly clip the very top quarter with a gentle lid line for a calm sleepy-friendly look
    lid_y = 26.5 + 1.5 * ((x - 32.0) / 16.5) ** 2
    ink_body = body and y >= lid_y
    lid = _quad_bezier((15.5, 29.0), (32.0, 24.8), (48.5, 29.0), 18)
    ink = ink_body or _in_polyline(x, y, lid, 2.0)
    if not ink:
        return False, False
    hi = ink_body and _in_ellipse(x, y, 27.5, 32.5, 2.9, 2.4)
    return True, hi


def _eye_03_half(x, y):
    lid_y = 31.5 + 1.2 * ((x - 32.0) / 16.5) ** 2
    ink_body = _in_ellipse(x, y, 32.0, 33.5, 16.5, 9.5) and y >= lid_y
    lid = _quad_bezier((15.0, 32.0), (32.0, 33.5), (49.0, 32.0), 16)
    ink = ink_body or _in_polyline(x, y, lid, 2.2)
    if not ink:
        return False, False
    hi = ink_body and _in_ellipse(x, y, 28.0, 36.2, 2.1, 1.6)
    return True, hi


def _eye_03_closed(x, y):
    pts = _quad_bezier((15.0, 32.5), (32.0, 36.5), (49.0, 32.5), 18)
    return _in_polyline(x, y, pts, 2.3), False


def _eye_03_happy(x, y):
    pts = _quad_bezier((15.0, 36.5), (32.0, 25.5), (49.0, 36.5), 18)
    return _in_polyline(x, y, pts, 2.6), False


def _brow_01(x, y):
    # Soft arc: character's left brow seen from front (inner left, outer tail right)
    pts = _quad_bezier((14.0, 35.0), (30.5, 24.5), (49.0, 33.5), 20)
    return _in_polyline(x, y, pts, 3.4, 2.2), False


def _brow_02(x, y):
    # Straight thicker friendly brow
    pts = _quad_bezier((13.5, 32.2), (31.0, 29.8), (49.5, 31.5), 18)
    return _in_polyline(x, y, pts, 4.2, 3.3), False


def _mouth_01(x, y):
    # Friendly smile
    pts = _quad_bezier((16.0, 30.0), (32.0, 42.5), (48.0, 30.0), 22)
    return _in_polyline(x, y, pts, 2.5), False


def _mouth_02(x, y):
    # Neutral small line
    pts = _quad_bezier((21.5, 33.0), (32.0, 34.2), (42.5, 33.0), 14)
    return _in_polyline(x, y, pts, 2.2), False


def _mouth_03(x, y):
    # Open cheerful smile with white upper teeth strip and clean dark ink outline
    cx, cy_top, rx, ry = 32.0, 26.5, 17.0, 16.5
    u = (x - cx) / rx
    interior = False
    if abs(u) <= 1.0:
        # Upper edge dips slightly toward center (friendly smile chord)
        top_y = cy_top + 2.0 * (1.0 - u * u)
        bot_y = cy_top + ry * math.sqrt(max(0.0, 1.0 - u * u))
        interior = (top_y <= y <= bot_y)

    upper_pts = _quad_bezier((cx - rx, cy_top), (cx, cy_top + 4.0), (cx + rx, cy_top), 20)
    lower_pts = _arc_points(cx, cy_top, rx, ry, 0, 180, 24)
    upper_outline = _in_polyline(x, y, upper_pts, 1.8)
    lower_outline = _in_polyline(x, y, lower_pts, 1.8)

    if not (interior or upper_outline or lower_outline):
        return False, False

    teeth = (
        interior
        and (not upper_outline)
        and (not lower_outline)
        and (y <= (cy_top + 2.0 * (1.0 - u * u)) + 5.8)
    )
    return True, teeth


# ---------------------------------------------------------------------------
# P08a-T04 additions: eyes_04..08, brows_03..05, mouth_04..06. Existing cells above stay byte-stable.
# ---------------------------------------------------------------------------


def _bez_pt(p0, p1, p2, t):
    mt = 1.0 - t
    return (
        mt * mt * p0[0] + 2.0 * mt * t * p1[0] + t * t * p2[0],
        mt * mt * p0[1] + 2.0 * mt * t * p1[1] + t * t * p2[1],
    )


def _lashes(x, y, curve, ts, dirs, length, r0=1.7, r1=0.8):
    """Short tapered lash strokes starting on a quadratic `curve` at params `ts` along unit-ish `dirs`."""
    for t, (dx, dy) in zip(ts, dirs):
        sx, sy = _bez_pt(*curve, t)
        n = math.hypot(dx, dy)
        ex, ey = sx + dx / n * length, sy + dy / n * length
        if _in_polyline(x, y, [(sx, sy), (ex, ey)], r0, r1):
            return True
    return False


def _in_star(px, py, cx, cy, r):
    """4-point sparkle (astroid-like): |dx|^0.5 + |dy|^0.5 <= r^0.5."""
    return math.sqrt(abs(px - cx)) + math.sqrt(abs(py - cy)) <= math.sqrt(r)


# eyes_04: wide, big and sparkly ------------------------------------------------

def _eye_04_open(x, y):
    if not _in_ellipse(x, y, 32.0, 32.0, 17.0, 20.0):
        return False, False
    hi = (
        _in_ellipse(x, y, 25.5, 23.0, 5.6, 5.6)
        or _in_ellipse(x, y, 39.0, 41.5, 2.6, 2.6)
        or _in_star(x, y, 38.5, 23.5, 4.2)
    )
    return True, hi


def _eye_04_half(x, y):
    u = (x - 32.0) / 17.0
    lid_y = 30.0 + 1.8 * (1.0 - min(1.0, u * u))
    body = _in_ellipse(x, y, 32.0, 32.0, 17.0, 20.0) and y >= lid_y
    lid = _in_polyline(x, y, _quad_bezier((14.5, 30.0), (32.0, 33.8), (49.5, 30.0), 16), 2.5)
    if not (body or lid):
        return False, False
    hi = body and (_in_ellipse(x, y, 26.0, 38.0, 3.6, 2.8) or _in_ellipse(x, y, 39.5, 44.5, 1.8, 1.8))
    return True, hi


def _eye_04_closed(x, y):
    pts = _quad_bezier((14.5, 31.0), (32.0, 44.0), (49.5, 31.0), 20)
    return _in_polyline(x, y, pts, 3.0), False


def _eye_04_happy(x, y):
    pts = _quad_bezier((14.5, 39.0), (32.0, 19.0), (49.5, 39.0), 20)
    return _in_polyline(x, y, pts, 3.1), False


# eyes_05: sleepy, heavy lids with a crease -------------------------------------

_E05_CREASE = ((19.0, 25.5), (32.0, 21.5), (45.5, 25.0))


def _eye_05_open(x, y):
    lid_y = 31.0 + 2.0 * (x - 15.0) / 34.0  # lid droops toward the outer corner
    body = _in_ellipse(x, y, 32.0, 36.0, 15.0, 12.5) and y >= lid_y
    lid = _in_polyline(x, y, _quad_bezier((15.0, 31.0), (32.0, 30.0), (49.0, 33.5), 16), 3.0)
    crease = _in_polyline(x, y, _quad_bezier(*_E05_CREASE, 14), 1.5, 1.1)
    if not (body or lid or crease):
        return False, False
    hi = body and _in_ellipse(x, y, 27.0, 38.5, 2.6, 2.4)
    return True, hi


def _eye_05_half(x, y):
    lid_y = 37.0 + 1.5 * (x - 15.0) / 34.0
    body = _in_ellipse(x, y, 32.0, 36.0, 15.0, 12.5) and y >= lid_y
    lid = _in_polyline(x, y, _quad_bezier((15.0, 37.0), (32.0, 37.5), (49.0, 38.5), 16), 3.0)
    crease = _in_polyline(x, y, _quad_bezier((19.0, 30.5), (32.0, 27.5), (45.5, 30.5), 14), 1.5, 1.1)
    if not (body or lid or crease):
        return False, False
    hi = body and _in_ellipse(x, y, 27.5, 42.5, 1.9, 1.5)
    return True, hi


def _eye_05_closed(x, y):
    # Relaxed droopy lid line (no crease: two parallel lines would read as "=")
    pts = _quad_bezier((15.0, 35.5), (32.0, 42.5), (49.0, 38.0), 18)
    return _in_polyline(x, y, pts, 2.9), False


def _eye_05_happy(x, y):
    pts = _quad_bezier((15.0, 39.5), (32.0, 29.0), (49.0, 40.0), 18)
    return _in_polyline(x, y, pts, 2.8), False


# eyes_06: lashes ----------------------------------------------------------------

_E06_RIM = ((15.0, 33.0), (31.0, 13.5), (48.5, 29.0))
_E06_LID = ((15.0, 32.0), (32.0, 35.0), (48.5, 30.5))
_E06_CLOSED = ((15.0, 31.0), (32.0, 42.0), (49.0, 31.0))
_E06_HAPPY = ((15.0, 38.0), (32.0, 21.0), (49.0, 37.0))


def _eye_06_open(x, y):
    body = _in_ellipse(x, y, 32.0, 34.5, 14.5, 15.0)
    rim = _in_polyline(x, y, _quad_bezier(*_E06_RIM, 20), 2.6)
    lash = _lashes(x, y, _E06_RIM, (0.62, 0.8, 0.96), ((0.45, -1.0), (0.85, -0.75), (1.0, -0.3)), 6.0, 2.0, 0.8)
    if not (body or rim or lash):
        return False, False
    hi = body and (_in_ellipse(x, y, 26.5, 29.0, 4.2, 4.0) or _in_ellipse(x, y, 36.5, 40.0, 1.8, 1.8))
    return True, hi


def _eye_06_half(x, y):
    u = (x - 32.0) / 16.0
    lid_y = 32.0 + 1.8 * (1.0 - min(1.0, u * u))
    body = _in_ellipse(x, y, 32.0, 34.5, 14.5, 15.0) and y >= lid_y
    lid = _in_polyline(x, y, _quad_bezier(*_E06_LID, 16), 2.6)
    lash = _lashes(x, y, _E06_LID, (0.72, 0.88, 1.0), ((0.5, -1.0), (0.85, -0.8), (1.0, -0.35)), 5.5, 1.9, 0.8)
    if not (body or lid or lash):
        return False, False
    hi = body and _in_ellipse(x, y, 27.0, 39.0, 2.8, 2.2)
    return True, hi


def _eye_06_closed(x, y):
    arc = _in_polyline(x, y, _quad_bezier(*_E06_CLOSED, 20), 2.5)
    lash = _lashes(x, y, _E06_CLOSED, (0.6, 0.78, 0.93), ((0.25, 1.0), (0.55, 1.0), (0.9, 0.8)), 5.5, 1.7, 0.8)
    return (arc or lash), False


def _eye_06_happy(x, y):
    arc = _in_polyline(x, y, _quad_bezier(*_E06_HAPPY, 20), 2.7)
    lash = _lashes(x, y, _E06_HAPPY, (0.62, 0.8, 0.96), ((0.4, -1.0), (0.8, -0.8), (1.0, -0.35)), 5.5, 1.8, 0.8)
    return (arc or lash), False


# eyes_07: glassy (big highlight + lower reflection) ---------------------------

def _e07_white(x, y, cy_shift=0.0):
    big = _in_ellipse(x, y, 26.5, 25.5 + cy_shift, 7.2, 6.4)
    dot = _in_ellipse(x, y, 37.5, 27.5 + cy_shift, 1.9, 1.9)
    crescent = _in_ellipse(x, y, 32.0, 39.0, 10.5, 9.0) and not _in_ellipse(x, y, 32.0, 35.5, 11.5, 9.0)
    return big or dot or crescent


def _eye_07_open(x, y):
    if not _in_ellipse(x, y, 32.0, 33.0, 15.5, 18.0):
        return False, False
    return True, _e07_white(x, y)


def _eye_07_half(x, y):
    u = (x - 32.0) / 15.5
    lid_y = 31.0 + 1.8 * (1.0 - min(1.0, u * u))
    body = _in_ellipse(x, y, 32.0, 33.0, 15.5, 18.0) and y >= lid_y
    lid = _in_polyline(x, y, _quad_bezier((15.5, 31.0), (32.0, 34.8), (48.5, 31.0), 16), 2.4)
    if not (body or lid):
        return False, False
    hi = body and (_in_ellipse(x, y, 26.5, 38.0, 5.0, 3.0)
                   or (_in_ellipse(x, y, 32.0, 39.0, 10.5, 9.0) and not _in_ellipse(x, y, 32.0, 35.5, 11.5, 9.0)))
    return True, hi


def _eye_07_closed(x, y):
    pts = _quad_bezier((15.5, 32.0), (32.0, 41.5), (48.5, 32.0), 20)
    return _in_polyline(x, y, pts, 2.5), False


def _eye_07_happy(x, y):
    pts = _quad_bezier((15.5, 38.0), (32.0, 21.0), (48.5, 38.0), 20)
    return _in_polyline(x, y, pts, 2.7), False


# eyes_08: simple dots ------------------------------------------------------------

def _eye_08_open(x, y):
    return _in_ellipse(x, y, 32.0, 33.0, 8.0, 10.0), False


def _eye_08_half(x, y):
    dot = _in_ellipse(x, y, 32.0, 33.0, 8.0, 10.0) and y >= 33.0
    lid = _in_polyline(x, y, [(22.5, 33.0), (41.5, 33.0)], 1.9)
    return (dot or lid), False


def _eye_08_closed(x, y):
    pts = _quad_bezier((22.0, 33.5), (32.0, 37.5), (42.0, 33.5), 14)
    return _in_polyline(x, y, pts, 2.4), False


def _eye_08_happy(x, y):
    pts = _quad_bezier((22.0, 37.0), (32.0, 26.0), (42.0, 37.0), 14)
    return _in_polyline(x, y, pts, 2.5), False


# brows ---------------------------------------------------------------------------

def _brow_03(x, y):
    # Thin soft arc
    pts = _quad_bezier((14.0, 34.5), (31.0, 25.0), (49.0, 32.5), 20)
    return _in_polyline(x, y, pts, 2.7, 1.5), False


def _brow_04(x, y):
    # Angled: rises from the inner end, kinks down at the outer third
    pts = [(13.5, 36.5), (36.5, 27.0), (50.0, 32.5)]
    return _in_polyline(x, y, pts, 3.7, 2.1), False


def _brow_05(x, y):
    # Short soft rounded brow
    pts = _quad_bezier((19.0, 32.5), (29.5, 28.5), (40.5, 31.0), 14)
    return _in_polyline(x, y, pts, 4.8, 3.9), False


# mouths --------------------------------------------------------------------------

def _mouth_04(x, y):
    # Wide grin: clenched white teeth with a dark outline and a tooth line
    cx, hw, corner_y = 32.0, 20.5, 25.0
    u = (x - cx) / hw
    if abs(u) > 1.0 + 2.2 / hw:
        return False, False
    uu = min(1.0, u * u)
    top = corner_y + 4.0 * (1.0 - uu)
    bot = corner_y + 16.0 * (1.0 - uu) ** 0.75
    upper = _quad_bezier((cx - hw, corner_y), (cx, corner_y + 8.0), (cx + hw, corner_y), 24)
    lower = [(cx + hw * t, corner_y + 16.0 * (1.0 - t * t) ** 0.75) for t in [i / 16.0 - 1.0 for i in range(33)]]
    outline = _in_polyline(x, y, upper, 1.9) or _in_polyline(x, y, lower, 1.9)
    interior = abs(u) <= 1.0 and top <= y <= bot
    if not (outline or interior):
        return False, False
    mid = 0.5 * (top + bot)
    tooth_line = abs(u) <= 0.82 and abs(y - mid) <= 0.9
    return True, (interior and not outline and not tooth_line)


def _mouth_05(x, y):
    # Small soft smile
    pts = _quad_bezier((23.0, 30.0), (32.0, 39.5), (41.0, 30.0), 14)
    return _in_polyline(x, y, pts, 2.5), False


def _mouth_06(x, y):
    # Cat mouth ":3" (two little bumps meeting in the middle)
    left = _quad_bezier((17.0, 29.5), (24.5, 42.0), (32.0, 32.0), 16)
    right = _quad_bezier((32.0, 32.0), (39.5, 42.0), (47.0, 29.5), 16)
    return (_in_polyline(x, y, left, 2.4) or _in_polyline(x, y, right, 2.4)), False


CELL_DRAWERS = {
    # Row 0: eyes_01
    (0, 0): _eye_01_open,
    (1, 0): _eye_01_half,
    (2, 0): _eye_01_closed,
    (3, 0): _eye_01_happy,
    # Row 1: eyes_02
    (0, 1): _eye_02_open,
    (1, 1): _eye_02_half,
    (2, 1): _eye_02_closed,
    (3, 1): _eye_02_happy,
    # Row 2: eyes_03
    (0, 2): _eye_03_open,
    (1, 2): _eye_03_half,
    (2, 2): _eye_03_closed,
    (3, 2): _eye_03_happy,
    # Row 3: eyes_04 (P08a)
    (0, 3): _eye_04_open,
    (1, 3): _eye_04_half,
    (2, 3): _eye_04_closed,
    (3, 3): _eye_04_happy,
    # Rows 0-3, columns 4-7: eyes_05..eyes_08 (P08a)
    (4, 0): _eye_05_open,
    (5, 0): _eye_05_half,
    (6, 0): _eye_05_closed,
    (7, 0): _eye_05_happy,
    (4, 1): _eye_06_open,
    (5, 1): _eye_06_half,
    (6, 1): _eye_06_closed,
    (7, 1): _eye_06_happy,
    (4, 2): _eye_07_open,
    (5, 2): _eye_07_half,
    (6, 2): _eye_07_closed,
    (7, 2): _eye_07_happy,
    (4, 3): _eye_08_open,
    (5, 3): _eye_08_half,
    (6, 3): _eye_08_closed,
    (7, 3): _eye_08_happy,
    # Row 4: brows
    (0, 4): _brow_01,
    (1, 4): _brow_02,
    (2, 4): _brow_03,
    (3, 4): _brow_04,
    (4, 4): _brow_05,
    # Row 5: mouths
    (0, 5): _mouth_01,
    (1, 5): _mouth_02,
    (2, 5): _mouth_03,
    (3, 5): _mouth_04,
    (4, 5): _mouth_05,
    (5, 5): _mouth_06,
}


def render_atlas():
    """Return a bytearray of SIZE*SIZE*4 RGBA pixels."""
    buf = bytearray(SIZE * SIZE * 4)
    offsets = [(i + 0.5) / SUPERSAMPLE for i in range(SUPERSAMPLE)]
    samples_per_px = SUPERSAMPLE * SUPERSAMPLE

    for (col, row), fn in sorted(CELL_DRAWERS.items()):
        x0 = col * CELL
        y0 = row * CELL
        # Evaluate inside margin [4..60) so edges stay cleanly away from cell seams
        for ly in range(4, CELL - 4):
            gy = y0 + ly
            row_off = gy * SIZE * 4
            for lx in range(4, CELL - 4):
                covered = 0
                white = 0
                for sy in offsets:
                    py = ly + sy
                    for sx in offsets:
                        ink, is_white = fn(lx + sx, py)
                        if ink:
                            covered += 1
                            if is_white:
                                white += 1
                if covered == 0:
                    continue
                alpha = round(255 * covered / samples_per_px)
                lum = round(255 * white / covered)
                idx = row_off + (x0 + lx) * 4
                buf[idx] = lum
                buf[idx + 1] = lum
                buf[idx + 2] = lum
                buf[idx + 3] = alpha
    return buf


def render_preview(atlas_rgba, out_path):
    """Composite the atlas onto skin tone (#F5D0B5) with dark brown ink (#2B1B12) at 2x scale."""
    skin = (0xF5, 0xD0, 0xB5)
    ink = (0x2B, 0x1B, 0x12)
    grid_col = (0xD4, 0xAA, 0x8A)
    scale = 2
    pw = SIZE * scale
    ph = SIZE * scale
    raw = bytearray()
    for py in range(ph):
        raw.append(0)
        sy = py // scale
        on_h_grid = (py % (CELL * scale)) == 0
        for px in range(pw):
            sx = px // scale
            on_v_grid = (px % (CELL * scale)) == 0
            idx = (sy * SIZE + sx) * 4
            a = atlas_rgba[idx + 3] / 255.0
            if a > 0.0:
                t = atlas_rgba[idx] / 255.0  # 0=ink, 1=white
                fg_r = ink[0] * (1.0 - t) + 255.0 * t
                fg_g = ink[1] * (1.0 - t) + 255.0 * t
                fg_b = ink[2] * (1.0 - t) + 255.0 * t
                r = round(skin[0] * (1.0 - a) + fg_r * a)
                g = round(skin[1] * (1.0 - a) + fg_g * a)
                b = round(skin[2] * (1.0 - a) + fg_b * a)
            elif on_h_grid or on_v_grid:
                r, g, b = grid_col
            else:
                r, g, b = skin
            raw.extend((r, g, b))
    nbytes = _write_png(out_path, pw, ph, 2, bytes(raw))
    print(f"preview: -> {os.path.relpath(out_path, ROOT)} ({nbytes} bytes)")


def build(out_path=DEFAULT_OUT, preview_path=DEFAULT_PREVIEW):
    atlas_rgba = render_atlas()
    raw = bytearray()
    stride = SIZE * 4
    for y in range(SIZE):
        raw.append(0)  # PNG filter: none
        raw.extend(atlas_rgba[y * stride:(y + 1) * stride])
    nbytes = _write_png(out_path, SIZE, SIZE, 6, bytes(raw))
    print(f"face_atlas: {len(CELL_DRAWERS)} cells -> {os.path.relpath(out_path, ROOT)} ({nbytes} bytes)")
    if preview_path:
        render_preview(atlas_rgba, preview_path)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    p = argparse.ArgumentParser(description="Generate the 512x512 face ink-mask atlas.")
    p.add_argument("--out", default=DEFAULT_OUT)
    p.add_argument("--preview", default=DEFAULT_PREVIEW)
    p.add_argument("--only", default=None)
    p.add_argument("--no-preview", action="store_true")
    args = p.parse_args(argv)
    out_path = DEFAULT_OUT if os.path.isdir(args.out) else args.out
    build(out_path, None if args.no_preview else args.preview)
    print(f"BUILT {os.path.basename(out_path)}")
