/* AQUACULTURE — mahsulot dashboardi (MapLibre GL + ECharts)
   Mahsulotlar:
     1) Aqua Legal Control     — faollik / nofaollik (status + Util Score)
     2) Aqua Productivity Score — suv sifati, o'sish, biomassa, A/B/C/D
     3) 3-mahsulot              — tez orada
*/

/* ---------- Konstantalar ---------- */
const STATUS_COLORS = {
  "FAOL": "#2ecc71",              // yashil
  "QISMAN": "#9acd32",            // sariq-yashil
  "NOFAOL": "#ff9800",           // to'q sariq
  "TASHLAB_YUBORILGAN": "#d32f2f", // qizil
  "NOMA'LUM": "#8a939e",         // kulrang
};
const STATUS_ORDER = ["FAOL", "QISMAN", "NOFAOL", "TASHLAB_YUBORILGAN"];
const STATUS_LABEL = {
  "FAOL": "FAOL", "QISMAN": "QISMAN", "NOFAOL": "NOFAOL",
  "TASHLAB_YUBORILGAN": "TASHLAB YUBORILGAN",
};
const ACTIVE_FOR_BIOMASS = new Set(["FAOL", "QISMAN"]);
// faollik og'irligi: 0 = eng faol, 3 = eng nofaol (tashlab yuborilgan)
const STATUS_SEVERITY = {FAOL: 0, QISMAN: 1, NOFAOL: 2, TASHLAB_YUBORILGAN: 3};
const severity = s => STATUS_SEVERITY[s] != null ? STATUS_SEVERITY[s] : 4;

const CLASS_COLORS = {A: "#17b978", B: "#8ac926", C: "#f5b301", D: "#e74c3c"};
const CLASS_ORDER = ["A", "B", "C", "D"];
const CLASS_LABEL = {A: "A — yuqori", B: "B — yaxshi", C: "C — o'rta", D: "D — past"};
const RISK_CLASS = {"past": "risk-past", "o'rta": "risk-orta", "yuqori": "risk-yuqori"};
const YEARS = Array.from({length: 13}, (_, i) => 2014 + i);

const PRODUCTS = [
  {id: "legal", ico: "📊", name: "Aqua Utilization Control",
   sub: "Faollik / nofaollik monitoringi · Util Score", ready: true},
  {id: "aps", ico: "🐟", name: "Aqua Productivity Score",
   sub: "Suv sifati · o'sish · biomassa · A/B/C/D", ready: true},
  {id: "passport", ico: "🎫", name: "E-auksion / Investitsion pasport",
   sub: "Auction Readiness · Investment · Risk", ready: true},
  {id: "explorer", ico: "🔬", name: "Qo'shimcha analitikalar",
   sub: "Barcha indekslar · parametrlar · tarixiy signal", ready: true},
];

// Risk rangi (past/o'rta/yuqori)
const RISK_COLORS = {"past": "#2ecc71", "o'rta": "#ff9800", "yuqori": "#d32f2f"};
function riskClassColor(c) {
  return c === "past" ? "#2ecc71" : c === "o'rta" ? "#ff9800" : "#d32f2f";
}
function auctionColor(s) {
  return s >= 80 ? "#2ecc71" : s >= 60 ? "#9acd32" : s >= 40 ? "#ff9800" : "#d32f2f";
}
// Auction status — aniq chegaralar bo'yicha
const AUCTION_STATUSES = ["Auksionga tayyor", "Mayda to'ldirish kerak",
  "Tekshiruvdan keyin", "Tayyor emas"];
function auctionStatus(s) {
  s = s || 0;
  return s >= 80 ? "Auksionga tayyor" : s >= 60 ? "Mayda to'ldirish kerak"
    : s >= 40 ? "Tekshiruvdan keyin" : "Tayyor emas";
}
// huquqiy/kadastr ma'lumoti noma'lummi?
function legalUnknown(p) {
  return !p.has_legal_info || p.auction_legal_status === "TEKSHIRUV_KERAK"
    || p.lease_boundary_match === "NOMALUM";
}
// risk klassi — huquqiy noma'lum bo'lsa kamida "o'rta"
function riskClassOf(p) {
  const s = p.risk_score || 0;
  let c = s <= 30 ? "past" : s <= 60 ? "o'rta" : "yuqori";
  if (legalUnknown(p) && c === "past") c = "o'rta";
  return c;
}
// pasport haqiqatan tayyormi? (core maydonlar + readiness ≥ 80)
function passportReady(p) {
  const core = p.tuman && p.tuman !== "—" && p.has_area && p.has_polygon
    && p.has_centroid && p.has_satellite_image && p.has_activity_history;
  return !!core && (p.auction_readiness_score || 0) >= 80;
}
function passportStatusText(p) {
  return passportReady(p) ? "TAYYOR" : "TO'LDIRISH KERAK";
}
const CURRENT_YEAR = 2026;

/* ---------- Holat ---------- */
let year = 2026;
let product = "legal";
let classFilter = null;     // APS
let statusFilter = null;    // Legal
let rankTab = "top";
let ponds = null, prod = null, monthly = null, videos = {}, passport = null;
let passTab = "auction";
let passInvFilter = null, passAucFilter = null;
let hoverId = null;
const panelCharts = {};
let popupIndex = null, popupParam = null, popupBar = null;

/* ---------- Soat ---------- */
setInterval(() => {
  document.getElementById("clock").textContent =
    new Date().toLocaleString("uz-UZ", {dateStyle: "medium", timeStyle: "short"});
}, 1000);

/* ---------- Grafik modali — yopish ishlovchilari ---------- */
document.getElementById("chartModalClose").onclick = closeChartModal;
document.getElementById("chartModal").addEventListener("click", e => {
  if (e.target.id === "chartModal") closeChartModal();  // fon bosilganda
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeChartModal();
});
window.addEventListener("resize", () => { if (modalChart) modalChart.resize(); });

/* ---------- Xarita ---------- */
const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      esri: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256, attribution: "Esri World Imagery",
      },
    },
    layers: [{id: "esri", type: "raster", source: "esri"}],
  },
  center: [68.85, 40.6], zoom: 9,
  attributionControl: {compact: true},
  preserveDrawingBuffer: true,  // PDF uchun canvas'ni rasmga olish imkoni
});
map.addControl(new maplibregl.NavigationControl({showCompass: true}), "top-left");
map.addControl(new maplibregl.FullscreenControl(), "top-left");
map.addControl(new maplibregl.ScaleControl({unit: "metric"}), "bottom-left");

const hoverTip = new maplibregl.Popup({
  closeButton: false, closeOnClick: false, className: "hover-tip", offset: 8,
});

function classColorExpr() {
  return ["match", ["coalesce", ["get", `pc_${year}`], "?"],
    "A", CLASS_COLORS.A, "B", CLASS_COLORS.B,
    "C", CLASS_COLORS.C, "D", CLASS_COLORS.D, "#5a6472"];
}
function statusColorExpr() {
  return ["match", ["coalesce", ["get", `st_${year}`], "NOMA'LUM"],
    "FAOL", STATUS_COLORS.FAOL, "QISMAN", STATUS_COLORS.QISMAN,
    "NOFAOL", STATUS_COLORS.NOFAOL, "TASHLAB_YUBORILGAN", STATUS_COLORS.TASHLAB_YUBORILGAN,
    STATUS_COLORS["NOMA'LUM"]];
}
function investColorExpr() {
  return ["match", ["coalesce", ["get", "ic"], "?"],
    "A", CLASS_COLORS.A, "B", CLASS_COLORS.B,
    "C", CLASS_COLORS.C, "D", CLASS_COLORS.D, "#5a6472"];
}

map.on("load", async () => {
  const [gj, pj, mj, vj, ppj] = await Promise.all([
    fetch("data/hovuzlar.geojson").then(r => r.json()),
    fetch("data/product.json").then(r => r.json()),
    fetch("data/monthly.json").then(r => r.json()),
    fetch("data/videos.json").then(r => r.json()),
    fetch("data/passport.json").then(r => r.json()),
  ]);
  prod = pj; monthly = mj; videos = vj; passport = ppj;

  // productivity class + status + investment class ni feature xossalariga joylash
  gj.features.forEach(f => {
    const pid = String(f.properties.pond_id);
    const rec = prod[pid] || {};
    YEARS.forEach(y => {
      const r = rec[y];
      if (!r) return;
      if (r.pc) f.properties[`pc_${y}`] = r.pc;
      if (r.status) f.properties[`st_${y}`] = r.status;
    });
    const pp = passport[pid];
    if (pp) {
      if (pp.investment_class) f.properties.ic = pp.investment_class;
      f.properties.aucst = auctionStatus(pp.auction_readiness_score);
    }
  });
  ponds = gj;

  map.addSource("ponds", {type: "geojson", data: gj, generateId: true});
  map.addLayer({
    id: "ponds-fill", type: "fill", source: "ponds",
    paint: {"fill-color": statusColorExpr(),
      "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.8, 0.5]},
  });
  map.addLayer({
    id: "ponds-line", type: "line", source: "ponds",
    paint: {"line-color": statusColorExpr(),
      "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 3.5, 1.8]},
  });

  const bounds = new maplibregl.LngLatBounds();
  gj.features.forEach(f => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    polys.forEach(p => p[0].forEach(c => bounds.extend(c)));
  });
  map.fitBounds(bounds, {padding: 40, duration: 0});

  map.on("mousemove", "ponds-fill", e => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features[0];
    if (hoverId !== null) map.setFeatureState({source: "ponds", id: hoverId}, {hover: false});
    hoverId = f.id;
    map.setFeatureState({source: "ponds", id: hoverId}, {hover: true});
    const pid = String(f.properties.pond_id);
    const rec = (prod[pid] || {})[year] || {};
    const pp = passport[pid] || {};
    let info;
    if (product === "aps") info = `Klass ${rec.pc || "—"} · PS ${rec.ps ?? "—"}`;
    else if (product === "passport")
      info = `Invest ${pp.investment_class || "—"} · Auksion ${pp.auction_readiness_score ?? "—"}`;
    else info = `${rec.status || "—"} · Util ${rec.util ?? "—"}`;
    hoverTip.setLngLat(e.lngLat).setHTML(`<b>Hovuz ${pid}</b> — ${info}`).addTo(map);
  });
  map.on("mouseleave", "ponds-fill", () => {
    map.getCanvas().style.cursor = "";
    if (hoverId !== null) map.setFeatureState({source: "ponds", id: hoverId}, {hover: false});
    hoverId = null; hoverTip.remove();
  });

  map.on("click", "ponds-fill", e => {
    if (product === "passport") openPassportPopup(e.features[0].properties, e.lngLat);
    else if (product === "explorer") openAnalyticsPopup(e.features[0].properties, e.lngLat);
    else openPondPopup(e.features[0].properties, e.lngLat);
  });

  renderProductMenu();
  selectProduct("legal");
});

/* ---------- Mahsulotlar menyusi ---------- */
function renderProductMenu() {
  const el = document.getElementById("productMenu");
  el.innerHTML = "";
  PRODUCTS.forEach(p => {
    const d = document.createElement("div");
    d.className = "prod-item" + (p.id === product ? " active" : "") + (p.ready ? "" : " disabled");
    d.innerHTML =
      `<span class="prod-ico">${p.ico}</span>
       <span class="prod-txt"><div class="prod-name">${p.name}</div>
       <div class="prod-sub">${p.sub}</div></span>` +
      (p.ready ? "" : `<span class="prod-badge">tez orada</span>`);
    d.onclick = () => selectProduct(p.id);
    el.appendChild(d);
  });
}

function selectProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p || !p.ready) {
    if (p && !p.ready) placeholder(p);
    return;
  }
  product = id;
  classFilter = null; statusFilter = null; passInvFilter = null; passAucFilter = null;
  renderProductMenu();
  Object.values(panelCharts).forEach(c => c.dispose());
  for (const k in panelCharts) delete panelCharts[k];
  if (id === "aps") renderAPS();
  else if (id === "passport") renderPassport();
  else if (id === "explorer") renderExplorer();
  else renderLegal();
}

