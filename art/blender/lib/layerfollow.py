"""Outer layers follow the layers worn under them (P08a-T15, issue #19).

Tops take their shape-key deltas from the nearest body point, so under Heavy / Muscle / Chest / Hips the
shoulder-front sleeve root of a top travels further than the coarse neck -> arm_top chords of an outer
layer (blazer, cardigan, bomber, raincoat). ``follow_inner`` closes that gap in the generator: after the
outer and every top have been exported once, it measures the outer against each top with the layering
test's own metric (``lib.layering``) at the test corners and wherever a top vertex pokes through adds the
missing outward travel, plus ``WALL_M`` of clearance, to the outer's per-key deltas. Deltas only ever grow
outward, so the outer's body-clearance gate cannot get worse. The caller re-exports the outer with them.
"""

from __future__ import annotations

from mathutils import Vector

from lib import fit
from lib.layering import CORNERS, Garment, corner_combo, poke_hits

WALL_M = 0.003       # clearance of the outer wall outside an inner vertex once corrected
TRIGGER_M = 0.0005   # an inner vertex this far outside the wall is corrected
MAX_ITERS = 12
MAX_HIT_M = 0.018    # deeper "hits" are structural (a collar or hood above the neck ring), not poke-through
DONE_MM = 0.5        # stop once every pair is within this (the test threshold is 5 mm)
# The test clamps each corner to both items' bodyLimits, which never go below 60 % of the slider range;
# evaluate every corner at a few levels in between so the clamped corners are covered too.
LEVELS = (1.0, 0.94, 0.88, 0.82, 0.76, 0.7, 0.65, 0.6)
DEBUG = False


def _levels_combo(keys: tuple[str, ...], level: float) -> dict[str, float]:
    return {k: fit.DEFAULT_LIMITS[k][1] * level for k in keys}


def _pos_key(v: Vector) -> tuple[int, int, int]:
    return (round(v.x * 1e5), round(v.y * 1e5), round(v.z * 1e5))


def follow_inner(outer: Garment, inners: list[Garment]) -> dict[tuple[int, int, int], dict[str, Vector]]:
    """Return per-position delta growth ``{pos_key: {shape_key: Vector}}`` for ``outer``.

    ``outer.deltas`` is updated in place (duplicated split vertices at one position grow together), and
    ``outer._cache`` is cleared each iteration. The returned dict is applied to the generator's bmesh.
    """
    pk_of = [_pos_key(v) for v in outer.basis]
    outer.start_basis = [v.copy() for v in outer.basis]  # identity of a vertex position, fixed at the start
    by_pos: dict[tuple[int, int, int], list[int]] = {}
    for i, pk in enumerate(pk_of):
        by_pos.setdefault(pk, []).append(i)
    growth: dict[tuple[int, int, int], dict[str, Vector]] = {}
    corners = [("neutral", (), 1.0)] + [(cname, keys, lvl) for cname, keys in CORNERS if keys for lvl in LEVELS]
    for it in range(MAX_ITERS):
        shifts: list[tuple[tuple[str, ...], float, dict[int, Vector]]] = []
        worst = 0.0
        worst_at = None
        for _cname, keys, lvl in corners:
            combo = _levels_combo(keys, lvl)
            _ov, _ovn, ofn, _bvh, _edge = outer.at(combo)
            per_face: dict[int, Vector] = {}
            for inn in inners:
                for pen, idx, cosf in poke_hits(inn, outer, combo):
                    if pen > MAX_HIT_M:
                        continue
                    if pen > worst:
                        worst = pen
                        worst_at = (_cname, lvl, idx)
                    if pen <= TRIGGER_M:
                        continue
                    sv = ofn[idx] * (pen * cosf + WALL_M)
                    cur = per_face.get(idx)
                    if cur is None or sv.length > cur.length:
                        per_face[idx] = sv
            per_vert: dict[int, Vector] = {}
            for idx, sv in per_face.items():
                for vi in outer.tris[idx]:
                    cur = per_vert.get(vi)
                    if cur is None or sv.length > cur.length:
                        per_vert[vi] = sv
            shifts.append((keys, lvl, per_vert))
        if DEBUG:
            print(f"[layerfollow] iter {it} worst {worst * 1000:.1f} mm at {worst_at}")
        if worst * 1000.0 <= DONE_MM or not any(s[2] for s in shifts):
            break
        outer._cache.clear()
        # A corner at levels c_k moves a vertex by sum(c_k * d_k): grow d_k by shift * c_k / sum(c_j^2). Corners
        # overlap (they share keys and levels), so take the largest travel per vertex and key, not the sum.
        inc_map: dict[tuple[tuple[int, int, int], str], Vector] = {}
        for keys, lvl, per_vert in shifts:
            if not keys:
                # Neutral body: the rest shape itself has to move (stored under the "" key).
                for vi, sv in per_vert.items():
                    cur = inc_map.get((pk_of[vi], ""))
                    if cur is None or sv.length > cur.length:
                        inc_map[(pk_of[vi], "")] = sv
                continue
            combo = _levels_combo(keys, lvl)
            norm = sum(v * v for v in combo.values())
            for vi, sv in per_vert.items():
                pk = pk_of[vi]
                for k, c in combo.items():
                    inc = sv * (c / norm)
                    cur = inc_map.get((pk, k))
                    if cur is None or inc.length > cur.length:
                        inc_map[(pk, k)] = inc
        for (pk, k), inc in inc_map.items():
            growth.setdefault(pk, {}).setdefault(k, Vector((0.0, 0.0, 0.0)))
            growth[pk][k] += inc
            for j in by_pos[pk]:
                if k:
                    outer.deltas[k][j] += inc
                else:
                    outer.basis[j] += inc
    else:
        print(f"[layerfollow] WARNING not converged after {MAX_ITERS} iterations (worst {worst * 1000:.1f} mm); "
              "run npm run catalog:layering")
    return growth


def apply_growth(bm, deltas: dict[str, list[Vector]], start_basis: list[Vector], growth) -> None:
    """Add ``growth`` (from ``follow_inner``) to the generator's per-key ``deltas`` for ``bm``'s vertices."""
    from mathutils.kdtree import KDTree

    kd = KDTree(len(start_basis))
    for i, v in enumerate(start_basis):
        kd.insert(v, i)
    kd.balance()
    bm.verts.ensure_lookup_table()
    moves = []
    for v in bm.verts:
        _co, j, dist = kd.find(v.co)
        if dist > 2e-4:
            raise RuntimeError(f"layer-follow: no exported vertex near bm vertex {v.index} ({dist * 1000:.2f} mm)")
        g = growth.get(_pos_key(start_basis[j]))
        if g:
            for k, inc in g.items():
                if k:
                    deltas[k][v.index] = deltas[k][v.index] + inc
                else:
                    moves.append((v, inc))
    for v, inc in moves:
        v.co = v.co + inc
