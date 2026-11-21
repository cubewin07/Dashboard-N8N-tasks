"""B3 tops (P08a-T05): 9 new skinned tops built on a parametric variant of the starter top.

``_build_top`` is a copy of ``lib.garments.build_top_mesh`` (same 16-column torso rings, same
10-sided sleeves bridged into the armholes, same offsets) extended with:

- necklines: ``crew`` / ``shirt`` (the starter shapes), ``v`` (V cut into the upper rings),
  ``scoop`` (front/back scoop for the tank), ``high`` (neck-base ring for the turtleneck and
  the vest's built-in shirt), each optionally finished by a collar: ``rim`` (rolled rib),
  ``shirt`` / ``polo`` (stand + turned-down flap), ``turtle`` (neck tube with folded roll);
- sleeves: ``long`` / ``short`` / ``none`` (sleeveless: wider armhole, narrowed strap), with an
  optional rib cuff band and a small cuff flare;
- surface details floated a few mm off the shirt (placket + buttons, chest pocket, colour-block
  chest graphic, neck bow), interpolated over the shirt's own quads so they never sink in.

Every face belongs to a *part* (``body``, ``hem``, ``sleeve``, ``cuff``, ``collar`` …); the item
maps each part to a palette swatch + tint slot. Tinted faces sit on the palette ``white`` cell
(``charexport.set_garment_colors``), so any catalogue colour works.
"""

from __future__ import annotations

import math

import bmesh
from mathutils import Vector

from items_skinned import register
from lib.garments import add_quad, ensure_outward_normals, paint_faces

N = 16  # torso columns: c=0 → +X (character's left), 4 → +Y (back), 8 → −X, 12 → −Y (front)
FRONT = 12


def _ang(c: float) -> float:
    return 2.0 * math.pi * c / N


def _add_face(bm, verts, zones, swatch, tint, shade, out_ref: Vector | None = None):
    try:
        f = bm.faces.new(verts)
    except ValueError:
        return None
    f.smooth = False
    if out_ref is not None:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - out_ref) < 0.0:
            f.normal_flip()
    zones.append((f, swatch, tint, shade))
    return f


