#!/usr/bin/env python3
"""Fail the build if tracked product content contains an EM-DASH or an EMOJI (ADR-0067).

Felipe's standing rule for every product: no emojis and no em-dashes in repo content. Both read as
an AI tell and are banned from product content (code, docs, UI strings, commit-tracked files alike), ADR-0067.
This guard enforces it structurally so no product, and the template itself, can drift.

What it flags (precise, to avoid punishing legitimate glyphs):
  - EM-DASH  U+2014  and HORIZONTAL BAR U+2015  (the banned dashes).
  - EMOJI: any codepoint in the Supplementary emoji/pictograph planes U+1F000..U+1FAFF, plus the
    emoji-presentation selector U+FE0F. This catches the pictographic emojis while intentionally
    NOT touching functional glyphs products do use: the info mark U+24D8 (the ADR-0058 modal button),
    the middot U+00B7 (Felipe's preferred separator), arrows like U+2197, check/cross marks, stars.

Not flagged: the ASCII double hyphen "--" (ubiquitous and legitimate in CLI flags and code) and the
en-dash U+2013. The rule as stated is em-dash + emoji; keep enforcement to exactly that.

Scanned set = git-tracked text files only. Exit 1 on any hit, printing file:line:col.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SELF = "scripts/check_content_standards.py"

BANNED_DASHES = {0x2014, 0x2015}  # em dash, horizontal bar
EMOJI_SELECTOR = 0xFE0F

# Directional arrows read as a machine-generated tell when they stand in for a word in a sentence
# ("instance contours -> morphometry -> temporal signal" was shipped on the Introduction page).
# ADR-0067 as written lets every arrow through, and it says so deliberately, so this is a scoped
# TIGHTENING rather than a reinterpretation: arrows are banned only in USER-VISIBLE product strings
# under frontend/src, where prose lives. They remain allowed in developer documentation, where
# "preprocess -> train -> infer" is stage notation and "Settings -> Pages -> Source" is a UI path,
# neither of which is prose. U+2197 stays allowed everywhere: it is the external-link affordance
# ADR-0067 explicitly sanctions, not a word substitute.
BANNED_ARROWS = {0x2190, 0x2192, 0x2194, 0x21D2, 0x21D0, 0x27F6, 0x27F5}
PROSE_ROOTS = ("frontend/src/",)


def is_prose_file(rel: str) -> bool:
    """User-visible product strings live here; developer notation does not."""
    return rel.startswith(PROSE_ROOTS)


def is_emoji(cp: int) -> bool:
    return 0x1F000 <= cp <= 0x1FAFF or cp == EMOJI_SELECTOR


TEXT_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".md", ".json",
    ".css", ".html", ".yml", ".yaml", ".toml", ".txt", ".cfg", ".ini", ".svg",
}


def tracked_files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    )
    return [ln.strip() for ln in out.stdout.splitlines() if ln.strip()]


def main() -> int:
    hits: list[str] = []
    for rel in tracked_files():
        if rel == SELF or Path(rel).suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            lines = (ROOT / rel).read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            continue
        for lineno, line in enumerate(lines, 1):
            for col, ch in enumerate(line, 1):
                cp = ord(ch)
                if cp in BANNED_DASHES:
                    hits.append(f"  {rel}:{lineno}:{col}  em-dash (U+{cp:04X})")
                elif is_emoji(cp):
                    hits.append(f"  {rel}:{lineno}:{col}  emoji (U+{cp:04X} {ch!r})")
                elif cp in BANNED_ARROWS and is_prose_file(rel):
                    hits.append(
                        f"  {rel}:{lineno}:{col}  arrow in product prose (U+{cp:04X} {ch!r})"
                    )

    if not hits:
        print("check_content_standards: OK, no em-dash or emoji in tracked content, and no arrow in product prose.")
        return 0

    print("::error::banned characters found (no em-dash, no emoji in product content, ADR-0067):")
    for h in hits:
        print(h)
    print("\nReplace an em-dash with a comma, colon, semicolon, period, parentheses, or a middot "
          "as the sense requires. Remove emojis. This applies to code, docs, and UI strings alike.")
    print("Replace an arrow in a user-visible string with the word it stands for: 'then', 'to', "
          "'produces', or a comma. Arrows stay legal in developer docs as stage notation.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
