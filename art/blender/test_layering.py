"""Garment layering matrix test (P08a-T10).

Checks that an inner garment never pokes through the garment worn over it:

  * every top      x every bottom    (the top is worn over the bottom's waistband)
  * every outer    x every top       (outer over top)
  * every outer    x every fullbody  (outer over dress / ao dai / suit ...)

for each body base both items support, at 6 slider corners. A corner is clamped to the
intersection of the default slider range and both items' ``bodyLimits`` (the runtime does
the same intersection, see ``src/scene/characters/bodyMap.ts``).

Poke-through is measured like the body clipping test in ``lib/fit.py`` (method A), with the
inner garment playing the body: from every inner-garment vertex a ray is cast along its
inward normal; if it hits an outward-facing face of the outer garment within 45 mm, the
inner vertex sits outside the outer garment by that distance.

Pairs listed in either row's optional ``conflicts`` array (item ids that cannot be worn
together; the wardrobe editor swaps them) are reported but do not fail the run.

Reads the raw fitted GLBs + metas in ``art/.cache/raw/wardrobe`` (build them first with
``npm run art:build -- wardrobe``). Writes ``art/out/reports/layering.json``.

    Blender -b --factory-startup --python-exit-code 1 -P art/blender/test_layering.py -- \
        [--raw art/.cache/raw/wardrobe] [--only id1,id2] [--threshold-mm 5]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from lib import fit  # noqa: E402
from lib.export import clear_scene  # noqa: E402
from lib.layering import (  # noqa: E402
    CATALOG_DIR, CORNERS, LAYER_PAIRS, Garment, corner_combo, load_rows, poke_through_mm,
)

REPO_ROOT = _HERE.parent.parent
DEFAULT_RAW = REPO_ROOT / "art/.cache/raw/wardrobe"
REPORT_PATH = REPO_ROOT / "art/out/reports/layering.json"


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(description="Garment layering matrix test")
    ap.add_argument("--raw", default=str(DEFAULT_RAW))
    ap.add_argument("--only", default="", help="limit to pairs touching these ids")
    ap.add_argument("--threshold-mm", type=float, default=fit.REST_CLIP_LIMIT_MM)
    ap.add_argument("--out", default=str(REPORT_PATH))
    args = ap.parse_args(argv)

    raw = Path(args.raw)
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    rows = load_rows()
    by_slot: dict[str, list[dict]] = {}
    for r in rows.values():
        if r.get("attach") == "skinned" and r.get("model"):
            by_slot.setdefault(r["slot"], []).append(r)

    clear_scene()
    garments: dict[tuple[str, str], Garment] = {}
    missing: list[str] = []

    def get(item_id: str, base: str) -> Garment | None:
        key = (item_id, base)
        if key in garments:
            return garments[key]
        glb = raw / f"{item_id}_{base[0]}.glb"
        meta_path = raw / f"{item_id}.meta.json"
        if not glb.exists() or not meta_path.exists():
            missing.append(glb.name)
            return None
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        limits = (meta.get("bases", {}).get(base, {}) or {}).get("bodyLimits", {}) or {}
        garments[key] = Garment(glb, limits)
        return garments[key]

    t0 = time.time()
    results: list[dict] = []
    for inner_slot, outer_slot in LAYER_PAIRS:
        for inner_row in by_slot.get(inner_slot, []):
            for outer_row in by_slot.get(outer_slot, []):
                if only and inner_row["id"] not in only and outer_row["id"] not in only:
                    continue
                conflict = outer_row["id"] in inner_row.get("conflicts", []) or inner_row["id"] in outer_row.get("conflicts", [])
                for base in ("female", "male"):
                    if base not in inner_row["bases"] or base not in outer_row["bases"]:
                        continue
                    gi, go = get(inner_row["id"], base), get(outer_row["id"], base)
                    if gi is None or go is None:
                        continue
                    corners = {}
                    worst_mm, worst_corner = 0.0, "neutral"
                    for cname, keys in CORNERS:
                        combo = corner_combo(keys, gi.limits, go.limits)
                        mm, cnt = poke_through_mm(gi, go, combo)
                        corners[cname] = {"mm": round(mm, 2), "verts": cnt}
                        if mm > worst_mm:
                            worst_mm, worst_corner = mm, cname
                    ok = worst_mm <= args.threshold_mm
                    results.append({
                        "base": base,
                        "inner": inner_row["id"],
                        "outer": outer_row["id"],
                        "maxMm": round(worst_mm, 2),
                        "worstCorner": worst_corner,
                        "status": "ok" if ok else ("conflict" if conflict else "fail"),
                        "corners": corners,
                    })
                    if not ok:
                        tag = "CONFLICT" if conflict else "FAIL"
                        print(f"[layering] {tag} {base:6s} {inner_row['id']} under {outer_row['id']}: "
                              f"{worst_mm:.1f} mm at {worst_corner}")

    failures = [r for r in results if r["status"] == "fail"]
    report = {
        "thresholdMm": args.threshold_mm,
        "corners": [c for c, _ in CORNERS],
        "pairs": len(results),
        "failures": len(failures),
        "conflicts": sum(1 for r in results if r["status"] == "conflict"),
        "worstMm": max((r["maxMm"] for r in results), default=0.0),
        "missing": sorted(set(missing)),
        "results": sorted(results, key=lambda r: -r["maxMm"]),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"[layering] {len(results)} pair-bases, {len(failures)} failures, {report['conflicts']} conflicts, "
          f"worst {report['worstMm']:.1f} mm, missing {len(report['missing'])} files, {time.time() - t0:.0f}s -> {out}")
    if report["missing"]:
        print(f"[layering] missing raw files (run npm run art:build -- wardrobe): {', '.join(report['missing'][:12])}")
    return 1 if failures or report["missing"] else 0


if __name__ == "__main__":
    sys.exit(main())
