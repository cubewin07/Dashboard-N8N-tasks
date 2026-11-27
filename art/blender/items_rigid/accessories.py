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


# Neutral chest front profile (min of both bases, measured on the base bodies, x ~ 0): (z, y).
# The probe torso BVH is a growth envelope (about 100 mm further forward at z 1.26), which would
# leave flat neck items floating, so neck items hang off the neutral skin and accept a small clip
# at the Heavy/Chest extremes.
_CHEST_FRONT = ((1.10, -0.100), (1.16, -0.103), (1.20, -0.111), (1.26, -0.120), (1.30, -0.105),
                (1.34, -0.093), (1.38, -0.072), (1.42, -0.053), (1.46, -0.045))


def _front_y(probe: BodyProbe, x: float, z: float) -> float:
    """Most forward neutral chest/neck surface y at height ``z`` (both bases)."""
    pts = _CHEST_FRONT
    if z <= pts[0][0]:
        return pts[0][1]
    for (z0, y0), (z1, y1) in zip(pts, pts[1:]):
        if z <= z1:
            return y0 + (y1 - y0) * (z - z0) / (z1 - z0)
    return pts[-1][1]


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


# ---------------------------------------------------------------------------
# Ears: pairs on both earlobes (probe.ear_l / probe.ear_r)
# ---------------------------------------------------------------------------

def _lobe(probe: BodyProbe, sx: float) -> tuple[Vector, float]:
    """Outer surface point of the earlobe (bottom of the ear) and its outward sign ``sx``."""
    ear = probe.ear_l if sx > 0 else probe.ear_r
    y = 0.5 * (ear.ymin + ear.ymax)
    z = ear.zmin + 0.0065
    best = None
    for dz in (0.0, 0.004, -0.003):
        hit, _n, _i, _d = probe.scalp_bvh.ray_cast(Vector((sx * 0.4, y, z + dz)), Vector((-sx, 0.0, 0.0)), 0.6)
        if hit is not None and (best is None or abs(hit.x) > abs(best.x)):
            best = hit
    if best is None:
        best = Vector((sx * ear.xmax, y, z))
    return Vector((best.x, y, z)), sx


def build_ears_stud_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Round stud on each earlobe."""
    bm = bmesh.new()
    faces = []
    for sx in (-1.0, 1.0):
        lobe, _ = _lobe(probe, sx)
        faces += _bipyramid(bm, lobe + Vector((sx * 0.0022, 0.0, 0.0)), 0.0052, sides=6)
    _tag(faces, 0)
    return _finish(bm, {0: ("white", "primary")}, shade_lo=0.8)


def build_ears_hoop_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Thin hoop hanging from each earlobe (ring in the side plane)."""
    bm = bmesh.new()
    faces = []
    big_r = 0.0135
    for sx in (-1.0, 1.0):
        lobe, _ = _lobe(probe, sx)
        c = lobe + Vector((sx * 0.0030, 0.0, 0.002 - big_r))
        pts, refs = [], []
        for k in range(12):
            a = 2.0 * math.pi * k / 12
            pts.append(c + Vector((0.0, math.sin(a) * big_r, math.cos(a) * big_r)))
            refs.append(Vector((sx, 0.0, 0.0)))
        faces += _tube(bm, pts, 0.0022, sides=4, closed=True, refs=refs, phase=math.pi / 4)
    _tag(faces, 0)
    return _finish(bm, {0: ("white", "primary")}, shade_lo=0.8)