function placeholder(p) {
  product = p.id;
  renderProductMenu();
  Object.values(panelCharts).forEach(c => c.dispose());
  for (const k in panelCharts) delete panelCharts[k];
  document.getElementById("productBody").innerHTML =
    `<div class="card" style="text-align:center;padding:30px 16px;">
       <div style="font-size:40px;margin-bottom:8px;">${p.ico}</div>
       <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${p.name}</div>
       <div style="color:var(--text-dim);font-size:13px;">Bu mahsulot hozircha tayyorlanmoqda.</div>
     </div>`;
}

/* Yil bo'yicha yozuvlar */
function recordsForYear() {
  return ponds.features.map(f => {
    const pid = String(f.properties.pond_id);
    const rec = (prod[pid] || {})[year] || {};
    return {pid, tuman: f.properties.tuman || "—", area: +f.properties.area_ha || 0, ...rec};
  });
}
const avgOf = (arr, k) => {
  const v = arr.map(r => r[k]).filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function yearSelector(onchange) {
  const sel = document.getElementById("yearSel");
  YEARS.forEach(y => {
    const o = document.createElement("option");
    o.value = y; o.textContent = y;
    if (y === year) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = () => { year = +sel.value; onchange(); };
}

/* =====================================================================
   1) AQUA LEGAL CONTROL — faollik / nofaollik
   ===================================================================== */
function renderLegal() {
  document.getElementById("productBody").innerHTML = `
    <div class="card">
      <div class="card-title">📊 Aqua Utilization Control</div>
      <label class="field-label" for="yearSel">Yil</label>
      <select id="yearSel"></select>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Jami hovuz</div><div class="kpi-value" id="lCount">—</div></div>
        <div class="kpi"><div class="kpi-label">Faol ulushi</div><div class="kpi-value" id="lActive">—</div></div>
      </div>
      <div class="kpi wide"><div class="kpi-label">O'rtacha Util Score</div>
        <div class="kpi-value" id="lUtil">—</div>
        <div class="scorebar"><div class="scorebar-fill" id="lUtilBar"></div></div></div>
    </div>
    <div class="card">
      <div class="card-title">Faollik holati</div>
      <div id="statusRows"></div>
    </div>
    <div class="card">
      <div class="card-title">Util Score reytingi</div>
      <div class="tabs">
        <div class="tab" data-tab="top">🟢 Eng faol 20</div>
        <div class="tab" data-tab="risk">🔴 Eng nofaol 20</div>
      </div>
      <div id="rankBox"></div>
    </div>`;
  yearSelector(refresh);
  document.querySelectorAll(".tab").forEach(t =>
    t.onclick = () => { rankTab = t.dataset.tab; renderLegalRank(); });
  refresh();
}

function refreshLegal() {
  map.setPaintProperty("ponds-fill", "fill-color", statusColorExpr());
  map.setPaintProperty("ponds-line", "line-color", statusColorExpr());
  const filt = statusFilter
    ? ["==", ["coalesce", ["get", `st_${year}`], "NOMA'LUM"], statusFilter] : null;
  map.setFilter("ponds-fill", filt);
  map.setFilter("ponds-line", filt);
  renderLegendStatus();

  const all = recordsForYear();
  const counts = {};
  STATUS_ORDER.forEach(s => counts[s] = 0);
  all.forEach(r => { if (counts[r.status] != null) counts[r.status]++; });
  const rows = statusFilter ? all.filter(r => r.status === statusFilter) : all;

  document.getElementById("lCount").textContent = rows.length;
  const activePct = all.length
    ? Math.round((counts.FAOL + counts.QISMAN) / all.length * 100) : 0;
  document.getElementById("lActive").textContent = activePct + "%";
  const util = avgOf(rows, "util");
  document.getElementById("lUtil").textContent = util != null ? util.toFixed(1) : "—";
  document.getElementById("lUtilBar").style.width = (util || 0) + "%";

  const maxc = Math.max(1, ...Object.values(counts));
  const sr = document.getElementById("statusRows");
  sr.innerHTML = "";
  STATUS_ORDER.forEach(s => {
    const div = document.createElement("div");
    div.className = "class-row" + (statusFilter === s ? " active" : "");
    div.innerHTML =
      `<span class="class-badge" style="background:${STATUS_COLORS[s]};color:#fff;font-size:11px;">●</span>
       <span class="cname">${STATUS_LABEL[s]}
         <div class="class-bar"><div style="width:${counts[s] / maxc * 100}%;background:${STATUS_COLORS[s]}"></div></div>
       </span>
       <span class="ccount" style="color:${STATUS_COLORS[s]}">${counts[s]}</span>`;
    div.onclick = () => { statusFilter = statusFilter === s ? null : s; refresh(); };
    sr.appendChild(div);
  });
  renderLegalRank();
}

function renderLegalRank() {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === rankTab));
  const all = recordsForYear().filter(r => r.util != null);
  // Util ball bo'yicha: eng faol = kamayish, eng nofaol = o'sish
  all.sort((a, b) => rankTab === "top" ? b.util - a.util : a.util - b.util);
  const box = document.getElementById("rankBox");
  box.innerHTML =
    `<table class="rank-table"><thead><tr>
       <th>#</th><th>Hovuz</th><th>Tuman</th><th>Util</th>
     </tr></thead><tbody>` +
    all.slice(0, 20).map((r, i) =>
      `<tr data-pid="${r.pid}">
        <td>${i + 1}</td><td>${r.pid}</td><td>${r.tuman}</td>
        <td><b>${r.util != null ? r.util.toFixed(1) : "—"}</b></td>
      </tr>`).join("") + `</tbody></table>`;
  box.querySelectorAll("tr[data-pid]").forEach(tr =>
    tr.onclick = () => flyToPond(tr.dataset.pid));
}

/* =====================================================================
   2) AQUA PRODUCTIVITY SCORE
   ===================================================================== */
function renderAPS() {
  document.getElementById("productBody").innerHTML = `
    <div class="card">
      <div class="card-title">📈 Aqua Productivity Score</div>
      <label class="field-label" for="yearSel">Yil</label>
      <select id="yearSel"></select>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Jami hovuz</div><div class="kpi-value" id="kCount">—</div></div>
        <div class="kpi"><div class="kpi-label">O'rt. Productivity</div><div class="kpi-value" id="kPS">—</div></div>
      </div>
      <div class="kpi wide"><div class="kpi-label">O'rtacha Util Score</div>
        <div class="kpi-value" id="kUtil">—</div>
        <div class="scorebar"><div class="scorebar-fill" id="kUtilBar"></div></div></div>
    </div>
    <div class="card">
      <div class="card-title">Mahsuldorlik klassi</div>
      <div style="color:var(--text-dim);font-size:11px;margin:-6px 0 8px;">
        Util · Growth · Water Quality · Water Balance · Yield asosida</div>
      <div id="classRows"></div>
    </div>
    <div class="card">
      <div class="card-title">O'rtacha ballar</div>
      <div class="gauge-row">
        <div><div id="gUtil" class="gauge"></div><div class="gauge-cap">Util</div></div>
        <div><div id="gGrowth" class="gauge"></div><div class="gauge-cap">Growth</div></div>
        <div><div id="gProd" class="gauge"></div><div class="gauge-cap">Productivity</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Tumanlar bo'yicha biomassa (tonna)</div>
      <div id="tumanBiomass" class="chart tall"></div>
    </div>
    <div class="card">
      <div class="card-title">Suv balansi (o'rtacha, mm)</div>
      <div id="waterBalance" class="chart"></div>
    </div>
    <div class="card">
      <div class="card-title">Reyting</div>
      <div class="tabs">
        <div class="tab" data-tab="top">🏆 Eng yaxshi 20</div>
        <div class="tab" data-tab="risk">⚠️ Eng riskli 20</div>
      </div>
      <div id="rankBox"></div>
    </div>`;
  yearSelector(refresh);
  document.querySelectorAll(".tab").forEach(t =>
    t.onclick = () => { rankTab = t.dataset.tab; renderRank(); });

  panelCharts.gUtil = echarts.init(document.getElementById("gUtil"));
  panelCharts.gGrowth = echarts.init(document.getElementById("gGrowth"));
  panelCharts.gProd = echarts.init(document.getElementById("gProd"));
  panelCharts.tuman = echarts.init(document.getElementById("tumanBiomass"));
  panelCharts.water = echarts.init(document.getElementById("waterBalance"));
  window.addEventListener("resize", resizePanel);
  refresh();
}
function resizePanel() { Object.values(panelCharts).forEach(c => c.resize()); }

function refresh() {
  if (!ponds) return;
  if (product === "legal") return refreshLegal();
  if (product === "passport") return refreshPassport();
  if (product === "explorer") return refreshExplorer();
  if (product !== "aps") return;

  map.setPaintProperty("ponds-fill", "fill-color", classColorExpr());
  map.setPaintProperty("ponds-line", "line-color", classColorExpr());
  const filt = classFilter ? ["==", ["coalesce", ["get", `pc_${year}`], "?"], classFilter] : null;
  map.setFilter("ponds-fill", filt);
  map.setFilter("ponds-line", filt);
  renderLegendClass();

  const all = recordsForYear();
  const rows = classFilter ? all.filter(r => r.pc === classFilter) : all;

  document.getElementById("kCount").textContent = rows.length;
  const ps = avgOf(rows, "ps"), util = avgOf(rows, "util");
  document.getElementById("kPS").textContent = ps != null ? ps.toFixed(1) : "—";
  document.getElementById("kUtil").textContent = util != null ? util.toFixed(1) : "—";
  document.getElementById("kUtilBar").style.width = (util || 0) + "%";

  const counts = {A: 0, B: 0, C: 0, D: 0};
  all.forEach(r => { if (counts[r.pc] != null) counts[r.pc]++; });
  const maxc = Math.max(1, ...Object.values(counts));
  const cr = document.getElementById("classRows");
  cr.innerHTML = "";
  CLASS_ORDER.forEach(c => {
    const div = document.createElement("div");
    div.className = "class-row" + (classFilter === c ? " active" : "");
    div.innerHTML =
      `<span class="class-badge" style="background:${CLASS_COLORS[c]}">${c}</span>
       <span class="cname">${CLASS_LABEL[c]}
         <div class="class-bar"><div style="width:${counts[c] / maxc * 100}%;background:${CLASS_COLORS[c]}"></div></div>
       </span>
       <span class="ccount" style="color:${CLASS_COLORS[c]}">${counts[c]}</span>`;
    div.onclick = () => { classFilter = classFilter === c ? null : c; refresh(); };
    cr.appendChild(div);
  });

  gauge(panelCharts.gUtil, util, "#00b0ff");
  gauge(panelCharts.gGrowth, avgOf(rows, "gp"), "#17b978");
  gauge(panelCharts.gProd, ps, "#8ac926");
  renderTumanBiomass(rows);
  renderWaterBalance(rows);
  renderRank();
}

function gauge(chart, val, color) {
  chart.setOption({series: [{
    type: "gauge", min: 0, max: 100, radius: "88%", center: ["50%", "58%"],
    progress: {show: true, width: 8, itemStyle: {color}},
    axisLine: {lineStyle: {width: 8, color: [[1, "#262c35"]]}},
    axisTick: {show: false}, splitLine: {show: false}, axisLabel: {show: false},
    pointer: {show: false}, anchor: {show: false}, title: {show: false},
    detail: {valueAnimation: true, offsetCenter: [0, 0], fontSize: 20, fontWeight: 700,
      color: "#e8eaed", formatter: v => v == null || isNaN(v) ? "—" : Math.round(v)},
    data: [{value: val == null ? 0 : val}],
  }]});
}

function renderTumanBiomass(rows) {
  const byT = {};
  rows.forEach(r => { byT[r.tuman] = (byT[r.tuman] || 0) + (r.biomass || 0); });
  const arr = Object.entries(byT).map(([t, v]) => [t, v / 1000]).sort((a, b) => a[1] - b[1]);
  panelCharts.tuman.setOption({
    grid: {left: 4, right: 30, top: 6, bottom: 4, containLabel: true},
    tooltip: {trigger: "axis", axisPointer: {type: "shadow"}, valueFormatter: v => v.toFixed(1) + " t"},
    xAxis: {type: "value", axisLabel: {color: "#9aa4b0", fontSize: 10}, splitLine: {lineStyle: {color: "#262c35"}}},
    yAxis: {type: "category", data: arr.map(a => a[0]), axisLabel: {color: "#e8eaed", fontSize: 11}},
    series: [{type: "bar", data: arr.map(a => +a[1].toFixed(1)),
      itemStyle: {color: "#17b978", borderRadius: [0, 4, 4, 0]},
      label: {show: true, position: "right", color: "#9aa4b0", fontSize: 10, formatter: "{c}"}}],
  });
}

function renderWaterBalance(rows) {
  const a = k => Math.round(avgOf(rows, k) || 0);
  panelCharts.water.setOption({
    grid: {left: 4, right: 12, top: 20, bottom: 4, containLabel: true},
    tooltip: {trigger: "axis", axisPointer: {type: "shadow"}, valueFormatter: v => Math.round(v) + " mm"},
    xAxis: {type: "category", data: ["Yog'in", "Bug'lanish", "Sof ehtiyoj"], axisLabel: {color: "#e8eaed", fontSize: 11}},
    yAxis: {type: "value", axisLabel: {color: "#9aa4b0", fontSize: 10}, splitLine: {lineStyle: {color: "#262c35"}}},
    series: [{type: "bar", barWidth: "52%",
      data: [{value: a("rain"), itemStyle: {color: "#1565c0"}},
             {value: a("evap"), itemStyle: {color: "#ef6c00"}},
             {value: a("netwater_mm"), itemStyle: {color: "#00b0ff"}}],
      itemStyle: {borderRadius: [4, 4, 0, 0]},
      label: {show: true, position: "top", color: "#e8eaed", fontSize: 11}}],
  });
}

function renderRank() {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === rankTab));
  const all = recordsForYear().filter(r => r.ps != null);
  all.sort((a, b) => rankTab === "top" ? b.ps - a.ps : a.ps - b.ps);
  const box = document.getElementById("rankBox");
  box.innerHTML =
    `<table class="rank-table"><thead><tr>
       <th>#</th><th>Hovuz</th><th>Tuman</th><th>PS</th><th>Kl</th><th>Biomassa</th>
     </tr></thead><tbody>` +
    all.slice(0, 20).map((r, i) =>
      `<tr data-pid="${r.pid}">
        <td>${i + 1}</td><td>${r.pid}</td><td>${r.tuman}</td>
        <td><b>${r.ps != null ? r.ps.toFixed(1) : "—"}</b></td>
        <td><span class="rank-cls" style="background:${CLASS_COLORS[r.pc] || "#5a6472"}">${r.pc || "?"}</span></td>
        <td>${r.biomass != null ? (r.biomass / 1000).toFixed(2) + " t" : "—"}</td>
      </tr>`).join("") + `</tbody></table>`;
  box.querySelectorAll("tr[data-pid]").forEach(tr =>
    tr.onclick = () => flyToPond(tr.dataset.pid));
}

