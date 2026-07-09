# -*- coding: utf-8 -*-
"""Aqua Auction Passport mahsuloti uchun ma'lumot.

Manba: TEST100_passport.parquet (100 hovuz, 74 ustun — pasport jadvali)
Natija: web/data/passport.json  {pond_id: {barcha ustunlar}}
Qo'shimcha hisoblanadi: evap_m3, rain_m3 (mm × area_ha × 10).
"""
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

SRC = Path(r"D:\Cloud_comp\Freshwater_carp\output\all_stat\TEST100_passport.parquet")
OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)

g = gpd.read_parquet(SRC)
df = pd.DataFrame(g.drop(columns="geometry")) if "geometry" in g.columns else pd.DataFrame(g)
df["pond_id"] = df["pond_id"].astype(str)

# tuman nomlarini spatial join natijasidan qo'llash (prep_tuman.py yaratadi)
_tmap = OUT / "tuman_map.json"
if _tmap.exists():
    m = json.loads(_tmap.read_text(encoding="utf-8"))
    df["tuman"] = df["pond_id"].map(m).fillna(df["tuman"])
    print(f"tuman_map.json qo'llandi: {df['tuman'].notna().sum()} hovuz")

# yetishmayotgan suv hajmi ustunlari (mm × ga × 10 = m³)
df["evap_m3"] = df["evap_total_mm"] * df["area_ha"] * 10
df["rain_m3"] = df["rain_total_mm"] * df["area_ha"] * 10

# butun son bo'lib chiqishi kerak bo'lgan ustunlar
INT_COLS = {"active_years_count", "inactive_years_count", "first_active_year",
            "last_active_year", "last_full_year"}


def conv(col, v):
    if pd.isna(v):
        return None
    if isinstance(v, (bool,)) or str(v) in ("True", "False"):
        return bool(v)
    if isinstance(v, (int,)) or col in INT_COLS:
        try:
            return int(v)
        except (ValueError, TypeError):
            pass
    if isinstance(v, float):
        return round(v, 2)
    return str(v)


passport = {}
for _, row in df.iterrows():
    pid = row["pond_id"]
    rec = {}
    for col in df.columns:
        if col == "pond_id":
            continue
        rec[col] = conv(col, row[col])
    passport[pid] = rec

(OUT / "passport.json").write_text(
    json.dumps(passport, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
size = (OUT / "passport.json").stat().st_size / 1e6
print(f"passport.json: {len(passport)} lot, {len(df.columns)-1} ustun, {size:.2f} MB")

# tezkor tekshiruv
s = df.iloc[0]
print("Namuna:", s["passport_id"], "| auction:", s["auction_readiness_score"],
      "| investment:", s["investment_score"], s["investment_class"],
      "| risk:", s["risk_score"], s["risk_class"])
