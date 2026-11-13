"""Rest area (assets.md §8.1). `seat` anchors here are lie-down anchors: head towards +Z."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402


def _pillow(m, x, y, z, sw="paper_white", w=0.5):
    m.box(w, 0.1, 0.32, at=(x, y, z), sw=sw, bevel=0.04, edges="all")


def _blanket(m, x, y, z, w, d, sw, fold="jade_300"):
    m.box(w, 0.06, d, at=(x, y, z), sw=sw, bevel=0.025, edges="top+vert")
    m.box(w, 0.07, 0.16, at=(x, y, z + d / 2 - 0.02), sw=fold, bevel=0.03, edges="top+vert")


@model("props", anchors=["seat"])
def bed_single_01(m):
    """Nap bed 0.95 x 2.0 m: timber frame, headboard, mattress, pillow, turned-down blanket."""
    w, d = 0.95, 2.0
    m.box(w, 0.16, d, at=(0, 0.12, 0), sw="wood_pine_3", bevel=0.012, edges="vert")
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(0.07, 0.12, 0.07, at=(sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)), sw="wood_pine_4")
    m.box(w, 0.75, 0.06, at=(0, 0.12, d / 2), sw="wood_pine_3", bevel=0.02, edges="top+vert")
    m.box(w - 0.3, 0.3, 0.02, at=(0, 0.5, d / 2 - 0.035), sw="wood_pine_2")
    m.box(w - 0.06, 0.16, d - 0.08, at=(0, 0.28, -0.01), sw="paper_white", bevel=0.03, edges="top+vert")
    _pillow(m, 0, 0.43, 0.72)
    _blanket(m, 0, 0.43, -0.3, w - 0.02, 1.3, "jade_500")
    m.anchor("seat", (0, 0.46, 0.0), 0)


@model("props", anchors=["seat"], nodes=["led"])
def sleep_pod_01(m):
    """Capsule nap pod: moulded base, padded bed, half canopy with a tinted visor and a status light."""
    w, d = 1.05, 2.1
    m.box(w, 0.36, d, at=(0, 0, 0), sw="plastic_white", bevel=0.08, edges="vert")
    m.box(w - 0.1, 0.06, d - 0.1, at=(0, 0, 0), sw="n_12")
    m.box(w - 0.16, 0.1, d - 0.2, at=(0, 0.36, 0), sw="uphol_grey_l", bevel=0.03, edges="top+vert")
    m.box(0.45, 0.08, 0.3, at=(0, 0.46, 0.75), sw="paper_white", bevel=0.03)
    shell = [(-w / 2, 0.36), (-w / 2, 0.9), (-w / 2 + 0.2, 1.2), (w / 2 - 0.2, 1.2), (w / 2, 0.9), (w / 2, 0.36),
             (w / 2 - 0.06, 0.36), (w / 2 - 0.06, 0.88), (w / 2 - 0.23, 1.14), (-w / 2 + 0.23, 1.14),
             (-w / 2 + 0.06, 0.88), (-w / 2 + 0.06, 0.36)]
    m.prism(shell, 1.0, at=(0, 0, 0.55), sw="plastic_white", plane="xy")
    m.prism([(-w / 2, 0.36), (-w / 2, 0.9), (-w / 2 + 0.2, 1.2), (w / 2 - 0.2, 1.2), (w / 2, 0.9), (w / 2, 0.36)],
            0.05, at=(0, 0, 1.03), sw="n_03", plane="xy")
    for sx in (-1, 1):                                                             # accent stripe on the base
        m.box(0.012, 0.06, d - 0.5, at=(sx * (w / 2 + 0.002), 0.2, 0), sw="jade_600")
    with m.glass():
        m.prism([(-w / 2 + 0.02, 0.4), (-w / 2 + 0.02, 0.88), (-w / 2 + 0.21, 1.17), (w / 2 - 0.21, 1.17),
                 (w / 2 - 0.02, 0.88), (w / 2 - 0.02, 0.4)], 0.02, at=(0, 0, 0.04), sw="glass_tint", plane="xy")
    with m.part("led", mat="emissive"):
        m.box(0.12, 0.04, 0.01, at=(0, 0.2, -d / 2 - 0.004), sw="led_green")
    m.box(0.3, 0.14, 0.012, at=(0, 0.13, -d / 2 - 0.004), sw="n_05")
    m.anchor("seat", (0, 0.46, 0.0), 0)


@model("props", budget="small")
def blanket_01(m):
    """Folded blanket stack."""
    m.box(0.5, 0.07, 0.4, at=(0, 0, 0), sw="jade_500", bevel=0.025, edges="top+vert")
    m.box(0.48, 0.07, 0.38, at=(0, 0.07, 0), sw="jade_300", bevel=0.025, edges="top+vert")
    m.box(0.5, 0.025, 0.06, at=(0, 0.135, -0.1), sw="paper_cream")


@model("props", budget="small")
def pillow_01(m):
    m.box(0.5, 0.12, 0.34, at=(0, 0, 0), sw="paper_white", bevel=0.05, edges="all")
    m.box(0.52, 0.03, 0.05, at=(0, 0.045, -0.16), sw="jade_300")


if __name__ == "__main__":
    run(__file__)
