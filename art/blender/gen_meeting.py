"""Meeting room (assets.md §8.1)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402


@model("props", anchors=["seat"])
def table_meeting_01(m):
    """2.4 x 1.2 m conference table for six: rounded top, cable hatch, panel legs. Chairs go on the seat anchors."""
    w, d, top = 2.4, 1.2, 0.74
    m.box(w, 0.045, d, at=(0, top - 0.045, 0), sw="wood_oak_2", bevel=0.1, edges="vert")
    m.box(w - 0.08, 0.02, d - 0.08, at=(0, top - 0.065, 0), sw="wood_oak_4", bevel=0.09, edges="vert")
    for sx in (-1, 1):
        m.box(0.08, top - 0.065, 0.7, at=(sx * 0.8, 0, 0), sw="n_12", bevel=0.01, edges="vert")
        m.box(0.14, 0.03, 0.9, at=(sx * 0.8, 0, 0), sw="n_12", bevel=0.01, edges="top")
    m.box(1.6, 0.14, 0.04, at=(0, 0.52, 0), sw="n_11")
    m.box(0.5, 0.006, 0.14, at=(0, top, 0), sw="n_12")                          # cable hatch
    m.cyl(0.07, 0.03, at=(0.0, top + 0.006, 0), sw="plastic_dark", seg=8)       # conference speaker
    m.cyl(0.05, 0.012, at=(0.0, top + 0.036, 0), sw="jade_500", seg=8)
    m.box(0.21, 0.004, 0.297, at=(-0.75, top, -0.32), sw="paper_white", rot=(0, 8, 0))
    m.box(0.21, 0.004, 0.297, at=(0.7, top, 0.3), sw="paper_white", rot=(0, -12, 0))
    m.box(0.3, 0.014, 0.21, at=(0.05, top, -0.36), sw="steel_2", rot=(0, 4, 0))  # closed laptop
    for x in (-0.75, 0.0, 0.75):
        m.anchor("seat", (x, 0.46, -(d / 2 + 0.28)), 0)
    for x in (-0.75, 0.0, 0.75):
        m.anchor("seat", (x, 0.46, d / 2 + 0.28), 180)


@model("props", anchors=["stand"])
def whiteboard_01(m):
    """Mobile whiteboard 1.8 x 1.2 m with a pen tray and a few sketched charts."""
    for sx in (-1, 1):
        x = sx * 0.85
        m.box(0.05, 0.04, 0.6, at=(x, 0.07, 0), sw="steel_3")
        m.box(0.04, 1.75, 0.04, at=(x, 0.1, 0), sw="steel_3")
        for sz in (-1, 1):
            m.cyl(0.035, 0.07, at=(x, 0, sz * 0.26), sw="n_13", seg=6)
    m.box(1.86, 1.26, 0.03, at=(0, 0.72, 0), sw="steel_2", bevel=0.01)
    m.box(1.78, 1.18, 0.006, at=(0, 0.76, -0.017), sw="white")
    m.box(1.2, 0.02, 0.07, at=(0, 0.7, -0.05), sw="steel_3")
    for i, sw in enumerate(("blocked", "working", "done", "n_13")):
        m.box(0.1, 0.018, 0.018, at=(-0.3 + i * 0.14, 0.72, -0.05), sw=sw)
    z = -0.021
    for i, (hh, sw) in enumerate(((0.2, "working"), (0.34, "done"), (0.27, "waiting"), (0.42, "jade_600"))):
        m.box(0.09, hh, 0.003, at=(-0.7 + i * 0.13, 1.0, z), sw=sw)
    m.box(0.56, 0.012, 0.003, at=(-0.5, 0.985, z), sw="n_12")
    for i in range(4):
        m.box(0.5 - 0.08 * (i % 2), 0.02, 0.003, at=(0.4 - 0.04 * (i % 2), 1.62 - i * 0.1, z), sw="n_10")
    m.box(0.2, 0.2, 0.003, at=(0.45, 0.95, z), sw="waiting_l", rot=(0, 0, 5))
    m.box(0.2, 0.2, 0.003, at=(0.68, 1.0, z), sw="done_l", rot=(0, 0, -4))
    m.anchor("stand", (-0.4, 0, -0.7), 0)


if __name__ == "__main__":
    run(__file__)
