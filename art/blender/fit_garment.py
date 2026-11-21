"""CLI entry point for the garment fitting and clipping-test pipeline.

Usage:
    Blender --background --python art/blender/fit_garment.py -- --selftest
    Blender --background --python art/blender/fit_garment.py -- --selftest-tight
    Blender --background --python art/blender/fit_garment.py -- --id test_vest --slot top --regions chest,belly --offset 0.012
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
from mathutils import Vector

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from lib import bodyshape, charexport, export, fit, rig

REPO_ROOT = _HERE.parent.parent
DEFAULT_OUT_DIR = REPO_ROOT / "art/.cache/raw/wardrobe"
DEFAULT_REPORT_DIR = REPO_ROOT / "art/out/reports"
SELFTEST_DIR = REPO_ROOT / "art/.cache/p07/fit"


def _build_selftest_free_vest(base: str, body: fit.BodyData) -> bmesh.types.BMesh:
    """Create a synthetic free-mesh strapless corset/band around belly/lower-chest."""
    bm = bmesh.new()
    sides = 14
    z_rings = (0.98, 1.04, 1.11, 1.18)
    rings: list[list[bmesh.types.BMVert]] = []
    for z in z_rings:
        rx = 0.165 if base == "female" else 0.185
        ry = 0.130 if base == "female" else 0.138
        ring: list[bmesh.types.BMVert] = []
        for s in range(sides):
            ang = 2.0 * math.pi * s / sides
            ring.append(bm.verts.new(Vector((math.cos(ang) * rx, math.sin(ang) * ry, z))))
        rings.append(ring)

    for r0, r1 in zip(rings, rings[1:]):
        for s in range(sides):
            s2 = (s + 1) % sides
            bm.faces.new((r0[s], r0[s2], r1[s2], r1[s]))

    charexport.ensure_color_layer(bm)
    charexport.paint_palette(bm, bm.faces[:], "c_sky")
    charexport.set_garment_colors(bm, {f: "primary" for f in bm.faces}, shade=1.0)
    return bm


def run_selftest() -> int:
    """Test both shell_from_body and fit_free_mesh cleanly and write report to .cache/p07/fit/."""
    SELFTEST_DIR.mkdir(parents=True, exist_ok=True)
    summary: dict[str, dict] = {}

    for base in ("female", "male"):
        export.clear_scene()
        arm, body_ob, _info = bodyshape.build_base_body(base)
        body = fit.extract_body_data(body_ob, base)

        try:
            # Path A test: shell_from_body on belly + lower chest (below armpits)
            bm_a, w_a, d_a = fit.shell_from_body(
                body_ob,
                body,
                lambda _vi, c, regs: any(r == "belly" for r in regs) and c.z < 1.21,
                offset_m=0.011,
                swatch_key="c_denim",
            )
            res_a = fit.export_fitted_garment(
                "selftest_shell",
                "top",
                base,
                arm,
                body_ob,
                body,
                bm_a,
                w_a,
                d_a,
                out_dir=SELFTEST_DIR,
                report_dir=SELFTEST_DIR,
                write_meta=True,
            )

            # Path B test: fit_free_mesh torso tube
            free_bm = _build_selftest_free_vest(base, body)
            bm_b, w_b, d_b = fit.fit_free_mesh(free_bm, body, offset_m=0.012)
            res_b = fit.export_fitted_garment(
                "selftest_free",
                "top",
                base,
                arm,
                body_ob,
                body,
                bm_b,
                w_b,
                d_b,
                out_dir=SELFTEST_DIR,
                report_dir=SELFTEST_DIR,
                write_meta=True,
            )
        except fit.FitError as exc:
            print(f"[selftest] FAIL ({base}): {exc}", file=sys.stderr)
            return 1

        summary[base] = {"shell_from_body": res_a, "fit_free_mesh": res_b}
        print(
            f"[selftest] {base}: shell tris={res_a['tris']} pen={res_a['maxPenetrationMm']}mm hide={res_a['hideRegions']} | "
            f"free tris={res_b['tris']} pen={res_b['maxPenetrationMm']}mm hide={res_b['hideRegions']}"
        )

    out_summary = SELFTEST_DIR / "selftest_summary.json"
    out_summary.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"[selftest] PASS -> {out_summary}")
    return 0


def run_selftest_tight() -> int:
    """Negative test: an undersized chest tube MUST fail neutral clipping with exit code 1."""
    SELFTEST_DIR.mkdir(parents=True, exist_ok=True)
    export.clear_scene()
    base = "female"
    arm, body_ob, _info = bodyshape.build_base_body(base)
    body = fit.extract_body_data(body_ob, base)

    # Offset -14 mm inward so the chest tube visibly slices inside the body
    bm_bad, w_bad, d_bad = fit.shell_from_body(
        body_ob,
        body,
        lambda _vi, _c, regs: all(r == "chest" for r in regs),
        offset_m=-0.014,
        resolve_overlaps=False,
        swatch_key="c_rose",
    )
    try:
        fit.export_fitted_garment(
            "selftest_tight",
            "top",
            base,
            arm,
            body_ob,
            body,
            bm_bad,
            w_bad,
            d_bad,
            out_dir=SELFTEST_DIR,
            report_dir=SELFTEST_DIR,
            write_meta=False,
        )
    except fit.FitError as exc:
        print(f"[selftest-tight] Expected failure caught: {exc}", file=sys.stderr)
        return 1

    print("[selftest-tight] ERROR: tight tube unexpectedly passed!", file=sys.stderr)
    return 0


def run_cli_shell(args: argparse.Namespace) -> int:
    regions = {r.strip() for r in args.regions.split(",") if r.strip()}
    bases = ("female", "male") if args.base == "both" else (args.base,)
    for base in bases:
        export.clear_scene()
        arm, body_ob, _ = bodyshape.build_base_body(base)
        body = fit.extract_body_data(body_ob, base)
        try:
            bm, w, d = fit.shell_from_body(
                body_ob,
                body,
                lambda _vi, _c, regs: all(r in regions for r in regs),
                offset_m=args.offset,
                swatch_key=args.swatch,
            )
            res = fit.export_fitted_garment(
                args.id,
                args.slot,
                base,
                arm,
                body_ob,
                body,
                bm,
                w,
                d,
                out_dir=Path(args.out),
                report_dir=Path(args.reports),
                write_meta=True,
            )
        except fit.FitError as exc:
            print(f"[fit_garment] FAIL {args.id} ({base}): {exc}", file=sys.stderr)
            return 1
        print(
            f"[fit_garment] {args.id} ({base}): tris={res['tris']} "
            f"maxPen={res['maxPenetrationMm']}mm hide={res['hideRegions']}"
        )
    return 0


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []

    parser = argparse.ArgumentParser(description="Garment fitting and clipping pipeline")
    parser.add_argument("--selftest", action="store_true", help="Run fitting selftest and exit 0")
    parser.add_argument(
        "--selftest-tight",
        action="store_true",
        help="Run too-tight negative test and expect exit 1",
    )
    parser.add_argument("--id", help="Garment catalog ID")
    parser.add_argument("--slot", default="top", help="Garment slot")
    parser.add_argument("--base", choices=("female", "male", "both"), default="both")
    parser.add_argument("--regions", default="chest,belly", help="Comma-separated body regions")
    parser.add_argument("--offset", type=float, default=0.010, help="Outward offset in metres")
    parser.add_argument("--swatch", default="c_white", help="Default swatch key")
    parser.add_argument("--out", default=str(DEFAULT_OUT_DIR), help="Output wardrobe directory")
    parser.add_argument("--reports", default=str(DEFAULT_REPORT_DIR), help="Output report directory")
    args = parser.parse_args(argv)

    if args.selftest:
        return run_selftest()
    if args.selftest_tight:
        return run_selftest_tight()
    if not args.id:
        parser.error("--id is required unless --selftest or --selftest-tight is specified")
    return run_cli_shell(args)


if __name__ == "__main__":
    sys.exit(main())
