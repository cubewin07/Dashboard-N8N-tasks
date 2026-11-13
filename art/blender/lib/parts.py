"""Small reusable sub-assemblies shared by several families (no copy-pasted helpers)."""
import math


def monitor(m, x, y, z, w=0.54, rot_y=0.0, sw="plastic_black", screen="screen_on"):
    """Flat monitor on a foot; emissive face (part `screen`) looks towards -Z at rot_y=0."""
    c, s = math.cos(math.radians(rot_y)), math.sin(math.radians(rot_y))
    m.box(0.22, 0.012, 0.15, at=(x, y, z), sw=sw, bevel=0.004, edges="top", rot=(0, rot_y, 0))
    m.box(0.04, 0.13, 0.02, at=(x + 0.02 * s, y, z + 0.02 * c), sw=sw, rot=(0, rot_y, 0))
    m.box(w, w * 0.58, 0.028, at=(x, y + 0.1, z), sw=sw, bevel=0.006, rot=(0, rot_y, 0))
    with m.part("screen", mat="emissive"):
        m.box(w - 0.035, w * 0.58 - 0.035, 0.004, at=(x - 0.015 * s, y + 0.1175, z - 0.015 * c),
              sw=screen, rot=(0, rot_y, 0))


def keyboard(m, x, y, z, mouse=True):
    m.box(0.36, 0.014, 0.12, at=(x, y, z), sw="plastic_dark", bevel=0.004, edges="top")
    m.box(0.33, 0.004, 0.09, at=(x, y + 0.014, z), sw="n_11")
    if mouse:
        m.box(0.06, 0.02, 0.095, at=(x + 0.3, y, z), sw="plastic_dark", bevel=0.008, edges="top")


def mug(m, x, y, z, sw="jade_500"):
    m.cyl(0.035, 0.085, at=(x, y, z), sw=sw, seg=6)
    m.box(0.012, 0.045, 0.03, at=(x + 0.045, y + 0.02, z), sw=sw)


def drawers(m, x, z, w, d, h, body, front, handle="steel_2", n=3, y0=0.06):
    """Drawer block whose fronts face -Z."""
    m.box(w, h, d, at=(x, y0, z), sw=body, bevel=0.006, edges="vert")
    dh = (h - 0.02) / n
    for i in range(n):
        y = y0 + 0.01 + i * dh
        m.box(w - 0.03, dh - 0.015, 0.012, at=(x, y, z - d / 2 - 0.004), sw=front)
        m.box(w * 0.4, 0.012, 0.012, at=(x, y + dh / 2 - 0.006, z - d / 2 - 0.016), sw=handle)


def star_base(m, r=0.3, hub_y=0.09, sw="plastic_black", n=5):
    """Office-chair star base with casters and gas lift up to hub_y + 0.25."""
    for i in range(n):
        a = 2 * math.pi * i / n + math.pi / 2
        x, z = r * math.cos(a), r * math.sin(a)
        m.rod((0, hub_y, 0), (x, hub_y - 0.03, z), 0.022, sw=sw, seg=4)
        m.cyl(0.028, 0.05, at=(x, 0.0, z), sw="n_13", seg=6)
    m.cyl(0.045, 0.06, at=(0, hub_y - 0.03, 0), sw=sw, seg=6)


def cushion(m, w, h, d, at, sw, bevel=0.03):
    m.box(w, h, d, at=at, sw=sw, bevel=min(bevel, h * 0.45), edges="all")


def pot(m, x, z, r=0.16, h=0.3, sw="terracotta", soil=True, y=0.0, seg=8):
    """Tapered plant pot with a rim; returns the soil height."""
    m.lathe([(r * 0.72, 0), (r, h * 0.86), (r * 1.08, h * 0.86), (r * 1.08, h)], at=(x, y, z), sw=sw, seg=seg)
    if soil:
        m.cyl(r * 0.95, 0.01, at=(x, y + h - 0.03, z), sw="wood_ebony_3", seg=seg)
    return y + h - 0.02
