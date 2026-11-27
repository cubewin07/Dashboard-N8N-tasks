"""Garment fitting, clipping test, and conservative hideRegions pipeline.

Implements the two construction paths for skinned wardrobe items:
  1. ``shell_from_body``: extracts body faces matching a filter, offsets along
     outward normals, and preserves body skin weights + 6 shape-key deltas.
  2. ``fit_free_mesh``: projects a free low-poly garment bmesh onto the base
     body exterior surface via BVHTree, pushes inward vertices out to at least
     ``offset_m`` clearance, and transfers skin weights + all 6 shape-key deltas
     by barycentric interpolation + graph smoothing.

Also provides ``evaluate_garment`` and ``export_fitted_garment`` to run the
34-combo rest shape-key clipping test, 3 skinned pose checks, conservative
``hideRegions`` detection, ``<item>_<f|m>.glb`` export, ``<item>.meta.json``,
and ``art/out/reports/<item>.json``.
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

from . import bodyshape, charexport, palette, rig

DEFAULT_LIMITS: dict[str, list[float]] = {
    "Heavy": [0.0, 0.8],
    "Slim": [0.0, 0.6],
    "Muscle": [0.0, 0.8],
    "Chest": [0.0, 1.0],
    "Hips": [0.0, 1.0],
    "Shoulders": [0.0, 1.0],
}

NEVER_HIDE_REGIONS: frozenset[str] = frozenset({"head", "hand_l", "hand_r"})

MAX_GARMENT_TRIS = 1500
REST_CLIP_LIMIT_MM = 5.0
POSE_WARN_MM = 8.0
HIDE_MARGIN_M = 0.006
HIDE_MIN_GAP_M = 0.0002
HIDE_MAX_RAY_M = 0.11
HIDE_BOUNDARY_DEPTH_M = 0.015
LIMIT_STEP = 0.05

_PARITY_DIRS: tuple[Vector, ...] = (
    Vector((1.0, 0.17, 0.09)).normalized(),
    Vector((0.09, 1.0, 0.13)).normalized(),
    Vector((0.13, 0.07, 1.0)).normalized(),
)


class FitError(RuntimeError):
    """Raised when a garment fails the neutral clipping gate or triangle budget."""


@dataclass
class BodyData:
    """Pre-extracted rest geometry, weights, regions, and shape deltas for a base body."""

    base: str
    verts_basis: list[Vector]
    shape_deltas: dict[str, list[Vector]]
    weights: list[list[tuple[str, float]]]
    vert_regions: list[str]
    vert_normals_basis: list[Vector]
    all_tris: list[tuple[int, int, int]]
    ext_tris: list[tuple[int, int, int]]
    components: list[list[int]]
    comp_tris: list[list[tuple[int, int, int]]]
    comp_bvhs_basis: list[BVHTree]
    ext_bvh_basis: BVHTree
    vert_is_interior: list[bool]
    ext_vert_indices: list[int]
    ext_face_centers_tris: list[tuple[int, int, int]]


def _connected_components(n_verts: int, edges: list[tuple[int, int]]) -> list[list[int]]:
    adj: list[list[int]] = [[] for _ in range(n_verts)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    seen = [False] * n_verts
    comps: list[list[int]] = []
    for start in range(n_verts):
        if seen[start]:
            continue
        stack = [start]
        seen[start] = True
        comp: list[int] = []
        while stack:
            u = stack.pop()
            comp.append(u)
            for w in adj[u]:
                if not seen[w]:
                    seen[w] = True
                    stack.append(w)
        comps.append(comp)
    return comps


def _is_point_inside_bvh(pt: Vector, bvh: BVHTree) -> bool:
    """Return True if ``pt`` is strictly inside closed/manifold ``bvh`` via 3-ray parity."""
    inside_votes = 0
    for d in _PARITY_DIRS:
        hits = 0
        origin = pt + d * 1e-4
        for _ in range(16):
            loc, _norm, idx, _dist = bvh.ray_cast(origin, d, 5.0)
            if idx is None or loc is None:
                break
            hits += 1
            origin = loc + d * 1e-4
        if hits % 2 == 1:
            inside_votes += 1
    return inside_votes >= 2


def _compute_smooth_normals(
    verts: list[Vector], tris: list[tuple[int, int, int]]
) -> list[Vector]:
    acc = [Vector((0.0, 0.0, 0.0)) for _ in range(len(verts))]
    for a, b, c in tris:
        fn = (verts[b] - verts[a]).cross(verts[c] - verts[a])
        acc[a] += fn
        acc[b] += fn
        acc[c] += fn
    out: list[Vector] = []
    for n in acc:
        if n.length_squared > 1e-12:
            out.append(n.normalized())
        else:
            out.append(Vector((0.0, -1.0, 0.0)))
    return out


def _triangulate_mesh_data(
    me: bpy.types.Mesh,
) -> tuple[list[tuple[int, int, int]], list[tuple[int, int]]]:
    bm = bmesh.new()
    bm.from_mesh(me)
    edges = [(e.verts[0].index, e.verts[1].index) for e in bm.edges]
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    tris: list[tuple[int, int, int]] = []
    for f in bm.faces:
        if len(f.verts) == 3:
            tris.append((f.verts[0].index, f.verts[1].index, f.verts[2].index))
    bm.free()
    return tris, edges


def extract_body_data(body_ob: bpy.types.Object, base: str) -> BodyData:
    """Extract Basis vertices, shape deltas, bone weights, regions, and surface BVH."""
    me = body_ob.data
    n_verts = len(me.vertices)

    sk = me.shape_keys
    if sk is None or "Basis" not in sk.key_blocks:
        verts_basis = [v.co.copy() for v in me.vertices]
    else:
        for kb in sk.key_blocks:
            if kb.name != "Basis":
                kb.value = 0.0
        basis_kb = sk.key_blocks["Basis"]
        verts_basis = [basis_kb.data[i].co.copy() for i in range(n_verts)]

    shape_deltas: dict[str, list[Vector]] = {}
    for key in rig.SHAPE_KEYS:
        if sk is not None and key in sk.key_blocks:
            kb = sk.key_blocks[key]
            shape_deltas[key] = [kb.data[i].co - verts_basis[i] for i in range(n_verts)]
        else:
            shape_deltas[key] = [Vector((0.0, 0.0, 0.0)) for _ in range(n_verts)]

    # Bone weights per vertex
    idx_to_name = {vg.index: vg.name for vg in body_ob.vertex_groups}
    weights: list[list[tuple[str, float]]] = []
    for v in me.vertices:
        wlist = [
            (idx_to_name[g.group], g.weight)
            for g in v.groups
            if g.group in idx_to_name and g.weight > 1e-6
        ]
        s = sum(w for _, w in wlist)
        if s > 1e-8:
            wlist = [(n, w / s) for n, w in wlist]
        else:
            wlist = [("Hips", 1.0)]
        weights.append(wlist)

    # Region ID per vertex from COLOR_0 on M_Palette polygons
    v_rid: dict[int, int] = {}
    ca = me.color_attributes.get(charexport.COLOR_LAYER)
    if ca is not None:
        for poly in me.polygons:
            if poly.material_index != 0:
                continue
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                rid = int(round(ca.data[li].color[0] * 255.0))
                rid = max(0, min(len(bodyshape.REGIONS) - 1, rid))
                v_rid.setdefault(vi, rid)
    vert_regions = [bodyshape.REGIONS[v_rid.get(i, 0)] for i in range(n_verts)]

    all_tris, edges = _triangulate_mesh_data(me)
    vert_normals_basis = _compute_smooth_normals(verts_basis, all_tris)

    components = _connected_components(n_verts, edges)
    v_to_comp = [0] * n_verts
    for cid, comp in enumerate(components):
        for vi in comp:
            v_to_comp[vi] = cid

    comp_tris: list[list[tuple[int, int, int]]] = [[] for _ in components]
    for a, b, c in all_tris:
        comp_tris[v_to_comp[a]].append((a, b, c))

    comp_bvhs_basis = [
        BVHTree.FromPolygons(verts_basis, tris) for tris in comp_tris
    ]

    # Mark vertices strictly inside ANOTHER body component (e.g. tucked leg/arm caps).
    vert_is_interior = [False] * n_verts
    for vi in range(n_verts):
        my_cid = v_to_comp[vi]
        pt = verts_basis[vi]
        for other_cid, obvh in enumerate(comp_bvhs_basis):
            if other_cid == my_cid or not comp_tris[other_cid]:
                continue
            if _is_point_inside_bvh(pt, obvh):
                vert_is_interior[vi] = True
                break

    ext_tris = [
        t
        for t in all_tris
        if not (vert_is_interior[t[0]] and vert_is_interior[t[1]] and vert_is_interior[t[2]])
    ]
    ext_bvh_basis = BVHTree.FromPolygons(verts_basis, ext_tris)
    ext_vert_indices = [i for i in range(n_verts) if not vert_is_interior[i]]
    ext_face_centers_tris = [
        t
        for t in all_tris
        if not vert_is_interior[t[0]]
        and not vert_is_interior[t[1]]
        and not vert_is_interior[t[2]]
    ]

    return BodyData(
        base=base,
        verts_basis=verts_basis,
        shape_deltas=shape_deltas,
        weights=weights,
        vert_regions=vert_regions,
        vert_normals_basis=vert_normals_basis,
        all_tris=all_tris,
        ext_tris=ext_tris,
        components=components,
        comp_tris=comp_tris,
        comp_bvhs_basis=comp_bvhs_basis,
        ext_bvh_basis=ext_bvh_basis,
        vert_is_interior=vert_is_interior,
        ext_vert_indices=ext_vert_indices,
        ext_face_centers_tris=ext_face_centers_tris,
    )


def eval_points(
    basis: list[Vector],
    shape_deltas: dict[str, list[Vector]],
    shape_values: dict[str, float],
) -> list[Vector]:
    """Evaluate deformed vertex coordinates for a rest-pose shape-key combo."""
    active = [(k, v) for k, v in shape_values.items() if abs(v) > 1e-7 and k in shape_deltas]
    if not active:
        return [p.copy() for p in basis]
    out: list[Vector] = []
    for i, b in enumerate(basis):
        p = b.copy()
        for k, val in active:
            p += shape_deltas[k][i] * val
        out.append(p)
    return out


def _top4_normalize(weight_map: dict[str, float]) -> list[tuple[str, float]]:
    items = [(k, v) for k, v in weight_map.items() if v > 1e-6]
    items.sort(key=lambda kv: kv[1], reverse=True)
    items = items[:4]
    s = sum(v for _, v in items)
    if s <= 1e-8:
        return [("Hips", 1.0)]
    return [(k, v / s) for k, v in items]


def _smooth_weights(
    bm: bmesh.types.BMesh,
    weights_by_vert: list[list[tuple[str, float]]],
    iters: int,
) -> list[list[tuple[str, float]]]:
    cur = weights_by_vert
    bm.verts.ensure_lookup_table()
    for _ in range(iters):
        nxt: list[list[tuple[str, float]]] = []
        for v in bm.verts:
            acc: dict[str, float] = {}
            for bn, w in cur[v.index]:
                acc[bn] = acc.get(bn, 0.0) + w * 0.6
            nbrs = [e.other_vert(v).index for e in v.link_edges]
            if nbrs:
                inv = 0.4 / len(nbrs)
                for ni in nbrs:
                    for bn, w in cur[ni]:
                        acc[bn] = acc.get(bn, 0.0) + w * inv
            nxt.append(_top4_normalize(acc))
        cur = nxt
    return cur


def _barycentric_from_tri(
    pt: Vector, a: Vector, b: Vector, c: Vector
) -> tuple[float, float, float]:
    w = poly_3d_calc([a, b, c], pt)
    wa, wb, wc = float(w[0]), float(w[1]), float(w[2])
    s = wa + wb + wc
    if abs(s) < 1e-8:
        return (1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0)
    return (wa / s, wb / s, wc / s)


def _is_inside_body_basis(pt: Vector, body: BodyData) -> bool:
    for cid, obvh in enumerate(body.comp_bvhs_basis):
        if not body.comp_tris[cid]:
            continue
        if _is_point_inside_bvh(pt, obvh):
            return True
    return False


# ---------------------------------------------------------------------------
# Path A: shell_from_body
# ---------------------------------------------------------------------------

def shell_from_body(
    body_ob: bpy.types.Object,
    body: BodyData,
    face_filter: Callable[[tuple[int, ...], Vector, list[str]], bool],
    *,
    offset_m: float = 0.010,
    offset_fn: Callable[[Vector, str, int], float] | None = None,
    swatch_key: str | None = None,
    tint_fn: Callable[[Vector, list[str]], str] | None = None,
    shade_fn: Callable[[Vector, list[str]], float] | None = None,
    resolve_overlaps: bool = True,
    exclude_interior_seams: bool = True,
    weight_override_fn: Callable[
        [Vector, int, list[tuple[str, float]]], list[tuple[str, float]]
    ]
    | None = None,
) -> tuple[
    bmesh.types.BMesh,
    list[list[tuple[str, float]]],
    dict[str, list[Vector]],
]:
    """Path A: build a fitted garment shell directly from body faces."""
    me = body_ob.data
    src_bm = bmesh.new()
    src_bm.from_mesh(me)
    src_bm.verts.ensure_lookup_table()
    src_bm.faces.ensure_lookup_table()

    selected_faces: list[bmesh.types.BMFace] = []
    for f in src_bm.faces:
        v_ids = tuple(v.index for v in f.verts)
        # Skip faces intersecting other body shells (tucked limb caps / socket crossings)
        if exclude_interior_seams and any(body.vert_is_interior[vi] for vi in v_ids):
            continue
        elif all(body.vert_is_interior[vi] for vi in v_ids):
            continue
        center = f.calc_center_median()
        regs = [body.vert_regions[vi] for vi in v_ids]
        if face_filter(v_ids, center, regs):
            selected_faces.append(f)

    if not selected_faces:
        src_bm.free()
        raise FitError("shell_from_body selected 0 faces")

    out_bm = bmesh.new()
    v_map: dict[int, bmesh.types.BMVert] = {}
    orig_of_new: list[int] = []

    for f in selected_faces:
        new_vs: list[bmesh.types.BMVert] = []
        for sv in f.verts:
            nv = v_map.get(sv.index)
            if nv is None:
                nv = out_bm.verts.new(body.verts_basis[sv.index])
                nv.index = len(orig_of_new)
                v_map[sv.index] = nv
                orig_of_new.append(sv.index)
            new_vs.append(nv)
        try:
            nf = out_bm.faces.new(new_vs)
            nf.smooth = False
        except ValueError:
            pass

    out_bm.verts.ensure_lookup_table()
    out_bm.faces.ensure_lookup_table()

    # Compute local outward normals from copied shell faces, falling back to body normals.
    vert_normals: list[Vector] = [Vector((0.0, 0.0, 0.0)) for _ in out_bm.verts]
    for f in out_bm.faces:
        for v in f.verts:
            vert_normals[v.index] += f.normal
    for i, n in enumerate(vert_normals):
        if n.length_squared > 1e-10:
            vert_normals[i] = n.normalized()
        else:
            vert_normals[i] = body.vert_normals_basis[orig_of_new[i]].copy()

    # Offset vertices along outward normals
    for v in out_bm.verts:
        orig_i = orig_of_new[v.index]
        reg = body.vert_regions[orig_i]
        off = offset_fn(v.co, reg, orig_i) if offset_fn is not None else offset_m
        v.co = v.co + vert_normals[v.index] * off
        if resolve_overlaps:
            loc, nrm, idx, dist = body.ext_bvh_basis.find_nearest(v.co)
            if idx is not None and loc is not None and nrm is not None:
                min_clr = max(0.005, off * 0.75)
                if _is_inside_body_basis(v.co, body) or (
                    (v.co - loc).dot(nrm) >= 0.0 and dist < min_clr
                ):
                    v.co = loc + nrm * off

    # Weights & shape deltas inherited from provenance
    weights_by_vert: list[list[tuple[str, float]]] = []
    for i, orig_i in enumerate(orig_of_new):
        w = list(body.weights[orig_i])
        if weight_override_fn is not None:
            w = weight_override_fn(out_bm.verts[i].co, i, w)
        weights_by_vert.append(_top4_normalize(dict(w)))

    deltas_by_key: dict[str, list[Vector]] = {
        k: [body.shape_deltas[k][orig_i].copy() for orig_i in orig_of_new]
        for k in rig.SHAPE_KEYS
    }

    # Palette UV + tint/shade COLOR_0
    charexport.ensure_color_layer(out_bm)
    default_key = swatch_key or "c_white"
    if tint_fn is None:
        charexport.paint_palette(out_bm, out_bm.faces[:], default_key)
        face_tint = {f: "primary" for f in out_bm.faces}
    else:
        face_tint = {}
        for f in out_bm.faces:
            fc = f.calc_center_median()
            fregs = [body.vert_regions[orig_of_new[v.index]] for v in f.verts]
            slot_key = tint_fn(fc, fregs)
            face_tint[f] = slot_key
            charexport.paint_palette(out_bm, [f], default_key)

    charexport.set_garment_colors(out_bm, face_tint_map=face_tint, shade=1.0)
    if shade_fn is not None:
        layer = out_bm.loops.layers.float_color.get(charexport.COLOR_LAYER)
        for f in out_bm.faces:
            fc = f.calc_center_median()
            fregs = [body.vert_regions[orig_of_new[v.index]] for v in f.verts]
            sh = shade_fn(fc, fregs)
            if abs(sh - 1.0) > 1e-4:
                for loop in f.loops:
                    c = loop[layer]
                    loop[layer] = (c[0], c[1], c[2], max(0.0, min(1.0, sh)))

    src_bm.free()
    return out_bm, weights_by_vert, deltas_by_key


# ---------------------------------------------------------------------------
# Path B: fit_free_mesh
# ---------------------------------------------------------------------------

def fit_free_mesh(
    bm: bmesh.types.BMesh,
    body: BodyData,
    *,
    offset_m: float = 0.010,
    offset_fn: Callable[[Vector], float] | None = None,
    smooth_weight_iters: int = 2,
    weight_override_fn: Callable[
        [Vector, int, list[tuple[str, float]]], list[tuple[str, float]]
    ]
    | None = None,
    delta_scale_fn: Callable[[Vector, str, Vector], Vector] | None = None,
    vert_region_filter_fn: Callable[[Vector, int], set[str] | None] | None = None,
    post_push_fn: Callable[[bmesh.types.BMesh], None] | None = None,
    push_outward: bool = True,
    exclude_head_from_fit: bool = True,
) -> tuple[
    bmesh.types.BMesh,
    list[list[tuple[str, float]]],
    dict[str, list[Vector]],
]:
    """Path B: fit a custom bmesh against ``body`` via BVH proximity.

    Transfers skin weights (barycentric from closest exterior triangle, smoothed
    ``smooth_weight_iters`` times, optional ``weight_override_fn``) and all 6
    shape-key deltas by barycentric interpolation. Ensures vertices have at
    least ``offset_m`` (or ``offset_fn(co)``) clearance outside the body.
    """
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    # Optional BVH omitting head/hands if garment shouldn't lock to chin/fingers
    if exclude_head_from_fit:
        fit_tris = [
            t
            for t in body.ext_tris
            if body.vert_regions[t[0]] not in NEVER_HIDE_REGIONS
            and body.vert_regions[t[1]] not in NEVER_HIDE_REGIONS
            and body.vert_regions[t[2]] not in NEVER_HIDE_REGIONS
        ]
        fit_bvh = BVHTree.FromPolygons(body.verts_basis, fit_tris)
        tris_ref = fit_tris
    else:
        fit_bvh = body.ext_bvh_basis
        tris_ref = body.ext_tris

    region_bvh_cache: dict[frozenset[str], tuple[BVHTree, list[tuple[int, int, int]]]] = {}

    def _get_bvh_for_filter(allowed: set[str] | None) -> tuple[BVHTree, list[tuple[int, int, int]]]:
        if not allowed:
            return fit_bvh, tris_ref
        fkey = frozenset(allowed)
        if fkey not in region_bvh_cache:
            sub_tris = [
                t
                for t in tris_ref
                if body.vert_regions[t[0]] in fkey
                or body.vert_regions[t[1]] in fkey
                or body.vert_regions[t[2]] in fkey
            ]
            if not sub_tris:
                region_bvh_cache[fkey] = (fit_bvh, tris_ref)
            else:
                region_bvh_cache[fkey] = (
                    BVHTree.FromPolygons(body.verts_basis, sub_tris),
                    sub_tris,
                )
        return region_bvh_cache[fkey]

    raw_weights: list[list[tuple[str, float]]] = []
    deltas_by_key: dict[str, list[Vector]] = {k: [] for k in rig.SHAPE_KEYS}

    for v in bm.verts:
        co = v.co.copy()
        allowed_regs = vert_region_filter_fn(co, v.index) if vert_region_filter_fn is not None else None
        cur_bvh, cur_tris = _get_bvh_for_filter(allowed_regs)
        loc, normal, tri_idx, dist = cur_bvh.find_nearest(co)
        if tri_idx is None or loc is None:
            raw_weights.append([("Hips", 1.0)])
            for k in rig.SHAPE_KEYS:
                deltas_by_key[k].append(Vector((0.0, 0.0, 0.0)))
            continue

        ta, tb, tc = cur_tris[tri_idx]
        wa, wb, wc = _barycentric_from_tri(
            loc, body.verts_basis[ta], body.verts_basis[tb], body.verts_basis[tc]
        )

        # Interpolate bone weights
        wmap: dict[str, float] = {}
        for vi, bw in ((ta, wa), (tb, wb), (tc, wc)):
            for bname, bweight in body.weights[vi]:
                wmap[bname] = wmap.get(bname, 0.0) + bw * bweight
        raw_weights.append(_top4_normalize(wmap))

        # Interpolate shape-key deltas
        for k in rig.SHAPE_KEYS:
            d = (
                body.shape_deltas[k][ta] * wa
                + body.shape_deltas[k][tb] * wb
                + body.shape_deltas[k][tc] * wc
            )
            if delta_scale_fn is not None:
                d = delta_scale_fn(co, k, d)
            deltas_by_key[k].append(d)

        # Push inward vertices out to minimum clearance along outward body normal
        if push_outward and normal is not None:
            req = offset_fn(co) if offset_fn is not None else offset_m
            signed = (co - loc).dot(normal)
            inside = _is_inside_body_basis(co, body)
            if inside or signed < req:
                v.co = loc + normal * req

    if post_push_fn is not None:
        post_push_fn(bm)

    weights_by_vert = (
        _smooth_weights(bm, raw_weights, smooth_weight_iters)
        if smooth_weight_iters > 0
        else raw_weights
    )
    if weight_override_fn is not None:
        weights_by_vert = [
            _top4_normalize(dict(weight_override_fn(v.co, v.index, weights_by_vert[v.index])))
            for v in bm.verts
        ]

    return bm, weights_by_vert, deltas_by_key


# ---------------------------------------------------------------------------
# Clipping & hideRegions Evaluation
# ---------------------------------------------------------------------------

def generate_rest_combos() -> list[tuple[str, dict[str, float]]]:
    """Generate deterministic set of 34 rest-pose shape-key combos per spec."""
    combos: list[tuple[str, dict[str, float]]] = [("neutral", {})]

    # 6 single maxes
    single_maxes = [
        ("Heavy_0.8", {"Heavy": 0.8}),
        ("Slim_0.6", {"Slim": 0.6}),
        ("Muscle_0.8", {"Muscle": 0.8}),
        ("Chest_1.0", {"Chest": 1.0}),
        ("Hips_1.0", {"Hips": 1.0}),
        ("Shoulders_1.0", {"Shoulders": 1.0}),
    ]
    combos.extend(single_maxes)

    # 7 plausible pairs
    plausible_pairs = [
        ("Heavy+Chest", {"Heavy": 0.8, "Chest": 1.0}),
        ("Heavy+Hips", {"Heavy": 0.8, "Hips": 1.0}),
        ("Heavy+Muscle", {"Heavy": 0.8, "Muscle": 0.8}),
        ("Slim+Shoulders", {"Slim": 0.6, "Shoulders": 1.0}),
        ("Slim+Hips", {"Slim": 0.6, "Hips": 1.0}),
        ("Muscle+Shoulders", {"Muscle": 0.8, "Shoulders": 1.0}),
        ("Muscle+Chest", {"Muscle": 0.8, "Chest": 1.0}),
    ]
    combos.extend(plausible_pairs)

    # 20 seeded random combos (Heavy and Slim mutually exclusive)
    rng = random.Random(42)
    for idx in range(20):
        d: dict[str, float] = {}
        mode = rng.choice(("heavy", "slim", "neither"))
        if mode == "heavy":
            d["Heavy"] = round(rng.uniform(0.1, 0.8), 3)
        elif mode == "slim":
            d["Slim"] = round(rng.uniform(0.1, 0.6), 3)
        if rng.random() < 0.7:
            d["Muscle"] = round(rng.uniform(0.05, 0.8), 3)
        if rng.random() < 0.7:
            d["Chest"] = round(rng.uniform(0.05, 1.0), 3)
        if rng.random() < 0.7:
            d["Hips"] = round(rng.uniform(0.05, 1.0), 3)
        if rng.random() < 0.7:
            d["Shoulders"] = round(rng.uniform(0.05, 1.0), 3)
        combos.append((f"rand_{idx:02d}", d))

    return combos


def _combo_within_limits(combo: dict[str, float], limits: dict[str, list[float]]) -> bool:
    for k, val in combo.items():
        lo, hi = limits[k]
        if val < lo - 1e-6 or val > hi + 1e-6:
            return False
    return True


def _extract_garment_cap_state(
    g_tris: list[tuple[int, int, int]],
) -> tuple[list[int], list[list[int]]]:
    """Return ``(boundary_vert_indices, boundary_loops)`` for capping open garment holes."""
    undir_counts: dict[tuple[int, int], int] = {}
    for a, b, c in g_tris:
        for u, v in ((a, b), (b, c), (c, a)):
            key = (u, v) if u < v else (v, u)
            undir_counts[key] = undir_counts.get(key, 0) + 1

    adj: dict[int, list[int]] = {}
    bverts: set[int] = set()
    for (u, v), cnt in undir_counts.items():
        if cnt == 1:
            adj.setdefault(u, []).append(v)
            adj.setdefault(v, []).append(u)
            bverts.add(u)
            bverts.add(v)

    loops: list[list[int]] = []
    used: set[tuple[int, int]] = set()
    for start in sorted(adj):
        for nxt in adj[start]:
            ekey = (start, nxt) if start < nxt else (nxt, start)
            if ekey in used:
                continue
            loop = [start, nxt]
            used.add(ekey)
            prev, cur = start, nxt
            for _ in range(len(bverts) + 2):
                cands = [w for w in adj.get(cur, ()) if ((cur, w) if cur < w else (w, cur)) not in used and w != prev]
                if not cands:
                    break
                w = cands[0]
                used.add((cur, w) if cur < w else (w, cur))
                if w == start:
                    break
                loop.append(w)
                prev, cur = cur, w
            if len(loop) >= 3:
                loops.append(loop)

    return sorted(bverts), loops


def _build_closed_garment_bvh(
    g_verts: list[Vector],
    g_tris: list[tuple[int, int, int]],
    loops: list[list[int]],
) -> BVHTree:
    """Build BVHTree of garment plus planar fan caps across open holes for interiority tests."""
    closed_verts = list(g_verts)
    closed_tris = list(g_tris)
    for loop in loops:
        cen = Vector((0.0, 0.0, 0.0))
        for vi in loop:
            cen += g_verts[vi]
        cen *= 1.0 / len(loop)
        cidx = len(closed_verts)
        closed_verts.append(cen)
        k = len(loop)
        for i in range(k):
            closed_tris.append((loop[i], loop[(i + 1) % k], cidx))
    return BVHTree.FromPolygons(closed_verts, closed_tris)


def _measure_penetration_and_coverage(
    body_verts: list[Vector],
    body_vnormals: list[Vector],
    body: BodyData,
    g_verts: list[Vector],
    g_tris: list[tuple[int, int, int]],
    g_face_normals: list[Vector],
    g_bvh: BVHTree,
    *,
    skip_covered_check: bool = False,
    excluded_regions: frozenset[str] = frozenset(),
    cap_state: tuple[list[int], list[list[int]]] | None = None,
) -> tuple[float, dict[int, bool]]:
    """Return ``(max_penetration_mm, exterior_vert_covered_map)``.

    Penetration is measured two ways:
      A) From every exterior body vertex AND exterior face center, cast ray along
         inward normal ``-n`` up to 45 mm. Hits against outer-facing garment faces
         (``dot(g_fn, n) > 0.45``) measure body skin poking out of garment.
      B) From every garment vertex, test if it lies strictly inside any deformed
         body component BVH, recording distance to surface.

    A body vertex is covered if it does not poke through the garment and either:
      1. Outward ray ``+n`` hits the garment within ``HIDE_MAX_RAY_M`` (>= 1 mm clear), OR
      2. It lies strictly inside the capped garment volume and >= ``HIDE_BOUNDARY_DEPTH_M``
         deep away from every open collar/cuff/hem boundary (handles internal limb
         sockets, pelvis/crotch caps, and armpit junctions without hiding open cuffs).
    """
    max_pen_m = 0.0

    # Sample points: exterior vertices + exterior triangle centroids
    sample_pts: list[tuple[Vector, Vector, int]] = []
    for vi in body.ext_vert_indices:
        if excluded_regions and body.vert_regions[vi] in excluded_regions:
            continue
        sample_pts.append((body_verts[vi], body_vnormals[vi], vi))
    for a, b, c in body.ext_face_centers_tris:
        if excluded_regions and all(body.vert_regions[v] in excluded_regions for v in (a, b, c)):
            continue
        cen = (body_verts[a] + body_verts[b] + body_verts[c]) * (1.0 / 3.0)
        n = body_vnormals[a] + body_vnormals[b] + body_vnormals[c]
        n = n.normalized() if n.length_squared > 1e-10 else Vector((0.0, -1.0, 0.0))
        sample_pts.append((cen, n, -1))

    covered_map: dict[int, bool] = {}
    fallback_candidates: list[tuple[int, Vector]] = []

    for pt, n, vi in sample_pts:
        # Check outward poke-through along -n
        loc_in, _n_in, idx_in, dist_in = g_bvh.ray_cast(pt + n * 0.0004, -n, 0.045)
        if idx_in is not None and dist_in is not None:
            g_fn = g_face_normals[idx_in]
            if g_fn.dot(n) > 0.45:
                pen = max(0.0, dist_in - 0.0004)
                if pen > max_pen_m:
                    max_pen_m = pen
                if vi >= 0:
                    covered_map[vi] = False
                continue

        if skip_covered_check or vi < 0:
            continue

        # Check outward coverage along +n within HIDE_MAX_RAY_M (~11 cm handles A-line skirts)
        loc_out, _n_out, idx_out, dist_out = g_bvh.ray_cast(pt + n * 0.0004, n, HIDE_MAX_RAY_M)
        if idx_out is not None and dist_out is not None:
            actual_dist = dist_out + 0.0004
            if actual_dist >= HIDE_MIN_GAP_M:
                covered_map[vi] = True
                continue
        covered_map[vi] = False
        fallback_candidates.append((vi, pt))

    if not skip_covered_check and fallback_candidates:
        bverts, loops = cap_state if cap_state is not None else _extract_garment_cap_state(g_tris)
        closed_bvh = _build_closed_garment_bvh(g_verts, g_tris, loops) if loops else g_bvh
        b_pts = [g_verts[bi] for bi in bverts]
        min_depth_sq = HIDE_BOUNDARY_DEPTH_M * HIDE_BOUNDARY_DEPTH_M
        for vi, pt in fallback_candidates:
            if not _is_point_inside_bvh(pt, closed_bvh):
                continue
            if b_pts:
                d_sq = min((pt - bp).length_squared for bp in b_pts)
                if d_sq < min_depth_sq:
                    continue
            covered_map[vi] = True

    # Dual check: garment vertices strictly inside deformed torso component (excluding tucked socket caps)
    comp_aabbs: list[tuple[BVHTree, list[tuple[int, int, int]], Vector, Vector]] = []
    for cid, ctris in enumerate(body.comp_tris):
        if len(ctris) < 8:
            continue
        if not any(body.vert_regions[vi] == "chest" for vi in body.components[cid]):
            continue
        cverts = [body_verts[vi] for vi in body.components[cid]]
        if not cverts:
            continue
        mn = Vector((min(p.x for p in cverts), min(p.y for p in cverts), min(p.z for p in cverts)))
        mx = Vector((max(p.x for p in cverts), max(p.y for p in cverts), max(p.z for p in cverts)))
        comp_aabbs.append((BVHTree.FromPolygons(body_verts, ctris), ctris, mn, mx))

    for gv in g_verts:
        gx, gy, gz = gv.x, gv.y, gv.z
        for cbvh, ctris, mn, mx in comp_aabbs:
            if gx < mn.x or gx > mx.x or gy < mn.y or gy > mx.y or gz < mn.z or gz > mx.z:
                continue
            if _is_point_inside_bvh(gv, cbvh):
                loc, _cn, idx, dist = cbvh.find_nearest(gv)
                if idx is not None and dist is not None and 0.0004 < dist <= 0.045:
                    if any(body.vert_is_interior[v] for v in ctris[idx]):
                        break
                    if excluded_regions and all(
                        body.vert_regions[v] in excluded_regions for v in ctris[idx]
                    ):
                        break
                    if dist > max_pen_m:
                        max_pen_m = dist
                break

    return max_pen_m * 1000.0, covered_map


def _eval_garment_geom(
    garment_ob: bpy.types.Object,
) -> tuple[list[Vector], dict[str, list[Vector]], list[tuple[int, int, int]]]:
    me = garment_ob.data
    n = len(me.vertices)
    sk = me.shape_keys
    if sk is not None and "Basis" in sk.key_blocks:
        basis = [sk.key_blocks["Basis"].data[i].co.copy() for i in range(n)]
    else:
        basis = [v.co.copy() for v in me.vertices]
    deltas: dict[str, list[Vector]] = {}
    for k in rig.SHAPE_KEYS:
        if sk is not None and k in sk.key_blocks:
            kb = sk.key_blocks[k]
            deltas[k] = [kb.data[i].co - basis[i] for i in range(n)]
        else:
            deltas[k] = [Vector((0.0, 0.0, 0.0)) for _ in range(n)]
    tris, _edges = _triangulate_mesh_data(me)
    return basis, deltas, tris


def _apply_pose_sit(arm: bpy.types.Object) -> None:
    rig.reset_pose(arm)
    rig.pose(arm, "LeftUpLeg", x=-90)
    rig.pose(arm, "RightUpLeg", x=-90)
    rig.pose(arm, "LeftLeg", x=90)
    rig.pose(arm, "RightLeg", x=90)


def _apply_pose_arms_up(arm: bpy.types.Object) -> None:
    rig.reset_pose(arm)
    rig.pose(arm, "LeftArm", y=-105)
    rig.pose(arm, "RightArm", y=105)
    rig.pose(arm, "LeftForeArm", y=-15)
    rig.pose(arm, "RightForeArm", y=15)


def _apply_pose_deep_bend(arm: bpy.types.Object) -> None:
    rig.reset_pose(arm)
    rig.pose(arm, "Spine", x=20)
    rig.pose(arm, "Spine1", x=15)
    rig.pose(arm, "Spine2", x=10)
    rig.pose(arm, "Head", x=-20)
    rig.pose(arm, "LeftArm", x=25, y=-10)
    rig.pose(arm, "RightArm", x=25, y=10)


TEST_POSES: tuple[tuple[str, Callable[[bpy.types.Object], None]], ...] = (
    ("sit", _apply_pose_sit),
    ("arms_up", _apply_pose_arms_up),
    ("deep_bend", _apply_pose_deep_bend),
)


def _zero_shape_keys(ob: bpy.types.Object) -> None:
    sk = ob.data.shape_keys
    if sk is None:
        return
    for kb in sk.key_blocks:
        if kb.name != "Basis":
            kb.value = 0.0


def _eval_skinned_poses(
    arm: bpy.types.Object,
    body_ob: bpy.types.Object,
    garment_ob: bpy.types.Object,
    body: BodyData,
    hide_regions: list[str] | set[str] | tuple[str, ...] = (),
) -> dict[str, float]:
    """Evaluate deformed body and garment across the 3 skinned poses via depsgraph."""
    _zero_shape_keys(body_ob)
    _zero_shape_keys(garment_ob)
    results: dict[str, float] = {}
    body_prev_parent = body_ob.parent
    body_ob.parent = arm
    body_mod = None
    for m in body_ob.modifiers:
        if m.type == "ARMATURE":
            body_mod = m
            break
    if body_mod is None:
        body_mod = body_ob.modifiers.new(name="Armature", type="ARMATURE")
    prev_body_target = body_mod.object
    body_mod.object = arm

    gar_mod = None
    for m in garment_ob.modifiers:
        if m.type == "ARMATURE":
            gar_mod = m
            break
    if gar_mod is not None:
        prev_gar_target = gar_mod.object
        gar_mod.object = arm
    else:
        prev_gar_target = None

    for pname, pose_fn in TEST_POSES:
        pose_fn(arm)
        bpy.context.view_layer.update()
        deps = bpy.context.evaluated_depsgraph_get()

        b_eval_ob = body_ob.evaluated_get(deps)
        b_mesh = b_eval_ob.to_mesh()
        g_eval_ob = garment_ob.evaluated_get(deps)
        g_mesh = g_eval_ob.to_mesh()

        b_verts = [v.co.copy() for v in b_mesh.vertices]
        b_vnormals = _compute_smooth_normals(b_verts, body.all_tris)
        g_verts = [v.co.copy() for v in g_mesh.vertices]
        g_tris, _ = _triangulate_mesh_data(g_mesh)
        g_fn = [
            (g_verts[b] - g_verts[a]).cross(g_verts[c] - g_verts[a]).normalized()
            if (g_verts[b] - g_verts[a]).cross(g_verts[c] - g_verts[a]).length_squared > 1e-12
            else Vector((0.0, -1.0, 0.0))
            for a, b, c in g_tris
        ]
        g_bvh = BVHTree.FromPolygons(g_verts, g_tris)

        pen_mm, _ = _measure_penetration_and_coverage(
            b_verts,
            b_vnormals,
            body,
            g_verts,
            g_tris,
            g_fn,
            g_bvh,
            skip_covered_check=True,
            excluded_regions=frozenset(hide_regions),
        )
        results[pname] = round(pen_mm, 2)

        b_eval_ob.to_mesh_clear()
        g_eval_ob.to_mesh_clear()

    rig.reset_pose(arm)
    bpy.context.view_layer.update()
    body_mod.object = prev_body_target
    body_ob.parent = body_prev_parent
    if gar_mod is not None:
        gar_mod.object = prev_gar_target

    return results


def evaluate_garment(
    arm: bpy.types.Object,
    body_ob: bpy.types.Object,
    garment_ob: bpy.types.Object,
    body: BodyData,
) -> dict:
    """Run rest-pose 34-combo clipping, bodyLimits narrowing, 3-pose check, and hideRegions."""
    g_basis, g_deltas, g_tris = _eval_garment_geom(garment_ob)
    if len(g_tris) > MAX_GARMENT_TRIS:
        raise FitError(
            f"Triangle budget exceeded: {len(g_tris)} > {MAX_GARMENT_TRIS}"
        )

    g_cap_state = _extract_garment_cap_state(g_tris)
    combos = generate_rest_combos()
    combo_cache: list[tuple[str, dict[str, float], float, dict[int, bool]]] = []

    def run_combo(cname: str, cdict: dict[str, float]) -> tuple[float, dict[int, bool]]:
        b_verts = eval_points(body.verts_basis, body.shape_deltas, cdict)
        b_vnormals = _compute_smooth_normals(b_verts, body.all_tris)
        g_verts = eval_points(g_basis, g_deltas, cdict)
        g_fn = [
            (g_verts[b] - g_verts[a]).cross(g_verts[c] - g_verts[a]).normalized()
            if (g_verts[b] - g_verts[a]).cross(g_verts[c] - g_verts[a]).length_squared > 1e-12
            else Vector((0.0, -1.0, 0.0))
            for a, b, c in g_tris
        ]
        g_bvh = BVHTree.FromPolygons(g_verts, g_tris)
        return _measure_penetration_and_coverage(
            b_verts, b_vnormals, body, g_verts, g_tris, g_fn, g_bvh, cap_state=g_cap_state
        )

    # Evaluate neutral first — fail immediately if neutral clips > 5 mm
    neutral_pen, neutral_cov = run_combo("neutral", {})
    if neutral_pen > REST_CLIP_LIMIT_MM:
        raise FitError(
            f"Neutral pose clipping {neutral_pen:.2f} mm exceeds {REST_CLIP_LIMIT_MM:.1f} mm limit"
        )
    combo_cache.append(("neutral", {}, neutral_pen, neutral_cov))

    for cname, cdict in combos[1:]:
        pen, cov = run_combo(cname, cdict)
        combo_cache.append((cname, cdict, pen, cov))

    # Iteratively narrow bodyLimits in 0.05 steps if any combo > 5.0 mm
    limits = {k: list(v) for k, v in DEFAULT_LIMITS.items()}
    failing_before = [
        {"combo": cname, "penetrationMm": round(pen, 2), "values": cdict}
        for cname, cdict, pen, _ in combo_cache
        if pen > REST_CLIP_LIMIT_MM
    ]

    for _iter in range(120):
        bad = [
            (cname, cdict, pen)
            for cname, cdict, pen, _ in combo_cache
            if _combo_within_limits(cdict, limits) and pen > REST_CLIP_LIMIT_MM
        ]
        # Also test boundary combo at current narrowed limits for active keys
        if not bad:
            break
        # Find the active non-zero key contributing across worst failing combo
        bad.sort(key=lambda x: x[2], reverse=True)
        _, worst_dict, worst_pen = bad[0]
        # Score active keys using their individual single-key penetration when available,
        # falling back to normalized value so a key at a low limit doesn't starve other culprits.
        single_pens = {
            next(iter(cdict)): pen
            for _cn, cdict, pen, _ in combo_cache
            if len(cdict) == 1
        }
        best_key = max(
            (k for k, v in worst_dict.items() if v > 1e-6 and limits[k][1] > 0.05),
            key=lambda k: (
                1 if single_pens.get(k, 0.0) > REST_CLIP_LIMIT_MM else 0,
                single_pens.get(k, 0.0),
                worst_dict[k] / max(0.05, DEFAULT_LIMITS[k][1]),
            ),
            default=None,
        )
        if best_key is None:
            raise FitError(
                f"Cannot narrow bodyLimits further (worst={worst_pen:.2f} mm)"
            )
        new_max = round(max(0.0, limits[best_key][1] - LIMIT_STEP), 2)
        limits[best_key][1] = new_max
        if new_max <= 0.0:
            raise FitError(f"Shape key '{best_key}' narrowed to 0.0")

        # Re-test single max & pairs clamped to new limits
        clamped_name = f"clamped_{best_key}_{new_max:.2f}"
        clamped_dict = {best_key: new_max}
        c_pen, c_cov = run_combo(clamped_name, clamped_dict)
        combo_cache.append((clamped_name, clamped_dict, c_pen, c_cov))
        for k2 in rig.SHAPE_KEYS:
            if k2 == best_key or (best_key, k2) in (("Heavy", "Slim"), ("Slim", "Heavy")):
                continue
            if limits[k2][1] > 0.0 and new_max > 0.0:
                pdict = {best_key: new_max, k2: limits[k2][1]}
                pname = f"clamped_{best_key}+{k2}"
                p_pen, p_cov = run_combo(pname, pdict)
                combo_cache.append((pname, pdict, p_pen, p_cov))

    passing = [
        (cname, cdict, pen, cov)
        for cname, cdict, pen, cov in combo_cache
        if _combo_within_limits(cdict, limits)
    ]
    max_pen_mm = round(max(pen for _, _, pen, _ in passing), 2)

    # Conservative hideRegions: every exterior vertex of region covered > 6 mm across all passing combos
    verts_by_region: dict[str, list[int]] = {}
    for vi in body.ext_vert_indices:
        rname = body.vert_regions[vi]
        if rname in NEVER_HIDE_REGIONS:
            continue
        verts_by_region.setdefault(rname, []).append(vi)

    hide_regions: list[str] = []
    for rname in bodyshape.REGIONS:
        if rname in NEVER_HIDE_REGIONS:
            continue
        vis = verts_by_region.get(rname, [])
        if not vis:
            continue
        if all(all(cov.get(vi, False) for vi in vis) for _, _, _, cov in passing):
            hide_regions.append(rname)

    # Only include narrowed keys in bodyLimits (or those differing from DEFAULT_LIMITS)
    compact_limits: dict[str, list[float]] = {
        k: [round(limits[k][0], 2), round(limits[k][1], 2)]
        for k in rig.SHAPE_KEYS
        if abs(limits[k][1] - DEFAULT_LIMITS[k][1]) > 1e-4
        or abs(limits[k][0] - DEFAULT_LIMITS[k][0]) > 1e-4
    }

    pose_pen = _eval_skinned_poses(arm, body_ob, garment_ob, body, hide_regions=hide_regions)
    for pname, pm in pose_pen.items():
        if pm > POSE_WARN_MM:
            print(f"[fit] WARN: pose '{pname}' clipping {pm:.2f} mm > {POSE_WARN_MM:.1f} mm")

    return {
        "tris": len(g_tris),
        "hideRegions": hide_regions,
        "bodyLimits": compact_limits,
        "effectiveLimits": limits,
        "maxPenetrationMm": max_pen_mm,
        "neutralPenetrationMm": round(neutral_pen, 2),
        "posePenetrationMm": pose_pen,
        "failingCombosBeforeNarrow": failing_before,
        "combosTested": len(passing),
        "passed": True,
    }


def export_fitted_garment(
    item_id: str,
    slot: str,
    base: str,
    arm: bpy.types.Object,
    body_ob: bpy.types.Object,
    body: BodyData,
    bm: bmesh.types.BMesh,
    weights_by_vert: list[list[tuple[str, float]]],
    deltas_by_key: dict[str, list[Vector]],
    *,
    out_dir: Path,
    report_dir: Path,
    write_meta: bool = True,
) -> dict:
    """Create mesh + rig + morphs, run clipping/hide checks, export GLB/meta/report."""
    mat_palette = palette.material("palette")
    mesh = charexport.bmesh_to_mesh(bm, f"{item_id}_{base[0]}_Mesh", [mat_palette])
    bm.free()

    garment_ob = charexport.create_skinned_object(
        f"{item_id}_{base[0]}_geo", mesh, arm, weights_by_vert
    )
    charexport.add_shape_keys(garment_ob, deltas_by_key)

    eval_res = evaluate_garment(arm, body_ob, garment_ob, body)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = "f" if base == "female" else "m"
    glb_name = f"{item_id}_{suffix}.glb"
    glb_path = out_dir / glb_name
    stem = glb_path.stem

    prev_arm_name = arm.name
    # Ensure no other scene object occupies `stem`, otherwise Blender suffixes `.001` onto `arm.name`.
    for obj in list(bpy.data.objects):
        if obj is not arm and obj.name == stem:
            obj.name = f"{stem}_tmp"
    charexport.export_character_glb(
        arm, [arm, garment_ob], str(glb_path), skinned=True, has_morphs=True
    )
    arm.name = prev_arm_name
    byte_size = glb_path.stat().st_size

    entry = {
        "file": f"models/wardrobe/{glb_name}",
        "tris": eval_res["tris"],
        "bytes": byte_size,
        "hideRegions": eval_res["hideRegions"],
        "bodyLimits": eval_res["bodyLimits"],
        "maxPenetrationMm": eval_res["maxPenetrationMm"],
    }

    if write_meta:
        meta_path = out_dir / f"{item_id}.meta.json"
        meta: dict = {
            "id": item_id,
            "slot": slot,
            "kind": "skinned",
            "bases": {},
        }
        if meta_path.exists():
            try:
                existing = json.loads(meta_path.read_text(encoding="utf-8"))
                if isinstance(existing, dict) and existing.get("id") == item_id:
                    meta["bases"] = existing.get("bases", {})
            except json.JSONDecodeError:
                pass
        meta["bases"][base] = {
            "file": entry["file"],
            "tris": entry["tris"],
            "hideRegions": entry["hideRegions"],
            "bodyLimits": entry["bodyLimits"],
            "maxPenetrationMm": entry["maxPenetrationMm"],
        }
        meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    report_dir = Path(report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)
    rep_path = report_dir / f"{item_id}.json"
    rep_data: dict = {"id": item_id, "slot": slot, "bases": {}}
    if rep_path.exists():
        try:
            existing_rep = json.loads(rep_path.read_text(encoding="utf-8"))
            if isinstance(existing_rep, dict) and existing_rep.get("id") == item_id:
                rep_data["bases"] = existing_rep.get("bases", {})
        except json.JSONDecodeError:
            pass
    rep_data["bases"][base] = {
        **entry,
        "neutralPenetrationMm": eval_res["neutralPenetrationMm"],
        "posePenetrationMm": eval_res["posePenetrationMm"],
        "effectiveLimits": eval_res["effectiveLimits"],
        "failingCombosBeforeNarrow": eval_res["failingCombosBeforeNarrow"],
        "combosTested": eval_res["combosTested"],
        "passed": eval_res["passed"],
    }
    rep_path.write_text(json.dumps(rep_data, indent=2) + "\n", encoding="utf-8")

    # Clean up temporary garment object/mesh from scene
    bpy.data.objects.remove(garment_ob, do_unlink=True)
    bpy.data.meshes.remove(mesh, do_unlink=True)

    return rep_data["bases"][base]
