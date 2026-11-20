"""B5 fullbody + outer garments (P08a-T07).

Fullbody: office shirt dress (female), ao dai, jumpsuit, suit set. Outer: blazer, cardigan, bomber,
raincoat. Everything is built from three parametric pieces defined here (variants of the shared
``lib.garments`` builders, which stay untouched):

- ``_torso``: a 16-column lofted torso tube + two 10-sided bridged sleeves, with optional V opening
  (open or filled with a shirt bib), lapels, collar styles (stand / roll / rib / shirt / hood) and
  extra rings below the hips (pelvis envelope or skirt ellipses).
- ``_pants``: the starter trouser loft with configurable leg stops and a wide-leg flare.
- ``_panel``: an ao dai panel, a closed "lens" slab (outer + inner surface sharing their rim) that
  hangs from the waist in front of or behind the legs.

Every vertex carries a part tag; the fitting callbacks (region filter, minimum offset, weights)
dispatch on it. Skirt-like parts use the leg blend: dress / raincoat hems take the starter dress's
front-lap weights, ao dai panels a sharp per-leg blend that also bends below the knee.

Layering: outer layers sit at >= 32 mm (torso) / >= 27 mm (sleeves) from the body so they clear the
thickest top (hoodie, ~24 / ~19 mm); hems sit wider still.
"""

from __future__ import annotations

import math
from types import SimpleNamespace

import bmesh
from mathutils import Vector

from items_skinned import register
from lib.garments import add_quad, ensure_outward_normals, paint_faces

N = 16
FC = 12  # centre-front column (angle -90 deg: the character faces -Y)
TAU = 2.0 * math.pi
NONE = "none"


def _cl(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _key(co: Vector) -> tuple[int, int, int]:
    return (round(co.x * 1e5), round(co.y * 1e5), round(co.z * 1e5))


# ---------------------------------------------------------------------------
# Geometry container with part tags
# ---------------------------------------------------------------------------


class _G:
    def __init__(self) -> None:
        self.bm = bmesh.new()
        self.fz: list = []
        self.tag: dict = {}
        self.req: dict = {}

    def v(self, co: Vector, tag: str, req: float = 0.0):
        vert = self.bm.verts.new(co)
        self.tag[vert] = tag
        self.req[vert] = req
        return vert

    def q(self, vs, swatch: str, tint: str = "primary", shade: float = 1.0, ref: Vector | None = None, inward: bool = False):
        f = add_quad(self.bm, vs, self.fz, swatch, tint, shade, ref)
        if f is not None and inward and ref is not None:
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - ref) > 0.0:
                f.normal_flip()
        return f

    def finish(self):
        paint_faces(self.bm, self.fz)
        ensure_outward_normals(self.bm)
        self.bm.verts.index_update()
        tags: dict[str, set[int]] = {}
        reqs: dict[tuple[int, int, int], float] = {}
        for v in self.bm.verts:
            tags.setdefault(self.tag.get(v, "torso"), set()).add(v.index)
            reqs[_key(v.co)] = self.req.get(v, 0.0)
        return tags, reqs


def _button(g: _G, p: Vector, n: Vector, size: float, swatch: str, tint: str = "accent", tag: str = "deco") -> None:
    """Small flat square facing ``n``, floating 2 mm off the surface point ``p``."""
    n = Vector((n.x, n.y, 0.0)).normalized()
    side = Vector((0.0, 0.0, 1.0)).cross(n).normalized()
    up = Vector((0.0, 0.0, 1.0))
    c = p + n * 0.002
    h = size * 0.5
    vs = [g.v(c + (-side - up) * h, tag), g.v(c + (side - up) * h, tag), g.v(c + (side + up) * h, tag), g.v(c + (-side + up) * h, tag)]
    g.q(vs, swatch, tint, 1.0, ref=c - n)


def _patch(g: _G, corners: list[Vector], n: Vector, swatch: str, tint: str, shade: float, lift: float = 0.0025, tag: str = "deco") -> None:
    """Flat quad (pocket flap, tie, badge) floating ``lift`` along ``n``."""
    n = Vector((n.x, n.y, n.z)).normalized()
    vs = [g.v(c + n * lift, tag) for c in corners]
    cen = sum((c for c in corners), Vector()) / 4.0
    g.q(vs, swatch, tint, shade, ref=cen - n)


# ---------------------------------------------------------------------------
# Measurements
# ---------------------------------------------------------------------------


def _zs(ctx) -> SimpleNamespace:
    s = ctx.sampler
    chest_mn, chest_mx = ctx.chest_mn, ctx.chest_mx
    neck_mn, _ = s.region_bounds("neck")
    belly_mn, belly_mx = s.region_bounds("belly")
    _amn, arm_mx = s.region_bounds("upper_arm_l")
    shin_mn, _ = s.region_bounds("shin_l")
    return SimpleNamespace(
        arm_bot=chest_mn.z + 0.015,
        bust=chest_mn.z + 0.055,
        arm_mid=(chest_mn.z + chest_mx.z) * 0.5 + 0.01,
        arm_top=max(chest_mx.z + 0.012, arm_mx.z + 0.010),
        neck_mn=neck_mn.z,
        neck_top=max(neck_mn.z + 0.006, chest_mx.z + 0.014),
        waist=0.5 * (belly_mn.z + belly_mx.z),
        belly_mn=belly_mn.z,
        hips_mn=ctx.hips_mn.z,
        hips_mx=ctx.hips_mx.z,
        hip_mid=0.5 * (ctx.hips_mn.z + ctx.hips_mx.z),
        knee=ctx.knee_mid_z,
        knee_mn=ctx.knee_mn.z,
        ankle=ctx.ankle_mn.z,
        shin_mn=shin_mn.z,
    )


def _front_point(ctx, x: float, z: float, off: float) -> Vector:
    """Torso surface point straight in front (-Y) at (x, z), pushed ``off`` along its horizontal normal."""
    s = ctx.sampler
    qz = min(z, ctx.chest_mx.z - 0.004)
    loc, norm, idx, _d = s.torso_bvh.ray_cast(Vector((x, -0.45, qz)), Vector((0.0, 1.0, 0.0)), 0.6)
    if idx is None or loc is None:
        ang = math.atan2(-0.1, x)
        p = s.torso_point(ang, qz, off)
        p.z = z
        return p
    n = Vector((norm.x, norm.y, 0.0)) if norm is not None else Vector((0.0, -1.0, 0.0))
    if n.length < 1e-6 or n.normalized().dot(Vector((0.0, -1.0, 0.0))) < 0.2:
        n = Vector((0.0, -1.0, 0.0))
    p = Vector((loc.x, loc.y, z)) + n.normalized() * off
    return p


