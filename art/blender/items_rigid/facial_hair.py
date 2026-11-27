"""B2 facial hair (P08a-T04): thin rigid meshes on ``Head``, coloured with the hair UVs.

The body's five face quads are frozen, so facial hair is geometry, not an atlas cell
(CHARACTER-PIPELINE §4). Every piece is authored on the shared head (identical in both
bases) a few millimetres off the skin and stays out of the mouth quad in front view:
the moustache sits between nose and mouth (its tips droop beside the quad), the goatee
below it, the stubble is a thin shell with a hole around the mouth.

``gen_rigid.py`` only runs scalp/face checks for slot ``hair``, so ``_finish`` here measures
skin clearance (vertices, edge midpoints, face centres against the head and both neck BVHs)
and mouth-quad overlap itself and raises if an item breaks them.
"""

from __future__ import annotations

import math

import bmesh
from mathutils import Vector

from lib import bodyshape
from lib.rigid_common import BodyProbe, _paint_hair_faces, _signed_scalp_dist, _weld_doubles
from items_rigid import register



def _male_only(item_id: str) -> dict:
    """Meta override: facial hair is catalogued for the male base only."""
    return {"bases": {"male": {"file": f"models/wardrobe/{item_id}.glb", "offset": [0, 0, 0], "scale": 1}}}


MIN_CLEAR_M = 0.0010
"""Every sample of a facial-hair mesh stays at least this far outside the skin."""
MOUTH_MARGIN_M = 0.0008
"""Front-view keep-out margin around the mouth quad."""


# ---------------------------------------------------------------------------
# Surface helpers
# ---------------------------------------------------------------------------


def _front_hit(probe: BodyProbe, x: float, z: float) -> tuple[Vector, Vector] | None:
    hit, norm, _i, _d = probe.scalp_bvh.ray_cast(Vector((x, -1.0, z)), Vector((0.0, 1.0, 0.0)), 2.0)
    if hit is None:
        return None
    if norm.y > 0.0:
        norm = -norm
    return hit, norm.normalized()


def _radial_hit(probe: BodyProbe, theta: float, z: float) -> tuple[Vector, Vector]:
    """Outermost head surface at azimuth ``theta`` (0 = front -Y, +pi/2 = left +X) and height ``z``."""
    d = Vector((math.sin(theta), -math.cos(theta), 0.0))
    origin = Vector((0.0, probe.head_center.y, z)) + d * 0.6
    hit, norm, _i, _d = probe.scalp_bvh.ray_cast(origin, -d, 0.7)
    if hit is None:
        raise RuntimeError(f"no head surface at theta={math.degrees(theta):.0f} z={z:.3f}")
    if norm.dot(d) < 0.0:
        norm = -norm
    return hit, norm.normalized()


def _smooth_normal(probe: BodyProbe, p: Vector, radius: float = 0.004) -> Vector:
    """Average of nearest-surface normals around ``p`` (softens the faceted head ridges)."""
    acc = Vector((0.0, 0.0, 0.0))
    for dx, dz in ((0, 0), (radius, 0), (-radius, 0), (0, radius), (0, -radius)):
        q = p + Vector((dx, 0.0, dz))
        loc, norm, _i, _d = probe.scalp_bvh.find_nearest(q)
        if loc is None:
            continue
        if norm.dot(q - probe.head_center) < 0.0:
            norm = -norm
        acc += norm
    if acc.length < 1e-6:
        return (p - probe.head_center).normalized()
    return acc.normalized()


def _skin_point(probe: BodyProbe, x: float, z: float, off: float) -> Vector:
    """Front-projected skin point at (x, z), pushed ``off`` metres out along the smoothed normal."""
    h = _front_hit(probe, x, z)
    if h is None:
        raise RuntimeError(f"no head surface in front view at x={x:.3f} z={z:.3f}")
    return h[0] + _smooth_normal(probe, h[0]) * off


