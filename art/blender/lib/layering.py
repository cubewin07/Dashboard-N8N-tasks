"""Shared layering geometry (P08a-T10 test, P08a-T15 generator follow-up).

``Garment`` loads a fitted skinned-garment GLB as world-space basis vertices + per-key deltas + triangles;
``poke_hits`` / ``poke_through_mm`` measure how far an inner garment sticks out through the garment worn
over it (the metric of ``art/blender/test_layering.py``, and the one ``lib/layerfollow.py`` drives to zero).
"""

from __future__ import annotations

from pathlib import Path

import json

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

from lib import fit

CATALOG_DIR = Path(__file__).resolve().parents[3] / "src/content/catalog"
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


def poke_hits(inner: Garment, outer: Garment, combo: dict[str, float]):
    """Yield ``(penetration_m, outer_face_index, inner_normal_dot_face_normal)`` per poking inner vertex."""
    iv, ivn, _ifn, _ibvh, _ie = inner.at(combo)
    _ov, _ovn, ofn, obvh, oedge = outer.at(combo)
    for p, n in zip(iv, ivn):
        if n.length_squared < 1e-12:
            continue
        loc, _nrm, idx, dist = obvh.ray_cast(p + n * RAY_START_M, -n, RAY_MAX_M)
        if idx is None or dist is None:
            continue
        if oedge is not None and oedge.find(loc)[2] < EDGE_IGNORE_M:
            continue
        cosf = ofn[idx].dot(n)
        if cosf > FACING_DOT:
            yield max(0.0, dist - RAY_START_M), idx, cosf


def poke_through_mm(inner: Garment, outer: Garment, combo: dict[str, float]) -> tuple[float, int]:
    worst = 0.0
    count = 0
    for pen, _idx, _cosf in poke_hits(inner, outer, combo):
        if pen > 0.0005:
            count += 1
        worst = max(worst, pen)
    return worst * 1000.0, count


def load_rows() -> dict[str, dict]:
    rows: dict[str, dict] = {}
    for path in sorted(CATALOG_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for row in data.get("items", []) if isinstance(data, dict) else []:
            if isinstance(row, dict) and "id" in row and "slot" in row and not row.get("retired"):
                rows[row["id"]] = row
    return rows
