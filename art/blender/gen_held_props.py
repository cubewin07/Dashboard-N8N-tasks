"""Held props (phase-06a D8). The origin is the grip point in the right palm, and the
`hand_r` anchor sits there. +Y is up; the side the carrier looks at faces -Z."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402


def held(fn):
    def wrapped(m):
        fn(m)
        m.anchor("hand_r", (0, 0, 0), 0)
    wrapped.__name__ = fn.__name__
    wrapped.__doc__ = fn.__doc__
    return model("props", budget="small", anchors=["hand_r"])(wrapped)


@held
def held_document_01(m):
    """A few stapled sheets held by the lower edge."""
    m.box(0.21, 0.297, 0.004, at=(-0.06, -0.03, 0), sw="paper_white", rot=(-12, 0, 0))
    m.box(0.21, 0.297, 0.003, at=(-0.055, -0.027, 0.004), sw="paper_cream", rot=(-12, 0, 3))
    for i in range(4):
        m.box(0.15 - 0.03 * (i % 2), 0.012, 0.002, at=(-0.07, 0.2 - i * 0.04, -0.045 + i * 0.0085), sw="n_08", rot=(-12, 0, 0))
    m.box(0.02, 0.006, 0.003, at=(-0.14, 0.255, -0.056), sw="steel_3", rot=(-12, 0, 30))


@held
def held_phone_01(m):
    m.box(0.072, 0.15, 0.009, at=(0, -0.05, 0), sw="plastic_black", bevel=0.003)
    with m.part("screen", mat="emissive"):
        m.box(0.064, 0.138, 0.002, at=(0, -0.044, -0.0055), sw="screen_on_l")
    m.box(0.022, 0.022, 0.003, at=(0.018, 0.07, 0.006), sw="n_11")


@held
def held_tablet_01(m):
    m.box(0.25, 0.18, 0.009, at=(-0.09, -0.04, 0), sw="steel_2", bevel=0.004, rot=(-15, 0, 0))
    with m.part("screen", mat="emissive"):
        m.box(0.23, 0.16, 0.002, at=(-0.09, -0.03, -0.0085), sw="screen_on", rot=(-15, 0, 0))
    m.box(0.008, 0.14, 0.008, at=(0.045, -0.02, 0.0), sw="paper_white", rot=(-15, 0, 0))   # stylus


@held
def held_laptop_01(m):
    """Closed laptop carried under the arm."""
    m.box(0.33, 0.23, 0.018, at=(0, -0.2, 0), sw="steel_2", bevel=0.005)
    m.box(0.33, 0.004, 0.019, at=(0, -0.09, 0), sw="steel_4")
    m.box(0.05, 0.05, 0.002, at=(0, -0.11, 0.0095), sw="jade_600", rot=(0, 0, 45), center=True)


@held
def held_box_01(m):
    """Cardboard archive box with a lid and hand-holes, carried in both arms."""
    m.box(0.38, 0.26, 0.3, at=(-0.19, -0.14, 0.02), sw="cardboard")
    m.box(0.4, 0.07, 0.32, at=(-0.19, 0.07, 0.02), sw="wood_pine_3", bevel=0.006, edges="top")
    for sx in (-1, 1):
        m.box(0.004, 0.035, 0.1, at=(-0.19 + sx * 0.191, 0.0, 0.02), sw="wood_ebony_3")
    m.box(0.14, 0.09, 0.003, at=(-0.19, -0.06, -0.131), sw="paper_white")
    m.box(0.1, 0.012, 0.003, at=(-0.19, -0.02, -0.133), sw="n_09")


@held
def held_camera_01(m):
    """Mirrorless camera with a lens, grip, viewfinder hump and a red record dot."""
    m.box(0.13, 0.085, 0.055, at=(-0.045, -0.04, 0), sw="plastic_black", bevel=0.006, edges="vert")
    m.box(0.035, 0.09, 0.07, at=(0.0, -0.045, 0.005), sw="plastic_dark", bevel=0.008, edges="vert")
    m.box(0.05, 0.028, 0.045, at=(-0.05, 0.045, 0), sw="plastic_black", taper=(0.7, 0.8))
    m.cyl(0.037, 0.07, at=(-0.055, 0.0, 0.027), sw="plastic_dark", seg=6, axis="z", rot=(180, 0, 0))
    m.cyl(0.03, 0.004, at=(-0.055, 0.0, 0.099), sw="screen_off", seg=6, axis="z", center=True)
    m.cyl(0.039, 0.012, at=(-0.055, 0.0, 0.07), sw="steel_3", seg=6, axis="z", center=True)
    m.cyl(0.01, 0.008, at=(-0.005, 0.045, 0.0), sw="blocked", seg=6)


@held
def held_cup_01(m):
    """Takeaway coffee cup with a sleeve and lid."""
    m.cyl(0.03, 0.11, at=(0, -0.05, 0), sw="paper_white", seg=8, r2=0.04)
    m.cyl(0.036, 0.045, at=(0, -0.02, 0), sw="cardboard", seg=8, r2=0.0395)
    m.cyl(0.043, 0.014, at=(0, 0.06, 0), sw="n_12", seg=8, r2=0.036)
    m.box(0.012, 0.004, 0.008, at=(0, 0.074, -0.02), sw="n_10")


@held
def held_mic_01(m):
    """Karaoke microphone."""
    m.cyl(0.016, 0.15, at=(0, -0.06, 0), sw="n_12", seg=6, r2=0.02)
    m.cyl(0.022, 0.012, at=(0, 0.09, 0), sw="gold", seg=6)
    m.sphere(0.034, at=(0, 0.13, 0), sw="steel_2", sub=1)
    m.box(0.008, 0.02, 0.004, at=(0, 0.02, -0.02), sw="led_green")


@held
def held_paddle_01(m):
    """Ping-pong paddle: red and black rubbers, wooden handle."""
    m.cyl(0.02, 0.1, at=(0, -0.05, 0), sw="wood_pine_3", seg=6, scale=(0.75, 1))
    m.cyl(0.078, 0.006, at=(0, 0.12, -0.004), sw="blocked", seg=10, axis="z", center=True, scale=(1, 1.06))
    m.cyl(0.078, 0.006, at=(0, 0.12, 0.004), sw="n_13", seg=10, axis="z", center=True, scale=(1, 1.06))
    m.cyl(0.08, 0.004, at=(0, 0.12, 0), sw="wood_pine_2", seg=10, axis="z", center=True, scale=(1, 1.06))


if __name__ == "__main__":
    run(__file__)
