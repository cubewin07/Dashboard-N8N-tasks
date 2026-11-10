"""Games corner (assets.md §8.1)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402


def _paddle(m, x, y, z, sw, rot_y=0):
    m.cyl(0.075, 0.012, at=(x, y, z), sw=sw, seg=8)
    c, s = math.cos(math.radians(rot_y)), math.sin(math.radians(rot_y))
    m.rod((x + 0.07 * c, y + 0.006, z + 0.07 * s), (x + 0.16 * c, y + 0.006, z + 0.16 * s), 0.012, sw="wood_pine_3", seg=4)


@model("props", anchors=["stand"])
def table_pingpong_01(m):
    """Full-size table (2.74 x 1.525 m) with net, lines, two paddles and a ball."""
    w, d, top = 2.74, 1.525, 0.76
    m.box(w, 0.03, d, at=(0, top - 0.03, 0), sw="jade_700", bevel=0.006, edges="top")
    m.box(w, 0.002, 0.02, at=(0, top, 0), sw="white")
    for sz in (-1, 1):
        m.box(w, 0.002, 0.02, at=(0, top, sz * (d / 2 - 0.01)), sw="white")
    for sx in (-1, 1):
        m.box(0.02, 0.002, d, at=(sx * (w / 2 - 0.01), top, 0), sw="white")
        m.box(0.04, 0.03, d - 0.3, at=(sx * 0.9, top - 0.07, 0), sw="steel_4")
        for sz in (-1, 1):
            m.box(0.04, top - 0.07, 0.04, at=(sx * 0.9, 0, sz * (d / 2 - 0.2)), sw="steel_4")
            m.cyl(0.035, 0.05, at=(sx * 0.9, 0, sz * (d / 2 - 0.2)), sw="n_13", seg=6)
        m.box(0.04, 0.03, d - 0.36, at=(sx * 0.9, 0.2, 0), sw="steel_3")
    m.box(1.8, 0.03, 0.04, at=(0, top - 0.07, 0), sw="steel_4")
    m.box(0.012, 0.1525, d + 0.2, at=(0, top + 0.02, 0), sw="n_02")                # net
    m.box(0.02, 0.012, d + 0.24, at=(0, top + 0.1725, 0), sw="white")
    for sz in (-1, 1):
        m.box(0.03, 0.2, 0.03, at=(0, top - 0.03, sz * (d / 2 + 0.11)), sw="n_12")
    _paddle(m, -0.9, top, -0.3, "blocked", rot_y=200)
    _paddle(m, 0.95, top, 0.35, "n_13", rot_y=30)
    m.sphere(0.02, at=(-0.6, top + 0.02, 0.1), sw="waiting")
    m.anchor("stand", (-(w / 2 + 0.6), 0, 0), 90)
    m.anchor("stand", (w / 2 + 0.6, 0, 0), -90)


@model("props", anchors=["stand"], nodes=["screen", "lamp"])
def arcade_cabinet_01(m):
    """Upright arcade cabinet: lit marquee, tilted screen, joystick and buttons, coin door, side stripes."""
    w = 0.7
    side = [(-0.4, 0), (0.4, 0), (0.4, 1.75), (0.0, 1.75), (-0.12, 1.5), (-0.05, 1.1), (-0.4, 0.95)]
    for sx in (-1, 1):
        m.prism(side, 0.03, at=(sx * (w / 2 - 0.015), 0, 0), sw="c_purple", plane="zy")
        m.box(0.005, 0.5, 0.1, at=(sx * (w / 2 + 0.002), 0.3, 0.05), sw="waiting", rot=(20, 0, 0))
        m.box(0.005, 0.5, 0.06, at=(sx * (w / 2 + 0.002), 0.3, 0.2), sw="c_pink", rot=(20, 0, 0))
    m.box(w - 0.06, 1.74, 0.4, at=(0, 0, 0.2), sw="n_12")
    m.box(w - 0.06, 0.94, 0.36, at=(0, 0, -0.2), sw="n_11")
    m.box(w - 0.06, 0.05, 0.4, at=(0, 0.95, -0.2), sw="n_10", rot=(0, 0, 0))        # control deck
    m.rod((-0.15, 1.0, -0.22), (-0.15, 1.08, -0.22), 0.01, sw="steel_2", seg=4)
    m.sphere(0.028, at=(-0.15, 1.1, -0.22), sw="blocked")
    for i, sw in enumerate(("waiting", "working", "done")):
        m.cyl(0.025, 0.012, at=(0.03 + i * 0.09, 1.0, -0.2 - 0.03 * (i % 2)), sw=sw, seg=6)
    m.box(w - 0.1, 0.5, 0.04, at=(0, 1.05, 0.02), sw="plastic_black", rot=(-12, 0, 0))   # bezel
    with m.part("screen", mat="emissive"):
        m.box(w - 0.2, 0.4, 0.006, at=(0, 1.1, -0.014), sw="screen_on", rot=(-12, 0, 0))
    with m.part("lamp", mat="emissive"):
        m.box(w - 0.08, 0.2, 0.01, at=(0, 1.53, -0.09), sw="lamp_warm", rot=(25, 0, 0))
    m.box(0.3, 0.06, 0.012, at=(0, 1.6, -0.075), sw="blocked", rot=(25, 0, 0))
    m.box(0.26, 0.3, 0.012, at=(0, 0.35, -0.385), sw="steel_4")                     # coin door
    for sx in (-1, 1):
        m.box(0.03, 0.06, 0.006, at=(sx * 0.06, 0.52, -0.394), sw="led_amber")
    m.anchor("stand", (0, 0, -0.85), 0)


@model("props", anchors=["seat"])
def table_boardgame_01(m):
    """Square game table with a checkered board, pieces, cards, dice and four cube stools."""
    top = 0.72
    m.box(1.0, 0.04, 1.0, at=(0, top - 0.04, 0), sw="wood_pine_3", bevel=0.012, edges="top+vert")
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.rod((sx * 0.42, 0, sz * 0.42), (sx * 0.38, top - 0.04, sz * 0.38), 0.025, sw="wood_pine_4", seg=4)
    m.box(0.52, 0.012, 0.52, at=(0, top, 0), sw="wood_walnut_3")
    for i in range(4):
        for j in range(4):
            if (i + j) % 2 == 0:
                m.box(0.12, 0.004, 0.12, at=(-0.18 + i * 0.12, top + 0.012, -0.18 + j * 0.12), sw="paper_cream")
    for i, (x, z, sw) in enumerate(((-0.18, -0.18, "blocked"), (0.06, -0.06, "blocked"), (0.18, 0.18, "working"),
                                    (-0.06, 0.06, "working"), (0.18, -0.18, "done"))):
        m.cyl(0.025, 0.05, at=(x, top + 0.016, z), sw=sw, seg=6, r2=0.012)
    m.box(0.09, 0.02, 0.13, at=(0.36, top, 0.3), sw="paper_white", rot=(0, 15, 0))  # card deck
    m.box(0.03, 0.03, 0.03, at=(-0.36, top, -0.3), sw="white", rot=(0, 20, 0))
    m.box(0.03, 0.03, 0.03, at=(-0.31, top, -0.36), sw="blocked", rot=(0, -10, 0))
    cols = ("jade_500", "waiting", "c_pink", "working")
    for i in range(4):
        a = math.pi / 2 * i
        x, z = 0.8 * math.sin(a), -0.8 * math.cos(a)
        m.box(0.38, 0.46, 0.38, at=(x, 0, z), sw=cols[i], bevel=0.05, edges="all")
        m.anchor("seat", (x, 0.46, z), math.degrees(a))


@model("props", budget="large", anchors=["stand", "seat"], nodes=["screen", "lamp"])
def set_karaoke_01(m):
    """Karaoke corner: TV console with lyrics screen, two tower speakers, mic stand, disco light, love seat, table."""
    # console + TV at the back (+Z), everything faces the sofa at -Z
    m.box(1.5, 0.45, 0.4, at=(0, 0, 1.1), sw="wood_walnut_3", bevel=0.012, edges="top+vert")
    m.box(0.6, 0.12, 0.02, at=(-0.4, 0.2, 0.895), sw="n_12")                        # karaoke deck
    m.box(0.6, 0.12, 0.02, at=(0.4, 0.2, 0.895), sw="wood_walnut_4")
    with m.part("lamp", mat="emissive"):
        for i in range(4):
            m.box(0.03, 0.03, 0.004, at=(-0.58 + i * 0.07, 0.245, 0.883), sw=("led_green", "led_amber", "led_red", "led_green")[i])
    m.box(0.3, 0.03, 0.2, at=(0, 0.45, 1.1), sw="plastic_black")
    m.box(0.06, 0.12, 0.04, at=(0, 0.48, 1.12), sw="plastic_black")
    m.box(1.3, 0.76, 0.04, at=(0, 0.58, 1.1), sw="plastic_black", bevel=0.008)
    with m.part("screen", mat="emissive"):
        m.box(1.26, 0.72, 0.004, at=(0, 0.6, 1.078), sw="screen_on")
        m.box(0.9, 0.05, 0.002, at=(0, 0.7, 1.074), sw="white")                     # lyric lines
        m.box(0.5, 0.05, 0.002, at=(-0.2, 0.78, 1.074), sw="waiting")
    for sx in (-1, 1):                                                             # speakers
        x = sx * 1.1
        m.box(0.34, 1.1, 0.34, at=(x, 0, 1.08), sw="n_12", bevel=0.015, edges="top+vert")
        m.cyl(0.11, 0.02, at=(x, 0.35, 0.9), sw="n_10", seg=8, axis="z", center=True)
        m.cyl(0.11, 0.02, at=(x, 0.65, 0.9), sw="n_10", seg=8, axis="z", center=True)
        m.cyl(0.05, 0.02, at=(x, 0.92, 0.9), sw="steel_3", seg=8, axis="z", center=True)
    # mic stand
    m.cyl(0.16, 0.02, at=(0.55, 0, 0.25), sw="n_13", seg=8)
    m.rod((0.55, 0.02, 0.25), (0.55, 1.3, 0.25), 0.012, sw="steel_3", seg=4)
    m.rod((0.55, 1.3, 0.25), (0.55, 1.42, 0.17), 0.016, sw="n_12", seg=6)
    m.sphere(0.032, at=(0.55, 1.44, 0.155), sw="steel_2")
    # love seat facing the TV + snack table
    for sx in (-1, 1):
        m.box(0.14, 0.5, 0.75, at=(sx * 0.68, 0.08, -0.95), sw="c_rose", bevel=0.04, edges="top+vert")
    m.box(1.5, 0.22, 0.75, at=(0, 0.08, -0.95), sw="c_rose", bevel=0.02, edges="vert")
    m.box(1.5, 0.62, 0.18, at=(0, 0.08, -1.24), sw="c_rose", bevel=0.05, edges="top+vert")
    for sx in (-1, 1):
        m.box(0.58, 0.14, 0.55, at=(sx * 0.3, 0.3, -0.88), sw="c_pink", bevel=0.04)
        m.anchor("seat", (sx * 0.3, 0.46, -0.88), 0)
    m.box(1.4, 0.08, 0.7, at=(0, 0, -0.95), sw="n_12")
    m.cyl(0.3, 0.03, at=(-0.2, 0.38, -0.2), sw="wood_walnut_2", seg=10, bevel=0.008)
    m.cyl(0.03, 0.36, at=(-0.2, 0.02, -0.2), sw="steel_4", seg=6)
    m.cyl(0.18, 0.02, at=(-0.2, 0, -0.2), sw="steel_4", seg=8)
    m.cyl(0.1, 0.04, at=(-0.26, 0.41, -0.22), sw="n_01", seg=8, r2=0.13)            # snack bowl
    m.rod((-0.08, 0.42, -0.12), (-0.02, 0.42, -0.28), 0.018, sw="n_12", seg=6)       # spare mic
    # disco light on a pole
    m.rod((-1.1, 1.1, 1.08), (-1.1, 1.5, 1.08), 0.012, sw="steel_3", seg=4)
    m.sphere(0.12, at=(-1.1, 1.6, 1.08), sw="chrome_1", sub=2)
    m.anchor("stand", (0.45, 0, 0.1), 180)


if __name__ == "__main__":
    run(__file__)
