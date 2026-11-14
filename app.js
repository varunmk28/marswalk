/* MarsWalk — EVA planner. All terrain maths run on the baked HiRISE DEM grid (data/dem.bin). */
(async function () {
const M = window.MISSION, D = M.dem, N = D.n, R_MARS = 3396190;
const $ = s => document.querySelector(s);
const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ/';
const MX = R_MARS * Math.PI / 180;                       // metres per degree latitude
const MXLON = MX * Math.cos((D.south + D.north) / 2 * Math.PI / 180);
const GCR_MSV_DAY = 0.67;                                // MSL RAD surface average (Hassler et al. 2014)
const MOB = { walk: { v: 0.8, ms: 20, back: 1500, name: 'On foot' }, rover: { v: 2.5, ms: 15, back: 4000, name: 'Rover' } };

/* ---------- terrain grid ---------- */
const raw = new Uint16Array(await (await fetch('data/dem.bin?v=2')).arrayBuffer());
const Z = new Float32Array(N * N); let zmin = 1e9, zmax = -1e9;
for (let i = 0; i < N * N; i++) { const z = D.base + raw[i] * D.scale; Z[i] = z; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
const S = new Float32Array(N * N), HS = new Float32Array(N * N);
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const i = r * N + c, c0 = Math.max(c - 1, 0), c1 = Math.min(c + 1, N - 1), r0 = Math.max(r - 1, 0), r1 = Math.min(r + 1, N - 1);
  const dx = (Z[r * N + c1] - Z[r * N + c0]) / ((c1 - c0) * D.cell), dy = (Z[r0 * N + c] - Z[r1 * N + c]) / ((r1 - r0) * D.cell);
  S[i] = Math.atan(Math.hypot(dx, dy)) * 180 / Math.PI;
  HS[i] = Math.max(0, Math.min(1, 0.55 + 0.9 * (-dx * 0.7 + dy * 0.7)));   // NW illumination
}
const ll2rc = (lat, lon) => [Math.min(N - 1, Math.max(0, Math.floor((D.north - lat) / (D.north - D.south) * N))), Math.min(N - 1, Math.max(0, Math.floor((lon - D.west) / (D.east - D.west) * N)))];
const rc2ll = (r, c) => [D.north - (r + .5) / N * (D.north - D.south), D.west + (c + .5) / N * (D.east - D.west)];
const inGrid = (lat, lon) => lat > D.south && lat < D.north && lon > D.west && lon < D.east;
const distM = (a, b) => Math.hypot((a[0] - b[0]) * MX, (a[1] - b[1]) * MXLON);
const SLOPE_CLS = [[5, '#3fbf6f'], [10, '#a8d65c'], [15, '#f2d14e'], [20, '#f29a3e'], [25, '#e8553d'], [91, '#9b1d5a']];
const slopeCol = s => SLOPE_CLS.find(k => s < k[0])[1];
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function raster(fn) {
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const cx = cv.getContext('2d'), im = cx.createImageData(N, N), d = im.data;
  for (let i = 0; i < N * N; i++) { const p = fn(i); d[i * 4] = p[0]; d[i * 4 + 1] = p[1]; d[i * 4 + 2] = p[2]; d[i * 4 + 3] = p[3]; }
  cx.putImageData(im, 0, 0); return cv.toDataURL();
}
const slopeRGB = SLOPE_CLS.map(k => hex(k[1]));
const slopeURL = raster(i => { const k = SLOPE_CLS.findIndex(q => S[i] < q[0]); return [...slopeRGB[k], k === 0 ? 70 : 215]; });
const ramp = [[38, 20, 60], [120, 50, 40], [196, 120, 60], [236, 200, 130], [255, 250, 235]];
const elevURL = raster(i => {
  const t = (Z[i] - zmin) / (zmax - zmin) * (ramp.length - 1), k = Math.max(0, Math.min(ramp.length - 2, Math.floor(t))), f = t - k, h = 0.45 + 0.75 * HS[i];
  let p = [0, 1, 2].map(j => (ramp[k][j] + (ramp[k + 1][j] - ramp[k][j]) * f) * h);
  const c = i % N, zr = c < N - 1 ? Z[i + 1] : Z[i], zd = i + N < N * N ? Z[i + N] : Z[i];
  const maj = Math.floor(Z[i] / 50) !== Math.floor(zr / 50) || Math.floor(Z[i] / 50) !== Math.floor(zd / 50);
  const min = Math.floor(Z[i] / 10) !== Math.floor(zr / 10) || Math.floor(Z[i] / 10) !== Math.floor(zd / 10);
  if (maj) p = [20, 12, 8]; else if (min) p = p.map(v => v * 0.6);
  return [...p, 255];
});

/* ---------- map ---------- */
const BB = [[D.south, D.west], [D.north, D.east]];
const map = L.map('map', { crs: L.CRS.EPSG4326, center: [-4.8155, 137.3852], zoom: 15, minZoom: 5, maxZoom: 19, zoomSnap: .5, attributionControl: false, maxBounds: [[-12, 130], [2, 145]] });
const tl = (id, ext, mz, b, o = {}) => L.tileLayer(`${TREK}${id}/1.0.0/default/default028mm/{z}/{y}/{x}.${ext}`, { maxNativeZoom: mz, maxZoom: 19, bounds: b, ...o });
L.tileLayer(`${TREK}Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`, { maxNativeZoom: 7, maxZoom: 19 }).addTo(map);
const bases = [
  { n: 'HiRISE mosaic', d: 'MRO HiRISE · 25 cm/px class', l: tl('curiosity_hirise_mosaic', 'png', 16, [[-4.9254, 137.1225], [-4.249, 137.7298]]) },
  { n: 'CTX mosaic', d: 'MRO CTX · ~6 m/px context', l: tl('curiosity_ctx_mosaic', 'png', 10, [[-7.2137, 136.2768], [-3.5805, 139.3864]]) },
  { n: 'Viking colour', d: 'Viking Orbiter · global 232 m/px', l: null }];
const overlays = [
  { n: 'Slope hazard', d: 'Topographic · HiRISE DEM derived', l: L.imageOverlay(slopeURL, BB), on: true, o: .4 },
  { n: 'Elevation + 10 m contours', d: 'Topographic · HiRISE 1 m DEM (USGS)', l: L.imageOverlay(elevURL, BB), o: .7 },
  { n: 'THEMIS night IR', d: 'Thermal · bright = rocky, dark = loose fines', l: tl('THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018', 'png', 9), o: .6 },
  { n: 'THEMIS day IR', d: 'Thermal · Mars Odyssey 100 m/px', l: tl('THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018', 'png', 9), o: .6 },
  { n: 'HiRISE DEM (regional)', d: 'Topographic · Mars Trek shaded DEM', l: tl('Gale_DEM_SMG_1m', 'png', 14, [[-4.9254, 137.1225], [-4.249, 137.7298]]), o: .6 },
  { n: 'Curiosity traverse', d: 'MSL rover path, sols 0–' + M.traverse[M.traverse.length - 1][2], l: L.layerGroup(), on: true, vec: true }];
const trav = M.traverse.map(p => [p[1], p[0]]);
overlays[5].l.addLayer(L.polyline(trav, { color: '#000', weight: 4, opacity: .5 })).addLayer(L.polyline(trav, { color: '#ffd9a0', weight: 1.6, dashArray: '4 4' }));
const last = M.traverse[M.traverse.length - 1];
overlays[5].l.addLayer(L.marker([last[1], last[0]], { icon: L.divIcon({ className: '', html: '<div class="mk r" style="width:30px;height:18px">MSL</div>', iconSize: [30, 18] }), interactive: false }));

bases.forEach((b, i) => {
  const el = document.createElement('label'); el.className = 'layer';
  el.innerHTML = `<input type="radio" name="base" ${i ? '' : 'checked'}><span>${b.n}</span><span></span><small>${b.d}</small>`;
  el.querySelector('input').onchange = () => { bases.forEach(x => x.l && map.removeLayer(x.l)); b.l && b.l.addTo(map).bringToBack && b.l.setZIndex(2); };
  $('#bases').append(el);
});
bases[0].l.addTo(map).setZIndex(2);
overlays.forEach((o, i) => {
  const el = document.createElement('div'); el.className = 'layer';
  el.innerHTML = `<input type="checkbox" ${o.on ? 'checked' : ''}><span>${o.n}</span>${o.vec ? '<span></span>' : `<input type="range" min="0" max="100" value="${(o.o || 1) * 100}">`}<small>${o.d}</small>`;
  if (!o.vec) { o.l.setOpacity(o.o); o.l.setZIndex && o.l.setZIndex(10 + i); el.querySelector('[type=range]').oninput = e => o.l.setOpacity(e.target.value / 100); }
  el.querySelector('[type=checkbox]').onchange = e => e.target.checked ? o.l.addTo(map) : map.removeLayer(o.l);
  if (o.on) o.l.addTo(map);
  $('#layers').append(el);
});
$('#slopeLegend').innerHTML = SLOPE_CLS.map((k, i) => `<div style="background:${k[1]}">${i ? SLOPE_CLS[i - 1][0] : 0}${i === 5 ? '+' : '–' + k[0]}</div>`).join('');
L.rectangle(BB, { color: '#fff', weight: 1, fill: false, dashArray: '2 6', opacity: .5, interactive: false }).addTo(map);
map.on('mousemove', e => {
  const { lat, lng } = e.latlng; let t = `${lat.toFixed(5)}°, ${lng.toFixed(5)}°E`;
  if (inGrid(lat, lng)) { const [r, c] = ll2rc(lat, lng), i = r * N + c; t += `  ·  elev ${Z[i].toFixed(1)} m  ·  slope ${S[i].toFixed(1)}°`; }
  $('#readout').textContent = t;
});

/* ---------- stations, hab, plan state ---------- */
const stations = M.stations.map((s, i) => ({ ...s, id: 'S' + i, tag: String.fromCharCode(65 + i), name: `Station ${String.fromCharCode(65 + i)} · sol ${s.sol} stop`, ll: [s.lat, s.lon] }));
function flattest(lat, lon, rad = 150) {            // flattest 20 m patch within rad metres
  const [r0, c0] = ll2rc(lat, lon), k = Math.round(rad / D.cell); let best = 1e9, br = r0, bc = c0;
  for (let r = Math.max(3, r0 - k); r < Math.min(N - 3, r0 + k); r += 2) for (let c = Math.max(3, c0 - k); c < Math.min(N - 3, c0 + k); c += 2) {
    let m = 0; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) m = Math.max(m, S[(r + a) * N + c + b]);
    if (m < best) { best = m; br = r; bc = c; }
  }
  return rc2ll(br, bc);
}
let hab = flattest(-4.8150, 137.3850);
let plan = ['S3', 'S4', 'S5', 'S6'].map(id => ({ id }));   // ordered stops; custom = {id,ll,name}
let customN = 0, route = null, simT = 0;
const stop = p => p.ll ? p : stations.find(s => s.id === p.id);
const icon = (cls, txt, sz = 24) => L.divIcon({ className: '', html: `<div class="mk ${cls}" style="width:${sz}px;height:${sz}px">${txt}</div>`, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
const habMk = L.marker(hab, { icon: icon('h', 'HAB', 34), draggable: true, zIndexOffset: 500 }).addTo(map);
habMk.on('dragend', () => { const p = habMk.getLatLng(); if (inGrid(p.lat, p.lng)) hab = [p.lat, p.lng]; habMk.setLatLng(hab); replan(); });
const stMk = {}, custLayer = L.layerGroup().addTo(map), routeLayer = L.layerGroup().addTo(map);
const tasks = ['360° context panorama', 'Ridge vs. hollow close-up imaging', 'Rock chip / drill sample of ridge cement', 'Handheld spectrometer on vein fill'];
stations.forEach(s => {
  const [r, c] = ll2rc(s.lat, s.lon), i = r * N + c;
  const m = L.marker(s.ll, { icon: icon('s', s.tag) }).addTo(map); stMk[s.id] = m;
  m.bindPopup(() => {
    const inP = plan.some(p => p.id === s.id), el = document.createElement('div');
    el.innerHTML = `<b>${s.name}</b><div class="note">Curiosity was here on sol ${s.sol} · elev ${Z[i].toFixed(0)} m · local slope ${S[i].toFixed(1)}°</div>
      <div class="pov">${s.imgs.map(g => `<a href="${g.url}" target="_blank" rel="noopener"><img loading="lazy" src="${g.url}" alt="Curiosity ${g.inst} sol ${g.sol}"><em>${g.inst.replace('_LEFT_B', '').replace('_LEFT', ' L').replace('_RIGHT', ' R')} · sol ${g.sol}</em></a>`).join('')}</div>
      <div class="note">Rover's-eye view (NASA/JPL-Caltech/MSSS raw images). Suggested tasks: ${tasks.join('; ')}.</div>
      <button class="b" style="margin-top:6px;width:100%">${inP ? 'Remove from EVA' : 'Add to EVA'}</button>`;
    el.querySelector('button').onclick = () => { plan = inP ? plan.filter(p => p.id !== s.id) : [...plan, { id: s.id }]; m.closePopup(); replan(); };
    return el;
  }, { maxWidth: 300 });
});
map.on('click', e => {
  const { lat, lng } = e.latlng; if (!inGrid(lat, lng) || document.body.classList.contains('hud')) return;
  customN++; plan.push({ id: 'C' + customN, ll: [lat, lng], name: 'Waypoint ' + customN, tag: customN }); replan();
});

/* ---------- A* over the DEM (cost = traverse time x slope-risk penalty) ---------- */
const NB = [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1], [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [1, 1, Math.SQRT2]];
const gS = new Float32Array(N * N), came = new Int32Array(N * N), closed = new Uint8Array(N * N);
const tobler = g => Math.exp(-3.5 * Math.abs(g + 0.05)) * 1.19;      // relative speed vs grade, 1.0 on the flat
function astar(a, b, v0, maxS, risk) {
  const [sr, sc] = ll2rc(...a), [gr, gc] = ll2rc(...b), start = sr * N + sc, goal = gr * N + gc;
  gS.fill(Infinity); came.fill(-1); closed.fill(0);
  const hk = [], hv = [];                                             // binary heap
  const push = (k, v) => { let i = hk.length; hk.push(k); hv.push(v); while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
  const pop = () => { const top = hv[0], k = hk.pop(), v = hv.pop(), n = hk.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = k; hv[i] = v; } return top; };
  const vmax = v0 * 1.19, h = (r, c) => Math.hypot(r - gr, c - gc) * D.cell / vmax;
  gS[start] = 0; push(h(sr, sc), start);
  while (hk.length) {
    const cur = pop(); if (cur === goal) break; if (closed[cur]) continue; closed[cur] = 1;
    const r = (cur / N) | 0, c = cur - r * N;
    for (const [dr, dc, w] of NB) {
      const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
      const j = rr * N + cc; if (closed[j]) continue;
      if (S[j] > maxS && j !== goal && Math.hypot(rr - sr, cc - sc) > 3 && Math.hypot(rr - gr, cc - gc) > 3) continue;
      const dxy = w * D.cell, dz = Z[j] - Z[cur], pen = 1 + risk * (S[j] / maxS) ** 2;
      const t = gS[cur] + Math.hypot(dxy, dz) / (v0 * tobler(dz / dxy)) * pen;
      if (t < gS[j]) { gS[j] = t; came[j] = cur; push(t + h(rr, cc), j); }
    }
  }
  if (came[goal] < 0 && goal !== start) return null;
  const path = []; for (let i = goal; i >= 0; i = came[i]) { path.push(i); if (i === start) break; }
  return path.reverse();
}

/* ---------- planning ---------- */
const fmtT = s => { s = Math.max(0, Math.round(s / 60)); return `${Math.floor(s / 60)}h ${String(s % 60).padStart(2, '0')}m`; };
const lmst = s => { s = ((s % 88775) + 88775) % 88775; const h = s / 3600; return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor(h % 1 * 60)).padStart(2, '0')}`; };
const hm = t => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 3600 + m * 60; };
function settings() { const mob = MOB[$('#mob').value]; return { mob, v: mob.v, ms: +$('#ms').value, risk: +$('#rk').value / 2, dwell: +$('#dw').value * 60, start: hm($('#st').value), lim: +$('#lim').value * 3600, rt: $('#rt').checked }; }
let timer;
function replan() { $('#busy').textContent = 'computing…'; clearTimeout(timer); timer = setTimeout(compute, 30); renderPlan(); }
function compute() {
  const cfg = settings(), stops = plan.map(stop), pts = [hab, ...stops.map(s => s.ll)]; if (cfg.rt) pts.push(hab);
  const P = [], legs = []; let dist = 0, time = 0, up = 0, down = 0, maxS = 0, far = 0, blocked = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const path = astar(pts[k], pts[k + 1], cfg.v, cfg.ms, cfg.risk);
    const name = k < stops.length ? (stops[k].name) : 'Habitat';
    if (!path) { blocked.push(name); continue; }
    path.forEach((i, n) => {
      const r = (i / N) | 0, c = i - r * N, ll = rc2ll(r, c);
      if (P.length && (n > 0 || k > 0)) {
        const q = P[P.length - 1], dxy = distM(ll, q.ll), dz = Z[i] - q.z; if (dxy === 0) return;
        dist += Math.hypot(dxy, dz); time += Math.hypot(dxy, dz) / (cfg.v * tobler(dz / dxy)); dz > 0 ? up += dz : down -= dz;
      }
      maxS = Math.max(maxS, S[i]); far = Math.max(far, distM(ll, hab));
      P.push({ ll, z: Z[i], s: S[i], d: dist, t: time, leg: k });
    });
    legs.push({ name, d: dist, t: time, isStop: k < stops.length, ll: pts[k + 1] });
  }
  const nSt = legs.filter(l => l.isStop).length, total = time + nSt * cfg.dwell;
  route = { P, legs, dist, walk: time, total, up, down, maxS, far, blocked, cfg, nSt };
  draw(); renderStats(); renderProfile(); setSim(simT); $('#busy').textContent = '';
}
function draw() {
  routeLayer.clearLayers(); custLayer.clearLayers();
  stations.forEach(s => { const k = plan.findIndex(p => p.id === s.id); stMk[s.id].setIcon(icon(k < 0 ? 's off' : 's', s.tag)); });
  plan.filter(p => p.ll).forEach(p => L.marker(p.ll, { icon: icon('c', p.tag, 20) }).addTo(custLayer));
  const pts = route.P.map(p => p.ll); if (!pts.length) return;
  L.polyline(pts, { color: '#001318', weight: 7, opacity: .7 }).addTo(routeLayer);
  L.polyline(pts, { color: '#3ee0ff', weight: 3 }).addTo(routeLayer);
}
function renderPlan() {
  const el = $('#wps'); el.innerHTML = '<div class="wp"><div class="tag" style="background:#fff;border-radius:4px">H</div><span>Habitat / lander <em class="note">(drag on map)</em></span></div>';
  plan.forEach((p, k) => {
    const s = stop(p), d = document.createElement('div'); d.className = 'wp';
    d.innerHTML = `<div class="tag ${p.ll ? 'c' : ''}">${s.tag}</div><span>${k + 1}. ${s.name}</span><button title="Move up">↑</button><button title="Move down">↓</button><button title="Remove">✕</button>`;
    const [u, dn, x] = d.querySelectorAll('button');
    u.onclick = () => { if (k) { [plan[k - 1], plan[k]] = [plan[k], plan[k - 1]]; replan(); } };
    dn.onclick = () => { if (k < plan.length - 1) { [plan[k + 1], plan[k]] = [plan[k], plan[k + 1]]; replan(); } };
    x.onclick = () => { plan.splice(k, 1); replan(); };
    d.querySelector('span').onclick = () => map.panTo(s.ll);
    el.append(d);
  });
  if (!plan.length) el.insertAdjacentHTML('beforeend', '<div class="note">No stops yet — click a station or the map.</div>');
}
$('#opt').onclick = () => {                               // nearest-neighbour ordering from the hab
  const left = [...plan], out = []; let cur = hab;
  while (left.length) { let b = 0; left.forEach((p, i) => { if (distM(stop(p).ll, cur) < distM(stop(left[b]).ll, cur)) b = i; }); cur = stop(left[b]).ll; out.push(left.splice(b, 1)[0]); }
  plan = out; replan();
};
$('#clr').onclick = () => { plan = []; replan(); };
['#ms', '#rk', '#dw', '#st', '#lim', '#rt'].forEach(s => $(s).addEventListener('input', () => { labels(); replan(); }));
$('#mob').onchange = () => { $('#ms').value = MOB[$('#mob').value].ms; labels(); replan(); };
function labels() { $('#msV').textContent = $('#ms').value + '°'; $('#rkV').textContent = ['off', 'low', 'low', 'med', 'med', 'high', 'high', 'max', 'max'][$('#rk').value]; }

/* ---------- conditions: REMS + DONKI ---------- */
const wx = M.rems.find(r => r.max_temp !== '--' && r.min_temp !== '--') || M.rems[0];
const sun = { rise: hm(wx.sunrise), set: hm(wx.sunset) };
$('#remsSol').textContent = `sol ${wx.sol}`;
$('#wx').innerHTML = [['Air temp', `${wx.min_temp} … ${wx.max_temp} °C`], ['Ground temp', `${wx.min_gts_temp} … ${wx.max_gts_temp} °C`], ['Pressure', `${wx.pressure} Pa`], ['Sky', wx.atmo_opacity], ['UV index', wx.local_uv_irradiance_index], ['Sunrise / sunset', `${wx.sunrise} / ${wx.sunset} LMST`], ['Season', `Ls ${wx.ls}° · ${wx.terrestrial_date}`]].map(k => `<div class="kv"><span>${k[0]}</span><span class="mono">${k[1]}</span></div>`).join('');
(function spark() {
  const cv = $('#spark'), cx = cv.getContext('2d'), d = M.rems.filter(r => r.max_temp !== '--' && r.min_temp !== '--').reverse(), W = cv.width, H = cv.height;
  const lo = Math.min(...d.map(r => +r.min_temp)), hi = Math.max(...d.map(r => +r.max_temp)), y = v => 6 + (hi - v) / (hi - lo) * (H - 12);
  [['max_temp', '#ff7a3d'], ['min_temp', '#6ab7ff']].forEach(([k, col]) => { cx.beginPath(); d.forEach((r, i) => cx[i ? 'lineTo' : 'moveTo'](i / (d.length - 1) * W, y(+r[k]))); cx.strokeStyle = col; cx.lineWidth = 2; cx.stroke(); });
  cx.fillStyle = '#8e97a5'; cx.font = '18px ui-monospace,monospace'; cx.fillText(hi + '°C', 4, 20); cx.fillText(lo + '°C', 4, H - 6);
})();
let sw = { level: 'warn', text: 'Space-weather feed unavailable — confirm with mission control' };
(async function donki() {
  const iso = d => d.toISOString().slice(0, 10), now = new Date(), from = new Date(now - 7 * 864e5);
  try {
    const n = await (await fetch(`https://api.nasa.gov/DONKI/notifications?startDate=${iso(from)}&endDate=${iso(now)}&type=all&api_key=DEMO_KEY`)).json();
    const cnt = {}; n.forEach(m => cnt[m.messageType] = (cnt[m.messageType] || 0) + 1);
    const recent = t => n.filter(m => m.messageType === t && now - new Date(m.messageIssueTime) < 3 * 864e5).length;
    let top = '';
    try { const f = await (await fetch('https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json')).json(); top = f.map(x => x.max_class).filter(Boolean).sort((a, b) => 'ABCMX'.indexOf(b[0]) - 'ABCMX'.indexOf(a[0]) || parseFloat(b.slice(1)) - parseFloat(a.slice(1)))[0] || ''; } catch (e) { }
    const level = recent('SEP') ? 'bad' : (recent('FLR') || recent('CME') || top[0] === 'X') ? 'warn' : 'ok';
    sw = { level, text: level === 'bad' ? 'Solar energetic particle event in last 72 h — shelter, no EVA' : level === 'warn' ? 'Recent flare/CME activity — keep shelter within reach' : 'Quiet — no SEP, flare or CME alerts in last 72 h' };
    const names = { FLR: 'Solar flare', SEP: 'Energetic particles', CME: 'CME', IPS: 'Interplanetary shock', GST: 'Geomagnetic storm', RBE: 'Radiation belt', HSS: 'High-speed stream', MPC: 'Magnetopause', Report: 'Weekly report' };
    $('#sw').innerHTML = `<div class="kv"><span>EVA radiation status</span><span class="pill ${level}">${{ ok: 'GO', warn: 'CAUTION', bad: 'NO-GO' }[level]}</span></div><div class="note" style="margin:3px 0 5px">${sw.text}</div>` +
      Object.entries(cnt).filter(k => k[0] !== 'Report').map(k => `<div class="kv"><span>${names[k[0]] || k[0]} alerts (7 d)</span><span class="mono">${k[1]}</span></div>`).join('') +
      (top ? `<div class="kv"><span>Strongest X-ray flare (7 d)</span><span class="mono">${top}</span></div>` : '') +
      `<div class="kv"><span>Surface GCR dose rate</span><span class="mono">${GCR_MSV_DAY} mSv/day</span></div><div class="note">Alerts: NASA CCMC DONKI (heliosphere-wide, not Mars-specific); flare class: NOAA GOES; dose rate: MSL RAD average.</div>`;
  } catch (e) { $('#sw').innerHTML = `<span class="pill warn">UNKNOWN</span> ${sw.text}<div class="kv" style="margin-top:4px"><span>Surface GCR dose rate</span><span class="mono">${GCR_MSV_DAY} mSv/day</span></div>`; }
  if (route) renderStats();
})();