def _skin_dist(probe: BodyProbe, p: Vector) -> float:
    """Signed distance to the skin: head plus the female and male neck/chest."""
    d = _signed_scalp_dist(probe, p)[0]
    for bvh in (probe.torso_bvh, probe.male_torso_bvh):
        loc, _norm, _i, dist = bvh.find_nearest(p)
        if loc is None or dist > 0.05:
            continue
        # The neck/chest piece is an open tube: sign by horizontal radius from the body axis, not normals
        inside = math.hypot(p.x, p.y) < math.hypot(loc.x, loc.y) and p.z < probe.neck_bounds.zmax
        d = min(d, -dist if inside else dist)
    return d


def _samples(bm: bmesh.types.BMesh) -> list[Vector]:
    pts = [v.co.copy() for v in bm.verts]
    pts += [0.5 * (e.verts[0].co + e.verts[1].co) for e in bm.edges]
    pts += [f.calc_center_median() for f in bm.faces]
    return pts


def _push_clear(bm: bmesh.types.BMesh, probe: BodyProbe, min_m: float) -> None:
    """Push vertices out until every vertex, edge midpoint and face centre is ``min_m`` off the skin.

    Each pass moves a vertex once, by the largest lift any of its samples needs (no accumulation).
    """
    for _ in range(8):
        need: dict[bmesh.types.BMVert, float] = {}

        def _want(p: Vector, verts) -> None:
            d = _skin_dist(probe, p)
            if d < min_m:
                for v in verts:
                    need[v] = max(need.get(v, 0.0), min_m - d + 0.0002)

        for v in bm.verts:
            _want(v.co, (v,))
        for e in bm.edges:
            _want(0.5 * (e.verts[0].co + e.verts[1].co), e.verts)
        for f in bm.faces:
            _want(f.calc_center_median(), f.verts)
        if not need:
            return
        for v, delta in need.items():
            v.co += _smooth_normal(probe, v.co) * delta


def _mouth_overlap(bm: bmesh.types.BMesh, probe: BodyProbe) -> int:
    """Count front-view samples of the mesh (dense barycentric grid per triangle) inside the mouth quad."""
    q = probe.mouth
    x0, x1 = q.xmin - MOUTH_MARGIN_M, q.xmax + MOUTH_MARGIN_M
    z0, z1 = q.zmin - MOUTH_MARGIN_M, q.zmax + MOUTH_MARGIN_M
    hits = 0
    n = 8
    for f in bm.faces:
        vs = [v.co for v in f.verts]
        for k in range(1, len(vs) - 1):
            a, b, c = vs[0], vs[k], vs[k + 1]
            for i in range(n + 1):
                for j in range(n + 1 - i):
                    u, w = i / n, j / n
                    p = a + (b - a) * u + (c - a) * w
                    if x0 < p.x < x1 and z0 < p.z < z1:
                        hits += 1
    return hits


def _finish(item_id: str, bm: bmesh.types.BMesh, probe: BodyProbe, hi_pred, shade_lo: float = 0.76) -> bmesh.types.BMesh:
    _weld_doubles(bm, 1e-5)
    _push_clear(bm, probe, MIN_CLEAR_M + 0.0002)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    _paint_hair_faces(bm, probe, hi_pred, shade_lo=shade_lo)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    dists = [_skin_dist(probe, p) for p in _samples(bm)]
    inner = [_skin_dist(probe, v.co) for v in bm.verts]
    overlap = _mouth_overlap(bm, probe)
    print(
        f"FACIAL {item_id}: tris={tris} minClearMm={min(dists) * 1000:.2f} "
        f"minVertMm={min(inner) * 1000:.2f} maxVertMm={max(inner) * 1000:.2f} mouthOverlap={overlap}"
    )
    if tris > 400:
        raise RuntimeError(f"{item_id}: {tris} tris > 400")
    if min(dists) < MIN_CLEAR_M - 1e-5:
        raise RuntimeError(f"{item_id}: {min(dists) * 1000:.2f} mm off the skin < {MIN_CLEAR_M * 1000:.1f}")
    if overlap:
        raise RuntimeError(f"{item_id}: covers the mouth quad in front view ({overlap} samples)")
    return bm


