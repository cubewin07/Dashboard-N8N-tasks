"""Shared render helpers for contact sheets and the overview render (assets.md §3)."""
import math
import os

import bpy
from mathutils import Vector

from .mesh import Model


def plain_material(name, rgb):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = 0.9
    return mat


def silhouette():
    """Grey 1.70 m figure for scale."""
    m = Model("silhouette")
    g = "n_08"
    for sx in (-1, 1):
        m.box(0.13, 0.82, 0.15, at=(sx * 0.09, 0, 0), sw=g, taper=(1.15, 1.1))
        m.box(0.09, 0.62, 0.1, at=(sx * 0.25, 0.78, 0), sw=g)
    m.box(0.36, 0.56, 0.2, at=(0, 0.82, 0), sw=g, taper=(1.15, 1.0), bevel=0.03)
    m.cyl(0.05, 0.08, at=(0, 1.38, 0), sw=g, seg=6)
    m.sphere(0.13, at=(0, 1.57, 0), sw=g, sub=2)
    root, objs = m.build()
    grey = plain_material("silhouette", (0.35, 0.36, 0.38))
    for ob in objs:
        if ob.type == "MESH":
            ob.data.materials.clear()
            ob.data.materials.append(grey)
    return root


def import_glb(path):
    """Import one GLB and return its root object."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    new = [o for o in bpy.data.objects if o not in before]
    return next(o for o in new if o.parent is None), new


def world_bounds(root):
    pts = []
    for ob in [root, *root.children_recursive]:
        if ob.type == "MESH":
            pts += [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def checker_floor(lo, hi, margin=1.0):
    """Ground plane with 0.5 m checker squares."""
    bpy.ops.mesh.primitive_plane_add(size=1)
    floor = bpy.context.object
    floor.scale = (hi.x - lo.x + margin, hi.y - lo.y + margin, 1)
    floor.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, -0.002)
    fm = plain_material("floor", (0.6, 0.6, 0.6))
    nt = fm.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    chk = nt.nodes.new("ShaderNodeTexChecker")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    chk.inputs["Scale"].default_value = 2.0
    chk.inputs["Color1"].default_value = (0.62, 0.61, 0.58, 1)
    chk.inputs["Color2"].default_value = (0.48, 0.47, 0.45, 1)
    nt.links.new(geo.outputs["Position"], chk.inputs["Vector"])
    nt.links.new(chk.outputs["Color"], bsdf.inputs["Base Color"])
    floor.data.materials.append(fm)
    return floor


def studio(scene, out, sun_rot=(50, -12, 150)):
    """Neutral sun + sky, EEVEE, Standard view transform (palette colours stay true)."""
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    scene.collection.objects.link(sun)
    sun.data.energy = 3.2
    sun.data.angle = math.radians(8)
    sun.rotation_euler = tuple(math.radians(a) for a in sun_rot)
    world = bpy.data.worlds.new("w")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.9, 0.9, 0.92, 1)
    bg.inputs["Strength"].default_value = 0.75
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = out
