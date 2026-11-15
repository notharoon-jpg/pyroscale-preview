# PyroScale

Phoenix Protocol built PyroScale for the 2026 NASA Space Apps Challenge. The globe shows satellite thermal-anomaly detections in monthly 3° cells. Explore has its own route at `explore.html`.

## Run the release

Start a static server in the repository root and open [the local site](http://127.0.0.1:8765/).

```sh
python -m http.server 8765 --bind 127.0.0.1
```

The observation history, matching forecast, browser dependencies and Earth textures are bundled. Optional Open-Meteo layers request weather and air-quality context at the selection centre. The existing city directory enables offline navigation. Its original source release was unrecorded and its points never assign detections to countries. The Data Lab imports numeric CSVs by cell and the analyst evaluates the selected data in the browser. The Team editor stores drafts in the current browser and can export a replacement `team.json`.

## Source observations and October 2026

The pipeline reads the global NASA FIRMS point observations from the [Portolan public mirror](https://source.coop/portolan-mirrors/firms-catalog). The [FIRMS archive](https://firms.modaps.eosdis.nasa.gov/download/) is the upstream source. Terra MODIS uses confidence ≥30. Suomi-NPP and NOAA-20 VIIRS use nominal and high confidence. The products retain all available anomaly types, since the near-real-time (NRT) files omit type attribution. Platform, UTC acquisition timestamp and coordinates identify exact duplicates within a stream. If both processing streams supply a platform/day, science processing takes precedence. No additive updates are used. Re-running an archive month reconstructs it from its point detections.

October 2026 contains **1,443,820 provisional Suomi-NPP detections** across all 31 archive dates. Science processing can revise provisional counts. NOAA stopped distributing Suomi-NPP VIIRS on November 2, 2026. The historical reference therefore remains Suomi-NPP and forward forecasts target NOAA-20. [NOAA cessation notice](https://www.nesdis.noaa.gov/news/update-3-cessation-of-suomi-national-polar-orbiting-partnership-s-npp-data-users-november-02-2026-1540-utc-and-decommissioning-issued-october-30-2026-1400-utc)

Archive-day checks establish the presence of detections each UTC day at the platform level. They cannot assess cloudy regions, missed overpasses, orbital drift or cell-level clear-sky exposure. A zero means no retained detections in an archive-complete month. Missing archive days suppress the affected platform-month in the globe. Individual detections are flagged pixels. Overpasses can revisit the same event and the archive can include industrial heat, volcanic activity and other sources.

## Historical sensor comparison

We pair fixed Terra and Suomi-NPP counts for the same cell and UTC calendar month. Both platforms must have science-processed archive rows on every day of the month. This pairs observation windows. It does not match individual overpasses or account for clear-sky exposure, pixel size or the satellites’ different local overpass times.

The Poisson LightGBM candidate uses Terra counts, latitude, cyclic longitude and season. The benchmark scales Terra by the total Suomi-NPP-to-Terra ratio learned in the training split. The earliest months train the models. Three later disjoint 12-month groups handle development, calibration and final testing. A deterministic fifth of 15° spatial blocks is excluded from fitting, development and interval calibration, then evaluated jointly with the forward-time holdout. The report includes raw skill, temporal and joint spatial scores, and interval coverage including positive-count cells.

Historical estimates are experimental even when holdout performance improves. They are confined to cells and Terra count ranges represented in fitting. Geography held out of fitting remains unavailable in the backcast. Calibration uses residuals from matched months, so pre-2012 coverage cannot be measured directly. The observed Terra count series is also available.

## NOAA-20 outlook

The 1–24 month outlook predicts NOAA-20 science-processed detections. History estimates, NRT observations and observations from other spacecraft are excluded from learning. Each rolling origin uses records through five months before that origin, a fixed release-lag approximation. The model refits on a six-month schedule, and training labels must already be available at the fitting cutoff. It predicts each lead directly with target-calendar features and observed lag, rolling and seasonal features. It never inserts its own forecasts into future lags.

The candidate competes against a seasonal median and seasonal naïve. The evaluation windows are lead-specific. The previous phase’s labels must have matured before the next phase’s first information cutoff. A lead gets the preset seasonal median when too few development origins have actual data. The published forecast uses these exact decisions. Test skill is the unmodified value of `1 − MAE / seasonal median MAE`. Negative skill means higher MAE. A zero denominator yields `null`.

Where enough independent forecast origins are available, absolute residuals scaled by the square root of the prediction plus one calibrate a nominal 80% cell-level interval. The test report gives observed coverage, mean interval width and coverage for positive targets. Nearby cells and rolling forecast origins are dependent. The intervals describe empirical holdout performance, with no distribution-free guarantee or calibrated regional total interval. Forecasts cover cells with detections in their preceding five-year NOAA-20 window.

Cells that exceed a NOAA-20 seasonal threshold can be highlighted. A marker shows a grid-cell centre. The scenario lab applies user-entered sensitivity multipliers to cell estimates. The outputs support analysis at the grid scale. Use local authorities for alerts and evacuation guidance.

## Country attribution and schema

Country weights come from intersecting the full extent of each 3° cell with [Natural Earth Admin-0 country polygons](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/), pinned to 5.1.2. The calculation measures spherical equal-area shares, with unassigned area for water, unresolved codes and overlaps. Boundaries reflect Natural Earth’s default map representation. Country-level detection estimates weight cells by area, which assumes detections are uniformly distributed within a cell. City selection uses a containing/nearby cell and does not create city-scale data.

- `pyroscale_data.json` uses schema 2. One 3° cell ID identifies a unique row and column in the grid. All per-cell arrays align with the inclusive `YYYY-MM` date range. `terra`, `viirs` (Suomi-NPP) and `noaa20` identify fixed-platform counts. `r` is the instrument-changing history. `h` is the reference history including experimental estimates where available. `backcast_lo` and `backcast_hi` are cell-level backcast bounds. A cell is omitted only if there were no archive rows for any included platform and period. Missing values are `null`.
- `pyroscale_forecast.json` pairs to the observation `dataset_id` and exact issue month. Each included cell has 24 entries for point, lower, upper and seasonal median. `methods` and `evaluation_status` are arrays indexed by lead. Missing intervals are `null`.
- `pyroscale_harmonization_report.json` and `pyroscale_forecast_report.json` record coverage, splits, baselines and raw metrics. The observation artifact records archive coverage, aggregate hashes and the boundary source/hash.

## Rebuild and verify

Use Python 3.14 and the pinned dependencies. Inputs can be downloaded as needed. A full pass reads only the required Parquet columns, but can take significant time. The aggregator stages one atomic gzip artifact per year. Use `--resume` for a retry with the same scope and input revisions. Use a fresh directory for a different platform set or a revised archive. The source mirror updates its current-year partitions, so regenerated results can change when the upstream snapshot changes.

```sh
python -m pip install -r requirements.txt
python aggregate_firms.py --first 2001 --last 2026 --output archive --resume
python add_places.py --boundaries inputs/ne_10m_admin_0_countries.geojson --out inputs/geography.json
python build_pyroscale_data.py --daily archive --geography inputs/geography.json --start 2001-01 --end 2026-10
python forecast_pyroscale.py
python validate_release.py
python -m unittest discover -s tests -v
npm install --no-save playwright@1.65.1
npx playwright install chromium
node tests/smoke.cjs
```

The boundary file is [the pinned Natural Earth GeoJSON](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/f1890d9f152c896d250a77557a5751a93d494776/geojson/ne_10m_admin_0_countries.geojson). The browser smoke test starts its own local server and exercises both views, navigation, filters, draw and zoom controls, place search, export, model display, scenarios, missing data and mobile layout. Test-only fixtures are identified in the tests.

We acknowledge NASA’s Fire Information for Resource Management System (FIRMS), part of NASA’s Earth Observing System Data and Information System (EOSDIS). See [imagery credits](assets/README.md).
