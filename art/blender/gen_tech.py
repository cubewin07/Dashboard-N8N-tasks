"""Desk tech (assets.md §8.1). Pivot = base centre (they stand on a desk top); screens face -Z."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402
from lib.parts import keyboard, monitor  # noqa: E402


@model("props", nodes=["screen"])
def monitor_01(m):
    monitor(m, 0, 0, 0, w=0.54)


@model("props", nodes=["screen"])
def monitor_02(m):
    """Ultrawide on a monitor arm clamp."""
    m.box(0.09, 0.02, 0.1, at=(0, 0, 0.05), sw="steel_3")
    m.rod((0, 0.02, 0.05), (0, 0.3, 0.05), 0.015, sw="steel_3")
    m.rod((0, 0.28, 0.05), (0, 0.3, 0.0), 0.012, sw="steel_3")
    m.box(0.78, 0.34, 0.028, at=(0, 0.13, 0), sw="plastic_black", bevel=0.006)
    with m.part("screen", mat="emissive"):
        m.box(0.75, 0.31, 0.004, at=(0, 0.145, -0.015), sw="screen_on")


@model("props", nodes=["screen"])
def laptop_open_01(m):
    m.box(0.33, 0.016, 0.23, at=(0, 0, 0), sw="steel_2", bevel=0.005, edges="top+vert")
    m.box(0.29, 0.002, 0.12, at=(0, 0.016, 0.03), sw="plastic_dark")
    m.box(0.1, 0.002, 0.06, at=(0, 0.016, -0.07), sw="steel_3")
    m.box(0.33, 0.22, 0.01, at=(0, 0.014, 0.115), sw="steel_2", bevel=0.004, rot=(18, 0, 0))
    with m.part("screen", mat="emissive"):
        m.box(0.3, 0.19, 0.003, at=(0, 0.028, 0.113), sw="screen_on", rot=(18, 0, 0))


@model("props", budget="small")
def keyboard_01(m):
    keyboard(m, 0, 0, 0, mouse=False)
    m.box(0.33, 0.002, 0.012, at=(0, 0.018, -0.05), sw="n_09")


@model("props", nodes=["lamp"])
def desk_lamp_01(m):
    """Two-arm task lamp; the emissive disc under the shade is the `lamp` node."""
    m.cyl(0.08, 0.02, at=(0, 0, 0), sw="plastic_dark", seg=8, bevel=0.006)
    m.rod((0, 0.02, 0), (0.0, 0.26, 0.1), 0.01, sw="steel_3", seg=4)
    m.rod((0.0, 0.26, 0.1), (0.0, 0.4, -0.08), 0.01, sw="steel_3", seg=4)
    m.sphere(0.018, at=(0, 0.26, 0.1), sw="jade_600")
    m.cyl(0.035, 0.09, at=(0, 0.35, -0.12), sw="jade_600", seg=8, r2=0.085, rot=(180, 0, 0), center=True)
    with m.part("lamp", mat="emissive"):
        m.cyl(0.075, 0.006, at=(0, 0.302, -0.12), sw="lamp_warm", seg=8)


@model("props", anchors=["stand"], nodes=["led"])
def printer_01(m):
    """Floor-standing office copier with paper trays, a scanner lid and an output tray."""
    m.box(0.6, 0.62, 0.56, at=(0, 0.04, 0), sw="plastic_white", bevel=0.015, edges="vert")
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.cyl(0.03, 0.04, at=(sx * 0.24, 0, sz * 0.22), sw="n_13", seg=6)
    for i in range(3):
        m.box(0.54, 0.16, 0.012, at=(0, 0.07 + i * 0.18, -0.283), sw="n_03")
        m.box(0.18, 0.02, 0.014, at=(0, 0.19 + i * 0.18, -0.29), sw="steel_3")
    m.box(0.62, 0.16, 0.58, at=(0, 0.74, 0), sw="plastic_dark", bevel=0.015, edges="top+vert")
    m.box(0.6, 0.08, 0.56, at=(0, 0.66, 0), sw="n_10")                               # output gap
    m.box(0.4, 0.008, 0.3, at=(0, 0.672, -0.1), sw="paper_white")                    # printed sheets
    m.box(0.56, 0.03, 0.5, at=(0, 0.9, 0.02), sw="plastic_white", bevel=0.01, edges="top")  # scanner lid
    m.box(0.2, 0.05, 0.12, at=(0.18, 0.88, -0.25), sw="plastic_black", rot=(30, 0, 0))     # control panel
    with m.part("led", mat="emissive"):
        m.box(0.04, 0.006, 0.02, at=(0.24, 0.925, -0.285), sw="led_green", rot=(30, 0, 0))
    m.anchor("stand", (0, 0, -0.65), 0)


@model("props", budget="small")
def phone_desk_01(m):
    m.box(0.18, 0.035, 0.2, at=(0, 0, 0), sw="plastic_dark", taper=(1, 1), shear=(0, 0), bevel=0.008, edges="top")
    m.box(0.05, 0.03, 0.19, at=(-0.055, 0.04, 0), sw="plastic_black", bevel=0.01, edges="top")  # handset
    m.box(0.085, 0.004, 0.1, at=(0.035, 0.035, -0.03), sw="n_09")                               # keypad
    m.box(0.085, 0.004, 0.04, at=(0.035, 0.035, 0.06), sw="screen_on_l")


@model("props", nodes=["screen"])
def tv_wall_01(m):
    """55-inch wall TV. Pivot on the wall plane at the screen centre; screen faces -Z."""
    m.box(0.3, 0.2, 0.03, at=(0, -0.1, -0.015), sw="steel_4")
    m.box(1.24, 0.72, 0.04, at=(0, -0.36, -0.05), sw="plastic_black", bevel=0.008)
    with m.part("screen", mat="emissive"):
        m.box(1.2, 0.68, 0.004, at=(0, -0.34, -0.072), sw="screen_on")
    m.box(0.12, 0.012, 0.01, at=(0, -0.372, -0.068), sw="steel_3")


if __name__ == "__main__":
    run(__file__)
