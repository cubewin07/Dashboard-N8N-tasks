"""Render the 6 mandatory wardrobe visual-review contact sheets (P07a-T08 / T09).

For each base (``female``, ``male``), renders into ``art/out/contact/``:
  1. ``wardrobe_<base>_outfits.png``  - 6+ outfits in A-pose, 3/4 front & 3/4 back
  2. ``wardrobe_<base>_poses.png``    - 2 outfits in sit, arms_up, deep_bend, walk_stride
  3. ``wardrobe_<base>_extremes.png`` - 1 outfit at Heavy .8, Slim .6, Muscle .8, Chest 1, Hips 1, Shoulders 1

Uses real palette colours (skin_03 body, catalog default tint swatches multiplied by
COLOR_0 mask & shade) and removes body triangles matching worn items' ``hideRegions``.
"""

from __future__ import annotations

import json
import math
import sys
import tempfile
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from lib import bodyshape, charexport, export, render as render_lib, rig

REPO_ROOT = _HERE.parent.parent
WARDROBE_DIR = REPO_ROOT / "public/assets/models/wardrobe"
CATALOG_DIR = REPO_ROOT / "src/content/catalog"
PALETTE_JSON = REPO_ROOT / "src/content/palette3d.json"
FACE_ATLAS_PNG = REPO_ROOT / "public/assets/textures/face_atlas.png"
CONTACT_DIR = REPO_ROOT / "art/out/contact"

EXTREME_COMBOS: list[tuple[str, dict[str, float]]] = [
    ("Heavy 0.8", {"Heavy": 0.8}),
    ("Slim 0.6", {"Slim": 0.6}),
    ("Muscle 0.8", {"Muscle": 0.8}),
    ("Chest 1.0", {"Chest": 1.0}),
    ("Hips 1.0", {"Hips": 1.0}),
    ("Shoulders 1.0", {"Shoulders": 1.0}),
]


def _srgb_hex_to_linear(hex_str: str) -> tuple[float, float, float, float]:
    h = hex_str.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))

    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(r), lin(g), lin(b), 1.0)


def _load_swatches() -> dict[str, tuple[float, float, float, float]]:
    raw = json.loads(PALETTE_JSON.read_text(encoding="utf-8"))
    swatches: dict[str, tuple[float, float, float, float]] = {}
    items = raw.get("swatches", raw)
    if isinstance(items, dict):
        for k, v in items.items():
            if isinstance(v, dict) and "hex" in v:
                swatches[k] = _srgb_hex_to_linear(v["hex"])
            elif isinstance(v, str):
                swatches[k] = _srgb_hex_to_linear(v)
    elif isinstance(items, list):
        for entry in items:
            if isinstance(entry, dict) and "key" in entry and "hex" in entry:
                swatches[entry["key"]] = _srgb_hex_to_linear(entry["hex"])
    return swatches


