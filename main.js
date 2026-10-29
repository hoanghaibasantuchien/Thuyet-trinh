import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ===== DEVICE ===== */
const isMobile =
  /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent) ||
  (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

const MAX_PIXELS = 1920 * 1080;

const QUALITY_LEVELS = [
  { name: 'Low',    pixelRatio: 0.60, bloom: false, bloomRes: 0.5,  scratchVis: 0.4 },
  { name: 'Medium', pixelRatio: 0.75, bloom: true,  bloomRes: 0.5,  scratchVis: 0.7 },
  { name: 'High',   pixelRatio: 0.90, bloom: true,  bloomRes: 0.75, scratchVis: 1.0 },
  { name: 'Ultra',  pixelRatio: 1.00, bloom: true,  bloomRes: 1.0,  scratchVis: 1.0 },
];
let currentQuality = isMobile ? 2 : 3;

/* ===== RENDERER / SCENE / CAMERA ===== */
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true
});
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3000);
const aspect0 = window.innerWidth / window.innerHeight;
camera.position.set(0, 7, aspect0 < 1 ? 34 : 24);
scene.add(camera);

/* ===== ORBIT ===== */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping   = true;
controls.dampingFactor   = 0.08;
controls.rotateSpeed     = isMobile ? 0.75 : 0.6;
controls.zoomSpeed       = 0.8;
controls.minDistance     = 4;
controls.maxDistance     = 120;
controls.enablePan       = false;
controls.autoRotate      = true;
controls.autoRotateSpeed = 0.55;
controls.target.set(0, 0, 0);
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

let idleTimer = null;
function pauseAutoRotate() {
  controls.autoRotate = false;
  clearTimeout(idleTimer);
}
function resumeAutoRotateSoon() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { controls.autoRotate = true; }, 2500);
}
renderer.domElement.addEventListener('touchstart', pauseAutoRotate, { passive: true });
renderer.domElement.addEventListener('touchend',   resumeAutoRotateSoon, { passive: true });
renderer.domElement.addEventListener('mousedown',  pauseAutoRotate);
window.addEventListener('mouseup', resumeAutoRotateSoon);

/* ===== COMPOSER ===== */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.0, 0.7, 0.15);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

/* ===== TEXTURES ===== */
function makeDotTexture() {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0,  'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1.0,  'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTexture() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(215,238,255,0.9)');
  g.addColorStop(0.32, 'rgba(130,180,255,0.38)');
  g.addColorStop(0.65, 'rgba(80,110,255,0.10)');
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const dotTexture  = makeDotTexture();
const glowTexture = makeGlowTexture();

/* ===== GALAXY ===== */
const galaxy = new THREE.Group();
scene.add(galaxy);

(function buildGalaxy() {
  const COUNT = isMobile ? 9000 : 26000;
  const positions = new Float32Array(COUNT * 3);
  const colors    = new Float32Array(COUNT * 3);

  const cInner = new THREE.Color('#dceeff');
  const cMid   = new THREE.Color('#5f7bff');
  const cOuter = new THREE.Color('#b067ff');

  const ARMS = 4, R_MIN = 10, R_MAX = 150;

  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    const r = R_MIN + Math.pow(Math.random(), 0.65) * (R_MAX - R_MIN);
    const arm = Math.floor(Math.random() * ARMS);
    const spin = r * 0.05;
    const angle = arm * (Math.PI * 2 / ARMS) + spin + (Math.random() - 0.5) * 0.65;

    const spread = 1.5 + r * 0.075;
    const x = Math.cos(angle) * r + (Math.random() - 0.5) * spread;
    const z = Math.sin(angle) * r + (Math.random() - 0.5) * spread;
    const y = (Math.random() - 0.5) * (1.6 + r * 0.06) * (Math.random() < 0.12 ? 3.2 : 1);

    positions[i3]     = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;

    const t = THREE.MathUtils.clamp((r - R_MIN) / (R_MAX - R_MIN), 0, 1);
    const col = new THREE.Color();
    if (t < 0.5) col.copy(cInner).lerp(cMid,   t / 0.5);
    else         col.copy(cMid).lerp(cOuter, (t - 0.5) / 0.5);
    const b = 0.75 + Math.random() * 0.55;
    colors[i3]     = col.r * b;
    colors[i3 + 1] = col.g * b;
    colors[i3 + 2] = col.b * b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.85,
    map: dotTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });

  galaxy.add(new THREE.Points(geo, mat));
})();