def _ring_point(ctx, ang: float, z: float, off: float, mode: str, ell=None) -> Vector:
    s = ctx.sampler
    if mode == "torso":
        p = s.torso_point(ang, min(z, ctx.chest_mx.z - 0.004), off)
    elif mode == "pelvis":
        p = s.pelvis_ext_point(ang, z, off)
    else:  # ellipse (skirt) ring, never inside the pelvis envelope while it still exists
        rx, ryf, ryb = ell
        ry = ryf if math.sin(ang) < 0 else ryb
        # Superellipse (exponent 2.6) so diagonals enclose the knees as well as the axes.
        c, sn = math.cos(ang), math.sin(ang)
        e = 2.6
        r_ang = 1.0 / ((abs(c) / rx) ** e + (abs(sn) / ry) ** e) ** (1.0 / e)
        p = Vector((c * r_ang, sn * r_ang, z))
        if z >= ctx.hips_mn.z - 0.03:
            q = s.pelvis_ext_point(ang, z, off)
            if q.xy.length > p.xy.length:
                p.x, p.y = q.x, q.y
    p.z = z
    return p


# ---------------------------------------------------------------------------
# Torso + sleeves
# ---------------------------------------------------------------------------


def _torso(
    g: _G,
    ctx,
    *,
    lower: list[dict],
    off_chest: float,
    swatch: str,
    tint: str = "primary",
    scoop: float = 0.05,
    v: dict | None = None,
    collar: dict | None = None,
    sleeve_steps: list[float] = (),
    sleeve_off: float = 0.0175,
    first_ring_extra: float = 0.0095,
    cuff: dict | None = None,
    shoulder_pad: float = 0.0,
    back_ease: float = 0.0,
    skirt_below: float | None = None,
    side_x_scale: float = 0.72,
) -> SimpleNamespace:
    """Lofted torso (``lower`` rings below the armpit + 4 armpit rings + neck ring) and sleeves.

    ``lower``: ascending ring dicts ``{z, off, mode='torso'|'pelvis'|'ellipse', ell, shade, tint, swatch}``;
    a ring's band style applies to the quads from it up to the next ring.
    ``v``: ``{z, x0, x1, drop, open, lapel, lapel_shade, bib_swatch, bib_tint, lapel_out}``.
    ``collar``: ``{kind: stand|roll|rib|shirt|hood, h, off, swatch, tint, shade}``.
    ``skirt_below``: vertices of rings below this z are tagged ``skirt``.
    """
    s = ctx.sampler
    Z = _zs(ctx)
    chest_mx = ctx.chest_mx
    upper = [
        {"z": Z.arm_bot, "off": off_chest},
        {"z": Z.bust, "off": off_chest + 0.001},
        {"z": Z.arm_mid, "off": off_chest},
        {"z": Z.arm_top, "off": off_chest + 0.002 + shoulder_pad},
    ]
    specs = [dict(r) for r in lower] + upper
    r_arm_bot = len(lower)
    r_bust, r_arm_mid, r_arm_top = r_arm_bot + 1, r_arm_bot + 2, r_arm_bot + 3

    rings: list[list] = []
    for ri, sp in enumerate(specs):
        mode = sp.get("mode", "torso")
        tag = "skirt" if (skirt_below is not None and sp["z"] < skirt_below) else "torso"
        ring = []
        for c in range(N):
            ang = TAU * c / N
            p = _ring_point(ctx, ang, sp["z"], sp["off"], mode, sp.get("ell"))
            if ri == r_arm_top and back_ease > 0.0 and math.sin(ang) > 0.2:
                p.y += back_ease
            ring.append(g.v(p, tag, req=min(sp["off"], 0.012) if mode != "ellipse" else 0.0))
        rings.append(ring)

    # Neck ring (same rule as the starter tops; sides pulled in towards the neck).
    neck_off = off_chest + 0.002
    neck_ring = []
    for c in range(N):
        ang = TAU * c / N
        frontness = max(0.0, -math.sin(ang))
        z_cur = max(Z.neck_top - scoop * (frontness ** 1.4), chest_mx.z + 0.0085)
        pt = s.torso_point(ang, min(z_cur, Z.neck_mn), neck_off)
        if abs(math.cos(ang)) > 0.35:
            pt.x *= side_x_scale
            pt.z = max(pt.z, Z.neck_top - 0.004)
        else:
            pt.z = z_cur
        neck_ring.append(g.v(pt, "torso", req=0.010))
    rings.append(neck_ring)
    r_neck = len(rings) - 1

    # V opening / bib: move columns 11 and 13 onto straight V edges from the V point up to the neck.
    r_v = None
    if v is not None:
        r_v = min(range(r_arm_top), key=lambda i: abs(specs[i]["z"] - v["z"]))
        z_v = specs[r_v]["z"]
        z_nk = neck_ring[11].co.z
        x1 = v.get("x1", abs(neck_ring[11].co.x))
        for ri in range(r_v, r_neck + 1):
            zr = rings[ri][11].co.z
            t = _cl((zr - z_v) / max(1e-4, z_nk - z_v))
            x = v.get("x0", 0.012) + (x1 - v.get("x0", 0.012)) * t
            off = specs[ri]["off"] if ri < r_neck else neck_off
            off += v.get("lapel_out", 0.0) * (1.0 - 0.5 * t)
            for c, sx in ((11, 1.0), (13, -1.0)):
                # col 11 sits at angle 247.5 deg (x < 0), col 13 at 292.5 deg (x > 0)
                p = _front_point(ctx, -sx * x, zr, off)
                if ri == r_neck:
                    p.z = zr
                rings[ri][c].co = p
        rings[r_v][FC].co.z -= v.get("drop", 0.02)
        if not v.get("open", True):
            # Filled V (shirt bib): recess the centre column a little.
            for ri in range(r_v + 1, r_neck + 1):
                cv = rings[ri][FC]
                p = _front_point(ctx, 0.0, cv.co.z, (specs[ri]["off"] if ri < r_neck else neck_off) - 0.004)
                cv.co.x, cv.co.y = p.x, p.y

    left_skip = {(r_arm_bot, 15), (r_arm_bot, 0), (r_bust, 15), (r_bust, 0), (r_arm_mid, 15), (r_arm_mid, 0)}
    right_skip = {(r_arm_bot, 7), (r_arm_bot, 8), (r_bust, 7), (r_bust, 8), (r_arm_mid, 7), (r_arm_mid, 8)}

    def v_cell(r: int, c: int) -> str | None:
        if r_v is None or r < r_v:
            return None
        if c in (11, 12):
            return "open" if v.get("open", True) else "bib"
        if c in (10, 13) and v.get("lapel", False):
            return "lapel"
        return None

    for r in range(len(rings) - 1):
        sp = specs[r] if r < len(specs) else {}
        zmid = 0.5 * (rings[r][0].co.z + rings[r + 1][0].co.z)
        ref = Vector((0.0, 0.0, zmid))
        for c in range(N):
            if (r, c) in left_skip or (r, c) in right_skip:
                continue
            cell = v_cell(r, c)
            if cell == "open":
                continue
            sw, tn, sh = sp.get("swatch", swatch), sp.get("tint", tint), sp.get("shade", 1.0)
            if cell == "bib":
                sw, tn, sh = v.get("bib_swatch", "c_white"), v.get("bib_tint", "secondary"), 1.0
            elif cell == "lapel":
                sh = v.get("lapel_shade", 0.84)
            g.q((rings[r][c], rings[r][(c + 1) % N], rings[r + 1][(c + 1) % N], rings[r + 1][c]), sw, tn, sh, ref=ref)

    out = SimpleNamespace(rings=rings, specs=specs, r_arm_bot=r_arm_bot, r_arm_top=r_arm_top, r_neck=r_neck, r_v=r_v,
                          neck_ring=neck_ring, collar_ring=None)

    # Collars
    if collar is not None:
        kind = collar["kind"]
        csw = collar.get("swatch", swatch)
        ctn = collar.get("tint", tint)
        csh = collar.get("shade", 0.9)
        skip_cols = {11, 12} if (r_v is not None and v.get("open", True)) else set()
        cring = []
        if kind in ("stand", "rib"):
            h = collar.get("h", 0.03)
            for c in range(N):
                ang = TAU * c / N
                base = neck_ring[c].co
                p = s.torso_point(ang, base.z + h, collar.get("off", 0.010))
                p.z = base.z + h
                cring.append(g.v(p, "collar", req=0.006))
        elif kind == "roll":
            for c in range(N):
                base = neck_ring[c].co
                rad = Vector((base.x, base.y, 0.0))
                rad = rad.normalized() if rad.length > 1e-6 else Vector((0.0, -1.0, 0.0))
                p = base + rad * collar.get("out", 0.010) + Vector((0.0, 0.0, collar.get("h", 0.018)))
                cring.append(g.v(p, "collar", req=0.006))
        elif kind == "shirt":
            for c in range(N):
                base = neck_ring[c].co
                ang = TAU * c / N
                frontness = max(0.0, -math.sin(ang))
                p = Vector((base.x * 1.07, base.y * 1.08 - frontness * 0.006, base.z + (0.014 if frontness < 0.3 else 0.010)))
                cring.append(g.v(p, "collar", req=0.006))
        if cring:
            for c in range(N):
                if c in skip_cols:
                    continue
                c2 = (c + 1) % N
                zmid = 0.5 * (neck_ring[c].co.z + cring[c].co.z)
                g.q((neck_ring[c], neck_ring[c2], cring[c2], cring[c]), csw, ctn, csh, ref=Vector((0.0, 0.0, zmid)))
            out.collar_ring = cring
        if kind == "shirt":
            flap = []
            for c in range(N):
                cv = cring[c].co
                ang = TAU * c / N
                drop = 0.022 + (0.018 if c in (11, 13) else 0.0)
                o = Vector((math.cos(ang), math.sin(ang), 0.0)) * 0.010
                flap.append(g.v(Vector((cv.x + o.x, cv.y + o.y, cv.z - drop)), "collar"))
            for c in range(N):
                if c in (11, 12) or c in skip_cols:
                    continue
                c2 = (c + 1) % N
                g.q((cring[c], cring[c2], flap[c2], flap[c]), csw, ctn, 1.0, ref=Vector((0.0, 0.0, cring[c].co.z - 0.05)))
        if kind == "hood":
            # Folded hood resting on the upper back, sized for an outer layer.
            nr, at = neck_ring, rings[r_arm_top]
            hd = collar.get("depth", 0.045)
            h_l0 = g.v(nr[2].co + Vector((0.012, 0.025, 0.004)), "collar")
            h_m0 = g.v(nr[4].co + Vector((0.0, 0.040, 0.006)), "collar")
            h_r0 = g.v(nr[6].co + Vector((-0.012, 0.025, 0.004)), "collar")
            h_l1 = g.v(at[2].co + Vector((0.012, hd, -0.03)), "collar")
            h_m1 = g.v(at[4].co + Vector((0.0, hd + 0.012, -0.045)), "collar")
            h_r1 = g.v(at[6].co + Vector((-0.012, hd, -0.03)), "collar")
            ref = Vector((0.0, 0.0, at[4].co.z))
            for vs, sh in (
                ((nr[2], nr[3], h_m0, h_l0), 0.92),
                ((nr[3], nr[4], h_m0), None),
                ((nr[4], nr[5], h_m0), None),
                ((nr[5], nr[6], h_r0, h_m0), 0.92),
                ((h_l0, h_m0, h_m1, h_l1), 0.88),
                ((h_m0, h_r0, h_r1, h_m1), 0.88),
                ((h_l1, h_m1, at[4], at[3], at[2]), None),
                ((h_m1, h_r1, at[6], at[5], at[4]), None),
            ):
                try:
                    f = g.bm.faces.new(vs)
                except ValueError:
                    continue
                f.smooth = False
                f.normal_update()
                if f.normal.dot(f.calc_center_median() - ref) < 0.0:
                    f.normal_flip()
                g.fz.append((f, csw, ctn, sh if sh is not None else 0.84))

    # Sleeves bridged into the 10-vertex armholes
    if sleeve_steps:
        el_mn, el_mx = s.region_bounds("elbow_l")
        chest_wall_x = chest_mx.x + 0.008
        for side in (+1, -1):
            if side > 0:
                hole = [rings[r_arm_bot][0], rings[r_arm_bot][15], rings[r_bust][15], rings[r_arm_mid][15], rings[r_arm_top][15],
                        rings[r_arm_top][0], rings[r_arm_top][1], rings[r_arm_mid][1], rings[r_bust][1], rings[r_arm_bot][1]]
            else:
                hole = [rings[r_arm_bot][8], rings[r_arm_bot][9], rings[r_bust][9], rings[r_arm_mid][9], rings[r_arm_top][9],
                        rings[r_arm_top][8], rings[r_arm_top][7], rings[r_arm_mid][7], rings[r_bust][7], rings[r_arm_bot][7]]
            srings = [hole]
            for si, sv in enumerate(sleeve_steps):
                ring = []
                base_off = sleeve_off + (first_ring_extra if sv <= 0.070 else 0.0)
                if cuff is not None and si == len(sleeve_steps) - 1:
                    base_off += cuff.get("off", 0.0)
                for k in range(10):
                    arm_ang = -math.pi * 0.5 + k * (TAU / 10.0)
                    ease = 0.0065 * max(0.0, -math.sin(arm_ang)) if sv <= 0.070 else 0.0
                    pt = s.arm_point(side, sv, arm_ang, base_off + ease)
                    if sv <= 0.075:
                        pt.x = max(pt.x, chest_wall_x) if side > 0 else min(pt.x, -chest_wall_x)
                    ring.append(g.v(pt, "sleeve", req=min(sleeve_off, 0.012)))
                srings.append(ring)
            for ri in range(len(srings) - 1):
                a, b = srings[ri], srings[ri + 1]
                c0 = sum((x.co for x in a), Vector()) / len(a)
                c1 = sum((x.co for x in b), Vector()) / len(b)
                ref = Vector((0.0, 0.0, 0.5 * (c0.z + c1.z))) if ri == 0 else 0.5 * (c0 + c1)
                is_cuff = ri == len(srings) - 2
                sw, tn, sh = swatch, tint, 1.0
                if is_cuff:
                    sh = 0.88
                    if cuff is not None:
                        sw, tn, sh = cuff.get("swatch", swatch), cuff.get("tint", tint), cuff.get("shade", 0.88)
                for k in range(10):
                    k2 = (k + 1) % 10
                    g.q((a[k], a[k2], b[k2], b[k]), sw, tn, sh, ref=ref)
    return out


