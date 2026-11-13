"""Street context around the building (assets.md §8.1)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402


@model("env", budget="kit")
def ground_plaza_01(m):
    """4 x 4 m plaza paving tile: stone slabs with darker joints and a jade inlay band."""
    m.box(4, 0.1, 4, at=(0, -0.1, 0), sw="concrete_3")
    for i in range(2):
        for j in range(2):
            m.box(1.96, 0.012, 1.96, at=(-1 + i * 2, -0.006, -1 + j * 2), sw="concrete_1" if (i + j) % 2 else "plaster_2",
                  bevel=0.006, edges="top")
    m.box(0.3, 0.014, 0.3, at=(0, -0.006, 0), sw="jade_600", rot=(0, 45, 0))


@model("env")
def tree_street_01(m):
    """Street tree in a steel grate: forked trunk and layered canopy (about 5 m)."""
    m.box(1.2, 0.03, 1.2, at=(0, 0, 0), sw="steel_4")
    m.cyl(0.3, 0.035, at=(0, 0, 0), sw="wood_ebony_3", seg=8)
    m.rod((0, 0, 0), (0.05, 2.2, 0), 0.13, sw="wood_walnut_3", seg=6, r2=0.09)
    m.rod((0.05, 2.2, 0), (-0.5, 3.1, 0.2), 0.07, sw="wood_walnut_3", seg=5, r2=0.04)
    m.rod((0.05, 2.2, 0), (0.6, 3.2, -0.2), 0.07, sw="wood_walnut_3", seg=5, r2=0.04)
    m.rod((0.05, 2.2, 0), (0.1, 3.4, 0.3), 0.06, sw="wood_walnut_3", seg=5, r2=0.04)
    m.sphere(1.0, at=(0.1, 4.0, 0.1), sw="plant_2", sub=2, scale=(1.1, 0.85, 1.1))
    m.sphere(0.75, at=(-0.75, 3.5, 0.3), sw="plant_3", sub=1)
    m.sphere(0.8, at=(0.85, 3.6, -0.3), sw="plant_3", sub=1)
    m.sphere(0.6, at=(0.2, 4.7, 0.0), sw="plant_1", sub=1)


@model("env", nodes=["lamp"])
def lamp_street_01(m):
    """Street lamp, 4.2 m: tapered pole, curved arm, lit head, and a banner bracket."""
    m.cyl(0.14, 0.4, at=(0, 0, 0), sw="steel_4", seg=8, r2=0.09)
    m.rod((0, 0.4, 0), (0, 3.9, 0), 0.06, sw="steel_4", seg=6, r2=0.04)
    m.rod((0, 3.9, 0), (0, 4.2, -0.3), 0.035, sw="steel_4", seg=5)
    m.rod((0, 4.2, -0.3), (0, 4.2, -0.8), 0.03, sw="steel_4", seg=5)
    m.box(0.26, 0.07, 0.5, at=(0, 4.13, -0.85), sw="steel_3", bevel=0.02, edges="top")
    with m.part("lamp", mat="emissive"):
        m.box(0.2, 0.012, 0.42, at=(0, 4.118, -0.85), sw="lamp_warm")
    m.box(0.5, 0.02, 0.02, at=(0.25, 3.2, 0), sw="steel_4")
    m.box(0.42, 0.9, 0.01, at=(0.27, 2.3, 0), sw="jade_600")
    m.box(0.3, 0.06, 0.012, at=(0.27, 2.9, 0), sw="gold")


@model("env", anchors=["seat"])
def bench_street_01(m):
    """Park bench: cast frames, timber slats, two seats."""
    for sx in (-1, 1):
        m.prism([(-0.26, 0), (-0.2, 0), (-0.16, 0.38), (0.2, 0.38), (0.24, 0), (0.3, 0), (0.26, 0.44), (0.34, 0.86),
                 (0.28, 0.87), (0.2, 0.46), (-0.22, 0.46)], 0.05, at=(sx * 0.68, 0, 0), sw="steel_4", plane="zy")
    for i in range(4):
        m.box(1.5, 0.03, 0.085, at=(0, 0.44, -0.2 + i * 0.1), sw="wood_oak_3")
    for i in range(3):
        m.box(1.5, 0.085, 0.03, at=(0, 0.54 + i * 0.11, 0.24 + i * 0.022), sw="wood_oak_3", rot=(11, 0, 0))
    for sx in (-1, 1):
        m.anchor("seat", (sx * 0.38, 0.47, -0.05), 180)


@model("env")
def scooter_01(m):
    """Parked step-through scooter (xe máy) on its stand: no brand, jade body, tan seat."""
    body = "jade_500"
    for z in (-0.62, 0.62):                                                    # wheels
        m.cyl(0.23, 0.09, at=(0, 0.23, z), sw="n_13", seg=10, axis="x", center=True)
        m.cyl(0.12, 0.1, at=(0, 0.23, z), sw="steel_2", seg=8, axis="x", center=True)
    m.box(0.13, 0.05, 0.4, at=(0, 0.46, -0.62), sw=body, bevel=0.02, edges="top")       # front mudguard
    m.rod((0, 0.25, -0.62), (0, 0.95, -0.42), 0.03, sw="steel_3", seg=5)                 # fork / steering
    m.box(0.34, 0.5, 0.06, at=(0, 0.4, -0.38), sw=body, bevel=0.03, rot=(-14, 0, 0))    # leg shield
    m.box(0.3, 0.04, 0.38, at=(0, 0.3, -0.12), sw="n_11")                               # foot board
    m.box(0.3, 0.34, 0.75, at=(0, 0.34, 0.42), sw=body, bevel=0.06, edges="top+vert", taper=(0.8, 0.92))
    m.box(0.26, 0.07, 0.62, at=(0, 0.68, 0.36), sw="wood_pine_4", bevel=0.03)           # seat
    m.box(0.2, 0.03, 0.2, at=(0, 0.7, 0.78), sw="steel_3")                              # rear rack
    m.box(0.22, 0.12, 0.1, at=(0, 0.92, -0.44), sw=body, bevel=0.03)                    # headlight cowl
    with m.part("lamp", mat="emissive"):
        m.cyl(0.05, 0.01, at=(0, 0.98, -0.495), sw="lamp_warm", seg=8, axis="z", center=True)
        m.box(0.1, 0.04, 0.01, at=(0, 0.6, 0.795), sw="led_red")
    m.rod((-0.3, 1.02, -0.4), (0.3, 1.02, -0.4), 0.016, sw="steel_3", seg=5)            # handlebar
    for sx in (-1, 1):
        m.rod((sx * 0.2, 1.02, -0.4), (sx * 0.31, 1.02, -0.4), 0.022, sw="n_13", seg=5)
        m.rod((sx * 0.22, 1.02, -0.4), (sx * 0.27, 1.2, -0.38), 0.006, sw="steel_3", seg=3)
        m.box(0.09, 0.06, 0.012, at=(sx * 0.28, 1.19, -0.38), sw="n_12", bevel=0.004)
    m.rod((0, 0.25, 0.3), (-0.12, 0.0, 0.34), 0.012, sw="steel_3", seg=4)               # kick stand
    m.rod((0, 0.25, 0.3), (0.12, 0.0, 0.34), 0.012, sw="steel_3", seg=4)
    m.box(0.16, 0.1, 0.01, at=(0, 0.42, 0.86), sw="white")                              # blank plate


@model("env", anchors=["text"], nodes=["lamp"])
def sign_building_01(m):
    """Facade sign 3.2 x 0.8 m with a lit face. The name is rendered at runtime on the `text` anchor (never baked)."""
    for sx in (-1, 1):
        m.box(0.08, 0.5, 0.2, at=(sx * 1.2, -0.25, -0.1), sw="steel_4")
    m.box(3.2, 0.8, 0.14, at=(0, -0.4, -0.27), sw="jade_700", bevel=0.02)
    m.box(3.26, 0.05, 0.18, at=(0, 0.38, -0.27), sw="gold")
    m.box(3.26, 0.05, 0.18, at=(0, -0.43, -0.27), sw="gold")
    with m.part("lamp", mat="emissive"):
        m.box(3.0, 0.6, 0.01, at=(0, -0.3, -0.345), sw="paper_white")
    m.box(0.36, 0.36, 0.012, at=(-1.2, 0.0, -0.356), sw="jade_600", rot=(0, 0, 45), center=True)   # logo mark
    m.anchor("text", (0.2, 0, -0.36), 180)


if __name__ == "__main__":
    run(__file__)
