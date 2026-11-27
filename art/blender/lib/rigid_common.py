"""Shared rigid-accessory helpers (P07a, split out of gen_rigid.py in P08a-T01).

``build_body_probe()`` measures the real head / face / neck / torso of both bases; the
cranium/scalp/torso helpers place geometry relative to it. Item modules live in
``art/blender/items_rigid/``; ``gen_rigid.py`` dispatches them.
"""
from __future__ import annotations

import json
import math
import os
import sys
from dataclasses import dataclass

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from lib import bodyshape, charexport, export, palette  # noqa: E402


ITEMS = [
    ("hair_short_01", "hair", "Head"),
    ("hair_bob_01", "hair", "Head"),
    ("hair_long_01", "hair", "Head"),
    ("hair_bun_01", "hair", "Head"),
    ("glasses_round_01", "glasses", "Head"),
    ("neck_necklace_01", "neck", "Neck"),
]


@dataclass
class BoxBounds:
    xmin: float
    xmax: float
    ymin: float
    ymax: float
    zmin: float
    zmax: float

    @property
    def cx(self) -> float:
        return 0.5 * (self.xmin + self.xmax)

    @property
    def cy(self) -> float:
        return 0.5 * (self.ymin + self.ymax)

    @property
    def cz(self) -> float:
        return 0.5 * (self.zmin + self.zmax)

    @property
    def width(self) -> float:
        return self.xmax - self.xmin

    @property
    def depth(self) -> float:
        return self.ymax - self.ymin

    @property
    def height(self) -> float:
        return self.zmax - self.zmin


@dataclass
class BodyProbe:
    scalp_bvh: BVHTree
    cranium_bvh: BVHTree
    cranium_bounds: BoxBounds
    full_head_bounds: BoxBounds
    head_center: Vector
    ear_l: BoxBounds
    ear_r: BoxBounds
    nose: BoxBounds
    eye_l: BoxBounds
    eye_r: BoxBounds
    brow_l: BoxBounds
    brow_r: BoxBounds
    mouth: BoxBounds
    neck_bounds: BoxBounds
    chest_bounds: BoxBounds
    torso_bvh: BVHTree
    male_torso_bvh: BVHTree


def _bounds(pts: list[Vector]) -> BoxBounds:
    return BoxBounds(
        xmin=min(p.x for p in pts),
        xmax=max(p.x for p in pts),
        ymin=min(p.y for p in pts),
        ymax=max(p.y for p in pts),
        zmin=min(p.z for p in pts),
        zmax=max(p.z for p in pts),
    )


def _extract_region_subbmesh(src_bm: bmesh.types.BMesh, mat_idx: int, col_layer, region_ids: set[int]):
    """Copy faces from `src_bm` matching `mat_idx` and vertex region IDs into a fresh BMesh."""
    dst = bmesh.new()
    vmap: dict[bmesh.types.BMVert, bmesh.types.BMVert] = {}
    for f in src_bm.faces:
        if f.material_index != mat_idx:
            continue
        rids = [round(loop[col_layer][0] * 255.0) for loop in f.loops]
        if not any(r in region_ids for r in rids):
            continue
        new_vs = []
        for v in f.verts:
            nv = vmap.get(v)
            if nv is None:
                nv = dst.verts.new(v.co.copy())
                vmap[v] = nv
            new_vs.append(nv)
        try:
            dst.faces.new(new_vs)
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(dst, faces=dst.faces[:])
    return dst


def _connected_islands(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMVert]]:
    seen: set[int] = set()
    bm.verts.index_update()
    islands: list[list[bmesh.types.BMVert]] = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        seen.add(v.index)
        comp: list[bmesh.types.BMVert] = []
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for e in cur.link_edges:
                nb = e.other_vert(cur)
                if nb.index not in seen:
                    seen.add(nb.index)
                    stack.append(nb)
        islands.append(comp)
    islands.sort(key=len, reverse=True)
    return islands