def _front_col_point(t: SimpleNamespace, z: float, col: int = FC) -> tuple[Vector, Vector]:
    """Interpolated position + outward normal of torso column ``col`` at height ``z``."""
    rings = t.rings
    for r in range(len(rings) - 1):
        a, b = rings[r][col].co, rings[r + 1][col].co
        if a.z <= z <= b.z:
            u = (z - a.z) / max(1e-6, b.z - a.z)
            p = a.lerp(b, u)
            n = Vector((p.x, p.y, 0.0)).normalized()
            return p, n
    p = rings[0][col].co.copy()
    return p, Vector((p.x, p.y, 0.0)).normalized()


def _surface_quad(t: SimpleNamespace, cols: tuple[float, float], zs: tuple[float, float], lift: float) -> tuple[list[Vector], Vector]:
    """Corners of a patch spanning fractional columns ``cols`` and heights ``zs`` on the torso."""
    out = []
    for z, c in ((zs[0], cols[0]), (zs[0], cols[1]), (zs[1], cols[1]), (zs[1], cols[0])):
        c0 = int(math.floor(c)) % N
        c1 = (c0 + 1) % N
        u = c - math.floor(c)
        p0, _ = _front_col_point(t, z, c0)
        p1, _ = _front_col_point(t, z, c1)
        out.append(p0.lerp(p1, u))
    cen = sum(out, Vector()) / 4.0
    n = Vector((cen.x, cen.y, 0.0)).normalized()
    return out, n


