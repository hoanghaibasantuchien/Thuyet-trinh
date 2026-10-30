import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ══════════════════════════════════════════════════════════
   1. TRẠNG THÁI
   ══════════════════════════════════════════════════════════ */
const state = {
  weather : 'clear',   // clear | rain | snow
  season  : 'spring',  // spring | summer | autumn | winter
  hour    : 12,
  autoTime: false,
  aurora  : false,
};

const SEASONS = {
  spring: { flowers:[0xff8fc4,0xffd6e8,0xfff2a8,0xc9a7ff,0xffffff,0xffb3a1,0xff6f91],
            grass:0x74c04a, foliage:0x9ada5a, ground:0x4e8f3a },
  summer: { flowers:[0xff2f55,0xffd400,0xff8a00,0xb44dff,0xff1f9c,0x00e0ff,0xffe066],
            grass:0x3f9a2a, foliage:0x2f7a25, ground:0x3a7a28 },
  autumn: { flowers:[0xff8c1a,0xe03c1c,0xffc107,0xb05a1e,0xd4a017,0xa0321e],
            grass:0x9a8f3a, foliage:0xd2691e, ground:0x86763a },
  winter: { flowers:[0xffffff,0xd6ecff,0xaecbff,0xeaf5ff],
            grass:0xa8b8c6, foliage:0xd8e2ea, ground:0xe2edf6 },
};

/* ══════════════════════════════════════════════════════════
   2. RENDERER / SCENE / CAMERA  (FOV 120°)
   ══════════════════════════════════════════════════════════ */
const canvas   = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias:true, powerPreference:'high-performance', stencil:false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog   = new THREE.Fog(0x9fc4e8, 25, 105);

const camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 0.1, 1600);
camera.rotation.order = 'YXZ';

const player = { x:0, z:0, yaw:0, pitch:0, eye:1.75, speed:7.5 };

/* ══════════════════════════════════════════════════════════
   3. UNIFORM GIÓ (dùng chung cho shader)
   ══════════════════════════════════════════════════════════ */
const timeU = { value: 0 };
const windU = { value: new THREE.Vector2(1.0, 0.35) };

