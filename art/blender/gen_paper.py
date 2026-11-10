"""Paper (assets.md §8.1). `paper_sheet_01` is instanced thousands of times: 2 triangles."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402

A4W, A4H = 0.21, 0.297


@model("props", budget="small")
def paper_sheet_01(m):
    """One A4 sheet lying flat: a single quad facing up."""
    m.quad([(-A4W / 2, 0.001, A4H / 2), (A4W / 2, 0.001, A4H / 2), (A4W / 2, 0.001, -A4H / 2), (-A4W / 2, 0.001, -A4H / 2)],
           sw="paper_white")


@model("props", budget="small")
def paper_stack_01(m):
    """Instancing unit for document piles: a 2 cm block of sheets, slightly fanned."""
    m.box(A4W, 0.012, A4H, at=(0, 0, 0), sw="paper_white")
    m.box(A4W, 0.006, A4H, at=(0.004, 0.012, -0.003), sw="paper_cream", rot=(0, 3, 0))
    m.box(A4W, 0.002, A4H, at=(-0.003, 0.018, 0.002), sw="paper_white", rot=(0, -2, 0))


@model("props", budget="small")
def folder_01(m):
    """Manila folder with a tab, papers peeking out and a coloured label."""
    m.box(0.24, 0.004, 0.32, at=(0, 0, 0), sw="cardboard")
    m.box(0.21, 0.006, 0.29, at=(0.008, 0.004, 0.0), sw="paper_white", rot=(0, 2, 0))
    m.box(0.24, 0.004, 0.32, at=(0, 0.01, 0), sw="wood_pine_3", rot=(0, 0, 1.5))
    m.box(0.08, 0.004, 0.025, at=(0.06, 0.01, 0.17), sw="wood_pine_3")
    m.box(0.09, 0.002, 0.03, at=(-0.05, 0.015, -0.1), sw="dept_cs")


@model("props")
def tray_inout_01(m):
    """Two-tier in/out letter tray with coloured tabs."""
    for i, tab in enumerate(("waiting", "done")):
        y = i * 0.075
        m.box(0.27, 0.006, 0.34, at=(0, y, 0), sw="steel_3")
        for sx in (-1, 1):
            m.box(0.006, 0.04, 0.34, at=(sx * 0.132, y, 0), sw="steel_3")
        m.box(0.27, 0.04, 0.006, at=(0, y, 0.167), sw="steel_3")
        m.box(0.1, 0.018, 0.005, at=(0, y + 0.01, -0.172), sw=tab)
        m.box(A4W, 0.01, A4H, at=(0, y + 0.006, 0), sw="paper_white")
    for sx in (-1, 1):
        m.box(0.008, 0.075, 0.008, at=(sx * 0.13, 0.04, 0.16), sw="steel_4")
        m.box(0.008, 0.075, 0.008, at=(sx * 0.13, 0.04, -0.1), sw="steel_4")


if __name__ == "__main__":
    run(__file__)