def _build_top(
    ctx,
    *,
    parts: dict[str, tuple[str, str]],
    sleeve: str = "short",
    sleeve_len: float | None = None,
    neck: str = "crew",
    collar: str | None = "rim",
    off_hips: float = 0.023,
    off_chest: float = 0.019,
    off_sleeve: float = 0.0175,
    v_depth: float = 0.0,
    scoop_front: float = 0.0,
    scoop_back: float = 0.0,
    side_pull: float = 0.72,
    cuff_len: float = 0.020,
    cuff_flare: float = 0.0,
    hem_rib: bool = False,
    strap_x: float = 0.105,
    shirt_under: bool = False,
    placket: float = 0.0,
    buttons: int = 0,
    pocket: bool = False,
    graphic: bool = False,
    bow: bool = False,
) -> bmesh.types.BMesh:
    """Parametric top. ``parts`` maps part name → (swatch, tint slot); missing parts fall back to ``body``."""
    sampler = ctx.sampler
    bm = bmesh.new()
    zones: list = []

    def part(name: str) -> tuple[str, str]:
        return parts.get(name) or parts["body"]

    def quad(vs, name, shade=1.0, out_ref=None):
        sw, tint = part(name)
        return add_quad(bm, vs, zones, sw, tint=tint, shade=shade, out_ref=out_ref)

    def face(vs, name, shade=1.0, out_ref=None):
        sw, tint = part(name)
        return _add_face(bm, vs, zones, sw, tint, shade, out_ref)

    hips_mn, hips_mx = sampler.region_bounds("hips")
    chest_mn, chest_mx = sampler.region_bounds("chest")
    neck_mn, _neck_mx = sampler.region_bounds("neck")
    _arm_mn, arm_l_mx = sampler.region_bounds("upper_arm_l")

    z_hem = max(hips_mn.z + 0.118, hips_mx.z - 0.025)
    z_arm_bot = chest_mn.z + 0.015
    z_arm_mid = (chest_mn.z + chest_mx.z) * 0.5 + 0.01
    z_arm_top = max(chest_mx.z + 0.012, arm_l_mx.z + 0.010)
    z_bust = chest_mn.z + 0.055
    z_upper_hip = max(hips_mx.z, z_hem + 0.044)
    z_waist = 0.5 * (z_upper_hip + z_arm_bot)
    ring_specs = [
        (z_hem, off_hips),
        (z_hem + 0.022, off_hips + 0.001),
        (z_upper_hip, off_hips),
        (0.5 * (z_upper_hip + z_waist), off_chest + 0.001),
        (z_waist, off_chest + 0.001),
        (z_arm_bot, off_chest),
        (z_bust, off_chest + 0.001),
        (z_arm_mid, off_chest),
        (z_arm_top, off_chest + 0.002),
    ]
    R_ARM_BOT, R_BUST, R_ARM_MID, R_ARM_TOP = 5, 6, 7, 8

    def tpoint(ang: float, z: float, off: float) -> Vector:
        pt = sampler.torso_point(ang, min(z, chest_mx.z - 0.004), off)
        pt.z = z
        return pt

    # --- neckline profile (z of the neck edge per column) -------------------------------
    neck_top = max(neck_mn.z + (0.012 if neck == "high" else 0.006), chest_mx.z + 0.014)
    z_floor = chest_mx.z + 0.0085

    def neck_z(c: int) -> float:
        a = _ang(c)
        front = max(0.0, -math.sin(a))
        back = max(0.0, math.sin(a))
        if neck == "high":
            return max(neck_top - 0.014 * front ** 1.4, z_floor)
        if neck == "shirt":
            return max(neck_top - 0.042 * front ** 1.4, z_floor)
        crew = max(neck_top - 0.050 * front ** 1.4, z_floor)
        if neck == "crew":
            return crew
        if neck == "v":
            d = abs(((c - FRONT + N / 2) % N) - N / 2)
            vshape = max(0.0, 1.0 - d / 2.0)
            return min(crew, neck_top - v_depth * vshape)
        if neck == "scoop":
            return neck_top - scoop_front * front ** 1.6 - scoop_back * back ** 2.0
        raise ValueError(neck)

    # --- torso rings (per-column z so a deep neckline can pull the upper rings down) ----
    torso_z = [[rz for _ in range(N)] for rz, _o in ring_specs]
    nz = [neck_z(c) for c in range(N)]
    gap = 0.011
    for c in range(N):
        above = nz[c]
        for r in range(R_ARM_TOP, R_ARM_BOT - 1, -1):
            if torso_z[r][c] > above - gap:
                torso_z[r][c] = above - gap
            above = torso_z[r][c]

    rings: list[list] = []
    for r, (_rz, roff) in enumerate(ring_specs):
        rings.append([bm.verts.new(tpoint(_ang(c), torso_z[r][c], roff)) for c in range(N)])

    # Sleeveless: pull the shoulder-top verts over the armhole in to a narrow strap.
    if sleeve == "none":
        for c_set, sgn in (((15, 0, 1), 1.0), ((7, 8, 9), -1.0)):
            for c in c_set:
                v = rings[R_ARM_TOP][c]
                x_new = sgn * strap_x
                origin = Vector((x_new, v.co.y * 0.85, 1.60))
                loc, _n, idx, _d = sampler.torso_bvh.ray_cast(origin, Vector((0, 0, -1)), 0.5)
                z_new = (loc.z if idx is not None else v.co.z) + off_chest
                v.co = Vector((x_new, v.co.y * 0.85, max(z_new, torso_z[R_ARM_TOP][c] - 0.004)))

    # --- neck ring -----------------------------------------------------------------------
    neck_ring = []
    for c in range(N):
        a = _ang(c)
        z_cur = nz[c]
        pt = sampler.torso_point(a, min(z_cur, neck_mn.z), off_chest + 0.002)
        if abs(math.cos(a)) > 0.35 and z_cur >= z_floor - 1e-6:
            pt.x *= side_pull
            pt.z = max(pt.z, z_cur - 0.004) if neck in ("crew", "shirt", "high") else z_cur
        else:
            pt.z = z_cur
        neck_ring.append(bm.verts.new(pt))
    rings.append(neck_ring)

    # --- torso faces -----------------------------------------------------------------------
    if sleeve == "none":
        hole_l = {(r, c) for r in (R_ARM_BOT, R_BUST, R_ARM_MID) for c in (14, 15, 0, 1)}
        hole_r = {(r, c) for r in (R_ARM_BOT, R_BUST, R_ARM_MID) for c in (6, 7, 8, 9)}
    else:
        hole_l = {(r, c) for r in (R_ARM_BOT, R_BUST, R_ARM_MID) for c in (15, 0)}
        hole_r = {(r, c) for r in (R_ARM_BOT, R_BUST, R_ARM_MID) for c in (7, 8)}
    skip = hole_l | hole_r

    for r in range(len(rings) - 1):
        for c in range(N):
            if (r, c) in skip:
                continue
            c2 = (c + 1) % N
            name, shade = "body", 1.0
            if r == 0:
                name, shade = ("hem", 0.86) if hem_rib else ("body", 0.88)
            elif r == 1 and hem_rib:
                name, shade = "body", 0.95
            if sleeve == "none" and r == R_ARM_TOP and c in (14, 15, 0, 1, 6, 7, 8, 9):
                shade = 0.97  # strap
            quad((rings[r][c], rings[r][c2], rings[r + 1][c2], rings[r + 1][c]), name, shade)

    # Sleeveless: rib binding faces just below each armhole (a darker band around the opening).
    # (The faces next to the hole are re-shaded rather than adding geometry.)

    # --- vest: built-in shirt neck above the knit V ------------------------------------------
    top_ring = neck_ring
    if shirt_under:
        shirt_ring = []
        for c in range(N):
            a = _ang(c)
            front = max(0.0, -math.sin(a))
            z_s = max(neck_top - 0.020 * front ** 1.4, z_floor)
            z_s = max(z_s, nz[c] + 0.008)
            pt = sampler.torso_point(a, min(z_s, neck_mn.z), off_chest + 0.0015)
            if abs(math.cos(a)) > 0.35:
                pt.x *= 0.72
            pt.z = z_s
            shirt_ring.append(bm.verts.new(pt))
        for c in range(N):
            c2 = (c + 1) % N
            quad((neck_ring[c], neck_ring[c2], shirt_ring[c2], shirt_ring[c]), "bib", 0.97)
        top_ring = shirt_ring

    # --- collars -------------------------------------------------------------------------------
    if collar == "rim":
        rim = [bm.verts.new(Vector((v.co.x * 0.97, v.co.y * 0.97, v.co.z + 0.010))) for v in top_ring]
        for c in range(N):
            c2 = (c + 1) % N
            quad((top_ring[c], top_ring[c2], rim[c2], rim[c]), "collar", 0.86)
    elif collar in ("shirt", "polo"):
        polo = collar == "polo"
        stand = []
        for c in range(N):
            b = top_ring[c].co
            front = max(0.0, -math.sin(_ang(c)))
            stand.append(bm.verts.new(Vector((
                b.x * 1.07, b.y * 1.08 - front * 0.006,
                b.z + (0.014 if front < 0.3 else 0.010) - (0.002 if polo else 0.0),
            ))))
        flap = []
        for c in range(N):
            cv = stand[c].co
            a = _ang(c)
            if polo:
                drop = 0.020 + (0.012 if c in (11, 13) else 0.0)
                out = Vector((math.cos(a), math.sin(a), 0.0)) * 0.012
            else:
                drop = 0.022 + (0.018 if c in (11, 13) else 0.0)
                out = Vector((math.cos(a), math.sin(a), 0.0)) * 0.010
            flap.append(bm.verts.new(Vector((cv.x + out.x, cv.y + out.y, cv.z - drop))))
        for c in range(N):
            c2 = (c + 1) % N
            quad((top_ring[c], top_ring[c2], stand[c2], stand[c]), "collar", 0.92)
            if c not in (11, 12):
                # the flap folds down, so orient it explicitly (outward from the neck axis)
                ref = Vector((0.0, 0.0, 0.5 * (stand[c].co.z + flap[c].co.z)))
                quad((stand[c], stand[c2], flap[c2], flap[c]), "collar", 1.0, out_ref=ref)
    elif collar == "turtle":
        # Neck tube (snug, stays under the jaw: top ≤ neck top − 5 mm), then a folded roll.
        z0 = top_ring[0].co.z
        z_top = min(neck_mn.z + 0.040, 1.442)
        tube_specs = [  # (z, offset from neck surface)
            (z0 + 0.35 * (z_top - z0), 0.0135),
            (z0 + 0.70 * (z_top - z0), 0.0140),
            (z_top, 0.0150),
        ]
        prev = top_ring
        for k, (tz, toff) in enumerate(tube_specs):
            ring = []
            for c in range(N):
                a = _ang(c)
                p = sampler.torso_point(a, tz, toff)
                p.z = tz
                ring.append(bm.verts.new(p))
            for c in range(N):
                c2 = (c + 1) % N
                quad((prev[c], prev[c2], ring[c2], ring[c]), "collar", 0.96 if k < 2 else 0.92)
            prev = ring
        lip = []
        for c in range(N):
            a = _ang(c)
            p = sampler.torso_point(a, z_top, 0.008)
            p.z = z_top + 0.002
            lip.append(bm.verts.new(p))
        for c in range(N):
            c2 = (c + 1) % N
            quad((prev[c], prev[c2], lip[c2], lip[c]), "collar", 0.80)
    elif collar is None:
        pass
    else:
        raise ValueError(collar)

    # --- sleeves ---------------------------------------------------------------------------
    if sleeve != "none":
        if sleeve_len is None:
            sleeve_len = ctx.wrist_s + 0.010 if sleeve == "long" else ctx.upper_arm_s * 0.96
        el_mn, el_mx = sampler.region_bounds("elbow_l")
        elbow_s = (0.5 * (el_mn + el_mx) - sampler.sh_l).length
        if sleeve_len > 0.25:
            s_steps = [0.032, 0.062, 0.115, elbow_s - 0.035, elbow_s, elbow_s + 0.035,
                       sleeve_len - 0.07, sleeve_len - max(0.02, cuff_len), sleeve_len]
        else:
            s_steps = [0.032, 0.062, 0.105, sleeve_len - max(0.018, cuff_len), sleeve_len]
        chest_wall_x = chest_mx.x + 0.008
        for side in (+1, -1):
            if side > 0:
                cols = [(R_ARM_BOT, 0), (R_ARM_BOT, 15), (R_BUST, 15), (R_ARM_MID, 15), (R_ARM_TOP, 15),
                        (R_ARM_TOP, 0), (R_ARM_TOP, 1), (R_ARM_MID, 1), (R_BUST, 1), (R_ARM_BOT, 1)]
            else:
                cols = [(R_ARM_BOT, 8), (R_ARM_BOT, 9), (R_BUST, 9), (R_ARM_MID, 9), (R_ARM_TOP, 9),
                        (R_ARM_TOP, 8), (R_ARM_TOP, 7), (R_ARM_MID, 7), (R_BUST, 7), (R_ARM_BOT, 7)]
            srings = [[rings[r][c] for r, c in cols]]
            for si, s_val in enumerate(s_steps):
                base_off = off_sleeve + (0.0095 if s_val <= 0.070 else 0.0)
                if si == len(s_steps) - 1:
                    base_off += cuff_flare
                elif si == len(s_steps) - 2:
                    base_off += cuff_flare * 0.4
                sring = []
                for k in range(10):
                    arm_ang = -math.pi * 0.5 + k * (2.0 * math.pi / 10.0)
                    ease = 0.0065 * max(0.0, -math.sin(arm_ang)) if s_val <= 0.070 else 0.0
                    pt = sampler.arm_point(side, s_val, arm_ang, base_off + ease)
                    if s_val <= 0.075:
                        pt.x = max(pt.x, chest_wall_x) if side > 0 else min(pt.x, -chest_wall_x)
                    sring.append(bm.verts.new(pt))
                srings.append(sring)
            for ri in range(len(srings) - 1):
                sr0, sr1 = srings[ri], srings[ri + 1]
                c0 = sum((v.co for v in sr0), Vector()) / len(sr0)
                c1 = sum((v.co for v in sr1), Vector()) / len(sr1)
                ring_mid = Vector((0.0, 0.0, 0.5 * (c0.z + c1.z))) if ri == 0 else 0.5 * (c0 + c1)
                is_cuff = ri == len(srings) - 2
                name, shade = ("cuff", 0.88) if is_cuff else ("sleeve", 1.0)
                if ri == 0:
                    name = "armhole" if "armhole" in parts else "sleeve"
                for k in range(10):
                    k2 = (k + 1) % 10
                    quad((sr0[k], sr0[k2], sr1[k2], sr1[k]), name, shade, out_ref=ring_mid)

    # --- surface details (interpolated over the torso quads, floated outward) -----------
    def surf(rf: float, cf: float, lift: float) -> Vector:
        r0 = max(0, min(len(rings) - 2, int(math.floor(rf))))
        tr = rf - r0
        c0 = int(math.floor(cf)) % N
        tc = cf - math.floor(cf)
        c1 = (c0 + 1) % N
        a = rings[r0][c0].co.lerp(rings[r0][c1].co, tc)
        b = rings[r0 + 1][c0].co.lerp(rings[r0 + 1][c1].co, tc)
        p = a.lerp(b, tr)
        # outward = horizontal radial blended with the local surface normal
        du = rings[r0][c1].co.lerp(rings[r0 + 1][c1].co, tr) - rings[r0][c0].co.lerp(rings[r0 + 1][c0].co, tr)
        dv = b - a
        n = du.cross(dv)
        radial = Vector((p.x, p.y, 0.0))
        if n.length < 1e-9:
            n = radial
        n.normalize()
        if n.dot(radial) < 0:
            n = -n
        return p + n * lift

    def _breaks(a: float, b: float) -> list[float]:
        # split at every integer (ring / column line) so straight decal edges never cut
        # through a convex crease of the shirt (e.g. across the bust)
        pts = [a] + [float(k) for k in range(int(math.floor(a)) + 1, int(math.ceil(b)))] + [b]
        return [p for i, p in enumerate(pts) if i == 0 or p - pts[i - 1] > 1e-4]

    def patch(r_a, r_b, c_a, c_b, name, shade, lift):
        rs = _breaks(r_a, r_b)
        cs = _breaks(c_a, c_b)
        grid = [[bm.verts.new(surf(rf, cf, lift)) for cf in cs] for rf in rs]
        for i in range(len(rs) - 1):
            for j in range(len(cs) - 1):
                face((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]), name, shade,
                     out_ref=Vector((0.0, 0.0, grid[i][j].co.z)))
        return grid

    if placket > 0.0:
        z_top = rings[-1][FRONT].co.z - 0.004
        z_bot = max(z_top - placket, rings[1][FRONT].co.z + 0.004)
        r_top = _row_at(rings, FRONT, z_top)
        r_bot = _row_at(rings, FRONT, z_bot)
        patch(r_bot, r_top, FRONT - 0.17, FRONT + 0.17, "placket", 0.93, 0.0025)
        for b in range(buttons):
            zb = z_top - (b + 0.6) * (z_top - z_bot) / (buttons + 0.2)
            rb = _row_at(rings, FRONT, zb)
            dr = 0.006 / max(1e-4, _row_height(rings, FRONT, rb))
            patch(rb - dr, rb + dr, FRONT - 0.05, FRONT + 0.05, "button", 1.0, 0.0045)

    if pocket:
        # character's left chest (+X, columns 13..14)
        r_lo = _row_at(rings, 13, z_bust - 0.005)
        r_hi = _row_at(rings, 13, z_arm_mid + 0.012)
        patch(r_lo, r_hi, 13.25, 13.95, "pocket", 0.90, 0.0025)
        r_flap = _row_at(rings, 13, z_arm_mid + 0.004)
        patch(r_flap, r_hi, 13.25, 13.95, "pocket", 0.82, 0.0040)

    if graphic:
        # colour-block chest print: bottom band (secondary), zig-zag middle, top band (accent)
        rows_f = [R_ARM_BOT + 0.15, float(R_BUST), float(R_ARM_MID), R_ARM_MID + 0.42]
        cs = [10.5, 11.0, 11.5, 12.0, 12.5, 13.0, 13.5]
        g = [[bm.verts.new(surf(rf, cf, 0.003)) for cf in cs] for rf in rows_f]
        z_lo, z_hi = g[0][2].co.z, g[3][2].co.z
        ref = Vector((0.0, 0.0, 0.5 * (z_lo + z_hi)))
        for j in range(len(cs) - 1):
            face((g[0][j], g[0][j + 1], g[1][j + 1], g[1][j]), "graphic_s", 1.0, ref)
            face((g[2][j], g[2][j + 1], g[3][j + 1], g[3][j]), "graphic_a", 1.0, ref)
            if j % 2 == 0:
                face((g[1][j], g[1][j + 1], g[2][j + 1]), "graphic_s", 1.0, ref)
                face((g[1][j], g[2][j + 1], g[2][j]), "graphic_a", 1.0, ref)
            else:
                face((g[1][j], g[1][j + 1], g[2][j]), "graphic_s", 1.0, ref)
                face((g[1][j + 1], g[2][j + 1], g[2][j]), "graphic_a", 1.0, ref)

    if bow:
        fr = rings[-1][FRONT].co
        knot_c = Vector((0.0, fr.y - 0.007, fr.z - 0.008))
        k = 0.009

        def bv(x, z, y_extra=0.0):
            return bm.verts.new(Vector((knot_c.x + x, knot_c.y - 0.002 + y_extra, knot_c.z + z)))

        ref = Vector((0.0, knot_c.y + 0.05, knot_c.z))
        kn = [bv(-k, -k), bv(k, -k), bv(k, k), bv(-k, k)]
        face(kn, "bow", 1.0, ref)
        for sgn in (1.0, -1.0):
            a1 = bv(sgn * 0.040, 0.016, 0.006)
            a2 = bv(sgn * 0.043, -0.014, 0.006)
            inner_top = kn[2] if sgn > 0 else kn[3]
            inner_bot = kn[1] if sgn > 0 else kn[0]
            face((inner_bot, a2, a1, inner_top) if sgn > 0 else (inner_top, a1, a2, inner_bot), "bow", 0.9, ref)
            t1 = bv(sgn * 0.010, -0.060, 0.008)
            t2 = bv(sgn * 0.024, -0.054, 0.008)
            face((inner_bot, t1, t2) if sgn > 0 else (inner_bot, t2, t1), "bow", 0.84, ref)

    paint_faces(bm, zones)
    ensure_outward_normals(bm)
    return bm


