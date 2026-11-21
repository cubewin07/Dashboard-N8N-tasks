"""B6 shoes (P08a-T08): low block heel, ankle boot, strap sandal (dép quai hậu), house slides (dép lê).

Every shoe is built per foot from the real base body (``ctx.sampler``): horizontal outline rings
around the foot for soles and uppers, ray-cast cross-sections for the ankle shaft, and swept
box-section bands for straps. A clearance pass then pushes every upper vertex at least a few mm
outside the foot. The sole bottom stays on the floor (Blender z = 0): heels never lift the body
(phase-08a design choice 2026-11-20, meta ``heelLift: 0``). Skinning follows the P07a starters
(``Foot`` / ``ToeBase`` split by length), plus a ``Foot`` -> ``Leg`` blend up the boot shaft.
"""

from __future__ import annotations

import math

import bmesh
from mathutils import Vector

from items_skinned import register
from lib import fit
from lib.garments import _paint_faces

# Half-outline stations for indices 1..6 (+x side, toe -> heel): (t along the foot 0 = toe, 1 = heel,
# width as a fraction of the foot half width). Index 0 is the toe tip, 7 the heel, 8..13 mirror 6..1.
ROUND = ((0.035, 0.58), (0.12, 0.92), (0.28, 1.0), (0.50, 0.90), (0.74, 0.86), (0.92, 0.62))
POINTED = ((0.05, 0.36), (0.15, 0.80), (0.30, 0.99), (0.50, 0.89), (0.74, 0.85), (0.92, 0.61))
SQUARE = ((0.02, 0.80), (0.12, 0.97), (0.28, 1.0), (0.50, 0.93), (0.74, 0.90), (0.92, 0.70))
N_RING = 14

Zones = list  # [(face, swatch, tint, shade)]


# ---------------------------------------------------------------------------
# Small geometry helpers
# ---------------------------------------------------------------------------


class Foot:
    """Per-side foot frame measured on the base body."""

    def __init__(self, ctx, side: int) -> None:
        s = ctx.sampler
        fmin, fmax = s.region_bounds("foot_l" if side > 0 else "foot_r")
        amin, amax = s.region_bounds("ankle_l" if side > 0 else "ankle_r")
        self.side = side
        self.body = ctx.body
        self.cx = 0.5 * (fmin.x + fmax.x)
        self.hw = 0.5 * (fmax.x - fmin.x)
        self.y_toe = fmin.y
        self.y_heel = fmax.y
        self.L = fmax.y - fmin.y
        self.top = fmax.z
        self.ax = 0.5 * (amin.x + amax.x)
        self.ay = 0.5 * (amin.y + amax.y)

    def y_at(self, t: float) -> float:
        return self.y_toe + t * self.L

    def outline(self, pad: float, z, *, shape=ROUND, toe_ext: float = 0.0, w_mul: float = 1.0,
                heel_ext: float = 0.0) -> list[Vector]:
        """Closed 14-point outline (CCW seen from above) offset outward by ``pad``.

        ``z`` is a float or ``fn(t) -> z`` (t = 0 toe tip .. 1 heel)."""
        ts = [0.0] + [t for t, _w in shape] + [1.0] + [t for t, _w in reversed(shape)]
        ws = [0.0] + [w for _t, w in shape] + [0.0] + [-w for _t, w in reversed(shape)]
        pts = []
        for k, (t, w) in enumerate(zip(ts, ws)):
            y = self.y_at(t)
            if k == 0:
                y -= toe_ext
            if k == 7:
                y += heel_ext
            pts.append((self.cx + self.hw * w * w_mul, y))
        out = []
        n = len(pts)
        for k in range(n):
            p0 = Vector(pts[k - 1])
            p1 = Vector(pts[k])
            p2 = Vector(pts[(k + 1) % n])
            e0 = (p1 - p0).normalized()
            e1 = (p2 - p1).normalized()
            n0 = Vector((e0.y, -e0.x))
            n1 = Vector((e1.y, -e1.x))
            nm = (n0 + n1).normalized()
            cosh = max(0.45, nm.dot(n0))
            q = p1 + nm * (pad / cosh)
            zz = z(ts[k]) if callable(z) else z
            out.append(Vector((q.x, q.y, zz)))
        return out

    @staticmethod
    def ring_t(shape=ROUND) -> list[float]:
        return [0.0] + [t for t, _w in shape] + [1.0] + [t for t, _w in reversed(shape)]

    def section(self, centre: Vector, dirs: list[Vector], clear: float, fallback: float = 0.05) -> list[Vector]:
        """Horizontal (or any) cross-section: ray from ``centre`` along each dir to the skin, + clear."""
        out = []
        for d in dirs:
            d = d.normalized()
            hit, nrm, _i, _dist = self.body.ext_bvh_basis.ray_cast(centre, d, 0.25)
            if hit is None:
                out.append(centre + d * (fallback + clear))
            else:
                out.append(hit + d * clear)
        return out


