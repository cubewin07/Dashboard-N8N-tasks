"""Reusable character contact-sheet renderer (P07a).

Renders:
  (a) 14 extreme shape-key combos (Neutral, 6 single keys at 1.0, 7 pairs)
  (b) 5 test poses (sit, arms_up, arms_down, deep_bend, walk_stride) in front & 3/4 view

Supports an optional comma-separated list of garment/accessory GLBs (`--garments`)
that are imported and bound/parented to each character instance so wardrobe items
can be inspected on all body shapes and poses too.

    Blender -b --factory-startup --python-exit-code 1 -P art/blender/render_contact.py -- \
        --body art/.cache/raw/characters/body_female.glb \
        [--garments a.glb,b.glb] \
        [--out-dir art/out/contact] \
        [--prefix body_female]
"""
import colorsys
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import palette, rig  # noqa: E402
from lib.export import clear_scene  # noqa: E402
from lib.render import checker_floor, import_glb, plain_material, studio  # noqa: E402

SHAPE_COMBOS = [
    ("Neutral", {}),
    ("Heavy", {"Heavy": 1.0}),
    ("Slim", {"Slim": 1.0}),
    ("Muscle", {"Muscle": 1.0}),
    ("Chest", {"Chest": 1.0}),
    ("Hips", {"Hips": 1.0}),
    ("Shoulders", {"Shoulders": 1.0}),
    ("Heavy+Chest", {"Heavy": 1.0, "Chest": 1.0}),
    ("Heavy+Hips", {"Heavy": 1.0, "Hips": 1.0}),
    ("Slim+Shoulders", {"Slim": 1.0, "Shoulders": 1.0}),
    ("Slim+Hips", {"Slim": 1.0, "Hips": 1.0}),
    ("Muscle+Shoulders", {"Muscle": 1.0, "Shoulders": 1.0}),
    ("Muscle+Chest", {"Muscle": 1.0, "Chest": 1.0}),
    ("Heavy+Muscle", {"Heavy": 1.0, "Muscle": 1.0}),
]


def _pose_sit(arm):
    rig.pose(arm, "LeftUpLeg", x=-90)
    rig.pose(arm, "RightUpLeg", x=-90)
    rig.pose(arm, "LeftLeg", x=90)
    rig.pose(arm, "RightLeg", x=90)
    rig.pose(arm, "LeftArm", y=35, x=-20)
    rig.pose(arm, "RightArm", y=-35, x=-20)
    rig.pose(arm, "LeftForeArm", x=-45)
    rig.pose(arm, "RightForeArm", x=-45)
    # Hips bone points +Z (local +Y = world +Z), so -0.41 in local Y drops world Z by 0.41 m
    arm.pose.bones["Hips"].location = Vector((0.0, -0.41, 0.0))


def _pose_arms_up(arm):
    rig.pose(arm, "LeftArm", y=-110)
    rig.pose(arm, "RightArm", y=110)
    rig.pose(arm, "LeftForeArm", y=-15)
    rig.pose(arm, "RightForeArm", y=15)


def _pose_arms_down(arm):
    rig.pose(arm, "LeftArm", y=35)
    rig.pose(arm, "RightArm", y=-35)


def _pose_deep_bend(arm):
    rig.pose(arm, "Spine", x=20)
    rig.pose(arm, "Spine1", x=20)
    rig.pose(arm, "Spine2", x=20)
    rig.pose(arm, "LeftArm", y=35, x=-35)
    rig.pose(arm, "RightArm", y=-35, x=-35)


def _pose_walk_stride(arm):
    rig.pose(arm, "LeftUpLeg", x=-32)
    rig.pose(arm, "LeftLeg", x=12)
    rig.pose(arm, "RightUpLeg", x=28)
    rig.pose(arm, "RightLeg", x=25)
    rig.pose(arm, "LeftArm", y=36, x=28)
    rig.pose(arm, "RightArm", y=-36, x=-28)
    rig.pose(arm, "LeftForeArm", x=-15)
    rig.pose(arm, "RightForeArm", x=-25)
    rig.pose(arm, "Spine", z=-6)
    rig.pose(arm, "Spine2", z=10)


TEST_POSES = [
    ("sit", _pose_sit),
    ("arms_up", _pose_arms_up),
    ("arms_down", _pose_arms_down),
    ("deep_bend", _pose_deep_bend),
    ("walk_stride", _pose_walk_stride),
]


