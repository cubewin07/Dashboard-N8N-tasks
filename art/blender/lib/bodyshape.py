"""Parametric low-poly base body generator (female & male, 1.70 m, 6 shape keys).

Blender coordinate convention (CHARACTER-PIPELINE.md §1):
    +X = character left, -Y = character front, +Z = up.
    Origin between the feet on the floor (z = 0). Height = 1.70 m.
    Head (z > 1.44) is identical in both bases and untouched by any shape key.
"""
import math

import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from . import charexport, rig

# Exact frozen region order (CHARACTER-PIPELINE.md §3)
REGIONS = [
    "head",
    "neck",
    "chest",
    "belly",
    "hips",
    "upper_arm_l",
    "upper_arm_r",
    "elbow_l",
    "elbow_r",
    "forearm_l",
    "forearm_r",
    "hand_l",
    "hand_r",
    "thigh_l",
    "thigh_r",
    "knee_l",
    "knee_r",
    "shin_l",
    "shin_r",
    "ankle_l",
    "ankle_r",
    "foot_l",
    "foot_r",
]
REGION_ID = {name: i for i, name in enumerate(REGIONS)}

TORSO_SIDES = 12
ARM_SIDES = 10
LEG_SIDES = 10


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _ellipse_ring(cx, cy, cz, rx, ry, n=12, front_flat=0.0, front_push=0.0, back_push=0.0):
    """Build `n` ring points around (cx, cy, cz).
    Angle 0 is front (-Y), pi/2 is +X, pi is +Y, 3pi/2 is -X.
    `front_flat` flattens the front (-Y) arc; `front_push` protrudes front (-Y);
    `back_push` protrudes back (+Y).
    """
    pts = []
    for i in range(n):
        th = 2.0 * math.pi * i / n
        sx = math.sin(th)
        cy_unit = -math.cos(th)
        x = cx + rx * sx
        y = cy + ry * cy_unit
        if cy_unit < 0.0:
            # Front (-Y) weighting: smooth cosine lobe
            w = (-cy_unit) ** 1.6
            if front_flat > 0.0:
                flat_y = cy - ry
                y = y * (1.0 - front_flat * w) + flat_y * (front_flat * w)
            y -= front_push * w
        else:
            w = cy_unit ** 1.6
            y += back_push * w
        pts.append(Vector((x, y, cz)))
    return pts


def _limb_ring(center, axis_dir, fwd_vec, side_vec, r_side, r_fwd, n=10):
    """Cross-section ring perpendicular to `axis_dir`."""
    pts = []
    for i in range(n):
        th = 2.0 * math.pi * i / n
        p = center + side_vec * (r_side * math.cos(th)) + fwd_vec * (r_fwd * math.sin(th))
        pts.append(p)
    return pts


