"""B4 bottoms + skirts (P08a-T06): chinos, joggers, mini / midi / pleated skirts.

Trousers reuse the starter pants skinning (``ctx._make_pants_callbacks``) on a local copy of the
lofted pants builder that adds hem variants (rolled cuff, elastic cuff) and per-ring leg offsets.

Skirts are one lofted tube: a waistband like the trousers (tops overlap it), then rings that hug
the convex hull of hips + both legs and flare monotonically to a ring hem. They are skinned with
the leg blend of phase-08a §3.3, adapted here (``_skirt_leg_weights``): the panel over / outside
each thigh follows that thigh (so sitting puts the skirt on the lap and walking opens it), the
centre between the legs blends ``Hips`` with both ``UpLeg`` bones, and below the knee the panel
over each leg hands over to the shin bone so a seated midi drapes over the knees.
"""

from __future__ import annotations

import math

import bmesh
from mathutils import Vector

from lib.garments import add_quad, ensure_outward_normals, paint_faces
from items_skinned import register

FaceZones = list[tuple[bmesh.types.BMFace, str, str, float]]


def _clamp01(v: float) -> float:
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else v)


def _smooth(v: float) -> float:
    v = _clamp01(v)
    return v * v * (3.0 - 2.0 * v)


# ---------------------------------------------------------------------------
# Trousers (copy of lib.garments._build_bottom_mesh with hem variants)
# ---------------------------------------------------------------------------


