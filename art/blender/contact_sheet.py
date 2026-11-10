"""Contact sheet: a family's GLBs side by side on a 0.5 m checker floor with a
1.70 m silhouette (phase-06a §3.6).

    Blender -b --factory-startup -P art/blender/contact_sheet.py -- \
        --out art/out/contact-sheet-desks.png a.glb b.glb ...
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import clear_scene  # noqa: E402
from lib.mesh import Model  # noqa: E402

ROW_WIDTH = 11.0
GAP = 0.7


def silhouette():
    m = Model("silhouette")
    g = "n_08"
    for sx in (-1, 1):
        m.box(0.13, 0.82, 0.15, at=(sx * 0.09, 0, 0), sw=g, taper=(1.15, 1.1))
        m.box(0.09, 0.62, 0.1, at=(sx * 0.25, 0.78, 0), sw=g)
    m.box(0.36, 0.56, 0.2, at=(0, 0.82, 0), sw=g, taper=(1.15, 1.0), bevel=0.03)
    m.cyl(0.05, 0.08, at=(0, 1.38, 0), sw=g, seg=6)
    m.sphere(0.13, at=(0, 1.57, 0), sw=g, sub=2)
    root, objs = m.build()
    grey = bpy.data.materials.new("silhouette")
    grey.diffuse_color = (0.35, 0.36, 0.38, 1)
    try:
        grey.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in grey.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.35, 0.36, 0.38, 1)
    for ob in objs:
        if ob.type == "MESH":
            ob.data.materials.clear()
            ob.data.materials.append(grey)
    return root


def world_bounds(root):
    pts = []
    for ob in [root, *root.children_recursive]:
        if ob.type == "MESH":
            pts += [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    out = os.path.abspath(argv[argv.index("--out") + 1])
    files = [a for a in argv if a.endswith(".glb")]
    clear_scene()
    scene = bpy.context.scene

    items = []
    for f in files:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.abspath(f))
        new = [o for o in bpy.data.objects if o not in before]
        root = next(o for o in new if o.parent is None)
        for k, ob in enumerate(sorted((o for o in new if o.name.startswith("pose_")), key=lambda o: o.name)):
            ob.location.x += k * 0.55  # alternate poses share an origin: spread them for the sheet only
        bpy.context.view_layer.update()
        items.append((os.path.basename(f)[:-4], root, *world_bounds(root)))

    # rows run along X; each further row sits behind (-Y) because fronts face +Y
    small = all(max(hi - lo) < 0.6 for _n, _r, lo, hi in items)   # props: tighter grid, smaller labels
    gap, row_gap, label = (0.3, 0.6, 0.05) if small else (GAP, 1.9, 0.15)
    area = sum((hi.x - lo.x + gap) * (hi.y - lo.y + row_gap) for _n, _r, lo, hi in items)
    row_width = min(ROW_WIDTH, max(2.4, 1.2 + (area ** 0.5) * 1.5))
    x = 1.2
    y = 0.0
    row_depth = 0.0
    placed = []
    sil_rows = [0.0]
    for name, root, lo, hi in items:
        w, d = hi.x - lo.x, hi.y - lo.y
        if x + w > row_width and x > 1.2:
            y -= row_depth + row_gap
            x, row_depth = 1.2, 0.0
            sil_rows.append(y)
        root.location.x += -(x + w) - lo.x  # camera looks from +Y, so -X reads left-to-right
        root.location.y += y - hi.y
        root.location.z -= lo.z  # wall / ceiling / held items have their pivot above their lowest point
        placed.append((name, -(x + w / 2), y, hi.z - lo.z))
        x += w + gap
        row_depth = max(row_depth, d)
    for ry in sil_rows:
        s = silhouette()
        s.location = (-0.45, ry - 0.3, 0)

    # labels lying on the floor in front of each item, readable from the camera
    for name, cx, fy, _h in placed:
        cu = bpy.data.curves.new(name, "FONT")
        cu.body = name
        cu.size = label
        cu.align_x = "CENTER"
        ob = bpy.data.objects.new("label_" + name, cu)
        scene.collection.objects.link(ob)
        ob.location = (cx, fy + label * 2.2, 0.005)
        ob.rotation_euler = (0, 0, math.pi)
        mat = bpy.data.materials.get("label") or bpy.data.materials.new("label")
        mat.diffuse_color = (0.05, 0.05, 0.05, 1)
        try:
            mat.use_nodes = True
        except Exception:
            pass
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (0.03, 0.03, 0.03, 1)
        cu.materials.append(mat)

    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in bpy.data.objects:
        if ob.type in {"MESH", "FONT"}:
            for c in ob.bound_box:
                p = ob.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, p))
                hi = Vector(map(max, hi, p))

    # checker floor, 0.5 m squares
    bpy.ops.mesh.primitive_plane_add(size=1)
    floor = bpy.context.object
    floor.scale = (hi.x - lo.x + 1.0, hi.y - lo.y + 1.0, 1)
    floor.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, -0.002)
    fm = bpy.data.materials.new("floor")
    try:
        fm.use_nodes = True
    except Exception:
        pass
    nt = fm.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    chk = nt.nodes.new("ShaderNodeTexChecker")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    chk.inputs["Scale"].default_value = 2.0
    chk.inputs["Color1"].default_value = (0.62, 0.61, 0.58, 1)
    chk.inputs["Color2"].default_value = (0.48, 0.47, 0.45, 1)
    nt.links.new(geo.outputs["Position"], chk.inputs["Vector"])
    nt.links.new(chk.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    floor.data.materials.append(fm)

    # 3/4 orthographic camera looking at the fronts (+Y side)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    az, el = math.radians(-28), math.radians(32)
    direction = Vector((-math.sin(az) * math.cos(el), math.cos(el) * math.cos(az), math.sin(el)))
    centre = (lo + hi) / 2
    cam.location = centre + direction * 60
    cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for cx in (lo.x, hi.x):
        for cy in (lo.y, hi.y):
            for cz in (0, hi.z):
                p = inv @ Vector((cx, cy, cz))
                xs.append(p.x)
                ys.append(p.y)
    wv, hv = max(xs) - min(xs) + 0.3, max(ys) - min(ys) + 0.3
    cam.location += cam.matrix_world.to_3x3() @ Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, 0))
    scene.render.resolution_x = 1600
    scene.render.resolution_y = max(300, int(1600 * hv / wv))
    cam_data.ortho_scale = max(wv, hv)
    cam_data.clip_end = 200

    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    scene.collection.objects.link(sun)
    sun.data.energy = 3.2
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(50), math.radians(-12), math.radians(150))
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
    bpy.ops.render.render(write_still=True)
    print("SHEET", out, scene.render.resolution_x, scene.render.resolution_y)


main()
