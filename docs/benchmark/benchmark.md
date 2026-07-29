# Benchmark

The benchmark is an offline release artifact. It covers the complete 15-method ladder and an
untouched grouped test split. The companion website only reads the compact result; deployment
never trains or recomputes it.

Two lanes, deliberately kept apart:

- [Matrix and acceptance](01_matrix-and-acceptance.md), the synthetic froth benchmark. Exact
  ground truth by construction, 15 methods x 64 held-out cases, and the acceptance boundaries.
  This is the comparison of record.
- [Real-domain transfer](02_real-domain-transfer.md), the same ladder run unchanged over real
  photographs from an adjacent domain (BBBC038, CC0). It answers only whether the ranking
  survives contact with a real sensor, and it can never support a flotation claim. The release
  gate enforces that separation rather than trusting the reader.
