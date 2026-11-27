"""B1 hair batch (P08a-T03): 10 rigid hair styles on ``Head`` (14 with the P07a starters).

Every style is authored in rest-pose character space from the body probe (head identical on both
bases), painted on ``hair_black`` / ``hair_black_hi`` with the shade in ``COLOR_0`` alpha (no tint).

Building blocks (all local to this module so the shared libs stay untouched):
- ``_cap``: closed double-walled dome (``_make_closed_cap_shell``) from ring callbacks.
- ``_slab``: closed double-walled patch over a (rows x cols) grid of scalp directions; the
  ``_xdir(a, b)`` frame (a: front -> top -> back around the X axis, b: latitude towards +X) suits
  front-to-back flows (side part, quiff, fringe).
- ``_tube`` (ponytails), ``_blob`` (curls, buns) and ``_tuft`` (textured crop spikes).

Hat band rule (CHARACTER-PIPELINE §5): hair that survives the hatcut (faces reaching below
``hat_band_z + HATCUT_ABOVE_BAND_M``) must stay within 30 mm of the scalp from the band up. Pieces
are placed so they are either wholly above the cut line (dropped under hats), wholly below the band,
or flat enough there; ``_band_env`` caps cap/slab offsets near the band and ``_band_squash`` is a
final safety net that pulls any leftover vertex in to 28.5 mm.
"""

from __future__ import annotations

import math

import bmesh
from mathutils import Vector

from lib import charexport
from lib.rigid_common import (  # noqa: F401
    HATCUT_ABOVE_BAND_M,
    BodyProbe,
    _add_prism_lock,
    _cranium_ray_surface,
    _cranium_ring_point,
    _dir_from_theta_phi,
    _make_closed_cap_shell,
    _paint_hair_faces,
    _signed_scalp_dist,
    _torso_surface_point,
    _weld_doubles,
    enforce_scalp_clearance,
    hat_band_z,
)
from items_rigid import register

BAND_MAX_M = 0.0265
"""Design target for hair offset in the hat-band zone (contract max is 30 mm)."""


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def _xdir(a_deg: float, b_deg: float) -> Vector:
    """Direction in the X-axis frame: a=0 front (-Y), 90 top (+Z), 180 back (+Y); b>0 towards +X."""
    a = math.radians(a_deg)
    b = math.radians(b_deg)
    cb = math.cos(b)
    return Vector((math.sin(b), -cb * math.cos(a), cb * math.sin(a)))


def _surf(probe: BodyProbe, d: Vector) -> tuple[Vector, Vector]:
    return _cranium_ray_surface(probe, d)


def _sph(probe: BodyProbe, th: float, phi_deg: float, off: float) -> Vector:
    p, n = _cranium_ray_surface(probe, _dir_from_theta_phi(th, math.radians(phi_deg)))
    return p + n * off


def _a_for_z(probe: BodyProbe, b_deg: float, z_target: float) -> float:
    """Smallest a (deg, 0..90) whose scalp point in the X frame reaches ``z_target`` (90 if never)."""
    lo, hi = 0.0, 90.0
    if _surf(probe, _xdir(hi, b_deg))[0].z < z_target:
        return 90.0
    for _ in range(24):
        mid = 0.5 * (lo + hi)
        if _surf(probe, _xdir(mid, b_deg))[0].z < z_target:
            lo = mid
        else:
            hi = mid
    return hi


def _cut_z(probe: BodyProbe) -> float:
    return hat_band_z(probe) + HATCUT_ABOVE_BAND_M


def _band_env(probe: BodyProbe, z: float, off: float, ramp_start: float = 0.018, ramp_m: float = 0.030) -> float:
    """Cap an outer offset near the hat band: <= BAND_MAX_M up to cut + ramp_start, then ramps open."""
    z0 = _cut_z(probe) + ramp_start
    if z <= z0:
        return min(off, BAND_MAX_M)
    return min(off, BAND_MAX_M + (z - z0) / ramp_m * 0.020)


def _cap(probe: BodyProbe, n: int, ring_fns, crown_out: float, crown_in: float = 0.0055, theta0: float = 0.0):
    """Closed dome from ring callbacks ``fn(th) -> (outer_pt, inner_pt)`` listed top to bottom."""
    thetas = [theta0 + 2.0 * math.pi * i / n for i in range(n)]
    rings_out, rings_in = [], []
    for fn in ring_fns:
        pts = [fn(th) for th in thetas]
        rings_out.append([p[0] for p in pts])
        rings_in.append([p[1] for p in pts])
    p_top, n_top = _cranium_ray_surface(probe, Vector((0.0, 0.0, 1.0)))
    bm, _top = _make_closed_cap_shell(probe, rings_out, rings_in, p_top + n_top * crown_out, p_top + n_top * crown_in)
    return bm


def _slab(bm: bmesh.types.BMesh, probe: BodyProbe, dirs: list[list[Vector]], off_fn) -> list[bmesh.types.BMFace]:
    """Closed double-walled patch: ``off_fn(i, j, hit, normal) -> (off_out, off_in)`` per grid point."""
    rows, cols = len(dirs), len(dirs[0])
    O: list[list[bmesh.types.BMVert]] = []
    I: list[list[bmesh.types.BMVert]] = []
    for i in range(rows):
        ro, ri = [], []
        for j in range(cols):
            hit, nrm = _surf(probe, dirs[i][j])
            oo, oi = off_fn(i, j, hit, nrm)
            ro.append(bm.verts.new(hit + nrm * oo))
            ri.append(bm.verts.new(hit + nrm * oi))
        O.append(ro)
        I.append(ri)
    faces = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            faces.append(bm.faces.new((O[i][j], O[i][j + 1], O[i + 1][j + 1], O[i + 1][j])))
            faces.append(bm.faces.new((I[i + 1][j], I[i + 1][j + 1], I[i][j + 1], I[i][j])))
    for i in range(rows - 1):
        faces.append(bm.faces.new((O[i + 1][0], I[i + 1][0], I[i][0], O[i][0])))
        faces.append(bm.faces.new((O[i][-1], I[i][-1], I[i + 1][-1], O[i + 1][-1])))
    for j in range(cols - 1):
        faces.append(bm.faces.new((O[0][j], I[0][j], I[0][j + 1], O[0][j + 1])))
        faces.append(bm.faces.new((O[-1][j + 1], I[-1][j + 1], I[-1][j], O[-1][j])))
    return faces


