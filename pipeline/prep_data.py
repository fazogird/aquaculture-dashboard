# -*- coding: utf-8 -*-
"""TEST100.parquet (12 430 ustun, keng format) -> dashboard uchun yengil fayllar.

Natijalar (data/ papkasida):
  hovuzlar.geojson  - poligonlar + statik atributlar + yillik util_score/foydalanilgan
  oylik.parquet     - uzun format: hovuz x oy x ko'rsatkich (grafiklar uchun)
  anomaliya.parquet - NDCI anomaliya kunlari (hovuz x sana)
"""
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd

SRC = Path(r"D:\Cloud_comp\Freshwater_carp\output\all_stat\TEST100_final.parquet")
OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)

YEARS = range(2014, 2027)
MONTHLY_METRICS = {
    "ndwi": "ndwi_mean", "ndci": "ndci_mean", "ndti": "ndti_mean",
    "ti": "ti_mean", "chla": "chla_mean", "secchi": "secchi_mean",
    "lst": "lst_mean", "airtemp": "airtemp_mean", "rain": "rain", "E": "E",
}

gdf = gpd.read_parquet(SRC)
print(f"O'qildi: {len(gdf)} hovuz, {len(gdf.columns)} ustun")

# --- Hovuz identifikatori ---
if gdf["id"].is_unique:
    gdf["pond_id"] = gdf["id"].astype(str)
else:
    print("DIQQAT: 'id' takrorlanadi, tartib raqam ishlatiladi")
    gdf["pond_id"] = [f"H{i+1:03d}" for i in range(len(gdf))]
print("pond_id namunasi:", gdf["pond_id"].head(3).tolist())

# --- 1. Statik qatlam (xarita uchun) ---
static_cols = ["pond_id", "id", "tuman", "viloyat", "holat", "izoh",
               "area_ha", "maydon", "slope", "x", "y", "yil", "ndci_anom_any"]
static_cols = [c for c in static_cols if c in gdf.columns]
year_cols = [c for c in gdf.columns
             if re.fullmatch(r"(foydalanilgan|util_score)_\d{4}", c)]
ponds = gdf[static_cols + year_cols + ["geometry"]].copy()
ponds["geometry"] = ponds["geometry"].simplify(0.00005, preserve_topology=True)

# tuman nomlarini spatial join natijasidan qo'llash (prep_tuman.py yaratadi)
import json
_tmap = OUT.parent.parent / "web" / "data" / "tuman_map.json"
if _tmap.exists():
    m = json.loads(_tmap.read_text(encoding="utf-8"))
    ponds["tuman"] = ponds["pond_id"].astype(str).map(m).fillna(ponds["tuman"])
    print(f"tuman_map.json qo'llandi: {ponds['tuman'].notna().sum()} hovuz")

ponds.to_file(OUT / "hovuzlar.geojson", driver="GeoJSON")
print(f"hovuzlar.geojson: {len(ponds)} hovuz, {len(ponds.columns)} ustun")

for y in [2024, 2025, 2026]:
    col = f"foydalanilgan_{y}"
    if col in ponds.columns:
        print(f"  {col}:", ponds[col].value_counts(dropna=False).to_dict())

# --- 2. Oylik uzun jadval ---
df = pd.DataFrame(gdf.drop(columns="geometry"))
frames = []
for metric, prefix in MONTHLY_METRICS.items():
    pat = re.compile(rf"^{re.escape(prefix)}_(\d{{2}})_(\d{{2}})$")
    cols = {c: pat.match(c) for c in df.columns}
    cols = {c: m for c, m in cols.items() if m}
    if not cols:
        print(f"DIQQAT: {prefix}_MM_YY topilmadi")
        continue
    sub = df[["pond_id", *cols]].melt("pond_id", var_name="col", value_name=metric)
    sub["sana"] = pd.to_datetime(
        sub["col"].map({c: f"20{m.group(2)}-{m.group(1)}-01" for c, m in cols.items()})
    )
    frames.append(sub.set_index(["pond_id", "sana"])[metric])
monthly = pd.concat(frames, axis=1).reset_index().sort_values(["pond_id", "sana"])
monthly.to_parquet(OUT / "oylik.parquet", index=False)
print(f"oylik.parquet: {len(monthly)} qator ({monthly['sana'].min():%Y-%m} .. {monthly['sana'].max():%Y-%m})")

# --- 3. NDCI anomaliya kunlari ---
anom_pat = re.compile(r"^ndci_anom_(\d{2})_(\d{2})_(\d{2})$")
anom_cols = {c: m for c in df.columns if (m := anom_pat.match(c))}
if anom_cols:
    a = df[["pond_id", *anom_cols]].melt("pond_id", var_name="col", value_name="anom")
    a["sana"] = pd.to_datetime(a["col"].map(
        {c: f"20{m.group(3)}-{m.group(2)}-{m.group(1)}" for c, m in anom_cols.items()}
    ))
    a = a[a["anom"] == 1][["pond_id", "sana"]].sort_values(["pond_id", "sana"])
    a.to_parquet(OUT / "anomaliya.parquet", index=False)
    print(f"anomaliya.parquet: {len(a)} anomaliya kuni ({len(anom_cols)} sahna tekshirildi)")

sizes = {p.name: f"{p.stat().st_size/1e6:.2f} MB" for p in OUT.iterdir()}
print("Fayl hajmlari:", sizes)
