"""Keyframe DSL, smooth monotone-cubic interpolation, procedural sin layers, and
30 fps -> 15 fps baking for the shared character rig (`art/blender/lib/rig.py`).

Coordinate convention (Blender character space, matching rig.py):
- +X = character left, -Y = character forward, +Z = up.
- Bone values in a pose dict are either:
  * (x, y, z) degrees in character axes -> rig.char_quat(x, y, z)
  * Arm(fwd, out, twist) degrees for LeftArm / RightArm:
      drops from 45 deg A-pose to straight down, twists inward around arm axis,
      abducts outward by `out`, and swings forward by `fwd`.
- "_hips": (dx, dy, dz) world offset in metres from rest Hips (0, 0, 0.94).
"""
from dataclasses import dataclass, field
import math
from typing import NamedTuple

import bpy
from mathutils import Vector

from . import rig

FPS_AUTHOR = 30
FPS_EXPORT = 15


class Arm(NamedTuple):
    fwd: float = 0.0
    out: float = 5.0
    twist: float = 0.0


class ForeArm(NamedTuple):
    bend: float = 0.0
    yaw: float = 0.0
    twist: float = 0.0


class Hand(NamedTuple):
    pitch: float = 0.0
    roll: float = 0.0
    yaw: float = 0.0


@dataclass
class Layer:
    bone: str          # bone name or "_hips"
    axis: int          # 0, 1, 2
    amp: float         # degrees (or metres for _hips)
    cycles: int = 1    # integer cycles over clip duration -> exact loop closure
    phase: float = 0.0 # radians


@dataclass
class Clip:
    name: str
    duration: float
    loop: bool = True
    keys: list = field(default_factory=list)     # list of (t_sec, pose_dict)
    base: dict = field(default_factory=dict)     # default pose values for all keys
    layers: list = field(default_factory=list)   # list of Layer
    speed_mps: float | None = None
    seated: bool = False
    eyes: str | None = None

    def meta(self):
        d = {
            "clip": self.name,
            "loop": self.loop,
            "duration": round(self.duration, 4),
        }
        if self.speed_mps is not None:
            d["speedMps"] = self.speed_mps
        if self.seated:
            d["seated"] = True
        if self.eyes is not None:
            d["eyes"] = self.eyes
        return d


def arm_quat(side, fwd=0.0, out=5.0, twist=0.0):
    """Anatomical upper-arm rotation from 45-degree A-pose rest."""
    s = 1.0 if side == "Left" else -1.0
    return (
        rig.char_quat(x=-fwd)
        @ rig.char_quat(y=-s * out)
        @ rig.char_quat(z=-s * twist)
        @ rig.char_quat(y=s * 45.0)
    )


def forearm_quat(side, bend=0.0, yaw=0.0, twist=0.0):
    """Anatomical elbow hinge: cancels upper-arm 45-deg A-pose frame so `bend`
    always flexes purely forward (toward -Y) before shoulder twist."""
    s = 1.0 if side == "Left" else -1.0
    return (
        rig.char_quat(y=-s * 45.0)
        @ rig.char_quat(x=-bend, y=-s * twist, z=-s * yaw)
        @ rig.char_quat(y=s * 45.0)
    )


def hand_quat(side, pitch=0.0, roll=0.0, yaw=0.0):
    """Anatomical wrist rotation aligned with `forearm_quat`."""
    s = 1.0 if side == "Left" else -1.0
    return (
        rig.char_quat(y=-s * 45.0)
        @ rig.char_quat(x=-pitch, y=-s * roll, z=-s * yaw)
        @ rig.char_quat(y=s * 45.0)
    )


def _hermite_eval(times, vals, t, loop):
    """Fritsch-Carlson monotone cubic Hermite interpolation on scalar sequence."""
    n = len(times)
    if n == 1:
        return vals[0]
    if t <= times[0]:
        return vals[0]
    if t >= times[-1]:
        return vals[-1]

    # locate segment i with times[i] <= t <= times[i+1]
    i = 0
    while i < n - 2 and times[i + 1] < t:
        i += 1
    dt = times[i + 1] - times[i]
    if dt <= 1e-8:
        return vals[i]

    # secant slopes
    slopes = [(vals[k + 1] - vals[k]) / max(1e-8, times[k + 1] - times[k]) for k in range(n - 1)]

    def tangent(k):
        if k == 0:
            if loop and n >= 3:
                d0, d1 = slopes[-1], slopes[0]
            else:
                return 0.0
        elif k == n - 1:
            if loop and n >= 3:
                d0, d1 = slopes[-1], slopes[0]
            else:
                return 0.0
        else:
            d0, d1 = slopes[k - 1], slopes[k]
        if d0 * d1 <= 0.0:
            return 0.0
        return 2.0 * d0 * d1 / (d0 + d1)

    m0 = tangent(i)
    m1 = tangent(i + 1)
    u = (t - times[i]) / dt
    u2 = u * u
    u3 = u2 * u
    h00 = 2 * u3 - 3 * u2 + 1
    h10 = u3 - 2 * u2 + u
    h01 = -2 * u3 + 3 * u2
    h11 = u3 - u2
    return h00 * vals[i] + h10 * dt * m0 + h01 * vals[i + 1] + h11 * dt * m1


