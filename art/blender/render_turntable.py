"""Render 360-degree looping turntable PNG sequences and GIFs for animated dressed characters.

Default pairs (`P07a-T13`):
  - male:   top_tshirt_crew_01 + bottom_jeans_01 + shoes_sneaker_01 + hair_short_01
  - female: top_shirt_office_01 + bottom_trousers_01 + shoes_loafer_01 + hair_bob_01
  - clips:  walk, sit_type, sit_idle (~3 s seamless loop at 15 fps, <= 600 px wide)

Loads ``public/assets/models/characters/body_<base>.glb``,
``public/assets/anim/library.glb``, and ``public/assets/models/wardrobe/*.glb``
strictly read-only (never writes under ``public/assets`` or ``art/targets.json``).

Outputs:
  - PNG frames: ``art/out/turntable/<base>_<clip>/frame_0000.png ...``
  - GIFs:       ``art/out/contact/turntable_<base>_<clip>.gif``

Usage:
    Blender -b --factory-startup --python-exit-code 1 -P art/blender/render_turntable.py -- \\
        [--bases male,female] [--clips walk,sit_type,sit_idle] [--width 480] [--height 540]
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Vector

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from lib import bodyshape, charexport, export  # noqa: E402

REPO_ROOT = _HERE.parent.parent
ASSETS_DIR = REPO_ROOT / "public/assets"
CHAR_DIR = ASSETS_DIR / "models/characters"
WARDROBE_DIR = ASSETS_DIR / "models/wardrobe"
ANIM_GLB = ASSETS_DIR / "anim/library.glb"
ANIM_JSON = ASSETS_DIR / "anim/library.json"
PALETTE_JSON = REPO_ROOT / "src/content/palette3d.json"
PALETTE_PNG = ASSETS_DIR / "textures/palette.png"
FACE_ATLAS_PNG = ASSETS_DIR / "textures/face_atlas.png"
CATALOG_DIR = REPO_ROOT / "src/content/catalog"
OUT_FRAMES_ROOT = REPO_ROOT / "art/out/turntable"
OUT_CONTACT_DIR = REPO_ROOT / "art/out/contact"

# Starter outfits per base with realistic warm/natural presentation swatches
DEFAULT_OUTFITS: dict[str, dict] = {
    "male": {
        "skin": "skin_03",
        "hair_swatch": "hair_black",
        "items": [
            ("top_tshirt_crew_01", None),
            ("bottom_jeans_01", None),
            ("shoes_sneaker_01", None),
            ("hair_short_01", None),
        ],
    },
    "female": {
        "skin": "skin_02",
        "hair_swatch": "hair_brown",
        "items": [
            ("top_shirt_office_01", None),
            ("bottom_trousers_01", None),
            ("shoes_loafer_01", None),
            ("hair_bob_01", None),
        ],
    },
}

DEFAULT_CLIPS = ("walk", "sit_type", "sit_idle")


def _srgb_hex_to_linear(hex_str: str) -> tuple[float, float, float, float]:
    h = hex_str.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))

    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(r), lin(g), lin(b), 1.0)


def _load_swatches() -> tuple[dict[str, tuple[float, float, float, float]], dict[str, dict]]:
    raw = json.loads(PALETTE_JSON.read_text(encoding="utf-8"))
    swatches: dict[str, tuple[float, float, float, float]] = {}
    meta: dict[str, dict] = {}
    for entry in raw.get("swatches", []):
        if isinstance(entry, dict) and "key" in entry and "hex" in entry:
            swatches[entry["key"]] = _srgb_hex_to_linear(entry["hex"])
            meta[entry["key"]] = entry
    return swatches, meta


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


def _load_clip_meta() -> dict[str, dict]:
    raw = json.loads(ANIM_JSON.read_text(encoding="utf-8"))
    return {c["clip"]: c for c in raw.get("clips", []) if "clip" in c}


def _find_node(nodes: bpy.types.Nodes, bl_idname: str) -> bpy.types.Node | None:
    for n in nodes:
        if n.bl_idname == bl_idname:
            return n
    return None


def _make_skin_material(name: str, skin_rgba: tuple[float, float, float, float]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = skin_rgba
    bsdf.inputs["Roughness"].default_value = 0.78
    bsdf.inputs["Metallic"].default_value = 0.0
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def _make_face_preview_material(name: str, skin_rgba: tuple[float, float, float, float]) -> bpy.types.Material:
    """Alpha-blended face atlas material matching `M_Face` quads cleanly without shading seams."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.85
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    if FACE_ATLAS_PNG.exists():
        img = bpy.data.images.load(str(FACE_ATLAS_PNG), check_existing=True)
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.interpolation = "Linear"
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(mat, attr, val)
            except Exception:
                pass
    else:
        bsdf.inputs["Base Color"].default_value = skin_rgba
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def _make_tinted_garment_material(
    name: str,
    c_primary: tuple[float, float, float, float],
    c_secondary: tuple[float, float, float, float],
    c_accent: tuple[float, float, float, float],
    color_attr_name: str = "Color",
) -> bpy.types.Material:
    """Replicate runtime RGB-channel tint mask * alpha shade on skinned/tinted garments."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.82
    bsdf.inputs["Metallic"].default_value = 0.0
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


def _make_palette_shaded_material(
    name: str,
    color_attr_name: str = "Color",
) -> bpy.types.Material:
    """Palette texture multiplied by COLOR_0 alpha shade (for untinted hair/props)."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(PALETTE_PNG), check_existing=True)
    tex.image.colorspace_settings.name = "sRGB"
    tex.interpolation = "Closest"

    attr = nodes.new("ShaderNodeAttribute")
    attr.attribute_name = color_attr_name

    comb_a = nodes.new("ShaderNodeCombineColor")
    for ch in ("Red", "Green", "Blue"):
        links.new(attr.outputs["Alpha"], comb_a.inputs[ch])

    mul = nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    links.new(tex.outputs["Color"], mul.inputs[6])
    links.new(comb_a.outputs["Color"], mul.inputs[7])
    links.new(mul.outputs[2], bsdf.inputs["Base Color"])
    return mat


