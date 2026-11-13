"""Vertex ambient occlusion baked into a colour attribute (glTF COLOR_0).

Geometric and deterministic: no Cycles, no random numbers. Every face corner
casts a fixed fan of cosine-weighted rays against a BVH of the whole model and
stores a greyscale value (white = open, never darker than FLOOR).

    bake(parts)      # called by Model.build() before the meshes are created

Rules
- Occluders are the opaque palette parts. Glass and emissive parts neither
  cast nor receive: their corners are written white so every primitive still
  carries COLOR_0.
- A part that moves or is an alternate (pivot, or `solo=True`) is baked on its
  own, so a door does not leave a stain where it stood.
- A model that stands on the ground (lowest point within GROUND_EPS of 0) gets
  a virtual ground plane, which gives legs and bases a contact gradient.
- A corner is sampled at a few points on the way to the face centre, so one
  vertex value stands for the part of the face it shades. Points that cannot be
  seen (inside another solid, or under a pad lying on the face) are skipped, so
  a leg poking into a table top or a desk under its mat does not go dark.
"""
import math

import bmesh
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
from mathutils.bvhtree import BVHTree

LAYER = "AO"
RAYS = 32            # directions per sample point
MAX_DIST = 0.55      # metres; occluders further away do not count
STRENGTH = 1.1       # value = 1 - STRENGTH * occlusion (a floor/wall crease is about 0.5)
FLOOR = 0.45         # darkest value written
INSETS = (0.06, 0.22, 0.4)   # sample points: fraction of the way corner -> face centre
FALLBACK = (0.01, 0.6, 0.8, 1.0)  # tried in order when all of the above are hidden
COVER = 0.012        # something this close above a point hides it (desk pad, decal)
BIAS = 0.002         # ray origin offset along the normal (m)
GROUND_EPS = 0.02    # "stands on the ground" tolerance (m)
STEP = 5             # values are multiples of STEP/255 (stable, compresses well)
PROBE = 4.0          # ray length for the "is this point inside a solid" test


def _table(n):
    """Cosine-weighted hemisphere directions (+Z = normal), golden-angle spiral."""
    out = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(n):
        u = (i + 0.5) / n
        r, z, phi = math.sqrt(u), math.sqrt(1.0 - u), i * golden
        out.append((round(r * math.cos(phi), 6), round(r * math.sin(phi), 6), round(z, 6)))
    return out


DIRS = _table(RAYS)


def _frame(n):
    helper = Vector((1.0, 0.0, 0.0)) if abs(n.x) < 0.9 else Vector((0.0, 1.0, 0.0))
    t = n.cross(helper).normalized()
    return t, n.cross(t)


def _occlusion(tree, origin, n, dirs):
    """Distance-weighted share of blocked rays, or None when the point cannot
    be seen: inside a solid, or covered by something lying right on the face."""
    _loc, _nor, _idx, dist = tree.ray_cast(origin, n, COVER)
    if dist is not None:
        return None
    occ = 0.0
    back = 0
    for d in dirs:
        _loc, nor, _idx, dist = tree.ray_cast(origin, d, PROBE)
        if dist is None:
            continue
        if nor.dot(d) > 0.0:
            back += 1
        if dist < MAX_DIST:
            occ += 1.0 - dist / MAX_DIST
    if back * 2 > len(dirs):
        return None
    return occ / len(dirs)


def _tree(parts, ground):
    verts, polys = [], []
    for p in parts:
        off = _offset(p)
        base = len(verts)
        p.bm.verts.index_update()
        verts.extend(v.co + off for v in p.bm.verts)
        polys.extend([base + v.index for v in f.verts] for f in p.bm.faces)
    if ground:
        base, s = len(verts), 50.0
        verts.extend(Vector(c) for c in ((-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)))
        polys.append([base, base + 1, base + 2, base + 3])
    if not polys:
        return None
    return BVHTree.FromPolygons(verts, polys, all_triangles=False, epsilon=0.0)


def _offset(p):
    piv = p.pivot
    return Vector((piv[0], -piv[2], piv[1])) if piv else Vector((0.0, 0.0, 0.0))


def _quant(v):
    return int(round(v * 255.0 / STEP)) * STEP / 255.0


def _bake_group(parts, ground):
    """-> {(part index in `parts`, face index, corner index): value}"""
    tree = _tree(parts, ground)
    raw = {}
    groups = {}
    for pi, p in enumerate(parts):
        off = _offset(p)
        p.bm.faces.index_update()
        for f in p.bm.faces:
            n = f.normal.copy()
            if n.length < 1e-9:
                for ci in range(len(f.loops)):
                    raw[(pi, f.index, ci)] = 0.0
                continue
            t, b = _frame(n)
            dirs = [t * x + b * y + n * z for x, y, z in DIRS]
            centre = f.calc_center_median() + off
            for ci, loop in enumerate(f.loops):
                co = loop.vert.co + off
                seen = [o for o in (_occlusion(tree, co.lerp(centre, k) + n * BIAS, n, dirs)
                                    for k in INSETS) if o is not None]
                if not seen:  # look further in before giving up on the corner
                    for k in FALLBACK:
                        o = _occlusion(tree, co.lerp(centre, k) + n * BIAS, n, dirs)
                        if o is not None:
                            seen = [o]
                            break
                key = (pi, f.index, ci)
                raw[key] = sum(seen) / len(seen) if seen else 0.0  # hidden face: white
                # corners that share a position and a facing shade alike, so
                # coplanar neighbours (bevels, caps, split boxes) show no seam
                gk = (round(co.x, 4), round(co.y, 4), round(co.z, 4),
                      round(n.x, 2), round(n.y, 2), round(n.z, 2))
                groups.setdefault(gk, []).append(key)
    occ = dict(raw)
    for keys in groups.values():
        mean = sum(raw[k] for k in keys) / len(keys)
        for k in keys:
            occ[k] = mean
    out = {k: _quant(max(FLOOR, 1.0 - STRENGTH * o)) for k, o in occ.items()}
    _match_coplanar(parts, out)
    return out


