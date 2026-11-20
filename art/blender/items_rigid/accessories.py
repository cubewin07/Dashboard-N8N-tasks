"""Small rigid accessories (P08a-T09, batch B7): hats, glasses, earrings, neck items, wrist items.

All items are authored in rest-pose character space (Blender metres, +Z up, faces -Y, left = +X) from the
measured ``BodyProbe`` so they fit both bases. Tints: ``primary`` / ``secondary`` / ``accent`` faces sit on the
palette ``white`` swatch (runtime tint mask); fixed-colour parts use their own swatch with mask 0.
"""

from __future__ import annotations

import math

import bmesh
from mathutils import Matrix, Vector

from lib import bodyshape, charexport, export
from lib.rigid_common import *  # noqa: F403  (helpers + BodyProbe + hat band API)
from lib.rigid_common import _add_prism_lock, _cranium_ray_surface, _cranium_ring_point, _dir_from_theta_phi, _signed_scalp_dist, _torso_surface_point  # noqa: F401
from items_rigid import register

import bpy


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _tag(faces, k: int) -> None:
    for f in faces:
        f.material_index = k


def _finish(bm: bmesh.types.BMesh, table: dict[int, tuple[str, str]], shade_lo: float = 0.84, flat_shade: float | None = None) -> bmesh.types.BMesh:
    """Triangulate, then paint every face from ``table[face.material_index] = (swatch, tint)``.

    ``swatch`` is a palette key (``white`` for tinted parts); ``tint`` is primary/secondary/accent/none.
    """
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    charexport.ensure_color_layer(bm)
    groups: dict[str, list] = {}
    tint_map = {}
    shade = {}
    for f in bm.faces:
        swatch, tint = table[f.material_index]
        groups.setdefault(swatch, []).append(f)
        tint_map[f] = tint
        if flat_shade is not None:
            shade[f] = flat_shade
        else:
            shade[f] = 1.0 if (f.normal.z > 0.25 or f.normal.y < -0.5) else shade_lo
    for swatch, fs in groups.items():
        charexport.paint_palette(bm, fs, swatch)
    charexport.set_garment_colors(bm, tint_map, shade=shade)
    for f in bm.faces:
        f.material_index = 0
    return bm


