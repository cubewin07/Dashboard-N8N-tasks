"""Generate and fit the 9 starter skinned wardrobe garments (P07a-T08 / T09).

Usage:
    Blender --background --python art/blender/gen_wardrobe.py
    Blender --background --python art/blender/gen_wardrobe.py -- --only top_tshirt_crew_01,shoes_sneaker_01
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from lib import bodyshape, charexport, export, fit, rig

REPO_ROOT = _HERE.parent.parent
DEFAULT_OUT_DIR = REPO_ROOT / "art/.cache/raw"
DEFAULT_REPORT_DIR = REPO_ROOT / "art/out/reports"


# ---------------------------------------------------------------------------
# Dynamic Body Surface Sampler (never hardcodes body dimensions)
# ---------------------------------------------------------------------------


class BodySampler:
    """Queries actual surface cross-sections of ``body_ob`` via per-component BVHs."""

    def __init__(self, body: fit.BodyData) -> None:
        self.body = body
        self.torso_bvh = self._find_region_bvh("chest")
        self.arm_l_bvh = self._find_region_bvh("upper_arm_l")
        self.arm_r_bvh = self._find_region_bvh("upper_arm_r")
        self.leg_l_bvh = self._find_region_bvh("thigh_l")
        self.leg_r_bvh = self._find_region_bvh("thigh_r")

        # Limb centers for ray origin placement
        self.leg_l_cx, self.leg_l_cy = self._region_xy_center("thigh_l", "shin_l")
        self.leg_r_cx, self.leg_r_cy = self._region_xy_center("thigh_r", "shin_r")

        # Arm axes from shoulder joint to forearm/wrist
        self.sh_l, self.arm_l_dir = self._arm_axis("upper_arm_l", "forearm_l", side=+1)
        self.sh_r, self.arm_r_dir = self._arm_axis("upper_arm_r", "forearm_r", side=-1)

    def _find_region_bvh(self, region_name: str) -> BVHTree:
        for cid, comp in enumerate(self.body.components):
            if any(self.body.vert_regions[vi] == region_name for vi in comp):
                return self.body.comp_bvhs_basis[cid]
        return self.body.ext_bvh_basis

    def _region_xy_center(self, r1: str, r2: str) -> tuple[float, float]:
        pts = [
            self.body.verts_basis[i]
            for i, r in enumerate(self.body.vert_regions)
            if r in (r1, r2) and not self.body.vert_is_interior[i]
        ]
        if not pts:
            return (0.09, 0.0)
        return (sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts))

    def _arm_axis(self, r_up: str, r_fo: str, side: int) -> tuple[Vector, Vector]:
        up_pts = [
            self.body.verts_basis[i]
            for i, r in enumerate(self.body.vert_regions)
            if r == r_up
        ]
        fo_pts = [
            self.body.verts_basis[i]
            for i, r in enumerate(self.body.vert_regions)
            if r == r_fo
        ]
        if up_pts and fo_pts:
            # Proximal shoulder root at side * 0.145, mean arm y/z
            prox = [p for p in up_pts if abs(p.x) < 0.22]
            root = (
                sum(prox, Vector((0, 0, 0))) / len(prox)
                if prox
                else Vector((side * 0.15, 0.0, 1.31))
            )
            dist = sum(fo_pts, Vector((0, 0, 0))) / len(fo_pts)
            d = (dist - root).normalized()
            return root, d
        d = Vector((side * 0.707, 0.0, -0.707)).normalized()
        return Vector((side * 0.15, 0.0, 1.32)), d

    def region_bounds(self, *regions: str) -> tuple[Vector, Vector]:
        pts = [
            self.body.verts_basis[i]
            for i, r in enumerate(self.body.vert_regions)
            if r in regions
        ]
        if not pts:
            return Vector((0, 0, 0)), Vector((0, 0, 0))
        mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        return mn, mx

    def pelvis_ext_point(self, angle: float, z: float, offset_m: float = 0.0) -> Vector:
        """Outermost horizontal surface across torso + thigh components at height ``z``."""
        dx, dy = math.cos(angle), math.sin(angle)
        origin = Vector((dx * 0.40, dy * 0.40, z))
        inward = Vector((-dx, -dy, 0.0))
        out_dir = Vector((dx, dy, 0.0))
        best_pt: Vector | None = None
        best_proj = -1.0
        for bvh in (self.torso_bvh, self.leg_l_bvh, self.leg_r_bvh):
            loc, _norm, idx, _dist = bvh.ray_cast(origin, inward, 0.45)
            if idx is not None and loc is not None:
                proj = loc.x * dx + loc.y * dy
                if proj > best_proj:
                    best_proj = proj
                    best_pt = Vector((loc.x, loc.y, z))
        if best_pt is not None:
            return best_pt + out_dir * offset_m
        return self.torso_point(angle, z, offset_m)

    def torso_point(self, angle: float, z: float, offset_m: float = 0.0) -> Vector:
        """Raycast inward toward (0,0,z) on torso component, returning offset surface point."""
        dx, dy = math.cos(angle), math.sin(angle)
        origin = Vector((dx * 0.45, dy * 0.45, z))
        inward = Vector((-dx, -dy, 0.0))
        loc, norm, idx, _dist = self.torso_bvh.ray_cast(origin, inward, 0.50)
        if idx is not None and loc is not None:
            out_dir = Vector((dx, dy, 0.0))
            if norm is not None and norm.dot(out_dir) > 0.2:
                out_dir = Vector((norm.x, norm.y, 0.0)).normalized()
            return Vector((loc.x, loc.y, z)) + out_dir * offset_m
        # Fallback if ray grazes near cap
        return Vector((dx * (0.14 + offset_m), dy * (0.10 + offset_m), z))

    def leg_xy_center_at_z(self, side: int, z: float) -> tuple[float, float]:
        regs = ("thigh_l", "knee_l", "shin_l", "ankle_l") if side > 0 else ("thigh_r", "knee_r", "shin_r", "ankle_r")
        pts = [
            self.body.verts_basis[i]
            for i, r in enumerate(self.body.vert_regions)
            if r in regs and not self.body.vert_is_interior[i] and abs(self.body.verts_basis[i].z - z) < 0.09
        ]
        if pts:
            return (sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts))
        return (self.leg_l_cx, self.leg_l_cy) if side > 0 else (self.leg_r_cx, self.leg_r_cy)

    def leg_point(
        self, side: int, angle: float, z: float, offset_m: float = 0.0
    ) -> Vector:
        cx, cy = self.leg_xy_center_at_z(side, z)
        bvh = self.leg_l_bvh if side > 0 else self.leg_r_bvh
        dx, dy = math.cos(angle), math.sin(angle)
        origin = Vector((cx + dx * 0.30, cy + dy * 0.30, z))
        inward = Vector((-dx, -dy, 0.0))
        loc, norm, idx, _dist = bvh.ray_cast(origin, inward, 0.35)
        if idx is not None and loc is not None:
            return Vector((loc.x, loc.y, z)) + Vector((dx, dy, 0.0)) * offset_m
        return Vector((cx + dx * (0.055 + offset_m), cy + dy * (0.055 + offset_m), z))

    def arm_frame(self, side: int) -> tuple[Vector, Vector, Vector, Vector]:
        """Return (root, dir, front_vec_u, up_perp_vec_v) for arm tube."""
        root = self.sh_l if side > 0 else self.sh_r
        d = self.arm_l_dir if side > 0 else self.arm_r_dir
        u = Vector((0.0, -1.0, 0.0))  # front (-Y)
        v = d.cross(u).normalized()
        if v.z < 0:
            v = -v
        return root, d, u, v

    def arm_point(
        self, side: int, s: float, angle: float, offset_m: float = 0.0
    ) -> Vector:
        """Raycast radially toward arm axis at distance ``s`` from shoulder."""
        root, d, u, v = self.arm_frame(side)
        bvh = self.arm_l_bvh if side > 0 else self.arm_r_bvh
        axis_pt = root + d * s
        rad = u * math.cos(angle) + v * math.sin(angle)
        loc, _norm, idx, _dist = bvh.ray_cast(axis_pt + rad * 0.25, -rad, 0.30)
        if idx is not None and loc is not None:
            return loc + rad * offset_m
        return axis_pt + rad * (0.040 + offset_m)


# ---------------------------------------------------------------------------
# Face Painting Helper
# ---------------------------------------------------------------------------


def _paint_faces(
    bm: bmesh.types.BMesh,
    face_zones: list[tuple[bmesh.types.BMFace, str, str, float]],
) -> None:
    """Apply M_Palette UVs and COLOR_0 tint+shade tags on ``bm``."""
    charexport.ensure_color_layer(bm)
    tint_map: dict[bmesh.types.BMFace, str] = {}
    for f, swatch_key, tint_slot, _shade in face_zones:
        charexport.paint_palette(bm, [f], swatch_key)
        tint_map[f] = tint_slot
    charexport.set_garment_colors(bm, face_tint_map=tint_map, shade=1.0)
    layer = bm.loops.layers.float_color.get(charexport.COLOR_LAYER)
    for f, _sk, _ts, shade in face_zones:
        if abs(shade - 1.0) > 1e-4:
            for loop in f.loops:
                c = loop[layer]
                loop[layer] = (c[0], c[1], c[2], max(0.0, min(1.0, shade)))


def _add_quad(
    bm: bmesh.types.BMesh,
    vs: tuple[bmesh.types.BMVert, bmesh.types.BMVert, bmesh.types.BMVert, bmesh.types.BMVert],
    face_zones: list[tuple[bmesh.types.BMFace, str, str, float]],
    swatch: str,
    tint: str = "primary",
    shade: float = 1.0,
    out_ref: Vector | None = None,
) -> bmesh.types.BMFace | None:
    try:
        f = bm.faces.new(vs)
        f.smooth = False
        if out_ref is not None:
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - out_ref) < 0.0:
                f.normal_flip()
        face_zones.append((f, swatch, tint, shade))
        return f
    except ValueError:
        return None


def _ensure_outward_normals(bm: bmesh.types.BMesh, *, recalc: bool = False) -> None:
    orphan_verts = [v for v in bm.verts if not v.link_faces]
    for v in orphan_verts:
        bm.verts.remove(v)
    bm.verts.index_update()
    bm.normal_update()
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


# ---------------------------------------------------------------------------
# Tops Builders (T-shirt, Office Shirt, Hoodie)
# ---------------------------------------------------------------------------


def _build_top_mesh(
    sampler: BodySampler,
    *,
    sleeve_len: float,
    torso_offset_hips: float,
    torso_offset_chest: float,
    sleeve_offset: float,
    collar_type: str,
    primary_swatch: str,
    secondary_swatch: str | None = None,
    secondary_tint: str = "secondary",
    has_hood: bool = False,
) -> bmesh.types.BMesh:
    """Build a manifold 16-sided torso + 8-sided bridged-sleeve top garment."""
    bm = bmesh.new()
    face_zones: list[tuple[bmesh.types.BMFace, str, str, float]] = []

    hips_mn, hips_mx = sampler.region_bounds("hips")
    chest_mn, chest_mx = sampler.region_bounds("chest")
    neck_mn, _neck_mx = sampler.region_bounds("neck")

    z_hem = max(hips_mn.z + 0.118, hips_mx.z - 0.025)
    z_arm_bot = chest_mn.z + 0.015
    z_arm_mid = (chest_mn.z + chest_mx.z) * 0.5 + 0.01
    # Top of armhole MUST clear upper shoulder cap (~chest_mx.z)
    arm_l_mn, arm_l_mx = sampler.region_bounds("upper_arm_l")
    z_arm_top = max(chest_mx.z + 0.012, arm_l_mx.z + 0.010)
    z_bust = chest_mn.z + 0.055  # captures female/male chest peak at ~1.245

    # Strictly ascending torso rings from upper hip / hem to shoulder cap
    N = 16
    z_upper_hip = max(hips_mx.z, z_hem + 0.044)
    z_waist = 0.5 * (z_upper_hip + z_arm_bot)
    ring_specs = [
        (z_hem, torso_offset_hips, 0.0),                        # 0: hem
        (z_hem + 0.022, torso_offset_hips + 0.001, 0.0),        # 1: hem band
        (z_upper_hip, torso_offset_hips, 0.0),                  # 2: upper hip / lower waist
        (0.5 * (z_upper_hip + z_waist), torso_offset_chest + 0.001, 0.0),  # 3: lower belly
        (z_waist, torso_offset_chest + 0.001, 0.0),             # 4: waist/belly
        (z_arm_bot, torso_offset_chest, 0.0),                   # 5: arm_bot
        (z_bust, torso_offset_chest + 0.001, 0.0),              # 6: bust
        (z_arm_mid, torso_offset_chest, 0.0),                   # 7: arm_mid
        (z_arm_top, torso_offset_chest + 0.002, 0.0),           # 8: arm_top
    ]
    r_arm_bot, r_bust, r_arm_mid, r_arm_top = 5, 6, 7, 8

    torso_rings: list[list[bmesh.types.BMVert]] = []
    for r_idx, (rz, roff, _) in enumerate(ring_specs):
        ring: list[bmesh.types.BMVert] = []
        for c in range(N):
            ang = 2.0 * math.pi * c / N
            # Query at <= chest_mx.z so shoulder-top ring reads top shoulder contour cleanly
            query_z = min(rz, chest_mx.z - 0.004)
            pt = sampler.torso_point(ang, query_z, roff)
            pt.z = rz
            ring.append(bm.verts.new(pt))
        torso_rings.append(ring)

    # Neckline ring above arm_top: scoops forward at front (-Y, cols 10..14) for crew/shirt,
    # higher & snugly wrapping neck base for hoodie
    neck_ring: list[bmesh.types.BMVert] = []
    neck_z_top = max(neck_mn.z + (0.012 if collar_type == "hoodie" else 0.006), chest_mx.z + 0.014)
    for c in range(N):
        ang = 2.0 * math.pi * c / N
        frontness = max(0.0, -math.sin(ang))  # 1.0 at exact front (-Y), 0 at sides/back
        if collar_type == "crew":
            z_cur = neck_z_top - 0.050 * (frontness ** 1.4)
        elif collar_type == "shirt":
            z_cur = neck_z_top - 0.042 * (frontness ** 1.4)
        else:  # hoodie
            z_cur = neck_z_top - 0.014 * (frontness ** 1.4)
        z_cur = max(z_cur, chest_mx.z + 0.0085)
        pt = sampler.torso_point(ang, min(z_cur, neck_mn.z), torso_offset_chest + 0.002)
        if abs(math.cos(ang)) > 0.35:
            pt.x *= 0.72
            pt.z = max(pt.z, neck_z_top - 0.004)
        else:
            pt.z = z_cur
        neck_ring.append(bm.verts.new(pt))
    torso_rings.append(neck_ring)

    left_skip = {(r_arm_bot, 15), (r_arm_bot, 0), (r_bust, 15), (r_bust, 0), (r_arm_mid, 15), (r_arm_mid, 0)}
    right_skip = {(r_arm_bot, 7), (r_arm_bot, 8), (r_bust, 7), (r_bust, 8), (r_arm_mid, 7), (r_arm_mid, 8)}

    n_rings = len(torso_rings)
    for r in range(n_rings - 1):
        r0 = torso_rings[r]
        r1 = torso_rings[r + 1]
        for c in range(N):
            if (r, c) in left_skip or (r, c) in right_skip:
                continue
            c2 = (c + 1) % N
            shade = 0.88 if r == 0 else 1.0
            swatch = primary_swatch
            tint = "primary"
            if collar_type == "shirt" and c in (11, 12) and r >= 1:
                shade = 0.93
            _add_quad(
                bm,
                (r0[c], r0[c2], r1[c2], r1[c]),
                face_zones,
                swatch,
                tint=tint,
                shade=shade,
            )

    # Collar rim / pointed shirt collar / hoodie drawcord trim
    if collar_type in ("crew", "shirt", "hoodie"):
        collar_ring: list[bmesh.types.BMVert] = []
        for c in range(N):
            base_v = neck_ring[c].co
            ang = 2.0 * math.pi * c / N
            frontness = max(0.0, -math.sin(ang))
            if collar_type == "shirt":
                # Turned-down crisp white shirt collar points in front
                drop = 0.026 + (0.018 if c in (10, 11, 13, 14) else 0.0)
                v = bm.verts.new(
                    Vector((
                        base_v.x * 1.07,
                        base_v.y * 1.08 - frontness * 0.006,
                        base_v.z + 0.014 if frontness < 0.3 else base_v.z + 0.010,
                    ))
                )
                collar_ring.append(v)
            else:
                v = bm.verts.new(
                    Vector((base_v.x * 0.97, base_v.y * 0.97, base_v.z + 0.012))
                )
                collar_ring.append(v)

        c_sw = secondary_swatch if (collar_type == "shirt" and secondary_swatch) else primary_swatch
        c_tint = secondary_tint if (collar_type == "shirt" and secondary_swatch) else "primary"
        c_shade = 0.98 if collar_type == "shirt" else 0.86

        if collar_type == "shirt":
            # Turned-down collar flap around the neckline
            flap_ring: list[bmesh.types.BMVert] = []
            for c in range(N):
                cv = collar_ring[c].co
                ang = 2.0 * math.pi * c / N
                frontness = max(0.0, -math.sin(ang))
                point_drop = 0.022 + (0.018 if c in (11, 13) else 0.0)
                out = Vector((math.cos(ang), math.sin(ang), 0.0)) * 0.010
                flap_ring.append(
                    bm.verts.new(
                        Vector((cv.x + out.x, cv.y + out.y, cv.z - point_drop))
                    )
                )
            for c in range(N):
                c2 = (c + 1) % N
                _add_quad(
                    bm,
                    (neck_ring[c], neck_ring[c2], collar_ring[c2], collar_ring[c]),
                    face_zones,
                    c_sw,
                    tint=c_tint,
                    shade=0.92,
                )
                if c not in (11, 12):  # small V opening at center front throat
                    _add_quad(
                        bm,
                        (collar_ring[c], collar_ring[c2], flap_ring[c2], flap_ring[c]),
                        face_zones,
                        c_sw,
                        tint=c_tint,
                        shade=1.0,
                    )
        else:
            for c in range(N):
                c2 = (c + 1) % N
                _add_quad(
                    bm,
                    (neck_ring[c], neck_ring[c2], collar_ring[c2], collar_ring[c]),
                    face_zones,
                    primary_swatch,
                    tint="primary",
                    shade=c_shade,
                )

    # Hoodie drawstring accents & front kangaroo pocket
    if has_hood and secondary_swatch:
        # Curved kangaroo pocket relief pad matching torso columns 10..14 with no skipped ring verts
        p_bot = [
            bm.verts.new(torso_rings[1][c].co + Vector((0.0, -0.012, 0.004)))
            for c in (10, 11, 12, 13, 14)
        ]
        p_top = [
            bm.verts.new(torso_rings[2][c].co + Vector((0.0, -0.011, 0.012)))
            for c in (10, 11, 12, 13, 14)
        ]
        cols_bot = [torso_rings[1][c] for c in (10, 11, 12, 13, 14)]
        cols_top = [torso_rings[2][c] for c in (10, 11, 12, 13, 14)]
        for k in range(4):
            _add_quad(bm, (p_bot[k], p_bot[k + 1], p_top[k + 1], p_top[k]), face_zones, primary_swatch, "primary", 0.90)
            _add_quad(bm, (cols_bot[k], cols_bot[k + 1], p_bot[k + 1], p_bot[k]), face_zones, primary_swatch, "primary", 0.82)
            _add_quad(bm, (p_top[k], p_top[k + 1], cols_top[k + 1], cols_top[k]), face_zones, primary_swatch, "primary", 0.86)
        _add_quad(bm, (cols_bot[0], p_bot[0], p_top[0], cols_top[0]), face_zones, primary_swatch, "primary", 0.82)
        _add_quad(bm, (p_bot[4], cols_bot[4], cols_top[4], p_top[4]), face_zones, primary_swatch, "primary", 0.82)

        # Two crisp accent drawstrings hanging down upper chest front
        for sx in (-0.022, 0.022):
            top_p = sampler.torso_point(-math.pi * 0.5 + sx * 1.4, neck_mn.z - 0.015, torso_offset_chest + 0.005)
            bot_p = sampler.torso_point(-math.pi * 0.5 + sx * 1.2, neck_mn.z - 0.125, torso_offset_chest + 0.007)
            v0 = bm.verts.new(top_p + Vector((-0.004, 0, 0)))
            v1 = bm.verts.new(top_p + Vector((0.004, 0, 0)))
            v2 = bm.verts.new(bot_p + Vector((0.004, 0, 0)))
            v3 = bm.verts.new(bot_p + Vector((-0.004, 0, 0)))
            _add_quad(bm, (v0, v1, v2, v3), face_zones, secondary_swatch, secondary_tint, 1.0)

        # Relaxed folded hood resting behind upper back & neck
        h_l0 = neck_ring[2].co + Vector((0.01, 0.02, 0.0))
        h_m0 = neck_ring[4].co + Vector((0.0, 0.035, 0.0))
        h_r0 = neck_ring[6].co + Vector((-0.01, 0.02, 0.0))
        h_l1 = torso_rings[r_arm_top][2].co + Vector((0.01, 0.055, -0.02))
        h_m1 = torso_rings[r_arm_top][4].co + Vector((0.0, 0.070, -0.03))
        h_r1 = torso_rings[r_arm_top][6].co + Vector((-0.01, 0.055, -0.02))
        hl0, hm0, hr0 = bm.verts.new(h_l0), bm.verts.new(h_m0), bm.verts.new(h_r0)
        hl1, hm1, hr1 = bm.verts.new(h_l1), bm.verts.new(h_m1), bm.verts.new(h_r1)
        _add_quad(bm, (neck_ring[2], neck_ring[4], hm0, hl0), face_zones, primary_swatch, "primary", 0.92)
        _add_quad(bm, (neck_ring[4], neck_ring[6], hr0, hm0), face_zones, primary_swatch, "primary", 0.92)
        _add_quad(bm, (hl0, hm0, hm1, hl1), face_zones, primary_swatch, "primary", 0.88)
        _add_quad(bm, (hm0, hr0, hr1, hm1), face_zones, primary_swatch, "primary", 0.88)
        _add_quad(bm, (hl1, hm1, torso_rings[r_arm_top][4], torso_rings[r_arm_top][2]), face_zones, primary_swatch, "primary", 0.82)
        _add_quad(bm, (hm1, hr1, torso_rings[r_arm_top][6], torso_rings[r_arm_top][4]), face_zones, primary_swatch, "primary", 0.82)

    # Bridge 10-sided sleeves into Left & Right 10-vert armholes!
    for side in (+1, -1):
        # 10-vert armhole boundary ordered: bottom -> front -> top -> back
        if side > 0:
            hole_loop = [
                torso_rings[r_arm_bot][0],
                torso_rings[r_arm_bot][15],
                torso_rings[r_bust][15],
                torso_rings[r_arm_mid][15],
                torso_rings[r_arm_top][15],
                torso_rings[r_arm_top][0],
                torso_rings[r_arm_top][1],
                torso_rings[r_arm_mid][1],
                torso_rings[r_bust][1],
                torso_rings[r_arm_bot][1],
            ]
        else:
            hole_loop = [
                torso_rings[r_arm_bot][8],
                torso_rings[r_arm_bot][9],
                torso_rings[r_bust][9],
                torso_rings[r_arm_mid][9],
                torso_rings[r_arm_top][9],
                torso_rings[r_arm_top][8],
                torso_rings[r_arm_top][7],
                torso_rings[r_arm_mid][7],
                torso_rings[r_bust][7],
                torso_rings[r_arm_bot][7],
            ]

        _, _d, u_front, v_up = sampler.arm_frame(side)

        # Start sleeve clearly past lateral chest wall so armhole ring never blocks chest clearance
        el_mn, el_mx = sampler.region_bounds("elbow_l")
        el_c = 0.5 * (el_mn + el_mx)
        elbow_s = (el_c - sampler.sh_l).length
        s_steps = (
            [0.032, 0.062, 0.115, elbow_s - 0.035, elbow_s, elbow_s + 0.035, sleeve_len - 0.07, sleeve_len - 0.02, sleeve_len]
            if sleeve_len > 0.25
            else [0.032, 0.062, 0.105, sleeve_len - 0.018, sleeve_len]
        )
        sleeve_rings: list[list[bmesh.types.BMVert]] = [hole_loop]

        chest_wall_x = chest_mx.x + 0.008
        for s_val in s_steps:
            sring: list[bmesh.types.BMVert] = []
            # Extra shoulder/deltoid & underarm gusset clearance prevents skin poke-through at extremes & arm swing
            base_ring_off = sleeve_offset + (0.0095 if s_val <= 0.070 else 0.0)
            for k in range(10):
                theta = k * (2.0 * math.pi / 10.0)
                arm_ang = -math.pi * 0.5 + theta
                underarm_ease = 0.0065 * max(0.0, -math.sin(arm_ang)) if s_val <= 0.070 else 0.0
                pt = sampler.arm_point(side, s_val, arm_ang, base_ring_off + underarm_ease)
                # Prevent first underarm ring from dipping inside lateral ribcage wall
                if s_val <= 0.075:
                    if side > 0:
                        pt.x = max(pt.x, chest_wall_x)
                    else:
                        pt.x = min(pt.x, -chest_wall_x)
                sring.append(bm.verts.new(pt))
            sleeve_rings.append(sring)

        for r_idx in range(len(sleeve_rings) - 1):
            sr0 = sleeve_rings[r_idx]
            sr1 = sleeve_rings[r_idx + 1]
            c0 = sum((v.co for v in sr0), Vector((0, 0, 0))) / len(sr0)
            c1 = sum((v.co for v in sr1), Vector((0, 0, 0))) / len(sr1)
            # First bridge ring spans from torso wall to shoulder; anchor out_ref inside torso center
            ring_mid = Vector((0.0, 0.0, 0.5 * (c0.z + c1.z))) if r_idx == 0 else 0.5 * (c0 + c1)
            is_cuff = r_idx == len(sleeve_rings) - 2
            c_sw = primary_swatch
            c_tint = "primary"
            c_shade = 0.88 if is_cuff else 1.0
            if collar_type == "shirt" and is_cuff and secondary_swatch:
                c_sw = secondary_swatch
                c_tint = secondary_tint
                c_shade = 0.96
            for k in range(10):
                k2 = (k + 1) % 10
                _add_quad(
                    bm,
                    (sr0[k], sr0[k2], sr1[k2], sr1[k]),
                    face_zones,
                    c_sw,
                    tint=c_tint,
                    shade=c_shade,
                    out_ref=ring_mid,
                )

    _paint_faces(bm, face_zones)
    _ensure_outward_normals(bm)
    return bm


# ---------------------------------------------------------------------------
# Bottoms Builders (Jeans, Trousers, Shorts)
# ---------------------------------------------------------------------------


def _build_bottom_mesh(
    sampler: BodySampler,
    *,
    z_cuff: float,
    waist_offset: float,
    leg_offset: float,
    cuff_flare: float,
    swatch: str,
    is_shorts: bool = False,
) -> tuple[bmesh.types.BMesh, set[int], set[int]]:
    """Build a manifold 20->2x12 trouser / shorts mesh matching body leg rings cleanly."""
    bm = bmesh.new()
    face_zones: list[tuple[bmesh.types.BMFace, str, str, float]] = []

    hips_mn, hips_mx = sampler.region_bounds("hips")
    belly_mn, _ = sampler.region_bounds("belly")

    z_waist = max(hips_mx.z + 0.028, belly_mn.z - 0.012)
    z_pelvis_split = hips_mn.z + 0.008  # just above hips bottom cap (~0.848)

    N = 20
    pelvis_z = (
        z_waist,
        z_waist - 0.022,
        (hips_mn.z + hips_mx.z) * 0.5 + 0.020,  # ~0.935 hip widest curve
        hips_mn.z + 0.042,                       # ~0.882 lower hip / outer trochanter
        z_pelvis_split,
    )
    pelvis_rings: list[list[bmesh.types.BMVert]] = []
    for idx, pz in enumerate(pelvis_z):
        ring: list[bmesh.types.BMVert] = []
        if idx == 0:
            off = waist_offset + 0.002
        elif idx == 1:
            off = waist_offset
        elif idx == 2:
            off = max(waist_offset + 0.003, leg_offset)
        else:
            off = max(waist_offset + 0.003, leg_offset) + 0.0045
        for c in range(N):
            ang = 2.0 * math.pi * c / N
            pt = sampler.torso_point(ang, pz, off) if idx <= 1 else sampler.pelvis_ext_point(ang, pz, off)
            ring.append(bm.verts.new(pt))
        pelvis_rings.append(ring)

    # Waistband & hips quads
    for r in range(len(pelvis_rings) - 1):
        shade = 0.86 if r == 0 else 1.0  # darker crisp waistband
        out_center = Vector((0.0, 0.0, 0.5 * (pelvis_rings[r][0].co.z + pelvis_rings[r + 1][0].co.z)))
        for c in range(N):
            c2 = (c + 1) % N
            _add_quad(
                bm,
                (pelvis_rings[r][c], pelvis_rings[r][c2], pelvis_rings[r + 1][c2], pelvis_rings[r + 1][c]),
                face_zones,
                swatch,
                tint="primary",
                shade=shade,
                out_ref=out_center,
            )

    # Smooth crotch saddle at z = hips_mn.z - 0.032 (clears hips bottom cap by >32mm)
    split_ring = pelvis_rings[-1]
    z_crotch = hips_mn.z - 0.032
    z_leg_top = hips_mn.z - 0.044

    v_f_crotch = bm.verts.new(Vector((0.0, split_ring[15].co.y * 0.72, z_crotch + 0.002)))
    v_c_crotch = bm.verts.new(Vector((0.0, 0.005, z_crotch - 0.002)))
    v_b_crotch = bm.verts.new(Vector((0.0, split_ring[5].co.y * 0.72, z_crotch + 0.002)))

    crotch_center = Vector((0.0, 0.0, z_crotch + 0.04))
    for vs in (
        (split_ring[14], split_ring[15], v_f_crotch),
        (split_ring[15], split_ring[16], v_f_crotch),
        (split_ring[4], split_ring[5], v_b_crotch),
        (split_ring[5], split_ring[6], v_b_crotch),
    ):
        try:
            f = bm.faces.new(vs)
            f.smooth = False
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - crotch_center) < 0.0:
                f.normal_flip()
            face_zones.append((f, swatch, "primary", 0.90))
        except ValueError:
            pass

    # Left & Right 12-vert top loops from 20-vert split_ring + 3 crotch saddle verts
    left_top_loop = [
        split_ring[16], split_ring[17], split_ring[18], split_ring[19],
        split_ring[0], split_ring[1], split_ring[2], split_ring[3], split_ring[4],
        v_b_crotch, v_c_crotch, v_f_crotch,
    ]
    right_top_loop = [
        split_ring[6], split_ring[7], split_ring[8], split_ring[9],
        split_ring[10], split_ring[11], split_ring[12], split_ring[13], split_ring[14],
        v_f_crotch, v_c_crotch, v_b_crotch,
    ]

    # Match actual exterior leg Z cross-sections + dense 3-ring knee articulation cluster
    knee_mn, knee_mx = sampler.region_bounds("knee_l")
    knee_mid_z = 0.5 * (knee_mn.z + knee_mx.z)
    leg_zs_raw = sorted(
        {
            round(sampler.body.verts_basis[vi].z, 3)
            for vi in sampler.body.ext_vert_indices
            if sampler.body.vert_regions[vi] in ("thigh_l", "knee_l", "shin_l", "ankle_l")
        },
        reverse=True,
    )
    interior_zs = [
        zv for zv in leg_zs_raw if z_cuff + 0.035 < zv < z_leg_top - 0.035
    ]
    if not is_shorts:
        for kz in (knee_mid_z + 0.035, knee_mid_z, knee_mid_z - 0.035):
            if z_cuff + 0.035 < kz < z_leg_top - 0.035:
                interior_zs.append(round(kz, 3))
        interior_zs.sort(reverse=True)
    dedup_zs: list[float] = []
    for zv in interior_zs:
        near_knee = (not is_shorts) and abs(zv - knee_mid_z) <= 0.042
        min_gap = 0.028 if near_knee else 0.045
        if not dedup_zs or abs(dedup_zs[-1] - zv) >= min_gap:
            dedup_zs.append(zv)
    leg_z_stops = [z_leg_top] + dedup_zs + ([z_cuff + 0.025, z_cuff] if not is_shorts else [z_cuff + 0.020, z_cuff])

    left_angles = [
        -1.5708, -1.1781, -0.7854, -0.3927, 0.0, 0.3927, 0.7854, 1.1781, 1.5708, 2.62, math.pi, -2.62
    ]
    right_angles = [
        1.5708, 1.9635, 2.3562, 2.7489, math.pi, -2.7489, -2.3562, -1.9635, -1.5708, -0.52, 0.0, 0.52
    ]

    n_leg = 12
    left_leg_verts: set[bmesh.types.BMVert] = set()
    right_leg_verts: set[bmesh.types.BMVert] = set()
    for side, top_loop, angs in ((+1, left_top_loop, left_angles), (-1, right_top_loop, right_angles)):
        leg_rings: list[list[bmesh.types.BMVert]] = [top_loop]
        for li, lz in enumerate(leg_z_stops):
            is_last = li >= len(leg_z_stops) - 2
            # Extra 5mm ease at upper thigh prevents extreme/walk_stride creases
            upper_t = max(0.0, min(1.0, (lz - (knee_mid_z + 0.08)) / 0.24))
            off = leg_offset + 0.005 * upper_t + (cuff_flare if is_last else 0.0)
            knee_prox = max(0.0, 1.0 - abs(lz - knee_mid_z) / 0.045) if not is_shorts else 0.0
            lring: list[bmesh.types.BMVert] = []
            for a in angs:
                front_bias = max(0.0, -math.sin(a)) * 0.008 * knee_prox
                pt = sampler.leg_point(side, a, lz, off + front_bias)
                if side > 0:
                    pt.x = max(pt.x, 0.0015)
                else:
                    pt.x = min(pt.x, -0.0015)
                v = bm.verts.new(pt)
                if side > 0:
                    left_leg_verts.add(v)
                else:
                    right_leg_verts.add(v)
                lring.append(v)
            leg_rings.append(lring)

        for r in range(len(leg_rings) - 1):
            shade = 0.86 if r == len(leg_rings) - 2 else 1.0
            z_mid = 0.5 * (
                sum(v.co.z for v in leg_rings[r]) / n_leg
                + sum(v.co.z for v in leg_rings[r + 1]) / n_leg
            )
            cx, cy = sampler.leg_xy_center_at_z(side, z_mid)
            leg_ref = Vector((cx, cy, z_mid))
            for k in range(n_leg):
                k2 = (k + 1) % n_leg
                _add_quad(
                    bm,
                    (leg_rings[r][k], leg_rings[r][k2], leg_rings[r + 1][k2], leg_rings[r + 1][k]),
                    face_zones,
                    swatch,
                    tint="primary",
                    shade=shade,
                    out_ref=leg_ref,
                )

    _paint_faces(bm, face_zones)
    _ensure_outward_normals(bm, recalc=False)
    bm.verts.index_update()
    left_leg_vis = {v.index for v in left_leg_verts if v.is_valid}
    right_leg_vis = {v.index for v in right_leg_verts if v.is_valid}
    return bm, left_leg_vis, right_leg_vis


# ---------------------------------------------------------------------------
# Fullbody Dress Builder (Female Only, A-line + Sit-Friendly Weights)
# ---------------------------------------------------------------------------


def _build_dress_mesh(
    sampler: BodySampler,
    swatch: str = "c_rose",
) -> bmesh.types.BMesh:
    """Build a short-sleeve A-line dress from chest neckline down to knee level."""
    bm = bmesh.new()
    face_zones: list[tuple[bmesh.types.BMFace, str, str, float]] = []

    hips_mn, hips_mx = sampler.region_bounds("hips")
    chest_mn, chest_mx = sampler.region_bounds("chest")
    neck_mn, _ = sampler.region_bounds("neck")
    knee_mn, _ = sampler.region_bounds("knee_l")

    z_arm_bot = chest_mn.z + 0.015
    z_bust = chest_mn.z + 0.055
    z_arm_mid = (chest_mn.z + chest_mx.z) * 0.5 + 0.01
    arm_l_mn, arm_l_mx = sampler.region_bounds("upper_arm_l")
    z_arm_top = max(chest_mx.z + 0.012, arm_l_mx.z + 0.010)
    z_waist = hips_mx.z + 0.035
    z_hip = (hips_mn.z + hips_mx.z) * 0.5
    z_skirt_mid = (hips_mn.z + knee_mn.z) * 0.5
    z_skirt_hem = knee_mn.z + 0.015

    # Skirt A-line envelope expands monotonically below waist so legs never poke through
    # Measure hip outer envelope to anchor smooth A-line radii
    hip_rx = max(abs(sampler.torso_point(0.0, z_hip, 0.012).x), abs(sampler.torso_point(math.pi, z_hip, 0.012).x))
    hip_ry_f = abs(sampler.torso_point(-math.pi * 0.5, z_hip, 0.015).y)
    hip_ry_b = abs(sampler.torso_point(math.pi * 0.5, z_hip, 0.015).y)

    N = 16
    rings: list[list[bmesh.types.BMVert]] = []

    # Lower skirt rings (bottom -> waist): flared ellipses cleanly enveloping torso + thighs
    skirt_specs = [
        (z_skirt_hem, hip_rx + 0.062, hip_ry_f + 0.052, hip_ry_b + 0.048, 0.88),
        (z_skirt_mid, hip_rx + 0.038, hip_ry_f + 0.034, hip_ry_b + 0.032, 1.0),
        (hips_mn.z - 0.02, hip_rx + 0.026, hip_ry_f + 0.028, hip_ry_b + 0.026, 1.0),
        (z_hip, hip_rx + 0.016, hip_ry_f + 0.018, hip_ry_b + 0.016, 1.0),
        (hips_mx.z - 0.025, hip_rx + 0.018, hip_ry_f + 0.020, hip_ry_b + 0.018, 1.0),
    ]
    for sz, rx, ryf, ryb, _sh in skirt_specs:
        sring: list[bmesh.types.BMVert] = []
        for c in range(N):
            ang = 2.0 * math.pi * c / N
            t_pt = sampler.torso_point(ang, max(sz, hips_mn.z), 0.016)
            ry = ryf if math.sin(ang) < 0 else ryb
            cand = Vector((math.cos(ang) * rx, math.sin(ang) * ry, sz))
            if sz >= hips_mn.z and cand.xy.length < t_pt.xy.length:
                cand.x, cand.y = t_pt.x, t_pt.y
            sring.append(bm.verts.new(cand))
        rings.append(sring)

    r_waist = len(skirt_specs)
    r_arm_bot = r_waist + 2
    r_bust = r_arm_bot + 1
    r_arm_mid = r_arm_bot + 2
    r_arm_top = r_arm_bot + 3

    # Waist belt & upper bodice rings
    bodice_z = (
        (z_waist, 0.016),
        ((z_waist + z_arm_bot) * 0.5, 0.016),
        (z_arm_bot, 0.016),
        (z_bust, 0.018),
        (z_arm_mid, 0.017),
        (z_arm_top, 0.018),
    )
    for bz, boff in bodice_z:
        bring: list[bmesh.types.BMVert] = []
        qz = min(bz, chest_mx.z - 0.004)
        for c in range(N):
            ang = 2.0 * math.pi * c / N
            pt = sampler.torso_point(ang, qz, boff)
            # Clear back scapulae chord across the long upper-bodice span on Muscle+Shoulders
            if bz == z_arm_top and math.sin(ang) > 0.20:
                pt.y += 0.006
            pt.z = bz
            bring.append(bm.verts.new(pt))
        rings.append(bring)

    # Scoop neckline ring
    neck_ring: list[bmesh.types.BMVert] = []
    neck_z_top = max(neck_mn.z + 0.006, chest_mx.z + 0.014)
    for c in range(N):
        ang = 2.0 * math.pi * c / N
        frontness = max(0.0, -math.sin(ang))
        z_cur = max(neck_z_top - 0.055 * (frontness ** 1.4), chest_mx.z + 0.0085)
        pt = sampler.torso_point(ang, min(z_cur, neck_mn.z), 0.016)
        if abs(math.cos(ang)) > 0.35:
            pt.x *= 0.72
            pt.z = max(pt.z, neck_z_top - 0.004)
        else:
            pt.z = z_cur
        neck_ring.append(bm.verts.new(pt))
    rings.append(neck_ring)

    # Armhole windows on arm_bot, bust, arm_mid up to arm_top
    left_skip = {(r_arm_bot, 15), (r_arm_bot, 0), (r_bust, 15), (r_bust, 0), (r_arm_mid, 15), (r_arm_mid, 0)}
    right_skip = {(r_arm_bot, 7), (r_arm_bot, 8), (r_bust, 7), (r_bust, 8), (r_arm_mid, 7), (r_arm_mid, 8)}

    for r in range(len(rings) - 1):
        shade = 0.86 if r in (0, r_waist) else 1.0  # hem trim + waist sash band
        for c in range(N):
            if (r, c) in left_skip or (r, c) in right_skip:
                continue
            c2 = (c + 1) % N
            _add_quad(
                bm,
                (rings[r][c], rings[r][c2], rings[r + 1][c2], rings[r + 1][c]),
                face_zones,
                swatch,
                tint="primary",
                shade=shade,
            )

    # Cap sleeves bridged into left/right 10-vert armholes
    for side in (+1, -1):
        if side > 0:
            hole_loop = [
                rings[r_arm_bot][0], rings[r_arm_bot][15], rings[r_bust][15], rings[r_arm_mid][15], rings[r_arm_top][15],
                rings[r_arm_top][0], rings[r_arm_top][1], rings[r_arm_mid][1], rings[r_bust][1], rings[r_arm_bot][1],
            ]
        else:
            hole_loop = [
                rings[r_arm_bot][8], rings[r_arm_bot][9], rings[r_bust][9], rings[r_arm_mid][9], rings[r_arm_top][9],
                rings[r_arm_top][8], rings[r_arm_top][7], rings[r_arm_mid][7], rings[r_bust][7], rings[r_arm_bot][7],
            ]
        sleeve_steps = (0.032, 0.058, 0.105, 0.14, 0.16)
        s_rings = [hole_loop]
        for sv in sleeve_steps:
            sr: list[bmesh.types.BMVert] = []
            ring_off = 0.016 + (0.0045 if sv <= 0.065 else 0.0)
            for k in range(10):
                arm_ang = -math.pi * 0.5 + k * (2.0 * math.pi / 10.0)
                sr.append(bm.verts.new(sampler.arm_point(side, sv, arm_ang, ring_off)))
            s_rings.append(sr)
        for ri in range(len(s_rings) - 1):
            sh = 0.88 if ri == len(s_rings) - 2 else 1.0
            c0 = sum((v.co for v in s_rings[ri]), Vector((0, 0, 0))) / len(s_rings[ri])
            c1 = sum((v.co for v in s_rings[ri + 1]), Vector((0, 0, 0))) / len(s_rings[ri + 1])
            ring_mid = Vector((0.0, 0.0, 0.5 * (c0.z + c1.z))) if ri == 0 else 0.5 * (c0 + c1)
            for k in range(10):
                k2 = (k + 1) % 10
                _add_quad(
                    bm,
                    (s_rings[ri][k], s_rings[ri][k2], s_rings[ri + 1][k2], s_rings[ri + 1][k]),
                    face_zones,
                    swatch,
                    tint="primary",
                    shade=sh,
                    out_ref=ring_mid,
                )

    _paint_faces(bm, face_zones)
    _ensure_outward_normals(bm)
    return bm


# ---------------------------------------------------------------------------
# Shoes Builder (Sneakers & Loafers)
# ---------------------------------------------------------------------------


def _build_shoes_mesh(
    sampler: BodySampler,
    *,
    style: str,  # "sneaker" | "loafer"
    primary_swatch: str,
    accent_swatch: str | None = None,
) -> bmesh.types.BMesh:
    """Build left + right sculpted low-poly shoes enclosing foot_l & foot_r cleanly."""
    bm = bmesh.new()
    face_zones: list[tuple[bmesh.types.BMFace, str, str, float]] = []

    for side, foot_reg, ank_reg in ((+1, "foot_l", "ankle_l"), (-1, "foot_r", "ankle_r")):
        fmin, fmax = sampler.region_bounds(foot_reg)
        amin, amax = sampler.region_bounds(ank_reg)

        pad_x = 0.014
        pad_y_front = 0.014
        pad_y_back = 0.011
        sole_bot = -0.007  # strictly below foot z=0.000 by 7mm
        sole_top = 0.015 if style == "sneaker" else 0.012
        top_toe_z = fmax.z + (0.016 if style == "sneaker" else 0.014)
        collar_z = max(fmax.z + 0.018, amin.z - 0.001)

        x0 = fmin.x - pad_x
        x1 = fmax.x + pad_x
        cx = 0.5 * (x0 + x1)
        half_w = 0.5 * (x1 - x0)

        y_toe = fmin.y - pad_y_front
        y_ball = fmin.y + 0.35 * (fmax.y - fmin.y)
        y_instep = fmin.y + 0.65 * (fmax.y - fmin.y)
        y_heel = fmax.y + pad_y_back

        def foot_loop(z: float, w_scale: float = 1.0) -> list[bmesh.types.BMVert]:
            hw = half_w * w_scale
            pts = (
                Vector((cx, y_toe, z)),
                Vector((cx + hw * 0.85, y_ball * 0.55 + y_toe * 0.45, z)),
                Vector((cx + hw, y_ball, z)),
                Vector((cx + hw * 0.88, y_instep * 0.3 + y_heel * 0.7, z)),
                Vector((cx, y_heel, z)),
                Vector((cx - hw * 0.88, y_instep * 0.3 + y_heel * 0.7, z)),
                Vector((cx - hw, y_ball, z)),
                Vector((cx - hw * 0.85, y_ball * 0.55 + y_toe * 0.45, z)),
            )
            return [bm.verts.new(p) for p in pts]

        sole_bottom = foot_loop(sole_bot, w_scale=1.04)
        sole_mid = foot_loop(sole_top, w_scale=1.02)

        # Upper dome strictly covers top/side of foot_l/r (>= fmax.z + 12mm)
        upper_mid: list[bmesh.types.BMVert] = []
        upper_z_by_idx = (
            top_toe_z * 0.96,
            top_toe_z * 0.98,
            top_toe_z,
            collar_z * 0.97,
            collar_z * 0.99,
            collar_z * 0.97,
            top_toe_z,
            top_toe_z * 0.98,
        )
        for k, base_v in enumerate(sole_mid):
            p = base_v.co.copy()
            p.x = cx + (p.x - cx) * 0.97
            p.z = max(fmax.z + 0.011, upper_z_by_idx[k])
            upper_mid.append(bm.verts.new(p))

        # Open ankle collar wrapping snugly around ankle_l/r (+10mm radial ease)
        ak_cx = 0.5 * (amin.x + amax.x)
        ak_cy = 0.5 * (amin.y + amax.y)
        ak_rx = max(0.041, 0.5 * (amax.x - amin.x) + 0.011)
        ak_ry = max(0.043, 0.5 * (amax.y - amin.y) + 0.011)
        collar_pts = (
            Vector((ak_cx, min(amin.y - 0.014, ak_cy - ak_ry * 1.15), collar_z + (0.006 if style == "sneaker" else 0.0))),
            Vector((ak_cx + ak_rx * 0.85, ak_cy - ak_ry * 0.75, collar_z)),
            Vector((ak_cx + ak_rx, ak_cy, collar_z * 0.97)),
            Vector((ak_cx + ak_rx * 0.82, ak_cy + ak_ry * 0.75, collar_z)),
            Vector((ak_cx, max(amax.y + 0.008, ak_cy + ak_ry), collar_z + 0.004)),
            Vector((ak_cx - ak_rx * 0.82, ak_cy + ak_ry * 0.75, collar_z)),
            Vector((ak_cx - ak_rx, ak_cy, collar_z * 0.97)),
            Vector((ak_cx - ak_rx * 0.85, ak_cy - ak_ry * 0.75, collar_z)),
        )
        collar_loop = [bm.verts.new(p) for p in collar_pts]
        out_center = Vector((cx, 0.5 * (y_toe + y_heel), 0.5 * (sole_bot + collar_z)))

        # Sole bottom cap (normals pointing strictly -Z)
        for k in range(1, 7):
            try:
                f = bm.faces.new((sole_bottom[0], sole_bottom[k], sole_bottom[k + 1]))
                f.normal_update()
                if f.normal.z > 0.0:
                    f.normal_flip()
                face_zones.append((f, primary_swatch, "primary", 0.74))
            except ValueError:
                pass

        sole_shade = 0.80 if style == "loafer" else 0.92
        for k in range(8):
            k2 = (k + 1) % 8
            _add_quad(
                bm,
                (sole_bottom[k], sole_bottom[k2], sole_mid[k2], sole_mid[k]),
                face_zones,
                primary_swatch,
                tint="primary",
                shade=sole_shade,
                out_ref=out_center,
            )
            up_sw = primary_swatch
            up_tint = "primary"
            up_sh = 1.0
            if style == "sneaker" and accent_swatch and k in (2, 3, 4, 5):
                up_sw = accent_swatch
                up_tint = "accent"
                up_sh = 0.98
            elif style == "loafer" and k in (0, 1, 7):
                up_sh = 0.92
            _add_quad(
                bm,
                (sole_mid[k], sole_mid[k2], upper_mid[k2], upper_mid[k]),
                face_zones,
                up_sw,
                tint=up_tint,
                shade=up_sh,
                out_ref=out_center,
            )
            top_sw = primary_swatch
            top_tint = "primary"
            top_sh = 0.94
            if style == "sneaker" and accent_swatch and k == 0:
                top_sw = accent_swatch
                top_tint = "accent"
            elif style == "loafer" and k in (0, 7):
                top_sh = 0.85
            _add_quad(
                bm,
                (upper_mid[k], upper_mid[k2], collar_loop[k2], collar_loop[k]),
                face_zones,
                top_sw,
                tint=top_tint,
                shade=top_sh,
                out_ref=out_center,
            )

    _paint_faces(bm, face_zones)
    _ensure_outward_normals(bm, recalc=False)
    return bm


# ---------------------------------------------------------------------------
# Item Registry & Dispatch
# ---------------------------------------------------------------------------


def _build_item(item_id: str, base: str, sampler: BodySampler, body: fit.BodyData) -> tuple[str, bmesh.types.BMesh, dict]:
    """Construct bmesh & fitting options for one of the 9 wardrobe items."""
    body_verts = body.verts_basis
    hips_mn, hips_mx = sampler.region_bounds("hips")
    chest_mn, chest_mx = sampler.region_bounds("chest")
    # Measure shoulder-to-elbow distance cleanly
    el_mn, el_mx = sampler.region_bounds("elbow_l")
    el_c = 0.5 * (el_mn + el_mx)
    wr_pts = [body_verts[i] for i, r in enumerate(body.vert_regions) if r == "forearm_l"]
    wr_c = max(wr_pts, key=lambda p: p.x) if wr_pts else el_c + sampler.arm_l_dir * 0.22
    upper_arm_s = (el_c - sampler.sh_l).length
    wrist_s = (wr_c - sampler.sh_l).length

    ankle_mn, _ankle_mx = sampler.region_bounds("ankle_l")
    knee_mn, _ = sampler.region_bounds("knee_l")

    arm_l_regs = {"upper_arm_l", "elbow_l", "forearm_l"}
    arm_r_regs = {"upper_arm_r", "elbow_r", "forearm_r"}
    torso_regs = {"neck", "chest", "belly", "hips"}
    leg_l_regs = {"thigh_l", "knee_l", "shin_l", "ankle_l"}
    leg_r_regs = {"thigh_r", "knee_r", "shin_r", "ankle_r"}

    shoulder_x_cutoff = chest_mx.x + 0.015
    torso_max_x = max(hips_mx.x, chest_mx.x) + 0.045

    def top_region_filter(co: Vector, _vi: int) -> set[str] | None:
        if co.x > torso_max_x or (co.z > chest_mn.z - 0.01 and co.x > shoulder_x_cutoff):
            return arm_l_regs
        if co.x < -torso_max_x or (co.z > chest_mn.z - 0.01 and co.x < -shoulder_x_cutoff):
            return arm_r_regs
        return torso_regs

    def dress_region_filter(co: Vector, _vi: int) -> set[str] | None:
        if co.z > chest_mn.z - 0.02 and co.x > shoulder_x_cutoff:
            return arm_l_regs
        if co.z > chest_mn.z - 0.02 and co.x < -shoulder_x_cutoff:
            return arm_r_regs
        if co.z >= hips_mn.z - 0.01:
            return torso_regs
        return leg_l_regs if co.x >= 0.0 else leg_r_regs

    # On female, lateral chest is narrower than shoulder pivot so lower underarm vertices get
    # arm-region -X deltas while the ribcage expands +X on Heavy/Muscle/Chest. Keep the underarm
    # gusset band tracking lateral chest expansion and drop it slightly under the armpit crease.
    chest_low_dx: dict[str, float] = {
        k: max(
            (
                body.shape_deltas[k][vi].x
                for vi, reg in enumerate(body.vert_regions)
                if reg == "chest" and body_verts[vi].z < chest_mx.z - 0.050 and body_verts[vi].x > chest_mx.x * 0.70
            ),
            default=0.0,
        )
        for k in ("Heavy", "Muscle", "Chest", "Shoulders")
    }

    def make_armhole_delta_scale():
        x_in = chest_mx.x - 0.005
        x_full = chest_mx.x + 0.018
        x_out = chest_mx.x + 0.048
        y_span = 0.064

        def delta_scale_fn(co: Vector, key: str, d: Vector) -> Vector:
            if key not in chest_low_dx:
                return d
            if co.z < chest_mn.z - 0.010 or co.z > chest_mx.z - 0.045:
                return d
            ax = abs(co.x)
            if ax < x_in or ax > x_out or abs(co.y) > y_span:
                return d
            t_x = 1.0 - max(0.0, (ax - x_full) / (x_out - x_full))
            t_y = 1.0 - (abs(co.y) / y_span)
            wt = max(0.0, min(1.0, t_x)) * max(0.0, min(1.0, t_y))
            if wt <= 1e-5:
                return d
            side = 1.0 if co.x >= 0.0 else -1.0
            out = d.copy()
            want_out = chest_low_dx[key] * wt * 1.12
            if side * out.x < want_out:
                out.x = side * want_out
            if key in ("Heavy", "Muscle"):
                out.z = min(out.z, -0.020 * wt)
            return out

        return delta_scale_fn

    armhole_delta_fn = make_armhole_delta_scale() if base == "female" else None

    def make_top_offset(base_off: float, hem_off: float):
        # Flare lower hem band outward over bottoms waistband (>= 10 mm gap even on N=16 chords)
        z_full = hips_mx.z + 0.010
        z_fade = hips_mx.z + 0.065

        def offset_fn(co: Vector) -> float:
            if co.z <= z_full:
                return hem_off
            if co.z < z_fade:
                t = (z_fade - co.z) / (z_fade - z_full)
                return base_off + (hem_off - base_off) * t
            return base_off

        return offset_fn

    if item_id == "top_tshirt_crew_01":
        bm = _build_top_mesh(
            sampler,
            sleeve_len=upper_arm_s * 0.96,
            torso_offset_hips=0.023,
            torso_offset_chest=0.019,
            sleeve_offset=0.0175,
            collar_type="crew",
            primary_swatch="c_white",
        )
        return "top", bm, {
            "offset_fn": make_top_offset(0.0175, 0.0235),
            "smooth_weight_iters": 1,
            "vert_region_filter_fn": top_region_filter,
            "delta_scale_fn": armhole_delta_fn,
        }

    if item_id == "top_shirt_office_01":
        bm = _build_top_mesh(
            sampler,
            sleeve_len=wrist_s + 0.010,
            torso_offset_hips=0.023,
            torso_offset_chest=0.019,
            sleeve_offset=0.0175,
            collar_type="shirt",
            primary_swatch="c_sky",
            secondary_swatch="c_white",
            secondary_tint="secondary",
        )
        return "top", bm, {
            "offset_fn": make_top_offset(0.0175, 0.0235),
            "smooth_weight_iters": 1,
            "vert_region_filter_fn": top_region_filter,
            "delta_scale_fn": armhole_delta_fn,
        }

    if item_id == "top_hoodie_01":
        bm = _build_top_mesh(
            sampler,
            sleeve_len=wrist_s + 0.010,
            torso_offset_hips=0.024,
            torso_offset_chest=0.0195,
            sleeve_offset=0.0185,
            collar_type="hoodie",
            primary_swatch="c_grey",
            secondary_swatch="c_white",
            secondary_tint="accent",
            has_hood=True,
        )
        return "top", bm, {
            "offset_fn": make_top_offset(0.0185, 0.024),
            "smooth_weight_iters": 1,
            "vert_region_filter_fn": top_region_filter,
            "delta_scale_fn": armhole_delta_fn,
        }

    # Smooth hip-to-thigh AND thigh-to-shin skinning around actual hip pivot (z ~ hips_mn.z + 0.025)
    knee_mn, knee_mx = sampler.region_bounds("knee_l")
    knee_mid_z = 0.5 * (knee_mn.z + knee_mx.z)
    hip_pivot_z = hips_mn.z + 0.025

    def _make_pants_callbacks(left_vis: set[int], right_vis: set[int]):
        def region_filter(co: Vector, vi: int) -> set[str] | None:
            is_left = (
                True if vi in left_vis
                else (False if vi in right_vis else co.x >= 0.0)
            )
            if co.z >= hips_mx.z - 0.02:
                return {"hips", "belly"}
            if vi not in left_vis and vi not in right_vis and abs(co.x) < 0.020 and co.z >= hips_mn.z - 0.045:
                return {"hips"}
            if co.z >= hips_mn.z - 0.005:
                side_leg = "thigh_l" if is_left else "thigh_r"
                return {"hips", side_leg}
            return leg_l_regs if is_left else leg_r_regs

        def clamp_post_push(legs_bm: bmesh.types.BMesh) -> None:
            legs_bm.verts.ensure_lookup_table()
            for v in legs_bm.verts:
                min_x = 0.0005 if v.co.z > knee_mx.z else 0.0015
                if v.index in left_vis:
                    v.co.x = max(v.co.x, min_x)
                elif v.index in right_vis:
                    v.co.x = min(v.co.x, -min_x)

        def weights_fn(co: Vector, vi: int, w: list[tuple[str, float]]) -> list[tuple[str, float]]:
            is_left = (
                True if vi in left_vis
                else (False if vi in right_vis else co.x >= 0.0)
            )
            up_b = "LeftUpLeg" if is_left else "RightUpLeg"
            lo_b = "LeftLeg" if is_left else "RightLeg"
            if co.z <= knee_mid_z - 0.055:
                return w
            if co.z <= knee_mid_z + 0.055:
                # Smooth transition across knee joint to prevent patella collapse
                t_knee = max(0.0, min(1.0, (co.z - (knee_mid_z - 0.055)) / 0.110))
                return [(up_b, t_knee), (lo_b, 1.0 - t_knee)]
            if co.z >= hip_pivot_z + 0.018:
                # Strictly above hip pivot -> 100% Hips so sitting never rotates front pelvis inward
                return [("Hips", 1.0)]
            if vi not in left_vis and vi not in right_vis and abs(co.x) < 0.022:
                # Crotch saddle midline: mostly Hips at top, gently shared at base
                t_crotch = max(0.0, min(1.0, (hip_pivot_z - co.z) / 0.055))
                lr_w = 0.28 * t_crotch
                return [("Hips", 1.0 - 2.0 * lr_w), ("LeftUpLeg", lr_w), ("RightUpLeg", lr_w)]
            t_z = max(0.0, min(1.0, (hip_pivot_z + 0.018 - co.z) / 0.055))
            return [(up_b, t_z), ("Hips", 1.0 - t_z)]

        return region_filter, clamp_post_push, weights_fn

    def make_pants_offset(waist_off: float, hip_leg_off: float):
        # Tuck waistband closer to body so tops drape cleanly outside bottoms without poking through.
        z_tuck = hips_mx.z - 0.005
        z_fade = hips_mx.z - 0.045

        def offset_fn(co: Vector) -> float:
            if co.z >= z_tuck:
                return waist_off
            if co.z > z_fade:
                t = (z_tuck - co.z) / (z_tuck - z_fade)
                return waist_off + (hip_leg_off - waist_off) * t
            return hip_leg_off

        return offset_fn

    if item_id == "bottom_jeans_01":
        bm, left_leg_vis, right_leg_vis = _build_bottom_mesh(
            sampler,
            z_cuff=ankle_mn.z + 0.005,
            waist_offset=0.0105,
            leg_offset=0.0185,
            cuff_flare=0.0020,
            swatch="c_denim",
            is_shorts=False,
        )
        p_filter, p_clamp, p_weights = _make_pants_callbacks(left_leg_vis, right_leg_vis)
        return "bottom", bm, {
            "offset_fn": make_pants_offset(0.0095, 0.0175),
            "smooth_weight_iters": 1,
            "vert_region_filter_fn": p_filter,
            "post_push_fn": p_clamp,
            "weight_override_fn": p_weights,
        }

    if item_id == "bottom_trousers_01":
        bm, left_leg_vis, right_leg_vis = _build_bottom_mesh(
            sampler,
            z_cuff=ankle_mn.z + 0.002,
            waist_offset=0.0105,
            leg_offset=0.0185,
            cuff_flare=0.0025,
            swatch="c_charcoal",
            is_shorts=False,
        )
        p_filter, p_clamp, p_weights = _make_pants_callbacks(left_leg_vis, right_leg_vis)
        return "bottom", bm, {
            "offset_fn": make_pants_offset(0.0095, 0.0175),
            "smooth_weight_iters": 1,
            "vert_region_filter_fn": p_filter,
            "post_push_fn": p_clamp,
            "weight_override_fn": p_weights,
        }

    if item_id == "bottom_shorts_01":
        bm, left_leg_vis, right_leg_vis = _build_bottom_mesh(
            sampler,
            z_cuff=knee_mn.z + 0.070,
            waist_offset=0.0105,
            leg_offset=0.0175,
            cuff_flare=0.0025,
            swatch="c_khaki",
            is_shorts=True,
        )
        p_filter, p_clamp, p_weights = _make_pants_callbacks(left_leg_vis, right_leg_vis)
        return "bottom", bm, {
            "offset_fn": make_pants_offset(0.0095, 0.0165),
            "smooth_weight_iters": 1,
            "vert_region_filter_fn": p_filter,
            "post_push_fn": p_clamp,
            "weight_override_fn": p_weights,
        }

    if item_id == "fullbody_dress_simple_01":
        bm = _build_dress_mesh(sampler, swatch="c_rose")

        # Sit-friendly skirt weights: ONLY front lap BELOW hip pivot tracks UpLeg forward;
        # pelvis & back stay 100% on Hips/Spine (zero arm bleed below chest).
        def dress_weights(co: Vector, _vi: int, w: list[tuple[str, float]]) -> list[tuple[str, float]]:
            if co.z < hip_pivot_z:
                t = max(0.0, min(1.0, (hip_pivot_z - co.z) / 0.12))
                frontness = max(0.0, min(1.0, (-co.y + 0.02) / 0.13))
                side_mix = max(-1.0, min(1.0, co.x / 0.04))
                l_frac = 0.5 + 0.5 * side_mix
                r_frac = 1.0 - l_frac
                leg_total = t * (0.96 * frontness)
                hip_w = 1.0 - leg_total
                return [
                    ("Hips", hip_w),
                    ("LeftUpLeg", leg_total * l_frac),
                    ("RightUpLeg", leg_total * r_frac),
                ]
            if co.z < chest_mn.z - 0.02 or (co.z < hips_mx.z + 0.08):
                # Strip any arm/hand bleed below the underarm without affecting short-sleeve cuffs
                no_arm = [(b, v) for b, v in w if "Arm" not in b and "Hand" not in b]
                if no_arm:
                    return no_arm
                return [("Spine", 0.5), ("Hips", 0.5)]
            return w

        return "fullbody", bm, {
            "offset_fn": lambda co: 0.016 if co.z < hips_mx.z else 0.0165,
            "smooth_weight_iters": 1,
            "vert_region_filter_fn": dress_region_filter,
            "weight_override_fn": dress_weights,
            "delta_scale_fn": armhole_delta_fn,
        }

    if item_id == "shoes_sneaker_01":
        bm = _build_shoes_mesh(
            sampler, style="sneaker", primary_swatch="c_white", accent_swatch="c_jade"
        )

        def shoe_weights(co: Vector, _vi: int, w: list[tuple[str, float]]) -> list[tuple[str, float]]:
            is_left = co.x >= 0.0
            foot_b = "LeftFoot" if is_left else "RightFoot"
            toe_b = "LeftToeBase" if is_left else "RightToeBase"
            if co.y < -0.115:
                return [(foot_b, 0.35), (toe_b, 0.65)]
            if co.y < -0.075:
                return [(foot_b, 0.70), (toe_b, 0.30)]
            return [(foot_b, 1.0)]

        return "shoes", bm, {
            "offset_m": 0.0065,
            "smooth_weight_iters": 1,
            "push_outward": False,  # Geometry already built with exact >=7mm sole/toe pad
            "weight_override_fn": shoe_weights,
        }

    if item_id == "shoes_loafer_01":
        bm = _build_shoes_mesh(sampler, style="loafer", primary_swatch="c_brown")

        def loafer_weights(co: Vector, _vi: int, w: list[tuple[str, float]]) -> list[tuple[str, float]]:
            is_left = co.x >= 0.0
            foot_b = "LeftFoot" if is_left else "RightFoot"
            toe_b = "LeftToeBase" if is_left else "RightToeBase"
            if co.y < -0.115:
                return [(foot_b, 0.35), (toe_b, 0.65)]
            if co.y < -0.075:
                return [(foot_b, 0.70), (toe_b, 0.30)]
            return [(foot_b, 1.0)]

        return "shoes", bm, {
            "offset_m": 0.0065,
            "smooth_weight_iters": 1,
            "push_outward": False,
            "weight_override_fn": loafer_weights,
        }

    raise KeyError(f"Unknown wardrobe item '{item_id}'")


ITEM_SPECS: list[tuple[str, tuple[str, ...]]] = [
    ("top_tshirt_crew_01", ("female", "male")),
    ("top_shirt_office_01", ("female", "male")),
    ("top_hoodie_01", ("female", "male")),
    ("bottom_jeans_01", ("female", "male")),
    ("bottom_trousers_01", ("female", "male")),
    ("bottom_shorts_01", ("female", "male")),
    ("fullbody_dress_simple_01", ("female",)),
    ("shoes_sneaker_01", ("female", "male")),
    ("shoes_loafer_01", ("female", "male")),
]


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []

    parser = argparse.ArgumentParser(description="Generate all 9 starter wardrobe assets")
    parser.add_argument("--only", default="", help="Comma-separated subset of item IDs")
    parser.add_argument("--out", default=str(DEFAULT_OUT_DIR), help="Raw cache root; files go to <out>/wardrobe")
    parser.add_argument("--reports", default=str(DEFAULT_REPORT_DIR), help="Report directory")
    args = parser.parse_args(argv)

    only_set = {s.strip() for s in args.only.split(",") if s.strip()} if args.only else None
    out_dir = Path(args.out) / "wardrobe"
    report_dir = Path(args.reports)
    out_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    results: dict[str, dict] = {}
    for base in ("female", "male"):
        export.clear_scene()
        arm, body_ob, _info = bodyshape.build_base_body(base)
        body = fit.extract_body_data(body_ob, base)
        sampler = BodySampler(body)

        for item_id, bases in ITEM_SPECS:
            if only_set is not None and item_id not in only_set:
                continue
            if base not in bases:
                continue

            slot, raw_bm, fit_kw = _build_item(item_id, base, sampler, body)
            bm, w, d = fit.fit_free_mesh(raw_bm, body, **fit_kw)
            try:
                res = fit.export_fitted_garment(
                    item_id,
                    slot,
                    base,
                    arm,
                    body_ob,
                    body,
                    bm,
                    w,
                    d,
                    out_dir=out_dir,
                    report_dir=report_dir,
                    write_meta=True,
                )
            except fit.FitError as exc:
                print(f"[gen_wardrobe] FAIL {item_id} ({base}): {exc}", file=sys.stderr)
                return 1

            results.setdefault(item_id, {})[base] = res
            print(f"BUILT wardrobe/{item_id}_{base[0]}.glb tris={res['tris']}")
            print(
                f"[gen_wardrobe] OK {item_id:26s} ({base:6s}): "
                f"tris={res['tris']:4d} bytes={res['bytes']:5d} "
                f"pen={res['maxPenetrationMm']:4.2f}mm "
                f"pose={res['posePenetrationMm']} "
                f"limits={res['bodyLimits']} hide={res['hideRegions']}"
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
