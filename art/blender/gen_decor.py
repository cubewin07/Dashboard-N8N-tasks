"""Decor (assets.md §8.1). Wall items: pivot on the wall plane at their centre, facing -Z.
Ceiling items: pivot on the ceiling, hanging down. Animated nodes: hand_hour, hand_minute, blades, fish."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402
from lib.parts import pot  # noqa: E402


@model("decor")
def plant_monstera_01(m):
    """Monstera in a white pot: broad leaves on arching stems."""
    top = pot(m, 0, 0, r=0.2, h=0.36, sw="n_01")
    for i in range(9):
        a = i * 2.4
        r = 0.22 + 0.05 * (i % 3)
        h = 0.55 + 0.11 * (i % 4)
        tip = (r * math.cos(a), top + h, r * math.sin(a))
        m.rod((0.03 * math.cos(a), top, 0.03 * math.sin(a)), tip, 0.01, sw="plant_3", seg=3)
        end = (tip[0] + 0.3 * math.cos(a), tip[1] - 0.06, tip[2] + 0.3 * math.sin(a))
        m.leaf(tip, end, 0.3, sw="plant_2" if i % 2 else "plant_3", fold=0.18)


@model("decor")
def plant_snake_01(m):
    """Snake plant (lưỡi hổ) in a terracotta pot: stiff upright blades with a light edge."""
    top = pot(m, 0, 0, r=0.17, h=0.3, sw="terracotta")
    for i in range(9):
        a = i * 2.1
        r = 0.03 + 0.012 * (i % 4)
        h = 0.5 + 0.09 * (i % 5)
        lean = 0.06 + 0.02 * (i % 3)
        base = (r * math.cos(a), top, r * math.sin(a))
        tip = (base[0] + lean * math.cos(a), top + h, base[2] + lean * math.sin(a))
        m.leaf(base, tip, 0.09, sw="plant_3" if i % 3 else "plant_1", fold=0.12)


@model("decor")
def plant_ficus_01(m):
    """Small ficus tree: braided trunk, three foliage clumps, woven basket pot."""
    m.lathe([(0.17, 0), (0.21, 0.16), (0.2, 0.34), (0.2, 0.36)], sw="wood_pine_4", seg=8)
    for y in (0.08, 0.2, 0.3):
        m.lathe([(0.212, y), (0.216, y + 0.015)], sw="wood_pine_3", seg=8)
    m.cyl(0.19, 0.01, at=(0, 0.33, 0), sw="wood_ebony_3", seg=8)
    m.rod((0, 0.33, 0), (0.02, 1.0, 0.01), 0.03, sw="wood_walnut_3", seg=5, r2=0.022)
    m.rod((0.02, 1.0, 0.01), (-0.12, 1.3, 0.05), 0.016, sw="wood_walnut_3", seg=4)
    m.rod((0.02, 1.0, 0.01), (0.15, 1.28, -0.06), 0.016, sw="wood_walnut_3", seg=4)
    m.sphere(0.3, at=(0.02, 1.55, 0), sw="plant_2", sub=2, scale=(1, 0.9, 1))
    m.sphere(0.2, at=(-0.2, 1.36, 0.08), sw="plant_3", sub=1)
    m.sphere(0.2, at=(0.22, 1.36, -0.1), sw="plant_1", sub=1)


@model("decor")
def plant_bamboo_01(m):
    """Lucky bamboo screen: seven jointed canes with leaf tufts in a long pebble planter."""
    m.box(0.9, 0.3, 0.3, at=(0, 0, 0), sw="n_12", bevel=0.015, edges="vert", taper=(1.05, 1.1))
    m.box(0.86, 0.02, 0.26, at=(0, 0.29, 0), sw="concrete_1")
    for i in range(7):
        x = -0.36 + i * 0.12
        z = 0.04 * ((i % 3) - 1)
        h = 1.3 + 0.16 * ((i * 3) % 4)
        m.rod((x, 0.3, z), (x, h, z), 0.018, sw="plant_1", seg=5)
        for k in range(1, 4):
            y = 0.3 + (h - 0.3) * k / 4
            m.cyl(0.022, 0.012, at=(x, y, z), sw="plant_3", seg=5)
        for k in range(3):
            a = i + k * 2.1
            base = (x, h - 0.06 * k, z)
            m.leaf(base, (x + 0.22 * math.cos(a), base[1] + 0.12, z + 0.22 * math.sin(a)), 0.06, sw="plant_2")


@model("decor", budget="small")
def plant_desk_01(m):
    """Small succulent for a desk."""
    top = pot(m, 0, 0, r=0.055, h=0.08, sw="jade_300", soil=False, seg=6)
    for i in range(5):
        a = i * 1.26
        m.leaf((0, top, 0), (0.07 * math.cos(a), top + 0.07, 0.07 * math.sin(a)), 0.05, sw="plant_2" if i % 2 else "plant_1")
    m.leaf((0, top, 0), (0.0, top + 0.1, 0.01), 0.05, sw="plant_1")


@model("decor")
def plant_hanging_01(m):
    """Hanging pothos: ceiling hook, three cords, pot, trailing vines. Pivot on the ceiling."""
    m.cyl(0.03, 0.02, at=(0, -0.02, 0), sw="steel_3", seg=6)
    for i in range(3):
        a = i * 2.094
        m.rod((0, -0.02, 0), (0.15 * math.cos(a), -0.72, 0.15 * math.sin(a)), 0.005, sw="paper_cream", seg=3)
    m.lathe([(0.1, -0.9), (0.16, -0.72), (0.165, -0.7)], sw="n_01", seg=8)
    m.cyl(0.15, 0.01, at=(0, -0.73, 0), sw="wood_ebony_3", seg=8)
    for i in range(6):
        a = i * 1.05 + 0.3
        ln = 0.35 + 0.18 * (i % 3)
        p0 = (0.14 * math.cos(a), -0.72, 0.14 * math.sin(a))
        p1 = (0.21 * math.cos(a), -0.78, 0.21 * math.sin(a))
        p2 = (0.22 * math.cos(a), -0.78 - ln, 0.22 * math.sin(a))
        m.rod(p0, p1, 0.006, sw="plant_3", seg=3)
        m.rod(p1, p2, 0.006, sw="plant_3", seg=3)
        for k in range(3):
            y = p1[1] - ln * (k + 0.5) / 3
            m.leaf((p1[0], y, p1[2]), (p1[0] + 0.1 * math.cos(a + k), y - 0.07, p1[2] + 0.1 * math.sin(a + k)), 0.08,
                   sw="plant_1" if (i + k) % 2 else "plant_2")
    for i in range(4):
        a = i * 1.57 + 0.5
        m.leaf((0, -0.72, 0), (0.14 * math.cos(a), -0.58, 0.14 * math.sin(a)), 0.09, sw="plant_2")


@model("decor", nodes=["hand_hour", "hand_minute"])
def clock_wall_01(m):
    """Wall clock 0.36 m. `hand_hour` / `hand_minute` point to 12 and rotate around Z."""
    m.cyl(0.18, 0.04, at=(0, 0, -0.02), sw="n_12", seg=12, axis="z", center=True)
    m.cyl(0.16, 0.006, at=(0, 0, -0.042), sw="white", seg=12, axis="z", center=True)
    for i in range(12):
        a = i * math.pi / 6
        big = i % 3 == 0
        m.box(0.012 if big else 0.006, 0.03 if big else 0.016, 0.003,
              at=(0.135 * math.sin(a), 0.135 * math.cos(a), -0.046), sw="n_12", rot=(0, 0, -math.degrees(a)), center=True)
    with m.part("hand_hour", pivot=(0, 0, -0.049), exact=True):
        m.box(0.016, 0.085, 0.004, at=(0, -0.012, -0.049), sw="n_13")
    with m.part("hand_minute", pivot=(0, 0, -0.053), exact=True):
        m.box(0.01, 0.13, 0.004, at=(0, -0.015, -0.053), sw="jade_600")
    m.cyl(0.012, 0.01, at=(0, 0, -0.055), sw="gold", seg=6, axis="z", center=True)


@model("decor", nodes=["fish", "lamp"])
def aquarium_01(m):
    """Aquarium on a cabinet: glass tank, water, gravel, plants, rock, lit hood. `fish` is a node that can swim around."""
    w, d = 1.0, 0.4
    m.box(w, 0.7, d, at=(0, 0, 0), sw="wood_walnut_3", bevel=0.01, edges="vert")
    for sx in (-1, 1):
        m.box(w / 2 - 0.03, 0.56, 0.012, at=(sx * w / 4, 0.08, -d / 2 - 0.004), sw="wood_walnut_2")
        m.box(0.02, 0.1, 0.016, at=(sx * 0.04, 0.4, -d / 2 - 0.016), sw="steel_2")
    m.box(w, 0.03, d, at=(0, 0.7, 0), sw="n_12")
    m.box(w - 0.04, 0.05, d - 0.04, at=(0, 0.73, 0), sw="plaster_3")              # gravel
    m.box(0.16, 0.1, 0.12, at=(0.25, 0.77, 0.03), sw="concrete_4", bevel=0.03, taper=(0.6, 0.6), rot=(0, 20, 0))
    for i, x in enumerate((-0.36, -0.28, -0.08, 0.36)):
        for k in range(3):
            m.leaf((x, 0.78, 0.05), (x + 0.05 * (k - 1), 0.98 + 0.06 * ((i + k) % 3), 0.05 + 0.03 * (k - 1)), 0.04,
                   sw="plant_2" if k % 2 else "plant_1")
    m.box(w, 0.07, d, at=(0, 1.25, 0), sw="n_12", bevel=0.01, edges="top")       # hood
    with m.part("lamp", mat="emissive"):
        m.box(w - 0.1, 0.008, d - 0.1, at=(0, 1.243, 0), sw="screen_on_l")
    with m.part("fish", pivot=(0, 1.0, 0)):
        for x, y, z, sw, s in ((-0.2, 1.05, -0.05, "c_orange", 1), (0.1, 0.95, 0.06, "c_yellow", -1),
                               (0.28, 1.1, -0.02, "c_red", 1), (-0.05, 0.88, 0.0, "c_orange", -1)):
            m.sphere(0.035, at=(x, y, z), sw=sw, scale=(1.5, 0.9, 0.5))
            m.prism([(0, 0), (0.05, 0.035), (0.05, -0.035)], 0.006, at=(x + s * 0.04, y, z), sw=sw,
                    rot=(0, 0 if s > 0 else 180, 0))
    with m.glass():
        m.box(w - 0.02, 0.44, d - 0.02, at=(0, 0.78, 0), sw="water")
        m.box(w, 0.52, d, at=(0, 0.73, 0), sw="glass_tint")


@model("decor", nodes=["blades"])
def fan_ceiling_01(m):
    """Ceiling fan, 1.3 m sweep. Pivot on the ceiling; `blades` spins around Y."""
    m.cyl(0.07, 0.04, at=(0, -0.04, 0), sw="n_03", seg=8)
    m.cyl(0.015, 0.3, at=(0, -0.34, 0), sw="steel_3", seg=6)
    m.cyl(0.11, 0.1, at=(0, -0.44, 0), sw="n_02", seg=10, bevel=0.02)
    m.cyl(0.06, 0.03, at=(0, -0.47, 0), sw="gold", seg=8)
    with m.part("blades", pivot=(0, -0.39, 0), exact=True):
        for i in range(4):
            a = 90 * i
            c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
            m.box(0.06, 0.008, 0.16, at=(0.15 * s, -0.39, 0.15 * c), sw="steel_3", rot=(0, a, 0), center=True)
            m.box(0.13, 0.012, 0.46, at=(0.42 * s, -0.39, 0.42 * c), sw="wood_oak_3", rot=(8, a, 0), center=True,
                  bevel=0.004, edges="vert")


@model("decor", nodes=["lamp"])
def light_ceiling_01(m):
    """Linear pendant panel light 1.2 x 0.3 m. Pivot on the ceiling; `lamp` is the diffuser."""
    for sx in (-1, 1):
        m.cyl(0.02, 0.015, at=(sx * 0.45, -0.015, 0), sw="n_05", seg=6)
        m.rod((sx * 0.45, -0.015, 0), (sx * 0.45, -0.4, 0), 0.004, sw="n_10", seg=3)
    m.box(1.2, 0.05, 0.3, at=(0, -0.45, 0), sw="n_12", bevel=0.01, edges="top+vert")
    with m.part("lamp", mat="emissive"):
        m.box(1.16, 0.01, 0.26, at=(0, -0.458, 0), sw="lamp_warm")


def _frame(m, w, h, sw, depth=0.035):
    m.box(w, h, depth, at=(0, -h / 2, -depth / 2), sw=sw)
    m.box(w - 0.07, h - 0.07, 0.004, at=(0, -h / 2 + 0.035, -depth - 0.002), sw="paper_white")


@model("decor", budget="small")
def painting_01(m):
    """Landscape canvas (1.0 x 0.7 m): limestone islands on a jade bay at sunrise."""
    _frame(m, 1.0, 0.7, "wood_walnut_3")
    z = -0.041
    m.box(0.86, 0.3, 0.003, at=(0, 0.0, z), sw="c_peach")
    m.box(0.86, 0.28, 0.003, at=(0, -0.28, z - 0.001), sw="jade_300")
    m.cyl(0.07, 0.003, at=(0.18, 0.1, z - 0.002), sw="c_coral", seg=8, axis="z", center=True)
    for x, w, h, sw in ((-0.25, 0.26, 0.32, "jade_700"), (-0.02, 0.2, 0.22, "jade_600"), (0.28, 0.24, 0.27, "jade_700")):
        m.prism([(-w / 2, 0), (w / 2, 0), (w * 0.2, h), (-w * 0.25, h * 0.8)], 0.003, at=(x, -0.06, z - 0.004), sw=sw)
    m.prism([(-0.07, 0), (0.07, 0), (0.05, -0.03), (-0.05, -0.03)], 0.003, at=(0.05, -0.17, z - 0.006), sw="wood_walnut_4")
    m.prism([(0, 0), (0.06, 0), (0, 0.09)], 0.003, at=(0.04, -0.165, z - 0.006), sw="c_red")


@model("decor", budget="small")
def painting_02(m):
    """Portrait canvas (0.6 x 0.8 m): a lotus on dark water, brass frame."""
    _frame(m, 0.6, 0.8, "gold")
    z = -0.041
    m.box(0.5, 0.7, 0.003, at=(0, -0.35, z), sw="jade_900")
    m.cyl(0.16, 0.003, at=(-0.06, -0.2, z - 0.002), sw="jade_600", seg=6, axis="z", center=True, scale=(1, 0.45))
    m.cyl(0.12, 0.003, at=(0.1, -0.27, z - 0.002), sw="jade_700", seg=6, axis="z", center=True, scale=(1, 0.45))
    for a, sw in ((-40, "c_pink"), (40, "c_pink"), (-18, "c_rose"), (18, "c_rose"), (0, "c_pink")):
        m.prism([(0, 0), (0.05, 0.1), (0, 0.22), (-0.05, 0.1)], 0.003, at=(0, -0.12, z - 0.004 - abs(a) * 0.00002),
                sw=sw, rot=(0, 0, a))
    m.box(0.012, 0.16, 0.003, at=(0, -0.27, z - 0.003), sw="plant_2")


@model("decor", budget="small")
def calendar_wall_01(m):
    """Vietnamese tear-off block calendar (lịch bloc): red backing card, date pad, hanging loop."""
    m.box(0.3, 0.46, 0.008, at=(0, -0.23, -0.004), sw="c_red")
    m.box(0.26, 0.1, 0.004, at=(0, 0.1, -0.01), sw="gold")
    m.box(0.22, 0.26, 0.03, at=(0, -0.2, -0.023), sw="paper_white")
    m.box(0.22, 0.05, 0.002, at=(0, 0.01, -0.039), sw="c_red")
    m.box(0.1, 0.12, 0.002, at=(0, -0.13, -0.039), sw="n_13")                     # the big day number
    m.box(0.16, 0.012, 0.002, at=(0, -0.17, -0.039), sw="n_08")
    m.box(0.2, 0.03, 0.006, at=(0, 0.045, -0.04), sw="steel_3")
    m.cyl(0.015, 0.006, at=(0, 0.25, -0.004), sw="steel_3", seg=6, axis="z", center=True)


@model("decor", budget="small")
def bin_01(m):
    """Waste-paper bin with a few crumpled sheets."""
    m.lathe([(0.11, 0), (0.15, 0.3), (0.158, 0.3), (0.158, 0.32), (0.14, 0.32), (0.105, 0.02)], sw="n_11", seg=8)
    m.sphere(0.05, at=(0.02, 0.29, 0.02), sw="paper_white")
    m.sphere(0.045, at=(-0.05, 0.27, -0.03), sw="paper_cream")


if __name__ == "__main__":
    run(__file__)
