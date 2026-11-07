// Image -> 3D Studio. 100% self-hosted: no API key, no cloud service.
// Multi-view mode: front / back / side / top photos -> background auto-cleaned -> silhouette-carved solid -> photo-projected texture atlas.
// Single-photo mode: depth relief using an open model (Depth Anything via transformers.js, in the browser).
// Run:  npm install  &&  npm start     then open http://localhost:3000
const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3000;
const nm = (...p) => path.join(__dirname, 'node_modules', ...p);
const app = express();
app.use('/vendor/three', express.static(nm('three')));
app.use('/vendor/transformers', express.static(nm('@huggingface', 'transformers', 'dist')));
app.use('/vendor/ort', express.static(nm('onnxruntime-web', 'dist')));
app.use('/vendor/ort-common', express.static(nm('onnxruntime-common', 'dist', 'esm')));
app.use('/models', express.static(path.join(__dirname, 'models')));
if (process.env.TEST_ASSETS) app.use('/test', express.static(process.env.TEST_ASSETS));
app.get('/', (q, r) => r.type('html').send(HTML));
app.listen(PORT, () => console.log('Image -> 3D Studio: http://localhost:' + PORT));

const HTML = String.raw`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Image to 3D Studio</title>
<style>
:root{--bg:#0b0f17;--pn:#111826;--ln:#1f2a3d;--tx:#e8edf5;--mu:#8795ad;--ac:#4aa3ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;height:100vh;display:grid;grid-template-columns:320px 1fr 310px;overflow:hidden}
aside{background:var(--pn);padding:16px;overflow:auto;border-right:1px solid var(--ln)}aside.r{border-right:0;border-left:1px solid var(--ln)}
h1{font-size:17px;margin:0 0 4px}.sub{color:var(--mu);font-size:12px;margin-bottom:14px}h2{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mu);margin:20px 0 8px}
.drop{border:1.5px dashed #34435e;border-radius:12px;padding:12px;text-align:center;color:var(--mu);cursor:pointer;font-size:12px}
.drop.hot,.slot.hot{border-color:var(--ac);color:var(--tx)}
.slots{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.slot{position:relative;border:1.5px dashed #34435e;border-radius:10px;padding:4px;text-align:center;font-size:11px;color:var(--mu);cursor:pointer;background:#0e1522}
.slot canvas{width:100%;aspect-ratio:1;display:block;border-radius:6px;background:#0b0f17}.slot span{display:block;margin-top:3px;line-height:1.15}
.slot u{position:absolute;top:2px;right:6px;text-decoration:none;font-size:15px;display:none;color:#fff;text-shadow:0 0 3px #000}.slot.has u{display:block}.slot.has{border-style:solid;border-color:#2b3a55}
button{font:inherit;color:var(--tx);background:#1a2335;border:1px solid #2b3a55;border-radius:9px;padding:9px 12px;cursor:pointer}
button:hover{background:#223049}button.p{background:var(--ac);border-color:var(--ac);color:#04101f;font-weight:600}button:disabled{opacity:.45;cursor:default}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.row>*{flex:1}
label.ck{display:flex;gap:8px;align-items:center;margin-top:8px;color:var(--mu)}
#st{margin-top:10px;color:var(--mu);font-size:13px;min-height:18px}.bar{height:4px;background:#1a2335;border-radius:4px;margin-top:8px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--ac);transition:.3s}
main{position:relative}#cv{width:100%;height:100%;display:block}
.hud{position:absolute;left:14px;bottom:12px;color:var(--mu);font-size:12px;pointer-events:none}
.card{background:#0e1522;border:1px solid var(--ln);border-radius:12px;padding:12px;margin-bottom:10px}.card.sel{border-color:var(--ac)}
.card b{display:block;margin-bottom:8px;font-weight:600}.f{display:grid;grid-template-columns:86px 1fr;gap:8px;align-items:center;margin:6px 0;color:var(--mu);font-size:12px}
input[type=color]{width:100%;height:30px;border:1px solid #2b3a55;border-radius:7px;background:none;padding:0}input[type=range]{width:100%}select{width:100%;background:#1a2335;color:var(--tx);border:1px solid #2b3a55;border-radius:7px;padding:6px}
.mini{padding:6px 9px;font-size:12px}.sw{display:flex;gap:6px;margin-top:6px}.sw i{width:22px;height:22px;border-radius:50%;cursor:pointer;box-shadow:inset 0 0 0 1px #fff3}
@media(max-width:900px){body{grid-template-columns:1fr;grid-template-rows:auto 55vh auto;overflow:auto;height:auto}aside{border:0}}
</style></head><body>
<aside>
<h1>Image → 3D Studio</h1><div class="sub">Multi-view photos → 3D. Runs on your machine. No API key.</div>
<div class="drop" id="drop">Drop all view photos here (named front / back / right / left / top), or tap a slot below</div>
<div class="slots" id="slots"></div>
<input type="file" id="file" accept="image/*" multiple hidden>
<div class="f">Clean BG<input type="range" id="tol" min="6" max="90" step="1" value="28"></div>
<label class="ck"><input type="checkbox" id="usetop"> Use top view for shape (only if shot straight down)</label>
<div class="row"><button class="p" id="go" disabled>Make 3D</button></div>
<div class="row"><button id="openglb">Open .glb</button></div>
<input type="file" id="glbf" accept=".glb,.gltf" hidden>
<div class="bar"><i id="pr"></i></div><div id="st"></div>
<h2>Multi-view solid</h2>
<div class="f">Resolution<select id="res"><option value="112">Fast</option><option value="168" selected>Normal</option><option value="240">High</option></select></div>
<div class="f">Smooth<input type="range" id="msm" min="0" max="4" step="1" value="2"></div>
<h2>Single-photo relief</h2>
<div class="f">Depth<input type="range" id="str" min="0" max="1.2" step="0.02" value="0.55"></div>
<div class="f">Thickness<input type="range" id="thk" min="0.02" max="0.6" step="0.01" value="0.18"></div>
<div class="f">Smoothing<input type="range" id="smo" min="0" max="6" step="1" value="2"></div>
<div class="f">Detail<select id="det"><option value="140">Fast</option><option value="220" selected>Normal</option><option value="320">High</option></select></div>
<label class="ck"><input type="checkbox" id="cut" checked> Cut out background</label>
<div class="f">Cut level<input type="range" id="thr" min="0" max="1" step="0.01" value="0.35"></div>
<label class="ck"><input type="checkbox" id="inv"> Flip depth</label>
<h2>Scene</h2>
<div class="f">Background<input type="color" id="bg" value="#0b0f17"></div>
<div class="f">Exposure<input type="range" id="exp" min="0.3" max="2" step="0.05" value="1"></div>
<label class="ck"><input type="checkbox" id="rot" checked> Auto-rotate</label>
<label class="ck"><input type="checkbox" id="wire"> Wireframe</label>
<div class="row"><button id="shot">Save PNG</button><button id="exp3d">Export GLB</button></div>
</aside>
<main><canvas id="cv"></canvas><div class="hud" id="hud">Click a part of the model to edit its material</div></main>
<aside class="r">
<h2 style="margin-top:0">Texture</h2>
<div class="card">
<div class="f">Hue<input type="range" id="th" min="-180" max="180" step="1" value="0"></div>
<div class="f">Saturation<input type="range" id="ts" min="0" max="2" step="0.02" value="1"></div>
<div class="f">Brightness<input type="range" id="tb" min="0.4" max="1.8" step="0.02" value="1"></div>
<div class="f">Contrast<input type="range" id="tc" min="0.5" max="1.6" step="0.02" value="1"></div>
<div class="f">Finish<select id="pre"><option value="">As photographed</option><option value="1,0">Matte clay</option><option value=".45,0">Satin paint</option><option value=".18,0">Glossy ceramic</option><option value=".35,.9">Brushed metal</option><option value=".25,1,#ffd27a">Gold tint</option><option value=".4,1,#e8e8f0">Silver tint</option></select></div>
</div>
<div class="card"><b>Paint on model</b>
<label class="ck" style="margin-top:0"><input type="checkbox" id="paint"> Paint mode (orbit off)</label>
<div class="f">Colour<input type="color" id="pcol" value="#d4202a"></div>
<div class="f">Size<input type="range" id="psz" min="2" max="70" value="14"></div>
<div class="f">Opacity<input type="range" id="pa" min="0.1" max="1" step="0.05" value="1"></div>
<div class="row"><button class="mini" id="pclr">Clear paint</button></div></div>
<h2>Parts &amp; materials</h2><div id="mats"><div style="color:var(--mu)">Make a 3D model or open a .glb to edit colours and textures.</div></div></aside>
<input type="file" id="texf" accept="image/*" hidden>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/examples/jsm/","onnxruntime-web/webgpu":"/vendor/ort/ort.webgpu.bundle.min.mjs","onnxruntime-common":"/vendor/ort-common/index.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const $ = id => document.getElementById(id);
const P = new URLSearchParams(location.search);
const cv = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0f17');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100); camera.position.set(2.6, 1.6, 3.4);
const controls = new OrbitControls(camera, cv); controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1.2;
function resize() { const m = cv.parentElement, w = m.clientWidth, h = m.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let root = null, fromGLTF = false, img = null, depth = null, mats = [], texTarget = null, mode = null, tex = null;
const st = (t, p) => { $('st').textContent = t || ''; if (p != null) $('pr').style.width = p + '%'; };
const tick = () => new Promise(r => setTimeout(r, 20));

// ================= image slots + automatic background clean =================
const SLOTS = [['front', 'Front'], ['back', 'Back'], ['sideR', 'Side (faces right)'], ['sideL', 'Side (faces left)'], ['top', 'Top']];
const DIR = { front: [0, 0, -1], back: [0, 0, 1], sideR: [1, 0, 0], sideL: [-1, 0, 0], top: [0, -1, 0] };
const V = {}; let pick = null, loadingN = 0;
const file = $('file'), drop = $('drop');
SLOTS.forEach(([k, l]) => {
  const d = document.createElement('div'); d.className = 'slot'; d.id = 'sl_' + k;
  d.innerHTML = '<canvas width="110" height="110"></canvas><span>' + l + '</span><u title="Remove">×</u>';
  d.onclick = e => { if (e.target.tagName === 'U') { delete V[k]; drawThumb(k); refreshGo(); return; } pick = k; file.click(); };
  ['dragenter', 'dragover'].forEach(ev => d.addEventListener(ev, x => { x.preventDefault(); x.stopPropagation(); d.classList.add('hot'); }));
  ['dragleave', 'drop'].forEach(ev => d.addEventListener(ev, x => { x.preventDefault(); x.stopPropagation(); d.classList.remove('hot'); }));
  d.addEventListener('drop', x => { const f = x.dataTransfer.files[0]; if (f) loadSlot(k, URL.createObjectURL(f)); });
  $('slots').appendChild(d); drawThumb(k);
});
drop.onclick = () => { pick = null; file.click(); };
['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('hot'); }));
['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('hot'); }));
drop.addEventListener('drop', ev => autoAssign(ev.dataTransfer.files));
file.onchange = () => { const fs = [...file.files]; file.value = ''; if (pick && fs.length === 1) loadSlot(pick, URL.createObjectURL(fs[0])); else autoAssign(fs); };
function autoAssign(files) {
  const order = ['front', 'back', 'sideR', 'sideL', 'top'], used = new Set();
  [...files].forEach(f => {
    const n = f.name.toLowerCase(); let k = null;
    if (/front/.test(n)) k = 'front'; else if (/back|rear/.test(n)) k = 'back'; else if (/top|above/.test(n)) k = 'top';
    else if (/right/.test(n)) k = 'sideR'; else if (/left/.test(n)) k = 'sideL'; else if (/side/.test(n)) k = (!V.sideR && !used.has('sideR')) ? 'sideR' : 'sideL';
    if (!k || used.has(k)) k = order.find(q => !V[q] && !used.has(q));
    if (k) { used.add(k); loadSlot(k, URL.createObjectURL(f)); }
  });
}
function loadSlot(k, url, then) {
  const im = new Image(); loadingN++;
  im.onload = () => {
    const s = Math.min(1, 1024 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
    const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
    V[k] = { canvas: c, w: c.width, h: c.height }; remask(k); drawThumb(k); loadingN--; refreshGo(); if (then) then();
  };
  im.onerror = () => { loadingN--; st('Could not read that image.'); };
  im.src = url;
}
function remask(k) {
  const v = V[k]; if (!v) return;
  v.mask = bgMask(v.canvas, +$('tol').value);
  const c = document.createElement('canvas'); c.width = v.w; c.height = v.h; const g = c.getContext('2d');
  const sd = v.canvas.getContext('2d').getImageData(0, 0, v.w, v.h), m = v.mask.m;
  for (let i = 0; i < m.length; i++) sd.data[i * 4 + 3] = m[i] ? 255 : 0;
  g.putImageData(sd, 0, 0); v.cut = c;
}
function drawThumb(k) {
  const c = $('sl_' + k).querySelector('canvas'), g = c.getContext('2d'), W = c.width;
  for (let y = 0; y < W; y += 10) for (let x = 0; x < W; x += 10) { g.fillStyle = ((x + y) / 10) % 2 ? '#1d2636' : '#141b29'; g.fillRect(x, y, 10, 10); }
  const v = V[k]; $('sl_' + k).classList.toggle('has', !!v); if (!v) return;
  const s = Math.min(W / v.w, W / v.h); g.drawImage(v.cut, (W - v.w * s) / 2, (W - v.h * s) / 2, v.w * s, v.h * s);
}
let rt; $('tol').addEventListener('input', () => { clearTimeout(rt); rt = setTimeout(() => { Object.keys(V).forEach(k => { remask(k); drawThumb(k); }); }, 120); });
const loaded = () => SLOTS.map(s => s[0]).filter(k => V[k]);
function canSolid() { const L = loaded(), top = $('usetop').checked && V.top; return (V.front || V.back) && (V.sideR || V.sideL || top || (V.front && V.back)); }
function refreshGo() {
  const L = loaded(); $('go').disabled = !(V.front || canSolid());
  st(L.length ? L.length + ' view' + (L.length > 1 ? 's' : '') + ' loaded — ' + (canSolid() ? 'ready for the multi-view solid.' : 'add a side view (or back) for a true 3D solid; one photo makes a relief.') : '');
}
$('usetop').onchange = refreshGo;

// background = colour sampled from the picture border, flood-filled inwards so enclosed same-colour details of the subject survive
function bgMask(c, tol) {
  const w = c.width, h = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, n = w * h, ring = [];
  for (let x = 0; x < w; x++) ring.push(x, w + x, (h - 1) * w + x, (h - 2) * w + x);
  for (let y = 0; y < h; y++) ring.push(y * w, y * w + 1, y * w + w - 1, y * w + w - 2);
  const med = ch => { const a = ring.map(p => d[p * 4 + ch]).sort((p, q) => p - q); return a[a.length >> 1]; };
  const br = med(0), bg = med(1), bb = med(2), T = tol * tol;
  const isbg = p => { const r = d[p * 4] - br, g = d[p * 4 + 1] - bg, b = d[p * 4 + 2] - bb; return r * r + g * g + b * b <= T; };
  const fl = new Uint8Array(n), stk = [];
  const push = p => { if (!fl[p] && isbg(p)) { fl[p] = 1; stk.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stk.length) { const p = stk.pop(), x = p % w, y = (p / w) | 0; if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (y > 0) push(p - w); if (y < h - 1) push(p + w); }
  const m = new Uint8Array(n); for (let i = 0; i < n; i++) m[i] = fl[i] ? 0 : 1;
  // drop specks and shadow fragments: keep components of at least 0.4% of the largest one
  const lab = new Int32Array(n), sizes = [0]; let L = 0;
  for (let p0 = 0; p0 < n; p0++) if (m[p0] && !lab[p0]) {
    L++; let sz = 0; const s2 = [p0]; lab[p0] = L;
    while (s2.length) { const p = s2.pop(), x = p % w, y = (p / w) | 0; sz++;
      if (x > 0 && m[p - 1] && !lab[p - 1]) { lab[p - 1] = L; s2.push(p - 1); } if (x < w - 1 && m[p + 1] && !lab[p + 1]) { lab[p + 1] = L; s2.push(p + 1); }
      if (y > 0 && m[p - w] && !lab[p - w]) { lab[p - w] = L; s2.push(p - w); } if (y < h - 1 && m[p + w] && !lab[p + w]) { lab[p + w] = L; s2.push(p + w); } }
    sizes.push(sz);
  }
  const mx = Math.max(1, ...sizes); for (let i = 0; i < n; i++) if (m[i] && sizes[lab[i]] < mx * 0.004) m[i] = 0;
  let x0 = w, x1 = -1, y0 = h, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { x0 = 0; x1 = w - 1; y0 = 0; y1 = h - 1; m.fill(1); }
  return { m, w, h, x0, x1, y0, y1 };
}
const erode = (m, w, h) => { const o = new Uint8Array(m.length); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const p = y * w + x; o[p] = m[p] & m[p - 1] & m[p + 1] & m[p - w] & m[p + w]; } return o; };

// ================= multi-view reconstruction =================
function mirrorView(v, key) {
  const w = v.w, h = v.h, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
  g.translate(w, 0); g.scale(-1, 1); g.drawImage(v.canvas, 0, 0);
  const m = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = v.mask.m[y * w + (w - 1 - x)];
  const b = v.mask; return { key, canvas: c, w, h, virt: true, mask: { m, w, h, x0: w - 1 - b.x1, x1: w - 1 - b.x0, y0: b.y0, y1: b.y1 } };
}
function blur3(f, nx, ny, nz) {
  const a = new Float32Array(f.length), sx = 1, sy = nx, sz = nx * ny;
  const pass = (src, dst, s, n, o1, n1, o2, n2) => { for (let q = 0; q < n2; q++) for (let p = 0; p < n1; p++) { const base = p * o1 + q * o2; dst[base] = src[base]; dst[base + (n - 1) * s] = src[base + (n - 1) * s]; for (let i = 1; i < n - 1; i++) { const b = base + i * s; dst[b] = (src[b - s] + 2 * src[b] + src[b + s]) * 0.25; } } };
  pass(f, a, sx, nx, sy, ny, sz, nz); const b = new Float32Array(f.length); pass(a, b, sy, ny, sx, nx, sz, nz); pass(b, a, sz, nz, sx, nx, sy, ny); return a;
}
function surfaceNets(f, nx, ny, nz, iso) {
  const sz = nx * ny, cid = new Int32Array(nx * ny * nz).fill(-1), pos = [];
  const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]], v = new Float32Array(8);
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    const b = x + y * nx + z * sz; let m = 0;
    v[0] = f[b] - iso; v[1] = f[b + 1] - iso; v[2] = f[b + nx] - iso; v[3] = f[b + nx + 1] - iso; v[4] = f[b + sz] - iso; v[5] = f[b + sz + 1] - iso; v[6] = f[b + sz + nx] - iso; v[7] = f[b + sz + nx + 1] - iso;
    for (let c = 0; c < 8; c++) if (v[c] > 0) m |= 1 << c;
    if (m === 0 || m === 255) continue;
    let ax = 0, ay = 0, az = 0, cnt = 0;
    for (let e = 0; e < 12; e++) { const a = ED[e][0], c = ED[e][1]; if ((v[a] > 0) !== (v[c] > 0)) { const t = v[a] / (v[a] - v[c]); ax += CO[a][0] + t * (CO[c][0] - CO[a][0]); ay += CO[a][1] + t * (CO[c][1] - CO[a][1]); az += CO[a][2] + t * (CO[c][2] - CO[a][2]); cnt++; } }
    cid[b] = pos.length / 3; pos.push(x + ax / cnt, y + ay / cnt, z + az / cnt);
  }
  const tris = [], quad = (c0, c1, c2, c3, fl) => { if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) return; if (fl) tris.push(c0, c2, c1, c0, c3, c2); else tris.push(c0, c1, c2, c0, c2, c3); };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const b = x + y * nx + z * sz, s0 = f[b] > iso;
    if (s0 !== (f[b + 1] > iso)) quad(cid[b], cid[b - nx], cid[b - nx - sz], cid[b - sz], s0);
    if (s0 !== (f[b + nx] > iso)) quad(cid[b], cid[b - sz], cid[b - sz - 1], cid[b - 1], s0);
    if (s0 !== (f[b + sz] > iso)) quad(cid[b], cid[b - 1], cid[b - 1 - nx], cid[b - nx], s0);
  }
  return { pos: new Float32Array(pos), tris: new Uint32Array(tris) };
}
function zbuffer(occ, nx, ny, nz, dir, o, vs) {
  const a = dir[0] ? 0 : dir[1] ? 1 : 2, sg = dir[a], n = [nx, ny, nz], s = [1, nx, nx * ny], bs = [0, 1, 2].filter(q => q !== a);
  const nu = n[bs[0]], nv = n[bs[1]], su = s[bs[0]], sv = s[bs[1]], na = n[a], sa = s[a], zb = new Float32Array(nu * nv).fill(Infinity);
  for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) { const base = u * su + v * sv; for (let t = 0; t < na; t++) { const k = sg > 0 ? t : na - 1 - t; if (occ[base + k * sa]) { zb[u + v * nu] = sg * (o[a] + k * vs); break; } } }
  return { zb, a, sg, b0: bs[0], b1: bs[1], nu, nv };
}
function prepTex(v) { // fill the removed background with colours dilated from the subject so edges never bleed white
  const w = v.w, h = v.h, g = v.canvas.getContext('2d', { willReadFrequently: true }), id = g.getImageData(0, 0, w, h), d = id.data, n = w * h;
  const fm = erode(erode(v.mask.m, w, h), w, h); v.core = fm.slice(); let sr = 0, sg = 0, sb = 0, sc = 0;
  for (let p = 0; p < n; p += 7) if (fm[p]) { sr += d[p * 4]; sg += d[p * 4 + 1]; sb += d[p * 4 + 2]; sc++; }
  v.avg = sc ? [sr / sc, sg / sc, sb / sc] : [128, 128, 128];
  for (let pass = 0; pass < 24; pass++) {
    const add = [], col = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const p = y * w + x; if (fm[p]) continue; let r = 0, gg = 0, b = 0, c = 0;
      for (const q of [p - 1, p + 1, p - w, p + w]) if (fm[q]) { r += d[q * 4]; gg += d[q * 4 + 1]; b += d[q * 4 + 2]; c++; }
      if (c) { add.push(p); col.push(r / c, gg / c, b / c); } }
    if (!add.length) break;
    for (let i = 0; i < add.length; i++) { const p = add[i]; d[p * 4] = col[i * 3]; d[p * 4 + 1] = col[i * 3 + 1]; d[p * 4 + 2] = col[i * 3 + 2]; fm[p] = 1; }
  }
  for (let p = 0; p < n; p++) if (!fm[p]) { d[p * 4] = v.avg[0]; d[p * 4 + 1] = v.avg[1]; d[p * 4 + 2] = v.avg[2]; }
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(id, 0, 0); return c;
}
async function reconstruct() {
  const N = +$('res').value, H = 2, A = {};
  ['front', 'back', 'sideR', 'sideL'].forEach(k => { if (V[k]) A[k] = Object.assign({ key: k }, V[k]); });
  if ($('usetop').checked && V.top) A.top = Object.assign({ key: 'top' }, V.top);
  if (!A.sideR && A.sideL) A.sideR = mirrorView(A.sideL, 'sideR'); else if (!A.sideL && A.sideR) A.sideL = mirrorView(A.sideR, 'sideL');
  const views = Object.values(A), nonTop = views.filter(v => v.key !== 'top');
  nonTop.forEach(v => { const b = v.mask; v.s = H / (b.y1 - b.y0 + 1); v.cx = (b.x0 + b.x1 + 1) / 2; v.y0 = b.y0; });
  const fb = A.front || A.back, Wx = Math.max(...['front', 'back'].filter(k => A[k]).map(k => (A[k].mask.x1 - A[k].mask.x0 + 1) * A[k].s));
  if (A.top) { const b = A.top.mask; A.top.s = (fb.mask.x1 - fb.mask.x0 + 1) * fb.s / (b.x1 - b.x0 + 1); A.top.cx = (b.x0 + b.x1 + 1) / 2; A.top.cy = (b.y0 + b.y1 + 1) / 2; }
  const sv = A.sideR; const Dz = sv ? (sv.mask.x1 - sv.mask.x0 + 1) * sv.s : (A.top ? (A.top.mask.y1 - A.top.mask.y0 + 1) * A.top.s : 0.55 * Wx);
  A.front && (A.front.map = (x, y, z) => [A.front.cx + x / A.front.s, A.front.y0 + (H - y) / A.front.s]);
  A.back && (A.back.map = (x, y, z) => [A.back.cx - x / A.back.s, A.back.y0 + (H - y) / A.back.s]);
  A.sideR && (A.sideR.map = (x, y, z) => [A.sideR.cx + z / A.sideR.s, A.sideR.y0 + (H - y) / A.sideR.s]);
  A.sideL && (A.sideL.map = (x, y, z) => [A.sideL.cx - z / A.sideL.s, A.sideL.y0 + (H - y) / A.sideL.s]);
  A.top && (A.top.map = (x, y, z) => [A.top.cx + x / A.top.s, A.top.cy + z / A.top.s]);
  const vs = H / N, pad = 3, nx = Math.ceil(Wx / vs) + 2 * pad + 1, ny = N + 2 * pad + 1, nz = Math.ceil(Dz / vs) + 2 * pad + 1, o = [-Wx / 2 - pad * vs, -pad * vs, -Dz / 2 - pad * vs];
  st('Carving the solid from silhouettes…', 10); await tick();
  const carve = views.filter(v => !v.virt), occ = new Uint8Array(nx * ny * nz);
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const wx = o[0] + i * vs, wy = o[1] + j * vs, wz = o[2] + k * vs; let ok = 1;
    for (let q = 0; q < carve.length; q++) { const v = carve[q], pp = v.map(wx, wy, wz), px = Math.round(pp[0]), py = Math.round(pp[1]); if (px < 0 || py < 0 || px >= v.w || py >= v.h || !v.mask.m[py * v.w + px]) { ok = 0; break; } }
    occ[i + j * nx + k * nx * ny] = ok;
  }
  views.forEach(v => v.zb = zbuffer(occ, nx, ny, nz, DIR[v.key], o, vs));
  st('Meshing…', 35); await tick();
  const f0 = new Float32Array(occ.length); for (let i = 0; i < occ.length; i++) f0[i] = occ[i];
  let f = f0; for (let i = 0; i < +$('msm').value; i++) f = blur3(f, nx, ny, nz);
  const sn = surfaceNets(f, nx, ny, nz, 0.5), NV = sn.pos.length / 3, nT = sn.tris.length / 3;
  if (!nT) { st('Nothing to build — the background clean removed the subject. Lower “Clean BG”.'); return; }
  const VN = new Float32Array(NV * 3), cl = (q, m) => Math.max(1, Math.min(m - 2, q));
  for (let i = 0; i < NV; i++) {
    const x = cl(Math.round(sn.pos[i * 3]), nx), y = cl(Math.round(sn.pos[i * 3 + 1]), ny), z = cl(Math.round(sn.pos[i * 3 + 2]), nz), b = x + y * nx + z * nx * ny;
    let gx = f[b + 1] - f[b - 1], gy = f[b + nx] - f[b - nx], gz = f[b + nx * ny] - f[b - nx * ny]; const l = Math.hypot(gx, gy, gz) || 1;
    VN[i * 3] = -gx / l; VN[i * 3 + 1] = -gy / l; VN[i * 3 + 2] = -gz / l || 0;
  }
  st('Building texture atlas from your photos…', 55); await tick();
  const tiles = views.map(prepTex), cw = Math.max(...views.map(v => v.w)), ch = Math.max(...views.map(v => v.h)), cols = 3, rows = Math.ceil((views.length + 1) / 3);
  const AW = cols * cw, AH = rows * ch, sc = Math.min(1, 4096 / Math.max(AW, AH));
  const base = document.createElement('canvas'); base.width = Math.round(AW * sc); base.height = Math.round(AH * sc); const bg = base.getContext('2d');
  bg.fillStyle = '#808080'; bg.fillRect(0, 0, base.width, base.height);
  let ar = 0, ag = 0, ab = 0; views.forEach((v, i) => { bg.drawImage(tiles[i], (i % cols) * cw * sc, ((i / cols) | 0) * ch * sc, v.w * sc, v.h * sc); v.cell = [(i % cols) * cw, ((i / cols) | 0) * ch]; ar += v.avg[0]; ag += v.avg[1]; ab += v.avg[2]; });
  const fi = views.length, fx = (fi % cols) * cw, fy = ((fi / cols) | 0) * ch;
  bg.fillStyle = 'rgb(' + (ar / views.length | 0) + ',' + (ag / views.length | 0) + ',' + (ab / views.length | 0) + ')'; bg.fillRect(fx * sc, fy * sc, 32, 32);
  const P3 = new Float32Array(nT * 9), N3 = new Float32Array(nT * 9), UV = new Float32Array(nT * 6), cs = [0, 0, 0], tmp = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const usage = {}; let hidden = 0;
  for (let t = 0; t < nT; t++) {
    let ia = sn.tris[t * 3], ib = sn.tris[t * 3 + 1], ic = sn.tris[t * 3 + 2];
    const W = id => [o[0] + sn.pos[id * 3] * vs, o[1] + sn.pos[id * 3 + 1] * vs, o[2] + sn.pos[id * 3 + 2] * vs];
    let pa = W(ia), pb = W(ib), pc = W(ic);
    const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]], gn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    let nvx = VN[ia * 3] + VN[ib * 3] + VN[ic * 3], nvy = VN[ia * 3 + 1] + VN[ib * 3 + 1] + VN[ic * 3 + 1], nvz = VN[ia * 3 + 2] + VN[ib * 3 + 2] + VN[ic * 3 + 2];
    if (gn[0] * nvx + gn[1] * nvy + gn[2] * nvz < 0) { const q = ib; ib = ic; ic = q; const pq = pb; pb = pc; pc = pq; }
    const nl = Math.hypot(nvx, nvy, nvz) || 1; nvx /= nl; nvy /= nl; nvz /= nl;
    const cen = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
    let best = -1, bs = 0.15;
    for (let q = 0; q < views.length; q++) {
      const v = views[q], d = DIR[v.key], s = -(nvx * d[0] + nvy * d[1] + nvz * d[2]); if (s <= bs) continue;
      const Z = v.zb, g = [(cen[0] - o[0]) / vs, (cen[1] - o[1]) / vs, (cen[2] - o[2]) / vs], u = Math.round(g[Z.b0]), w2 = Math.round(g[Z.b1]);
      if (u < 0 || w2 < 0 || u >= Z.nu || w2 >= Z.nv) continue;
      const mp = v.map(cen[0], cen[1], cen[2]), qx = Math.round(mp[0]), qy = Math.round(mp[1]); if (qx < 0 || qy < 0 || qx >= v.w || qy >= v.h || !v.core[qy * v.w + qx]) continue;
      if (Z.sg * cen[Z.a] <= Z.zb[u + w2 * Z.nu] + 3 * vs) { best = q; bs = s; }
    }
    const ord = [[ia, pa], [ib, pb], [ic, pc]];
    for (let k = 0; k < 3; k++) {
      const vid = ord[k][0], p = ord[k][1], at = t * 9 + k * 3;
      P3[at] = p[0]; P3[at + 1] = p[1]; P3[at + 2] = p[2]; N3[at] = VN[vid * 3]; N3[at + 1] = VN[vid * 3 + 1]; N3[at + 2] = VN[vid * 3 + 2];
      if (best >= 0) { const v = views[best], m = v.map(p[0], p[1], p[2]); UV[t * 6 + k * 2] = (v.cell[0] + m[0]) / AW; UV[t * 6 + k * 2 + 1] = (v.cell[1] + m[1]) / AH; }
      else { UV[t * 6 + k * 2] = (fx + 16) / AW; UV[t * 6 + k * 2 + 1] = (fy + 16) / AH; }
    }
    if (best >= 0) usage[views[best].key] = (usage[views[best].key] || 0) + 1; else hidden++;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P3, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N3, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  const out = document.createElement('canvas'); out.width = base.width; out.height = base.height;
  const pnt = document.createElement('canvas'); pnt.width = base.width; pnt.height = base.height;
  const t = new THREE.CanvasTexture(out); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 8; t.userData.mimeType = 'image/jpeg';
  tex = { base, out, pnt, t, pc: pnt.getContext('2d'), upd() { applyTex(); t.needsUpdate = true; } };
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, metalness: 0 }); mat.name = 'Surface';
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'Model'; mode = 'solid';
  setModel(mesh, true, false); applyTex(); t.needsUpdate = true;
  st('Done: ' + Math.round(nT / 1000) + 'k triangles from ' + carve.length + ' silhouettes' + (hidden ? ' · ' + Math.round(100 * hidden / nT) + '% of the surface is hidden in every photo (filled with average colour — paint it or add views)' : '') + '.', 100);
}
function applyTex() {
  if (!tex) return; const g = tex.out.getContext('2d'); g.clearRect(0, 0, tex.out.width, tex.out.height);
  g.filter = 'hue-rotate(' + $('th').value + 'deg) saturate(' + $('ts').value + ') brightness(' + $('tb').value + ') contrast(' + $('tc').value + ')';
  g.drawImage(tex.base, 0, 0); g.filter = 'none'; g.drawImage(tex.pnt, 0, 0);
}
['th', 'ts', 'tb', 'tc'].forEach(id => $(id).addEventListener('input', () => { if (tex) tex.upd(); }));
$('pre').onchange = () => { const a = $('pre').value.split(','); mats.forEach(m => { if (!m.color) return; m.color.set(a[2] || '#ffffff'); m.roughness = a[0] === '' ? 0.75 : +a[0]; m.metalness = a[1] === undefined ? 0 : +a[1]; }); syncCards(); };
$('pclr').onclick = () => { if (tex) { tex.pc.clearRect(0, 0, tex.pnt.width, tex.pnt.height); tex.upd(); } };
let painting = false;
function paintAt(e) {
  if (!tex || !root) return; const r = cv.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
  const h = rc.intersectObject(root, true)[0]; if (!h || !h.uv) return;
  const g = tex.pc; g.globalAlpha = +$('pa').value; g.fillStyle = $('pcol').value; g.beginPath(); g.arc(h.uv.x * tex.pnt.width, h.uv.y * tex.pnt.height, +$('psz').value * tex.pnt.width / 3072, 0, 6.2832); g.fill(); g.globalAlpha = 1; tex.upd();
}
$('paint').onchange = () => { controls.enabled = !$('paint').checked; if ($('paint').checked) { controls.autoRotate = false; $('rot').checked = false; } };
cv.addEventListener('pointerdown', e => { if ($('paint').checked && tex) { painting = true; paintAt(e); } });
cv.addEventListener('pointermove', e => { if (painting) paintAt(e); });
addEventListener('pointerup', () => painting = false);

// ================= single photo: depth relief =================
let depther = null;
function lumDepth() {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.max(8, Math.round(256 * img.h / img.w));
  const g = c.getContext('2d'); g.drawImage(img.canvas, 0, 0, c.width, c.height);
  const px = g.getImageData(0, 0, c.width, c.height).data, d = new Float32Array(c.width * c.height);
  for (let i = 0; i < d.length; i++) d[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  return { data: d, w: c.width, h: c.height };
}
async function estimateDepth() {
  if (P.get('fakedepth')) return lumDepth();
  try {
    st('Loading depth model (one-time download, then cached)…', 4);
    const T = await import('/vendor/transformers/transformers.web.min.js');
    T.env.allowLocalModels = true; T.env.localModelPath = '/models/';
    T.env.backends.onnx.wasm.wasmPaths = '/vendor/ort/';
    if (!depther) depther = await T.pipeline('depth-estimation', 'Xenova/depth-anything-small-hf', { dtype: 'q8',
      progress_callback: p => { if (p.status === 'progress' && p.progress != null) st('Downloading depth model… ' + Math.round(p.progress) + '%', 4 + p.progress * 0.6); } });
    st('Estimating depth…', 70);
    const out = await depther(img.uri), d = out.depth, ch = d.channels || 1, n = d.width * d.height, a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = d.data[i * ch] / 255;
    return { data: a, w: d.width, h: d.height };
  } catch (e) {
    console.warn(e); st('Depth model unavailable (' + (e.message || e) + ') — using brightness as depth.', 80);
    return lumDepth();
  }
}
$('go').onclick = async () => {
  $('go').disabled = true;
  try {
    if (canSolid()) await reconstruct();
    else if (V.front) { img = V.front; img.uri = img.uri || img.canvas.toDataURL('image/jpeg', 0.92); depth = await estimateDepth(); normalise(depth); autoThreshold(depth); mode = 'relief'; tex = null; build(); }
  } catch (e) { console.error(e); st('Failed: ' + (e.message || e)); }
  $('go').disabled = false;
};
function normalise(d) { const s = Float32Array.from(d.data).sort(), lo = s[Math.floor(s.length * 0.02)], hi = s[Math.floor(s.length * 0.98)] || 1, r = Math.max(1e-4, hi - lo); for (let i = 0; i < d.data.length; i++) d.data[i] = Math.min(1, Math.max(0, (d.data[i] - lo) / r)); }
function autoThreshold(d) {
  const h = new Array(256).fill(0); d.data.forEach(v => h[Math.min(255, v * 255 | 0)]++);
  let tot = d.data.length, sum = 0; for (let i = 0; i < 256; i++) sum += i * h[i];
  let sb = 0, wb = 0, best = 0, th = 90; for (let i = 0; i < 256; i++) { wb += h[i]; if (!wb) continue; const wf = tot - wb; if (!wf) break; sb += i * h[i]; const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) ** 2; if (v > best) { best = v; th = i; } }
  $('thr').value = (th / 255).toFixed(2);
}
function build() {
  if (!img || !depth) return;
  const gx = +$('det').value, gy = Math.max(8, Math.round(gx * img.h / img.w)), nx = gx + 1, ny = gy + 1;
  const flip = $('inv').checked, str = +$('str').value, thk = +$('thk').value, thr = +$('thr').value, cut = $('cut').checked, sm = +$('smo').value, fm = img.mask, hasM = !!fm && cut;
  let d = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const fx = i / gx * (depth.w - 1), fy = j / gy * (depth.h - 1), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(depth.w - 1, x0 + 1), y1 = Math.min(depth.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0, D = depth.data, w = depth.w;
    const v = (D[y0 * w + x0] * (1 - tx) + D[y0 * w + x1] * tx) * (1 - ty) + (D[y1 * w + x0] * (1 - tx) + D[y1 * w + x1] * tx) * ty;
    d[j * nx + i] = flip ? 1 - v : v;
  }
  for (let k = 0; k < sm; k++) { const o = new Float32Array(d); for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { let s = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += o[(j + b) * nx + i + a]; d[j * nx + i] = s / 9; } }
  const keep = new Uint8Array(gx * gy), W = 2 * Math.min(img.w / img.h, 1.6), H = W * img.h / img.w;
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) keep[j * gx + i] = hasM ? fm.m[Math.min(img.h - 1, Math.round((j + 0.5) / gy * img.h)) * img.w + Math.min(img.w - 1, Math.round((i + 0.5) / gx * img.w))] : (!cut || (d[j * nx + i] > thr && d[j * nx + i + 1] > thr && d[(j + 1) * nx + i] > thr && d[(j + 1) * nx + i + 1] > thr)) ? 1 : 0;
  const pos = [], uv = [], fIdx = [], bIdx = [];
  const px = i => (i / gx - 0.5) * W, py = j => (0.5 - j / gy) * H, zf = (i, j) => ((cut && !hasM) ? Math.max(0, d[j * nx + i] - thr) / Math.max(0.05, 1 - thr) : d[j * nx + i]) * str;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { pos.push(px(i), py(j), zf(i, j)); uv.push(i / gx, 1 - j / gy); }
  const Vn = nx * ny; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { pos.push(px(i), py(j), -thk); uv.push(i / gx, 1 - j / gy); }
  const F = (i, j) => j * nx + i;
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) if (keep[j * gx + i]) {
    const a = F(i, j), b = F(i + 1, j), c = F(i + 1, j + 1), e = F(i, j + 1);
    fIdx.push(a, e, b, b, e, c); bIdx.push(Vn + a, Vn + b, Vn + e, Vn + b, Vn + c, Vn + e);
    const nb = (ii, jj) => ii >= 0 && jj >= 0 && ii < gx && jj < gy && keep[jj * gx + ii];
    const wall = (p, q) => { const n0 = pos.length / 3; pos.push(pos[p * 3], pos[p * 3 + 1], pos[p * 3 + 2], pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2], pos[(Vn + q) * 3], pos[(Vn + q) * 3 + 1], pos[(Vn + q) * 3 + 2], pos[(Vn + p) * 3], pos[(Vn + p) * 3 + 1], pos[(Vn + p) * 3 + 2]); for (let k = 0; k < 4; k++) uv.push(0, 0); bIdx.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3); };
    if (!nb(i, j - 1)) wall(a, b); if (!nb(i + 1, j)) wall(b, c); if (!nb(i, j + 1)) wall(c, e); if (!nb(i - 1, j)) wall(e, a);
  }
  if (!fIdx.length) { st('Nothing left after cut-out — lower “Cut level”.'); return; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(fIdx.concat(bIdx)); geo.addGroup(0, fIdx.length, 0); geo.addGroup(fIdx.length, bIdx.length, 1); geo.computeVertexNormals();
  const tx = new THREE.CanvasTexture(img.canvas); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
  const m0 = new THREE.MeshStandardMaterial({ map: tx, roughness: .65, metalness: 0, side: THREE.DoubleSide }); m0.name = 'Surface';
  const m1 = new THREE.MeshStandardMaterial({ color: '#2a3144', roughness: .8, side: THREE.DoubleSide }); m1.name = 'Back & sides';
  const old = mats.map(m => ({ n: m.name, c: m.color.clone(), r: m.roughness, mt: m.metalness }));
  const mesh = new THREE.Mesh(geo, [m0, m1]); mesh.name = 'Model';
  const keepView = !!root && !fromGLTF; setModel(mesh, false, keepView);
  old.forEach(o => { const m = mats.find(x => x.name === o.n); if (m && o.n !== 'Surface') { m.color.copy(o.c); m.roughness = o.r; m.metalness = o.mt; } }); syncCards();
  st('3D relief ready — add side / back photos for a true 3D solid.', 100);
}
let rb; ['str', 'thk', 'smo', 'det', 'cut', 'thr', 'inv'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(rb); rb = setTimeout(() => { if (mode === 'relief') build(); }, 120); }));
let rb2; ['res', 'msm'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(rb2); rb2 = setTimeout(() => { if (mode === 'solid' && canSolid()) $('go').click(); }, 300); }));

// ================= model + materials =================
function setModel(obj, gltf, keepView) {
  if (root) { scene.remove(root); root.traverse(o => o.geometry && o.geometry.dispose()); }
  fromGLTF = gltf; root = new THREE.Group(); root.add(obj); scene.add(root);
  const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()), s = 2.2 / Math.max(sz.x, sz.y, sz.z);
  obj.scale.setScalar(s); obj.position.set(-c.x * s, -b.min.y * s, -c.z * s);
  if (!keepView) { controls.target.set(0, sz.y * s * 0.5, 0); camera.position.set(2.4, 1.2 + sz.y * s * .4, 3.6); controls.update(); }
  const set = new Set(); root.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => set.add(m)); });
  mats = [...set]; renderCards(); $('wire').checked = false;
}
function renderCards() {
  const box = $('mats'); box.innerHTML = '';
  const all = document.createElement('div'); all.className = 'card';
  all.innerHTML = '<b>Whole model</b><div class="f">Tint<input type="color" value="#ffffff" id="alltint"></div><div class="sw" id="swatches"></div>'; box.appendChild(all);
  ['#ffffff', '#e53935', '#1e66d0', '#1fa35c', '#f2b01e', '#8e44ad', '#222222'].forEach(c => { const i = document.createElement('i'); i.style.background = c; i.onclick = () => { mats.forEach(m => m.color && m.color.set(c)); syncCards(); }; all.querySelector('#swatches').appendChild(i); });
  all.querySelector('#alltint').oninput = e => { mats.forEach(m => m.color && m.color.set(e.target.value)); syncCards(); };
  mats.forEach((m, i) => {
    if (m.map && !m.userData.origMap) m.userData.origMap = m.map;
    const d = document.createElement('div'); d.className = 'card'; d.id = 'mc' + i;
    d.innerHTML = '<b>' + (m.name || 'Material ' + (i + 1)) + '</b><div class="f">Colour<input type="color" data-k="c"></div>' +
      (m.metalness !== undefined ? '<div class="f">Metal<input type="range" min="0" max="1" step=".01" data-k="m"></div><div class="f">Rough<input type="range" min="0" max="1" step=".01" data-k="r"></div>' : '') +
      '<div class="row"><button class="mini" data-k="t">Upload texture</button><button class="mini" data-k="x">Remove texture</button>' + (m.userData.origMap ? '<button class="mini" data-k="o">Original</button>' : '') + '</div>';
    d.onclick = () => select(m);
    d.querySelectorAll('[data-k]').forEach(el => { const k = el.dataset.k;
      if (k === 'c') el.oninput = () => m.color.set(el.value);
      if (k === 'm') el.oninput = () => m.metalness = +el.value;
      if (k === 'r') el.oninput = () => m.roughness = +el.value;
      if (k === 't') el.onclick = () => { texTarget = m; $('texf').click(); };
      if (k === 'x') el.onclick = () => { m.map = null; m.needsUpdate = true; };
      if (k === 'o') el.onclick = () => { m.map = m.userData.origMap; m.needsUpdate = true; }; });
    box.appendChild(d);
  }); syncCards();
}
function syncCards() { mats.forEach((m, i) => { const d = $('mc' + i); if (!d) return; const c = d.querySelector('[data-k=c]'); if (c && m.color) c.value = '#' + m.color.getHexString(); const mm = d.querySelector('[data-k=m]'), rr = d.querySelector('[data-k=r]'); if (mm) mm.value = m.metalness; if (rr) rr.value = m.roughness; }); }
$('texf').onchange = () => { const f = $('texf').files[0]; if (!f || !texTarget) return;
  new THREE.TextureLoader().load(URL.createObjectURL(f), t => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = !fromGLTF; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; texTarget.map = t; texTarget.color.set('#ffffff'); texTarget.needsUpdate = true; syncCards(); }); $('texf').value = ''; };
function select(m) { mats.forEach((x, i) => { const d = $('mc' + i); if (d) d.classList.toggle('sel', x === m); }); const d = $('mc' + mats.indexOf(m)); if (d) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
let down = null; cv.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
cv.addEventListener('pointerup', e => { if ($('paint').checked || !down || !root || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = cv.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
  const h = rc.intersectObject(root, true)[0]; if (h) select(Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex || 0] : h.object.material); });

function loadGLB(url) { st('Loading model…'); new GLTFLoader().load(url, g => { mode = 'glb'; tex = null; setModel(g.scene, true); st('Model ready — click a part to recolour it.', 100); }, null, e => st('Could not load model: ' + (e.message || e))); }
$('openglb').onclick = () => $('glbf').click();
$('glbf').onchange = () => { const f = $('glbf').files[0]; if (f) loadGLB(URL.createObjectURL(f)); };

// ================= scene controls =================
$('bg').oninput = e => scene.background = new THREE.Color(e.target.value);
$('exp').oninput = e => renderer.toneMappingExposure = +e.target.value;
$('rot').onchange = e => controls.autoRotate = e.target.checked;
$('wire').onchange = e => mats.forEach(m => m.wireframe = e.target.checked);
controls.addEventListener('start', () => { controls.autoRotate = false; $('rot').checked = false; });
const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
$('shot').onclick = () => { renderer.render(scene, camera); cv.toBlob(b => dl(b, 'model.png')); };
$('exp3d').onclick = () => { if (!root) return; new GLTFExporter().parse(root, buf => dl(new Blob([buf], { type: 'model/gltf-binary' }), 'model.glb'), () => st('Export failed'), { binary: true }); };
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// test hook: ?front=/test/a.png&back=...&sideR=...&sideL=...&top=...&usetop=1&cam=front|back|side|top|3q
(async () => {
  const ks = SLOTS.map(s => s[0]).filter(k => P.get(k) && P.get(k).startsWith('/')); if (!ks.length) return;
  if (P.get('usetop')) $('usetop').checked = true; if (P.get('tol')) $('tol').value = P.get('tol'); if (P.get('res')) $('res').value = P.get('res');
  await Promise.all(ks.map(k => new Promise(r => loadSlot(k, P.get(k), r))));
  if (P.get('fakedepth') || canSolid() || V.front) { await new Promise(r => { $('go').click(); const iv = setInterval(() => { if (!$('go').disabled) { clearInterval(iv); r(); } }, 200); }); }
  const c = P.get('cam'); if (c) { controls.autoRotate = false; const t = controls.target, R = 4.2, y = t.y;
    const pos = { front: [0, y, R], back: [0, y, -R], side: [R, y, 0], left: [-R, y, 0], top: [0, y + R, 0.01], '3q': [2.6, y + 0.8, 3.4], '3qb': [-2.6, y + 0.8, -3.4] }[c]; if (pos) { camera.position.set(pos[0], pos[1], pos[2]); controls.update(); } }
  document.title = 'READY';
})();
</script></body></html>`;