def _build_pants(
    ctx,
    *,
    z_cuff: float,
    waist_offset: float,
    leg_offset_fn,
    hem: list[tuple[float, float, str, float]],
    swatch: str,
    waist_tint: str = "primary",
    accent_swatch: str = "c_charcoal",
):
    """Waistband + hips + two 12-sided legs; ``hem`` lists the bottom rings as
    ``(height above z_cuff, extra offset, tint of the band below, shade of the band below)``,
    top to bottom, ending at height 0."""
    sampler = ctx.sampler
    bm = bmesh.new()
    zones: FaceZones = []

    hips_mn, hips_mx = sampler.region_bounds("hips")
    belly_mn, _ = sampler.region_bounds("belly")
    z_waist = max(hips_mx.z + 0.028, belly_mn.z - 0.012)
    z_pelvis_split = hips_mn.z + 0.008
    leg_top_off = leg_offset_fn(hips_mn.z)

    N = 20
    pelvis_z = (
        z_waist,
        z_waist - 0.022,
        (hips_mn.z + hips_mx.z) * 0.5 + 0.020,
        hips_mn.z + 0.042,
        z_pelvis_split,
    )
    rings: list[list[bmesh.types.BMVert]] = []
    for idx, pz in enumerate(pelvis_z):
        if idx == 0:
            off = waist_offset + 0.002
        elif idx == 1:
            off = waist_offset
        elif idx == 2:
            off = max(waist_offset + 0.003, leg_top_off)
        else:
            off = max(waist_offset + 0.003, leg_top_off) + 0.0045
        ring = []
        for c in range(N):
            ang = 2.0 * math.pi * c / N
            pt = sampler.torso_point(ang, pz, off) if idx <= 1 else sampler.pelvis_ext_point(ang, pz, off)
            ring.append(bm.verts.new(pt))
        rings.append(ring)

    for r in range(len(rings) - 1):
        is_band = r == 0
        tint = waist_tint if is_band else "primary"
        sw = swatch if tint == "primary" else accent_swatch
        shade = 0.86 if (is_band and tint == "primary") else 1.0
        out_c = Vector((0.0, 0.0, 0.5 * (rings[r][0].co.z + rings[r + 1][0].co.z)))
        for c in range(N):
            c2 = (c + 1) % N
            add_quad(bm, (rings[r][c], rings[r][c2], rings[r + 1][c2], rings[r + 1][c]), zones, sw,
                     tint=tint, shade=shade, out_ref=out_c)

    split = rings[-1]
    z_crotch = hips_mn.z - 0.032
    z_leg_top = hips_mn.z - 0.044
    v_fc = bm.verts.new(Vector((0.0, split[15].co.y * 0.72, z_crotch + 0.002)))
    v_cc = bm.verts.new(Vector((0.0, 0.005, z_crotch - 0.002)))
    v_bc = bm.verts.new(Vector((0.0, split[5].co.y * 0.72, z_crotch + 0.002)))
    crotch_c = Vector((0.0, 0.0, z_crotch + 0.04))
    for vs in ((split[14], split[15], v_fc), (split[15], split[16], v_fc),
               (split[4], split[5], v_bc), (split[5], split[6], v_bc)):
        try:
            f = bm.faces.new(vs)
        except ValueError:
            continue
        f.smooth = False
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - crotch_c) < 0.0:
            f.normal_flip()
        zones.append((f, swatch, "primary", 0.90))

    left_top = [split[16], split[17], split[18], split[19], split[0], split[1], split[2], split[3], split[4],
                v_bc, v_cc, v_fc]
    right_top = [split[6], split[7], split[8], split[9], split[10], split[11], split[12], split[13], split[14],
                 v_fc, v_cc, v_bc]

    knee_mid_z = ctx.knee_mid_z
    hem_top = max(h for h, _o, _t, _s in hem)
    leg_zs_raw = sorted(
        {
            round(sampler.body.verts_basis[vi].z, 3)
            for vi in sampler.body.ext_vert_indices
            if sampler.body.vert_regions[vi] in ("thigh_l", "knee_l", "shin_l", "ankle_l")
        },
        reverse=True,
    )
    interior = [z for z in leg_zs_raw if z_cuff + hem_top + 0.030 < z < z_leg_top - 0.035]
    for kz in (knee_mid_z + 0.035, knee_mid_z, knee_mid_z - 0.035):
        if z_cuff + hem_top + 0.030 < kz < z_leg_top - 0.035:
            interior.append(round(kz, 3))
    interior.sort(reverse=True)
    dedup: list[float] = []
    for z in interior:
        gap = 0.028 if abs(z - knee_mid_z) <= 0.042 else 0.045
        if not dedup or abs(dedup[-1] - z) >= gap:
            dedup.append(z)
    # (z, extra offset, tint/shade of the band ABOVE this ring)
    stops: list[tuple[float, float]] = [(z_leg_top, 0.0)] + [(z, 0.0) for z in dedup]
    stops += [(z_cuff + h, extra) for h, extra, _t, _s in hem]
    band_style = [("primary", 1.0)] * (len(stops) - len(hem)) + [(t, s) for _h, _e, t, s in hem]

    left_angles = [-1.5708, -1.1781, -0.7854, -0.3927, 0.0, 0.3927, 0.7854, 1.1781, 1.5708, 2.62, math.pi, -2.62]
    right_angles = [1.5708, 1.9635, 2.3562, 2.7489, math.pi, -2.7489, -2.3562, -1.9635, -1.5708, -0.52, 0.0, 0.52]
    left_verts: set = set()
    right_verts: set = set()
    for side, top_loop, angs in ((+1, left_top, left_angles), (-1, right_top, right_angles)):
        leg_rings = [top_loop]
        for lz, extra in stops:
            upper_t = _clamp01((lz - (knee_mid_z + 0.08)) / 0.24)
            off = leg_offset_fn(lz) + 0.005 * upper_t + extra
            knee_prox = max(0.0, 1.0 - abs(lz - knee_mid_z) / 0.045)
            lring = []
            for a in angs:
                front_bias = max(0.0, -math.sin(a)) * 0.008 * knee_prox
                pt = sampler.leg_point(side, a, lz, off + front_bias)
                pt.x = max(pt.x, 0.0015) if side > 0 else min(pt.x, -0.0015)
                v = bm.verts.new(pt)
                (left_verts if side > 0 else right_verts).add(v)
                lring.append(v)
            leg_rings.append(lring)
        for r in range(len(leg_rings) - 1):
            tint, shade = band_style[r]
            z_mid = 0.5 * (sum(v.co.z for v in leg_rings[r]) / 12 + sum(v.co.z for v in leg_rings[r + 1]) / 12)
            cx, cy = sampler.leg_xy_center_at_z(side, z_mid)
            ref = Vector((cx, cy, z_mid))
            sw = swatch if tint == "primary" else accent_swatch
            for k in range(12):
                k2 = (k + 1) % 12
                add_quad(bm, (leg_rings[r][k], leg_rings[r][k2], leg_rings[r + 1][k2], leg_rings[r + 1][k]),
                         zones, sw, tint=tint, shade=shade, out_ref=ref)

    paint_faces(bm, zones)
    ensure_outward_normals(bm, recalc=False)
    bm.verts.index_update()
    return bm, {v.index for v in left_verts if v.is_valid}, {v.index for v in right_verts if v.is_valid}


