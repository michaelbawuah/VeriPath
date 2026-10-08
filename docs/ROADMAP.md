# VeriPath expansion

## Geographic order

1. Validate NYC with local users and road-safety partners.
2. Add major US cities individually after auditing their crash data, geographic coverage and transport-mode fields. Select the next city by evidence quality and pilot access.
3. Develop locally validated pilots in Ghana and Nigeria, beginning with a partner-backed city such as Accra or Lagos. This is a future expansion, not currently supported coverage.

## Move from context to safety-aware routing

Map crash locations to road segments and intersections, preserving confidence in uncertain assignments. Add street design, crossings, bicycle infrastructure, speed limits, weather and time of day where reliable data exists. Do not use post-crash injury outcome as a feature for predicting future severity.

Compare exposure-aware baselines before advanced models. Split evaluation by future time periods and held-out locations to prevent leakage. Assess calibration, reporting bias and performance for driving, cycling and walking separately. Present uncertainty and incomplete coverage. K-means clusters and proximity counts alone are not crash probabilities.

Constrain route recommendations by road access, mode restrictions, travel time and data coverage. Validate route-level claims with partners and prospective testing before making claims about preventing crashes. Keep a user-controlled detour budget.

## Local adaptation

Use city adapters for coordinate systems, road graphs, mode definitions, incident severity and freshness. Source local police, transport authority and hospital data through suitable agreements; reconcile duplicate incidents and document under-reporting. Treat community reports as unverified until checked. Plan low-bandwidth access and test local languages, road conditions and routes with local users. Do not transfer an NYC-trained model unchanged.

## Before public rollout

Add general address search, accessible non-map location entry, privacy controls and deliberate location permission. Replace demonstration routing/tiles with production services, add persistent ingestion and monitoring, and evaluate mobile accessibility. Keep geography, provider outages and model uncertainty visible.
