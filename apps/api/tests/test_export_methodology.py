"""Drift guard for the methodology export (see scripts/export_methodology.py).

Regenerates the methodology document in-process and compares it against the
committed apps/web/lib/methodology-data.json, field by field, ignoring only
the two fields that are expected to change on every run (generated_at is a
timestamp; generated_from tracks HEAD, which moves as commits land). If a
formula, threshold, band, weight or benchmark count drifts, this test fails
— the fix is to re-run `python scripts/export_methodology.py` and commit the
new JSON alongside whatever engine change caused the drift, not to edit the
JSON by hand.
"""
import json
import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from export_methodology import build_methodology, OUTPUT_PATH  # noqa: E402

_VOLATILE_KEYS = {"generated_at", "generated_from"}


def _without_volatile(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k not in _VOLATILE_KEYS}


def test_methodology_json_is_committed():
    assert OUTPUT_PATH.exists(), (
        f"{OUTPUT_PATH} is missing — run `python scripts/export_methodology.py` and commit it."
    )


def test_methodology_json_regenerates_identical_to_committed():
    committed = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    fresh = build_methodology()

    assert _without_volatile(fresh) == _without_volatile(committed), (
        "methodology-data.json is stale: the engine's real formulas/thresholds/"
        "bands no longer match the committed export. Re-run "
        "`python scripts/export_methodology.py` (from apps/api) and commit the result."
    )


def test_methodology_json_is_deterministic_across_runs():
    """Two builds in the same process (same HEAD, same engine) must be
    byte-identical apart from the timestamp — no ordering nondeterminism
    (dict/set iteration, float formatting) leaking into the output."""
    first = _without_volatile(build_methodology())
    second = _without_volatile(build_methodology())
    assert first == second


def test_methodology_ratios_cover_every_ratio_def():
    from app.services.ratios import RATIO_DEFS

    doc = build_methodology()
    exported_keys = {r["key"] for r in doc["ratios"]}
    assert exported_keys == {d.key for d in RATIO_DEFS}


@pytest.mark.parametrize("top_level_key", [
    "ratios", "category_labels", "category_order", "altman", "piotroski",
    "beneish", "health_bands", "confidence", "benchmarks",
])
def test_methodology_json_has_expected_top_level_shape(top_level_key):
    doc = build_methodology()
    assert top_level_key in doc


def test_beneish_recovered_formula_is_verified_linear_off_derivation_points():
    """The Beneish coefficient recovery (export_methodology._beneish_coefficients)
    calls export_methodology._verify_beneish_linearity on every build, which
    checks the recovered affine formula against three fresh Inputs
    combinations that were never sampled during derivation (see that
    function's own docstring) — a real linearity guard, not just a
    two-point-per-index finite difference. build_methodology() already
    exercises this path (it would raise AssertionError and fail every other
    test in this file if the guard ever failed); this test names that
    behavior explicitly so a regression here reads as "Beneish linearity
    guard failed", not an opaque crash in an unrelated-looking test.
    """
    from export_methodology import _beneish_coefficients, _verify_beneish_linearity

    coefficients, intercept = _beneish_coefficients()
    # Re-running the guard here (not just relying on the one already run
    # inside _beneish_coefficients) makes the assertion this test is
    # actually about explicit in its own stack trace.
    _verify_beneish_linearity(coefficients, intercept)