def build_ears_drop_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Stud + short chain + faceted drop gem on each earlobe."""
    bm = bmesh.new()
    metal, gem = [], []
    for sx in (-1.0, 1.0):
        lobe, _ = _lobe(probe, sx)
        top = lobe + Vector((sx * 0.0025, 0.0, 0.0))
        metal += _bipyramid(bm, top, 0.0042, sides=5)
        chain = [top + Vector((sx * 0.0012, 0.0, -0.002)), top + Vector((sx * 0.0020, 0.0, -0.012)), top + Vector((sx * 0.0020, 0.0, -0.020))]
        metal += _tube(bm, chain, 0.0016, sides=4, refs=[Vector((0, -1, 0))] * 3, phase=math.pi / 4)
        gem += _bipyramid(bm, top + Vector((sx * 0.0020, 0.0, -0.0285)), 0.0062, sides=5, squash=1.55)
    _tag(metal, 0)
    _tag(gem, 1)
    return _finish(bm, {0: ("white", "primary"), 1: ("white", "secondary")}, shade_lo=0.8)


register("ears_stud_01", "ears", "Head", build_ears_stud_01)
register("ears_hoop_01", "ears", "Head", build_ears_hoop_01)
register("ears_drop_01", "ears", "Head", build_ears_drop_01)


# ---------------------------------------------------------------------------
# Neck items. Rigid, so they stand off the body for the tops worn over it
# (shirt surfaces are ~17-24 mm off the chest skin, collars up to ~45 mm at the neck base).
# ---------------------------------------------------------------------------

def _front_min(probe: BodyProbe, xs, z: float) -> float:
    return min(_front_y(probe, x, z) for x in xs)


def _smooth(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def _strip_loft(bm, stations: list[tuple[float, float, float, float]], thick: float) -> list:
    """Closed flat strip. ``stations = [(x_centre, z, half_width, y_back)]`` top -> bottom; front face = y_back - thick."""
    rings = []
    for xc, z, hw, yb in stations:
        rings.append([
            Vector((xc - hw, yb - thick, z)), Vector((xc + hw, yb - thick, z)),
            Vector((xc + hw, yb, z)), Vector((xc - hw, yb, z)),
        ])
    faces = _add_prism_lock(bm, rings)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def build_neck_necklace_pearl_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Single strand of pearls resting on the collar bones, thin cord round the back."""
    bm = bmesh.new()
    r_pearl = 0.0108
    n = 18
    pts, dirs = [], []
    for k in range(n):
        th = 2.0 * math.pi * k / n
        c = math.cos(th)
        fw = (0.5 + 0.5 * c) ** 1.4
        z = 1.428 * (1.0 - fw) + 1.368 * fw
        surf, _nrm = _surface_radius(probe, z, th)
        r_s = math.hypot(surf.x, surf.y)
        d = Vector((math.sin(th), -math.cos(th), 0.0))
        r_front = -_front_y(probe, 0.0, z) + 0.026
        R = (1.0 - fw) * (r_s + 0.021) + fw * r_front
        pts.append(Vector((d.x * R, d.y * R, z)))
        dirs.append(d)
    cord = _tube(bm, pts, 0.0016, sides=3, closed=True, refs=dirs, phase=math.pi / 2)
    _tag(cord, 1)
    # Pearls spaced evenly along the front arc (from -112 deg to +112 deg)
    def arc_point(angle_deg: float) -> Vector:
        th = math.radians(angle_deg)
        t = (th % (2 * math.pi)) / (2 * math.pi) * n
        i0 = int(t) % n
        i1 = (i0 + 1) % n
        f = t - int(t)
        return pts[i0] * (1 - f) + pts[i1] * f
    pearls = []
    count = 11
    for k in range(count):
        a = -112.0 + 224.0 * k / (count - 1)
        pearls += _bead(bm, arc_point(a), r_pearl)
    _tag(pearls, 0)
    return _finish(bm, {0: ("white", "primary"), 1: ("white", "primary")}, shade_lo=0.82)