def _find_armature(root, objs):
    for ob in [root, *objs]:
        if ob.type == "ARMATURE":
            return ob
    return None


def _find_meshes(root, objs):
    return [ob for ob in [root, *objs] if ob.type == "MESH"]


def _remap_skin_uv(me, target_swatch="skin_03"):
    """Retarget preview skin UVs from skin_01/skin_01_shadow to a readable preview swatch (skin_03)."""
    uv_layer = me.uv_layers.active
    if not uv_layer:
        return
    u_s1, v_s1 = palette.uv("skin_01")
    u_s1s, v_s1s = palette.uv("skin_01_shadow")
    u_dst, v_dst = palette.uv(target_swatch)
    for poly in me.polygons:
        mat = me.materials[poly.material_index] if poly.material_index < len(me.materials) else None
        if not mat or not mat.name.startswith("M_Palette"):
            continue
        li0 = poly.loop_indices[0]
        u, v = uv_layer.data[li0].uv
        is_skin = (abs(u - u_s1) < 0.02 and abs(v - v_s1) < 0.02) or (
            abs(u - u_s1s) < 0.02 and abs(v - v_s1s) < 0.02
        )
        if is_skin:
            for li in poly.loop_indices:
                uv_layer.data[li].uv = (u_dst, v_dst)


def _fix_body_materials(meshes, skin_swatch="skin_03"):
    """Strip glTF importer's COLOR_0 multiplier on body materials (body COLOR_0 holds
    region_id/255, not tint), remap skin UVs to readable preview swatch, and fix M_Face."""
    for ob in meshes:
        if skin_swatch:
            _remap_skin_uv(ob.data, skin_swatch)
        for mat in ob.data.materials:
            if not mat or not mat.use_nodes:
                continue
            nt = mat.node_tree
            bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
            if not bsdf or not tex:
                continue
            if mat.name.startswith("M_Palette"):
                # Replace any Multiply(tex, COLOR_0) with direct tex -> Base Color
                for link in list(nt.links):
                    if link.to_node == bsdf and link.to_socket.name == "Base Color":
                        nt.links.remove(link)
                nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
                tex.interpolation = "Closest"
                if "Roughness" in bsdf.inputs:
                    bsdf.inputs["Roughness"].default_value = 0.85
                if "Specular IOR Level" in bsdf.inputs:
                    bsdf.inputs["Specular IOR Level"].default_value = 0.15
            elif mat.name.startswith("M_Face"):
                for link in list(nt.links):
                    if link.to_node == bsdf and link.to_socket.name in ("Base Color", "Alpha"):
                        nt.links.remove(link)
                nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
                nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
                for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
                    try:
                        setattr(mat, attr, val)
                    except Exception:
                        pass


def _apply_region_tint_materials(meshes):
    """Replace M_Palette faces with 23 distinct flat colours keyed from COLOR_0.R (region_id/255)."""
    reg_mats = []
    for rid in range(23):
        hue = (rid * 0.61803398875) % 1.0
        sat = 0.82 if (rid % 3 != 2) else 0.58
        val = 0.90 if (rid % 2 == 0) else 0.68
        r, g, b = colorsys.hsv_to_rgb(hue, sat, val)
        reg_mats.append(plain_material(f"Region_{rid:02d}", (r, g, b)))

    for ob in meshes:
        me = ob.data
        col_attr = me.color_attributes.get("COLOR_0") or (me.color_attributes[0] if me.color_attributes else None)
        if not col_attr:
            continue
        face_slot = next((idx for idx, m in enumerate(me.materials) if m and m.name.startswith("M_Face")), None)
        # Collect per-face region ID before replacing material slots
        poly_rids = []
        for poly in me.polygons:
            if face_slot is not None and poly.material_index == face_slot:
                poly_rids.append(-1)
                continue
            rids = []
            for li in poly.loop_indices:
                idx = li if col_attr.domain == "CORNER" else me.loops[li].vertex_index
                rids.append(int(round(col_attr.data[idx].color[0] * 255.0)))
            # Use lowest vertex region ID on crossing rings so region boundaries stay flat and straight
            rid = min(rids)
            poly_rids.append(max(0, min(22, rid)))

        old_face_mat = me.materials[face_slot] if face_slot is not None else None
        me.materials.clear()
        for rm in reg_mats:
            me.materials.append(rm)
        new_face_idx = 0
        if old_face_mat:
            me.materials.append(old_face_mat)
            new_face_idx = len(me.materials) - 1
        for poly, rid in zip(me.polygons, poly_rids):
            poly.material_index = new_face_idx if rid < 0 else rid