/* ---------- outputs ---------- */
function renderStats() {
  const r = route, c = r.cfg, dose = GCR_MSV_DAY * r.total / 86400 * 1000, end = c.start + r.total;
  $('#stats').innerHTML = [[(r.dist / 1000).toFixed(2) + ' km', 'Distance'], [fmtT(r.total), 'EVA duration'], [fmtT(r.walk), 'Moving time'], [`+${r.up.toFixed(0)} / −${r.down.toFixed(0)} m`, 'Climb / descent'], [r.maxS.toFixed(1) + '°', 'Steepest on route'], [dose.toFixed(0) + ' µSv', 'GCR dose (est.)'], [(r.far / 1000).toFixed(2) + ' km', 'Farthest from hab'], [`${lmst(c.start)}–${lmst(end)}`, 'Window (LMST)']]
    .map(k => `<div class="stat"><div class="v num">${k[0]}</div><div class="k">${k[1]}</div></div>`).join('');
  const ck = [], add = (lvl, t) => ck.push(`<div class="check ${lvl}"><i>${{ ok: '✓', warn: '!', bad: '✕' }[lvl]}</i><div>${t}</div></div>`);
  const use = r.total / c.lim;
  if (r.blocked.length) add('bad', `No route under ${c.ms}° to: ${r.blocked.join(', ')}. Raise max slope or move the stop.`);
  add(use > 1 ? 'bad' : use > .8 ? 'warn' : 'ok', `Consumables: ${(use * 100).toFixed(0)}% of ${c.lim / 3600} h used${use > .8 && use <= 1 ? ' — under 20% reserve' : ''}`);
  add(c.start < sun.rise || end > sun.set ? 'bad' : end > sun.set - 3600 ? 'warn' : 'ok', `Daylight: back at ${lmst(end)}, sunset ${wx.sunset} LMST`);
  add(r.maxS > c.ms ? 'warn' : 'ok', `Steepest ground ${r.maxS.toFixed(1)}° vs ${c.ms}° limit${r.maxS > c.ms ? ' (only at a stop/endpoint)' : ''}`);
  add(r.far > c.mob.back ? 'warn' : 'ok', `Walk-back: farthest point ${(r.far).toFixed(0)} m from hab (guide ${c.mob.back} m, ${c.mob.name.toLowerCase()})`);
  add(sw.level, `Space weather: ${sw.text}`);
  add(+wx.min_gts_temp < -90 ? 'warn' : 'ok', `Thermal: ground ${wx.min_gts_temp}…${wx.max_gts_temp} °C, air ${wx.min_temp}…${wx.max_temp} °C (sol ${wx.sol})`);
  $('#checks').innerHTML = ck.join('');
}
const pc = $('#profile'), hoverMk = L.circleMarker([0, 0], { radius: 6, color: '#fff', weight: 2, fillColor: '#3ee0ff', fillOpacity: 1 });
function renderProfile(hx) {
  const cx = pc.getContext('2d'), W = pc.width, H = pc.height, P = route.P; cx.clearRect(0, 0, W, H); if (P.length < 2) return;
  const lo = Math.min(...P.map(p => p.z)) - 3, hi = Math.max(...P.map(p => p.z)) + 3, X = d => 44 + d / route.dist * (W - 54), Y = z => H - 26 - (z - lo) / (hi - lo) * (H - 44);
  for (let i = 1; i < P.length; i++) { cx.beginPath(); cx.moveTo(X(P[i - 1].d), H - 26); cx.lineTo(X(P[i - 1].d), Y(P[i - 1].z)); cx.lineTo(X(P[i].d), Y(P[i].z)); cx.lineTo(X(P[i].d), H - 26); cx.fillStyle = slopeCol(P[i].s); cx.globalAlpha = .75; cx.fill(); }
  cx.globalAlpha = 1; cx.beginPath(); P.forEach((p, i) => cx[i ? 'lineTo' : 'moveTo'](X(p.d), Y(p.z))); cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.stroke();
  cx.fillStyle = '#8e97a5'; cx.font = '18px ui-monospace,monospace'; cx.fillText(hi.toFixed(0), 2, 22); cx.fillText(lo.toFixed(0), 2, H - 28); cx.fillText('0', 44, H - 6); cx.textAlign = 'right'; cx.fillText((route.dist / 1000).toFixed(2) + ' km', W - 8, H - 6); cx.textAlign = 'left';
  route.legs.filter(l => l.isStop).forEach(l => { cx.strokeStyle = '#ff7a3d'; cx.setLineDash([4, 4]); cx.beginPath(); cx.moveTo(X(l.d), 8); cx.lineTo(X(l.d), H - 26); cx.stroke(); cx.setLineDash([]); });
  if (hx != null) { cx.strokeStyle = '#3ee0ff'; cx.beginPath(); cx.moveTo(hx, 0); cx.lineTo(hx, H - 26); cx.stroke(); }
}
pc.onmousemove = e => {
  if (!route || route.P.length < 2) return; const b = pc.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * pc.width, d = Math.max(0, Math.min(1, (x - 44) / (pc.width - 54))) * route.dist;
  const p = route.P.find(q => q.d >= d) || route.P[route.P.length - 1]; hoverMk.setLatLng(p.ll).addTo(map); renderProfile(x);
  pc.title = `${(p.d).toFixed(0)} m · elev ${p.z.toFixed(1)} m · slope ${p.s.toFixed(1)}°`;
};
pc.onmouseleave = () => { map.removeLayer(hoverMk); renderProfile(); };

