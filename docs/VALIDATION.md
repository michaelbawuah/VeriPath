# NYC frequency experiment · 7 October 2026

All travel-mode forecasts are withheld. Driving and cycling lose to the selected baseline. The pedestrian gain is marginal, its geographic-block uncertainty interval includes no gain, and the highest prediction decile underestimates observed reports by more than a factor of two. These results do not validate safer-route recommendations.

| Mode | Model deviance | Baseline deviance | Improvement | 95% block interval | Release |
|---|---:|---:|---:|---|---|
| auto | 0.17000 | 0.16346 | -4.0% | -5.8% to -2.3% | Withheld |
| bicycle | 0.06303 | 0.06188 | -1.9% | -4.7% to 0.9% | Withheld |
| pedestrian | 0.09216 | 0.09236 | 0.2% | -1.5% to 1.9% | Withheld |

The dataset contains 196,266 distinct injury/fatal crash reports from 2021–2025. The matching pipeline retains all road geometries as competitors, but excludes ambiguous, unsupported-level and quarantined assignments. The final fitting population contains 144543 eligible ground-level segments, including zero assigned-report segments. Only 6969 of 37420 2025 reports are eligible strong assignments across all modes. Unassigned reports are excluded evidence, not known zero crashes.

2021 provides history, 2022–2023 training, 2024 tuning, and 2025 the previously examined temporal audit. Spatial coefficient-transfer testing excludes fixed 2 km blocks from fitting and tuning; local past counts remain available. No 2026 labels are used. Current road geometry remains a retrospective limitation.

Live browser verification: 120 Broadway → Grand Central, driving, returned three routes. Corridor-based road loading completed without the record-limit warning. Address choices require explicit selection. Forecasts remained withheld in the evidence dialog. Automated checks cover coverage, geometric invariance, aliases, grade conflicts, provider outages, transfer-limit pagination, off-route counts, future-label exclusion and release gating. C++ tests compile in C++23.

Full metrics, calibration bins, exclusions and code/data hashes: [`public/model/validation.json`](../public/model/validation.json). Reproduction: [`ml/README.md`](../ml/README.md). GitHub Actions passed for commits `fac4ab0` and `8616f5d`, including the production build. Repository: https://github.com/michaelbawuah/VeriPath. Current releases must verify their own commit’s run rather than inherit those results.


## Matching diagnostics and review continuation · 8 October 2026

The additive diagnostic release compared every original assignment field for 180,811 coordinate-eligible reports against commit `8616f5dc717c12de341305ec35ee1460e17f3a65`: zero changed assignments. Coverage remains 84,500 intersection contexts, 29,368 strong street segments, 66,388 ambiguous records, 555 without nearby candidate roads, 13,492 missing coordinates and 1,963 outside audit bounds. One primary reason is recorded per withheld report using fixed precedence. A reason explains a rule; it is not a calibrated match confidence.

The reviewer workspace supports validated import/resume, multi-ID selections, retained per-case drafts, case/ID search and next-unrecorded navigation. Reviewer identity stays fixed once decisions are recorded. Saved decisions and drafts are separate; export contains recorded decisions only. Conflicting imports require a visible choice. Snapshot mismatch, malformed labels, unknown candidate IDs and invalid review timestamps are rejected before import changes state. Reviewer decisions stay in the browser session and exported files, not the server. No independent review labels or population accuracy were fabricated.

Automated verification includes diagnostic C++/browser parity for the frozen usable-coordinate sample, the full assignment comparison, synthetic review round-trip/conflict tests and Python evaluator safeguards. Browser checks confirmed the quality reason table and review-map rendering, retained drafts after next/previous navigation, multiple selected source IDs, reviewer-code locking after recording, next-unrecorded navigation, export warnings and downloaded JSON with unchanged IDs/timestamp. The import file-picker timed out and the preview session ended before import/resume could be verified in the browser; automated schema/import tests passed. Synthetic browser decisions were not published as independent labels. Mobile visual QA remains outstanding. Forecasts remain disabled.