def build_neck_scarf_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Scarf wound round the neck with a loose knot and two ends hanging down the front."""
    bm = bmesh.new()
    n = 14
    z_c = 1.422
    pts, dirs = [], []
    for k in range(n):
        th = 2.0 * math.pi * k / n
        surf, _nrm = _surface_radius(probe, z_c, th)
        r_s = math.hypot(surf.x, surf.y)
        # slightly higher at the back so it tucks behind the jaw, lower at the front
        z = z_c + 0.004 * (1.0 - math.cos(th)) * 0.5 - 0.003
        d = Vector((math.sin(th), -math.cos(th), 0.0))
        R = r_s + 0.0205
        pts.append(Vector((d.x * R, d.y * R, z)))
        dirs.append(Vector((0.0, 0.0, 1.0)))
    wrap = _tube(bm, pts, 0.0158, sides=6, closed=True, refs=dirs, phase=0.0)
    _tag(wrap, 0)
    # Knot at the front-left of the neck
    kx = 0.034
    ky = _front_min(probe, (kx - 0.012, kx, kx + 0.012), 1.40) - 0.036
    ky = min(ky, pts[0].y - 0.002)
    ax, ay, az = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    knot = _box(bm, Vector((kx, ky - 0.004, 1.405)), ax, ay, az, 0.019, 0.011, 0.016, taper_top=0.92)
    _tag(knot, 0)
    # Two ends hanging down the chest (long and short), staying >= 30 mm off the chest
    ends = [(kx + 0.003, 0.150, 0.0195, 0.0), (kx - 0.020, 0.105, 0.0175, 0.0)]
    stripe = []
    for ex, length, hw, _d in ends:
        z_top = 1.398
        zs = [z_top - length * f for f in (0.0, 0.33, 0.66, 1.0)]
        st = []
        for i, z in enumerate(zs):
            xs = (ex - hw, ex, ex + hw)
            yb = _front_min(probe, xs, z) - (0.031 + 0.002 * i)
            st.append((ex - 0.006 * i * (1 if ex > 0.03 else -1), z, hw * (1.0 + 0.12 * i), yb))
        end_faces = _strip_loft(bm, st, 0.011)
        _tag(end_faces, 0)
        # accent stripe band near the tip: re-tag faces whose centre z falls in the last quarter
        for f in end_faces:
            zc = f.calc_center_median().z
            if z_top - length * 0.80 < zc < z_top - length * 0.62:
                stripe.append(f)
    _tag(stripe, 1)
    return _finish(bm, {0: ("white", "primary"), 1: ("white", "accent")}, shade_lo=0.8)


def _neck_band(bm, probe: BodyProbe, z: float, off: float = 0.0125) -> list:
    """Thin loop round the bare neck (the tie / bow tie sits on it, hidden by collars)."""
    n = 14
    pts, dirs = [], []
    for k in range(n):
        th = 2.0 * math.pi * k / n
        surf, _nrm = _surface_radius(probe, z, th)
        r_s = math.hypot(surf.x, surf.y)
        d = Vector((math.sin(th), -math.cos(th), 0.0))
        pts.append(Vector((d.x * (r_s + off), d.y * (r_s + off), z)))
        dirs.append(Vector((0, 0, 1)))
    return _tube(bm, pts, 0.0034, sides=3, closed=True, refs=dirs, phase=math.pi / 2)


def build_neck_tie_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Necktie: knot at the collar, blade down the chest standing >= 30 mm off the chest."""
    bm = bmesh.new()
    xs0 = (-0.016, 0.0, 0.016)
    knot_back = _front_min(probe, xs0, 1.40) - 0.036
    knot_st = [(0.0, 1.421, 0.0105, knot_back), (0.0, 1.402, 0.0165, knot_back), (0.0, 1.384, 0.0120, knot_back)]
    knot = _strip_loft(bm, knot_st, 0.0155)
    _tag(knot, 0)
    # Blade
    stations = [(1.381, 0.0085), (1.352, 0.0135), (1.312, 0.0195), (1.262, 0.0225), (1.205, 0.0245), (1.160, 0.0100)]
    st = []
    for i, (z, hw) in enumerate(stations):
        xs = (-hw, 0.0, hw)
        yb = _front_min(probe, xs, z) - (0.0345 - 0.0 if i == 0 else 0.0305 + 0.0008 * i)
        yb = min(yb, knot_back + (0.0 if i == 0 else -0.0))
        st.append((0.0, z, hw, yb))
    blade = _strip_loft(bm, st, 0.0085)
    _tag(blade, 0)
    # Accent stripes across the blade (re-tag faces by height)
    stripe = []
    for f in blade:
        zc = f.calc_center_median().z
        if 1.272 < zc < 1.292 or 1.228 < zc < 1.246:
            if f.normal.y < -0.5:
                stripe.append(f)
    _tag(stripe, 1)
    band = _neck_band(bm, probe, 1.414)
    _tag(band, 0)
    return _finish(bm, {0: ("white", "primary"), 1: ("white", "accent")}, shade_lo=0.8)