def _pants_fit(ctx, bm, left_vis, right_vis, waist_off=0.0095, leg_off=0.0175):
    p_filter, p_clamp, p_weights = ctx._make_pants_callbacks(left_vis, right_vis)
    return bm, {
        "offset_fn": ctx.make_pants_offset(waist_off, leg_off),
        "smooth_weight_iters": 1,
        "vert_region_filter_fn": p_filter,
        "post_push_fn": p_clamp,
        "weight_override_fn": p_weights,
    }


def build_chinos(ctx):
    # Slim casual trousers, cropped a little above the ankle with a rolled cuff.
    def leg_off(z: float) -> float:
        return 0.0165

    bm, lv, rv = _build_pants(
        ctx,
        z_cuff=ctx.ankle_mn.z + 0.022,
        waist_offset=0.0105,
        leg_offset_fn=leg_off,
        hem=[
            (0.050, 0.0, "primary", 0.80),    # band above the roll's top lip
            (0.045, 0.0060, "primary", 0.80),  # slanted lip: the roll's upper edge
            (0.0, 0.0068, "primary", 0.88),    # the roll itself
        ],
        swatch="c_khaki",
    )
    return _pants_fit(ctx, bm, lv, rv, leg_off=0.0165)


def build_joggers(ctx):
    # Roomy thigh tapering to an elastic ankle cuff (accent) with a gathered blouse above it.
    knee = ctx.knee_mid_z

    def leg_off(z: float) -> float:
        if z >= knee:
            return 0.0200
        return 0.0140 + 0.0060 * _clamp01((z - (knee - 0.30)) / 0.30)

    bm, lv, rv = _build_pants(
        ctx,
        z_cuff=ctx.ankle_mn.z + 0.020,
        waist_offset=0.0105,
        leg_offset_fn=leg_off,
        hem=[
            (0.085, 0.0050, "primary", 1.0),
            (0.052, 0.0065, "primary", 1.0),   # blouse over the cuff
            (0.046, 0.0005, "primary", 0.82),  # gathered step into the cuff
            (0.0, 0.0, "accent", 1.0),          # elastic cuff
        ],
        swatch="c_grey",
        waist_tint="accent",
        accent_swatch="c_charcoal",
    )
    return _pants_fit(ctx, bm, lv, rv, waist_off=0.0095, leg_off=0.0185)


# ---------------------------------------------------------------------------
# Skirts
# ---------------------------------------------------------------------------

_SKIRT_REGIONS = ("belly", "hips", "thigh_l", "thigh_r", "knee_l", "knee_r", "shin_l", "shin_r", "ankle_l", "ankle_r")


