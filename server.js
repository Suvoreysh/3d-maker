// Image -> 3D Studio. 100% self-hosted: no API key, no cloud service.
// Depth is estimated in the browser by an open model (Depth Anything, via transformers.js).
// Run:  npm install  &&  npm start     then open http://localhost:3000
const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const nm = (...p) => path.join(__dirname, 'node_modules', ...p);
const app = express();
app.use('/vendor/three', express.static(nm('three')));
app.use('/vendor/transformers', express.static(nm('@huggingface', 'transformers', 'dist')));
app.use('/vendor/ort', express.static(nm('onnxruntime-web', 'dist')));
app.use('/vendor/ort-common', express.static(nm('onnxruntime-common', 'dist', 'esm')));
app.use('/models', express.static(path.join(__dirname, 'models'))); // optional: drop a local copy of the model here for fully offline use
if (process.env.TEST_ASSETS) app.use('/test', express.static(process.env.TEST_ASSETS));
app.get('/', (q, r) => r.type('html').send(HTML));
app.listen(PORT, () => console.log('Image -> 3D Studio: http://localhost:' + PORT));

const HTML = String.raw`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Image to 3D Studio</title>
<style>
:root{--bg:#0b0f17;--pn:#111826;--ln:#1f2a3d;--tx:#e8edf5;--mu:#8795ad;--ac:#4aa3ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;height:100vh;display:grid;grid-template-columns:300px 1fr 310px;overflow:hidden}
aside{background:var(--pn);padding:16px;overflow:auto;border-right:1px solid var(--ln)}aside.r{border-right:0;border-left:1px solid var(--ln)}
h1{font-size:17px;margin:0 0 4px}.sub{color:var(--mu);font-size:12px;margin-bottom:14px}h2{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mu);margin:20px 0 8px}
.drop{border:1.5px dashed #34435e;border-radius:12px;padding:14px;text-align:center;color:var(--mu);cursor:pointer;min-height:120px;display:grid;place-items:center}
.drop.hot{border-color:var(--ac);color:var(--tx)}.drop img{max-width:100%;max-height:170px;border-radius:8px}
button{font:inherit;color:var(--tx);background:#1a2335;border:1px solid #2b3a55;border-radius:9px;padding:9px 12px;cursor:pointer}
button:hover{background:#223049}button.p{background:var(--ac);border-color:var(--ac);color:#04101f;font-weight:600}button:disabled{opacity:.45;cursor:default}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.row>*{flex:1}
label.ck{display:flex;gap:8px;align-items:center;margin-top:8px;color:var(--mu)}
#st{margin-top:10px;color:var(--mu);font-size:13px;min-height:18px}.bar{height:4px;background:#1a2335;border-radius:4px;margin-top:8px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--ac);transition:.3s}
main{position:relative}#cv{width:100%;height:100%;display:block}
.hud{position:absolute;left:14px;bottom:12px;color:var(--mu);font-size:12px;pointer-events:none}
.card{background:#0e1522;border:1px solid var(--ln);border-radius:12px;padding:12px;margin-bottom:10px}.card.sel{border-color:var(--ac)}
.card b{display:block;margin-bottom:8px;font-weight:600}.f{display:grid;grid-template-columns:78px 1fr;gap:8px;align-items:center;margin:6px 0;color:var(--mu);font-size:12px}
input[type=color]{width:100%;height:30px;border:1px solid #2b3a55;border-radius:7px;background:none;padding:0}input[type=range]{width:100%}select{width:100%;background:#1a2335;color:var(--tx);border:1px solid #2b3a55;border-radius:7px;padding:6px}
.mini{padding:6px 9px;font-size:12px}.sw{display:flex;gap:6px;margin-top:6px}.sw i{width:22px;height:22px;border-radius:50%;cursor:pointer;box-shadow:inset 0 0 0 1px #fff3}
@media(max-width:900px){body{grid-template-columns:1fr;grid-template-rows:auto 55vh auto;overflow:auto;height:auto}aside{border:0}}
</style></head><body>
<aside>
<h1>Image → 3D Studio</h1><div class="sub">Runs on your machine. No API key.</div>
<div class="drop" id="drop"><span>Drop an image here<br>or click to choose</span></div>
<input type="file" id="file" accept="image/*" hidden>
<div class="row"><button class="p" id="go" disabled>Make 3D</button></div>
<div class="row"><button id="openglb">Open .glb</button></div>
<input type="file" id="glbf" accept=".glb,.gltf" hidden>
<div class="bar"><i id="pr"></i></div><div id="st"></div>
<h2>Shape</h2>
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
<aside class="r"><h2 style="margin-top:0">Parts &amp; materials</h2><div id="mats"><div style="color:var(--mu)">Make a 3D model or open a .glb to edit colours and textures.</div></div></aside>
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

let root = null, fromGLTF = false, img = null, depth = null, mats = [], texTarget = null;
const st = (t, p) => { $('st').textContent = t || ''; if (p != null) $('pr').style.width = p + '%'; };

// ---------- image input
const drop = $('drop'), file = $('file');
drop.onclick = () => file.click();
['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('hot'); }));
['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('hot'); }));
drop.addEventListener('drop', ev => { if (ev.dataTransfer.files[0]) readImage(URL.createObjectURL(ev.dataTransfer.files[0])); });
file.onchange = () => file.files[0] && readImage(URL.createObjectURL(file.files[0]));
function readImage(url, then) {
  const im = new Image();
  im.onload = () => {
    const s = Math.min(1, 1024 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
    img = { canvas: c, w: c.width, h: c.height, uri: c.toDataURL('image/jpeg', 0.92) }; depth = null;
    drop.innerHTML = ''; const t = new Image(); t.src = img.uri; drop.appendChild(t); $('go').disabled = false; st('Image ready.');
    if (then) then();
  };
  im.src = url;
}

// ---------- depth estimation (open model, runs in the browser)
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
  if (!img) return; $('go').disabled = true;
  depth = await estimateDepth(); normalise(depth); autoThreshold(depth);
  build(); $('go').disabled = false;
};
function normalise(d) { const s = Float32Array.from(d.data).sort(), lo = s[Math.floor(s.length * 0.02)], hi = s[Math.floor(s.length * 0.98)] || 1, r = Math.max(1e-4, hi - lo); for (let i = 0; i < d.data.length; i++) d.data[i] = Math.min(1, Math.max(0, (d.data[i] - lo) / r)); }
function autoThreshold(d) { // Otsu: separates near subject from far background
  const h = new Array(256).fill(0); d.data.forEach(v => h[Math.min(255, v * 255 | 0)]++);
  let tot = d.data.length, sum = 0; for (let i = 0; i < 256; i++) sum += i * h[i];
  let sb = 0, wb = 0, best = 0, th = 90; for (let i = 0; i < 256; i++) { wb += h[i]; if (!wb) continue; const wf = tot - wb; if (!wf) break; sb += i * h[i]; const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) ** 2; if (v > best) { best = v; th = i; } }
  $('thr').value = (th / 255).toFixed(2);
}

// ---------- 3D solid from image + depth
function build() {
  if (!img || !depth) return;
  const gx = +$('det').value, gy = Math.max(8, Math.round(gx * img.h / img.w)), nx = gx + 1, ny = gy + 1;
  const flip = $('inv').checked, str = +$('str').value, thk = +$('thk').value, thr = +$('thr').value, cut = $('cut').checked, sm = +$('smo').value;
  let d = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const fx = i / gx * (depth.w - 1), fy = j / gy * (depth.h - 1), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(depth.w - 1, x0 + 1), y1 = Math.min(depth.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0, D = depth.data, w = depth.w;
    const v = (D[y0 * w + x0] * (1 - tx) + D[y0 * w + x1] * tx) * (1 - ty) + (D[y1 * w + x0] * (1 - tx) + D[y1 * w + x1] * tx) * ty;
    d[j * nx + i] = flip ? 1 - v : v;
  }
  for (let k = 0; k < sm; k++) { const o = new Float32Array(d); for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { let s = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += o[(j + b) * nx + i + a]; d[j * nx + i] = s / 9; } }
  const keep = new Uint8Array(gx * gy), W = 2 * Math.min(img.w / img.h, 1.6), H = W * img.h / img.w;
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) keep[j * gx + i] = (!cut || (d[j * nx + i] > thr && d[j * nx + i + 1] > thr && d[(j + 1) * nx + i] > thr && d[(j + 1) * nx + i + 1] > thr)) ? 1 : 0;
  const pos = [], uv = [], fIdx = [], bIdx = [];
  const px = i => (i / gx - 0.5) * W, py = j => (0.5 - j / gy) * H, zf = (i, j) => (cut ? Math.max(0, d[j * nx + i] - thr) / Math.max(0.05, 1 - thr) : d[j * nx + i]) * str;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { pos.push(px(i), py(j), zf(i, j)); uv.push(i / gx, 1 - j / gy); }
  const V = nx * ny; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { pos.push(px(i), py(j), -thk); uv.push(i / gx, 1 - j / gy); }
  const F = (i, j) => j * nx + i;
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) if (keep[j * gx + i]) {
    const a = F(i, j), b = F(i + 1, j), c = F(i + 1, j + 1), e = F(i, j + 1);
    fIdx.push(a, e, b, b, e, c); bIdx.push(V + a, V + b, V + e, V + b, V + c, V + e);
    const nb = (ii, jj) => ii >= 0 && jj >= 0 && ii < gx && jj < gy && keep[jj * gx + ii];
    const wall = (p, q) => { const n0 = pos.length / 3; pos.push(pos[p * 3], pos[p * 3 + 1], pos[p * 3 + 2], pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2], pos[(V + q) * 3], pos[(V + q) * 3 + 1], pos[(V + q) * 3 + 2], pos[(V + p) * 3], pos[(V + p) * 3 + 1], pos[(V + p) * 3 + 2]); for (let k = 0; k < 4; k++) uv.push(0, 0); bIdx.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3); };
    if (!nb(i, j - 1)) wall(a, b); if (!nb(i + 1, j)) wall(b, c); if (!nb(i, j + 1)) wall(c, e); if (!nb(i - 1, j)) wall(e, a);
  }
  if (!fIdx.length) { st('Nothing left after cut-out — lower “Cut level”.'); return; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(fIdx.concat(bIdx)); geo.addGroup(0, fIdx.length, 0); geo.addGroup(fIdx.length, bIdx.length, 1); geo.computeVertexNormals();
  const tex = new THREE.CanvasTexture(img.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m0 = new THREE.MeshStandardMaterial({ map: tex, roughness: .65, metalness: 0, side: THREE.DoubleSide }); m0.name = 'Surface';
  const m1 = new THREE.MeshStandardMaterial({ color: '#2a3144', roughness: .8, side: THREE.DoubleSide }); m1.name = 'Back & sides';
  const old = mats.map(m => ({ n: m.name, c: m.color.clone(), r: m.roughness, mt: m.metalness }));
  const mesh = new THREE.Mesh(geo, [m0, m1]); mesh.name = 'Model';
  const keepView = !!root && !fromGLTF; setModel(mesh, false, keepView);
  old.forEach(o => { const m = mats.find(x => x.name === o.n); if (m && o.n !== 'Surface') { m.color.copy(o.c); m.roughness = o.r; m.metalness = o.mt; } }); syncCards();
  st('3D model ready — drag to orbit, click a part to edit it.', 100);
}
let rb; ['str', 'thk', 'smo', 'det', 'cut', 'thr', 'inv'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(rb); rb = setTimeout(build, 120); }));

// ---------- model + materials
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
cv.addEventListener('pointerup', e => { if (!down || !root || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = cv.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
  const h = rc.intersectObject(root, true)[0]; if (h) select(Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex || 0] : h.object.material); });

function loadGLB(url) { st('Loading model…'); new GLTFLoader().load(url, g => { setModel(g.scene, true); st('Model ready — click a part to recolour it.', 100); }, null, e => st('Could not load model: ' + (e.message || e))); }
$('openglb').onclick = () => $('glbf').click();
$('glbf').onchange = () => { const f = $('glbf').files[0]; if (f) loadGLB(URL.createObjectURL(f)); };

// ---------- scene controls
$('bg').oninput = e => scene.background = new THREE.Color(e.target.value);
$('exp').oninput = e => renderer.toneMappingExposure = +e.target.value;
$('rot').onchange = e => controls.autoRotate = e.target.checked;
$('wire').onchange = e => mats.forEach(m => m.wireframe = e.target.checked);
controls.addEventListener('start', () => { controls.autoRotate = false; $('rot').checked = false; });
const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
$('shot').onclick = () => { renderer.render(scene, camera); cv.toBlob(b => dl(b, 'model.png')); };
$('exp3d').onclick = () => { if (!root) return; new GLTFExporter().parse(root, buf => dl(new Blob([buf], { type: 'model/gltf-binary' }), 'model.glb'), () => st('Export failed'), { binary: true }); };
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// test hook: ?img=/test/x.jpg&fakedepth=1
const ti = P.get('img'); if (ti && ti.startsWith('/')) readImage(ti, () => $('go').click());
</script></body></html>`;