/* ---------- helmet HUD simulation ---------- */
const astro = L.marker(hab, { icon: icon('a', '', 18), zIndexOffset: 900, interactive: false });
function setSim(f) {
  simT = f; if (!route || route.P.length < 2) return;
  const r = route, P = r.P, d = f * r.dist; let i = P.findIndex(q => q.d >= d); if (i < 0) i = P.length - 1;
  const p = P[i], a = P[Math.min(P.length - 1, i + 6)], leg = r.legs.find(l => l.d >= d - .01) || r.legs[r.legs.length - 1];
  const done = r.legs.filter(l => l.isStop && l.d < d - .01).length, el = p.t + done * r.cfg.dwell, rem = r.cfg.lim - el;
  const brg = (Math.atan2((a.ll[1] - p.ll[1]) * MXLON, (a.ll[0] - p.ll[0]) * MX) * 180 / Math.PI + 360) % 360;
  let ahead = 0; for (let k = i; k < P.length && P[k].d - p.d < 50; k++) ahead = Math.max(ahead, P[k].s);
  const back = distM(p.ll, hab) / r.cfg.v * 1.3, frac = (((r.cfg.start + el) % 88775) - sun.rise) / (sun.set - sun.rise);
  const gt = +wx.min_gts_temp + (+wx.max_gts_temp - +wx.min_gts_temp) * Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, frac))));
  astro.setLatLng(p.ll);
  $('#hNext').textContent = `${leg.name.split(' · ')[0]} · ${(leg.d - d).toFixed(0)} m`;
  $('#arrow').style.transform = `rotate(${brg}deg)`; $('#hBrg').textContent = `HDG ${brg.toFixed(0).padStart(3, '0')}° · ETA ${fmtT(Math.max(0, leg.t - p.t))}`;
  $('#hEl').textContent = fmtT(el); $('#hRem').textContent = fmtT(rem); $('#hRem').className = rem < back * 1.5 ? 'alert' : '';
  $('#hRet').textContent = `${distM(p.ll, hab).toFixed(0)} m · ${fmtT(back)}`; $('#hDose').textContent = (GCR_MSV_DAY * el / 86400 * 1000).toFixed(0) + ' µSv';
  $('#hSl').textContent = p.s.toFixed(1) + '°'; $('#hSl').className = p.s > 15 ? 'alert' : '';
  $('#hAhead').textContent = ahead.toFixed(1) + '°'; $('#hAhead').className = ahead > 15 ? 'alert' : '';
  $('#hEv').textContent = p.z.toFixed(0) + ' m'; $('#hT').textContent = gt.toFixed(0) + ' °C';
  $('#hStatus').innerHTML = `${lmst(r.cfg.start + el)} LMST · SW ${{ ok: 'GO', warn: '<span class="alert">CAUTION</span>', bad: '<span class="alert">NO-GO</span>' }[sw.level]}`;
  $('#hPct').textContent = Math.round(f * 100) + '%'; $('#prog').value = f * 1000;
  if (document.body.classList.contains('hud')) map.panTo(p.ll, { animate: false });
}
$('#prog').oninput = e => setSim(e.target.value / 1000);
let playing;
$('#play').onclick = () => {
  if (playing) { clearInterval(playing); playing = null; $('#play').textContent = '▶ Walk'; return; }
  if (simT >= 1) simT = 0; $('#play').textContent = '❚❚ Pause';
  playing = setInterval(() => { setSim(Math.min(1, simT + .002)); if (simT >= 1) $('#play').click(); }, 50);
};
document.querySelectorAll('#mode button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x === b));
  const hud = b.dataset.m === 'hud'; document.body.classList.toggle('hud', hud);
  hud ? astro.addTo(map) : map.removeLayer(astro);
  setTimeout(() => { map.invalidateSize(); if (hud) { map.setZoom(17, { animate: false }); setSim(simT); } else map.setView([-4.8155, 137.3852], 15); }, 60);
});

$('#src').innerHTML = `Optical: MRO HiRISE &amp; CTX mosaics, Viking MDIM 2.1 (NASA Mars Trek). Topographic: ${D.source}. Thermal: Mars Odyssey THEMIS IR. Atmospheric: MSL REMS. Radiation: MSL RAD, NASA CCMC DONKI. Rover path &amp; images: MSL localisation and raw-image archive (NASA/JPL-Caltech).`;
labels(); renderPlan(); compute();
window.MW = { get route() { return route; }, map };
})();
