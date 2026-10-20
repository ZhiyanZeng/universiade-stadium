import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createStadium } from './stadium.js';
import {
  DIMS,
  DRAWINGS,
  LIGHT_MODES,
  MATERIAL_NOTES,
  PALETTE,
  SOURCES,
  STRUCTURE,
  TIMELINE,
  VIEWS,
} from './data.js';

const TAU = Math.PI * 2;
const PI = Math.PI;
const HALF_PI = PI / 2;
const DEG = PI / 180;
const IS_MOBILE = window.matchMedia('(max-width: 840px)').matches;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SKIP_INTRO = new URLSearchParams(window.location.search).get('intro') === '0';
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const el = {
  app: document.getElementById('app'),
  canvas: document.getElementById('scene'),
  boot: document.getElementById('boot'),
  bootBar: document.getElementById('bootBar'),
  bootStatus: document.getElementById('bootStatus'),
  bootPercent: document.getElementById('bootPercent'),
  fallback: document.getElementById('webglFallback'),
  fallbackOpen: document.getElementById('fallbackOpen'),
  toast: document.getElementById('toast'),
  clock: document.getElementById('clock'),
  timePhase: document.getElementById('timePhase'),
  sunNote: document.getElementById('sunNote'),
  timeRange: document.getElementById('timeRange'),
  lightModeName: document.getElementById('lightModeName'),
  lightDesc: document.getElementById('lightDesc'),
  structureButton: document.getElementById('structureButton'),
  autoRotateButton: document.getElementById('autoRotateButton'),
  strobeButton: document.getElementById('strobeButton'),
  lampBanksButton: document.getElementById('lampBanksButton'),
  flickerButton: document.getElementById('flickerButton'),
  sticksButton: document.getElementById('sticksButton'),
  flashButton: document.getElementById('flashButton'),
  lightsOffButton: document.getElementById('lightsOffButton'),
  dockStructure: document.getElementById('dockStructure'),
  dockRotate: document.getElementById('dockRotate'),
  fullscreenButton: document.getElementById('fullscreenButton'),
  drawingLabel: document.querySelector('.drawing-label'),
  captionIndex: document.getElementById('captionIndex'),
  captionTitle: document.getElementById('captionTitle'),
  captionText: document.getElementById('captionText'),
  mouseHint: document.getElementById('mouseHint'),
  dismissHint: document.getElementById('dismissHint'),
  walkHud: document.getElementById('walkHud'),
  walkAreaName: document.getElementById('walkAreaName'),
  walkHint: document.getElementById('walkHint'),
  walkExit: document.getElementById('walkExit'),
  walkTiers: document.getElementById('walkTiers'),
  walkZoom: document.getElementById('walkZoom'),
  tierPicker: document.getElementById('tierPicker'),
  panel: document.querySelector('.atmosphere-panel'),
  panelCollapse: document.getElementById('panelCollapse'),
  archive: document.getElementById('archive'),
  drawingList: document.getElementById('drawingList'),
  drawingImage: document.getElementById('drawingImage'),
  drawingStage: document.getElementById('drawingStage'),
  drawingCode: document.getElementById('drawingCode'),
  drawingName: document.getElementById('drawingName'),
  drawingNote: document.getElementById('drawingNote'),
  drawingSize: document.getElementById('drawingSize'),
  drawingLink: document.getElementById('drawingLink'),
  zoomButton: document.getElementById('zoomButton'),
  statsGrid: document.getElementById('statsGrid'),
  structureList: document.getElementById('structureList'),
  paletteGrid: document.getElementById('paletteGrid'),
  materialNote: document.getElementById('materialNote'),
  timelineList: document.getElementById('timelineList'),
  sourceList: document.getElementById('sourceList'),
};

const params = new URLSearchParams(window.location.search);
const initialHour = clamp(Number.parseFloat(params.get('time') || '19.2') || 19.2, 0, 24);
const initialMode = LIGHT_MODES[params.get('mode')] ? params.get('mode') : 'crystal';
const initialView = VIEWS[params.get('view')] ? params.get('view') : 'shore';
const initialTier = clamp(Math.round(Number.parseFloat(params.get('tier') || '2') || 2), 1, 3);

const state = {
  hour: initialHour,
  mode: initialMode,
  view: initialView,
  structure: params.get('structure') === '1',
  autoRotate: false,
  strobe: params.get('strobe') === '1',
  flicker: params.get('flicker') === '1',
  lampBanks: params.get('lamps') !== '0',
  sticks: params.get('sticks') === '1',
  flash: params.get('flash') === '1',
  lightsOff: params.get('lights') === '0',
  archiveOpen: false,
  archiveTab: 'drawings',
  drawingIndex: 0,
  hintDismissed: false,
  envDirty: true,
  night: 0.9,
  started: false,
  standTier: initialTier,
  panelCollapsed: false,
  pickerOpen: false,
};

const viewTitles = {
  shore: '湖岸 · 从水面望向发光晶体',
  orbit: '鸟瞰 · 晶体落在山水之间',
  elevation: '立面 · 峰谷与三角网格',
  field: '内场 · 九道跑道与三层看台',
  stands: '看台 · 三层银灰座席的椭圆',
  roof: '屋盖 · 单层折面空间网格',
  free: '自由 · 任意高度绕行晶体',
};

let renderer;
let scene;
let camera;
let controls;
let composer;
let bloomPass;
let stadium;
let skyUniforms;
let sunLight;
let moonLight;
let hemiLight;
let fieldFill;
let facadeWashLights = [];
let fieldFloodlights = [];
let envMap;
let elapsed = 0;
let lastFrame = 0;
let viewTween = null;
let introTimer = null;
let hintTimer = null;
let toastTimer = null;
let archiveCloseTimer = null;

/* First-person walk mode. The camera becomes a body standing on the pitch or
   on the club tier: WASD moves, the mouse looks around, Esc steps out. */
const walk = {
  active: false,
  area: null,
  keys: new Set(),
  yaw: 0,
  pitch: 0,
  fov: 68,
  position: new THREE.Vector3(),
  intro: null,
  hadLock: false,
  locked: false,
  cursorFree: false,
  dragging: false,
  lastPointer: null,
  lastMove: 0,
};

/* --------------------------------------------------------------------------
   Boot & fallback
   -------------------------------------------------------------------------- */

function setBoot(percent, message) {
  if (!el.bootBar) return;
  el.bootBar.style.width = `${clamp(percent, 0, 100)}%`;
  if (message) el.bootStatus.textContent = message;
  el.bootPercent.textContent = `${String(Math.round(percent)).padStart(2, '0')}%`;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function finishBoot() {
  setBoot(100, '进入建筑');
  setTimeout(() => {
    el.boot.classList.add('is-done');
    document.body.classList.add('is-ready');
    if (SKIP_INTRO) {
    setViewInstant(state.view);
  } else if (!REDUCED_MOTION) {
    introTimer = setTimeout(() => {
      flyTo(state.view, 2.6, { intro: true });
    }, 300);
  } else {
    setViewInstant(state.view);
  }
  }, 380);
}

function showFallback() {
  if (el.boot) el.boot.classList.add('is-done');
  if (el.fallback) el.fallback.hidden = false;
}

function showToast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
}

/* --------------------------------------------------------------------------
   Data-driven archive content
   -------------------------------------------------------------------------- */

function populateArchive() {
  el.statsGrid.innerHTML = [
    [DIMS.seats.toLocaleString('en-US'), '座席', 'SEATS'],
    [`${DIMS.length} × ${DIMS.width}`, '米', 'FOOTPRINT'],
    [DIMS.height.toFixed(1), '米', 'MAX HEIGHT'],
    ['18,000', '吨', 'STRUCTURAL STEEL'],
    ['180 × 130', '米', 'ROOF OPENING'],
    [DIMS.cantilever.toFixed(1), '米', 'MAX CANTILEVER'],
    ['20', '组', 'FOLDED UNITS'],
    ['13.6', '万 m²', 'GROSS FLOOR AREA'],
  ].map(([value, unit, label]) => `
    <div class="stat-cell">
      <strong>${value}<small>${unit}</small></strong>
      <span>${label}</span>
    </div>
  `).join('');

  el.structureList.innerHTML = STRUCTURE.map(([term, detail]) => `
    <div><dt>${term}</dt><dd>${detail}</dd></div>
  `).join('');

  el.paletteGrid.innerHTML = PALETTE.map((item) => `
    <div class="palette-chip" title="${item.note}">
      <div class="palette-color" style="background:${item.hex}"></div>
      <div>
        <strong>${item.name}</strong>
        <span>${item.en} / ${item.hex}</span>
      </div>
    </div>
  `).join('');
  el.materialNote.textContent = `${MATERIAL_NOTES.daylight} ${MATERIAL_NOTES.night}`;

  el.timelineList.innerHTML = TIMELINE.map(([year, text]) => `
    <li><time>${year}</time><p>${text}</p></li>
  `).join('');

  el.sourceList.innerHTML = SOURCES.map((source) => {
    const inner = `
      <span class="source-num">${source.n}</span>
      <span class="source-main"><strong>${source.name}</strong><span>${source.detail}</span></span>
      <span class="source-arrow">${source.url ? '↗' : '—'}</span>
    `;
    return source.url
      ? `<a class="source-row" href="${source.url}" target="_blank" rel="noopener noreferrer">${inner}</a>`
      : `<div class="source-row">${inner}</div>`;
  }).join('');

  el.drawingList.innerHTML = DRAWINGS.map((drawing, index) => `
    <button class="drawing-item${index === 0 ? ' is-active' : ''}" type="button" data-drawing-index="${index}">
      <span class="drawing-item-index">${String(index + 1).padStart(2, '0')}</span>
      <span>
        <span class="drawing-item-name">${drawing.name}</span>
        <span class="drawing-item-en">${drawing.en}</span>
      </span>
    </button>
  `).join('');
}

