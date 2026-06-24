"""Validate the shipped default layout and the validator itself."""

import copy
import json

from server import APP_DIR
from server.layout_schema import SCHEMA_VERSION, from_db_connect, validate_layout


def load_default():
    return json.loads((APP_DIR / "data" / "default_layout.json").read_text(encoding="utf-8"))


def test_default_layout_is_valid():
    state = from_db_connect(load_default())
    errors = validate_layout(state)
    assert errors == [], errors


def test_default_layout_is_current_schema_version():
    assert load_default()["editor"]["schemaVersion"] == SCHEMA_VERSION


def test_rejects_unknown_bin_type_in_rack():
    state = from_db_connect(load_default())
    state["racks"][0]["type"] = "DOES_NOT_EXIST"
    errors = validate_layout(state)
    assert any("is not a defined bin type" in e for e in errors)


def test_rejects_edge_to_missing_node():
    state = from_db_connect(load_default())
    state["nodes"].append({"id": "N1", "kind": "junction", "x": 0, "y": 0})
    state["nodes"].append({"id": "N2", "kind": "junction", "x": 1, "y": 1})
    state["edges"].append({"a": "N1", "b": "N2", "ramp": False})
    state["edges"][0]["a"] = "NO-SUCH-NODE"
    errors = validate_layout(state)
    assert any("references a missing node" in e for e in errors)


def test_rejects_wrong_schema_version():
    state = from_db_connect(load_default())
    state["schemaVersion"] = 1
    errors = validate_layout(state)
    assert any("schemaVersion must be" in e for e in errors)


def test_rejects_non_object():
    assert validate_layout([1, 2, 3]) == ["layout is not an object"]


def test_bool_is_not_a_number():
    # guards against True/False slipping through numeric checks
    layout = copy.deepcopy(load_default())
    layout["zones"][0]["x"] = True
    errors = validate_layout(layout)
    assert any("zones[0].x must be a number" in e for e in errors)


# ── bayLevelOverrides validation ─────────────────────────────────────────────


def _make_state_with_blo(blo):
    """Return an editor-native state where racks[0] has bayLevelOverrides=blo."""
    state = from_db_connect(load_default())
    state["racks"][0]["bayLevelOverrides"] = blo
    return state


def test_bayLevelOverrides_empty_is_valid():
    errors = validate_layout(_make_state_with_blo({}))
    assert errors == [], errors


def test_bayLevelOverrides_valid_entry_is_accepted():
    blo = {"0": {"levels": 3, "levelHeights": [4.0, 4.0, 4.0]}}
    errors = validate_layout(_make_state_with_blo(blo))
    assert errors == [], errors


def test_bayLevelOverrides_rejects_non_object():
    state = from_db_connect(load_default())
    state["racks"][0]["bayLevelOverrides"] = [1, 2, 3]
    errors = validate_layout(state)
    assert any("bayLevelOverrides must be an object" in e for e in errors)


def test_bayLevelOverrides_rejects_levels_zero():
    blo = {"1": {"levels": 0, "levelHeights": []}}
    errors = validate_layout(_make_state_with_blo(blo))
    assert any("levels must be a positive integer" in e for e in errors)


def test_bayLevelOverrides_rejects_levelHeights_length_mismatch():
    blo = {"1": {"levels": 2, "levelHeights": [3.0]}}
    errors = validate_layout(_make_state_with_blo(blo))
    assert any("levelHeights.length must equal levels" in e for e in errors)


def test_bayLevelOverrides_rejects_non_positive_height():
    blo = {"0": {"levels": 1, "levelHeights": [0.0]}}
    errors = validate_layout(_make_state_with_blo(blo))
    assert any("must contain only positive numbers" in e for e in errors)


def test_bayLevelOverrides_survives_from_db_connect_round_trip():
    layout = copy.deepcopy(load_default())
    layout["racks"][0]["bayLevelOverrides"] = {"2": {"levels": 1, "levelHeights": [3.5]}}
    state = from_db_connect(layout)
    assert state["racks"][0]["bayLevelOverrides"] == {"2": {"levels": 1, "levelHeights": [3.5]}}