def _hull_support(ctx, z: float, band: float, dirs: list[tuple[float, float]]) -> list[float]:
    """Support function of the body cross-section (hips + both legs) over ``[z - band, z]``.

    The exterior surface is sliced exactly at ``z`` and ``z - band`` (the low-poly legs have few
    vertex rings), plus every exterior vertex in between."""
    body = ctx.body
    vb = body.verts_basis
    regs = body.vert_regions
    pts: list[Vector] = [vb[vi] for vi in body.ext_vert_indices if regs[vi] in _SKIRT_REGIONS and z - band <= vb[vi].z <= z]
    for zc in (z, z - band):
        for tri in body.ext_tris:
            if not any(regs[i] in _SKIRT_REGIONS for i in tri):
                continue
            for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
                za, zb = vb[a].z, vb[b].z
                if (za - zc) * (zb - zc) < 0.0:
                    t = (zc - za) / (zb - za)
                    pts.append(vb[a].lerp(vb[b], t))
    return [max(p.x * dx + p.y * dy for p in pts) for dx, dy in dirs]


def _polygon_from_support(h: list[float], dirs: list[tuple[float, float]], z: float) -> list[Vector]:
    """Corners of the polygon whose edge i lies on the support line of direction i.
    Corner i sits between directions i and i+1 (angle (i + 0.5) * step)."""
    n = len(h)
    out = []
    for i in range(n):
        j = (i + 1) % n
        a1, b1 = dirs[i]
        a2, b2 = dirs[j]
        det = a1 * b2 - a2 * b1
        x = (h[i] * b2 - h[j] * b1) / det
        y = (a1 * h[j] - a2 * h[i]) / det
        out.append(Vector((x, y, z)))
    return out


def _build_skirt(
    ctx,
    *,
    z_hem: float,
    ring_zs: list[float],
    n: int,
    hip_off: float,
    flare: float,
    swatch: str,
    yoke: float = 0.0125,
    waist_tint: str = "primary",
    accent_swatch: str = "c_black",
    pleat_amp: float = 0.0,
    pleat_z0: float = 0.0,
    pleat_z1: float = 0.0,
):
    """Waistband (2 rings at the trouser waist) + hull-hugging hip rings + A-line flare + ring hem."""
    sampler = ctx.sampler
    bm = bmesh.new()
    zones: FaceZones = []
    hips_mn, hips_mx = sampler.region_bounds("hips")
    belly_mn, _ = sampler.region_bounds("belly")
    z_waist = max(hips_mx.z + 0.028, belly_mn.z - 0.012)

    step = 2.0 * math.pi / n
    # Support directions are offset by half a step so corners land on the waistband angles.
    dirs = [(math.cos((i - 0.5) * step), math.sin((i - 0.5) * step)) for i in range(n)]

    rings: list[list[bmesh.types.BMVert]] = []
    # Waistband rings follow the torso like the trousers (offset 10-11.5 mm).
    for z, off in ((z_waist, 0.0115), (z_waist - 0.022, 0.0105)):
        ring = []
        for c in range(n):
            pt = sampler.torso_point(c * step, z, off)
            ring.append(bm.verts.new(pt))
        rings.append(ring)

    z_top_hull = ring_zs[0]
    z_hip_wide = max(z for z in ring_zs if z <= (hips_mn.z + hips_mx.z) * 0.5 + 0.02)
    prev_h: list[float] | None = None
    h_wide: list[float] | None = None
    zs_all = list(ring_zs) + [z_hem + 0.024, z_hem]
    for idx, z in enumerate(zs_all):
        hull = _hull_support(ctx, z, 0.06, dirs)
        if z >= z_hip_wide:
            # Yoke: just outside the hips; tops (hem offset >= 23 mm at z <= 1.0) stay outside.
            t_y = _clamp01((z_top_hull - z) / max(1e-4, z_top_hull - z_hip_wide))
            h = [hv + yoke + (hip_off - yoke) * t_y for hv in hull]
        else:
            t = _clamp01((z_hip_wide - z) / max(1e-4, z_hip_wide - z_hem))
            h = [max(hv + hip_off, hw + flare * t) for hv, hw in zip(hull, h_wide)]
        if prev_h is not None and z < z_hip_wide:
            h = [max(a, b + 0.001) for a, b in zip(h, prev_h)]  # A-line: never narrower going down
        if idx == len(zs_all) - 1:
            h = [hv + 0.003 for hv in h]  # hem ring flips out slightly: reads as a turned hem
        if abs(z - z_hip_wide) < 1e-6:
            h_wide = list(h)
        prev_h = h
        corners = _polygon_from_support(h, dirs, z)
        if pleat_amp > 0.0 and z < pleat_z0:
            amp = pleat_amp * _clamp01((pleat_z0 - z) / max(1e-4, pleat_z0 - pleat_z1))
            for c in range(1, n, 2):
                p = corners[c]
                r = Vector((p.x, p.y, 0.0))
                if r.length > 1e-6:
                    corners[c] = p + r.normalized() * amp
        rings.append([bm.verts.new(p) for p in corners])

    last = len(rings) - 2
    for r in range(len(rings) - 1):
        is_band = r == 0
        tint = waist_tint if is_band else "primary"
        sw = swatch if tint == "primary" else accent_swatch
        if is_band:
            shade = 0.86 if tint == "primary" else 1.0
        elif r == last:
            shade = 0.84
        else:
            shade = 1.0
        out_c = Vector((0.0, 0.0, 0.5 * (rings[r][0].co.z + rings[r + 1][0].co.z)))
        for c in range(n):
            c2 = (c + 1) % n
            add_quad(bm, (rings[r][c], rings[r][c2], rings[r + 1][c2], rings[r + 1][c]), zones, sw,
                     tint=tint, shade=shade, out_ref=out_c)

    paint_faces(bm, zones)
    ensure_outward_normals(bm, recalc=False)
    bm.verts.index_update()
    return bm


