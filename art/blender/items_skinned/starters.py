"""The 9 P07a starter garments (moved verbatim from gen_wardrobe.py in P08a-T01)."""

from __future__ import annotations

import bmesh
from mathutils import Vector

from lib.garments import _build_bottom_mesh, _build_dress_mesh, _build_shoes_mesh, _build_top_mesh
from items_skinned import register


def _build(item_id: str, ctx):
    sampler = ctx.sampler
    base = ctx.base
    _make_pants_callbacks = ctx._make_pants_callbacks
    ankle_mn = ctx.ankle_mn
    armhole_delta_fn = ctx.armhole_delta_fn
    body = ctx.body
    chest_mn = ctx.chest_mn
    dress_region_filter = ctx.dress_region_filter
    hip_pivot_z = ctx.hip_pivot_z
    hips_mn = ctx.hips_mn
    hips_mx = ctx.hips_mx
    knee_mid_z = ctx.knee_mid_z
    knee_mn = ctx.knee_mn
    knee_mx = ctx.knee_mx
    leg_l_regs = ctx.leg_l_regs
    leg_r_regs = ctx.leg_r_regs
    make_pants_offset = ctx.make_pants_offset
    make_top_offset = ctx.make_top_offset
    top_region_filter = ctx.top_region_filter
    upper_arm_s = ctx.upper_arm_s
    wrist_s = ctx.wrist_s
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

    raise KeyError(f"Unknown starter item {item_id!r}")


def _builder(item_id: str):
    def build(ctx):
        _slot, bm, kw = _build(item_id, ctx)
        return bm, kw

    build.__module__ = __name__
    return build


for _id, _slot, _bases in [
    ("top_tshirt_crew_01", "top", ("female", "male")),
    ("top_shirt_office_01", "top", ("female", "male")),
    ("top_hoodie_01", "top", ("female", "male")),
    ("bottom_jeans_01", "bottom", ("female", "male")),
    ("bottom_trousers_01", "bottom", ("female", "male")),
    ("bottom_shorts_01", "bottom", ("female", "male")),
    ("fullbody_dress_simple_01", "fullbody", ("female",)),
    ("shoes_sneaker_01", "shoes", ("female", "male")),
    ("shoes_loafer_01", "shoes", ("female", "male")),
]:
    register(_id, _slot, _bases, _builder(_id))