def _grid_shell(bm, top, bot) -> list:
    """Thin closed plate between two same-shaped vertex grids ``[i][s]`` (top surface, bottom surface)."""
    tv = [[bm.verts.new(p) for p in row] for row in top]
    bv = [[bm.verts.new(p) for p in row] for row in bot]
    ni, ns = len(tv), len(tv[0])
    faces = []
    for i in range(ni - 1):
        for s in range(ns - 1):
            faces.append(bm.faces.new((tv[i][s], tv[i + 1][s], tv[i + 1][s + 1], tv[i][s + 1])))
            faces.append(bm.faces.new((bv[i][s + 1], bv[i + 1][s + 1], bv[i + 1][s], bv[i][s])))
    for i in range(ni - 1):  # edge strips along the first and last station
        faces.append(bm.faces.new((tv[i][0], bv[i][0], bv[i + 1][0], tv[i + 1][0])))
        faces.append(bm.faces.new((tv[i][ns - 1], tv[i + 1][ns - 1], bv[i + 1][ns - 1], bv[i][ns - 1])))
    for s in range(ns - 1):  # both ends
        faces.append(bm.faces.new((tv[0][s], tv[0][s + 1], bv[0][s + 1], bv[0][s])))
        faces.append(bm.faces.new((tv[ni - 1][s], bv[ni - 1][s], bv[ni - 1][s + 1], tv[ni - 1][s + 1])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def _orth_frame(t: Vector, ref: Vector) -> tuple[Vector, Vector]:
    t = t.normalized()
    n = ref - t * ref.dot(t)
    if n.length < 1e-6:
        n = Vector((0.0, 0.0, 1.0)) - t * t.z
    n.normalize()
    return n, t.cross(n).normalized()


def _tube(bm, pts: list[Vector], radius, sides: int = 4, closed: bool = False, refs: list[Vector] | None = None, phase: float = 0.0, caps: bool = True) -> list:
    """Tube along ``pts`` (radius may be a number or a per-point list). Returns the faces."""
    m = len(pts)
    radii = radius if isinstance(radius, (list, tuple)) else [radius] * m
    rings = []
    for i, p in enumerate(pts):
        if closed:
            t = pts[(i + 1) % m] - pts[(i - 1) % m]
        else:
            t = pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]
        ref = refs[i] if refs else Vector((0.0, 0.0, 1.0))
        n, b = _orth_frame(t, ref)
        ring = []
        for k in range(sides):
            a = phase + 2.0 * math.pi * k / sides
            ring.append(bm.verts.new(p + (n * math.cos(a) + b * math.sin(a)) * radii[i]))
        rings.append(ring)
    faces = []
    last = m if closed else m - 1
    for i in range(last):
        r0, r1 = rings[i], rings[(i + 1) % m]
        for k in range(sides):
            k2 = (k + 1) % sides
            faces.append(bm.faces.new((r0[k], r0[k2], r1[k2], r1[k])))
    if not closed and caps:
        faces.append(bm.faces.new(tuple(reversed(rings[0]))))
        faces.append(bm.faces.new(tuple(rings[-1])))
    return faces


def _box(bm, c: Vector, ax: Vector, ay: Vector, az: Vector, hx: float, hy: float, hz: float, taper_top: float = 1.0) -> list:
    """Closed oriented box centred on ``c`` with half sizes along the unit axes ``ax, ay, az``."""
    vs = {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                k = taper_top if sz > 0 else 1.0
                vs[(sx, sy, sz)] = bm.verts.new(c + ax * (sx * hx * k) + ay * (sy * hy) + az * (sz * hz))
    faces = []
    for quad in (
        [(-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)],
        [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)],
        [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)],
        [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)],
        [(-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)],
        [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)],
    ):
        faces.append(bm.faces.new([vs[q] for q in quad]))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def _bipyramid(bm, c: Vector, r: float, sides: int = 6, squash: float = 1.0) -> list:
    """Low-poly bead: apex rings at +/-lat so it reads as a sphere. ``sides`` tris per cap."""
    top = bm.verts.new(c + Vector((0, 0, r * squash)))
    bot = bm.verts.new(c - Vector((0, 0, r * squash)))
    lat = math.radians(32.0)
    ring_hi = []
    ring_lo = []
    for k in range(sides):
        a = 2.0 * math.pi * k / sides + 0.5
        d = Vector((math.cos(a), math.sin(a), 0.0))
        ring_hi.append(bm.verts.new(c + d * (r * math.cos(lat)) + Vector((0, 0, r * math.sin(lat) * squash))))
        ring_lo.append(bm.verts.new(c + d * (r * math.cos(lat)) - Vector((0, 0, r * math.sin(lat) * squash))))
    faces = []
    for k in range(sides):
        k2 = (k + 1) % sides
        faces.append(bm.faces.new((top, ring_hi[k], ring_hi[k2])))
        faces.append(bm.faces.new((ring_hi[k], ring_lo[k], ring_lo[k2], ring_hi[k2])))
        faces.append(bm.faces.new((bot, ring_lo[k2], ring_lo[k])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def _bead(bm, c: Vector, r: float) -> list:
    return _bipyramid(bm, c, r, sides=5)


def _front_y(probe: BodyProbe, x: float, z: float) -> float:
    """Most forward (smallest) torso/neck surface y at ``(x, z)`` across both bases."""
    best = 1.0
    for bvh in (probe.torso_bvh, probe.male_torso_bvh):
        hit, _n, _i, _d = bvh.ray_cast(Vector((x, -0.6, z)), Vector((0.0, 1.0, 0.0)), 1.2)
        if hit is not None:
            best = min(best, hit.y)
    if best > 0.9:
        # Past the torso BVH (below the chest region): extrapolate from the last known row.
        best = min(_front_y(probe, x, z + 0.02), 0.0) if z < 1.30 else -0.06
    return best


def _neck_center(probe: BodyProbe) -> Vector:
    return Vector((0.0, 0.0, 0.0))


def _surface_radius(probe: BodyProbe, z: float, theta: float) -> tuple[Vector, Vector]:
    """Outermost torso point (both bases) at height ``z`` and azimuth ``theta`` (0 = front)."""
    return _torso_surface_point([probe.torso_bvh, probe.male_torso_bvh], z, theta, fallback_r=0.055)


# ---------------------------------------------------------------------------
# Hats (P08a §3.2): lower rim on the shared hat band, inner surface >= HAT_CLEAR_M off the scalp
# ---------------------------------------------------------------------------

def _dome_point(probe: BodyProbe, theta: float, phi_deg: float | None, off: float, z_above_band: float = 0.0) -> Vector:
    """Hat surface point ``off`` m outside the cranium. ``phi_deg=None`` = the band ring (shared hat band API),
    otherwise a ray from the head centre at elevation ``phi_deg`` offset along the surface normal."""
    if phi_deg is None:
        return hat_ring_point(probe, theta, hat_band_z(probe) + z_above_band, off - HAT_CLEAR_M)
    p, nrm = _cranium_ray_surface(probe, _dir_from_theta_phi(theta, math.radians(phi_deg)))
    return p + nrm * off


def _enforce_inner_clearance(probe: BodyProbe, rin, rout, crown_in, crown_out) -> None:
    """Push inner-ring vertices (and their outer twins) outward until the inner surface (vertices, chord midpoints,
    face centres) stays >= HAT_CLEAR_M + 0.5 mm off the scalp at and above the hat band."""
    need = HAT_CLEAR_M + 0.0005
    zb = hat_band_z(probe) - 1e-4
    hc = probe.head_center
    n = len(rin[0])
    rows = len(rin)

    def dist(p: Vector) -> float:
        return probe.scalp_bvh.find_nearest(p)[3]

    def push(j: int, i: int, delta: float) -> None:
        d = rin[j][i].co - hc
        d.z *= 0.6
        d.normalize()
        rin[j][i].co += d * delta
        rout[j][i].co += d * delta

    for _ in range(16):
        moved = False
        for j in range(rows):
            for i in range(n):
                v = rin[j][i].co
                if v.z >= zb and (dd := dist(v)) < need:
                    push(j, i, need - dd)
                    moved = True
        for j in range(rows):
            for i in range(n):
                i2 = (i + 1) % n
                quad = [(j, i), (j, i2)] + ([(j + 1, i2), (j + 1, i)] if j + 1 < rows else [])
                c = sum((rin[a][b].co for a, b in quad), Vector()) / len(quad)
                if c.z >= zb and (dd := dist(c)) < need:
                    for a, b in quad:
                        push(a, b, need - dd + 0.0003)
                    moved = True
                mid = 0.5 * (rin[j][i].co + rin[j][i2].co)
                if mid.z >= zb and (dd := dist(mid)) < need:
                    push(j, i, need - dd + 0.0003)
                    push(j, i2, need - dd + 0.0003)
                    moved = True
        top = rows - 1
        for i in range(n):
            i2 = (i + 1) % n
            c = (rin[top][i].co + rin[top][i2].co + crown_in.co) / 3.0
            if (dd := dist(c)) < need:
                crown_in.co.z += need - dd + 0.0003
                crown_out.co.z += need - dd + 0.0003
                moved = True
        if (dd := dist(crown_in.co)) < need:
            crown_in.co.z += need - dd
            crown_out.co.z += need - dd
            moved = True
        if not moved:
            break


def _hat_dome(probe: BodyProbe, n: int, specs: list[tuple], crown_extra: float, thick: float):
    """Double-walled dome from ``specs = [(phi_deg | None, inner_extra_m, outer_extra_m), ...]`` bottom -> top.
    ``None`` is the band ring. Returns ``(bm, outer_faces, inner_faces, hem_faces, crown_in, crown_out)``."""
    bm = bmesh.new()
    hc = probe.head_center
    ztop = probe.cranium_bounds.zmax + HAT_CLEAR_M + crown_extra
    thetas = [2.0 * math.pi * i / n for i in range(n)]
    rings_in, rings_out = [], []
    for phi, ex_in, ex_out in specs:
        rings_in.append([bm.verts.new(_dome_point(probe, th, phi, HAT_CLEAR_M + ex_in)) for th in thetas])
        rings_out.append([bm.verts.new(_dome_point(probe, th, phi, HAT_CLEAR_M + ex_out)) for th in thetas])
    crown_in = bm.verts.new(Vector((hc.x, hc.y, ztop)))
    crown_out = bm.verts.new(Vector((hc.x, hc.y, ztop + thick)))
    _enforce_inner_clearance(probe, rings_in, rings_out, crown_in, crown_out)
    outer, inner, hem = [], [], []
    top = len(specs) - 1
    for i in range(n):
        i2 = (i + 1) % n
        outer.append(bm.faces.new((rings_out[top][i], rings_out[top][i2], crown_out)))
        inner.append(bm.faces.new((crown_in, rings_in[top][i2], rings_in[top][i])))
        hem.append(bm.faces.new((rings_in[0][i], rings_in[0][i2], rings_out[0][i2], rings_out[0][i])))
    for j in range(top):
        for i in range(n):
            i2 = (i + 1) % n
            outer.append(bm.faces.new((rings_out[j + 1][i], rings_out[j + 1][i2], rings_out[j][i2], rings_out[j][i])))
            inner.append(bm.faces.new((rings_in[j][i], rings_in[j][i2], rings_in[j + 1][i2], rings_in[j + 1][i])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm, outer, inner, hem, crown_in, crown_out


def _inner_clearance_mm(bm, probe: BodyProbe, inner_faces) -> float:
    """Minimum distance (mm) from the hat's inner surface (verts, edge mids, face centres) to the scalp."""
    z_band = hat_band_z(probe) - 1e-4
    pts: list[Vector] = []
    seen = set()
    for f in inner_faces:
        if not f.is_valid:
            continue
        pts.append(f.calc_center_median())
        for v in f.verts:
            pts.append(v.co.copy())
        for e in f.edges:
            if e.index in seen:
                continue
            seen.add(e.index)
            pts.append(0.5 * (e.verts[0].co + e.verts[1].co))
    best = 1.0
    worst_p = None
    for p in pts:
        if p.z < z_band:
            continue
        loc, _n, _i, dist = probe.scalp_bvh.find_nearest(p)
        if dist < best:
            best, worst_p = dist, p
    if worst_p is not None and best < HAT_CLEAR_M:
        print(f"  worst at ({worst_p.x:.3f}, {worst_p.y:.3f}, {worst_p.z:.3f})")
    return best * 1000.0


def _report_hat(name: str, bm, probe, inner_faces) -> None:
    print(f"HAT {name}: inner clearance min {_inner_clearance_mm(bm, probe, inner_faces):.1f} mm (need >= {HAT_CLEAR_M * 1000:.0f})")


def build_head_cap_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Baseball cap: six-panel dome on the hat band, curved bill, button. No logo."""
    n = 12
    specs = [(None, 0.003, 0.010), (52.0, 0.004, 0.012), (64.0, 0.005, 0.013), (76.0, 0.006, 0.014), (86.0, 0.007, 0.015)]
    bm, outer, inner, hem, crown_in, crown_out = _hat_dome(probe, n, specs, crown_extra=0.004, thick=0.011)
    _tag(outer, 0)
    _tag(inner, 1)
    _tag(hem, 1)
    z0 = hat_band_z(probe)
    # Bill: curved plate leaving the front of the rim
    thetas = [math.radians(a) for a in (-58, -38, -19, 0, 19, 38, 58)]
    lens = [0.046, 0.064, 0.078, 0.084, 0.078, 0.064, 0.046]
    top_g, bot_g = [], []
    for th, ln in zip(thetas, lens):
        d = Vector((math.sin(th), -math.cos(th), 0.0))
        base = hat_ring_point(probe, th, z0 + 0.003, 0.010) - d * 0.006
        stations = [(0.0, 0.0), (0.50, -0.007), (1.0, -0.021)]
        top_g.append([base + d * (ln * f) + Vector((0, 0, dz)) for f, dz in stations])
        bot_g.append([p - Vector((0, 0, 0.0045)) for p in top_g[-1]])
    bill = _grid_shell(bm, top_g, bot_g)
    _tag(bill, 2)
    # Button on the crown
    hc = crown_out.co
    btn = []
    ring = [bm.verts.new(hc + Vector((math.cos(a) * 0.007, math.sin(a) * 0.007, -0.001))) for a in [2 * math.pi * k / 6 for k in range(6)]]
    apex = bm.verts.new(hc + Vector((0, 0, 0.007)))
    for k in range(6):
        btn.append(bm.faces.new((ring[k], ring[(k + 1) % 6], apex)))
    bmesh.ops.recalc_face_normals(bm, faces=btn)
    _tag(btn, 2)
    _report_hat("cap", bm, probe, inner)
    return _finish(bm, {0: ("white", "primary"), 1: ("white", "primary"), 2: ("white", "accent")}, shade_lo=0.82)


def build_head_beret_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Beret: flat pillow crown flaring wider than the head, stalk on top."""
    n = 14
    # (dz above band, inner extra, outer extra): band rim -> flare -> shoulder
    specs = [(None, 0.004, 0.012), (50.0, 0.010, 0.056), (64.0, 0.012, 0.062), (78.0, 0.014, 0.040), (86.0, 0.016, 0.022)]
    bm, outer, inner, hem, crown_in, crown_out = _hat_dome(probe, n, specs, crown_extra=0.012, thick=0.006)
    _tag(outer, 0)
    _tag(inner, 1)
    _tag(hem, 1)
    stalk = []
    c = crown_out.co
    ring_lo = [bm.verts.new(c + Vector((math.cos(a) * 0.007, math.sin(a) * 0.007, -0.002))) for a in [2 * math.pi * k / 5 for k in range(5)]]
    ring_hi = [bm.verts.new(c + Vector((math.cos(a) * 0.0045, math.sin(a) * 0.0045, 0.011))) for a in [2 * math.pi * k / 5 for k in range(5)]]
    for k in range(5):
        k2 = (k + 1) % 5
        stalk.append(bm.faces.new((ring_lo[k], ring_lo[k2], ring_hi[k2], ring_hi[k])))
    stalk.append(bm.faces.new(tuple(reversed(ring_hi))))
    bmesh.ops.recalc_face_normals(bm, faces=stalk)
    _tag(stalk, 2)
    _report_hat("beret", bm, probe, inner)
    return _finish(bm, {0: ("white", "primary"), 1: ("white", "primary"), 2: ("white", "accent")}, shade_lo=0.82)


def build_head_non_la_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Nón lá: wide conical palm-leaf hat (~0.42 m) with woven bands and a chin strap."""
    n = 12
    z0 = hat_band_z(probe)
    hc = probe.head_center
    rim_r = 0.215
    height = 0.165
    # inner cone must clear the scalp by HAT_CLEAR_M: raise it until it does
    bm = bmesh.new()
    thetas = [2.0 * math.pi * i / n for i in range(n)]
    rings = [(rim_r, 0.0), (rim_r * 0.68, 0.34), (rim_r * 0.36, 0.67)]
    apex_h = 1.0
    thick = 0.007
    for lift in [0.0 + 0.002 * k for k in range(60)]:
        # test cone clearance by sampling scalp BVH
        def cone_z(r: float) -> float:
            return z0 + lift + height * (1.0 - r / rim_r)
        ok = True
        for r in [i * 0.01 for i in range(0, 22)]:
            for th in thetas[::2]:
                p = Vector((hc.x + r * math.sin(th), hc.y - r * math.cos(th), cone_z(r) - thick))
                _loc, _n, _i, dist = probe.scalp_bvh.find_nearest(p)
                if dist < HAT_CLEAR_M + 0.002:
                    ok = False
                    break
            if not ok:
                break
        if ok:
            break
    base_z = z0 + lift
    print(f"HAT non_la lift {lift * 1000:.0f} mm, apex z {base_z + height:.3f}")
    outer_rings, inner_rings = [], []
    for r, t in rings:
        z = base_z + height * t
        outer_rings.append([bm.verts.new(Vector((hc.x + r * math.sin(th), hc.y - r * math.cos(th), z))) for th in thetas])
        inner_rings.append([bm.verts.new(Vector((hc.x + (r - 0.004) * math.sin(th), hc.y - (r - 0.004) * math.cos(th), z - thick))) for th in thetas])
    apex_o = bm.verts.new(Vector((hc.x, hc.y, base_z + height + 0.012)))
    apex_i = bm.verts.new(Vector((hc.x, hc.y, base_z + height + 0.012 - thick)))
    band_faces = [[], [], []]
    inner_faces = []
    hem = []
    top = len(rings) - 1
    for i in range(n):
        i2 = (i + 1) % n
        band_faces[2].append(bm.faces.new((outer_rings[top][i], outer_rings[top][i2], apex_o)))
        inner_faces.append(bm.faces.new((apex_i, inner_rings[top][i2], inner_rings[top][i])))
        hem.append(bm.faces.new((inner_rings[0][i], inner_rings[0][i2], outer_rings[0][i2], outer_rings[0][i])))
    for j in range(top):
        for i in range(n):
            i2 = (i + 1) % n
            band_faces[j].append(bm.faces.new((outer_rings[j + 1][i], outer_rings[j + 1][i2], outer_rings[j][i2], outer_rings[j][i])))
            inner_faces.append(bm.faces.new((inner_rings[j][i], inner_rings[j][i2], inner_rings[j + 1][i2], inner_rings[j + 1][i])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for k, fs in enumerate(band_faces):
        _tag(fs, k)       # 0 outer band, 1 mid band, 2 top band (alternating shades)
    _tag(inner_faces, 3)
    _tag(hem, 4)
    # Finial knob
    c = apex_o.co
    knob = []
    rg = [bm.verts.new(c + Vector((math.cos(a) * 0.008, math.sin(a) * 0.008, -0.002))) for a in [2 * math.pi * k / 6 for k in range(6)]]
    ap = bm.verts.new(c + Vector((0, 0, 0.012)))
    for k in range(6):
        knob.append(bm.faces.new((rg[k], rg[(k + 1) % 6], ap)))
    bmesh.ops.recalc_face_normals(bm, faces=knob)
    _tag(knob, 4)
    # Chin strap: from the inner rim near each ear, outside the ear, under the chin.
    bvhs = [probe.scalp_bvh, probe.torso_bvh, probe.male_torso_bvh]

    def clear_point(p: Vector, want: float = 0.006) -> Vector:
        for _ in range(8):
            worst = None
            for bvh in bvhs:
                loc, nrm, _i, dist = bvh.find_nearest(p)
                if loc is None:
                    continue
                outside = (p - loc).dot(nrm) >= 0
                signed = dist if outside else -dist
                if signed < want and (worst is None or signed < worst[0]):
                    worst = (signed, loc, nrm)
            if worst is None:
                return p
            signed, loc, nrm = worst
            p = p + nrm * (want - signed + 0.0005)
        return p

    ear = probe.ear_l
    fh = probe.full_head_bounds
    anchors = [
        Vector((0.158, 0.010, z0 + 0.040)),
        Vector((0.156, 0.012, ear.zmax + 0.022)),
        Vector((0.150, 0.012, ear.zmin + 0.004)),
        Vector((0.122, -0.020, fh.zmin + 0.020)),
        Vector((0.074, -0.066, fh.zmin - 0.004)),
        Vector((0.0, -0.088, fh.zmin - 0.014)),
    ]

    def smooth(pts: list[Vector], sub: int = 3) -> list[Vector]:
        out = []
        P = [pts[0]] + pts + [pts[-1]]
        for i in range(1, len(P) - 2):
            p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            for k in range(sub):
                t = k / sub
                out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
        out.append(pts[-1])
        return out

    half = [anchors[0]] + [clear_point(p) for p in anchors[1:]]
    half = smooth(half)
    half = [half[0]] + [clear_point(p, 0.005) for p in half[1:]]
    full = [Vector((-p.x, p.y, p.z)) for p in half] + list(reversed(half[:-1]))
    strap = _tube(bm, full, 0.0030, sides=4, refs=[Vector((0.0, -1.0, 0.3))] * len(full), phase=math.pi / 4)
    _tag(strap, 5)
    _report_hat("non_la", bm, probe, inner_faces)
    return _finish(
        bm,
        {
            0: ("white", "primary"), 1: ("white", "primary"), 2: ("white", "primary"),
            3: ("white", "primary"), 4: ("white", "accent"), 5: ("white", "accent"),
        },
        shade_lo=0.8,
    )


def build_head_headband_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Thin band around the head, just above the hairline over the hair (~32 mm off the scalp)."""
    bm = bmesh.new()
    n = 18
    z_front = hat_band_z(probe) - 0.006
    pts, ups = [], []
    for i in range(n):
        th = 2.0 * math.pi * i / n
        z = z_front + 0.028 * (0.5 - 0.5 * math.cos(th))
        p = _cranium_ring_point(probe, th, z, 0.032)
        pts.append(p)
    hw, ht = 0.0105, 0.0028
    rings = []
    for i, p in enumerate(pts):
        t = pts[(i + 1) % n] - pts[(i - 1) % n]
        out = Vector((p.x - probe.head_center.x, p.y - probe.head_center.y, 0.0)).normalized()
        up_dir = t.cross(out).normalized()
        if up_dir.z < 0:
            up_dir = -up_dir
        rings.append([
            bm.verts.new(p + up_dir * hw + out * ht),
            bm.verts.new(p + up_dir * hw - out * ht),
            bm.verts.new(p - up_dir * hw - out * ht),
            bm.verts.new(p - up_dir * hw + out * ht),
        ])
    faces = []
    for i in range(n):
        i2 = (i + 1) % n
        for k in range(4):
            k2 = (k + 1) % 4
            faces.append(bm.faces.new((rings[i][k], rings[i][k2], rings[i2][k2], rings[i2][k])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    _tag(faces, 0)
    return _finish(bm, {0: ("white", "primary")}, shade_lo=0.82)


register("head_cap_01", "head", "Head", build_head_cap_01, meta={"hairClip": "crown"})
register("head_beret_01", "head", "Head", build_head_beret_01, meta={"hairClip": "crown"})
register("head_non_la_01", "head", "Head", build_head_non_la_01, meta={"hairClip": "crown"})
register("head_headband_01", "head", "Head", build_head_headband_01)


# ---------------------------------------------------------------------------
# Glasses (same fit as glasses_round_01: bridge on the nose, temples over the ears)
# ---------------------------------------------------------------------------

def _glasses(probe: BodyProbe, outline: list[tuple[float, float]], rim_thick: float, y_depth: float, lens_swatch: str | None = None, temple_hw: float = 0.0026, flick: float = 0.0) -> bmesh.types.BMesh:
    """``outline`` is the LEFT lens boundary as (u, v) around its centre (u = +X outward, v = +Z up)."""
    bm = bmesh.new()
    eye_l, eye_r = probe.eye_l, probe.eye_r
    brow_zmin = min(probe.brow_l.zmin, probe.brow_r.zmin)
    face_front_y = min(eye_l.ymin, eye_r.ymin, probe.brow_l.ymin, probe.brow_r.ymin)
    y_frame = min(face_front_y - 0.009, probe.nose.ymin - 0.001)
    u_in = -min(u for u, _v in outline)
    u_out = max(u for u, _v in outline)
    v_top = max(v for _u, v in outline)
    cz = min(eye_l.cz, brow_zmin - v_top)
    cx_abs = 0.5 * (abs(eye_l.cx) + abs(eye_r.cx))
    cx_abs = max(cx_abs, max(abs(probe.nose.xmin), abs(probe.nose.xmax)) + u_in + 0.002)
    centroid_u = sum(u for u, _v in outline) / len(outline)
    centroid_v = sum(v for _u, v in outline) / len(outline)
    frame_faces, lens_faces = [], []
    for sx in (-1.0, 1.0):
        cx = sx * cx_abs
        pts = [(sx * u, v) for u, v in outline]
        ctr = (sx * centroid_u, centroid_v)

        def at(u, v, y):
            return bm.verts.new(Vector((cx + u, y, cz + v)))
        o_f = [at(u, v, y_frame - 0.5 * y_depth) for u, v in pts]
        o_b = [at(u, v, y_frame + 0.5 * y_depth) for u, v in pts]
        ins = []
        for u, v in pts:
            du, dv = u - ctr[0], v - ctr[1]
            ln = math.hypot(du, dv)
            k = max(0.2, 1.0 - rim_thick / ln)
            ins.append((ctr[0] + du * k, ctr[1] + dv * k))
        i_f = [at(u, v, y_frame - 0.5 * y_depth) for u, v in ins]
        i_b = [at(u, v, y_frame + 0.5 * y_depth) for u, v in ins]
        m = len(pts)
        for a in range(m):
            b = (a + 1) % m
            frame_faces.append(bm.faces.new((o_f[a], o_f[b], i_f[b], i_f[a])))          # front ring
            frame_faces.append(bm.faces.new((o_b[b], o_b[a], i_b[a], i_b[b])))          # back ring
            frame_faces.append(bm.faces.new((o_f[a], o_b[a], o_b[b], o_f[b])))          # outer wall
            frame_faces.append(bm.faces.new((i_f[b], i_b[b], i_b[a], i_f[a])))          # inner wall
        if lens_swatch:
            lv = [bm.verts.new(Vector((cx + u, y_frame, cz + v))) for u, v in ins]
            for a in range(1, m - 1):
                lens_faces.append(bm.faces.new((lv[0], lv[a], lv[a + 1])))
            lens_faces.extend([])
    bmesh.ops.recalc_face_normals(bm, faces=frame_faces)
    # recalc for lens: face the front (-Y)
    for f in lens_faces:
        if f.normal.y > 0:
            f.normal_flip()
    _tag(frame_faces, 0)
    _tag(lens_faces, 1)
    # Bridge over the nose
    inner_x = cx_abs - u_in
    bridge_z = cz + 0.25 * v_top
    bridge_y = min(y_frame, probe.nose.ymin - 0.003)
    hw_b = 0.0030
    b_rings = []
    for bx, by, bz in zip((-inner_x - 0.002, -0.35 * inner_x, 0.35 * inner_x, inner_x + 0.002),
                          (y_frame, bridge_y, bridge_y, y_frame),
                          (bridge_z, bridge_z + 0.004, bridge_z + 0.004, bridge_z)):
        b_rings.append([Vector((bx, by - hw_b, bz - hw_b)), Vector((bx, by + hw_b, bz - hw_b)),
                        Vector((bx, by + hw_b, bz + hw_b)), Vector((bx, by - hw_b, bz + hw_b))])
    _tag(_add_prism_lock(bm, b_rings), 0)
    # Temples
    head_side_x = max(probe.cranium_bounds.xmax, abs(probe.cranium_bounds.xmin))
    for sx in (-1.0, 1.0):
        ear = probe.ear_l if sx > 0 else probe.ear_r
        outer_x = sx * (cx_abs + u_out + 0.35 * rim_thick)
        temple_x = sx * (head_side_x + 0.0075)
        ear_rest_x = sx * max(head_side_x + 0.0065, abs(ear.xmax if sx > 0 else ear.xmin) * 0.96)
        ear_top_z = ear.zmax + 0.001
        arm_z = max(cz + 0.15 * v_top, ear_top_z)
        tip_z = ear.cz - 0.008
        stations = [
            Vector((outer_x, y_frame, cz + 0.15 * v_top + flick)),
            Vector((temple_x, y_frame + 0.012, arm_z)),
            Vector((ear_rest_x, ear.ymin + 0.004, ear_top_z)),
            Vector((ear_rest_x, ear.ymax + 0.004, ear_top_z - 0.003)),
            Vector((ear_rest_x, ear.ymax + 0.011, tip_z)),
        ]
        rings = []
        for idx, pt in enumerate(stations):
            t = 0.7 if idx == len(stations) - 1 else 1.0
            hw = temple_hw
            rings.append([pt + Vector((-sx * hw * t, 0, -hw * t)), pt + Vector((sx * hw * t, 0, -hw * t)),
                          pt + Vector((sx * hw * t, 0, hw * t)), pt + Vector((-sx * hw * t, 0, hw * t))])
        _tag(_add_prism_lock(bm, rings), 0)
    table = {0: ("white", "primary"), 1: (lens_swatch or "white", "none")}
    return _finish(bm, table, shade_lo=0.86)


def build_glasses_square_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Rounded-rectangle frames."""
    hw, hh, c = 0.034, 0.0245, 0.007
    outline = [(-hw + c, -hh), (hw - c, -hh), (hw, -hh + c), (hw, hh - c), (hw - c, hh), (-hw + c, hh), (-hw, hh - c), (-hw, -hh + c)]
    return _glasses(probe, outline, rim_thick=0.0062, y_depth=0.0055)


def build_glasses_cat_eye_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Cat-eye frames with the outer corner swept up."""
    outline = [(-0.031, -0.014), (-0.020, -0.024), (0.004, -0.026), (0.026, -0.016), (0.039, 0.014), (0.034, 0.027), (0.005, 0.021), (-0.026, 0.016)]
    return _glasses(probe, outline, rim_thick=0.0062, y_depth=0.0055, flick=0.004)


def build_glasses_sunglasses_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Chunky wayfarer-style sunglasses with dark lenses."""
    outline = [(-0.034, -0.020), (-0.022, -0.028), (0.022, -0.028), (0.035, -0.016), (0.037, 0.024), (0.030, 0.029), (-0.030, 0.029), (-0.036, 0.022)]
    return _glasses(probe, outline, rim_thick=0.0085, y_depth=0.0075, lens_swatch="plastic_black", temple_hw=0.0034)


register("glasses_square_01", "glasses", "Head", build_glasses_square_01)
register("glasses_cat_eye_01", "glasses", "Head", build_glasses_cat_eye_01)
register("glasses_sunglasses_01", "glasses", "Head", build_glasses_sunglasses_01)
