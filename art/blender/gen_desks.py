"""Desks (assets.md §8.1). Desk top 0.74 m; the user sits on the -Z side."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402

TOP_H = 0.74




def _screen_front(m, x, z, w, rot_y=0.0):
    """Monitor whose emissive face sits just in front (-Z) of the bezel."""
    import math
    y = TOP_H
    c, s = math.cos(math.radians(rot_y)), math.sin(math.radians(rot_y))
    sw = "plastic_black"
    m.box(0.22, 0.012, 0.15, at=(x, y, z), sw=sw, bevel=0.004, edges="top", rot=(0, rot_y, 0))
    m.box(0.04, 0.13, 0.02, at=(x + 0.02 * s, y, z + 0.02 * c), sw=sw, rot=(0, rot_y, 0))
    m.box(w, w * 0.58, 0.028, at=(x, y + 0.1, z), sw=sw, bevel=0.006, rot=(0, rot_y, 0))
    with m.part("screen", mat="emissive"):
        m.box(w - 0.035, w * 0.58 - 0.035, 0.004, at=(x - 0.015 * s, y + 0.1175, z - 0.015 * c),
              sw="screen_on", rot=(0, rot_y, 0))


def _keyboard(m, x, z):
    m.box(0.36, 0.014, 0.12, at=(x, TOP_H, z), sw="plastic_dark", bevel=0.004, edges="top")
    m.box(0.33, 0.004, 0.09, at=(x, TOP_H + 0.014, z), sw="n_11")
    m.box(0.06, 0.02, 0.095, at=(x + 0.3, TOP_H, z), sw="plastic_dark", bevel=0.008, edges="top")


def _leg_frame(m, x, depth, sw, h=TOP_H - 0.035):
    """Inverted-U steel leg at +-x."""
    for sz in (-1, 1):
        m.box(0.04, h, 0.04, at=(x, 0, sz * (depth / 2 - 0.06)), sw=sw)
    m.box(0.04, 0.04, depth - 0.12, at=(x, 0.0, 0), sw=sw)
    m.box(0.04, 0.03, depth - 0.12, at=(x, h - 0.03, 0), sw=sw)


def _drawers(m, x, z, w, d, h, body, front, handle="steel_2", n=3, y0=0.06):
    m.box(w, h, d, at=(x, y0, z), sw=body, bevel=0.006, edges="vert")
    dh = (h - 0.02) / n
    for i in range(n):
        y = y0 + 0.01 + i * dh
        m.box(w - 0.03, dh - 0.015, 0.012, at=(x, y, z - d / 2 - 0.004), sw=front)
        m.box(w * 0.4, 0.012, 0.012, at=(x, y + dh / 2 - 0.006, z - d / 2 - 0.016), sw=handle)


def _paper_pile(m, x, z, n=3, sw="paper_white"):
    for i in range(n):
        m.box(0.21, 0.012, 0.297, at=(x + 0.006 * (i % 2), TOP_H + 0.012 * i, z),
              sw=sw if i % 2 == 0 else "paper_cream", rot=(0, 4 * i - 4, 0))


def _mug(m, x, z, sw="jade_500"):
    m.cyl(0.035, 0.085, at=(x, TOP_H, z), sw=sw, seg=6)
    m.box(0.012, 0.045, 0.03, at=(x + 0.045, TOP_H + 0.02, z), sw=sw)


def _standard(m, top, legs, w=1.4, d=0.7, drawers=True, accent="jade_600"):
    m.box(w, 0.035, d, at=(0, TOP_H - 0.035, 0), sw=top, bevel=0.01, edges="top+vert")
    _leg_frame(m, -(w / 2 - 0.07), d, legs)
    _leg_frame(m, w / 2 - 0.07, d, legs)
    m.box(w - 0.2, 0.3, 0.018, at=(0, 0.36, d / 2 - 0.07), sw="n_04")           # modesty panel
    m.box(w - 0.5, 0.03, 0.1, at=(0, TOP_H - 0.09, d / 2 - 0.14), sw=legs)      # cable tray
    if drawers:
        _drawers(m, w / 2 - 0.33, 0.02, 0.4, 0.5, 0.55, "n_03", "n_01")
    m.box(0.3, 0.004, 0.22, at=(-0.42, TOP_H, -0.12), sw=accent)               # desk mat accent
    m.anchor("seat", (0, 0.46, -(d / 2 + 0.25)))
    m.anchor("pile", (-(w / 2 - 0.2), TOP_H, 0.1))


@model("props", anchors=["seat", "screen", "pile"])
def desk_standard_01(m):
    _standard(m, "wood_oak_2", "steel_3")
    _screen_front(m, 0.0, 0.16, 0.54)
    _keyboard(m, -0.02, -0.14)
    _mug(m, 0.5, 0.12)


@model("props", anchors=["seat", "screen", "pile"])
def desk_standard_02(m):
    """White top, dual monitors."""
    _standard(m, "n_01", "steel_4", accent="working")
    _screen_front(m, -0.27, 0.17, 0.5, rot_y=-12)
    _screen_front(m, 0.27, 0.17, 0.5, rot_y=12)
    _keyboard(m, -0.02, -0.14)


@model("props", anchors=["seat", "screen", "pile"])
def desk_standard_03(m):
    """Compact pine desk with a shelf riser and a laptop-style low screen."""
    _standard(m, "wood_pine_3", "n_12", w=1.2, d=0.65, drawers=False, accent="waiting")
    m.box(0.9, 0.02, 0.2, at=(0, TOP_H + 0.11, 0.2), sw="wood_pine_3", bevel=0.005, edges="top")
    for sx in (-1, 1):
        m.box(0.02, 0.11, 0.2, at=(sx * 0.43, TOP_H, 0.2), sw="wood_pine_4")
    y = TOP_H + 0.13
    m.box(0.5, 0.3, 0.022, at=(0, y, 0.2), sw="plastic_black", bevel=0.005)
    with m.part("screen", mat="emissive"):
        m.box(0.47, 0.27, 0.004, at=(0, y + 0.015, 0.187), sw="screen_on")
    _keyboard(m, -0.02, -0.12)
    m.box(0.12, 0.09, 0.1, at=(0.38, TOP_H + 0.13, 0.2), sw="terracotta", taper=(1.2, 1.2))
    m.sphere(0.08, at=(0.38, TOP_H + 0.27, 0.2), sw="plant_2", scale=(1, 0.9, 1))
    m.box(0.36, 0.5, 0.45, at=(0.38, 0.0, 0.05), sw="n_03", bevel=0.01, edges="vert")  # pedestal
    for i in range(2):
        m.box(0.33, 0.21, 0.012, at=(0.38, 0.04 + i * 0.23, -0.18), sw="n_01")
        m.box(0.12, 0.012, 0.012, at=(0.38, 0.2 + i * 0.23, -0.192), sw="steel_2")


@model("props", anchors=["seat", "screen", "pile"])
def desk_review_01(m):
    """Reviewer's desk: wider, in/out trays; papers pile up on the `pile` anchor."""
    w, d = 1.6, 0.75
    m.box(w, 0.04, d, at=(0, TOP_H - 0.04, 0), sw="wood_oak_3", bevel=0.01, edges="top+vert")
    m.box(w, 0.006, 0.03, at=(0, TOP_H - 0.045, -d / 2 + 0.015), sw="working")   # status edge strip
    for sx in (-1, 1):
        m.box(0.05, TOP_H - 0.04, d - 0.1, at=(sx * (w / 2 - 0.06), 0, 0), sw="n_03",
              bevel=0.008, edges="vert")
    m.box(w - 0.17, 0.4, 0.02, at=(0, 0.3, d / 2 - 0.08), sw="n_04")
    _drawers(m, w / 2 - 0.36, 0.0, 0.42, 0.55, 0.56, "n_03", "wood_oak_2")
    _screen_front(m, 0.1, 0.2, 0.56)
    _keyboard(m, 0.08, -0.14)
    # stacked in/out trays on the left
    for i, sw in enumerate(("done", "waiting")):
        y = TOP_H + i * 0.075
        m.box(0.27, 0.008, 0.34, at=(-0.58, y, 0.1), sw="steel_3")
        for sx in (-1, 1):
            m.box(0.008, 0.045, 0.34, at=(-0.58 + sx * 0.131, y, 0.1), sw="steel_3")
        m.box(0.27, 0.045, 0.008, at=(-0.58, y, 0.266), sw="steel_3")
        m.box(0.1, 0.02, 0.006, at=(-0.58, y + 0.012, -0.073), sw=sw)
        m.box(0.21, 0.012, 0.297, at=(-0.58, y + 0.008, 0.1), sw="paper_white")
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(0.01, 0.075, 0.01, at=(-0.58 + sx * 0.13, TOP_H + 0.04, 0.1 + sz * 0.16), sw="steel_3")
    m.cyl(0.04, 0.1, at=(0.62, TOP_H, 0.22), sw="n_12", seg=6)                   # pen pot
    m.rod((0.61, TOP_H + 0.08, 0.22), (0.6, TOP_H + 0.17, 0.2), 0.006, sw="blocked", seg=4)
    m.rod((0.63, TOP_H + 0.08, 0.23), (0.65, TOP_H + 0.16, 0.25), 0.006, sw="working", seg=4)
    m.anchor("seat", (0, 0.46, -(d / 2 + 0.25)))
    m.anchor("pile", (-0.2, TOP_H, 0.12))