def _row_height(rings, c: int, rf: float) -> float:
    r0 = max(0, min(len(rings) - 2, int(math.floor(rf))))
    return max(1e-4, rings[r0 + 1][c % N].co.z - rings[r0][c % N].co.z)


def _row_at(rings, c: int, z: float) -> float:
    """Fractional ring index at height ``z`` along column ``c``."""
    c %= N
    for r in range(len(rings) - 1):
        z0 = rings[r][c].co.z
        z1 = rings[r + 1][c].co.z
        if z0 <= z <= z1 and z1 > z0:
            return r + (z - z0) / (z1 - z0)
    return 0.0 if z < rings[0][c].co.z else float(len(rings) - 1)


def _fit_kwargs(ctx, off_sleeve: float, off_hem: float, extra_offset=None) -> dict:
    base_fn = ctx.make_top_offset(off_sleeve, off_hem)
    offset_fn = base_fn if extra_offset is None else (lambda co: extra_offset(co, base_fn(co)))
    return {
        "offset_fn": offset_fn,
        "smooth_weight_iters": 1,
        "vert_region_filter_fn": ctx.top_region_filter,
        "delta_scale_fn": ctx.armhole_delta_fn,
    }


# ---------------------------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------------------------

P = "primary"
S = "secondary"
A = "accent"