def _bmesh_from_vert_subset(verts: list[bmesh.types.BMVert], src_bm: bmesh.types.BMesh) -> bmesh.types.BMesh:
    vset = set(verts)
    dst = bmesh.new()
    vmap = {v: dst.verts.new(v.co.copy()) for v in verts}
    for f in src_bm.faces:
        if all(v in vset for v in f.verts):
            try:
                dst.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                pass
    bmesh.ops.recalc_face_normals(dst, faces=dst.faces[:])
    return dst


def build_body_probe() -> BodyProbe:
    """Build female + male base bodies briefly and extract exact head, face, and neck data."""
    export.clear_scene()
    _arm_f, ob_f, _meta_f = bodyshape.build_base_body("female")
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    bm.from_object(ob_f, deps)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    col_layer = bm.loops.layers.float_color.get(charexport.COLOR_LAYER)
    if col_layer is None:
        raise RuntimeError("Body mesh missing COLOR_0 layer")

    mat_names = [m.name if m else "" for m in ob_f.data.materials]
    pal_idx = mat_names.index("M_Palette") if "M_Palette" in mat_names else 0
    face_idx = mat_names.index("M_Face") if "M_Face" in mat_names else -1

    face_pts: dict[str, list[Vector]] = {
        "eye_l": [], "eye_r": [], "brow_l": [], "brow_r": [], "mouth": [],
    }
    if face_idx >= 0:
        for f in bm.faces:
            if f.material_index != face_idx:
                continue
            c = f.loops[0][col_layer]
            pts = [v.co.copy() for v in f.verts]
            cx = sum(p.x for p in pts) / len(pts)
            if c[0] > 0.5:
                face_pts["eye_l" if cx >= 0.0 else "eye_r"].extend(pts)
            elif c[1] > 0.5:
                face_pts["brow_l" if cx >= 0.0 else "brow_r"].extend(pts)
            elif c[2] > 0.5:
                face_pts["mouth"].extend(pts)

    head_rid = bodyshape.REGION_ID["head"]
    neck_rid = bodyshape.REGION_ID["neck"]
    chest_rid = bodyshape.REGION_ID["chest"]

    head_bm = _extract_region_subbmesh(bm, pal_idx, col_layer, {head_rid})
    scalp_bvh = BVHTree.FromBMesh(head_bm)
    full_head_bounds = _bounds([v.co.copy() for v in head_bm.verts])

    islands = _connected_islands(head_bm)
    cranium_bm = _bmesh_from_vert_subset(islands[0], head_bm)
    cranium_bvh = BVHTree.FromBMesh(cranium_bm)
    cranium_bounds = _bounds([v.co.copy() for v in cranium_bm.verts])
    head_center = Vector((cranium_bounds.cx, cranium_bounds.cy, cranium_bounds.cz))

    ear_l_pts: list[Vector] = []
    ear_r_pts: list[Vector] = []
    nose_pts: list[Vector] = []
    for isl in islands[1:]:
        pts = [v.co.copy() for v in isl]
        ib = _bounds(pts)
        if ib.cx > 0.035:
            ear_l_pts.extend(pts)
        elif ib.cx < -0.035:
            ear_r_pts.extend(pts)
        elif ib.ymin < cranium_bounds.ymin + 0.03:
            nose_pts.extend(pts)

    # Graceful fallbacks if a future body merges ears/nose into the cranium
    if not ear_l_pts:
        ear_l_pts = [
            Vector((cranium_bounds.xmax * 0.92, cranium_bounds.cy - 0.012, cranium_bounds.cz - 0.025)),
            Vector((cranium_bounds.xmax + 0.016, cranium_bounds.cy + 0.014, cranium_bounds.cz + 0.025)),
        ]
    if not ear_r_pts:
        ear_r_pts = [
            Vector((-cranium_bounds.xmax - 0.016, cranium_bounds.cy - 0.012, cranium_bounds.cz - 0.025)),
            Vector((-cranium_bounds.xmax * 0.92, cranium_bounds.cy + 0.014, cranium_bounds.cz + 0.025)),
        ]
    if not nose_pts:
        nz = 0.5 * (_bounds(face_pts["eye_l"]).zmin + _bounds(face_pts["mouth"]).zmax)
        nose_pts = [
            Vector((-0.014, cranium_bounds.ymin - 0.014, nz - 0.015)),
            Vector((0.014, cranium_bounds.ymin + 0.005, nz + 0.015)),
        ]

    neck_bm = _extract_region_subbmesh(bm, pal_idx, col_layer, {neck_rid})
    neck_bounds = _bounds([v.co.copy() for v in neck_bm.verts])
    chest_bm = _extract_region_subbmesh(bm, pal_idx, col_layer, {chest_rid})
    chest_bounds = _bounds([v.co.copy() for v in chest_bm.verts])
    torso_bm = _extract_region_subbmesh(bm, pal_idx, col_layer, {neck_rid, chest_rid})
    torso_bvh = BVHTree.FromBMesh(torso_bm)

    head_bm.free()
    cranium_bm.free()
    neck_bm.free()
    chest_bm.free()
    torso_bm.free()
    bm.free()

    # Probe male neck + upper-chest envelope so shared rigid items clear both bases
    export.clear_scene()
    _arm_m, ob_m, _meta_m = bodyshape.build_base_body("male")
    bpy.context.view_layer.update()
    deps_m = bpy.context.evaluated_depsgraph_get()
    bm_m = bmesh.new()
    bm_m.from_object(ob_m, deps_m)
    col_m = bm_m.loops.layers.float_color.get(charexport.COLOR_LAYER)
    m_mat_names = [m.name if m else "" for m in ob_m.data.materials]
    m_pal_idx = m_mat_names.index("M_Palette") if "M_Palette" in m_mat_names else 0
    male_torso_bm = _extract_region_subbmesh(bm_m, m_pal_idx, col_m, {neck_rid, chest_rid})
    male_torso_bvh = BVHTree.FromBMesh(male_torso_bm)
    male_torso_bm.free()
    bm_m.free()
    export.clear_scene()

    return BodyProbe(
        scalp_bvh=scalp_bvh,
        cranium_bvh=cranium_bvh,
        cranium_bounds=cranium_bounds,
        full_head_bounds=full_head_bounds,
        head_center=head_center,
        ear_l=_bounds(ear_l_pts),
        ear_r=_bounds(ear_r_pts),
        nose=_bounds(nose_pts),
        eye_l=_bounds(face_pts["eye_l"]),
        eye_r=_bounds(face_pts["eye_r"]),
        brow_l=_bounds(face_pts["brow_l"]),
        brow_r=_bounds(face_pts["brow_r"]),
        mouth=_bounds(face_pts["mouth"]),
        neck_bounds=neck_bounds,
        chest_bounds=chest_bounds,
        torso_bvh=torso_bvh,
        male_torso_bvh=male_torso_bvh,
    )


