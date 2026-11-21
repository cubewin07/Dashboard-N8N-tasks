"""Contact sheet renderer for the 6 rigid wardrobe items (`art/out/contact/rigid_items.png`).

Places each rigid item on the built female base body (skin + face quads visible,
COLOR_0 region IDs ignored on body), in 4 views (front, 3/4, side, back),
with hair shifted to a warm brown (`hair_brown` / `hair_brown_hi`).

Usage:
    Blender -b --factory-startup --python-exit-code 1 -P art/blender/render_rigid.py -- \\
        [--in-dir public/assets/models/wardrobe] [--out art/out/contact/rigid_items.png]
"""

from __future__ import annotations

import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import bodyshape, export, palette  # noqa: E402
from lib.render import import_glb, plain_material, studio  # noqa: E402


ITEMS = [
    ("hair_short_01", "hair", None),
    ("hair_bob_01", "hair", None),
    ("hair_long_01", "hair", None),
    ("hair_bun_01", "hair", None),
    ("glasses_round_01", "glasses", "c_black"),
    ("neck_necklace_01", "neck", None),
]

VIEWS = [
    ("FRONT", 0.0),
    ("3/4", -38.0),
    ("SIDE", -90.0),
    ("BACK", 180.0),
]


def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _swatch_linear(key: str) -> Vector:
    hex_str = palette.SWATCHES[key]["hex"].lstrip("#")
    r = _srgb_to_linear(int(hex_str[0:2], 16) / 255.0)
    g = _srgb_to_linear(int(hex_str[2:4], 16) / 255.0)
    b = _srgb_to_linear(int(hex_str[4:6], 16) / 255.0)
    return Vector((r, g, b))


def _make_body_preview_materials(body_ob) -> None:
    """Ensure body renders skin & face clearly while ignoring COLOR_0 region IDs."""
    for mat in body_ob.data.materials:
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
        if not bsdf or not tex:
            continue
        if mat.name.startswith("M_Palette"):
            for link in list(nt.links):
                if link.to_node == bsdf and link.to_socket.name == "Base Color":
                    nt.links.remove(link)
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            tex.interpolation = "Closest"
            bsdf.inputs["Roughness"].default_value = 0.85
            bsdf.inputs["Metallic"].default_value = 0.0
        elif mat.name.startswith("M_Face"):
            tex.interpolation = "Linear"
            for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
                try:
                    setattr(mat, attr, val)
                except Exception:
                    pass


def _trim_body_bust(body_ob, z_cut: float = 1.14) -> None:
    """Drop lower torso/legs below `z_cut` so all 6 rows can zoom onto head, neck, and shoulders."""
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(body_ob.data)
    del_faces = [f for f in bm.faces if max(v.co.z for v in f.verts) < z_cut]
    if del_faces:
        bmesh.ops.delete(bm, geom=del_faces, context="FACES")
    orphan_vs = [v for v in bm.verts if not v.link_faces]
    if orphan_vs:
        bmesh.ops.delete(bm, geom=orphan_vs, context="VERTS")
    bm.to_mesh(body_ob.data)
    bm.free()
    body_ob.data.update()


def _prepare_rigid_preview_mesh(ob, slot: str, tint_key: str | None) -> None:
    """Shift hair UVs to `hair_brown` and bake COLOR_0 shade / tint for faithful preview."""
    me = ob.data
    if slot == "hair" and me.uv_layers:
        uv_layer = me.uv_layers.active.data
        v_lo = 1.0 - 10.0 / 16.0 - 1e-4
        v_hi = 1.0 - 9.0 / 16.0 + 1e-4
        u_hi = 2.0 / 16.0 + 1e-4
        for loop in uv_layer:
            u, v = loop.uv
            if u <= u_hi and v_lo <= v <= v_hi:
                # hair_black (col 0..1) -> hair_brown (col 4..5)
                loop.uv = (u + 4.0 / 16.0, v)

    c_tint = _swatch_linear(tint_key) if tint_key else None
    col_attr = me.color_attributes.active_color or (me.color_attributes[0] if me.color_attributes else None)
    if col_attr is not None:
        for c in col_attr.data:
            r, g, b, a = c.color
            w = r + g + b
            if c_tint is not None and w > 0.01:
                rgb = c_tint * a
                c.color = (rgb.x, rgb.y, rgb.z, 1.0)
            else:
                c.color = (a, a, a, 1.0)

    # Wire TEX_IMAGE * COLOR_0 cleanly in Blender shader
    for mat in me.materials:
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
        if not bsdf or not tex:
            continue
        tex.interpolation = "Closest"
        bsdf.inputs["Roughness"].default_value = 0.85
        bsdf.inputs["Metallic"].default_value = 0.0

        # Ensure COLOR_0 attribute multiplies palette color cleanly
        attr = next((n for n in nt.nodes if n.type == "ATTRIBUTE"), None)
        if attr is None:
            attr = nt.nodes.new("ShaderNodeAttribute")
        attr.attribute_name = col_attr.name if col_attr else "COLOR_0"

        mix = next((n for n in nt.nodes if n.type == "MIX"), None)
        if mix is None:
            mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0

        for link in list(nt.links):
            if link.to_node == bsdf and link.to_socket.name == "Base Color":
                nt.links.remove(link)
        nt.links.new(tex.outputs["Color"], mix.inputs["A"])
        nt.links.new(attr.outputs["Color"], mix.inputs["B"])
        nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])


