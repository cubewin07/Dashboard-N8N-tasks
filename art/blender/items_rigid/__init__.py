"""Rigid wardrobe item registry (P08a-T01). One module per batch; ``gen_rigid.py`` dispatches.

An item module calls ``register(item_id, slot, bone, build, meta=None)`` at import time, where
``build(probe) -> bmesh`` authors the mesh in rest-pose character space (Blender, metres, +Z up,
faces -Y) using ``lib.rigid_common`` helpers. ``bone`` is the catalogue ``attach.bone``
(Head, Neck, Spine2, LeftHand, RightHand, LeftForeArm). ``meta`` is merged into ``<id>.meta.json``
(e.g. ``{"hairClip": "crown"}`` for hats). ``kind="hair"`` turns on scalp-clearance checks.
"""

from __future__ import annotations

import importlib
import pkgutil
from dataclasses import dataclass, field
from typing import Callable

BONES = {"Head", "Neck", "Spine2", "LeftHand", "RightHand", "LeftForeArm"}


@dataclass
class RigidItem:
    id: str
    slot: str
    bone: str
    build: Callable
    module: str
    meta: dict = field(default_factory=dict)


REGISTRY: dict[str, RigidItem] = {}


def register(item_id: str, slot: str, bone: str, build: Callable, *, meta: dict | None = None) -> None:
    if item_id in REGISTRY:
        raise ValueError(f"duplicate rigid item id {item_id}")
    if bone not in BONES:
        raise ValueError(f"{item_id}: bone {bone} not in {sorted(BONES)}")
    if not item_id.startswith(slot + "_"):
        raise ValueError(f"item id {item_id} must start with its slot '{slot}_'")
    REGISTRY[item_id] = RigidItem(item_id, slot, bone, build, build.__module__, dict(meta or {}))


def load_all() -> dict[str, RigidItem]:
    names = sorted(m.name for m in pkgutil.iter_modules(__path__))
    names.sort(key=lambda n: (n != "starters", n))
    for name in names:
        importlib.import_module(f"{__name__}.{name}")
    return REGISTRY
