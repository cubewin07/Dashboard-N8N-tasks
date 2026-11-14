"""Generator for the 6 rigid wardrobe items: 4 hairstyles, round glasses, gold necklace.

All geometry is derived programmatically from `lib.bodyshape.build_base_body('female')`
(with neck/upper-back clearance also checked against `'male'`) so re-running after any
head or neck proportion update refits every item automatically.

Outputs `<out>/wardrobe/<id>.glb` and `<out>/wardrobe/<id>.meta.json`.
Does NOT modify `art/targets.json`.

Usage:
    Blender -b --factory-startup --python-exit-code 1 -P art/blender/gen_rigid.py -- \\
        --out art/.cache/raw [--only hair_short_01,glasses_round_01]
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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


def build_hair_short_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Short cropped hair with chunky side-swept fringe, parted top volume, ear clearance."""
    hb = probe.cranium_bounds
    brow_top = max(probe.brow_l.zmax, probe.brow_r.zmax)
    ear_top = max(probe.ear_l.zmax, probe.ear_r.zmax)
    ear_bot = min(probe.ear_l.zmin, probe.ear_r.zmin)
    ear_front = min(probe.ear_l.ymin, probe.ear_r.ymin)
    face_edge_x = max(abs(probe.brow_l.xmax), abs(probe.brow_r.xmin))

    n = 14
    # Latitude profile on cranium: rings from upper crown down to lower hairline
    z_crown_ring = hb.cz + 0.62 * (hb.zmax - hb.cz)
    z_upper_ring = hb.cz + 0.34 * (hb.zmax - hb.cz)
    z_mid_ring = brow_top + 0.016

    rings_out: list[list[Vector]] = [[] for _ in range(4)]
    rings_in: list[list[Vector]] = [[] for _ in range(4)]

    for i in range(n):
        th = 2.0 * math.pi * i / n
        c = math.cos(th)       # +1 = front (-Y), -1 = back (+Y)
        s = math.sin(th)       # +1 = left (+X), -1 = right (-X)
        side = abs(s)

        # Asymmetric slight top part puff (+X slightly fuller)
        part_bump = 0.005 * max(0.0, s) + 0.004 * max(0.0, c)

        # Ring 0: upper crown
        p0, n0 = _cranium_ray_surface(probe, _dir_from_theta_phi(th, math.radians(52)))
        rings_out[0].append(p0 + n0 * (0.021 + part_bump))
        rings_in[0].append(p0 + n0 * 0.0055)

        # Ring 1: temple / brow crown
        p1, n1 = _cranium_ray_surface(probe, _dir_from_theta_phi(th, math.radians(28)))
        rings_out[1].append(p1 + n1 * (0.023 + 0.004 * max(0.0, -c) + part_bump))
        rings_in[1].append(p1 + n1 * 0.0055)

        # Ring 2: mid temple / back upper skull
        z2 = z_mid_ring if c >= 0 else (z_mid_ring - 0.020 * (-c))
        rings_out[2].append(_cranium_ring_point(probe, th, z2, 0.020 + 0.004 * max(0.0, c)))
        rings_in[2].append(_cranium_ring_point(probe, th, z2, 0.0055))

        # Ring 3: carved hairline (above brows at front, notched over ears, tapered to nape)
        if c > 0.35:
            # Forehead fringe hairline safely above brow tops
            z3 = brow_top + 0.0065 + 0.006 * max(0.0, s)
            off3 = 0.018
        elif side > 0.55 and c > -0.45:
            # Side temples notch neatly above ears; slight sideburn drop in front of ear
            in_front = max(0.0, (c + 0.15) / 0.50)
            z3 = ear_top + 0.004 - 0.018 * min(1.0, in_front) * (1.0 - max(0.0, (side - 0.7) * 0.6))
            off3 = 0.013
        else:
            # Back nape taper
            z3 = ear_bot - 0.010
            off3 = 0.014
        # Clamp bottom hairline above chin
        z3 = max(z3, hb.zmin + 0.015)
        rings_out[3].append(_cranium_ring_point(probe, th, z3, off3))
        rings_in[3].append(_cranium_ring_point(probe, th, z3 + 0.003, 0.005))

    p_top, n_top = _cranium_ray_surface(probe, Vector((0.0, 0.0, 1.0)))
    crown_out = p_top + n_top * 0.025 + Vector((0.005, -0.004, 0.0))
    crown_in = p_top + n_top * 0.0055

    bm, top_faces = _make_closed_cap_shell(probe, rings_out, rings_in, crown_out, crown_in)

    # Add 3 chunky swept fringe blocks across the upper forehead (all above brow_top + 6 mm)
    fringe_faces: list[bmesh.types.BMFace] = []
    block_specs = [
        (-0.048, -0.006, 0.018, 0.008),
        (-0.004,  0.036, 0.014, 0.005),
        ( 0.034,  0.068, 0.020, 0.009),
    ]
    for x0, x1, dz_drop, fwd_extra in block_specs:
        xm = 0.5 * (x0 + x1)
        th_m = math.atan2(xm, 0.10)
        z_base = brow_top + 0.0075
        p_top = _cranium_ring_point(probe, th_m, z_base + 0.026, 0.0065)
        p_bot = _cranium_ring_point(probe, th_m, z_base + 0.008, 0.0065)
        p_tip = _cranium_ring_point(probe, th_m, z_base + dz_drop * 0.15, 0.022 + fwd_extra)
        # Rectangular 4-point cross-sections from temple root out to chunky brow-crest tip
        r0 = [
            Vector((x0, p_top.y, z_base + 0.026)),
            Vector((x1, p_top.y, z_base + 0.026)),
            Vector((x1, p_bot.y, z_base + 0.008)),
            Vector((x0, p_bot.y, z_base + 0.008)),
        ]
        r1 = [
            Vector((x0 + 0.004, p_tip.y + 0.008, z_base + 0.020)),
            Vector((x1 - 0.004, p_tip.y + 0.008, z_base + 0.020)),
            Vector((x1 - 0.006, p_tip.y - 0.004, z_base + 0.001)),
            Vector((x0 + 0.006, p_tip.y - 0.004, z_base + 0.001)),
        ]
        fringe_faces.extend(_add_prism_lock(bm, [r0, r1]))

    # Sideburn tabs in front of ears
    for sx in (-1.0, 1.0):
        th_sb = sx * math.radians(66.0)
        p_sb_top = _cranium_ring_point(probe, th_sb, ear_top + 0.005, 0.0065)
        p_sb_bot = _cranium_ring_point(probe, th_sb, ear_bot + 0.008, 0.0065)
        sb_rings = [
            [
                Vector((p_sb_top.x - sx * 0.001, ear_front - 0.024, ear_top + 0.005)),
                Vector((p_sb_top.x + sx * 0.015, ear_front - 0.024, ear_top + 0.005)),
                Vector((p_sb_top.x + sx * 0.015, ear_front - 0.004, ear_top + 0.005)),
                Vector((p_sb_top.x - sx * 0.001, ear_front - 0.004, ear_top + 0.005)),
            ],
            [
                Vector((p_sb_bot.x - sx * 0.001, ear_front - 0.019, ear_bot + 0.008)),
                Vector((p_sb_bot.x + sx * 0.011, ear_front - 0.019, ear_bot + 0.008)),
                Vector((p_sb_bot.x + sx * 0.011, ear_front - 0.006, ear_bot + 0.008)),
                Vector((p_sb_bot.x - sx * 0.001, ear_front - 0.006, ear_bot + 0.008)),
            ],
        ]
        _add_prism_lock(bm, sb_rings)

    # Clear face x span safeguard
    _ = face_edge_x
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    enforce_scalp_clearance(bm, probe, min_clear_m=0.0045)
    _paint_hair_faces(bm, probe, lambda f, c: (c.z > z_crown_ring and f.normal.z > 0.35) or (c.z > z_upper_ring and f.normal.z > 0.55))
    return bm