def _skirt_leg_weights(
    ctx,
    *,
    centre_front_hips: float = 0.15,
    centre_back_hips: float = 0.2,
    over_leg_hips: float = 0.05,
    gap_x: float = 0.06,
    ramp_m: float = 0.07,
    knee_band: float = 0.06,
):
    """Leg-blend skinning (phase-08a §3.3, adapted from ``lib.garments.skirt_weights``).

    Below the hip pivot each vertex fades (over ``ramp_m``) from ``Hips`` into the legs. Over and
    outside each thigh (``|x| >= gap_x``) the nearer ``UpLeg`` takes ``1 - over_leg_hips``; in the gap
    between the thighs the share falls to ``1 - centre_*_hips`` split evenly over both legs (front
    and back differ so a seated skirt lies on the lap while the back stays under the seat). Around
    the knee the near-leg share moves from ``UpLeg`` to ``Leg`` so long hems drape over bent knees.
    At most 4 influences (Hips, near UpLeg, near Leg, far UpLeg).
    """
    pivot = ctx.hip_pivot_z
    knee = ctx.knee_mid_z
    chest_mn = ctx.chest_mn
    hips_mx = ctx.hips_mx
    y_mid = 0.5 * (ctx.hips_mn.y + ctx.hips_mx.y)

    def fn(co: Vector, _vi: int, w: list[tuple[str, float]]) -> list[tuple[str, float]]:
        if co.z >= pivot:
            if co.z < chest_mn.z - 0.02 or co.z < hips_mx.z + 0.08:
                no_arm = [(b, v) for b, v in w if "Arm" not in b and "Hand" not in b]
                return no_arm or [("Spine", 0.5), ("Hips", 0.5)]
            return w
        t = _smooth((pivot - co.z) / ramp_m)
        p = _smooth(abs(co.x) / gap_x)  # 0 at the centre line, 1 over / outside a thigh
        front = _smooth((y_mid - co.y) / 0.08 + 0.5)
        centre_hips = centre_back_hips + (centre_front_hips - centre_back_hips) * front
        leg_total = (1.0 - centre_hips) + ((1.0 - over_leg_hips) - (1.0 - centre_hips)) * p
        near = leg_total * (0.5 + 0.5 * p)
        far = leg_total - near
        near *= t
        far *= t
        hips = 1.0 - near - far
        k = _smooth((knee + knee_band - co.z) / (2.0 * knee_band)) * p
        is_left = co.x >= 0.0
        up_n, lo_n = ("LeftUpLeg", "LeftLeg") if is_left else ("RightUpLeg", "RightLeg")
        up_f = "RightUpLeg" if is_left else "LeftUpLeg"
        return [("Hips", hips), (up_n, near * (1.0 - k)), (lo_n, near * k), (up_f, far)]

    return fn


