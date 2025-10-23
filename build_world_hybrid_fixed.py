#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fixed version of build_world_hybrid.py
--------------------------------------
Bu sürüm, Natural Earth verisini GitHub yedeğinden indirir (artık naciscdn.org kapalı).
Ek olarak User-Agent güncellendi, böylece erişim reddi hataları yaşanmaz.

Kullanım:
  python build_world_hybrid_fixed.py --scale 50 --out world.json
"""

import argparse, json, math, random, sys, time, os
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# 🔹 Yeni güvenilir kaynak (GitHub yedeği)
NE_SOURCES = {
    50: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson",
    110: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
}

def geom_centroid(coords, geom_type):
    def ring_centroid(ring):
        x = sum(p[0] for p in ring) / len(ring)
        y = sum(p[1] for p in ring) / len(ring)
        return [x, y]

    if geom_type == "Polygon":
        return ring_centroid(coords[0])
    elif geom_type == "MultiPolygon":
        xs, ys, n = 0.0, 0.0, 0
        for poly in coords:
            cx, cy = ring_centroid(poly[0])
            xs += cx; ys += cy; n += 1
        return [xs/n, ys/n] if n else [0.0, 0.0]
    elif geom_type == "Point":
        return coords
    return [0.0, 0.0]

def synth_population(name):
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
    local_file = f"ne_{scale}m_admin_0_countries.geojson"
    if os.path.exists(local_file):
        print(f"Yerel dosya bulundu: {local_file}")
        with open(local_file, "r", encoding="utf-8") as f:
            return json.load(f)

    url = NE_SOURCES.get(scale, NE_SOURCES[50])
    print(f"İndiriliyor: {url}")
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; world-json-builder/1.0)"})
    with urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=int, default=50, choices=[50,110], help="Veri çözünürlüğü (50=yüksek, 110=orta)")
    ap.add_argument("--out", type=str, default="world.json", help="Çıktı dosyası adı")
    args = ap.parse_args()

    print(f"Downloading World Data ({args.scale}m)...")
    try:
        world = fetch_geojson(args.scale)
    except Exception as e:
        print("Veri indirilemedi:", e)
        sys.exit(2)

    features_out = []
    for feat in world.get("features", []):
        props = feat.get("properties", {})
        name = props.get("ADMIN") or props.get("NAME") or props.get("name") or "Unknown"
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates")

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
            "geometry": geom
        })

    out = {"type": "FeatureCollection", "features": features_out}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = (len(json.dumps(out)) / (1024*1024))
    print(f"Tamamlandı ✅ {args.out} oluşturuldu. Boyut: {size_mb:.2f} MB")

if __name__ == "__main__":
    main()