def _place_label(text: str, x: float, y: float, z: float, size: float = 0.055, align_x: str = "CENTER"):
    cu = bpy.data.curves.new(text, "FONT")
    cu.body = text
    cu.size = size
    cu.align_x = align_x
    ob = bpy.data.objects.new("label_" + text, cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (x, y, z)
    ob.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    cu.materials.append(plain_material("label_mat", (0.08, 0.08, 0.09)))
    return ob


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    in_dir = os.path.join(palette.ROOT, "public", "assets", "models", "wardrobe")
    out_path = os.path.join(palette.ROOT, "art", "out", "contact", "rigid_items.png")
    i = 0
    while i < len(argv):
        if argv[i] == "--in-dir":
            in_dir = os.path.abspath(argv[i + 1])
            i += 2
        elif argv[i] == "--out":
            out_path = os.path.abspath(argv[i + 1])
            i += 2
        else:
            i += 1

    export.clear_scene()
    scene = bpy.context.scene

    # Build one female bust mesh template once (head + shoulders + chest)
    arm_tmpl, body_tmpl, _meta = bodyshape.build_base_body("female")
    _make_body_preview_materials(body_tmpl)
    _trim_body_bust(body_tmpl, z_cut=1.18)
    # Remove template armature modifier so duplicated bust meshes stay light and clean in rest pose
    for mod in list(body_tmpl.modifiers):
        body_tmpl.modifiers.remove(mod)
    body_tmpl.parent = None
    bpy.data.objects.remove(arm_tmpl, do_unlink=True)
    bust_mesh = body_tmpl.data
    bpy.data.objects.remove(body_tmpl, do_unlink=True)

    # Read body crown height for clean row pitch
    z_min_b = min(v.co.z for v in bust_mesh.vertices)
    z_max_b = max(v.co.z for v in bust_mesh.vertices)
    row_pitch = (z_max_b - z_min_b) + 0.16
    col_pitch = 0.64

    for row_idx, (item_id, slot, tint_key) in enumerate(ITEMS):
        glb_path = os.path.join(in_dir, f"{item_id}.glb")
        if not os.path.exists(glb_path):
            raise FileNotFoundError(f"Missing rigid GLB: {glb_path}")

        # Import item template mesh once and prep brown hair / tint material
        root, new_objs = import_glb(glb_path)
        item_meshes = [o for o in [root, *new_objs] if o.type == "MESH"]
        if not item_meshes:
            raise RuntimeError(f"No mesh found in {glb_path}")
        item_mesh = item_meshes[0].data
        _prepare_rigid_preview_mesh(item_meshes[0], slot, tint_key)
        for o in set([root, *new_objs]):
            bpy.data.objects.remove(o, do_unlink=True)

        # Row anchor z (top row first)
        row_z = (len(ITEMS) - 1 - row_idx) * row_pitch - z_min_b
        _place_label(item_id, -0.34, 0.0, row_z + 0.5 * (z_min_b + z_max_b), size=0.055, align_x="RIGHT")

        for col_idx, (_vname, yaw_deg) in enumerate(VIEWS):
            cx = col_idx * col_pitch
            holder = bpy.data.objects.new(f"cell_{item_id}_{col_idx}", None)
            scene.collection.objects.link(holder)
            holder.location = Vector((cx, 0.0, row_z))
            holder.rotation_euler = (0.0, 0.0, math.radians(yaw_deg))

            b_ob = bpy.data.objects.new(f"bust_{item_id}_{col_idx}", bust_mesh)
            scene.collection.objects.link(b_ob)
            b_ob.parent = holder

            i_ob = bpy.data.objects.new(f"item_{item_id}_{col_idx}", item_mesh)
            scene.collection.objects.link(i_ob)
            i_ob.parent = holder

    # Column titles along top
    top_z = (len(ITEMS) - 1) * row_pitch + (z_max_b - z_min_b) + 0.08
    for col_idx, (vname, _yaw) in enumerate(VIEWS):
        _place_label(vname, col_idx * col_pitch, 0.0, top_z, size=0.058, align_x="CENTER")

    # Ortho front camera framing everything cleanly
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    deps = bpy.context.evaluated_depsgraph_get()
    for ob in bpy.data.objects:
        if ob.type in {"MESH", "FONT"}:
            ev = ob.evaluated_get(deps)
            for c in ev.bound_box:
                p = ob.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, p))
                hi = Vector(map(max, hi, p))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.sensor_fit = "HORIZONTAL"
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    centre = 0.5 * (lo + hi)
    cam.location = Vector((centre.x, -30.0, centre.z))
    cam.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    pad_x = 0.14
    pad_z = 0.14
    w_world = (hi.x - lo.x) + 2.0 * pad_x
    h_world = (hi.z - lo.z) + 2.0 * pad_z
    res_x = 1800
    res_y = max(600, int(round(res_x * h_world / w_world)))
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    cam_data.ortho_scale = w_world
    cam_data.clip_end = 100.0

    # Key sun from front-left-above + soft rim fill
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    studio(scene, out_path, sun_rot=(-42, 16, 28))
    bg = next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.86, 0.87, 0.89, 1.0)
    bg.inputs["Strength"].default_value = 0.85

    fill = bpy.data.objects.new("fill_sun", bpy.data.lights.new("fill_sun", "SUN"))
    scene.collection.objects.link(fill)
    fill.data.energy = 1.0
    fill.data.angle = math.radians(22.0)
    fill.rotation_euler = (math.radians(55.0), math.radians(-20.0), math.radians(-145.0))

    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {out_path} ({res_x}x{res_y})")


if __name__ == "__main__":
    main()
