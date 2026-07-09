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

> **Muhim:** App faqat `data/*.json` (+ ixtiyoriy videolar) dan foydalanadi.
> Parquet va skriptlar app ishlashi uchun **kerak emas** — repo hajmini kamaytirish
> uchun `pipeline/` ni yuklamasangiz ham bo'ladi.

---

## 🎬 Videolar

**Faqat dashboardda ko'rsatiladigan 100 hovuzning videosi** (`static/video/`, ~1 GB)
repoga kiritilgan. Streamlit'ning o'z static xizmati (`enableStaticServing`) orqali
`/app/static/video/...` manzilida beriladi — **lokalda ham, cloud'da ham bir xil
ishlaydi, alohida video server kerak emas** (Range/seek qo'llab-quvvatlanadi).

`AQUA_VIDEO_BASE` (Streamlit secrets/env) bilan boshqarish:
- **`static`** (default) — repo ichidagi videolardan (hech narsa yozmasangiz shu)
- **`off`** — videosiz (pop-up'da "Video topilmadi")
- **`https://...`** — tashqi CDN manzili

> ⚠️ **Diqqat — Streamlit Cloud limiti:** bepul tarifda app'ga ~1 GB resurs beriladi.
> 1 GB video repo bilan deploy **og'irlashishi yoki ishlamasligi mumkin.** Agar
> shunday bo'lsa: (a) `static/video/` ni repodan olib tashlang va `AQUA_VIDEO_BASE=off`
> qo'ying, yoki (b) videolarni tashqi hostga (Cloudflare R2 bepul 10 GB) qo'yib
> `AQUA_VIDEO_BASE=https://...` bering. Dashboard aynan o'zgarmaydi.

---

## 🚀 Deploy: GitHub → Streamlit Cloud (ketma-ketlik)

### 1-qadam: GitHub repo yaratish
1. [github.com](https://github.com) da akkaunt oching (bo'lmasa).
2. **New repository** → nom: `aquaculture-dashboard` → **Public** → Create.

### 2-qadam: Fayllarni yuklash
`github_data/` papkaning **ichidagi** fayllarni repo **ildiziga** yuklang.

- **Videolar bilan (~1 GB):** brauzer orqali yuklab bo'lmaydi — **git** ishlating:
  ```
  cd github_data
  git init
  git add .
  git commit -m "AQUACULTURE dashboard"
  git branch -M main
  git remote add origin https://github.com/<username>/aquaculture-dashboard.git
  git push -u origin main
  ```
  (`.streamlit/` va `static/video/` ham ketishi kerak — `git add .` ularni oladi.)

- **Videosiz (yengil, ~3 MB):** `static/video/` ni yuklamang. Brauzerdan
  **Add file → Upload files** bilan `streamlit_app.py`, `index.html`, `style.css`,
  `app.js`, `requirements.txt`, `.streamlit/config.toml` va `data/` ni tashlang.
  Streamlit'da `AQUA_VIDEO_BASE = off` qo'ying.

### 3-qadam: Streamlit Cloud'da ishga tushirish
1. [share.streamlit.io](https://share.streamlit.io) ga GitHub bilan kiring.
2. **Create app → Deploy a public app from GitHub**.
3. Sozlamalar:
   - **Repository:** `<username>/aquaculture-dashboard`
   - **Branch:** `main`
   - **Main file path:** `streamlit_app.py`
4. **Advanced settings → Secrets** (ixtiyoriy, video uchun):
   ```
   AQUA_VIDEO_BASE = "off"
   ```
   (yoki tashqi video-host manzili)
5. **Deploy** → 1–2 daqiqa kuting.
6. Tayyor! Manzil: `https://<nom>.streamlit.app` — havolani rahbariyatga yuborasiz.

### 4-qadam: Yangilash
Repoda faylni o'zgartirsangiz (yoki yangi `data/*.json` yuklasangiz),
Streamlit avtomatik qayta deploy qiladi. Qo'lda: app menyusi → **Reboot**.

---

## 🔄 Ma'lumotni qaytadan yaratish (ixtiyoriy, lokal)

`pipeline/` skriptlari yangi parquet'dan `data/*.json` ni qayta yaratadi.
Skriptlardagi fayl yo'llari (`D:\...`) o'z kompyuteringizga moslanishi kerak.
Tartib: `prep_data.py → prep_passport.py → prep_tuman.py → prep_product.py`.
So'ng yangilangan `data/` ni GitHub'ga qayta yuklang.
