/* ========= 1) Leaflet Harita ========= */
const map = L.map("map").setView([20, 0], 2);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 7, attribution: "&copy; OpenStreetMap Katkıda Bulunanlar"
}).addTo(map);

/* ========= 2) Yardımcılar ========= */
const el = (id) => document.getElementById(id);
const fmtNum = (n) => (typeof n === "number" ? n.toLocaleString("tr-TR") : "—");

/* Ülke kodu → bayrak (2 harf) */
function getISO2(props){
  // Çeşitli veri kaynaklarını dene
  const keys = ["ISO_A2","iso_a2","ISO2","ISO_2","WB_A2","ISO3166_1_Alpha_2","ISO3166-1-Alpha-2"];
  for(const k of keys){
    if(props && props[k] && props[k] !== "-99"){ return String(props[k]).toLowerCase(); }
  }
  // Bazı kaynaklarda sadece ISO_A3 olur; birkaç özel eşleme:
  const a3 = props?.ISO_A3 || props?.ADM0_A3 || props?.iso_a3;
  const mapA3 = { TUR:"tr", USA:"us", BRA:"br", CAN:"ca", EGY:"eg", SAU:"sa", RUS:"ru", CHN:"cn", IND:"in", DEU:"de", FRA:"fr", GBR:"gb" };
  if(a3 && mapA3[a3.toUpperCase()]) return mapA3[a3.toUpperCase()];
  return null;
}

/* Deterministik pseudo-random (ülke adına göre) */
function seededRng(seedStr){
  let h = 2166136261 >>> 0;
  for (let i=0;i<seedStr.length;i++){ h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>>7), 61 | t); return ((t ^ (t >>>14)) >>> 0) / 4294967296; };
}

/* Son 10 yıl verisi üretici (rezerv ve kullanım) */
function buildWaterSeries(countryName){
  const rand = seededRng(countryName);
  const yearNow = new Date().getFullYear();
  const years = Array.from({length:10}, (_,i)=> yearNow - 9 + i);

  // Rezerv (km³) – ülke puanına göre ölçeklenecek (sonra dışarıdan normalize edebiliriz)
  let base = 50 + Math.floor(rand()*400); // 50–450 arası başlangıç
  const reserve = years.map((y,i) => {
    const drift = (rand()-0.5) * 10; // küçük dalgalanma
    base = Math.max(10, base + drift);
    return Math.round(base);
  });

  // Kullanım yüzdeleri – toplam 100 olacak şekilde
  const agri = [], dom = [], ind = [];
  for(let i=0;i<10;i++){
    let a = 40 + Math.floor(rand()*40);   // 40–80
    let d = 10 + Math.floor(rand()*30);   // 10–40
    let s = Math.max(0, 100 - a - d);     // kalan
    // hafif rastgele düzeltme
    const adj = (rand()-0.5)*10;
    a = Math.min(90, Math.max(20, a + adj));
    d = Math.min(60, Math.max(5, d - adj/2));
    s = Math.max(0, 100 - Math.round(a) - Math.round(d));
    agri.push(Math.round(a)); dom.push(Math.round(d)); ind.push(Math.round(s));
  }

  return { years, reserve, usage: { agri, dom, ind } };
}

/* ========= 3) Chart.js Kurulumu ========= */
let reserveChart, usageChart;
function renderCharts(name, series){
  const { years, reserve, usage } = series;

  // varsa önceki grafikleri yok et
  if (reserveChart) { reserveChart.destroy(); }
  if (usageChart) { usageChart.destroy(); }

  const ctx1 = el("reserveChart").getContext("2d");
  reserveChart = new Chart(ctx1, {
    type: "line",
    data: {
      labels: years,
      datasets: [{
        label: "Rezerv (km³)",
        data: reserve,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
        tooltip: { mode: "index", intersect: false }
      },
      scales: {
        y: { title: { display: true, text: "km³" }, beginAtZero: true }
      }
    }
  });

  const ctx2 = el("usageChart").getContext("2d");
  usageChart = new Chart(ctx2, {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        { label: "Tarım", data: usage.agri, stack: "use" },
        { label: "Evsel", data: usage.dom,  stack: "use" },
        { label: "Sanayi",data: usage.ind,  stack: "use" }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "top" },
        tooltip: { mode: "index", intersect: false }
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks:{ callback: v => v + "%" }, beginAtZero: true, max: 100 }
      }
    }
  });
}

/* ========= 4) Bilgi Paneli ========= */
function showCountryInfo(p){
  // Başlık
  el("country-name").textContent = p.name || "Bilinmeyen Ülke";
  el("pop").textContent = fmtNum(p.population);
  el("gdp").textContent = p.gdp ? fmtNum(p.gdp) + " $" : "—";
  el("score").textContent = p.waterScore ?? "—";
  el("water-text").textContent = p.waterResources || "—";

  // Bayrak
  const iso2 = getISO2(p) || guessISO2FromName(p.name);
  const flagImg = el("flag");
  if(iso2){
    flagImg.src = `https://flagcdn.com/w40/${iso2}.png`;
    flagImg.style.display = "inline-block";
  } else {
    flagImg.style.display = "none";
  }

  // Su haritası görseli (genel)
  el("water-map").style.display = "block";

  // Grafikler – deterministik üret
  const series = buildWaterSeries(p.name || "");
  renderCharts(p.name, series);
}