function windify(mat, amp){
  const A = amp.toFixed(4);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeU;
    shader.uniforms.uWind = windU;
    shader.vertexShader = 'uniform float uTime;\nuniform vec2 uWind;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      vec3 transformed = vec3( position );
      vec3 wOrigin = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
      #ifdef USE_INSTANCING
        wOrigin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
      #endif
      float swayH = max( transformed.y, 0.0 );
      float ph = uTime * 1.7 + wOrigin.x * 0.45 + wOrigin.z * 0.37;
      float sw = sin( ph ) + 0.45 * sin( ph * 2.7 + 1.3 );
      float k  = swayH * swayH * ${A};
      transformed.x += sw * k * uWind.x;
      transformed.z += sw * k * uWind.y;
      `
    );
  };
  mat.customProgramCacheKey = () => 'wind_' + A;
  return mat;
}

/* ══════════════════════════════════════════════════════════
   4. HÌNH HỌC
   ══════════════════════════════════════════════════════════ */
function withColor(geo, hex){
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++){ arr[i*3]=c.r; arr[i*3+1]=c.g; arr[i*3+2]=c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

const stemGeo = new THREE.CylinderGeometry(0.014, 0.026, 0.62, 4, 1);
stemGeo.translate(0, 0.31, 0);

function makeBloomGeo(){
  const parts = [];
  const center = new THREE.SphereGeometry(0.045, 6, 4);
  center.scale(1, 0.7, 1);
  center.translate(0, 0.635, 0);
  parts.push(withColor(center, 0x2a1a05));

  for (let i = 0; i < 5; i++){
    const p = new THREE.SphereGeometry(0.085, 6, 4);
    p.scale(1.15, 0.30, 0.62);
    p.translate(0.105, 0, 0);
    p.rotateZ(0.30);
    p.rotateY(i * Math.PI * 2 / 5);
    p.translate(0, 0.635, 0);
    parts.push(withColor(p, 0xffffff));
  }
  return mergeGeometries(parts, false);
}
const bloomGeo = makeBloomGeo();

function makeGrassGeo(){
  const g = new THREE.PlaneGeometry(0.1, 0.9, 1, 4);
  g.translate(0, 0.45, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++){
    const y = pos.getY(i);
    const t = y / 0.9;
    pos.setX(i, pos.getX(i) * (1 - t * 0.92));
    pos.setZ(i, Math.sin(t * 2.2) * 0.05);
  }
  g.computeVertexNormals();
  return g;
}
const grassGeo = makeGrassGeo();

const trunkGeo = new THREE.CylinderGeometry(0.14, 0.26, 2.6, 6, 1);
trunkGeo.translate(0, 1.3, 0);
const foliageGeo = new THREE.IcosahedronGeometry(1.35, 1);
foliageGeo.translate(0, 3.15, 0);

/* ══════════════════════════════════════════════════════════
   5. MATERIAL
   ══════════════════════════════════════════════════════════ */
const stemMat    = windify(new THREE.MeshLambertMaterial({ color:0x3f7a2a }), 0.12);
const bloomMat   = windify(new THREE.MeshLambertMaterial({ vertexColors:true }), 0.12);
const grassMat   = windify(new THREE.MeshLambertMaterial({ color:0x74c04a, side:THREE.DoubleSide }), 0.34);
const trunkMat   = windify(new THREE.MeshLambertMaterial({ color:0x5b3f28 }), 0.010);
const foliageMat = windify(new THREE.MeshLambertMaterial({ color:0x9ada5a }), 0.008);

/* ══════════════════════════════════════════════════════════
   6. BẦU TRỜI (shader)
   ══════════════════════════════════════════════════════════ */
const skyUniforms = {
  uTop      : { value: new THREE.Color(0x2a6fd6) },
  uBottom   : { value: new THREE.Color(0xbcd8f0) },
  uSunColor : { value: new THREE.Color(0xfff2cc) },
  uSunDir   : { value: new THREE.Vector3(0, 1, 0) },
  uStars    : { value: 0 },
  uAurora   : { value: 0 },
  uTime     : { value: 0 },
};

const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  vertexShader: `
    varying vec3 vDir;
    void main(){
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3  uTop, uBottom, uSunColor, uSunDir;
    uniform float uStars, uAurora, uTime;
    varying vec3  vDir;

    float hash31(vec3 p){
      p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    void main(){
      vec3  d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(uBottom, uTop, smoothstep(-0.08, 0.58, h));

      vec3  sd3 = normalize(uSunDir);
      float sd  = max(dot(d, sd3), 0.0);
      col += uSunColor * pow(sd, 900.0) * 3.2;
      col += uSunColor * pow(sd, 14.0)  * 0.26;
      col += uSunColor * pow(sd, 3.0)   * 0.055;

      if (uStars > 0.001 && h > 0.0){
        vec3  cell = floor(d * 260.0);
        float n    = hash31(cell);
        float star = smoothstep(0.9955, 1.0, n);
        float tw   = 0.55 + 0.45 * sin(uTime * 4.0 + n * 90.0);
        col += vec3(0.9, 0.95, 1.0) * star * uStars * tw * smoothstep(0.0, 0.18, h) * 1.6;
      }

      if (uAurora > 0.001 && h > 0.0){
        float ang = atan(d.z, d.x);
        float w1  = sin(ang * 3.0 + uTime * 0.30) * 0.5 + 0.5;
        float w2  = sin(ang * 5.0 - uTime * 0.21 + 1.7) * 0.5 + 0.5;
        float by  = 0.22 + 0.28 * w1;
        float g   = exp(-pow((h - by) / 0.17, 2.0));
        float a   = g * (0.45 + 0.55 * w2) * smoothstep(0.0, 0.22, h);
        vec3  ac  = mix(vec3(0.10, 1.0, 0.55), vec3(0.65, 0.25, 1.0), w1);
        col += ac * a * uAurora * 1.5;
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 18), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -1000;
scene.add(sky);

/* ══════════════════════════════════════════════════════════
   7. ĐÈN
   ══════════════════════════════════════════════════════════ */
const sunLight  = new THREE.DirectionalLight(0xffffff, 2.0); scene.add(sunLight);
const hemiLight = new THREE.HemisphereLight(0x9ec8ff, 0x3a5a2a, 0.8); scene.add(hemiLight);
const ambLight  = new THREE.AmbientLight(0xffffff, 0.15); scene.add(ambLight);

/* ══════════════════════════════════════════════════════════
   8. MẶT ĐẤT
   ══════════════════════════════════════════════════════════ */
function makeGroundTexture(){
  const small = document.createElement('canvas');
  small.width = small.height = 32;
  const sctx = small.getContext('2d');
  const img  = sctx.createImageData(32, 32);
  for (let i = 0; i < 32 * 32; i++){
    const v = 195 + Math.random() * 60;
    img.data[i*4] = v; img.data[i*4+1] = v; img.data[i*4+2] = v; img.data[i*4+3] = 255;
  }
  sctx.putImageData(img, 0, 0);

  const big = document.createElement('canvas');
  big.width = big.height = 256;
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(small, 0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(big);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(80, 80);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const groundMat = new THREE.MeshLambertMaterial({ color:0x4e8f3a, map: makeGroundTexture() });
const groundGeo = new THREE.PlaneGeometry(2600, 2600);
groundGeo.rotateX(-Math.PI / 2);
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.position.y = -0.02;
scene.add(ground);
/* ══════════════════════════════════════════════════════════
   9. SINH CHUNK VÔ TẬN
   ══════════════════════════════════════════════════════════ */
const CHUNK  = 55;
const RADIUS = 2;
const chunks = new Map();
let curCX = null, curCZ = null;

const dummy    = new THREE.Object3D();
const tmpColor = new THREE.Color();

function hash2(x, y){
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function mulberry32(a){
  return function(){
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildChunk(cx, cz){
  const group = new THREE.Group();
  group.position.set(cx * CHUNK, 0, cz * CHUNK);

  const rnd  = mulberry32(hash2(cx, cz));
  const rr   = (a, b) => a + rnd() * (b - a);
  const half = CHUNK / 2;
  const S    = SEASONS[state.season];
  const winterFactor = state.season === 'winter' ? 0.32 : 1;

  /* HOA */
  const nF = Math.round(rr(70, 130) * winterFactor);
  if (nF > 0){
    const stems  = new THREE.InstancedMesh(stemGeo,  stemMat,  nF);
    const blooms = new THREE.InstancedMesh(bloomGeo, bloomMat, nF);

    for (let i = 0; i < nF; i++){
      dummy.position.set(rr(-half, half), 0, rr(-half, half));
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
      const s = rr(0.75, 1.7);
      dummy.scale.set(s, s * rr(0.8, 1.25), s);
      dummy.updateMatrix();

      stems.setMatrixAt(i, dummy.matrix);
      blooms.setMatrixAt(i, dummy.matrix);

      tmpColor.setHex(S.flowers[(rnd() * S.flowers.length) | 0]);
      tmpColor.offsetHSL(0, 0, rr(-0.07, 0.07));
      blooms.setColorAt(i, tmpColor);
    }
    stems.instanceMatrix.needsUpdate  = true;
    blooms.instanceMatrix.needsUpdate = true;
    blooms.instanceColor.needsUpdate  = true;
    finalizeMesh(stems); finalizeMesh(blooms);
    group.add(stems, blooms);
  }

  /* CỎ */
  const nG = Math.round(rr(300, 480) * (state.season === 'winter' ? 0.45 : 1));
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, nG);
  for (let i = 0; i < nG; i++){
    dummy.position.set(rr(-half, half), 0, rr(-half, half));
    dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
    const s = rr(0.6, 1.5);
    dummy.scale.set(s, s * rr(0.7, 1.3), s);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);

    const v = rr(0.78, 1.15);
    tmpColor.setRGB(v, v * rr(0.95, 1.08), v * 0.92);
    grass.setColorAt(i, tmpColor);
  }
  grass.instanceMatrix.needsUpdate = true;
  grass.instanceColor.needsUpdate  = true;
  finalizeMesh(grass);
  group.add(grass);

  /* CÂY */
  const nT = rnd() < 0.6 ? Math.floor(rr(1, 3)) : 0;
  if (nT > 0){
    const trunks = new THREE.InstancedMesh(trunkGeo,   trunkMat,   nT);
    const leaves = new THREE.InstancedMesh(foliageGeo, foliageMat, nT);
    for (let i = 0; i < nT; i++){
      dummy.position.set(rr(-half, half), 0, rr(-half, half));
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
      const s = rr(0.8, 1.5);
      dummy.scale.set(s, s * rr(0.9, 1.3), s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);

      const v = rr(0.82, 1.14);
      tmpColor.setRGB(v, v, v);
      leaves.setColorAt(i, tmpColor);
    }
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    leaves.instanceColor.needsUpdate  = true;
    finalizeMesh(trunks); finalizeMesh(leaves);
    group.add(trunks, leaves);
  }

  scene.add(group);
  return { group };
}

function finalizeMesh(m){
  if (typeof m.computeBoundingSphere === 'function') m.computeBoundingSphere();
  else m.frustumCulled = false;
}

function removeChunk(ch){
  ch.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
  scene.remove(ch.group);
}

function updateChunks(){
  const pcx = Math.floor(player.x / CHUNK);
  const pcz = Math.floor(player.z / CHUNK);
  if (pcx === curCX && pcz === curCZ) return;
  curCX = pcx; curCZ = pcz;

  const need = new Set();
  for (let i = -RADIUS; i <= RADIUS; i++)
    for (let j = -RADIUS; j <= RADIUS; j++)
      need.add((pcx + i) + ',' + (pcz + j));

  for (const [k, ch] of chunks){
    if (!need.has(k)){ removeChunk(ch); chunks.delete(k); }
  }
  for (const k of need){
    if (!chunks.has(k)){
      const [x, z] = k.split(',').map(Number);
      chunks.set(k, buildChunk(x, z));
    }
  }
}

function rebuildAll(){
  for (const [, ch] of chunks) removeChunk(ch);
  chunks.clear();
  curCX = curCZ = null;
  updateChunks();
}

/* ══════════════════════════════════════════════════════════
   10. THỜI TIẾT (mưa / tuyết)
   ══════════════════════════════════════════════════════════ */
const RAIN_COUNT = 2200;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_COUNT * 3);
const rainVel = new Float32Array(RAIN_COUNT);
for (let i = 0; i < RAIN_COUNT; i++){
  rainPos[i*3]   = (Math.random() - 0.5) * 70;
  rainPos[i*3+1] = Math.random() * 32;
  rainPos[i*3+2] = (Math.random() - 0.5) * 70;
  rainVel[i]     = 28 + Math.random() * 18;
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
  color:0xbfd8ff, size:0.09, transparent:true, opacity:0.65, depthWrite:false
}));
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);

const SNOW_COUNT = 1600;
const snowGeo = new THREE.BufferGeometry();
const snowPos = new Float32Array(SNOW_COUNT * 3);
const snowVel = new Float32Array(SNOW_COUNT);
const snowPh  = new Float32Array(SNOW_COUNT);
for (let i = 0; i < SNOW_COUNT; i++){
  snowPos[i*3]   = (Math.random() - 0.5) * 70;
  snowPos[i*3+1] = Math.random() * 32;
  snowPos[i*3+2] = (Math.random() - 0.5) * 70;
  snowVel[i]     = 1.8 + Math.random() * 2.2;
  snowPh[i]      = Math.random() * Math.PI * 2;
}
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
  color:0xffffff, size:0.16, transparent:true, opacity:0.9, depthWrite:false
}));
snow.frustumCulled = false;
snow.visible = false;
scene.add(snow);

