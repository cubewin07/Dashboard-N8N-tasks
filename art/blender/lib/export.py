"""Registry, CLI and fixed-settings GLB export for generator scripts.

    @model("props", budget="furniture", anchors=["seat", "screen"])
    def desk_standard_01(m): ...
    if __name__ == "__main__": run(__file__)

    Blender -b --factory-startup -P art/blender/gen_desks.py -- --out art/.cache/raw [--only a,b]
"""
import json
import os
import sys

import bpy

from . import palette
from .mesh import Model

REGISTRY = []  # (name, fn, meta) in definition order


def model(category, budget="furniture", anchors=(), nodes=()):
    def deco(fn):
        REGISTRY.append((fn.__name__, fn, {
            "category": category, "budget": budget,
            "anchors": list(anchors), "nodes": list(nodes)}))
        return fn
    return deco


def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)


def export_glb(objs, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for ob in bpy.data.objects:
        ob.select_set(False)
    for ob in objs:
        ob.select_set(True)
    want = dict(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True,
        export_apply=True, export_tangents=False, export_cameras=False,
        export_lights=False, export_animations=False, export_extras=False,
        # the baked AO (lib/ao.py) is each mesh's active colour attribute -> COLOR_0
        export_vertex_color="ACTIVE", export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True, export_normals=True, export_texcoords=True,
        export_materials="EXPORT", export_image_format="AUTO", export_skins=False,
        export_morph=False, export_copyright="AI Office project (CC0-1.0)",
    )
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})


def build_model(name, fn):
    clear_scene()
    m = Model(name)
    fn(m)
    tris = m.tris()
    _root, objs = m.build()
    return m, objs, tris


def run(script_file):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = os.path.join(palette.ROOT, "art", ".cache", "raw")
    only = None
    i = 0
    while i < len(argv):
        if argv[i] == "--out":
            out = os.path.abspath(argv[i + 1]); i += 2
        elif argv[i] == "--only":
            only = set(argv[i + 1].split(",")); i += 2
        else:
            i += 1
    family = os.path.splitext(os.path.basename(script_file))[0].replace("gen_", "")
    script_rel = os.path.relpath(os.path.abspath(script_file), palette.ROOT)
    entries = []
    for name, fn, meta in REGISTRY:
        entries.append({
            "name": name, "family": family, "script": script_rel,
            "out": f"public/assets/models/{meta['category']}/{name}.glb",
            "budget": meta["budget"], "anchors": meta["anchors"], "nodes": meta["nodes"],
            "source": "generated"})
        if only and name not in only:
            continue
        _m, objs, tris = build_model(name, fn)
        export_glb(objs, os.path.join(out, meta["category"], name + ".glb"))
        print(f"BUILT {name} tris={tris}")
    # keep art/targets.json in sync with what this script defines
    tpath = os.path.join(palette.ROOT, "art", "targets.json")
    targets = []
    if os.path.exists(tpath):
        with open(tpath, encoding="utf-8") as fh:
            targets = json.load(fh)["targets"]
    targets = [t for t in targets if t["family"] != family] + entries
    targets.sort(key=lambda t: (t["family"], t["name"]))
    with open(tpath, "w", encoding="utf-8") as fh:
        fh.write('{\n  "targets": [\n' + ",\n".join(
            "    " + json.dumps(t, ensure_ascii=False) for t in targets) + "\n  ]\n}\n")