def _torso_specs(base, sk):
    """Return list of dicts describing torso + neck + head rings from pelvis bottom to crown."""
    heavy = sk.get("Heavy", 0.0)
    slim = sk.get("Slim", 0.0)
    muscle = sk.get("Muscle", 0.0)
    chest = sk.get("Chest", 0.0)
    hips = sk.get("Hips", 0.0)
    shoulders = sk.get("Shoulders", 0.0)

    is_f = base == "female"
    # Base anatomical parameters (female vs male) - friendly chunky low-poly toy proportions
    # Each entry: (z, rx, ry, y_off, front_flat, front_push, back_push, region, weights, swatch_above)
    if is_f:
        specs = [
            # Pelvis / hips (briefs: 0.84..0.99) - distinct wide rounded hips
            (0.835, 0.105, 0.082, 0.006, 0.00, 0.000, 0.000, "hips", [("Hips", 1.0)], "c_white"),
            (0.880, 0.156, 0.104, 0.012, 0.10, 0.004, 0.016, "hips", [("Hips", 1.0)], "c_white"),
            (0.935, 0.164, 0.108, 0.012, 0.10, 0.005, 0.018, "hips", [("Hips", 1.0)], "c_white"),
            (0.990, 0.146, 0.098, 0.006, 0.12, 0.004, 0.010, "hips", [("Hips", 0.85), ("Spine", 0.15)], "skin_01"),
            # Clearly defined waist
            (1.060, 0.114, 0.084, 0.002, 0.14, 0.004, 0.002, "belly", [("Hips", 0.40), ("Spine", 0.60)], "skin_01"),
            (1.125, 0.108, 0.082, 0.002, 0.14, 0.004, 0.000, "belly", [("Spine", 0.70), ("Spine1", 0.30)], "skin_01"),
            # Chest (bandeau top covers 1.190..1.295) - distinct rounded bust & soft narrower shoulders
            (1.190, 0.130, 0.094, 0.000, 0.12, 0.014, 0.000, "chest", [("Spine1", 0.75), ("Spine2", 0.25)], "c_white"),
            (1.248, 0.138, 0.100, 0.000, 0.10, 0.024, 0.002, "chest", [("Spine1", 0.30), ("Spine2", 0.70)], "c_white"),
            (1.298, 0.142, 0.094, 0.002, 0.14, 0.014, 0.004, "chest", [("Spine2", 0.90), ("Spine1", 0.10)], "skin_01"),
            (1.345, 0.138, 0.084, 0.004, 0.16, 0.005, 0.005, "chest", [("Spine2", 0.95), ("Spine1", 0.05)], "skin_01"),
            (1.380, 0.110, 0.068, 0.004, 0.12, 0.000, 0.002, "chest", [("Spine2", 0.80), ("Neck", 0.20)], "skin_01"),
            # Short visible sturdy neck (1.396..1.448)
            (1.398, 0.058, 0.056, 0.004, 0.00, 0.000, 0.000, "neck", [("Spine2", 0.35), ("Neck", 0.65)], "skin_01"),
            (1.425, 0.054, 0.054, 0.004, 0.00, 0.000, 0.000, "neck", [("Neck", 0.85), ("Head", 0.15)], "skin_01"),
        ]
    else:
        specs = [
            # Pelvis / hips (briefs: 0.84..0.99) - straighter trim male pelvis
            (0.835, 0.098, 0.078, 0.004, 0.00, 0.000, 0.000, "hips", [("Hips", 1.0)], "c_white"),
            (0.880, 0.144, 0.098, 0.008, 0.10, 0.003, 0.008, "hips", [("Hips", 1.0)], "c_white"),
            (0.935, 0.148, 0.102, 0.008, 0.10, 0.004, 0.010, "hips", [("Hips", 1.0)], "c_white"),
            (0.990, 0.145, 0.100, 0.004, 0.12, 0.004, 0.005, "hips", [("Hips", 0.85), ("Spine", 0.15)], "skin_01"),
            # Straight chunky waist
            (1.060, 0.140, 0.098, 0.002, 0.15, 0.004, 0.002, "belly", [("Hips", 0.40), ("Spine", 0.60)], "skin_01"),
            (1.125, 0.144, 0.100, 0.002, 0.15, 0.004, 0.002, "belly", [("Spine", 0.70), ("Spine1", 0.30)], "skin_01"),
            # Broad athletic chest & soft broad shoulders (stays clear of LeftArm x=0.155)
            (1.190, 0.154, 0.102, 0.000, 0.24, 0.002, 0.003, "chest", [("Spine1", 0.75), ("Spine2", 0.25)], "skin_01"),
            (1.248, 0.162, 0.103, 0.000, 0.26, 0.003, 0.004, "chest", [("Spine1", 0.30), ("Spine2", 0.70)], "skin_01"),
            (1.298, 0.166, 0.100, 0.002, 0.26, 0.003, 0.005, "chest", [("Spine2", 0.90), ("Spine1", 0.10)], "skin_01"),
            (1.345, 0.162, 0.094, 0.004, 0.22, 0.002, 0.006, "chest", [("Spine2", 0.95), ("Spine1", 0.05)], "skin_01"),
            (1.382, 0.128, 0.075, 0.004, 0.14, 0.000, 0.004, "chest", [("Spine2", 0.80), ("Neck", 0.20)], "skin_01"),
            # Short visible sturdy neck
            (1.400, 0.064, 0.060, 0.004, 0.00, 0.000, 0.000, "neck", [("Spine2", 0.35), ("Neck", 0.65)], "skin_01"),
            (1.425, 0.058, 0.056, 0.004, 0.00, 0.000, 0.000, "neck", [("Neck", 0.85), ("Head", 0.15)], "skin_01"),
        ]

    # Apply shape keys to torso/neck (ONLY z <= 1.43!)
    out = []
    for z, rx, ry, y_off, fflat, fpush, bpush, region, wts, sw in specs:
        # Smooth zone weights by Z
        w_hip = _clamp(1.0 - abs(z - 0.935) / 0.16, 0.0, 1.0)
        w_belly = _clamp(1.0 - abs(z - 1.09) / 0.15, 0.0, 1.0)
        w_chest = _clamp(1.0 - abs(z - 1.26) / 0.13, 0.0, 1.0)
        w_shld = _clamp((z - 1.24) / 0.12, 0.0, 1.0) * _clamp((1.40 - z) / 0.03, 0.0, 1.0) if z <= 1.39 else 0.0
        w_neck = _clamp((z - 1.385) / 0.035, 0.0, 1.0) if z < 1.43 else 0.0

        # Heavy: broadens waist, belly, hips, chest, slight neck base
        rx += heavy * (0.046 * w_belly + 0.038 * w_hip + 0.030 * w_chest + 0.008 * w_neck)
        ry += heavy * (0.042 * w_belly + 0.032 * w_hip + 0.026 * w_chest + 0.006 * w_neck)
        fpush += heavy * (0.052 * w_belly + 0.020 * w_chest + 0.014 * w_hip)
        bpush += heavy * (0.024 * w_hip + 0.014 * w_belly)

        # Slim: narrows waist/belly/chest/hips cleanly without collapsing
        slim_rx = 1.0 - slim * (0.20 * w_belly + 0.14 * w_hip + 0.13 * w_chest)
        slim_ry = 1.0 - slim * (0.20 * w_belly + 0.15 * w_hip + 0.13 * w_chest)
        rx *= max(0.66, slim_rx)
        ry *= max(0.66, slim_ry)
        fpush *= max(0.65, 1.0 - slim * 0.25)

        # Muscle: V-taper (broadens chest/shoulders, trims waist slightly, puffs pecs & lats)
        rx += muscle * (0.034 * w_chest + 0.030 * w_shld - 0.006 * w_belly + 0.008 * w_neck)
        ry += muscle * (0.024 * w_chest + 0.014 * w_shld + 0.005 * w_neck)
        fpush += muscle * (0.028 * w_chest)
        bpush += muscle * (0.020 * w_chest + 0.012 * w_hip)

        # Chest: bust / pecs projection
        if is_f:
            fpush += chest * (0.040 * _clamp(1.0 - abs(z - 1.248) / 0.075, 0.0, 1.0))
            rx += chest * (0.012 * w_chest)
        else:
            fpush += chest * (0.032 * _clamp(1.0 - abs(z - 1.265) / 0.085, 0.0, 1.0))
            rx += chest * (0.018 * w_chest)
            ry += chest * (0.014 * w_chest)

        # Hips: smooth hip/pelvis widening across 0.84..1.04
        w_hip_wide = _clamp(1.0 - abs(z - 0.935) / 0.16, 0.0, 1.0)
        rx += hips * (0.032 * w_hip_wide)
        ry += hips * (0.018 * w_hip_wide)
        bpush += hips * (0.026 * w_hip_wide)

        # Shoulders: widens upper chest / shoulder girdle
        rx += shoulders * (0.036 * w_shld)
        ry += shoulders * (0.012 * w_shld)

        if z < 0.85:
            rx = min(rx, 0.118)
            ry = min(ry, 0.092)

        out.append((z, rx, ry, y_off, fflat, fpush, bpush, region, wts, sw))

    # Head base + head rings (IDENTICAL in both bases, ZERO shape key effect, all z > 1.44)
    # Friendly chunky toy head: ~0.25 m wide (rx=0.125), ~0.26 m deep (ry=0.130), ~0.29 m tall (1.45..1.74)
    head_specs = [
        (1.445, 0.056, 0.056, 0.004, 0.00, 0.000, 0.000, "neck", [("Neck", 0.35), ("Head", 0.65)], "skin_01"),
        (1.460, 0.092, 0.098, 0.000, 0.12, 0.006, 0.000, "head", [("Head", 1.0)], "skin_01"),
        (1.495, 0.114, 0.120, 0.000, 0.25, 0.004, 0.004, "head", [("Head", 1.0)], "skin_01"),
        (1.542, 0.123, 0.128, 0.002, 0.32, 0.002, 0.006, "head", [("Head", 1.0)], "skin_01"),
        (1.595, 0.125, 0.130, 0.004, 0.35, 0.000, 0.008, "head", [("Head", 1.0)], "skin_01"),
        (1.652, 0.118, 0.124, 0.005, 0.28, 0.000, 0.006, "head", [("Head", 1.0)], "skin_01"),
        (1.702, 0.094, 0.100, 0.006, 0.10, 0.000, 0.002, "head", [("Head", 1.0)], "skin_01"),
        (1.732, 0.052, 0.056, 0.006, 0.00, 0.000, 0.000, "head", [("Head", 1.0)], "skin_01"),
    ]
    out.extend(head_specs)
    return out