function resetInfo(){
  el("country-name").textContent = "Dünya Su Kaynakları";
  el("pop").textContent = "—";
  el("gdp").textContent = "—";
  el("score").textContent = "—";
  el("water-text").textContent = "Bir ülkeye tıklayarak bilgi alın.";
  el("flag").style.display = "none";
  if (reserveChart) reserveChart.destroy();
  if (usageChart) usageChart.destroy();
}

/* Bazı temel ülkelere basit isim→ISO2 tahmini (flag için yedek) */
function guessISO2FromName(name=""){
  const t = name.toLowerCase();
  const map = {
    "turkey":"tr","türkiye":"tr","united states":"us","usa":"us","brazil":"br",
    "canada":"ca","egypt":"eg","saudi arabia":"sa","russia":"ru","china":"cn",
    "india":"in","germany":"de","france":"fr","united kingdom":"gb","spain":"es",
    "italy":"it","japan":"jp","south korea":"kr","mexico":"mx","australia":"au"
  };
  return map[t] || null;
}

/* ========= 5) GeoJSON Yükle ve Etkileşim ========= */
fetch("world.json")
  .then(r => r.json())
  .then(data => {
    const layer = L.geoJSON(data, {
      style: (f) => {
        const s = f.properties?.waterScore ?? 5;
        return {
          color: "#3d4a5a", weight: 1,
          fillOpacity: 0.7,
          fillColor: s >= 8 ? "#4CAF50" : s >= 5 ? "#F59E0B" : "#EF4444"
        };
      },
      onEachFeature: (feature, lyr) => {
        lyr.on("click", () => {
          showCountryInfo(feature.properties || {});
          try { map.fitBounds(lyr.getBounds(), { maxZoom: 5, padding:[10,10] }); } catch(e){}
        });
        lyr.bindTooltip(feature?.properties?.name || "", { sticky:true, opacity:0.9, direction:"center" });
      }
    }).addTo(map);
  })
  .catch(err => {
    console.error("world.json yüklenemedi:", err);
    el("water-text").textContent = "world.json bulunamadı. Önce üretmeniz gerekiyor.";
  });
function updateCountryMap(iso2) {
  const img = document.getElementById("country-watermap");
  if (!iso2) {
    img.src = "watermaps/default.jpg";
    return;
  }
  const test = new Image();
  test.onload = () => img.src = `watermaps/${iso2}.jpg`;
  test.onerror = () => img.src = "watermaps/default.jpg";
  test.src = `watermaps/${iso2}.jpg`;
}

function showCountryInfo(p) {
  document.getElementById("country-name").textContent = p.name || "Bilinmeyen Ülke";
  document.getElementById("pop").textContent = p.population?.toLocaleString("tr-TR") || "—";
  document.getElementById("gdp").textContent = p.gdp ? p.gdp.toLocaleString("tr-TR") + " $" : "—";
  document.getElementById("score").textContent = p.waterScore ?? "—";
  document.getElementById("water-text").textContent = p.waterResources || "—";

  const iso2 = getISO2(p) || guessISO2FromName(p.name);
  const flag = document.getElementById("flag");
  if (iso2) {
    flag.src = `https://flagcdn.com/w40/${iso2}.png`;
    flag.style.display = "inline-block";
  } else {
    flag.style.display = "none";
  }

  // 🌊 ülkeye özel su haritasını yükle
  updateCountryMap(iso2);

  // grafik üretimi (önceki fonksiyonlar aynı kalabilir)
  const series = buildWaterSeries(p.name);
  renderCharts(p.name, series);
}
let is3D = false;
let viewer = null;

function toggle3D() {
  const mapDiv = document.getElementById("map");
  const cesiumDiv = document.getElementById("cesiumContainer");
  if (!is3D) {
    mapDiv.style.display = "none";
    cesiumDiv.style.display = "block";
    initCesium();
  } else {
    cesiumDiv.style.display = "none";
    mapDiv.style.display = "block";
    if (viewer) viewer.destroy();
  }
  is3D = !is3D;
}

function initCesium() {
  if (typeof Cesium === "undefined") {
    alert("Cesium.js yüklenemedi.");
    return;
  }
  viewer = new Cesium.Viewer("cesiumContainer", {
    terrainProvider: Cesium.createWorldTerrain(),
    baseLayerPicker: false,
    geocoder: false,
    timeline: false,
    animation: false
  });

  // Dünya su katmanlarını mavi renk vurgusuyla çiz
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.showWaterEffect = true;
  viewer.scene.skyBox.show = false;
}