def build_neck_bow_tie_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Bow tie: centre knot and two flared wings wrapped round the collar."""
    bm = bmesh.new()
    zc = 1.408
    off = 0.037
    surf0, _n = _surface_radius(probe, zc, 0.0)
    r0 = math.hypot(surf0.x, surf0.y) + off
    # knot
    ax, ay, az = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    knot = _box(bm, Vector((0.0, -(r0 + 0.002), zc)), ax, ay, az, 0.0095, 0.0085, 0.0105)
    _tag(knot, 1)
    wings = []
    for sx in (-1.0, 1.0):
        rings = []
        for phi_deg, hh in ((4.0, 0.0085), (14.0, 0.0140), (26.0, 0.0195), (38.0, 0.0215)):
            ph = math.radians(phi_deg) * sx
            surf, _nn = _surface_radius(probe, zc, ph)
            R = math.hypot(surf.x, surf.y) + off
            d = Vector((math.sin(ph), -math.cos(ph), 0.0))
            c = Vector((d.x * R, d.y * R, zc))
            rt = 0.0075
            rings.append([c + d * (-rt) + Vector((0, 0, hh)), c + d * rt + Vector((0, 0, hh)),
                          c + d * rt + Vector((0, 0, -hh)), c + d * (-rt) + Vector((0, 0, -hh))])
        wings += _add_prism_lock(bm, rings)
    bmesh.ops.recalc_face_normals(bm, faces=wings)
    _tag(wings, 0)
    band = _neck_band(bm, probe, 1.414)
    _tag(band, 0)
    return _finish(bm, {0: ("white", "primary"), 1: ("white", "accent")}, shade_lo=0.8)


def build_neck_lanyard_badge_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Staff badge on a cord: white card, jade header stripe, photo square and two text bars (no text)."""
    bm = bmesh.new()
    ax = Vector((1, 0, 0))
    # --- cord: round the back of the neck, over the collar, down to a V on the chest
    z_clip = 1.292
    pts, refs = [], []
    for deg, z, off in ((180, 1.427, 0.016), (150, 1.427, 0.017), (122, 1.424, 0.030), (100, 1.414, 0.044), (80, 1.400, 0.048)):
        th = math.radians(deg)
        surf, _nrm = _surface_radius(probe, z, th)
        r_s = math.hypot(surf.x, surf.y)
        d = Vector((math.sin(th), -math.cos(th), 0.0))
        pts.append(Vector((d.x * (r_s + off), d.y * (r_s + off), z)))
    right_half = [Vector((-p.x, p.y, p.z)) for p in reversed(pts[1:])]
    left_back = pts  # starts at the centre back (x = 0) going to the left shoulder
    # left side V: from shoulder (80 deg) to the clip
    sh = pts[-1]
    v_left = []
    for t in (0.2, 0.4, 0.6, 0.8, 1.0):
        x = sh.x * (1.0 - t)
        z = sh.z + (z_clip - sh.z) * t
        y = _front_min(probe, (x - 0.004, x, x + 0.004), z) - 0.032
        y = min(y, sh.y + (0.0 if t < 0.5 else 0.0))
        v_left.append(Vector((x, y, z)))
    path = right_half + left_back + v_left + [Vector((-p.x, p.y, p.z)) for p in reversed(v_left[:-1])]
    # path: right shoulder->back(centre)->left shoulder->clip->right ... close back to the right shoulder
    cord = _tube(bm, path, 0.0021, sides=4, closed=True, refs=[Vector((0.0, -1.0, 0.0))] * len(path), phase=math.pi / 4)
    _tag(cord, 0)
    # --- card hanging below the clip, tilted to follow the chest slope
    z_top, z_bot = z_clip - 0.008, z_clip - 0.083
    def plane_y(z: float) -> float:
        return _front_min(probe, (-0.027, 0.0, 0.027), z) - 0.031
    y_top, y_bot = plane_y(z_top), plane_y(z_bot)
    # make the whole card clear the chest: shift back-plane until every sampled z clears
    shift = 0.0
    for i in range(7):
        z = z_top + (z_bot - z_top) * i / 6.0
        y_lin = y_top + (y_bot - y_top) * i / 6.0
        shift = min(shift, plane_y(z) - y_lin)
    y_top += shift
    y_bot += shift
    up = Vector((0.0, y_top - y_bot, z_top - z_bot)).normalized()
    nrm = Vector((0.0, -up.z, up.y))  # towards the front (-Y)
    mid = Vector((0.0, 0.5 * (y_top + y_bot), 0.5 * (z_top + z_bot)))
    card_c = mid + nrm * 0.0020
    th_c = 0.0020
    card = _box(bm, card_c, ax, nrm, up, 0.0275, th_c, 0.0375)
    _tag(card, 1)
    front = card_c + nrm * (th_c + 0.0006)

    def block(cx: float, cu: float, hx: float, hu: float, tag: int, h: float = 0.0006) -> None:
        c = front + ax * cx + up * cu + nrm * h
        _tag(_box(bm, c, ax, nrm, up, hx, h, hu), tag)

    block(0.0, 0.0375 - 0.0085, 0.0275, 0.0085, 2)         # jade header stripe
    block(-0.0105, -0.004, 0.0095, 0.0105, 3)               # photo square
    block(0.0115, 0.002, 0.0105, 0.0030, 4)                 # text bar 1
    block(0.0095, -0.0085, 0.0085, 0.0030, 4)               # text bar 2
    block(0.0, -0.0285, 0.0200, 0.0028, 4)                  # bottom strip
    # clip (dark tab joining the cord to the card)
    clip_c = Vector((0.0, y_top - 0.0005, z_top + 0.006)) + nrm * 0.0015
    _tag(_box(bm, clip_c, ax, nrm, up, 0.0085, 0.0030, 0.0075), 5)
    table = {
        0: ("white", "primary"), 1: ("white", "none"), 2: ("jade_500", "none"),
        3: ("c_sky", "none"), 4: ("c_grey", "none"), 5: ("c_charcoal", "none"),
    }
    return _finish(bm, table, shade_lo=0.86)


