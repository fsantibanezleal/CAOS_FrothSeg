"""The browser twins must carry the same constants as the Python engine.

C1, C3 and C4 exist twice: once in `fslab.science.segment` and once in
`frontend/src/classical/methods.ts`, which runs the same method in the browser with no model
download. Nothing enforced that the two copies agreed on their numbers.

On 2026-08-01 that cost a real defect. C3's flooding surface was adopted in both copies while the
h-maxima DEPTH that seeds C3's markers stayed at 0.06 in both; when that depth was later re-selected
to 0.12, only the Python side moved at first. (The original write-up called the stale depth a unit
error. It was not one, and that claim is withdrawn: see CAOS_MANAGE plans/frothseg/
research-2026-07-31/r2-correction-2026-08-02.md. What this test exists for is unaffected.) `verification/classical-live-parity.json` stayed green throughout, because parity compares
the twins to EACH OTHER and they were wrong together. A cross-language agreement check cannot catch
a value that is stale on both sides; only a check against the single source of truth can, which is
what this file is.

The test reads the literals straight out of the TypeScript rather than out of a mirrored table,
because a mirrored table is one more copy to drift.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.science import segment  # noqa: E402

TWIN = ROOT / "frontend/src/classical/methods.ts"

# Each entry: the Python constant, and a regex whose first group is the literal the TypeScript
# twin passes for that same quantity. Keep the regexes anchored to the call that uses them, so a
# renamed helper fails loudly instead of matching something unrelated.
BINDINGS = [
    (
        "C3_H_MAXIMA",
        r"function\s+watershedHmax\b.*?hMaxima\(\s*gray\s*,\s*w\s*,\s*h\s*,\s*([0-9.]+)\s*\)",
        float,
    ),
    (
        "C5_H_MINIMA",
        r"function\s+watershedHmin\b.*?hMaxima\(\s*norm\s*,\s*w\s*,\s*h\s*,\s*([0-9.]+)\s*\)",
        float,
    ),
    (
        "C4_MIN_DISTANCE",
        r"function\s+watershedDt\b.*?peakLocalMax\(\s*dist\s*,\s*w\s*,\s*h\s*,\s*([0-9.]+)\s*,",
        int,
    ),
    # The three common-mode foreground constants. EVERY method on both sides consumes these, so a
    # drift in one moves all seven at once. They were not bound at all until 2026-08-02, which made
    # this file's own premise only two-thirds true.
    (
        "FOREGROUND_OTSU_FACTOR",
        r"function\s+foreground\b.*?otsuThreshold\(gray\)\s*\*\s*([0-9.]+)",
        float,
    ),
    (
        "FOREGROUND_HOLE_MAX_SIZE",
        r"function\s+foreground\b.*?fillSmallHoles\(fg,\s*w,\s*h,\s*([0-9]+)\)",
        int,
    ),
    (
        "FOREGROUND_OBJECT_MAX_SIZE",
        r"function\s+foreground\b.*?removeSmall\(fg,\s*w,\s*h,\s*([0-9]+)\)",
        int,
    ),
    # C7 is offline-replay in the App, but the twin exists and can drift like any other copy.
    (
        "C7_SEAM_RADIUS",
        r"function\s+valleyEdge\b.*?blackTophat\(gray,\s*w,\s*h,\s*([0-9]+)\)",
        int,
    ),
]


@pytest.fixture(scope="module")
def twin_source() -> str:
    if not TWIN.exists():
        pytest.skip(f"{TWIN} not present")
    return TWIN.read_text(encoding="utf-8")


@pytest.mark.parametrize("constant,pattern,cast", BINDINGS, ids=[b[0] for b in BINDINGS])
def test_browser_twin_matches_the_python_constant(constant, pattern, cast, twin_source):
    match = re.search(pattern, twin_source, re.S)
    assert match, (
        f"could not find the TypeScript literal for {constant} in {TWIN.name}. If the twin was "
        "refactored, update the regex here rather than deleting the check: this test is the only "
        "thing that ties the browser engine to the Python one."
    )
    twin_value = cast(match.group(1))
    engine_value = cast(getattr(segment, constant))
    assert twin_value == engine_value, (
        f"{constant}: the Python engine ships {engine_value} and the browser twin passes "
        f"{twin_value}. The twins would disagree in the App, and "
        "verification/classical-live-parity.json cannot catch it because parity compares the twins "
        "to each other, not to the engine."
    )
