"""Model builder: low-poly primitives painted with palette swatches.

Authoring space is the glTF one (assets.md §1.1): metres, +Y up, an object's
front faces -Z. Everything is converted to Blender space (+Z up) internally,
so generators never think in Blender axes.

    m.box(w, h, d, at=(x, y, z), sw="wood_oak_2")       # `at` = bottom centre
    with m.part("screen", mat="emissive"): ...          # addressable sub-mesh
    with m.part("blades", pivot=(0, 2.9, 0), exact=True): ...  # animated node
    m.anchor("seat", (0, 0.46, -0.55))                  # empty -> manifest
"""
import math
from contextlib import contextmanager

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

from . import palette

C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # author (x,y,z) -> blender (x,-z,y)
CI = C.transposed()


def B(p):
    return Vector((p[0], -p[2], p[1]))


def _rot(rot):
    if not rot:
        return Matrix.Identity(4)
    e = Euler([math.radians(a) for a in rot], "XYZ").to_matrix()
    return (C @ e @ CI).to_4x4()


class _Part:
    def __init__(self, suffix, mat, pivot, exact):
        self.suffix, self.mat, self.pivot, self.exact = suffix, mat, pivot, exact
        self.bm = bmesh.new()
        self.bm.loops.layers.uv.new("UVMap")

    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)