def _arm_specs(base, side, sk):
    """Return ring definitions along the 45° A-pose arm (`side` in ('L', 'R'))."""
    heavy = sk.get("Heavy", 0.0)
    slim = sk.get("Slim", 0.0)
    muscle = sk.get("Muscle", 0.0)
    shoulders = sk.get("Shoulders", 0.0)

    is_f = base == "female"
    sx = 1.0 if side == "L" else -1.0
    reg_pre = "l" if side == "L" else "r"
    b_pre = "Left" if side == "L" else "Right"

    p_arm = rig.JOINT[f"{b_pre}Arm"]
    p_elb = rig.JOINT[f"{b_pre}ForeArm"]
    p_wri = rig.JOINT[f"{b_pre}Hand"]
    p_grp = rig.JOINT[f"{b_pre}HandGrip"]
    p_tip = rig.TAIL[f"{b_pre}HandGrip"]

    arm_dir = (p_elb - p_arm).normalized()
    arm_len = (p_elb - p_arm).length       # 0.27
    fore_len = (p_wri - p_elb).length      # 0.25
    hand_len = (p_tip - p_wri).length      # 0.16

    fwd_vec = Vector((0.0, -1.0, 0.0))     # -Y is front
    # Side vector perpendicular to arm_dir and fwd_vec (pointing outward-upward)
    up_perp = fwd_vec.cross(arm_dir).normalized()
    if up_perp.z < 0:
        up_perp = -up_perp
    vert_up = Vector((0.0, 0.0, 1.0))

    # (s_along_chain, r_perp, r_fwd, z_lift, region, weights, morph_scale_allowed)
    # Note: s < 0 moves horizontally inward into the torso. At s <= 0 the ring tilts
    # vertically (vert_up) so lowering the arm never swings a 45°-tilted deltoid ring out as a horn.
    # Chain distance s=0 is at LeftArm, s=0.27 at elbow, s=0.52 at wrist, s=0.68 at fingertip.
    if is_f:
        raw = [
            (-0.045, 0.032, 0.036, -0.026, f"upper_arm_{reg_pre}", [("Spine2", 0.75), (f"{b_pre}Shoulder", 0.25)], True),
            (-0.006, 0.038, 0.042, -0.022, f"upper_arm_{reg_pre}", [(f"{b_pre}Shoulder", 0.65), (f"{b_pre}Arm", 0.35)], True),
            (0.038,  0.043, 0.046, -0.012, f"upper_arm_{reg_pre}", [(f"{b_pre}Shoulder", 0.35), (f"{b_pre}Arm", 0.65)], True),
            (0.095,  0.046, 0.048, -0.004, f"upper_arm_{reg_pre}", [(f"{b_pre}Arm", 0.90), (f"{b_pre}Shoulder", 0.10)], True),
            (0.175,  0.046, 0.046,  0.000, f"upper_arm_{reg_pre}", [(f"{b_pre}Arm", 1.00)], True),
            (0.235,  0.043, 0.043,  0.000, f"upper_arm_{reg_pre}", [(f"{b_pre}Arm", 0.85), (f"{b_pre}ForeArm", 0.15)], True),
            (arm_len, 0.041, 0.041, 0.000, f"elbow_{reg_pre}", [(f"{b_pre}Arm", 0.50), (f"{b_pre}ForeArm", 0.50)], True),
            (arm_len + 0.040, 0.042, 0.042, 0.000, f"forearm_{reg_pre}", [(f"{b_pre}Arm", 0.15), (f"{b_pre}ForeArm", 0.85)], True),
            (arm_len + 0.135, 0.040, 0.040, 0.000, f"forearm_{reg_pre}", [(f"{b_pre}ForeArm", 1.00)], True),
            (arm_len + fore_len - 0.032, 0.035, 0.036, 0.000, f"forearm_{reg_pre}", [(f"{b_pre}ForeArm", 0.85), (f"{b_pre}Hand", 0.15)], False),
            # Wrist & simple mitten hand (~0.10 long x 0.075 wide x 0.035 thick, rounded tip)
            (arm_len + fore_len, 0.032, 0.033, 0.000, f"hand_{reg_pre}", [(f"{b_pre}ForeArm", 0.25), (f"{b_pre}Hand", 0.75)], False),
            (arm_len + fore_len + 0.022, 0.0185, 0.037, 0.000, f"hand_{reg_pre}", [(f"{b_pre}Hand", 0.90), (f"{b_pre}ForeArm", 0.10)], False),
            (arm_len + fore_len + 0.056, 0.0175, 0.038, 0.000, f"hand_{reg_pre}", [(f"{b_pre}Hand", 0.65), (f"{b_pre}HandGrip", 0.35)], False),
            (arm_len + fore_len + 0.085, 0.0155, 0.033, 0.000, f"hand_{reg_pre}", [(f"{b_pre}Hand", 0.25), (f"{b_pre}HandGrip", 0.75)], False),
            (arm_len + fore_len + 0.102, 0.0110, 0.024, 0.000, f"hand_{reg_pre}", [(f"{b_pre}HandGrip", 1.00)], False),
        ]
    else:
        raw = [
            (-0.045, 0.034, 0.038, -0.028, f"upper_arm_{reg_pre}", [("Spine2", 0.75), (f"{b_pre}Shoulder", 0.25)], True),
            (-0.006, 0.040, 0.045, -0.024, f"upper_arm_{reg_pre}", [(f"{b_pre}Shoulder", 0.65), (f"{b_pre}Arm", 0.35)], True),
            (0.038,  0.046, 0.049, -0.014, f"upper_arm_{reg_pre}", [(f"{b_pre}Shoulder", 0.35), (f"{b_pre}Arm", 0.65)], True),
            (0.095,  0.050, 0.051, -0.004, f"upper_arm_{reg_pre}", [(f"{b_pre}Arm", 0.90), (f"{b_pre}Shoulder", 0.10)], True),
            (0.175,  0.049, 0.049,  0.000, f"upper_arm_{reg_pre}", [(f"{b_pre}Arm", 1.00)], True),
            (0.235,  0.046, 0.046,  0.000, f"upper_arm_{reg_pre}", [(f"{b_pre}Arm", 0.85), (f"{b_pre}ForeArm", 0.15)], True),
            (arm_len, 0.044, 0.044, 0.000, f"elbow_{reg_pre}", [(f"{b_pre}Arm", 0.50), (f"{b_pre}ForeArm", 0.50)], True),
            (arm_len + 0.040, 0.044, 0.044, 0.000, f"forearm_{reg_pre}", [(f"{b_pre}Arm", 0.15), (f"{b_pre}ForeArm", 0.85)], True),
            (arm_len + 0.135, 0.042, 0.042, 0.000, f"forearm_{reg_pre}", [(f"{b_pre}ForeArm", 1.00)], True),
            (arm_len + fore_len - 0.032, 0.036, 0.037, 0.000, f"forearm_{reg_pre}", [(f"{b_pre}ForeArm", 0.85), (f"{b_pre}Hand", 0.15)], False),
            # Wrist & simple mitten hand (~0.10 long x 0.075 wide x 0.035 thick, rounded tip)
            (arm_len + fore_len, 0.034, 0.035, 0.000, f"hand_{reg_pre}", [(f"{b_pre}ForeArm", 0.25), (f"{b_pre}Hand", 0.75)], False),
            (arm_len + fore_len + 0.022, 0.0190, 0.038, 0.000, f"hand_{reg_pre}", [(f"{b_pre}Hand", 0.90), (f"{b_pre}ForeArm", 0.10)], False),
            (arm_len + fore_len + 0.056, 0.0180, 0.039, 0.000, f"hand_{reg_pre}", [(f"{b_pre}Hand", 0.65), (f"{b_pre}HandGrip", 0.35)], False),
            (arm_len + fore_len + 0.086, 0.0160, 0.034, 0.000, f"hand_{reg_pre}", [(f"{b_pre}Hand", 0.25), (f"{b_pre}HandGrip", 0.75)], False),
            (arm_len + fore_len + 0.104, 0.0115, 0.025, 0.000, f"hand_{reg_pre}", [(f"{b_pre}HandGrip", 1.00)], False),
        ]

    rings = []
    for s, r_p, r_f, z_lift, region, wts, can_morph in raw:
        if s < 0.0:
            # Tuck horizontally into upper torso instead of going upward along -arm_dir
            center = p_arm + Vector((sx * s, 0.0, z_lift))
        else:
            center = p_arm + arm_dir * s + Vector((0.0, 0.0, z_lift))
        if can_morph:
            # Smooth taper down to 0 before wrist
            t_sh = _clamp(1.0 - max(s - 0.02, 0.0) / 0.13, 0.0, 1.0)
            t_bulk = _clamp(1.0 - max(0.0, s) / 0.49, 0.0, 1.0)
            if s < 0.0:
                t_bulk = 0.25
                t_sh = 0.25
            scale_r = (
                1.0
                + heavy * 0.32 * t_bulk
                - slim * 0.20 * t_bulk
                + muscle * (0.26 * t_bulk + 0.14 * t_sh)
                + shoulders * 0.14 * t_sh
            )
            scale_r = max(0.70, scale_r)
            r_p *= scale_r
            r_f *= scale_r
        else:
            # Hand/wrist untouched by shape keys
            if s < 0.50:
                # small transition ring above wrist: only slight heavy/slim on forearm
                t_w = 0.25
                scale_r = max(0.80, 1.0 + heavy * 0.18 * t_w - slim * 0.12 * t_w + muscle * 0.12 * t_w)
                r_p *= scale_r
                r_f *= scale_r
        # Blend cross-section up vector smoothly from vertical at s<=0 to up_perp at s>=0.06
        alpha = _clamp(s / 0.06, 0.0, 1.0)
        side_vec = (vert_up * (1.0 - alpha) + up_perp * alpha).normalized()
        pts = _limb_ring(center, arm_dir, fwd_vec, side_vec, r_p, r_f, n=ARM_SIDES)
        rings.append((pts, region, wts, "skin_01"))

    # Thumb bump (attached along palm forward edge -Y, sized proportionally to mitten)
    thumb_base = p_wri + arm_dir * 0.026 + fwd_vec * 0.036
    thumb_dir = (arm_dir * 0.65 + fwd_vec * 0.76).normalized()
    t_side = up_perp
    t_fwd = thumb_dir.cross(t_side).normalized()
    tr = 0.013 if is_f else 0.014
    thumb_rings = [
        (_limb_ring(thumb_base - thumb_dir * 0.008, thumb_dir, t_fwd, t_side, tr * 1.15, tr * 1.15, n=6),
         f"hand_{reg_pre}", [(f"{b_pre}Hand", 0.90), (f"{b_pre}HandGrip", 0.10)], "skin_01"),
        (_limb_ring(thumb_base + thumb_dir * 0.018, thumb_dir, t_fwd, t_side, tr * 1.0, tr * 1.0, n=6),
         f"hand_{reg_pre}", [(f"{b_pre}Hand", 0.70), (f"{b_pre}HandGrip", 0.30)], "skin_01"),
        (_limb_ring(thumb_base + thumb_dir * 0.038, thumb_dir, t_fwd, t_side, tr * 0.68, tr * 0.68, n=6),
         f"hand_{reg_pre}", [(f"{b_pre}Hand", 0.50), (f"{b_pre}HandGrip", 0.50)], "skin_01"),
    ]
    return rings, thumb_rings


