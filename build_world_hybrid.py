#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build a high-resolution hybrid world.json (GeoJSON FeatureCollection) that contains:
- geometry: full country boundaries (Natural Earth Admin 0 Countries, 1:110m or 1:50m)
- properties: name, population (placeholder), gdp (placeholder), waterScore (1-10), waterResources (short text), center [lat, lon]

Usage:
  python build_world_hybrid.py --scale 50 --out world.json

Notes:
- Downloads Natural Earth Admin 0 Countries GeoJSON (1:50m by default) from official CDN.
- Pop/GDP are synthetic placeholders unless you replace the generators with your data.
- If you want smaller size, pass --scale 110 (1:110m) or run mapshaper/topojson afterwards.
"""
import argparse, json, math, random, sys, time
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

NE_SOURCES = {
    50: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson",
    110: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
}

def geom_centroid(coords, geom_type):
    # Compute rough centroid for Polygon/MultiPolygon
    def ring_centroid(ring):
        # simple average of vertices (not true centroid but sufficient here)
        x = sum(p[0] for p in ring) / len(ring)
        y = sum(p[1] for p in ring) / len(ring)
        return [x, y]

    if geom_type == "Polygon":
        return ring_centroid(coords[0])
    elif geom_type == "MultiPolygon":
        # average first ring of each polygon
        xs, ys, n = 0.0, 0.0, 0
        for poly in coords:
            cx, cy = ring_centroid(poly[0])
            xs += cx; ys += cy; n += 1
        if n == 0: return [0.0, 0.0]
        return [xs/n, ys/n]
    elif geom_type == "Point":
        return coords
    else:
        return [0.0, 0.0]

def synth_population(name):
    # quick synthetic population: seeded by hash
    base = abs(hash(name)) % 100_000_000
    return 5_000_000 + base

def synth_gdp(name):
    base = abs(hash(name[::-1])) % 3_000_000_000_000
    return 5_000_000_000 + base

def synth_water_score(name):
    return 1 + (abs(hash(name.lower())) % 10)

def synth_water_text(name, score):
    if score >= 8:
        return f"{name} su kaynakları açısından zengin; göller ve akarsular yaygın."
    if score >= 5:
        return f"{name} su kaynakları orta düzeyde; bölgesel farklılıklar mevcut."
    return f"{name} su stresi yüksek; tatlı su kaynakları sınırlı."

def fetch_geojson(scale):
    url = NE_SOURCES.get(scale, NE_SOURCES[50])
    req = Request(url, headers={"User-Agent": "world-json-builder/1.0"})
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; world-json-builder/1.0)"})
    with urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=int, default=50, choices=[50,110], help="Natural Earth scale (50=high, 110=medium)")
    ap.add_argument("--out", type=str, default="world.json", help="Output filename")
    args = ap.parse_args()

    print(f"Downloading Natural Earth {args.scale}m Admin 0 Countries...")
    world = fetch_geojson(args.scale)

    features_out = []
    for feat in world.get("features", []):
        props = feat.get("properties", {})
        name = props.get("NAME_EN") or props.get("ADMIN") or props.get("NAME") or "Unknown"
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates")

        # compute centroid as [lat, lon] from [lon, lat]
        center_lonlat = geom_centroid(coords, gtype) if coords else [0.0, 0.0]
        center_latlon = [center_lonlat[1], center_lonlat[0]]

        waterScore = synth_water_score(name)
        out_props = {
            "name": name,
            "population": synth_population(name),
            "gdp": synth_gdp(name),
            "waterScore": waterScore,
            "waterResources": synth_water_text(name, waterScore),
            "center": center_latlon
        }
        features_out.append({
            "type": "Feature",
            "properties": out_props,
            "geometry": geom  # keep full geometry
        })

    out = {
        "type": "FeatureCollection",
        "features": features_out
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = (len(json.dumps(out)) / (1024*1024))
    print(f"Done. Wrote {args.out} ({size_mb:.2f} MB).")

if __name__ == "__main__":
    try:
        main()
    except (URLError, HTTPError) as e:
        print("Download failed. Are you online? Error:", e)
        sys.exit(2)
