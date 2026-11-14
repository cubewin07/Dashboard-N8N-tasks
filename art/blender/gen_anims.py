"""Procedural / keyframed animation library for the shared character rig (P07a-T06).

Authors the 21 clips required by art/CHARACTER-PIPELINE.md §6 using the keyframe DSL
in art/blender/lib/anim.py, samples at 30 fps, bakes 15 fps keys onto Blender
Actions + NLA tracks, and exports a skeleton-only GLB (`library`).

Usage:
  Blender -b --factory-startup --python-exit-code 1 -P art/blender/gen_anims.py -- --out art/.cache/raw
"""
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import anim, rig  # noqa: E402
from lib.anim import Arm, Clip, ForeArm, Hand, Layer  # noqa: E402
from lib.export import clear_scene  # noqa: E402

# Reusable seated leg/hip base (pelvis bottom at ~0.45 m, feet flat on floor z=0)
_SIT_BASE = {
    "_hips": (0.0, 0.0, -0.42),
    "LeftUpLeg": (-90.0, 0.0, 4.0),
    "RightUpLeg": (-90.0, 0.0, -4.0),
    "LeftLeg": (90.0, 0.0, 0.0),
    "RightLeg": (90.0, 0.0, 0.0),
    "LeftFoot": (0.0, 0.0, 0.0),
    "RightFoot": (0.0, 0.0, 0.0),
    "LeftArm": Arm(fwd=16.0, out=8.0, twist=12.0),
    "RightArm": Arm(fwd=16.0, out=8.0, twist=12.0),
    "LeftForeArm": ForeArm(bend=64.0),
    "RightForeArm": ForeArm(bend=64.0),
}

# Reusable standing idle arms
_STAND_ARMS = {
    "LeftArm": Arm(fwd=2.0, out=6.0, twist=4.0),
    "RightArm": Arm(fwd=2.0, out=6.0, twist=4.0),
    "LeftForeArm": ForeArm(bend=16.0),
    "RightForeArm": ForeArm(bend=16.0),
}


def _walk_clip(name, carrying=False):
    """1.0 s walk cycle: 2 steps of 0.65 m = 1.3 m/s, heel-toe, hip bob, counter-twist."""
    if carrying:
        arm_base = {
            "Spine": (-4.0, 0.0, 0.0),
            "Spine1": (-2.0, 0.0, 0.0),
            "LeftArm": Arm(fwd=18.0, out=7.0, twist=16.0),
            "RightArm": Arm(fwd=18.0, out=7.0, twist=16.0),
            "LeftForeArm": ForeArm(bend=88.0),
            "RightForeArm": ForeArm(bend=88.0),
            "LeftHand": Hand(yaw=10.0),
            "RightHand": Hand(yaw=10.0),
        }
        arm_layers = [
            Layer("LeftArm", 0, 2.0, cycles=2, phase=0.0),
            Layer("RightArm", 0, 2.0, cycles=2, phase=0.0),
            Layer("LeftForeArm", 0, 3.0, cycles=2, phase=0.5),
            Layer("RightForeArm", 0, 3.0, cycles=2, phase=0.5),
        ]
    else:
        arm_base = {}
        arm_layers = []

    def pose_at(phase):
        s = 1.0 if phase == 0 else -1.0
        L = "Left" if phase == 0 else "Right"
        R = "Right" if phase == 0 else "Left"
        p = {
            "_hips": (0.0, 0.0, -0.032),
            "Hips": (0.0, -2.0 * s, 4.5 * s),
            "Spine": (4.0, 1.0 * s, -2.0 * s),
            "Spine2": (2.0, 1.0 * s, -4.5 * s),
            "Head": (-3.0, 0.0, 1.5 * s),
            f"{L}UpLeg": (-25.0, 0.0, 0.0),
            f"{L}Leg": (7.0, 0.0, 0.0),
            f"{L}Foot": (-14.0, 0.0, 0.0),
            f"{L}ToeBase": (10.0, 0.0, 0.0),
            f"{R}UpLeg": (19.0, 0.0, 0.0),
            f"{R}Leg": (18.0, 0.0, 0.0),
            f"{R}Foot": (22.0, 0.0, 0.0),
            f"{R}ToeBase": (-18.0, 0.0, 0.0),
        }
        if not carrying:
            p[f"{L}Arm"] = Arm(fwd=-18.0, out=7.0, twist=4.0)
            p[f"{L}ForeArm"] = ForeArm(bend=14.0)
            p[f"{R}Arm"] = Arm(fwd=24.0, out=7.0, twist=6.0)
            p[f"{R}ForeArm"] = ForeArm(bend=28.0)
        return p

    def mid_at(phase):
        s = 1.0 if phase == 0 else -1.0
        L = "Left" if phase == 0 else "Right"
        R = "Right" if phase == 0 else "Left"
        p = {
            "_hips": (0.0, 0.0, 0.002),
            "Hips": (0.0, 2.5 * s, 0.0),
            "Spine": (3.0, -1.5 * s, 0.0),
            "Spine2": (2.0, -1.0 * s, 0.0),
            "Head": (-2.0, 0.0, 0.0),
            f"{L}UpLeg": (-2.0, 0.0, 0.0),
            f"{L}Leg": (5.0, 0.0, 0.0),
            f"{L}Foot": (-3.0, 0.0, 0.0),
            f"{L}ToeBase": (0.0, 0.0, 0.0),
            f"{R}UpLeg": (-18.0, 0.0, 0.0),
            f"{R}Leg": (48.0, 0.0, 0.0),
            f"{R}Foot": (6.0, 0.0, 0.0),
            f"{R}ToeBase": (0.0, 0.0, 0.0),
        }
        if not carrying:
            p[f"{L}Arm"] = Arm(fwd=2.0, out=7.0, twist=4.0)
            p[f"{L}ForeArm"] = ForeArm(bend=18.0)
            p[f"{R}Arm"] = Arm(fwd=-2.0, out=7.0, twist=4.0)
            p[f"{R}ForeArm"] = ForeArm(bend=18.0)
        return p

    def load_at(phase):
        s = 1.0 if phase == 0 else -1.0
        L = "Left" if phase == 0 else "Right"
        R = "Right" if phase == 0 else "Left"
        p = {
            "_hips": (0.0, 0.0, -0.036),
            "Hips": (0.0, 0.0, 2.5 * s),
            "Spine": (4.0, 0.0, -1.0 * s),
            "Spine2": (2.0, 0.0, -2.5 * s),
            "Head": (-3.0, 0.0, 1.0 * s),
            f"{L}UpLeg": (-14.0, 0.0, 0.0),
            f"{L}Leg": (14.0, 0.0, 0.0),
            f"{L}Foot": (0.0, 0.0, 0.0),
            f"{L}ToeBase": (0.0, 0.0, 0.0),
            f"{R}UpLeg": (12.0, 0.0, 0.0),
            f"{R}Leg": (38.0, 0.0, 0.0),
            f"{R}Foot": (20.0, 0.0, 0.0),
            f"{R}ToeBase": (-12.0, 0.0, 0.0),
        }
        if not carrying:
            p[f"{L}Arm"] = Arm(fwd=-10.0, out=7.0, twist=4.0)
            p[f"{L}ForeArm"] = ForeArm(bend=15.0)
            p[f"{R}Arm"] = Arm(fwd=14.0, out=7.0, twist=5.0)
            p[f"{R}ForeArm"] = ForeArm(bend=24.0)
        return p

    def reach_at(phase):
        s = 1.0 if phase == 0 else -1.0
        L = "Left" if phase == 0 else "Right"
        R = "Right" if phase == 0 else "Left"
        p = {
            "_hips": (0.0, 0.0, -0.015),
            "Hips": (0.0, 1.5 * s, -2.5 * s),
            "Spine": (3.0, -1.0 * s, 1.5 * s),
            "Spine2": (2.0, -0.5 * s, 2.5 * s),
            "Head": (-2.0, 0.0, -1.0 * s),
            f"{L}UpLeg": (10.0, 0.0, 0.0),
            f"{L}Leg": (8.0, 0.0, 0.0),
            f"{L}Foot": (10.0, 0.0, 0.0),
            f"{L}ToeBase": (-10.0, 0.0, 0.0),
            f"{R}UpLeg": (-28.0, 0.0, 0.0),
            f"{R}Leg": (18.0, 0.0, 0.0),
            f"{R}Foot": (-10.0, 0.0, 0.0),
            f"{R}ToeBase": (8.0, 0.0, 0.0),
        }
        if not carrying:
            p[f"{L}Arm"] = Arm(fwd=14.0, out=7.0, twist=5.0)
            p[f"{L}ForeArm"] = ForeArm(bend=22.0)
            p[f"{R}Arm"] = Arm(fwd=-10.0, out=7.0, twist=4.0)
            p[f"{R}ForeArm"] = ForeArm(bend=15.0)
        return p

    return Clip(
        name=name,
        duration=1.0,
        loop=True,
        speed_mps=1.3,
        base=arm_base,
        layers=arm_layers,
        keys=[
            (0.0, pose_at(0)),
            (0.125, load_at(0)),
            (0.25, mid_at(0)),
            (0.375, reach_at(0)),
            (0.5, pose_at(1)),
            (0.625, load_at(1)),
            (0.75, mid_at(1)),
            (0.875, reach_at(1)),
            (1.0, pose_at(0)),
        ],
    )