register("neck_necklace_pearl_01", "neck", "Neck", build_neck_necklace_pearl_01)
register("neck_scarf_01", "neck", "Neck", build_neck_scarf_01)
register("neck_tie_01", "neck", "Neck", build_neck_tie_01)
register("neck_bow_tie_01", "neck", "Neck", build_neck_bow_tie_01)
register("neck_lanyard_badge_01", "neck", "Spine2", build_neck_lanyard_badge_01)


# ---------------------------------------------------------------------------
# Wrist items on the left forearm (bone LeftForeArm, A-pose 45 deg down).
# Axis: A + d * t with A = (0.5, 0, 1.02), d = (1, 0, -1) / sqrt 2; wrist ring at t = 0, hand from t >= 0.04.
# Forearm radius at t = -0.015 is ~37.5 mm neutral, ~40 mm with Heavy + Muscle.
# ---------------------------------------------------------------------------

_ARM_A = Vector((0.5, 0.0, 1.02))
_ARM_D = Vector((1.0, 0.0, -1.0)).normalized()
_ARM_U1 = Vector((0.0, 1.0, 0.0))
_ARM_U2 = Vector((1.0, 0.0, 1.0)).normalized()  # up and out, perpendicular to the axis
_WRIST_T = -0.016
_WRIST_R_IN = 0.0425


def _arm_dir(phi: float) -> Vector:
    """Unit radial direction at angle ``phi`` (0 = up/out, +ve towards the front, -Y)."""
    return _ARM_U2 * math.cos(phi) - _ARM_U1 * math.sin(phi)