def _leg_specs(base, side, sk):
    """Return rings for leg + foot (`side` in ('L', 'R'))."""
    heavy = sk.get("Heavy", 0.0)
    slim = sk.get("Slim", 0.0)
    muscle = sk.get("Muscle", 0.0)
    hips = sk.get("Hips", 0.0)

    is_f = base == "female"
    sx = 1.0 if side == "L" else -1.0
    reg_pre = "l" if side == "L" else "r"
    b_pre = "Left" if side == "L" else "Right"
    cx_base = sx * 0.09

    # (z, rx, ry, y_off, region, weights, morph_type, swatch_above, hip_cx_scale)
    # Chunky toy leg radii: thigh ~0.084, knee ~0.062, calf ~0.058, ankle ~0.042
    # Top hip socket tucks cleanly inside pelvis (cx_scale 0.76 -> 0.92 -> 1.0) so no saddlebag flare!
    if is_f:
        raw = [
            (0.935, 0.054, 0.064, 0.005, f"thigh_{reg_pre}", [("Hips", 0.85), (f"{b_pre}UpLeg", 0.15)], "hip_socket", "c_white", 0.72),
            (0.890, 0.064, 0.072, 0.006, f"thigh_{reg_pre}", [("Hips", 0.50), (f"{b_pre}UpLeg", 0.50)], "hip_socket", "skin_01", 0.78),
            (0.815, 0.072, 0.078, 0.004, f"thigh_{reg_pre}", [("Hips", 0.20), (f"{b_pre}UpLeg", 0.80)], "thigh", "skin_01", 0.86),
            (0.680, 0.076, 0.078, 0.002, f"thigh_{reg_pre}", [(f"{b_pre}UpLeg", 1.00)], "thigh", "skin_01", 0.98),
            (0.530, 0.063, 0.065, 0.000, f"thigh_{reg_pre}", [(f"{b_pre}UpLeg", 0.85), (f"{b_pre}Leg", 0.15)], "knee", "skin_01", 1.00),
            (0.490, 0.061, 0.063, 0.000, f"knee_{reg_pre}", [(f"{b_pre}UpLeg", 0.50), (f"{b_pre}Leg", 0.50)], "knee", "skin_01", 1.00),
            (0.450, 0.060, 0.062, 0.002, f"shin_{reg_pre}", [(f"{b_pre}UpLeg", 0.15), (f"{b_pre}Leg", 0.85)], "knee", "skin_01", 1.00),
            (0.340, 0.057, 0.060, 0.006, f"shin_{reg_pre}", [(f"{b_pre}Leg", 1.00)], "shin", "skin_01", 1.00),
            (0.180, 0.047, 0.049, 0.002, f"shin_{reg_pre}", [(f"{b_pre}Leg", 1.00)], "shin", "skin_01", 1.00),
            (0.110, 0.042, 0.044, 0.000, f"ankle_{reg_pre}", [(f"{b_pre}Leg", 0.85), (f"{b_pre}Foot", 0.15)], "ankle_top", "skin_01", 1.00),
            (0.080, 0.041, 0.043, 0.000, f"ankle_{reg_pre}", [(f"{b_pre}Leg", 0.35), (f"{b_pre}Foot", 0.65)], "fixed", "skin_01", 1.00),
        ]
    else:
        raw = [
            (0.935, 0.052, 0.060, 0.004, f"thigh_{reg_pre}", [("Hips", 0.85), (f"{b_pre}UpLeg", 0.15)], "hip_socket", "c_white", 0.70),
            (0.890, 0.060, 0.068, 0.004, f"thigh_{reg_pre}", [("Hips", 0.50), (f"{b_pre}UpLeg", 0.50)], "hip_socket", "skin_01", 0.76),
            (0.815, 0.069, 0.075, 0.002, f"thigh_{reg_pre}", [("Hips", 0.20), (f"{b_pre}UpLeg", 0.80)], "thigh", "skin_01", 0.84),
            (0.680, 0.075, 0.077, 0.001, f"thigh_{reg_pre}", [(f"{b_pre}UpLeg", 1.00)], "thigh", "skin_01", 0.98),
            (0.530, 0.063, 0.065, 0.000, f"thigh_{reg_pre}", [(f"{b_pre}UpLeg", 0.85), (f"{b_pre}Leg", 0.15)], "knee", "skin_01", 1.00),
            (0.490, 0.062, 0.064, 0.000, f"knee_{reg_pre}", [(f"{b_pre}UpLeg", 0.50), (f"{b_pre}Leg", 0.50)], "knee", "skin_01", 1.00),
            (0.450, 0.061, 0.063, 0.002, f"shin_{reg_pre}", [(f"{b_pre}UpLeg", 0.15), (f"{b_pre}Leg", 0.85)], "knee", "skin_01", 1.00),
            (0.340, 0.059, 0.062, 0.006, f"shin_{reg_pre}", [(f"{b_pre}Leg", 1.00)], "shin", "skin_01", 1.00),
            (0.180, 0.048, 0.050, 0.002, f"shin_{reg_pre}", [(f"{b_pre}Leg", 1.00)], "shin", "skin_01", 1.00),
            (0.110, 0.043, 0.045, 0.000, f"ankle_{reg_pre}", [(f"{b_pre}Leg", 0.85), (f"{b_pre}Foot", 0.15)], "ankle_top", "skin_01", 1.00),
            (0.080, 0.042, 0.044, 0.000, f"ankle_{reg_pre}", [(f"{b_pre}Leg", 0.35), (f"{b_pre}Foot", 0.65)], "fixed", "skin_01", 1.00),
        ]

    rings = []
    for z, rx, ry, y_off, region, wts, mtype, sw, cx_scale in raw:
        cx = cx_base * cx_scale
        if mtype == "hip_socket":
            rx += heavy * 0.010 + muscle * 0.005 + hips * 0.010 - slim * 0.008
            ry += heavy * 0.012 + muscle * 0.006 + hips * 0.008 - slim * 0.008
        elif mtype == "thigh":
            t_hi = _clamp((z - 0.50) / 0.34, 0.0, 1.0)
            rx += heavy * 0.020 * t_hi + muscle * 0.012 * t_hi + hips * 0.016 * (t_hi ** 1.4) - slim * 0.015 * t_hi
            ry += heavy * 0.022 * t_hi + muscle * 0.014 * t_hi + hips * 0.012 * (t_hi ** 1.4) - slim * 0.015 * t_hi
            # Shift leg center outward as thigh widens so inner thighs never cross x=0
            if rx > 0.084:
                cx += sx * (rx - 0.084) * 1.05
        elif mtype == "knee":
            rx += heavy * 0.014 + muscle * 0.007 - slim * 0.010
            ry += heavy * 0.014 + muscle * 0.007 - slim * 0.010
        elif mtype == "shin":
            t_calf = _clamp(1.0 - abs(z - 0.31) / 0.20, 0.0, 1.0)
            rx += heavy * 0.014 * t_calf + muscle * 0.010 * t_calf - slim * 0.010 * t_calf
            ry += heavy * 0.016 * t_calf + muscle * 0.012 * t_calf - slim * 0.010 * t_calf
        elif mtype == "ankle_top":
            rx += heavy * 0.005 - slim * 0.004
            ry += heavy * 0.005 - slim * 0.004

        pts = _ellipse_ring(cx, y_off, z, rx, ry, n=LEG_SIDES)
        # Final safety clamp: never cross midline x=0 (leave >= 4 mm thigh gap)
        for p in pts:
            if side == "L":
                p.x = max(p.x, 0.004)
            else:
                p.x = min(p.x, -0.004)
        rings.append((pts, region, wts, sw))

    # Shoe-sized rounded chunky feet: ~0.24 m long (-0.178..+0.062) x ~0.095 m wide (foot_w=0.0475)
    foot_w = 0.0470 if is_f else 0.0485
    heel_y = 0.060 if is_f else 0.064
    ball_y = -0.118 if is_f else -0.124
    toe_y = -0.176 if is_f else -0.180

    f_r1 = []
    f_r2 = []
    f_sole = []
    for i in range(LEG_SIDES):
        th = 2.0 * math.pi * i / LEG_SIDES
        sx_u = math.sin(th)
        cy_u = -math.cos(th)  # -1 at front (-Y), +1 at back (+Y)
        w = foot_w * (0.86 if cy_u > 0 else 1.0)
        x = cx_base + w * sx_u
        if cy_u < 0:
            t_f = -cy_u
            y1 = -0.042 - t_f * (abs(ball_y) * 0.72)
            z1 = 0.064 - t_f * 0.018
            y2 = -0.046 - t_f * (abs(toe_y) - 0.046)
            z2 = 0.036 - t_f * 0.014
            ys = -0.046 - t_f * (abs(toe_y) - 0.050)
        else:
            t_b = cy_u
            y1 = -0.018 + t_b * (heel_y + 0.018)
            z1 = 0.056
            y2 = -0.022 + t_b * (heel_y + 0.022)
            z2 = 0.022
            ys = -0.022 + t_b * (heel_y + 0.014)
        f_r1.append(Vector((x, y1, z1)))
        f_r2.append(Vector((x, y2, z2)))
        f_sole.append(Vector((cx_base + w * 0.88 * sx_u, ys, 0.0)))

    def _foot_weights(pts):
        out_w = []
        for p in pts:
            # Blend Foot -> ToeBase across y = -0.09 .. -0.15
            t_toe = _clamp((-p.y - 0.08) / 0.07, 0.0, 1.0)
            if t_toe <= 0.01:
                out_w.append([(f"{b_pre}Foot", 1.0)])
            elif t_toe >= 0.99:
                out_w.append([(f"{b_pre}ToeBase", 1.0)])
            else:
                out_w.append([(f"{b_pre}Foot", 1.0 - t_toe), (f"{b_pre}ToeBase", t_toe)])
        return out_w

    rings.append((f_r1, f"foot_{reg_pre}", _foot_weights(f_r1), "skin_01"))
    rings.append((f_r2, f"foot_{reg_pre}", _foot_weights(f_r2), "skin_01"))
    rings.append((f_sole, f"foot_{reg_pre}", _foot_weights(f_sole), "skin_01"))
    return rings