def build_tshirt_v(ctx):
    bm = _build_top(
        ctx, parts={"body": ("white", P)}, sleeve="short", neck="v", v_depth=0.085, collar="rim",
    )
    return bm, _fit_kwargs(ctx, 0.0175, 0.0235)


def build_tshirt_graphic(ctx):
    bm = _build_top(
        ctx,
        parts={"body": ("white", P), "graphic_s": ("white", S), "graphic_a": ("white", A)},
        sleeve="short", neck="crew", collar="rim", graphic=True,
    )
    return bm, _fit_kwargs(ctx, 0.0175, 0.0235)


def build_polo(ctx):
    bm = _build_top(
        ctx,
        parts={"body": ("white", P), "collar": ("white", A), "cuff": ("white", A), "button": ("white", A)},
        sleeve="short", neck="shirt", collar="polo", cuff_len=0.022, placket=0.075, buttons=2,
    )
    return bm, _fit_kwargs(ctx, 0.0175, 0.0235)


def build_shirt_short(ctx):
    bm = _build_top(
        ctx,
        parts={"body": ("white", P), "collar": ("white", S), "cuff": ("white", P), "button": ("white", S)},
        sleeve="short", neck="shirt", collar="shirt", placket=0.40, buttons=5, pocket=True,
    )
    return bm, _fit_kwargs(ctx, 0.0175, 0.0235)