def _hide_body_regions(body_ob: bpy.types.Object, hide_regions: set[str]) -> None:
    if not hide_regions:
        return
    me = body_ob.data
    ca = me.color_attributes.get("Color") or me.color_attributes.get(charexport.COLOR_LAYER)
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
    me.update()


def _shift_hair_uv_to_swatch(
    mesh_ob: bpy.types.Object,
    target_swatch: str,
    swatch_meta: dict[str, dict],
) -> None:
    """Shift UVs authored in `hair_black` / `hair_black_hi` columns to `target_swatch`."""
    if target_swatch == "hair_black" or target_swatch not in swatch_meta:
        return
    me = mesh_ob.data
    if not me.uv_layers:
        return
    black = swatch_meta.get("hair_black")
    tgt = swatch_meta[target_swatch]
    if not black:
        return
    du = (tgt["col"] - black["col"]) / 16.0
    dv = (black["row"] - tgt["row"]) / 16.0
    uv_layer = me.uv_layers.active.data
    for loop in uv_layer:
        u, v = loop.uv
        loop.uv = (u + du, v + dv)


def _attach_rigid_to_bone(mesh_ob: bpy.types.Object, arm: bpy.types.Object, bone_name: str) -> None:
    """Bind a character-rest-space rigid mesh strictly to `bone_name` using an Armature modifier."""
    mesh_ob.parent = arm
    mesh_ob.matrix_parent_inverse.identity()
    mesh_ob.matrix_basis.identity()
    vg = mesh_ob.vertex_groups.get(bone_name) or mesh_ob.vertex_groups.new(name=bone_name)
    all_verts = [v.index for v in mesh_ob.data.vertices]
    vg.add(all_verts, 1.0, "REPLACE")
    mod = mesh_ob.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm


def _import_wardrobe_item(
    item_id: str,
    base: str,
    arm: bpy.types.Object,
    swatches: dict[str, tuple[float, float, float, float]],
    swatch_meta: dict[str, dict],
    hair_swatch: str,
    tint_override: dict[str, str] | None,
    catalog_defaults: dict[str, dict[str, str]],
) -> tuple[bpy.types.Object, list[str]]:
    meta_path = WARDROBE_DIR / f"{item_id}.meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    base_entry = meta["bases"][base]
    glb_path = ASSETS_DIR / base_entry["file"]
    hide_regs = list(base_entry.get("hideRegions", []))

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    added = [o for o in bpy.data.objects if o not in before]

    mesh_ob = next(
        (o for o in added if o.type == "MESH" and not o.name.startswith("Icosphere")),
        None,
    )
    imp_arm = next((o for o in added if o.type == "ARMATURE"), None)
    if mesh_ob is None:
        raise RuntimeError(f"No mesh found in {glb_path}")

    for o in added:
        if o is not mesh_ob and o is not imp_arm:
            bpy.data.objects.remove(o, do_unlink=True)

    kind = meta.get("kind", "skinned")
    if kind == "rigid":
        if imp_arm is not None:
            bpy.data.objects.remove(imp_arm, do_unlink=True)
        bone_name = meta.get("bone", "Head")
        _attach_rigid_to_bone(mesh_ob, arm, bone_name)
    else:
        mesh_ob.parent = arm
        mesh_ob.matrix_parent_inverse.identity()
        mesh_ob.matrix_basis.identity()
        for mod in mesh_ob.modifiers:
            if mod.type == "ARMATURE":
                mod.object = arm
        if imp_arm is not None:
            bpy.data.objects.remove(imp_arm, do_unlink=True)

    c_attr_name = "Color"
    if len(mesh_ob.data.color_attributes) > 0:
        ca_act = mesh_ob.data.color_attributes.active_color
        c_attr_name = ca_act.name if ca_act is not None else mesh_ob.data.color_attributes[0].name

    # Inspect vertex colors to see whether tint mask RGB > 0 or palette-UV mode applies
    has_tint_mask = False
    if c_attr_name in mesh_ob.data.color_attributes:
        ca = mesh_ob.data.color_attributes[c_attr_name]
        for c in ca.data:
            if c.color[0] + c.color[1] + c.color[2] > 0.02:
                has_tint_mask = True
                break

    slot = meta.get("slot", "")
    if has_tint_mask:
        defs = dict(catalog_defaults.get(item_id, {}))
        if tint_override:
            defs.update(tint_override)
        if slot == "hair" and "primary" not in defs:
            defs["primary"] = hair_swatch
        c_prim = swatches.get(defs.get("primary", "c_white"), (0.9, 0.9, 0.9, 1.0))
        c_sec = swatches.get(defs.get("secondary", defs.get("primary", "c_white")), c_prim)
        c_acc = swatches.get(defs.get("accent", defs.get("primary", "c_white")), c_prim)
        mat = _make_tinted_garment_material(
            f"Mat_{item_id}_{base}", c_prim, c_sec, c_acc, color_attr_name=c_attr_name
        )
    else:
        if slot == "hair":
            _shift_hair_uv_to_swatch(mesh_ob, hair_swatch, swatch_meta)
        mat = _make_palette_shaded_material(f"Mat_{item_id}_{base}", color_attr_name=c_attr_name)

    mesh_ob.data.materials.clear()
    mesh_ob.data.materials.append(mat)
    return mesh_ob, hide_regs