def _grid_slab(bm: bmesh.types.BMesh, O_pts: list[list[Vector]], I_pts: list[list[Vector]]) -> None:
    """Closed double-walled patch from explicit outer / inner point grids (rows x cols)."""
    O = [[bm.verts.new(p) for p in row] for row in O_pts]
    I = [[bm.verts.new(p) for p in row] for row in I_pts]
    rows, cols = len(O), len(O[0])
    for i in range(rows - 1):
        for j in range(cols - 1):
            bm.faces.new((O[i][j], O[i][j + 1], O[i + 1][j + 1], O[i + 1][j]))
            bm.faces.new((I[i + 1][j], I[i + 1][j + 1], I[i][j + 1], I[i][j]))
    for i in range(rows - 1):
        bm.faces.new((O[i + 1][0], I[i + 1][0], I[i][0], O[i][0]))
        bm.faces.new((O[i][-1], I[i][-1], I[i + 1][-1], O[i + 1][-1]))
    for j in range(cols - 1):
        bm.faces.new((O[0][j], I[0][j], I[0][j + 1], O[0][j + 1]))
        bm.faces.new((O[-1][j + 1], I[-1][j + 1], I[-1][j], O[-1][j]))


def _drape(bm: bmesh.types.BMesh, probe: BodyProbe, thetas: list[float], nlev: int, pt_fn) -> None:
    """Open curtain (front-left round the back to front-right) with a crown fan: ``pt_fn(th, k, j, inner)``."""
    O = [[bm.verts.new(pt_fn(th, k, j, False)) for j, th in enumerate(thetas)] for k in range(nlev)]
    I = [[bm.verts.new(pt_fn(th, k, j, True)) for j, th in enumerate(thetas)] for k in range(nlev)]
    cols = len(thetas)
    hc = probe.head_center
    c_out = bm.verts.new(Vector((0.0, hc.y + 0.004, sum(v.co.z for v in O[0]) / cols + 0.004)))
    c_in = bm.verts.new(Vector((0.0, hc.y + 0.004, sum(v.co.z for v in I[0]) / cols + 0.0025)))
    for r0, r1 in zip(O, O[1:]):
        for j in range(cols - 1):
            bm.faces.new((r1[j], r1[j + 1], r0[j + 1], r0[j]))
    for r0, r1 in zip(I, I[1:]):
        for j in range(cols - 1):
            bm.faces.new((r0[j], r0[j + 1], r1[j + 1], r1[j]))
    for j in range(cols - 1):
        bm.faces.new((I[-1][j], I[-1][j + 1], O[-1][j + 1], O[-1][j]))
        bm.faces.new((O[0][j], O[0][j + 1], c_out))
        bm.faces.new((c_in, I[0][j + 1], I[0][j]))
    for k in range(nlev - 1):
        bm.faces.new((I[k][0], I[k + 1][0], O[k + 1][0], O[k][0]))
        bm.faces.new((O[k][-1], O[k + 1][-1], I[k + 1][-1], I[k][-1]))
    # Close the front gap of the crown between the two curtain ends
    bm.faces.new((O[0][-1], O[0][0], c_out))
    bm.faces.new((c_in, I[0][0], I[0][-1]))
    bm.faces.new((O[0][0], O[0][-1], I[0][-1], I[0][0]))


def _frame(t: Vector, ref: Vector) -> tuple[Vector, Vector]:
    u = ref - t * ref.dot(t)
    if u.length < 1e-6:
        u = Vector((0.0, 0.0, 1.0)) - t * t.z
    u.normalize()
    return u, t.cross(u).normalized()


def _tube(bm: bmesh.types.BMesh, path: list[Vector], radii: list, seg: int = 6, ref: Vector = Vector((1.0, 0.0, 0.0)),
          phase: float = 0.0) -> list[bmesh.types.BMFace]:
    """Closed lofted tube along ``path``; radii are floats or (r_ref, r_other). Radius 0 = point tip."""
    rings: list = []
    last = len(path) - 1
    for k, p in enumerate(path):
        t = (path[min(k + 1, last)] - path[max(k - 1, 0)]).normalized()
        u, v = _frame(t, ref)
        r = radii[k]
        ru, rv = (r, r) if isinstance(r, (int, float)) else r
        if ru < 1e-5:
            rings.append(bm.verts.new(p))
            continue
        ring = []
        for s in range(seg):
            ang = phase + 2.0 * math.pi * s / seg
            ring.append(bm.verts.new(p + u * (ru * math.cos(ang)) + v * (rv * math.sin(ang))))
        rings.append(ring)
    faces = []
    if isinstance(rings[0], list):
        faces.append(bm.faces.new(tuple(reversed(rings[0]))))
    for r0, r1 in zip(rings, rings[1:]):
        if isinstance(r0, list) and isinstance(r1, list):
            for s in range(seg):
                s2 = (s + 1) % seg
                faces.append(bm.faces.new((r0[s], r0[s2], r1[s2], r1[s])))
        elif isinstance(r0, list):
            for s in range(seg):
                faces.append(bm.faces.new((r0[s], r0[(s + 1) % seg], r1)))
        else:
            for s in range(seg):
                faces.append(bm.faces.new((r0, r1[(s + 1) % seg], r1[s])))
    if isinstance(rings[-1], list):
        faces.append(bm.faces.new(tuple(rings[-1])))
    return faces


def _lathe(bm: bmesh.types.BMesh, center: Vector, axis: Vector, profile: list[tuple[float, float]], seg: int,
           ref: Vector = Vector((1.0, 0.0, 0.0)), phase: float = 0.0, squash: float = 1.0) -> list[bmesh.types.BMVert]:
    """Closed lathe around ``axis``: profile [(axial, radius)] bottom to top, end caps become tips."""
    u, v = _frame(axis.normalized(), ref)
    a = axis.normalized()
    verts: list[bmesh.types.BMVert] = []
    rings = []
    for z, r in profile:
        if r < 1e-5:
            vt = bm.verts.new(center + a * z)
            verts.append(vt)
            rings.append(vt)
            continue
        ring = []
        for s in range(seg):
            ang = phase + 2.0 * math.pi * s / seg
            vt = bm.verts.new(center + a * z + u * (r * math.cos(ang)) + v * (r * squash * math.sin(ang)))
            ring.append(vt)
            verts.append(vt)
        rings.append(ring)
    if isinstance(rings[0], list):
        bm.faces.new(tuple(reversed(rings[0])))
    for r0, r1 in zip(rings, rings[1:]):
        if isinstance(r0, list) and isinstance(r1, list):
            for s in range(seg):
                s2 = (s + 1) % seg
                bm.faces.new((r0[s], r0[s2], r1[s2], r1[s]))
        elif isinstance(r0, list):
            for s in range(seg):
                bm.faces.new((r0[s], r0[(s + 1) % seg], r1))
        else:
            for s in range(seg):
                bm.faces.new((r0, r1[(s + 1) % seg], r1[s]))
    if isinstance(rings[-1], list):
        bm.faces.new(tuple(rings[-1]))
    return verts


def _blob(bm, center: Vector, axis: Vector, r_lat: float, r_ax: float, seg: int = 6, phase: float = 0.0, ref=None):
    """Chunky faceted lobe (two rings + tips): 4*seg tris."""
    prof = [(-r_ax, 0.0), (-0.35 * r_ax, 0.92 * r_lat), (0.38 * r_ax, 0.86 * r_lat), (r_ax, 0.0)]
    return _lathe(bm, center, axis, prof, seg, ref=ref or Vector((0.3, 0.2, 0.93)), phase=phase)


