"""Generator for every rigid wardrobe item (hair, face hair, hats, glasses, jewellery, bags...).

Items are registered by the modules in ``art/blender/items_rigid/`` (one per batch). All geometry
is derived from ``lib.rigid_common.build_body_probe()`` (real head/neck/torso of both bases), so
re-running after a body proportion update refits every item.

Outputs ``<out>/wardrobe/<id>.glb`` + ``<id>.meta.json`` and refreshes the ``rigid`` family in
``art/targets.json``.

Usage:
    Blender -b --factory-startup --python-exit-code 1 -P art/blender/gen_rigid.py -- \
        --out art/.cache/raw [--only hair_short_01,glasses_round_01] [--list]
"""

from __future__ import annotations

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import charexport, export, palette  # noqa: E402
from lib.rigid_common import (  # noqa: E402
    HAIR_MAX_UNDER_HAT_M,
    build_body_probe,
    check_face_quads_clear,
    hair_crown_max_offset,
    hatcut,
    measure_min_scalp_distance,
)
import items_rigid  # noqa: E402


def write_rigid_meta(out_dir: str, item_id: str, slot: str, bone: str, extra: dict | None = None) -> str:
    """Write `<out_dir>/wardrobe/<id>.meta.json` matching CHARACTER-PIPELINE §5."""
    meta = {
        "id": item_id,
        "slot": slot,
        "kind": "rigid",
        "bone": bone,
        "merge": True,
        "bases": {
            "female": {"file": f"models/wardrobe/{item_id}.glb", "offset": [0, 0, 0], "scale": 1},
            "male": {"file": f"models/wardrobe/{item_id}.glb", "offset": [0, 0, 0], "scale": 1},
        },
    }
    meta.update(extra or {})
    meta_path = os.path.join(out_dir, "wardrobe", f"{item_id}.meta.json")
    os.makedirs(os.path.dirname(meta_path), exist_ok=True)
    with open(meta_path, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
        fh.write("\n")
    return meta_path


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = os.path.join(palette.ROOT, "art", ".cache", "raw")
    only: set[str] | None = None
    list_only = False
    i = 0
    while i < len(argv):
        if argv[i] == "--out":
            out = os.path.abspath(argv[i + 1])
            i += 2
        elif argv[i] == "--only":
            only = {s.strip() for s in argv[i + 1].split(",") if s.strip()}
            i += 2
        elif argv[i] == "--list":
            list_only = True
            i += 1
        else:
            i += 1

    registry = items_rigid.load_all()
    if list_only:
        for it in registry.values():
            print(f"{it.id}\t{it.slot}\t{it.bone}\t{it.module}")
        return 0
    if only:
        unknown = sorted(only - set(registry))
        # The art:build wrapper passes one --only list to every family; ignore other families' ids.
        only = only & set(registry)
        if unknown and not only:
            return 0

    probe = build_body_probe()

    for it in registry.values():
        if only is not None and it.id not in only:
            continue

        export.clear_scene()
        bm = it.build(probe)

        tris = sum(len(f.verts) - 2 for f in bm.faces)
        is_hair = it.slot == "hair"
        face_clear = check_face_quads_clear(bm, probe) if is_hair else True
        min_scalp_mm = measure_min_scalp_distance(bm, probe) * 1000.0 if is_hair else 0.0
        meta_extra = dict(it.meta)
        if is_hair:
            # Every hair also ships a crown-less variant worn under hats (meta hairClip=crown).
            crown_mm = hair_crown_max_offset(bm, probe) * 1000.0
            cut_bm = hatcut(bm, probe)
            cut_id = f"{it.id}_hatcut"
            cut_me = charexport.bmesh_to_mesh(cut_bm, cut_id, [palette.material("palette")])
            cut_ob = bpy.data.objects.new(cut_id, cut_me)
            bpy.context.scene.collection.objects.link(cut_ob)
            charexport.export_character_glb(
                cut_ob, [cut_ob], os.path.join(out, "wardrobe", f"{cut_id}.glb"), skinned=False, has_morphs=False
            )
            bpy.data.objects.remove(cut_ob)
            meta_extra["hatcut"] = f"models/wardrobe/{cut_id}.glb"
            if crown_mm > HAIR_MAX_UNDER_HAT_M * 1000.0:
                print(f"WARN {it.id}: hair {crown_mm:.1f} mm off the scalp at the hat band (max {HAIR_MAX_UNDER_HAT_M * 1000:.0f})")

        me = charexport.bmesh_to_mesh(bm, it.id, [palette.material("palette")])
        ob = bpy.data.objects.new(it.id, me)
        bpy.context.scene.collection.objects.link(ob)

        glb_path = os.path.join(out, "wardrobe", f"{it.id}.glb")
        charexport.export_character_glb(ob, [ob], glb_path, skinned=False, has_morphs=False)
        write_rigid_meta(out, it.id, it.slot, it.bone, meta_extra)

        extra = f" minScalpMm={min_scalp_mm:.2f} faceClear={face_clear} crownMm={crown_mm:.1f}" if is_hair else ""
        print(f"BUILT {it.id} tris={tris} bone={it.bone}{extra}")

    target_entries = [
        {
            "name": it.id,
            "family": "rigid",
            "script": "art/blender/gen_rigid.py",
            "out": f"public/assets/models/wardrobe/{it.id}.glb",
            "budget": "hair" if it.slot == "hair" else "accessory",
            "anchors": [],
            "nodes": [],
            "source": "generated",
        }
        for it in registry.values()
    ] + [
        {
            "name": f"{it.id}_hatcut",
            "family": "rigid",
            "script": "art/blender/gen_rigid.py",
            "out": f"public/assets/models/wardrobe/{it.id}_hatcut.glb",
            "budget": "hair",
            "anchors": [],
            "nodes": [],
            "source": "generated",
        }
        for it in registry.values()
        if it.slot == "hair"
    ]
    charexport.register_targets("rigid", target_entries)
    return 0


if __name__ == "__main__":
    sys.exit(main())
