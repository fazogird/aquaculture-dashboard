# -*- coding: utf-8 -*-
"""AQUACULTURE dashboardini Streamlit orqali ko'rsatish (GitHub/Cloud versiya).

Dashboard (index.html + style.css + app.js) HECH O'ZGARMAYDI — to'liq holicha
iframe ichida render qilinadi. `data/*.json` HTML ichiga joylanib, fetch-shim
orqali app.js'ga qaytariladi. Videolar `static/video/` dan Streamlit'ning o'z
static xizmati (enableStaticServing) orqali beriladi — GitHub'da ham, lokalda ham
bir xil ishlaydi, alohida video server kerak emas.

AQUA_VIDEO_BASE (env/secrets):
  "static" (default) — repo ichidagi static/video/ (100 hovuz videosi)
  "off"              — videosiz (pop-up'da "Video topilmadi")
  "https://..."      — tashqi CDN manzili
"""
import json
import os
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

WEB = Path(__file__).parent
DATA = WEB / "data"
VIDEO = os.environ.get("AQUA_VIDEO_BASE", "static")
DATA_FILES = ["hovuzlar.geojson", "product.json", "monthly.json",
              "videos.json", "passport.json"]

st.set_page_config(page_title="AQUACULTURE", page_icon="🐟", layout="wide")

st.markdown("""
<style>
#MainMenu, header, footer {visibility: hidden;}
.stApp {background: #0f1216;}
.block-container {padding: 0 !important; max-width: 100% !important;}
[data-testid="stAppViewContainer"] > .main {padding: 0 !important;}
[data-testid="stVerticalBlock"] {gap: 0 !important;}
iframe {height: 100vh !important; width: 100% !important; border: none; display: block;}
[data-testid="stHeader"] {display: none;}
</style>
""", unsafe_allow_html=True)


@st.cache_data(show_spinner="Dashboard yuklanmoqda...")
def build_html() -> str:
    html = (WEB / "index.html").read_text(encoding="utf-8")
    css = (WEB / "style.css").read_text(encoding="utf-8")
    appjs = (WEB / "app.js").read_text(encoding="utf-8")

    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
    html = html.replace('<script src="app.js"></script>', f"<script>\n{appjs}\n</script>")

    data = {f"data/{f}": json.loads((DATA / f).read_text(encoding="utf-8")) for f in DATA_FILES}
    mode = VIDEO.lower()
    if mode == "off":
        data["data/videos.json"] = {}

    shim = (
        "<script>window.__DATA__=" + json.dumps(data, ensure_ascii=False) + ";"
        "(function(){var of=window.fetch?window.fetch.bind(window):null;"
        "window.fetch=function(u,o){"
        "if(typeof u==='string'){var k=u.split('?')[0];"
        "if(window.__DATA__[k]!==undefined){var d=window.__DATA__[k];"
        "return Promise.resolve({ok:true,status:200,"
        "json:function(){return Promise.resolve(d);},"
        "text:function(){return Promise.resolve(JSON.stringify(d));}});}}"
        "return of?of(u,o):Promise.reject('no fetch');};})();</script>"
    )

    # video manzilini sozlash
    if mode == "static":
        # Streamlit static xizmati: <host>/app/static/video/<fayl>.
        # Streamlit Cloud ilovani /~/+/ prefiksi ostida ochadi. Faqat `origin`
        # ishlatilsa prefiks yo'qolib, video o'rniga platformaning HTML sahifasi
        # qaytadi. Parent sahifaning to'liq URL'idan nisbiy static yo'l yasaymiz:
        # lokalda  /app/static/video/
        # Cloud'da /~/+/app/static/video/
        vbase = (
            "<script>(function(){"
            "var b;"
            "try{b=(window.parent&&window.parent.location)?"
            "window.parent.location.href:location.href;}"
            "catch(e){b=document.referrer||location.href;}"
            "window.__VBASE=new URL('app/static/video/',b).href;"
            "})();</script>"
        )
        shim = vbase + shim
        appjs_marker = 'src="/videos/'
        html = html.replace(appjs_marker, 'src="${window.__VBASE}')
    elif mode != "off":
        html = html.replace('src="/videos/', f'src="{VIDEO}')

    html = html.replace('<script src="https://unpkg.com/maplibre-gl',
                        shim + '\n<script src="https://unpkg.com/maplibre-gl')
    return html


components.html(build_html(), height=1000, scrolling=False)