function flyToPond(pid) {
  const f = ponds.features.find(x => String(x.properties.pond_id) === String(pid));
  if (!f) return;
  const b = new maplibregl.LngLatBounds();
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  polys.forEach(p => p[0].forEach(c => b.extend(c)));
  map.fitBounds(b, {padding: 120, maxZoom: 15, duration: 800});
  map.once("moveend", () => openPondPopup(f.properties, b.getCenter()));
}

/* ---------- Legenda ---------- */
function renderLegendClass() {
  document.getElementById("legend").innerHTML =
    `<div style="font-size:11px;color:#9aa4b0;margin-bottom:4px;">Productivity Class</div>` +
    CLASS_ORDER.map(c =>
      `<div class="legend-item"><span class="sw" style="background:${CLASS_COLORS[c]}"></span>${CLASS_LABEL[c]}</div>`
    ).join("");
}
function renderLegendStatus() {
  document.getElementById("legend").innerHTML =
    `<div style="font-size:11px;color:#9aa4b0;margin-bottom:4px;">Faollik holati</div>` +
    STATUS_ORDER.map(s =>
      `<div class="legend-item"><span class="sw" style="background:${STATUS_COLORS[s]}"></span>${STATUS_LABEL[s]}</div>`
    ).join("");
}
function renderLegendInvest() {
  document.getElementById("legend").innerHTML =
    `<div style="font-size:11px;color:#9aa4b0;margin-bottom:4px;">Investment Class</div>` +
    CLASS_ORDER.map(c =>
      `<div class="legend-item"><span class="sw" style="background:${CLASS_COLORS[c]}"></span>${CLASS_LABEL[c]}</div>`
    ).join("");
}

/* =====================================================================
   4) QO'SHIMCHA ANALITIKALAR (Aqua Analytics Explorer)
   ===================================================================== */
function renderExplorer() {
  document.getElementById("productBody").innerHTML = `
    <div class="card">
      <div class="card-title">🔬 Qo'shimcha analitikalar</div>
      <div style="color:var(--text-dim);font-size:12px;line-height:1.5;">
        Har bir hovuz ichidagi <b>barcha indeks, parametr, oylik qiymat, anomaliya
        va xom atributlar</b>ni ochib beradi. Bu mahsulot qaror bermaydi —
        ma'lumotni ko'rsatadi.
        <br><br>Xaritadan <b>hovuzni bosing</b> — 6 tabli analitika oynasi ochiladi:
      </div>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:5px;font-size:12px;">
        <div>🪪 Hovuz pasporti · Faollik signallari</div>
        <div>📈 Indekslar dinamikasi (NDWI/NDCI/NDTI/TI)</div>
        <div>🧪 Suv sifati parametrlari</div>
        <div>🌡️ Harorat va suv balansi</div>
        <div>⚠️ Anomaliya va signal</div>
        <div>🗂️ Xom atributlar jadvali (CSV eksport)</div>
      </div>
    </div>`;
  refresh();
}

function refreshExplorer() {
  // neytral rang — "bosib ko'ring" rejimi (holat bo'yicha)
  map.setPaintProperty("ponds-fill", "fill-color", statusColorExpr());
  map.setPaintProperty("ponds-line", "line-color", statusColorExpr());
  map.setFilter("ponds-fill", null);
  map.setFilter("ponds-line", null);
  renderLegendStatus();
}

/* =====================================================================
   3) E-AUKSION / INVESTITSION PASPORT
   ===================================================================== */
function passportRows() {
  return ponds.features.map(f => {
    const pid = String(f.properties.pond_id);
    return {pid, tuman: f.properties.tuman || "—", ...(passport[pid] || {})};
  });
}

function renderPassport() {
  document.getElementById("productBody").innerHTML = `
    <div class="card">
      <div class="card-title">🎫 E-auksion / Investitsion pasport</div>
      <div style="color:var(--text-dim);font-size:11px;margin-bottom:10px;">
        Bu hovuzni auksionga chiqarish mumkinmi, qiymati va risklari qanday?</div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Jami lot</div><div class="kpi-value" id="pCount">—</div></div>
        <div class="kpi"><div class="kpi-label">Auksionga yaqin</div><div class="kpi-value" id="pReady">—</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">O'rtacha ballar</div>
      <div class="gauge-row">
        <div><div id="gAuc" class="gauge"></div><div class="gauge-cap">Auction</div></div>
        <div><div id="gInv" class="gauge"></div><div class="gauge-cap">Investment</div></div>
        <div><div id="gRisk" class="gauge"></div><div class="gauge-cap">Risk</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Auction Status taqsimoti</div>
      <div id="aucRows"></div>
    </div>
    <div class="card">
      <div class="card-title">Investment Class taqsimoti</div>
      <div id="invRows"></div>
    </div>
    <div class="card">
      <div class="card-title">Reyting</div>
      <div class="tabs">
        <div class="tab" data-tab="auction">🏛️ Auksionga tayyor</div>
        <div class="tab" data-tab="invest">💰 Investitsion</div>
        <div class="tab" data-tab="risk">⚠️ Riskli</div>
      </div>
      <div id="passRankBox"></div>
    </div>`;

  document.querySelectorAll(".tab").forEach(t =>
    t.onclick = () => { passTab = t.dataset.tab; renderPassRank(); });

  panelCharts.gAuc = echarts.init(document.getElementById("gAuc"));
  panelCharts.gInv = echarts.init(document.getElementById("gInv"));
  panelCharts.gRisk = echarts.init(document.getElementById("gRisk"));
  window.addEventListener("resize", resizePanel);
  refresh();
}

function aucColorFor(s) {
  return auctionColor(s === "Auksionga tayyor" ? 90 : s === "Mayda to'ldirish kerak"
    ? 70 : s === "Tekshiruvdan keyin" ? 50 : 20);
}

function refreshPassport() {
  map.setPaintProperty("ponds-fill", "fill-color", investColorExpr());
  map.setPaintProperty("ponds-line", "line-color", investColorExpr());
  // taqsimot filtrlarini xaritaga qo'llash (AND)
  const conds = [];
  if (passInvFilter) conds.push(["==", ["coalesce", ["get", "ic"], "?"], passInvFilter]);
  if (passAucFilter) conds.push(["==", ["coalesce", ["get", "aucst"], "?"], passAucFilter]);
  const filt = conds.length ? ["all", ...conds] : null;
  map.setFilter("ponds-fill", filt);
  map.setFilter("ponds-line", filt);
  renderLegendInvest();

  const all = passportRows();
  const rows = all.filter(r =>
    (!passInvFilter || r.investment_class === passInvFilter) &&
    (!passAucFilter || auctionStatus(r.auction_readiness_score) === passAucFilter));

  document.getElementById("pCount").textContent = rows.length;
  const nearN = rows.filter(r => (r.auction_readiness_score || 0) >= 60).length;
  document.getElementById("pReady").textContent = nearN;

  gauge(panelCharts.gAuc, avgOf(rows, "auction_readiness_score"), "#00b0ff");
  gauge(panelCharts.gInv, avgOf(rows, "investment_score"), "#8ac926");
  gauge(panelCharts.gRisk, avgOf(rows, "risk_score"), "#ff9800");

  // Auction status taqsimoti (bosilsa filtr)
  const acnt = {};
  AUCTION_STATUSES.forEach(s => acnt[s] = 0);
  all.forEach(r => { acnt[auctionStatus(r.auction_readiness_score)]++; });
  const amax = Math.max(1, ...Object.values(acnt));
  const abox = document.getElementById("aucRows");
  abox.innerHTML = "";
  AUCTION_STATUSES.forEach(s => {
    const col = aucColorFor(s);
    const div = document.createElement("div");
    div.className = "class-row" + (passAucFilter === s ? " active" : "");
    div.innerHTML =
      `<span class="class-badge" style="background:${col};color:#fff;font-size:11px;">●</span>
       <span class="cname">${s}
         <div class="class-bar"><div style="width:${acnt[s] / amax * 100}%;background:${col}"></div></div>
       </span>
       <span class="ccount" style="color:${col}">${acnt[s]}</span>`;
    div.onclick = () => { passAucFilter = passAucFilter === s ? null : s; refresh(); };
    abox.appendChild(div);
  });

  // Investment class taqsimoti (bosilsa filtr)
  const counts = {A: 0, B: 0, C: 0, D: 0};
  all.forEach(r => { if (counts[r.investment_class] != null) counts[r.investment_class]++; });
  const maxc = Math.max(1, ...Object.values(counts));
  const box = document.getElementById("invRows");
  box.innerHTML = "";
  CLASS_ORDER.forEach(c => {
    const div = document.createElement("div");
    div.className = "class-row" + (passInvFilter === c ? " active" : "");
    div.innerHTML =
      `<span class="class-badge" style="background:${CLASS_COLORS[c]}">${c}</span>
       <span class="cname">${CLASS_LABEL[c]}
         <div class="class-bar"><div style="width:${counts[c] / maxc * 100}%;background:${CLASS_COLORS[c]}"></div></div>
       </span>
       <span class="ccount" style="color:${CLASS_COLORS[c]}">${counts[c]}</span>`;
    div.onclick = () => { passInvFilter = passInvFilter === c ? null : c; refresh(); };
    box.appendChild(div);
  });

  renderPassRank();
}