def _nearest_out(body, p: Vector) -> Vector:
    loc, nrm, _i, d = body.ext_bvh_basis.find_nearest(p)
    if loc is None:
        return Vector((0.0, 0.0, 1.0))
    v = p - loc
    if d > 1e-5 and not fit._is_inside_body_basis(p, body):
        return v.normalized()
    return nrm.normalized()


def _face(bm, vs, want: Vector, zones: Zones, swatch: str, tint: str, shade: float = 1.0):
    try:
        f = bm.faces.new(vs)
    except ValueError:
        return None
    f.smooth = False
    f.normal_update()
    if f.normal.dot(want) < 0.0:
        f.normal_flip()
    zones.append((f, swatch, tint, shade))
    return f


def _ring(bm, pts: list[Vector]) -> list:
    return [bm.verts.new(p) for p in pts]


def _band(bm, body, zones, ra, rb, paint, *, want=None):
    """Quads between two rings. ``paint(k) -> (swatch, tint, shade)``; ``want`` overrides outward."""
    n = len(ra)
    for k in range(n):
        k2 = (k + 1) % n
        vs = (ra[k], ra[k2], rb[k2], rb[k])
        c = sum((v.co for v in vs), Vector()) / 4.0
        w = want(c) if callable(want) else (want if want is not None else _nearest_out(body, c))
        sw, tn, sh = paint(k)
        _face(bm, vs, w, zones, sw, tn, sh)


def _cap(bm, zones, ring, want: Vector, swatch: str, tint: str, shade: float):
    _face(bm, ring, want, zones, swatch, tint, shade)


def _push_clear(bm, body, verts, clear: float, *, planar: bool = False, iters: int = 2) -> None:
    """Move ``verts`` so they sit >= ``clear`` outside the skin (``planar`` = horizontal moves only)."""
    bvh = body.ext_bvh_basis
    for _ in range(iters):
        for v in verts:
            loc, nrm, _i, d = bvh.find_nearest(v.co)
            if loc is None:
                continue
            inside = fit._is_inside_body_basis(v.co, body)
            signed = -d if inside else d
            if signed >= clear:
                continue
            if inside or d < 1e-5:
                direc = nrm.normalized()
            else:
                direc = (v.co - loc).normalized()
            if planar:
                direc = Vector((direc.x, direc.y, 0.0))
                if direc.length < 1e-4:
                    continue
                direc.normalize()
            v.co = v.co + direc * (clear - signed + 1e-4)


def _lerp_ring(ra, rb, t: float) -> list[Vector]:
    return [a.co.lerp(b.co, t) for a, b in zip(ra, rb)]