function selectDrawing(index, { scroll = false } = {}) {
  const drawing = DRAWINGS[index];
  if (!drawing) return;
  state.drawingIndex = index;
  el.drawingImage.classList.remove('is-loaded');
  el.drawingStage.classList.remove('is-zoomed');
  el.drawingImage.classList.toggle('is-color', Boolean(drawing.color));
  el.drawingImage.src = drawing.file;
  el.drawingImage.alt = `${drawing.name} · 深圳大运中心体育场结构图`;
  el.drawingCode.textContent = `DWG ${String(index + 1).padStart(2, '0')} / ${DRAWINGS.length}`;
  el.drawingName.textContent = drawing.name;
  el.drawingNote.textContent = drawing.note;
  el.drawingSize.textContent = `${drawing.size} px`;
  el.drawingLink.href = drawing.file;
  el.drawingLink.download = `${drawing.id}.jpg`;
  el.drawingList.querySelectorAll('.drawing-item').forEach((button, i) => {
    button.classList.toggle('is-active', i === index);
  });
  if (scroll) {
    el.drawingList.querySelector('.drawing-item.is-active')?.scrollIntoView({
      behavior: REDUCED_MOTION ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }
}

/* --------------------------------------------------------------------------
   Archive open / close / tabs
   -------------------------------------------------------------------------- */

function setArchiveTab(tab) {
  state.archiveTab = tab;
  el.archive.querySelectorAll('.archive-tabs button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === tab);
  });
  el.archive.querySelectorAll('[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });
}

function openArchive(tab = 'drawings') {
  if (!el.archive) return;
  clearTimeout(archiveCloseTimer);
  state.archiveOpen = true;
  el.archive.hidden = false;
  setArchiveTab(tab);
  if (stadium && controls) controls.enabled = false;
  requestAnimationFrame(() => el.archive.classList.add('is-open'));
  document.body.classList.add('has-archive');
  el.archive.querySelector('.archive-close').focus({ preventScroll: true });
}

function closeArchive() {
  if (!el.archive || !state.archiveOpen) return;
  state.archiveOpen = false;
  el.archive.classList.remove('is-open');
  document.body.classList.remove('has-archive');
  archiveCloseTimer = setTimeout(() => {
    el.archive.hidden = true;
    if (controls && !viewTween) controls.enabled = true;
  }, 480);
}

function bindArchive() {
  document.querySelectorAll('[data-archive]').forEach((button) => {
    button.addEventListener('click', () => openArchive(button.dataset.archive));
  });
  document.querySelectorAll('[data-close-archive]').forEach((button) => {
    button.addEventListener('click', closeArchive);
  });
  el.archive.querySelectorAll('.archive-tabs button').forEach((button) => {
    button.addEventListener('click', () => setArchiveTab(button.dataset.tab));
  });
  el.drawingList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-drawing-index]');
    if (!button) return;
    selectDrawing(Number(button.dataset.drawingIndex), { scroll: true });
  });
  el.zoomButton.addEventListener('click', (event) => {
    event.stopPropagation();
    el.drawingStage.classList.toggle('is-zoomed');
  });
  el.drawingStage.addEventListener('click', () => {
    el.drawingStage.classList.toggle('is-zoomed');
  });
  el.drawingImage.addEventListener('load', () => el.drawingImage.classList.add('is-loaded'));
  el.drawingImage.addEventListener('error', () => {
    el.drawingImage.alt = '图纸加载失败';
    showToast('图纸图像未能加载，请检查 assets/drawings 目录');
  });
  if (el.fallbackOpen) el.fallbackOpen.addEventListener('click', () => openArchive('drawings'));
}

/* --------------------------------------------------------------------------
   Renderer / scene
   -------------------------------------------------------------------------- */

function initRenderer() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: el.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
  } catch (error) {
    console.error(error);
    showFallback();
    return false;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.3 : 1.65));
  renderer.setSize(el.app.clientWidth, el.app.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = !IS_MOBILE;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x07100f, 1);

  el.canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showToast('图形上下文已丢失，请刷新页面');
  });
  return true;
}

function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a1715, 0.0011);

  camera = new THREE.PerspectiveCamera(
    IS_MOBILE ? 48 : 37,
    el.app.clientWidth / el.app.clientHeight,
    0.5,
    3200,
  );
  camera.position.set(430, 158, 505);

  controls = new OrbitControls(camera, el.canvas);
  controls.target.set(0, 18, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.82;
  controls.zoomSpeed = 1.1;
  controls.panSpeed = 0.95;
  controls.minDistance = 20;
  controls.maxDistance = 850;
  controls.maxPolarAngle = Math.PI * 0.493;
  controls.minPolarAngle = 0.05;
  controls.screenSpacePanning = false;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.32;
  controls.addEventListener('start', () => {
    dismissMouseHint();
    if (viewTween) {
      viewTween = null;
      controls.enabled = true;
    }
  });
  controls.update();

  skyUniforms = {
    uTop: { value: new THREE.Color(0x07131d) },
    uHorizon: { value: new THREE.Color(0x142632) },
    uGround: { value: new THREE.Color(0x07100f) },
    uSunDir: { value: new THREE.Vector3(0, -0.4, 1) },
    uMoonDir: { value: new THREE.Vector3(0, 0.6, -1) },
    uSunColor: { value: new THREE.Color(0xffc188) },
    uMoonColor: { value: new THREE.Color(0xbfe2ff) },
    uSunStrength: { value: 0 },
    uMoonStrength: { value: 0.8 },
    uStars: { value: 0.8 },
    uTime: { value: 0 },
  };

  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform vec3 uSunDir;
      uniform vec3 uMoonDir;
      uniform vec3 uSunColor;
      uniform vec3 uMoonColor;
      uniform float uSunStrength;
      uniform float uMoonStrength;
      uniform float uStars;
      uniform float uTime;
      varying vec3 vDir;

      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.58));

        float band = exp(-abs(dir.y) * 18.0);
        col = mix(col, uHorizon * 0.92, band * 0.24);

        float sd = max(dot(dir, normalize(uSunDir)), 0.0);
        float disk = smoothstep(0.99955, 0.99986, sd);
        float glow = pow(sd, 18.0) * 0.16 + pow(sd, 220.0) * 0.3;
        col += uSunColor * (disk * 2.5 + glow) * uSunStrength;

        float md = max(dot(dir, normalize(uMoonDir)), 0.0);
        float moonDisk = smoothstep(0.99955, 0.99986, md);
        float moonGlow = pow(md, 110.0) * 0.08;
        col += uMoonColor * (moonDisk * 1.3 + moonGlow) * uMoonStrength;

        vec3 starCell = floor(dir * 470.0);
        float starHash = hash31(starCell);
        float star = smoothstep(0.9976, 1.0, starHash) * smoothstep(0.02, 0.14, dir.y);
        float twinkle = 0.58 + 0.42 * sin(uTime * 1.6 + starHash * 100.0);
        col += vec3(0.72, 0.84, 1.0) * star * twinkle * uStars;

        float below = smoothstep(0.0, -0.19, dir.y);
        col = mix(col, uGround, below * 0.85);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(2100, 48, 32), skyMaterial);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);

  hemiLight = new THREE.HemisphereLight(0x9fc2c7, 0x26352c, 0.55);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xffe9c8, 2.4);
  sunLight.position.set(280, 340, 260);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(IS_MOBILE ? 1536 : 3072, IS_MOBILE ? 1536 : 3072);
  sunLight.shadow.camera.left = -330;
  sunLight.shadow.camera.right = 330;
  sunLight.shadow.camera.top = 330;
  sunLight.shadow.camera.bottom = -330;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 1250;
  // The ortho bounds only take effect once the projection is rebuilt.
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.shadow.bias = -0.00018;
  sunLight.shadow.normalBias = 0.45;
  sunLight.target.position.set(0, 0, 0);
  scene.add(sunLight, sunLight.target);

  moonLight = new THREE.DirectionalLight(0xbcd4e6, 0);
  moonLight.position.set(-150, 340, -110);
  moonLight.target.position.set(0, 6, 0);
  scene.add(moonLight, moonLight.target);

  fieldFill = new THREE.PointLight(0xdff8e9, 0, 280, 1.5);
  fieldFill.position.set(0, 25, 0);
  scene.add(fieldFill);

  const floodPositions = [
    [-68, 35, 80],
    [68, 35, 80],
    [-68, 35, -80],
    [68, 35, -80],
  ];
  floodPositions.forEach(([x, y, z]) => {
    const light = new THREE.SpotLight(0xf6fff6, 0, 320, 0.54, 0.68, 1.6);
    light.position.set(x, y, z);
    light.target.position.set(0, 0, 0);
    light.castShadow = false;
    scene.add(light, light.target);
    fieldFloodlights.push(light);
  });

  for (let i = 0; i < 4; i++) {
    const theta = (i / 4) * TAU + PI / 4;
    const light = new THREE.PointLight(0xd7fff0, 0, 210, 1.35);
    light.position.set(Math.cos(theta) * 164, 7.5, Math.sin(theta) * 154);
    scene.add(light);
    facadeWashLights.push(light);
  }

  // The bowl is washed from above at night by the moon key light (see
  // applyEnvironment): a raking down-light makes every tread read as a row,
  // which is what the seats lose when they are only lifted by emissive.


  makeEnvironment();
  initComposer();
}

