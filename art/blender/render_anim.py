"""Visual QA strip renderer for the animation library (P07a-T06).

Imports `public/assets/anim/library.glb`, builds a proportioned low-poly proxy
body skinned to the imported armature, and renders a 7-frame 3/4 strip for each
clip into `art/out/contact/anim_<clip>.png` with floor + reference seat/desk/bed
boxes.

Usage:
  Blender -b --factory-startup --python-exit-code 1 -P art/blender/render_anim.py -- \
    [--glb public/assets/anim/library.glb] [--out art/out/contact] [--only walk,sit_type]
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import palette  # noqa: E402
from lib.export import clear_scene  # noqa: E402
from lib.render import checker_floor, plain_material, studio  # noqa: E402

N_FRAMES = 7
SEATED_CLIPS = {"sit_idle", "sit_type", "sit_read", "sit_phone", "sofa_sit", "sleep_desk"}
DESK_CLIPS = {"sit_type", "sleep_desk"}
BED_CLIPS = {"sleep_bed"}


def _add_box(bm, vgroups, bone_name, center, size, sw):
    uvl = bm.loops.layers.uv.verify()
    dlayer = bm.verts.layers.deform.verify()
    gi = vgroups[bone_name]
    tb = bmesh.new()
    bmesh.ops.create_cube(tb, size=1.0)
    bmesh.ops.scale(tb, vec=size, verts=tb.verts[:])
    bmesh.ops.translate(tb, vec=center, verts=tb.verts[:])
    u, v = palette.uv(sw)
    vmap = {}
    for tv in tb.verts:
        nv = bm.verts.new(tv.co)
        nv[dlayer][gi] = 1.0
        vmap[tv] = nv
    for tf in tb.faces:
        nf = bm.faces.new([vmap[tv] for tv in tf.verts])
        nf.smooth = False
        for loop in nf.loops:
            loop[uvl].uv = (u, v)
    tb.free()


def _add_seg(bm, vgroups, bone, width, depth, sw, extend_head=0.0, extend_tail=0.0):
    head = bone.head_local.copy()
    tail = bone.tail_local.copy()
    d = tail - head
    length = d.length
    if length < 1e-5:
        return
    u_dir = d.normalized()
    # local frame: y along bone, x perpendicular
    ref = Vector((0, -1, 0)) if abs(u_dir.y) < 0.9 else Vector((0, 0, 1))
    x_dir = u_dir.cross(ref).normalized()
    z_dir = x_dir.cross(u_dir).normalized()
    rot = Matrix((x_dir, u_dir, z_dir)).transposed().to_4x4()

    total_len = length + extend_head + extend_tail
    mid = head + u_dir * ((length + extend_tail - extend_head) * 0.5)

    uvl = bm.loops.layers.uv.verify()
    dlayer = bm.verts.layers.deform.verify()
    gi = vgroups[bone.name]
    tb = bmesh.new()
    bmesh.ops.create_cube(tb, size=1.0)
    bmesh.ops.scale(tb, vec=(width, total_len, depth), verts=tb.verts[:])
    bmesh.ops.transform(tb, matrix=Matrix.Translation(mid) @ rot, verts=tb.verts[:])
    u, v = palette.uv(sw)
    vmap = {}
    for tv in tb.verts:
        nv = bm.verts.new(tv.co)
        nv[dlayer][gi] = 1.0
        vmap[tv] = nv
    for tf in tb.faces:
        nf = bm.faces.new([vmap[tv] for tv in tf.verts])
        nf.smooth = False
        for loop in nf.loops:
            loop[uvl].uv = (u, v)
    tb.free()


def build_proxy_body(arm):
    """Create a proportioned low-poly proxy mesh skinned to `arm`."""
    me = bpy.data.meshes.new("ProxyBody")
    ob = bpy.data.objects.new("ProxyBody", me)
    bpy.context.scene.collection.objects.link(ob)

    vgroups = {}
    for b in arm.data.bones:
        vg = ob.vertex_groups.new(name=b.name)
        vgroups[b.name] = vg.index

    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")
    bm.verts.layers.deform.new()

    bones = arm.data.bones
    # Pelvis: bottom at z=0.87 (0.07 m below Hips head 0.94 -> 0.45 m when seated)
    _add_box(bm, vgroups, "Hips", (0.0, 0.0, 0.95), (0.27, 0.16, 0.16), "c_denim_d")
    # Torso segments (back at y=+0.08 -> mattress at z=0.40 when Hips at z=0.48)
    _add_box(bm, vgroups, "Spine", (0.0, 0.0, 1.085), (0.25, 0.16, 0.115), "jade_500")
    _add_box(bm, vgroups, "Spine1", (0.0, 0.0, 1.20), (0.28, 0.165, 0.125), "jade_500")
    _add_box(bm, vgroups, "Spine2", (0.0, 0.0, 1.33), (0.31, 0.17, 0.145), "jade_500")
    _add_seg(bm, vgroups, bones["Neck"], 0.085, 0.085, "skin_02", extend_head=0.01)

    # Head with unmistakable front face (-Y) visor/eyes + nose + hair cap
    _add_box(bm, vgroups, "Head", (0.0, 0.0, 1.585), (0.17, 0.18, 0.20), "skin_02")
    _add_box(bm, vgroups, "Head", (0.0, 0.005, 1.692), (0.18, 0.19, 0.05), "hair_brown_dark")
    _add_box(bm, vgroups, "Head", (0.0, -0.092, 1.60), (0.12, 0.012, 0.028), "n_14")
    _add_box(bm, vgroups, "Head", (0.0, -0.098, 1.565), (0.025, 0.02, 0.03), "skin_02_shadow")

    # Arms
    for side in ("Left", "Right"):
        _add_seg(bm, vgroups, bones[f"{side}Arm"], 0.08, 0.08, "jade_500", extend_head=0.01)
        _add_seg(bm, vgroups, bones[f"{side}ForeArm"], 0.068, 0.068, "skin_02")
        _add_seg(bm, vgroups, bones[f"{side}Hand"], 0.055, 0.036, "skin_02", extend_tail=0.05)

    # Legs + Shoes (shoe bottom sits cleanly at z = 0.000)
    for side in ("Left", "Right"):
        sx = 0.09 if side == "Left" else -0.09
        _add_seg(bm, vgroups, bones[f"{side}UpLeg"], 0.115, 0.115, "c_denim_d", extend_head=0.02)
        _add_seg(bm, vgroups, bones[f"{side}Leg"], 0.09, 0.09, "c_denim_d")
        _add_box(bm, vgroups, f"{side}Foot", (sx, -0.045, 0.042), (0.09, 0.15, 0.075), "n_13")
        _add_box(bm, vgroups, f"{side}ToeBase", (sx, -0.155, 0.025), (0.088, 0.09, 0.046), "n_13")
        _add_box(bm, vgroups, f"{side}Foot", (sx, -0.045, 0.006), (0.092, 0.152, 0.012), "c_white")
        _add_box(bm, vgroups, f"{side}ToeBase", (sx, -0.155, 0.006), (0.09, 0.092, 0.012), "c_white")

    bm.to_mesh(me)
    bm.free()
    me.materials.append(palette.material("palette"))

    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    ob.parent = arm
    return ob


def _prop_box(name, loc, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    ob.data.materials.append(mat)
    return ob


def _render_clip(glb_path, clip_name, out_path):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=glb_path)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for ob in list(bpy.data.objects):
        if ob != arm:
            bpy.data.objects.remove(ob, do_unlink=True)

    proxy = build_proxy_body(arm)
    act = bpy.data.actions[clip_name]
    arm.animation_data.action = act
    if hasattr(arm.animation_data, "action_slot") and act.slots:
        arm.animation_data.action_slot = act.slots[0]

    f0, f1 = act.frame_range
    spacing = 1.25 if clip_name in BED_CLIPS else 1.05
    scene = bpy.context.scene

    seat_mat = plain_material("qa_seat", (0.76, 0.56, 0.34))
    desk_mat = plain_material("qa_desk", (0.64, 0.67, 0.72))
    bed_mat = plain_material("qa_bed", (0.58, 0.72, 0.68))
    arcade_mat = plain_material("qa_arcade", (0.45, 0.42, 0.62))
    label_mat = plain_material("qa_label", (0.06, 0.06, 0.06))

    depsgraph = bpy.context.evaluated_depsgraph_get()
    frozen = []
    for k in range(N_FRAMES):
        frac = k / (N_FRAMES - 1)
        f = f0 + (f1 - f0) * frac
        fi = int(math.floor(f))
        scene.frame_set(fi, subframe=f - fi)
        depsgraph.update()

        ev = proxy.evaluated_get(depsgraph)
        fmesh = bpy.data.meshes.new_from_object(ev)
        fob = bpy.data.objects.new(f"pose_{k}", fmesh)
        scene.collection.objects.link(fob)
        px = k * spacing
        fob.location = (px, 0.0, 0.0)
        frozen.append(fob)

        if clip_name in SEATED_CLIPS:
            sh = 0.42 if clip_name == "sofa_sit" else 0.45
            _prop_box(f"seat_{k}", (px, 0.02, sh * 0.5), (0.44, 0.44, sh), seat_mat)
        if clip_name in DESK_CLIPS:
            # 0.74 m desk tabletop (near edge at y = -0.30) with open legs so limbs remain visible
            _prop_box(f"desk_top_{k}", (px, -0.55, 0.72), (0.76, 0.50, 0.04), desk_mat)
            for sx in (-0.35, 0.35):
                _prop_box(f"desk_leg_{k}_{sx}", (px + sx, -0.76, 0.35), (0.04, 0.04, 0.70), desk_mat)
        if clip_name in BED_CLIPS:
            _prop_box(f"bed_{k}", (px, 0.0, 0.20), (0.95, 2.00, 0.40), bed_mat)
        if clip_name == "arcade":
            _prop_box(f"arc_{k}", (px, -0.52, 0.96), (0.60, 0.32, 0.04), arcade_mat)

        cu = bpy.data.curves.new(f"t_{k}", "FONT")
        cu.body = f"{(f / scene.render.fps):.2f}s"
        cu.size = 0.11
        cu.align_x = "CENTER"
        lob = bpy.data.objects.new(f"lbl_{k}", cu)
        scene.collection.objects.link(lob)
        ly = -1.18 if clip_name in BED_CLIPS else (-0.95 if clip_name in DESK_CLIPS else (-0.82 if clip_name in SEATED_CLIPS else -0.62))
        lob.location = (px, ly, 0.004)
        cu.materials.append(label_mat)

    # Remove live rig + proxy so only frozen strip frames are rendered
    bpy.data.objects.remove(proxy, do_unlink=True)
    bpy.data.objects.remove(arm, do_unlink=True)

    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in bpy.data.objects:
        if ob.type in {"MESH", "FONT"}:
            for c in ob.bound_box:
                p = ob.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, p))
                hi = Vector(map(max, hi, p))

    checker_floor(lo, hi, margin=0.8)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    # 3/4 view from front-right (-X, -Y, +Z) so front, right hand, and depth are all clear
    az, el = math.radians(24), math.radians(22)
    direction = Vector((-math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    centre = (lo + hi) / 2
    cam.location = centre + direction * 50.0
    cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()

    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for cx in (lo.x, hi.x):
        for cy in (lo.y, hi.y):
            for cz in (0.0, hi.z):
                p = inv @ Vector((cx, cy, cz))
                xs.append(p.x)
                ys.append(p.y)
    wv, hv = max(xs) - min(xs) + 0.35, max(ys) - min(ys) + 0.35
    cam.location += cam.matrix_world.to_3x3() @ Vector(((max(xs) + min(xs)) * 0.5, (max(ys) + min(ys)) * 0.5, 0.0))

    scene.render.resolution_x = 1960
    scene.render.resolution_y = max(320, int(1960 * hv / wv))
    cam_data.ortho_scale = max(wv, hv)
    cam_data.clip_end = 200.0

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    studio(scene, out_path, sun_rot=(50, 18, -25))
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {clip_name} -> {out_path} ({scene.render.resolution_x}x{scene.render.resolution_y})")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    glb_path = os.path.join(root, "public", "assets", "anim", "library.glb")
    out_dir = os.path.join(root, "art", "out", "contact")
    only = None
    i = 0
    while i < len(argv):
        if argv[i] == "--glb":
            glb_path = os.path.abspath(argv[i + 1])
            i += 2
        elif argv[i] == "--out":
            out_dir = os.path.abspath(argv[i + 1])
            i += 2
        elif argv[i] == "--only":
            only = set(argv[i + 1].split(","))
            i += 2
        else:
            i += 1

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=glb_path)
    clip_names = [a.name for a in bpy.data.actions]
    if only:
        clip_names = [n for n in clip_names if n in only]

    for name in clip_names:
        _render_clip(glb_path, name, os.path.join(out_dir, f"anim_{name}.png"))


if __name__ == "__main__":
    main()
