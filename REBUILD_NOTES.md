# PyroScale rebuild notes

## Rebuilt observations

The release covers **2001-01 through 2026-10** and includes **3,616**
nonempty 3° cells. Every series uses the same calendar. Platforms have separate count histories, UTC
archive-day coverage and explicit missing values. The source is NASA FIRMS via the public Portolan mirror.

The October 2026 rebuild contains **1,443,820 provisional Suomi-NPP detections**. All 31 UTC
dates are present. The old uploaded JSON had 2 malformed cell histories and an additive patch that
left two inconsistent October totals. The rebuilt file uses the archive from scratch, with
exact duplicate control and one processing stream per platform/day.

- NOAA-20 has 100 complete archive months and 95 complete science-processed months in this snapshot.
- Suomi-NPP has 166 complete archive months and 161 complete science-processed months in this snapshot.
- Terra has 301 complete archive months and 297 complete science-processed months in this snapshot.

## Historical harmonization

The model used 158 complete science-processed Terra/Suomi-NPP matched months.
The selected method was **Poisson LightGBM**. LightGBM's held-out MAE skill relative
to a fitted Terra ratio was **+15.8%** in later
months within the fitted footprint and **-9.4%**
in later months within held-out spatial blocks.

Nominal 80% interval coverage was 79.2% in the fitted footprint
and 91.3% in held-out blocks. Coverage on positive targets was
60.6% and 59.6%,
respectively. The earlier estimates are experimental and restricted to the fitted footprint.

## Forward forecast

NOAA ended Suomi-NPP VIIRS delivery on November 2, 2026. The forward target is **NOAA-20 VIIRS**
with **2,504** eligible cells. The release uses Seasonal median for 24 leads.
Cell prediction intervals were calibrated for **21 of 24 leads**. Negative skill is retained.

| Lead (months) | Published method | LightGBM test skill | Published method test skill | Cell interval coverage |
| ---: | --- | ---: | ---: | ---: |
| 1 | Seasonal median | -23.1% | +0.0% | 80.3% |
| 3 | Seasonal median | -22.1% | +0.0% | 81.7% |
| 6 | Seasonal median | -23.2% | +0.0% | 81.9% |
| 12 | Seasonal median | -26.7% | +0.0% | 81.6% |
| 24 | Seasonal median | -18.9% | +0.0% | 83.9% |

Skill is relative to a seasonal median. Holdout coverage describes cell counts on the
evaluated origins. The browser uses the same selected methods stored in the release data.

## Site and geographic repairs

- The globe distinguishes observed detections, provisional months, experimental backcasts and forecasts.
- Country estimates use area intersections against pinned Natural Earth polygons. Water and
  unresolved overlaps keep an unassigned share. City lookup is navigation within coarse cells.
- The activity layer compares NOAA-20 projections with the seasonal count distribution.
  Scenarios are an arithmetic sensitivity calculation. Map markers show cell centres, and
  GeoJSON exports give each cell's 3° polygon.
- File loading validates IDs, dates and schema. Failed observation loads show an empty globe and
  an error. File exports include source and record information, method and cell-level bounds where
  available. The 3D view and analysis panel have separate fallback behavior.

## Remaining limitations

Archive-day coverage cannot measure cloud, swath coverage, missed passes or clear-land exposure.
Footprint and observing-time differences limit transfer across platforms and historical eras.
Country totals assume uniform distribution of detections within each cell. A satellite detection
can come from several kinds of heat sources, and repeated detections can belong to one event.
Regional forecast totals have no calibrated interval. Optional weather layers depend on Open-Meteo.

See `README.md` for methods and commands, and the two JSON reports for the complete holdout metrics
and exact origin dates. The release dataset ID is `cc2234c13a6eb54708bbfbe8ef8ddc62a699268d49f8e2d22048f82077c07178`.
