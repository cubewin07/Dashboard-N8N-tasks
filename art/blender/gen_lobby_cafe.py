"""Lobby and cafe (assets.md §8.1), including the Vietnamese tea table set (bàn trà)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402
from lib.parts import monitor, mug, pot  # noqa: E402


@model("props", budget="large", anchors=["stand", "seat"])
def counter_reception_01(m):
    """Curved-front reception desk: timber slats, stone top, raised visitor ledge, monitor, plant, bell."""
    w = 2.6
    m.box(w, 0.74, 0.7, at=(0, 0, 0.1), sw="n_02", bevel=0.02, edges="vert")
    m.box(w + 0.06, 0.04, 0.76, at=(0, 0.74, 0.1), sw="wood_oak_2", bevel=0.012, edges="top+vert")
    m.box(w + 0.1, 1.06, 0.14, at=(0, 0, -0.33), sw="wood_walnut_2", bevel=0.02, edges="vert")
    for i in range(13):
        m.box(0.07, 0.94, 0.03, at=(-1.2 + i * 0.2, 0.06, -0.41), sw="wood_walnut_3")
    m.box(w + 0.16, 0.05, 0.32, at=(0, 1.06, -0.3), sw="concrete_1", bevel=0.012, edges="top+vert")
    m.box(w + 0.1, 0.06, 0.16, at=(0, 0, -0.33), sw="n_12")
    m.box(0.9, 0.28, 0.02, at=(0, 0.52, -0.432), sw="jade_600")                  # logo plaque
    m.box(0.5, 0.06, 0.012, at=(0, 0.63, -0.446), sw="gold")
    monitor(m, 0.55, 0.78, 0.18, w=0.5, rot_y=180)
    m.box(0.36, 0.014, 0.12, at=(0.55, 0.78, 0.4), sw="plastic_dark")
    m.cyl(0.05, 0.03, at=(-0.2, 1.11, -0.3), sw="gold", seg=8, r2=0.02)          # bell
    m.box(0.3, 0.2, 0.01, at=(-0.9, 1.11, -0.3), sw="paper_white", rot=(60, 0, 0))  # sign-in card
    top = pot(m, -1.1, 0.2, r=0.1, h=0.16, sw="n_01", y=0.78)
    for a in range(5):
        ang = a * 1.26
        m.leaf((-1.1, top, 0.2), (-1.1 + 0.2 * math.cos(ang), top + 0.3, 0.2 + 0.2 * math.sin(ang)), 0.1, sw="plant_2")
    m.anchor("stand", (0, 0, -1.0), 0)
    m.anchor("seat", (0.55, 0.46, 0.85), 180)


@model("props", budget="large", anchors=["stand"])
def counter_cafe_01(m):
    """Cafe bar 2.4 m: tiled front, timber top, pastry case, till and menu board."""
    w = 2.4
    m.box(w, 0.9, 0.65, at=(0, 0, 0), sw="n_02", bevel=0.015, edges="vert")
    for i in range(6):
        for j in range(2):
            m.box(0.36, 0.34, 0.012, at=(-1.0 + i * 0.4, 0.12 + j * 0.38, -0.331),
                  sw="jade_500" if (i + j) % 2 else "jade_600")
    m.box(w + 0.1, 0.05, 0.75, at=(0, 0.9, -0.02), sw="wood_walnut_2", bevel=0.012, edges="top+vert")
    m.box(w, 0.08, 0.6, at=(0, 0, -0.02), sw="n_12")
    # pastry case
    m.box(0.7, 0.03, 0.4, at=(-0.75, 0.95, -0.05), sw="n_12")
    m.box(0.66, 0.012, 0.36, at=(-0.75, 1.1, -0.05), sw="steel_2")
    for i, sw in enumerate(("paper_cream", "terracotta_l", "c_pink", "wood_pine_3")):
        m.cyl(0.05, 0.04, at=(-0.98 + i * 0.15, 0.98, -0.05), sw=sw, seg=6)
        m.cyl(0.045, 0.03, at=(-0.95 + i * 0.15, 1.112, -0.02), sw=sw, seg=6)
    with m.glass():
        m.box(0.7, 0.3, 0.4, at=(-0.75, 0.98, -0.05), sw="glass_tint")
    # till + card reader, cup stacks
    m.box(0.3, 0.02, 0.24, at=(0.25, 0.95, 0.0), sw="plastic_dark")
    m.box(0.32, 0.22, 0.02, at=(0.25, 0.99, 0.02), sw="plastic_black", rot=(-20, 0, 0))
    with m.part("screen", mat="emissive"):
        m.box(0.29, 0.19, 0.004, at=(0.25, 1.0, 0.036), sw="screen_on_l", rot=(-20, 0, 0))
    for i in range(3):
        m.cyl(0.035, 0.16 - i * 0.03, at=(0.75 + i * 0.1, 0.95, 0.1), sw="paper_white", seg=6, r2=0.042)
    m.box(0.16, 0.16, 0.1, at=(0.95, 0.95, -0.2), sw="steel_2")                 # tip jar / napkins
    m.anchor("stand", (0.25, 0, -0.75), 0)
    m.anchor("stand", (-0.6, 0, -0.75), 0)


@model("props", anchors=["seat"])
def table_cafe_01(m):
    """Round bistro table (0.74 m) on a pedestal with two cups; four seat anchors for cafe chairs."""
    m.cyl(0.26, 0.03, at=(0, 0, 0), sw="steel_4", seg=10, bevel=0.01)
    m.cyl(0.035, 0.68, at=(0, 0.03, 0), sw="steel_3", seg=6)
    m.cyl(0.4, 0.035, at=(0, 0.705, 0), sw="wood_pine_3", seg=12, bevel=0.01)
    m.cyl(0.38, 0.01, at=(0, 0.695, 0), sw="wood_pine_4", seg=12)
    mug(m, 0.15, 0.74, -0.1, sw="n_01")
    mug(m, -0.16, 0.74, 0.08, sw="jade_300")
    m.cyl(0.03, 0.1, at=(0, 0.74, 0.15), sw="steel_2", seg=6)                   # napkin holder
    for i in range(4):
        a = math.pi / 2 * i
        m.anchor("seat", (0.68 * math.sin(a), 0.46, -0.68 * math.cos(a)), math.degrees(a))


@model("props", anchors=["stand"], nodes=["led"])
def coffee_machine_01(m):
    """Coffee station: cabinet with an espresso machine, grinder, cups and a milk jug."""
    m.box(0.9, 0.86, 0.55, at=(0, 0, 0), sw="wood_walnut_3", bevel=0.01, edges="vert")
    for sx in (-1, 1):
        m.box(0.41, 0.7, 0.012, at=(sx * 0.215, 0.1, -0.28), sw="wood_walnut_2")
        m.box(0.02, 0.14, 0.02, at=(sx * 0.05, 0.5, -0.295), sw="gold")
    m.box(0.94, 0.04, 0.6, at=(0, 0.86, 0), sw="concrete_1", bevel=0.01, edges="top+vert")
    y = 0.9
    m.box(0.44, 0.1, 0.36, at=(-0.16, y, 0.04), sw="steel_2", bevel=0.01, edges="vert")       # drip base
    m.box(0.44, 0.34, 0.2, at=(-0.16, y, 0.12), sw="steel_2")
    m.box(0.46, 0.12, 0.38, at=(-0.16, y + 0.3, 0.04), sw="c_red", bevel=0.02, edges="top+vert")
    for sx in (-1, 1):
        m.cyl(0.03, 0.05, at=(-0.16 + sx * 0.1, y + 0.25, -0.06), sw="steel_4", seg=6)        # group heads
        m.rod((-0.16 + sx * 0.1, y + 0.26, -0.06), (-0.16 + sx * 0.1, y + 0.24, -0.2), 0.012, sw="n_13", seg=4)
        m.cyl(0.03, 0.06, at=(-0.16 + sx * 0.1, y + 0.1, -0.06), sw="n_01", seg=6)            # cups
    m.rod((0.02, y + 0.3, -0.1), (0.08, y + 0.14, -0.14), 0.008, sw="chrome_1", seg=4)         # steam wand
    with m.part("led", mat="emissive"):
        m.box(0.08, 0.03, 0.006, at=(-0.16, y + 0.35, -0.153), sw="led_green")
    m.box(0.16, 0.24, 0.18, at=(0.26, y, 0.08), sw="plastic_black", bevel=0.01, edges="vert")  # grinder
    m.cyl(0.07, 0.14, at=(0.26, y + 0.24, 0.08), sw="wood_walnut_4", seg=6, r2=0.09)
    for i in range(3):
        m.cyl(0.035, 0.06, at=(0.12 + i * 0.09, y + 0.42, 0.12), sw="n_01", seg=6)             # cups on top...
    m.box(0.3, 0.012, 0.14, at=(0.21, y + 0.408, 0.12), sw="steel_3")
    m.box(0.012, 0.03, 0.14, at=(0.07, y + 0.38, 0.12), sw="steel_3")
    m.cyl(0.04, 0.1, at=(0.3, y, -0.16), sw="chrome_2", seg=6)                                 # milk jug
    m.anchor("stand", (0, 0, -0.65), 0)


@model("props", anchors=["stand"])
def water_dispenser_01(m):
    """Floor-standing water cooler with a blue bottle, hot/cold taps and a cup tube."""
    m.box(0.36, 1.0, 0.36, at=(0, 0, 0), sw="plastic_white", bevel=0.02, edges="vert")
    m.box(0.3, 0.26, 0.08, at=(0, 0.6, -0.16), sw="n_04")                        # tap recess
    m.box(0.3, 0.03, 0.14, at=(0, 0.58, -0.2), sw="steel_3")                     # drip tray
    m.box(0.05, 0.05, 0.05, at=(-0.07, 0.78, -0.2), sw="blocked")
    m.box(0.05, 0.05, 0.05, at=(0.07, 0.78, -0.2), sw="working")
    m.cyl(0.14, 0.05, at=(0, 1.0, 0), sw="n_05", seg=8)
    m.cyl(0.04, 0.3, at=(0.22, 0.55, 0), sw="paper_white", seg=6)                # cup tube
    with m.glass():
        m.lathe([(0.05, 1.04), (0.15, 1.1), (0.15, 1.38), (0.11, 1.44), (0.0, 1.44)], sw="water", seg=8)
    m.anchor("stand", (0, 0, -0.55), 0)


@model("props", anchors=["stand"])
def fridge_01(m):
    """Two-door pantry fridge with long handles, a water panel and notes held by magnets."""
    w, h, d = 0.75, 1.85, 0.7
    m.box(w, h - 0.05, d, at=(0, 0.05, 0.02), sw="steel_2", bevel=0.015, edges="top+vert")
    m.box(w - 0.06, 0.05, d - 0.08, at=(0, 0, 0.02), sw="n_12")
    m.box(w - 0.02, 1.12, 0.03, at=(0, 0.72, -d / 2 + 0.005), sw="steel_1", bevel=0.008, edges="vert")
    m.box(w - 0.02, 0.62, 0.03, at=(0, 0.08, -d / 2 + 0.005), sw="steel_1", bevel=0.008, edges="vert")
    m.rod((0.3, 0.85, -d / 2 - 0.04), (0.3, 1.6, -d / 2 - 0.04), 0.014, sw="chrome_1")
    m.rod((0.3, 0.3, -d / 2 - 0.04), (0.3, 0.6, -d / 2 - 0.04), 0.014, sw="chrome_1")
    m.box(0.18, 0.26, 0.01, at=(-0.14, 1.2, -d / 2 - 0.012), sw="plastic_black")
    m.box(0.16, 0.2, 0.004, at=(-0.16, 0.9, -d / 2 - 0.012), sw="paper_cream", rot=(0, 0, 4))
    m.box(0.12, 0.12, 0.004, at=(0.08, 1.5, -d / 2 - 0.012), sw="waiting_l", rot=(0, 0, -6))
    m.cyl(0.015, 0.008, at=(-0.16, 1.09, -d / 2 - 0.016), sw="blocked", seg=6, axis="z", center=True)
    m.anchor("stand", (0, 0, -0.75), 0)


@model("props", budget="large", anchors=["seat"])
def set_tea_table_01(m):
    """Bàn trà: low carved rosewood table on a woven mat, tea tray with pot and four cups, floor cushions."""
    m.box(2.2, 0.012, 2.2, at=(0, 0, 0), sw="wood_pine_2", bevel=0.0)             # woven mat
    m.box(2.0, 0.004, 2.0, at=(0, 0.012, 0), sw="wood_pine_3")
    for i in range(-4, 5):
        m.box(1.96, 0.003, 0.02, at=(0, 0.016, i * 0.22), sw="wood_pine_4")
    w, top = 1.0, 0.34
    m.box(w, 0.05, w * 0.7, at=(0, top - 0.05, 0), sw="wood_walnut_3", bevel=0.012, edges="top+vert")
    m.box(w - 0.1, 0.07, w * 0.7 - 0.1, at=(0, top - 0.12, 0), sw="wood_walnut_4")
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(0.05, top - 0.066, 0.05, at=(sx * 0.42, 0.016, sz * 0.27), sw="wood_walnut_4", taper=(1.6, 1.6))
        m.box(0.06, 0.05, 0.5, at=(sx * 0.42, 0.1, 0), sw="wood_walnut_3")       # carved stretcher
    m.box(0.72, 0.012, 0.4, at=(0, top, 0), sw="wood_ebony_2", bevel=0.006, edges="top")     # tea tray
    m.box(0.68, 0.004, 0.36, at=(0, top + 0.012, 0), sw="wood_pine_3")
    ty = top + 0.016
    m.lathe([(0.045, 0), (0.08, 0.03), (0.085, 0.07), (0.055, 0.1), (0.035, 0.105)], at=(-0.12, ty, 0), sw="terracotta", seg=8)
    m.cyl(0.03, 0.012, at=(-0.12, ty + 0.105, 0), sw="terracotta_l", seg=6)
    m.sphere(0.012, at=(-0.12, ty + 0.128, 0), sw="terracotta_l")
    m.rod((-0.2, ty + 0.05, 0), (-0.27, ty + 0.1, 0), 0.012, sw="terracotta", seg=4, r2=0.008)   # spout
    m.rod((-0.04, ty + 0.085, 0), (0.0, ty + 0.06, 0), 0.008, sw="terracotta", seg=4)          # handle
    m.rod((0.0, ty + 0.06, 0), (-0.045, ty + 0.03, 0), 0.008, sw="terracotta", seg=4)
    for i, (x, z) in enumerate(((0.1, -0.09), (0.2, -0.02), (0.12, 0.08), (0.24, 0.1))):
        m.cyl(0.02, 0.03, at=(x, ty, z), sw="paper_white", seg=6, r2=0.028)
        m.cyl(0.022, 0.004, at=(x, ty + 0.026, z), sw="wood_oak_4", seg=6)
    m.cyl(0.04, 0.05, at=(-0.34, top, 0.2), sw="jade_600", seg=6, r2=0.03)        # small vase
    m.leaf((-0.34, top + 0.05, 0.2), (-0.3, top + 0.24, 0.24), 0.05, sw="plant_2")
    m.leaf((-0.34, top + 0.05, 0.2), (-0.4, top + 0.2, 0.16), 0.05, sw="plant_1")
    cols = ("c_red", "jade_600", "c_mustard", "c_navy")
    for i in range(4):
        a = math.pi / 2 * i
        x, z = 0.82 * math.sin(a) if i % 2 else 0, -0.7 * math.cos(a) if i % 2 == 0 else 0
        m.cyl(0.24, 0.07, at=(x, 0.016, z), sw=cols[i], seg=10, bevel=0.02)
        m.cyl(0.05, 0.01, at=(x, 0.086, z), sw="gold", seg=6)
        m.anchor("seat", (x, 0.09, z), math.degrees(a))


if __name__ == "__main__":
    run(__file__)