/* ===== CORE ===== */
const core = new THREE.Group();
scene.add(core);

const coreSphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.55, isMobile ? 16 : 32, isMobile ? 16 : 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
core.add(coreSphere);

const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture,
  color: 0xbfdcff,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  opacity: 0.95
}));
glowSprite.scale.setScalar(12);
core.add(glowSprite);

const halo = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture,
  color: 0x6f8cff,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  opacity: 0.45
}));
halo.scale.setScalar(34);
core.add(halo);

// Vùng chạm vô hình (bấm vào để warp)
const hitSphere = new THREE.Mesh(
  new THREE.SphereGeometry(3.2, 12, 12),
  new THREE.MeshBasicMaterial({ visible: false })
);
core.add(hitSphere);
/* ===== SCRATCHES (trắng, bo tròn 2 đầu) ===== */
const scratchRoot = new THREE.Group();
scene.add(scratchRoot);

const SCRATCH_COUNT = isMobile ? 55 : 110;
const TUBE_SEGS = isMobile ? 20 : 36;
const scratches = [];

function buildScratchGeometry(length, thickness) {
  const segs = 10;
  const pts = [];
  const wob = 0.035 + Math.random() * 0.10;
  const f1 = 1.2 + Math.random() * 3.0;
  const f2 = 1.2 + Math.random() * 3.0;
  const ph1 = Math.random() * Math.PI * 2;
  const ph2 = Math.random() * Math.PI * 2;

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(new THREE.Vector3(
      (t - 0.5) * length,
      Math.sin(t * Math.PI * f1 + ph1) * wob,
      Math.cos(t * Math.PI * f2 + ph2) * wob * 0.6
    ));
  }

  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, TUBE_SEGS, thickness, 5, false);

  const p0 = curve.getPoint(0);
  const p1 = curve.getPoint(1);
  const capA = new THREE.SphereGeometry(thickness, 6, 4);
  capA.translate(p0.x, p0.y, p0.z);
  const capB = new THREE.SphereGeometry(thickness, 6, 4);
  capB.translate(p1.x, p1.y, p1.z);

  const merged = mergeGeometries([tube, capA, capB]);
  if (!merged) {
    capA.dispose(); capB.dispose();
    return tube;
  }
  tube.dispose(); capA.dispose(); capB.dispose();
  return merged;
}

for (let i = 0; i < SCRATCH_COUNT; i++) {
  const tilt = new THREE.Group();
  tilt.rotation.set(
    (Math.random() - 0.5) * 1.0,
    Math.random() * Math.PI * 2,
    (Math.random() - 0.5) * 1.0
  );
  scratchRoot.add(tilt);

  const spinner = new THREE.Group();
  spinner.rotation.y = Math.random() * Math.PI * 2;
  tilt.add(spinner);

  const radius = 2.2 + Math.pow(Math.random(), 0.7) * 13;
  const length = 0.8 + Math.random() * 3.6;
  const thickness = 0.006 + Math.random() * 0.022;

  const geo = buildScratchGeometry(length, thickness);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.25 + Math.random() * 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(radius, 0, 0);
  mesh.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.9;
  mesh.rotation.x = (Math.random() - 0.5) * 0.6;
  spinner.add(mesh);

  scratches.push({
    spinner,
    mesh,
    mat,
    baseOpacity: mat.opacity,
    speed: (0.35 + Math.random() * 0.9) * (Math.random() < 0.22 ? -1 : 1) /
           Math.sqrt(radius * 0.45 + 1),
    phase: Math.random() * Math.PI * 2,
    flicker: 0.6 + Math.random() * 2.4
  });
}