function makeEnvironment() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#53798d');
  grad.addColorStop(0.48, '#aebdb7');
  grad.addColorStop(0.55, '#a89f8c');
  grad.addColorStop(1, '#26302a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  const glow = ctx.createRadialGradient(770, 150, 4, 770, 150, 290);
  glow.addColorStop(0, 'rgba(255,248,226,.8)');
  glow.addColorStop(1, 'rgba(255,248,226,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  envMap = pmrem.fromEquirectangular(texture).texture;
  texture.dispose();
  pmrem.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = 0.62;
}

function initComposer() {
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(el.app.clientWidth, el.app.clientHeight);
  composer.addPass(new RenderPass(scene, camera));

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(el.app.clientWidth, el.app.clientHeight),
    0.32,
    0.38,
    0.9,
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

/* --------------------------------------------------------------------------
   Environment / sun / lighting
   -------------------------------------------------------------------------- */

const SKY_STOPS = [
  {
    h: 0,
    top: '#01050c', horizon: '#081720', ground: '#040a09', fog: '#07120f',
    sunColor: '#ffd4a2', sun: 0, hemi: 0.16, exposure: 0.82, density: 0.0015, stars: 1,
  },
  {
    h: 4.7,
    top: '#01050c', horizon: '#0a1a23', ground: '#040a09', fog: '#07120f',
    sunColor: '#ffd4a2', sun: 0, hemi: 0.17, exposure: 0.83, density: 0.0015, stars: 1,
  },
  {
    h: 6.0,
    top: '#23334c', horizon: '#b97a63', ground: '#111c17', fog: '#4b5a58',
    sunColor: '#ffb17a', sun: 0.7, hemi: 0.36, exposure: 0.92, density: 0.0012, stars: 0.18,
  },
  {
    h: 7.4,
    top: '#5f89a2', horizon: '#d8d9c8', ground: '#24352b', fog: '#8e9c98',
    sunColor: '#ffe5bd', sun: 2.2, hemi: 0.62, exposure: 1.0, density: 0.0009, stars: 0,
  },
  {
    h: 12,
    top: '#3f86ae', horizon: '#d8e8e8', ground: '#304235', fog: '#9baa9f',
    sunColor: '#fff7e7', sun: 3.35, hemi: 0.78, exposure: 1.05, density: 0.0007, stars: 0,
  },
  {
    h: 15.0,
    top: '#79a2b9', horizon: '#efdfc2', ground: '#333d30', fog: '#b6b5a4',
    sunColor: '#ffd9a8', sun: 2.9, hemi: 0.66, exposure: 1.03, density: 0.0008, stars: 0,
  },
  {
    h: 16.6,
    top: '#7c9cb2', horizon: '#f6cf9c', ground: '#3a3a2c', fog: '#c4ab8c',
    sunColor: '#ffc482', sun: 2.95, hemi: 0.5, exposure: 1.02, density: 0.0006, stars: 0,
  },
  {
    h: 17.6,
    top: '#5a7a97', horizon: '#f4a878', ground: '#2c3229', fog: '#a8866c',
    sunColor: '#ff9f52', sun: 2.55, hemi: 0.4, exposure: 1.0, density: 0.00068, stars: 0,
  },
  {
    h: 18.4,
    top: '#3a4f6c', horizon: '#dc7a52', ground: '#1b241e', fog: '#6f5f52',
    sunColor: '#ff7f3f', sun: 1.15, hemi: 0.32, exposure: 0.97, density: 0.0009, stars: 0.08,
  },
  {
    h: 19.05,
    top: '#0c1a29', horizon: '#253545', ground: '#08120f', fog: '#15231f',
    sunColor: '#ffc095', sun: 0.08, hemi: 0.24, exposure: 0.92, density: 0.00135, stars: 0.5,
  },
  {
    h: 20.4,
    top: '#020812', horizon: '#091822', ground: '#030908', fog: '#06100e',
    sunColor: '#ffd4a2', sun: 0, hemi: 0.15, exposure: 0.84, density: 0.0015, stars: 1,
  },
  {
    h: 24,
    top: '#01050c', horizon: '#081720', ground: '#040a09', fog: '#07120f',
    sunColor: '#ffd4a2', sun: 0, hemi: 0.16, exposure: 0.82, density: 0.0015, stars: 1,
  },
];

const colorCache = new Map();
function stopColor(hex) {
  if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex));
  return colorCache.get(hex);
}

function sampleSky(hour) {
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (hour >= SKY_STOPS[i].h && hour <= SKY_STOPS[i + 1].h) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      break;
    }
  }
  const raw = (hour - a.h) / Math.max(0.0001, b.h - a.h);
  const t = smoothstep(0, 1, raw);
  const mixColor = (key) => stopColor(a[key]).clone().lerp(stopColor(b[key]), t);
  return {
    top: mixColor('top'),
    horizon: mixColor('horizon'),
    ground: mixColor('ground'),
    fog: mixColor('fog'),
    sunColor: mixColor('sunColor'),
    sun: lerp(a.sun, b.sun, t),
    hemi: lerp(a.hemi, b.hemi, t),
    exposure: lerp(a.exposure, b.exposure, t),
    density: lerp(a.density, b.density, t),
    stars: lerp(a.stars, b.stars, t),
  };
}

function getSolarState(hour) {
  const solar = Math.sin(((hour - 6) / 12) * PI);
  const altitude = Math.asin(clamp(solar, -1, 1)) * 0.7;
  const azimuth = ((hour - 6) / 12) * PI + 0.45;
  const dir = new THREE.Vector3(
    Math.cos(azimuth) * Math.cos(altitude),
    Math.sin(altitude),
    Math.sin(azimuth) * Math.cos(altitude),
  ).normalize();
  return {
    solar,
    altitude,
    dir,
    // The rig comes up while the sun is still low in the sky, so dusk already
    // reads as "lights on" instead of waiting for full dark.
    night: 1 - smoothstep(-0.02, 0.34, solar),
    daylight: smoothstep(0.0, 0.32, solar),
    twilight: Math.exp(-Math.pow((solar + 0.02) / 0.18, 2)),
  };
}

function phaseForHour(hour) {
  if (hour < 5.1) return '深夜';
  if (hour < 6.9) return '黎明';
  if (hour < 10.8) return '清晨';
  if (hour < 13.8) return '正午';
  if (hour < 17.2) return '午后';
  if (hour < 18.7) return '黄昏';
  if (hour < 20.1) return '暮色';
  return '夜幕';
}