function updateWeatherParticles(dt, t){
  if (rain.visible){
    rain.position.set(player.x, 0, player.z);
    const p = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_COUNT; i++){
      p[i*3+1] -= rainVel[i] * dt;
      if (p[i*3+1] < 0){
        p[i*3]   = (Math.random() - 0.5) * 70;
        p[i*3+1] = 30 + Math.random() * 6;
        p[i*3+2] = (Math.random() - 0.5) * 70;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  if (snow.visible){
    snow.position.set(player.x, 0, player.z);
    const p = snowGeo.attributes.position.array;
    for (let i = 0; i < SNOW_COUNT; i++){
      p[i*3+1] -= snowVel[i] * dt;
      p[i*3]   += Math.sin(t * 1.2 + snowPh[i]) * 0.35 * dt;
      p[i*3+2] += Math.cos(t * 0.9 + snowPh[i]) * 0.35 * dt;
      if (p[i*3+1] < 0){
        p[i*3]   = (Math.random() - 0.5) * 70;
        p[i*3+1] = 30 + Math.random() * 6;
        p[i*3+2] = (Math.random() - 0.5) * 70;
      }
    }
    snowGeo.attributes.position.needsUpdate = true;
  }
}

/* ══════════════════════════════════════════════════════════
   11. CẬP NHẬT BẦU TRỜI / ÁNH SÁNG THEO GIỜ
   ══════════════════════════════════════════════════════════ */
const C_DAY_TOP     = new THREE.Color(0x2a6fd6);
const C_NIGHT_TOP   = new THREE.Color(0x040812);
const C_DUSK_TOP    = new THREE.Color(0x4a2a6a);
const C_DAY_BOT     = new THREE.Color(0xbcd8f0);
const C_NIGHT_BOT   = new THREE.Color(0x0a1225);
const C_DUSK_BOT    = new THREE.Color(0xff8855);
const C_SUN_DAY     = new THREE.Color(0xfff2cc);
const C_SUN_DUSK    = new THREE.Color(0xff5522);

const _top = new THREE.Color();
const _bot = new THREE.Color();
const _sun = new THREE.Color();
const _dir = new THREE.Vector3();

function updateSky(hour){
  const sunAngle = ((hour - 6) / 12) * Math.PI;
  const sy = Math.sin(sunAngle);
  const sx = Math.cos(sunAngle);
  _dir.set(sx, sy, 0.28).normalize();

  const dayF  = THREE.MathUtils.smoothstep(sy, -0.15, 0.25);
  const duskF = Math.exp(-Math.pow((sy - 0.05) / 0.18, 2));

  _top.copy(C_NIGHT_TOP).lerp(C_DAY_TOP, dayF).lerp(C_DUSK_TOP, duskF * 0.5);
  _bot.copy(C_NIGHT_BOT).lerp(C_DAY_BOT, dayF).lerp(C_DUSK_BOT, duskF * 0.7);
  _sun.copy(C_SUN_DAY).lerp(C_SUN_DUSK, duskF);

  skyUniforms.uTop.value.copy(_top);
  skyUniforms.uBottom.value.copy(_bot);
  skyUniforms.uSunColor.value.copy(_sun);
  skyUniforms.uSunDir.value.copy(_dir);
  skyUniforms.uStars.value = 1 - dayF;

  scene.fog.color.copy(_bot).lerp(_top, 0.3);
  scene.fog.near = 25;
  scene.fog.far  = 105;

  sunLight.position.copy(_dir).multiplyScalar(120);
  sunLight.intensity = 0.2 + 2.2 * dayF;
  sunLight.color.copy(_sun);

  hemiLight.intensity = 0.15 + 0.7 * dayF;
  hemiLight.color.copy(_top);

  ambLight.intensity = 0.06 + 0.1 * dayF;
}

/* ══════════════════════════════════════════════════════════
   12. UI MENU
   ══════════════════════════════════════════════════════════ */
const menuEl    = document.getElementById('menu');
const timeSlider= document.getElementById('timeSlider');
const timeLabel = document.getElementById('timeLabel');
const auroraBtn = document.getElementById('auroraBtn');
const fpsEl     = document.getElementById('fps');

function toggleMenu(){ menuEl.classList.toggle('hidden'); }

function updateTimeLabel(){
  const h = Math.floor(state.hour) % 24;
  const m = Math.floor((state.hour - Math.floor(state.hour)) * 60);
  timeLabel.textContent = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  if (!state.autoTime) timeSlider.value = state.hour;
}

/* Thời tiết */
document.querySelectorAll('[data-weather]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.weather = btn.dataset.weather;
    document.querySelectorAll('[data-weather]').forEach(b =>
      b.classList.toggle('active', b === btn));
    rain.visible = state.weather === 'rain';
    snow.visible = state.weather === 'snow';
  });
});