# ---------------------------------------------------------------------------
# Trousers (variant of the starter loft: configurable leg stops + wide-leg flare)
# ---------------------------------------------------------------------------


def _pants(g: _G, ctx, *, swatch: str, tint: str, waist_off: float = 0.0105, leg_off: float = 0.0185,
           cuff_flare: float = 0.0025, z_cuff: float | None = None, leg_stops: list[float] | None = None,
           wide=None, waist_z: float | None = None) -> tuple[set, set]:
    s = ctx.sampler
    hips_mn, hips_mx = ctx.hips_mn, ctx.hips_mx
    belly_mn, _ = s.region_bounds("belly")
    z_waist = waist_z if waist_z is not None else max(hips_mx.z + 0.028, belly_mn.z - 0.012)
    z_split = hips_mn.z + 0.008
    if z_cuff is None:
        z_cuff = ctx.ankle_mn.z + 0.002
    NP = 20
    pel_z = (z_waist, z_waist - 0.022, (hips_mn.z + hips_mx.z) * 0.5 + 0.020, hips_mn.z + 0.042, z_split)
    pel = []
    for idx, pz in enumerate(pel_z):
        if idx == 0:
            off = waist_off + 0.002
        elif idx == 1:
            off = waist_off
        elif idx == 2:
            off = max(waist_off + 0.003, leg_off)
        else:
            off = max(waist_off + 0.003, leg_off) + 0.0045
        ring = []
        for c in range(NP):
            ang = TAU * c / NP
            p = s.torso_point(ang, pz, off) if idx <= 1 else s.pelvis_ext_point(ang, pz, off)
            ring.append(g.v(p, "pants", req=0.0095))
        pel.append(ring)
    for r in range(len(pel) - 1):
        ref = Vector((0.0, 0.0, 0.5 * (pel[r][0].co.z + pel[r + 1][0].co.z)))
        for c in range(NP):
            c2 = (c + 1) % NP
            g.q((pel[r][c], pel[r][c2], pel[r + 1][c2], pel[r + 1][c]), swatch, tint, 0.86 if r == 0 else 1.0, ref=ref)

    split = pel[-1]
    z_crotch = hips_mn.z - 0.032
    z_leg_top = hips_mn.z - 0.044
    vf = g.v(Vector((0.0, split[15].co.y * 0.72, z_crotch + 0.002)), "pants")
    vc = g.v(Vector((0.0, 0.005, z_crotch - 0.002)), "pants")
    vb = g.v(Vector((0.0, split[5].co.y * 0.72, z_crotch + 0.002)), "pants")
    cc = Vector((0.0, 0.0, z_crotch + 0.04))
    for vs in ((split[14], split[15], vf), (split[15], split[16], vf), (split[4], split[5], vb), (split[5], split[6], vb)):
        try:
            f = g.bm.faces.new(vs)
        except ValueError:
            continue
        f.smooth = False
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - cc) < 0.0:
            f.normal_flip()
        g.fz.append((f, swatch, tint, 0.90))

    left_top = [split[16], split[17], split[18], split[19], split[0], split[1], split[2], split[3], split[4], vb, vc, vf]
    right_top = [split[6], split[7], split[8], split[9], split[10], split[11], split[12], split[13], split[14], vf, vc, vb]
    knee_mid = ctx.knee_mid_z
    if leg_stops is None:
        leg_stops = [knee_mid + 0.20, knee_mid + 0.035, knee_mid, knee_mid - 0.035, 0.5 * (knee_mid + z_cuff)]
    stops = [z_leg_top] + [z for z in leg_stops if z_cuff + 0.03 < z < z_leg_top - 0.03] + [z_cuff + 0.025, z_cuff]
    la = [-1.5708, -1.1781, -0.7854, -0.3927, 0.0, 0.3927, 0.7854, 1.1781, 1.5708, 2.62, math.pi, -2.62]
    ra = [1.5708, 1.9635, 2.3562, 2.7489, math.pi, -2.7489, -2.3562, -1.9635, -1.5708, -0.52, 0.0, 0.52]
    lset, rset = set(), set()
    for side, top, angs in ((+1, left_top, la), (-1, right_top, ra)):
        lr = [top]
        for li, lz in enumerate(stops):
            last = li >= len(stops) - 2
            upper_t = _cl((lz - (knee_mid + 0.08)) / 0.24)
            off = leg_off + 0.005 * upper_t + (cuff_flare if last else 0.0)
            if wide is not None:
                off += wide(lz)
            kp = max(0.0, 1.0 - abs(lz - knee_mid) / 0.045)
            ring = []
            for a in angs:
                fb = max(0.0, -math.sin(a)) * 0.008 * kp
                pt = s.leg_point(side, a, lz, off + fb)
                pt.x = max(pt.x, 0.0015) if side > 0 else min(pt.x, -0.0015)
                vv = g.v(pt, "pants", req=0.0)
                (lset if side > 0 else rset).add(vv)
                ring.append(vv)
            lr.append(ring)
        for r in range(len(lr) - 1):
            zm = 0.5 * (sum(x.co.z for x in lr[r]) / 12 + sum(x.co.z for x in lr[r + 1]) / 12)
            cx, cy = s.leg_xy_center_at_z(side, zm)
            ref = Vector((cx, cy, zm))
            sh = 0.86 if r == len(lr) - 2 else 1.0
            for k in range(12):
                k2 = (k + 1) % 12
                g.q((lr[r][k], lr[r][k2], lr[r + 1][k2], lr[r + 1][k]), swatch, tint, sh, ref=ref)
    return lset, rset


