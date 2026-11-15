"""Validate a paired history, forecast and reports from a release directory."""

import argparse
import hashlib
import json
import math
from pathlib import Path

from pyroscale_core import GRID, SCHEMA, cell_centers, encode, month_index


def require(condition, message):
    if not condition:
        raise ValueError(message)


def series(value, length):
    return isinstance(value, list) and len(value) == length and all(
        item is None or type(item) in (int, float) and math.isfinite(item) and item >= 0
        for item in value)


def validate(root):
    def read(filename):
        return json.loads((root / filename).read_bytes())

    history = read("pyroscale_data.json")
    projection = read("pyroscale_forecast.json")
    harm = read("pyroscale_harmonization_report.json")
    report = read("pyroscale_forecast_report.json")
    first, last = (month_index(history[field]) for field in ("start", "end"))
    length = last - first + 1
    identity = history.pop("dataset_id")
    require(identity == hashlib.sha256(encode(history).encode()).hexdigest(), "Observation ID mismatch")
    require(history["grid"] == GRID and projection["grid"] == GRID, "Grid mismatch")
    require(all(doc["dataset_id"] == identity for doc in (projection, harm, report)), "Dataset ID mismatch")
    require(history["schema_version"] == projection["schema_version"] == report["schema_version"] == SCHEMA,
            "Schema version mismatch")
    require(projection["origin"] == history["end"] and month_index(projection["start"]) == last + 1
            and projection["months"] == 24 and projection["platform"] == "NOAA-20", "Forecast dates or platform mismatch")
    lat, lon = cell_centers()
    ids = set()
    coverage = history["coverage"]
    require({len(records) for records in coverage.values()} == {length}, "Coverage length mismatch")
    for cell in history["cells"]:
        i = cell["id"]
        require(type(i) is int and 0 <= i < 7200 and i not in ids, "Invalid or duplicate cell ID")
        ids.add(i)
        require(cell["lat"] == lat[i] and cell["lon"] == lon[i], "Cell centre mismatch")
        require(all(series(cell[key], length) for key in ("r", "h", "terra", "viirs", "noaa20")),
                "Misaligned observation history")
        require(all(0 <= v <= 1 for v in cell["cc"].values()) and
                abs(sum(cell["cc"].values()) + cell["unassigned"] - 1) < 1e-7, "Country shares invalid")
        if "backcast_lo" in cell:
            require(all(series(cell[key], length) for key in ("backcast_lo", "backcast_hi")),
                    "Invalid historical interval")
            for value, lower, upper in zip(cell["h"], cell["backcast_lo"], cell["backcast_hi"]):
                require((lower is None and upper is None)
                        or value is not None and lower <= value <= upper, "Backcast bounds invalid")
    for platform, key in (("Terra", "terra"), ("Suomi-NPP", "viirs"), ("NOAA-20", "noaa20")):
        for i, status in enumerate(coverage[platform]):
            require(status["complete_daily_archive"] == (not status["missing_days"]), "Invalid completeness")
            values = [c[key][i] for c in history["cells"]]
            if status["complete_daily_archive"]:
                require(all(type(n) is int for n in values) and sum(values) == status["detections"],
                        f"{platform} month {i} does not reconcile")
            else:
                require(all(n is None for n in values), f"{platform} month {i} contains partial values")
    require(projection["status"] == report["status"], "Forecast/report status mismatch")
    if projection["status"] == "evaluated":
        require(len(report["horizons"]) == len(projection["methods"]) == 24, "Incomplete leads")
        seen = set()
        for cell in projection["cells"]:
            i = cell["id"]
            require(i in ids and i not in seen and cell["lat"] == lat[i] and cell["lon"] == lon[i],
                    "Forecast grid mismatch")
            seen.add(i)
            require(all(series(cell[key], 24) for key in ("f", "lo", "hi", "baseline")),
                    "Invalid forecast values")
            for k, (point, lower, upper, base) in enumerate(
                    zip(cell["f"], cell["lo"], cell["hi"], cell["baseline"])):
                method = projection["methods"][k]
                require(method == report["horizons"][k]["selected"], "Published method mismatch")
                require(method != "seasonal_median" or base == point, "Seasonal median fallback mismatch")
                require((lower is None and upper is None)
                        or point is not None and lower <= point <= upper, "Forecast bounds invalid")
        require(len(seen) == report["eligible_cells"], "Forecast cell count mismatch")
    else:
        require(not projection["cells"], "Unsupported forecast contains values")
    print(f"Validated {len(ids):,} cells and {length} monthly indices; {len(projection['cells']):,} forecast cells")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("directory", type=Path, nargs="?", default=Path("."))
    validate(cli.parse_args().directory)