def _kind(v):
    if isinstance(v, Arm):
        return "arm"
    if isinstance(v, ForeArm):
        return "forearm"
    if isinstance(v, Hand):
        return "hand"
    return "euler"


def _collect_channels(clip):
    """Return dict of active keys ('_hips' or bone name) -> channel kind."""
    channels = {}
    for k, v in clip.base.items():
        channels[k] = _kind(v)
    for _t, pose in clip.keys:
        for k, v in pose.items():
            kind = _kind(v)
            if k in channels and channels[k] != kind:
                raise ValueError(f"{clip.name}: mixed value types on {k}")
            channels[k] = kind
    for layer in clip.layers:
        if layer.bone not in channels:
            channels[layer.bone] = "euler"
    return channels


def evaluate_clip(clip, t):
    """Evaluate pose at continuous time t -> (hips_offset_vec, bone_quats_dict)."""
    channels = _collect_channels(clip)
    times = [k[0] for k in clip.keys]

    vals = {}
    for ch, kind in channels.items():
        if kind == "arm":
            default = Arm(0.0, 5.0, 0.0)
        elif kind == "forearm":
            default = ForeArm()
        elif kind == "hand":
            default = Hand()
        else:
            default = (0.0, 0.0, 0.0)
        base_v = clip.base.get(ch, default)
        seq = [pose.get(ch, base_v) for _t, pose in clip.keys]
        vec = [
            _hermite_eval(times, [v[ax] for v in seq], t, clip.loop)
            for ax in range(3)
        ]
        vals[ch] = vec

    for layer in clip.layers:
        phase = 2.0 * math.pi * layer.cycles * (t / clip.duration) + layer.phase
        vals[layer.bone][layer.axis] += layer.amp * math.sin(phase)

    hips_vec = Vector(vals.get("_hips", (0.0, 0.0, 0.0)))
    quats = {}
    for bname in rig.DEFORM_BONES:
        if bname not in vals:
            quats[bname] = None
            continue
        v = vals[bname]
        kind = channels[bname]
        side = "Left" if bname.startswith("Left") else "Right"
        if kind == "arm":
            quats[bname] = arm_quat(side, v[0], v[1], v[2])
        elif kind == "forearm":
            quats[bname] = forearm_quat(side, v[0], v[1], v[2])
        elif kind == "hand":
            quats[bname] = hand_quat(side, v[0], v[1], v[2])
        else:
            quats[bname] = rig.char_quat(v[0], v[1], v[2])
    return hips_vec, quats


def apply_pose(arm, hips_offset, quats):
    """Apply evaluated pose to armature in Blender."""
    rig.reset_pose(arm)
    # Hips bone local axes: X = +X (left), Y = +Z (up), Z = -Y (forward)
    arm.pose.bones["Hips"].location = Vector((hips_offset.x, hips_offset.z, -hips_offset.y))
    for bname, q in quats.items():
        if q is not None:
            rig.pose(arm, bname, quat=q)


def sample_clip_frames(clip, fps=FPS_AUTHOR):
    """Sample clip at `fps` returning list of (frame_idx, t, hips_offset, quats)."""
    n_steps = round(clip.duration * fps)
    out = []
    for f in range(n_steps + 1):
        t = clip.duration * (f / n_steps)
        hips_offset, quats = evaluate_clip(clip, t)
        out.append((f, t, hips_offset, quats))
    return out


def bake_action(arm, clip):
    """Sample clip at 30 fps for continuity checks, then keyframe at 15 fps into a
    Blender Action + NLA track named `clip.name`."""
    # Evaluate 30 fps first to ensure clean sampling & verify loop closure
    samples_30 = sample_clip_frames(clip, FPS_AUTHOR)
    _, q0 = samples_30[0][2], samples_30[0][3]
    _, qn = samples_30[-1][2], samples_30[-1][3]
    for bname in rig.DEFORM_BONES:
        qa = q0[bname]
        qb = qn[bname]
        if qa is not None and qb is not None:
            deg = math.degrees(qa.rotation_difference(qb).angle)
            if deg > 0.5:
                raise ValueError(f"{clip.name}: bone {bname} loop delta {deg:.2f} deg > 0.5")

    # Bake 15 fps keys (every 2nd sample of 30 fps)
    n15 = round(clip.duration * FPS_EXPORT)
    if abs(n15 / FPS_EXPORT - clip.duration) > 1e-5:
        raise ValueError(f"{clip.name}: duration {clip.duration} must be a multiple of 1/15 s")

    act = bpy.data.actions.new(clip.name)
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act

    for f15 in range(n15 + 1):
        _f30, _t, hips_offset, quats = samples_30[f15 * 2]
        apply_pose(arm, hips_offset, quats)
        pb_hips = arm.pose.bones["Hips"]
        pb_hips.keyframe_insert("location", frame=f15)
        for bname in rig.DEFORM_BONES:
            arm.pose.bones[bname].keyframe_insert("rotation_quaternion", frame=f15)

    tr = arm.animation_data.nla_tracks.new()
    tr.name = clip.name
    strip = tr.strips.new(clip.name, 0, act)
    strip.action_frame_start = 0
    strip.action_frame_end = n15
    arm.animation_data.action = None
    return act