def _piece_band_ok(probe: BodyProbe, verts) -> bool:
    """A closed piece passes the hat band if it is wholly above the cut, wholly below the band, or flat there."""
    band = hat_band_z(probe)
    cut = _cut_z(probe)
    zs = [v.co.z for v in verts]
    if min(zs) > cut + 0.0005 or max(zs) < band:
        return True
    return all(_signed_scalp_dist(probe, v.co)[0] <= BAND_MAX_M + 0.002 for v in verts if v.co.z >= band)


def _band_squash(bm: bmesh.types.BMesh, probe: BodyProbe, max_m: float = 0.0285) -> int:
    """Safety net: pull hatcut-surviving vertices above the band in (horizontally) to ``max_m``."""
    band = hat_band_z(probe)
    cut = _cut_z(probe)
    hc = probe.head_center
    moved = 0
    for _ in range(3):
        bad = set()
        for f in bm.faces:
            if min(v.co.z for v in f.verts) > cut:
                continue
            for v in f.verts:
                if v.co.z >= band and _signed_scalp_dist(probe, v.co)[0] > max_m:
                    bad.add(v)
        if not bad:
            break
        for v in bad:
            axis_pt = Vector((0.0, hc.y, v.co.z))
            lo, hi = 0.0, 1.0
            p0 = v.co.copy()
            for _ in range(20):
                mid = 0.5 * (lo + hi)
                if _signed_scalp_dist(probe, p0.lerp(axis_pt, mid))[0] > max_m - 0.0008:
                    lo = mid
                else:
                    hi = mid
            v.co = p0.lerp(axis_pt, lo)
            moved += 1
    return moved


def _torso_clear_mm(bm: bmesh.types.BMesh, probe: BodyProbe) -> float:
    """Smallest signed distance (mm) of hair vertices / face centres below the jaw to both torsos."""
    pts = [v.co for v in bm.verts] + [f.calc_center_median() for f in bm.faces]
    pts = [p for p in pts if p.z < probe.cranium_bounds.zmin + 0.03]
    best = 999.0
    for bvh in (probe.torso_bvh, probe.male_torso_bvh):
        for p in pts:
            loc, nrm, _i, dist = bvh.find_nearest(p)
            if loc is None:
                continue
            sd = dist if (p - loc).dot(nrm) >= 0 else -dist
            best = min(best, sd * 1000.0)
    return best


def _tag(bm: bmesh.types.BMesh, faces, value: int) -> None:
    """Tag faces with a part id (survives triangulation; removed before export)."""
    lay = bm.faces.layers.int.get("hpart") or bm.faces.layers.int.new("hpart")
    for f in faces:
        f[lay] = value


def _part(bm: bmesh.types.BMesh, f) -> int:
    lay = bm.faces.layers.int.get("hpart")
    return f[lay] if lay is not None else 0