def _build_bmesh_from_specs(base, sk):
    """Build complete body bmesh (with face quads, nose, ears) and return
    (bm, vert_region_ids, vert_weights, face_swatches, face_slots, face_materials_idx).
    """
    bm = bmesh.new()
    bm.loops.layers.uv.verify()

    vert_region_id = {}
    vert_weights = {}
    face_swatches = {}
    face_slots = {}
    face_mat_idx = {}

    def add_vert(co, rid, wts):
        v = bm.verts.new(co)
        vert_region_id[v] = rid
        vert_weights[v] = wts
        return v

    def add_face(verts, sw, mat_idx=0, slot=None, smooth=True):
        f = bm.faces.new(verts)
        f.smooth = smooth
        f.material_index = mat_idx
        face_swatches[f] = sw
        if slot is not None:
            face_slots[f] = slot
        face_mat_idx[f] = mat_idx
        return f

    def loft_rings(ring_data, cap_bottom=True, cap_top=True, cap_bottom_sw=None, cap_top_sw=None):
        """ring_data: list of (pts, region_name, wts_or_per_vert_wts, swatch_above)"""
        bm_rings = []
        for pts, reg, wts, sw in ring_data:
            rid = REGION_ID[reg]
            per_v = isinstance(wts[0], list) if wts else False
            row = []
            for idx, p in enumerate(pts):
                vw = wts[idx] if per_v else wts
                row.append(add_vert(p, rid, vw))
            bm_rings.append((row, sw, rid, wts))

        new_faces = []
        for (ra, sw_a, _rida, _wa), (rb, _sw_b, _ridb, _wb) in zip(bm_rings, bm_rings[1:]):
            n = len(ra)
            for i in range(n):
                j = (i + 1) % n
                f = add_face((ra[i], ra[j], rb[j], rb[i]), sw_a, mat_idx=0, smooth=True)
                new_faces.append(f)

        if cap_bottom and bm_rings:
            ra, sw_a, rida, wa = bm_rings[0]
            center = sum((v.co for v in ra), Vector()) / len(ra)
            vw = wa[0] if (wa and isinstance(wa[0], list)) else wa
            vc = add_vert(center, rida, vw)
            n = len(ra)
            csw = cap_bottom_sw or sw_a
            for i in range(n):
                j = (i + 1) % n
                new_faces.append(add_face((vc, ra[j], ra[i]), csw, mat_idx=0, smooth=False))

        if cap_top and bm_rings:
            rb, sw_b, ridb, wb = bm_rings[-1]
            center = sum((v.co for v in rb), Vector()) / len(rb)
            vw = wb[0] if (wb and isinstance(wb[0], list)) else wb
            vc = add_vert(center, ridb, vw)
            n = len(rb)
            csw = cap_top_sw or sw_b
            for i in range(n):
                j = (i + 1) % n
                new_faces.append(add_face((rb[i], rb[j], vc), csw, mat_idx=0, smooth=True))

        return bm_rings, new_faces

    # 1. Torso + Neck + Head
    torso_specs = _torso_specs(base, sk)
    torso_ring_data = []
    for z, rx, ry, y_off, fflat, fpush, bpush, region, wts, sw in torso_specs:
        pts = _ellipse_ring(0.0, y_off, z, rx, ry, n=TORSO_SIDES,
                            front_flat=fflat, front_push=fpush, back_push=bpush)
        torso_ring_data.append((pts, region, wts, sw))

    torso_bm_rings, torso_faces = loft_rings(
        torso_ring_data, cap_bottom=True, cap_top=True,
        cap_bottom_sw="c_white", cap_top_sw="skin_01",
    )
    # Set top crown vertex exact height 1.740
    crown_v = torso_faces[-1].verts[2]
    crown_v.co = Vector((0.0, 0.006, 1.740))

    # 2. Cute small button nose on head front, IDENTICAL across bases, z > 1.54
    head_rid = REGION_ID["head"]
    head_wt = [("Head", 1.0)]
    y_face = -0.123
    nw_top = 0.010
    nw_bot = 0.014
    n_tl = add_vert(Vector((-nw_top, y_face, 1.578)), head_rid, head_wt)
    n_tr = add_vert(Vector((nw_top, y_face, 1.578)), head_rid, head_wt)
    n_bl = add_vert(Vector((-nw_bot, y_face, 1.542)), head_rid, head_wt)
    n_br = add_vert(Vector((nw_bot, y_face, 1.542)), head_rid, head_wt)
    n_tip_l = add_vert(Vector((-0.009, y_face - 0.016, 1.549)), head_rid, head_wt)
    n_tip_r = add_vert(Vector((0.009, y_face - 0.016, 1.549)), head_rid, head_wt)
    nose_faces = [
        add_face((n_tl, n_tip_l, n_tip_r, n_tr), "skin_01", smooth=True),
        add_face((n_tl, n_bl, n_tip_l), "skin_01", smooth=True),
        add_face((n_tr, n_tip_r, n_br), "skin_01", smooth=True),
        add_face((n_tip_l, n_bl, n_br, n_tip_r), "skin_01_shadow", smooth=True),
    ]

    # 3. Ears (left & right chunky low-poly rounded tabs, IDENTICAL across bases, z > 1.54)
    ear_faces = []
    for sx in (-1.0, 1.0):
        ex0 = sx * 0.118
        ex1 = sx * 0.138
        ey0, ey1 = -0.004, 0.024
        ez0, ez1 = 1.552, 1.612
        b0 = add_vert(Vector((ex0, ey0, ez0)), head_rid, head_wt)
        b1 = add_vert(Vector((ex0, ey1, ez0)), head_rid, head_wt)
        b2 = add_vert(Vector((ex0, ey1, ez1)), head_rid, head_wt)
        b3 = add_vert(Vector((ex0, ey0, ez1)), head_rid, head_wt)
        o0 = add_vert(Vector((ex1, ey0 + 0.004, ez0 + 0.007)), head_rid, head_wt)
        o1 = add_vert(Vector((ex1, ey1 - 0.003, ez0 + 0.007)), head_rid, head_wt)
        o2 = add_vert(Vector((ex1, ey1 - 0.003, ez1 - 0.007)), head_rid, head_wt)
        o3 = add_vert(Vector((ex1, ey0 + 0.004, ez1 - 0.007)), head_rid, head_wt)
        if sx > 0:
            ear_faces.extend([
                add_face((o0, o1, o2, o3), "skin_01", smooth=True),
                add_face((b0, b1, o1, o0), "skin_01_shadow", smooth=True),
                add_face((b1, b2, o2, o1), "skin_01", smooth=True),
                add_face((b2, b3, o3, o2), "skin_01", smooth=True),
                add_face((b3, b0, o0, o3), "skin_01", smooth=True),
            ])
        else:
            ear_faces.extend([
                add_face((o3, o2, o1, o0), "skin_01", smooth=True),
                add_face((o0, o1, b1, b0), "skin_01_shadow", smooth=True),
                add_face((o1, o2, b2, b1), "skin_01", smooth=True),
                add_face((o2, o3, b3, b2), "skin_01", smooth=True),
                add_face((o3, o0, b0, b3), "skin_01", smooth=True),
            ])

    # 4. Arms (L & R) + thumbs
    arm_faces = []
    for side in ("L", "R"):
        arings, trings = _arm_specs(base, side, sk)
        _r, af = loft_rings(arings, cap_bottom=True, cap_top=True,
                            cap_bottom_sw="skin_01", cap_top_sw="skin_01")
        _tr, tf = loft_rings(trings, cap_bottom=True, cap_top=True,
                             cap_bottom_sw="skin_01", cap_top_sw="skin_01")
        arm_faces.extend(af)
        arm_faces.extend(tf)

    # 5. Legs + Feet (L & R)
    leg_faces = []
    for side in ("L", "R"):
        lrings = _leg_specs(base, side, sk)
        _r, lf = loft_rings(lrings, cap_bottom=True, cap_top=True,
                            cap_bottom_sw="c_white", cap_top_sw="skin_01")
        leg_faces.extend(lf)

    # Fix normals per connected shell / overall outward
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    # 6. Five Face Patches (material 1 = M_Face, front -Y, ~1.7 mm off head skin)
    # Note: added AFTER recalc_face_normals and skin BVH build so -Y normal & skin clearance are guaranteed!
    skin_bvh = BVHTree.FromBMesh(bm)

    def _skin_y(x, z):
        loc, _norm, _fidx, _dist = skin_bvh.ray_cast(Vector((x, -1.0, z)), Vector((0.0, 1.0, 0.0)), 2.0)
        return loc.y if loc is not None else -0.120

    def _face_surf_y(x, z, offset=0.00175):
        # Symmetrize across x=0 so left/right sides match identically despite asymmetric quad triangulation
        y_l = _skin_y(abs(x), z)
        y_r = _skin_y(-abs(x), z)
        return min(y_l, y_r) - offset

    # Conform along the 12-gon head front ridge lines (x=0, x=+-0.060..0.0615, z=1.595)
    # so every sub-quad sits consistently ~1-2 mm in front of the skin it overlays.
    face_patches = [
        # (name, slot, xs, zs, col, row, mirror_u)
        ("eye_l",  "eye",   [ 0.022,  0.0615,  0.078], [1.564, 1.595, 1.620], 0, 0, False),
        ("eye_r",  "eye",   [-0.078, -0.0615, -0.022], [1.564, 1.595, 1.620], 0, 0, True),
        ("brow_l", "brow",  [ 0.020,  0.0600,  0.080], [1.624, 1.648],        0, 4, False),
        ("brow_r", "brow",  [-0.080, -0.0600, -0.020], [1.624, 1.648],        0, 4, True),
        ("mouth",  "mouth", [-0.036,  0.000,   0.036], [1.496, 1.532],        0, 5, False),
    ]
    patch_uv_info = []
    for _qname, slot, xs, zs, col, row, mirror_u in face_patches:
        x0, x1 = xs[0], xs[-1]
        z0, z1 = zs[0], zs[-1]
        grid = [
            [add_vert(Vector((x, _face_surf_y(x, z), z)), head_rid, head_wt) for x in xs]
            for z in zs
        ]
        patch_faces = []
        for iz in range(len(zs) - 1):
            for ix in range(len(xs) - 1):
                # Front-facing (-Y) CCW order: (x_i,z_j) -> (x_{i+1},z_j) -> (x_{i+1},z_{j+1}) -> (x_i,z_{j+1})
                fq = add_face(
                    (grid[iz][ix], grid[iz][ix + 1], grid[iz + 1][ix + 1], grid[iz + 1][ix]),
                    None, mat_idx=1, slot=slot, smooth=False,
                )
                patch_faces.append(fq)
        patch_uv_info.append((patch_faces, x0, x1, z0, z1, col, row, mirror_u))

    # Paint UVs: palette swatches for M_Palette faces, atlas cells across full patch bounds for M_Face
    for f, sw in face_swatches.items():
        if sw is not None:
            charexport.paint_palette(bm, [f], sw)
    uvl = bm.loops.layers.uv.verify()
    for patch_faces, x0, x1, z0, z1, col, row, mirror_u in patch_uv_info:
        u0, u1 = col / 8.0, (col + 1.0) / 8.0
        v_top, v_bot = 1.0 - row / 8.0, 1.0 - (row + 1.0) / 8.0
        if mirror_u:
            u0, u1 = u1, u0
        dx = max(x1 - x0, 1e-6)
        dz = max(z1 - z0, 1e-6)
        for fq in patch_faces:
            for loop in fq.loops:
                tx = _clamp((loop.vert.co.x - x0) / dx, 0.0, 1.0)
                tz = _clamp((loop.vert.co.z - z0) / dz, 0.0, 1.0)
                loop[uvl].uv = (u0 + tx * (u1 - u0), v_bot + tz * (v_top - v_bot))

    # Sort faces by region ID (keeping M_Face quads at the end) so hide ranges are compact
    def _face_sort_key(f):
        if f in face_slots:
            return 999_000_000 + f.index
        rids = [vert_region_id[v] for v in f.verts]
        return (min(rids) * 100 + max(rids)) * 100_000 + f.index

    bm.faces.index_update()
    bm.faces.sort(key=_face_sort_key)
    bm.verts.index_update()

    # Set COLOR_0
    charexport.set_body_colors(bm, vert_region_id, face_slots)

    return bm, vert_region_id, vert_weights