def _loft(bm: bmesh.types.BMesh, rings: list[list[Vector]], *, cap_start: bool = True, cap_end: bool = True) -> None:
    """Closed tube through equal-length cross-section rings; collapsed end rings become fans."""
    vr = [[bm.verts.new(p) for p in r] for r in rings]
    m = len(vr[0])
    for r0, r1 in zip(vr, vr[1:]):
        for j in range(m):
            j2 = (j + 1) % m
            bm.faces.new((r0[j], r0[j2], r1[j2], r1[j]))
    if cap_start:
        bm.faces.new(tuple(reversed(vr[0])))
    if cap_end:
        bm.faces.new(tuple(vr[-1]))


# ---------------------------------------------------------------------------
# facial_hair_moustache_01
# ---------------------------------------------------------------------------

# Half profile (x >= 0) in front view: (x, z_top, z_bot, protrusion). Inside the mouth quad's
# x range the underside stays above the quad top; outside it the tips droop beside the mouth.
_MOUSTACHE = [
    (0.000, 1.5386, 1.5338, 0.0040),
    (0.007, 1.5406, 1.5338, 0.0050),
    (0.017, 1.5407, 1.5338, 0.0054),
    (0.027, 1.5399, 1.5338, 0.0048),
    (0.0368, 1.5383, 1.5338, 0.0040),
    (0.0410, 1.5362, 1.5282, 0.0032),
    (0.0450, 1.5325, 1.5228, 0.0026),
    (0.0490, 1.5272, 1.5180, 0.0016),
    (0.0520, 1.5205, 1.5140, 0.0008),
]


def build_facial_hair_moustache_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Friendly two-lobed moustache under the nose with tips drooping past the mouth corners."""
    inner = 0.0018
    prof = [(-x, zt, zb, t) for x, zt, zb, t in reversed(_MOUSTACHE[1:])] + _MOUSTACHE
    rings = []
    for x, zt, zb, t in prof:
        h = zt - zb
        rings.append([
            _skin_point(probe, x, zt, inner),
            _skin_point(probe, x, zt - 0.28 * h, inner + t),
            _skin_point(probe, x, zb + 0.22 * h, inner + 0.85 * t),
            _skin_point(probe, x, zb, inner),
        ])
    # Pointed tips: collapse the outermost rings onto one point each
    for r in (rings[0], rings[-1]):
        c = sum(r, Vector()) / 4.0
        r[1] = r[1].lerp(c, 0.7)
        r[2] = r[2].lerp(c, 0.7)
    bm = bmesh.new()
    _loft(bm, rings)
    return _finish("facial_hair_moustache_01", bm, probe, lambda f, c: f.normal.z > 0.55)


# ---------------------------------------------------------------------------
# facial_hair_goatee_01
# ---------------------------------------------------------------------------

# Stations top -> bottom: (z, half width, protrusion). Top stays under the mouth quad.
_GOATEE = [
    (1.4938, 0.0145, 0.0030),
    (1.4880, 0.0185, 0.0055),
    (1.4800, 0.0195, 0.0068),
    (1.4720, 0.0175, 0.0072),
    (1.4645, 0.0130, 0.0068),
    (1.4590, 0.0075, 0.0060),
]


def build_facial_hair_goatee_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Chin goatee: a rounded tuft under the mouth ending in a small point below the chin."""
    inner = 0.0018
    rings = []
    for z, w, t in _GOATEE:
        rings.append([
            _skin_point(probe, -w, z, inner),
            _skin_point(probe, -0.5 * w, z, inner + 0.8 * t),
            _skin_point(probe, 0.0, z, inner + t),
            _skin_point(probe, 0.5 * w, z, inner + 0.8 * t),
            _skin_point(probe, w, z, inner),
            _skin_point(probe, 0.0, z, inner),  # back centre: keeps the back on the chin's x = 0 ridge
        ])
    # Tip: hangs a little below and in front of the chin edge
    base = _skin_point(probe, 0.0, _GOATEE[-1][0], inner + 0.5 * _GOATEE[-1][2])
    tip = base + Vector((0.0, -0.0035, -0.0125))
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in r] for r in rings]
    m = len(vr[0])
    for r0, r1 in zip(vr, vr[1:]):
        for j in range(m):
            j2 = (j + 1) % m
            bm.faces.new((r0[j], r0[j2], r1[j2], r1[j]))
    bm.faces.new(tuple(reversed(vr[0])))  # top cap
    vt = bm.verts.new(tip)
    last = vr[-1]
    for j in range(m):
        bm.faces.new((last[j], last[(j + 1) % m], vt))
    return _finish("facial_hair_goatee_01", bm, probe, lambda f, c: f.normal.z > 0.55)