function renderPassRank() {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === passTab));
  const all = passportRows();
  let key, label, colorFn, badge;
  if (passTab === "auction") {
    key = "auction_readiness_score"; label = "Auksion";
    colorFn = auctionColor; badge = r => auctionStatus(r.auction_readiness_score);
  } else if (passTab === "invest") {
    key = "investment_score"; label = "Invest";
    colorFn = s => CLASS_COLORS[classFromScore(s)] || "#5a6472"; badge = r => classFromScore(r.investment_score || 0);
  } else {
    key = "risk_score"; label = "Risk";
    colorFn = s => riskClassColor(s <= 30 ? "past" : s <= 60 ? "o'rta" : "yuqori");
    badge = r => riskClassOf(r);
  }
  all.sort((a, b) => (b[key] || 0) - (a[key] || 0));
  const box = document.getElementById("passRankBox");
  box.innerHTML =
    `<table class="rank-table"><thead><tr>
       <th>#</th><th>Lot</th><th>Tuman</th><th>${label}</th><th></th>
     </tr></thead><tbody>` +
    all.slice(0, 20).map((r, i) =>
      `<tr data-pid="${r.pid}">
        <td>${i + 1}</td><td>${r.pid}</td><td>${r.tuman}</td>
        <td><b style="color:${colorFn(r[key] || 0)}">${r[key] != null ? Math.round(r[key]) : "—"}</b></td>
        <td style="font-size:10.5px;color:var(--text-dim);">${badge(r) || "—"}</td>
      </tr>`).join("") + `</tbody></table>`;
  box.querySelectorAll("tr[data-pid]").forEach(tr =>
    tr.onclick = () => flyToPassport(tr.dataset.pid));
}

function classFromScore(s) {
  return s >= 80 ? "A" : s >= 60 ? "B" : s >= 40 ? "C" : "D";
}

function flyToPassport(pid) {
  const f = ponds.features.find(x => String(x.properties.pond_id) === String(pid));
  if (!f) return;
  const b = new maplibregl.LngLatBounds();
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  polys.forEach(p => p[0].forEach(c => b.extend(c)));
  map.fitBounds(b, {padding: 120, maxZoom: 15, duration: 800});
  map.once("moveend", () => openPassportPopup(f.properties, b.getCenter()));
}

/* =====================================================================
   POP-UP (hovuz kartasi)
   ===================================================================== */
function fmt(v, nd = 1, unit = "") {
  if (v == null || isNaN(v)) return "—";
  const n = nd === 0 ? Math.round(v) : (+v).toFixed(nd);
  return unit ? `${n}<small> ${unit}</small>` : n;
}
function cell(k, v) {
  return `<div class="pp-cell"><div class="k">${k}</div><div class="v">${v}</div></div>`;
}
function riskCell(label, v) {
  return cell(label, `<span class="${RISK_CLASS[v] || ""}">${v || "—"}</span>`);
}
function block(title, sub, cellsHTML, extra = "") {
  return `<div class="pp-block">
    <div class="pp-block-h">${title}<span class="pp-block-q">${sub}</span></div>
    <div class="pp-grid">${cellsHTML}</div>${extra}</div>`;
}

function openPondPopup(props, lngLat) {
  const pid = String(props.pond_id);
  const r = (prod[pid] || {})[year] || {};
  const cls = r.pc || "?";
  const clsColor = CLASS_COLORS[cls] || "#5a6472";
  const status = r.status || props[`foydalanilgan_${year}`] || "NOMA'LUM";
  const stColor = STATUS_COLORS[status] || "#8a939e";
  const vid = window.__VIDEO_OFF ? null : videos[pid];
  const period = (r.astart && r.aend) ? `${r.astart} → ${r.aend}` : "—";

  // Blok 1 — Faollik
  const b1 = block("🎣 Faollik", "Hovuz ishlayaptimi?",
    cell("Util status", `<span style="color:${stColor}">${status}</span>`) +
    cell("Util Score", fmt(r.util, 1)) +
    cell("Tahlil davri", `<small>${period}</small>`));

  // Blok 2 — Suv sifati
  const b2 = block("💧 Suv sifati", "Baliq uchun qulaymi?",
    cell("TSI", `${fmt(r.tsi, 1)}${r.trophic ? " — " + r.trophic : ""}`) +
    cell("Water Quality Score", fmt(r.wq, 0, "/ 100")) +
    cell("Chl-a", fmt(r.chla, 1, "mg/m³")) +
    cell("Secchi", fmt(r.secchi, 2, "m")) +
    cell("NDTI", fmt(r.ndti, 3)) +
    riskCell("Alga riski", r.algae) +
    riskCell("Loyqalik riski", r.turb));

  // Blok 3 — O'sish potensiali
  const b3 = block("🌱 O'sish potensiali", "Sharoit bormi?",
    cell("Growth Potential", fmt(r.gp, 1)) +
    cell("Food Score", fmt(r.food, 1)) +
    cell("Thermal Score", fmt(r.thermal, 1)) +
    cell("Optimal kunlar", fmt(r.optdays, 0)) +
    cell("Issiqlik stress", fmt(r.heatdays, 0, "kun")));

  // Blok 4 — Biomassa (faqat FAOL/QISMAN)
  let b4;
  if (ACTIVE_FOR_BIOMASS.has(status)) {
    b4 = block("🐟 Biomassa va hosildorlik", "",
      cell("Joriy biomassa", fmt(r.biomass / 1000, 2, "t")) +
      cell("Yil oxiri hosil", fmt(r.harvest / 1000, 2, "t")) +
      cell("Hosildorlik", fmt(r.yield, 2, "t/ga")) +
      cell("Ishonch darajasi", `<small>${r.bconf || "—"}</small>`));
  } else {
    b4 = `<div class="pp-block"><div class="pp-block-h">🐟 Biomassa va hosildorlik</div>
      <div class="pp-nobiomass">Biomassa: <b>hisoblanmadi</b><br>
      <span>Sabab: hovuz faolligi yetarli emas (${status})</span></div></div>`;
  }

  const vidHTML = vid
    ? `<video class="pp-video" src="${window.__VBASE || "/videos/"}${vid}" controls preload="metadata"></video>`
    : `<div class="pp-novideo">Video topilmadi</div>`;

  const html = `
    <div class="pp-head" style="background:${stColor}">
      <div class="pp-head-main">
        <div class="pp-head-title">Hovuz ${pid}</div>
        <div class="pp-head-line">Util status: <b>${status}</b></div>
        <div class="pp-head-line">Productivity class: <b>${cls}${CLASS_LABEL[cls] ? " — " + CLASS_LABEL[cls].split("— ")[1] : ""}</b></div>
      </div>
      <span class="pp-class" style="color:${clsColor};background:rgba(0,0,0,.32)">${cls}</span>
    </div>
    <div class="pp-body">
      <div class="pp-blocks-2col">${b1}${b2}${b3}${b4}</div>
      <div class="pp-charts">
        <div class="pp-chart-col">
          <div class="pp-section-title">Suv sifati — indekslar
            <button class="pp-expand" data-kind="index" title="Kattalashtirish">⛶</button></div>
          <div class="pp-chart-half" id="ppIndex"></div>
        </div>
        <div class="pp-chart-col">
          <div class="pp-section-title">Parametrlar
            <button class="pp-expand" data-kind="param" title="Kattalashtirish">⛶</button></div>
          <div class="pp-chart-half" id="ppParam"></div>
        </div>
      </div>
      ${vidHTML}
    </div>`;

  disposePopupCharts();
  const mw = Math.min(560, map.getContainer().clientWidth - 24);
  const popup = new maplibregl.Popup({maxWidth: mw + "px", className: "pond-popup",
    anchor: "left", offset: 14})
    .setLngLat(lngLat).setHTML(html).addTo(map);
  const contentEl = popup.getElement().querySelector(".maplibregl-popup-content");
  contentEl.style.width = mw + "px";
  // tanani xarita balandligiga sig'dirish — video ko'rinishi uchun skroll
  const bodyEl = popup.getElement().querySelector(".pp-body");
  const headH = popup.getElement().querySelector(".pp-head").offsetHeight;
  bodyEl.style.maxHeight = (map.getContainer().clientHeight - headH - 40) + "px";
  bodyEl.style.overflowY = "auto";
  makeDraggable(popup);

  popupIndex = echarts.init(popup.getElement().querySelector("#ppIndex"));
  popupParam = echarts.init(popup.getElement().querySelector("#ppParam"));
  drawIndexChart(popupIndex, pid);
  drawParamChart(popupParam, pid);

  // "kattalashtirish" tugmalari
  popup.getElement().querySelectorAll(".pp-expand").forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); openChartModal(btn.dataset.kind, pid); };
  });

  placePopupRight(popup, pid, lngLat);
  const vEl = popup.getElement().querySelector("video");
  if (vEl) vEl.addEventListener("loadedmetadata", () => clampPopup(popup), {once: true});
  popup.on("close", disposePopupCharts);
}
function disposePopupCharts() {
  [popupIndex, popupParam, popupBar].forEach(c => c && c.dispose());
  popupIndex = popupParam = popupBar = null;
}

/* =====================================================================
   PASPORT POP-UP (7 blok + 3 ball + PDF)
   ===================================================================== */
function scoreCard(label, val, color, sub) {
  return `<div class="score-card" style="border-color:${color}">
    <div class="score-val" style="color:${color}">${val != null ? Math.round(val) : "—"}</div>
    <div class="score-lbl">${label}</div>
    <div class="score-sub">${sub || ""}</div></div>`;
}

