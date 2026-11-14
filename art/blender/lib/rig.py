"""The one shared character skeleton (phase-07a §3.3). FROZEN after P07a: every body,
garment and animation clip depends on these bone names, their order and the rest pose.

Blender space: metres, +Z up, the character faces -Y (glTF: +Y up, faces +Z), its left
side is +X. Rest pose: A-pose, arms 45 degrees down. Neutral height 1.70 m.

    arm = rig.build_armature()            # armature object, bones in BONES order
    rig.pose(arm, "LeftUpLeg", x=-90)     # FK in character axes (see `pose`)
"""
import math

import bpy
from mathutils import Euler, Quaternion, Vector

HEIGHT = 1.70
_D = math.sqrt(0.5)


def _along(p, length):
    """Point `length` further down the 45-degree A-pose arm line (left side)."""
    return (p[0] + _D * length, p[1], p[2] - _D * length)


_ARM = (0.155, 0.0, 1.365)
_ELBOW = _along(_ARM, 0.27)
_WRIST = _along(_ELBOW, 0.25)
_GRIP = _along(_WRIST, 0.08)
_TIP = _along(_GRIP, 0.08)

# (name, parent, head, tail, deform). Left-side bones are mirrored to Right* below.
_CENTRE = [
    ("Root", None, (0, 0, 0), (0, 0, 0.10), False),
    ("Hips", "Root", (0, 0, 0.94), (0, 0, 1.03), True),
    ("Spine", "Hips", (0, 0, 1.03), (0, 0, 1.14), True),
    ("Spine1", "Spine", (0, 0, 1.14), (0, 0, 1.26), True),
    ("Spine2", "Spine1", (0, 0, 1.26), (0, 0, 1.40), True),
    ("Neck", "Spine2", (0, 0, 1.40), (0, 0, 1.48), True),
    ("Head", "Neck", (0, 0, 1.48), (0, 0, 1.70), True),
]
_LEFT = [
    ("LeftShoulder", "Spine2", (0.025, 0, 1.375), _ARM, True),
    ("LeftArm", "LeftShoulder", _ARM, _ELBOW, True),
    ("LeftForeArm", "LeftArm", _ELBOW, _WRIST, True),
    ("LeftHand", "LeftForeArm", _WRIST, _GRIP, True),
    ("LeftHandGrip", "LeftHand", _GRIP, _TIP, True),
    ("LeftUpLeg", "Hips", (0.09, 0, 0.91), (0.09, 0, 0.49), True),
    ("LeftLeg", "LeftUpLeg", (0.09, 0, 0.49), (0.09, 0, 0.08), True),
    ("LeftFoot", "LeftLeg", (0.09, 0, 0.08), (0.09, -0.13, 0.02), True),
    ("LeftToeBase", "LeftFoot", (0.09, -0.13, 0.02), (0.09, -0.21, 0.02), True),
]
_PALM = (0.575, -0.03, 0.945)
# Non-deforming attach bones: all point straight up (+Z) so their rest orientation is identical.
_ATTACH = [
    ("Attach_Head", "Head", (0, 0, 1.60)),
    ("Attach_Neck", "Neck", (0, 0, 1.40)),
    ("Attach_Back", "Spine2", (0, 0.11, 1.30)),
    ("Attach_HandL", "LeftHand", _PALM),
    ("Attach_HandR", "RightHand", (-_PALM[0], _PALM[1], _PALM[2])),
    ("Attach_WristL", "LeftForeArm", (_WRIST[0] - 0.01, 0, _WRIST[2] + 0.01)),
]


def _mirror(p):
    return (-p[0], p[1], p[2])


def _bones():
    out = list(_CENTRE)
    for side, flip in (("Left", False), ("Right", True)):
        for name, parent, head, tail, deform in _LEFT:
            n = name if not flip else name.replace("Left", "Right")
            par = parent if not flip else parent.replace("Left", "Right")
            out.append((n, par, _mirror(head) if flip else head, _mirror(tail) if flip else tail, deform))
    for name, parent, head in _ATTACH:
        out.append((name, parent, head, (head[0], head[1], head[2] + 0.05), False))
    return out


BONES = _bones()
BONE_NAMES = [b[0] for b in BONES]
DEFORM_BONES = [b[0] for b in BONES if b[4]]
ATTACH_BONES = [a[0] for a in _ATTACH]
JOINT = {b[0]: Vector(b[2]) for b in BONES}      # rest head position of each bone
TAIL = {b[0]: Vector(b[3]) for b in BONES}
SHAPE_KEYS = ["Heavy", "Slim", "Muscle", "Chest", "Hips", "Shoulders"]  # order is frozen too


def build_armature(name="Armature"):
    """Create the armature (rest pose) and return the object. Bone order == BONES."""
    data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, parent, head, tail, deform in BONES:
        eb = data.edit_bones.new(bname)
        eb.head, eb.tail = Vector(head), Vector(tail)
        eb.roll = 0.0
        eb.use_deform = deform
        if parent:
            eb.parent = data.edit_bones[parent]
            eb.use_connect = False
    # deterministic roll: bone Z as close as possible to character forward (-Y), or +Z for
    # bones that themselves point along Y
    for eb in data.edit_bones:
        d = (eb.tail - eb.head).normalized()
        eb.align_roll(Vector((0, 0, 1)) if abs(d.y) > 0.9 else Vector((0, -1, 0)))
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm


def char_quat(x=0.0, y=0.0, z=0.0):
    """Rotation in CHARACTER axes, degrees, applied X then Y then Z (extrinsic):
    Axes are Blender's: X = character left, -Y = forward, Z = up. Verified examples:
    Spine x=30 bows forward; LeftUpLeg x=-90 lifts the thigh forward (sitting), then
    LeftLeg x=90 hangs the shin down; LeftArm y=45 drops the left arm to the side
    (RightArm y=-45); Head z=45 turns the head to the character's left."""
    return Euler((math.radians(x), math.radians(y), math.radians(z)), "XYZ").to_quaternion()


def pose(arm, bone, x=0.0, y=0.0, z=0.0, quat=None):
    """FK: rotate `bone` by a character-space rotation relative to its (already posed)
    parent. The rotation is expressed in rest-pose character axes carried by the parent,
    so `pose(arm, 'LeftUpLeg', x=-90)` lifts the thigh forward whatever the hips do."""
    pb = arm.pose.bones[bone]
    q = quat if quat is not None else char_quat(x, y, z)
    rest = pb.bone.matrix_local.to_quaternion()
    par = pb.bone.parent.matrix_local.to_quaternion() if pb.bone.parent else Quaternion()
    # rest-local offset of the bone inside its parent, then the wanted character rotation
    local_rest = par.inverted() @ rest
    pb.rotation_quaternion = local_rest.inverted() @ (par.inverted() @ q @ par) @ local_rest
    return pb


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector((0, 0, 0))
        pb.scale = Vector((1, 1, 1))