// Vòng sáng mờ
const ring = new THREE.Mesh(
  new THREE.RingGeometry(1.6, 1.75, 128),
  new THREE.MeshBasicMaterial({
    color: 0x88bbff,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
ring.rotation.x = Math.PI / 2;
scene.add(ring);

/* ===== WARP STREAKS ===== */
const WARP_STREAK_COUNT = isMobile ? 320 : 550;
const warpGroup = new THREE.Group();
camera.add(warpGroup);

const warpPositions = new Float32Array(WARP_STREAK_COUNT * 6);
const warpStreaks = [];

function resetWarpStreak(s, initial = false) {
  const angle  = Math.random() * Math.PI * 2;
  const radius = (2 + Math.random() * Math.random() * 34);
  s.x = Math.cos(angle) * radius;
  s.y = Math.sin(angle) * radius * 0.75;
  s.z = initial ? (-30 - Math.random() * 130) : (-100 - Math.random() * 60);
  s.speed  = 130 + Math.random() * 180;
  s.length = 2 + Math.random() * 16;
}

for (let i = 0; i < WARP_STREAK_COUNT; i++) {
  const s = { x: 0, y: 0, z: 0, speed: 0, length: 0 };
  resetWarpStreak(s, true);
  warpStreaks.push(s);
}

const warpStreakGeo = new THREE.BufferGeometry();
warpStreakGeo.setAttribute('position', new THREE.BufferAttribute(warpPositions, 3));

const warpStreakMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: false
});
const warpStreakMesh = new THREE.LineSegments(warpStreakGeo, warpStreakMat);
warpStreakMesh.frustumCulled = false;
warpGroup.add(warpStreakMesh);

/* ===== WARP STATE ===== */
const WARP_DURATION = 1.6;
let warpActive    = false;
let warpStartTime = 0;
const warpStartPos = new THREE.Vector3();
const warpEndPos   = new THREE.Vector3();

function triggerWarp() {
  if (warpActive) return;
  warpActive    = true;
  warpStartTime = time;
  warpStartPos.copy(camera.position);

  const dir  = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
  const dist = camera.position.distanceTo(controls.target);
  const endDist = Math.max(3, dist * 0.28);
  warpEndPos.copy(controls.target).addScaledVector(dir, -endDist);

  controls.enabled    = false;
  controls.autoRotate = false;

  for (let i = 0; i < warpStreaks.length; i++) resetWarpStreak(warpStreaks[i], true);
}

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function updateWarp(dt) {
  if (!warpActive) return;

  const t = (time - warpStartTime) / WARP_DURATION;

  if (t >= 1) {
    camera.position.copy(warpStartPos);
    warpActive = false;
    controls.enabled = true;
    controls.autoRotate = true;
    warpStreakMat.opacity = 0;
    return;
  }

  let intensity;
  if (t < 0.35) intensity = smoothstep(t / 0.35);
  else if (t < 0.75) intensity = 1;
  else intensity = 1 - smoothstep((t - 0.75) / 0.25);

  const dashEase = t < 0.30
    ? smoothstep(t / 0.30)
    : 1 - smoothstep((t - 0.30) / 0.70);
  camera.position.lerpVectors(warpStartPos, warpEndPos, dashEase);

  warpStreakMat.opacity = intensity;
  const intensitySpeedBoost = 1 + intensity * 1.5;

  for (let i = 0; i < warpStreaks.length; i++) {
    const s = warpStreaks[i];
    s.z += s.speed * intensitySpeedBoost * dt;
    if (s.z > 6) resetWarpStreak(s, false);

    const i6 = i * 6;
    warpPositions[i6]     = s.x;
    warpPositions[i6 + 1] = s.y;
    warpPositions[i6 + 2] = s.z;
    const visualLen = s.length * (0.4 + intensity * 1.6);
    warpPositions[i6 + 3] = s.x;
    warpPositions[i6 + 4] = s.y;
    warpPositions[i6 + 5] = s.z - visualLen;
  }
  warpStreakGeo.attributes.position.needsUpdate = true;
}

/* ===== CLICK / TAP ===== */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointerDownInfo = null;
let activePointers = 0;

renderer.domElement.addEventListener('pointerdown', (e) => {
  activePointers++;
  if (activePointers === 1) {
    pointerDownInfo = { x: e.clientX, y: e.clientY, t: performance.now() };
  } else {
    pointerDownInfo = null;
  }
});

renderer.domElement.addEventListener('pointerup', (e) => {
  activePointers = Math.max(0, activePointers - 1);
  if (activePointers > 0) { pointerDownInfo = null; return; }
  if (!pointerDownInfo) return;

  const dx = e.clientX - pointerDownInfo.x;
  const dy = e.clientY - pointerDownInfo.y;
  const dt = performance.now() - pointerDownInfo.t;
  pointerDownInfo = null;

  if (dx * dx + dy * dy > 100 || dt > 400) return;

  ndc.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.intersectObject(hitSphere, false).length > 0) triggerWarp();
});

