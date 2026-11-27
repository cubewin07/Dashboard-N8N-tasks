"""B6 bags (P08a-T08): backpack, crossbody bag, shoulder tote. Rigid, bone ``Spine2``.

All three are authored in rest-pose character space (metres, +Z up, face -Y, character left = +X).
Bag bodies sit behind the torso / at the hip back so the swinging arms never reach them. Straps are
swept box-section bands whose control points are pushed outside the *torso* skin (chest, belly, hips,
neck of both bases, neutral shape) by a clearance chosen to leave room for Heavy / Chest growth.
Rigid items do not follow shape keys, hence the generous gaps (bags float, straps ride a little high).
"""

from __future__ import annotations

import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from items_rigid import register
from lib import bodyshape, export, fit
from lib.garments import _paint_faces

TORSO_REGIONS = {"chest", "belly", "hips", "neck"}
_TORSO_BVHS: list[BVHTree] = []


def _torso_bvhs() -> list[BVHTree]:
    """Neutral torso-only surfaces of both bases (arms excluded: they swing away in poses)."""
    if _TORSO_BVHS:
        return _TORSO_BVHS
    for base in ("female", "male"):
        export.clear_scene()
        _arm, ob, _meta = bodyshape.build_base_body(base)
        body = fit.extract_body_data(ob, base)
        tris = [t for t in body.all_tris if all(body.vert_regions[v] in TORSO_REGIONS for v in t)]
        _TORSO_BVHS.append(BVHTree.FromPolygons([Vector(v) for v in body.verts_basis], tris))
    export.clear_scene()
    return _TORSO_BVHS


def _push_clear(p: Vector, clear: float) -> Vector:
    """Return ``p`` moved so it is at least ``clear`` outside every torso surface."""
    p = p.copy()
    for _ in range(3):
        for bvh in _torso_bvhs():
            loc, nrm, _i, _d = bvh.find_nearest(p)
            if loc is None:
                continue
            signed = (p - loc).dot(nrm)
            if signed < clear:
                p += nrm * (clear - signed)
    return p


def _outward(p: Vector) -> Vector:
    best = Vector((0.0, 0.0, 1.0))
    bd = 1e9
    for bvh in _torso_bvhs():
        loc, nrm, _i, d = bvh.find_nearest(p)
        if loc is not None and d < bd:
            bd = d
            best = (p - loc).normalized() if d > 1e-5 else nrm
    return best


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

Paint = list  # [(face, tint, shade)]


def _rrect(cx: float, cy: float, z: float, hx: float, hy: float, cut: float) -> list[Vector]:
    """Octagon (rounded rectangle) ring, CCW seen from above."""
    return [
        Vector((cx + hx - cut, cy - hy, z)), Vector((cx + hx, cy - hy + cut, z)),
        Vector((cx + hx, cy + hy - cut, z)), Vector((cx + hx - cut, cy + hy, z)),
        Vector((cx - hx + cut, cy + hy, z)), Vector((cx - hx, cy + hy - cut, z)),
        Vector((cx - hx, cy - hy + cut, z)), Vector((cx - hx + cut, cy - hy, z)),
    ]


def _quad(bm, paint: Paint, vs, tint: str, shade: float) -> None:
    try:
        f = bm.faces.new(vs)
    except ValueError:
        return
    f.smooth = False
    paint.append((f, tint, shade))


def _prism(bm, paint: Paint, rings: list[list[Vector]], tints, shades=None, caps: bool = True) -> None:
    """Closed shell through ``rings`` (each a CCW polygon). ``tints`` / ``shades`` per ring band."""
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(vr[0])
    for b in range(len(vr) - 1):
        tint = tints[b] if isinstance(tints, (list, tuple)) else tints
        shade = shades[b] if isinstance(shades, (list, tuple)) else (shades or 1.0)
        for k in range(n):
            k2 = (k + 1) % n
            # alternate side shading so the low-poly facets read
            sh = shade * (0.9 if k % 2 else 1.0)
            _quad(bm, paint, (vr[b][k], vr[b][k2], vr[b + 1][k2], vr[b + 1][k]), tint, sh)
    if caps:
        t_top = tints[-1] if isinstance(tints, (list, tuple)) else tints
        _quad(bm, paint, vr[-1], t_top, 1.0)
        _quad(bm, paint, vr[0][::-1], t_top, 0.72)