function applyEnvironment() {
  if (!scene || !stadium) return;
  const sky = sampleSky(state.hour);
  const solar = getSolarState(state.hour);
  state.night = solar.night;

  skyUniforms.uTop.value.copy(sky.top);
  skyUniforms.uHorizon.value.copy(sky.horizon);
  skyUniforms.uGround.value.copy(sky.ground);
  skyUniforms.uSunColor.value.copy(sky.sunColor);
  skyUniforms.uSunDir.value.copy(solar.dir);
  skyUniforms.uSunStrength.value = clamp(sky.sun / 3.05, 0, 1) * 0.9 + solar.twilight * 0.3;
  skyUniforms.uMoonDir.value.set(-solar.dir.x, Math.max(0.25, 0.7 - solar.altitude), -solar.dir.z).normalize();
  skyUniforms.uMoonStrength.value = solar.night * 0.9;
  skyUniforms.uStars.value = sky.stars;

  scene.fog.color.copy(sky.fog);
  scene.fog.density = sky.density;
  hemiLight.color.copy(sky.horizon);
  hemiLight.groundColor.set(0x27352b);
  hemiLight.intensity = sky.hemi;
  state.hemiBase = sky.hemi;
  // The image based ambient has to fall away with the sun, otherwise the bowl
  // keeps a flat daytime fill long after dark.
  state.envBase = 0.19 + 0.46 * solar.daylight;
  scene.environmentIntensity = state.envBase;

  if (solar.dir.y > -0.06) {
    sunLight.position.copy(solar.dir).multiplyScalar(540);
  } else {
    sunLight.position.set(280, 340, 260);
  }
  sunLight.color.copy(sky.sunColor);
  sunLight.intensity = sky.sun;
  // A stronger, higher night key: it rakes down the terraces so every row of
  // seats keeps the tread/riser contrast it has in daylight.
  moonLight.intensity = solar.night * 0.5;
  moonLight.color.set(0xc3d8e8);
  // The canopy banks are what floodlights the pitch: switching them off has to
  // take the pitch rig with it, or the bowl would still read as a lit event.
  const pitch = state.lightsOff ? 0 : 1;
  fieldFill.intensity = solar.night * 62 * pitch;
  fieldFill.color.set(0xe1fff1);

  fieldFloodlights.forEach((light) => {
    light.intensity = solar.night * 1750 * pitch;
    light.angle = 0.37;
    light.penumbra = 0.8;
  });
  facadeWashLights.forEach((light) => {
    // The lights-off switch leaves the facade completely unlit.
    light.intensity = solar.night * (state.lightsOff ? 0 : 34);
    light.color.set(LIGHT_MODES[state.mode].accent);
  });

  if (renderer) renderer.toneMappingExposure = sky.exposure;
  if (bloomPass) bloomPass.strength = 0.07 + solar.night * 0.19;

  stadium.updateAtmosphere({ night: solar.night, lightMode: LIGHT_MODES[state.mode] });
  // The green skin is shaded by the real sun: dark and warm when the sun is low,
  // full value at noon, dropping back under the night rig after sunset.
  stadium.setSunlight({ altitude: solar.altitude });
  stadium.setSky({
    skyTop: sky.top,
    skyHorizon: sky.horizon,
    sunDir: solar.dir,
    sunColor: sky.sunColor,
    sunStrength: clamp(sky.sun / 3.05, 0, 1),
    night: solar.night,
  });

  updateTimeUI();
  const phase = phaseForHour(state.hour);
  el.app.dataset.phase = ['夜幕', '深夜'].includes(phase)
    ? 'night'
    : ['黄昏', '暮色', '黎明'].includes(phase)
      ? 'dusk'
      : 'day';
  state.envDirty = false;
}

function updateTimeUI() {
  const hours = Math.floor(state.hour);
  const minutes = Math.floor((state.hour - hours) * 60);
  el.clock.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  el.timePhase.textContent = phaseForHour(state.hour);
  const solar = getSolarState(state.hour);
  const alt = (solar.altitude * 180) / PI;
  el.sunNote.textContent = `太阳高度 ${alt >= 0 ? '+' : ''}${alt.toFixed(1)}° · 深圳 22.6°N`;
  el.timeRange.value = String(state.hour);
  el.timeRange.setAttribute('aria-valuetext', `${el.clock.textContent}，${el.timePhase.textContent}`);

  let nearest = null;
  let nearestDistance = Infinity;
  document.querySelectorAll('.preset-row button').forEach((button) => {
    const target = Number(button.dataset.hour);
    const distance = Math.abs(target - state.hour);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = button;
    }
    button.classList.remove('is-active');
  });
  if (nearest && nearestDistance < 0.35) nearest.classList.add('is-active');
}

function setHour(hour) {
  state.hour = clamp(hour, 0, 24);
  state.envDirty = true;
  updateTimeUI();
}

function setLightMode(modeId, announce = true) {
  const mode = LIGHT_MODES[modeId];
  if (!mode) return;
  state.mode = modeId;
  stadium?.setLightMode(mode);
  document.querySelectorAll('.light-option').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === modeId);
  });
  el.lightModeName.textContent = mode.name;
  el.lightDesc.textContent = mode.desc;
  state.envDirty = true;
  if (announce) showToast(`建筑灯效 · ${mode.name}`);
}

function updateGala(time) {
  if (state.mode !== 'gala') return;
  const accent = new THREE.Color().setHSL((time * 0.055) % 1, 0.82, 0.6);
  facadeWashLights.forEach((light, index) => {
    light.color.copy(accent).offsetHSL(index * 0.02, 0, 0);
  });
}

/* --------------------------------------------------------------------------
   Camera
   -------------------------------------------------------------------------- */

// QA only: ?debug=1&cam=x,y,z&look=x,y,z parks the camera on an exact pose, so a
// headless still can be taken from any angle without touching the UI.
function applyDebugCamera() {
  if (!camera || !params.get('cam')) return;
  const cam = params.get('cam').split(',').map(Number);
  const look = (params.get('look') || '0,30,0').split(',').map(Number);
  if (cam.some(Number.isNaN) || look.some(Number.isNaN)) return;
  camera.position.set(cam[0], cam[1], cam[2]);
  controls.target.set(look[0], look[1], look[2]);
  camera.lookAt(controls.target);
  controls.update();
}

function setViewInstant(viewName) {
  const view = VIEWS[viewName];
  if (!view || !camera) return;
  state.view = viewName;
  viewTween = null;
  camera.position.set(...view.position);
  controls.target.set(...view.target);
  camera.fov = view.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
  controls.enabled = true;
  controls.update();
  updateViewUI();
  applyDebugCamera();
}

function flyTo(viewName, duration = 1.35, options = {}) {
  const view = VIEWS[viewName];
  if (!view || !camera || state.archiveOpen) return;
  const target = new THREE.Vector3(...view.target);
  const position = new THREE.Vector3(...view.position);
  viewTween = {
    startedAt: performance.now(),
    duration,
    fromPosition: camera.position.clone(),
    toPosition: position,
    fromTarget: controls.target.clone(),
    toTarget: target,
    fromFov: camera.fov,
    toFov: view.fov,
    intro: Boolean(options.intro),
  };
  controls.enabled = false;
  controls.autoRotate = false;
  state.view = viewName;
  updateViewUI();
}

function updateViewUI() {
  document.querySelectorAll('.dock-button[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === state.view);
  });
  document.body.classList.toggle('hero-hidden', !['shore', 'orbit'].includes(state.view));
  const view = VIEWS[state.view];
  if (!view) return;
  const index = Object.keys(VIEWS).indexOf(state.view) + 1;
  el.captionIndex.textContent = String(index).padStart(2, '0');
  el.captionTitle.textContent = viewTitles[state.view];
  el.captionText.textContent = view.caption;
}

function tickCamera(dt) {
  if (walk.active) {
    tickWalk(dt);
    return;
  }
  if (!viewTween) {
    controls.update();
    return;
  }
  const raw = clamp((performance.now() - viewTween.startedAt) / (viewTween.duration * 1000), 0, 1);
  const e = easeInOutCubic(raw);
  camera.position.lerpVectors(viewTween.fromPosition, viewTween.toPosition, e);
  controls.target.lerpVectors(viewTween.fromTarget, viewTween.toTarget, e);
  camera.fov = lerp(viewTween.fromFov, viewTween.toFov, e);
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);

  if (raw >= 1) {
    const finishedIntro = viewTween.intro;
    viewTween = null;
    controls.enabled = true;
    controls.update();
    if (finishedIntro) dismissMouseHint();
  }
}

/* --------------------------------------------------------------------------
   First-person walk
   The pitch and the club tier both have a walk volume defined by the stadium
   builder, so the player always stands on the real floor.
   -------------------------------------------------------------------------- */

const LOOK_SPEED = 0.0028;
const WALK_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
];

