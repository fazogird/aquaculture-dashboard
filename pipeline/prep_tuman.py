# -*- coding: utf-8 -*-
"""Tuman chegaralari (sirdaryo_boundary.shp) bilan spatial join.

Har bir hovuz poligoni qaysi tumanga tushishini aniqlaydi va yetishmayotgan
(yoki noto'g'ri) tuman nomlarini to'ldiradi. Natijalar:
  - web/data/tuman_map.json          (pond_id -> tuman)
  - web/data/hovuzlar.geojson        (tuman ustuni yangilanadi)
  - dash/data/hovuzlar.geojson       (manba nusxa ham)
  - web/data/passport.json           (tuman yangilanadi, agar mavjud bo'lsa)
"""
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

BND = Path(r"D:\Cloud_comp\Freshwater_carp\input\carp_poly\sirdaryo_boundary.shp")
WEB = Path(__file__).parent / "data"
DASH = Path(__file__).parent.parent / "dash" / "data"
GEOJSON = WEB / "hovuzlar.geojson"

# --- Chegaralar ---
bnd = gpd.read_file(BND)[["district", "geometry"]].copy()
bnd = bnd.to_crs(4326)
# metrik proyeksiyada maydon (eng kichik = eng aniq/shahar poligoni)
bnd["_area"] = bnd.to_crs(3857).area

# --- Hovuzlar (geometriya + pond_id) ---
ponds = gpd.read_file(GEOJSON).to_crs(4326)
pts = ponds[["pond_id", "geometry"]].copy()
pts["geometry"] = pts.representative_point()   # poligon ichidagi nuqta

# --- 1) within join ---
j = gpd.sjoin(pts, bnd, predicate="within", how="left")
# bir nuqta bir nechta poligonga tushsa — eng kichik maydonlisini olamiz
j = j.sort_values("_area").drop_duplicates("pond_id", keep="first")

# --- 2) tashqarida qolganlar uchun eng yaqin tuman ---
missing = j[j["district"].isna()]["pond_id"].tolist()
if missing:
    miss_pts = pts[pts["pond_id"].isin(missing)]
    near = gpd.sjoin_nearest(miss_pts, bnd[["district", "geometry"]], how="left")
    near = near.drop_duplicates("pond_id", keep="first")
    near_map = dict(zip(near["pond_id"].astype(str), near["district"]))
else:
    near_map = {}

tuman_map = {}
for _, r in j.iterrows():
    pid = str(r["pond_id"])
    tuman_map[pid] = r["district"] if pd.notna(r["district"]) else near_map.get(pid)

print(f"Spatial join: {len(tuman_map)} hovuz")
print("within topildi:", int(j["district"].notna().sum()), "| eng yaqin bilan:", len(missing))
counts = pd.Series(list(tuman_map.values())).value_counts(dropna=False).to_dict()
print("Tuman taqsimoti:", counts)

# --- tuman_map.json ---
(WEB / "tuman_map.json").write_text(
    json.dumps(tuman_map, ensure_ascii=False, indent=1), encoding="utf-8")


def patch_geojson(path):
    if not path.exists():
        return
    gj = json.loads(path.read_text(encoding="utf-8"))
    n = 0
    for f in gj["features"]:
        pid = str(f["properties"].get("pond_id"))
        if pid in tuman_map and tuman_map[pid]:
            if f["properties"].get("tuman") != tuman_map[pid]:
                n += 1
            f["properties"]["tuman"] = tuman_map[pid]
    path.write_text(json.dumps(gj, ensure_ascii=False), encoding="utf-8")
    print(f"  {path.name}: {n} ta tuman yangilandi")


def patch_passport(path):
    if not path.exists():
        return
    pj = json.loads(path.read_text(encoding="utf-8"))
    n = 0
    for pid, rec in pj.items():
        if pid in tuman_map and tuman_map[pid] and rec.get("tuman") != tuman_map[pid]:
            rec["tuman"] = tuman_map[pid]
            n += 1
    path.write_text(json.dumps(pj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  {path.name}: {n} ta tuman yangilandi")


print("Fayllar yangilanmoqda:")
patch_geojson(GEOJSON)
patch_geojson(DASH / "hovuzlar.geojson")
patch_passport(WEB / "passport.json")
print("Tayyor.")
