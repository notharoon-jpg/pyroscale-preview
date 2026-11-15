"""Aggregate public FIRMS point archives by fixed instrument, 3° cell and UTC day."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import duckdb

ROOT = ("https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/"
        "portolan-mirrors/firms-catalog/detections")

# Archive products can be revised. Versioned URLs can be supplied with --pattern.
# Prefer science processing per platform/day if both streams occur. Keep thermal
# anomalies of all types so NRT (which lacks the type field) has the same scope.
QUERY = """
WITH source AS (
    SELECT acq_date AS day, acq_datetime, satellite AS platform, quality,
           ST_X(geometry) AS lon, ST_Y(geometry) AS lat
    FROM read_parquet($uri, hive_partitioning=false)
    WHERE satellite IN (SELECT unnest($platforms))
      AND ((satellite = 'Terra' AND sensor = 'MODIS' AND confidence_pct >= 30)
       OR ((satellite = 'Suomi-NPP' AND sensor = 'VIIRS_SNPP'
            OR satellite = 'NOAA-20' AND sensor = 'VIIRS_NOAA20')
           AND lower(confidence) IN ('n', 'h', 'nominal', 'high'))
      )
), checked AS (
    SELECT DISTINCT day, acq_datetime, platform, quality, lon, lat
    FROM source
    WHERE acq_datetime::DATE = day AND year(day) = $year
      AND quality IN ('sp', 'nrt') AND lon BETWEEN -180 AND 180
      AND lat BETWEEN -90 AND 90
), daily AS (
    SELECT day, platform, quality,
           least(59, floor((lat + 90) / 3))::INT AS row_id,
           CASE WHEN lon = 180 THEN 0 ELSE floor((lon + 180) / 3)::INT END AS col_id,
           count(*)::BIGINT AS count
    FROM checked
    GROUP BY ALL
)
SELECT day, platform, quality, row_id, col_id, count
FROM daily
QUALIFY quality = max(quality) OVER (PARTITION BY day, platform)
ORDER BY day, platform, row_id, col_id
"""


def aggregate(year, args):
    final = args.output / f"{year}.csv.gz"
    temporary = final.with_suffix(".tmp")
    if final.is_file() and args.resume:
        return
    uri = args.pattern.format(year=year)
    with duckdb.connect(config={"threads": args.threads}) as db:
        for name in ("httpfs", "spatial"):
            try:
                db.load_extension(str((args.extensions / (name + ".duckdb_extension")).resolve())
                                  if args.extensions else name)
            except duckdb.IOException:
                if args.extensions:
                    raise
                db.install_extension(name)
                db.load_extension(name)
        db.execute("SET http_timeout=45")
        db.execute("SET http_retries=4")
        db.execute("SET preserve_insertion_order=false")
        db.execute("SET temp_directory=?", [str(args.output.resolve() / f"temp-{year}")])
        db.execute("SET memory_limit=?", [args.memory])
        db.execute(f"COPY ({QUERY}) TO $out (HEADER, COMPRESSION GZIP)",
                   {"uri": uri, "year": year, "out": str(temporary), "platforms": args.platforms})
    temporary.replace(final)
    print(f"{year}: {final.stat().st_size:,} bytes", flush=True)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--first", required=True, type=int)
    cli.add_argument("--last", required=True, type=int)
    cli.add_argument("--output", required=True, type=Path)
    cli.add_argument("--pattern", default=ROOT + "/year={year}/detections.parquet")
    cli.add_argument("--extensions", type=Path)
    cli.add_argument("--jobs", type=int, default=2)
    cli.add_argument("--threads", type=int, default=4)
    cli.add_argument("--memory", default="750MB", help="DuckDB memory cap per year")
    cli.add_argument("--resume", action="store_true", help="Reuse complete yearly aggregates")
    cli.add_argument("--platforms", nargs="+", choices=["Terra", "Suomi-NPP", "NOAA-20"],
                     default=["Terra", "Suomi-NPP", "NOAA-20"])
    args = cli.parse_args()
    if not 2000 <= args.first <= args.last <= 2100:
        cli.error("Expected an ordered year range within 2000–2100")
    args.output.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        list(pool.map(lambda year: aggregate(year, args), range(args.last, args.first - 1, -1)))


if __name__ == "__main__":
    main()
