# NYC frequency experiment · 7 October 2026

All travel-mode forecasts are withheld. Driving and cycling lose to the selected baseline. The pedestrian gain is marginal, its geographic-block uncertainty interval includes no gain, and the highest prediction decile underestimates observed reports by more than a factor of two. These results do not validate safer-route recommendations.

| Mode | Model deviance | Baseline deviance | Improvement | 95% block interval | Release |
|---|---:|---:|---:|---|---|
| auto | 0.17000 | 0.16346 | -4.0% | -5.8% to -2.3% | Withheld |
| bicycle | 0.06303 | 0.06188 | -1.9% | -4.7% to 0.9% | Withheld |
| pedestrian | 0.09216 | 0.09236 | 0.2% | -1.5% to 1.9% | Withheld |

The dataset contains 196,266 distinct injury/fatal crash reports from 2021–2025. The matching pipeline retains all road geometries as competitors, but excludes ambiguous, unsupported-level and quarantined assignments. The final fitting population contains 144543 eligible ground-level segments, including zero assigned-report segments. Only 6969 of 37420 2025 reports are eligible strong assignments across all modes. Unassigned reports are excluded evidence, not known zero crashes.

2021 provides history, 2022–2023 training, 2024 tuning, and 2025 the temporal test. Spatial coefficient-transfer testing excludes fixed 2 km blocks from fitting and tuning; local past counts remain available. No 2026 labels are used. Current road geometry remains a retrospective limitation.

Live browser verification: 120 Broadway → Grand Central, driving, returned three routes. Corridor-based road loading completed without the record-limit warning. Address choices require explicit selection. Forecasts remained withheld in the evidence dialog. Automated checks cover coverage, geometric invariance, aliases, grade conflicts, provider outages, transfer-limit pagination, off-route counts, future-label exclusion and release gating. C++ tests compile in C++23.

Full metrics, calibration bins, exclusions and code/data hashes: [`public/model/validation.json`](../public/model/validation.json). Reproduction: [`ml/README.md`](../ml/README.md). Remote GitHub Actions has not run; repository creation requires GitHub browser sign-in.