def _strap(bm, paint: Paint, pts: list[Vector], *, width: float, thick: float, clear: float, tint: str = "accent",
           shade: float = 0.95, push: bool = True) -> list[Vector]:
    """Box-section band along ``pts``; the inner face rides ``clear`` above the torso skin."""
    path = [(_push_clear(p, clear + 0.5 * thick) if push else p.copy()) for p in pts]
    rows = []
    n = len(path)
    for i in range(n):
        tan = (path[min(n - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        up = _outward(path[i])
        nrm = (up - tan * up.dot(tan)).normalized()
        wd = tan.cross(nrm).normalized()
        c = path[i]
        hw, ht = 0.5 * width, 0.5 * thick
        rows.append([
            bm.verts.new(c - wd * hw - nrm * ht), bm.verts.new(c + wd * hw - nrm * ht),
            bm.verts.new(c + wd * hw + nrm * ht), bm.verts.new(c - wd * hw + nrm * ht),
        ])
    for i in range(n - 1):
        a, b = rows[i], rows[i + 1]
        for k in range(4):
            k2 = (k + 1) % 4
            _quad(bm, paint, (a[k], a[k2], b[k2], b[k]), tint, shade if k == 2 else shade * 0.82)
    _quad(bm, paint, rows[0][::-1], tint, 0.8)
    _quad(bm, paint, rows[-1], tint, 0.8)
    return path


def _finish(bm, paint: Paint):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    _paint_faces(bm, [(f, "white", tint, shade) for f, tint, shade in paint])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return bm


# ---------------------------------------------------------------------------
# bag_backpack_01
# ---------------------------------------------------------------------------

BACK_Y = 0.150  # inner face of the pack: 43 mm behind the neutral back, ~ 20 mm outside the worst torso growth


def build_backpack(_probe):
    bm = bmesh.new()
    paint: Paint = []
    yc = BACK_Y + 0.060
    # main body: slightly tapered, wider at the shoulders end
    _prism(bm, paint, [
        _rrect(0.0, yc, 1.015, 0.100, 0.060, 0.026),
        _rrect(0.0, yc + 0.004, 1.150, 0.122, 0.064, 0.030),
        _rrect(0.0, yc, 1.330, 0.112, 0.056, 0.030),
    ], "primary", [1.0, 0.96])
    # front pocket on the outside
    y_out = yc + 0.064 + 0.004
    _prism(bm, paint, [
        _rrect(0.0, y_out + 0.010, 1.050, 0.082, 0.018, 0.010),
        _rrect(0.0, y_out + 0.010, 1.170, 0.088, 0.018, 0.010),
    ], "accent", 0.95)
    # top lid
    _prism(bm, paint, [
        _rrect(0.0, yc, 1.300, 0.118, 0.062, 0.030),
        _rrect(0.0, yc, 1.352, 0.108, 0.058, 0.030),
    ], "accent", 0.97)
    # shoulder straps over the shoulders; both ends stop short of the sides (the arms hang there)
    for sx in (+1, -1):
        pts = [
            Vector((sx * 0.085, BACK_Y, 1.30)),
            Vector((sx * 0.095, 0.085, 1.395)),
            Vector((sx * 0.100, 0.020, 1.425)),
            Vector((sx * 0.100, -0.060, 1.405)),
            Vector((sx * 0.095, -0.120, 1.300)),
            Vector((sx * 0.100, -0.125, 1.215)),
            Vector((sx * 0.112, -0.112, 1.160)),
        ]
        _strap(bm, paint, pts, width=0.040, thick=0.012, clear=0.046)
        # lower stub rising from the bottom corner of the pack toward the side seam
        low = [
            Vector((sx * 0.090, BACK_Y + 0.004, 1.050)),
            Vector((sx * 0.105, 0.120, 1.095)),
            Vector((sx * 0.112, 0.095, 1.125)),
        ]
        _strap(bm, paint, low, width=0.040, thick=0.012, clear=0.046)
    return _finish(bm, paint)


# ---------------------------------------------------------------------------
# bag_crossbody_01
# ---------------------------------------------------------------------------


def build_crossbody(_probe):
    bm = bmesh.new()
    paint: Paint = []
    # small satchel on the left back hip
    cx, cy = 0.115, 0.215
    _prism(bm, paint, [
        _rrect(cx, cy, 0.905, 0.068, 0.036, 0.016),
        _rrect(cx, cy, 0.985, 0.076, 0.040, 0.018),
        _rrect(cx, cy, 1.040, 0.072, 0.038, 0.017),
    ], "primary", [1.0, 0.96])
    # flap
    _prism(bm, paint, [
        _rrect(cx, cy + 0.003, 0.995, 0.080, 0.043, 0.019),
        _rrect(cx, cy + 0.003, 1.046, 0.076, 0.041, 0.018),
    ], "accent", 0.97)
    # strap over the right shoulder: front diagonal ends at the left hip, back diagonal drops to the bag
    # (the gap at the left side is where the swinging arm passes)
    front = [
        Vector((0.095, -0.120, 1.115)),
        Vector((0.050, -0.135, 1.170)),
        Vector((-0.030, -0.140, 1.245)),
        Vector((-0.085, -0.115, 1.340)),
        Vector((-0.105, -0.040, 1.405)),
        Vector((-0.105, 0.040, 1.405)),
        Vector((-0.070, 0.115, 1.330)),
        Vector((0.000, 0.145, 1.235)),
        Vector((0.070, 0.165, 1.130)),
        Vector((0.085, 0.200, 1.040)),
    ]
    _strap(bm, paint, front, width=0.030, thick=0.010, clear=0.058)
    # short strap stub from the bag's side corner toward the hip
    _strap(bm, paint, [Vector((0.140, 0.200, 1.040)), Vector((0.120, 0.150, 1.080)), Vector((0.105, 0.115, 1.105))],
           width=0.030, thick=0.010, clear=0.058)
    return _finish(bm, paint)


# ---------------------------------------------------------------------------
# bag_tote_01
# ---------------------------------------------------------------------------


def build_tote(_probe):
    bm = bmesh.new()
    paint: Paint = []
    # tote hanging against the left back / side, clear of the swinging arm
    cx, cy = 0.080, 0.218
    _prism(bm, paint, [
        _rrect(cx, cy, 0.860, 0.080, 0.036, 0.018),
        _rrect(cx, cy, 1.000, 0.098, 0.044, 0.020),
        _rrect(cx, cy, 1.110, 0.108, 0.044, 0.020),
    ], "primary", [1.0, 0.97])
    # rim band
    _prism(bm, paint, [
        _rrect(cx, cy, 1.100, 0.110, 0.046, 0.021),
        _rrect(cx, cy, 1.135, 0.110, 0.046, 0.021),
    ], "accent", 0.97)
    # shoulder handle: bag top -> up the back -> over the left shoulder -> down the chest (ends under the arm)
    pts = [
        Vector((0.030, 0.195, 1.125)),
        Vector((0.050, 0.130, 1.250)),
        Vector((0.095, 0.060, 1.380)),
        Vector((0.110, 0.000, 1.415)),
        Vector((0.110, -0.060, 1.395)),
        Vector((0.105, -0.095, 1.300)),
        Vector((0.112, -0.105, 1.215)),
    ]
    _strap(bm, paint, pts, width=0.034, thick=0.011, clear=0.046)
    # second handle from the other top corner joins the first on the shoulder blade
    _strap(bm, paint, [Vector((0.150, 0.195, 1.125)), Vector((0.140, 0.140, 1.230)), Vector((0.125, 0.085, 1.340)),
                       Vector((0.110, 0.040, 1.405))],
           width=0.034, thick=0.011, clear=0.046)
    return _finish(bm, paint)


register("bag_backpack_01", "bag", "Spine2", build_backpack)
register("bag_crossbody_01", "bag", "Spine2", build_crossbody)
register("bag_tote_01", "bag", "Spine2", build_tote)