def _cranium_ray_surface(probe: BodyProbe, dir_vec: Vector) -> tuple[Vector, Vector]:
    """Cast from outside toward `probe.head_center` along `-dir_vec` onto cranium BVH."""
    d = dir_vec.normalized()
    origin = probe.head_center + d * 0.65
    hit, norm, _idx, _dist = probe.cranium_bvh.ray_cast(origin, -d, 0.70)
    if hit is None:
        # Fallback onto nearest surface point
        hit, norm, _idx, _dist = probe.cranium_bvh.find_nearest(probe.head_center + d * 0.14)
    if norm.dot(d) < 0:
        norm = -norm
    return hit, norm.normalized()


def _dir_from_theta_phi(theta: float, phi: float) -> Vector:
    """Azimuth `theta` (0 = -Y front, pi/2 = +X left, pi = +Y back), elevation `phi` (-pi/2..+pi/2)."""
    cp = math.cos(phi)
    return Vector((cp * math.sin(theta), -cp * math.cos(theta), math.sin(phi)))


def _cranium_ring_point(probe: BodyProbe, theta: float, z: float, offset_m: float, center_z: float | None = None) -> Vector:
    """Project from `(0, head_center.y, z)` radially at `theta` onto cranium, offset outward by `offset_m`."""
    cz = probe.head_center.z if center_z is None else center_z
    c = Vector((0.0, probe.head_center.y, cz))
    d = Vector((math.sin(theta), -math.cos(theta), 0.0))
    origin = Vector((0.0, probe.head_center.y, z)) + d * 0.55
    hit, norm, _idx, _dist = probe.cranium_bvh.ray_cast(origin, -d, 0.60)
    if hit is None:
        return _cranium_ray_surface(probe, (Vector((d.x, d.y, (z - c.z) * 2.0))).normalized())[0] + d * offset_m
    out_dir = (norm * 0.65 + d * 0.35).normalized()
    return hit + out_dir * offset_m