def _diagonal(vals):
    """Which diagonal a quad is cut along: 0 = corners 0-2, 1 = corners 1-3,
    None = no preference (flat or evenly graded)."""
    d02, d13 = vals[0] + vals[2], vals[1] + vals[3]
    if abs(d02 - d13) < 1e-6:
        return None
    return 0 if d02 > d13 else 1


def _triangles(pts2, vals):
    n = len(pts2)
    if n == 3:
        return [(0, 1, 2)]
    if n == 4:
        return [(0, 1, 3), (1, 2, 3)] if _diagonal(vals) == 1 else [(0, 1, 2), (0, 2, 3)]
    return [tuple(t) for t in tessellate_polygon([[Vector((x, y, 0.0)) for x, y in pts2]])]


def _field(pts2, vals, tris, q, tol=1e-5):
    """Value of a face's interpolated shade at 2D point q, None when q is outside."""
    for i, j, k in tris:
        (ax, ay), (bx, by), (cx, cy) = pts2[i], pts2[j], pts2[k]
        det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(det) < 1e-12:
            continue
        u = ((by - cy) * (q[0] - cx) + (cx - bx) * (q[1] - cy)) / det
        v = ((cy - ay) * (q[0] - cx) + (ax - cx) * (q[1] - cy)) / det
        w = 1.0 - u - v
        lim = -tol / math.sqrt(abs(det))
        if u >= lim and v >= lim and w >= lim:
            return u * vals[i] + v * vals[j] + w * vals[k]
    return None


def _match_coplanar(parts, out):
    """Faces of different boxes often lie in one plane and overlap (an arm rest
    flush with the back of a sofa). With different shades they would z-fight,
    so the smaller face takes the shade of the larger one where it lies on it."""
    planes = {}
    for pi, p in enumerate(parts):
        off = _offset(p)
        for f in p.bm.faces:
            n = f.normal
            if n.length < 1e-9:
                continue
            d = n.dot(f.verts[0].co + off)
            key = (round(n.x, 3), round(n.y, 3), round(n.z, 3), round(d * 2000.0))
            planes.setdefault(key, []).append((pi, f, off))
    for faces in planes.values():
        if len(faces) < 2:
            continue
        t, b = _frame(faces[0][1].normal.copy())
        items = []
        for order, (pi, f, off) in enumerate(faces):
            pts2 = [((l.vert.co + off).dot(t), (l.vert.co + off).dot(b)) for l in f.loops]
            items.append((-round(f.calc_area(), 6), order, pi, f.index, pts2))
        items.sort()
        masters = []
        for _area, _order, pi, fi, pts2 in items:
            keys = [(pi, fi, ci) for ci in range(len(pts2))]
            for key, q in zip(keys, pts2):
                for mpts, mvals, mtris in masters:
                    v = _field(mpts, mvals, mtris, q)
                    if v is not None:
                        out[key] = _quant(v)
                        break
            vals = [out[k] for k in keys]
            masters.append((pts2, vals, _triangles(pts2, vals)))


def _write(p, values):
    """Store the values; split a quad along its brighter diagonal when the two
    diagonals differ, so one dark corner stays a corner instead of a streak."""
    bm = p.bm
    col = bm.loops.layers.float_color.get(LAYER) or bm.loops.layers.float_color.new(LAYER)
    uvl = bm.loops.layers.uv.verify()
    for f in list(bm.faces):
        vals = [values[(f.index, ci)] if values else 1.0 for ci in range(len(f.loops))]
        for loop, v in zip(f.loops, vals):
            loop[col] = (v, v, v, 1.0)
        if len(vals) != 4:
            continue
        diag = _diagonal(vals)
        if diag is None:
            continue
        loops = list(f.loops)
        by_vert = {l.vert: (v, l[uvl].uv.copy()) for l, v in zip(loops, vals)}
        a, b = loops[diag].vert, loops[diag + 2].vert
        new_face, _loop = bmesh.utils.face_split(f, a, b)
        for face in (f, new_face):
            face.smooth = False
            for loop in face.loops:
                v, uv = by_vert[loop.vert]
                loop[col] = (v, v, v, 1.0)
                loop[uvl].uv = uv


def bake(parts):
    """Bake AO into the `AO` colour layer of every part that has faces."""
    live = [p for p in parts if p.bm.faces]
    for p in live:
        p.bm.normal_update()
    zs = [v.co.z + _offset(p).z for p in live for v in p.bm.verts]
    ground = bool(zs) and abs(min(zs)) <= GROUND_EPS
    opaque = [p for p in live if p.mat == "palette"]
    groups = [[p for p in opaque if not p.solo]] + [[p] for p in opaque if p.solo]
    done = {}
    for group in groups:
        if not group:
            continue
        vals = _bake_group(group, ground)
        for pi, p in enumerate(group):
            done[id(p)] = {(fi, ci): v for (gi, fi, ci), v in vals.items() if gi == pi}
    for p in live:
        _write(p, done.get(id(p)))
