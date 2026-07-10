# -*- coding: utf-8 -*-
"""AQUACULTURE dashboard — Streamlit Cloud entry point.

The dashboard is served as a real Streamlit custom-component URL. This is
important for MapLibre: a `components.html()` srcdoc iframe leaves GeoJSON
workers stuck, so raster tiles load while pond polygons do not.
"""
import os
from pathlib import Path

import streamlit as st
from streamlit.components.v1 import declare_component

ROOT = Path(__file__).parent
COMPONENT = ROOT / "dashboard_component"
VIDEO = os.environ.get("AQUA_VIDEO_BASE", "static")

# 1-QADAM: Poydevor doim birinchi keladi!
st.set_page_config(page_title="AQUACULTURE", page_icon="🐟", layout="wide")

# 2-QADAM: Barcha CSS stillarni bitta joyga jamladik
st.markdown(
    """
    <style>
    #MainMenu, header, footer {display: none !important;}
    .stApp {background: #0f1216;}
    .block-container {padding: 0 !important; max-width: 100% !important;}
    [data-testid="stAppViewContainer"] > .main {padding: 0 !important;}
    [data-testid="stVerticalBlock"] {gap: 0 !important;}
    [data-testid="stHeader"] {display: none !important;}
    
    /* Akkaunt profili belgisini yashirish qismi */
    .viewerBadge_container__1QSob, 
    .styles_viewerBadge__1yB5_, 
    .viewerBadge_link__1S137, 
    .viewerBadge_text__1JaDK {
        display: none !important;
    }

    iframe {
      height: 100vh !important;
      width: 100% !important;
      border: none !important;
      display: block;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

dashboard = declare_component("aquaculture_dashboard", path=str(COMPONENT))
dashboard(video_base=VIDEO, key="aquaculture-dashboard")
