"""Generate and fit every skinned wardrobe garment (P07a-T08/T09, dispatcher since P08a-T01).

Items are registered by the modules in ``art/blender/items_skinned/`` (one per batch); this
script builds each base body once, then fits every registered item for that base.

Usage:
    Blender -b --factory-startup --python-exit-code 1 -P art/blender/gen_wardrobe.py -- \
        [--out art/.cache/raw] [--only top_tshirt_crew_01,shoes_sneaker_01] [--list]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from lib import bodyshape, charexport, export, fit, garments, layerfollow  # noqa: E402
from lib.layering import Garment, load_rows  # noqa: E402
import items_skinned  # noqa: E402

REPO_ROOT = _HERE.parent.parent
DEFAULT_OUT_DIR = REPO_ROOT / "art/.cache/raw"
DEFAULT_REPORT_DIR = REPO_ROOT / "art/out/reports"


def _merge_meta(out_dir: Path, item_id: str, extra: dict) -> None:
    if not extra:
        return
    path = out_dir / f"{item_id}.meta.json"
    meta = json.loads(path.read_text(encoding="utf-8"))
    meta.update(extra)
    path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def _follow_tops(item, base, out_dir, registry, arm, body_ob, body, bm, weights, deltas, res, report_dir):
    """Grow an outer's shape-key deltas until no shipped top pokes through it, then export it again."""
    sfx = base[0]
    outer = Garment(out_dir / f"{item.id}_{sfx}.glb", {})
    rows = load_rows()
    conflicts = set(rows.get(item.id, {}).get("conflicts", []))
    # Everything worn under an outer: tops, and one-piece items that are not marked as conflicting with it.
    under = [
        t for t in registry.values()
        if base in t.bases and (t.slot == "top" or (t.slot == "fullbody" and t.id not in conflicts
                                                   and item.id not in rows.get(t.id, {}).get("conflicts", [])))
    ]
    tops = [Garment(out_dir / f"{t.id}_{sfx}.glb", {}) for t in under]
    growth = layerfollow.follow_inner(outer, tops)
    layerfollow.apply_growth(bm, deltas, outer.start_basis, growth)
    print(f"[gen_wardrobe] layer-follow {item.id} ({base}): {len(growth)} vertices grown against {len(tops)} inner layers")
    res = fit.export_fitted_garment(
        item.id, item.slot, base, arm, body_ob, body, bm, weights, deltas,
        out_dir=out_dir, report_dir=report_dir, write_meta=True,
    )
    return res, growth


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []

    parser = argparse.ArgumentParser(description="Generate the skinned wardrobe garments")
    parser.add_argument("--only", default="", help="Comma-separated subset of item IDs")
    parser.add_argument("--out", default=str(DEFAULT_OUT_DIR), help="Raw cache root; files go to <out>/wardrobe")
    parser.add_argument("--reports", default=str(DEFAULT_REPORT_DIR), help="Report directory")
    parser.add_argument("--list", action="store_true", help="Print registered ids and exit")
    args = parser.parse_args(argv)

    registry = items_skinned.load_all()
    if args.list:
        for item in registry.values():
            print(f"{item.id}\t{item.slot}\t{','.join(item.bases)}\t{item.module}")
        return 0

    only_set = {s.strip() for s in args.only.split(",") if s.strip()} if args.only else None
    if only_set:
        # The art:build wrapper passes one --only list to every family; ignore other families' ids.
        only_set &= set(registry)
        if not only_set:
            return 0
    out_dir = Path(args.out) / "wardrobe"
    report_dir = Path(args.reports)
    out_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    for base in ("female", "male"):
        todo = [it for it in registry.values() if base in it.bases and (only_set is None or it.id in only_set)]
        if any(it.slot == "outer" for it in todo):
            # Outers are fitted against the exported tops (P08a-T15): include every top / one-piece, and fit outers last.
            todo += [it for it in registry.values() if it.slot in ("top", "fullbody") and base in it.bases and it not in todo]
        todo.sort(key=lambda it: it.slot == "outer")
        if not todo:
            continue
        export.clear_scene()
        arm, body_ob, _info = bodyshape.build_base_body(base)
        body = fit.extract_body_data(body_ob, base)
        ctx = garments.make_context(base, garments.BodySampler(body), body)

        for item in todo:
            raw_bm, fit_kw = item.build(ctx)
            bm, w, d = fit.fit_free_mesh(raw_bm, body, **fit_kw)
            keep_bm = bm.copy() if item.slot == "outer" else None
            keep_d = {k: [x.copy() for x in v] for k, v in d.items()} if keep_bm is not None else None
            try:
                res = fit.export_fitted_garment(
                    item.id, item.slot, base, arm, body_ob, body, bm, w, d,
                    out_dir=out_dir, report_dir=report_dir, write_meta=True,
                )
            except fit.FitError as exc:
                print(f"[gen_wardrobe] FAIL {item.id} ({base}): {exc}", file=sys.stderr)
                return 1
            if keep_bm is not None:
                # Outers must stay outside every top at the extreme body corners (P08a-T15): measure against the
                # exported tops (outers are fitted last), grow the outer's deltas, re-export.
                res, grown = _follow_tops(item, base, out_dir, registry, arm, body_ob, body, keep_bm, w, keep_d, res, report_dir)
            _merge_meta(out_dir, item.id, item.meta)

            print(f"BUILT wardrobe/{item.id}_{base[0]}.glb tris={res['tris']}")
            print(
                f"[gen_wardrobe] OK {item.id:26s} ({base:6s}): "
                f"tris={res['tris']:4d} bytes={res['bytes']:5d} "
                f"pen={res['maxPenetrationMm']:4.2f}mm "
                f"pose={res['posePenetrationMm']} "
                f"limits={res['bodyLimits']} hide={res['hideRegions']}"
            )

    charexport.register_targets(
        "wardrobe",
        [
            {
                "name": f"{it.id}_{b[0]}",
                "family": "wardrobe",
                "script": "art/blender/gen_wardrobe.py",
                "out": f"public/assets/models/wardrobe/{it.id}_{b[0]}.glb",
                "budget": "garment",
                "anchors": [],
                "nodes": [],
                "source": "generated",
            }
            for it in registry.values()
            for b in it.bases
        ],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
