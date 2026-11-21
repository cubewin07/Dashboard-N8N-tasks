"""Shared character export & vertex-colour/UV helpers (CHARACTER-PIPELINE.md).

Used by `gen_body.py`, `selftest.py`, and wardrobe generators/fitters:

    from lib import charexport, palette, rig

    arm = rig.build_armature("body_female")
    # build bmesh `bm` with UVMap + COLOR_0 float_color layer...
    charexport.paint_palette(bm, body_faces, "skin_01")
    charexport.set_body_colors(bm, vert_regions, face_slots)
    me = charexport.bmesh_to_mesh(bm, "body_female_mesh", [palette.material("palette"), charexport.face_material()])
    ob = charexport.create_skinned_object("body_female_mesh", me, arm, weights_by_vert)
    charexport.add_shape_keys(ob, deltas_by_key)
    charexport.export_character_glb(arm, [arm, ob], out_path)
    charexport.register_targets("body", [...])
"""
import json
import os
import struct
import zlib

import bpy
from mathutils import Vector

from . import palette, rig

ROOT = palette.ROOT
RIG_JSON = os.path.join(ROOT, "art", "rig.json")
TARGETS_JSON = os.path.join(ROOT, "art", "targets.json")
FACE_ATLAS_PNG = os.path.join(ROOT, "public", "assets", "textures", "face_atlas.png")
COLOR_LAYER = "COLOR_0"


