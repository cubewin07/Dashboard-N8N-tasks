"""Building kit (phase-06a §3.5). Modules are 4 m wide and tile without gaps.
Floor finish is at y = 0; clear height 3.7 m; slab 0.3 m below the floor."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402

W, H, T = 4.0, 3.7, 0.15


@model("env", budget="kit")
def slab_floor_01(m):
    """4 x 4 m floor tile: concrete slab, finish layer with joint lines, ceiling beams below."""
    m.box(W, 0.26, W, at=(0, -0.3, 0), sw="concrete_2")
    m.box(W, 0.04, W, at=(0, -0.04, 0), sw="n_02")
    for i in (-1, 1):
        m.box(W, 0.002, 0.02, at=(0, 0.0, i * 1.0), sw="n_04")
        m.box(0.02, 0.002, W, at=(i * 1.0, 0.0, 0), sw="n_04")
    m.box(W, 0.002, 0.02, at=(0, 0, 0), sw="n_04")
    m.box(0.02, 0.002, W, at=(0, 0, 0), sw="n_04")
    for i in (-1, 1):
        m.box(0.2, 0.08, W, at=(i * 1.0, -0.38, 0), sw="concrete_3")       # ceiling ribs of the floor below


def _skirting(m, y0=0.0):
    for sz in (-1, 1):
        m.box(W, 0.1, 0.015, at=(0, y0, sz * (T / 2 + 0.0075)), sw="n_05")


@model("env", budget="kit")
def wall_solid_01(m):
    m.box(W, H, T, at=(0, 0, 0), sw="plaster_1")
    _skirting(m)
    for sz in (-1, 1):
        m.box(W, 0.06, 0.012, at=(0, H - 0.06, sz * (T / 2 + 0.006)), sw="n_03")     # cornice
        m.box(W, 0.02, 0.008, at=(0, 1.0, sz * (T / 2 + 0.004)), sw="plaster_2")     # dado line


@model("env", budget="kit")
def wall_window_01(m):
    """Wall with a 2.8 x 1.9 m window: sill, piers, lintel, frame, mullions and glass."""
    sill, top, half = 0.9, 2.8, 1.4
    m.box(W, sill, T, at=(0, 0, 0), sw="plaster_1")
    m.box(W, H - top, T, at=(0, top, 0), sw="plaster_1")
    for sx in (-1, 1):
        m.box(W / 2 - half, top - sill, T, at=(sx * (half + (W / 2 - half) / 2), sill, 0), sw="plaster_1")
    _skirting(m)
    m.box(2 * half + 0.12, 0.05, T + 0.1, at=(0, sill - 0.05, 0), sw="n_03", bevel=0.01, edges="top")  # sill board
    fr = "steel_4"
    m.box(2 * half, 0.06, 0.08, at=(0, sill, 0), sw=fr)
    m.box(2 * half, 0.06, 0.08, at=(0, top - 0.06, 0), sw=fr)
    for x in (-half + 0.03, 0, half - 0.03):
        m.box(0.06, top - sill - 0.12, 0.08, at=(x, sill + 0.06, 0), sw=fr)
    with m.glass():
        m.box(2 * half - 0.06, top - sill - 0.12, 0.02, at=(0, sill + 0.06, 0), sw="glass_tint")


@model("env", budget="kit")
def wall_glass_01(m):
    """Full-height curtain wall: floor and head channels, four panes, a frosted privacy band."""
    fr = "steel_4"
    m.box(W, 0.12, 0.1, at=(0, 0, 0), sw=fr)
    m.box(W, 0.12, 0.1, at=(0, H - 0.12, 0), sw=fr)
    for i in range(5):
        x = -W / 2 + i * 1.0
        m.box(0.06, H - 0.24, 0.08, at=(min(max(x, -W / 2 + 0.03), W / 2 - 0.03), 0.12, 0), sw=fr)
    m.box(W, 0.04, 0.06, at=(0, 2.4, 0), sw=fr)
    with m.glass():
        m.box(W - 0.06, H - 0.24, 0.02, at=(0, 0.12, 0), sw="glass_tint")
        m.box(W - 0.06, 0.5, 0.026, at=(0, 0.95, 0), sw="n_01")


@model("env", budget="kit")
def column_01(m):
    m.box(0.5, 0.12, 0.5, at=(0, 0, 0), sw="concrete_3", bevel=0.02, edges="top")
    m.box(0.4, H - 0.3, 0.4, at=(0, 0.12, 0), sw="concrete_1", bevel=0.03, edges="vert")
    m.box(0.52, 0.18, 0.52, at=(0, H - 0.18, 0), sw="concrete_2", taper=(1.0, 1.0), bevel=0.02, edges="bottom")
    m.box(0.41, 0.06, 0.41, at=(0, 1.1, 0), sw="jade_600", bevel=0.03, edges="vert")   # wayfinding band


@model("env", budget="kit", nodes=["accent"])
def ceiling_edge_01(m):
    """Fascia covering the cut slab edge on the open front; `accent` is the department stripe."""
    m.box(W, 0.34, 0.08, at=(0, -0.32, -0.04), sw="n_03")
    m.box(W, 0.03, 0.12, at=(0, -0.01, -0.04), sw="n_05", bevel=0.008, edges="top")
    m.box(W, 0.03, 0.1, at=(0, -0.34, -0.04), sw="n_06")
    with m.part("accent"):
        m.box(W, 0.1, 0.012, at=(0, -0.22, -0.086), sw="jade_600")


def _facade_base(m):
    """4 x 4 m exterior skin (outside faces -Z), spanning slab + storey."""
    m.box(W, 0.3, 0.12, at=(0, -0.3, -0.06), sw="concrete_3")                 # spandrel at the slab
    m.box(W, 0.05, 0.16, at=(0, -0.02, -0.08), sw="concrete_4")              # drip ledge


@model("env", budget="kit")
def facade_panel_01(m):
    """Facade bay with a ribbon window, sunshade fin and spandrel."""
    _facade_base(m)
    m.box(W, 1.0, 0.12, at=(0, 0, -0.06), sw="plaster_2")
    m.box(W, 0.8, 0.12, at=(0, 2.9, -0.06), sw="plaster_2")
    for x in (-2 + 0.1, 2 - 0.1):
        m.box(0.2, 1.9, 0.12, at=(x, 1.0, -0.06), sw="plaster_2")
    for x in (-0.9, 0, 0.9):
        m.box(0.06, 1.9, 0.1, at=(x, 1.0, -0.06), sw="steel_4")
    m.box(3.6, 0.06, 0.1, at=(0, 1.0, -0.06), sw="steel_4")
    m.box(3.6, 0.06, 0.1, at=(0, 2.84, -0.06), sw="steel_4")
    m.box(3.7, 0.05, 0.35, at=(0, 2.9, -0.28), sw="jade_700")                 # sunshade
    with m.glass():
        m.box(3.6, 1.9, 0.02, at=(0, 1.0, -0.06), sw="glass_tint")


@model("env", budget="kit")
def facade_panel_02(m):
    """Solid facade bay with vertical timber fins (stair/core walls)."""
    _facade_base(m)
    m.box(W, H, 0.12, at=(0, 0, -0.06), sw="plaster_3")
    for i in range(8):
        x = -1.75 + i * 0.5
        m.box(0.08, 3.3, 0.1, at=(x, 0.2, -0.17), sw="wood_oak_3")
    m.box(W, 0.08, 0.14, at=(0, 3.56, -0.19), sw="concrete_4")


@model("env", budget="kit")
def roof_parapet_01(m):
    m.box(W, 1.0, 0.2, at=(0, 0, 0), sw="plaster_2")
    m.box(W, 0.06, 0.3, at=(0, 1.0, 0), sw="concrete_4", bevel=0.015, edges="top")
    m.box(W, 0.12, 0.02, at=(0, 0, -0.11), sw="concrete_3")
    m.box(W, 0.05, 0.012, at=(0, 0.72, -0.106), sw="gold")


@model("env", budget="kit")
def terrace_rail_01(m):
    """Glass balustrade, 1.1 m, steel posts and a timber handrail."""
    m.box(W, 0.08, 0.1, at=(0, 0, 0), sw="steel_4")
    for i in range(5):
        x = min(max(-2 + i * 1.0, -1.97), 1.97)
        m.box(0.05, 1.02, 0.05, at=(x, 0.08, 0), sw="steel_3")
    m.box(W, 0.05, 0.09, at=(0, 1.08, 0), sw="wood_walnut_2", bevel=0.012, edges="top")
    with m.glass():
        m.box(W - 0.1, 0.9, 0.016, at=(0, 0.12, 0), sw="glass_tint")


if __name__ == "__main__":
    run(__file__)
