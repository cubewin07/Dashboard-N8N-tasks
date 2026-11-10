"""Room dividers (assets.md §8.1): glass office front, glass door, low desk partition."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402

RH = 2.8


@model("env", budget="kit")
def office_glass_wall_01(m):
    """2 m module of a glazed office front, 2.8 m high, with a frosted band."""
    fr = "n_12"
    m.box(2.0, 0.08, 0.08, at=(0, 0, 0), sw=fr)
    m.box(2.0, 0.08, 0.08, at=(0, RH - 0.08, 0), sw=fr)
    for x in (-0.975, 0, 0.975):
        m.box(0.05, RH - 0.16, 0.07, at=(x, 0.08, 0), sw=fr)
    with m.glass():
        m.box(1.9, RH - 0.16, 0.016, at=(0, 0.08, 0), sw="glass_tint")
        m.box(1.9, 0.6, 0.022, at=(0, 0.9, 0), sw="n_01")
        m.box(1.9, 0.03, 0.024, at=(0, 1.56, 0), sw="jade_300")


@model("env", budget="kit", nodes=["door"])
def office_glass_door_01(m):
    """1.0 m door module: frame, transom glass, and a 0.9 x 2.1 m glass leaf (`door`, hinged at -X)."""
    fr = "n_12"
    for sx in (-1, 1):
        m.box(0.05, RH, 0.09, at=(sx * 0.475, 0, 0), sw=fr)
    m.box(0.9, 0.06, 0.09, at=(0, 2.1, 0), sw=fr)
    m.box(0.9, 0.06, 0.09, at=(0, RH - 0.06, 0), sw=fr)
    with m.glass():
        m.box(0.9, RH - 2.22, 0.016, at=(0, 2.16, 0), sw="glass_tint")
    with m.part("door", pivot=(-0.45, 0, 0)):
        m.box(0.9, 0.1, 0.04, at=(0, 0.01, 0), sw="steel_3")
        m.box(0.9, 0.05, 0.04, at=(0, 2.04, 0), sw="steel_3")
        for sx in (-1, 1):
            m.box(0.04, 1.93, 0.04, at=(sx * 0.43, 0.11, 0), sw="steel_3")
        for sz in (-1, 1):
            m.rod((0.34, 0.9, sz * 0.05), (0.34, 1.3, sz * 0.05), 0.014, sw="chrome_1")
        m.box(0.03, 0.03, 0.12, at=(0.34, 1.0, 0), sw="chrome_2")
        m.box(0.03, 0.03, 0.12, at=(0.34, 1.2, 0), sw="chrome_2")
    with m.part("door_glass", mat="glass", pivot=(-0.45, 0, 0)):
        m.box(0.82, 1.93, 0.014, at=(0, 0.11, 0), sw="glass_tint")
        m.box(0.82, 0.5, 0.018, at=(0, 0.95, 0), sw="n_01")


@model("env", budget="kit")
def partition_low_01(m):
    """Desk screen 1.4 m wide, 1.2 m high: fabric panel on steel feet with an accent cap."""
    for sx in (-1, 1):
        m.box(0.05, 0.03, 0.4, at=(sx * 0.6, 0, 0), sw="steel_3", bevel=0.008, edges="top")
        m.box(0.03, 0.12, 0.03, at=(sx * 0.6, 0.03, 0), sw="steel_3")
    m.box(1.4, 1.02, 0.05, at=(0, 0.14, 0), sw="uphol_grey_l", bevel=0.012, edges="vert")
    m.box(1.3, 0.5, 0.056, at=(0, 0.55, 0), sw="carpet_1")
    m.box(1.4, 0.04, 0.06, at=(0, 1.16, 0), sw="jade_600", bevel=0.01, edges="top")
    m.box(0.25, 0.18, 0.004, at=(-0.35, 0.72, -0.03), sw="paper_cream", rot=(0, 0, 4))   # pinned notes
    m.box(0.16, 0.16, 0.004, at=(0.05, 0.75, -0.03), sw="waiting_l", rot=(0, 0, -6))


if __name__ == "__main__":
    run(__file__)
