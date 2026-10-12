# Contributing to VeriPath

VeriPath starts with NYC, then additional large US cities, followed by locally
validated pilots in Ghana and Nigeria. Introduce a city data/provider adapter
before extending NYC-specific coverage or matching rules.

Prefer C++23; C++ changes must use C++20 or later. Run the affected matcher,
TypeScript, review-workspace, and model checks listed in the
[README](README.md#run-and-verify).

Raw collision counts, clusters, and uncalibrated estimates are historical
context. Do not describe them as crash probabilities or demonstrated route
safety. Keep reporting gaps, geometric ambiguity, coverage, and withheld model
results visible.

Preserve source attribution, provider privacy boundaries, frozen audit hashes,
and the independent-review protocol in
[docs/REVIEW_GUIDE.md](docs/REVIEW_GUIDE.md). Preserve the distinction between
automated checks, independent human review, and future acceptance work.