def _import_character(body_path, garment_paths, region_tint=False):
    """Import body + optional garments, returning (root, arm, meshes)."""
    root, new_objs = import_glb(body_path)
    arm = _find_armature(root, new_objs)
    meshes = _find_meshes(root, new_objs)
    _fix_body_materials(meshes, skin_swatch="skin_03")
    if region_tint:
        _apply_region_tint_materials(meshes)
    if arm:
        for pb in arm.pose.bones:
            pb.rotation_mode = "QUATERNION"

    for gp in garment_paths:
        g_root, g_objs = import_glb(gp)
        g_arm = _find_armature(g_root, g_objs)
        g_meshes = _find_meshes(g_root, g_objs)
        for gm in g_meshes:
            # Re-bind skinned garment to body's armature, or parent rigid to Attach_Head
            mod = next((m for m in gm.modifiers if m.type == "ARMATURE"), None)
            if mod and arm:
                gm.parent = arm
                mod.object = arm
            elif arm:
                # rigid accessory in rest-pose character space
                gm.parent = arm
            meshes.append(gm)
        if g_arm and g_arm != arm:
            bpy.data.objects.remove(g_arm, do_unlink=True)
        if g_root != g_arm and g_root not in g_meshes:
            bpy.data.objects.remove(g_root, do_unlink=True)
    return root, arm, meshes


def _apply_shape_combo(meshes, weights):
    for me_ob in meshes:
        sk = me_ob.data.shape_keys
        if not sk:
            continue
        for kb in sk.key_blocks:
            if kb.name == "Basis":
                continue
            kb.value = float(weights.get(kb.name, 0.0))


def _place_label(text, cx, fy, fz=0.005, size=0.075, flat=True):
    cu = bpy.data.curves.new(text, "FONT")
    cu.body = text
    cu.size = size
    cu.align_x = "CENTER"
    ob = bpy.data.objects.new("label_" + text, cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (cx, fy, fz)
    ob.rotation_euler = (0, 0, 0) if flat else (math.radians(90), 0, 0)
    cu.materials.append(plain_material("label", (0.04, 0.04, 0.04)))
    return ob


def _render_ortho(scene, out_path, az_deg, el_deg, width=1800):
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in bpy.data.objects:
        if ob.type in {"MESH", "FONT"}:
            # Use evaluated mesh bounds for posed/shape-keyed meshes
            depsgraph = bpy.context.evaluated_depsgraph_get()
            ev = ob.evaluated_get(depsgraph)
            for c in ev.bound_box:
                p = ob.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, p))
                hi = Vector(map(max, hi, p))

    checker_floor(lo, hi, margin=0.8)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    # Front of character is -Y in Blender; az=0 looks from -Y toward +Y
    az, el = math.radians(az_deg), math.radians(el_deg)
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    centre = (lo + hi) / 2
    cam.location = centre + direction * 40.0
    cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()

    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for cx in (lo.x, hi.x):
        for cy in (lo.y, hi.y):
            for cz in (min(0.0, lo.z), hi.z):
                p = inv @ Vector((cx, cy, cz))
                xs.append(p.x)
                ys.append(p.y)
    wv = max(xs) - min(xs) + 0.35
    hv = max(ys) - min(ys) + 0.35
    cam.location += cam.matrix_world.to_3x3() @ Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, 0.0))
    scene.render.resolution_x = width
    scene.render.resolution_y = max(360, int(width * hv / wv))
    cam_data.ortho_scale = max(wv, hv * width / scene.render.resolution_y)
    cam_data.clip_end = 150.0

    # Sun shining from front-left-above (-Y, +X, +Z)
    studio(scene, out_path, sun_rot=(-52, 18, 28))
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {out_path} ({scene.render.resolution_x}x{scene.render.resolution_y})")


