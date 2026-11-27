"""Overview render (phase-06a §3.6): a mock department corner assembled from the kit,
to judge the set together and to prove the modules tile.

    Blender -b --factory-startup -P art/blender/overview_sheet.py -- --out art/.cache/sheets/overview.png
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import palette  # noqa: E402
from lib.export import clear_scene  # noqa: E402
from lib.render import import_glb, silhouette, studio  # noqa: E402

RAW = os.path.join(palette.ROOT, "art", ".cache", "raw")


def place(name, x, z, rot=0.0, y=0.0, keep_pose=None):
    """Place a model at author coordinates (x, y, z) with a yaw in degrees."""
    path = next(os.path.join(RAW, c, name + ".glb") for c in ("env", "props", "decor")
                if os.path.exists(os.path.join(RAW, c, name + ".glb")))
    root, new = import_glb(path)
    root.rotation_mode = "XYZ"
    root.location = (x, -z, y)
    root.rotation_euler = (0, 0, math.radians(rot))
    if keep_pose:
        for ob in new:
            if ob.name.startswith("pose_") and not ob.name.startswith(keep_pose):
                bpy.data.objects.remove(ob, do_unlink=True)
    return root


def person(x, z, rot=0.0):
    s = silhouette()
    s.location = (x, -z, 0)
    s.rotation_euler = (0, 0, math.radians(rot))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    out = os.path.abspath(argv[argv.index("--out") + 1])
    clear_scene()
    scene = bpy.context.scene

    for x in (-4, 0, 4):                                   # 12 x 8 m floor plate
        for z in (-2, 2):
            place("slab_floor_01", x, z)
        place("wall_window_01", x, 4)
        place("ceiling_edge_01", x, -4)
        place("ground_plaza_01", x, -6, y=-0.3)
    for z in (-2, 2):
        place("wall_solid_01", -6, z, rot=90)
    place("column_01", 6 - 0.2, -4 + 0.2)
    place("column_01", -6 + 0.2, -4 + 0.2)

    for x in (-4.3, -2.8):                                 # desk cluster, face to face
        for i, (z, rot, variant) in enumerate(((0.0, 0, "01"), (0.76, 180, "02"))):
            place(f"desk_standard_{variant}", x, z, rot=rot)
            place("chair_office_01", x, z - 0.6 if rot == 0 else z + 0.6, rot=180 if rot == 0 else 0)
        place("partition_low_01", x, 0.38)
    place("desk_review_01", -0.6, 2.9, rot=180)
    place("chair_office_01", -0.6, 3.5)
    place("bench_waiting_01", -0.6, 1.5)
    place("cabinet_file_01", -5.6, 3.5)
    place("shelf_open_01", -4.7, 3.7)
    place("printer_01", -5.55, -2.6, rot=-90)
    place("plant_monstera_01", -5.4, 1.9)
    place("plant_snake_01", 0.6, -3.4)
    place("water_dispenser_01", -1.6, 3.6)
    place("bin_01", -2.0, 0.4)

    place("office_glass_wall_01", 2, 0)                    # glazed manager office, 5 x 4 m
    place("office_glass_door_01", 3.5, 0)
    place("office_glass_wall_01", 5, 0)
    for z in (1, 3):
        place("office_glass_wall_01", 1, z, rot=90)
    place("desk_manager_01", 3.4, 2.5, rot=180)
    place("chair_office_02", 3.5, 3.25)
    place("chair_visitor_01", 3.0, 1.3, rot=180)
    place("cabinet_file_02", 5.4, 3.6)
    place("plant_ficus_01", 1.6, 3.5)
    place("rug_large_01", 3.4, 1.9)

    place("sofa_2seat_01", 3.6, -2.6, rot=180)
    place("table_cafe_01", 3.6, -1.4)
    place("cat_01", 1.6, -1.2, rot=140, keep_pose="pose_loaf")
    for x, z in ((-3.5, 0.4), (3.4, 2.0)):
        place("light_ceiling_01", x, z, y=3.7)
    place("fan_ceiling_01", 0.5, -1.5, y=3.7)
    person(-1.9, -1.6, 160)
    person(2.6, -0.9, 30)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 38
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = Vector((5.5, 15.5, 9.0))                # in front (-Z side), above
    cam.rotation_euler = (Vector((0.2, -0.2, 1.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    studio(scene, out, sun_rot=(48, -8, 200))
    bpy.ops.render.render(write_still=True)
    print("SHEET", out)


main()