# ---------------------------------------------------------------------------
# 2. hair_bob_01
# ---------------------------------------------------------------------------


def build_hair_bob_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Chin-length chunky faceted bob with full rounded crown, ear-covering bell curtains, open face."""
    hb = probe.cranium_bounds
    fb = probe.full_head_bounds
    brow_top = max(probe.brow_l.zmax, probe.brow_r.zmax)
    eye_out_x = max(abs(probe.eye_l.xmax), abs(probe.eye_r.xmin))
    face_open_x = max(abs(probe.brow_l.xmax), eye_out_x) + 0.013
    ear_half_w = max(abs(probe.ear_l.xmax), abs(probe.ear_r.xmin))
    bob_bot_z = hb.zmin - 0.008  # Right at chin/jawline, safely above shoulders

    # Build continuous curved bell shell from side-front around the back to opposite side-front
    # PLUS swept bangs across the upper forehead.
    bm = bmesh.new()
    cols = 13  # azimuth stations from +front-left around back to +front-right
    # Angle where face window starts on either side: ~asin(face_open_x / max_x) -> ~38 deg
    ang_open = math.asin(min(0.85, (face_open_x + 0.008) / max(hb.xmax, 0.10)))
    thetas = [ang_open + (2.0 * math.pi - 2.0 * ang_open) * k / (cols - 1) for k in range(cols)]

    # Cross-section stations along vertical drape (5 heights from crown crest down to chin hem)
    v_levels = [
        ("crown", 0.88),
        ("temple", 0.42),
        ("ear_mid", 0.05),
        ("cheek_flare", -0.50),
        ("hem", -1.00),
    ]

    def _bob_xy_z(th: float, t_norm: float, is_inner: bool) -> Vector:
        c = math.cos(th)
        s = math.sin(th)
        if t_norm >= 0.0:
            p, n = _cranium_ray_surface(probe, _dir_from_theta_phi(th, t_norm * math.radians(68)))
            flare = 0.025 + 0.012 * (1.0 - t_norm) * abs(s)
            extra_ear = 0.008 if (not is_inner and t_norm < 0.25 and abs(s) > 0.65) else 0.0
            if is_inner:
                off = max(0.005, (ear_half_w - hb.xmax + 0.005) if (t_norm < 0.25 and abs(s) > 0.65) else 0.005)
            else:
                off = flare + extra_ear
            return p + n * off
        else:
            # Below equator: drape straight down & slightly flared at cheek, then curl neatly in at hem
            u = -t_norm  # 0 at ear_mid -> 1 at bob_bot_z
            z = probe.head_center.z * (1.0 - u) + bob_bot_z * u
            eq_p, eq_n = _cranium_ray_surface(probe, Vector((s, -c, 0.0)).normalized())
            r_base = max(math.hypot(eq_p.x, eq_p.y - probe.head_center.y), ear_half_w * abs(s) + hb.ymax * abs(c))
            # Outward bell flare mid-cheek, subtle tuck-in at hem
            bell = 0.036 * (1.0 - 0.30 * u) + 0.008 * math.sin(u * math.pi)
            if is_inner:
                bell = 0.014 * (1.0 - 0.25 * u)
            rad_dir = Vector((s, -c, 0.0)).normalized()
            center = Vector((0.0, probe.head_center.y, z))
            # Keep front side locks well outside face opening & jaw
            rx_cur = max(r_base, ear_half_w if abs(s) > 0.5 else r_base) + bell
            pt = center + rad_dir * rx_cur
            if abs(pt.x) < face_open_x and pt.y < probe.head_center.y:
                pt.x = math.copysign(face_open_x, s if abs(s) > 1e-4 else 1.0)
            return pt

    outer_grid = [[bm.verts.new(_bob_xy_z(th, t, False)) for th in thetas] for _, t in v_levels]
    inner_grid = [[bm.verts.new(_bob_xy_z(th, t, True)) for th in thetas] for _, t in v_levels]

    # Top crown crest rounded smoothly over the top ring (no pointed pyramid tip)
    crown_z = sum(v.co.z for v in outer_grid[0]) / len(outer_grid[0]) + 0.004
    crown_in_z = sum(v.co.z for v in inner_grid[0]) / len(inner_grid[0]) + 0.0025
    top_center_out = bm.verts.new(Vector((0.0, probe.head_center.y + 0.004, crown_z)))
    top_center_in = bm.verts.new(Vector((0.0, probe.head_center.y + 0.004, crown_in_z)))

    # Loft outer skin & inner lining along the 280 deg curtain
    for r0, r1 in zip(outer_grid, outer_grid[1:]):
        for k in range(cols - 1):
            bm.faces.new((r1[k], r1[k + 1], r0[k + 1], r0[k]))
    for r0, r1 in zip(inner_grid, inner_grid[1:]):
        for k in range(cols - 1):
            bm.faces.new((r0[k], r0[k + 1], r1[k + 1], r1[k]))
    # Bottom hem wall (connects outer[-1] -> inner[-1])
    for k in range(cols - 1):
        bm.faces.new((inner_grid[-1][k], inner_grid[-1][k + 1], outer_grid[-1][k + 1], outer_grid[-1][k]))
    # Front-left and front-right vertical edge walls closing the face opening below bangs
    for r_i in range(1, len(v_levels) - 1):
        bm.faces.new((inner_grid[r_i][0], inner_grid[r_i + 1][0], outer_grid[r_i + 1][0], outer_grid[r_i][0]))
        bm.faces.new((outer_grid[r_i][-1], outer_grid[r_i + 1][-1], inner_grid[r_i + 1][-1], inner_grid[r_i][-1]))

    # Connect crown ring to top_center + add sculpted forehead bangs closing the top of the face opening!
    for k in range(cols - 1):
        bm.faces.new((outer_grid[0][k], outer_grid[0][k + 1], top_center_out))
        bm.faces.new((top_center_in, inner_grid[0][k + 1], inner_grid[0][k]))

    # Forehead fringe cap bridging front-right (k=cols-1) -> front-left (k=0) across the forehead
    bang_cols = 5
    bang_thetas = [-ang_open + 2.0 * ang_open * k / (bang_cols - 1) for k in range(bang_cols)]
    bang_top_out: list[bmesh.types.BMVert] = []
    bang_bot_out: list[bmesh.types.BMVert] = []
    bang_top_in: list[bmesh.types.BMVert] = []
    bang_bot_in: list[bmesh.types.BMVert] = []
    for k, th in enumerate(bang_thetas):
        if k == 0:
            bang_top_out.append(outer_grid[0][-1])
            bang_bot_out.append(outer_grid[1][-1])
            bang_top_in.append(inner_grid[0][-1])
            bang_bot_in.append(inner_grid[1][-1])
        elif k == bang_cols - 1:
            bang_top_out.append(outer_grid[0][0])
            bang_bot_out.append(outer_grid[1][0])
            bang_top_in.append(inner_grid[0][0])
            bang_bot_in.append(inner_grid[1][0])
        else:
            pt, nt = _cranium_ray_surface(probe, _dir_from_theta_phi(th, math.radians(52)))
            # Subtle center-part V-notch in the bangs, staying safely >= brow_top + 6 mm
            part_raise = 0.008 * (1.0 - abs(k - 2) * 0.45)
            z_b = brow_top + 0.0065 + part_raise
            pb_out = _cranium_ring_point(probe, th, z_b, 0.024)
            pb_in = _cranium_ring_point(probe, th, z_b + 0.002, 0.0055)
            bang_top_out.append(bm.verts.new(pt + nt * 0.025))
            bang_bot_out.append(bm.verts.new(pb_out))
            bang_top_in.append(bm.verts.new(pt + nt * 0.0055))
            bang_bot_in.append(bm.verts.new(pb_in))

    for k in range(bang_cols - 1):
        bm.faces.new((bang_top_out[k], bang_top_out[k + 1], top_center_out))
        bm.faces.new((bang_bot_out[k], bang_bot_out[k + 1], bang_top_out[k + 1], bang_top_out[k]))
        bm.faces.new((bang_bot_in[k], bang_bot_in[k + 1], bang_bot_out[k + 1], bang_bot_out[k]))
        bm.faces.new((bang_top_in[k], bang_top_in[k + 1], bang_bot_in[k + 1], bang_bot_in[k]))
        bm.faces.new((top_center_in, bang_top_in[k + 1], bang_top_in[k]))

    _weld_doubles(bm, 1e-4)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    enforce_scalp_clearance(bm, probe, min_clear_m=0.0045)
    z_hi_band = hb.cz + 0.45 * (hb.zmax - hb.cz)
    _paint_hair_faces(bm, probe, lambda f, c: c.z > z_hi_band and f.normal.z > 0.30)
    return bm


# ---------------------------------------------------------------------------
# 3. hair_long_01
# ---------------------------------------------------------------------------


def build_hair_long_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Long hair cascading past shoulders behind back + two chunky front side-locks framing cheeks."""
    hb = probe.cranium_bounds
    fb = probe.full_head_bounds
    brow_top = max(probe.brow_l.zmax, probe.brow_r.zmax)
    eye_out_x = max(abs(probe.eye_l.xmax), abs(probe.eye_r.xmin))
    face_open_x = max(abs(probe.brow_l.xmax), eye_out_x) + 0.015
    ear_half_w = max(abs(probe.ear_l.xmax), abs(probe.ear_r.xmin))
    shoulder_z = probe.chest_bounds.zmax
    drape_end_z = probe.chest_bounds.zmin + 0.035  # Mid-scapula / past shoulders

    bm = bmesh.new()
    # Part A: Voluminous head crown + sweeping back cascade (from front-left temple around back to front-right)
    cols = 13
    ang_open = math.asin(min(0.85, (face_open_x + 0.008) / max(hb.xmax, 0.10)))
    thetas = [ang_open + (2.0 * math.pi - 2.0 * ang_open) * k / (cols - 1) for k in range(cols)]

    # Query max back surface Y across BOTH female & male chests at mid-back height so drape clears both
    back_clear_y = max(hb.ymax + 0.012, probe.chest_bounds.ymax + 0.022)
    for z_chk in (shoulder_z - 0.02, shoulder_z - 0.08, drape_end_z + 0.02):
        pt_b, _n_b = _torso_surface_point([probe.torso_bvh, probe.male_torso_bvh], z_chk, math.pi, fallback_r=0.10)
        back_clear_y = max(back_clear_y, pt_b.y + 0.016)

    ear_mid_z = 0.5 * (probe.ear_l.zmin + probe.ear_l.zmax)

    def _long_pt(th: float, stage: str, is_inner: bool) -> Vector:
        c = math.cos(th)
        s = math.sin(th)
        backness = max(0.0, -c)
        if stage == "crown":
            p, n = _cranium_ray_surface(probe, _dir_from_theta_phi(th, math.radians(60)))
            return p + n * (0.0055 if is_inner else 0.020)
        if stage == "temple":
            p, n = _cranium_ray_surface(probe, _dir_from_theta_phi(th, math.radians(28)))
            pt = p + n * (0.006 if is_inner else 0.020 + 0.004 * abs(s))
            if abs(s) > 0.68 and -0.45 <= c <= 0.52:
                min_x = ear_half_w + (0.006 if is_inner else 0.018)
                if abs(pt.x) < min_x:
                    pt.x = math.copysign(min_x, s)
            return pt
        if stage == "ear":
            p, n = _cranium_ray_surface(probe, _dir_from_theta_phi(th, math.radians(2)))
            pt = p + n * (0.0065 if is_inner else 0.022 + 0.005 * abs(s))
            pt.z = ear_mid_z
            if abs(s) > 0.65 and -0.50 <= c <= 0.52:
                min_x = ear_half_w + (0.007 if is_inner else 0.020)
                if abs(pt.x) < min_x:
                    pt.x = math.copysign(min_x, s)
            elif abs(pt.x) < face_open_x and c >= 0:
                pt.x = math.copysign(face_open_x, s if abs(s) > 1e-4 else 1.0)
            return pt
        if stage == "chin":
            z = hb.zmin - 0.005
            # Front sides stay out by face_open_x; back sweeps behind neck/ear line cleanly
            y_target = max(probe.head_center.y + 0.02, back_clear_y) if c < -0.15 else (probe.head_center.y - 0.02 * c)
            side_w = (ear_half_w + (0.006 if is_inner else 0.020)) if abs(s) > 0.7 else (hb.xmax + 0.018)
            x_w = max(side_w, face_open_x + 0.008)
            x = s * x_w
            if c < 0:
                y = probe.head_center.y + (-c) * (y_target - probe.head_center.y + (0.002 if is_inner else 0.020))
            else:
                y = probe.head_center.y - c * (hb.ymax * 0.72)
            if abs(x) < face_open_x and y < probe.head_center.y:
                x = math.copysign(face_open_x, s if abs(s) > 1e-4 else 1.0)
            return Vector((x, y, z))
        if stage == "shoulder":
            z = shoulder_z - 0.025
            # Front curtain edges frame near shoulders; back cascades cleanly down behind upper back
            half_w = probe.chest_bounds.xmax * 0.90
            x = s * half_w
            y = back_clear_y + (0.000 if is_inner else 0.025) - 0.060 * (1.0 - backness)
            if c > -0.15:
                x = s * (face_open_x + (0.015 if is_inner else 0.036))
                y = probe.head_center.y - c * (hb.ymax * 0.45)
                z = shoulder_z - 0.005
            return Vector((x, y, z))
        # stage == "tip": tapered U-shaped waterfall behind back, tucked softly at front edges
        v_taper = 0.075 * (1.0 - backness)
        z = drape_end_z + v_taper
        x = s * (probe.chest_bounds.xmax * 0.80)
        y = back_clear_y + 0.010 + (0.000 if is_inner else 0.018) - 0.045 * (1.0 - backness)
        if c > -0.15:
            x = s * (face_open_x + (0.018 if is_inner else 0.034))
            y = probe.head_center.y + 0.015 - c * 0.020
            z = shoulder_z - 0.025
        return Vector((x, y, z))

    stages = ("crown", "temple", "ear", "chin", "shoulder", "tip")
    outer_grid = [[bm.verts.new(_long_pt(th, st, False)) for th in thetas] for st in stages]
    inner_grid = [[bm.verts.new(_long_pt(th, st, True)) for th in thetas] for st in stages]

    crown_out_z = sum(v.co.z for v in outer_grid[0]) / len(outer_grid[0]) + 0.004
    crown_in_z = sum(v.co.z for v in inner_grid[0]) / len(inner_grid[0]) + 0.0025
    crown_out = bm.verts.new(Vector((0.0, probe.head_center.y + 0.004, crown_out_z)))
    crown_in = bm.verts.new(Vector((0.0, probe.head_center.y + 0.004, crown_in_z)))

    for r0, r1 in zip(outer_grid, outer_grid[1:]):
        for k in range(cols - 1):
            bm.faces.new((r1[k], r1[k + 1], r0[k + 1], r0[k]))
    for r0, r1 in zip(inner_grid, inner_grid[1:]):
        for k in range(cols - 1):
            bm.faces.new((r0[k], r0[k + 1], r1[k + 1], r1[k]))
    for k in range(cols - 1):
        bm.faces.new((inner_grid[-1][k], inner_grid[-1][k + 1], outer_grid[-1][k + 1], outer_grid[-1][k]))
        bm.faces.new((outer_grid[0][k], outer_grid[0][k + 1], crown_out))
        bm.faces.new((crown_in, inner_grid[0][k + 1], inner_grid[0][k]))
    for r_i in range(1, len(stages) - 1):
        bm.faces.new((inner_grid[r_i][0], inner_grid[r_i + 1][0], outer_grid[r_i + 1][0], outer_grid[r_i][0]))
        bm.faces.new((outer_grid[r_i][-1], outer_grid[r_i + 1][-1], inner_grid[r_i + 1][-1], inner_grid[r_i][-1]))

    # Forehead parting bangs above brow_top + 6 mm
    bang_cols = 5
    bang_thetas = [-ang_open + 2.0 * ang_open * k / (bang_cols - 1) for k in range(bang_cols)]
    b_top_o, b_bot_o, b_top_i, b_bot_i = [], [], [], []
    for k, th in enumerate(bang_thetas):
        if k == 0:
            b_top_o.append(outer_grid[0][-1]); b_bot_o.append(outer_grid[1][-1])
            b_top_i.append(inner_grid[0][-1]); b_bot_i.append(inner_grid[1][-1])
        elif k == bang_cols - 1:
            b_top_o.append(outer_grid[0][0]); b_bot_o.append(outer_grid[1][0])
            b_top_i.append(inner_grid[0][0]); b_bot_i.append(inner_grid[1][0])
        else:
            pt, nt = _cranium_ray_surface(probe, _dir_from_theta_phi(th, math.radians(52)))
            part_raise = 0.008 * (1.0 - abs(k - 2) * 0.45)
            z_b = brow_top + 0.0065 + part_raise
            b_top_o.append(bm.verts.new(pt + nt * 0.025))
            b_bot_o.append(bm.verts.new(_cranium_ring_point(probe, th, z_b, 0.024)))
            b_top_i.append(bm.verts.new(pt + nt * 0.0055))
            b_bot_i.append(bm.verts.new(_cranium_ring_point(probe, th, z_b + 0.002, 0.0055)))

    for k in range(bang_cols - 1):
        bm.faces.new((b_top_o[k], b_top_o[k + 1], crown_out))
        bm.faces.new((b_bot_o[k], b_bot_o[k + 1], b_top_o[k + 1], b_top_o[k]))
        bm.faces.new((b_bot_i[k], b_bot_i[k + 1], b_bot_o[k + 1], b_bot_o[k]))
        bm.faces.new((b_top_i[k], b_top_i[k + 1], b_bot_i[k + 1], b_bot_i[k]))
        bm.faces.new((crown_in, b_top_i[k + 1], b_top_i[k]))

    _weld_doubles(bm, 1e-4)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    enforce_scalp_clearance(bm, probe, min_clear_m=0.0045)
    z_hi_band = hb.cz + 0.45 * (hb.zmax - hb.cz)
    _paint_hair_faces(bm, probe, lambda f, c: c.z > z_hi_band and f.normal.z > 0.30)
    return bm