def render_shapes(body_path, garment_paths, out_dir, prefix):
    # Front view: 2 vertical tiers (top row = combos 0..6, bottom row = combos 7..13)
    clear_scene()
    scene = bpy.context.scene
    cols = 7
    dx = 1.25
    for idx, (label, weights) in enumerate(SHAPE_COMBOS):
        row = idx // cols
        col = idx % cols
        root, _arm, meshes = _import_character(body_path, garment_paths)
        _apply_shape_combo(meshes, weights)
        px = (col - (cols - 1) / 2.0) * dx
        pz = (1 - row) * 2.15
        root.location = Vector((px, 0.0, pz))
        _place_label(label, px, -0.05, fz=pz - 0.14, size=0.095, flat=False)
    _render_ortho(scene, os.path.join(out_dir, f"{prefix}_shapes_front.png"), 0.0, 2.0, width=1800)

    # 3/4 view: 2 rows on checker floor with generous spacing
    clear_scene()
    scene = bpy.context.scene
    dy = 1.25
    for idx, (label, weights) in enumerate(SHAPE_COMBOS):
        row = idx // cols
        col = idx % cols
        root, _arm, meshes = _import_character(body_path, garment_paths)
        _apply_shape_combo(meshes, weights)
        px = (col - (cols - 1) / 2.0) * dx
        py = row * dy
        root.location = Vector((px, py, 0.0))
        _place_label(label, px, py - 0.36, fz=0.005, size=0.085, flat=True)
    _render_ortho(scene, os.path.join(out_dir, f"{prefix}_shapes_3q.png"), 28.0, 22.0, width=1800)


def render_poses(body_path, garment_paths, out_dir, prefix):
    for tag, az, el in (("poses_front", 0.0, 6.0), ("poses_3q", 35.0, 20.0)):
        clear_scene()
        scene = bpy.context.scene
        dx = 1.15
        n = len(TEST_POSES)
        for idx, (label, pose_fn) in enumerate(TEST_POSES):
            root, arm, _meshes = _import_character(body_path, garment_paths)
            if arm:
                pose_fn(arm)
            px = (idx - (n - 1) / 2.0) * dx
            root.location = Vector((px, 0.0, 0.0))
            _place_label(label, px, -0.45, fz=0.005, size=0.08, flat=True)
        out_path = os.path.join(out_dir, f"{prefix}_{tag}.png")
        _render_ortho(scene, out_path, az, el, width=1600)


def render_regions(body_path, garment_paths, out_dir, prefix):
    """Render Neutral body tinted by the 23 COLOR_0 region IDs from 4 angles."""
    clear_scene()
    scene = bpy.context.scene
    views = [
        ("Front (23 regions)", 0.0),
        ("3/4 Front", -36.0),
        ("Left Side", -90.0),
        ("Back", 180.0),
    ]
    dx = 1.25
    for idx, (label, yaw_deg) in enumerate(views):
        root, _arm, _meshes = _import_character(body_path, garment_paths, region_tint=True)
        px = (idx - (len(views) - 1) / 2.0) * dx
        root.location = Vector((px, 0.0, 0.0))
        root.rotation_mode = "XYZ"
        root.rotation_euler = Euler((0.0, 0.0, math.radians(yaw_deg)), "XYZ")
        _place_label(label, px, -0.45, fz=0.005, size=0.075, flat=True)
    out_path = os.path.join(out_dir, f"{prefix}_regions.png")
    _render_ortho(scene, out_path, 0.0, 12.0, width=1600)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    body_path = None
    garment_paths = []
    out_dir = os.path.abspath("art/out/contact")
    prefix = None
    mode = "all"

    i = 0
    while i < len(argv):
        if argv[i] == "--body":
            body_path = os.path.abspath(argv[i + 1]); i += 2
        elif argv[i] == "--garments":
            garment_paths = [os.path.abspath(p) for p in argv[i + 1].split(",") if p]; i += 2
        elif argv[i] == "--out-dir":
            out_dir = os.path.abspath(argv[i + 1]); i += 2
        elif argv[i] == "--prefix":
            prefix = argv[i + 1]; i += 2
        elif argv[i] == "--mode":
            mode = argv[i + 1]; i += 2
        else:
            i += 1

    if not body_path:
        raise SystemExit("usage: render_contact.py --body <path.glb> [--garments a,b] [--out-dir dir] [--prefix name]")
    if not prefix:
        prefix = os.path.splitext(os.path.basename(body_path))[0]

    os.makedirs(out_dir, exist_ok=True)
    if mode in ("all", "shapes"):
        render_shapes(body_path, garment_paths, out_dir, prefix)
    if mode in ("all", "poses"):
        render_poses(body_path, garment_paths, out_dir, prefix)
    if mode in ("all", "regions"):
        render_regions(body_path, garment_paths, out_dir, prefix)


if __name__ == "__main__":
    main()