renderer.domElement.addEventListener('pointercancel', () => {
  activePointers = 0;
  pointerDownInfo = null;
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  if (warpActive) { renderer.domElement.style.cursor = 'default'; return; }
  ndc.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  renderer.domElement.style.cursor =
    raycaster.intersectObject(hitSphere, false).length > 0 ? 'pointer' : 'grab';
});

/* ===== DEBUG OVERLAY ===== */
const debugEl = document.createElement('div');
debugEl.style.cssText = `
  position: fixed;
  top: calc(8px + env(safe-area-inset-top));
  right: calc(8px + env(safe-area-inset-right));
  font: 11px/1.2 ui-monospace, monospace;
  color: #7fa8d8;
  padding: 3px 7px;
  background: rgba(0,0,0,0.35);
  border-radius: 4px;
  pointer-events: none;
  z-index: 10;
  letter-spacing: 0.3px;
  opacity: 0.85;
`;
debugEl.textContent = '· · · FPS';
document.body.appendChild(debugEl);

document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') {
    debugEl.style.display = debugEl.style.display === 'none' ? '' : 'none';
  }
});

document.getElementById('hint').textContent = isMobile
  ? 'Kéo để quay · Chụm 2 ngón để zoom · Chạm đốm sáng để warp'
  : 'Kéo chuột để quay · Lăn để zoom · Click đốm sáng để warp · D: FPS';

/* ===== RESIZE / QUALITY ===== */
function updateRenderSize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const q  = QUALITY_LEVELS[currentQuality];
  const dpr   = window.devicePixelRatio || 1;
  const maxPr = Math.sqrt(MAX_PIXELS / (vw * vh));
  const pr    = Math.min(dpr, maxPr) * q.pixelRatio;

  renderer.setPixelRatio(pr);
  renderer.setSize(vw, vh, false);
  renderer.domElement.style.width  = '100%';
  renderer.domElement.style.height = '100%';

  composer.setPixelRatio(pr);
  composer.setSize(vw, vh);

  const bw = Math.max(2, Math.round(vw * pr * q.bloomRes));
  const bh = Math.max(2, Math.round(vh * pr * q.bloomRes));
  bloomPass.setSize(bw, bh);
  bloomPass.enabled = q.bloom;

  const visCount = Math.max(1, Math.round(scratches.length * q.scratchVis));
  for (let i = 0; i < scratches.length; i++) {
    scratches[i].mesh.visible = i < visCount;
  }

  camera.aspect = vw / vh;
  camera.updateProjectionMatrix();

  console.log(`[Quality: ${q.name}] ${Math.round(vw*pr)}×${Math.round(vh*pr)} @ ${pr.toFixed(2)}x`);
}

/* ===== ADAPTIVE FPS ===== */
const startTime = performance.now();
let smoothedFps = 60, lastCheckTime = performance.now(), framesSinceCheck = 0;
let consecutiveLow = 0, consecutiveHigh = 0, lastQualityChange = 0;
const levelDowngradeTime = {};

