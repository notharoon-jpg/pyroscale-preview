"""Synthetic fixtures exercise regressions; released outputs use real FIRMS input."""

import csv
import gzip
import json
import os
import tempfile
import unittest
from pathlib import Path

import duckdb
import numpy as np
from shapely.geometry import box, mapping

from add_places import country_shares
from aggregate_firms import QUERY
from build_pyroscale_data import load_archive
from forecast_pyroscale import Forecast, choose_and_score, load_observations, windows
from pyroscale_core import GRID, bounds, cell_centers, fit_poisson, month_index, month_label, scores


class GridAndArchive(unittest.TestCase):
    def test_calendar_requires_month_and_rolls_to_new_year(self):
        self.assertEqual(month_label(month_index("2026-12") + 1), "2027-01")
        for value in ("2026-10-31", "2026-00", "2026-13"):
            with self.assertRaises(ValueError):
                month_index(value)

    def test_country_intersections_include_water_and_resolve_overlap(self):
        features = [
            {"properties": {"ISO_A2": "AA"}, "geometry": mapping(box(0, 0, 2, 3))},
            {"properties": {"ISO_A2": "BB"}, "geometry": mapping(box(1, 0, 2.5, 3))},
        ]
        row = dict(country_shares({"features": features}, [30 * 120 + 60]))["3660"]
        self.assertAlmostEqual(row["countries"]["AA"], 1/3, places=7)
        self.assertAlmostEqual(row["countries"]["BB"], 1/6, places=7)
        self.assertAlmostEqual(row["unassigned"], 1/2, places=7)

    def test_country_attribution_seam_and_pole(self):
        countries = {"features": [
            {"properties": {"ISO_A2_EH": "AQ"}, "geometry": mapping(box(-180, -90, 180, -87))},
            {"properties": {"ISO_A2": "FJ"}, "geometry": mapping(box(-180, 0, -177, 3))},
        ]}
        actual = dict(country_shares(countries, [0, 119, 3600, 3719]))
        for idx in (0, 119):
            self.assertAlmostEqual(actual[str(idx)]["countries"]["AQ"], 1)
        self.assertEqual(actual["3600"]["countries"], {"FJ": 1})
        self.assertEqual(actual["3719"]["countries"], {})

    def test_parquet_duplicate_product_priority_confidence_and_cell_limits(self):
        with tempfile.TemporaryDirectory() as folder, duckdb.connect() as db:
            path = str(Path(folder) / "rows.parquet")
            spatial = os.environ.get("PYROSCALE_DUCKDB_SPATIAL")
            if spatial:
                db.load_extension(spatial)
            else:
                db.install_extension("spatial")
                db.load_extension("spatial")
            db.execute("""
                CREATE TABLE examples(satellite VARCHAR,sensor VARCHAR,quality VARCHAR,
                       confidence_pct INTEGER,confidence VARCHAR,acq_date DATE,
                       acq_datetime TIMESTAMP,geometry GEOMETRY);
                INSERT INTO examples VALUES
                 ('Suomi-NPP','VIIRS_SNPP','sp',NULL,'n','2026-10-01','2026-10-01 10:00',ST_Point(180,90)),
                 ('Suomi-NPP','VIIRS_SNPP','sp',NULL,'n','2026-10-01','2026-10-01 10:00',ST_Point(180,90)),
                 ('Suomi-NPP','VIIRS_SNPP','nrt',NULL,'nominal','2026-10-01','2026-10-01 10:01',ST_Point(1,1)),
                 ('Suomi-NPP','VIIRS_SNPP','sp',NULL,'l','2026-10-01','2026-10-01 10:00',ST_Point(0,0)),
                 ('Terra','MODIS','sp',30,'30','2026-10-01','2026-10-01 10:00',ST_Point(-180,-90)),
                 ('Terra','MODIS','sp',29,'29','2026-10-01','2026-10-01 10:00',ST_Point(0,0));
            """)
            db.execute("COPY examples TO ? (FORMAT PARQUET)", [path])
            rows = db.execute(QUERY, {"uri": path, "year": 2026,
                                      "platforms": ["Terra", "Suomi-NPP"]}).fetchall()
            self.assertEqual([row[1:] for row in rows],
                             [("Suomi-NPP", "sp", 59, 0, 1), ("Terra", "sp", 0, 0, 1)])

    def test_missing_archive_day_is_not_zero_and_duplicate_input_fails(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with gzip.open(root / "2026.csv.gz", "wt", newline="") as stream:
                writer = csv.writer(stream)
                writer.writerow(["day","platform","quality","row_id","col_id","count"])
                writer.writerow(["2026-10-01","Suomi-NPP","nrt",20,30,2])
            start = month_index("2026-10")
            data, status, _ = load_archive([root], start, start)
            self.assertEqual(data[1, 0, 20 * 120 + 30], 2)
            m = status["Suomi-NPP"][0]
            self.assertEqual(len(m["missing_days"]), 30)
            self.assertFalse(m["complete_daily_archive"])
            with self.assertRaisesRegex(ValueError, "Duplicate platform"):
                load_archive([root, root / "."], start, start)


class ForecastValidation(unittest.TestCase):
    def test_native_poisson_model_accepts_counts(self):
        x = np.arange(128, dtype=float).reshape(-1, 1)
        model = fit_poisson(x, x[:, 0], rounds=5, learning_rate=0.1, leaves=8, minimum_leaf=5)
        predictions = model.predict(x)
        self.assertTrue(np.all(np.isfinite(predictions) & (predictions >= 0)))
        self.assertGreater(predictions[-1], predictions[0])

    def test_each_phase_uses_matured_labels(self):
        for lead, plan in enumerate(windows(107, 0), 1):
            dev, cal, test = (plan[k] for k in ("development", "calibration", "test"))
            if dev and cal:
                self.assertLessEqual(max(dev) + lead, min(cal) - 5)
            if cal and test:
                self.assertLessEqual(max(cal) + lead, min(test) - 5)

    def test_origin_features_do_not_read_after_cutoff(self):
        dataset = np.zeros((85, 7200))
        dataset[:, 101:110] = 1
        after = dataset.copy()
        after[51:] = 100000
        for lead in (1,12,24):
            a, b = Forecast(dataset, month_index("2018-04"), 0), Forecast(after, month_index("2018-04"), 0)
            x, med, naive = a.x_at(55, lead, a.prepare(55))
            self.assertEqual(x.shape[0], 9)
            other = b.x_at(55, lead, b.prepare(55))
            for value, comparison in zip((x, med, naive), other):
                np.testing.assert_array_equal(value, comparison)

    def test_negative_skill_and_fallback_are_preserved(self):
        trials = np.array([[10, 10, 10], [20, 20, 20], [9, 9, 9],
                           [7, 7, 7], [10,20,50], [3,4,5]], dtype=float)
        choices = choose_and_score({phase: [trials] for phase in ("development","calibration","test")})
        self.assertEqual(choices[0]["selected"], "seasonal_median")
        self.assertEqual(choices[0]["test"]["poisson_lightgbm"]["skill_mae"], -9)
        self.assertEqual(choices[0]["selected_test_coverage"], 1)
        self.assertEqual(bounds(np.array([0.0]), 5)[0][0], 0)
        self.assertIsNone(scores(np.array([0]), np.array([1]), np.array([0]))["skill_mae"])

    def test_input_ignores_provisional_and_uncovered_months(self):
        lat, lon = cell_centers()
        days = [{"complete_daily_archive": True, "qualities": ["nrt"]},
                {"complete_daily_archive": False, "qualities": ["sp"]},
                {"complete_daily_archive": True, "qualities": ["sp"]}]
        data = {"schema_version": 2, "grid": GRID, "kind": "monthly_detections",
                "dataset_id": "test-fixture", "start": "2026-08", "end": "2026-10",
                "coverage": {"NOAA-20": days}, "cells": [
                    {"id": 0, "lat": lat[0], "lon": lon[0], "noaa20": [1, None, 2]}]}
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "obs.json"
            p.write_text(json.dumps(data), encoding="utf-8")
            _, _, values, _ = load_observations(p)
        np.testing.assert_array_equal(values[:, 0], [np.nan, np.nan, 2])
        np.testing.assert_array_equal(values[:, 1], [np.nan, np.nan, 0])


if __name__ == "__main__":
    unittest.main()
