"""Issue direct 1–24 month forecasts for NOAA-20 VIIRS archive detections."""

import argparse
import json
import warnings
from pathlib import Path

import numpy as np

from pyroscale_core import (
    GRID, SCHEMA, bounds, cell_centers, fit_poisson, month_index, month_label,
    nullable, residual_quantile, scores, write_json,
)

HORIZONS = 24
PUBLICATION_LAG = 5
LEVEL = 0.8
TARGET = "science-processed NOAA-20 VIIRS thermal-anomaly detections"
MIN_TRAIN_MONTHS = 36


def load_observations(path):
    d = json.loads(path.read_bytes())
    if (d.get("schema_version") != SCHEMA or d.get("grid") != GRID
            or d.get("kind") != "monthly_detections" or not d.get("dataset_id")):
        raise ValueError("A rebuilt schema-v2 observation artifact is required")
    first, last = month_index(d["start"]), month_index(d["end"])
    expected_lat, expected_lon = cell_centers()
    cells = d["cells"]
    v = np.zeros((last - first + 1, 7200), dtype=float)
    seen = set()
    for c in cells:
        i = c["id"]
        if (type(i) is not int or not 0 <= i < 7200 or i in seen
                or c["lat"] != expected_lat[i] or c["lon"] != expected_lon[i]):
            raise ValueError("Observation cells do not match the 3° world grid")
        seen.add(i)
        values = np.asarray(c["noaa20"], dtype=float)
        if values.shape != (len(v),) or np.any(np.isinf(values) | (values < 0)):
            raise ValueError("Invalid NOAA-20 VIIRS series")
        v[:, i] = values
    status = d["coverage"]["NOAA-20"]
    if len(status) != len(v):
        raise ValueError("VIIRS coverage is inconsistent with dates")
    valid = np.array([m["complete_daily_archive"] and m["qualities"] == ["sp"] for m in status])
    v[~valid] = np.nan
    start = np.flatnonzero(valid)
    if len(start) < 48:
        return d, first, v, None
    return d, first, v, int(start[0])