def _torso_surface_point(bvh_list: list[BVHTree], z: float, theta: float, fallback_r: float = 0.055) -> tuple[Vector, Vector]:
    """Max outward radius from torso/neck BVHs at `(z, theta)` (`theta=0` -> front -Y)."""
    d = Vector((math.sin(theta), -math.cos(theta), 0.0))
    best_r = fallback_r
    best_pt = Vector((0.0, 0.0, z)) + d * fallback_r
    best_norm = d.copy()
    origin = Vector((0.0, 0.0, z)) + d * 0.55
    for bvh in bvh_list:
        hit, norm, _idx, _dist = bvh.ray_cast(origin, -d, 0.60)
        if hit is not None:
            r = hit.x * d.x + hit.y * d.y
            if r > best_r:
                best_r = r
                best_pt = hit
                best_norm = norm if norm.dot(d) >= 0 else -norm
    return best_pt, best_norm.normalized()


def _signed_scalp_dist(probe: BodyProbe, p: Vector) -> tuple[float, Vector]:
    """Signed distance from point `p` to full `scalp_bvh` (+ outside, - inside)."""
    loc, norm, _idx, dist = probe.scalp_bvh.find_nearest(p)
    if loc is None:
        return 1.0, Vector((0.0, 0.0, 1.0))
    if (p - loc).dot(norm) < 0.0:
        return -dist, norm
    return dist, norm


def enforce_scalp_clearance(bm: bmesh.types.BMesh, probe: BodyProbe, min_clear_m: float = 0.005) -> None:
    """Iteratively push vertices/chords sitting closer than `min_clear_m` to the scalp safely outward."""
    def _push_vert(v: bmesh.types.BMVert, target_delta: float, norm: Vector) -> None:
        rad = v.co - probe.head_center
        rad_dir = rad.normalized() if rad.length > 1e-5 else norm
        push_dir = (norm * 0.65 + rad_dir * 0.35).normalized()
        v.co += push_dir * target_delta

    for v in bm.verts:
        sd, norm = _signed_scalp_dist(probe, v.co)
        if sd < min_clear_m + 0.0015:
            _push_vert(v, (min_clear_m + 0.0015 - sd) + 0.0005, norm)

    for _pass in range(4):
        moved = False
        for e in bm.edges:
            mid = 0.5 * (e.verts[0].co + e.verts[1].co)
            sd, norm = _signed_scalp_dist(probe, mid)
            if sd < min_clear_m:
                delta = min_clear_m - sd + 0.0008
                _push_vert(e.verts[0], delta, norm)
                _push_vert(e.verts[1], delta, norm)
                moved = True
        for f in bm.faces:
            c = f.calc_center_median()
            sd, norm = _signed_scalp_dist(probe, c)
            if sd < min_clear_m:
                delta = min_clear_m - sd + 0.0008
                for v in f.verts:
                    _push_vert(v, delta, norm)
                moved = True
        if not moved:
            break