def _write_transparent_png(path, size=512):
    """Write a minimal RGBA transparent PNG without external dependencies."""
    os.makedirs(os.path.dirname(path), exist_ok=True)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + b"\x00" * (size * 4) for _ in range(size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


def ensure_face_atlas():
    """Return path to `public/assets/textures/face_atlas.png`, creating a 512x512
    transparent placeholder if the face-atlas generator has not written it yet."""
    if not os.path.exists(FACE_ATLAS_PNG):
        _write_transparent_png(FACE_ATLAS_PNG, 512)
    return FACE_ATLAS_PNG


def face_material():
    """Create or return the shared `M_Face` material using `face_atlas.png`."""
    mat = bpy.data.materials.get("M_Face")
    if mat is not None:
        return mat
    atlas_path = ensure_face_atlas()
    img = bpy.data.images.get("face_atlas.png")
    if img is None:
        img = bpy.data.images.load(atlas_path)
        img.name = "face_atlas.png"
        img.colorspace_settings.name = "sRGB"
    mat = bpy.data.materials.new("M_Face")
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Linear"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.85
    mat.use_backface_culling = True
    for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
        try:
            setattr(mat, attr, val)
        except Exception:
            pass
    return mat


def paint_palette(bm, faces, swatch_key):
    """Assign `palette.uv(swatch_key)` to every loop of `faces`."""
    uvl = bm.loops.layers.uv.verify()
    u, v = palette.uv(swatch_key)
    for f in faces:
        for loop in f.loops:
            loop[uvl].uv = (u, v)


def paint_face_quad(bm, face, col, row, grid=8, mirror_u=False, pad=0.0):
    """Map a front-facing (-Y) quad to atlas cell `[col, row]` (row 0 at TOP)."""
    uvl = bm.loops.layers.uv.verify()
    u0 = (col + pad) / grid
    u1 = (col + 1.0 - pad) / grid
    v_top = 1.0 - (row + pad) / grid
    v_bot = 1.0 - (row + 1.0 - pad) / grid
    if mirror_u:
        u0, u1 = u1, u0
    xs = [loop.vert.co.x for loop in face.loops]
    zs = [loop.vert.co.z for loop in face.loops]
    xmin, xmax = min(xs), max(xs)
    zmin, zmax = min(zs), max(zs)
    dx = max(xmax - xmin, 1e-6)
    dz = max(zmax - zmin, 1e-6)
    for loop in face.loops:
        tx = (loop.vert.co.x - xmin) / dx
        tz = (loop.vert.co.z - zmin) / dz
        u = u0 + tx * (u1 - u0)
        v = v_bot + tz * (v_top - v_bot)
        loop[uvl].uv = (u, v)


def ensure_color_layer(bm, name=COLOR_LAYER):
    """Get or create the float_color loop layer exported as glTF `COLOR_0`."""
    return bm.loops.layers.float_color.get(name) or bm.loops.layers.float_color.new(name)


def set_body_colors(bm, vert_region_ids, face_slot_map=None, layer_name=COLOR_LAYER):
    """Set `COLOR_0` RGBA per contract §3 on a body bmesh:
    - body faces: (region_id / 255, 0, 0, 1) per vertex
    - face quads (`face_slot_map[f]` in {'eye','brow','mouth'}): (1,0,0,1) / (0,1,0,1) / (0,0,1,1)
    """
    col = ensure_color_layer(bm, layer_name)
    slot_rgba = {
        "eye": (1.0, 0.0, 0.0, 1.0),
        "brow": (0.0, 1.0, 0.0, 1.0),
        "mouth": (0.0, 0.0, 1.0, 1.0),
    }
    face_slot_map = face_slot_map or {}
    for f in bm.faces:
        slot = face_slot_map.get(f)
        if slot is not None:
            rgba = slot_rgba[slot]
            for loop in f.loops:
                loop[col] = rgba
        else:
            for loop in f.loops:
                rid = vert_region_ids[loop.vert]
                loop[col] = (rid / 255.0, 0.0, 0.0, 1.0)


def set_garment_colors(bm, face_tint_map=None, shade=1.0, layer_name=COLOR_LAYER):
    """Set `COLOR_0` RGBA on a garment/hair/accessory bmesh:
    R = primary tint, G = secondary tint, B = accent tint, A = shade (0.6..1.0).
    `face_tint_map` maps face -> 'primary' | 'secondary' | 'accent' | 'none' | (r, g, b).
    """
    col = ensure_color_layer(bm, layer_name)
    tint_rgb = {
        "primary": (1.0, 0.0, 0.0),
        "secondary": (0.0, 1.0, 0.0),
        "accent": (0.0, 0.0, 1.0),
        "none": (0.0, 0.0, 0.0),
    }
    face_tint_map = face_tint_map or {}
    for f in bm.faces:
        t = face_tint_map.get(f, "none")
        rgb = tint_rgb[t] if isinstance(t, str) else tuple(t[:3])
        a = shade[f] if isinstance(shade, dict) else float(shade)
        rgba = (float(rgb[0]), float(rgb[1]), float(rgb[2]), max(0.6, min(1.0, a)))
        for loop in f.loops:
            loop[col] = rgba


def bmesh_to_mesh(bm, mesh_name, materials, color_layer=COLOR_LAYER):
    """Convert bmesh to a Blender Mesh, attach materials, and activate COLOR_0."""
    me = bpy.data.meshes.new(mesh_name)
    bm.to_mesh(me)
    bm.free()
    for mat in materials:
        me.materials.append(mat)
    idx = me.color_attributes.find(color_layer)
    if idx >= 0:
        me.color_attributes.active_color = me.color_attributes[idx]
        me.color_attributes.render_color_index = idx
    return me


def create_skinned_object(name, mesh, arm, weights_by_vert):
    """Create mesh object parented to `arm`, bind Armature modifier, and assign
    normalized vertex weights (max 4 influences per vertex).
    `weights_by_vert` is a list of `[(bone_name, weight), ...]` indexed by vertex index.
    """
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = arm
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    for bname in rig.BONE_NAMES:
        ob.vertex_groups.new(name=bname)
    for vi, pairs in enumerate(weights_by_vert):
        filtered = sorted(((b, float(w)) for b, w in pairs if w > 1e-6), key=lambda x: -x[1])[:4]
        total = sum(w for _, w in filtered)
        if total <= 0:
            raise ValueError(f"vertex {vi} has zero total skin weight")
        for b, w in filtered:
            ob.vertex_groups[b].add([vi], w / total, "REPLACE")
    return ob


def add_shape_keys(ob, deltas_by_key):
    """Add `Basis` and all `rig.SHAPE_KEYS` in frozen contract order.
    `deltas_by_key[key]` is a sequence of `(dx, dy, dz)` or `Vector` per vertex.
    """
    ob.shape_key_add(name="Basis", from_mix=False)
    nverts = len(ob.data.vertices)
    base_cos = [ob.data.vertices[i].co.copy() for i in range(nverts)]
    for key in rig.SHAPE_KEYS:
        sk = ob.shape_key_add(name=key, from_mix=False)
        deltas = deltas_by_key.get(key)
        if deltas is None:
            for i in range(nverts):
                sk.data[i].co = base_cos[i]
        else:
            for i in range(nverts):
                sk.data[i].co = base_cos[i] + Vector(deltas[i])
    return ob


def export_character_glb(root_ob, objs, path, *, skinned=True, has_morphs=True):
    """Export character/garment/accessory GLB with deterministic contract settings."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    stem = os.path.splitext(os.path.basename(path))[0]
    root_ob.name = stem
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root_ob
    want = dict(
        filepath=os.path.abspath(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False if skinned else True,
        export_tangents=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True,
        export_normals=True,
        export_texcoords=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_skins=skinned,
        export_influence_nb=4,
        export_all_influences=False,
        export_def_bones=False,
        export_morph=has_morphs,
        export_morph_normal=has_morphs,
        export_morph_tangent=False,
        export_try_sparse_sk=False,
        export_copyright="AI Office project (CC0-1.0)",
    )
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})


def register_targets(family, entries):
    """Replace `family` entries in `art/targets.json` without disturbing other families."""
    targets = []
    if os.path.exists(TARGETS_JSON):
        with open(TARGETS_JSON, encoding="utf-8") as fh:
            targets = json.load(fh)["targets"]
    targets = [t for t in targets if t["family"] != family] + list(entries)
    targets.sort(key=lambda t: (t["family"], t["name"]))
    os.makedirs(os.path.dirname(TARGETS_JSON), exist_ok=True)
    with open(TARGETS_JSON, "w", encoding="utf-8") as fh:
        fh.write(
            '{\n  "targets": [\n'
            + ",\n".join("    " + json.dumps(t, ensure_ascii=False) for t in targets)
            + "\n  ]\n}\n"
        )


def export_rig_json(path=RIG_JSON):
    """Export frozen rig bone names/order and shape keys from `rig.py` to `art/rig.json`."""
    data = {
        "height": rig.HEIGHT,
        "bones": list(rig.BONE_NAMES),
        "deformBones": list(rig.DEFORM_BONES),
        "attachBones": list(rig.ATTACH_BONES),
        "shapeKeys": list(rig.SHAPE_KEYS),
        "joints": {k: [round(v.x, 6), round(v.y, 6), round(v.z, 6)] for k, v in rig.JOINT.items()},
        "tails": {k: [round(v.x, 6), round(v.y, 6), round(v.z, 6)] for k, v in rig.TAIL.items()},
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")
    return data