# ---------------------------------------------------------------------------
# facial_hair_beard_01
# ---------------------------------------------------------------------------

# The head is a lofted 12-gon (bodyshape head rings, identical in both bases). The stubble is built
# in that loft's own (u, z) parameters so its rows/columns sit on the head's ridges and every quad
# follows one facet: u = ring vertex index (0 = front centre, +1 = 30 deg toward +X), z = height.
_HEAD_RINGS: list[tuple[float, list[Vector]]] | None = None


def _head_rings() -> list[tuple[float, list[Vector]]]:
    global _HEAD_RINGS
    if _HEAD_RINGS is None:
        rings = []
        for z, rx, ry, y_off, fflat, fpush, bpush, *_rest in bodyshape._torso_specs("male", {}):
            if z < 1.44:
                continue
            pts = bodyshape._ellipse_ring(0.0, y_off, z, rx, ry, n=bodyshape.TORSO_SIDES,
                                          front_flat=fflat, front_push=fpush, back_push=bpush)
            rings.append((z, pts))
        _HEAD_RINGS = rings
    return _HEAD_RINGS


def _head_uv(u: float, z: float) -> Vector:
    """Point on the head loft at ring-parameter ``u`` and height ``z`` (bilinear inside a facet)."""
    rings = _head_rings()
    n = len(rings[0][1])
    k = max(i for i, (rz, _p) in enumerate(rings[:-1]) if rz <= z + 1e-9)
    (z0, r0), (z1, r1) = rings[k], rings[k + 1]
    g = (z - z0) / (z1 - z0)
    i0 = math.floor(u)
    f = u - i0
    a0, a1 = r0[i0 % n], r0[(i0 + 1) % n]
    b0, b1 = r1[i0 % n], r1[(i0 + 1) % n]
    return a0.lerp(a1, f).lerp(b0.lerp(b1, f), g)


def _head_u_at_x(x: float, z: float) -> float:
    """``u`` in the front facet (0..1 or -1..0) where the loft reaches front-view ``x`` at height ``z``."""
    lo, hi = 0.0, 1.0
    s = 1.0 if x >= 0.0 else -1.0
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        if abs(_head_uv(s * mid, z).x) < abs(x):
            lo = mid
        else:
            hi = mid
    return s * 0.5 * (lo + hi)


def _head_normal(u: float, z: float) -> Vector:
    """Outward normal averaged over the facets meeting at (u, z)."""
    acc = Vector((0.0, 0.0, 0.0))
    du, dz = 0.02, 0.0015
    for su in (-1.0, 1.0):
        for sz in (-1.0, 1.0):
            uu, zz = u + su * 0.5 * du, z + sz * 0.5 * dz
            tu = _head_uv(uu + 0.5 * du, zz) - _head_uv(uu - 0.5 * du, zz)
            tz = _head_uv(uu, zz + 0.5 * dz) - _head_uv(uu, zz - 0.5 * dz)
            nrm = tu.cross(tz)
            if nrm.length > 1e-12:
                acc += nrm.normalized()
    p = _head_uv(u, z)
    out = Vector((p.x, p.y - 0.004, 0.0))
    if acc.dot(out) < 0.0:
        acc = -acc
    return acc.normalized()


