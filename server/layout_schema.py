"""Structural validation for a layout dict.

This mirrors app/js/schema.js so the same rules apply whether a layout is checked
in the browser or on the server (e.g. before writing it to the database). It is a
lightweight check, not a full JSON-Schema validator.
"""

from __future__ import annotations

from numbers import Real

SCHEMA_VERSION = 3
NODE_KINDS = {"door", "ramp", "junction", "dock", "staging", "charge"}
RACK_DIRS = {"E", "N"}


def _is_number(v) -> bool:
    return isinstance(v, Real) and not isinstance(v, bool)


def validate_layout(layout) -> list[str]:
    """Return a list of human-readable errors. Empty list means valid."""
    errors: list[str] = []

    if not isinstance(layout, dict):
        return ["layout is not an object"]

    if layout.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(
            f"schemaVersion must be {SCHEMA_VERSION} "
            f"(got {layout.get('schemaVersion')!r}); run a migration first"
        )

    meta = layout.get("meta")
    if not isinstance(meta, dict) or not isinstance(meta.get("name"), str):
        errors.append("meta.name must be a string")

    for key in ("zones", "nodes", "edges", "racks"):
        if not isinstance(layout.get(key), list):
            errors.append(f"{key} must be an array")
    if not isinstance(layout.get("binTypes"), dict):
        errors.append("binTypes must be an object")

    for i, z in enumerate(layout.get("zones") or []):
        for k in ("x", "y", "w", "d", "elev", "clearH"):
            if not _is_number(z.get(k)):
                errors.append(f"zones[{i}].{k} must be a number")
        if not isinstance(z.get("id"), str):
            errors.append(f"zones[{i}].id must be a string")

    node_ids = set()
    for i, n in enumerate(layout.get("nodes") or []):
        if not isinstance(n.get("id"), str):
            errors.append(f"nodes[{i}].id must be a string")
        else:
            node_ids.add(n["id"])
        if not _is_number(n.get("x")) or not _is_number(n.get("y")):
            errors.append(f"nodes[{i}] needs numeric x,y")
        if n.get("kind") and n["kind"] not in NODE_KINDS:
            errors.append(f"nodes[{i}].kind {n['kind']!r} is not a known kind")

    for i, e in enumerate(layout.get("edges") or []):
        if e.get("a") not in node_ids:
            errors.append(f"edges[{i}].a {e.get('a')!r} references a missing node")
        if e.get("b") not in node_ids:
            errors.append(f"edges[{i}].b {e.get('b')!r} references a missing node")

    bin_type_names = set((layout.get("binTypes") or {}).keys())
    for i, r in enumerate(layout.get("racks") or []):
        if not isinstance(r.get("id"), str):
            errors.append(f"racks[{i}].id must be a string")
        if r.get("dir") not in RACK_DIRS:
            errors.append(f"racks[{i}].dir must be one of {sorted(RACK_DIRS)}")
        if not isinstance(r.get("bays"), int) or r.get("bays", 0) < 1:
            errors.append(f"racks[{i}].bays must be a positive integer")
        if not isinstance(r.get("levels"), int) or r.get("levels", 0) < 1:
            errors.append(f"racks[{i}].levels must be a positive integer")
        level_heights = r.get("levelHeights")
        if not isinstance(level_heights, list):
            errors.append(f"racks[{i}].levelHeights must be an array")
        else:
            if len(level_heights) != r.get("levels", 0):
                errors.append(
                    f"racks[{i}].levelHeights.length ({len(level_heights)}) "
                    f"must equal levels ({r.get('levels')})"
                )
            if not all(_is_number(h) and h > 0 for h in level_heights):
                errors.append(f"racks[{i}].levelHeights must contain only positive numbers")
        if r.get("type") not in bin_type_names:
            errors.append(f"racks[{i}].type {r.get('type')!r} is not a defined bin type")

    return errors