def measure_min_scalp_distance(bm: bmesh.types.BMesh, probe: BodyProbe) -> float:
    """Return minimum signed distance in metres across vertices, edge midpoints, and face centroids."""
    pts: list[Vector] = [v.co for v in bm.verts]
    for e in bm.edges:
        pts.append(0.5 * (e.verts[0].co + e.verts[1].co))
    for f in bm.faces:
        pts.append(f.calc_center_median())
    return min(_signed_scalp_dist(probe, p)[0] for p in pts)


def check_face_quads_clear(bm: bmesh.types.BMesh, probe: BodyProbe) -> bool:
    """Verify no mesh vertex or face centroid sits inside/in front of any `M_Face` quad zone."""
    quads = (probe.eye_l, probe.eye_r, probe.brow_l, probe.brow_r, probe.mouth)
    samples = [v.co for v in bm.verts] + [f.calc_center_median() for f in bm.faces]
    for p in samples:
        for q in quads:
            if (q.xmin - 0.001 <= p.x <= q.xmax + 0.001) and (q.zmin - 0.001 <= p.z <= q.zmax + 0.001):
                if p.y <= q.ymax + 0.004:
                    return False
    return True


def _paint_hair_faces(bm: bmesh.types.BMesh, probe: BodyProbe, hi_pred, shade_lo: float = 0.76, shade_hi: float = 1.0) -> None:
    """Assign `hair_black` / `hair_black_hi` UVs and gradient `COLOR_0` (0, 0, 0, shade)."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    charexport.ensure_color_layer(bm)
    base_faces = []
    hi_faces = []
    shade_map = {}
    z_lo = probe.chest_bounds.zmin if any(v.co.z < probe.full_head_bounds.zmin for v in bm.verts) else probe.full_head_bounds.zmin
    z_hi = probe.full_head_bounds.zmax + 0.03
    dz = max(z_hi - z_lo, 0.05)

    for f in bm.faces:
        c = f.calc_center_median()
        if hi_pred(f, c):
            hi_faces.append(f)
        else:
            base_faces.append(f)
        t_z = max(0.0, min(1.0, (c.z - z_lo) / dz))
        t_up = 0.5 + 0.5 * f.normal.z
        shade = shade_lo + (shade_hi - shade_lo) * (0.65 * t_z + 0.35 * t_up)
        shade_map[f] = max(0.65, min(1.0, shade))

    charexport.paint_palette(bm, base_faces, "hair_black")
    charexport.paint_palette(bm, hi_faces, "hair_black_hi")
    charexport.set_garment_colors(bm, {f: "none" for f in bm.faces}, shade=shade_map)


def _weld_doubles(bm: bmesh.types.BMesh, dist: float = 1e-4) -> None:
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=dist)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def _make_closed_cap_shell(
    probe: BodyProbe,
    rings_outer: list[list[Vector]],
    rings_inner: list[list[Vector]],
    crown_outer: Vector,
    crown_inner: Vector,
    *,
    connect_inner_cap: bool = True,
) -> tuple[bmesh.types.BMesh, list[bmesh.types.BMFace]]:
    """Loft closed double-walled hair dome/skirt so every angle has outward normals and >= 4 mm clearance."""
    bm = bmesh.new()
    n = len(rings_outer[0])

    outer_vs = [[bm.verts.new(p) for p in r] for r in rings_outer]
    inner_vs = [[bm.verts.new(p) for p in r] for r in rings_inner]
    v_crown_out = bm.verts.new(crown_outer)
    v_crown_in = bm.verts.new(crown_inner) if connect_inner_cap else None

    top_faces: list[bmesh.types.BMFace] = []
    # Crown fan
    for i in range(n):
        i2 = (i + 1) % n
        top_faces.append(bm.faces.new((outer_vs[0][i], outer_vs[0][i2], v_crown_out)))
    # Outer bands
    for r0, r1 in zip(outer_vs, outer_vs[1:]):
        for i in range(n):
            i2 = (i + 1) % n
            bm.faces.new((r1[i], r1[i2], r0[i2], r0[i]))
    # Bottom hem bevel connecting outer[-1] -> inner[-1]
    ro_bot = outer_vs[-1]
    ri_bot = inner_vs[-1]
    for i in range(n):
        i2 = (i + 1) % n
        bm.faces.new((ri_bot[i], ri_bot[i2], ro_bot[i2], ro_bot[i]))
    # Inner lining upward (reversed winding)
    for r0, r1 in zip(inner_vs, inner_vs[1:]):
        for i in range(n):
            i2 = (i + 1) % n
            bm.faces.new((r0[i], r0[i2], r1[i2], r1[i]))
    if connect_inner_cap and v_crown_in is not None:
        for i in range(n):
            i2 = (i + 1) % n
            bm.faces.new((v_crown_in, inner_vs[0][i2], inner_vs[0][i]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm, top_faces


def _add_prism_lock(bm: bmesh.types.BMesh, rings: list[list[Vector]]) -> list[bmesh.types.BMFace]:
    """Loft a closed tapered strand/lock from 4-vertex cross-section rings."""
    v_rings = [[bm.verts.new(p) for p in r] for r in rings]
    m = len(v_rings[0])
    faces: list[bmesh.types.BMFace] = []
    # Cap start and end
    faces.append(bm.faces.new(tuple(reversed(v_rings[0]))))
    for r0, r1 in zip(v_rings, v_rings[1:]):
        for j in range(m):
            j2 = (j + 1) % m
            faces.append(bm.faces.new((r0[j], r0[j2], r1[j2], r1[j])))
    faces.append(bm.faces.new(tuple(v_rings[-1])))
    return faces


# ---------------------------------------------------------------------------
# 1. hair_short_01
# ---------------------------------------------------------------------------




# ---------------------------------------------------------------------------
# Hats over hair (P08a §3.2): one shared hat band so hair and hat batches agree
# ---------------------------------------------------------------------------

HAT_BAND_ABOVE_BROW_M = 0.028
"""The hat band (lower rim of cap / beret / non la crown) sits this far above the brow tops."""
HAT_CLEAR_M = 0.035
"""Hat inner surface offset from the scalp at and above the band (cover any hair under it)."""
HAIR_MAX_UNDER_HAT_M = 0.030
"""Hair must stay within this offset from the scalp between the band and the hatcut line."""
HATCUT_ABOVE_BAND_M = 0.010
"""Hatcut hair drops every face whose lowest vertex is above band + this."""


def hat_band_z(probe: BodyProbe) -> float:
    """World z of the shared hat band."""
    return max(probe.brow_l.zmax, probe.brow_r.zmax) + HAT_BAND_ABOVE_BROW_M


def hat_ring_point(probe: BodyProbe, theta: float, z: float | None = None, extra_m: float = 0.0) -> Vector:
    """Point on the hat's inner surface at azimuth ``theta`` (0 = front) and height ``z`` (default band)."""
    return _cranium_ring_point(probe, theta, hat_band_z(probe) if z is None else z, HAT_CLEAR_M + extra_m)


def hatcut(bm: bmesh.types.BMesh, probe: BodyProbe) -> bmesh.types.BMesh:
    """Copy of hair ``bm`` with the crown removed (worn under items whose meta has hairClip=crown)."""
    out = bm.copy()
    cut_z = hat_band_z(probe) + HATCUT_ABOVE_BAND_M
    drop = [f for f in out.faces if min(v.co.z for v in f.verts) > cut_z]
    bmesh.ops.delete(out, geom=drop, context="FACES")
    loose = [v for v in out.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(out, geom=loose, context="VERTS")
    return out


def hair_crown_max_offset(bm: bmesh.types.BMesh, probe: BodyProbe) -> float:
    """Largest scalp offset (m) of hair that remains in the hatcut between band and cut line."""
    lo = hat_band_z(probe)
    hi = lo + HATCUT_ABOVE_BAND_M
    worst = 0.0
    for f in bm.faces:
        if min(v.co.z for v in f.verts) > hi:
            continue
        for v in f.verts:
            if v.co.z >= lo:
                worst = max(worst, _signed_scalp_dist(probe, v.co)[0])
    return worst