# ---------------------------------------------------------------------------
# Ao dai panel (closed lens slab)
# ---------------------------------------------------------------------------


def _body_y(ctx, x: float, z: float, side: int) -> float | None:
    """Outermost body surface y (front: most negative, back: most positive) at (x, z)."""
    s = ctx.sampler
    best = None
    origin = Vector((x, side * 0.45, z))
    d = Vector((0.0, -side, 0.0))
    for bvh in (s.torso_bvh, s.leg_l_bvh, s.leg_r_bvh):
        loc, _n, idx, _dist = bvh.ray_cast(origin, d, 0.6)
        if idx is not None and loc is not None:
            if best is None or side * loc.y > side * best:
                best = loc.y
    return best


def _panel(g: _G, ctx, *, side: int, rows: list[tuple[float, float, float]], cols: int, swatch: str, tint: str,
           depth: float = 0.007, curve: float = 0.028, hem_shade: float = 0.86, tag: str = "panel") -> None:
    """``rows``: (z, half_width, offset) from the top (tucked under the bodice) down to the hem."""
    grid: list[list[Vector]] = []
    prev = None
    for z, hw, off in rows:
        xs = [hw * (-1.0 + 2.0 * i / cols) for i in range(cols + 1)]
        ys = []
        for x in xs:
            by = None
            for dx in (0.0, 0.02, -0.02, 0.04, -0.04):
                by = _body_y(ctx, x + dx, z, side)
                if by is not None:
                    break
            ys.append(side * (by if by is not None else side * 0.08) + off)  # outward distance (positive)
        m = max(ys)
        row = []
        for i, x in enumerate(xs):
            u = x / hw
            out = max(ys[i], m - curve * u * u)
            if prev is not None:
                out = max(out, prev[i] - 0.004)  # hang: never tuck back in going down
            row.append(out)
        prev = row
        grid.append([Vector((xs[i], side * row[i], z)) for i in range(cols + 1)])
    R = len(grid)
    outer = [[g.v(p, tag) for p in row] for row in grid]
    inner = []
    for r in range(R):
        irow = []
        for i in range(cols + 1):
            if r in (0, R - 1) or i in (0, cols):
                irow.append(outer[r][i])
            else:
                p = grid[r][i]
                irow.append(g.v(Vector((p.x, p.y - side * depth, p.z)), tag))
        inner.append(irow)
    for r in range(R - 1):
        sh = hem_shade if r == R - 2 else 1.0
        for i in range(cols):
            zc = 0.5 * (grid[r][i].z + grid[r + 1][i].z)
            ref = Vector((0.0, side * -0.2, zc))
            g.q((outer[r][i], outer[r][i + 1], outer[r + 1][i + 1], outer[r + 1][i]), swatch, tint, sh, ref=ref)
            g.q((inner[r][i], inner[r][i + 1], inner[r + 1][i + 1], inner[r + 1][i]), swatch, tint, 0.8, ref=ref, inward=True)


# ---------------------------------------------------------------------------
# Fitting callbacks
# ---------------------------------------------------------------------------