/* Mùa */
document.querySelectorAll('[data-season]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.season = btn.dataset.season;
    document.querySelectorAll('[data-season]').forEach(b =>
      b.classList.toggle('active', b === btn));

    const S = SEASONS[state.season];
    grassMat.color.setHex(S.grass);
    foliageMat.color.setHex(S.foliage);
    groundMat.color.setHex(S.ground);
    rebuildAll();
  });
});

/* Thời gian */
timeSlider.addEventListener('input', () => {
  state.hour = parseFloat(timeSlider.value);
  state.autoTime = false;
  document.querySelectorAll('[data-time]').forEach(b => b.classList.remove('active'));
  updateTimeLabel();
});

document.querySelectorAll('[data-time]').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = btn.dataset.time;
    if (t === 'day')   { state.hour = 12; state.autoTime = false; }
    else if (t === 'night'){ state.hour = 22; state.autoTime = false; }
    else               { state.autoTime = true; }
    document.querySelectorAll('[data-time]').forEach(b =>
      b.classList.toggle('active', b === btn));
    updateTimeLabel();
  });
});

/* Cực quang */
auroraBtn.addEventListener('click', () => {
  state.aurora = !state.aurora;
  auroraBtn.textContent = state.aurora ? 'Bật' : 'Tắt';
  auroraBtn.classList.toggle('active', state.aurora);
});