def build_clips():
    """Return the ordered list of all 21 Clips."""
    clips = []

    # 1. idle (3.0 s)
    clips.append(Clip(
        name="idle",
        duration=3.0,
        loop=True,
        base=_STAND_ARMS,
        keys=[
            (0.0, {"Hips": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0)}),
            (1.0, {"Hips": (0.0, 1.5, 2.0), "Spine": (0.0, -1.5, -1.5), "Head": (1.5, 0.0, 4.0)}),
            (2.0, {"Hips": (0.0, -1.5, -2.0), "Spine": (0.0, 1.5, 1.5), "Head": (-1.0, 0.0, -4.0)}),
            (3.0, {"Hips": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0)}),
        ],
        layers=[
            Layer("Spine1", 0, 1.2, cycles=2),
            Layer("Spine2", 0, 1.5, cycles=2),
            Layer("LeftArm", 1, 1.2, cycles=2),
            Layer("RightArm", 1, 1.2, cycles=2),
        ],
    ))

    # 2. walk (1.0 s, 1.3 m/s)
    clips.append(_walk_clip("walk", carrying=False))

    # 3. carry_walk (1.0 s, 1.3 m/s)
    clips.append(_walk_clip("carry_walk", carrying=True))

    # 4. sit_idle (3.0 s)
    clips.append(Clip(
        name="sit_idle",
        duration=3.0,
        loop=True,
        seated=True,
        base=_SIT_BASE,
        keys=[
            (0.0, {"Spine": (2.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0)}),
            (1.2, {"Spine": (4.0, 1.0, 1.5), "Head": (2.0, 0.0, 5.0)}),
            (2.2, {"Spine": (1.0, -1.0, -1.5), "Head": (-2.0, 0.0, -5.0)}),
            (3.0, {"Spine": (2.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0)}),
        ],
        layers=[
            Layer("Spine1", 0, 1.2, cycles=2),
            Layer("Spine2", 0, 1.2, cycles=2),
        ],
    ))

    # 5. sit_type (1.6 s) - hands hover ~0.78 m high, 0.35-0.45 m forward above 0.74 m desk
    sit_type_base = {
        **_SIT_BASE,
        "Spine": (8.0, 0.0, 0.0),
        "Spine1": (4.0, 0.0, 0.0),
        "Neck": (4.0, 0.0, 0.0),
        "Head": (8.0, 0.0, 0.0),
        "LeftArm": Arm(fwd=36.0, out=5.0, twist=18.0),
        "RightArm": Arm(fwd=36.0, out=5.0, twist=18.0),
        "LeftForeArm": ForeArm(bend=108.0),
        "RightForeArm": ForeArm(bend=108.0),
        "LeftHand": Hand(pitch=-18.0),
        "RightHand": Hand(pitch=-18.0),
    }
    clips.append(Clip(
        name="sit_type",
        duration=1.6,
        loop=True,
        seated=True,
        base=sit_type_base,
        keys=[
            (0.0, {"Head": (8.0, 0.0, 0.0)}),
            (0.8, {"Head": (10.0, 0.0, 3.0)}),
            (1.6, {"Head": (8.0, 0.0, 0.0)}),
        ],
        layers=[
            Layer("LeftForeArm", 0, 5.0, cycles=4, phase=0.0),
            Layer("RightForeArm", 0, 5.0, cycles=4, phase=3.14159),
            Layer("LeftHand", 0, 8.0, cycles=4, phase=0.4),
            Layer("RightHand", 0, 8.0, cycles=4, phase=3.54159),
            Layer("Spine2", 0, 1.0, cycles=1),
        ],
    ))

    # 6. sit_read (2.4 s) - holding paper in both hands in front of chest/above desk
    sit_read_base = {
        **_SIT_BASE,
        "Spine": (6.0, 0.0, 0.0),
        "Spine1": (4.0, 0.0, 0.0),
        "Neck": (10.0, 0.0, 0.0),
        "Head": (14.0, 0.0, 0.0),
        "LeftArm": Arm(fwd=34.0, out=7.0, twist=28.0),
        "RightArm": Arm(fwd=34.0, out=7.0, twist=28.0),
        "LeftForeArm": ForeArm(bend=96.0),
        "RightForeArm": ForeArm(bend=96.0),
        "LeftHand": Hand(pitch=10.0, roll=30.0),
        "RightHand": Hand(pitch=10.0, roll=30.0),
    }
    clips.append(Clip(
        name="sit_read",
        duration=2.4,
        loop=True,
        seated=True,
        base=sit_read_base,
        keys=[
            (0.0, {"Head": (14.0, 0.0, 4.0), "RightForeArm": ForeArm(bend=96.0)}),
            (0.9, {"Head": (16.0, 0.0, -4.0), "RightForeArm": ForeArm(bend=96.0)}),
            (1.4, {"Head": (13.0, 0.0, -2.0), "RightForeArm": ForeArm(bend=104.0, yaw=8.0)}),
            (1.8, {"Head": (14.0, 0.0, 3.0), "RightForeArm": ForeArm(bend=96.0)}),
            (2.4, {"Head": (14.0, 0.0, 4.0), "RightForeArm": ForeArm(bend=96.0)}),
        ],
        layers=[Layer("Spine2", 0, 1.2, cycles=1)],
    ))

    # 7. sit_phone (2.0 s) - right hand holding phone in front of chest
    sit_phone_base = {
        **_SIT_BASE,
        "Spine": (5.0, 0.0, 0.0),
        "Neck": (10.0, 0.0, 0.0),
        "Head": (16.0, 0.0, -4.0),
        "RightArm": Arm(fwd=30.0, out=6.0, twist=38.0),
        "RightForeArm": ForeArm(bend=104.0),
        "RightHand": Hand(pitch=8.0, roll=35.0),
    }
    clips.append(Clip(
        name="sit_phone",
        duration=2.0,
        loop=True,
        seated=True,
        base=sit_phone_base,
        keys=[
            (0.0, {"Head": (16.0, 0.0, -4.0)}),
            (1.0, {"Head": (19.0, 0.0, -6.0)}),
            (2.0, {"Head": (16.0, 0.0, -4.0)}),
        ],
        layers=[
            Layer("RightHand", 0, 7.0, cycles=3),
            Layer("RightForeArm", 0, 2.5, cycles=3, phase=0.5),
            Layer("Spine1", 0, 1.0, cycles=1),
        ],
    ))

    # 8. stand_talk_a (2.4 s)
    clips.append(Clip(
        name="stand_talk_a",
        duration=2.4,
        loop=True,
        keys=[
            (0.0, {
                "Hips": (0.0, 0.0, 2.0), "Spine": (2.0, 0.0, -2.0), "Head": (0.0, 0.0, 4.0),
                "LeftArm": Arm(fwd=14.0, out=10.0, twist=18.0), "LeftForeArm": ForeArm(bend=62.0),
                "RightArm": Arm(fwd=24.0, out=14.0, twist=22.0), "RightForeArm": ForeArm(bend=82.0),
            }),
            (0.7, {
                "Hips": (0.0, 1.5, -2.0), "Spine": (4.0, -2.0, 4.0), "Head": (-3.0, -3.0, -5.0),
                "LeftArm": Arm(fwd=28.0, out=18.0, twist=16.0), "LeftForeArm": ForeArm(bend=88.0),
                "RightArm": Arm(fwd=12.0, out=10.0, twist=16.0), "RightForeArm": ForeArm(bend=54.0),
            }),
            (1.4, {
                "Hips": (0.0, -1.5, 3.0), "Spine": (2.0, 2.0, -4.0), "Head": (4.0, 2.0, 6.0),
                "LeftArm": Arm(fwd=20.0, out=14.0, twist=14.0), "LeftForeArm": ForeArm(bend=72.0),
                "RightArm": Arm(fwd=32.0, out=22.0, twist=12.0), "RightForeArm": ForeArm(bend=94.0),
            }),
            (2.4, {
                "Hips": (0.0, 0.0, 2.0), "Spine": (2.0, 0.0, -2.0), "Head": (0.0, 0.0, 4.0),
                "LeftArm": Arm(fwd=14.0, out=10.0, twist=18.0), "LeftForeArm": ForeArm(bend=62.0),
                "RightArm": Arm(fwd=24.0, out=14.0, twist=22.0), "RightForeArm": ForeArm(bend=82.0),
            }),
        ],
    ))

    # 9. stand_talk_b (2.4 s)
    clips.append(Clip(
        name="stand_talk_b",
        duration=2.4,
        loop=True,
        base={
            "Hips": (0.0, 2.0, -5.0),
            "LeftArm": Arm(fwd=8.0, out=12.0, twist=20.0),
            "LeftForeArm": ForeArm(bend=68.0),
        },
        keys=[
            (0.0, {
                "Spine": (2.0, -2.0, 4.0), "Head": (-2.0, 3.0, -4.0),
                "RightArm": Arm(fwd=22.0, out=14.0, twist=14.0), "RightForeArm": ForeArm(bend=74.0),
            }),
            (0.8, {
                "Spine": (5.0, -3.0, 8.0), "Head": (3.0, -4.0, 5.0),
                "RightArm": Arm(fwd=38.0, out=28.0, twist=10.0), "RightForeArm": ForeArm(bend=88.0),
            }),
            (1.6, {
                "Spine": (0.0, 1.0, 2.0), "Head": (-4.0, 2.0, -6.0),
                "RightArm": Arm(fwd=28.0, out=16.0, twist=22.0), "RightForeArm": ForeArm(bend=96.0),
            }),
            (2.4, {
                "Spine": (2.0, -2.0, 4.0), "Head": (-2.0, 3.0, -4.0),
                "RightArm": Arm(fwd=22.0, out=14.0, twist=14.0), "RightForeArm": ForeArm(bend=74.0),
            }),
        ],
    ))

    # 10. wave (1.8 s, one-shot)
    clips.append(Clip(
        name="wave",
        duration=1.8,
        loop=False,
        base={
            "LeftArm": Arm(fwd=2.0, out=6.0, twist=4.0),
            "LeftForeArm": ForeArm(bend=16.0),
        },
        keys=[
            (0.0, {"Spine": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0), "RightArm": Arm(fwd=2.0, out=6.0, twist=4.0), "RightForeArm": ForeArm(bend=16.0)}),
            (0.4, {"Spine": (-2.0, 3.0, 2.0), "Head": (-4.0, -5.0, -4.0), "RightArm": Arm(fwd=24.0, out=142.0, twist=8.0), "RightForeArm": ForeArm(bend=88.0, yaw=-18.0)}),
            (0.7, {"Spine": (-2.0, 4.0, 2.0), "Head": (-4.0, -6.0, -4.0), "RightArm": Arm(fwd=24.0, out=136.0, twist=8.0), "RightForeArm": ForeArm(bend=64.0, yaw=18.0)}),
            (1.0, {"Spine": (-2.0, 3.0, 2.0), "Head": (-4.0, -5.0, -4.0), "RightArm": Arm(fwd=24.0, out=144.0, twist=8.0), "RightForeArm": ForeArm(bend=90.0, yaw=-18.0)}),
            (1.3, {"Spine": (-2.0, 2.0, 1.0), "Head": (-2.0, -3.0, -2.0), "RightArm": Arm(fwd=24.0, out=134.0, twist=8.0), "RightForeArm": ForeArm(bend=66.0, yaw=14.0)}),
            (1.8, {"Spine": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0), "RightArm": Arm(fwd=2.0, out=6.0, twist=4.0), "RightForeArm": ForeArm(bend=16.0)}),
        ],
    ))

    # 11. think (2.4 s) - right hand at chin, weight on one leg
    think_base = {
        "Hips": (0.0, 3.0, -4.0),
        "LeftArm": Arm(fwd=18.0, out=10.0, twist=30.0),
        "LeftForeArm": ForeArm(bend=88.0),
        "RightArm": Arm(fwd=64.0, out=6.0, twist=36.0),
        "RightForeArm": ForeArm(bend=118.0),
    }
    clips.append(Clip(
        name="think",
        duration=2.4,
        loop=True,
        base=think_base,
        keys=[
            (0.0, {"Spine": (2.0, -2.0, 3.0), "Head": (6.0, -5.0, 6.0)}),
            (1.2, {"Spine": (4.0, -3.0, 4.0), "Head": (9.0, -7.0, 2.0), "RightForeArm": ForeArm(bend=122.0)}),
            (2.4, {"Spine": (2.0, -2.0, 3.0), "Head": (6.0, -5.0, 6.0)}),
        ],
        layers=[Layer("Spine2", 0, 1.0, cycles=1)],
    ))

    # 12. drink (2.4 s) - right hand lifts cup to mouth, pauses, lowers
    drink_base = {
        "LeftArm": Arm(fwd=2.0, out=6.0, twist=4.0),
        "LeftForeArm": ForeArm(bend=18.0),
    }
    clips.append(Clip(
        name="drink",
        duration=2.4,
        loop=True,
        base=drink_base,
        keys=[
            (0.0, {"Spine": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0), "RightArm": Arm(fwd=24.0, out=10.0, twist=16.0), "RightForeArm": ForeArm(bend=76.0)}),
            (0.8, {"Spine": (-2.0, 0.0, 0.0), "Head": (-8.0, 0.0, -2.0), "RightArm": Arm(fwd=66.0, out=6.0, twist=34.0), "RightForeArm": ForeArm(bend=114.0)}),
            (1.3, {"Spine": (-3.0, 0.0, 0.0), "Head": (-12.0, 0.0, -2.0), "RightArm": Arm(fwd=68.0, out=6.0, twist=34.0), "RightForeArm": ForeArm(bend=116.0)}),
            (2.0, {"Spine": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0), "RightArm": Arm(fwd=24.0, out=10.0, twist=16.0), "RightForeArm": ForeArm(bend=76.0)}),
            (2.4, {"Spine": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0), "RightArm": Arm(fwd=24.0, out=10.0, twist=16.0), "RightForeArm": ForeArm(bend=76.0)}),
        ],
    ))

    # 13. sleep_desk (3.0 s, seated, eyes closed) - head resting on folded forearms atop 0.74 m desk
    sleep_desk_base = {
        **_SIT_BASE,
        "Spine": (12.0, 0.0, 0.0),
        "Spine1": (12.0, 0.0, 0.0),
        "Spine2": (10.0, 0.0, 0.0),
        "Neck": (12.0, 0.0, 0.0),
        "Head": (16.0, 0.0, 14.0),
        "LeftArm": Arm(fwd=72.0, out=12.0, twist=42.0),
        "RightArm": Arm(fwd=72.0, out=12.0, twist=42.0),
        "LeftForeArm": ForeArm(bend=94.0),
        "RightForeArm": ForeArm(bend=94.0),
    }
    clips.append(Clip(
        name="sleep_desk",
        duration=3.0,
        loop=True,
        seated=True,
        eyes="closed",
        base=sleep_desk_base,
        keys=[
            (0.0, {"Spine1": (12.0, 0.0, 0.0)}),
            (1.5, {"Spine1": (10.0, 0.0, 0.0)}),
            (3.0, {"Spine1": (12.0, 0.0, 0.0)}),
        ],
        layers=[
            Layer("Spine2", 0, -1.2, cycles=1),
            Layer("Head", 0, -1.2, cycles=1),
        ],
    ))

    # 14. sleep_bed (3.0 s, supine at 0.40 m mattress top, head toward -Z glTF / +Y Blender, face up)
    sleep_bed_base = {
        "_hips": (0.0, 0.10, -0.46),
        "Hips": (-90.0, 0.0, 0.0),
        "Neck": (4.0, 0.0, 0.0),
        "Head": (4.0, 0.0, 6.0),
        "LeftUpLeg": (-6.0, 0.0, 4.0),
        "RightUpLeg": (-5.0, 0.0, -4.0),
        "LeftLeg": (10.0, 0.0, 0.0),
        "RightLeg": (8.0, 0.0, 0.0),
        "LeftFoot": (14.0, 0.0, 0.0),
        "RightFoot": (14.0, 0.0, 0.0),
        "LeftArm": Arm(fwd=-4.0, out=12.0, twist=6.0),
        "RightArm": Arm(fwd=-4.0, out=12.0, twist=6.0),
        "LeftForeArm": ForeArm(bend=18.0),
        "RightForeArm": ForeArm(bend=18.0),
    }
    clips.append(Clip(
        name="sleep_bed",
        duration=3.0,
        loop=True,
        eyes="closed",
        base=sleep_bed_base,
        keys=[
            (0.0, {"Spine1": (0.0, 0.0, 0.0)}),
            (1.5, {"Spine1": (2.5, 0.0, 0.0)}),
            (3.0, {"Spine1": (0.0, 0.0, 0.0)}),
        ],
        layers=[
            Layer("Spine2", 0, 1.5, cycles=1),
            Layer("LeftArm", 1, 1.2, cycles=1),
            Layer("RightArm", 1, 1.2, cycles=1),
        ],
    ))

    # 15. sofa_sit (3.0 s, seated on 0.42 m sofa, leaning back relaxed)
    sofa_base = {
        "_hips": (0.0, 0.04, -0.45),
        "Hips": (-8.0, 0.0, 0.0),
        "Spine": (-6.0, 0.0, 0.0),
        "Spine1": (-4.0, 0.0, 0.0),
        "Neck": (6.0, 0.0, 0.0),
        "Head": (4.0, 0.0, 0.0),
        "LeftUpLeg": (-76.0, 0.0, 7.0),
        "RightUpLeg": (-76.0, 0.0, -7.0),
        "LeftLeg": (74.0, 0.0, 0.0),
        "RightLeg": (74.0, 0.0, 0.0),
        "LeftFoot": (10.0, 0.0, 0.0),
        "RightFoot": (10.0, 0.0, 0.0),
        "LeftArm": Arm(fwd=20.0, out=10.0, twist=22.0),
        "LeftForeArm": ForeArm(bend=68.0),
        "RightArm": Arm(fwd=8.0, out=32.0, twist=0.0),
        "RightForeArm": ForeArm(bend=56.0),
    }
    clips.append(Clip(
        name="sofa_sit",
        duration=3.0,
        loop=True,
        seated=True,
        base=sofa_base,
        keys=[
            (0.0, {"Head": (4.0, 0.0, 0.0)}),
            (1.3, {"Head": (2.0, -3.0, 6.0)}),
            (2.3, {"Head": (5.0, 2.0, -5.0)}),
            (3.0, {"Head": (4.0, 0.0, 0.0)}),
        ],
        layers=[Layer("Spine2", 0, 1.4, cycles=2)],
    ))

    # 16. pingpong (1.6 s) - athletic side-steps + right forehand swings
    pp_base = {
        "Spine": (12.0, 0.0, 0.0),
        "LeftArm": Arm(fwd=28.0, out=18.0, twist=20.0),
        "LeftForeArm": ForeArm(bend=72.0),
    }
    clips.append(Clip(
        name="pingpong",
        duration=1.6,
        loop=True,
        base=pp_base,
        keys=[
            (0.0, {
                "_hips": (-0.04, 0.0, -0.045), "Hips": (0.0, 0.0, -10.0), "Spine2": (6.0, 0.0, -14.0), "Head": (-10.0, 0.0, 14.0),
                "LeftUpLeg": (-20.0, 0.0, 8.0), "LeftLeg": (34.0, 0.0, 0.0), "LeftFoot": (-14.0, 0.0, 0.0),
                "RightUpLeg": (-22.0, 0.0, -8.0), "RightLeg": (38.0, 0.0, 0.0), "RightFoot": (-16.0, 0.0, 0.0),
                "RightArm": Arm(fwd=-8.0, out=42.0, twist=-14.0), "RightForeArm": ForeArm(bend=58.0),
            }),
            (0.45, {
                "_hips": (0.04, 0.0, -0.035), "Hips": (0.0, 0.0, 10.0), "Spine2": (4.0, 0.0, 18.0), "Head": (-8.0, 0.0, -10.0),
                "LeftUpLeg": (-22.0, 0.0, 8.0), "LeftLeg": (38.0, 0.0, 0.0), "LeftFoot": (-16.0, 0.0, 0.0),
                "RightUpLeg": (-18.0, 0.0, -8.0), "RightLeg": (32.0, 0.0, 0.0), "RightFoot": (-14.0, 0.0, 0.0),
                "RightArm": Arm(fwd=66.0, out=24.0, twist=42.0), "RightForeArm": ForeArm(bend=88.0),
            }),
            (0.9, {
                "_hips": (0.02, 0.0, -0.05), "Hips": (0.0, 0.0, 4.0), "Spine2": (8.0, 0.0, 2.0), "Head": (-12.0, 0.0, 0.0),
                "LeftUpLeg": (-22.0, 0.0, 8.0), "LeftLeg": (38.0, 0.0, 0.0), "LeftFoot": (-16.0, 0.0, 0.0),
                "RightUpLeg": (-20.0, 0.0, -8.0), "RightLeg": (34.0, 0.0, 0.0), "RightFoot": (-14.0, 0.0, 0.0),
                "RightArm": Arm(fwd=22.0, out=30.0, twist=12.0), "RightForeArm": ForeArm(bend=72.0),
            }),
            (1.6, {
                "_hips": (-0.04, 0.0, -0.045), "Hips": (0.0, 0.0, -10.0), "Spine2": (6.0, 0.0, -14.0), "Head": (-10.0, 0.0, 14.0),
                "LeftUpLeg": (-20.0, 0.0, 8.0), "LeftLeg": (34.0, 0.0, 0.0), "LeftFoot": (-14.0, 0.0, 0.0),
                "RightUpLeg": (-22.0, 0.0, -8.0), "RightLeg": (38.0, 0.0, 0.0), "RightFoot": (-16.0, 0.0, 0.0),
                "RightArm": Arm(fwd=-8.0, out=42.0, twist=-14.0), "RightForeArm": ForeArm(bend=58.0),
            }),
        ],
    ))

    # 17. arcade (1.6 s) - hands at ~1.0 m high, 0.35 m forward, small excited bounces
    arcade_base = {
        "Spine": (6.0, 0.0, 0.0),
        "Head": (-6.0, 0.0, 0.0),
        "LeftArm": Arm(fwd=24.0, out=6.0, twist=14.0),
        "RightArm": Arm(fwd=24.0, out=6.0, twist=14.0),
        "LeftForeArm": ForeArm(bend=78.0),
        "RightForeArm": ForeArm(bend=78.0),
        "LeftHand": Hand(pitch=-8.0),
        "RightHand": Hand(pitch=-8.0),
    }
    clips.append(Clip(
        name="arcade",
        duration=1.6,
        loop=True,
        base=arcade_base,
        keys=[
            (0.0, {"_hips": (0.0, 0.0, -0.005), "LeftUpLeg": (-6.0, 0.0, 2.0), "LeftLeg": (12.0, 0.0, 0.0), "LeftFoot": (-6.0, 0.0, 0.0), "RightUpLeg": (-6.0, 0.0, -2.0), "RightLeg": (12.0, 0.0, 0.0), "RightFoot": (-6.0, 0.0, 0.0)}),
            (0.4, {"_hips": (0.0, 0.0, -0.024), "LeftUpLeg": (-15.0, 0.0, 2.0), "LeftLeg": (28.0, 0.0, 0.0), "LeftFoot": (-13.0, 0.0, 0.0), "RightUpLeg": (-15.0, 0.0, -2.0), "RightLeg": (28.0, 0.0, 0.0), "RightFoot": (-13.0, 0.0, 0.0)}),
            (0.8, {"_hips": (0.0, 0.0, -0.005), "LeftUpLeg": (-6.0, 0.0, 2.0), "LeftLeg": (12.0, 0.0, 0.0), "LeftFoot": (-6.0, 0.0, 0.0), "RightUpLeg": (-6.0, 0.0, -2.0), "RightLeg": (12.0, 0.0, 0.0), "RightFoot": (-6.0, 0.0, 0.0)}),
            (1.2, {"_hips": (0.0, 0.0, -0.024), "LeftUpLeg": (-15.0, 0.0, 2.0), "LeftLeg": (28.0, 0.0, 0.0), "LeftFoot": (-13.0, 0.0, 0.0), "RightUpLeg": (-15.0, 0.0, -2.0), "RightLeg": (28.0, 0.0, 0.0), "RightFoot": (-13.0, 0.0, 0.0)}),
            (1.6, {"_hips": (0.0, 0.0, -0.005), "LeftUpLeg": (-6.0, 0.0, 2.0), "LeftLeg": (12.0, 0.0, 0.0), "LeftFoot": (-6.0, 0.0, 0.0), "RightUpLeg": (-6.0, 0.0, -2.0), "RightLeg": (12.0, 0.0, 0.0), "RightFoot": (-6.0, 0.0, 0.0)}),
        ],
        layers=[
            Layer("LeftHand", 2, 12.0, cycles=4),
            Layer("RightForeArm", 0, 5.0, cycles=6),
            Layer("RightHand", 0, 10.0, cycles=6, phase=0.5),
            Layer("Spine2", 2, 3.0, cycles=2),
        ],
    ))

    # 18. karaoke (2.0 s) - right hand holds mic at mouth, swaying, left arm gestures
    clips.append(Clip(
        name="karaoke",
        duration=2.0,
        loop=True,
        base={
            "RightArm": Arm(fwd=62.0, out=6.0, twist=34.0),
            "RightForeArm": ForeArm(bend=116.0),
        },
        keys=[
            (0.0, {
                "_hips": (0.0, 0.0, -0.012), "Hips": (0.0, -3.0, 6.0), "Spine": (2.0, 4.0, -4.0), "Head": (-6.0, 4.0, 6.0),
                "LeftUpLeg": (-10.0, 0.0, 3.0), "LeftLeg": (18.0, 0.0, 0.0), "LeftFoot": (-8.0, 0.0, 0.0),
                "RightUpLeg": (-10.0, 0.0, -3.0), "RightLeg": (18.0, 0.0, 0.0), "RightFoot": (-8.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=24.0, out=35.0, twist=10.0), "LeftForeArm": ForeArm(bend=52.0),
            }),
            (0.5, {
                "_hips": (0.0, 0.0, -0.002), "Hips": (0.0, 0.0, 0.0), "Spine": (0.0, 0.0, 0.0), "Head": (-10.0, 0.0, 0.0),
                "LeftUpLeg": (-4.0, 0.0, 3.0), "LeftLeg": (8.0, 0.0, 0.0), "LeftFoot": (-4.0, 0.0, 0.0),
                "RightUpLeg": (-4.0, 0.0, -3.0), "RightLeg": (8.0, 0.0, 0.0), "RightFoot": (-4.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=42.0, out=68.0, twist=0.0), "LeftForeArm": ForeArm(bend=36.0),
            }),
            (1.0, {
                "_hips": (0.0, 0.0, -0.012), "Hips": (0.0, 3.0, -6.0), "Spine": (2.0, -4.0, 4.0), "Head": (-6.0, -4.0, -6.0),
                "LeftUpLeg": (-10.0, 0.0, 3.0), "LeftLeg": (18.0, 0.0, 0.0), "LeftFoot": (-8.0, 0.0, 0.0),
                "RightUpLeg": (-10.0, 0.0, -3.0), "RightLeg": (18.0, 0.0, 0.0), "RightFoot": (-8.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=20.0, out=24.0, twist=15.0), "LeftForeArm": ForeArm(bend=68.0),
            }),
            (1.5, {
                "_hips": (0.0, 0.0, -0.002), "Hips": (0.0, 0.0, 0.0), "Spine": (0.0, 0.0, 0.0), "Head": (-8.0, 0.0, 0.0),
                "LeftUpLeg": (-4.0, 0.0, 3.0), "LeftLeg": (8.0, 0.0, 0.0), "LeftFoot": (-4.0, 0.0, 0.0),
                "RightUpLeg": (-4.0, 0.0, -3.0), "RightLeg": (8.0, 0.0, 0.0), "RightFoot": (-4.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=36.0, out=52.0, twist=5.0), "LeftForeArm": ForeArm(bend=44.0),
            }),
            (2.0, {
                "_hips": (0.0, 0.0, -0.012), "Hips": (0.0, -3.0, 6.0), "Spine": (2.0, 4.0, -4.0), "Head": (-6.0, 4.0, 6.0),
                "LeftUpLeg": (-10.0, 0.0, 3.0), "LeftLeg": (18.0, 0.0, 0.0), "LeftFoot": (-8.0, 0.0, 0.0),
                "RightUpLeg": (-10.0, 0.0, -3.0), "RightLeg": (18.0, 0.0, 0.0), "RightFoot": (-8.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=24.0, out=35.0, twist=10.0), "LeftForeArm": ForeArm(bend=52.0),
            }),
        ],
    ))

    # 19. elevator_wait (3.0 s)
    clips.append(Clip(
        name="elevator_wait",
        duration=3.0,
        loop=True,
        base={
            "RightArm": Arm(fwd=2.0, out=6.0, twist=4.0),
            "RightForeArm": ForeArm(bend=16.0),
        },
        keys=[
            (0.0, {"Hips": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0), "LeftArm": Arm(fwd=2.0, out=6.0, twist=4.0), "LeftForeArm": ForeArm(bend=16.0)}),
            (0.7, {"Hips": (0.0, 1.5, 2.0), "Head": (-18.0, 0.0, -4.0), "LeftArm": Arm(fwd=2.0, out=6.0, twist=4.0), "LeftForeArm": ForeArm(bend=16.0)}),
            (1.4, {"Hips": (0.0, -1.5, -2.0), "Head": (15.0, 0.0, 14.0), "LeftArm": Arm(fwd=32.0, out=8.0, twist=44.0), "LeftForeArm": ForeArm(bend=96.0)}),
            (2.0, {"Hips": (0.0, -1.5, -2.0), "Head": (16.0, 0.0, 14.0), "LeftArm": Arm(fwd=32.0, out=8.0, twist=44.0), "LeftForeArm": ForeArm(bend=96.0)}),
            (3.0, {"Hips": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0), "LeftArm": Arm(fwd=2.0, out=6.0, twist=4.0), "LeftForeArm": ForeArm(bend=16.0)}),
        ],
    ))

    # 20. celebrate (1.8 s, one-shot, eyes="happy")
    clips.append(Clip(
        name="celebrate",
        duration=1.8,
        loop=False,
        eyes="happy",
        keys=[
            (0.0, {
                "_hips": (0.0, 0.0, 0.0), "Spine": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0),
                "LeftUpLeg": (0.0, 0.0, 0.0), "LeftLeg": (0.0, 0.0, 0.0), "LeftFoot": (0.0, 0.0, 0.0),
                "RightUpLeg": (0.0, 0.0, 0.0), "RightLeg": (0.0, 0.0, 0.0), "RightFoot": (0.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=2.0, out=6.0, twist=4.0), "LeftForeArm": ForeArm(bend=16.0),
                "RightArm": Arm(fwd=2.0, out=6.0, twist=4.0), "RightForeArm": ForeArm(bend=16.0),
            }),
            (0.25, {
                "_hips": (0.0, 0.0, -0.07), "Spine": (10.0, 0.0, 0.0), "Head": (4.0, 0.0, 0.0),
                "LeftUpLeg": (-26.0, 0.0, 3.0), "LeftLeg": (48.0, 0.0, 0.0), "LeftFoot": (-22.0, 0.0, 0.0),
                "RightUpLeg": (-26.0, 0.0, -3.0), "RightLeg": (48.0, 0.0, 0.0), "RightFoot": (-22.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=-10.0, out=24.0, twist=10.0), "LeftForeArm": ForeArm(bend=42.0),
                "RightArm": Arm(fwd=-10.0, out=24.0, twist=10.0), "RightForeArm": ForeArm(bend=42.0),
            }),
            (0.65, {
                "_hips": (0.0, 0.0, 0.14), "Spine": (-8.0, 0.0, 0.0), "Head": (-14.0, 0.0, 0.0),
                "LeftUpLeg": (-6.0, 0.0, 6.0), "LeftLeg": (14.0, 0.0, 0.0), "LeftFoot": (18.0, 0.0, 0.0),
                "RightUpLeg": (-6.0, 0.0, -6.0), "RightLeg": (14.0, 0.0, 0.0), "RightFoot": (18.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=20.0, out=152.0, twist=10.0), "LeftForeArm": ForeArm(bend=18.0),
                "RightArm": Arm(fwd=20.0, out=152.0, twist=10.0), "RightForeArm": ForeArm(bend=18.0),
            }),
            (1.15, {
                "_hips": (0.0, 0.0, -0.05), "Spine": (6.0, 0.0, 0.0), "Head": (-4.0, 0.0, 0.0),
                "LeftUpLeg": (-22.0, 0.0, 3.0), "LeftLeg": (40.0, 0.0, 0.0), "LeftFoot": (-18.0, 0.0, 0.0),
                "RightUpLeg": (-22.0, 0.0, -3.0), "RightLeg": (40.0, 0.0, 0.0), "RightFoot": (-18.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=16.0, out=120.0, twist=8.0), "LeftForeArm": ForeArm(bend=28.0),
                "RightArm": Arm(fwd=16.0, out=120.0, twist=8.0), "RightForeArm": ForeArm(bend=28.0),
            }),
            (1.8, {
                "_hips": (0.0, 0.0, 0.0), "Spine": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0),
                "LeftUpLeg": (0.0, 0.0, 0.0), "LeftLeg": (0.0, 0.0, 0.0), "LeftFoot": (0.0, 0.0, 0.0),
                "RightUpLeg": (0.0, 0.0, 0.0), "RightLeg": (0.0, 0.0, 0.0), "RightFoot": (0.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=2.0, out=6.0, twist=4.0), "LeftForeArm": ForeArm(bend=16.0),
                "RightArm": Arm(fwd=2.0, out=6.0, twist=4.0), "RightForeArm": ForeArm(bend=16.0),
            }),
        ],
    ))

    # 21. frustrated (2.0 s, one-shot)
    clips.append(Clip(
        name="frustrated",
        duration=2.0,
        loop=False,
        keys=[
            (0.0, {
                "_hips": (0.0, 0.0, 0.0), "Spine": (0.0, 0.0, 0.0), "Spine1": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=2.0, out=6.0, twist=4.0), "LeftForeArm": ForeArm(bend=16.0),
                "RightArm": Arm(fwd=2.0, out=6.0, twist=4.0), "RightForeArm": ForeArm(bend=16.0),
            }),
            (0.45, {
                "_hips": (0.0, 0.0, -0.01), "Spine": (12.0, 0.0, 0.0), "Spine1": (8.0, 0.0, 0.0), "Head": (12.0, 0.0, 16.0),
                "LeftArm": Arm(fwd=112.0, out=28.0, twist=24.0), "LeftForeArm": ForeArm(bend=112.0),
                "RightArm": Arm(fwd=112.0, out=28.0, twist=24.0), "RightForeArm": ForeArm(bend=112.0),
            }),
            (0.75, {
                "_hips": (0.0, 0.0, -0.015), "Spine": (14.0, 0.0, 0.0), "Spine1": (10.0, 0.0, 0.0), "Head": (14.0, 0.0, -18.0),
                "LeftArm": Arm(fwd=112.0, out=28.0, twist=24.0), "LeftForeArm": ForeArm(bend=112.0),
                "RightArm": Arm(fwd=112.0, out=28.0, twist=24.0), "RightForeArm": ForeArm(bend=112.0),
            }),
            (1.05, {
                "_hips": (0.0, 0.0, -0.015), "Spine": (14.0, 0.0, 0.0), "Spine1": (10.0, 0.0, 0.0), "Head": (12.0, 0.0, 14.0),
                "LeftArm": Arm(fwd=112.0, out=28.0, twist=24.0), "LeftForeArm": ForeArm(bend=112.0),
                "RightArm": Arm(fwd=112.0, out=28.0, twist=24.0), "RightForeArm": ForeArm(bend=112.0),
            }),
            (1.45, {
                "_hips": (0.0, 0.0, -0.01), "Spine": (10.0, 0.0, 0.0), "Spine1": (6.0, 0.0, 0.0), "Head": (8.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=14.0, out=14.0, twist=10.0), "LeftForeArm": ForeArm(bend=28.0),
                "RightArm": Arm(fwd=14.0, out=14.0, twist=10.0), "RightForeArm": ForeArm(bend=28.0),
            }),
            (2.0, {
                "_hips": (0.0, 0.0, 0.0), "Spine": (0.0, 0.0, 0.0), "Spine1": (0.0, 0.0, 0.0), "Head": (0.0, 0.0, 0.0),
                "LeftArm": Arm(fwd=2.0, out=6.0, twist=4.0), "LeftForeArm": ForeArm(bend=16.0),
                "RightArm": Arm(fwd=2.0, out=6.0, twist=4.0), "RightForeArm": ForeArm(bend=16.0),
            }),
        ],
    ))

    return clips


