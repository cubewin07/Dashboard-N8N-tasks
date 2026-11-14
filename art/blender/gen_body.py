"""Generator for the two base character bodies (female & male, 1.70 m, 6 shape keys).

    Blender -b --factory-startup --python-exit-code 1 -P art/blender/gen_body.py -- \
        --out art/.cache/raw [--only body_female,body_male]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import bodyshape, charexport, export, palette, rig  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = os.path.join(palette.ROOT, "art", ".cache", "raw")
    only = None
    i = 0
    while i < len(argv):
        if argv[i] == "--out":
            out = os.path.abspath(argv[i + 1])
            i += 2
        elif argv[i] == "--only":
            only = set(argv[i + 1].split(","))
            i += 2
        else:
            i += 1

    charexport.export_rig_json()

    bases = ("female", "male")
    entries = []
    meta_bases = {}
    head_signatures = {}

    for base in bases:
        name = f"body_{base}"
        entries.append({
            "name": name,
            "family": "body",
            "script": "art/blender/gen_body.py",
            "out": f"public/assets/models/characters/{name}.glb",
            "budget": "body",
            "anchors": [],
            "nodes": [],
            "source": "generated",
        })
        if only and name not in only:
            continue

        export.clear_scene()
        arm, ob, base_meta = bodyshape.build_base_body(base)

        # Contract sanity assertions
        verts = ob.data.vertices
        z_min = min(v.co.z for v in verts)
        z_max = max(v.co.z for v in verts)
        assert abs(z_min) < 1e-4, f"{name} min z={z_min} != 0"
        assert rig.HEIGHT - 1e-3 <= z_max <= 1.75, f"{name} max z={z_max} out of [1.70, 1.75]"
        assert base_meta["tris"] <= 3000, f"{name} tris={base_meta['tris']} > 3000"

        head_sig = sorted((round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5)) for v in verts if v.co.z > 1.44)
        head_signatures[base] = head_sig

        # Ensure no shape key moves z > 1.44
        for key in rig.SHAPE_KEYS:
            sk = ob.data.shape_keys.key_blocks[key]
            for idx, v in enumerate(verts):
                if v.co.z > 1.44:
                    d = (sk.data[idx].co - v.co).length
                    assert d < 1e-6, f"{name} {key} moved head vertex {idx} (z={v.co.z:.3f}) by {d:.5f}"

        glb_path = os.path.join(out, "characters", f"{name}.glb")
        charexport.export_character_glb(arm, [arm, ob], glb_path, skinned=True, has_morphs=True)
        meta_bases[base] = base_meta
        print(f"BUILT {name} tris={base_meta['tris']} keys={','.join(rig.SHAPE_KEYS)}")

    if len(head_signatures) == 2:
        assert head_signatures["female"] == head_signatures["male"], "female and male head meshes differ!"

    if meta_bases:
        meta_path = os.path.join(out, "characters", "body.meta.json")
        # Preserve existing base entry if --only built only one
        if os.path.exists(meta_path) and len(meta_bases) < 2:
            with open(meta_path, encoding="utf-8") as fh:
                prev = json.load(fh).get("bases", {})
            prev.update(meta_bases)
            meta_bases = prev
        meta_doc = {
            "regions": bodyshape.REGIONS,
            "bases": meta_bases,
        }
        os.makedirs(os.path.dirname(meta_path), exist_ok=True)
        with open(meta_path, "w", encoding="utf-8") as fh:
            json.dump(meta_doc, fh, indent=2)
            fh.write("\n")

    charexport.register_targets("body", entries)


if __name__ == "__main__":
    main()