def _load_dressed_character(
    base: str,
    swatches: dict[str, tuple[float, float, float, float]],
    swatch_meta: dict[str, dict],
    catalog_defaults: dict[str, dict[str, str]],
) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    """Load `body_<base>.glb` + starter outfit strictly read-only."""
    export.clear_scene()
    cfg = DEFAULT_OUTFITS[base]
    body_glb = CHAR_DIR / f"body_{base}.glb"

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(body_glb))
    added = [o for o in bpy.data.objects if o not in before]

    arm = next((o for o in added if o.type == "ARMATURE"), None)
    body_ob = next(
        (o for o in added if o.type == "MESH" and "body" in o.name.lower()),
        None,
    )
    if arm is None or body_ob is None:
        raise RuntimeError(f"Failed to import armature/body mesh from {body_glb}")

    # Drop any glTF exporter placeholder lights/cameras/icospheres
    for o in list(bpy.data.objects):
        if o not in (arm, body_ob):
            bpy.data.objects.remove(o, do_unlink=True)

    skin_rgba = swatches.get(cfg["skin"], (0.76, 0.56, 0.44, 1.0))
    mat_skin = _make_skin_material(f"Skin_{base}", skin_rgba)
    mat_face = _make_face_preview_material(f"Face_{base}", skin_rgba)
    # Replace material slots in-place so polygon material_index (0=skin, 1=face) stays intact
    if len(body_ob.data.materials) >= 2:
        body_ob.data.materials[0] = mat_skin
        body_ob.data.materials[1] = mat_face
    else:
        body_ob.data.materials.clear()
        body_ob.data.materials.append(mat_skin)
        body_ob.data.materials.append(mat_face)

    meshes = [body_ob]
    hide_union: set[str] = set()
    for item_id, tint_ov in cfg["items"]:
        mob, hides = _import_wardrobe_item(
            item_id=item_id,
            base=base,
            arm=arm,
            swatches=swatches,
            swatch_meta=swatch_meta,
            hair_swatch=cfg["hair_swatch"],
            tint_override=tint_ov,
            catalog_defaults=catalog_defaults,
        )
        meshes.append(mob)
        hide_union.update(hides)

    _hide_body_regions(body_ob, hide_union)
    # glTF importer sets morph targets on body_*.glb to 1.0 by default; reset all shape keys to Basis
    for ob in meshes:
        sk = getattr(ob.data, "shape_keys", None)
        if sk is not None:
            for kb in sk.key_blocks:
                if kb.name != "Basis":
                    kb.value = 0.0
    return arm, meshes


def _bind_clip_action(arm: bpy.types.Object, clip_name: str) -> tuple[float, float]:
    """Import `library.glb` action cleanly and attach to `arm`. Returns `(f_start, f_end)`."""
    before_acts = set(bpy.data.actions)
    before_objs = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ANIM_GLB))
    for o in list(bpy.data.objects):
        if o not in before_objs:
            bpy.data.objects.remove(o, do_unlink=True)

    act = bpy.data.actions.get(clip_name)
    if act is None:
        raise RuntimeError(f"Clip {clip_name!r} not found in {ANIM_GLB}")
    for a in list(bpy.data.actions):
        if a not in before_acts and a is not act:
            bpy.data.actions.remove(a)

    arm.animation_data_create()
    arm.animation_data.action = act
    if hasattr(arm.animation_data, "action_slot") and getattr(act, "slots", None):
        arm.animation_data.action_slot = act.slots[0]
    f0, f1 = act.frame_range
    return float(f0), float(f1)