def _skirt_region_filter(ctx):
    hips_mn = ctx.hips_mn
    torso = {"belly", "hips"}
    lower = {"hips", "thigh_l", "thigh_r", "knee_l", "knee_r", "shin_l", "shin_r"}

    def fn(co: Vector, _vi: int) -> set[str] | None:
        return torso if co.z >= hips_mn.z - 0.01 else lower

    return fn


def _skirt_fit(ctx, bm, weights_fn):
    hips_mx = ctx.hips_mx

    def offset_fn(co: Vector) -> float:
        return 0.0095 if co.z >= hips_mx.z - 0.005 else 0.0120

    return bm, {
        "offset_fn": offset_fn,
        "smooth_weight_iters": 1,
        "vert_region_filter_fn": _skirt_region_filter(ctx),
        "weight_override_fn": weights_fn,
    }


def _hip_rings(ctx) -> list[float]:
    hips_mn, hips_mx = ctx.hips_mn, ctx.hips_mx
    return [
        hips_mx.z - 0.025,                       # yoke top (just under the top hem line)
        (hips_mn.z + hips_mx.z) * 0.5 + 0.020,   # hip widest
        hips_mn.z + 0.020,
    ]


def build_skirt_mini(ctx):
    z_hem = ctx.hips_mn.z - 0.150
    rings = _hip_rings(ctx) + [ctx.hips_mn.z - 0.060]
    # Yoke 18 mm (was 30): the top ring sits at the shortest top hem line, and tops are only 17-24 mm thick there.
    bm = _build_skirt(ctx, z_hem=z_hem, ring_zs=rings, n=24, hip_off=0.030, flare=0.070, swatch="c_denim", yoke=0.018)
    return _skirt_fit(ctx, bm, _skirt_leg_weights(ctx))


def build_skirt_midi(ctx):
    knee = ctx.knee_mid_z
    z_hem = knee - 0.170
    rings = _hip_rings(ctx) + [ctx.hips_mn.z - 0.070, ctx.hips_mn.z - 0.160, knee + 0.110, knee + 0.045,
                               knee - 0.020, knee - 0.090]
    bm = _build_skirt(ctx, z_hem=z_hem, ring_zs=rings, n=24, hip_off=0.016, flare=0.060, swatch="c_navy",
                      waist_tint="accent", accent_swatch="c_black")
    return _skirt_fit(ctx, bm, _skirt_leg_weights(ctx))


def build_skirt_pleated(ctx):
    knee = ctx.knee_mid_z
    z_hem = knee + 0.010
    hips_mn = ctx.hips_mn
    rings = _hip_rings(ctx) + [hips_mn.z - 0.060, hips_mn.z - 0.150, knee + 0.110]
    bm = _build_skirt(ctx, z_hem=z_hem, ring_zs=rings, n=40, hip_off=0.016, flare=0.050, swatch="c_maroon",
                      pleat_amp=0.014, pleat_z0=hips_mn.z + 0.030, pleat_z1=hips_mn.z - 0.080)
    return _skirt_fit(ctx, bm, _skirt_leg_weights(ctx))


register("bottom_chinos_01", "bottom", ("female", "male"), build_chinos)
register("bottom_joggers_01", "bottom", ("female", "male"), build_joggers)
register("bottom_skirt_mini_01", "bottom", ("female",), build_skirt_mini, meta={"maxStride": 1.0})
register("bottom_skirt_midi_01", "bottom", ("female",), build_skirt_midi, meta={"maxStride": 0.85})
register("bottom_skirt_pleated_01", "bottom", ("female",), build_skirt_pleated, meta={"maxStride": 0.9})