function openPassportPopup(props, lngLat) {
  const pid = String(props.pond_id);
  const p = passport[pid] || {};
  const invC = p.investment_class || "?";
  const invColor = CLASS_COLORS[invC] || "#5a6472";
  const status = p.current_status_2026 || p.current_status || "—";
  const stColor = STATUS_COLORS[status] || "#8a939e";
  const rClass = riskClassOf(p);

  // 3 ball
  const scores = `<div class="score-row">
    ${scoreCard("Auction Readiness", p.auction_readiness_score, auctionColor(p.auction_readiness_score || 0), auctionStatus(p.auction_readiness_score))}
    ${scoreCard("Investment", p.investment_score, invColor, "Class " + invC)}
    ${scoreCard("Risk", p.risk_score, riskClassColor(rClass), rClass)}
  </div>`;

  // 1 — Lot pasporti
  const b1 = block("📋 Lot pasporti", "",
    cell("Passport ID", `<small>${p.passport_id || "—"}</small>`) +
    cell("Viloyat / tuman", `<small>${p.tuman || "—"}</small>`) +
    cell("Maydon", fmt(p.area_ha, 2, "ga")) +
    cell("Perimetr", fmt(p.perimeter_m, 0, "m")) +
    cell("Koordinata", `<small>${fmt(p.centroid_y, 3)}, ${fmt(p.centroid_x, 3)}</small>`) +
    cell("Chegara sifati", p.boundary_quality || "—") +
    cell("Oxirgi rasm", `<small>${p.satellite_image_date || "—"}</small>`) +
    cell("Pasport holati", passportStatusText(p)));

  // 2 — Faollik tarixi
  const lastActive = p.last_active_year != null && p.last_active_year >= CURRENT_YEAR
    ? `${p.last_active_year} <small>(hozirgacha)</small>` : (p.last_active_year ?? "—");
  const b2 = block("📊 Faollik tarixi", "",
    cell("Birinchi faol yil", p.first_active_year ?? "—") +
    cell("Oxirgi faol yil", lastActive) +
    cell("Faol yillar", p.active_years_count ?? "—") +
    cell("Nofaol yillar", p.inactive_years_count ?? "—") +
    cell("O'rt. Util (barcha)", fmt(p.avg_util_score_all_years, 1)) +
    cell("Joriy Util", fmt(p.current_util_score_2026 ?? p.current_util_score, 1)) +
    cell("Joriy holat", `<span style="color:${stColor}">${status}</span>`) +
    cell("Tarix klassi", `<small>${p.activity_history_class || "—"}</small>`));

  // 3 — Produktivlik
  const b3 = block("🐟 Produktivlik va hosildorlik", "",
    cell("Productivity", `${fmt(p.productivity_score, 1)} <small>${p.productivity_class || ""}</small>`) +
    cell("Growth Potential", fmt(p.growth_potential, 1)) +
    cell("Hosildorlik", fmt(p.adjusted_yield_t_ha, 2, "t/ga")) +
    cell("Yil oxiri hosil", fmt((p.adjusted_harvest_kg || 0) / 1000, 2, "t")) +
    cell("Joriy biomassa", fmt((p.adjusted_biomass_kg || 0) / 1000, 2, "t")) +
    cell("Ishonch", `<small>${p.biomass_confidence || "—"}</small>`));

  // 4 — Suv balansi
  const b4 = block("💧 Suv xarajati va balans", "",
    cell("Bug'lanish", fmt(p.evap_total_mm, 0, "mm")) +
    cell("Yog'in", fmt(p.rain_total_mm, 0, "mm")) +
    cell("Sof ehtiyoj", fmt(p.net_water_need_mm, 0, "mm")) +
    riskCellPass("Suv xarajati riski", p.water_cost_risk),
    `<div class="pp-note">💦 Mavsumda ushlab turish uchun taxminiy qo'shimcha suv ehtiyoji:
       <b>${p.net_water_need_m3 != null ? Math.round(p.net_water_need_m3).toLocaleString("uz-UZ") : "—"} m³</b></div>`);

  // 5 — Suv sifati
  const b5 = block("🧪 Suv sifati va ekologik risk", "",
    cell("Water Quality", fmt(p.water_quality_score, 0, "/ 100")) +
    cell("TSI", `${fmt(p.tsi, 1)}${p.trophic_class ? " — " + p.trophic_class : ""}`) +
    cell("Chl-a", fmt(p.chla_mean, 1, "mg/m³")) +
    cell("Secchi", fmt(p.secchi_mean, 2, "m")) +
    riskCellPass("Alga riski", p.algae_risk) +
    riskCellPass("Loyqalik riski", p.turbidity_risk));

  // 6 — Infratuzilma
  const b6 = block("🛣️ Joylashuv va infratuzilma", "",
    cell("Relyef (slope)", p.slope_class || "—") +
    cell("Kanalga masofa", `<small>Ma'lumot qo'shilmagan</small>`) +
    cell("Yo'lga masofa", `<small>Ma'lumot qo'shilmagan</small>`) +
    cell("Kollektorga", `<small>Ma'lumot qo'shilmagan</small>`),
    `<div class="pp-note pp-note-dim">Infratuzilma masofalari (kanal, yo'l, kollektor, aholi punkti)
       vektor qatlamlar tayyor bo'lgach qo'shiladi.</div>`);

  // 7 — Huquqiy risk
  const b7 = block("⚖️ Huquqiy va chegaraviy risk", "",
    cell("Chegara riski", `<small>${p.boundary_risk || "—"}</small>`) +
    cell("Yer o'zgarishi", `<small>${p.land_transform_risk || "—"}</small>`) +
    cell("Tekshiruv ustuvorligi", p.legal_check_priority || "—") +
    cell("Kadastr mosligi", `<small>${p.lease_boundary_match || "—"}</small>`) +
    cell("Auksion huquqiy", `<small>${p.auction_legal_status || "—"}</small>`) +
    cell("Yetishmayapti", `<small>${p.missing_auction_info || "—"}</small>`),
    `<div class="pp-note pp-note-dim">Chegaraviy/huquqiy moslik bo'yicha dala tekshiruvi talab etiladi.` +
    (legalUnknown(p) ? ` Huquqiy/kadastr ma'lumoti noma'lum bo'lgani uchun risk kamida <b>«o'rta»</b> deb baholandi.` : "") +
    `</div>`);

  const html = `
    <div class="pp-head" style="background:${invColor}">
      <div class="pp-head-main">
        <div class="pp-head-title">Lot ${p.passport_id || pid}</div>
        <div class="pp-head-line">${p.viloyat || ""} · ${p.tuman || "tuman —"} · ${fmt(p.area_ha, 2)} ga</div>
        <div class="pp-head-line">Joriy holat: <b>${status}</b> · Pasport: <b>${passportStatusText(p)}</b></div>
      </div>
      <span class="pp-class-lbl">
        <small>Investment</small>
        <span class="pp-class" style="color:${invColor};background:rgba(0,0,0,.32)">${invC}</span>
      </span>
    </div>
    <div class="pp-body">
      ${scores}
      <button class="pdf-btn" id="pdfBtn">📄 E-auksion pasport PDF yuklab olish</button>
      <div class="pp-blocks-2col">${b1}${b2}${b3}${b4}${b5}${b6}${b7}</div>
    </div>`;

  const mw = Math.min(760, map.getContainer().clientWidth - 24);
  const popup = new maplibregl.Popup({maxWidth: mw + "px", className: "pond-popup passport-popup",
    anchor: "left", offset: 14})
    .setLngLat(lngLat).setHTML(html).addTo(map);
  const contentEl = popup.getElement().querySelector(".maplibregl-popup-content");
  contentEl.style.width = mw + "px";
  const bodyEl = popup.getElement().querySelector(".pp-body");
  const headH = popup.getElement().querySelector(".pp-head").offsetHeight;
  bodyEl.style.maxHeight = (map.getContainer().clientHeight - headH - 40) + "px";
  bodyEl.style.overflowY = "auto";
  bodyEl.style.overflowX = "hidden";
  makeDraggable(popup);
  popup.getElement().querySelector("#pdfBtn").onclick = e => { e.stopPropagation(); exportPassportPDF(pid); };
  placePopupRight(popup, pid, lngLat);
}
function riskCellPass(label, v) {
  return cell(label, `<span class="${RISK_CLASS[v] || ""}">${v || "—"}</span>`);
}

/* ---------- E-auksion pasport PDF (brauzer print → PDF) ---------- */
function pondBBox(pid) {
  const f = ponds.features.find(x => String(x.properties.pond_id) === String(pid));
  if (!f) return null;
  const b = new maplibregl.LngLatBounds();
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  polys.forEach(p => p[0].forEach(c => b.extend(c)));
  return b;
}

// tanlangan hovuzni ajratib ko'rsatib, xarita canvas'ini rasm (dataURL) qilib olish
function capturePondImage(pid) {
  return new Promise(resolve => {
    // generate:true bo'lgani uchun feature id = massivdagi indeks
    const idx = ponds.features.findIndex(x => String(x.properties.pond_id) === String(pid));
    const b = pondBBox(pid);
    if (idx < 0 || !b) return resolve("");
    if (hoverId !== null) map.setFeatureState({source: "ponds", id: hoverId}, {hover: false});
    map.setFeatureState({source: "ponds", id: idx}, {hover: true});  // chegarani qalinlashtiradi
    map.fitBounds(b, {padding: 90, maxZoom: 16, duration: 0});
    map.once("idle", () => {
      let url = "";
      try { url = map.getCanvas().toDataURL("image/png"); } catch (_) {}
      map.setFeatureState({source: "ponds", id: idx}, {hover: false});
      resolve(url);
    });
  });
}