# ---------------------------------------------------------------------------
# 4. hair_bun_01
# ---------------------------------------------------------------------------


def build_hair_bun_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Sleek pulled-back cap with clean temple framing + bold chunky top-back bun."""
    hb = probe.cranium_bounds
    brow_top = max(probe.brow_l.zmax, probe.brow_r.zmax)
    ear_top = max(probe.ear_l.zmax, probe.ear_r.zmax)
    ear_bot = min(probe.ear_l.zmin, probe.ear_r.zmin)

    n = 14
    rings_out: list[list[Vector]] = [[] for _ in range(4)]
    rings_in: list[list[Vector]] = [[] for _ in range(4)]

    for i in range(n):
        th = 2.0 * math.pi * i / n
        c = math.cos(th)
        side = abs(math.sin(th))

        p0, n0 = _cranium_ray_surface(probe, _dir_from_theta_phi(th, math.radians(52)))
        rings_out[0].append(p0 + n0 * 0.0115)
        rings_in[0].append(p0 + n0 * 0.005)

        p1, n1 = _cranium_ray_surface(probe, _dir_from_theta_phi(th, math.radians(28)))
        rings_out[1].append(p1 + n1 * 0.0115)
        rings_in[1].append(p1 + n1 * 0.005)

        z2 = brow_top + 0.022 if c >= 0 else hb.cz - 0.008 * (-c)
        rings_out[2].append(_cranium_ring_point(probe, th, z2, 0.0095))
        rings_in[2].append(_cranium_ring_point(probe, th, z2, 0.005))

        if c > 0.35:
            z3 = brow_top + 0.0075
            off3 = 0.008
        elif side > 0.55 and c > -0.45:
            # Sweep neatly above ears so ears stay fully visible
            z3 = ear_top + 0.005
            off3 = 0.0095
        else:
            z3 = ear_bot - 0.004
            off3 = 0.010
        z3 = max(z3, hb.zmin + 0.016)
        rings_out[3].append(_cranium_ring_point(probe, th, z3, off3))
        rings_in[3].append(_cranium_ring_point(probe, th, z3 + 0.002, 0.0048))

    p_top, n_top = _cranium_ray_surface(probe, Vector((0.0, 0.0, 1.0)))
    crown_out = p_top + n_top * 0.0115
    crown_in = p_top + n_top * 0.005

    bm, _ = _make_closed_cap_shell(probe, rings_out, rings_in, crown_out, crown_in)

    # Bold high-back bun oriented along upper-back diagonal (+Y, +Z) so it silhouettes strongly
    bun_dir = Vector((0.0, 0.72, 0.69)).normalized()
    p_bun_root, _n_bun = _cranium_ray_surface(probe, bun_dir)
    bun_center = p_bun_root + bun_dir * 0.036
    bun_r_scale = max(0.068, 0.25 * hb.width)  # Bold chunky bun reading clearly from overview distance

    # Local frame with +Z along `bun_dir`
    z_ax = bun_dir
    x_ax = Vector((1.0, 0.0, 0.0))
    y_ax = z_ax.cross(x_ax).normalized()
    rot_m = Matrix((x_ax, y_ax, z_ax)).transposed()

    # Build a faceted chunky torus/squash-sphere bun (10 sides, 4 profile rings + tie ring)
    bun_sides = 10
    profile = [
        (-0.55 * bun_r_scale, 0.62 * bun_r_scale),
        (-0.32 * bun_r_scale, 0.68 * bun_r_scale),
        (-0.08 * bun_r_scale, 1.02 * bun_r_scale),
        ( 0.24 * bun_r_scale, 1.04 * bun_r_scale),
        ( 0.48 * bun_r_scale, 0.74 * bun_r_scale),
        ( 0.58 * bun_r_scale, 0.28 * bun_r_scale),
    ]
    bun_v_rings: list[list[bmesh.types.BMVert]] = []
    for dz_loc, rad in profile:
        ring = []
        for s_i in range(bun_sides):
            ang = 2.0 * math.pi * s_i / bun_sides
            p_loc = Vector((rad * math.cos(ang), rad * math.sin(ang), dz_loc))
            ring.append(bm.verts.new(bun_center + rot_m @ p_loc))
        bun_v_rings.append(ring)

    cap_bot = bm.verts.new(bun_center + rot_m @ Vector((0.0, 0.0, -0.60 * bun_r_scale)))
    cap_top = bm.verts.new(bun_center + rot_m @ Vector((0.0, 0.0, 0.64 * bun_r_scale)))

    for s_i in range(bun_sides):
        s2 = (s_i + 1) % bun_sides
        bm.faces.new((bun_v_rings[0][s2], bun_v_rings[0][s_i], cap_bot))
        bm.faces.new((bun_v_rings[-1][s_i], bun_v_rings[-1][s2], cap_top))
    for r0, r1 in zip(bun_v_rings, bun_v_rings[1:]):
        for s_i in range(bun_sides):
            s2 = (s_i + 1) % bun_sides
            bm.faces.new((r0[s_i], r0[s2], r1[s2], r1[s_i]))

    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    enforce_scalp_clearance(bm, probe, min_clear_m=0.0045)
    z_hi_band = hb.cz + 0.48 * (hb.zmax - hb.cz)
    _paint_hair_faces(
        bm, probe,
        lambda f, c: (c.z > z_hi_band and f.normal.z > 0.35) or ((c - bun_center).dot(bun_dir) > 0.22 * bun_r_scale),
    )
    return bm


# ---------------------------------------------------------------------------
# 5. glasses_round_01
# ---------------------------------------------------------------------------


def build_glasses_round_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Round open-rim spectacles + arched nose bridge + temple arms resting over ears."""
    bm = bmesh.new()
    charexport.ensure_color_layer(bm)

    eye_l = probe.eye_l
    eye_r = probe.eye_r
    brow_zmin = min(probe.brow_l.zmin, probe.brow_r.zmin)
    face_front_y = min(eye_l.ymin, eye_r.ymin, probe.brow_l.ymin, probe.brow_r.ymin)

    # Front plane clears face quads cleanly AND clears nose bridge top
    y_frame = min(face_front_y - 0.009, probe.nose.ymin - 0.001)
    y_depth = 0.0055

    rim_radius = max(eye_l.width * 0.58, eye_l.height * 0.56, 0.022)
    rim_thick = 0.0062
    # Keep upper rim cleanly under eyebrows while framing eye center
    cz = min(eye_l.cz, brow_zmin - rim_radius - rim_thick * 0.45 + 0.003)
    cx_abs = 0.5 * (abs(eye_l.cx) + abs(eye_r.cx))
    # Keep inner rims clearing nose bridge edges comfortably
    cx_abs = max(cx_abs, max(abs(probe.nose.xmin), abs(probe.nose.xmax)) + rim_radius + 0.002)

    rim_sides = 10
    ring_faces: list[bmesh.types.BMFace] = []
    for sx in (-1.0, 1.0):
        cx = sx * cx_abs
        # Build a clean closed square-section torus (10 segments x 4 corners)
        loops_ring: list[list[bmesh.types.BMVert]] = []
        for s_i in range(rim_sides):
            ang = 2.0 * math.pi * s_i / rim_sides
            ca, sa = math.cos(ang), math.sin(ang)
            r_in = rim_radius - 0.5 * rim_thick
            r_out = rim_radius + 0.5 * rim_thick
            # 4 corners: front-outer, back-outer, back-inner, front-inner
            sec = [
                bm.verts.new(Vector((cx + r_out * ca, y_frame - 0.5 * y_depth, cz + r_out * sa))),
                bm.verts.new(Vector((cx + r_out * ca, y_frame + 0.5 * y_depth, cz + r_out * sa))),
                bm.verts.new(Vector((cx + r_in * ca, y_frame + 0.5 * y_depth, cz + r_in * sa))),
                bm.verts.new(Vector((cx + r_in * ca, y_frame - 0.5 * y_depth, cz + r_in * sa))),
            ]
            loops_ring.append(sec)

        for s_i in range(rim_sides):
            s2 = (s_i + 1) % rim_sides
            a, b = loops_ring[s_i], loops_ring[s2]
            for j in range(4):
                j2 = (j + 1) % 4
                ring_faces.append(bm.faces.new((a[j], b[j], b[j2], a[j2])))

    # Nose bridge connecting inner rims above nose top
    inner_x = cx_abs - rim_radius
    bridge_z = cz + 0.25 * rim_radius
    bridge_y = min(y_frame, probe.nose.ymin - 0.003)
    hw_b = 0.0030
    bridge_xs = (-inner_x - 0.002, -0.35 * inner_x, 0.35 * inner_x, inner_x + 0.002)
    bridge_zs = (bridge_z, bridge_z + 0.004, bridge_z + 0.004, bridge_z)
    bridge_ys = (y_frame, bridge_y, bridge_y, y_frame)
    b_rings = []
    for bx, by, bz in zip(bridge_xs, bridge_ys, bridge_zs):
        b_rings.append([
            Vector((bx, by - hw_b, bz - hw_b)),
            Vector((bx, by + hw_b, bz - hw_b)),
            Vector((bx, by + hw_b, bz + hw_b)),
            Vector((bx, by - hw_b, bz + hw_b)),
        ])
    _add_prism_lock(bm, b_rings)

    # Temple arms from outer rims back over ear tops
    head_side_x = max(probe.cranium_bounds.xmax, abs(probe.cranium_bounds.xmin))
    for sx in (-1.0, 1.0):
        ear = probe.ear_l if sx > 0 else probe.ear_r
        outer_x = sx * (cx_abs + rim_radius + 0.35 * rim_thick)
        temple_x = sx * (head_side_x + 0.0075)
        ear_rest_x = sx * max(head_side_x + 0.0065, abs(ear.xmax if sx > 0 else ear.xmin) * 0.96)
        ear_top_z = ear.zmax + 0.001
        arm_z = max(cz + 0.15 * rim_radius, ear_top_z)
        tip_z = ear.cz - 0.008
        arm_stations = [
            Vector((outer_x, y_frame, cz + 0.15 * rim_radius)),
            Vector((temple_x, y_frame + 0.012, arm_z)),
            Vector((ear_rest_x, ear.ymin + 0.004, ear_top_z)),
            Vector((ear_rest_x, ear.ymax + 0.004, ear_top_z - 0.003)),
            Vector((ear_rest_x, ear.ymax + 0.011, tip_z)),
        ]
        hw_t = 0.0026
        arm_rings = []
        for idx, pt in enumerate(arm_stations):
            t = 0.7 if idx == len(arm_stations) - 1 else 1.0
            arm_rings.append([
                pt + Vector((-sx * hw_t * t, 0.0, -hw_t * t)),
                pt + Vector(( sx * hw_t * t, 0.0, -hw_t * t)),
                pt + Vector(( sx * hw_t * t, 0.0,  hw_t * t)),
                pt + Vector((-sx * hw_t * t, 0.0,  hw_t * t)),
            ])
        _add_prism_lock(bm, arm_rings)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # Tintable frame per CHARACTER-PIPELINE §3 + glasses.json: UV on `white`, R=1 primary tint
    charexport.paint_palette(bm, bm.faces[:], "white")
    shade_map = {f: (1.0 if f.normal.z > 0.25 or f.normal.y < -0.5 else 0.86) for f in bm.faces}
    charexport.set_garment_colors(bm, {f: "primary" for f in bm.faces}, shade=shade_map)
    return bm