/* ══════════════════════════════════════════════════════════
   13. ĐIỀU KHIỂN
   ══════════════════════════════════════════════════════════ */
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyM') toggleMenu();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

let mouseDrag = false, mLastX = 0, mLastY = 0;
canvas.addEventListener('mousedown', e => {
  if (e.button === 0){ mouseDrag = true; mLastX = e.clientX; mLastY = e.clientY; }
});
window.addEventListener('mousemove', e => {
  if (!mouseDrag) return;
  player.yaw   -= (e.clientX - mLastX) * 0.003;
  player.pitch -= (e.clientY - mLastY) * 0.003;
  player.pitch  = Math.max(-1.5, Math.min(1.5, player.pitch));
  mLastX = e.clientX; mLastY = e.clientY;
});
window.addEventListener('mouseup', () => { mouseDrag = false; });

let touchId = null, tLastX = 0, tLastY = 0;
let tapCount = 0, tapTimer = null;

function handleThreeFingerTap(){
  tapCount++;
  if (tapTimer) clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 1200);
  if (tapCount >= 3){
    tapCount = 0;
    clearTimeout(tapTimer);
    toggleMenu();
  }
}

canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 3){
    touchId = null;
    handleThreeFingerTap();
    e.preventDefault();
    return;
  }
  if (e.touches.length === 1 && touchId === null){
    touchId = e.touches[0].identifier;
    tLastX = e.touches[0].clientX;
    tLastY = e.touches[0].clientY;
  }
}, { passive:false });

