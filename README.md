# VeriPath

NYC-first route exploration with historical collision context. Expansion starts with additional large US cities, followed by locally validated pilots in Ghana and Nigeria.

## NYC prototype: evidence quality milestone

- Real driving, cycling and walking routes from Valhalla; up to two alternatives when the provider returns them.
- NYC GeoSearch address selection, landmark shortcuts and map pins, route selection, time/distance comparison and detour filtering.
- Distinct NYC police-reported crashes where users of the chosen mode were injured or killed, during 2024–2025. Approximate 60-meter route proximity in meters, independent of polyline sampling density.
- Official LION roadbed matching with street aliases, grade-conflict checks, ambiguous assignments and route coverage. Named shared-node context is counted separately and requires connected route approach/exit matches.
- Fixed-priority explanations for withheld matches, preserving all 180,811 coordinate-eligible assignments against the preceding release.
- An evidence quality page covering 196,266 injury/fatal reports from 2021–2025, plus a 260-case source-only review workspace with validated import/resume, retained drafts, multi-ID selections and case search, independent-review evaluator and frozen artifact hashes. Coverage is 58.0%; matching accuracy remains **Not evaluated**.
- C++23 offline matcher and a reproducible annual frequency experiment using complete 2021–2025 injury/fatal reports. Forecasts are withheld unless accuracy, uncertainty and calibration checks pass.
- Interactive OpenStreetMap, individual crash reports and an evidence explanation.
- Official borough polygons restrict coverage; New Jersey locations are rejected.
- Optional page-scoped WebMCP tools reuse visible UI actions. This browser did not expose a supported registration context, so integration validation was unavailable.

This version does not predict individual crash probabilities or rank a route as safer. Nearby counts are not adjusted for distance, traffic exposure, reporting gaps or changes to road design. Parallel roads and different road levels may be included. Missing coordinates are excluded from route markers but remain in the full matching-audit coverage denominator. Injury and fatality totals on markers describe all people in the incident. Route times exclude live traffic. The record limit is 10,000; incomplete results are labelled.

## Run and verify

Use Node 22.13 or newer and pnpm. Install dependencies, then `pnpm dev`. `pnpm build` emits the Cloudflare Worker. The managed Sites environment uses its supervised preview instead of starting the server directly.

Run `node scripts/verify-veripath.mjs`, `node scripts/verify-reviews.mjs` and `pnpm exec tsc --noEmit`. Compile `engine/tests/road_matcher_test.cpp` with `g++ -std=c++23 -O2 -Wall -Wextra -Werror`, then execute it. Run `python -m unittest discover -s ml`. GitHub Actions configuration is in `.github/workflows/ci.yml`; the repository is `michaelbawuah/VeriPath`. Local checks passing does not establish a remote GitHub Actions result. Tests also cover named junctions, disconnected crossings, ground/alias ambiguity, actual route traversal, parallel routes, endpoint exclusions and independent review safeguards. Tests cover geographic coverage, meter-based geometry, route sampling invariance, duplicate records, detour boundaries, invalid requests and partial provider outages. Live integration was also checked against both providers. Earlier browser checks covered map rendering and visible route results. Browser checks on the quality/review pages confirmed map rendering, the withholding-reason table, retained drafts across cases, multiple selected road IDs, fixed reviewer identity, next-unrecorded navigation, the unsaved-draft export warning and downloaded JSON preserving both IDs and the original timestamp. The subsequent browser import/resume round trip passed, including preserved IDs/timestamp, both conflict choices and rejection of a different audit. Responsive CSS and keyboard checks passed at 320, 390 and 768 pixel frame widths; physical mobile-device/touch and mobile Safari checks remain outstanding. Reviewer guidance is built into the page; the complete protocol is in [docs/REVIEW_GUIDE.md](docs/REVIEW_GUIDE.md). The production build and automated checks passed, including 229 frozen C++/browser associations, route-intersection regression fixtures and 14 Python tests.

## Providers and privacy

Routing: https://valhalla1.openstreetmap.de/route, a FOSSGIS demonstration service. NYC crash source: https://data.cityofnewyork.us/resource/h9gi-nx95.json. Boundary source: https://data.cityofnewyork.us/resource/wh2p-dxnf.geojson, retrieved October 7, 2026, geometry preserved in `lib/nyc-boundary.json`. Tiles: https://tile.openstreetmap.org with visible OpenStreetMap attribution.

The server caches a maximum of 12 successful trip responses for five minutes and uses a per-isolate request interval. A browser fallback queries the same providers if the server cannot reach the router. These controls suit a low-volume private prototype; production needs a contracted or self-hosted router, global rate limiting and a licensed tile service. See https://routing.openstreetmap.de/about.html and https://operations.osmfoundation.org/policies/tiles/.

Route coordinates reach the routing provider and may be logged there. Submitted address text goes to NYC GeoSearch; road queries send route geometry to NYC Planning, and crash queries send a geographic bounding box to NYC Open Data. Tile requests also reveal the viewed area to the tile provider. VeriPath requests no device location permission, requires no personal details and stores no user trip history. It is not a production navigation or emergency response service.

## Structure

`components/planner.tsx` owns trip UI and aborts stale requests. `components/route-map.tsx` renders the map without requiring WebGL. `lib/plan-trip.ts` handles provider responses; `app/api/plan/route.ts` validates and caches requests. `lib/veripath.ts` implements coverage and geometry. A city data/provider adapter should replace NYC-specific logic before adding a city.

## Reproduce the model evaluation

See `ml/README.md`. Download snapshots with `python ml/fetch_data.py --output PATH`, compile `engine/road_matcher.cpp` with C++23, then run the trainer. `public/model/validation.json` contains temporal and geographic-block results, calibration bins, exclusions, code/data hashes and release gates. Targets are annual strongly assigned police reports across entire road segments, not traveler risk. The current models remain disabled; a marginal pedestrian deviance gain fails uncertainty/calibration checks. The 2025 results are a previously examined audit. New 2026 target outcomes have not been used. See `ml/evaluation-protocol.json` for the future-test draft.