# ---------------------------------------------------------------------------
# 6. neck_necklace_01
# ---------------------------------------------------------------------------


def build_neck_necklace_01(probe: BodyProbe) -> bmesh.types.BMesh:
    """Chunky gold chain resting naturally on neck/collarbone curve + diamond medallion pendant."""
    bm = bmesh.new()
    charexport.ensure_color_layer(bm)

    nb = probe.neck_bounds
    cb = probe.chest_bounds
    bvhs = [probe.torso_bvh, probe.male_torso_bvh]

    # Collar loop dips gently down over the front collarbones & rests higher around back of neck
    n_seg = 16
    z_back = nb.zmin + 0.35 * nb.height
    z_front = max(cb.zmax - 0.032, nb.zmin - 0.030)

    centers: list[Vector] = []
    tangents: list[Vector] = []
    for k in range(n_seg):
        th = 2.0 * math.pi * k / n_seg
        c = math.cos(th)  # +1 = front (-Y), -1 = back (+Y)
        s = math.sin(th)
        front_w = 0.5 + 0.5 * c
        z = z_back * (1.0 - front_w ** 1.4) + z_front * (front_w ** 1.4)
        surf_pt, surf_n = _torso_surface_point(bvhs, z, th, fallback_r=0.055)
        # Check slightly above/below as well so flat sloped chest quads near shoulders never clip chain
        surf_lo, _ = _torso_surface_point(bvhs, z - 0.006, th, fallback_r=0.055)
        r_cur = max(math.hypot(surf_pt.x, surf_pt.y), math.hypot(surf_lo.x, surf_lo.y))
        base_pt = surf_pt if math.hypot(surf_pt.x, surf_pt.y) >= math.hypot(surf_lo.x, surf_lo.y) else Vector((surf_lo.x, surf_lo.y, z))
        # Keep chain cleanly outside skin on both female and male collarbones/sternum
        clear = 0.009 + 0.005 * max(0.0, c)
        rad_dir = Vector((s, -c, 0.0))
        pt = Vector((base_pt.x, base_pt.y, z)) + (surf_n * 0.45 + rad_dir * 0.55).normalized() * clear
        if r_cur < 0.01:
            pt = Vector((0.0, 0.0, z)) + rad_dir * (0.055 + clear)
        centers.append(pt)

    for k in range(n_seg):
        p_prev = centers[(k - 1) % n_seg]
        p_next = centers[(k + 1) % n_seg]
        tangents.append((p_next - p_prev).normalized())

    chain_r = 0.0052
    chain_rings: list[list[bmesh.types.BMVert]] = []
    for center, tan in zip(centers, tangents):
        out_vec = Vector((center.x, center.y - nb.cy, 0.0)).normalized()
        binorm = tan.cross(out_vec).normalized()
        norm_v = binorm.cross(tan).normalized()
        sec = [
            bm.verts.new(center + norm_v * chain_r),
            bm.verts.new(center + binorm * chain_r),
            bm.verts.new(center - norm_v * chain_r),
            bm.verts.new(center - binorm * chain_r),
        ]
        chain_rings.append(sec)

    chain_faces: list[bmesh.types.BMFace] = []
    for k in range(n_seg):
        k2 = (k + 1) % n_seg
        r0, r1 = chain_rings[k], chain_rings[k2]
        for j in range(4):
            j2 = (j + 1) % 4
            chain_faces.append(bm.faces.new((r0[j], r0[j2], r1[j2], r1[j])))
    bmesh.ops.recalc_face_normals(bm, faces=chain_faces)

    # Medallion pendant resting cleanly along front sternum/bust slope above bandeau top
    p_front_top = centers[0]
    pw, ph, pd = 0.017, 0.020, 0.007
    pendant_z = p_front_top.z - 0.023
    y_hi = _torso_surface_point(bvhs, pendant_z + ph, 0.0, fallback_r=0.065)[0].y
    y_mid = _torso_surface_point(bvhs, pendant_z, 0.0, fallback_r=0.065)[0].y
    y_lo = _torso_surface_point(bvhs, pendant_z - ph, 0.0, fallback_r=0.065)[0].y
    # Fit conservative front clearance plane across [pendant_z - ph, pendant_z + ph]
    slope_dy_dz = (y_hi - y_lo) / (2.0 * ph)
    y_back_plane = min(y_mid, 0.5 * (y_hi + y_lo)) - 0.0075
    pend_center = Vector((0.0, y_back_plane - pd * 0.5, pendant_z))

    def _pend_pt(ox: float, oy_local: float, oz: float) -> Vector:
        # Follow torso Y slope (`slope_dy_dz < 0` on female bust) so top stays tucked & bottom clears bust
        y_slope = y_back_plane + slope_dy_dz * oz
        return Vector((ox, y_slope + oy_local - pd * 0.5, pendant_z + oz))

    # Bail loop linking chain front -> medallion top
    top_bail_y = _pend_pt(0.0, 0.0, ph * 0.72).y
    bail_rings = [
        [
            Vector((-0.0038, p_front_top.y - 0.004, p_front_top.z + 0.002)),
            Vector(( 0.0038, p_front_top.y - 0.004, p_front_top.z + 0.002)),
            Vector(( 0.0038, p_front_top.y + 0.003, p_front_top.z + 0.002)),
            Vector((-0.0038, p_front_top.y + 0.003, p_front_top.z + 0.002)),
        ],
        [
            Vector((-0.0038, top_bail_y - 0.004, pendant_z + ph * 0.72)),
            Vector(( 0.0038, top_bail_y - 0.004, pendant_z + ph * 0.72)),
            Vector(( 0.0038, top_bail_y + 0.003, pendant_z + ph * 0.72)),
            Vector((-0.0038, top_bail_y + 0.003, pendant_z + ph * 0.72)),
        ],
    ]
    bail_faces = _add_prism_lock(bm, bail_rings)
    bmesh.ops.recalc_face_normals(bm, faces=bail_faces)

    # Bold faceted octagonal medallion with rich dark-gold bezel around a luminous raised crest
    oct_pts = [
        Vector((0.0, 0.0, ph)),
        Vector((0.72 * pw, 0.0, 0.45 * ph)),
        Vector((pw, 0.0, 0.0)),
        Vector((0.72 * pw, 0.0, -0.55 * ph)),
        Vector((0.0, 0.0, -ph)),
        Vector((-0.72 * pw, 0.0, -0.55 * ph)),
        Vector((-pw, 0.0, 0.0)),
        Vector((-0.72 * pw, 0.0, 0.45 * ph)),
    ]
    inner_pts = [Vector((p.x * 0.56, 0.0, p.z * 0.56)) for p in oct_pts]
    p_back_ring = [bm.verts.new(_pend_pt(p.x * 1.04, pd * 0.5, p.z * 1.04)) for p in oct_pts]
    p_front_ring = [bm.verts.new(_pend_pt(p.x, -pd * 0.45, p.z)) for p in oct_pts]
    p_crest_ring = [bm.verts.new(_pend_pt(p.x, -pd * 0.72, p.z)) for p in inner_pts]
    v_gem = bm.verts.new(_pend_pt(0.0, -pd * 1.15, 0.0))
    v_back = bm.verts.new(_pend_pt(0.0, pd * 0.65, 0.0))

    pend_faces: list[bmesh.types.BMFace] = []
    crest_faces: list[bmesh.types.BMFace] = []
    for k in range(len(oct_pts)):
        k2 = (k + 1) % len(oct_pts)
        # Back cap & thick side bezel
        pend_faces.append(bm.faces.new((v_back, p_back_ring[k2], p_back_ring[k])))
        pend_faces.append(bm.faces.new((p_back_ring[k], p_back_ring[k2], p_front_ring[k2], p_front_ring[k])))
        # Outer front bevel (stays rich `gold` for bold contrast against fair skin)
        pend_faces.append(bm.faces.new((p_front_ring[k], p_front_ring[k2], p_crest_ring[k2], p_crest_ring[k])))
        # Raised inner jewel pyramid
        fc = bm.faces.new((p_crest_ring[k], p_crest_ring[k2], v_gem))
        pend_faces.append(fc)
        crest_faces.append(fc)

    bmesh.ops.recalc_face_normals(bm, faces=pend_faces)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])

    # Keep `gold` across chain + bezel + back for crisp contrast against `skin_01`,
    # with only the raised top-half inner jewel catching a `gold_l` glint.
    crest_set = set(crest_faces)
    hi_faces = []
    base_faces = []
    for f in bm.faces:
        c = f.calc_center_median()
        if (f in crest_set or (c.z < pendant_z + ph * 0.65 and c.y < pend_center.y - pd * 0.68 and f.normal.y < -0.45)) and f.normal.z > 0.05:
            hi_faces.append(f)
        else:
            base_faces.append(f)
    charexport.paint_palette(bm, base_faces, "gold")
    charexport.paint_palette(bm, hi_faces, "gold_l")
    shade_map = {}
    for f in bm.faces:
        c = f.calc_center_median()
        if f in hi_faces:
            shade_map[f] = 0.96
        elif c.z < pendant_z + ph * 1.1 and f.normal.y < -0.35:
            # Front bezel rim shaded rich gold so medallion stands out sharply against pale chest highlight
            shade_map[f] = 0.78
        elif f.normal.z > 0.25 or f.normal.y < -0.5:
            shade_map[f] = 0.90
        else:
            shade_map[f] = 0.74
    charexport.set_garment_colors(bm, {f: "primary" for f in bm.faces}, shade=shade_map)
    return bm