def _create_turntable_floor(radius: float = 0.85, z: float = -0.002) -> None:
    """Subtle circular turntable stage with concentric ring for grounding."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=36, radius=radius, depth=0.016, location=(0.0, 0.0, z - 0.008))
    disc = bpy.context.object
    disc.name = "TurntableDisc"
    mat = bpy.data.materials.new("TurntableDiscMat")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.90
    chk = nt.nodes.new("ShaderNodeTexChecker")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    chk.inputs["Scale"].default_value = 2.0
    chk.inputs["Color1"].default_value = (0.60, 0.61, 0.64, 1.0)
    chk.inputs["Color2"].default_value = (0.50, 0.51, 0.54, 1.0)
    nt.links.new(geo.outputs["Position"], chk.inputs["Vector"])
    nt.links.new(chk.outputs["Color"], bsdf.inputs["Base Color"])
    disc.data.materials.append(mat)


def _setup_studio(scene: bpy.types.Scene, width: int, height: int, samples: int) -> None:
    scene.world = bpy.data.worlds.new("StudioWorld")
    scene.world.use_nodes = True
    bg = _find_node(scene.world.node_tree.nodes, "ShaderNodeBackground")
    if bg is not None:
        bg.inputs["Color"].default_value = (0.83, 0.85, 0.88, 1.0)
        bg.inputs["Strength"].default_value = 0.85

    # Two opposed directional lights ensure clean visibility across all 360 degrees
    for lname, energy, rot in (
        ("KeySun", 2.1, (math.radians(48), math.radians(10), math.radians(-35))),
        ("RimFillSun", 1.3, (math.radians(52), math.radians(-8), math.radians(145))),
    ):
        ldata = bpy.data.lights.new(lname, type="SUN")
        ldata.energy = energy
        ldata.angle = math.radians(10)
        lobj = bpy.data.objects.new(lname, ldata)
        lobj.rotation_euler = Euler(rot, "XYZ")
        scene.collection.objects.link(lobj)

    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    if hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = samples
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"


def _compute_framing(
    arm: bpy.types.Object,
    meshes: list[bpy.types.Object],
    f0: float,
    f1: float,
) -> tuple[Vector, float, float]:
    """Sample clip poses and compute `(target_center, radius, cam_height_offset)`."""
    scene = bpy.context.scene
    deps = bpy.context.evaluated_depsgraph_get()
    z_min, z_max, xy_max = 1e9, -1e9, 0.25
    for frac in (0.0, 0.25, 0.5, 0.75):
        f = f0 + frac * (f1 - f0)
        scene.frame_set(int(f), subframe=f - int(f))
        bpy.context.view_layer.update()
        for ob in meshes:
            ev = ob.evaluated_get(deps)
            for corner in ev.bound_box:
                wp = ob.matrix_world @ Vector(corner)
                z_min = min(z_min, wp.z)
                z_max = max(z_max, wp.z)
                xy_max = max(xy_max, math.hypot(wp.x, wp.y))

    z_min = min(z_min, 0.0)
    span_z = max(0.9, z_max - z_min)
    center = Vector((0.0, 0.0, z_min + 0.51 * span_z))
    # Lens 50mm on 36mm sensor -> ~39.6 deg vertical FOV at 480x540 -> dist ≈ span / (2 * tan(fov/2))
    dist = max(2.15, span_z * 1.48, xy_max * 3.8)
    cam_dz = 0.22 * span_z
    return center, dist, cam_dz


def _build_gif_from_frames(frames_dir: Path, gif_path: Path, fps: int) -> None:
    gif_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        pattern = str(frames_dir / "frame_%04d.png")
        vf = f"fps={fps},split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3"
        subprocess.run(
            [ffmpeg, "-y", "-framerate", str(fps), "-i", pattern, "-vf", vf, "-loop", "0", str(gif_path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return

    from PIL import Image

    pngs = sorted(frames_dir.glob("frame_*.png"))
    if not pngs:
        raise RuntimeError(f"No frames in {frames_dir}")
    imgs = [Image.open(p).convert("P", palette=Image.Palette.ADAPTIVE, colors=128) for p in pngs]
    dur_ms = round(1000 / fps)
    imgs[0].save(gif_path, save_all=True, append_images=imgs[1:], duration=dur_ms, loop=0, optimize=True)


def render_one(
    base: str,
    clip: str,
    *,
    fps: int,
    width: int,
    height: int,
    samples: int,
    make_gif: bool,
    only_frames: list[int] | None,
    swatches: dict[str, tuple[float, float, float, float]],
    swatch_meta: dict[str, dict],
    catalog_defaults: dict[str, dict[str, str]],
    clip_meta: dict[str, dict],
) -> tuple[Path, Path | None, int, float]:
    arm, meshes = _load_dressed_character(base, swatches, swatch_meta, catalog_defaults)
    f0, f1 = _bind_clip_action(arm, clip)
    _create_turntable_floor()

    scene = bpy.context.scene
    _setup_studio(scene, width=width, height=height, samples=samples)
    target, dist, cam_dz = _compute_framing(arm, meshes, f0, f1)

    cam_data = bpy.data.cameras.new("TurntableCam")
    cam_data.lens = 50.0
    cam_ob = bpy.data.objects.new("TurntableCam", cam_data)
    scene.collection.objects.link(cam_ob)
    scene.camera = cam_ob

    clip_dur = float((clip_meta.get(clip) or {}).get("duration") or max(1.0, (f1 - f0) / 24.0))
    # Target ~3.0 s total duration with an integer number of clip loops so both orbit & clip loop seamlessly
    loops = max(1, round(3.0 / clip_dur))
    total_dur = loops * clip_dur
    total_frames = max(12, round(total_dur * fps))

    frames_dir = OUT_FRAMES_ROOT / f"{base}_{clip}"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for old_png in frames_dir.glob("frame_*.png"):
        if only_frames is None:
            old_png.unlink()

    frame_indices = only_frames if only_frames is not None else list(range(total_frames))
    for i in frame_indices:
        # Seamless phase over [0, 1)
        orbit_t = i / total_frames
        # Start slightly off front-center (-25 deg) so frame 0 looks dynamic and clearly shows depth
        az = math.radians(-25.0) + orbit_t * 2.0 * math.pi
        cam_pos = Vector((
            target.x + dist * math.sin(az),
            target.y - dist * math.cos(az),
            target.z + cam_dz,
        ))
        cam_ob.location = cam_pos
        cam_ob.rotation_euler = (target - cam_pos).normalized().to_track_quat("-Z", "Y").to_euler()

        clip_u = (orbit_t * loops) % 1.0
        f = f0 + clip_u * (f1 - f0)
        scene.frame_set(int(f), subframe=f - int(f))
        bpy.context.view_layer.update()

        scene.render.filepath = str(frames_dir / f"frame_{i:04d}.png")
        bpy.ops.render.render(write_still=True)

    gif_path = OUT_CONTACT_DIR / f"turntable_{base}_{clip}.gif" if make_gif else None
    if gif_path is not None and only_frames is None:
        _build_gif_from_frames(frames_dir, gif_path, fps=fps)

    return frames_dir, gif_path, total_frames, total_dur


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    bases = ["male", "female"]
    clips = list(DEFAULT_CLIPS)
    fps = 15
    width = 480
    height = 540
    samples = 24
    make_gif = True
    only_frames: list[int] | None = None

    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--bases":
            bases = [s.strip() for s in argv[i + 1].split(",") if s.strip()]
            i += 2
        elif a == "--clips":
            clips = [s.strip() for s in argv[i + 1].split(",") if s.strip()]
            i += 2
        elif a == "--fps":
            fps = int(argv[i + 1])
            i += 2
        elif a == "--width":
            width = int(argv[i + 1])
            i += 2
        elif a == "--height":
            height = int(argv[i + 1])
            i += 2
        elif a == "--samples":
            samples = int(argv[i + 1])
            i += 2
        elif a == "--no-gif":
            make_gif = False
            i += 1
        elif a == "--only-frames":
            only_frames = [int(x) for x in argv[i + 1].split(",") if x.strip()]
            i += 2
        else:
            raise SystemExit(f"Unknown arg: {a}")

    if width > 600:
        raise SystemExit(f"Width must be <= 600 px (got {width})")

    swatches, swatch_meta = _load_swatches()
    catalog_defaults = _load_catalog_defaults()
    clip_meta = _load_clip_meta()

    for base in bases:
        if base not in DEFAULT_OUTFITS:
            raise SystemExit(f"Unknown base: {base}")
        for clip in clips:
            frames_dir, gif_path, n_frames, dur = render_one(
                base,
                clip,
                fps=fps,
                width=width,
                height=height,
                samples=samples,
                make_gif=make_gif,
                only_frames=only_frames,
                swatches=swatches,
                swatch_meta=swatch_meta,
                catalog_defaults=catalog_defaults,
                clip_meta=clip_meta,
            )
            print(
                f"TURNTABLE {base}_{clip}: frames={n_frames} dur={dur:.2f}s fps={fps} dir={frames_dir}"
                + (f" gif={gif_path} ({gif_path.stat().st_size} bytes)" if gif_path and gif_path.exists() else "")
            )


if __name__ == "__main__":
    main()