class Forecast:
    def __init__(self, observed, first, start):
        self.observed = observed
        self.first = first
        self.start = start
        self.lat, self.lon = cell_centers()
        self.models = {}

    def at(self, index):
        if index < self.start:
            return np.full(self.observed.shape[1], np.nan)
        return self.observed[index]

    def prepare(self, origin):
        cutoff = origin - PUBLICATION_LAG
        recent = self.observed[max(self.start, cutoff - 59):cutoff + 1]
        cells = np.flatnonzero(np.nansum(recent, axis=0) > 0)
        recent = recent[:, cells]
        values = [self.at(cutoff - lag)[cells] for lag in (0, 1, 2, 5, 11, 23)]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            values.extend(np.nanmean(recent[-count:], axis=0) for count in (3, 6, 12, 36))
            # Calendar-month medians are derived from this origin's information only.
            seasonal = np.vstack([np.nanmedian(
                recent[(np.arange(cutoff - len(recent) + 1, cutoff + 1) + self.first) % 12 == month],
                axis=0) for month in range(12)])
        persistence = np.empty_like(seasonal)
        for month in range(12):
            choices = recent[(np.arange(cutoff - len(recent) + 1, cutoff + 1) + self.first) % 12 == month]
            last = np.full(len(cells), np.nan)
            for available in choices:
                last = np.where(np.isfinite(available), available, last)
            persistence[month] = last
        static = [self.lat[cells], np.sin(np.radians(self.lon[cells])),
                  np.cos(np.radians(self.lon[cells])), *[np.log1p(v) for v in values]]
        return cells, seasonal, persistence, static

    def x_at(self, origin, lead, prepared):
        cells, median, naive, static = prepared
        month = (self.first + origin + lead) % 12
        phase = 2 * np.pi * month / 12
        x = np.column_stack([*static, np.log1p(median[month]), np.log1p(naive[month]),
                             np.full(len(cells), np.sin(phase)), np.full(len(cells), np.cos(phase)),
                             np.full(len(cells), lead)]).astype(np.float32)
        return x, median[month], naive[month]

    def fit(self, origin):
        cutoff = origin - PUBLICATION_LAG
        xs, ys = [], []
        for previous in range(self.start + PUBLICATION_LAG + 24, cutoff, 3):
            prepared = self.prepare(previous)
            cells = prepared[0]
            for lead in range(1, min(HORIZONS, cutoff - previous) + 1):
                y = self.observed[previous + lead, cells]
                keep = np.isfinite(y)
                if keep.any():
                    x, _, _ = self.x_at(previous, lead, prepared)
                    xs.append(x[keep])
                    ys.append(y[keep])
        if not ys or not any(y.sum() > 0 for y in ys):
            return None
        xtrain, ytrain = np.concatenate(xs), np.concatenate(ys)
        del xs, ys
        return fit_poisson(xtrain, ytrain, rounds=65, learning_rate=0.1, leaves=25, minimum_leaf=250)

    def issue(self, origin):
        # Refit every six months and reuse the latest fit available at each origin.
        earliest = self.start + PUBLICATION_LAG + MIN_TRAIN_MONTHS
        anchor = earliest + ((origin - earliest) // 6) * 6
        if anchor >= earliest and anchor not in self.models:
            self.models[anchor] = self.fit(anchor)
        model = self.models.get(anchor)
        prepared = self.prepare(origin)
        cells = prepared[0]
        rows = [self.x_at(origin, lead, prepared) for lead in range(1, HORIZONS + 1)]
        prediction = (model.predict(np.concatenate([row[0] for row in rows]),
                                    num_threads=4).reshape(HORIZONS, -1)
                      if model is not None and len(cells) else np.full((HORIZONS, len(cells)), np.nan))
        median = np.stack([row[1] for row in rows])
        naive = np.stack([row[2] for row in rows])
        return cells, {"poisson_lightgbm": np.round(np.maximum(0, prediction), 2),
                       "seasonal_median": np.round(median, 2), "seasonal_naive": naive}


def windows(last_observed, start):
    """Lead-specific rolling origins, with matured labels before the next phase."""
    earliest_baseline = start + PUBLICATION_LAG + 23
    earliest_model = start + PUBLICATION_LAG + MIN_TRAIN_MONTHS
    phases = []
    for lead in range(1, HORIZONS + 1):
        test_end = last_observed - lead
        test = list(range(test_end - 6, test_end + 1, 2))
        cal_end = test[0] - PUBLICATION_LAG - lead
        calibration = list(range(cal_end - 6, cal_end + 1, 2))
        dev_end = calibration[0] - PUBLICATION_LAG - lead
        development = list(range(dev_end - 6, dev_end + 1, 2))
        phases.append({"development": [i for i in development if i >= earliest_model],
                       "calibration": [i for i in calibration if i >= earliest_baseline],
                       "test": [i for i in test if i >= earliest_baseline]})
    return phases


def run_backtests(pipe, phases):
    predictions = {}
    for origin in sorted({i for plan in phases for origins in plan.values() for i in origins}):
        print(f"Rolling forecast origin {month_label(pipe.first + origin)}", flush=True)
        predictions[origin] = pipe.issue(origin)
    evaluations = {name: [] for name in ("development", "calibration", "test")}
    for k, plan in enumerate(phases):
        for phase, origins in plan.items():
            out = []
            for origin in origins:
                cells, forecast = predictions[origin]
                actual = pipe.at(origin + k + 1)[cells]
                keep = np.isfinite(actual) & np.isfinite(forecast["seasonal_median"][k])
                if keep.any():
                    out.append((actual[keep], *(v[k, keep] for v in forecast.values()),
                                np.abs(pipe.lat[cells[keep]]),
                                np.full(keep.sum(), origin)))
            evaluations[phase].append(np.concatenate(out, axis=1) if out else None)
    return evaluations


def choose_and_score(evaluations):
    methods = ("poisson_lightgbm", "seasonal_median", "seasonal_naive")
    decisions = []
    for k, (dev, cal, test) in enumerate(zip(*(evaluations[key] for key in
                                               ("development", "calibration", "test"))), start=1):
        skill = None
        best = "seasonal_median"
        if dev is not None:
            common = np.all(np.isfinite(dev[1:4]), axis=0)
            if len(np.unique(dev[-1, common])) >= 3:
                skill = {name: scores(dev[0, common], dev[i + 1, common], dev[2, common])
                         for i, name in enumerate(methods)}
                best = min(methods, key=lambda name: (skill[name]["mae"], name != "seasonal_median"))
        index = methods.index(best) + 1
        row = {"lead": k, "selected": best, "interval_q": None,
               "selection": "development_mae" if skill else "prespecified_baseline",
               "development": skill, "status": "limited_evaluation"}
        if test is not None:
            common = np.all(np.isfinite(test[1:4]), axis=0)
            row["test"] = {name: scores(test[0, common], test[i + 1, common], test[2, common])
                           for i, name in enumerate(methods)} if common.any() else {}
            include = np.isfinite(test[index])
            if include.any():
                row["selected_test"] = scores(test[0, include], test[index, include], test[2, include])
                row["test_origins_with_targets"] = int(len(np.unique(test[-1, include])))
        if cal is not None and test is not None:
            keep = np.isfinite(cal[index])
            include = np.isfinite(test[index])
            if len(np.unique(cal[-1, keep])) >= 3 and len(np.unique(test[-1, include])) >= 3:
                quantile = residual_quantile(cal[0, keep], cal[index, keep], LEVEL)
                lo, hi = bounds(test[index, include], quantile)
                row.update(status="evaluated", interval_q=quantile, calibration_n=int(keep.sum()),
                           selected_test_coverage=float(np.mean((lo <= test[0, include]) & (test[0, include] <= hi))),
                           selected_test_mean_width=float(np.mean(hi - lo)))
                positive = test[0, include] > 0
                if positive.any():
                    actual = test[0, include][positive]
                    row["positive_target_test_coverage"] = float(np.mean(
                        (lo[positive] <= actual) & (actual <= hi[positive])))
        if test is not None:
            latitude = test[-2]
            row["selected_by_absolute_latitude"] = {}
            for name, minimum, maximum in (("0_to_23.5", 0, 23.5), ("23.5_to_50", 23.5, 50),
                                           ("50_to_90", 50, 90)):
                mask = (latitude >= minimum) & (latitude < maximum) & np.isfinite(test[index])
                if mask.any():
                    row["selected_by_absolute_latitude"][name] = scores(
                        test[0, mask], test[index, mask], test[2, mask])
        decisions.append(row)
    return decisions


def forecast(data_path, out, report_path):
    d, first, observed, start = load_observations(data_path)
    origin = len(observed) - 1
    report = {"kind": "forecast_validation", "schema_version": SCHEMA, "dataset_id": d["dataset_id"],
              "target": TARGET, "platform": "NOAA-20",
              "publication_lag_months": PUBLICATION_LAG, "nominal_coverage": LEVEL,
              "origin": month_label(first + origin), "metrics": "MAE skill = 1 - MAE / seasonal median MAE"}
    product = {"schema_version": SCHEMA, "kind": "forecast", "dataset_id": d["dataset_id"],
               "grid": GRID, "origin": report["origin"], "start": month_label(first + origin + 1),
               "months": HORIZONS, "cells": [], "target": TARGET, "platform": "NOAA-20",
               "nominal_coverage": LEVEL}
    science = np.flatnonzero(np.isfinite(observed[:, 0]))
    phases = windows(int(science[-1]), start) if start is not None else []
    if not phases:
        report["status"] = product["status"] = "insufficient_science_history"
    else:
        pipe = Forecast(observed, first, start)
        evaluations = run_backtests(pipe, phases)
        decisions = choose_and_score(evaluations)
        cells, candidates = pipe.issue(origin)
        p = np.stack([candidates[row["selected"]][k] for k, row in enumerate(decisions)])
        l, u = bounds(p, np.array([row["interval_q"] if row["interval_q"] is not None else np.nan
                                   for row in decisions])[:, None])
        p[~np.isfinite(p)] = np.nan
        for j, i in enumerate(cells):
            product["cells"].append({"id": int(i), "lat": float(pipe.lat[i]), "lon": float(pipe.lon[i]),
                                     "f": nullable(p[:, j]), "lo": nullable(l[:, j], integers=True),
                                     "hi": nullable(u[:, j], integers=True),
                                     "baseline": nullable(candidates["seasonal_median"][:, j])})
        report.update(status="evaluated",
                      origins_by_lead=[{phase: [month_label(first + i) for i in origins]
                                       for phase, origins in plan.items()} for plan in phases],
                      horizons=decisions,
                      eligible_cells=len(cells))
        product.update(status="evaluated", methods=[row["selected"] for row in decisions],
                       evaluation_status=[row["status"] for row in decisions],
                       coverage=[row.get("selected_test_coverage") for row in decisions],
                       skill=[row.get("selected_test", {}).get("skill_mae") for row in decisions],
                       candidate_skill=[row.get("test", {}).get("poisson_lightgbm", {}).get("skill_mae")
                                        for row in decisions])
    write_json(report_path, report)
    write_json(out, product)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--data", default="pyroscale_data.json", type=Path)
    cli.add_argument("--out", default="pyroscale_forecast.json", type=Path)
    cli.add_argument("--report", default="pyroscale_forecast_report.json", type=Path)
    args = cli.parse_args()
    forecast(args.data, args.out, args.report)


if __name__ == "__main__":
    main()
