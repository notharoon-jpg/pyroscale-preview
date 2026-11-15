#!/usr/bin/env python3

import argparse, csv, json, os, sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default="pyroscale_data.json")
    ap.add_argument("--places", default="pyroscale_places.json")
    ap.add_argument("--no-places", action="store_true", help="skip writing the city list")
    ap.add_argument("--only-missing", action="store_true", help="only cells that have no country data yet")
    a = ap.parse_args()
    try:
        import reverse_geocoder as rg
    except ImportError:
        sys.exit("Install it first:  pip install reverse_geocoder scipy numpy")

    J = json.load(open(a.json))
    todo = [c for c in J["cells"] if not (a.only_missing and c.get("cc"))]
    pts, idx = [], []
    for i, c in enumerate(todo):
        for dy in (-1.2, -.6, 0, .6, 1.2):
            for dx in (-1.2, -.6, 0, .6, 1.2):
                pts.append((max(-89.9, min(89.9, c["lat"] + dy)), max(-179.9, min(179.9, c["lon"] + dx))))
                idx.append(i)
    tally = [{} for _ in todo]
    if pts:
        print("Matching %d sample points to countries..." % len(pts))
        for i, r in zip(idx, rg.search(pts, mode=1)):                 # mode 1: single process, safe on Windows
            tally[i][r["cc"]] = tally[i].get(r["cc"], 0) + 1
    for c, t in zip(todo, tally):
        n = sum(t.values())
        c["cc"] = {k: round(v / n, 2) for k, v in sorted(t.items(), key=lambda kv: -kv[1]) if v / n >= .04}
    tmp = a.json + ".tmp"
    json.dump(J, open(tmp, "w"), separators=(",", ":"))
    os.replace(tmp, a.json)
    codes = {k for c in J["cells"] for k in c.get("cc", {})}
    print("country data for %d cells, %d countries or territories appear" % (len(todo), len(codes)))

    if not a.no_places:
        src = os.path.join(os.path.dirname(rg.__file__), "rg_cities1000.csv")
        out = []
        with open(src, encoding="utf-8", newline="") as fh:
            for r in csv.DictReader(fh):
                try:
                    out.append([r["name"], r["admin1"], r["cc"], round(float(r["lat"]), 2), round(float(r["lon"]), 2)])
                except (KeyError, ValueError):
                    continue
        json.dump(out, open(a.places, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print("%d places written to %s" % (len(out), a.places))


if __name__ == "__main__":
    main()
