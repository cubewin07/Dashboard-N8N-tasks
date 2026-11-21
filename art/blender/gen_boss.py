"""Boss floor (phase-06a T10): darker wood, jade and brass. Visibly more premium than department furniture."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_storage import books  # noqa: E402
from lib.export import REGISTRY, model, run  # noqa: E402
from lib.parts import pot  # noqa: E402

del REGISTRY[:]  # importing gen_storage registered its models; this script only builds the boss set


def _club_chair(m, x, z, rot_y):
    c, s = math.cos(math.radians(rot_y)), math.sin(math.radians(rot_y))

    def at(lx, y, lz):
        return (x + lx * c + lz * s, y, z - lx * s + lz * c)

    r = (0, rot_y, 0)
    m.box(0.8, 0.06, 0.8, at=at(0, 0.04, 0), sw="gold", rot=r)
    m.box(0.82, 0.3, 0.82, at=at(0, 0.1, 0), sw="jade_700", bevel=0.05, edges="vert", rot=r)
    m.box(0.82, 0.5, 0.2, at=at(0, 0.4, 0.31), sw="jade_700", bevel=0.07, edges="top+vert", rot=r)
    for sx in (-1, 1):
        m.box(0.18, 0.26, 0.62, at=at(sx * 0.32, 0.4, -0.1), sw="jade_700", bevel=0.06, edges="top+vert", rot=r)
    m.box(0.46, 0.12, 0.56, at=at(0, 0.36, -0.1), sw="jade_600", bevel=0.04, rot=r)
    m.box(0.76, 0.04, 0.76, at=at(0, 0, 0), sw="wood_ebony_4", rot=r)
    m.anchor("seat", at(0, 0.46, -0.1), rot_y + 180)


@model("props", budget="large", anchors=["seat"])
def set_boss_lounge_01(m):
    """Executive lounge: chesterfield sofa, two jade club chairs, brass-and-marble coffee table, floor lamp."""
    # sofa at +Z facing -Z
    w = 2.2
    m.box(w, 0.06, 0.9, at=(0, 0.04, 1.2), sw="gold")
    m.box(w - 0.06, 0.04, 0.84, at=(0, 0, 1.2), sw="wood_ebony_4")
    m.box(w, 0.26, 0.9, at=(0, 0.1, 1.2), sw="wood_ebony_2", bevel=0.04, edges="vert")
    m.box(w, 0.56, 0.22, at=(0, 0.36, 1.54), sw="wood_ebony_2", bevel=0.08, edges="top+vert")
    for sx in (-1, 1):
        m.box(0.22, 0.36, 0.9, at=(sx * (w / 2 - 0.11), 0.36, 1.2), sw="wood_ebony_2", bevel=0.08, edges="top+vert")
    for i in range(3):
        x = -0.58 + i * 0.58
        m.box(0.56, 0.12, 0.62, at=(x, 0.36, 1.1), sw="wood_ebony_1", bevel=0.04)
        for k in range(2):
            m.sphere(0.018, at=(x - 0.12 + k * 0.24, 0.72, 1.425), sw="gold")       # tufting buttons
        m.anchor("seat", (x, 0.46, 1.1), 180)
    m.box(0.36, 0.36, 0.12, at=(-0.75, 0.48, 1.28), sw="jade_600", bevel=0.05, rot=(-12, 10, 6))
    m.box(0.36, 0.36, 0.12, at=(0.75, 0.48, 1.28), sw="gold_l", bevel=0.05, rot=(-12, -10, -6))
    _club_chair(m, -1.35, -0.25, -105)
    _club_chair(m, 1.35, -0.25, 105)
    # coffee table: marble top on a brass frame, tray with decanter
    m.box(1.2, 0.04, 0.65, at=(0, 0.38, 0.1), sw="plaster_1", bevel=0.012, edges="top+vert")
    m.box(1.1, 0.02, 0.55, at=(0, 0.12, 0.1), sw="wood_ebony_3")
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(0.03, 0.38, 0.03, at=(sx * 0.56, 0, 0.1 + sz * 0.29), sw="gold")
    m.box(0.36, 0.02, 0.24, at=(-0.25, 0.42, 0.1), sw="gold", bevel=0.006, edges="top")
    m.lathe([(0.04, 0), (0.05, 0.1), (0.015, 0.15), (0.015, 0.2)], at=(-0.32, 0.44, 0.1), sw="jade_500", seg=6)
    m.cyl(0.025, 0.06, at=(-0.18, 0.44, 0.14), sw="chrome_1", seg=6)
    m.box(0.3, 0.035, 0.22, at=(0.3, 0.42, 0.08), sw="c_maroon", rot=(0, 12, 0))    # coffee-table books
    m.box(0.26, 0.03, 0.2, at=(0.3, 0.455, 0.08), sw="jade_700", rot=(0, -8, 0))
    # arc floor lamp behind the left chair
    m.cyl(0.18, 0.03, at=(-1.5, 0, 1.3), sw="plaster_2", seg=8, bevel=0.01)
    m.rod((-1.5, 0.03, 1.3), (-1.5, 1.6, 1.3), 0.014, sw="gold", seg=4)
    m.rod((-1.5, 1.6, 1.3), (-1.2, 1.85, 1.1), 0.012, sw="gold", seg=4)
    m.cyl(0.07, 0.2, at=(-1.2, 1.65, 1.1), sw="wood_ebony_3", seg=8, r2=0.17, rot=(180, 0, 0), center=True)
    with m.part("lamp", mat="emissive"):
        m.cyl(0.15, 0.01, at=(-1.2, 1.545, 1.1), sw="lamp_warm", seg=8)


@model("props")
def rug_large_01(m):
    """3.2 x 2.2 m rug: jade field, cream border, brass key-pattern corners, fringed ends."""
    m.box(3.2, 0.012, 2.2, at=(0, 0, 0), sw="paper_cream")
    m.box(2.9, 0.004, 1.9, at=(0, 0.012, 0), sw="jade_700")
    m.box(2.5, 0.003, 1.5, at=(0, 0.016, 0), sw="jade_600")
    m.box(1.1, 0.003, 1.1, at=(0, 0.019, 0), sw="gold", rot=(0, 45, 0))
    m.box(0.85, 0.003, 0.85, at=(0, 0.022, 0), sw="jade_700", rot=(0, 45, 0))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(0.22, 0.003, 0.22, at=(sx * 1.05, 0.019, sz * 0.55), sw="gold")
            m.box(0.12, 0.003, 0.12, at=(sx * 1.05, 0.022, sz * 0.55), sw="jade_600")
        for i in range(11):
            m.box(0.07, 0.006, 0.03, at=(sx * 1.63, 0, -1.0 + i * 0.2), sw="paper_white")


@model("decor")
def terrace_planter_01(m):
    """Long stone planter with clipped box balls and grasses."""
    m.box(1.6, 0.5, 0.5, at=(0, 0, 0), sw="concrete_4", bevel=0.02, edges="vert", taper=(1.04, 1.1))
    m.box(1.56, 0.03, 0.46, at=(0, 0.46, 0), sw="wood_ebony_3")
    m.box(1.68, 0.05, 0.56, at=(0, 0.48, 0), sw="concrete_3", bevel=0.01, edges="top")
    m.box(1.54, 0.06, 0.42, at=(0, 0.48, 0), sw="wood_ebony_3")
    for x in (-0.5, 0.5):
        m.sphere(0.26, at=(x, 0.76, 0), sw="plant_3", sub=2, scale=(1, 0.9, 1))
    for i in range(7):
        a = i * 0.9
        m.leaf((0, 0.52, 0), (0.2 * math.cos(a), 1.05 - 0.05 * (i % 3), 0.16 * math.sin(a)), 0.07, sw="plant_1" if i % 2 else "plant_2")


@model("props", anchors=["seat"])
def terrace_chair_01(m):
    """Low teak lounge chair with a cream cushion, for the boss terrace."""
    for sx in (-1, 1):
        m.prism([(-0.4, 0), (-0.34, 0), (-0.3, 0.3), (0.36, 0.3), (0.4, 0.0), (0.46, 0), (0.42, 0.36), (0.5, 0.82),
                 (0.44, 0.83), (0.35, 0.37), (-0.36, 0.37)], 0.06, at=(sx * 0.36, 0, 0), sw="wood_oak_4", plane="zy")
    for i in range(6):
        m.box(0.66, 0.025, 0.09, at=(0, 0.3, -0.3 + i * 0.125), sw="wood_oak_3")
    for i in range(4):
        m.box(0.66, 0.08, 0.025, at=(0, 0.42 + i * 0.1, 0.37 + i * 0.02), sw="wood_oak_3", rot=(10, 0, 0))
    m.box(0.62, 0.1, 0.62, at=(0, 0.325, -0.02), sw="uphol_cream", bevel=0.03)
    m.box(0.62, 0.42, 0.1, at=(0, 0.42, 0.26), sw="uphol_cream", bevel=0.03, rot=(10, 0, 0))
    m.anchor("seat", (0, 0.43, -0.02), 180)


@model("decor")
def sculpture_01(m):
    """Abstract jade sculpture: stacked twisted forms and a brass ring on a marble plinth."""
    m.box(0.5, 0.9, 0.5, at=(0, 0, 0), sw="plaster_1", bevel=0.015, edges="vert")
    m.box(0.56, 0.05, 0.56, at=(0, 0, 0), sw="concrete_4")
    m.box(0.56, 0.04, 0.56, at=(0, 0.9, 0), sw="wood_ebony_3", bevel=0.01, edges="top")
    m.box(0.22, 0.3, 0.22, at=(0, 0.94, 0), sw="jade_600", taper=(0.6, 0.6), rot=(0, 20, 0))
    m.box(0.16, 0.34, 0.16, at=(0, 1.22, 0), sw="jade_500", taper=(1.6, 1.6), rot=(0, 50, 8))
    m.sphere(0.13, at=(0.02, 1.68, 0), sw="jade_300", sub=1, scale=(1, 1.2, 1), rot=(0, 30, 0))
    m.lathe([(0.2, 1.3), (0.23, 1.3), (0.23, 1.33), (0.2, 1.33)], sw="gold", seg=10, rot=(18, 0, 10))


@model("props", budget="large", nodes=["lamp"])
def bookshelf_tall_01(m):
    """Floor-to-ceiling ebony bookcase with brass edging, books, a lit niche and jade objects."""
    w, h, d = 1.6, 2.6, 0.4
    m.box(w, 0.1, d, at=(0, 0, 0), sw="wood_ebony_4")
    m.box(w + 0.06, 0.08, d + 0.04, at=(0, h - 0.08, 0), sw="wood_ebony_3", bevel=0.015, edges="top")
    m.box(w + 0.06, 0.015, d + 0.04, at=(0, h - 0.1, 0), sw="gold")
    m.box(w, h - 0.2, 0.02, at=(0, 0.1, d / 2 - 0.01), sw="wood_ebony_3")
    for x in (-w / 2 + 0.02, 0, w / 2 - 0.02):
        m.box(0.04, h - 0.2, d, at=(x, 0.1, 0), sw="wood_ebony_2")
    ys = [0.1 + i * 0.49 for i in range(6)]
    for y in ys:
        m.box(w - 0.04, 0.03, d - 0.02, at=(0, y, -0.01), sw="wood_ebony_2")
        m.box(w - 0.04, 0.012, 0.01, at=(0, y + 0.009, -d / 2 - 0.004), sw="gold")
    for row, y in enumerate(ys[:5]):
        for col, x0 in enumerate((-0.76, 0.04)):
            k = row * 2 + col
            if k in (3, 6):
                continue
            books(m, x0, x0 + 0.5 + 0.1 * (k % 3), y + 0.03, -0.03, seed=k + 1, h=0.32, depth=0.24)
    m.lathe([(0.05, 0), (0.09, 0.1), (0.04, 0.2), (0.05, 0.24)], at=(0.4, ys[1] + 0.03, -0.02), sw="jade_500", seg=8)
    m.sphere(0.08, at=(0.62, ys[1] + 0.11, -0.02), sw="gold", sub=1)
    m.box(0.3, 0.24, 0.03, at=(-0.4, ys[3] + 0.03, 0.05), sw="gold", rot=(-8, 0, 0))   # framed photo
    m.box(0.25, 0.19, 0.01, at=(-0.4, ys[3] + 0.055, 0.03), sw="paper_cream", rot=(-8, 0, 0))
    top = pot(m, -0.62, -0.02, r=0.07, h=0.12, sw="n_01", y=ys[3] + 0.03)
    m.sphere(0.09, at=(-0.62, top + 0.09, -0.02), sw="plant_2")
    with m.part("lamp", mat="emissive"):
        m.box(0.7, 0.01, 0.04, at=(-0.4, ys[4] - 0.012, -0.12), sw="lamp_warm")
        m.box(0.7, 0.01, 0.04, at=(0.4, ys[2] - 0.012, -0.12), sw="lamp_warm")


if __name__ == "__main__":
    run(__file__)
