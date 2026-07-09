# -*- coding: utf-8 -*-
"""Aqua Productivity Score mahsuloti uchun ma'lumot tayyorlash.

Manba: TEST100_product.parquet (yillik ko'rsatkichlar) + oylik.parquet (vaqt qatorlari)
Natija (web/data/):
  product.json  - {pond_id: {yil: {barcha ko'rsatkichlar}}}
  monthly.json  - {pond_id: [{t, chla, secchi, ndti, lst}]}  (line chart uchun)
"""
import json
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd

SRC = Path(r"D:\Cloud_comp\Freshwater_carp\output\all_stat\TEST100_product.parquet")
OYLIK = Path(__file__).parent.parent / "dash" / "data" / "oylik.parquet"
OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)

# product.json ga kiritiladigan yillik ustunlar (nom -> qisqa kalit)
NUM = {
    "util_score": "util", "productivity_score": "ps", "growth_potential": "gp",
    "tsi": "tsi", "chla_mean": "chla", "secchi_mean": "secchi",
    "adjusted_biomass_kg": "biomass", "scenario_biomass_kg": "sbiomass",
    "adjusted_harvest_kg": "harvest", "scenario_harvest_kg": "sharvest",
    "adjusted_yield_t_ha": "yield", "net_water_need_m3": "netwater_m3",
    "net_water_need_mm": "netwater_mm", "water_balance_score": "wbs",
    "evap_total_mm": "evap", "rain_total_mm": "rain",
    "stocked_fish_count": "stocked", "survived_fish_count": "survived",
    "survival_rate": "srate", "current_avg_weight_kg": "cw",
    "harvest_avg_weight_kg": "hw", "stocking_density_ha": "density",
    # faollik / o'sish bloklari
    "wps": "wps", "aas": "aas", "ndti_mean": "ndti",
    "water_quality_score": "wq",
    "food_score": "food", "thermal_score": "thermal",
    "optimal_days": "optdays", "heat_stress_days": "heatdays",
    "valid_s1_count": "s1", "valid_hls_count": "hls",
}
INT_KEYS = {"stocked", "survived", "density", "optdays", "heatdays", "s1", "hls"}
CAT = {
    "stocking_month": "smonth",
    "foydalanilgan": "status", "productivity_class": "pc",
    "trophic_class": "trophic", "turbidity_risk": "turb",
    "algae_risk": "algae", "water_cost_risk": "wcost",
    "fish_type_model": "fish", "biomass_confidence": "bconf",
    "analysis_start": "astart", "analysis_end": "aend",
}

g = gpd.read_parquet(SRC)
df = pd.DataFrame(g.drop(columns="geometry"))
df["pond_id"] = df["id"].astype(str)

years = sorted({int(m.group(1)) for c in df.columns
                if (m := re.search(r"productivity_score_(\d{4})$", c))})
print("Yillar:", years)


def num(v, nd=2):
    if pd.isna(v):
        return None
    return round(float(v), nd)


product = {}
for _, row in df.iterrows():
    pid = row["pond_id"]
    per_year = {}
    for y in years:
        rec = {}
        for col, key in NUM.items():
            c = f"{col}_{y}"
            if c in df.columns:
                rec[key] = num(row[c], 0 if key in INT_KEYS else 2)
        for col, key in CAT.items():
            c = f"{col}_{y}"
            if c in df.columns:
                v = row[c]
                rec[key] = None if pd.isna(v) else str(v)
        per_year[str(y)] = rec
    product[pid] = per_year

(OUT / "product.json").write_text(
    json.dumps(product, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"product.json: {len(product)} hovuz x {len(years)} yil")

# --- monthly.json (line chart: chla/secchi/ndti/lst) ---
m = pd.read_parquet(OYLIK)
m["t"] = pd.to_datetime(m["sana"]).dt.strftime("%Y-%m")
monthly = {}
for pid, sub in m.groupby("pond_id"):
    sub = sub.sort_values("sana")
    monthly[str(pid)] = [
        {"t": r.t,
         # parametrlar (fizik birlik)
         "chla": num(r.chla, 1), "secchi": num(r.secchi, 2), "lst": num(r.lst, 1),
         # indekslar (birliksiz)
         "ndwi": num(r.ndwi, 3), "ndci": num(r.ndci, 3), "ndti": num(r.ndti, 3)}
        for r in sub.itertuples()
    ]
(OUT / "monthly.json").write_text(
    json.dumps(monthly, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"monthly.json: {len(monthly)} hovuz")

sizes = {p.name: f"{p.stat().st_size/1e6:.2f} MB"
         for p in OUT.iterdir() if p.suffix == ".json"}
print("Hajmlar:", sizes)
