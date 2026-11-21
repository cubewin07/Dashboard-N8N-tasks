"""Vertical circulation (phase-06a §3.5): stairs and the elevator. Fronts face -Z."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.export import model, run  # noqa: E402

RISE, RUN, SW, STEPS = 2.0, 3.0, 1.2, 12


@model("env", budget="kit")
def stairs_flight_01(m):
    """One flight: rises 2.0 m over a 3.0 m run towards +Z, 1.2 m wide, 12 steps."""
    r, t = RISE / STEPS, RUN / STEPS
    pts = [(-RUN / 2, 0)]
    for i in range(STEPS):
        pts += [(-RUN / 2 + i * t, (i + 1) * r), (-RUN / 2 + (i + 1) * t, (i + 1) * r)]
    pts += [(RUN / 2, RISE - 0.28), (-RUN / 2 + 0.3, 0)]
    m.prism(pts, SW - 0.12, sw="concrete_2", plane="zy")
    for i in range(STEPS):                                             # tread nosings
        m.box(SW - 0.12, 0.025, t + 0.02, at=(0, (i + 1) * r - 0.005, -RUN / 2 + (i + 0.5) * t - 0.01), sw="wood_oak_3")
    for sx in (-1, 1):                                                 # stringers
        m.prism([(-RUN / 2, 0), (-RUN / 2, 0.3), (RUN / 2, RISE + 0.3), (RUN / 2, RISE - 0.3), (-RUN / 2 + 0.35, 0)],
                0.06, at=(sx * (SW / 2 - 0.03), 0, 0), sw="steel_4", plane="zy")
    x = SW / 2 - 0.03                                                  # handrail on the open side
    for i in (0, 4, 8, 12):
        z = -RUN / 2 + i * t
        y = i * r
        m.box(0.035, 0.9, 0.035, at=(x, y + 0.2, min(z, RUN / 2 - 0.03)), sw="steel_3")
    m.rod((x, 1.1, -RUN / 2), (x, RISE + 1.1, RUN / 2), 0.03, sw="wood_walnut_2", seg=6)
    m.rod((x, 0.6, -RUN / 2), (x, RISE + 0.6, RUN / 2), 0.012, sw="steel_3", seg=4)


@model("env", budget="kit")
def stairs_landing_01(m):
    """Half landing joining two flights: 2.4 x 1.2 m; top surface at y = 0."""
    m.box(2.4, 0.18, 1.2, at=(0, -0.18, 0), sw="concrete_2")
    m.box(2.4, 0.02, 1.2, at=(0, 0, 0), sw="wood_oak_3")
    m.box(2.4, 0.24, 0.06, at=(0, -0.24, 0.57), sw="steel_4")
    for x in (-1.17, -0.4, 0.4, 1.17):
        m.box(0.035, 1.05, 0.035, at=(x, 0.02, 0.56), sw="steel_3")
    m.box(2.4, 0.05, 0.07, at=(0, 1.07, 0.56), sw="wood_walnut_2", bevel=0.012, edges="top")
    m.box(2.34, 0.02, 0.02, at=(0, 0.56, 0.56), sw="steel_3")


@model("env", budget="kit")
def elevator_shaft_frame_01(m):
    """One storey of glass elevator shaft: 2.4 x 2.4 x 4.0 m. The -Z side stays open for the door frame."""
    s, h = 1.2, 4.0
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(0.12, h, 0.12, at=(sx * (s - 0.06), -0.3, sz * (s - 0.06)), sw="steel_4")
    for y in (-0.3, 3.58):
        for sx in (-1, 1):
            m.box(0.1, 0.12, 2.16, at=(sx * (s - 0.06), y, 0), sw="steel_3")
        m.box(2.16, 0.12, 0.1, at=(0, y, s - 0.06), sw="steel_3")
    for sx in (-1, 1):                                                 # guide rails on the back wall
        m.box(0.06, h, 0.05, at=(sx * 0.7, -0.3, s - 0.14), sw="steel_2")
    with m.glass():
        for sx in (-1, 1):
            m.box(0.02, 3.76, 2.16, at=(sx * (s - 0.06), -0.18, 0), sw="glass_tint")
        m.box(2.16, 3.76, 0.02, at=(0, -0.18, s - 0.06), sw="glass_tint")


def _doors(m, y0, h, z, panel="steel_1", w=0.5):
    """Centre-opening pair. `_door_l` / `_door_r` are pivot nodes the runtime slides along X."""
    for side, sx in (("door_l", -1), ("door_r", 1)):
        with m.part(side, pivot=(sx * w / 2, y0, z)):
            m.box(w, h, 0.03, at=(sx * w / 2, y0, z), sw=panel)
            m.box(w - 0.12, h - 0.5, 0.008, at=(sx * w / 2, y0 + 0.25, z - 0.018), sw="steel_2")
            m.box(0.015, h, 0.034, at=(sx * 0.008, y0, z), sw="n_12")


@model("env", budget="large", anchors=["stand"], nodes=["door_l", "door_r", "led", "lamp"])
def elevator_car_01(m):
    """Car 2.0 x 2.0 x 2.6 m: steel panels, mirror, handrails, lit ceiling, sliding doors, floor display."""
    s, h, t = 1.0, 2.6, 0.05
    m.box(2.0, 0.08, 2.0, at=(0, 0, 0), sw="n_11")
    m.box(1.7, 0.004, 1.7, at=(0, 0.08, 0), sw="concrete_4")
    m.box(1.3, 0.004, 1.3, at=(0, 0.084, 0), sw="jade_700", rot=(0, 45, 0))            # floor inlay
    m.box(2.0, 0.1, 2.0, at=(0, h - 0.1, 0), sw="steel_3")
    for sx in (-1, 1):                                                                # side walls
        x = sx * (s - t / 2)
        m.box(t, h - 0.18, 2.0, at=(x, 0.08, 0), sw="steel_1")
        m.box(0.012, 1.6, 0.55, at=(x - sx * 0.03, 0.6, 0.5), sw="chrome_2")
        m.box(0.012, 1.6, 0.55, at=(x - sx * 0.03, 0.6, -0.2), sw="chrome_2")
        m.rod((x - sx * 0.08, 0.95, -0.7), (x - sx * 0.08, 0.95, 0.8), 0.02, sw="chrome_1")
        m.box(t, 0.12, 2.0, at=(x - sx * 0.005, 0.08, 0), sw="steel_3")
        m.box(0.012, 0.18, 2.0, at=(x + sx * 0.03, 1.2, 0), sw="jade_600")           # outside belt band
    m.box(2.0, h - 0.18, t, at=(0, 0.08, s - t / 2), sw="steel_1")                    # back wall
    m.box(1.5, 1.3, 0.012, at=(0, 1.05, s - t - 0.006), sw="chrome_1")                # mirror
    m.rod((-0.8, 0.95, s - 0.12), (0.8, 0.95, s - 0.12), 0.02, sw="chrome_1")
    for sx in (-1, 1):                                                                # front returns
        m.box(0.5, h - 0.18, t, at=(sx * 0.75, 0.08, -(s - t / 2)), sw="steel_2")
    m.box(1.0, 0.42, t, at=(0, 2.1, -(s - t / 2)), sw="steel_2")
    m.box(0.16, 0.5, 0.02, at=(0.72, 1.0, -(s - t - 0.01)), sw="plastic_dark")        # button panel
    for i in range(4):
        m.box(0.04, 0.04, 0.01, at=(0.72 + (i % 2 - 0.5) * 0.07, 1.1 + (i // 2) * 0.12, -(s - t - 0.025)), sw="chrome_1")
    with m.part("lamp", mat="emissive"):
        m.box(1.3, 0.02, 1.3, at=(0, h - 0.12, 0), sw="lamp_warm")
    with m.part("led", mat="emissive"):
        m.box(0.4, 0.14, 0.012, at=(0, 2.24, -(s - t - 0.007)), sw="led_amber")
    _doors(m, 0.08, 2.02, -(s - 0.015))
    for x, z in ((-0.5, 0.45), (0.5, 0.45), (-0.5, -0.35), (0.5, -0.35)):
        m.anchor("stand", (x, 0.085, z), 180)


@model("env", nodes=["door_l", "door_r", "led"])
def elevator_door_frame_01(m):
    """Landing door on each floor: portal, sliding leaves, floor indicator, call button. Pivot on the shaft front plane."""
    fr = "steel_4"
    for sx in (-1, 1):
        m.box(0.7, 2.5, 0.12, at=(sx * 0.85, 0, 0), sw="n_03")
        m.box(0.1, 2.2, 0.16, at=(sx * 0.55, 0, 0), sw=fr)
    m.box(2.4, 1.2, 0.12, at=(0, 2.5, 0), sw="n_03")
    m.box(1.2, 0.1, 0.16, at=(0, 2.2, 0), sw=fr)
    m.box(1.0, 0.02, 0.2, at=(0, 0, 0), sw="steel_2")                                 # sill
    m.box(0.5, 0.2, 0.03, at=(0, 2.42, -0.07), sw="plastic_black")
    with m.part("led", mat="emissive"):
        m.box(0.42, 0.13, 0.008, at=(0, 2.455, -0.088), sw="led_amber")
    m.box(0.1, 0.22, 0.02, at=(0.85, 1.05, -0.07), sw="steel_2")                      # call panel
    m.cyl(0.022, 0.012, at=(0.85, 1.19, -0.08), sw="jade_500", seg=6, axis="z", rot=(0, 180, 0), center=True)
    m.cyl(0.022, 0.012, at=(0.85, 1.11, -0.08), sw="n_05", seg=6, axis="z", rot=(0, 180, 0), center=True)
    _doors(m, 0.02, 2.18, 0.0)


if __name__ == "__main__":
    run(__file__)