def _parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".cache", "raw")
    only = None
    i = 0
    while i < len(argv):
        if argv[i] == "--out":
            out = os.path.abspath(argv[i + 1])
            i += 2
        elif argv[i] == "--only":
            only = set(argv[i + 1].split(","))
            i += 2
        else:
            i += 1
    return out, only


def main():
    out_dir, only = _parse_args()
    if os.path.basename(os.path.normpath(out_dir)) == "anim":
        anim_dir = out_dir
    else:
        anim_dir = os.path.join(out_dir, "anim")
    os.makedirs(anim_dir, exist_ok=True)
    glb_path = os.path.join(anim_dir, "library.glb")
    json_path = os.path.join(anim_dir, "library.json")

    clear_scene()
    scene = bpy.context.scene
    scene.render.fps = anim.FPS_EXPORT
    scene.render.fps_base = 1.0

    arm = rig.build_armature("library")
    clips = build_clips()
    if only:
        clips = [c for c in clips if c.name in only]

    for clip in clips:
        anim.bake_action(arm, clip)

    rig.reset_pose(arm)
    for ob in bpy.data.objects:
        ob.select_set(ob == arm)

    want = dict(
        filepath=glb_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips=True,
        export_def_bones=False,
        export_armature_object_remove=False,
        export_optimize_animation_size=False,
        export_optimize_animation_keep_anim_armature=True,
        export_force_sampling=True,
        export_frame_step=1,
        export_anim_slide_to_zero=True,
        export_rest_position_armature=True,
        export_copyright="AI Office project (CC0-1.0)",
    )
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})

    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump({"clips": [c.meta() for c in clips]}, fh, indent=2)
        fh.write("\n")

    print(f"BUILT library clips={len(clips)}")


if __name__ == "__main__":
    main()