def _fit_kwargs(ctx, g: _G, *, extra_off: float = 0.0, skirt: str = "frontlap", pants_sets=None,
                panel_k: float = 2.0, follow: float = 1.0) -> tuple:
    if pants_sets is not None:
        lb, rb = pants_sets
    tags, reqs = g.finish()
    bm = g.bm
    if pants_sets is not None:
        lvis = {v.index for v in lb if v.is_valid}
        rvis = {v.index for v in rb if v.is_valid}
        p_filter, p_clamp, p_weights = ctx._make_pants_callbacks(lvis, rvis)
    else:
        p_filter = p_clamp = p_weights = None
    tag_of: dict[int, str] = {}
    for t, ids in tags.items():
        for i in ids:
            tag_of[i] = t

    chest_mn = ctx.chest_mn
    hips_mn = ctx.hips_mn
    cut = ctx.shoulder_x_cutoff + extra_off
    tmax = ctx.torso_max_x + extra_off
    hip_pivot = ctx.hip_pivot_z
    knee = ctx.knee_mid_z
    half_w = max(0.05, ctx.hips_mx.x)
    torso_regs = ctx.torso_regs

    def region_filter(co: Vector, vi: int):
        t = tag_of.get(vi, "torso")
        if t == "pants":
            return p_filter(co, vi)
        if t == "collar":
            return {"neck", "chest"}
        if t in ("panel", "skirt"):
            if co.z >= hips_mn.z - 0.01:
                return torso_regs
            return ctx.leg_l_regs if co.x >= 0.0 else ctx.leg_r_regs
        if abs(co.x) > tmax or (co.z > chest_mn.z - 0.01 and abs(co.x) > cut):
            return ctx.arm_l_regs if co.x >= 0.0 else ctx.arm_r_regs
        return torso_regs

    def strip_arms(w):
        no_arm = [(b, x) for b, x in w if "Arm" not in b and "Hand" not in b and "Shoulder" not in b]
        return no_arm or [("Spine", 0.5), ("Hips", 0.5)]

    def frontlap(co: Vector, w):
        # Starter dress rule: only the front lap below the hip pivot follows the thighs.
        t = _cl((hip_pivot - co.z) / 0.12)
        front = _cl((-co.y + 0.02) / 0.13)
        lf = 0.5 + 0.5 * _cl(co.x / 0.04, -1.0, 1.0)
        leg = t * 0.96 * front
        return [("Hips", 1.0 - leg), ("LeftUpLeg", leg * lf), ("RightUpLeg", leg * (1.0 - lf))]

    def legblend(co: Vector, w):
        t = _cl((hip_pivot - co.z) / 0.12)
        sx = _cl(co.x / half_w, -1.0, 1.0)
        near = abs(sx)
        lt = 0.5
        nw = lt * 0.5 + (0.6 - lt * 0.5) * near
        fw = max(0.0, lt * 0.5 * (1.0 - near))
        hw = max(0.0, 1.0 - nw - fw)
        lw, rw = (nw, fw) if sx >= 0 else (fw, nw)
        return [("Hips", (1.0 - t) + t * hw), ("LeftUpLeg", t * lw), ("RightUpLeg", t * rw)]

    def panel_w(co: Vector, w):
        t = _cl((hip_pivot + 0.018 - co.z) / 0.055)
        lf = _cl(0.5 + 0.5 * panel_k * co.x / half_w)
        kl = 0.55 * _cl((knee + 0.03 - co.z) / 0.12)
        up, lo = t * follow * (1.0 - kl), t * follow * kl
        return [("Hips", 1.0 - up - lo), ("LeftUpLeg", up * lf), ("RightUpLeg", up * (1.0 - lf)),
                ("LeftLeg", lo * lf), ("RightLeg", lo * (1.0 - lf))]

    def weights(co: Vector, vi: int, w):
        t = tag_of.get(vi, "torso")
        if t == "pants":
            return p_weights(co, vi, w)
        if t == "panel":
            return panel_w(co, w)
        if t == "skirt" or (t in ("torso", "deco") and co.z < hip_pivot):
            if skirt == "legblend":
                return legblend(co, w)
            return frontlap(co, w)
        if t in ("torso", "deco") and co.z < chest_mn.z - 0.02:
            return strip_arms(w)
        return w

    def offset_fn(co: Vector) -> float:
        return reqs.get(_key(co), 0.0)

    kw = {
        "offset_fn": offset_fn,
        "smooth_weight_iters": 1,
        "vert_region_filter_fn": region_filter,
        "weight_override_fn": weights,
        "delta_scale_fn": ctx.armhole_delta_fn,
    }
    if p_clamp is not None:
        kw["post_push_fn"] = p_clamp
    return bm, kw


# ---------------------------------------------------------------------------
# Shared item pieces
# ---------------------------------------------------------------------------


def _hipdims(ctx) -> tuple[float, float, float]:
    s = ctx.sampler
    zh = 0.5 * (ctx.hips_mn.z + ctx.hips_mx.z)
    rx = max(abs(s.torso_point(0.0, zh, 0.012).x), abs(s.torso_point(math.pi, zh, 0.012).x))
    ryf = abs(s.torso_point(-math.pi * 0.5, zh, 0.015).y)
    ryb = abs(s.torso_point(math.pi * 0.5, zh, 0.015).y)
    return rx, ryf, ryb


def _sleeves(ctx, kind: str) -> list[float]:
    if kind == "short":
        return [0.032, 0.058, 0.105, 0.14, 0.16]
    e = ctx.upper_arm_s
    length = ctx.wrist_s + (0.010 if kind == "long" else 0.018)
    return [0.032, 0.062, 0.115, e - 0.035, e, e + 0.035, length - 0.07, length - 0.02, length]


def _buttons(g: _G, t: SimpleNamespace, zs: list[float], size: float = 0.012, swatch: str = "c_white", tint: str = "accent", lift: float = 0.0) -> None:
    for z in zs:
        p, n = _front_col_point(t, z)
        _button(g, p + n * lift, n, size, swatch, tint)


def _flap(g: _G, t: SimpleNamespace, col: float, z: float, w: float, h: float, swatch: str, tint: str, shade: float, lift: float = 0.002) -> None:
    """Pocket / badge patch centred at fractional torso column ``col`` and height ``z``."""
    corners, n = _surface_quad(t, (col - w, col + w), (z - h, z + h), 0.0)
    _patch(g, corners, n, swatch, tint, shade, lift=lift)


def _finish(ctx, g: _G, **kw):
    return _fit_kwargs(ctx, g, **kw)


def _skirt_off(ctx, g: _G, min_off: float) -> None:
    for v in g.bm.verts:
        if g.tag.get(v) == "skirt":
            g.req[v] = max(g.req.get(v, 0.0), min_off)


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------


def build_dress_office(ctx):
    g = _G()
    Z = _zs(ctx)
    rx, ryf, ryb = _hipdims(ctx)
    lower = [
        {"z": 0.52, "off": 0.0, "mode": "ellipse", "ell": (0.178, 0.094, 0.098), "shade": 0.88},
        {"z": 0.56, "off": 0.0, "mode": "ellipse", "ell": (0.180, 0.098, 0.102)},
        {"z": 0.68, "off": 0.0, "mode": "ellipse", "ell": (0.184, 0.106, 0.110)},
        {"z": Z.hips_mn - 0.02, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.024, ryf + 0.026, ryb + 0.024)},
        {"z": Z.hip_mid, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.017, ryf + 0.019, ryb + 0.017)},
        {"z": Z.hips_mx - 0.025, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.018, ryf + 0.020, ryb + 0.018)},
        {"z": Z.hips_mx + 0.02, "off": 0.0165, "mode": "torso", "swatch": "c_white", "tint": "accent", "shade": 0.95},
        {"z": Z.hips_mx + 0.045, "off": 0.0165, "mode": "torso"},
        {"z": 0.5 * (Z.hips_mx + 0.045 + Z.arm_bot), "off": 0.0165, "mode": "torso"},
    ]
    t = _torso(g, ctx, lower=lower, off_chest=0.0165, swatch="c_navy", tint="primary", scoop=0.04,
               collar={"kind": "shirt", "swatch": "c_white", "tint": "accent", "shade": 1.0},
               sleeve_steps=_sleeves(ctx, "short"), sleeve_off=0.0175, skirt_below=Z.hips_mx - 0.03)
    _buttons(g, t, [Z.bust - 0.012, Z.waist + 0.04, Z.waist - 0.03], size=0.012)
    _skirt_off(ctx, g, 0.010)
    return _fit_kwargs(ctx, g, skirt="frontlap")


