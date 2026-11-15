"""Shared grid, calendar, artifact and scoring conventions."""

import hashlib
import json
import tempfile
from pathlib import Path

import numpy as np
from lightgbm import Dataset, train

SCHEMA = 2
SOURCE = "NASA FIRMS via the Portolan mirror on Source Cooperative"
ARCHIVE = "https://source.coop/portolan-mirrors/firms-catalog"
GRID = {"degrees": 3, "rows": 60, "columns": 120, "crs": "EPSG:4326",
        "origin": [-180, -90], "longitude_range": "[-180, 180)"}


def month_index(value):
    parts = value.split("-")
    if len(value) != 7 or len(parts) != 2 or not value[:4].isdigit() or not value[5:].isdigit():
        raise ValueError(f"Expected YYYY-MM, got {value!r}")
    year, month = map(int, parts)
    if not 1 <= month <= 12:
        raise ValueError(f"Invalid month: {value}")
    return year * 12 + month - 1


def month_label(index):
    year, month = divmod(index, 12)
    return f"{year:04d}-{month + 1:02d}"


def cell_centers():
    row, col = np.divmod(np.arange(7200), 120)
    return -88.5 + row * 3, -178.5 + col * 3


def digest(path):
    with Path(path).open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def encode(value):
    return json.dumps(value, allow_nan=False, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     delete=False, newline="\n") as stream:
        temporary = Path(stream.name)
        try:
            stream.write(encode(value) + "\n")
        except Exception:
            stream.close()
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def nullable(values, digits=2, integers=False):
    return [(int(v) if integers else round(float(v), digits)) if np.isfinite(v) else None for v in values]


def scores(actual, predicted, baseline):
    err = np.asarray(predicted) - actual
    reference = np.asarray(baseline) - actual
    mae = float(np.mean(np.abs(err)))
    mae_ref = float(np.mean(np.abs(reference)))
    return {"n": int(err.size), "mae": mae, "baseline_mae": mae_ref,
            "rmse": float(np.sqrt(np.mean(err**2))),
            "bias": float(err.mean()), "skill_mae": 1 - mae / mae_ref if mae_ref else None}


def residual_quantile(actual, predicted, level=0.8):
    residual = np.abs(actual - predicted) / np.sqrt(1 + predicted)
    rank = min(residual.size, int(np.ceil((residual.size + 1) * level)))
    return float(np.partition(residual.ravel(), rank - 1)[rank - 1])


def bounds(predicted, q):
    width = q * np.sqrt(1 + predicted)
    return np.maximum(0, np.floor(predicted - width)), np.ceil(predicted + width)


def fit_poisson(features, target, *, rounds, learning_rate, leaves, minimum_leaf):
    options = {"objective": "poisson", "learning_rate": learning_rate, "num_leaves": leaves,
               "min_data_in_leaf": minimum_leaf, "verbosity": -1, "seed": 42,
               "deterministic": True, "force_col_wise": True, "num_threads": 4}
    return train(options, Dataset(features, label=target), num_boost_round=rounds)