async function exportPassportPDF(pid) {
  const p = passport[pid] || {};
  // oynani DARHOL ochamiz (klik ishorasi ichida — pop-up blocker to'smasin)
  const w = window.open("", "_blank");
  if (!w) { alert("Pop-up bloklangan — brauzerda ruxsat bering."); return; }
  w.document.write(`<!DOCTYPE html><meta charset="utf-8"><body style="font-family:Segoe UI,Arial;
    background:#111;color:#ccc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <div>Pasport tayyorlanmoqda…</div></body>`);
  const imgData = await capturePondImage(pid);
  const inv = p.investment_class || "?";
  const invColor = CLASS_COLORS[inv] || "#555";
  const status = p.current_status_2026 || p.current_status || "—";
  const num = (v, d = 1) => v == null ? "—" : (+v).toFixed(d);
  const tbl = rows => `<table class="t">${rows.map(r =>
    `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table>`;

  const auc = p.auction_readiness_score || 0, risk = p.risk_score || 0;
  const rClass = riskClassOf(p);
  const lastActive = p.last_active_year != null && p.last_active_year >= CURRENT_YEAR
    ? `${p.last_active_year} (hozirgacha)` : (p.last_active_year ?? "—");
  const tavsiya = (auc >= 60 && rClass !== "yuqori")
    ? "Lot auksionga chiqarishga yaqin. Kichik to'ldirishlar (kadastr/huquqiy hujjat) va dala tekshiruvidan so'ng e-auksionga qo'yish mumkin."
    : "Lot hozircha to'liq tayyor emas. Avval huquqiy/kadastr hujjatlari va infratuzilma ma'lumotlari to'ldirilib, dala tekshiruvi o'tkazilishi tavsiya etiladi.";

  const doc = `<!DOCTYPE html><html lang="uz"><head><meta charset="utf-8">
  <title>Pasport ${p.passport_id || pid}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #1a1a1a; font-size: 13.5px; line-height: 1.4; }
    h1 { font-size: 21px; margin: 0 0 3px; letter-spacing: 1px; }
    h2 { font-size: 15px; margin: 14px 0 6px; border-bottom: 2px solid #1565c0; padding-bottom: 3px; color: #0d3b66; }
    .sub { color: #555; font-size: 13px; margin-bottom: 10px; }
    .scores { display: flex; gap: 10px; margin: 12px 0; }
    .sc { flex: 1; border: 2px solid #ccc; border-radius: 8px; padding: 8px 6px; text-align: center; }
    .sc .v { font-size: 30px; font-weight: 800; line-height: 1; }
    .sc .l { font-size: 12px; color: #444; margin-top: 3px; }
    .sc .s { font-size: 11px; color: #777; margin-top: 1px; }
    img.map { width: 100%; display: block; border: 1px solid #bbb; border-radius: 6px; margin-bottom: 4px; }
    .imgcap { font-size: 10.5px; color: #888; text-align: center; margin-bottom: 6px; }
    table.t { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    table.t td { padding: 4px 8px; border-bottom: 1px solid #eee; font-size: 13px; }
    table.t td:first-child { color: #555; width: 50%; }
    table.t td:last-child { font-weight: 600; text-align: right; }
    .cols { display: flex; gap: 22px; }
    .cols > div { flex: 1; }
    .note { background: #eef4ff; border-radius: 6px; padding: 9px 12px; font-size: 12.5px; margin: 6px 0; }
    .rec { background: #fff6e6; border-left: 4px solid #f5a623; padding: 11px; font-size: 13px; margin-top: 10px; }
    .badge { display: inline-block; padding: 2px 12px; border-radius: 5px; color: #fff; font-weight: 700; }
    .disc { margin-top: 12px; padding-top: 8px; border-top: 1px solid #ddd; color: #888; font-size: 10.5px; font-style: italic; }
    .foot { margin-top: 6px; color: #aaa; font-size: 10px; text-align: center; }
    .page-break { page-break-before: always; }
  </style></head><body>
    <h1>E-AUKSION / INVESTITSION PASPORT</h1>
    <div class="sub">Lot: <b>${p.passport_id || pid}</b> · Hovuz ID: ${pid} ·
      ${p.viloyat || ""}, ${p.tuman || "tuman —"} · ${num(p.area_ha, 2)} ga ·
      <span class="badge" style="background:${STATUS_COLORS[status] || "#888"}">${status}</span></div>

    ${imgData ? `<img class="map" src="${imgData}" alt="satellite">
      <div class="imgcap">Sun'iy yo'ldosh tasviri — tanlangan lot chegarasi ajratilgan (Esri World Imagery)</div>` : ""}

    <div class="scores">
      <div class="sc" style="border-color:${auctionColor(auc)}">
        <div class="v" style="color:${auctionColor(auc)}">${Math.round(auc)}</div>
        <div class="l">Auction Readiness</div><div class="s">${auctionStatus(auc)}</div></div>
      <div class="sc" style="border-color:${invColor}">
        <div class="v" style="color:${invColor}">${Math.round(p.investment_score || 0)}</div>
        <div class="l">Investment</div><div class="s">Class ${inv}</div></div>
      <div class="sc" style="border-color:${riskClassColor(rClass)}">
        <div class="v" style="color:${riskClassColor(rClass)}">${Math.round(risk)}</div>
        <div class="l">Risk</div><div class="s">${rClass}</div></div>
    </div>

    <div class="cols">
      <div><h2>Lot pasporti</h2>${tbl([
        ["Maydon", num(p.area_ha, 2) + " ga"], ["Perimetr", num(p.perimeter_m, 0) + " m"],
        ["Koordinata", num(p.centroid_y, 4) + ", " + num(p.centroid_x, 4)],
        ["Chegara sifati", p.boundary_quality || "—"],
        ["Oxirgi rasm", p.satellite_image_date || "—"],
        ["Pasport holati", passportStatusText(p)]])}</div>
      <div><h2>Faollik tarixi (2016–2026)</h2>${tbl([
        ["Birinchi faol yil", p.first_active_year ?? "—"], ["Oxirgi faol yil", lastActive],
        ["Faol yillar", p.active_years_count ?? "—"], ["Nofaol yillar", p.inactive_years_count ?? "—"],
        ["O'rt. Util Score", num(p.avg_util_score_all_years, 1)],
        ["Tarix klassi", p.activity_history_class || "—"]])}</div>
    </div>

    <div class="page-break"></div>
    <div class="cols">
      <div><h2>Produktivlik va hosildorlik</h2>${tbl([
        ["Productivity", num(p.productivity_score, 1) + " (" + (p.productivity_class || "") + ")"],
        ["Growth Potential", num(p.growth_potential, 1)],
        ["Hosildorlik", num(p.adjusted_yield_t_ha, 2) + " t/ga"],
        ["Yil oxiri hosil", num((p.adjusted_harvest_kg || 0) / 1000, 2) + " t"],
        ["Joriy biomassa", num((p.adjusted_biomass_kg || 0) / 1000, 2) + " t"],
        ["Ishonch", p.biomass_confidence || "—"]])}</div>
      <div><h2>Suv sifati</h2>${tbl([
        ["Water Quality Score", num(p.water_quality_score, 0) + " / 100"],
        ["TSI", num(p.tsi, 1) + " (" + (p.trophic_class || "") + ")"],
        ["Chl-a", num(p.chla_mean, 1) + " mg/m³"], ["Secchi", num(p.secchi_mean, 2) + " m"],
        ["Alga riski", p.algae_risk || "—"], ["Loyqalik riski", p.turbidity_risk || "—"]])}</div>
    </div>

    <h2>Suv xarajati va balans</h2>
    <div class="note">💦 Mavsumda ushlab turish uchun taxminiy qo'shimcha suv ehtiyoji:
      <b>${p.net_water_need_m3 != null ? Math.round(p.net_water_need_m3).toLocaleString("uz-UZ") : "—"} m³</b>
      &nbsp;(Bug'lanish ${num(p.evap_total_mm, 0)} mm · Yog'in ${num(p.rain_total_mm, 0)} mm ·
      Suv xarajati riski: ${p.water_cost_risk || "—"})</div>

    <div class="cols">
      <div><h2>Joylashuv / infratuzilma</h2>${tbl([
        ["Relyef (slope)", p.slope_class || "—"],
        ["Kanal / yo'l / kollektor", "Ma'lumot qo'shilmagan"]])}</div>
      <div><h2>Huquqiy risk</h2>${tbl([
        ["Chegara riski", p.boundary_risk || "—"], ["Yer o'zgarishi", p.land_transform_risk || "—"],
        ["Kadastr mosligi", p.lease_boundary_match || "—"],
        ["Auksion huquqiy", p.auction_legal_status || "—"]])}</div>
    </div>

    <div class="rec"><b>Tavsiya:</b> ${tavsiya}</div>
    <div class="disc">Mazkur pasport masofadan zondlash va mavjud atribut ma'lumotlari asosida tayyorlangan.</div>
    <div class="foot">AQUACULTURE — Aqua Auction Passport · yaratildi ${new Date().toLocaleDateString("uz-UZ")}</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},500);};<\/script>
  </body></html>`;

  w.document.open();
  w.document.write(doc);
  w.document.close();
}

// [sana, qiymat] juftliklari (X o'qi = vaqt/yillar)
function ts(data, key) {
  return data.map(d => [`${d.t}-01`, d[key]]);
}
function tsAxis(big) {
  return {type: "time", axisLabel: {color: "#9aa4b0", fontSize: big ? 12 : 9},
    axisLine: {lineStyle: {color: "#333"}}};
}
function tsLegend(big) {
  return {top: 0, textStyle: {color: "#9aa4b0", fontSize: big ? 13 : 10},
    itemWidth: big ? 18 : 12, itemHeight: big ? 10 : 8};
}
// kattalashtirilgan ko'rinishda vaqt bo'yicha zumlash
function tsZoom(big) {
  return big ? [{type: "inside"}, {type: "slider", bottom: 8, height: 18,
    textStyle: {color: "#9aa4b0"}}] : undefined;
}

/* Suv sifati indekslari: NDWI, NDCI, NDTI — bitta Y o'qi */
function drawIndexChart(chart, pid, big = false) {
  const d = monthly[pid] || [];
  const fs = big ? 12 : 9, lw = big ? 2.2 : 1.4;
  chart.setOption({
    grid: {left: 8, right: 12, top: big ? 40 : 26, bottom: big ? 48 : 18, containLabel: true},
    legend: tsLegend(big),
    tooltip: {trigger: "axis"},
    dataZoom: tsZoom(big),
    xAxis: tsAxis(big),
    yAxis: {type: "value", axisLabel: {color: "#9aa4b0", fontSize: fs},
      splitLine: {lineStyle: {color: "#20262e"}}},
    series: [
      {name: "NDWI", type: "line", data: ts(d, "ndwi"), showSymbol: false, smooth: true,
        connectNulls: true, lineStyle: {width: lw}, itemStyle: {color: "#00b0ff"}},
      {name: "NDCI", type: "line", data: ts(d, "ndci"), showSymbol: false, smooth: true,
        connectNulls: true, lineStyle: {width: lw}, itemStyle: {color: "#2ecc71"}},
      {name: "NDTI", type: "line", data: ts(d, "ndti"), showSymbol: false, smooth: true,
        connectNulls: true, lineStyle: {width: lw * 0.85, type: "dashed"}, itemStyle: {color: "#c58b4b"}},
    ],
  });
}

/* Parametrlar: Chl-a (mg/m³) & LST (°C) chap, Secchi (m) o'ng o'qda */
function drawParamChart(chart, pid, big = false) {
  const d = monthly[pid] || [];
  const fs = big ? 12 : 9, lw = big ? 2.2 : 1.4;
  chart.setOption({
    grid: {left: 8, right: 12, top: big ? 40 : 26, bottom: big ? 48 : 18, containLabel: true},
    legend: tsLegend(big),
    tooltip: {trigger: "axis"},
    dataZoom: tsZoom(big),
    xAxis: tsAxis(big),
    yAxis: [
      {type: "value", name: big ? "Chl-a / LST" : "", nameTextStyle: {color: "#9aa4b0", fontSize: fs},
        axisLabel: {color: "#9aa4b0", fontSize: fs}, splitLine: {lineStyle: {color: "#20262e"}}},
      {type: "value", name: big ? "Secchi (m)" : "", nameTextStyle: {color: "#9aa4b0", fontSize: fs},
        axisLabel: {color: "#9aa4b0", fontSize: fs}, splitLine: {show: false}},
    ],
    series: [
      {name: "Chl-a (mg/m³)", type: "line", data: ts(d, "chla"), showSymbol: false, smooth: true,
        connectNulls: true, lineStyle: {width: lw}, itemStyle: {color: "#2ecc71"}},
      {name: "LST (°C)", type: "line", data: ts(d, "lst"), showSymbol: false, smooth: true,
        connectNulls: true, lineStyle: {width: lw * 0.85}, itemStyle: {color: "#e74c3c"}},
      {name: "Secchi (m)", type: "line", yAxisIndex: 1, data: ts(d, "secchi"), showSymbol: false,
        smooth: true, connectNulls: true, lineStyle: {width: lw}, itemStyle: {color: "#6a5acd"}},
    ],
  });
}

/* ---------- Grafikni katta modal oynada ochish ---------- */
let modalChart = null;
function openChartModal(kind, pid) {
  const modal = document.getElementById("chartModal");
  const titleEl = document.getElementById("chartModalTitle");
  const bodyEl = document.getElementById("chartModalBody");
  titleEl.textContent = (kind === "index"
    ? "Suv sifati — indekslar (NDWI · NDCI · NDTI)"
    : "Parametrlar (Chl-a · LST · Secchi)") + ` — Hovuz ${pid}`;
  modal.hidden = false;
  if (modalChart) modalChart.dispose();
  modalChart = echarts.init(bodyEl);
  (kind === "index" ? drawIndexChart : drawParamChart)(modalChart, pid, true);
}
function closeChartModal() {
  const modal = document.getElementById("chartModal");
  modal.hidden = true;
  if (modalChart) { modalChart.dispose(); modalChart = null; }
}

/* =====================================================================
   ANALITIKA POP-UP (Aqua Analytics Explorer) — 6 tab
   ===================================================================== */
let axCharts = [];
const AX_TABS = ["🪪 Faollik", "📈 Indekslar", "🧪 Suv sifati",
                 "🌡️ Harorat/balans", "⚠️ Anomaliya", "🗂️ Xom atributlar"];
const AX_METRIC_CAT = {ndwi: "NDWI", ndci: "NDCI", ndti: "NDTI", ti: "TI",
                       chla: "Chl-a", secchi: "Secchi", lst: "LST", airtemp: "Airtemp"};
const AX_COLORS = {ndwi: "#00b0ff", ndci: "#2ecc71", ndti: "#c58b4b", ti: "#ab47bc",
                   chla: "#2ecc71", secchi: "#6a5acd", lst: "#e74c3c", airtemp: "#ff9800"};

function axDispose() { axCharts.forEach(c => { try { c.dispose(); } catch (_) {} }); axCharts = []; }
function axInit(root, sel) {
  const el = root.querySelector(sel);
  if (!el) return null;
  const c = echarts.init(el);
  axCharts.push(c);
  return c;
}
function axStat(arr) {
  const v = arr.map(a => a[1]).filter(x => x != null);
  if (!v.length) return {min: null, max: null, mean: null, n: 0};
  const s = v.reduce((a, b) => a + b, 0);
  return {min: Math.min(...v), max: Math.max(...v), mean: s / v.length, n: v.length};
}
function axNum(v, nd = 2) { return v == null || isNaN(v) ? "—" : (+v).toFixed(nd); }

const AX_BASE = {
  backgroundColor: "transparent",
  textStyle: {color: "#9aa4b0"},
  grid: {left: 6, right: 12, top: 30, bottom: 40, containLabel: true},
  legend: {top: 2, textStyle: {color: "#9aa4b0", fontSize: 11}, itemWidth: 14, itemHeight: 8},
  tooltip: {trigger: "axis"},
};
function axTimeX() {
  return {type: "time", axisLabel: {color: "#9aa4b0", fontSize: 10},
    axisLine: {lineStyle: {color: "#333"}}, splitLine: {show: false}};
}
function axValY(name) {
  return {type: "value", name: name || "", nameTextStyle: {color: "#9aa4b0", fontSize: 10},
    axisLabel: {color: "#9aa4b0", fontSize: 10}, splitLine: {lineStyle: {color: "#20262e"}}};
}
function axLineSeries(name, data, color, opts) {
  return Object.assign({name, type: "line", data, showSymbol: false, smooth: true,
    connectNulls: true, lineStyle: {width: 1.8, color}, itemStyle: {color}}, opts || {});
}

async function openAnalyticsPopup(props, lngLat) {
  const pid = String(props.pond_id);
  axDispose();
  const mw = Math.min(880, map.getContainer().clientWidth - 24);
  const popup = new maplibregl.Popup({maxWidth: mw + "px",
    className: "pond-popup analytics-popup", anchor: "left", offset: 14})
    .setLngLat(lngLat)
    .setHTML(`<div class="pp-head" style="background:#0e7490">
      <div class="pp-head-main"><div class="pp-head-title">Hovuz ${pid}</div>
      <div class="pp-head-line">Qo'shimcha analitikalar</div></div></div>
      <div class="pp-body"><div style="padding:34px;text-align:center;color:#9aa4b0;">
      ⏳ Analitika yuklanmoqda…</div></div>`)
    .addTo(map);
  popup.getElement().querySelector(".maplibregl-popup-content").style.width = mw + "px";
  makeDraggable(popup);
  placePopupRight(popup, pid, lngLat);
  popup.on("close", axDispose);

  let data;
  try {
    data = await fetch(`data/analytics/${pid}.json`).then(r => r.json());
  } catch (e) {
    popup.setHTML(`<div class="pp-head" style="background:#7f1d1d"><div class="pp-head-main">
      <div class="pp-head-title">Hovuz ${pid}</div></div></div>
      <div class="pp-body"><div style="padding:24px;color:#f88;">Analitika topilmadi (${pid}.json).</div></div>`);
    return;
  }
  renderAnalytics(popup, pid, data, mw);
}

function renderAnalytics(popup, pid, data, mw) {
  const s = data.static || {}, u = data.util || {};
  const status = u.foydalanilgan || "—";
  const stColor = STATUS_COLORS[status] || "#8a939e";
  const tabsHTML = AX_TABS.map((t, i) =>
    `<button class="ax-tab${i === 0 ? " active" : ""}" data-t="${i}">${t}</button>`).join("");

  popup.setHTML(`
    <div class="pp-head" style="background:${stColor}">
      <div class="pp-head-main">
        <div class="pp-head-title">Hovuz ${pid} — Qo'shimcha analitikalar</div>
        <div class="pp-head-line">${s.viloyat || ""} · ${s.tuman || "—"} ·
          ${axNum(s.area_ha, 2)} ga · Slope ${axNum(s.slope, 2)} · Status: <b>${status}</b></div>
        <div class="pp-head-line">Davr: ${u.analysis_start || "—"} → ${u.analysis_end || "—"} ·
          Util Score: <b>${axNum(u.util_score, 1)}</b></div>
      </div>
    </div>
    <div class="pp-body">
      <div class="ax-tabs">${tabsHTML}</div>
      <div class="ax-panel" id="axPanel"></div>
      <div class="ax-summary" id="axSummary"></div>
    </div>`);

  const el = popup.getElement();
  const contentEl = el.querySelector(".maplibregl-popup-content");
  contentEl.style.width = mw + "px";
  const bodyEl = el.querySelector(".pp-body");
  bodyEl.style.maxHeight = (map.getContainer().clientHeight - el.querySelector(".pp-head").offsetHeight - 40) + "px";
  bodyEl.style.overflowY = "auto";
  bodyEl.style.overflowX = "hidden";
  makeDraggable(popup);
  clampPopup(popup);

  el.querySelector("#axSummary").innerHTML = axSummary(pid, data);
  el.querySelectorAll(".ax-tab").forEach(btn => {
    btn.onclick = () => {
      el.querySelectorAll(".ax-tab").forEach(b => b.classList.toggle("active", b === btn));
      axRenderTab(+btn.dataset.t, data, el.querySelector("#axPanel"));
    };
  });
  axRenderTab(0, data, el.querySelector("#axPanel"));
}

function axRenderTab(i, data, panel) {
  axDispose();
  if (i === 0) axTabFaollik(data, panel);
  else if (i === 1) axTabIndeks(data, panel);
  else if (i === 2) axTabSifat(data, panel);
  else if (i === 3) axTabHarorat(data, panel);
  else if (i === 4) axTabAnomaliya(data, panel);
  else axTabXom(data, panel);
}

/* ---- Tab 0: Faollik signallari ---- */
function axTabFaollik(data, panel) {
  const u = data.util || {};
  const pct = v => v == null ? 0 : v * 100;
  panel.innerHTML = `
    <div class="ax-gauges">
      <div><div id="axgW" class="gauge"></div><div class="gauge-cap">WPS</div></div>
      <div><div id="axgA" class="gauge"></div><div class="gauge-cap">AAS</div></div>
      <div><div id="axgU" class="gauge"></div><div class="gauge-cap">Util Score</div></div>
    </div>
    <div class="pp-grid ax-grid">
      ${axCell("SAR water persistence", axNum(u.sar_water_persistence, 2))}
      ${axCell("SAR water cover", axNum(u.sar_water_cover_mean, 2))}
      ${axCell("SAR std", axNum(u.sar_std, 2))}
      ${axCell("Valid S1 (radar)", u.valid_s1_count ?? "—")}
      ${axCell("Valid HLS (optik)", u.valid_hls_count ?? "—")}
      ${axCell("Growth Potential", axNum(u.growth_potential, 1))}
      ${axCell("Thermal Score", axNum(u.thermal_score, 1))}
      ${axCell("Optimal kunlar", u.optimal_days ?? "—")}
      ${axCell("Issiqlik stress", (u.heat_stress_days ?? "—") + " kun")}
      ${axCell("GDD", axNum(u.gdd, 0))}
      ${axCell("Food Score", axNum(u.food_score, 1))}
      ${axCell("Foydalanilgan", u.foydalanilgan || "—")}
    </div>`;
  gauge(axInit(panel, "#axgW"), pct(u.wps), "#00b0ff");
  gauge(axInit(panel, "#axgA"), pct(u.aas), "#8ac926");
  gauge(axInit(panel, "#axgU"), u.util_score, "#ff9800");
}
function axCell(k, v) { return `<div class="pp-cell"><div class="k">${k}</div><div class="v">${v}</div></div>`; }

/* ---- Tab 1: Indekslar dinamikasi ---- */
function axTabIndeks(data, panel) {
  const sc = data.scenes || {};
  const metrics = ["ndwi", "ndci", "ndti", "ti"];
  panel.innerHTML = `
    <div class="ax-sec">Indekslar — vaqt bo'yicha (per-scene)</div>
    <div id="axIdxLine" class="ax-chart"></div>
    <div class="ax-statcards" id="axIdxStats"></div>
    <div class="ax-sec">Oylik o'rtacha — issiqlik xaritasi (heatmap)</div>
    <div id="axIdxHeat" class="ax-chart"></div>`;
  const line = axInit(panel, "#axIdxLine");
  line.setOption(Object.assign({}, AX_BASE, {
    xAxis: axTimeX(), yAxis: axValY(),
    series: metrics.map(m => axLineSeries(m.toUpperCase(), sc[m] || [], AX_COLORS[m])),
  }));
  panel.querySelector("#axIdxStats").innerHTML = metrics.map(m => {
    const st = axStat(sc[m] || []);
    return `<div class="ax-statcard" style="border-color:${AX_COLORS[m]}">
      <div class="t" style="color:${AX_COLORS[m]}">${m.toUpperCase()}</div>
      <div class="r">min ${axNum(st.min, 2)} · o'rt ${axNum(st.mean, 2)} · max ${axNum(st.max, 2)}</div>
      <div class="n">${st.n} sana</div></div>`;
  }).join("");
  // heatmap: oylik o'rtacha (mean) qatorlar × oy ustunlar
  const mm = data.monthly || {};
  const rows = [["ndwi", "ndwi_mean"], ["ndci", "ndci_mean"], ["ndti", "ndti_mean"], ["ti", "ti_mean"]];
  const months = [...new Set(rows.flatMap(([, mk]) => (mm[mk] || []).map(a => a[0])))].sort();
  const cells = [], vals = [];
  rows.forEach(([lbl, mk], yi) => (mm[mk] || []).forEach(([ym, v]) => {
    const xi = months.indexOf(ym); if (xi >= 0 && v != null) { cells.push([xi, yi, v]); vals.push(v); }
  }));
  const heat = axInit(panel, "#axIdxHeat");
  heat.setOption({
    backgroundColor: "transparent", tooltip: {position: "top"},
    grid: {left: 6, right: 12, top: 10, bottom: 60, containLabel: true},
    xAxis: {type: "category", data: months, axisLabel: {color: "#9aa4b0", fontSize: 9, rotate: 60}},
    yAxis: {type: "category", data: rows.map(r => r[0].toUpperCase()), axisLabel: {color: "#9aa4b0", fontSize: 10}},
    visualMap: {min: vals.length ? Math.min(...vals) : 0, max: vals.length ? Math.max(...vals) : 1,
      calculable: true, orient: "horizontal", left: "center", bottom: 0,
      inRange: {color: ["#0d3b66", "#3a86ff", "#8ac926", "#f5b301", "#e74c3c"]},
      textStyle: {color: "#9aa4b0"}},
    series: [{type: "heatmap", data: cells, emphasis: {itemStyle: {borderColor: "#fff", borderWidth: 1}}}],
  });
}

/* ---- Tab 2: Suv sifati ---- */
function axTabSifat(data, panel) {
  const sc = data.scenes || {};
  const pp = (typeof passport !== "undefined" && passport[data.static.id]) || {};
  panel.innerHTML = `
    <div class="pp-grid ax-grid">
      ${axCell("Water Quality", (pp.water_quality_score != null ? Math.round(pp.water_quality_score) + " / 100" : "—"))}
      ${axRiskCell("Alga riski", pp.algae_risk)}
      ${axRiskCell("Loyqalik riski", pp.turbidity_risk)}
      ${axCell("Trofik holat", pp.trophic_class || "—")}
    </div>
    <div class="ax-sec">Chl-a (mg/m³) va Secchi (m)</div>
    <div id="axQ1" class="ax-chart"></div>
    <div class="ax-sec">NDCI (alga) va NDTI (loyqalik)</div>
    <div id="axQ2" class="ax-chart"></div>
    <div class="ax-sec">Chl-a ↔ Secchi bog'liqligi</div>
    <div id="axScatter" class="ax-chart"></div>`;
  const c1 = axInit(panel, "#axQ1");
  c1.setOption(Object.assign({}, AX_BASE, {
    xAxis: axTimeX(), yAxis: [axValY("Chl-a"), Object.assign(axValY("Secchi"), {splitLine: {show: false}})],
    series: [axLineSeries("Chl-a", sc.chla || [], "#2ecc71"),
      axLineSeries("Secchi", sc.secchi || [], "#6a5acd", {yAxisIndex: 1})],
  }));
  const c2 = axInit(panel, "#axQ2");
  c2.setOption(Object.assign({}, AX_BASE, {
    xAxis: axTimeX(), yAxis: axValY(),
    series: [axLineSeries("NDCI", sc.ndci || [], "#2ecc71"),
      axLineSeries("NDTI", sc.ndti || [], "#c58b4b")],
  }));
  // scatter: sana bo'yicha chla↔secchi juftlash
  const smap = new Map((sc.secchi || []).map(a => [a[0], a[1]]));
  const pts = (sc.chla || []).filter(a => smap.has(a[0])).map(a => [a[1], smap.get(a[0])]);
  const sca = axInit(panel, "#axScatter");
  sca.setOption({
    backgroundColor: "transparent", grid: {left: 6, right: 12, top: 12, bottom: 34, containLabel: true},
    tooltip: {trigger: "item", formatter: p => `Chl-a ${p.value[0]} · Secchi ${p.value[1]}`},
    xAxis: Object.assign(axValY("Chl-a (mg/m³)"), {scale: true}),
    yAxis: Object.assign(axValY("Secchi (m)"), {scale: true}),
    series: [{type: "scatter", symbolSize: 8, data: pts, itemStyle: {color: "#00b0ff", opacity: 0.75}}],
  });
}
function axRiskCell(k, v) {
  return `<div class="pp-cell"><div class="k">${k}</div><div class="v ${RISK_CLASS[v] || ""}">${v || "—"}</div></div>`;
}

/* ---- Tab 3: Harorat va suv balansi ---- */
function axTabHarorat(data, panel) {
  const sc = data.scenes || {}, mm = data.monthly || {}, area = data.static.area_ha || 0;
  panel.innerHTML = `
    <div class="ax-sec">Havo harorati (oylik) va suv yuzasi harorati LST (per-scene)</div>
    <div id="axT1" class="ax-chart"></div>
    <div class="ax-sec">Suv balansi — bug'lanish (E) va yog'in (oylik, mm)</div>
    <div id="axT2" class="ax-chart"></div>
    <div class="ax-note">💧 m³ = mm × area_ha × 10 &nbsp;·&nbsp; maydon = ${axNum(area, 2)} ga</div>
    <div class="ax-statcards" id="axBalCards"></div>`;
  const t1 = axInit(panel, "#axT1");
  t1.setOption(Object.assign({}, AX_BASE, {
    xAxis: axTimeX(), yAxis: axValY("°C"),
    series: [
      Object.assign(axLineSeries("Havo (oylik)", (mm.airtemp_mean || []).map(a => [a[0] + "-15", a[1]]), "#ff9800"), {}),
      axLineSeries("LST (scene)", sc.lst || [], "#e74c3c", {showSymbol: true, symbolSize: 4, smooth: false, lineStyle: {width: 1, type: "dashed", color: "#e74c3c"}}),
    ],
  }));
  const months = [...new Set([...(mm.E || []), ...(mm.rain || [])].map(a => a[0]))].sort();
  const emap = new Map((mm.E || []).map(a => a)), rmap = new Map((mm.rain || []).map(a => a));
  const t2 = axInit(panel, "#axT2");
  t2.setOption({
    backgroundColor: "transparent", legend: {top: 2, textStyle: {color: "#9aa4b0", fontSize: 11}},
    grid: {left: 6, right: 12, top: 30, bottom: 50, containLabel: true},
    tooltip: {trigger: "axis"},
    xAxis: {type: "category", data: months, axisLabel: {color: "#9aa4b0", fontSize: 9, rotate: 55}},
    yAxis: axValY("mm"),
    series: [
      {name: "Bug'lanish (E)", type: "bar", data: months.map(m => emap.get(m) ?? null), itemStyle: {color: "#ef6c00"}},
      {name: "Yog'in", type: "bar", data: months.map(m => rmap.get(m) ?? null), itemStyle: {color: "#1565c0"}},
    ],
  });
  // net need kartalari (oxirgi mavjud oy)
  const cards = months.slice(-4).map(m => {
    const e = emap.get(m), r = rmap.get(m);
    const net = (e != null && r != null) ? Math.max(e - r, 0) : null;
    const m3 = net != null ? Math.round(net * area * 10) : null;
    return `<div class="ax-statcard"><div class="t">${m}</div>
      <div class="r">E ${axNum(e, 0)} · rain ${axNum(r, 0)} mm</div>
      <div class="n">Net: ${net != null ? Math.round(net) + " mm ≈ " + m3.toLocaleString("uz-UZ") + " m³" : "—"}</div></div>`;
  }).join("");
  panel.querySelector("#axBalCards").innerHTML = cards;
}

/* ---- Tab 4: Anomaliya ---- */
function axTabAnomaliya(data, panel) {
  const sc = data.scenes || {}, anom = data.anom || {any: 0, dates: []};
  const badge = anom.any ? `<span class="ax-alert on">⚠️ NDCI anomaliya: BOR</span>`
    : `<span class="ax-alert">✓ Anomaliya qayd etilmagan</span>`;
  panel.innerHTML = `
    <div class="ax-alertbar">${badge}
      <span class="ax-alertn">${anom.dates.length} ta sana</span></div>
    <div class="ax-sec">NDCI signali va anomaliya nuqtalari (qizil)</div>
    <div id="axAnom" class="ax-chart"></div>
    <div class="ax-sec">Anomaliya sanalari</div>
    <div class="ax-datelist">${anom.dates.length
      ? anom.dates.map(d => `<span class="ax-datechip">${d}</span>`).join("")
      : "<span style='color:#9aa4b0'>—</span>"}</div>
    <div class="ax-note">Izoh: bu sanalarda alga/phytoplankton (NDCI) signali odatdagidan farq qilgan — kuzatuv tavsiya etiladi.</div>`;
  const anomSet = new Set(anom.dates);
  const markPts = (sc.ndci || []).filter(a => anomSet.has(a[0]));
  const c = axInit(panel, "#axAnom");
  c.setOption(Object.assign({}, AX_BASE, {
    xAxis: axTimeX(), yAxis: axValY("NDCI"),
    series: [
      axLineSeries("NDCI", sc.ndci || [], "#2ecc71"),
      {name: "Anomaliya", type: "scatter", data: markPts, symbolSize: 11,
        itemStyle: {color: "#e74c3c", borderColor: "#fff", borderWidth: 1}},
    ],
  }));
}

/* ---- Tab 5: Xom atributlar jadvali ---- */
function axBuildRows(data) {
  const rows = [];
  const s = data.static || {}, u = data.util || {};
  Object.entries(s).forEach(([k, v]) => rows.push(["Geometriya", k, v]));
  Object.entries(u).forEach(([k, v]) => rows.push(["Util inputs", k, v]));
  Object.entries(data.scenes || {}).forEach(([m, arr]) =>
    arr.forEach(([d, v]) => rows.push([AX_METRIC_CAT[m] || m, `${m}_${d}`, v])));
  Object.entries(data.monthly || {}).forEach(([m, arr]) => {
    const cat = m === "E" ? "Evaporation" : m === "rain" ? "Rain"
      : (AX_METRIC_CAT[m.replace("_mean", "")] || m);
    arr.forEach(([d, v]) => rows.push([cat, `${m}_${d}`, v]));
  });
  (data.anom?.dates || []).forEach(d => rows.push(["Anomaly", `ndci_anom_${d}`, 1]));
  return rows;
}
function axTabXom(data, panel) {
  const rows = axBuildRows(data);
  const cats = ["Barchasi", ...[...new Set(rows.map(r => r[0]))]];
  panel.innerHTML = `
    <div class="ax-tools">
      <input id="axSearch" class="ax-search" placeholder="🔍 atribut nomi bo'yicha qidirish...">
      <select id="axCat" class="ax-catsel">${cats.map(c => `<option>${c}</option>`).join("")}</select>
      <button id="axCsv" class="ax-csv">⬇ CSV</button>
    </div>
    <div class="ax-rawcount" id="axCount"></div>
    <div class="ax-tablewrap"><table class="ax-table"><thead>
      <tr><th>Kategoriya</th><th>Atribut</th><th>Qiymat</th></tr></thead>
      <tbody id="axTbody"></tbody></table></div>`;
  const search = panel.querySelector("#axSearch"), catSel = panel.querySelector("#axCat");
  const tbody = panel.querySelector("#axTbody"), count = panel.querySelector("#axCount");
  function draw() {
    const q = search.value.trim().toLowerCase(), cat = catSel.value;
    const flt = rows.filter(r => (cat === "Barchasi" || r[0] === cat)
      && (!q || r[1].toLowerCase().includes(q)));
    tbody.innerHTML = flt.slice(0, 1200).map(r =>
      `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("");
    count.textContent = `${flt.length} ta atribut${flt.length > 1200 ? " (1200 tasi ko'rsatildi)" : ""}`;
  }
  search.oninput = draw; catSel.onchange = draw;
  panel.querySelector("#axCsv").onclick = () => axExportCSV(data.static.id, rows);
  draw();
}
function axExportCSV(pid, rows) {
  const csv = "kategoriya,atribut,qiymat\n" + rows.map(r =>
    `${r[0]},${r[1]},${r[2] == null ? "" : String(r[2]).replace(/,/g, ";")}`).join("\n");
  const blob = new Blob(["﻿" + csv], {type: "text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `hovuz_${pid}_atributlar.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

/* ---- Avtomatik xulosa ---- */
function axSummary(pid, data) {
  const u = data.util || {}, sc = data.scenes || {}, mm = data.monthly || {}, anom = data.anom || {};
  const chla = axStat(sc.chla || []), secchi = axStat(sc.secchi || []);
  const eArr = (mm.E || []).map(a => a[1]).filter(x => x != null);
  const eMax = eArr.length ? Math.max(...eArr) : null;
  const parts = [];
  parts.push(`Hovuz ${pid} bo'yicha ${u.analysis_start || "?"} – ${u.analysis_end || "?"} davrida `
    + `<b>${u.foydalanilgan || "—"}</b> holat kuzatilgan.`);
  if (u.sar_water_persistence != null)
    parts.push(`SAR signallari suv mavjudligini ko'rsatadi: persistence ${axNum(u.sar_water_persistence, 2)}, `
      + `cover ${axNum(u.sar_water_cover_mean, 2)}.`);
  if (chla.n) parts.push(`Chl-a asosan ${axNum(chla.min, 0)}–${axNum(chla.max, 0)} mg/m³ oralig'ida `
    + `(phytoplankton bazasi mavjud).`);
  if (secchi.n) parts.push(`Secchi ${axNum(secchi.min, 2)}–${axNum(secchi.max, 2)} m — `
    + `${secchi.mean < 0.3 ? "suv tiniqligi past" : "tiniqlik o'rtacha"}.`);
  if (eMax != null) parts.push(`Bug'lanish eng yuqori ${axNum(eMax, 0)} mm gacha — suv balansi kuzatuv talab qiladi.`);
  parts.push(anom.any
    ? `NDCI anomaliya mavjud (${(anom.dates || []).join(", ")}) — alga signalini nazorat qilish tavsiya etiladi.`
    : `NDCI anomaliya qayd etilmagan.`);
  return `<div class="ax-summary-h">🧠 Avtomatik xulosa</div><div>${parts.join(" ")}</div>`;
}

/* =====================================================================
   Pop-up: joylashtirish (o'ngda) + bog'lovchi chiziq + chegaralash + sudrash
   ===================================================================== */

/* Poligon ↔ popup bog'lovchi chiziq (leader line) */
let leaderState = null;
function ensureLeaderSvg() {
  let svg = document.getElementById("leaderSvg");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "leaderSvg";
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;";
    svg.innerHTML =
      `<line stroke="#00e0ff" stroke-width="2" stroke-dasharray="6 4"/>
       <circle r="7" fill="rgba(0,224,255,.2)" stroke="#00e0ff" stroke-width="2"/>`;
    map.getContainer().appendChild(svg);
  }
  return svg;
}
function attachLeader(popup, lngLat) {
  const svg = ensureLeaderSvg();
  const line = svg.querySelector("line");
  const dot = svg.querySelector("circle");
  if (leaderState) map.off("render", leaderState.update);
  const update = () => {
    const el = popup.getElement();
    if (!el || !el.isConnected) { svg.style.display = "none"; return; }
    const pt = map.project(lngLat);
    const mr = map.getContainer().getBoundingClientRect();
    const r = el.querySelector(".maplibregl-popup-content").getBoundingClientRect();
    // popupning eng yaqin yuqori burchagi
    const cornerX = (r.left - mr.left) > pt.x ? (r.left - mr.left) : (r.right - mr.left);
    const cornerY = r.top - mr.top;
    line.setAttribute("x1", pt.x); line.setAttribute("y1", pt.y);
    line.setAttribute("x2", cornerX); line.setAttribute("y2", cornerY);
    dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y);
    svg.style.display = "block";
  };
  update();
  map.on("render", update);
  leaderState = {update, svg};
  popup.on("close", () => {
    map.off("render", update);
    svg.style.display = "none";
    if (leaderState && leaderState.update === update) leaderState = null;
  });
}

/* Poligonni chapga suradi (o'ngda popupga joy qoladi) + chiziqni ulaydi.
   Ekran chekkasidagi poligon ham doim ko'rinadi. */
function placePopupRight(popup, pid, fallbackLngLat) {
  const b = pondBBox(pid);
  const c = b ? b.getCenter() : fallbackLngLat;
  popup.setLngLat(c);
  const w = map.getContainer().clientWidth;
  map.easeTo({center: c, offset: [-Math.round(w * 0.26), 0], duration: 400});
  attachLeader(popup, c);
  map.once("moveend", () => clampPopup(popup));
}

function clampPopup(popup) {
  const content = popup.getElement().querySelector(".maplibregl-popup-content");
  if (!content) return;
  const c = content.getBoundingClientRect();
  const m = map.getContainer().getBoundingClientRect();
  const pad = 8;
  let dx = 0, dy = 0;
  if (c.right > m.right - pad) dx = (m.right - pad) - c.right;
  if (c.left + dx < m.left + pad) dx = (m.left + pad) - c.left;
  if (c.bottom > m.bottom - pad) dy = (m.bottom - pad) - c.bottom;
  if (c.top + dy < m.top + pad) dy = (m.top + pad) - c.top;
  if (dx || dy) {
    const p = map.project(popup.getLngLat());
    popup.setLngLat(map.unproject([p.x + dx, p.y + dy]));
    popup.getElement().classList.add("pinned");
  }
}

function makeDraggable(popup) {
  const el = popup.getElement();
  const head = el.querySelector(".pp-head");
  if (!head) return;
  head.title = "Sudrab ko'chirish mumkin";
  head.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation();
    try { head.setPointerCapture(e.pointerId); } catch (_) {}
    el.classList.add("dragging");
    const rect = map.getContainer().getBoundingClientRect();
    const start = map.project(popup.getLngLat());
    const dx = start.x - (e.clientX - rect.left);
    const dy = start.y - (e.clientY - rect.top);
    const onMove = ev => {
      popup.setLngLat(map.unproject([ev.clientX - rect.left + dx, ev.clientY - rect.top + dy]));
      clampPopup(popup);
      if (leaderState) leaderState.update();
    };
    const onUp = ev => {
      try { head.releasePointerCapture(ev.pointerId); } catch (_) {}
      el.classList.remove("dragging");
      head.removeEventListener("pointermove", onMove);
      head.removeEventListener("pointerup", onUp);
    };
    head.addEventListener("pointermove", onMove);
    head.addEventListener("pointerup", onUp);
  });
}