@model("props", anchors=["seat", "screen", "pile"])
def desk_manager_01(m):
    """L-shaped walnut desk with a side return."""
    w, d = 1.8, 0.85
    m.box(w, 0.045, d, at=(0, TOP_H - 0.045, 0), sw="wood_walnut_2", bevel=0.012, edges="top+vert")
    m.box(0.6, 0.045, 1.0, at=(w / 2 - 0.3, TOP_H - 0.045, -(d / 2 + 0.5)), sw="wood_walnut_2",
          bevel=0.012, edges="top+vert")
    m.box(0.05, TOP_H - 0.045, d - 0.08, at=(-(w / 2 - 0.05), 0, 0), sw="wood_walnut_3")
    m.box(w - 0.1, 0.5, 0.03, at=(0, 0.2, d / 2 - 0.06), sw="wood_walnut_3")
    m.box(w - 0.3, 0.02, 0.012, at=(0, 0.45, d / 2 - 0.04), sw="jade_600")       # jade inlay
    _drawers(m, w / 2 - 0.3, -(d / 2 + 0.62), 0.5, 0.6, 0.6, "wood_walnut_3", "wood_walnut_2",
             handle="gold", y0=0.05)
    m.box(0.05, TOP_H - 0.045, 0.05, at=(w / 2 - 0.05, 0, d / 2 - 0.06), sw="wood_walnut_3")
    _screen_front(m, -0.1, 0.22, 0.62)
    _keyboard(m, -0.12, -0.16)
    m.box(0.34, 0.012, 0.24, at=(0.6, TOP_H, -0.6), sw="plastic_dark", rot=(0, 20, 0))  # closed laptop
    _mug(m, -0.7, 0.2, sw="n_01")
    m.box(0.3, 0.025, 0.22, at=(-0.62, TOP_H, -0.12), sw="c_navy")               # notebook
    m.anchor("seat", (-0.1, 0.46, -(d / 2 + 0.3)))
    m.anchor("pile", (0.55, TOP_H, 0.12))