const WALK_HINTS = {
  free: ['W A S D 平移', '鼠标 转向', '滚轮 变焦', 'Space 上升', 'Shift 下降', 'M 指针', 'ESC 退出'],
  stand: ['W A S D 移动', '鼠标 转向', '滚轮 变焦', 'Shift 加速', 'M 指针', 'ESC 退出'],
  field: ['W A S D 移动', '鼠标 转向', '滚轮 变焦', 'Shift 加速', 'M 指针', 'ESC 退出'],
};

function walkArea(name) {
  return stadium?.walkAreas?.[name] || null;
}

function walkQuaternion(yaw, pitch) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
}

// Distance from the ellipse centre to its outline along a polar angle.
function ellipseRadius(ax, az, phi) {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return 1 / Math.sqrt((c / ax) ** 2 + (s / az) ** 2);
}

// The tier parameter t that puts the ellipse outline exactly at radius r.
function tierT(area, phi, r) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) * 0.5;
    const ax = lerp(area.ax0, area.ax1, mid);
    const az = lerp(area.az0, area.az1, mid);
    if (ellipseRadius(ax, az, phi) < r) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

// The third tier settles towards the two ends. Mirror the builder's profile so
// the walker always stands on the real step.
function settleDrop(area, phi) {
  if (!area.settle) return 0;
  const t = ((phi % TAU) + TAU) % TAU;
  const d = Math.min(Math.abs(t - HALF_PI), Math.abs(t - PI * 1.5)) / HALF_PI;
  return -area.settle.amount * smoothstep(0.03, area.settle.half / HALF_PI, d);
}

function spawnFor(name, area) {
  if (name === 'field') {
    return new THREE.Vector3(area.spawn[0], area.floor + area.eye, area.spawn[1]);
  }
  if (area.free) {
    return new THREE.Vector3(...area.spawn);
  }
  const ax = lerp(area.ax0, area.ax1, area.spawnT);
  const az = lerp(area.az0, area.az1, area.spawnT);
  const y = area.y0 + area.spawnT * area.rows * area.rise
    + settleDrop(area, area.spawnTheta) * area.spawnT
    + area.eye;
  return new THREE.Vector3(
    ax * Math.cos(area.spawnTheta),
    y,
    az * Math.sin(area.spawnTheta),
  );
}

// Keep the walker inside the sunken pit.
function clampToPit(area, x, z) {
  const k = Math.hypot(x / area.limitX, z / area.limitZ);
  if (k <= 1) return { x, z };
  return { x: x / k, z: z / k };
}

// Project a point back onto the stepped tier, its concourse platform or the
// wall between them. The wall only opens at the ten entrance portals.
function projectToStands(area, x, z) {
  let phi = Math.atan2(z, x);
  if (area.spans) {
    const turn = ((phi % TAU) + TAU) % TAU;
    let best = turn;
    let bestGap = Infinity;
    for (const [ta, tb] of area.spans) {
      const inside = clamp(turn, ta, tb);
      const gap = Math.abs(inside - turn);
      if (gap < bestGap) {
        bestGap = gap;
        best = inside;
      }
    }
    phi = best > PI ? best - TAU : best;
  }
  const r = Math.hypot(x, z);
  const rIn = ellipseRadius(area.ax0, area.az0, phi) + 0.55;
  const rTop = ellipseRadius(area.ax1, area.az1, phi);
  const platform = area.platform;
  const angleGap = (a, b) => Math.abs(((a - b + PI * 3) % TAU) - PI);
  const exit = platform?.exit || null;
  const facadeR = exit ? ellipseRadius(exit.ax, exit.az, phi) : 0;
  const atExit = exit
    ? exit.doors.some((door) => angleGap(phi, door.theta) < door.half)
    : false;
  const outside = Boolean(exit) && r > facadeR;
  let rOut = platform
    ? ellipseRadius(platform.ax, platform.az, phi)
    : rTop - 0.25;
  if (exit && atExit) rOut = exit.radius;
  let target = clamp(r, Math.min(rIn, rOut), rOut);
  if (exit && outside && !atExit) {
    // Already outside and out of a doorway: stay outside the skin rather than
    // being pulled back through the glass.
    target = Math.max(target, facadeR + 0.35);
  }

  if (platform && !atExit && !outside) {
    const rWall = ellipseRadius(platform.wallAx, platform.wallAz, phi);
    const clearance = 0.85;
    const atPortal = platform.doors.some((door) => angleGap(phi, door.theta) < door.half + 0.012);
    if (!atPortal && Math.abs(target - rWall) < clearance) {
      const here = Math.hypot(walk.position.x, walk.position.z);
      target = clamp(here < rWall ? rWall - clearance : rWall + clearance, rIn, rOut);
    }
  }

  let y;
  if (exit && target > facadeR - 0.4) {
    // Threshold ramp: the concourse is 1.2 m below the plaza outside.
    y = lerp(platform.y, 0, clamp((target - facadeR) / 3.0, 0, 1));
  } else if (platform && target > rTop) {
    y = platform.y;
  } else {
    const t = tierT(area, phi, target);
    y = area.y0 + t * area.rows * area.rise + settleDrop(area, phi) * t;
  }
  return { x: target * Math.cos(phi), z: target * Math.sin(phi), y };
}

function setWalkZoom(value) {
  walk.fov = clamp(value, 22, 100);
  if (camera) {
    camera.fov = walk.fov;
    camera.updateProjectionMatrix();
  }
  if (el.walkZoom) el.walkZoom.textContent = `视角 ${Math.round(walk.fov)}°`;
}

function zoomWalk(delta) {
  if (!walk.active) return;
  setWalkZoom(walk.fov * Math.exp(delta * 0.0014));
}

function updateWalkHud(visible, area) {
  if (!el.walkHud) return;
  el.walkHud.hidden = !visible;
  if (!visible) return;
  if (area && el.walkAreaName) el.walkAreaName.textContent = area.label;
  if (el.walkHint) {
    const items = area?.free ? WALK_HINTS.free : area?.tier ? WALK_HINTS.stand : WALK_HINTS.field;
    el.walkHint.innerHTML = items
      .map((text) => `<span${text.includes('滚轮') ? ' class="walk-hud__wheel"' : ''}>${text}</span>`)
      .join('');
  }
  if (el.walkTiers) {
    const tier = area?.tier || 0;
    el.walkTiers.hidden = !tier;
    el.walkTiers.querySelectorAll('[data-tier]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.tier) === tier);
    });
  }
  if (area) setWalkZoom(area.fov);
}

function requestWalkLock() {
  if (IS_MOBILE || !el.canvas || !el.canvas.requestPointerLock) return;
  try {
    const request = el.canvas.requestPointerLock();
    if (request && typeof request.catch === 'function') request.catch(() => {});
  } catch (error) {
    // Pointer lock can be refused; dragging still turns the head.
  }
}

// M calls the cursor back in any first-person mode, so the panels can be used
// without leaving the view; pressing it again captures the pointer.
function setCursorFree(free) {
  if (!walk.active) {
    showToast('鼠标指针可用 · 拖动画面或用底部按钮切换视角');
    return;
  }
  walk.cursorFree = free;
  document.body.classList.toggle('cursor-free', free);
  if (free) {
    if (document.pointerLockElement === el.canvas) document.exitPointerLock();
    showToast('鼠标指针已呼出 · 再按 M 收回（可直接点击界面）');
  } else {
    requestWalkLock();
    showToast('鼠标指针已收回 · 移动鼠标转向');
  }
}

const STAND_AREAS = { 1: 'stands1', 2: 'stands2', 3: 'stands3' };

function resolveWalkArea(name) {
  if (name === 'stands') return STAND_AREAS[state.standTier] || 'stands2';
  return name;
}

function enterWalk(name, { lock = true } = {}) {
  const key = resolveWalkArea(name);
  const area = walkArea(key);
  if (!area || !camera) return;
  if (walk.active && walk.area === key) {
    if (lock) requestWalkLock();
    return;
  }
  if (walk.active) leaveWalk({ fly: false });

  const spawn = spawnFor(key, area);
  walk.active = true;
  walk.area = key;
  walk.keys.clear();
  walk.yaw = area.yaw;
  walk.pitch = area.pitch;
  walk.fov = area.fov;
  walk.cursorFree = false;
  walk.position.copy(spawn);
  if (area.tier) state.standTier = area.tier;
  walk.intro = {
    startedAt: performance.now(),
    duration: 900,
    fromPosition: camera.position.clone(),
    fromQuaternion: camera.quaternion.clone(),
    fromFov: camera.fov,
  };
  viewTween = null;
  controls.enabled = false;
  controls.autoRotate = false;
  setTierPicker(false);
  state.view = area.view || key;
  updateViewUI();
  dismissMouseHint();
  document.body.classList.add('walk-mode');
  document.body.classList.toggle('walk-stands', Boolean(area.tier));
  updateWalkHud(true, area);
  showToast(area.free
    ? '自由视角 · WASD 平移 · Space 上升 · Shift 下降 · 滚轮变焦 · ESC 退出'
    : `${area.label}人物视角 · WASD 移动 · 鼠标转向 · 滚轮变焦 · ESC 退出`);
  if (lock) requestWalkLock();
}

