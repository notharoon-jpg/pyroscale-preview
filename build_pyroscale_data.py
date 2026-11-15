"""Build an auditable fixed-platform monthly FIRMS record and transfer experiment."""

import argparse
import calendar
import csv
import gzip
import hashlib
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from pyroscale_core import (
    ARCHIVE, GRID, SCHEMA, SOURCE, bounds, cell_centers, digest, encode, fit_poisson,
    month_index, month_label, nullable, residual_quantile, scores, write_json,
)

PLATFORMS = ("Terra", "Suomi-NPP", "NOAA-20")
FIRST_VIIRS = month_index("2012-02")


def load_archive(directories, first, last):
    data = np.zeros((len(PLATFORMS), last - first + 1, 7200), dtype=np.int64)
    daily = defaultdict(dict)
    files = {}
    for year in range(first // 12, last // 12 + 1):
        paths = [directory / f"{year}.csv.gz" for directory in directories]
        paths = [p for p in paths if p.is_file()]
        if not paths:
            raise FileNotFoundError(f"No daily aggregate for {year}")
        if len({p.resolve() for p in paths}) != len(paths):
            raise ValueError(f"Duplicate platform inputs for {year} through the same file")
        platform_file = {}
        for sequence, path in enumerate(paths):
            files[f"{year}/{sequence}"] = digest(path)
            read_daily(path, year, first, last, data, daily, platform_file)

    status = {name: [] for name in PLATFORMS}
    for p, platform in enumerate(PLATFORMS):
        for i, month in enumerate(range(first, last + 1)):
            y, m = divmod(month, 12)
            days = calendar.monthrange(y, m + 1)[1]
            expected = {f"{y:04d}-{m + 1:02d}-{d:02d}" for d in range(1, days + 1)}
            dates = daily[p, month]
            if set(dates) - expected:
                raise ValueError(f"Invalid date for {platform} in {month_label(month)}")
            missing = sorted(expected - set(dates))
            qualities = sorted(set(dates.values()))
            status[platform].append({"missing_days": missing, "qualities": qualities,
                                     "detections": int(data[p, i].sum()),
                                     "complete_daily_archive": not missing})
    return data, status, files


def read_daily(path, year, first, last, data, daily, platform_file):
    previous = None
    with gzip.open(path, "rt", encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            day, platform = row["day"], row["platform"]
            month = month_index(day[:7])
            p = PLATFORMS.index(platform)
            r, c, n = int(row["row_id"]), int(row["col_id"]), int(row["count"])
            quality = row["quality"]
            if platform_file.setdefault(platform, path) != path:
                raise ValueError(f"Duplicate platform {platform} across input files for {year}")
            key = (day, platform, r, c)
            if (day[:4] != str(year) or not 0 <= r < 60 or not 0 <= c < 120 or n <= 0
                    or quality not in {"sp", "nrt"} or (previous is not None and key <= previous)):
                raise ValueError(f"Invalid, duplicate or misordered daily row in {path.name}: {key}")
            previous = key
            if not first <= month <= last:
                continue
            data[p, month - first, r * 120 + c] += n
            observed = daily[p, month].setdefault(day, quality)
            if observed != quality:
                raise ValueError(f"Mixed products on {day} for {platform}")


def features(t, m, ids):
    lat, lon = cell_centers()
    phase = 2 * np.pi * (np.asarray(m) % 12) / 12
    return np.column_stack([np.log1p(t), lat[ids], np.sin(np.radians(lon[ids])),
                            np.cos(np.radians(lon[ids])), np.sin(phase), np.cos(phase)])


def harmonize(terra, viirs, eligible, first):
    """Forward temporal and joint spatial holdout, with disjoint calibration months."""
    months = np.flatnonzero(eligible)
    shape = terra.shape
    empty = np.full(shape, np.nan)
    if len(months) < 72:
        return empty, empty.copy(), empty.copy(), {"status": "insufficient_matched_science_months",
                                                   "matched_months": len(months)}
    train, development, calibration, test = np.split(months, [-36, -24, -12])
    grid = np.arange(7200)
    row, col = np.divmod(grid, 120)
    spatial = ((row // 5 * 17 + col // 5 * 31) % 5) == 0
    activity_footprint = (terra[train].sum(axis=0) + viirs[train].sum(axis=0)) > 0
    fitted = activity_footprint & ~spatial

    def samples(ts, mask):
        ids = np.flatnonzero(mask)
        gm, gi = np.repeat(ts, len(ids)), np.tile(ids, len(ts))
        x = terra[gm, gi]
        return features(x, gm + first, gi), x, viirs[gm, gi]

    x, predictor, y = samples(train, fitted)
    if not len(y) or not y.sum() or not predictor.sum():
        return empty, empty.copy(), empty.copy(), {"status": "insufficient_training_counts"}
    ratio = float(y.sum() / predictor.sum())
    model = fit_poisson(x, y, rounds=100, learning_rate=0.08, leaves=31, minimum_leaf=150)

    def predict(x_values):
        return np.maximum(0, model.predict(x_values, num_threads=4))

    def evaluate(ts, mask):
        xx, raw, actual = samples(ts, mask)
        base = ratio * raw
        estimate = predict(xx)
        return actual, estimate, base, {
            "poisson_vs_scaled_terra": scores(actual, estimate, base),
            "scaled_vs_raw_terra": scores(actual, base, raw),
        }

    _, _, _, development_scores = evaluate(development, fitted)
    skill = development_scores["poisson_vs_scaled_terra"]["skill_mae"]
    method = "poisson_lightgbm" if skill is not None and skill > 0 else "scaled_terra"
    a, ml, b, _ = evaluate(calibration, fitted)
    quantile = residual_quantile(a, ml if method == "poisson_lightgbm" else b)
    report = {"matched_months": [month_label(i + first) for i in months], "selected": method,
              "training_ratio": ratio, "development": development_scores,
              "splits": {name: [month_label(i + first) for i in values] for name, values in
                         zip(("train", "development", "calibration", "test"),
                             (train, development, calibration, test))},
              "spatial_holdout": "deterministic fifth of 15°×15° spatial blocks; excluded from fitting",
              "coverage_basis": "paired complete UTC months by global archive-day presence; no swath masks"}
    for label, mask in (("future_known_blocks", fitted), ("future_unseen_blocks", spatial)):
        a, ml, b, metrics = evaluate(test, mask)
        p = ml if method == "poisson_lightgbm" else b
        lo, hi = bounds(p, quantile)
        coverage = (lo <= a) & (a <= hi)
        active = a > 0
        report[label] = dict(metrics, interval_coverage=float(np.mean(coverage)),
                             positive_target_interval_coverage=float(np.mean(coverage[active]))
                             if active.any() else None,
                             selected_on_positive_targets=scores(a[active], p[active], b[active])
                             if active.any() else None)

    # Publish only within the activity and geographic footprint seen in fitting.
    # Held-out blocks remain outside that footprint for the released model.
    support = (terra[train].max(axis=0)[None, :] >= terra) & fitted
    # Even a positive model comparison does not establish transfer across sensor
    # eras or masked coverage. These values are exploratory, with explicit gaps.
    hm, hc = np.where(support & (np.arange(shape[0])[:, None] + first < FIRST_VIIRS))
    if len(hm):
        raw = terra[hm, hc]
        p = predict(features(raw, hm + first, hc)) if method == "poisson_lightgbm" else ratio * raw
        empty[hm, hc] = p
    lo, hi = bounds(empty, quantile)
    report["status"] = "experimental"
    return empty, lo, hi, report


def build(directory, geo_path, first, last, out, report_path, source_pattern):
    data, status, inputs = load_archive(directory, first, last)
    geo = json.loads(geo_path.read_bytes())
    if geo.get("grid") != GRID or geo.get("schema_version") != SCHEMA:
        raise ValueError("Geography artifact uses a different grid or schema")
    good = np.array([[m["complete_daily_archive"] for m in status[p]] for p in PLATFORMS])
    science = np.array([[m["qualities"] == ["sp"] for m in status[p]] for p in PLATFORMS])
    indices = np.arange(first, last + 1)
    paired = np.all((good & science)[:2], axis=0) & (indices >= FIRST_VIIRS)
    backcast, lower, upper, validation = harmonize(data[0], data[1], paired, first)
    backcast[~good[0]] = lower[~good[0]] = upper[~good[0]] = np.nan
    terra, viirs, noaa20 = np.where(good[:, :, None], data, np.nan)
    h = np.where((indices >= FIRST_VIIRS)[:, None], viirs, backcast)
    raw = np.where((indices >= FIRST_VIIRS)[:, None], viirs, terra)
    lat, lon = cell_centers()
    cells = []
    for i in np.flatnonzero(np.any(data > 0, axis=(0, 1))):
        g = geo["cells"][str(i)]
        row = {"id": int(i), "lat": lat[i], "lon": lon[i], "cc": g["countries"],
               "unassigned": g["unassigned"], "r": nullable(raw[:, i], integers=True),
               "h": nullable(h[:, i]), "terra": nullable(terra[:, i], integers=True),
               "viirs": nullable(viirs[:, i], integers=True),
               "noaa20": nullable(noaa20[:, i], integers=True)}
        if np.isfinite(backcast[:, i]).any():
            row.update(backcast_lo=nullable(lower[:, i], integers=True),
                       backcast_hi=nullable(upper[:, i], integers=True))
        cells.append(row)
    payload = {"schema_version": SCHEMA, "kind": "monthly_detections", "grid": GRID,
               "start": month_label(first), "end": month_label(last), "cells": cells,
               "source": SOURCE, "source_url": ARCHIVE, "coverage": status,
               "series": {"r": "Terra before 2012-02, Suomi-NPP thereafter",
                          "h": "experimental Terra-to-Suomi-NPP estimates before 2012-02, "
                               "Suomi-NPP observed thereafter",
                          "noaa20": "Observed NOAA-20, the independent forecasting target",
                          "null": "Incomplete archive month or unavailable estimate",
                          "omitted_cell": "Zero rows in this archive for all included platforms"},
               "provenance": {"daily_aggregate_sha256": inputs, "upstream_uri_pattern": source_pattern,
                              "boundary_source": geo["source"], "boundary_sha256": geo["sha256"],
                              "harmonization": validation["status"]}}
    payload["dataset_id"] = hashlib.sha256(encode(payload).encode()).hexdigest()
    write_json(out, payload)
    write_json(report_path, dict(validation, dataset_id=payload["dataset_id"],
                                 source=SOURCE, source_url=ARCHIVE))


def main():
    from aggregate_firms import ROOT
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--daily", required=True, type=Path, action="append")
    cli.add_argument("--geography", required=True, type=Path)
    cli.add_argument("--start", required=True)
    cli.add_argument("--end", required=True)
    cli.add_argument("--out", default="pyroscale_data.json", type=Path)
    cli.add_argument("--report", default="pyroscale_harmonization_report.json", type=Path)
    cli.add_argument("--source-pattern", default=ROOT + "/year={year}/detections.parquet")
    args = cli.parse_args()
    first, last = month_index(args.start), month_index(args.end)
    if first > last:
        cli.error("Start must precede end")
    build(args.daily, args.geography, first, last, args.out, args.report, args.source_pattern)


if __name__ == "__main__":
    main()
