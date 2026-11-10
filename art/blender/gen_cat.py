"""The office cat (phase-06a D7): three static poses as sibling nodes sharing one origin.
The runtime shows exactly one of `pose_sit`, `pose_loaf`, `pose_stand`."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402

FUR, BELLY, DARK = "c_orange", "c_cream", "c_brown"


def _head(m, x, y, z, tilt=0):
    m.box(0.13, 0.11, 0.11, at=(x, y, z), sw=FUR, bevel=0.025, rot=(tilt, 0, 0))
    m.box(0.07, 0.045, 0.03, at=(x, y + 0.01, z - 0.06), sw=BELLY, rot=(tilt, 0, 0))     # muzzle
    m.box(0.02, 0.014, 0.01, at=(x, y + 0.045, z - 0.076), sw="c_pink")
    for sx in (-1, 1):
        m.prism([(-0.025, 0), (0.025, 0), (0, 0.05)], 0.02, at=(x + sx * 0.04, y + 0.1, z + 0.01), sw=FUR)
        m.prism([(-0.012, 0), (0.012, 0), (0, 0.028)], 0.004, at=(x + sx * 0.04, y + 0.103, z - 0.002), sw="c_pink")
        m.box(0.018, 0.022, 0.006, at=(x + sx * 0.032, y + 0.06, z - 0.056), sw="n_14")
    m.box(0.03, 0.04, 0.004, at=(x, y + 0.085, z - 0.056), sw=DARK)                      # forehead stripe


def _stripes(m, x, y, z, n, dz, w):
    for i in range(n):
        m.box(w, 0.012, 0.022, at=(x, y, z + i * dz), sw=DARK)


@model("decor", nodes=["pose_sit", "pose_loaf", "pose_stand"])
def cat_01(m):
    with m.part("pose_sit", exact=True):
        m.box(0.17, 0.24, 0.2, at=(0, 0, 0.03), sw=FUR, bevel=0.04, taper=(0.75, 0.7), shear=(0, -0.03))
        m.box(0.1, 0.16, 0.02, at=(0, 0.05, -0.062), sw=BELLY, rot=(-10, 0, 0))
        for sx in (-1, 1):
            m.box(0.045, 0.2, 0.05, at=(sx * 0.045, 0, -0.08), sw=FUR)
            m.box(0.05, 0.03, 0.07, at=(sx * 0.045, 0, -0.095), sw=BELLY)
            m.box(0.06, 0.09, 0.14, at=(sx * 0.085, 0, 0.04), sw=FUR, bevel=0.02)       # haunches
        _head(m, 0, 0.23, -0.05)
        _stripes(m, 0, 0.2, 0.02, 2, 0.05, 0.14)
        m.rod((0, 0.03, 0.12), (0.14, 0.03, 0.14), 0.022, sw=FUR, seg=4)
        m.rod((0.14, 0.03, 0.14), (0.2, 0.03, 0.02), 0.02, sw=DARK, seg=4)
    with m.part("pose_loaf", exact=True):
        m.box(0.2, 0.14, 0.34, at=(0, 0, 0.02), sw=FUR, bevel=0.045)
        m.box(0.16, 0.02, 0.06, at=(0, 0, -0.14), sw=BELLY)
        _head(m, 0, 0.09, -0.17, tilt=6)
        _stripes(m, 0, 0.133, -0.04, 3, 0.07, 0.17)
        m.rod((0.02, 0.03, 0.18), (0.13, 0.03, 0.14), 0.022, sw=FUR, seg=4)
        m.rod((0.13, 0.03, 0.14), (0.14, 0.03, 0.0), 0.02, sw=DARK, seg=4)
    with m.part("pose_stand", exact=True):
        m.box(0.14, 0.13, 0.36, at=(0, 0.13, 0.02), sw=FUR, bevel=0.035)
        m.box(0.1, 0.02, 0.26, at=(0, 0.125, 0.02), sw=BELLY)
        for sx in (-1, 1):
            for sz, lean in ((-1, 0.02), (1, -0.02)):
                m.rod((sx * 0.045, 0.16, sz * 0.12), (sx * 0.045, 0.0, sz * 0.12 + lean), 0.022, sw=FUR, seg=4)
                m.box(0.045, 0.02, 0.055, at=(sx * 0.045, 0, sz * 0.12 + lean - 0.01), sw=BELLY)
        _head(m, 0, 0.24, -0.2)
        _stripes(m, 0, 0.253, -0.06, 3, 0.08, 0.12)
        m.rod((0, 0.24, 0.19), (0, 0.38, 0.26), 0.02, sw=FUR, seg=4)
        m.rod((0, 0.38, 0.26), (0, 0.46, 0.22), 0.018, sw=DARK, seg=4)


if __name__ == "__main__":
    run(__file__)