def _ao_dai(ctx, male: bool):
    g = _G()
    Z = _zs(ctx)
    k = 0.004 if male else 0.0
    oc = 0.0175 + k
    rx, ryf, ryb = _hipdims(ctx)
    lower = [
        {"z": Z.hips_mn - 0.005, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.026 + k, ryf + 0.028 + k, ryb + 0.026 + k), "shade": 0.9},
        {"z": Z.hip_mid + 0.02, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.019 + k, ryf + 0.021 + k, ryb + 0.019 + k)},
        {"z": Z.hips_mx + 0.02, "off": oc + 0.002, "mode": "torso"},
        {"z": 0.5 * (Z.hips_mx + Z.arm_bot) + 0.01, "off": oc, "mode": "torso"},
    ]
    t = _torso(g, ctx, lower=lower, off_chest=oc, swatch="c_red", tint="primary", scoop=0.0,
               collar={"kind": "stand", "h": 0.032, "off": 0.0125, "swatch": "c_mustard", "tint": "accent", "shade": 0.95},
               sleeve_steps=_sleeves(ctx, "long"), sleeve_off=0.0175 + k * 0.5, side_x_scale=0.78,
               cuff={"swatch": "c_mustard", "tint": "accent", "shade": 0.95})
    lset, rset = _pants(g, ctx, swatch="c_white", tint="secondary", leg_off=0.0185 + k * 0.6, waist_off=0.0105,
                        wide=lambda lz: 0.0045 * _cl((0.45 - lz) / 0.40) + 0.004 * _cl((0.70 - lz) / 0.50))
    pk = 0.004 if male else 0.0
    for side in (-1, +1):
        rows = [(1.00, 0.092, 0.012), (0.94, 0.104, 0.024 + pk), (0.86, 0.114, 0.032 + pk), (0.72, 0.120, 0.036 + pk),
                (0.55, 0.126, 0.040 + pk), (0.40, 0.132, 0.044 + pk), (0.30, 0.136, 0.046 + pk)]
        _panel(g, ctx, side=side, rows=rows, cols=6, swatch="c_red", tint="primary", depth=0.007, curve=0.026)
    return _fit_kwargs(ctx, g, pants_sets=(lset, rset), panel_k=1.4, follow=0.72)


def build_ao_dai(ctx):
    return _ao_dai(ctx, ctx.base == "male")


def build_jumpsuit(ctx):
    g = _G()
    Z = _zs(ctx)
    belt = Z.waist + 0.012
    lower = [
        {"z": belt - 0.075, "off": 0.0255, "mode": "torso", "shade": 0.95},
        {"z": belt - 0.022, "off": 0.0255, "mode": "torso", "swatch": "c_brown", "tint": "accent", "shade": 0.92},
        {"z": belt + 0.022, "off": 0.0255, "mode": "torso"},
        {"z": belt + 0.075, "off": 0.0255, "mode": "torso"},
    ]
    t = _torso(g, ctx, lower=lower, off_chest=0.0245, swatch="c_olive", tint="primary", scoop=0.035,
               v=None, collar={"kind": "shirt", "shade": 1.0}, sleeve_steps=_sleeves(ctx, "short"), sleeve_off=0.0195)
    lset, rset = _pants(g, ctx, swatch="c_olive", tint="primary", waist_off=0.0125, leg_off=0.0225,
                        wide=lambda lz: 0.004)
    return _fit_kwargs(ctx, g, pants_sets=(lset, rset))


def build_suit_set(ctx):
    g = _G()
    Z = _zs(ctx)
    oc = 0.0215
    lower = [
        {"z": Z.hips_mn + 0.035, "off": 0.0255, "mode": "pelvis", "shade": 0.9},
        {"z": Z.hip_mid + 0.02, "off": 0.0235, "mode": "pelvis"},
        {"z": Z.hips_mx + 0.03, "off": oc + 0.002, "mode": "torso"},
        {"z": 0.5 * (Z.hips_mx + Z.arm_bot) + 0.02, "off": oc, "mode": "torso"},
    ]
    t = _torso(g, ctx, lower=lower, off_chest=oc, swatch="c_navy", tint="primary", scoop=0.03,
               v={"z": Z.waist + 0.02, "x0": 0.012, "drop": 0.0, "open": False, "lapel": True, "lapel_shade": 0.84,
                  "bib_swatch": "c_white", "bib_tint": "secondary"},
               collar={"kind": "shirt", "swatch": "c_navy", "tint": "primary", "shade": 0.92},
               sleeve_steps=_sleeves(ctx, "long"), sleeve_off=0.019)
    # Tie down the shirt bib
    _flap(g, t, 12.0, Z.waist + 0.065, 0.33, 0.085, "c_maroon", "accent", 1.0, lift=0.0015)
    _buttons(g, t, [Z.waist - 0.01], size=0.012, swatch="c_black", tint="primary", lift=0.0)
    lset, rset = _pants(g, ctx, swatch="c_navy", tint="primary", waist_off=0.0125, leg_off=0.0225)
    return _fit_kwargs(ctx, g, pants_sets=(lset, rset))


# ---------------------------------------------------------------------------
# Outer layers (torso >= 32 mm, sleeves >= 27 mm so they clear the thickest top)
# ---------------------------------------------------------------------------

OC = 0.0375   # chest / waist offset of outer layers
OS = 0.032   # sleeve offset


def _outer_lower(ctx, hem_z: float, hem_off: float, rows=None, hem_tint: str | None = None):
    """Hip-length lower rings: ellipses (never jagged) up to the waist, then torso rings."""
    Z = _zs(ctx)
    rx, ryf, ryb = _hipdims(ctx)
    first = {"z": hem_z, "off": 0.0, "mode": "ellipse", "ell": (rx + hem_off, ryf + hem_off + 0.004, ryb + hem_off), "shade": 0.9}
    if hem_tint:
        first.update({"swatch": "c_white", "tint": hem_tint, "shade": 0.95})
    out = [first]
    e2 = hem_off - 0.004
    out.append({"z": hem_z + 0.034, "off": 0.0, "mode": "ellipse", "ell": (rx + e2, ryf + e2 + 0.004, ryb + e2)})
    out.append({"z": Z.hips_mx + 0.02, "off": OC + 0.002, "mode": "torso"})
    out.append({"z": 0.5 * (Z.hips_mx + 0.02 + Z.arm_bot) + 0.015, "off": OC, "mode": "torso"})
    return out


