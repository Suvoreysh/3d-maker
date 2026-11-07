// Image -> 3D web app.  Run:  npm i express three  &&  MESHY_API_KEY=xxxx node server.js   (no key = demo relief mode)
const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const KEY = process.env.MESHY_API_KEY || '';
const BASE = process.env.MESHY_BASE || 'https://api.meshy.ai';
const cache = new Map(); // task id -> GLB buffer

const app = express();
app.use(express.json({ limit: '30mb' }));
try {
  const main = require.resolve('three'); // .../three/build/three.cjs
  app.use('/vendor/three', express.static(path.resolve(path.dirname(main), '..')));
} catch (e) { console.warn('run: npm i three'); }
if (process.env.SAMPLE_GLB) app.get('/sample.glb', (q, r) => r.type('model/gltf-binary').send(fs.readFileSync(process.env.SAMPLE_GLB)));

const meshy = async (p, opt = {}) => {
  const r = await fetch(BASE + p, { ...opt, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' } });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { j = { message: t }; }
  if (!r.ok) { const er = new Error(j.message || ('HTTP ' + r.status)); er.status = r.status; throw er; }
  return j;
};

app.get('/api/config', (q, r) => r.json({ mode: KEY ? 'meshy' : 'demo' }));

app.post('/api/generate', async (req, res) => {
  try {
    if (!KEY) return res.status(400).json({ error: 'No MESHY_API_KEY set on the server (demo mode only).' });
    const { image, texture = true, pbr = true } = req.body || {};
    if (!/^data:image\/(png|jpe?g);base64,/.test(image || '')) return res.status(400).json({ error: 'Send a PNG/JPEG data URI.' });
    const j = await meshy('/openapi/v1/image-to-3d', { method: 'POST', body: JSON.stringify({ image_url: image, should_texture: !!texture, enable_pbr: !!(texture && pbr) }) });
    res.json({ id: j.result });
  } catch (e) { res.status(e.status || 500).json({ error: e.status === 402 ? 'Not enough Meshy credits.' : e.message }); }
});

app.get('/api/status/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[\w-]+$/.test(id)) return res.status(400).json({ error: 'bad id' });
    if (cache.has(id)) return res.json({ status: 'SUCCEEDED', progress: 100, modelUrl: '/api/model/' + id });
    const t = await meshy('/openapi/v1/image-to-3d/' + id);
    if (t.status === 'SUCCEEDED') {
      const g = await fetch(t.model_urls.glb);
      if (!g.ok) throw new Error('Could not download model');
      cache.set(id, Buffer.from(await g.arrayBuffer()));
      return res.json({ status: 'SUCCEEDED', progress: 100, modelUrl: '/api/model/' + id });
    }
    res.json({ status: t.status, progress: t.progress || 0, error: t.task_error && t.task_error.message });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.get('/api/model/:id', (req, res) => {
  const b = cache.get(req.params.id);
  if (!b) return res.status(404).end();
  res.type('model/gltf-binary').send(b);
});

app.get('/', (q, r) => r.type('html').send(HTML));
app.listen(PORT, () => console.log('http://localhost:' + PORT + '  mode=' + (KEY ? 'meshy' : 'demo')));

const HTML = String.raw`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Image to 3D Studio</title>
<style>
:root{--bg:#0b0f17;--pn:#111826;--ln:#1f2a3d;--tx:#e8edf5;--mu:#8795ad;--ac:#4aa3ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;height:100vh;display:grid;grid-template-columns:290px 1fr 310px;overflow:hidden}
aside{background:var(--pn);padding:16px;overflow:auto;border-right:1px solid var(--ln)}aside.r{border-right:0;border-left:1px solid var(--ln)}
h1{font-size:17px;margin:0 0 14px}h2{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mu);margin:20px 0 8px}
.drop{border:1.5px dashed #34435e;border-radius:12px;padding:16px;text-align:center;color:var(--mu);cursor:pointer;min-height:120px;display:grid;place-items:center}
.drop.hot{border-color:var(--ac);color:var(--tx)}.drop img{max-width:100%;max-height:170px;border-radius:8px}
button,.btn{font:inherit;color:var(--tx);background:#1a2335;border:1px solid #2b3a55;border-radius:9px;padding:9px 12px;cursor:pointer}
button:hover{background:#223049}button.p{background:var(--ac);border-color:var(--ac);color:#04101f;font-weight:600}button:disabled{opacity:.45;cursor:default}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.row>*{flex:1}
label.ck{display:flex;gap:8px;align-items:center;margin-top:8px;color:var(--mu)}
#st{margin-top:10px;color:var(--mu);font-size:13px;min-height:18px}.bar{height:4px;background:#1a2335;border-radius:4px;margin-top:8px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--ac);transition:.3s}
main{position:relative}#cv{width:100%;height:100%;display:block}
.hud{position:absolute;left:14px;bottom:12px;color:var(--mu);font-size:12px;pointer-events:none}
.card{background:#0e1522;border:1px solid var(--ln);border-radius:12px;padding:12px;margin-bottom:10px}.card.sel{border-color:var(--ac)}
.card b{display:block;margin-bottom:8px;font-weight:600}.f{display:grid;grid-template-columns:70px 1fr;gap:8px;align-items:center;margin:6px 0;color:var(--mu);font-size:12px}
input[type=color]{width:100%;height:30px;border:1px solid #2b3a55;border-radius:7px;background:none;padding:0}input[type=range]{width:100%}
.mini{padding:6px 9px;font-size:12px}.sw{display:flex;gap:6px;margin-top:6px}.sw i{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid #0000;box-shadow:inset 0 0 0 1px #fff3}
@media(max-width:900px){body{grid-template-columns:1fr;grid-template-rows:auto 55vh auto;overflow:auto;height:auto}aside{border:0}}
</style></head><body>
<aside>
<h1>Image → 3D Studio</h1>
<div class="drop" id="drop"><span>Drop an image here<br>or click to choose</span></div>
<input type="file" id="file" accept="image/*" hidden>
<label class="ck"><input type="checkbox" id="tex" checked> Generate textures (PBR)</label>
<div class="row"><button class="p" id="go" disabled>Generate 3D</button></div>
<div class="row"><button id="relief" disabled>Quick relief (offline)</button><button id="openglb">Open .glb</button></div>
<input type="file" id="glbf" accept=".glb,.gltf" hidden>
<div class="bar"><i id="pr"></i></div><div id="st"></div>
<h2>Scene</h2>
<div class="f">Background<input type="color" id="bg" value="#0b0f17"></div>
<div class="f">Exposure<input type="range" id="exp" min="0.3" max="2" step="0.05" value="1"></div>
<label class="ck"><input type="checkbox" id="rot" checked> Auto-rotate</label>
<label class="ck"><input type="checkbox" id="wire"> Wireframe</label>
<div class="row"><button id="shot">Save PNG</button><button id="exp3d">Export GLB</button></div>
</aside>
<main><canvas id="cv"></canvas><div class="hud" id="hud">Click a part on the model to edit its material</div></main>
<aside class="r"><h2 style="margin-top:0">Parts &amp; materials</h2><div id="mats"><div style="color:var(--mu)">Generate or open a model to edit colours and textures.</div></div></aside>
<input type="file" id="texf" accept="image/*" hidden>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const $ = id => document.getElementById(id);
const cv = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0f17');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100); camera.position.set(2.6, 1.6, 3.4);
const controls = new OrbitControls(camera, cv); controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1.2; controls.target.set(0, 0.8, 0);
const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .0 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
function resize() { const m = cv.parentElement, w = m.clientWidth, h = m.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let root = null, fromGLTF = false, imgData = null, selMat = null, mats = [];
const st = (t, p) => { $('st').textContent = t || ''; if (p != null) $('pr').style.width = p + '%'; };

// ---- image input
const drop = $('drop'), file = $('file');
drop.onclick = () => file.click();
['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('hot'); }));
['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('hot'); }));
drop.addEventListener('drop', ev => { if (ev.dataTransfer.files[0]) readImage(ev.dataTransfer.files[0]); });
file.onchange = () => file.files[0] && readImage(file.files[0]);
function readImage(f) {
  const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => {
    const s = Math.min(1, 1024 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
    imgData = { uri: c.toDataURL('image/jpeg', 0.92), canvas: c, w: c.width, h: c.height };
    drop.innerHTML = ''; const t = new Image(); t.src = imgData.uri; drop.appendChild(t);
    $('go').disabled = false; $('relief').disabled = false; st('Image ready.');
  };
  im.src = url;
}

// ---- model handling
function clearRoot() { if (root) { scene.remove(root); root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } root = null; }
function setModel(obj, gltf) {
  clearRoot(); fromGLTF = gltf; root = new THREE.Group(); root.add(obj); scene.add(root);
  const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  const s = 2.2 / Math.max(sz.x, sz.y, sz.z); obj.scale.setScalar(s); obj.position.set(-c.x * s, -b.min.y * s, -c.z * s);
  controls.target.set(0, sz.y * s * 0.45, 0); camera.position.set(2.6, 1.4 + sz.y * s * .3, 3.4); controls.update();
  collectMaterials(); $('wire').checked = false;
}
function collectMaterials() {
  const set = new Set(); root.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => set.add(m)); });
  mats = [...set]; selMat = null; renderCards();
}
function renderCards() {
  const box = $('mats'); box.innerHTML = '';
  if (!mats.length) { box.textContent = 'No materials found.'; return; }
  const all = document.createElement('div'); all.className = 'card';
  all.innerHTML = '<b>Whole model</b><div class="f">Tint<input type="color" value="#ffffff" id="alltint"></div><div class="sw" id="swatches"></div>';
  box.appendChild(all);
  ['#ffffff', '#e53935', '#1e66d0', '#1fa35c', '#f2b01e', '#8e44ad', '#222222'].forEach(c => { const i = document.createElement('i'); i.style.background = c; i.onclick = () => { mats.forEach(m => m.color && m.color.set(c)); syncCards(); }; all.querySelector('#swatches').appendChild(i); });
  all.querySelector('#alltint').oninput = e => { mats.forEach(m => m.color && m.color.set(e.target.value)); syncCards(); };
  mats.forEach((m, i) => {
    const d = document.createElement('div'); d.className = 'card'; d.id = 'mc' + i;
    d.innerHTML = '<b>' + (m.name || 'Material ' + (i + 1)) + '</b>' +
      '<div class="f">Colour<input type="color" data-k="c"></div>' +
      (m.metalness !== undefined ? '<div class="f">Metal<input type="range" min="0" max="1" step=".01" data-k="m"></div><div class="f">Rough<input type="range" min="0" max="1" step=".01" data-k="r"></div>' : '') +
      '<div class="row"><button class="mini" data-k="t">Upload texture</button><button class="mini" data-k="x">Remove texture</button>' + (m.userData.origMap ? '<button class="mini" data-k="o">Original</button>' : '') + '</div>';
    if (m.map && !m.userData.origMap) m.userData.origMap = m.map;
    d.onclick = () => select(m);
    d.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      if (k === 'c') el.oninput = () => m.color.set(el.value);
      if (k === 'm') el.oninput = () => m.metalness = +el.value;
      if (k === 'r') el.oninput = () => m.roughness = +el.value;
      if (k === 't') el.onclick = () => { texTarget = m; $('texf').click(); };
      if (k === 'x') el.onclick = () => { m.map = null; m.needsUpdate = true; };
      if (k === 'o') el.onclick = () => { m.map = m.userData.origMap; m.needsUpdate = true; };
    });
    box.appendChild(d);
  });
  syncCards();
}
function syncCards() {
  mats.forEach((m, i) => { const d = $('mc' + i); if (!d) return; const c = d.querySelector('[data-k=c]'); if (c && m.color) c.value = '#' + m.color.getHexString();
    const mm = d.querySelector('[data-k=m]'), rr = d.querySelector('[data-k=r]'); if (mm) mm.value = m.metalness; if (rr) rr.value = m.roughness; });
}
let texTarget = null;
$('texf').onchange = () => {
  const f = $('texf').files[0]; if (!f || !texTarget) return;
  new THREE.TextureLoader().load(URL.createObjectURL(f), t => {
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = !fromGLTF; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    texTarget.map = t; texTarget.color.set('#ffffff'); texTarget.needsUpdate = true; syncCards();
  });
  $('texf').value = '';
};
function select(m) {
  selMat = m; mats.forEach((x, i) => { const d = $('mc' + i); if (d) d.classList.toggle('sel', x === m); });
  const d = $('mc' + mats.indexOf(m)); if (d) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
// click-to-pick part
let down = null;
cv.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
cv.addEventListener('pointerup', e => {
  if (!down || !root || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = cv.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera); const h = rc.intersectObject(root, true)[0];
  if (h) { const m = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex || 0] : h.object.material; select(m); }
});

// ---- loaders
function loadGLB(url) {
  st('Loading model…');
  new GLTFLoader().load(url, g => { setModel(g.scene, true); st('Model ready — click a part to recolour it.', 100); }, null, e => st('Could not load model: ' + (e.message || e)));
}
$('openglb').onclick = () => $('glbf').click();
$('glbf').onchange = () => { const f = $('glbf').files[0]; if (f) loadGLB(URL.createObjectURL(f)); };
const q = new URLSearchParams(location.search).get('glb'); if (q && q.startsWith('/')) loadGLB(q);

function buildRelief() {
  const W = imgData.w, H = imgData.h, asp = W / H, sx = 220, sy = Math.round(220 / asp);
  const c = document.createElement('canvas'); c.width = sx + 1; c.height = sy + 1; const g = c.getContext('2d'); g.drawImage(imgData.canvas, 0, 0, c.width, c.height);
  const px = g.getImageData(0, 0, c.width, c.height).data, hgt = new Float32Array(c.width * c.height);
  for (let i = 0; i < hgt.length; i++) hgt[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  const bl = new Float32Array(hgt.length);
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { let s = 0, n = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < c.width && yy < c.height) { s += hgt[yy * c.width + xx]; n++; } } bl[y * c.width + x] = s / n; }
  const w = 2 * Math.min(asp, 1.6), h = w / asp, geo = new THREE.PlaneGeometry(w, h, sx, sy), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, bl[i] * 0.45);
  geo.computeVertexNormals();
  const tex = new THREE.CanvasTexture(imgData.canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const surf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: .6, metalness: 0, name: 'Surface' })); surf.material.name = 'Surface';
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), new THREE.MeshStandardMaterial({ color: '#1b2233', roughness: .8 })); base.material.name = 'Base'; base.position.z = -0.04;
  const gp = new THREE.Group(); gp.add(surf, base); gp.rotation.x = -0.35;
  const wrap = new THREE.Group(); wrap.add(gp); setModel(wrap, false); st('Relief built from image brightness (offline preview).', 100);
}
$('relief').onclick = () => imgData && buildRelief();

let mode = 'demo'; fetch('/api/config').then(r => r.json()).then(j => { mode = j.mode; $('go').title = mode === 'demo' ? 'No API key on server: builds the offline relief instead' : ''; });
$('go').onclick = async () => {
  if (!imgData) return;
  if (mode === 'demo') { st('No MESHY_API_KEY set — using offline relief.'); return buildRelief(); }
  $('go').disabled = true; st('Uploading…', 3);
  try {
    let r = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: imgData.uri, texture: $('tex').checked, pbr: $('tex').checked }) });
    let j = await r.json(); if (!r.ok) throw new Error(j.error);
    const id = j.id;
    for (;;) {
      await new Promise(s => setTimeout(s, 3000));
      r = await fetch('/api/status/' + id); j = await r.json(); if (!r.ok) throw new Error(j.error);
      if (j.status === 'SUCCEEDED') { loadGLB(j.modelUrl); break; }
      if (j.status === 'FAILED' || j.status === 'CANCELED') throw new Error(j.error || j.status);
      st('Generating… ' + (j.progress || 0) + '%', j.progress || 5);
    }
  } catch (e) { st('Error: ' + e.message, 0); }
  $('go').disabled = false;
};

// ---- scene controls
$('bg').oninput = e => scene.background = new THREE.Color(e.target.value);
$('exp').oninput = e => renderer.toneMappingExposure = +e.target.value;
$('rot').onchange = e => controls.autoRotate = e.target.checked;
$('wire').onchange = e => mats.forEach(m => m.wireframe = e.target.checked);
controls.addEventListener('start', () => { controls.autoRotate = false; $('rot').checked = false; });
const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
$('shot').onclick = () => { renderer.render(scene, camera); cv.toBlob(b => dl(b, 'model.png')); };
$('exp3d').onclick = () => { if (!root) return; new GLTFExporter().parse(root, buf => dl(new Blob([buf], { type: 'model/gltf-binary' }), 'model.glb'), e => st('Export failed'), { binary: true }); };

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
</script></body></html>`;