BUILDERS = {
    "hair_short_01": build_hair_short_01,
    "hair_bob_01": build_hair_bob_01,
    "hair_long_01": build_hair_long_01,
    "hair_bun_01": build_hair_bun_01,
    "glasses_round_01": build_glasses_round_01,
    "neck_necklace_01": build_neck_necklace_01,
}


def write_rigid_meta(out_dir: str, item_id: str, slot: str, bone: str) -> str:
    """Write `<out_dir>/wardrobe/<id>.meta.json` matching CHARACTER-PIPELINE §5."""
    meta = {
        "id": item_id,
        "slot": slot,
        "kind": "rigid",
        "bone": bone,
        "merge": True,
        "bases": {
            "female": {
                "file": f"models/wardrobe/{item_id}.glb",
                "offset": [0, 0, 0],
                "scale": 1,
            },
            "male": {
                "file": f"models/wardrobe/{item_id}.glb",
                "offset": [0, 0, 0],
                "scale": 1,
            },
        },
    }
    meta_path = os.path.join(out_dir, "wardrobe", f"{item_id}.meta.json")
    os.makedirs(os.path.dirname(meta_path), exist_ok=True)
    with open(meta_path, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
        fh.write("\n")
    return meta_path


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = os.path.join(palette.ROOT, "art", ".cache", "raw")
    only: set[str] | None = None
    i = 0
    while i < len(argv):
        if argv[i] == "--out":
            out = os.path.abspath(argv[i + 1])
            i += 2
        elif argv[i] == "--only":
            only = {s.strip() for s in argv[i + 1].split(",") if s.strip()}
            i += 2
        else:
            i += 1

    probe = build_body_probe()

    for item_id, slot, bone in ITEMS:
        if only is not None and item_id not in only:
            continue

        export.clear_scene()
        bm = BUILDERS[item_id](probe)

        tris = sum(len(f.verts) - 2 for f in bm.faces)
        face_clear = check_face_quads_clear(bm, probe) if slot == "hair" else True
        min_scalp_mm = measure_min_scalp_distance(bm, probe) * 1000.0 if slot == "hair" else 0.0

        me = charexport.bmesh_to_mesh(bm, item_id, [palette.material("palette")])
        ob = bpy.data.objects.new(item_id, me)
        bpy.context.scene.collection.objects.link(ob)

        glb_path = os.path.join(out, "wardrobe", f"{item_id}.glb")
        charexport.export_character_glb(ob, [ob], glb_path, skinned=False, has_morphs=False)
        write_rigid_meta(out, item_id, slot, bone)

        extra = f" minScalpMm={min_scalp_mm:.2f} faceClear={face_clear}" if slot == "hair" else ""
        print(f"BUILT {item_id} tris={tris} bone={bone}{extra}")


if __name__ == "__main__":
    main()
