"""DORMANT FastAPI backend (ADR-0057). Present but inactive: most products are static deterministic-replay and
never run this. Activate only on an ADR-0002 trigger. A thin read-only layer over data/derived · never a
re-implementation of the engine."""

# The API reports `fslab.__version__` (see app/main.py), which is the release version. This
# constant is template residue and is kept only so the package stays importable standalone.
__version__ = "0.06.001"