def _sweep(bm, body, zones, path: list[Vector], normals: list[Vector], *, width: float, thick: float,
           swatch: str, tint: str, shade: float = 1.0, side_shade: float = 0.85, inner: bool = True,
           width_dirs: list[Vector] | None = None) -> None:
    """Box-section band along ``path`` (centreline on its inner face), outward ``normals``."""
    n = len(path)
    rows = []
    for i in range(n):
        tan = (path[min(n - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        nm = normals[i].normalized()
        wd = width_dirs[i].normalized() if width_dirs else nm.cross(tan).normalized()
        p = path[i]
        hw = 0.5 * width
        rows.append([
            bm.verts.new(p - wd * hw),
            bm.verts.new(p + wd * hw),
            bm.verts.new(p + wd * hw + nm * thick),
            bm.verts.new(p - wd * hw + nm * thick),
        ])
    for i in range(n - 1):
        a, b = rows[i], rows[i + 1]
        nm = (normals[i] + normals[i + 1]).normalized()
        tan = (path[i + 1] - path[i]).normalized()
        wd = nm.cross(tan).normalized()
        if width_dirs:
            wd = (width_dirs[i] + width_dirs[i + 1]).normalized()
        _face(bm, (a[3], a[2], b[2], b[3]), nm, zones, swatch, tint, shade)  # outer
        if inner:
            _face(bm, (a[0], a[1], b[1], b[0]), -nm, zones, swatch, tint, shade * 0.9)
        _face(bm, (a[1], a[2], b[2], b[1]), wd, zones, swatch, tint, side_shade)
        _face(bm, (a[0], a[3], b[3], b[0]), -wd, zones, swatch, tint, side_shade)


def _shoe_weights(*, toe_split: bool = True, shaft_z: float | None = None):
    def fn(co: Vector, _vi: int, w):
        is_left = co.x >= 0.0
        foot_b = "LeftFoot" if is_left else "RightFoot"
        toe_b = "LeftToeBase" if is_left else "RightToeBase"
        leg_b = "LeftLeg" if is_left else "RightLeg"
        if shaft_z is not None and co.z > shaft_z:
            t = max(0.0, min(1.0, (co.z - shaft_z) / 0.055))
            return [(foot_b, 1.0 - t), (leg_b, t)]
        if toe_split and co.y < -0.115:
            return [(foot_b, 0.35), (toe_b, 0.65)]
        if toe_split and co.y < -0.075:
            return [(foot_b, 0.70), (toe_b, 0.30)]
        return [(foot_b, 1.0)]

    return fn


def _smooth(t: float, a: float, b: float) -> float:
    x = max(0.0, min(1.0, (t - a) / (b - a)))
    return x * x * (3.0 - 2.0 * x)


def _finish(bm, zones):
    _paint_faces(bm, zones)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    orphan = [v for v in bm.verts if not v.link_faces]
    for v in orphan:
        bm.verts.remove(v)
    bm.verts.index_update()
    bm.normal_update()
    return bm


def _fit_kwargs(weights):
    return {
        "offset_m": 0.004,
        "smooth_weight_iters": 1,
        "push_outward": False,
        "weight_override_fn": weights,
    }


# ---------------------------------------------------------------------------
# shoes_heel_low_01: closed pointed pump, low block heel (<= 2 cm), heelLift 0
# ---------------------------------------------------------------------------

HEEL_H = 0.020


def build_heel_low(ctx):
    bm = bmesh.new()
    zones: Zones = []
    body = ctx.body
    upper, sole_dark, heel_c, arch = "c_black", "c_black", "c_black", "n_15"
    for side in (+1, -1):
        ft = Foot(ctx, side)

        def sole_top(t: float) -> float:
            return 0.004 + (HEEL_H - 0.004) * _smooth(t, 0.50, 0.70)

        pad_s, pad_u = 0.0065, 0.0050
        r0 = _ring(bm, ft.outline(pad_s, 0.0, shape=POINTED, toe_ext=0.016, heel_ext=0.003))
        r1 = _ring(bm, ft.outline(pad_s, sole_top, shape=POINTED, toe_ext=0.016, heel_ext=0.003))
        u0 = _ring(bm, ft.outline(pad_u, sole_top, shape=POINTED, toe_ext=0.014))
        u1 = _ring(bm, ft.outline(pad_u, lambda t: sole_top(t) + 0.011, shape=POINTED, toe_ext=0.012))
        ts = ft.ring_t(POINTED)

        # Topline: throat in front of the instep, low sides, heel counter at the back.
        top_spec = {
            0: (0.0, 0.40, 0.070), 1: (0.55, 0.42, 0.068), 2: (0.92, 0.47, 0.050), 3: (0.97, 0.58, 0.036),
            4: (0.93, 0.70, 0.038), 5: (0.88, 0.82, 0.046), 6: (0.66, 0.94, 0.054), 7: (0.0, 1.0, 0.058),
        }
        top_pts = []
        for k in range(N_RING):
            kk = k if k <= 7 else 14 - k
            sgn = 1.0 if k <= 7 else -1.0
            wf, t, z = top_spec[kk]
            y = ft.y_at(t) + (0.007 if kk == 7 else 0.0)
            top_pts.append(Vector((ft.cx + sgn * (ft.hw * wf + (pad_u if wf > 0.3 else 0.0)), y, z)))
        tring = _ring(bm, top_pts)
        crown_pts = _lerp_ring(u1, tring, 0.6)
        for k in (0, 1, 2, 12, 13):
            crown_pts[k].z = max(crown_pts[k].z, 0.062)
        crown = _ring(bm, crown_pts)

        _push_clear(bm, body, r1 + u0, 0.0045, planar=True)
        _push_clear(bm, body, u1 + crown + tring, 0.0045)

        def sole_paint(k):
            t = ts[k]
            t2 = ts[(k + 1) % N_RING]
            if 0.45 <= t <= 0.75 and 0.45 <= t2 <= 0.75 and k not in (0, 7):
                return arch, "none", 0.62
            if t >= 0.70 and t2 >= 0.70:
                return heel_c, "accent", 0.92
            return sole_dark, "accent", 0.80

        _cap(bm, zones, r0, Vector((0, 0, -1)), sole_dark, "accent", 0.70)
        _band(bm, body, zones, r0, r1, sole_paint, want=lambda c: Vector((c.x - ft.cx, c.y - ft.y_at(0.5), 0.0)))
        _band(bm, body, zones, r1, u0, lambda k: (sole_dark, "accent", 0.96), want=Vector((0, 0, 1)))
        _band(bm, body, zones, u0, u1, lambda k: (upper, "primary", 0.92))
        _band(bm, body, zones, u1, crown, lambda k: (upper, "primary", 1.0))
        _band(bm, body, zones, crown, tring, lambda k: (upper, "primary", 0.96 if k in (0, 13) else 1.0))
    return _finish(bm, zones), _fit_kwargs(_shoe_weights())


# ---------------------------------------------------------------------------
# shoes_boot_01: ankle boot (Chelsea-style side panels), chunky sole
# ---------------------------------------------------------------------------


def build_boot(ctx):
    bm = bmesh.new()
    zones: Zones = []
    body = ctx.body
    upper, sole_c = "c_brown", "c_black"
    for side in (+1, -1):
        ft = Foot(ctx, side)

        def sole_top(t: float) -> float:
            return 0.010 + 0.006 * _smooth(t, 0.62, 0.74)

        pad_s, pad_u = 0.0090, 0.0075
        r0 = _ring(bm, ft.outline(pad_s, 0.0, shape=ROUND, toe_ext=0.006, heel_ext=0.002))
        r1 = _ring(bm, ft.outline(pad_s, sole_top, shape=ROUND, toe_ext=0.006, heel_ext=0.002))
        u0 = _ring(bm, ft.outline(pad_u, sole_top, shape=ROUND, toe_ext=0.004))
        u1 = _ring(bm, ft.outline(pad_u, lambda t: sole_top(t) + 0.016, shape=ROUND, toe_ext=0.002))

        # Shaft sections around the ankle, rays aimed like the outline points.
        centre_xy = Vector((ft.ax, ft.ay - 0.004, 0.0))
        dirs = []
        for p in u1:
            d = Vector((p.co.x - centre_xy.x, p.co.y - centre_xy.y, 0.0))
            dirs.append(d.normalized())
        shaft = []
        for z, clear in ((0.072, 0.0105), (0.112, 0.0105), (0.152, 0.011)):
            c = Vector((centre_xy.x, centre_xy.y, z))
            shaft.append(_ring(bm, ft.section(c, dirs, clear)))
        crown = _ring(bm, _lerp_ring(u1, shaft[0], 0.45))
        lip_pts = []
        for v in shaft[2]:
            d = Vector((v.co.x - centre_xy.x, v.co.y - centre_xy.y, 0.0))
            lip_pts.append(v.co - d.normalized() * 0.006 + Vector((0, 0, -0.004)))

        _push_clear(bm, body, r1 + u0, 0.005, planar=True)
        _push_clear(bm, body, u1 + crown + shaft[0] + shaft[1] + shaft[2], 0.0055)
        lip = _ring(bm, lip_pts)
        _push_clear(bm, body, lip, 0.0025)

        gore = {3, 4, 10, 11}  # side panels between the instep and the heel

        def shaft_paint(k):
            if k in gore:
                return sole_c, "accent", 0.82
            return upper, "primary", 0.97

        _cap(bm, zones, r0, Vector((0, 0, -1)), sole_c, "accent", 0.70)
        _band(bm, body, zones, r0, r1, lambda k: (sole_c, "accent", 0.84),
              want=lambda c: Vector((c.x - ft.cx, c.y - ft.y_at(0.5), 0.0)))
        _band(bm, body, zones, r1, u0, lambda k: (sole_c, "accent", 0.96), want=Vector((0, 0, 1)))
        _band(bm, body, zones, u0, u1, lambda k: (upper, "primary", 0.90))
        _band(bm, body, zones, u1, crown, lambda k: (upper, "primary", 1.0))
        _band(bm, body, zones, crown, shaft[0], lambda k: (upper, "primary", 0.97))
        _band(bm, body, zones, shaft[0], shaft[1], shaft_paint)
        _band(bm, body, zones, shaft[1], shaft[2], shaft_paint)
        _band(bm, body, zones, shaft[2], lip, lambda k: (upper, "primary", 0.78), want=Vector((0, 0, 1)))
    return _finish(bm, zones), _fit_kwargs(_shoe_weights(shaft_z=0.07))


# ---------------------------------------------------------------------------
# Open footwear: slab sole + straps
# ---------------------------------------------------------------------------


def _slab(bm, body, zones, ft: Foot, *, pad: float, top, shape, swatch: str, tint: str,
          toe_ext: float = 0.0, side_shade: float = 0.80, top_shade: float = 0.97, inner_pad: float = -0.010):
    """Sole slab on the floor: bottom cap, sides, and a top rim ring (no full top cap so the foot
    sunk into the footbed never counts as poking through it)."""
    r0 = _ring(bm, ft.outline(pad, 0.0, shape=shape, toe_ext=toe_ext))
    r1 = _ring(bm, ft.outline(pad, top, shape=shape, toe_ext=toe_ext))
    rin = _ring(bm, ft.outline(inner_pad, top, shape=shape))
    _push_clear(bm, body, r1, 0.0045, planar=True)
    _cap(bm, zones, r0, Vector((0, 0, -1)), swatch, tint, 0.70)
    _band(bm, body, zones, r0, r1, lambda k: (swatch, tint, side_shade),
          want=lambda c: Vector((c.x - ft.cx, c.y - ft.y_at(0.5), 0.0)))
    _band(bm, body, zones, r1, rin, lambda k: (swatch, tint, top_shade), want=Vector((0, 0, 1)))
    return r0, r1


def _arc_over(ft: Foot, y: float, zc: float, angles_deg, clear: float, bury_z: float, *, tilt: float = 0.0):
    """Strap centreline over the top of the foot in the plane y (+tilt along y with x), with buried ends."""
    body = ft.body
    pts, nrms = [], []
    for a in angles_deg:
        ar = math.radians(a)
        d = Vector((math.sin(ar), 0.0, math.cos(ar)))
        c = Vector((ft.cx, y, zc))
        hit, nrm, _i, _dd = body.ext_bvh_basis.ray_cast(c, d, 0.2)
        if hit is None:
            hit = c + d * 0.04
        p = hit + d * clear
        p.y += tilt * (p.x - ft.cx)
        pts.append(p)
        nrms.append(d)
    # buried ends straight down into the footbed
    first = pts[0].copy()
    first.z = bury_z
    last = pts[-1].copy()
    last.z = bury_z
    return [first] + pts + [last], [nrms[0]] + nrms + [nrms[-1]]


def build_sandal(ctx):
    bm = bmesh.new()
    zones: Zones = []
    body = ctx.body
    strap, sole = "c_brown", "c_beige"
    for side in (+1, -1):
        ft = Foot(ctx, side)

        def top(t: float) -> float:
            return 0.009 + 0.004 * _smooth(t, 0.6, 0.85)

        _slab(bm, body, zones, ft, pad=0.0075, top=top, shape=ROUND, toe_ext=0.004, swatch=sole, tint="accent")
        bury = 0.005
        # toe strap (diagonal) and instep strap
        for t, tilt, zc in ((0.25, -0.35 * side, 0.02), (0.47, 0.30 * side, 0.025)):
            path, nrms = _arc_over(ft, ft.y_at(t), zc, (-100, -60, -25, 0, 25, 60, 100), 0.0035, bury, tilt=tilt)
            _sweep(bm, body, zones, path, nrms, width=0.015, thick=0.0035, swatch=strap, tint="primary",
                   shade=1.0, side_shade=0.82)
        # heel strap (quai hau) around the back of the heel, ends into the sole at mid-foot
        hc = Vector((ft.cx, ft.y_heel - 0.045, 0.0))
        path, nrms, wds = [], [], []
        phis = (-112, -80, -45, 0, 45, 80, 112)
        for ph in phis:
            pr = math.radians(ph)
            d = Vector((math.sin(pr), math.cos(pr), 0.0))
            z = 0.014 + 0.034 * (1.0 - abs(ph) / 112.0) ** 0.8
            c = Vector((hc.x, hc.y, z))
            hit, _n, _i, _dd = body.ext_bvh_basis.ray_cast(c, d, 0.2)
            if hit is None:
                hit = c + d * 0.04
            path.append(hit + d * 0.0035)
            nrms.append(d)
            wds.append(Vector((0.0, 0.0, 1.0)))
        p0 = path[0].copy()
        p0.z = bury
        p1 = path[-1].copy()
        p1.z = bury
        path = [p0] + path + [p1]
        nrms = [nrms[0]] + nrms + [nrms[-1]]
        wds = [Vector((0, -1, 0))] + wds + [Vector((0, -1, 0))]
        _sweep(bm, body, zones, path, nrms, width=0.013, thick=0.0035, swatch=strap, tint="primary",
               shade=1.0, side_shade=0.82, width_dirs=None)
    return _finish(bm, zones), _fit_kwargs(_shoe_weights())


def build_slipper(ctx):
    bm = bmesh.new()
    zones: Zones = []
    body = ctx.body
    band, sole = "c_navy", "c_grey_l"
    for side in (+1, -1):
        ft = Foot(ctx, side)
        _slab(bm, body, zones, ft, pad=0.010, top=0.010, shape=SQUARE, toe_ext=0.006, swatch=sole, tint="accent",
              side_shade=0.84, top_shade=1.0)
        # wide band over the forefoot: three arcs lofted into a closed shell
        angles = (-100, -62, -28, 0, 28, 62, 100)
        outer_rows, inner_rows = [], []
        for t in (0.17, 0.32, 0.47):
            path, nrms = _arc_over(ft, ft.y_at(t), 0.02, angles, 0.004, 0.008)
            inner_rows.append([bm.verts.new(p) for p in path])
            outer_rows.append([bm.verts.new(p + n * 0.0045) for p, n in zip(path, nrms)])
        _push_clear(bm, body, [v for r in inner_rows for v in r if v.co.z > 0.012], 0.004)
        for r_in, r_out in zip(inner_rows, outer_rows):
            for vi, vo in zip(r_in, r_out):
                d = vo.co - vi.co
                if d.length < 0.0045:
                    vo.co = vi.co + (d.normalized() if d.length > 1e-6 else Vector((0, 0, 1))) * 0.0045
        nseg = len(angles) + 1
        for j in range(2):
            for i in range(nseg):
                a0, a1 = outer_rows[j][i], outer_rows[j][i + 1]
                b0, b1 = outer_rows[j + 1][i], outer_rows[j + 1][i + 1]
                c = (a0.co + a1.co + b0.co + b1.co) / 4.0
                _face(bm, (a0, a1, b1, b0), _nearest_out(body, c), zones, band, "primary", 1.0 if j == 0 else 0.95)
                a0, a1 = inner_rows[j][i], inner_rows[j][i + 1]
                b0, b1 = inner_rows[j + 1][i], inner_rows[j + 1][i + 1]
                _face(bm, (a0, a1, b1, b0), -_nearest_out(body, c), zones, band, "primary", 0.8)
        # front and back edges of the band
        for j, want in ((0, Vector((0, -1, 0.3))), (2, Vector((0, 1, 0.3)))):
            for i in range(nseg):
                vs = (inner_rows[j][i], inner_rows[j][i + 1], outer_rows[j][i + 1], outer_rows[j][i])
                _face(bm, vs, want, zones, band, "primary", 0.86 if j == 0 else 0.8)
    return _finish(bm, zones), _fit_kwargs(_shoe_weights())


register("shoes_heel_low_01", "shoes", ("female",), build_heel_low, meta={"heelLift": 0})
register("shoes_boot_01", "shoes", ("female", "male"), build_boot)
register("shoes_sandal_01", "shoes", ("female", "male"), build_sandal)
register("shoes_slipper_01", "shoes", ("female", "male"), build_slipper)