def _wrist_band(bm, t: float, r_in: float, thick: float, half_w: float, n: int = 14) -> list:
    rings = []
    for k in range(n):
        phi = 2.0 * math.pi * k / n
        rd = _arm_dir(phi)
        c = _ARM_A + _ARM_D * t
        rings.append([
            c + rd * r_in + _ARM_D * (-half_w), c + rd * r_in + _ARM_D * half_w,
            c + rd * (r_in + thick) + _ARM_D * half_w, c + rd * (r_in + thick) + _ARM_D * (-half_w),
        ])
    vr = [[bm.verts.new(v) for v in ring] for ring in rings]
    faces = []
    for k in range(n):
        a, b = vr[k], vr[(k + 1) % n]
        for i in range(4):
            j = (i + 1) % 4
            faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def _cyl(bm, c: Vector, axis: Vector, r: float, half_h: float, sides: int = 8, r_top: float | None = None) -> list:
    axis = axis.normalized()
    u, v = _orth_frame(axis, _ARM_D if abs(axis.dot(_ARM_D)) < 0.9 else _ARM_U1)
    r_top = r if r_top is None else r_top
    lo, hi = [], []
    for k in range(sides):
        a = 2.0 * math.pi * k / sides
        d = u * math.cos(a) + v * math.sin(a)
        lo.append(bm.verts.new(c - axis * half_h + d * r))
        hi.append(bm.verts.new(c + axis * half_h + d * r_top))
    faces = []
    for k in range(sides):
        j = (k + 1) % sides
        faces.append(bm.faces.new((lo[k], lo[j], hi[j], hi[k])))
    faces.append(bm.faces.new(list(reversed(lo))))
    faces.append(bm.faces.new(hi))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def build_wrist_watch_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Wristwatch: leather strap (secondary), metal case (primary) with a light dial and two hands."""
    bm = bmesh.new()
    phi0 = math.radians(-28.0)  # dial on the back of the wrist, turned a little to the front
    strap = _wrist_band(bm, _WRIST_T, _WRIST_R_IN, 0.0040, 0.0105, n=14)
    _tag(strap, 1)
    rd = _arm_dir(phi0)
    c_case = _ARM_A + _ARM_D * _WRIST_T + rd * (_WRIST_R_IN + 0.0040 + 0.0040)
    case = _cyl(bm, c_case, rd, 0.0165, 0.0040, sides=10)
    _tag(case, 0)
    c_dial = c_case + rd * 0.0044
    dial = _cyl(bm, c_dial, rd, 0.0125, 0.0006, sides=10)
    _tag(dial, 2)
    # hands: two thin bars from the centre
    up = _ARM_D
    side = rd.cross(up).normalized()
    hands = []
    hands += _box(bm, c_dial + rd * 0.0010 + up * 0.0035, side, rd, up, 0.0008, 0.0005, 0.0045)
    hands += _box(bm, c_dial + rd * 0.0010 + side * 0.0030, side, rd, up, 0.0035, 0.0005, 0.0008)
    _tag(hands, 3)
    table = {0: ("white", "primary"), 1: ("white", "secondary"), 2: ("c_white", "none"), 3: ("c_charcoal", "none")}
    return _finish(bm, table, shade_lo=0.82)


def build_wrist_bracelet_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Thin metal bangle plus a small round charm."""
    bm = bmesh.new()
    band = _wrist_band(bm, _WRIST_T, _WRIST_R_IN, 0.0030, 0.0045, n=14)
    _tag(band, 0)
    rd = _arm_dir(math.radians(-28.0))
    c = _ARM_A + _ARM_D * _WRIST_T + rd * (_WRIST_R_IN + 0.0030 + 0.0045)
    _tag(_cyl(bm, c, rd, 0.0070, 0.0030, sides=8), 0)
    return _finish(bm, {0: ("white", "primary")}, shade_lo=0.82)


def build_wrist_beads_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Stretch bracelet of 18 beads alternating two colours."""
    bm = bmesh.new()
    n = 18
    r_b = 0.0074
    ring_r = _WRIST_R_IN + r_b * 0.95
    pri, sec = [], []
    c0 = _ARM_A + _ARM_D * _WRIST_T
    for k in range(n):
        phi = 2.0 * math.pi * k / n
        c = c0 + _arm_dir(phi) * ring_r
        (pri if k % 2 == 0 else sec).extend(_bipyramid(bm, c, r_b, sides=5))
    _tag(pri, 0)
    _tag(sec, 1)
    return _finish(bm, {0: ("white", "primary"), 1: ("white", "secondary")}, shade_lo=0.82)


register("wrist_watch_01", "wrist", "LeftForeArm", build_wrist_watch_01)
register("wrist_bracelet_01", "wrist", "LeftForeArm", build_wrist_bracelet_01)
register("wrist_beads_01", "wrist", "LeftForeArm", build_wrist_beads_01)
