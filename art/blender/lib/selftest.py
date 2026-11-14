"""Self-test for character export helpers (P07a-T02 acceptance).

    Blender -b -P art/blender/lib/selftest.py
"""
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from lib import charexport, export, palette, rig  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = os.path.join(palette.ROOT, "art", ".cache", "selftest")
    if "--out" in argv:
        out_dir = os.path.abspath(argv[argv.index("--out") + 1])
    os.makedirs(out_dir, exist_ok=True)

    # 1. Static cube with M_Palette + COLOR_0
    export.clear_scene()
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=0.5)
    bm.loops.layers.uv.verify()
    charexport.paint_palette(bm, bm.faces, "jade_600")
    charexport.set_garment_colors(bm, {f: "primary" for f in bm.faces}, shade=1.0)
    me = charexport.bmesh_to_mesh(bm, "selftest_cube_mesh", [palette.material("palette")])
    ob = bpy.data.objects.new("selftest_cube", me)
    bpy.context.scene.collection.objects.link(ob)
    cube_glb = os.path.join(out_dir, "selftest_cube.glb")
    charexport.export_character_glb(ob, [ob], cube_glb, skinned=False, has_morphs=False)
    assert os.path.getsize(cube_glb) > 0, "selftest_cube.glb is empty"

    # 2. Skinned + morph cube with rig.build_armature()
    export.clear_scene()
    arm = rig.build_armature("selftest_char")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=0.4)
    bm.loops.layers.uv.verify()
    charexport.paint_palette(bm, bm.faces, "skin_01")
    vert_regions = {v: 0 for v in bm.verts}
    charexport.set_body_colors(bm, vert_regions)
    me = charexport.bmesh_to_mesh(bm, "selftest_char_mesh", [palette.material("palette")])
    weights = [[("Hips", 1.0)] for _ in range(len(me.vertices))]
    ob = charexport.create_skinned_object("selftest_char_mesh", me, arm, weights)
    deltas = {
        k: [Vector((0.02, 0.0, 0.0)) if k == "Heavy" else Vector((0.0, 0.0, 0.0)) for _ in me.vertices]
        for k in rig.SHAPE_KEYS
    }
    charexport.add_shape_keys(ob, deltas)
    char_glb = os.path.join(out_dir, "selftest_char.glb")
    charexport.export_character_glb(arm, [arm, ob], char_glb, skinned=True, has_morphs=True)
    assert os.path.getsize(char_glb) > 0, "selftest_char.glb is empty"

    print(f"SELFTEST OK cube={os.path.getsize(cube_glb)}B char={os.path.getsize(char_glb)}B")


if __name__ == "__main__":
    main()
