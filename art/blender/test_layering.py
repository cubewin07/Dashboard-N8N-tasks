"""Garment layering matrix test (P08a-T10).

Checks that an inner garment never pokes through the garment worn over it:

  * every top      x every bottom    (the top is worn over the bottom's waistband)
  * every outer    x every top       (outer over top)
  * every outer    x every fullbody  (outer over dress / ao dai / suit ...)

for each body base both items support, at 6 slider corners. A corner is clamped to the
intersection of the default slider range and both items' ``bodyLimits`` (the runtime does
the same intersection, see ``src/scene/characters/bodyMap.ts``).

Poke-through is measured like the body clipping test in ``lib/fit.py`` (method A), with the
inner garment playing the body: from every inner-garment vertex a ray is cast along its
inward normal; if it hits an outward-facing face of the outer garment within 45 mm, the
inner vertex sits outside the outer garment by that distance.

Pairs listed in either row's optional ``conflicts`` array (item ids that cannot be worn
together; the wardrobe editor swaps them) are reported but do not fail the run.

Reads the raw fitted GLBs + metas in ``art/.cache/raw/wardrobe`` (build them first with
``npm run art:build -- wardrobe``). Writes ``art/out/reports/layering.json``.

    Blender -b --factory-startup --python-exit-code 1 -P art/blender/test_layering.py -- \
        [--raw art/.cache/raw/wardrobe] [--only id1,id2] [--threshold-mm 5]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from lib import fit  # noqa: E402
from lib.export import clear_scene  # noqa: E402

REPO_ROOT = _HERE.parent.parent
CATALOG_DIR = REPO_ROOT / "src/content/catalog"
DEFAULT_RAW = REPO_ROOT / "art/.cache/raw/wardrobe"
REPORT_PATH = REPO_ROOT / "art/out/reports/layering.json"

SHAPE_KEYS = ("Heavy", "Slim", "Muscle", "Chest", "Hips", "Shoulders")
# Each corner pushes the named sliders to the top of the allowed range.
CORNERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("neutral", ()),
    ("heavy", ("Heavy",)),
    ("slim", ("Slim",)),
    ("muscle_shoulders", ("Muscle", "Shoulders")),
    ("chest_hips", ("Chest", "Hips")),
    ("heavy_chest_hips", ("Heavy", "Chest", "Hips")),
)
RAY_MAX_M = 0.045
RAY_START_M = 0.0004
EDGE_IGNORE_M = fit.HIDE_BOUNDARY_DEPTH_M  # 15 mm band along the outer garment's open edges
FACING_DOT = 0.45
LAYER_PAIRS = (("bottom", "top"), ("top", "outer"), ("fullbody", "outer"))  # (inner slot, outer slot)


def load_rows() -> dict[str, dict]:
    rows: dict[str, dict] = {}
    for path in sorted(CATALOG_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for row in data.get("items", []) if isinstance(data, dict) else []:
            if isinstance(row, dict) and "id" in row and "slot" in row and not row.get("retired"):
                rows[row["id"]] = row
    return rows


class Garment:
    """Basis vertices, per-key deltas and triangles of one fitted garment GLB (world space)."""

    def __init__(self, path: Path, limits: dict[str, list[float]]):
        self.limits = limits
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        new = [o for o in bpy.data.objects if o not in before]
        # Skinned garment meshes only (the glTF importer also adds a bone-display icosphere).
        meshes = [o for o in new if o.type == "MESH" and len(o.vertex_groups) > 0]
        if not meshes:
            raise RuntimeError(f"no mesh in {path}")
        self.basis: list[Vector] = []
        self.deltas: dict[str, list[Vector]] = {k: [] for k in SHAPE_KEYS}
        self.tris: list[tuple[int, int, int]] = []
        for ob in meshes:
            mw = ob.matrix_world.copy()
            me = ob.data
            off = len(self.basis)
            n = len(me.vertices)
            sk = me.shape_keys
            blocks = sk.key_blocks if sk is not None else {}
            base_co = [blocks["Basis"].data[i].co.copy() for i in range(n)] if "Basis" in blocks else [v.co.copy() for v in me.vertices]
            self.basis += [mw @ c for c in base_co]
            lin = mw.to_3x3()
            for k in SHAPE_KEYS:
                if k in blocks:
                    kb = blocks[k]
                    self.deltas[k] += [lin @ (kb.data[i].co - base_co[i]) for i in range(n)]
                else:
                    self.deltas[k] += [Vector((0.0, 0.0, 0.0))] * n
            tris, _ = fit._triangulate_mesh_data(me)
            self.tris += [(a + off, b + off, c + off) for a, b, c in tris]
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
        # Open-edge vertices (hem, cuffs, collar): an inner layer emerging right at the outer
        # layer's edge reads as "tucked", not as poke-through, so hits near them are ignored.
        self._bverts, _loops = fit._extract_garment_cap_state(self.tris)
        self._cache: dict[tuple, tuple] = {}

    def at(self, combo: dict[str, float]):
        key = tuple(round(combo.get(k, 0.0), 4) for k in SHAPE_KEYS)
        hit = self._cache.get(key)
        if hit is not None:
            return hit
        verts = [v.copy() for v in self.basis]
        for k, val in combo.items():
            if val:
                d = self.deltas[k]
                for i in range(len(verts)):
                    verts[i] += d[i] * val
        fnormals = []
        for a, b, c in self.tris:
            cr = (verts[b] - verts[a]).cross(verts[c] - verts[a])
            fnormals.append(cr.normalized() if cr.length_squared > 1e-14 else Vector((0.0, 0.0, 0.0)))
        vnormals = fit._compute_smooth_normals(verts, self.tris)
        bvh = BVHTree.FromPolygons(verts, self.tris)
        edges = None
        if self._bverts:
            edges = KDTree(len(self._bverts))
            for j, i in enumerate(self._bverts):
                edges.insert(verts[i], j)
            edges.balance()
        out = (verts, vnormals, fnormals, bvh, edges)
        self._cache[key] = out
        return out


def corner_combo(names: tuple[str, ...], limits_a: dict, limits_b: dict) -> dict[str, float]:
    combo: dict[str, float] = {}
    for k in names:
        hi = fit.DEFAULT_LIMITS[k][1]
        for lim in (limits_a, limits_b):
            if k in lim:
                hi = min(hi, lim[k][1])
        combo[k] = hi
    # Lower bounds can be > 0 (rare); respect them for the untouched sliders too.
    for k in SHAPE_KEYS:
        lo = max(lim.get(k, [0.0])[0] for lim in (limits_a, limits_b))
        if lo > 0 and combo.get(k, 0.0) < lo:
            combo[k] = lo
    return combo


def poke_through_mm(inner: Garment, outer: Garment, combo: dict[str, float]) -> tuple[float, int]:
    iv, ivn, _ifn, _ibvh, _ie = inner.at(combo)
    _ov, _ovn, ofn, obvh, oedge = outer.at(combo)
    worst = 0.0
    count = 0
    for p, n in zip(iv, ivn):
        if n.length_squared < 1e-12:
            continue
        loc, _nrm, idx, dist = obvh.ray_cast(p + n * RAY_START_M, -n, RAY_MAX_M)
        if idx is None or dist is None:
            continue
        if oedge is not None and oedge.find(loc)[2] < EDGE_IGNORE_M:
            continue
        if ofn[idx].dot(n) > FACING_DOT:
            pen = max(0.0, dist - RAY_START_M)
            if pen > 0.0005:
                count += 1
            worst = max(worst, pen)
    return worst * 1000.0, count


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(description="Garment layering matrix test")
    ap.add_argument("--raw", default=str(DEFAULT_RAW))
    ap.add_argument("--only", default="", help="limit to pairs touching these ids")
    ap.add_argument("--threshold-mm", type=float, default=fit.REST_CLIP_LIMIT_MM)
    ap.add_argument("--out", default=str(REPORT_PATH))
    args = ap.parse_args(argv)

    raw = Path(args.raw)
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    rows = load_rows()
    by_slot: dict[str, list[dict]] = {}
    for r in rows.values():
        if r.get("attach") == "skinned" and r.get("model"):
            by_slot.setdefault(r["slot"], []).append(r)

    clear_scene()
    garments: dict[tuple[str, str], Garment] = {}
    missing: list[str] = []

    def get(item_id: str, base: str) -> Garment | None:
        key = (item_id, base)
        if key in garments:
            return garments[key]
        glb = raw / f"{item_id}_{base[0]}.glb"
        meta_path = raw / f"{item_id}.meta.json"
        if not glb.exists() or not meta_path.exists():
            missing.append(glb.name)
            return None
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        limits = (meta.get("bases", {}).get(base, {}) or {}).get("bodyLimits", {}) or {}
        garments[key] = Garment(glb, limits)
        return garments[key]

    t0 = time.time()
    results: list[dict] = []
    for inner_slot, outer_slot in LAYER_PAIRS:
        for inner_row in by_slot.get(inner_slot, []):
            for outer_row in by_slot.get(outer_slot, []):
                if only and inner_row["id"] not in only and outer_row["id"] not in only:
                    continue
                conflict = outer_row["id"] in inner_row.get("conflicts", []) or inner_row["id"] in outer_row.get("conflicts", [])
                for base in ("female", "male"):
                    if base not in inner_row["bases"] or base not in outer_row["bases"]:
                        continue
                    gi, go = get(inner_row["id"], base), get(outer_row["id"], base)
                    if gi is None or go is None:
                        continue
                    corners = {}
                    worst_mm, worst_corner = 0.0, "neutral"
                    for cname, keys in CORNERS:
                        combo = corner_combo(keys, gi.limits, go.limits)
                        mm, cnt = poke_through_mm(gi, go, combo)
                        corners[cname] = {"mm": round(mm, 2), "verts": cnt}
                        if mm > worst_mm:
                            worst_mm, worst_corner = mm, cname
                    ok = worst_mm <= args.threshold_mm
                    results.append({
                        "base": base,
                        "inner": inner_row["id"],
                        "outer": outer_row["id"],
                        "maxMm": round(worst_mm, 2),
                        "worstCorner": worst_corner,
                        "status": "ok" if ok else ("conflict" if conflict else "fail"),
                        "corners": corners,
                    })
                    if not ok:
                        tag = "CONFLICT" if conflict else "FAIL"
                        print(f"[layering] {tag} {base:6s} {inner_row['id']} under {outer_row['id']}: "
                              f"{worst_mm:.1f} mm at {worst_corner}")

    failures = [r for r in results if r["status"] == "fail"]
    report = {
        "thresholdMm": args.threshold_mm,
        "corners": [c for c, _ in CORNERS],
        "pairs": len(results),
        "failures": len(failures),
        "conflicts": sum(1 for r in results if r["status"] == "conflict"),
        "worstMm": max((r["maxMm"] for r in results), default=0.0),
        "missing": sorted(set(missing)),
        "results": sorted(results, key=lambda r: -r["maxMm"]),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"[layering] {len(results)} pair-bases, {len(failures)} failures, {report['conflicts']} conflicts, "
          f"worst {report['worstMm']:.1f} mm, missing {len(report['missing'])} files, {time.time() - t0:.0f}s -> {out}")
    if report["missing"]:
        print(f"[layering] missing raw files (run npm run art:build -- wardrobe): {', '.join(report['missing'][:12])}")
    return 1 if failures or report["missing"] else 0


if __name__ == "__main__":
    sys.exit(main())