class Model:
    def __init__(self, name):
        self.name = name
        self.parts = [_Part("mesh", "palette", None, False)]
        self.cur = self.parts[0]
        self.anchors = []

    # ---- structure -------------------------------------------------------
    @contextmanager
    def part(self, suffix, mat="palette", pivot=None, exact=False):
        """Sub-mesh node `<name>_<suffix>` (or exactly `suffix` when exact).
        With a pivot the node is an empty at the pivot holding the mesh, so the
        runtime can rotate/slide it."""
        prev = self.cur
        found = next((p for p in self.parts if p.suffix == suffix), None)
        if found is None:
            found = _Part(suffix, mat, pivot, exact)
            self.parts.append(found)
        self.cur = found
        try:
            yield found
        finally:
            self.cur = prev

    def glass(self):
        return self.part("glass", mat="glass")

    def anchor(self, kind, pos, rot_y=0.0):
        self.anchors.append((kind, tuple(pos), rot_y))

    def tris(self):
        return sum(p.tris() for p in self.parts)

    # ---- emit ------------------------------------------------------------
    def _emit(self, tb, sw, at=(0, 0, 0), rot=None, recalc=False):
        if recalc:
            bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
        uvl = tb.loops.layers.uv.verify()
        u, v = palette.uv(sw)
        for f in tb.faces:
            f.smooth = False
            for loop in f.loops:
                loop[uvl].uv = (u, v)
        piv = B(self.cur.pivot) if self.cur.pivot else Vector((0, 0, 0))
        mat = Matrix.Translation(B(at) - piv) @ _rot(rot)
        bmesh.ops.transform(tb, matrix=mat, verts=tb.verts[:])
        me = bpy.data.meshes.new("_tmp")
        tb.to_mesh(me)
        tb.free()
        self.cur.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    # ---- primitives ------------------------------------------------------
    def box(self, w, h, d, at=(0, 0, 0), sw="n_04", bevel=0.0, edges="all",
            taper=None, shear=None, rot=None, center=False):
        """Box w(x) h(y) d(z); `at` is the bottom centre (or centre).
        taper=(sx, sz) scales the top face, shear=(dx, dz) slides it."""
        tb = bmesh.new()
        bmesh.ops.create_cube(tb, size=1.0)
        bmesh.ops.scale(tb, vec=(w, d, h), verts=tb.verts[:])
        top = [v for v in tb.verts if v.co.z > 0]
        if taper:
            for v in top:
                v.co.x *= taper[0]
                v.co.y *= taper[1]
        if shear:
            for v in top:
                v.co.x += shear[0]
                v.co.y -= shear[1]
        if bevel > 0:
            _bevel(tb, bevel, edges)
        if not center:
            bmesh.ops.translate(tb, vec=(0, 0, h / 2), verts=tb.verts[:])
        self._emit(tb, sw, at, rot)

    def cyl(self, r, h, at=(0, 0, 0), sw="n_04", seg=8, r2=None, axis="y",
            scale=None, rot=None, center=False, bevel=0.0):
        """Cylinder / frustum (r bottom, r2 top) along `axis`; `at` = base centre."""
        tb = bmesh.new()
        top_r = r if r2 is None else r2
        bmesh.ops.create_cone(tb, cap_ends=True, cap_tris=False, segments=seg,
                              radius1=r, radius2=max(top_r, 1e-5), depth=h)
        bmesh.ops.rotate(tb, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / seg, 3, "Z"),
                         verts=tb.verts[:])
        if top_r <= 1e-5:
            bmesh.ops.remove_doubles(tb, verts=tb.verts[:], dist=1e-4)
        if scale:
            bmesh.ops.scale(tb, vec=(scale[0], scale[1], 1), verts=tb.verts[:])
        if bevel > 0:
            _bevel(tb, bevel, "top+bottom")
        if not center:
            bmesh.ops.translate(tb, vec=(0, 0, h / 2), verts=tb.verts[:])
        if axis == "x":
            bmesh.ops.rotate(tb, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"),
                             verts=tb.verts[:])
        elif axis == "z":
            bmesh.ops.rotate(tb, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"),
                             verts=tb.verts[:])
        self._emit(tb, sw, at, rot)

    def rod(self, p1, p2, r, sw="steel_3", seg=6, r2=None):
        """Cylinder between two points."""
        a, b = B(p1), B(p2)
        d = b - a
        tb = bmesh.new()
        bmesh.ops.create_cone(tb, cap_ends=True, cap_tris=False, segments=seg,
                              radius1=r, radius2=r if r2 is None else r2, depth=d.length)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        bmesh.ops.transform(tb, matrix=Matrix.Translation((a + b) / 2) @ q, verts=tb.verts[:])
        self._emit(tb, sw)

    def sphere(self, r, at=(0, 0, 0), sw="n_04", sub=1, scale=None, rot=None):
        """Icosphere centred on `at` (sub=1: 20 tris, sub=2: 80 tris)."""
        tb = bmesh.new()
        bmesh.ops.create_icosphere(tb, subdivisions=sub, radius=r)
        if scale:
            bmesh.ops.scale(tb, vec=(scale[0], scale[2], scale[1]), verts=tb.verts[:])
        self._emit(tb, sw, at, rot)

    def lathe(self, profile, at=(0, 0, 0), sw="n_04", seg=8, scale=None, rot=None):
        """Revolve [(radius, y), ...] (bottom to top) around the Y axis."""
        tb = bmesh.new()
        rings = []
        for r, y in profile:
            if r < 1e-6:
                rings.append([tb.verts.new((0, 0, y))])
            else:
                rings.append([tb.verts.new((r * math.cos(2 * math.pi * (i + 0.5) / seg),
                                            r * math.sin(2 * math.pi * (i + 0.5) / seg), y))
                              for i in range(seg)])
        for a, b in zip(rings, rings[1:]):
            for i in range(seg):
                j = (i + 1) % seg
                if len(a) == 1 and len(b) == 1:
                    continue
                if len(a) == 1:
                    tb.faces.new((a[0], b[j], b[i]))
                elif len(b) == 1:
                    tb.faces.new((a[i], a[j], b[0]))
                else:
                    tb.faces.new((a[i], a[j], b[j], b[i]))
        if len(rings[0]) > 1:
            tb.faces.new(list(reversed(rings[0])))
        if len(rings[-1]) > 1:
            tb.faces.new(rings[-1])
        if scale:
            bmesh.ops.scale(tb, vec=(scale[0], scale[1], 1), verts=tb.verts[:])
        self._emit(tb, sw, at, rot, recalc=True)

    def prism(self, pts, depth, at=(0, 0, 0), sw="n_04", plane="xy", rot=None):
        """Extrude a 2D polygon. plane 'xy': points (x,y), depth along Z (centred);
        'zy': points (z,y), depth along X (centred); 'xz': points (x,z), depth up from 0."""
        tb = bmesh.new()

        def conv(p, t):
            if plane == "xy":
                return B((p[0], p[1], t))
            if plane == "zy":
                return B((t, p[1], p[0]))
            return B((p[0], t, p[1]))

        lo, hi = (0.0, depth) if plane == "xz" else (-depth / 2, depth / 2)
        a = [tb.verts.new(conv(p, lo)) for p in pts]
        b = [tb.verts.new(conv(p, hi)) for p in pts]
        n = len(pts)
        tb.faces.new(a)
        tb.faces.new(list(reversed(b)))
        for i in range(n):
            j = (i + 1) % n
            tb.faces.new((a[i], b[i], b[j], a[j]))
        self._emit(tb, sw, at, rot, recalc=True)

    def quad(self, pts, sw="paper_white", double=False):
        """One planar polygon from author-space points (counter-clockwise = front)."""
        tb = bmesh.new()
        vs = [tb.verts.new(B(p)) for p in pts]
        tb.faces.new(vs)
        if double:
            vs2 = [tb.verts.new(B(p)) for p in pts]
            tb.faces.new(list(reversed(vs2)))
        self._emit(tb, sw)

    def leaf(self, base, tip, width, sw="plant_2", fold=0.25):
        """Double-sided folded leaf (4 tris) from base to tip."""
        a, t = Vector(base), Vector(tip)
        d = t - a
        side = d.cross(Vector((0, 1, 0)))
        if side.length < 1e-5:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(d).normalized()
        mid = a + d * 0.45
        left = mid + side * width / 2 + up * width * fold
        right = mid - side * width / 2 + up * width * fold
        tb = bmesh.new()
        for tri in ((a, t, left), (a, right, t)):
            vs = [tb.verts.new(B(p)) for p in tri]
            tb.faces.new(vs)
            vs = [tb.verts.new(B(p)) for p in tri]
            tb.faces.new(list(reversed(vs)))
        self._emit(tb, sw)

    # ---- output ----------------------------------------------------------
    def build(self):
        """Create Blender objects: root empty -> part meshes / pivots / anchors."""
        root = bpy.data.objects.new(self.name, None)
        bpy.context.scene.collection.objects.link(root)
        objs = [root]
        for p in self.parts:
            if not p.bm.faces:
                p.bm.free()
                continue
            node = p.suffix if p.exact else f"{self.name}_{p.suffix}"
            me = bpy.data.meshes.new(node + ("_mesh" if p.pivot else ""))
            p.bm.to_mesh(me)
            p.bm.free()
            me.materials.append(palette.material(p.mat))
            ob = bpy.data.objects.new(me.name, me)
            bpy.context.scene.collection.objects.link(ob)
            if p.pivot:
                piv = bpy.data.objects.new(node, None)
                bpy.context.scene.collection.objects.link(piv)
                piv.location = B(p.pivot)
                piv.parent = root
                ob.parent = piv
                objs.append(piv)
            else:
                ob.parent = root
            objs.append(ob)
        counts = {}
        for kind, _pos, _r in self.anchors:
            counts[kind] = counts.get(kind, 0) + 1
        seen = {}
        for kind, pos, rot_y in self.anchors:
            seen[kind] = seen.get(kind, 0) + 1
            nm = f"{self.name}_{kind}" + (f"_{seen[kind]}" if counts[kind] > 1 else "")
            e = bpy.data.objects.new(nm, None)
            e.empty_display_size = 0.1
            bpy.context.scene.collection.objects.link(e)
            e.location = B(pos)
            e.rotation_euler = (0, 0, math.radians(rot_y))
            e.parent = root
            objs.append(e)
        return root, objs


def _bevel(tb, r, which):
    zs = [v.co.z for v in tb.verts]
    zmax, zmin, eps = max(zs), min(zs), 1e-6

    def at_z(e, z):
        return all(abs(v.co.z - z) < eps for v in e.verts)

    sel = []
    for e in tb.edges:
        vertical = abs(e.verts[0].co.z - e.verts[1].co.z) > eps
        if (which == "all" or ("top" in which and at_z(e, zmax))
                or ("bottom" in which and at_z(e, zmin)) or ("vert" in which and vertical)):
            sel.append(e)
    bmesh.ops.bevel(tb, geom=sel, offset=r, offset_type="OFFSET", segments=1,
                    profile=0.5, affect="EDGES", clamp_overlap=True)
