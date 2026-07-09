# -*- coding: utf-8 -*-
"""Video manifest: hovuz id -> mp4 fayl nomi. web/data/videos.json ga yozadi."""
import json
import re
from pathlib import Path

VIDEO_DIR = Path(r"D:\Cloud_comp\Freshwater_carp\output\four_index")
OUT = Path(__file__).parent / "data" / "videos.json"
OUT.parent.mkdir(exist_ok=True)

pat = re.compile(r"^sirdaryo_carp_(\d+)_.*\.mp4$")
manifest: dict[str, str] = {}
for p in sorted(VIDEO_DIR.glob("*.mp4")):
    m = pat.match(p.name)
    if m and m.group(1) not in manifest:
        manifest[m.group(1)] = p.name

OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(manifest)} ta video manifestga yozildi -> {OUT}")