const WARMUP_MS            = 2000;
const CHECK_INTERVAL_MS    = 500;
const CHANGE_COOLDOWN_MS   = 2000;
const DOWNGRADE_FPS        = 45;
const UPGRADE_FPS          = 57;
const DOWNGRADE_CONSECUTIVE = 2;
const UPGRADE_CONSECUTIVE   = 10;
const UPGRADE_COOLDOWN_MS   = 30000;

function resetFpsMeasure() {
  smoothedFps = 60; lastCheckTime = performance.now(); framesSinceCheck = 0;
  consecutiveLow = 0; consecutiveHigh = 0;
}

function adaptiveTick() {
  framesSinceCheck++;
  const now = performance.now();
  const elapsed = now - lastCheckTime;

  if (elapsed < CHECK_INTERVAL_MS) return;

  const instFps = framesSinceCheck * 1000 / elapsed;
  smoothedFps = smoothedFps * 0.6 + instFps * 0.4;
  framesSinceCheck = 0;
  lastCheckTime = now;

  debugEl.textContent =
    `${smoothedFps.toFixed(0)} FPS · ${QUALITY_LEVELS[currentQuality].name}` +
    (QUALITY_LEVELS[currentQuality].bloom ? ' · bloom' : ' · no-bloom');

  if (now - startTime < WARMUP_MS) return;
  if (now - lastQualityChange < CHANGE_COOLDOWN_MS) return;

  if (smoothedFps < DOWNGRADE_FPS) { consecutiveLow++;  consecutiveHigh = 0; }
  else if (smoothedFps > UPGRADE_FPS) { consecutiveHigh++; consecutiveLow  = 0; }
  else { consecutiveLow = 0; consecutiveHigh = 0; }

  if (consecutiveLow >= DOWNGRADE_CONSECUTIVE && currentQuality > 0) {
    levelDowngradeTime[currentQuality] = now;
    currentQuality--;
    updateRenderSize();
    lastQualityChange = now;
    resetFpsMeasure();
    return;
  }
  if (consecutiveHigh >= UPGRADE_CONSECUTIVE && currentQuality < QUALITY_LEVELS.length - 1) {
    const targetLevel = currentQuality + 1;
    const dgTime = levelDowngradeTime[targetLevel];
    if (dgTime && now - dgTime < UPGRADE_COOLDOWN_MS) { consecutiveHigh = 0; return; }
    currentQuality = targetLevel;
    updateRenderSize();
    lastQualityChange = now;
    resetFpsMeasure();
  }
}

/* ===== INIT ===== */
updateRenderSize();

/* ===== ANIMATE ===== */
const clock = new THREE.Clock();
let time = 0;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  const pulse = 1 + Math.sin(time * 1.7) * 0.05 + Math.sin(time * 4.3) * 0.02;
  core.scale.setScalar(pulse);
  glowSprite.material.opacity = 0.85 + Math.sin(time * 2.1) * 0.10;
  halo.material.opacity       = 0.40 + Math.sin(time * 1.1 + 1.5) * 0.08;

  galaxy.rotation.y += dt * 0.012;
  galaxy.rotation.x  = Math.sin(time * 0.05) * 0.03;
  ring.rotation.z   += dt * 0.15;

  for (let i = 0; i < scratches.length; i++) {
    const s = scratches[i];
    if (!s.mesh.visible) continue;
    s.spinner.rotation.y += s.speed * dt;
    s.mat.opacity = s.baseOpacity * (0.55 + 0.45 * Math.sin(time * s.flicker + s.phase));
  }

  updateWarp(dt);
  if (!warpActive) controls.update();
  composer.render();
  adaptiveTick();
}
animate();

/* ===== RESIZE / VISIBILITY ===== */
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(updateRenderSize, 100);
});
window.addEventListener('orientationchange', () => {
  setTimeout(updateRenderSize, 300);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clock.stop();
  else { clock.start(); resetFpsMeasure(); }
});
