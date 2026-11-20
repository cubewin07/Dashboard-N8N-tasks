"""Skinned wardrobe item registry (P08a-T01). One module per batch; ``gen_wardrobe.py`` dispatches.

An item module calls ``register(item_id, slot, bases, build)`` at import time, where
``build(ctx) -> (bm, fit_kwargs)``; ``ctx`` comes from ``lib.garments.make_context`` for one base.
``fit_kwargs`` go straight to ``lib.fit.fit_free_mesh``. Optional ``meta`` is merged into the
exported ``<id>.meta.json`` top level (e.g. ``{"requires": ["top"]}`` hints, ``maxStride``).
"""

from __future__ import annotations

import importlib
import pkgutil
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class SkinnedItem:
    id: str
    slot: str
    bases: tuple[str, ...]
    build: Callable
    module: str
    meta: dict = field(default_factory=dict)


REGISTRY: dict[str, SkinnedItem] = {}


def register(item_id: str, slot: str, bases: tuple[str, ...], build: Callable, *, meta: dict | None = None) -> None:
    if item_id in REGISTRY:
        raise ValueError(f"duplicate skinned item id {item_id}")
    if not item_id.startswith(slot + "_"):
        raise ValueError(f"item id {item_id} must start with its slot '{slot}_'")
    REGISTRY[item_id] = SkinnedItem(item_id, slot, tuple(bases), build, build.__module__, dict(meta or {}))


def load_all() -> dict[str, SkinnedItem]:
    """Import every module in this package (starters first, then alphabetical)."""
    names = sorted(m.name for m in pkgutil.iter_modules(__path__))
    names.sort(key=lambda n: (n != "starters", n))
    for name in names:
        importlib.import_module(f"{__name__}.{name}")
    return REGISTRY
