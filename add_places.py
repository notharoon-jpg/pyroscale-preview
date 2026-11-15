"""Calculate 3° cell area shares using Natural Earth Admin-0 polygons."""

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from shapely import STRtree, box, make_valid, segmentize, transform, union_all
from shapely.geometry import shape

from pyroscale_core import GRID, cell_centers, digest, write_json

BOUNDARY_URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
                "f1890d9f152c896d250a77557a5751a93d494776/geojson/"
                "ne_10m_admin_0_countries.geojson")
BOUNDARY_SHA256 = "239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255"


def polygons(geometry):
    if geometry.geom_type == "Polygon":
        yield geometry
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from polygons(part)


def equal_area(geometry):
    """Spherical cylindrical equal area, with densified longitude/latitude edges."""
    return transform(segmentize(geometry, 0.05), lambda xy: np.column_stack(
        (np.radians(xy[:, 0]), np.sin(np.radians(xy[:, 1]))))).area


def country_shares(document, indices):
    codes, pieces = [], []
    for feature in document["features"]:
        props = feature["properties"]
        code = props.get("ISO_A2_EH") or props.get("ISO_A2") or ""
        if len(code) != 2 or not code.isalpha():
            code = props.get("ISO_A2", "")
        code = code if len(code) == 2 and code.isalpha() else "unassigned"
        for part in polygons(make_valid(shape(feature["geometry"]))):
            codes.append(code)
            pieces.append(part)
    tree = STRtree(pieces)
    latitudes, longitudes = cell_centers()
    for index in indices:
        lat, lon = latitudes[index], longitudes[index]
        cell = box(lon - 1.5, lat - 1.5, lon + 1.5, lat + 1.5)
        area = equal_area(cell)
        groups = defaultdict(list)
        for i in tree.query(cell, predicate="intersects"):
            intersection = cell.intersection(pieces[i])
            groups[codes[i]].extend(polygons(intersection))
        merged = {code: union_all(parts) for code, parts in groups.items() if parts}
        result = {}
        for code, region in merged.items():
            if code == "unassigned":
                continue
            other = union_all([part for key, part in merged.items() if key != code])
            share = round(equal_area(region.difference(other)) / area, 9)
            if share > 0:
                result[code] = share
        assigned = sum(result.values())
        # Rounding can exceed unity by a few billionths in a multi-country cell.
        if assigned > 1:
            largest = max(result, key=result.get)
            result[largest] = round(result[largest] - (assigned - 1), 9)
        yield str(index), {"countries": result, "unassigned": round(1 - sum(result.values()), 9)}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--boundaries", required=True, type=Path)
    cli.add_argument("--out", default="pyroscale_geography.json", type=Path)
    args = cli.parse_args()
    sha256 = digest(args.boundaries)
    if sha256 != BOUNDARY_SHA256:
        cli.error("Boundary file does not match the pinned Natural Earth 5.1.2 revision")
    result = dict(country_shares(json.loads(args.boundaries.read_bytes()), range(7200)))
    write_json(args.out, {"schema_version": 2, "grid": GRID, "cells": result,
                         "source": BOUNDARY_URL, "sha256": sha256,
                         "units": "fraction_of_cell_area",
                         "unassigned": "Water, overlaps and map units without a resolved country code"})


if __name__ == "__main__":
    main()
