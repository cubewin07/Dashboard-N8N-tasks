"""Traditional tops (P08a-T14 recipe dry run): áo bà ba.

Built on the parametric ``tops._build_top``: collarless round neck, 3/4 sleeves, button front, a
little looser than the office shirts, with a small notch (side slit) cut into the hem band on both
sides. Tinted body = primary, buttons = secondary.
"""

from __future__ import annotations

import bmesh

from items_skinned import register
from items_skinned.tops import _build_top, _fit_kwargs

P = "primary"
S = "secondary"
BOTH = ("female", "male")


def build_ao_ba_ba(ctx):
    bm = _build_top(
        ctx,
        parts={"body": ("white", P), "placket": ("white", P), "button": ("white", S)},
        sleeve="long", sleeve_len=ctx.wrist_s * 0.80, neck="crew", collar=None,
        off_hips=0.024, off_chest=0.0195, off_sleeve=0.0185, cuff_len=0.018,
        placket=0.40, buttons=5,
    )
    # side slits: drop the hem-band quads that sit on the left/right flank
    z_min = min(v.co.z for v in bm.verts)
    cut = [
        f for f in bm.faces
        if all(v.co.z <= z_min + 0.0225 for v in f.verts)
        and abs(f.calc_center_median().x) > 0.09 and abs(f.calc_center_median().y) < 0.035
    ]
    bmesh.ops.delete(bm, geom=cut, context="FACES")
    return bm, _fit_kwargs(ctx, 0.0185, 0.024)


register("top_ao_ba_ba_01", "top", BOTH, build_ao_ba_ba)