def _load_catalog_defaults() -> dict[str, dict[str, str]]:
    defaults: dict[str, dict[str, str]] = {}
    for p in sorted(CATALOG_DIR.glob("*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        for item in data.get("items", []) or []:
            iid = item.get("id")
            tint = item.get("tint") or {}
            d = tint.get("defaults")
            if iid and isinstance(d, dict):
                defaults[iid] = d
    return defaults


def _find_node(nodes: bpy.types.Nodes, bl_idname: str) -> bpy.types.Node | None:
    for n in nodes:
        if n.bl_idname == bl_idname:
            return n
    return None


def _make_tinted_garment_material(
    name: str,
    c_primary: tuple[float, float, float, float],
    c_secondary: tuple[float, float, float, float],
    c_accent: tuple[float, float, float, float],
    color_attr_name: str = "COLOR_0",
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.80
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    attr = nodes.new("ShaderNodeAttribute")
    attr.attribute_name = color_attr_name

    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(attr.outputs["Color"], sep.inputs["Color"])

    def _mul_rgb(scalar_out, rgba: tuple[float, float, float, float]):
        comb = nodes.new("ShaderNodeCombineColor")
        for idx, ch in enumerate(("Red", "Green", "Blue")):
            m = nodes.new("ShaderNodeMath")
            m.operation = "MULTIPLY"
            m.inputs[1].default_value = rgba[idx]
            links.new(scalar_out, m.inputs[0])
            links.new(m.outputs["Value"], comb.inputs[ch])
        return comb.outputs["Color"]

    p_col = _mul_rgb(sep.outputs["Red"], c_primary)
    s_col = _mul_rgb(sep.outputs["Green"], c_secondary)
    a_col = _mul_rgb(sep.outputs["Blue"], c_accent)

    add1 = nodes.new("ShaderNodeMix")
    add1.data_type = "RGBA"
    add1.blend_type = "ADD"
    add1.inputs["Factor"].default_value = 1.0
    links.new(p_col, add1.inputs[6])
    links.new(s_col, add1.inputs[7])

    add2 = nodes.new("ShaderNodeMix")
    add2.data_type = "RGBA"
    add2.blend_type = "ADD"
    add2.inputs["Factor"].default_value = 1.0
    links.new(add1.outputs[2], add2.inputs[6])
    links.new(a_col, add2.inputs[7])

    # Multiply combined tint color by COLOR_0 alpha (shade factor)
    sh = nodes.new("ShaderNodeMix")
    sh.data_type = "RGBA"
    sh.blend_type = "MULTIPLY"
    sh.inputs["Factor"].default_value = 1.0
    links.new(add2.outputs[2], sh.inputs[6])
    comb_a = nodes.new("ShaderNodeCombineColor")
    for ch in ("Red", "Green", "Blue"):
        links.new(attr.outputs["Alpha"], comb_a.inputs[ch])
    links.new(comb_a.outputs["Color"], sh.inputs[7])
    links.new(sh.outputs[2], bsdf.inputs["Base Color"])
    return mat


def _make_skin_material(name: str, skin_rgba: tuple[float, float, float, float]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = skin_rgba
    bsdf.inputs["Roughness"].default_value = 0.72
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def _make_face_preview_material(name: str, skin_rgba: tuple[float, float, float, float]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.65
    if FACE_ATLAS_PNG.exists():
        img = bpy.data.images.load(str(FACE_ATLAS_PNG), check_existing=True)
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MIX"
        mix.inputs[6].default_value = skin_rgba
        nt.links.new(tex.outputs["Alpha"], mix.inputs["Factor"])
        nt.links.new(tex.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = skin_rgba
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def _hide_body_regions(body_ob: bpy.types.Object, hide_regions: set[str]) -> None:
    """Remove polygons whose vertices belong entirely/primarily to ``hide_regions``."""
    if not hide_regions:
        return
    me = body_ob.data
    ca = me.color_attributes.get(charexport.COLOR_LAYER)
    if ca is None:
        return
    poly_hide: list[int] = []
    for poly in me.polygons:
        if poly.material_index != 0:
            continue
        rnames = [
            bodyshape.REGIONS[
                max(0, min(len(bodyshape.REGIONS) - 1, round(ca.data[li].color[0] * 255.0)))
            ]
            for li in poly.loop_indices
        ]
        if any(rn in hide_regions for rn in rnames):
            # Only hide polygon if ALL its loops are in hide_regions
            if all(rn in hide_regions for rn in rnames):
                poly_hide.append(poly.index)
    if not poly_hide:
        return
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    to_del = [bm.faces[i] for i in poly_hide if i < len(bm.faces)]
    bmesh.ops.delete(bm, geom=to_del, context="FACES")
    bm.to_mesh(me)
    bm.free()


def _import_garment_glb(
    item_id: str,
    base: str,
    arm: bpy.types.Object,
    swatches: dict[str, tuple[float, float, float, float]],
    tint_override: dict[str, str] | None,
    catalog_defaults: dict[str, dict[str, str]],
) -> tuple[bpy.types.Object, list[str]]:
    suffix = "f" if base == "female" else "m"
    glb_path = WARDROBE_DIR / f"{item_id}_{suffix}.glb"
    meta_path = WARDROBE_DIR / f"{item_id}.meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    hide_regs = list(meta["bases"][base].get("hideRegions", []))

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    added = [o for o in bpy.data.objects if o not in before]

    mesh_ob = next(
        (o for o in added if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)),
        None,
    )
    if mesh_ob is None:
        mesh_ob = next(
            (o for o in added if o.type == "MESH" and not o.name.startswith("Icosphere")),
            None,
        )
    imp_arm = next((o for o in added if o.type == "ARMATURE"), None)
    if mesh_ob is None:
        raise RuntimeError(f"No mesh imported from {glb_path}")
    for o in added:
        if o is not mesh_ob and o is not imp_arm:
            bpy.data.objects.remove(o, do_unlink=True)

    # Re-bind imported mesh object to our scene's primary armature
    mesh_ob.parent = arm
    mesh_ob.matrix_parent_inverse.identity()
    mesh_ob.matrix_basis.identity()
    for mod in mesh_ob.modifiers:
        if mod.type == "ARMATURE":
            mod.object = arm
    if imp_arm is not None:
        bpy.data.objects.remove(imp_arm, do_unlink=True)

    # Apply catalog swatch tinting shader using imported vertex color attribute name
    c_attr_name = "COLOR_0"
    if len(mesh_ob.data.color_attributes) > 0:
        ca_act = mesh_ob.data.color_attributes.active_color
        c_attr_name = ca_act.name if ca_act is not None else mesh_ob.data.color_attributes[0].name

    defs = dict(catalog_defaults.get(item_id, {}))
    if tint_override:
        defs.update(tint_override)
    c_prim = swatches.get(defs.get("primary", "c_white"), (0.9, 0.9, 0.9, 1.0))
    c_sec = swatches.get(defs.get("secondary", defs.get("primary", "c_white")), c_prim)
    c_acc = swatches.get(defs.get("accent", defs.get("primary", "c_white")), c_prim)

    mat = _make_tinted_garment_material(
        f"Mat_{item_id}_{suffix}", c_prim, c_sec, c_acc, color_attr_name=c_attr_name
    )
    mesh_ob.data.materials.clear()
    mesh_ob.data.materials.append(mat)
    return mesh_ob, hide_regs


def _set_shape_values(obs: list[bpy.types.Object], shape_vals: dict[str, float]) -> None:
    for ob in obs:
        sk = ob.data.shape_keys
        if sk is None:
            continue
        for kb in sk.key_blocks:
            if kb.name != "Basis":
                kb.value = float(shape_vals.get(kb.name, 0.0))


def _apply_named_pose(arm: bpy.types.Object, pose_name: str) -> None:
    rig.reset_pose(arm)
    if pose_name == "a_pose":
        return
    if pose_name == "sit":
        rig.pose(arm, "LeftUpLeg", x=-90)
        rig.pose(arm, "RightUpLeg", x=-90)
        rig.pose(arm, "LeftLeg", x=90)
        rig.pose(arm, "RightLeg", x=90)
    elif pose_name == "arms_up":
        rig.pose(arm, "LeftArm", y=-105)
        rig.pose(arm, "RightArm", y=105)
        rig.pose(arm, "LeftForeArm", y=-15)
        rig.pose(arm, "RightForeArm", y=15)
    elif pose_name == "deep_bend":
        rig.pose(arm, "Spine", x=20)
        rig.pose(arm, "Spine1", x=15)
        rig.pose(arm, "Spine2", x=10)
        rig.pose(arm, "Head", x=-20)
        rig.pose(arm, "LeftArm", x=25, y=-10)
        rig.pose(arm, "RightArm", x=25, y=10)
    elif pose_name == "walk_stride":
        rig.pose(arm, "LeftUpLeg", x=-28)
        rig.pose(arm, "LeftLeg", x=18)
        rig.pose(arm, "RightUpLeg", x=22)
        rig.pose(arm, "RightLeg", x=12)
        rig.pose(arm, "LeftArm", x=20)
        rig.pose(arm, "RightArm", x=-22)
        rig.pose(arm, "Spine", z=6)


def _setup_lighting_and_camera(scene: bpy.types.Scene, view: str = "front_34") -> None:
    """Configure bright even studio light + floor + 3/4 camera."""
    scene.render.engine = "BLENDER_EEVEE"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("StudioWorld")
    scene.world.use_nodes = True
    bg = _find_node(scene.world.node_tree.nodes, "ShaderNodeBackground")
    if bg is not None:
        bg.inputs["Color"].default_value = (0.18, 0.20, 0.24, 1.0)
        bg.inputs["Strength"].default_value = 0.9

    # Remove old lights/cameras
    for o in list(bpy.data.objects):
        if o.type in ("LIGHT", "CAMERA"):
            bpy.data.objects.remove(o, do_unlink=True)

    # Key + rim + fill lights
    for lname, energy, rot in (
        ("KeySun", 2.2, (math.radians(48), math.radians(15), math.radians(-35))),
        ("FillSun", 1.2, (math.radians(58), 0.0, math.radians(145))),
    ):
        ldata = bpy.data.lights.new(lname, type="SUN")
        ldata.energy = energy
        lobj = bpy.data.objects.new(lname, ldata)
        lobj.rotation_euler = Euler(rot, "XYZ")
        scene.collection.objects.link(lobj)

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 52
    cam_ob = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam_ob)

    # Character faces -Y; feet z=0..1.70
    target = Vector((0.0, 0.0, 0.84))
    if view == "back_34":
        cam_pos = Vector((-1.45, 2.35, 1.28))
    else:
        cam_pos = Vector((1.45, -2.35, 1.28))
    cam_ob.location = cam_pos
    direction = (target - cam_pos).normalized()
    cam_ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_ob


def _create_floor_plane(size: float = 2.8, z: float = -0.008) -> None:
    """Create a subtle matte studio floor plane under the character."""
    half = size * 0.5
    bm = bmesh.new()
    verts = [
        bm.verts.new((-half, -half, z)),
        bm.verts.new((half, -half, z)),
        bm.verts.new((half, half, z)),
        bm.verts.new((-half, half, z)),
    ]
    bm.faces.new(verts)
    mesh = bpy.data.meshes.new("StudioFloor")
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("StudioFloor", mesh)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new("StudioFloorMat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (0.14, 0.16, 0.19, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.92
    ob.data.materials.append(mat)


def _render_panel(
    base: str,
    items: list[tuple[str, dict[str, str] | None]],
    *,
    view: str = "front_34",
    pose_name: str = "a_pose",
    shape_vals: dict[str, float] | None = None,
    swatches: dict[str, tuple[float, float, float, float]],
    catalog_defaults: dict[str, dict[str, str]],
    out_png: Path,
    res_w: int = 360,
    res_h: int = 480,
) -> None:
    export.clear_scene()
    arm, body_ob, _info = bodyshape.build_base_body(base)

    # Skin + face materials on body_ob
    skin_rgba = swatches.get("skin_03", (0.72, 0.52, 0.40, 1.0))
    mat_skin = _make_skin_material("Skin03", skin_rgba)
    mat_face = _make_face_preview_material("FacePreview", skin_rgba)
    body_ob.data.materials.clear()
    body_ob.data.materials.append(mat_skin)
    body_ob.data.materials.append(mat_face)

    garments: list[bpy.types.Object] = []
    hide_union: set[str] = set()
    for iid, tint_ov in items:
        gob, hides = _import_garment_glb(
            iid, base, arm, swatches, tint_ov, catalog_defaults
        )
        garments.append(gob)
        hide_union.update(hides)

    _hide_body_regions(body_ob, hide_union)
    _set_shape_values([body_ob] + garments, shape_vals or {})
    _apply_named_pose(arm, pose_name)
    bpy.context.view_layer.update()

    _create_floor_plane(size=2.8, z=-0.008)
    scene = bpy.context.scene
    _setup_lighting_and_camera(scene, view=view)
    scene.render.resolution_x = res_w
    scene.render.resolution_y = res_h
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)


def _stitch_grid(
    panels: list[Path], cols: int, rows: int, panel_w: int, panel_h: int, out_path: Path
) -> None:
    """Stitch ``panels`` into a crisp contact sheet PNG via Blender image API."""
    total_w = cols * panel_w
    total_h = rows * panel_h
    canvas = np.zeros((total_h, total_w, 4), dtype=np.float32)

    for idx, p in enumerate(panels):
        if idx >= cols * rows or not p.exists():
            continue
        img = bpy.data.images.load(str(p), check_existing=False)
        px = np.array(img.pixels[:], dtype=np.float32).reshape((img.size[1], img.size[0], 4))
        bpy.data.images.remove(img)
        r = idx // cols
        c = idx % cols
        # Blender image Y=0 is bottom; row 0 should be TOP of output image -> place at high Y
        y0 = (rows - 1 - r) * panel_h
        x0 = c * panel_w
        canvas[y0 : y0 + panel_h, x0 : x0 + panel_w, :] = px

    out_img = bpy.data.images.new(
        "ContactSheet", width=total_w, height=total_h, alpha=True
    )
    out_img.pixels[:] = canvas.ravel()
    out_img.filepath_raw = str(out_path)
    out_img.file_format = "PNG"
    out_img.save()
    bpy.data.images.remove(out_img)


def render_all() -> None:
    CONTACT_DIR.mkdir(parents=True, exist_ok=True)
    swatches = _load_swatches()
    catalog_defaults = _load_catalog_defaults()

    outfit_combos = {
        "female": [
            [("top_tshirt_crew_01", None), ("bottom_jeans_01", None), ("shoes_sneaker_01", None)],
            [("top_shirt_office_01", None), ("bottom_trousers_01", None), ("shoes_loafer_01", None)],
            [("top_hoodie_01", None), ("bottom_shorts_01", None), ("shoes_sneaker_01", None)],
            [("fullbody_dress_simple_01", None), ("shoes_loafer_01", None)],
            [("top_tshirt_crew_01", {"primary": "c_sage"}), ("bottom_shorts_01", None), ("shoes_loafer_01", None)],
            [("top_hoodie_01", None), ("bottom_jeans_01", None), ("shoes_sneaker_01", None)],
        ],
        "male": [
            [("top_tshirt_crew_01", None), ("bottom_jeans_01", None), ("shoes_sneaker_01", None)],
            [("top_shirt_office_01", None), ("bottom_trousers_01", None), ("shoes_loafer_01", None)],
            [("top_hoodie_01", None), ("bottom_shorts_01", None), ("shoes_sneaker_01", None)],
            [("top_tshirt_crew_01", {"primary": "c_cobalt"}), ("bottom_trousers_01", None), ("shoes_loafer_01", None)],
            [("top_shirt_office_01", None), ("bottom_jeans_01", None), ("shoes_sneaker_01", None)],
            [("top_hoodie_01", None), ("bottom_trousers_01", None), ("shoes_loafer_01", None)],
        ],
    }

    pose_outfits = {
        "female": [
            [("top_shirt_office_01", None), ("bottom_trousers_01", None), ("shoes_loafer_01", None)],
            [("fullbody_dress_simple_01", None), ("shoes_loafer_01", None)],
        ],
        "male": [
            [("top_shirt_office_01", None), ("bottom_trousers_01", None), ("shoes_loafer_01", None)],
            [("top_hoodie_01", None), ("bottom_jeans_01", None), ("shoes_sneaker_01", None)],
        ],
    }

    with tempfile.TemporaryDirectory() as tmp:
        tdir = Path(tmp)
        pw, ph = 340, 440

        for base in ("female", "male"):
            # 1. outfits: 6 outfits x (3/4 front row + 3/4 back row) -> 6 cols x 2 rows
            front_panels: list[Path] = []
            back_panels: list[Path] = []
            for oi, items in enumerate(outfit_combos[base]):
                pf = tdir / f"{base}_o{oi}_f.png"
                pb = tdir / f"{base}_o{oi}_b.png"
                _render_panel(
                    base, items, view="front_34", swatches=swatches,
                    catalog_defaults=catalog_defaults, out_png=pf, res_w=pw, res_h=ph
                )
                _render_panel(
                    base, items, view="back_34", swatches=swatches,
                    catalog_defaults=catalog_defaults, out_png=pb, res_w=pw, res_h=ph
                )
                front_panels.append(pf)
                back_panels.append(pb)
            out_outfits = CONTACT_DIR / f"wardrobe_{base}_outfits.png"
            _stitch_grid(front_panels + back_panels, 6, 2, pw, ph, out_outfits)
            print(f"[render_wardrobe] {out_outfits}")

            # 2. poses: 2 outfits x 4 poses (sit, arms_up, deep_bend, walk_stride) -> 4 cols x 2 rows
            pose_panels: list[Path] = []
            for oi, items in enumerate(pose_outfits[base]):
                for pname in ("sit", "arms_up", "deep_bend", "walk_stride"):
                    pp = tdir / f"{base}_p{oi}_{pname}.png"
                    _render_panel(
                        base, items, view="front_34", pose_name=pname, swatches=swatches,
                        catalog_defaults=catalog_defaults, out_png=pp, res_w=pw, res_h=ph
                    )
                    pose_panels.append(pp)
            out_poses = CONTACT_DIR / f"wardrobe_{base}_poses.png"
            _stitch_grid(pose_panels, 4, 2, pw, ph, out_poses)
            print(f"[render_wardrobe] {out_poses}")

            # 3. extremes: 1 outfit x 6 shape extremes (clamped to worn items' bodyLimits) -> 3 cols x 2 rows
            ext_items = [("top_tshirt_crew_01", None), ("bottom_jeans_01", None), ("shoes_sneaker_01", None)]
            ext_panels: list[Path] = []
            for ename, svals in EXTREME_COMBOS:
                clamped_svals = dict(svals)
                for iid, _ in ext_items:
                    mp = WARDROBE_DIR / f"{iid}.meta.json"
                    if mp.exists():
                        mdata = json.loads(mp.read_text(encoding="utf-8"))
                        blim = mdata.get("bases", {}).get(base, {}).get("bodyLimits", {})
                        for k, val in list(clamped_svals.items()):
                            if k in blim:
                                lo, hi = blim[k]
                                clamped_svals[k] = max(lo, min(hi, val))
                pe = tdir / f"{base}_ext_{ename.replace(' ', '_')}.png"
                _render_panel(
                    base, ext_items, view="front_34", shape_vals=clamped_svals, swatches=swatches,
                    catalog_defaults=catalog_defaults, out_png=pe, res_w=pw, res_h=ph
                )
                ext_panels.append(pe)
            out_extremes = CONTACT_DIR / f"wardrobe_{base}_extremes.png"
            _stitch_grid(ext_panels, 3, 2, pw, ph, out_extremes)
            print(f"[render_wardrobe] {out_extremes}")


if __name__ == "__main__":
    render_all()