function leaveWalk({ fly = true } = {}) {
  if (!walk.active) return;
  const name = walk.area;
  const area = walkArea(name);
  walk.active = false;
  walk.area = null;
  walk.keys.clear();
  walk.intro = null;
  walk.dragging = false;
  walk.lastPointer = null;
  walk.hadLock = false;
  walk.cursorFree = false;
  document.body.classList.remove('walk-mode', 'walk-locked', 'walk-stands', 'cursor-free');
  updateWalkHud(false);
  if (document.pointerLockElement === el.canvas) document.exitPointerLock();
  if (!fly) return;

  const view = VIEWS[area?.view || name] || VIEWS.orbit;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  viewTween = {
    startedAt: performance.now(),
    duration: 0.9,
    fromPosition: camera.position.clone(),
    toPosition: new THREE.Vector3(...view.position),
    fromTarget: camera.position.clone().add(direction.multiplyScalar(30)),
    toTarget: new THREE.Vector3(...view.target),
    fromFov: camera.fov,
    toFov: view.fov,
    intro: false,
  };
  controls.enabled = false;
  state.view = area?.view || name;
  updateViewUI();
  if (area) showToast(`${area.label}人物视角已关闭`);
}

function tickWalk(dt) {
  if (!walk.active) return;
  const area = walkArea(walk.area);
  if (!area) return;

  if (walk.intro) {
    const raw = clamp((performance.now() - walk.intro.startedAt) / walk.intro.duration, 0, 1);
    const e = easeInOutCubic(raw);
    camera.position.lerpVectors(walk.intro.fromPosition, walk.position, e);
    camera.quaternion.slerpQuaternions(
      walk.intro.fromQuaternion,
      walkQuaternion(walk.yaw, walk.pitch),
      e,
    );
    camera.fov = lerp(walk.intro.fromFov, walk.fov, e);
    camera.updateProjectionMatrix();
    if (raw >= 1) walk.intro = null;
    return;
  }

  const keys = walk.keys;
  let forward = 0;
  let strafe = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;

  if (area.free) {
    // Free camera: nothing to stand on, so the keys drive a body that can fly.
    let lift = 0;
    if (keys.has('Space')) lift += 1;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) lift -= 1;
    if (forward || strafe || lift) {
      const step = area.speed * dt;
      const length = Math.hypot(forward, strafe) || 1;
      const f = forward / length;
      const s = strafe / length;
      const cp = Math.cos(walk.pitch);
      const sin = Math.sin(walk.yaw);
      const cos = Math.cos(walk.yaw);
      // Look direction, plus the horizontal right vector, plus world up.
      walk.position.x += (-sin * cp * f + cos * s) * step;
      walk.position.y += (Math.sin(walk.pitch) * f + lift) * step;
      walk.position.z += (-cos * cp * f - sin * s) * step;
      walk.position.y = clamp(walk.position.y, -12.5, 340);
      const radius = Math.hypot(walk.position.x, walk.position.z);
      if (radius > 900) {
        walk.position.x *= 900 / radius;
        walk.position.z *= 900 / radius;
      }
    }
    camera.position.copy(walk.position);
    camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
    return;
  }

  if (forward || strafe) {
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const step = (run ? area.run : area.speed) * dt;
    const length = Math.hypot(forward, strafe);
    const f = forward / length;
    const s = strafe / length;
    const sin = Math.sin(walk.yaw);
    const cos = Math.cos(walk.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const nx = walk.position.x + (-sin * f + cos * s) * step;
    const nz = walk.position.z + (-cos * f - sin * s) * step;
    if (walk.area === 'field') {
      const p = clampToPit(area, nx, nz);
      walk.position.set(p.x, area.floor + area.eye, p.z);
    } else {
      const p = projectToStands(area, nx, nz);
      walk.position.set(p.x, p.y + area.eye, p.z);
    }
  }

  camera.position.copy(walk.position);
  camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
}

function bindWalk() {
  if (el.walkExit) el.walkExit.addEventListener('click', () => leaveWalk());

  document.addEventListener('pointerlockchange', () => {
    walk.locked = document.pointerLockElement === el.canvas;
    if (walk.locked) {
      walk.hadLock = true;
      walk.cursorFree = false;
      document.body.classList.add('walk-locked');
      document.body.classList.remove('cursor-free');
    } else {
      document.body.classList.remove('walk-locked');
      // Esc releases the pointer lock first; use that as "step out" — unless the
      // player deliberately called the cursor back with M.
      if (walk.active && walk.hadLock && !walk.cursorFree) leaveWalk();
    }
  });

  document.addEventListener('mousemove', (event) => {
    if (!walk.active || walk.intro) return;
    let dx = 0;
    let dy = 0;
    if (walk.locked) {
      dx = event.movementX || 0;
      dy = event.movementY || 0;
    } else if (walk.dragging && walk.lastPointer) {
      dx = event.clientX - walk.lastPointer.x;
      dy = event.clientY - walk.lastPointer.y;
      walk.lastPointer = { x: event.clientX, y: event.clientY };
    }
    if (!dx && !dy) return;
    walk.yaw -= dx * LOOK_SPEED;
    walk.pitch = clamp(walk.pitch - dy * LOOK_SPEED, -1.32, 1.32);
  });

  const endDrag = () => {
    walk.dragging = false;
    walk.lastPointer = null;
  };
  el.canvas.addEventListener('pointerup', endDrag);
  el.canvas.addEventListener('pointercancel', endDrag);
  el.canvas.addEventListener('pointerleave', endDrag);

  document.addEventListener('keyup', (event) => walk.keys.delete(event.code));
  window.addEventListener('blur', () => walk.keys.clear());

  // Mouse wheel is the zoom: the wheel drives the lens, not the orbit rig.
  window.addEventListener('wheel', (event) => {
    if (!walk.active) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 420 : 1;
    zoomWalk(event.deltaY * unit);
  }, { passive: false });

  el.walkTiers?.querySelectorAll('[data-tier]').forEach((button) => {
    button.addEventListener('click', () => {
      enterWalk(STAND_AREAS[Number(button.dataset.tier)] || 'stands2');
    });
  });
}

/* --------------------------------------------------------------------------
   Tier picker & panel collapse
   -------------------------------------------------------------------------- */

function setTierPicker(open) {
  state.pickerOpen = open;
  if (!el.tierPicker) return;
  el.tierPicker.hidden = !open;
  el.tierPicker.classList.toggle('is-open', open);
  document.body.classList.toggle('tier-picker-open', open);
  el.tierPicker.querySelectorAll('[data-tier]').forEach((button) => {
    button.classList.toggle('is-active', Number(button.dataset.tier) === state.standTier);
  });
}

function bindTierPicker() {
  if (!el.tierPicker) return;
  el.tierPicker.querySelectorAll('[data-tier]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const tier = Number(button.dataset.tier) || 2;
      state.standTier = tier;
      setTierPicker(false);
      enterWalk(`stands${tier}`);
    });
  });
  document.addEventListener('pointerdown', (event) => {
    if (!state.pickerOpen) return;
    if (el.tierPicker.contains(event.target)) return;
    if (event.target.closest?.('[data-view="stands"]')) return;
    setTierPicker(false);
  });
}

function setPanelCollapsed(collapsed, { persist = true } = {}) {
  state.panelCollapsed = collapsed;
  el.panel?.classList.toggle('is-collapsed', collapsed);
  if (el.panelCollapse) el.panelCollapse.setAttribute('aria-expanded', String(!collapsed));
  if (!persist) return;
  try {
    localStorage.setItem('sdc.panelCollapsed', collapsed ? '1' : '0');
  } catch (error) {
    // Private mode: the state simply does not survive the reload.
  }
}

function bindPanelCollapse() {
  let stored = null;
  try {
    stored = localStorage.getItem('sdc.panelCollapsed');
  } catch (error) {
    stored = null;
  }
  setPanelCollapsed(stored === '1', { persist: false });
  el.panelCollapse?.addEventListener('click', () => {
    setPanelCollapsed(!state.panelCollapsed);
  });
}

/* --------------------------------------------------------------------------
   Structure / auto rotate
   -------------------------------------------------------------------------- */

