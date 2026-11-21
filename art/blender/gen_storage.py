"""Storage (assets.md §8.1). Fronts face -Z; backs stand against a wall at +Z."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402

BOOKS = ["c_navy", "jade_600", "c_red", "paper_cream", "c_mustard", "n_10", "c_denim", "uphol_rust"]


def books(m, x0, x1, y, z, seed=0, h=0.24, depth=0.2):
    """A deterministic run of book spines between x0 and x1 on a shelf at height y."""
    x, i = x0, seed
    while x < x1 - 0.03:
        w = 0.03 + 0.012 * ((i * 7) % 3)
        hh = h - 0.03 * ((i * 5) % 3)
        if (i * 3 + seed) % 7 != 0:
            m.box(w, hh, depth, at=(x + w / 2, y, z), sw=BOOKS[(i + seed) % len(BOOKS)])
        x += w + 0.004
        i += 1


def binders(m, x0, n, y, z, sw="n_02"):
    for i in range(n):
        x = x0 + i * 0.075
        m.box(0.065, 0.3, 0.26, at=(x, y, z), sw=sw if i % 3 else "dept_cs")
        m.box(0.035, 0.08, 0.004, at=(x, y + 0.17, z - 0.132), sw="paper_white")


@model("props")
def shelf_open_01(m):
    """Open oak bookcase 0.9 x 1.8 m with binders, books, a storage box and a plant."""
    w, h, d = 0.9, 1.8, 0.34
    for sx in (-1, 1):
        m.box(0.03, h, d, at=(sx * (w / 2 - 0.015), 0, 0), sw="wood_oak_3")
    m.box(w - 0.06, h - 0.06, 0.012, at=(0, 0.06, d / 2 - 0.006), sw="wood_oak_4")
    ys = [0.06, 0.48, 0.9, 1.32, h - 0.03]
    for y in ys:
        m.box(w - 0.06, 0.03, d, at=(0, y, 0), sw="wood_oak_2")
    m.box(w, 0.06, d - 0.02, at=(0, 0, 0.01), sw="wood_oak_4")
    binders(m, -0.36, 6, 0.09, -0.02)
    books(m, -0.4, 0.15, 0.51, -0.03, seed=2)
    m.box(0.22, 0.2, 0.26, at=(0.28, 0.51, -0.02), sw="cardboard")
    m.box(0.24, 0.03, 0.28, at=(0.28, 0.71, -0.02), sw="cardboard")
    books(m, -0.1, 0.4, 0.93, -0.03, seed=5)
    m.box(0.14, 0.12, 0.14, at=(-0.27, 0.93, -0.03), sw="terracotta", taper=(1.2, 1.2))
    m.sphere(0.1, at=(-0.27, 1.14, -0.03), sw="plant_2", scale=(1, 0.9, 1))
    binders(m, -0.05, 5, 1.35, -0.02, sw="n_04")
    m.box(0.26, 0.16, 0.2, at=(-0.26, 1.35, -0.03), sw="jade_300")


def _cabinet(m, w, h, d, n, body, front, y0=0.03):
    m.box(w - 0.02, 0.03, d - 0.04, at=(0, 0, 0.0), sw="n_12")
    m.box(w, h - y0, d, at=(0, y0, 0), sw=body, bevel=0.008, edges="top+vert")
    dh = (h - y0 - 0.04) / n
    for i in range(n):
        y = y0 + 0.02 + i * dh
        m.box(w - 0.05, dh - 0.02, 0.014, at=(0, y, -d / 2 - 0.005), sw=front)
        m.box(w * 0.35, 0.02, 0.018, at=(0, y + dh * 0.62, -d / 2 - 0.02), sw="steel_3")
        m.box(0.1, 0.05, 0.004, at=(0, y + dh * 0.34, -d / 2 - 0.013), sw="paper_white")


@model("props")
def cabinet_file_01(m):
    """Four-drawer steel filing cabinet."""
    _cabinet(m, 0.47, 1.32, 0.62, 4, "steel_2", "steel_1")


@model("props")
def cabinet_file_02(m):
    """Low two-drawer lateral cabinet in white with an oak top, a tray of files on it."""
    _cabinet(m, 0.9, 0.7, 0.48, 2, "n_03", "n_01")
    m.box(0.92, 0.03, 0.5, at=(0, 0.7, 0), sw="wood_oak_2", bevel=0.008, edges="top")
    m.box(0.3, 0.05, 0.24, at=(-0.22, 0.73, 0), sw="steel_3")
    m.box(0.26, 0.03, 0.2, at=(-0.22, 0.75, 0), sw="paper_white")
    m.box(0.06, 0.26, 0.2, at=(0.2, 0.73, 0.02), sw="dept_marketing")
    m.box(0.06, 0.24, 0.2, at=(0.27, 0.73, 0.02), sw="dept_accounting")
    m.box(0.06, 0.26, 0.2, at=(0.34, 0.73, 0.02), sw="dept_design", rot=(0, 0, -10))


@model("props")
def locker_01(m):
    """Bank of three staff lockers with vents, name cards and handles."""
    w, h, d = 0.96, 1.8, 0.48
    m.box(w - 0.04, 0.08, d - 0.06, at=(0, 0, 0), sw="n_12")
    m.box(w, h - 0.08, d, at=(0, 0.08, 0), sw="steel_3", bevel=0.008, edges="top+vert")
    cols = ("jade_500", "waiting", "working")
    for i in range(3):
        x = -0.31 + i * 0.31
        m.box(0.29, h - 0.14, 0.014, at=(x, 0.11, -d / 2 - 0.005), sw=cols[i])
        for k in range(3):
            m.box(0.16, 0.012, 0.004, at=(x, 1.62 + k * 0.035, -d / 2 - 0.013), sw="n_12")
        m.box(0.1, 0.05, 0.004, at=(x, 1.45, -d / 2 - 0.013), sw="paper_white")
        m.box(0.02, 0.1, 0.02, at=(x + 0.1, 1.0, -d / 2 - 0.02), sw="chrome_1")


if __name__ == "__main__":
    run(__file__)