def build_blazer(ctx):
    g = _G()
    Z = _zs(ctx)
    t = _torso(g, ctx, lower=_outer_lower(ctx, 0.90, 0.040), off_chest=OC, swatch="c_charcoal", tint="primary", scoop=0.03,
               v={"z": Z.waist + 0.01, "x0": 0.012, "drop": 0.0, "open": False, "lapel": True, "lapel_shade": 0.82,
                  "bib_swatch": "c_white", "bib_tint": "secondary", "lapel_out": 0.004},
               collar={"kind": "shirt", "shade": 0.9}, sleeve_steps=_sleeves(ctx, "outer"), sleeve_off=OS,
               shoulder_pad=0.004, back_ease=0.006, cuff={"shade": 0.9})
    _buttons(g, t, [Z.waist - 0.012, Z.waist - 0.062], size=0.014, swatch="c_black", tint="accent", lift=0.0015)
    for col in (14.4, 9.6):
        _flap(g, t, col, Z.hips_mx + 0.012, 0.62, 0.014, "c_charcoal", "primary", 0.82, lift=0.003)
    _flap(g, t, 10.0, Z.bust + 0.005, 0.28, 0.010, "c_charcoal", "primary", 0.82, lift=0.003)
    return _fit_kwargs(ctx, g, skirt="frontlap", extra_off=0.02)


def build_cardigan(ctx):
    g = _G()
    Z = _zs(ctx)
    t = _torso(g, ctx, lower=_outer_lower(ctx, 0.84, 0.038, hem_tint="accent"), off_chest=OC, swatch="c_beige", tint="primary", scoop=0.03,
               v={"z": Z.waist + 0.06, "x0": 0.014, "drop": 0.0, "open": False, "lapel": False,
                  "bib_swatch": "c_white", "bib_tint": "secondary", "lapel_out": 0.004},
               collar={"kind": "rib", "h": 0.02, "off": 0.032, "swatch": "c_brown", "tint": "accent", "shade": 0.92},
               sleeve_steps=_sleeves(ctx, "outer"), sleeve_off=OS, shoulder_pad=0.002, back_ease=0.006,
               cuff={"swatch": "c_brown", "tint": "accent", "shade": 0.92})
    _buttons(g, t, [Z.waist + 0.035, Z.waist - 0.015, Z.waist - 0.065, Z.waist - 0.115], size=0.014, tint="accent", lift=0.0015)
    for col in (14.2, 9.8):
        _flap(g, t, col, Z.hips_mx + 0.0, 0.7, 0.03, "c_beige", "primary", 0.88, lift=0.003)
    return _fit_kwargs(ctx, g, skirt="frontlap", extra_off=0.02)


def build_bomber(ctx):
    g = _G()
    Z = _zs(ctx)
    rx, ryf, ryb = _hipdims(ctx)
    lower = [
        {"z": 0.925, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.036, ryf + 0.040, ryb + 0.036), "swatch": "c_black", "tint": "accent", "shade": 0.9},
        {"z": 0.965, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.036, ryf + 0.040, ryb + 0.036)},
        {"z": Z.hips_mx + 0.03, "off": OC + 0.004, "mode": "torso"},
        {"z": 0.5 * (Z.hips_mx + 0.03 + Z.arm_bot) + 0.01, "off": OC + 0.002, "mode": "torso"},
    ]
    t = _torso(g, ctx, lower=lower, off_chest=OC + 0.002, swatch="c_olive", tint="primary", scoop=0.012,
               collar={"kind": "rib", "h": 0.028, "off": 0.030, "swatch": "c_black", "tint": "accent", "shade": 0.92},
               sleeve_steps=_sleeves(ctx, "outer"), sleeve_off=OS + 0.001, shoulder_pad=0.004, back_ease=0.006,
               cuff={"swatch": "c_black", "tint": "accent", "shade": 0.9, "off": -0.004})
    # Zip line + pocket slits
    _flap(g, t, 12.0, 0.5 * (Z.waist + Z.bust), 0.07, 0.30, "c_black", "accent", 1.0, lift=0.0025)
    for col in (14.6, 9.4):
        _flap(g, t, col, Z.hips_mx + 0.02, 0.18, 0.05, "c_black", "accent", 0.9, lift=0.0025)
    return _fit_kwargs(ctx, g, skirt="frontlap", extra_off=0.02)


def build_raincoat(ctx):
    g = _G()
    Z = _zs(ctx)
    rx, ryf, ryb = _hipdims(ctx)
    lower = [
        {"z": 0.50, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.098, ryf + 0.088, ryb + 0.088), "shade": 0.88, "swatch": "c_grey", "tint": "accent"},
        {"z": 0.54, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.092, ryf + 0.082, ryb + 0.082)},
        {"z": 0.68, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.070, ryf + 0.062, ryb + 0.062)},
        {"z": Z.hips_mn - 0.02, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.056, ryf + 0.050, ryb + 0.050)},
        {"z": Z.hip_mid, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.046, ryf + 0.044, ryb + 0.044)},
        {"z": Z.hips_mx - 0.02, "off": 0.0, "mode": "ellipse", "ell": (rx + 0.042, ryf + 0.040, ryb + 0.040)},
        {"z": Z.hips_mx + 0.035, "off": OC + 0.002, "mode": "torso"},
        {"z": 0.5 * (Z.hips_mx + 0.035 + Z.arm_bot) + 0.01, "off": OC, "mode": "torso"},
    ]
    t = _torso(g, ctx, lower=lower, off_chest=OC, swatch="c_yellow", tint="primary", scoop=0.012,
               collar={"kind": "hood", "depth": 0.05, "swatch": "c_yellow", "tint": "primary", "shade": 0.9},
               sleeve_steps=_sleeves(ctx, "outer"), sleeve_off=OS, shoulder_pad=0.004, back_ease=0.008,
               cuff={"swatch": "c_grey", "tint": "accent", "shade": 0.92}, skirt_below=Z.hips_mx - 0.03)
    _buttons(g, t, [Z.bust - 0.01, Z.waist + 0.05, Z.waist - 0.03], size=0.014, swatch="c_grey", tint="accent", lift=0.0015)
    for col in (14.4, 9.6):
        _flap(g, t, col, Z.hips_mx - 0.03, 0.62, 0.02, "c_yellow", "primary", 0.84, lift=0.003)
    _skirt_off(ctx, g, 0.012)
    return _fit_kwargs(ctx, g, skirt="frontlap", extra_off=0.02)


BOTH = ("female", "male")

register("fullbody_dress_office_01", "fullbody", ("female",), build_dress_office)
register("fullbody_ao_dai_01", "fullbody", BOTH, build_ao_dai, meta={"maxStride": 0.8})
register("fullbody_jumpsuit_01", "fullbody", BOTH, build_jumpsuit)
register("fullbody_suit_set_01", "fullbody", BOTH, build_suit_set)
register("outer_blazer_01", "outer", BOTH, build_blazer)
register("outer_cardigan_01", "outer", BOTH, build_cardigan)
register("outer_bomber_01", "outer", BOTH, build_bomber)
register("outer_raincoat_01", "outer", BOTH, build_raincoat)