function setStructure(enabled, announce = true) {
  state.structure = enabled;
  stadium?.setStructure(enabled);
  [el.structureButton, el.dockStructure].forEach((button) => {
    if (!button) return;
    if (button.id === 'structureButton') button.setAttribute('aria-checked', String(enabled));
    else button.setAttribute('aria-pressed', String(enabled));
    button.classList.toggle('is-active', enabled);
  });
  if (announce) showToast(enabled ? '结构透视 · 折面网格已显露' : '结构透视 · 恢复晶体表皮');
}

function setAutoRotate(enabled, announce = true) {
  state.autoRotate = enabled;
  [el.autoRotateButton, el.dockRotate].forEach((button) => {
    if (!button) return;
    if (button.id === 'autoRotateButton') button.setAttribute('aria-checked', String(enabled));
    else button.setAttribute('aria-pressed', String(enabled));
    button.classList.toggle('is-active', enabled);
  });
  if (controls) {
    controls.autoRotate = enabled;
    controls.autoRotateSpeed = 0.32;
  }
  if (announce) showToast(enabled ? '自动环绕已开启' : '自动环绕已关闭');
}

/* The two lamp switches are variants of the same rig, so they stay exclusive of
   each other — but neither of them touches the lights-off switch: that one only
   controls the facade wash, the skin and the pitch rig. */
function setStrobe(enabled, announce = true) {
  const stoppedFlicker = enabled && state.flicker;
  if (stoppedFlicker) setFlicker(false, false);
  state.strobe = enabled;
  stadium?.setStrobe(enabled);
  if (el.strobeButton) el.strobeButton.setAttribute('aria-checked', String(enabled));
  el.strobeButton?.classList.toggle('is-active', enabled);
  document.body.classList.toggle('strobe-on', enabled);
  if (!enabled) {
    applyEnvironment();
    if (bloomPass) bloomPass.strength = 0.07 + state.night * 0.19;
  }
  if (announce) {
    if (stoppedFlicker) showToast('灯组频闪 · 已从逐个闪烁切换回按组闪');
    else if (enabled && state.lightsOff) showToast('灯组频闪 · 关灯状态下灯组照样闪');
    else showToast(enabled ? '灯组频闪 · 全部灯具无序快闪' : '灯组频闪已关闭');
  }
}

/* Same as the bank strobe, but every one of the 100 fittings runs its own beat. */
function setFlicker(enabled, announce = true) {
  const stoppedStrobe = enabled && state.strobe;
  if (stoppedStrobe) setStrobe(false, false);
  state.flicker = enabled;
  stadium?.setAllFlicker(enabled);
  if (el.flickerButton) el.flickerButton.setAttribute('aria-checked', String(enabled));
  el.flickerButton?.classList.toggle('is-active', enabled);
  document.body.classList.toggle('flicker-on', enabled);
  if (!enabled) {
    applyEnvironment();
    if (bloomPass) bloomPass.strength = 0.07 + state.night * 0.19;
  }
  if (announce) {
    if (enabled && state.lightsOff) showToast('灯组逐个闪烁 · 关灯状态下灯组照样闪');
    else showToast(enabled ? '灯组逐个闪烁 · 100 盏灯各闪各的' : '灯组逐个闪烁已关闭');
  }
}

/* The canopy has its own master switch: the ten banks of floodlights under the
   opening ring. It is independent of the lights-off switch (which only kills the
   facade wash and the pitch rig) and of the two flashing switches. */
function setLampBanks(enabled, announce = true) {
  state.lampBanks = enabled;
  stadium?.setLampBanks(enabled);
  if (el.lampBanksButton) el.lampBanksButton.setAttribute('aria-checked', String(enabled));
  el.lampBanksButton?.classList.toggle('is-active', enabled);
  document.body.classList.toggle('lamp-banks-off', !enabled);
  if (announce) {
    const flashing = state.strobe || state.flicker;
    if (!enabled && flashing) showToast('顶棚灯组已关 · 频闪与逐个闪烁要重新打开灯组才看得到');
    else if (!enabled) showToast('顶棚灯组已关 · 100 盏投光灯全部熄灭');
    else showToast('顶棚灯组已开 · 100 盏投光灯点亮');
  }
}

/* Concert crowd: light sticks that walk the colour wheel on their own, and the
   phone flashes that sparkle across the stands. Independent of every lamp switch:
   they only light the audience. */
function setSticks(enabled, announce = true) {
  state.sticks = enabled;
  stadium?.setCrowdSticks(enabled);
  if (el.sticksButton) el.sticksButton.setAttribute('aria-checked', String(enabled));
  el.sticksButton?.classList.toggle('is-active', enabled);
  document.body.classList.toggle('crowd-sticks', enabled);
  if (announce) {
    showToast(enabled ? '荧光棒星海 · 看台已举成一片变色荧光海' : '荧光棒星海已关闭');
  }
}

function setFlash(enabled, announce = true) {
  state.flash = enabled;
  stadium?.setCrowdFlash(enabled);
  if (el.flashButton) el.flashButton.setAttribute('aria-checked', String(enabled));
  el.flashButton?.classList.toggle('is-active', enabled);
  document.body.classList.toggle('crowd-flash', enabled);
  if (announce) {
    showToast(enabled ? '观众闪光灯 · 看台上开始随机闪成星点' : '观众闪光灯已关闭');
  }
}

/* Lights off: the facade wash, the folded skin and the pitch rig go dark. The
   canopy lamps keep whatever the lamp switches tell them to do. */
function setLightsOff(enabled, announce = true) {
  state.lightsOff = enabled;
  stadium?.setLightsOff(enabled);
  if (el.lightsOffButton) el.lightsOffButton.setAttribute('aria-checked', String(enabled));
  el.lightsOffButton?.classList.toggle('is-active', enabled);
  document.body.classList.toggle('lights-off', enabled);
  state.envDirty = true;
  applyEnvironment();
  if (announce) {
    const flashing = state.strobe || state.flicker;
    if (enabled && flashing) {
      showToast('外立面与场地照明已关 · 顶棚灯组仍在闪');
    } else if (enabled && state.night < 0.2) {
      showToast('现在是白天，建筑灯本来就关着 · 切到「夜幕」看关灯效果');
    } else {
      showToast(enabled ? '外立面与顶棚灯组已关 · 只留场地照明' : '外立面与顶棚灯组已恢复');
    }
  }
}

/* --------------------------------------------------------------------------
   Fullscreen / hints
   -------------------------------------------------------------------------- */

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    showToast('当前浏览器未允许全屏');
  }
}

function dismissMouseHint() {
  if (state.hintDismissed || !el.mouseHint) return;
  state.hintDismissed = true;
  el.mouseHint.classList.add('is-hidden');
  clearTimeout(hintTimer);
}

/* --------------------------------------------------------------------------
   UI bindings
   -------------------------------------------------------------------------- */