def build_blouse(ctx):
    bm = _build_top(
        ctx,
        parts={"body": ("white", P), "bow": ("white", A)},
        sleeve="short", sleeve_len=ctx.upper_arm_s * 0.78, neck="crew", collar="rim",
        off_sleeve=0.0165, cuff_flare=0.0035, bow=True,
    )
    return bm, _fit_kwargs(ctx, 0.0170, 0.0235)


def build_sweater(ctx):
    bm = _build_top(
        ctx,
        parts={"body": ("white", P), "hem": ("white", A), "cuff": ("white", A), "collar": ("white", A)},
        sleeve="long", neck="crew", collar="rim", off_hips=0.024, off_chest=0.0195, off_sleeve=0.0185,
        cuff_len=0.040, hem_rib=True,
    )
    return bm, _fit_kwargs(ctx, 0.0185, 0.024)


def build_vest_knit(ctx):
    bm = _build_top(
        ctx,
        parts={"body": ("white", P), "bib": ("white", S), "collar": ("white", S), "sleeve": ("white", S),
               "cuff": ("white", S), "armhole": ("white", S)},
        sleeve="long", neck="v", v_depth=0.090, collar="shirt", shirt_under=True, hem_rib=True,
        off_hips=0.024, off_chest=0.0195, off_sleeve=0.0175,
    )
    return bm, _fit_kwargs(ctx, 0.0175, 0.024)


