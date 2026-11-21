"""Seating (assets.md §8.1). Seat height 0.46 m. Fronts face -Z, so a sitter faces -Z:
every `seat` anchor has rotY = 180 deg (characters face +Z at rotY 0)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402
from lib.parts import cushion, star_base  # noqa: E402

SEAT = 0.46


def _office(m, seat_sw, back_sw, frame="plastic_black", arms=True, headrest=False, w=0.5):
    star_base(m, r=0.3)
    m.cyl(0.025, 0.24, at=(0, 0.1, 0), sw="steel_2", seg=6)
    m.box(0.3, 0.03, 0.3, at=(0, 0.33, 0), sw=frame)
    cushion(m, w, 0.1, 0.48, (0, SEAT - 0.1, 0), seat_sw, bevel=0.035)
    m.box(0.06, 0.34, 0.03, at=(0, 0.36, 0.25), sw=frame, rot=(-8, 0, 0))
    m.box(w - 0.04, 0.5, 0.07, at=(0, SEAT + 0.12, 0.27), sw=back_sw, bevel=0.03,
          taper=(0.86, 1.0), shear=(0, 0.06))
    if headrest:
        m.box(0.28, 0.14, 0.07, at=(0, SEAT + 0.66, 0.34), sw=back_sw, bevel=0.03)
        m.box(0.04, 0.08, 0.02, at=(0, SEAT + 0.6, 0.36), sw=frame)
    if arms:
        for sx in (-1, 1):
            x = sx * (w / 2 + 0.01)
            m.box(0.03, 0.2, 0.03, at=(x, SEAT - 0.05, 0.05), sw=frame)
            m.box(0.06, 0.03, 0.26, at=(x, SEAT + 0.15, 0.0), sw=frame, bevel=0.01, edges="top")
    m.anchor("seat", (0, SEAT, 0), 180)


@model("props", anchors=["seat"])
def chair_office_01(m):
    """Standard task chair, charcoal mesh back with a jade seat."""
    _office(m, "uphol_teal", "n_12")


@model("props", anchors=["seat"])
def chair_office_02(m):
    """Executive chair: high back, headrest, dark leather."""
    _office(m, "n_13", "n_13", frame="steel_3", headrest=True, w=0.56)
    m.box(0.3, 0.3, 0.012, at=(0, SEAT + 0.24, 0.262), sw="n_11", shear=(0, 0.035))


@model("props", anchors=["seat"])
def chair_visitor_01(m):
    """Four-legged guest chair, wood legs and fabric shell."""
    for sx in (-1, 1):
        m.rod((sx * 0.2, 0, -0.2), (sx * 0.19, SEAT - 0.06, -0.17), 0.018, sw="wood_oak_3", seg=4)
        m.rod((sx * 0.2, 0, 0.22), (sx * 0.19, SEAT + 0.36, 0.24), 0.018, sw="wood_oak_3", seg=4)
    cushion(m, 0.46, 0.07, 0.44, (0, SEAT - 0.07, 0.0), "uphol_grey_l", bevel=0.025)
    m.box(0.44, 0.26, 0.05, at=(0, SEAT + 0.12, 0.22), sw="uphol_grey_l", bevel=0.02, shear=(0, 0.03))
    m.anchor("seat", (0, SEAT, 0), 180)


@model("props", anchors=["seat"])
def bench_waiting_01(m):
    """Four-seat beam bench where people wait for a review."""
    n, pitch = 4, 0.56
    w = n * pitch
    m.box(w - 0.1, 0.05, 0.08, at=(0, 0.33, 0.02), sw="steel_3")
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.25)
        m.box(0.05, 0.33, 0.05, at=(x, 0, 0.02), sw="steel_3")
        m.box(0.07, 0.03, 0.5, at=(x, 0, 0.02), sw="steel_4", bevel=0.01, edges="top")
        m.box(0.04, 0.03, 0.44, at=(sx * (w / 2 - 0.02), SEAT + 0.16, 0.0), sw="steel_3")  # end arm
        m.box(0.04, 0.2, 0.04, at=(sx * (w / 2 - 0.02), SEAT - 0.04, 0.1), sw="steel_3")
    for i in range(n):
        x = -w / 2 + pitch * (i + 0.5)
        m.box(0.5, 0.05, 0.46, at=(x, SEAT - 0.05, 0), sw="waiting", bevel=0.02, edges="top+vert")
        m.box(0.5, 0.36, 0.045, at=(x, SEAT + 0.08, 0.23), sw="waiting", bevel=0.02, shear=(0, 0.07))
        m.box(0.05, 0.14, 0.03, at=(x, SEAT - 0.07, 0.2), sw="steel_3")
        m.anchor("seat", (x, SEAT, 0), 180)


def _sofa(m, seats, body, cush, feet="wood_walnut_3", pillow=None):
    sw_w = 0.62
    w = seats * sw_w + 0.36
    d = 0.86
    m.box(w, 0.22, d, at=(0, 0.1, 0), sw=body, bevel=0.03, edges="vert")
    m.box(w, 0.6, 0.2, at=(0, 0.1, d / 2 - 0.1), sw=body, bevel=0.05, edges="top+vert")
    for sx in (-1, 1):
        m.box(0.18, 0.46, d, at=(sx * (w / 2 - 0.09), 0.1, 0), sw=body, bevel=0.05, edges="top+vert")
        for sz in (-1, 1):
            m.box(0.06, 0.1, 0.06, at=(sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1)), sw=feet, taper=(1.4, 1.4))
    for i in range(seats):
        x = -(seats * sw_w) / 2 + sw_w * (i + 0.5)
        cushion(m, sw_w - 0.02, 0.15, 0.6, (x, 0.31, -0.1), cush, bevel=0.04)
        m.box(sw_w - 0.04, 0.34, 0.14, at=(x, 0.44, 0.2), sw=cush, bevel=0.045, shear=(0, 0.05))
        m.anchor("seat", (x, SEAT, -0.1), 180)
    if pillow:
        m.box(0.34, 0.34, 0.1, at=(-(seats * sw_w) / 2 + 0.2, 0.44, 0.06), sw=pillow, bevel=0.04,
              rot=(-14, 12, 8))


@model("props", anchors=["seat"])
def sofa_2seat_01(m):
    _sofa(m, 2, "uphol_teal", "uphol_teal_l", pillow="uphol_cream")


@model("props", anchors=["seat"])
def sofa_3seat_01(m):
    _sofa(m, 3, "uphol_grey", "uphol_grey_l", pillow="waiting")


@model("props", anchors=["seat"])
def armchair_01(m):
    """Round-shouldered lounge chair on splayed wooden legs."""
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.rod((sx * 0.3, 0, sz * 0.3), (sx * 0.24, 0.22, sz * 0.24), 0.022, sw="wood_oak_3", seg=4, r2=0.03)
    m.box(0.74, 0.14, 0.74, at=(0, 0.2, 0), sw="uphol_rust", bevel=0.04, edges="all")
    m.box(0.74, 0.5, 0.16, at=(0, 0.3, 0.29), sw="uphol_rust", bevel=0.06, edges="top+vert", shear=(0, 0.06))
    for sx in (-1, 1):
        m.box(0.14, 0.3, 0.6, at=(sx * 0.3, 0.3, -0.02), sw="uphol_rust", bevel=0.05, edges="top+vert")
    cushion(m, 0.46, 0.13, 0.52, (0, 0.33, -0.08), "uphol_cream", bevel=0.04)
    m.anchor("seat", (0, SEAT, -0.08), 180)


@model("props", anchors=["seat"])
def stool_cafe_01(m):
    """Bar stool for the cafe counter (seat 0.72 m), with a foot ring."""
    for i in range(4):
        sx, sz = (1, 1, -1, -1)[i], (1, -1, 1, -1)[i]
        m.rod((sx * 0.2, 0, sz * 0.2), (sx * 0.13, 0.68, sz * 0.13), 0.016, sw="steel_4", seg=4)
    m.lathe([(0.165, 0.28), (0.18, 0.28), (0.18, 0.3), (0.165, 0.3)], sw="steel_3", seg=8)
    m.cyl(0.18, 0.05, at=(0, 0.68, 0), sw="wood_oak_3", seg=10, bevel=0.012)
    m.cyl(0.16, 0.012, at=(0, 0.73, 0), sw="wood_oak_2", seg=10)
    m.anchor("seat", (0, 0.74, 0), 180)


@model("props", anchors=["seat"])
def chair_massage_01(m):
    """Reclined massage chair with wrap-around arms, leg rest and a control pad."""
    m.box(0.8, 0.2, 1.0, at=(0, 0, 0.05), sw="n_12", bevel=0.05, edges="top+vert")
    m.box(0.56, 0.16, 0.56, at=(0, 0.3, -0.05), sw="wood_ebony_2", bevel=0.05, edges="all")       # seat
    m.box(0.56, 0.86, 0.18, at=(0, 0.36, 0.2), sw="wood_ebony_2", bevel=0.06, rot=(24, 0, 0))      # back
    m.box(0.3, 0.2, 0.1, at=(0, 0.98, 0.4), sw="wood_ebony_1", bevel=0.04, rot=(24, 0, 0))         # head pillow
    m.box(0.5, 0.14, 0.46, at=(0, 0.2, -0.5), sw="wood_ebony_2", bevel=0.05, rot=(-32, 0, 0))      # leg rest
    for sx in (-1, 1):
        m.box(0.16, 0.42, 0.9, at=(sx * 0.37, 0.18, 0.02), sw="n_11", bevel=0.07, edges="top+vert")
        m.box(0.1, 0.02, 0.5, at=(sx * 0.37, 0.6, -0.08), sw="wood_ebony_1")
    m.box(0.09, 0.02, 0.14, at=(0.37, 0.62, -0.26), sw="plastic_white")                            # remote
    with m.part("led", mat="emissive"):
        m.box(0.05, 0.004, 0.03, at=(0.37, 0.64, -0.29), sw="led_green")
    m.anchor("seat", (0, SEAT, -0.05), 180)


if __name__ == "__main__":
    run(__file__)