function bindUI() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    if (!button.dataset.view) return;
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      if (view === 'stands') {
        // The stand view is really three views; ask which tier first.
        if (walk.active && walk.area?.startsWith('stands')) {
          setTierPicker(!state.pickerOpen);
        } else {
          setTierPicker(true);
        }
        return;
      }
      if (view === 'field') {
        enterWalk('field');
        return;
      }
      if (view === 'free') {
        enterWalk('free');
        return;
      }
      setTierPicker(false);
      if (walk.active) leaveWalk({ fly: false });
      flyTo(view);
    });
  });

  document.querySelectorAll('.preset-row button').forEach((button) => {
    button.addEventListener('click', () => setHour(Number(button.dataset.hour)));
  });

  el.timeRange.addEventListener('input', () => {
    setHour(Number.parseFloat(el.timeRange.value));
  });

  document.querySelectorAll('.light-option').forEach((button) => {
    button.addEventListener('click', () => setLightMode(button.dataset.mode));
  });

  el.structureButton?.addEventListener('click', () => setStructure(!state.structure));
  el.dockStructure?.addEventListener('click', () => setStructure(!state.structure));
  el.autoRotateButton?.addEventListener('click', () => setAutoRotate(!state.autoRotate));
  el.dockRotate?.addEventListener('click', () => setAutoRotate(!state.autoRotate));
  el.lampBanksButton?.addEventListener('click', () => setLampBanks(!state.lampBanks));
  el.strobeButton?.addEventListener('click', () => setStrobe(!state.strobe));
  el.flickerButton?.addEventListener('click', () => setFlicker(!state.flicker));
  el.sticksButton?.addEventListener('click', () => setSticks(!state.sticks));
  el.flashButton?.addEventListener('click', () => setFlash(!state.flash));
  el.lightsOffButton?.addEventListener('click', () => setLightsOff(!state.lightsOff));
  el.fullscreenButton?.addEventListener('click', toggleFullscreen);
  el.dismissHint?.addEventListener('click', dismissMouseHint);
  el.canvas.addEventListener('pointerdown', (event) => {
    if (walk.active) {
      walk.dragging = true;
      walk.lastPointer = { x: event.clientX, y: event.clientY };
      if (!walk.locked && !walk.cursorFree && !IS_MOBILE) requestWalkLock();
      return;
    }
    dismissMouseHint();
    if (controls && viewTween) {
      viewTween = null;
      controls.enabled = true;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.toLowerCase() === 'm') {
      setCursorFree(!walk.cursorFree);
      return;
    }
    const viewKeys = ['shore', 'orbit', 'elevation', 'field', 'stands', 'roof', 'free'];
    const isWalkKey = (name) => name === 'field' || name === 'stands' || name === 'free';

    if (walk.active) {
      if (event.key === 'Escape') {
        leaveWalk();
        return;
      }
      if (/^[1-7]$/.test(event.key)) {
        const next = viewKeys[Number(event.key) - 1];
        leaveWalk({ fly: false });
        if (isWalkKey(next)) enterWalk(next);
        else flyTo(next);
        return;
      }
      if (WALK_KEYS.includes(event.code)) {
        walk.keys.add(event.code);
        event.preventDefault();
      }
      return;
    }

    if (event.key === 'Escape') {
      if (state.pickerOpen) setTierPicker(false);
      else if (state.archiveOpen) closeArchive();
      return;
    }
    if (state.pickerOpen) {
      // While the tier picker is open, 1/2/3 choose the stand to enter.
      if (/^[1-3]$/.test(event.key)) {
        const tier = Number(event.key);
        state.standTier = tier;
        setTierPicker(false);
        enterWalk(`stands${tier}`);
      } else {
        setTierPicker(false);
      }
      return;
    }
    if (state.archiveOpen) return;
    if (/^[1-7]$/.test(event.key)) {
      const next = viewKeys[Number(event.key) - 1];
      if (next === 'stands') {
        setTierPicker(true);
        return;
      }
      if (isWalkKey(next)) enterWalk(next);
      else flyTo(next);
    } else if (event.key.toLowerCase() === 'r') {
      setAutoRotate(!state.autoRotate);
    } else if (event.key.toLowerCase() === 's') {
      setStructure(!state.structure);
    } else if (event.key.toLowerCase() === 'l') {
      const modes = Object.keys(LIGHT_MODES);
      setLightMode(modes[(modes.indexOf(state.mode) + 1) % modes.length]);
    } else if (event.key.toLowerCase() === 't') {
      setHour(state.night > 0.45 ? 13.4 : 19.2);
    } else if (event.key.toLowerCase() === 'k') {
      setStrobe(!state.strobe);
    } else if (event.key.toLowerCase() === 'g') {
      setFlicker(!state.flicker);
    } else if (event.key.toLowerCase() === 'o') {
      setLightsOff(!state.lightsOff);
    } else if (event.key.toLowerCase() === 'u') {
      setLampBanks(!state.lampBanks);
    } else if (event.key.toLowerCase() === 'v') {
      setSticks(!state.sticks);
    } else if (event.key.toLowerCase() === 'b') {
      setFlash(!state.flash);
    } else if (event.key.toLowerCase() === 'f') {
      toggleFullscreen();
    }
  });

  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', () => {
    el.fullscreenButton?.classList.toggle('is-active', Boolean(document.fullscreenElement));
  });

  hintTimer = setTimeout(dismissMouseHint, 9000);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = el.app.clientWidth;
  const height = el.app.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  composer?.setSize(width, height);
  bloomPass?.setSize(width, height);
}

/* --------------------------------------------------------------------------
   Animation
   -------------------------------------------------------------------------- */

function animate(now) {
  const seconds = now * 0.001;
  const dt = Math.min(0.06, lastFrame ? seconds - lastFrame : 0);
  lastFrame = seconds;
  elapsed += dt;

  if (skyUniforms) skyUniforms.uTime.value = elapsed;
  tickCamera(dt);
  stadium?.update(elapsed, dt);

  // While the lamps flash, the light they throw into the bowl flashes with them:
  // pitch floods, the field fill and a touch of skylight. The per-lamp random mode
  // behaves exactly the same way, it just blinks the 100 fittings separately.
  // A flashing rig is a lit rig, so this applies even with the lights-off switch
  // on: switch the strobe off and the pitch drops back to dark.
  if ((state.strobe || state.flicker) && stadium?.lampBanksMode) {
    const level = stadium.getStrobeLevel();
    const kick = 0.05 + level * 1.55;
    fieldFloodlights.forEach((light) => {
      light.intensity = 1750 * state.night * kick;
    });
    if (fieldFill) fieldFill.intensity = 62 * state.night * kick;
    if (hemiLight) hemiLight.intensity = (state.hemiBase || 0.2) * (0.7 + level * 0.9);
  }

  if (state.envDirty) applyEnvironment();
  if (state.mode === 'gala') updateGala(elapsed);

  if (composer) composer.render();
  else if (renderer) renderer.render(scene, camera);
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */

async function init() {
  if (params.get('ui') === '0') document.body.classList.add('hide-ui');
  if (IS_MOBILE) {
    Object.assign(VIEWS.shore, {
      position: [278, 158, 548],
      target: [0, 16, 0],
      fov: 54,
    });
    Object.assign(VIEWS.orbit, {
      position: [360, 240, 520],
      target: [0, 15, 0],
      fov: 54,
    });
    Object.assign(VIEWS.elevation, {
      position: [0, 28, 650],
      target: [0, 24, 0],
      fov: 50,
    });
  }
  populateArchive();
  bindArchive();
  bindUI();
  bindWalk();
  bindTierPicker();
  bindPanelCollapse();
  selectDrawing(0);

  if (!initRenderer()) {
    document.body.classList.add('is-ready');
    return;
  }

  initScene();
  if (state.structure) {
    el.structureButton?.setAttribute('aria-checked', 'true');
    el.dockStructure?.setAttribute('aria-pressed', 'true');
  }

  setBoot(10, '建立场地坐标');
  await nextFrame();
  setBoot(24, '展开 20 组三角折面');

  try {
    stadium = createStadium({
      detail: IS_MOBILE ? 0.82 : 1,
      onProgress: (progress, message) => {
        setBoot(12 + progress * 76, message);
      },
    });
    scene.add(stadium.group);
    if (params.get('debug') === '1') {
      window.__STADIUM__ = stadium;
      window.__SCENE__ = scene;
      window.__RENDERER__ = renderer;
      window.__APP__ = { camera, controls, state, setView: setViewInstant };
      document.body.dataset.seats = String(stadium.stats.seats);
      document.body.dataset.struts = String(stadium.stats.struts);
      // QA hook: ?cam=x,y,z&look=x,y,z pins the camera for a still.
      applyDebugCamera();
    }
    stadium.setLightMode(LIGHT_MODES[state.mode]);
    stadium.setLightsOff(state.lightsOff);
    // The two lamp switches are variants of one rig, so only they exclude each
    // other; the lights-off switch is independent of both.
    if (state.strobe && state.flicker) state.flicker = false;
    setStructure(state.structure, false);
    setLampBanks(state.lampBanks, false);
    setStrobe(state.strobe, false);
    setFlicker(state.flicker, false);
    setSticks(state.sticks, false);
    setFlash(state.flash, false);
    if (state.lightsOff) {
      el.lightsOffButton?.setAttribute('aria-checked', 'true');
      el.lightsOffButton?.classList.add('is-active');
      document.body.classList.add('lights-off');
    }
  } catch (error) {
    console.error(error);
    showFallback();
    return;
  }

  setBoot(94, '校准日轨与建筑灯效');
  updateTimeUI();
  applyEnvironment();
  setLightMode(state.mode, false);
  updateViewUI();
  setAutoRotate(false, false);

  if (state.structure) setStructure(true, false);

  await new Promise((resolve) => setTimeout(resolve, 320));
  finishBoot();
  renderer.setAnimationLoop(animate);

  if (params.get('archive')) {
    setTimeout(() => openArchive(params.get('archive')), 1500);
  }

  if (params.get('walk') === '1' && (state.view === 'field' || state.view === 'stands' || state.view === 'free')) {
    setTimeout(() => enterWalk(state.view), 700);
  }

  console.info(
    `[深圳大运中心体育场] seats=${stadium.stats.seats.toLocaleString()} struts=${stadium.stats.struts}`,
  );
  state.started = true;
}

init();