def build_base_body(base):
    """Build complete Blender armature + skinned mesh object for `base` ('female'|'male').
    Returns (arm, mesh_ob, meta_dict).
    """
    stem = f"body_{base}"
    arm = rig.build_armature(stem)

    # Neutral geometry
    bm, vert_region_id, vert_weights = _build_bmesh_from_specs(base, {})
    nverts = len(bm.verts)

    # Count vertices per region
    region_counts = {r: 0 for r in REGIONS}
    for v in bm.verts:
        rname = REGIONS[vert_region_id[v]]
        region_counts[rname] += 1

    # Ordered weight list by vertex index
    weights_by_vert = [None] * nverts
    for v in bm.verts:
        weights_by_vert[v.index] = vert_weights[v]

    base_cos = [v.co.copy() for v in sorted(bm.verts, key=lambda v: v.index)]
    tris = sum(len(f.verts) - 2 for f in bm.faces)

    me = charexport.bmesh_to_mesh(
        bm, f"{stem}_mesh",
        [charexport.palette.material("palette"), charexport.face_material()],
    )
    ob = charexport.create_skinned_object(f"{stem}_mesh", me, arm, weights_by_vert)

    # Parametric shape keys
    deltas_by_key = {}
    for key in rig.SHAPE_KEYS:
        bm_k, _vrid, _vw = _build_bmesh_from_specs(base, {key: 1.0})
        assert len(bm_k.verts) == nverts, f"vertex count mismatch for {base} {key}"
        bm_k.verts.index_update()
        k_cos = [v.co.copy() for v in sorted(bm_k.verts, key=lambda v: v.index)]
        bm_k.free()
        deltas = []
        for i in range(nverts):
            d = k_cos[i] - base_cos[i]
            # Contract §1: head (z > 1.44) never moves
            if base_cos[i].z > 1.44:
                d = Vector((0.0, 0.0, 0.0))
            deltas.append(d)
        deltas_by_key[key] = deltas

    charexport.add_shape_keys(ob, deltas_by_key)

    meta = {
        "tris": tris,
        "regionVertexCounts": region_counts,
    }
    return arm, ob, meta