@model("props", budget="large", anchors=["seat", "screen", "pile"])
def desk_boss_01(m):
    """Executive desk: ebony body, inset leather top, brass trim, jade accents."""
    w, d = 2.2, 1.0
    m.box(w, 0.06, d, at=(0, TOP_H - 0.06, 0), sw="wood_ebony_2", bevel=0.015, edges="top+vert")
    m.box(w - 0.3, 0.004, d - 0.3, at=(0, TOP_H, 0), sw="jade_700")              # leather inset
    m.box(w + 0.01, 0.012, d + 0.01, at=(0, TOP_H - 0.075, 0), sw="gold")        # brass band
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.32)
        m.box(0.56, TOP_H - 0.12, d - 0.14, at=(x, 0.05, 0), sw="wood_ebony_3", bevel=0.012, edges="vert")
        m.box(0.6, 0.05, d - 0.1, at=(x, 0, 0), sw="wood_ebony_4")                # plinth
        for i in range(3):
            y = 0.08 + i * 0.185
            m.box(0.5, 0.17, 0.012, at=(x, y, -(d / 2 - 0.066)), sw="wood_ebony_2")
            m.box(0.14, 0.014, 0.014, at=(x, y + 0.08, -(d / 2 - 0.05)), sw="gold")
        m.box(0.5, 0.5, 0.012, at=(x, 0.1, d / 2 - 0.066), sw="wood_ebony_2")     # front panel
        m.box(0.42, 0.012, 0.006, at=(x, 0.34, d / 2 - 0.058), sw="gold")
    m.box(w - 1.2, 0.5, 0.03, at=(0, 0.14, d / 2 - 0.1), sw="wood_ebony_3")
    m.box(0.3, 0.3, 0.008, at=(0, 0.24, d / 2 - 0.08), sw="jade_600", rot=(0, 0, 45))  # jade diamond
    _screen_front(m, 0.35, 0.26, 0.66)
    _keyboard(m, 0.33, -0.2)
    # banker's lamp
    m.box(0.16, 0.02, 0.1, at=(-0.72, TOP_H, 0.28), sw="gold", bevel=0.006, edges="top")
    m.rod((-0.72, TOP_H, 0.28), (-0.72, TOP_H + 0.24, 0.28), 0.01, sw="gold")
    m.cyl(0.05, 0.26, at=(-0.85, TOP_H + 0.24, 0.28), sw="jade_500", seg=6, axis="x", scale=(1, 1.2))
    with m.part("lamp", mat="emissive"):
        m.box(0.22, 0.006, 0.06, at=(-0.72, TOP_H + 0.185, 0.28), sw="lamp_warm")
    # name plate, pen set, leather folio
    m.prism([(-0.02, 0), (0.02, 0), (0, 0.05)], 0.26, at=(0, TOP_H, -0.38), sw="gold", plane="zy")
    m.box(0.34, 0.02, 0.25, at=(-0.3, TOP_H, -0.1), sw="wood_walnut_4", bevel=0.005, edges="top")
    m.box(0.1, 0.02, 0.06, at=(-0.72, TOP_H, -0.2), sw="n_13")
    m.rod((-0.72, TOP_H + 0.02, -0.2), (-0.7, TOP_H + 0.14, -0.16), 0.006, sw="gold", seg=4)
    m.anchor("seat", (0, 0.46, -(d / 2 + 0.35)))
    m.anchor("pile", (-0.3, TOP_H + 0.02, 0.22))


if __name__ == "__main__":
    run(__file__)