# Jaw part columns centre -> left: u (ring parameter) or ("x", value) = the mouth-corner column in front
# view, each with its top z. The top edge runs flat under the mouth, then rises along the cheek from the
# mouth corner to a short sideburn in front of the ear. u = 1, 2 are the head's vertical ridges.
_STUBBLE_COLS = [
    (0.0, 1.4950),
    (("x", 0.0372), 1.4950),
    (1.0, 1.5060),
    (1.5, 1.5165),
    (2.0, 1.5290),
    (2.45, 1.5460),
    (2.75, 1.5630),
]
_STUBBLE_ROWS = [1.4533, 1.4600]  # under the chin, chin edge ridge; then two per-column rows + top
# Upper-lip shadow strip, centre -> left: (x, z_bottom, z_top). Stays above the mouth quad.
_STUBBLE_LIP = [
    (0.000, 1.5340, 1.5398),
    (0.011, 1.5340, 1.5404),
    (0.022, 1.5341, 1.5400),
    (0.031, 1.5346, 1.5380),
]
STUBBLE_OFF_M = 0.0014


def _stubble_vert(bm: bmesh.types.BMesh, c, z: float) -> bmesh.types.BMVert:
    u = _head_u_at_x(c[1], z) if isinstance(c, tuple) else c
    return bm.verts.new(_head_uv(u, z) + _head_normal(u, z) * STUBBLE_OFF_M)


def build_facial_hair_beard_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Short full beard: a 1-2 mm shell over chin and jaw up to the sideburns plus an upper-lip shadow."""
    bm = bmesh.new()
    # Jaw / chin part (open at the top: the mouth stays bare skin)
    cols = [(("x", -c[1]) if isinstance(c, tuple) else -c, top) for c, top in reversed(_STUBBLE_COLS[1:])]
    cols += _STUBBLE_COLS
    grid = []
    for c, top in cols:
        r2 = 1.4950 if top > 1.4990 else 1.4750
        r3 = 1.5420 if top > 1.5460 else 0.5 * (r2 + top)
        grid.append([_stubble_vert(bm, c, z) for z in _STUBBLE_ROWS + [r2, r3, top]])
    for ci in range(len(cols) - 1):
        for ri in range(len(grid[0]) - 1):
            bm.faces.new((grid[ci][ri], grid[ci + 1][ri], grid[ci + 1][ri + 1], grid[ci][ri + 1]))
    # Upper-lip strip
    lip = [(-x, zb, zt) for x, zb, zt in reversed(_STUBBLE_LIP[1:])] + _STUBBLE_LIP
    strip = [(_stubble_vert(bm, ("x", x), zb), _stubble_vert(bm, ("x", x), 0.5 * (zb + zt)), _stubble_vert(bm, ("x", x), zt))
             for x, zb, zt in lip]
    for (a0, a1, a2), (b0, b1, b2) in zip(strip, strip[1:]):
        bm.faces.new((a0, b0, b1, a1))
        bm.faces.new((a1, b1, b2, a2))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        if (f.calc_center_median() - probe.head_center).dot(f.normal) < 0.0:
            f.normal_flip()
    return _finish("facial_hair_beard_01", bm, probe, lambda f, c: True, shade_lo=0.92)


register("facial_hair_moustache_01", "facial_hair", "Head", build_facial_hair_moustache_01, meta=_male_only("facial_hair_moustache_01"))
register("facial_hair_goatee_01", "facial_hair", "Head", build_facial_hair_goatee_01, meta=_male_only("facial_hair_goatee_01"))
register("facial_hair_beard_01", "facial_hair", "Head", build_facial_hair_beard_01, meta=_male_only("facial_hair_beard_01"))