def _finish(item_id: str, bm: bmesh.types.BMesh, probe: BodyProbe, hi_pred, *, shade_lo: float = 0.76,
            dark_pred=None, dark: float = 0.82, min_clear: float = 0.0045) -> bmesh.types.BMesh:
    """Triangulate, keep scalp clearance, enforce the hat band, paint, and print a diagnostic line."""
    _weld_doubles(bm, 1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    enforce_scalp_clearance(bm, probe, min_clear_m=min_clear)
    squashed = _band_squash(bm, probe)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    _paint_hair_faces(bm, probe, hi_pred, shade_lo=shade_lo)
    if dark_pred is not None:
        col = charexport.ensure_color_layer(bm)
        for f in bm.faces:
            if dark_pred(f, f.calc_center_median()):
                for lp in f.loops:
                    c = lp[col]
                    lp[col] = (c[0], c[1], c[2], max(0.6, c[3] * dark))
    lay = bm.faces.layers.int.get("hpart")
    if lay is not None:
        bm.faces.layers.int.remove(lay)
    pts = [v.co for v in bm.verts] + [0.5 * (e.verts[0].co + e.verts[1].co) for e in bm.edges] + [f.calc_center_median() for f in bm.faces]
    worst = min(pts, key=lambda p: _signed_scalp_dist(probe, p)[0])
    wd = _signed_scalp_dist(probe, worst)[0] * 1000.0
    print(f"DIAG {item_id} squashed={squashed} torsoClearMm={_torso_clear_mm(bm, probe):.1f} "
          f"minScalp={wd:.2f}@({worst.x:.3f},{worst.y:.3f},{worst.z:.3f})")
    return bm


def _probe_marks(probe: BodyProbe) -> dict:
    hb = probe.cranium_bounds
    eye_out_x = max(abs(probe.eye_l.xmax), abs(probe.eye_r.xmin))
    return {
        "hb": hb,
        "brow_top": max(probe.brow_l.zmax, probe.brow_r.zmax),
        "ear_top": max(probe.ear_l.zmax, probe.ear_r.zmax),
        "ear_bot": min(probe.ear_l.zmin, probe.ear_r.zmin),
        "ear_front": min(probe.ear_l.ymin, probe.ear_r.ymin),
        "ear_half_w": max(abs(probe.ear_l.xmax), abs(probe.ear_r.xmin)),
        "face_x": max(abs(probe.brow_l.xmax), eye_out_x) + 0.006,
        "band": hat_band_z(probe),
        "cut": _cut_z(probe),
    }


def _mid_z(m: dict, c: float, dz: float = 0.022) -> float:
    """Temple ring height: above the brows in front, gently lower at the back (always above the ear notch)."""
    return m["brow_top"] + dz - 0.030 * max(0.0, -c)


def _hairline_ring(probe: BodyProbe, m: dict, th: float, *, front_dz: float, front_off: float, side_off: float,
                   nape_drop: float, nape_off: float, sideburn: float = 0.0) -> tuple[Vector, Vector]:
    """Standard carved hairline: above brows in front, notched over the ears, tapered at the nape."""
    c, s = math.cos(th), math.sin(th)
    side = abs(s)
    hb = m["hb"]
    if c > 0.35:
        z = m["brow_top"] + front_dz + 0.004 * side
        off = front_off
    elif side > 0.55 and c > -0.45:
        in_front = max(0.0, min(1.0, (c + 0.15) / 0.50))
        z = m["ear_top"] + 0.004 - sideburn * in_front
        off = side_off
    else:
        z = m["ear_bot"] - nape_drop
        off = nape_off
    z = max(z, hb.zmin + 0.015)
    return _cranium_ring_point(probe, th, z, off), _cranium_ring_point(probe, th, z + 0.003, 0.005)


# ---------------------------------------------------------------------------
# hair_buzz_01: very short, close to the scalp
# ---------------------------------------------------------------------------


def build_hair_buzz_01(probe: BodyProbe) -> bmesh.types.BMesh:
    m = _probe_marks(probe)
    hb = m["hb"]

    def rt(th):
        return _sph(probe, th, 74, 0.0088), _sph(probe, th, 74, 0.0050)

    def r0(th):
        return _sph(probe, th, 52, 0.0088), _sph(probe, th, 52, 0.0050)

    def r1(th):
        return _sph(probe, th, 30, 0.0085), _sph(probe, th, 30, 0.0050)

    def r2(th):
        c = math.cos(th)
        z = _mid_z(m, c, 0.024)
        return _cranium_ring_point(probe, th, z, 0.0080), _cranium_ring_point(probe, th, z, 0.0050)

    def r3(th):
        # Squared-off buzz hairline with slightly receded temples
        c, s = math.cos(th), math.sin(th)
        if c > 0.35:
            z = m["brow_top"] + 0.013 + 0.010 * max(0.0, abs(s) - 0.25)
            off = 0.0068
        elif abs(s) > 0.55 and c > -0.45:
            z = m["ear_top"] + 0.003
            off = 0.0066
        else:
            z = m["ear_bot"] - 0.014
            off = 0.0066
        return _cranium_ring_point(probe, th, z, off), _cranium_ring_point(probe, th, z + 0.002, 0.0048)

    bm = _cap(probe, 14, [rt, r0, r1, r2, r3], crown_out=0.0088, crown_in=0.0050)
    return _finish("hair_buzz_01", bm, probe, lambda f, c: c.z > hb.cz + 0.06 and f.normal.z > 0.55,
                   shade_lo=0.72, min_clear=0.0045)


# ---------------------------------------------------------------------------
# hair_short_02: textured crop (tight sides, spiky choppy top, short broken fringe)
# ---------------------------------------------------------------------------


def _tuft(bm, probe, base_dir: Vector, base_off: float, height: float, width: float, lean: Vector, twist: float = 0.0):
    """4-sided spike rooted on the scalp along ``base_dir``; leans by ``lean`` (world vector, scaled by height)."""
    p, n = _surf(probe, base_dir)
    root = p + n * base_off
    u, v = _frame(n, Vector((math.cos(twist), math.sin(twist), 0.0)))
    tip = root + (n + lean).normalized() * height
    base = [root + (u * math.cos(k * math.pi / 2) + v * math.sin(k * math.pi / 2)) * width for k in range(4)]
    vb = [bm.verts.new(q) for q in base]
    vt = bm.verts.new(tip)
    bm.faces.new(tuple(reversed(vb)))
    for k in range(4):
        bm.faces.new((vb[k], vb[(k + 1) % 4], vt))
    return vb + [vt]


def build_hair_short_02(probe: BodyProbe) -> bmesh.types.BMesh:
    m = _probe_marks(probe)
    hb = m["hb"]

    def r0(th):
        return _sph(probe, th, 55, 0.0150), _sph(probe, th, 55, 0.0055)

    def r1(th):
        c = math.cos(th)
        return _sph(probe, th, 30, 0.0150 + 0.003 * max(0.0, c)), _sph(probe, th, 30, 0.0055)

    def r2(th):
        c = math.cos(th)
        z = _mid_z(m, c, 0.020)
        # Tight faded sides, fuller front
        off = 0.0105 + 0.006 * max(0.0, c)
        return _cranium_ring_point(probe, th, z, off), _cranium_ring_point(probe, th, z, 0.0055)

    def r3(th):
        return _hairline_ring(probe, m, th, front_dz=0.011, front_off=0.012, side_off=0.0085,
                              nape_drop=0.008, nape_off=0.0085, sideburn=0.010)

    bm = _cap(probe, 14, [r0, r1, r2, r3], crown_out=0.016)

    # Spiky textured top: chunky tufts on a staggered grid (the high ones drop under hats)
    k = 0
    for phi, count, h, w in ((88, 1, 0.026, 0.024), (73, 7, 0.028, 0.024), (58, 10, 0.026, 0.022), (45, 12, 0.020, 0.020)):
        for i in range(count):
            th = 2.0 * math.pi * (i + 0.5 * (k % 2)) / count + 0.2
            k += 1
            c = math.cos(th)
            if phi == 45 and c < 0.3:
                continue  # lowest row only over the forehead; sides and back stay smooth
            d = _dir_from_theta_phi(th, math.radians(phi + 3.0 * math.sin(3.1 * i)))
            # Lean forward over the forehead, outward-back elsewhere, with a little jitter
            lean = Vector((0.30 * math.sin(2.3 * i + phi), -0.45 * max(0.2, c), 0.05))
            for scale in (1.0, 0.8, 0.62, 0.48):
                vs = _tuft(bm, probe, d, 0.010, h * scale, w, lean, twist=0.7 * i + phi)
                if _piece_band_ok(probe, vs):
                    break
                bmesh.ops.delete(bm, geom=vs, context="VERTS")

    # Short broken fringe: 5 chunky choppy blocks pointing down/forward, ending above the brows
    brow_top = m["brow_top"]
    for i, (x0, x1, drop) in enumerate(((-0.068, -0.036, 0.010), (-0.040, -0.008, 0.002), (-0.012, 0.020, 0.008),
                                        (0.016, 0.046, 0.001), (0.042, 0.070, 0.009))):
        xm = 0.5 * (x0 + x1)
        th = math.atan2(xm, 0.10)
        z_tip = brow_top + 0.0075 + drop
        p_root_hi = _cranium_ring_point(probe, th, brow_top + 0.040, 0.008)
        p_root_lo = _cranium_ring_point(probe, th, brow_top + 0.022, 0.008)
        p_tip = _cranium_ring_point(probe, th, z_tip, 0.025)
        r_a = [Vector((x0, p_root_hi.y, brow_top + 0.040)), Vector((x1, p_root_hi.y, brow_top + 0.040)),
               Vector((x1, p_root_lo.y, brow_top + 0.022)), Vector((x0, p_root_lo.y, brow_top + 0.022))]
        r_b = [Vector((x0 + 0.004, p_tip.y + 0.008, z_tip + 0.017)), Vector((x1 - 0.004, p_tip.y + 0.008, z_tip + 0.017)),
               Vector((xm + 0.003, p_tip.y - 0.002, z_tip)), Vector((xm - 0.003, p_tip.y - 0.002, z_tip))]
        _add_prism_lock(bm, [r_a, r_b])

    z_hi = hb.cz + 0.40 * (hb.zmax - hb.cz)
    return _finish("hair_short_02", bm, probe, lambda f, c: c.z > z_hi and f.normal.z > 0.45)


# ---------------------------------------------------------------------------
# hair_side_part_01: classic office side part (part on the character's left, swept to the right)
# ---------------------------------------------------------------------------


def build_hair_side_part_01(probe: BodyProbe) -> bmesh.types.BMesh:
    m = _probe_marks(probe)
    hb = m["hb"]
    # Base cap: short tapered back and sides; over the forehead it stays high, under the swept slabs

    def r0(th):
        return _sph(probe, th, 58, 0.0100), _sph(probe, th, 58, 0.0055)

    def r1(th):
        return _sph(probe, th, 42, 0.0120), _sph(probe, th, 42, 0.0055)

    def r2(th):
        c = math.cos(th)
        front = max(0.0, min(1.0, (c - 0.2) / 0.5))
        z = m["brow_top"] + 0.022 - 0.030 * max(0.0, -c) + 0.024 * front
        return _cranium_ring_point(probe, th, z, 0.0135), _cranium_ring_point(probe, th, z, 0.0055)

    def r3(th):
        return _hairline_ring(probe, m, th, front_dz=0.040, front_off=0.010, side_off=0.0115,
                              nape_drop=0.010, nape_off=0.011, sideburn=0.014)

    bm = _cap(probe, 14, [r0, r1, r2, r3], crown_out=0.011)

    b_part = 15.0
    brow_top = m["brow_top"]
    face_x = m["face_x"]

    def front_a(b):
        # High hairline at the part, the swept side dips across the right forehead to the temple
        if b >= b_part:
            dz = 0.042
        else:
            dz = 0.042 - 0.028 * min(1.0, (b_part - b) / 55.0)
        a_face = _a_for_z(probe, b, brow_top + dz)
        x_here = abs(_surf(probe, _xdir(a_face, b))[0].x)
        return a_face if x_here < face_x + 0.012 else max(22.0, min(a_face, 40.0))

    # Big swept side (part -> right temple)
    cols_r = [b_part, 3.0, -12.0, -28.0, -44.0, -60.0, -72.0]
    ts = [0.0, 0.10, 0.24, 0.42, 0.62, 0.82, 1.0]
    a_back = 152.0
    dirs = [[_xdir(front_a(b) + (a_back - front_a(b)) * t, b) for b in cols_r] for t in ts]

    def off_r(i, j, hit, nrm):
        t = ts[i]
        bj = cols_r[j]
        edge = j == 0 or j == len(cols_r) - 1 or i == len(ts) - 1
        # Swoop: thickest just behind the front edge on the right-front, rounding down the side
        swoop = 0.030 * math.sin(math.pi * min(1.0, t * 1.8 + 0.12)) * (1.0 - 0.45 * t)
        side_fall = 1.0 - 0.35 * max(0.0, (-bj - 40.0) / 32.0)
        off = 0.014 + swoop * side_fall
        if i == 0:
            off = 0.019 + 0.006 * min(1.0, max(0.0, (b_part - bj) / 40.0))  # chunky swept front lip
        if j == 0:
            off = 0.0105  # part line dips
        elif edge:
            off = min(off, 0.0145)
        return _band_env(probe, hit.z, off), 0.0060

    _slab(bm, probe, dirs, off_r)

    # Flat side of the part (part -> left temple), lighter volume
    cols_l = [72.0, 58.0, 42.0, 28.0, b_part]
    dirs_l = [[_xdir(front_a(b) + (a_back - front_a(b)) * t, b) for b in cols_l] for t in ts]

    def off_l(i, j, hit, nrm):
        t = ts[i]
        off = 0.016 + 0.006 * math.sin(math.pi * t)
        if i == 0:
            off = 0.017
        if j == len(cols_l) - 1:
            off = 0.0105
        elif j == 0 or i == len(ts) - 1:
            off = min(off, 0.0145)
        return _band_env(probe, hit.z, off), 0.0060

    _slab(bm, probe, dirs_l, off_l)

    z_hi = hb.cz + 0.45 * (hb.zmax - hb.cz)
    return _finish("hair_side_part_01", bm, probe, lambda f, c: c.z > z_hi and f.normal.z > 0.40)


# ---------------------------------------------------------------------------
# hair_undercut_01: shaved sides and back, long swept top
# ---------------------------------------------------------------------------


def build_hair_undercut_01(probe: BodyProbe) -> bmesh.types.BMesh:
    m = _probe_marks(probe)
    hb = m["hb"]

    # Shaved shell (darker shade) over the whole skull
    def r0(th):
        return _sph(probe, th, 56, 0.0070), _sph(probe, th, 56, 0.0048)

    def r1(th):
        return _sph(probe, th, 30, 0.0070), _sph(probe, th, 30, 0.0048)

    def r2(th):
        c = math.cos(th)
        z = _mid_z(m, c, 0.024)
        return _cranium_ring_point(probe, th, z, 0.0068), _cranium_ring_point(probe, th, z, 0.0048)

    def r3(th):
        return _hairline_ring(probe, m, th, front_dz=0.014, front_off=0.0066, side_off=0.0064,
                              nape_drop=0.012, nape_off=0.0064, sideburn=0.006)

    bm = _cap(probe, 16, [r0, r1, r2, r3], crown_out=0.0072, crown_in=0.0048)
    _tag(bm, bm.faces, 1)

    # Long top swept back and to the right, a clear step over the shaved sides
    brow_top = m["brow_top"]
    cols = [38.0, 26.0, 13.0, 0.0, -13.0, -26.0, -38.0]
    ts = [0.0, 0.12, 0.28, 0.46, 0.66, 0.84, 1.0]
    a_back = 142.0

    def front_a(j, b):
        jag = 4.0 if j % 2 else 0.0  # chunky lock tips along the front edge
        return max(_a_for_z(probe, b, brow_top + 0.022), 24.0) + jag

    dirs = [[_xdir(front_a(j, b) + (a_back - front_a(j, b)) * t, b) for j, b in enumerate(cols)] for t in ts]

    def off_t(i, j, hit, nrm):
        t = ts[i]
        b = cols[j]
        lift = 0.042 * math.sin(math.pi * min(1.0, 0.15 + t * 1.25)) * (1.0 - 0.5 * t)
        right = 1.0 + 0.18 * (-b / 44.0)
        off = 0.020 + lift * right
        if i == 0:
            off = 0.024
        if j in (0, len(cols) - 1):
            off = 0.018
        if i == len(ts) - 1:
            off = 0.016
        return _band_env(probe, hit.z, off), 0.0058

    _slab(bm, probe, dirs, off_t)

    z_hi = hb.cz + 0.50 * (hb.zmax - hb.cz)
    return _finish(
        "hair_undercut_01", bm, probe,
        lambda f, c: _part(bm, f) != 1 and c.z > z_hi and f.normal.z > 0.45,
        dark_pred=lambda f, c: _part(bm, f) == 1, dark=0.74,
    )


# ---------------------------------------------------------------------------
# hair_bob_bangs_01: rounded jaw-length bob with a full blunt fringe
# ---------------------------------------------------------------------------


def build_hair_bob_bangs_01(probe: BodyProbe) -> bmesh.types.BMesh:
    m = _probe_marks(probe)
    hb = m["hb"]
    hc = probe.head_center
    brow_top = m["brow_top"]
    ear_half_w = m["ear_half_w"]
    face_open_x = m["face_x"] + 0.008
    hem_z = hb.zmin + 0.012  # jaw line, level all round
    ang_open = math.asin(min(0.85, (face_open_x + 0.008) / hb.xmax))
    cols = 13
    thetas = [ang_open + (2.0 * math.pi - 2.0 * ang_open) * k / (cols - 1) for k in range(cols)]
    # (kind, value): sphere elevation in degrees, or drape fraction (0 = head centre height, 1 = hem)
    levels = [("sph", 64.0), ("sph", 36.0), ("sph", 10.0), ("drp", 0.40), ("drp", 0.80), ("drp", 1.0)]

    def pt(th, k, j, inner):
        c, s = math.cos(th), math.sin(th)
        kind, val = levels[k]
        if kind == "sph":
            p, n = _surf(probe, _dir_from_theta_phi(th, math.radians(val)))
            if inner:
                off = 0.0055
                if val < 20 and abs(s) > 0.6:
                    off = max(off, ear_half_w - hb.xmax + 0.010)
            else:
                off = 0.026 + 0.010 * (1.0 - val / 64.0) * abs(s)
                if val < 20 and abs(s) > 0.6:
                    off = max(off, ear_half_w - hb.xmax + 0.030)
            q = p + n * off
            if not inner:
                off2 = _band_env(probe, p.z, off)
                q = p + n * off2
            return q
        u = val
        z = hc.z * (1.0 - u) + hem_z * u
        eq_p, _n = _surf(probe, Vector((s, -c, 0.0)))
        r_base = max(math.hypot(eq_p.x, eq_p.y - hc.y), ear_half_w * abs(s) + 0.02 * abs(c))
        bell = 0.040 + 0.006 * math.sin(u * math.pi) - (0.010 if u >= 1.0 else 0.0)
        if inner:
            bell = 0.016 - (0.004 if u >= 1.0 else 0.0)
        q = Vector((0.0, hc.y, z)) + Vector((s, -c, 0.0)) * (r_base + bell)
        if abs(q.x) < face_open_x and q.y < hc.y:
            q.x = math.copysign(face_open_x, s)
        return q

    bm = bmesh.new()
    _drape(bm, probe, thetas, len(levels), pt)

    # Full blunt fringe: straight-cut edge just above the brows, between the two front curtains
    fcols = 9
    fth = [-ang_open - 0.10 + (2.0 * ang_open + 0.20) * k / (fcols - 1) for k in range(fcols)]
    z_edge = brow_top + 0.0068
    rows_o, rows_i = [], []
    for phi in (70.0, 52.0, 36.0):
        rows_o.append([_sph(probe, th, phi, 0.0) for th in fth])
    O, I = [], []
    for phi in (70.0, 52.0):
        O.append([_sph(probe, th, phi, 0.024) for th in fth])
        I.append([_sph(probe, th, phi, 0.0055) for th in fth])
    O.append([_cranium_ring_point(probe, th, brow_top + 0.022, 0.025) for th in fth])
    I.append([_cranium_ring_point(probe, th, brow_top + 0.022, 0.0055) for th in fth])
    O.append([_cranium_ring_point(probe, th, z_edge, 0.024) for th in fth])
    I.append([_cranium_ring_point(probe, th, z_edge + 0.0015, 0.0060) for th in fth])
    for row in O:
        for q in row:
            q.z = q.z  # keep
    _grid_slab(bm, O, I)

    z_hi = hb.cz + 0.45 * (hb.zmax - hb.cz)
    return _finish("hair_bob_bangs_01", bm, probe, lambda f, c: c.z > z_hi and f.normal.z > 0.30)


# ---------------------------------------------------------------------------
# hair_long_wavy_01: long hair with chunky waves and a scalloped hem
# ---------------------------------------------------------------------------


def build_hair_long_wavy_01(probe: BodyProbe) -> bmesh.types.BMesh:
    m = _probe_marks(probe)
    hb = m["hb"]
    hc = probe.head_center
    brow_top = m["brow_top"]
    ear_half_w = m["ear_half_w"]
    face_open_x = m["face_x"] + 0.009
    shoulder_z = probe.chest_bounds.zmax
    drape_end_z = probe.chest_bounds.zmin + 0.070
    ear_mid_z = 0.5 * (probe.ear_l.zmin + probe.ear_l.zmax)
    torsos = [probe.torso_bvh, probe.male_torso_bvh]

    back_clear_y = max(hb.ymax + 0.012, probe.chest_bounds.ymax + 0.022)
    for z_chk in (shoulder_z - 0.02, shoulder_z - 0.08, drape_end_z + 0.02, drape_end_z - 0.03):
        pt_b, _n = _torso_surface_point(torsos, z_chk, math.pi, fallback_r=0.10)
        back_clear_y = max(back_clear_y, pt_b.y + 0.016)

    cols = 15
    ang_open = math.asin(min(0.85, (face_open_x + 0.008) / hb.xmax))
    thetas = [ang_open + (2.0 * math.pi - 2.0 * ang_open) * k / (cols - 1) for k in range(cols)]
    stages = ("crown", "temple", "ear", "chin", "waveA", "shoulder", "waveB", "tip")

    def pt(th, k, j, inner):
        c, s = math.cos(th), math.sin(th)
        backness = max(0.0, -c)
        st = stages[k]
        if st == "crown":
            p, n = _surf(probe, _dir_from_theta_phi(th, math.radians(62)))
            return p + n * (0.0055 if inner else 0.022)
        if st == "temple":
            p, n = _surf(probe, _dir_from_theta_phi(th, math.radians(30)))
            q = p + n * (0.006 if inner else _band_env(probe, p.z, 0.024 + 0.004 * abs(s)))
            if abs(s) > 0.68 and -0.45 <= c <= 0.52:
                mx = ear_half_w + (0.006 if inner else 0.020)
                if abs(q.x) < mx:
                    q.x = math.copysign(mx, s)
            return q
        if st == "ear":
            p, n = _surf(probe, _dir_from_theta_phi(th, math.radians(2)))
            q = p + n * (0.0065 if inner else 0.026 + 0.006 * abs(s))
            q.z = ear_mid_z
            if abs(s) > 0.65 and -0.50 <= c <= 0.52:
                mx = ear_half_w + (0.007 if inner else 0.024)
                if abs(q.x) < mx:
                    q.x = math.copysign(mx, s)
            elif abs(q.x) < face_open_x and c >= 0:
                q.x = math.copysign(face_open_x, s if abs(s) > 1e-4 else 1.0)
            return q
        if st in ("chin", "waveA"):
            wave = 0.0 if st == "chin" else 0.018
            z = hb.zmin - 0.002 if st == "chin" else 0.5 * (hb.zmin + shoulder_z) - 0.004
            y_target = max(hc.y + 0.02, back_clear_y) if c < -0.15 else (hc.y - 0.02 * c)
            side_w = (ear_half_w + (0.006 if inner else 0.024)) if abs(s) > 0.7 else (hb.xmax + 0.020)
            x_w = max(side_w, face_open_x + 0.010) + wave
            x = s * x_w
            if c < 0:
                y = hc.y + (-c) * (y_target - hc.y + (0.002 if inner else 0.024) + wave * 0.6)
            else:
                y = hc.y - c * (hb.ymax * 0.72)
            if abs(x) < face_open_x and y < hc.y:
                x = math.copysign(face_open_x, s if abs(s) > 1e-4 else 1.0)
            return Vector((x, y, z))
        # Below the jaw: the back sheet hangs behind the shoulders, the front locks stop on the collarbone line
        wave = {"shoulder": 0.0, "waveB": 0.020, "tip": 0.004}[st]
        if st == "shoulder":
            z = shoulder_z - 0.025
        elif st == "waveB":
            z = 0.5 * (shoulder_z + drape_end_z) - 0.01
        else:
            scallop = 0.030 if j % 2 else 0.0
            z = drape_end_z + 0.060 * (1.0 - backness) + scallop
        half_w = probe.chest_bounds.xmax * (0.86 if st != "tip" else 0.78) + wave
        x = s * half_w
        y = back_clear_y + (0.0 if inner else 0.024) + wave - 0.060 * (1.0 - backness)
        if c > -0.15:
            x = s * (face_open_x + (0.016 if inner else 0.040) + wave)
            y = hc.y - c * (hb.ymax * 0.40) + 0.004
            z = shoulder_z + {"shoulder": 0.004, "waveB": 0.002, "tip": 0.0}[st] - (0.0 if st == "shoulder" else 0.006)
            if st == "tip":
                z = shoulder_z - 0.010 + (0.012 if j % 2 else 0.0)
        return Vector((x, y, z))

    bm = bmesh.new()
    _drape(bm, probe, thetas, len(stages), pt)

    # Centre-parted top over the forehead (high hairline, the face stays open)
    fcols = 7
    fth = [-ang_open - 0.08 + (2.0 * ang_open + 0.16) * k / (fcols - 1) for k in range(fcols)]
    O, I = [], []
    for phi in (70.0, 52.0):
        O.append([_sph(probe, th, phi, 0.022 - (0.008 if k == fcols // 2 else 0.0)) for k, th in enumerate(fth)])
        I.append([_sph(probe, th, phi, 0.0055) for th in fth])
    zf = [brow_top + 0.030 + 0.010 * (1.0 - abs(k - fcols // 2) / (fcols // 2)) for k in range(fcols)]
    O.append([_cranium_ring_point(probe, th, zf[k], 0.020 if k != fcols // 2 else 0.012) for k, th in enumerate(fth)])
    I.append([_cranium_ring_point(probe, th, zf[k] + 0.002, 0.0055) for k, th in enumerate(fth)])
    _grid_slab(bm, O, I)

    z_hi = hb.cz + 0.45 * (hb.zmax - hb.cz)
    return _finish("hair_long_wavy_01", bm, probe, lambda f, c: c.z > z_hi and f.normal.z > 0.30)


# ---------------------------------------------------------------------------
# Shared base for the tied-back styles: a sleek pulled-back cap
# ---------------------------------------------------------------------------


def _sleek_cap(probe: BodyProbe, m: dict, off: float = 0.0105, crown_out: float = 0.0105) -> bmesh.types.BMesh:
    hb = m["hb"]

    def r0(th):
        return _sph(probe, th, 55, off), _sph(probe, th, 55, 0.0052)

    def r1(th):
        return _sph(probe, th, 28, off), _sph(probe, th, 28, 0.0052)

    def r2(th):
        c = math.cos(th)
        z = _mid_z(m, c, 0.022)
        return _cranium_ring_point(probe, th, z, off - 0.001), _cranium_ring_point(probe, th, z, 0.0052)

    def r3(th):
        return _hairline_ring(probe, m, th, front_dz=0.0085, front_off=0.0085, side_off=0.009,
                              nape_drop=0.004, nape_off=0.010)

    return _cap(probe, 14, [r0, r1, r2, r3], crown_out=crown_out)


def _tail(bm, probe: BodyProbe, pts: list[tuple[float, float, float]], radii: list, seg: int = 6, phase: float = 0.3):
    """Tube through (x, z, off) points hugging the back of the head (off = scalp offset at the back)."""
    path = []
    for x, z, off in pts:
        q = _cranium_ring_point(probe, math.pi, z, off)
        q.x = x
        path.append(q)
    return _tube(bm, path, radii, seg=seg, ref=Vector((1.0, 0.0, 0.0)), phase=phase)


# ---------------------------------------------------------------------------
# hair_ponytail_01: low ponytail at the nape, hanging down the back
# ---------------------------------------------------------------------------


def build_hair_ponytail_01(probe: BodyProbe) -> bmesh.types.BMesh:
    m = _probe_marks(probe)
    hb = m["hb"]
    bm = _sleek_cap(probe, m)
    zt = m["ear_bot"] + 0.004  # tie height: just under the ears, below the hat band
    end_z = probe.chest_bounds.zmax + 0.045
    # Main tail (flat-ish, wide in X) + two flanking locks
    rx = lambda r: (r * 1.35, r * 1.10)
    pts = [(0.0, zt + 0.014, 0.012), (0.0, zt, 0.022), (0.0, zt - 0.020, 0.030), (0.0, zt - 0.050, 0.034),
           (0.0, 0.5 * (zt + end_z), 0.036), (0.0, end_z + 0.020, 0.036), (0.0, end_z, 0.034)]
    _tail(bm, probe, pts, [rx(0.010), rx(0.015), rx(0.021), rx(0.024), rx(0.023), rx(0.014), 0.0])
    for sx in (-1.0, 1.0):
        pl = [(sx * 0.014, zt - 0.006, 0.026), (sx * 0.020, zt - 0.040, 0.034), (sx * 0.022, zt - 0.072, 0.038),
              (sx * 0.016, end_z + 0.014, 0.038), (sx * 0.012, end_z + 0.004, 0.036)]
        _tail(bm, probe, pl, [rx(0.008), rx(0.011), rx(0.012), rx(0.007), 0.0], seg=5, phase=0.5)
    # Hair tie
    tz = zt + 0.002
    _tail(bm, probe, [(0.0, tz + 0.008, 0.017), (0.0, tz - 0.006, 0.024)], [(0.0165, 0.0135), (0.0185, 0.0150)], seg=8)
    z_hi = hb.cz + 0.45 * (hb.zmax - hb.cz)
    return _finish("hair_ponytail_01", bm, probe, lambda f, c: c.z > z_hi and f.normal.z > 0.45)


# ---------------------------------------------------------------------------
# hair_ponytail_high_01: high ponytail arcing from the crown
# ---------------------------------------------------------------------------


def build_hair_ponytail_high_01(probe: BodyProbe) -> bmesh.types.BMesh:
    m = _probe_marks(probe)
    hb = m["hb"]
    cut = m["cut"]
    bm = _sleek_cap(probe, m)
    # Root high on the back of the crown, tail arcs out then hugs the back of the head (band zone <= 30 mm)
    root_z = hb.cz + 0.62 * (hb.zmax - hb.cz)
    rx = lambda r: (r * 1.30, r * 1.10)
    zc = cut + 0.010
    end_z = probe.chest_bounds.zmax + 0.050
    pts = [(0.0, root_z, 0.010), (0.0, root_z + 0.022, 0.034), (0.0, root_z + 0.006, 0.058),
           (0.0, 0.5 * (root_z + zc), 0.046), (0.0, zc + 0.004, 0.026), (0.0, zc - 0.024, 0.0185),
           (0.0, m["band"] - 0.014, 0.020), (0.0, m["ear_bot"] + 0.020, 0.034),
           (0.0, 0.5 * (m["ear_bot"] + end_z), 0.040), (0.0, end_z + 0.020, 0.040), (0.0, end_z, 0.037)]
    radii = [rx(0.011), rx(0.017), rx(0.020), rx(0.015), rx(0.0105), rx(0.0085), rx(0.0085), rx(0.017),
             rx(0.020), rx(0.013), 0.0]
    _tail(bm, probe, pts, radii, seg=6)
    for sx in (-1.0, 1.0):
        pl = [(sx * 0.010, m["ear_bot"] + 0.022, 0.034), (sx * 0.020, 0.5 * (m["ear_bot"] + end_z), 0.042),
              (sx * 0.018, end_z + 0.026, 0.044), (sx * 0.010, end_z + 0.010, 0.042)]
        _tail(bm, probe, pl, [rx(0.008), rx(0.011), rx(0.007), 0.0], seg=5, phase=0.5)
    # Hair tie around the root
    _tail(bm, probe, [(0.0, root_z + 0.010, 0.020), (0.0, root_z - 0.006, 0.026)], [(0.0150, 0.0130), (0.0170, 0.0145)], seg=8)
    z_hi = hb.cz + 0.45 * (hb.zmax - hb.cz)
    return _finish("hair_ponytail_high_01", bm, probe, lambda f, c: c.z > z_hi and f.normal.z > 0.45)


# ---------------------------------------------------------------------------
# hair_twin_buns_01: sleek centre-parted cap with two chunky side buns
# ---------------------------------------------------------------------------


def build_hair_twin_buns_01(probe: BodyProbe) -> bmesh.types.BMesh:
    m = _probe_marks(probe)
    hb = m["hb"]
    bm = _sleek_cap(probe, m)
    for sx in (-1.0, 1.0):
        for phi_th, rad in ((0.0, 1.0),):
            best = None
            for step in range(14):
                # Side direction above the ear, pushed up if the bun would reach into the hat band
                d = Vector((sx * 0.80, 0.25, 0.45 + 0.07 * step)).normalized()
                p, n = _surf(probe, d)
                r = 0.034
                ctr = p + n * (0.010 + r * 0.82)
                vs = _blob(bm, ctr, n, r * 1.02, r * 0.9, seg=7, phase=0.2)
                if _piece_band_ok(probe, vs):
                    best = vs
                    break
                bmesh.ops.delete(bm, geom=vs, context="VERTS")
            if best is None:
                raise RuntimeError("twin bun does not clear the hat band")
            # small tie knob at the root
            tp = p + n * 0.012
            _blob(bm, tp, n, 0.016, 0.010, seg=6, phase=0.4)
    z_hi = hb.cz + 0.45 * (hb.zmax - hb.cz)
    return _finish("hair_twin_buns_01", bm, probe, lambda f, c: c.z > z_hi and f.normal.z > 0.45)


# ---------------------------------------------------------------------------
# hair_curly_01: rounded volume made of chunky lobes
# ---------------------------------------------------------------------------


def build_hair_curly_01(probe: BodyProbe) -> bmesh.types.BMesh:
    m = _probe_marks(probe)
    hb = m["hb"]

    def r0(th):
        return _sph(probe, th, 55, 0.0150), _sph(probe, th, 55, 0.0055)

    def r1(th):
        return _sph(probe, th, 28, 0.0150), _sph(probe, th, 28, 0.0055)

    def r2(th):
        c = math.cos(th)
        z = _mid_z(m, c, 0.020)
        return _cranium_ring_point(probe, th, z, 0.0130), _cranium_ring_point(probe, th, z, 0.0055)

    def r3(th):
        return _hairline_ring(probe, m, th, front_dz=0.014, front_off=0.011, side_off=0.010,
                              nape_drop=0.006, nape_off=0.011, sideburn=0.006)

    bm = _cap(probe, 14, [r0, r1, r2, r3], crown_out=0.016)
    k = 0
    # rows: (elevation phi deg, count, lobe radius, offset)
    for phi, count, rad in ((86, 1, 0.027), (68, 6, 0.025), (50, 9, 0.024), (33, 11, 0.022), (18, 12, 0.020)):
        for i in range(count):
            th = 2.0 * math.pi * (i + 0.5 * (k % 2)) / count + 0.15
            k += 1
            c, s = math.cos(th), math.sin(th)
            if phi <= 33 and c > 0.30:
                continue  # clear forehead and temples
            if phi <= 18 and (c > -0.10 or abs(s) > 0.995):
                pass
            if phi == 18 and c > -0.25:
                continue
            d = _dir_from_theta_phi(th, math.radians(phi + 2.5 * math.sin(2.7 * i)))
            p, n = _surf(probe, d)
            for scale in (1.0, 0.85, 0.7, 0.58):
                r = rad * scale
                ctr = p + n * (0.008 + 0.7 * r)
                vs = _blob(bm, ctr, n, r * 1.05, r * 0.95, seg=6, phase=0.5 * i)
                if _piece_band_ok(probe, vs):
                    break
                bmesh.ops.delete(bm, geom=vs, context="VERTS")
    z_hi = hb.cz + 0.40 * (hb.zmax - hb.cz)
    return _finish("hair_curly_01", bm, probe, lambda f, c: c.z > z_hi and f.normal.z > 0.35)


register("hair_buzz_01", "hair", "Head", build_hair_buzz_01)
register("hair_short_02", "hair", "Head", build_hair_short_02)
register("hair_side_part_01", "hair", "Head", build_hair_side_part_01)
register("hair_undercut_01", "hair", "Head", build_hair_undercut_01)
register("hair_bob_bangs_01", "hair", "Head", build_hair_bob_bangs_01)
register("hair_long_wavy_01", "hair", "Head", build_hair_long_wavy_01)
register("hair_ponytail_01", "hair", "Head", build_hair_ponytail_01)
register("hair_ponytail_high_01", "hair", "Head", build_hair_ponytail_high_01)
register("hair_twin_buns_01", "hair", "Head", build_hair_twin_buns_01)
register("hair_curly_01", "hair", "Head", build_hair_curly_01)
