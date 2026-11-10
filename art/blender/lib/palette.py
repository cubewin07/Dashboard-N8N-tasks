"""Palette access + the three shared materials (assets.md §1.2, §1.3)."""
import json
import os

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PALETTE_JSON = os.path.join(ROOT, "src", "content", "palette3d.json")
PALETTE_PNG = os.path.join(ROOT, "public", "assets", "textures", "palette.png")
GRID = 16

with open(PALETTE_JSON, encoding="utf-8") as _fh:
    _DATA = json.load(_fh)
SWATCHES = {s["key"]: s for s in _DATA["swatches"]}


def uv(key):
    """Centre of the swatch cell in Blender UV space (v = 0 at the bottom)."""
    try:
        s = SWATCHES[key]
    except KeyError:
        raise SystemExit(f"unknown palette swatch: {key!r}")
    return ((s["col"] + 0.5) / GRID, 1.0 - (s["row"] + 0.5) / GRID)


def _image():
    img = bpy.data.images.get("palette.png")
    if img is None:
        img = bpy.data.images.load(PALETTE_PNG)
        img.name = "palette.png"
        img.colorspace_settings.name = "sRGB"
    return img


def material(kind):
    """kind: 'palette' | 'glass' | 'emissive' -> M_Palette / M_Glass / M_Emissive."""
    name = {"palette": "M_Palette", "glass": "M_Glass", "emissive": "M_Emissive"}[kind]
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = _image()
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.85
    mat.use_backface_culling = True
    if kind == "glass":
        bsdf.inputs["Roughness"].default_value = 0.1
        bsdf.inputs["Alpha"].default_value = 0.25
        mat.use_backface_culling = False
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(mat, attr, val)
            except Exception:
                pass
    if kind == "emissive":
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.0
    return mat