canvas.addEventListener('touchmove', e => {
  if (e.touches.length >= 2) return;
  if (touchId === null) return;
  for (const t of e.touches){
    if (t.identifier === touchId){
      player.yaw   -= (t.clientX - tLastX) * 0.005;
      player.pitch -= (t.clientY - tLastY) * 0.005;
      player.pitch  = Math.max(-1.5, Math.min(1.5, player.pitch));
      tLastX = t.clientX; tLastY = t.clientY;
      break;
    }
  }
  e.preventDefault();
}, { passive:false });

canvas.addEventListener('touchend', e => {
  if (touchId !== null){
    let still = false;
    for (const t of e.touches) if (t.identifier === touchId){ still = true; break; }
    if (!still) touchId = null;
  }
});

/* ══════════════════════════════════════════════════════════
   14. VÒNG LẶP CHÍNH
   ══════════════════════════════════════════════════════════ */
let lastT = performance.now();
let fpsFrames = 0;
let fpsClock  = performance.now();
let totalT    = 0;

function frame(now){
  requestAnimationFrame(frame);

  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  totalT += dt;

  const fwdX = -Math.sin(player.yaw);
  const fwdZ = -Math.cos(player.yaw);
  const rgtX =  Math.cos(player.yaw);
  const rgtZ = -Math.sin(player.yaw);

  let mx = 0, mz = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    mz += 1;
  if (keys['KeyS'] || keys['ArrowDown'])  mz -= 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;

  if (mx || mz){
    const L = Math.hypot(mx, mz);
    mx /= L; mz /= L;
    player.x += (fwdX * mz + rgtX * mx) * player.speed * dt;
    player.z += (fwdZ * mz + rgtZ * mx) * player.speed * dt;
    updateChunks();
  }

  camera.position.set(player.x, player.eye, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

  if (state.autoTime){
    state.hour = (state.hour + dt * 0.4) % 24;
    updateTimeLabel();
  }

  updateSky(state.hour);
  timeU.value = totalT;
  skyUniforms.uTime.value = totalT;
  skyUniforms.uAurora.value = state.aurora ? 1 : 0;

  windU.value.set(
    1.0 + Math.sin(totalT * 0.3) * 0.35,
    0.35 + Math.cos(totalT * 0.23) * 0.25
  );

  updateWeatherParticles(dt, totalT);

  renderer.render(scene, camera);

  fpsFrames++;
  if (now - fpsClock >= 500){
    const fps = Math.round(fpsFrames * 1000 / (now - fpsClock));
    fpsEl.textContent = fps;
    fpsFrames = 0;
    fpsClock = now;
  }
}

/* ══════════════════════════════════════════════════════════
   15. RESIZE & KHỞI TẠO
   ══════════════════════════════════════════════════════════ */
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
});

{
  const S = SEASONS[state.season];
  grassMat.color.setHex(S.grass);
  foliageMat.color.setHex(S.foliage);
  groundMat.color.setHex(S.ground);
}
updateTimeLabel();
updateChunks();
updateSky(state.hour);

requestAnimationFrame(frame);
