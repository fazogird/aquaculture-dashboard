# 🐟 AQUACULTURE — baliq hovuzlari dashboardi

Sirdaryo viloyati 100 ta baliq hovuzini kuzatuvchi interaktiv dashboard.
3 mahsulot: **Aqua Utilization Control**, **Aqua Productivity Score**,
**E-auksion / Investitsion pasport**. MapLibre GL + ECharts, Streamlit orqali.

Bu papka **GitHub → Streamlit Cloud** deploy uchun tayyor.

---

## 📁 Tuzilishi

| Fayl / papka | Vazifasi | Deploy uchun kerakmi? |
|---|---|---|
| `streamlit_app.py` | Kirish nuqtasi (Streamlit) | ✅ Ha |
| `index.html`, `style.css`, `app.js` | Dashboard (o'zgarmaydi) | ✅ Ha |
| `data/*.json` | Barcha ma'lumot (~2.6 MB) | ✅ Ha |
| `static/video/*.mp4` | 100 hovuz videosi (~1 GB) | ⭕ Ixtiyoriy (video uchun) |
| `.streamlit/config.toml` | `enableStaticServing=true` | ✅ Ha (video uchun) |
| `requirements.txt` | `streamlit` | ✅ Ha |
| `pipeline/` | Parquet + qayta ishlash skriptlari (~19 MB) | ❌ Yo'q (arxiv/reproduktsiya) |