def build_tank(ctx):
    bm = _build_top(
        ctx, parts={"body": ("white", P)}, sleeve="none", neck="scoop", scoop_front=0.075,
        scoop_back=0.035, side_pull=0.95, collar="rim",
    )
    return bm, _fit_kwargs(ctx, 0.0175, 0.0235)


def build_turtleneck(ctx):
    neck_mn, _ = ctx.sampler.region_bounds("neck")

    def neck_offset(co, base):
        return 0.0075 if co.z > neck_mn.z + 0.004 else base

    bm = _build_top(
        ctx, parts={"body": ("white", P)}, sleeve="long", neck="high", collar="turtle",
        off_hips=0.0235, off_chest=0.019, off_sleeve=0.0180, cuff_len=0.030,
    )
    return bm, _fit_kwargs(ctx, 0.0180, 0.0235, neck_offset)


BOTH = ("female", "male")
for _id, _fn, _bases in [
    ("top_tshirt_v_01", build_tshirt_v, BOTH),
    ("top_tshirt_graphic_01", build_tshirt_graphic, BOTH),
    ("top_polo_01", build_polo, BOTH),
    ("top_shirt_short_01", build_shirt_short, BOTH),
    ("top_blouse_01", build_blouse, ("female",)),
    ("top_sweater_01", build_sweater, BOTH),
    ("top_vest_knit_01", build_vest_knit, BOTH),
    ("top_tank_01", build_tank, BOTH),
    ("top_turtleneck_01", build_turtleneck, BOTH),
]:
    register(_id, "top", _bases, _fn)
