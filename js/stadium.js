import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ==========================================================================
   深圳大运中心体育场 · 程序化几何
   The folded roof and facade are generated from 20 radial structural units.
   All dimensions are in metres.
   ========================================================================== */

const TAU = Math.PI * 2;
const PI = Math.PI;
const HALF_PI = PI / 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const OUTER_X = 145;
const OUTER_Z = 135.5;
const ROOF_TOP = 51.3;
const ROOF_VALLEY = 36.4;
const ROOF_INNER_Y = 34.8;
const RING_X = 90;
const RING_Z = 65;
const SECTORS = 20;
const SECTOR = TAU / SECTORS;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (v) => v - Math.floor(v);
const hash2 = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const hash3 = (a, b, c) => fract(Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453);

function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ellipsePoint(ax, az, theta, y = 0) {
  return new THREE.Vector3(ax * Math.cos(theta), y, az * Math.sin(theta));
}

function profile(theta) {
  const local = ((theta % SECTOR) + SECTOR) % SECTOR;
  return 1 - Math.abs((local / SECTOR) * 2 - 1);
}

function approxEllipsePerimeter(ax, az) {
  return PI * (3 * (ax + az) - Math.sqrt((3 * ax + az) * (ax + 3 * az)));
}

/* --------------------------------------------------------------------------
   Renderer-independent canvas textures
   -------------------------------------------------------------------------- */

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function createPitchTexture() {
  const w = 2048;
  const h = Math.round((68 / 105) * w);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(88);

  ctx.fillStyle = '#497344';
  ctx.fillRect(0, 0, w, h);

  const bands = 14;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(24, 60, 30, .18)' : 'rgba(163, 194, 132, .08)';
    ctx.fillRect((i / bands) * w, 0, w / bands + 1, h);
  }

  for (let i = 0; i < 12000; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const light = rand() > 0.5;
    ctx.fillStyle = light ? 'rgba(180, 207, 146, .10)' : 'rgba(10, 36, 18, .10)';
    ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }

  const mToPx = w / 105;
  const line = Math.max(2.5, 0.12 * mToPx);
  const margin = 1.4 * mToPx;
  const left = margin;
  const right = w - margin;
  const top = margin;
  const bottom = h - margin;
  const cx = w / 2;
  const cy = h / 2;

  ctx.strokeStyle = 'rgba(242, 246, 236, .92)';
  ctx.lineWidth = line;
  ctx.lineJoin = 'miter';

  ctx.strokeRect(left, top, right - left, bottom - top);

  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx, bottom);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 9.15 * mToPx, 0, TAU);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 0.32 * mToPx, 0, TAU);
  ctx.fillStyle = 'rgba(242, 246, 236, .95)';
  ctx.fill();

  const penaltyDepth = 16.5 * mToPx;
  const penaltyWidth = 40.32 * mToPx;
  const goalDepth = 5.5 * mToPx;
  const goalWidth = 18.32 * mToPx;
  const spot = 11 * mToPx;

  for (const side of [-1, 1]) {
    const goalX = side < 0 ? left : right;
    const boxX = side < 0 ? left : right - penaltyDepth;
    ctx.strokeRect(boxX, cy - penaltyWidth / 2, penaltyDepth, penaltyWidth);
    const areaX = side < 0 ? left : right - goalDepth;
    ctx.strokeRect(areaX, cy - goalWidth / 2, goalDepth, goalWidth);

    ctx.beginPath();
    ctx.arc(goalX + side * spot, cy, 0.3 * mToPx, 0, TAU);
    ctx.fillStyle = 'rgba(242, 246, 236, .95)';
    ctx.fill();

    ctx.beginPath();
    const arcCenterX = goalX + side * spot;
    if (side < 0) ctx.arc(arcCenterX, cy, 9.15 * mToPx, -0.93, 0.93);
    else ctx.arc(arcCenterX, cy, 9.15 * mToPx, PI - 0.93, PI + 0.93);
    ctx.stroke();

    const cornerR = 1 * mToPx;
    for (const y of [top, bottom]) {
      ctx.beginPath();
      if (side < 0) ctx.arc(left, y, cornerR, y === top ? 0 : -HALF_PI, y === top ? HALF_PI : 0);
      else ctx.arc(right, y, cornerR, y === top ? HALF_PI : PI, y === top ? PI : PI + HALF_PI);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createGrassTexture() {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(17);
  ctx.fillStyle = '#3f5741';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const v = rand();
    ctx.fillStyle = v > 0.55 ? 'rgba(112, 137, 94, .08)' : 'rgba(12, 30, 17, .09)';
    ctx.fillRect(rand() * 256, rand() * 256, 1, 1 + rand() * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(60, 60);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPavingTexture() {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(41);
  ctx.fillStyle = '#b7b8ae';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 8000; i++) {
    const v = rand();
    ctx.fillStyle = v > 0.5 ? 'rgba(255, 255, 250, .05)' : 'rgba(22, 29, 24, .055)';
    ctx.fillRect(rand() * size, rand() * size, 1, 1);
  }

  ctx.strokeStyle = 'rgba(53, 60, 53, .18)';
  ctx.lineWidth = 1;
  const cells = 8;
  for (let i = 0; i <= cells; i++) {
    const p = (i / cells) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.115, 0.115);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createBoardTexture() {
  const canvas = makeCanvas(1024, 64);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1715';
  ctx.fillRect(0, 0, 1024, 64);
  ctx.strokeStyle = 'rgba(120, 233, 191, .55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(1024, 2);
  ctx.moveTo(0, 61);
  ctx.lineTo(1024, 61);
  ctx.stroke();

  ctx.fillStyle = 'rgba(235, 242, 235, .9)';
  ctx.font = '500 19px Bahnschrift, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '4px';
  for (let i = 0; i < 3; i++) {
    ctx.fillText('SHENZHEN 2011  ·  深圳大运中心', 26 + i * 350, 33);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createGlowTexture() {
  const canvas = makeCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, 'rgba(255,255,255,.92)');
  grad.addColorStop(0.38, 'rgba(255,255,255,.26)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* --------------------------------------------------------------------------
   Reusable geometry builders
   -------------------------------------------------------------------------- */

function createScreenTexture() {
  const w = 1024;
  const h = 512;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a1a24');
  grad.addColorStop(1, '#02090d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(22, 66, 82, .95)';
  ctx.fillRect(0, 0, w, 84);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#84ecc8';
  ctx.font = '600 34px "Segoe UI", Arial, sans-serif';
  ctx.fillText('SHENZHEN UNIVERSIADE', 36, 44);

  ctx.fillStyle = '#e8474f';
  ctx.fillRect(w - 152, 24, 116, 38);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LIVE', w - 94, 44);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2fff9';
  ctx.font = '700 232px "Segoe UI", Arial, sans-serif';
  ctx.fillText('2', 300, 268);
  ctx.fillText('1', 726, 268);

  ctx.fillStyle = '#7ff0c6';
  ctx.font = '700 140px "Segoe UI", Arial, sans-serif';
  ctx.fillText(':', 512, 248);

  ctx.fillStyle = '#8fb5ae';
  ctx.font = '600 32px "Segoe UI", Arial, sans-serif';
  ctx.fillText('HOME', 300, 424);
  ctx.fillText('AWAY', 726, 424);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 62px "Segoe UI", Arial, sans-serif';
  ctx.fillText('45:12', 512, 462);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function buildStrutMesh(segments, material, sides = 6) {
  if (!segments.length) return null;
  const geometry = new THREE.CylinderGeometry(1, 1, 1, sides, 1, false);
  const mesh = new THREE.InstancedMesh(geometry, material, segments.length);
  const dummy = new THREE.Object3D();
  const midpoint = new THREE.Vector3();
  const direction = new THREE.Vector3();

  segments.forEach((segment, index) => {
    midpoint.copy(segment.a).add(segment.b).multiplyScalar(0.5);
    direction.copy(segment.b).sub(segment.a);
    const length = direction.length();
    // Heavier members read better at a distance; the cap keeps the thickest
    // chords from swelling through the glass skin.
    const radius = Math.min(0.62, segment.r * 1.9);
    dummy.position.copy(midpoint);
    dummy.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
    dummy.scale.set(radius, Math.max(0.001, length), radius);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });

  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

function addQuad(positions, a, b, c, d) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
}

function addTriangle(bucket, a, b, c) {
  bucket.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function geometryFromPositions(positions, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function createEllipseBand(ax, az, y0, y1, material, segments = 180) {
  const positions = [];
  for (let i = 0; i < segments; i++) {
    const t0 = (i / segments) * TAU;
    const t1 = ((i + 1) / segments) * TAU;
    const a = ellipsePoint(ax, az, t0, y0);
    const b = ellipsePoint(ax, az, t1, y0);
    const c = ellipsePoint(ax, az, t1, y1);
    const d = ellipsePoint(ax, az, t0, y1);
    addQuad(positions, a, b, c, d);
  }
  const mesh = geometryFromPositions(positions, material);
  mesh.receiveShadow = true;
  return mesh;
}

function ellipseArcBand(ax, az, y0, y1, t0, t1, material, segments = 60) {
  const positions = [];
  const span = t1 - t0;
  for (let i = 0; i < segments; i++) {
    const a0 = t0 + span * (i / segments);
    const a1 = t0 + span * ((i + 1) / segments);
    const a = ellipsePoint(ax, az, a0, y0);
    const b = ellipsePoint(ax, az, a1, y0);
    const c = ellipsePoint(ax, az, a1, y1);
    const d = ellipsePoint(ax, az, a0, y1);
    addQuad(positions, a, b, c, d);
  }
  const mesh = geometryFromPositions(positions, material);
  mesh.receiveShadow = true;
  return mesh;
}

function tiltedArcBand(ax, az, y0, y1, t0, t1, dropFn, material, segments = 60) {
  const positions = [];
  const span = t1 - t0;
  for (let i = 0; i < segments; i++) {
    const a0 = t0 + span * (i / segments);
    const a1 = t0 + span * ((i + 1) / segments);
    const d0 = dropFn(a0);
    const d1 = dropFn(a1);
    addQuad(
      positions,
      ellipsePoint(ax, az, a0, y0 + d0),
      ellipsePoint(ax, az, a1, y0 + d1),
      ellipsePoint(ax, az, a1, y1 + d1),
      ellipsePoint(ax, az, a0, y1 + d0),
    );
  }
  const mesh = geometryFromPositions(positions, material);
  mesh.receiveShadow = true;
  return mesh;
}

function ellipsoidShape(ax, az) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, ax, az, 0, TAU, false, 0);
  return shape;
}

function ellipseRingGeometry(ax, az, holeAx, holeAz, y, material, segments = 160) {
  const shape = ellipsoidShape(ax, az);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, holeAx, holeAz, 0, TAU, true, 0);
  shape.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(shape, segments);
  geometry.rotateX(-HALF_PI);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function stadiumShape(centerOffset, radius) {
  const shape = new THREE.Shape();
  shape.moveTo(centerOffset, -radius);
  shape.absarc(centerOffset, 0, radius, -HALF_PI, HALF_PI, false);
  shape.lineTo(-centerOffset, radius);
  shape.absarc(-centerOffset, 0, radius, HALF_PI, PI * 1.5, false);
  shape.lineTo(centerOffset, -radius);
  return shape;
}

function stadiumHolePath(centerOffset, radius) {
  const path = new THREE.Path();
  path.moveTo(centerOffset, -radius);
  path.absarc(centerOffset, 0, radius, -HALF_PI, HALF_PI, true);
  path.lineTo(-centerOffset, radius);
  path.absarc(-centerOffset, 0, radius, HALF_PI, PI * 1.5, true);
  path.lineTo(centerOffset, -radius);
  return path;
}

function tubeFromPoints(points, radius, material, tubularSegments = 240, radialSegments = 5, closed = true) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.08);
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/* --------------------------------------------------------------------------
   Materials
   -------------------------------------------------------------------------- */

function createMaterials() {
  const steel = new THREE.MeshStandardMaterial({
    color: 0x252c2a,
    metalness: 0.72,
    roughness: 0.4,
  });
  // Visible frame members: a uniform dark grey, a touch lighter than the joint
  // steel so the ribs read against it.
  const frame = new THREE.MeshStandardMaterial({
    color: 0x3c4442,
    metalness: 0.62,
    roughness: 0.46,
  });
  const steelLight = new THREE.MeshStandardMaterial({
    color: 0x8a9691,
    metalness: 0.82,
    roughness: 0.34,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x121a18,
    metalness: 0.55,
    roughness: 0.48,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: 0xaeb2a8,
    metalness: 0.02,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const concreteDark = new THREE.MeshStandardMaterial({
    color: 0x7e857c,
    metalness: 0.04,
    roughness: 0.92,
    side: THREE.DoubleSide,
  });
  const aisle = new THREE.MeshStandardMaterial({
    color: 0x656c63,
    metalness: 0.03,
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
  // Concrete treads of the seating steps. They carry a small amount of night
  // emissive so that the light tread / dark seat alternation — the thing that
  // makes the rows readable by day — survives after dark.
  const tread = new THREE.MeshStandardMaterial({
    color: 0xb4b8ae,
    metalness: 0.02,
    roughness: 0.9,
    side: THREE.DoubleSide,
    emissive: 0xd8ded2,
    emissiveIntensity: 0,
  });
  // Concourse decks sit under the tiers, out of reach of the roof lights, so
  // they carry a little of their own light at night.
  const deck = new THREE.MeshStandardMaterial({
    color: 0x9aa096,
    metalness: 0.03,
    roughness: 0.92,
    side: THREE.DoubleSide,
    emissive: 0xcfd8cc,
    emissiveIntensity: 0,
  });
  const fascia = new THREE.MeshStandardMaterial({
    color: 0xe3e5dd,
    metalness: 0.03,
    roughness: 0.76,
    side: THREE.DoubleSide,
  });
  const suiteGlass = new THREE.MeshStandardMaterial({
    color: 0x31423c,
    metalness: 0.42,
    roughness: 0.28,
    emissive: 0xffc98b,
    emissiveIntensity: 0.1,
    side: THREE.DoubleSide,
  });
  const railGlass = new THREE.MeshPhysicalMaterial({
    color: 0xaec8c3,
    metalness: 0.1,
    roughness: 0.12,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const facadeGlassMap = createFacadeTexture('glass');
  const facadeStoneMap = createFacadeTexture('stone');

  // Frosted, etched glass: almost no specular reflection, a milky body and a
  // soft diffuse falloff. The mullion grid is carried by the texture only.
  const facadePearl = new THREE.MeshStandardMaterial({
    color: 0x409b67,
    map: facadeGlassMap,
    emissiveMap: facadeGlassMap,
    metalness: 0.02,
    roughness: 0.86,
    side: THREE.DoubleSide,
    flatShading: true,
    vertexColors: true,
    emissive: 0xeafff4,
    emissiveIntensity: 0,
  });
  const facadeMist = new THREE.MeshStandardMaterial({
    color: 0x399161,
    map: facadeGlassMap,
    emissiveMap: facadeGlassMap,
    metalness: 0.02,
    roughness: 0.9,
    side: THREE.DoubleSide,
    flatShading: true,
    vertexColors: true,
    emissive: 0xd8fff0,
    emissiveIntensity: 0,
  });
  const facadeGlass = new THREE.MeshStandardMaterial({
    color: 0x348556,
    map: facadeGlassMap,
    emissiveMap: facadeGlassMap,
    metalness: 0.03,
    roughness: 0.84,
    side: THREE.DoubleSide,
    flatShading: true,
    vertexColors: true,
    emissive: 0x9effdc,
    emissiveIntensity: 0,
  });
  // The folds between the bays are not part of the crystal: they are the recessed,
  // unclad zone between two hexagonal units. Dark glazing, no mullion lattice, a
  // little sheen so it reads as glass rather than as a hole.
  const facadeShade = new THREE.MeshStandardMaterial({
    color: 0x1d2f28,
    metalness: 0.26,
    roughness: 0.5,
    side: THREE.DoubleSide,
    flatShading: true,
    vertexColors: true,
    emissive: 0x22443a,
    emissiveIntensity: 0,
  });
  const lobbyGlass = new THREE.MeshStandardMaterial({
    color: 0x5f716a,
    metalness: 0.08,
    roughness: 0.58,
    emissive: 0xffd9a8,
    emissiveIntensity: 0.08,
    side: THREE.DoubleSide,
  });
  const facadeStone = new THREE.MeshStandardMaterial({
    color: 0x348556,
    map: facadeGlassMap,
    emissiveMap: facadeGlassMap,
    metalness: 0.03,
    roughness: 0.84,
    side: THREE.DoubleSide,
    flatShading: true,
    vertexColors: true,
    emissive: 0x9effdc,
    emissiveIntensity: 0,
  });
  const facadeLines = new THREE.LineBasicMaterial({
    color: 0x17312c,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const roofSkin = new THREE.MeshStandardMaterial({
    color: 0x2d784d,
    map: facadeGlassMap,
    emissiveMap: facadeGlassMap,
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.03,
    side: THREE.DoubleSide,
    flatShading: false,
    emissive: 0xf1fff8,
    emissiveIntensity: 0,
  });
  const roofLines = new THREE.LineBasicMaterial({
    color: 0x233b35,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const seat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.02,
    roughness: 0.9,
  });
  const track = new THREE.MeshStandardMaterial({
    color: 0xa34d3e,
    metalness: 0.02,
    roughness: 0.88,
    side: THREE.DoubleSide,
  });
  const pitch = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createPitchTexture(),
    roughness: 0.92,
    metalness: 0,
  });
  const grass = new THREE.MeshStandardMaterial({
    color: 0x8b9c7d,
    map: createGrassTexture(),
    roughness: 1,
    metalness: 0,
  });
  const paving = new THREE.MeshStandardMaterial({
    color: 0xaeb0a6,
    map: createPavingTexture(),
    roughness: 0.94,
    metalness: 0,
  });
  const stone = new THREE.MeshStandardMaterial({
    color: 0x9d9f94,
    roughness: 0.92,
    metalness: 0.02,
  });
  const asphalt = new THREE.MeshStandardMaterial({
    color: 0x2a302d,
    roughness: 0.97,
    metalness: 0,
  });
  const fieldGreen = new THREE.MeshStandardMaterial({
    color: 0x4c7144,
    roughness: 0.94,
    metalness: 0,
  });
  const whiteMark = new THREE.LineBasicMaterial({
    color: 0xe6eee2,
    transparent: true,
    opacity: 0.8,
  });
  const darkGlass = new THREE.MeshPhysicalMaterial({
    color: 0x142523,
    metalness: 0.64,
    roughness: 0.16,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });
  const ledRibbon = new THREE.MeshBasicMaterial({
    color: 0xb9ffe3,
    toneMapped: false,
  });
  const boardTexture = createBoardTexture();
  const boards = new THREE.MeshStandardMaterial({
    map: boardTexture,
    emissiveMap: boardTexture,
    emissive: 0xffffff,
    emissiveIntensity: 0.12,
    roughness: 0.6,
    metalness: 0.08,
  });
  const trunk = new THREE.MeshStandardMaterial({ color: 0x4c3d2d, roughness: 0.95 });
  const screen = new THREE.MeshBasicMaterial({
    map: createScreenTexture(),
    toneMapped: false,
  });
  const leaves = new THREE.MeshStandardMaterial({
    color: 0x3f5b3a,
    roughness: 0.93,
    side: THREE.DoubleSide,
  });
  const palmLeaf = new THREE.MeshStandardMaterial({
    color: 0x426b44,
    roughness: 0.86,
    side: THREE.DoubleSide,
  });
  const building = new THREE.MeshStandardMaterial({
    color: 0x192725,
    roughness: 0.9,
    metalness: 0.05,
  });
  const hill = new THREE.MeshStandardMaterial({
    color: 0x2c453c,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const glowTexture = createGlowTexture();
  const glowField = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xdfffee,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const glowLamp = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffe1b4,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const cityLights = new THREE.PointsMaterial({
    color: 0xffd6a1,
    size: 1.8,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  // Canopy floodlight rig: dark housing, warm lens, additive halo.
  const roofLamp = new THREE.MeshStandardMaterial({
    color: 0x39433f,
    emissive: 0xfff1d8,
    emissiveIntensity: 0.24,
    metalness: 0.26,
    roughness: 0.3,
  });
  const roofLampGlow = new THREE.PointsMaterial({
    map: glowTexture,
    color: 0xfff0d4,
    size: 5,
    sizeAttenuation: true,
    transparent: true,
    vertexColors: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const roofLampHaze = new THREE.PointsMaterial({
    map: glowTexture,
    color: 0xe8fff4,
    size: 11,
    sizeAttenuation: true,
    transparent: true,
    vertexColors: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  return {
    steel,
    frame,
    steelLight,
    darkMetal,
    concrete,
    concreteDark,
    aisle,
    tread,
    deck,
    fascia,
    suiteGlass,
    railGlass,
    facadePearl,
    facadeMist,
    facadeGlass,
    facadeShade,
    facadeStone,
    lobbyGlass,
    facadeLines,
    roofSkin,
    roofLines,
    seat,
    track,
    pitch,
    grass,
    paving,
    stone,
    asphalt,
    fieldGreen,
    whiteMark,
    darkGlass,
    ledRibbon,
    boards,
    screen,
    trunk,
    leaves,
    palmLeaf,
    building,
    hill,
    glowTexture,
    glowField,
    glowLamp,
    cityLights,
    roofLamp,
    roofLampGlow,
    roofLampHaze,
  };
}

/* --------------------------------------------------------------------------
   Facade — 20 faceted crystal bays
   Each bay is a tapered diamond: a sharp ridge at mid-sector, straight side
   edges, a waist that is the widest and most protruding line, glass above it
   and warm stone below. The gaps between two bays close into dark hourglass
   folds that widen at the ground (entrances) and at the eaves (glazed valleys).
   -------------------------------------------------------------------------- */

const FACADE_BASE_X = 139.0;
const FACADE_BASE_Z = 129.6;
const FACADE_BULGE = 14.2;
const FACADE_WAIST = 0.545;
const FACADE_LEAN = 0.032;
const FACADE_APEX = 51.3;
const FACADE_APEX_DROP = 13.9;
const FACADE_UV = 198 / TAU;
// The pitch and the whole bowl sit in a sunken pit relative to the plaza.
const PITCH_DROP = 13.8;

// On the two long sides the crystals are the largest and tallest; they shrink
// towards the short sides, where the third tier also fades out.
const BAY_SCALE = [];
const BAY_PEAK = [];
for (let s = 0; s < SECTORS; s++) {
  const mid = (s + 0.5) * SECTOR;
  const d = Math.min(Math.abs(mid - HALF_PI), Math.abs(mid - PI * 1.5)) / HALF_PI;
  const k = Math.pow(clamp(1 - d, 0, 1), 0.6);
  BAY_SCALE.push(0.985 + 0.015 * k);
  BAY_PEAK.push(35.5 + 15.8 * k);
}

function bayIndexOf(theta) {
  const t = ((theta % TAU) + TAU) % TAU;
  return Math.floor(t / SECTOR) % SECTORS;
}

function bayU(theta) {
  const local = ((theta % SECTOR) + SECTOR) % SECTOR;
  return (local / SECTOR) * 2 - 1;
}

function midOf(theta) {
  return (Math.floor(theta / SECTOR) + 0.5) * SECTOR;
}

// Each bay is a symmetric hexagon in elevation: a pointed top, a pointed base,
// and a waist at mid height. The six ridges that spring from the apex are
// therefore evenly fanned, like an asterisk.
function bayWidth(v) {
  const a = Math.abs(v - 0.5) * 2;
  if (a <= 0.5) return 1;
  return 1 - (a - 0.5) / 0.5;
}

function facadeVertical(v) {
  if (v <= FACADE_WAIST) return 0.34 + 0.66 * (v / FACADE_WAIST);
  return 1 - 0.55 * ((v - FACADE_WAIST) / (1 - FACADE_WAIST));
}

function bayPoint(mid, u, v) {
  const s = bayIndexOf(mid);
  const theta = mid + (u * bayWidth(v) * BAY_SCALE[s] * SECTOR) / 2;
  const out = FACADE_BULGE * (1 - Math.abs(u)) * facadeVertical(v);
  const lean = 1 + FACADE_LEAN * v;
  return new THREE.Vector3(
    (FACADE_BASE_X * lean + out) * Math.cos(theta),
    BAY_PEAK[s] * v,
    (FACADE_BASE_Z * lean + out) * Math.sin(theta),
  );
}

function valleyPoint(boundary, u, v) {
  const right = bayIndexOf(boundary);
  const left = (right + SECTORS - 1) % SECTORS;
  const w = bayWidth(v);
  const halfL = (1 - w * BAY_SCALE[left]) * SECTOR * 0.5;
  const halfR = (1 - w * BAY_SCALE[right]) * SECTOR * 0.5;
  const theta = u < 0.5
    ? boundary - (0.5 - u) * 2 * halfL
    : boundary + (u - 0.5) * 2 * halfR;
  const out = -2.5 * Math.sin(PI * u) * (1 - w);
  const lean = 1 + FACADE_LEAN * v;
  const peakL = BAY_PEAK[left];
  const peakR = BAY_PEAK[right];
  const edge = lerp(peakL, peakR, u);
  const floor = Math.min(peakL, peakR) * 0.76;
  const dip = (floor - edge) * (1 - Math.abs(u * 2 - 1));
  return new THREE.Vector3(
    (FACADE_BASE_X * lean + out) * Math.cos(theta),
    (edge + dip) * v,
    (FACADE_BASE_Z * lean + out) * Math.sin(theta),
  );
}

// The rim that the roof lands on: the crown line of the crystal glass, which
// runs up to a high point over every bay and dips into the fold between bays.
function facadeTopPoint(theta) {
  const k = Math.round(theta / SECTOR);
  const boundary = k * SECTOR;
  const right = ((k % SECTORS) + SECTORS) % SECTORS;
  const left = (right + SECTORS - 1) % SECTORS;
  const halfL = (1 - bayWidth(1) * BAY_SCALE[left]) * SECTOR * 0.5;
  const halfR = (1 - bayWidth(1) * BAY_SCALE[right]) * SECTOR * 0.5;
  const u = theta < boundary
    ? 0.5 - (boundary - theta) / (2 * halfL)
    : 0.5 + (theta - boundary) / (2 * halfR);
  const uc = clamp(u, 0, 1);
  const peakL = BAY_PEAK[left];
  const peakR = BAY_PEAK[right];
  const edge = lerp(peakL, peakR, uc);
  const floor = Math.min(peakL, peakR) * 0.76;
  // 1 at the crown of a bay, 0 in the fold between two bays. Both the height and
  // the outward reach of the rim follow this, so the canopy zig-zags in phase
  // with the crystals and lands on every crown instead of crossing it.
  const peakness = Math.abs(uc * 2 - 1);
  const out = lerp(-2.5, FACADE_BULGE * facadeVertical(1), peakness);
  const y = lerp(floor, edge, peakness) - 0.15;
  const lean = 1 + FACADE_LEAN;
  return new THREE.Vector3(
    (FACADE_BASE_X * lean + out) * Math.cos(theta),
    y,
    (FACADE_BASE_Z * lean + out) * Math.sin(theta),
  );
}

function roofEdgePoint(theta) {
  // The roof lands exactly on the top edge of the crystal glass.
  const p = facadeTopPoint(theta);
  return new THREE.Vector3(p.x, p.y + 0.04, p.z);
}

function roofInnerPoint(theta) {
  return new THREE.Vector3(RING_X * Math.cos(theta), ROOF_INNER_Y, RING_Z * Math.sin(theta));
}

// Any point of the canopy surface, from the opening ring (t = 0) out to the rim
// (t = 1), taken along the radial member at theta.
function roofPointAt(theta, t) {
  const inner = roofInnerPoint(theta);
  const outer = roofEdgePoint(theta);
  return new THREE.Vector3(
    lerp(inner.x, outer.x, t),
    lerp(inner.y, outer.y, t),
    lerp(inner.z, outer.z, t),
  );
}

function waistPoint(theta) {
  const mid = midOf(theta);
  const u = clamp((theta - mid) / (SECTOR * 0.5), -1, 1);
  return bayPoint(mid, u, FACADE_WAIST);
}

/* Frosted glass and stone are both set out on an equilateral triangular
   lattice: three families of mullions at 0, 60 and 120 degrees. The tile is
   sized so that it repeats seamlessly around the ring, and the mullions are
   drawn at the graphic weight used in the reference elevations. */

function createFacadeTexture(kind) {
  const W = 592;
  const H = 1024;
  const d = H / 2;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(kind === 'stone' ? 907 : 311);
  const stone = kind === 'stone';

  ctx.fillStyle = stone ? '#d3cab5' : '#dae4e1';
  ctx.fillRect(0, 0, W, H);

  const line = (x0, y0, x1, y1, w, style) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };

  const major = stone ? 'rgba(116,104,82,.42)' : 'rgba(74,90,84,.46)';
  const minor = stone ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.62)';
  const heavy = 22;
  const light = 6;

  for (let k = 0; k <= 2; k++) {
    const y = k * d;
    line(0, y, W, y, heavy, major);
    line(0, y + heavy * 0.55, W, y + heavy * 0.55, light, minor);
  }

  const tan60 = Math.sqrt(3);
  for (const sign of [1, -1]) {
    for (let k = -5; k <= 5; k++) {
      const c = k * 2 * d;
      line(0, c, W, c + sign * tan60 * W, heavy, major);
      line(0, c + heavy * 0.55, W, c + heavy * 0.55 + sign * tan60 * W, light, minor);
    }
  }

  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(30,36,34,.025)';
    ctx.fillRect(rand() * W, rand() * H, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function buildFacade(materials, struts, detail = 1) {
  const group = new THREE.Group();
  group.name = 'crystal-facade';

  const vSamples = [0, 0.13, 0.26, 0.38, 0.47, 0.545, 0.62, 0.71, 0.82, 0.91, 1];

  const buckets = [[], [], [], [], []];
  const bucketUvs = [[], [], [], [], []];
  const cols = [[], [], [], [], []];

  const addTri = (bucket, a, b, c, shade) => {
    const P = buckets[bucket];
    const U = bucketUvs[bucket];
    const C = cols[bucket];
    for (const p of [a, b, c]) {
      P.push(p.x, p.y, p.z);
      U.push(Math.atan2(p.z, p.x) * FACADE_UV, p.y / 8.0);
      C.push(shade, shade, shade);
    }
  };

  const addCell = (bucket, a, b, c, d, shade) => {
    addTri(bucket, a, b, c, shade);
    addTri(bucket, a, c, d, shade);
  };

  const hexRing = (mid) => [
    bayPoint(mid, 0, 1),
    bayPoint(mid, 1, 0.75),
    bayPoint(mid, 1, 0.25),
    bayPoint(mid, 0, 0),
    bayPoint(mid, -1, 0.25),
    bayPoint(mid, -1, 0.75),
  ];

  for (let s = 0; s < SECTORS; s++) {
    const mid = (s + 0.5) * SECTOR;
    const apex = bayPoint(mid, 0, FACADE_WAIST);
    const ring = hexRing(mid);

    // Six triangular facets fan out from the central apex to the hexagon. The two
    // lower facets lean away from the sky, so they are brightened to land on the
    // same tone as the four above them — the sun still shades the whole skin.
    for (let i = 0; i < 6; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % 6];
      const h = hash3(s * 0.7 + i * 1.31, 2.7, 6.3);
      const bucket = i === 0 ? 0 : i === 1 ? 1 : i === 4 ? 2 : i === 5 ? 1 : 4;
      const lower = bucket === 4;
      addTri(bucket, apex, a, b, (0.94 + h * 0.07) * (lower ? 3.1 : 1));
    }

    // The hourglass fold between two bays: the unclad gap between two hexagonal
    // units, so it keeps its own dark tint instead of the crystal green.
    const boundary = s * SECTOR;
    for (let iu = 0; iu < 5; iu++) {
      const u0 = iu / 5;
      const u1 = (iu + 1) / 5;
      for (let iv = 0; iv < vSamples.length - 1; iv++) {
        const v0 = vSamples[iv];
        const v1 = vSamples[iv + 1];
        const vMid = (v0 + v1) * 0.5;
        if (1 - bayWidth(vMid) < 0.012) continue;
        const a = valleyPoint(boundary, u0, v0);
        const b = valleyPoint(boundary, u1, v0);
        const c = valleyPoint(boundary, u1, v1);
        const d = valleyPoint(boundary, u0, v1);
        const h = hash3(s * 1.21 + iu * 0.47, iv * 0.93, 5.7);
        const bucket = vMid < FACADE_WAIST ? 3 : 2;
        const tint = bucket === 3
          ? 1.1 - 0.26 * (vMid / FACADE_WAIST) + h * 0.08
          : 0.88 + h * 0.1;
        addCell(bucket, a, b, c, d, tint);
      }
    }
  }

  const facadeMaterials = [
    materials.facadePearl,
    materials.facadeMist,
    materials.facadeGlass,
    materials.facadeShade,
    materials.facadeStone,
  ];

  buckets.forEach((positions, index) => {
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucketUvs[index], 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols[index], 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, facadeMaterials[index]);
    mesh.castShadow = index !== 3;
    mesh.receiveShadow = true;
    mesh.name = `facade-bay-${index}`;
    group.add(mesh);
  });

  // Six ridges and six perimeter edges make each crystal legible, and the
  // fold between two bays carries a dark centre member.
  for (let s = 0; s < SECTORS; s++) {
    const mid = (s + 0.5) * SECTOR;
    const apex = bayPoint(mid, 0, FACADE_WAIST);
    const ring = hexRing(mid);
    for (let i = 0; i < 6; i++) {
      struts.push({ a: apex, b: ring[i], r: 0.16, light: true });
      struts.push({ a: ring[i], b: ring[(i + 1) % 6], r: 0.13, light: true });
    }
    struts.push({
      a: valleyPoint(s * SECTOR, 0.5, 0),
      b: valleyPoint(s * SECTOR, 0.5, 1),
      r: 0.1,
    });
  }

  // Base compression ring under the bay feet.
  for (let i = 0; i < 160; i++) {
    const t0 = (i / 160) * TAU;
    const t1 = ((i + 1) / 160) * TAU;
    const p0 = bayPoint(midOf(t0), clamp((t0 - midOf(t0)) / (SECTOR * 0.5), -1, 1), 0.001);
    const p1 = bayPoint(midOf(t1), clamp((t1 - midOf(t1)) / (SECTOR * 0.5), -1, 1), 0.001);
    struts.push({ a: p0, b: p1, r: 0.42 });
  }

  // Recessed entrances sit in the dark folds between the bay feet: a wide
  // glazed lobby wall, a floating canopy and a shadowed reveal above.
  const entranceGroup = new THREE.Group();
  entranceGroup.name = 'facade-entrances';
  const revealGeo = new THREE.BoxGeometry(13, 9.4, 1.6);
  revealGeo.translate(0, 4.7, -0.9);
  const lobbyGeo = new THREE.BoxGeometry(10, 6.4, 0.3);
  lobbyGeo.translate(0, 3.2, 0.16);
  const transomGeo = new THREE.BoxGeometry(10, 0.36, 0.34);
  transomGeo.translate(0, 6.3, 0.26);
  const canopyGeo = new THREE.BoxGeometry(11, 0.28, 3.2);
  canopyGeo.translate(0, 6.95, 1.3);
  const plinthGeo = new THREE.BoxGeometry(10.6, 0.5, 0.7);
  plinthGeo.translate(0, 0.25, 0.3);

  const reveals = new THREE.InstancedMesh(revealGeo, materials.darkMetal, SECTORS);
  const lobbies = new THREE.InstancedMesh(lobbyGeo, materials.lobbyGlass, SECTORS);
  const transoms = new THREE.InstancedMesh(transomGeo, materials.fascia, SECTORS);
  const canopies = new THREE.InstancedMesh(canopyGeo, materials.fascia, SECTORS);
  const plinths = new THREE.InstancedMesh(plinthGeo, materials.stone, SECTORS);

  // Concourse exits: a doorway cut through the skin at the level of the first
  // tier's platform (1.2 m below the plaza), with a threshold ramp outside so
  // the walker can step straight out of the stadium.
  const exitDoorGeo = new THREE.PlaneGeometry(5.6, 3.3);
  const exitDoors = new THREE.InstancedMesh(exitDoorGeo, materials.darkMetal, SECTORS);
  exitDoors.name = 'concourse-exit-doors';
  const exitRampGeo = new THREE.BoxGeometry(5.8, 0.16, 3.4);
  const exitRamps = new THREE.InstancedMesh(exitRampGeo, materials.paving, SECTORS);
  exitRamps.name = 'concourse-exit-ramps';
  exitRamps.receiveShadow = true;

  const dummy = new THREE.Object3D();
  for (let s = 0; s < SECTORS; s++) {
    const theta = s * SECTOR;
    const p = valleyPoint(theta, 0.5, 0.18);
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, HALF_PI - theta, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    reveals.setMatrixAt(s, dummy.matrix);
    lobbies.setMatrixAt(s, dummy.matrix);
    transoms.setMatrixAt(s, dummy.matrix);
    canopies.setMatrixAt(s, dummy.matrix);
    plinths.setMatrixAt(s, dummy.matrix);

    const radius = Math.hypot(p.x, p.z);
    const outward = (radius + 1.7) / radius;
    dummy.position.set(p.x * 1.004, 0.42, p.z * 1.004);
    dummy.rotation.set(0, HALF_PI - theta, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    exitDoors.setMatrixAt(s, dummy.matrix);

    dummy.position.set(p.x * outward, -0.62, p.z * outward);
    dummy.rotation.set(-0.36, HALF_PI - theta, 0, 'YXZ');
    dummy.updateMatrix();
    exitRamps.setMatrixAt(s, dummy.matrix);
  }
  for (const mesh of [reveals, lobbies, transoms, canopies, plinths, exitDoors, exitRamps]) {
    mesh.instanceMatrix.needsUpdate = true;
  }
  entranceGroup.add(reveals, lobbies, transoms, canopies, plinths, exitDoors, exitRamps);
  group.add(entranceGroup);

  return { group, bayPoint, valleyPoint, roofEdgePoint };
}

/* --------------------------------------------------------------------------
   Crest pyramids — a raised pentagonal crystal on every fold between two bays
   -------------------------------------------------------------------------- */

// One pyramid per fold, twenty in all, mirror-symmetric about the fold it sits
// on. In plan the base is a straight-edged pentagon: a short edge just inside
// the opening ring, its widest line about a quarter of the way out, and a point
// on the rim itself, in the notch where the two bays meet. The five ridges run
// from those five corners up to a single apex inside the pentagon.
//
// Both widths are exactly half a sector, so the pentagon reaches the structural
// ridge of the bays either side: the twenty crystals close up along those ridges
// — wall to wall from the opening ring out to the widest line — which is the
// pinwheel the roof plan draws. Every edge is a straight line and every face a
// flat triangle, like the hexagonal bays below.
const PYRAMID_TOP_T = 0;
const PYRAMID_WIDE_T = 0.29;
const PYRAMID_APEX_T = 0.36;
const PYRAMID_HALF_ANGLE = SECTOR * 0.5;
// The base is set a little below the canopy. A straight edge cannot lie on a
// curved membrane, so the skirt is buried instead: the roof surface cuts the
// crystal where it crosses it, and never slices through a face.
const PYRAMID_SINK = 0;

function buildRoofPyramids(materials, struts) {
  const group = new THREE.Group();
  group.name = 'roof-crest-pyramids';

  const positions = [];
  const colors = [];
  const uvs = [];
  const shade = new THREE.Color();

  const pushVertex = (p, tone) => {
    positions.push(p.x, p.y, p.z);
    shade.setRGB(tone, tone, tone);
    colors.push(shade.r, shade.g, shade.b);
    // Planar projection on the 4.6 x 8 m tile: a top-down projection keeps the
    // lattice equilateral on a surface that is nearly horizontal, which a
    // height-based cylindrical projection would smear out along the slope.
    uvs.push(p.x / 4.6, p.z / 8.0);
  };
  const pushTri = (a, b, c, tone) => {
    pushVertex(a, tone);
    pushVertex(b, tone);
    pushVertex(c, tone);
  };

  for (let s = 0; s < SECTORS; s++) {
    const theta0 = s * SECTOR;
    const peakL = BAY_PEAK[(s + SECTORS - 1) % SECTORS];
    const peakR = BAY_PEAK[s];
    // The crystals are tallest along the two long sides. The crest follows them
    // but only over part of the range, so the ring of pyramids reads as one
    // crown instead of a tall wall opposite a row of stubs.
    const k = clamp(((peakL + peakR) * 0.5 - 35.5) / 15.8, 0, 1);
    const apexY = 41.2 + 6.2 * k;

    const at = (t, dTheta) => {
      const p = roofPointAt(theta0 + dTheta, t);
      p.y -= PYRAMID_SINK;
      return p;
    };
    const half = PYRAMID_HALF_ANGLE;

    const a = at(PYRAMID_TOP_T, -half);
    const b = at(PYRAMID_TOP_T, half);
    const c = at(PYRAMID_WIDE_T, half);
    const d = at(1, 0);
    const e = at(PYRAMID_WIDE_T, -half);
    const under = roofPointAt(theta0 + 0, PYRAMID_APEX_T);
    const apex = new THREE.Vector3(under.x, apexY, under.z);

    const toneOf = (seed) => 0.95 + hash3(s * 1.9 + seed, 2.3, 7.1) * 0.08;

    // Five flat faces over the five base edges — nothing underneath them. The
    // crystal is an open shell, so from the stands you look straight up into its
    // facets, with no membrane and no base panel to block them.
    pushTri(a, b, apex, toneOf(0.3));
    pushTri(b, c, apex, toneOf(0.9));
    pushTri(c, d, apex, toneOf(1.5));
    pushTri(d, e, apex, toneOf(2.1));
    pushTri(e, a, apex, toneOf(2.7));

    // Straight edge members: the five base edges, then the five ridges.
    for (const [p, q] of [[a, b], [b, c], [c, d], [d, e], [e, a]]) {
      struts.push({ a: p, b: q, r: 0.15, light: true });
    }
    for (const p of [a, b, c, d, e]) {
      struts.push({ a: apex, b: p, r: 0.16, light: true });
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materials.facadeGlass);
  mesh.name = 'roof-crest-skin';
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  group.add(mesh);

  return group;
}

/* --------------------------------------------------------------------------
   Roof — 20 folded plate units with an elliptical opening
   -------------------------------------------------------------------------- */

function buildRoof(materials, struts, detail = 1) {
  const group = new THREE.Group();
  group.name = 'folded-roof';
  const columns = detail > 0.8 ? 160 : 100;
  const radial = detail > 0.8 ? 5 : 4;

  const outerAt = (theta) => roofEdgePoint(theta);

  const innerAt = roofInnerPoint;
  const pointAt = roofPointAt;

  /* Only the wedges between two crest pyramids are clad: from the wide corner of
     a crystal, on the bay ridge, out to the rim. Both long sides of a wedge are
     the crystal's own outer edges, so the canopy is cut exactly along the
     structure. The cladding is the same frosted glass as the hexagonal bays —
     one material, one equilateral-triangle lattice over the whole roof. */
  const RIM_SEG = 3;
  const positions = [];
  const colors = [];
  const uvs = [];
  const baseColor = new THREE.Color();
  const pushVertex = (p, tone) => {
    positions.push(p.x, p.y, p.z);
    baseColor.setRGB(tone, tone, tone);
    colors.push(baseColor.r, baseColor.g, baseColor.b);
    // Same 4.6 x 8 m tile as the crystals, projected from above: one continuous
    // equilateral lattice across every wedge and every crystal.
    uvs.push(p.x / 4.6, p.z / 8.0);
  };

  for (let s = 0; s < SECTORS; s++) {
    const t0 = s * SECTOR;
    const tm = t0 + SECTOR * 0.5;
    const t1 = t0 + SECTOR;
    const i0 = innerAt(t0);
    const im = innerAt(tm);
    const i1 = innerAt(t1);
    for (const right of [false, true]) {
      const innerA = right ? im : i0;
      const innerB = right ? i1 : im;
      const ta = right ? tm : t0;
      const tb = right ? t1 : tm;
      const at = (u, t) => {
        const inner = new THREE.Vector3().lerpVectors(innerA, innerB, u);
        return new THREE.Vector3().lerpVectors(inner, outerAt(lerp(ta, tb, u)), t);
      };
      // The wide corner of the crystal sits on the bay ridge: u = 1 on the left
      // half of the sector, u = 0 on the right half.
      const apex = at(right ? 0 : 1, PYRAMID_WIDE_T);
      const tone = 0.95 + hash3(s * 1.3 + (right ? 0.7 : 0), 4.1, 6.7) * 0.08;
      // Fan out to the rim, which keeps its own straight segments so the edge
      // still follows the crown of the crystal glass.
      for (let k = 0; k < RIM_SEG; k++) {
        pushVertex(apex, tone);
        pushVertex(at(k / RIM_SEG, 1), tone);
        pushVertex(at((k + 1) / RIM_SEG, 1), tone);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const skin = new THREE.Mesh(geometry, materials.facadeGlass);
  skin.castShadow = true;
  skin.receiveShadow = false;
  skin.name = 'roof-wedges';
  group.add(skin);

  // Outer and inner compression rings.
  const outerPoints = [];
  const innerPoints = [];
  for (let j = 0; j < 180; j++) {
    const theta = (j / 180) * TAU;
    outerPoints.push(outerAt(theta));
    innerPoints.push(innerAt(theta));
  }
  group.add(tubeFromPoints(outerPoints, 0.28, materials.steel, 300, 6, true));
  group.add(tubeFromPoints(innerPoints, 0.28, materials.steel, 260, 7, true));

  // The seam ribs and the two ring trusses that used to run under the membrane
  // are gone: inside a crest pyramid that strip of roof no longer exists, so the
  // only members left below the canopy are the deep girders on the bay ridges.

  // Deep triangular girders below every peak ridge. These are the dominant
  // members in the supplied cutaway: shallow at the inner ring, roughly seven
  // metres deep where they land on the crystal bays.
  for (let s = 0; s < SECTORS; s++) {
    const theta = s * SECTOR + SECTOR * 0.5;
    const steps = [0.0, 0.12, 0.26, 0.42, 0.58, 0.74, 0.88, 1];
    const top = steps.map((t) => pointAt(theta, t));
    const bottom = steps.map((t) => {
      const p = pointAt(theta, t);
      const depth = 0.55 + 6.1 * Math.pow(t, 1.35);
      return new THREE.Vector3(p.x, p.y - depth, p.z);
    });

    for (let i = 0; i < steps.length - 1; i++) {
      struts.push({ a: top[i], b: top[i + 1], r: 0.15, light: true });
      struts.push({ a: bottom[i], b: bottom[i + 1], r: 0.15, light: true });
      struts.push({ a: bottom[i], b: top[i + 1], r: 0.12, light: true });
      struts.push({ a: top[i], b: bottom[i + 1], r: 0.12, light: true });
    }
    for (let i = 1; i < steps.length - 1; i++) {
      struts.push({ a: top[i], b: bottom[i], r: 0.13, light: true });
    }
  }

  // Inner opening fascia, giving the membrane its structural edge.
  const fascia = createEllipseBand(RING_X, RING_Z, 31.9, ROOF_INNER_Y + 0.5, materials.fascia, 200);
  group.add(fascia);
  const fasciaLower = createEllipseBand(RING_X + 0.04, RING_Z + 0.03, 31.9, 32.18, materials.steel, 200);
  group.add(fasciaLower);
  group.add(tubeFromPoints(
    Array.from({ length: 180 }, (_, i) => ellipsePoint(RING_X, RING_Z, (i / 180) * TAU, 31.9)),
    0.32,
    materials.steel,
    260,
    6,
    true,
  ));

  // Lighting rig: banks of floodlights bolted to the inner side face of the
  // opening ring (the edge beam), one bank at the centre of every structural
  // sector. Each bank is five lamps in a single straight row, set apart so they
  // never overlap; nothing hangs under the ring, so from the stands you read
  // them as a row of fittings on the vertical face of the ring.
  const LAMP_BANKS = 10;
  const LAMPS_PER_BANK = 10;
  const LAMP_PITCH = 2.1;
  const LAMP_Y = 33.3;
  const LAMP_INSET = 0.18;
  const lampCount = LAMP_BANKS * LAMPS_PER_BANK;
  const housingGeometry = new THREE.BoxGeometry(1.5, 0.64, 0.4);
  const lensGeometry = new THREE.BoxGeometry(1.34, 0.5, 0.06);
  lensGeometry.translate(0, 0, 0.21);
  const housings = new THREE.InstancedMesh(housingGeometry, materials.darkMetal, lampCount);
  // One material per *fitting*, not per bank: the random-flicker mode needs to
  // run every one of the 100 lenses on its own clock, while the strobe still
  // treats each bank of ten as a single unit.
  const lampMaterials = [];
  const lensMeshes = [];
  for (let i = 0; i < lampCount; i++) {
    lampMaterials.push(materials.roofLamp.clone());
  }
  housings.name = 'roof-lamp-housings';
  const lampPositions = [];
  const lampDummy = new THREE.Object3D();
  const lampInset = 1 - LAMP_INSET / RING_X;
  let lampIndex = 0;
  for (let bank = 0; bank < LAMP_BANKS; bank++) {
    const center = ((bank + 0.5) / LAMP_BANKS) * TAU;
    for (let i = 0; i < LAMPS_PER_BANK; i++) {
      const theta = center + ((i - (LAMPS_PER_BANK - 1) / 2) * LAMP_PITCH) / RING_X;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      lampDummy.position.set(RING_X * lampInset * cos, LAMP_Y, RING_Z * lampInset * sin);
      lampDummy.rotation.set(0.44, -(theta + HALF_PI), 0, 'YXZ');
      lampDummy.scale.set(1, 1, 1);
      lampDummy.updateMatrix();
      housings.setMatrixAt(lampIndex, lampDummy.matrix);
      const lens = new THREE.Mesh(lensGeometry, lampMaterials[lampIndex]);
      lens.position.copy(lampDummy.position);
      lens.quaternion.copy(lampDummy.quaternion);
      lens.castShadow = false;
      lens.name = `roof-lamp-lens-${lampIndex}`;
      lensMeshes.push(lens);
      lampPositions.push(RING_X * (lampInset - 0.004) * cos, LAMP_Y - 0.04, RING_Z * (lampInset - 0.004) * sin);
      lampIndex++;
    }
  }
  housings.instanceMatrix.needsUpdate = true;
  housings.castShadow = false;
  group.add(housings);
  lensMeshes.forEach((mesh) => group.add(mesh));

  const lampGlowGeometry = new THREE.BufferGeometry();
  lampGlowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lampPositions, 3));
  const lampTint = new Float32Array(lampCount * 3).fill(1);
  lampGlowGeometry.setAttribute('color', new THREE.BufferAttribute(lampTint, 3));
  const lampGlow = new THREE.Points(lampGlowGeometry, materials.roofLampGlow);
  lampGlow.name = 'roof-lamp-glow';
  const lampHaze = new THREE.Points(lampGlowGeometry, materials.roofLampHaze);
  lampHaze.name = 'roof-lamp-haze';
  group.add(lampGlow, lampHaze);

  // The crest pyramids stand on every fold between two bays. They are part of
  // The crest pyramids are the roof: they are built here, where the canopy's
  // frame is laid out, so they land on the same rings and ridges.
  group.add(buildRoofPyramids(materials, struts));

  return {
    group,
    pointAt,
    innerAt,
    outerAt,
    lampMaterials,
    lampTint,
    lampGlow,
    lampBanks: LAMP_BANKS,
    lampsPerBank: LAMPS_PER_BANK,
  };
}

/* --------------------------------------------------------------------------
   Base, entrances, steps
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   Podium, apron and planting
   -------------------------------------------------------------------------- */

function buildBase(materials, struts) {
  const group = new THREE.Group();
  group.name = 'podium';

  // Basement wall closing the sunken pit between the pitch and the plaza.
  group.add(createEllipseBand(139.0, 129.6, -PITCH_DROP - 0.6, 0, materials.concreteDark, 200));

  // Paved apron that closes the gap between the crystal feet and the plaza.
  group.add(ellipseRingGeometry(148.2, 139.0, 137.2, 127.9, 0.045, materials.paving, 200));

  // Stone terrace bands washing out from the bay feet.
  for (let i = 0; i < 3; i++) {
    const ax = 151.5 + i * 5.6;
    const az = 142.5 + i * 5.2;
    group.add(ellipseRingGeometry(ax, az, ax - 2.1, az - 1.9, 0.052, materials.stone, 160));
  }

  // Long planting beds in front of the entrances.
  for (let i = 0; i < 6; i++) {
    const theta = (i / 6) * TAU + 0.22;
    const cx = 166 * Math.cos(theta);
    const cz = 156 * Math.sin(theta);
    const yaw = HALF_PI - theta;

    const kerb = new THREE.Mesh(new THREE.BoxGeometry(30, 0.44, 6.4), materials.stone);
    kerb.position.set(cx, 0.2, cz);
    kerb.rotation.y = yaw;
    kerb.receiveShadow = true;

    const bed = new THREE.Mesh(new THREE.BoxGeometry(28.4, 0.3, 5.1), materials.leaves);
    bed.position.set(cx, 0.48, cz);
    bed.rotation.y = yaw;
    bed.receiveShadow = true;

    group.add(kerb, bed);
  }

  // Slim bollards trace the apron edge.
  const bollards = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.95, 6).translate(0, 0.48, 0),
    materials.darkMetal,
    28,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 28; i++) {
    const theta = (i / 28) * TAU + 0.05;
    dummy.position.set(151 * Math.cos(theta), 0.05, 142 * Math.sin(theta));
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bollards.setMatrixAt(i, dummy.matrix);
  }
  bollards.instanceMatrix.needsUpdate = true;
  group.add(bollards);

  return group;
}

/* --------------------------------------------------------------------------
   Seating bowl
   -------------------------------------------------------------------------- */

function seatGeometry() {
  const pad = new THREE.BoxGeometry(0.46, 0.085, 0.43);
  pad.translate(0, 0.37, 0);
  const back = new THREE.BoxGeometry(0.46, 0.4, 0.065);
  back.rotateX(-0.1);
  back.translate(0, 0.58, 0.205);
  const merged = mergeGeometries([pad, back], false);
  merged.computeVertexNormals();
  return merged;
}

function buildBowl(materials, struts, detail = 1) {
  const group = new THREE.Group();
  group.name = 'seating-bowl';
  const segments = detail > 0.8 ? 180 : 132;
  const hi = detail > 0.8;

  // Three tiers, as in the supplied cutaway: a low lower bowl, a compact
  // club tier, and a deep upper bowl that climbs to the roof.
  const tiers = [
    {
      name: 'lower',
      // The lower bowl now starts at pitch level. The athletics field was
      // pulled in by 10% so four extra rows fit under the old first row,
      // which used to perch three metres above the track behind a tall wall.
      rows: hi ? 20 : 17,
      ax0: 88.0,
      az0: 52.5,
      ax1: 105.6,
      az1: 71.5,
      y0: 0.6,
      rise: 0.6,
    },
    {
      name: 'middle',
      // The club tier hangs 1.4 m lower than it used to, so the concourse wall
      // under it is 3.2 m — the same height as the wall above it — and the two
      // extra rows of seats fill what used to be an empty band of wall. Its
      // foot also reaches back to that wall and the rake is stretched, so the
      // first row sits on the wall with no ledge in between.
      rows: hi ? 14 : 12,
      ax0: 109.8,
      az0: 74.6,
      ax1: 122.0,
      az1: 90.0,
      y0: 15.8,
      rise: hi ? 0.6143 : 0.7167,
    },
    {
      name: 'upper',
      rows: hi ? 32 : 26,
      ax0: 124.0,
      az0: 92.0,
      ax1: 138.4,
      az1: 127.4,
      y0: 27.6,
      rise: 0.66,
    },
  ];

  // Four corner tunnels connect the concourse to the pitch.
  const TUNNEL_ANGLES = [PI * 0.25, PI * 0.75, PI * 1.25, PI * 1.75];
  const TUNNEL_HALF = 0.052;
  const TUNNEL_ROWS = Math.max(3, Math.round(tiers[0].rows * 0.62));
  const inTunnel = (theta) => TUNNEL_ANGLES.some((a) => {
    const d = Math.abs(((theta - a + PI * 3) % TAU) - PI);
    return d < TUNNEL_HALF;
  });

  // The upper bowl only runs along the two long sides and thins out towards
  // the short sides. Its foot holds a constant height all the way round, so the
  // gap between the head of the club tier and the first row of the upper bowl
  // is identical everywhere; only the top of the tier settles towards the ends,
  // which makes the third tier read as a wedge without lifting its leading edge.
  const UPPER_HALF = 1.15;
  const UPPER_SETTLE = 12.0;
  const upperHalfAt = () => UPPER_HALF;
  // The settle is measured against the real half-span, so the crown is highest
  // in the middle of each long side and reaches its full fall at the two ends.
  const upperDropAt = (theta) => {
    const t = ((theta % TAU) + TAU) % TAU;
    const d = Math.min(Math.abs(t - HALF_PI), Math.abs(t - PI * 1.5)) / HALF_PI;
    return -UPPER_SETTLE * smoothstep(0.03, UPPER_HALF / HALF_PI, d);
  };
  // The settle is spread in proportion to the row index, so the bottom row
  // never moves and every step simply gets shallower towards the ends.
  const tierDrop = (tier, theta, row = 0) => {
    if (tier.name !== 'upper') return 0;
    const w = Math.min(1, Math.max(0, row / tier.rows));
    return upperDropAt(theta) * w;
  };
  const spansForRow = (tier, row) => {
    if (tier.name !== 'upper') return [[0, TAU]];
    const half = upperHalfAt(row);
    return [[HALF_PI - half, HALF_PI + half], [PI * 1.5 - half, PI * 1.5 + half]];
  };
  const spansOf = (tier) => spansForRow(tier, 0);
  const upperTopSpans = spansForRow(tiers[2], tiers[2].rows - 1);
  const upperTop = tiers[2].y0 + tiers[2].rows * tiers[2].rise;
  const middleTop = tiers[1].y0 + tiers[1].rows * tiers[1].rise;

  const inRowSpan = (tier, row, theta) => {
    if (tier.name !== 'upper') return true;
    const half = upperHalfAt(row);
    const t = ((theta % TAU) + TAU) % TAU;
    return (t >= HALF_PI - half && t <= HALF_PI + half)
      || (t >= PI * 1.5 - half && t <= PI * 1.5 + half);
  };
  const upperSpans = spansOf(tiers[2]);
  const inSpans = (spans, theta) => spans.some(([a, b]) => theta >= a - 1e-6 && theta <= b + 1e-6);
  const arcSegments = (ta, tb) => Math.max(6, Math.round(((tb - ta) / TAU) * segments));
  // Cut the doorways out of a wall arc, leaving the solid stretches behind.
  const splitArcs = (ta, tb, doors) => {
    const cuts = doors
      .map((d) => [d.theta - d.half, d.theta + d.half])
      .filter(([a, b]) => b > ta && a < tb)
      .sort((p, q) => p[0] - q[0]);
    const arcs = [];
    let cursor = ta;
    for (const [a, b] of cuts) {
      if (a > cursor + 1e-4) arcs.push([cursor, Math.min(a, tb)]);
      cursor = Math.max(cursor, b);
    }
    if (tb > cursor + 1e-4) arcs.push([cursor, tb]);
    return arcs.filter(([a, b]) => b - a > 1e-4);
  };

  const stepPositions = [];
  const aislePositions = [];
  const seatMatrices = [];
  const seatColors = [];
  const spacing = hi ? 0.5 : 0.54;
  const dummy = new THREE.Object3D();
  const tempColor = new THREE.Color();

  const radiusAt = (tier, i) => {
    const t = i / tier.rows;
    return {
      ax: lerp(tier.ax0, tier.ax1, t),
      az: lerp(tier.az0, tier.az1, t),
    };
  };

  for (const tier of tiers) {
    for (let row = 0; row < tier.rows; row++) {
      const r0 = radiusAt(tier, row);
      const r1 = radiusAt(tier, row + 1);
      const y0 = tier.y0 + row * tier.rise;
      const y1 = y0 + tier.rise;

      for (const [ta, tb] of spansForRow(tier, row)) {
        const n = arcSegments(ta, tb);
        for (let s = 0; s < n; s++) {
          const t0 = lerp(ta, tb, s / n);
          const t1 = lerp(ta, tb, (s + 1) / n);
          if (tier.name === 'lower' && row < TUNNEL_ROWS && inTunnel((t0 + t1) * 0.5)) continue;
          const da = tierDrop(tier, t0, row);
          const db = tierDrop(tier, t1, row);
          const ea = tierDrop(tier, t0, row + 1);
          const eb = tierDrop(tier, t1, row + 1);
          const a = ellipsePoint(r0.ax, r0.az, t0, y0 + da);
          const b = ellipsePoint(r0.ax, r0.az, t1, y0 + db);
          const c = ellipsePoint(r1.ax, r1.az, t1, y0 + db);
          const d = ellipsePoint(r1.ax, r1.az, t0, y0 + da);
          addQuad(stepPositions, a, b, c, d);

          const e = ellipsePoint(r1.ax, r1.az, t1, y1 + eb);
          const f = ellipsePoint(r1.ax, r1.az, t0, y1 + ea);
          addQuad(stepPositions, d, c, e, f);
        }
      }

      // Dark stepped aisle surfaces align with the 20 seat-free gaps.
      for (let s = 0; s < SECTORS; s++) {
        const theta = s * SECTOR;
        if (!inRowSpan(tier, row, theta)) continue;
        const arc0 = Math.sqrt((r0.ax * Math.sin(theta)) ** 2 + (r0.az * Math.cos(theta)) ** 2);
        const arc1 = Math.sqrt((r1.ax * Math.sin(theta)) ** 2 + (r1.az * Math.cos(theta)) ** 2);
        const ha0 = 0.95 / Math.max(arc0, 1);
        const ha1 = 0.95 / Math.max(arc1, 1);
        const dy = tierDrop(tier, theta, row);
        const dyTop = tierDrop(tier, theta, row + 1);
        const a = ellipsePoint(r0.ax, r0.az, theta - ha0, y0 + dy + 0.012);
        const b = ellipsePoint(r0.ax, r0.az, theta + ha0, y0 + dy + 0.012);
        const c = ellipsePoint(r1.ax, r1.az, theta + ha1, y0 + dy + 0.012);
        const d = ellipsePoint(r1.ax, r1.az, theta - ha1, y0 + dy + 0.012);
        addQuad(aislePositions, a, b, c, d);

        const e = ellipsePoint(r1.ax, r1.az, theta + ha1, y1 + dyTop);
        const f = ellipsePoint(r1.ax, r1.az, theta - ha1, y1 + dyTop);
        addQuad(aislePositions, d, c, e, f);
      }

      // Seats are placed with roughly constant arc-length spacing.
      const ax = lerp(r0.ax, r1.ax, 0.34);
      const az = lerp(r0.az, r1.az, 0.34);
      const y = y0 + 0.06;

      for (const [ta, tb] of spansForRow(tier, row)) {
        let theta = ta;
        while (theta < tb) {
          const arc = Math.sqrt((ax * Math.sin(theta)) ** 2 + (az * Math.cos(theta)) ** 2);
          let d = theta % SECTOR;
          d = Math.min(d, SECTOR - d);
          const aisleDistance = d * arc;
          if (aisleDistance > 1.25 && !(tier.name === 'lower' && row < TUNNEL_ROWS && inTunnel(theta))) {
            const x = ax * Math.cos(theta);
            const z = az * Math.sin(theta);
            const nx = -x / (ax * ax);
            const nz = -z / (az * az);
            const yaw = Math.atan2(-nx, -nz);
            dummy.position.set(x, y + tierDrop(tier, theta, row), z);
            dummy.rotation.set(0, yaw, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            seatMatrices.push(dummy.matrix.clone());

            const block = hash2(Math.floor(theta / SECTOR) * 1.7, row * 0.21);
            const lightness = 0.21 + (block - 0.5) * 0.03;
            tempColor.setHSL(0.55, 0.012, lightness);
            seatColors.push(tempColor.r, tempColor.g, tempColor.b);
          }
          theta += spacing / Math.max(arc, 1);
        }
      }
    }
  }

  // Twin handrails down both sides of every aisle. The third tier is left
  // clear: its own entrance portals replace the rails that used to bisect it.
  for (const tier of tiers) {
    if (tier.name === 'upper') continue;
    const topY = tier.y0 + tier.rows * tier.rise;
    for (let s = 0; s < SECTORS; s++) {
      const theta = s * SECTOR;
      if (!inRowSpan(tier, tier.rows - 1, theta)) continue;
      const arc0 = Math.sqrt((tier.ax0 * Math.sin(theta)) ** 2 + (tier.az0 * Math.cos(theta)) ** 2);
      const arc1 = Math.sqrt((tier.ax1 * Math.sin(theta)) ** 2 + (tier.az1 * Math.cos(theta)) ** 2);
      for (const side of [-1, 1]) {
        const ha0 = (side * 0.98) / Math.max(arc0, 1);
        const ha1 = (side * 0.98) / Math.max(arc1, 1);
        const bottom = ellipsePoint(tier.ax0, tier.az0, theta + ha0, tier.y0 + 1.02);
        const top = ellipsePoint(tier.ax1, tier.az1, theta + ha1, topY + 1.02);
        struts.push({ a: bottom, b: top, r: 0.038, light: true });
        for (const t of [0.24, 0.48, 0.72, 0.94]) {
          const ax = lerp(tier.ax0, tier.ax1, t);
          const az = lerp(tier.az0, tier.az1, t);
          const ha = (side * 0.98) / Math.max(lerp(arc0, arc1, t), 1);
          const y = lerp(tier.y0, topY, t);
          struts.push({
            a: ellipsePoint(ax, az, theta + ha, y + 0.05),
            b: ellipsePoint(ax, az, theta + ha, y + 1.02),
            r: 0.026,
            light: true,
          });
        }
      }
    }
  }

  const steps = geometryFromPositions(stepPositions, materials.tread);
  steps.receiveShadow = true;
  steps.castShadow = true;
  steps.name = 'concrete-terraces';
  group.add(steps);

  const aisleMesh = geometryFromPositions(aislePositions, materials.aisle);
  aisleMesh.receiveShadow = true;
  aisleMesh.name = 'stepped-aisles';
  group.add(aisleMesh);

  const seatMesh = new THREE.InstancedMesh(seatGeometry(), materials.seat, seatMatrices.length);
  seatMatrices.forEach((matrix, i) => seatMesh.setMatrixAt(i, matrix));
  for (let i = 0; i < seatColors.length / 3; i++) {
    tempColor.setRGB(seatColors[i * 3], seatColors[i * 3 + 1], seatColors[i * 3 + 2]);
    seatMesh.setColorAt(i, tempColor);
  }
  seatMesh.instanceColor.needsUpdate = true;
  seatMesh.instanceMatrix.needsUpdate = true;
  seatMesh.receiveShadow = true;
  seatMesh.castShadow = false;
  seatMesh.frustumCulled = false;
  seatMesh.name = `seats-${seatMatrices.length}`;
  group.add(seatMesh);

  // Low trackside kerb and glass balustrade at the foot of the first row. The
  // lower bowl now lands at pitch level, so this is a 1 m rail rather than the
  // old 3 m retaining wall, and the concourse opens onto the track at the four
  // corner tunnels.
  for (let i = 0; i < 4; i++) {
    const a0 = TUNNEL_ANGLES[i] + TUNNEL_HALF;
    const a1 = TUNNEL_ANGLES[i] + HALF_PI - TUNNEL_HALF;
    const n = Math.max(8, Math.round(((a1 - a0) / TAU) * segments));
    group.add(ellipseArcBand(87.35, 52.2, 0, 0.68, a0, a1, materials.concreteDark, n));
    group.add(ellipseArcBand(87.25, 52.1, 0.66, 1.0, a0, a1, materials.railGlass, n));
    group.add(ellipseArcBand(87.2, 52.05, 0.99, 1.06, a0, a1, materials.fascia, n));
  }

  // Tunnels: a raking floor and two cheek walls cut through the lower bowl.
  const tunnelPositions = [];
  for (const a of TUNNEL_ANGLES) {
    const aL = a - TUNNEL_HALF;
    const aR = a + TUNNEL_HALF;
    const innerX = 86.0;
    const innerZ = 50.6;
    const outer = tiers[0];
    const yFloor = 0.08;
    const yTop = outer.y0 + TUNNEL_ROWS * outer.rise;

    const f0 = ellipsePoint(innerX, innerZ, aL, yFloor);
    const f1 = ellipsePoint(innerX, innerZ, aR, yFloor);
    const g1 = ellipsePoint(outer.ax1, outer.az1, aR, yFloor);
    const g0 = ellipsePoint(outer.ax1, outer.az1, aL, yFloor);
    addQuad(tunnelPositions, f0, f1, g1, g0);

    const t1 = ellipsePoint(outer.ax1, outer.az1, aR, yTop);
    const t0 = ellipsePoint(outer.ax1, outer.az1, aL, yTop);
    addTriangle(tunnelPositions, g1, t1, g0);
    addTriangle(tunnelPositions, g0, t1, t0);

  }
  const tunnelMesh = geometryFromPositions(tunnelPositions, materials.darkMetal);
  tunnelMesh.name = 'corner-tunnels';
  group.add(tunnelMesh);

  const walls = [];
  const portalMatrices = [];
  const portalGeo = new THREE.BoxGeometry(1, 1, 1);

  for (let i = 1; i < tiers.length; i++) {
    const below = tiers[i - 1];
    const above = tiers[i];
    const y0 = below.y0 + below.rows * below.rise;
    const y1 = above.y0;
    // The wall stands right under the first row of the tier above, so the seats
    // sit on it instead of hovering a few metres outside it. A flat coping
    // closes the strip between the wall face and the first tread.
    const ax = above.ax0 - 0.6;
    const az = above.az0 - 0.5;
    group.add(ellipseRingGeometry(above.ax0, above.az0, ax, az, y1 - 0.01, materials.fascia, 180));

    // The head of every tier and the foot of the tier above both sit at fixed
    // heights, so each concourse band is a plain, level ring: the gap reads the
    // same right around the bowl.
    const band = (bx, bz, by0, by1, ta, tb, material, n) => (
      ellipseArcBand(bx, bz, by0, by1, ta, tb, material, n)
    );

    // Twenty entrance portals per wall, one above every structural bay, so the
    // rhythm runs symmetrically right around the stadium. The seats, the
    // platform behind the wall and the facade doors read as a single route.
    const doors = [];
    for (let s = 0; s < SECTORS; s++) {
      const theta = s * SECTOR;
      if (above.name === 'upper' && !inSpans(upperSpans, theta)) continue;
      const arc = Math.sqrt((ax * Math.sin(theta)) ** 2 + (az * Math.cos(theta)) ** 2);
      doors.push({ theta, half: 2.05 / Math.max(arc, 1) });
    }

    for (const [ta, tb] of spansOf(above)) {
      for (const [da, db] of splitArcs(ta, tb, doors)) {
        const n = arcSegments(da, db);
        group.add(band(ax, az, y0, y0 + 0.42, da, db, materials.fascia, n));
        group.add(band(ax - 0.1, az - 0.09, y0 + 0.42, y1 - 0.55, da, db, materials.suiteGlass, n));
        group.add(band(ax + 0.02, az + 0.02, y0 + 1.28, y0 + 1.42, da, db, materials.fascia, n));
        group.add(band(ax - 0.15, az - 0.13, y0 + 0.4, y0 + 0.52, da, db, materials.ledRibbon, n));
      }
      // The crest band runs past every doorway as a continuous lintel.
      const nc = arcSegments(ta, tb);
      group.add(band(ax, az, y1 - 0.55, y1, ta, tb, materials.fascia, nc));
    }

    for (const door of doors) {
      for (const side of [-1, 1]) {
        const theta = door.theta + side * door.half;
        dummy.position.copy(ellipsePoint(ax, az, theta, (y0 + y1 - 0.55) * 0.5));
        dummy.rotation.set(0, HALF_PI - theta, 0);
        dummy.scale.set(0.52, y1 - 0.55 - y0, 1.05);
        dummy.updateMatrix();
        portalMatrices.push(dummy.matrix.clone());
      }
    }

    // Vertical mullions over the glazed band, interrupted by the portals.
    for (let m = 0; m < 120; m++) {
      const theta = (m / 120) * TAU;
      if (above.name === 'upper' && !inSpans(upperSpans, theta)) continue;
      if (doors.some((d) => Math.abs(theta - d.theta) < d.half + 0.014)) continue;
      struts.push({
        a: ellipsePoint(ax - 0.08, az - 0.07, theta, y0 + 0.44),
        b: ellipsePoint(ax - 0.08, az - 0.07, theta, y1 - 0.56),
        r: 0.065,
        light: true,
      });
    }

    walls.push({ ax, az, y0, y1, below, above, doors });
  }

  const portals = new THREE.InstancedMesh(portalGeo, materials.fascia, portalMatrices.length);
  portalMatrices.forEach((matrix, i) => portals.setMatrixAt(i, matrix));
  portals.instanceMatrix.needsUpdate = true;
  portals.name = 'stand-entrance-portals';
  portals.castShadow = true;
  group.add(portals);

  // Rolled edge of the upper bowl, only where the third tier exists.
  for (const [ta, tb] of upperTopSpans) {
    const n = arcSegments(ta, tb);
    group.add(tiltedArcBand(138.35, 127.35, upperTop, upperTop + 0.45, ta, tb, upperDropAt, materials.fascia, n));
    group.add(tiltedArcBand(138.3, 127.3, upperTop + 0.45, upperTop + 0.95, ta, tb, upperDropAt, materials.suiteGlass, n));
  }

  // The thinned ends of the upper bowl are closed row by row, so the third
  // tier reads as a wedge fading out towards the goals.
  const endPosition = [];
  for (let row = 0; row < tiers[2].rows; row++) {
    const r0 = radiusAt(tiers[2], row);
    const r1 = radiusAt(tiers[2], row + 1);
    const y0 = tiers[2].y0 + row * tiers[2].rise;
    const y1 = y0 + tiers[2].rise;
    for (const [ta, tb] of spansForRow(tiers[2], row)) {
      for (const theta of [ta, tb]) {
        const dy = tierDrop(tiers[2], theta, row);
        const dyTop = tierDrop(tiers[2], theta, row + 1);
        addQuad(
          endPosition,
          ellipsePoint(r0.ax, r0.az, theta, y0 + dy),
          ellipsePoint(r1.ax, r1.az, theta, y0 + dy),
          ellipsePoint(r1.ax, r1.az, theta, y1 + dyTop),
          ellipsePoint(r0.ax, r0.az, theta, y1 + dyTop),
        );
      }
    }
  }
  const endWalls = geometryFromPositions(endPosition, materials.concrete);
  endWalls.name = 'upper-bowl-end-walls';
  endWalls.receiveShadow = true;
  endWalls.castShadow = true;
  group.add(endWalls);

  // Concourse platform at the head of the lower bowl. It is the same deck as
  // the club-tier platform above: a level ring that runs from the last row out
  // to the crystal shell, so the entrances open onto a real floor.
  const lowerTop = tiers[0].y0 + tiers[0].rows * tiers[0].rise;
  group.add(ellipseRingGeometry(139.0, 129.6, tiers[0].ax1, tiers[0].az1, lowerTop - 0.05, materials.concrete, 200));
  group.add(ellipseRingGeometry(138.9, 129.5, tiers[0].ax1 + 0.1, tiers[0].az1 + 0.1, lowerTop - 0.03, materials.deck, 160));

  // Rear concourse deck spanning from the last row out to the crystal shell,
  // so the stand structure lands on the facade instead of stopping short.
  group.add(ellipseRingGeometry(139.0, 129.6, 122.0, 90.0, middleTop - 0.05, materials.concrete, 200));
  for (let m = 0; m < 160; m++) {
    const theta = (m / 160) * TAU;
    const a = ellipsePoint(139.0, 129.6, theta, middleTop);
    const b = ellipsePoint(139.0, 129.6, theta, middleTop + 1.1);
    struts.push({ a, b, r: 0.09, light: true });
  }
  group.add(ellipseArcBand(139.0, 129.6, middleTop, middleTop + 1.2, 0, TAU, materials.concreteDark, 200));

  // Concourse deck at the head of the club tier, and the LED boards standing
  // on it behind each goal.
  group.add(ellipseRingGeometry(138.9, 129.5, 122.0, 90.0, middleTop - 0.03, materials.deck, 160));

  for (const dir of [-1, 1]) {
    const cx = dir * 123.5;
    const cy = 32.0;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 36), materials.concrete);
    plinth.position.set(cx, middleTop + 0.3, 0);
    group.add(plinth);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 17.2, 33), materials.darkMetal);
    frame.position.set(cx, cy, 0);
    frame.castShadow = true;
    group.add(frame);

    const board = new THREE.Mesh(new THREE.PlaneGeometry(32, 16), materials.screen);
    board.position.set(cx - dir * 0.5, cy, 0);
    board.rotation.y = dir > 0 ? -HALF_PI : HALF_PI;
    board.name = 'led-video-board';
    group.add(board);

    for (const z of [-14, 14]) {
      struts.push({
        a: new THREE.Vector3(cx, middleTop + 0.4, z),
        b: new THREE.Vector3(cx, cy + 4.6, z),
        r: 0.15,
      });
    }
  }

  // Handrail rings at each tier edge.
  const railRing = (ax, az, y, spans) => {
    for (const [ta, tb] of spans) {
      const n = arcSegments(ta, tb);
      for (let i = 0; i < n; i++) {
        const a = ellipsePoint(ax, az, lerp(ta, tb, i / n), y);
        const b = ellipsePoint(ax, az, lerp(ta, tb, (i + 1) / n), y);
        struts.push({ a, b, r: 0.05, light: true });
      }
    }
  };
  railRing(87.45, 52.3, 1.08, [[0, TAU]]);
  railRing(tiers[1].ax0 + 0.1, tiers[1].az0 + 0.1, tiers[1].y0 + 0.12, [[0, TAU]]);
  railRing(tiers[2].ax0 + 0.1, tiers[2].az0 + 0.1, tiers[2].y0 + 0.12, upperSpans);

  return {
    group,
    seatCount: seatMatrices.length,
    seatMesh,
    concourseBands: walls,
    tiers,
    upperSpans,
    settle: { amount: UPPER_SETTLE, half: UPPER_HALF },
  };
}

/* --------------------------------------------------------------------------
   Concert crowd — light sticks and phone flashes over the seats
   -------------------------------------------------------------------------- */

// The whole bowl holds one colour at a time, the way a real audience's sticks are
// synced to the show; that colour walks the hue wheel on its own.
const CROWD_PALETTE = 96;
// A lookup table for the sway, so a few thousand hands can drift every frame
// without a trigonometry call each.
const CROWD_SWAY = 256;

function buildCrowdLights(seatMesh) {
  const group = new THREE.Group();
  group.name = 'crowd-lights';

  const instances = seatMesh.count;
  const positions = seatMesh.instanceMatrix.array;
  const stickPositions = [];
  const stickLevels = [];
  const stickPhases = [];
  const flashPositions = [];
  const flashSeeds = [];
  const seat = new THREE.Vector3();

  // Every single seat gets its own dice: a hand goes up at random, scattered a
  // little off the seat, at a slightly different height. Nothing is placed on a
  // regular stride, so the bowl never reads as rows of neat dots.
  for (let i = 0; i < instances; i++) {
    seat.fromArray(positions, i * 16 + 12);
    const roll = hash2(i * 1.37, 2.9);
    const driftX = (hash2(i * 0.37, 1.7) - 0.5) * 1.7;
    const driftZ = (hash2(i * 0.71, 3.1) - 0.5) * 1.7;
    const lift = 0.85 + hash2(i * 1.91, 4.3) * 1.25;
    const x = seat.x + driftX;
    const z = seat.z + driftZ;
    if (roll > 0.86) {
      stickPositions.push(x, seat.y + lift, z);
      stickLevels.push(0.78 + hash2(i * 4.31, 6.1) * 0.3);
      // Each hand swings on its own clock.
      stickPhases.push(Math.floor(hash2(i * 5.17, 8.3) * CROWD_SWAY));
    }
    // A phone goes up over the sticks for a fair slice of the crowd.
    if (hash2(i * 2.13, 7.7) > 0.9) {
      flashPositions.push(x, seat.y + lift + 0.35, z);
      flashSeeds.push(hash2(i * 3.71, 5.9));
    }
  }

  const glow = createGlowTexture();

  const stickGeometry = new THREE.BufferGeometry();
  stickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stickPositions, 3));
  const stickCount = stickPositions.length / 3;
  const stickColors = new Float32Array(stickCount * 3).fill(0.5);
  stickGeometry.setAttribute('color', new THREE.BufferAttribute(stickColors, 3));
  const sticks = new THREE.Points(stickGeometry, new THREE.PointsMaterial({
    size: 1.6,
    map: glow,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }));
  sticks.name = 'crowd-light-sticks';
  sticks.frustumCulled = false;
  sticks.visible = false;
  group.add(sticks);

  const flashGeometry = new THREE.BufferGeometry();
  flashGeometry.setAttribute('position', new THREE.Float32BufferAttribute(flashPositions, 3));
  const flashCount = flashPositions.length / 3;
  const flashColors = new Float32Array(flashCount * 3);
  flashGeometry.setAttribute('color', new THREE.BufferAttribute(flashColors, 3));
  const flashes = new THREE.Points(flashGeometry, new THREE.PointsMaterial({
    size: 1.3,
    map: glow,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }));
  flashes.name = 'crowd-camera-flashes';
  flashes.frustumCulled = false;
  flashes.visible = false;
  group.add(flashes);

  return {
    group,
    sticks,
    flashes,
    stickGeometry,
    stickCount,
    stickColors,
    stickLevels: Float32Array.from(stickLevels),
    stickPhases: Int16Array.from(stickPhases),
    stickBase: Float32Array.from(stickPositions),
    flashGeometry,
    flashCount,
    flashColors,
    flashSeeds: Float32Array.from(flashSeeds),
    flashBase: Float32Array.from(flashPositions),
  };
}

/* --------------------------------------------------------------------------
   Pitch, track and goals
   -------------------------------------------------------------------------- */

function buildField(materials) {
  const group = new THREE.Group();
  group.name = 'field';

  // The athletics field is drawn at 90% so the lower bowl can start on the
  // apron at pitch level instead of sitting three metres up behind a wall.
  const k = 0.9;
  const centerOffset = 42.195 * k;
  const innerR = 36.5 * k;
  const laneWidth = 1.22;
  const lanes = 9;
  const outerR = innerR + laneWidth * lanes;

  const infieldShape = stadiumShape(centerOffset, innerR);
  const infieldGeo = new THREE.ShapeGeometry(infieldShape, 180);
  infieldGeo.rotateX(-HALF_PI);
  const infield = new THREE.Mesh(infieldGeo, materials.fieldGreen);
  infield.position.y = 0.045;
  infield.receiveShadow = true;
  group.add(infield);

  const trackShape = stadiumShape(centerOffset, outerR);
  trackShape.holes.push(stadiumHolePath(centerOffset, innerR));
  const trackGeo = new THREE.ShapeGeometry(trackShape, 220);
  trackGeo.rotateX(-HALF_PI);
  const track = new THREE.Mesh(trackGeo, materials.track);
  track.position.y = 0.075;
  track.receiveShadow = true;
  track.name = 'running-track';
  group.add(track);

  // Concrete apron between track and lower bowl.
  const apronShape = ellipsoidShape(87.1, 51.9);
  const apronHole = stadiumHolePath(centerOffset, outerR + 0.15);
  apronShape.holes.push(apronHole);
  const apronGeo = new THREE.ShapeGeometry(apronShape, 180);
  apronGeo.rotateX(-HALF_PI);
  const apron = new THREE.Mesh(apronGeo, materials.concrete);
  apron.position.y = 0.025;
  apron.receiveShadow = true;
  group.add(apron);

  // Lane lines, drawn as precise line loops.
  for (let lane = 0; lane <= lanes; lane++) {
    const radius = innerR + lane * laneWidth;
    const points = [];
    for (let i = 0; i <= 70; i++) {
      const a = -HALF_PI + (i / 70) * PI;
      points.push(new THREE.Vector3(centerOffset + radius * Math.cos(a), 0.1, radius * Math.sin(a)));
    }
    for (let i = 0; i <= 50; i++) {
      const x = lerp(centerOffset, -centerOffset, i / 50);
      points.push(new THREE.Vector3(x, 0.1, radius));
    }
    for (let i = 0; i <= 70; i++) {
      const a = HALF_PI + (i / 70) * PI;
      points.push(new THREE.Vector3(-centerOffset + radius * Math.cos(a), 0.1, radius * Math.sin(a)));
    }
    for (let i = 0; i <= 50; i++) {
      const x = lerp(-centerOffset, centerOffset, i / 50);
      points.push(new THREE.Vector3(x, 0.1, -radius));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.LineLoop(geometry, materials.whiteMark);
    line.renderOrder = 2;
    group.add(line);
  }

  // Court.
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(105 * k, 68 * k), materials.pitch);
  pitch.rotation.x = -HALF_PI;
  pitch.position.y = 0.11;
  pitch.receiveShadow = true;
  pitch.name = 'football-pitch';
  group.add(pitch);

  // Goals.
  const goalMat = new THREE.MeshStandardMaterial({ color: 0xf3f5ee, metalness: 0.2, roughness: 0.35 });
  const netMat = new THREE.LineBasicMaterial({ color: 0xdde5dc, transparent: true, opacity: 0.26 });
  const makeGoal = (side) => {
    const g = new THREE.Group();
    const x = side * 52.5 * k;
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.44, 7);
    for (const z of [-3.66, 3.66]) {
      const post = new THREE.Mesh(postGeo, goalMat);
      post.position.set(x, 1.22, z);
      g.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7.32, 7), goalMat);
    bar.rotation.x = HALF_PI;
    bar.position.set(x, 2.44, 0);
    g.add(bar);

    const netPositions = [];
    const depth = 1.8 * side;
    for (let i = 0; i <= 10; i++) {
      const z = -3.66 + (i / 10) * 7.32;
      netPositions.push(x + depth, 0.02, z, x + depth, 2.44, z);
    }
    for (let i = 0; i <= 6; i++) {
      const y = (i / 6) * 2.44;
      netPositions.push(x + depth, y, -3.66, x + depth, y, 3.66);
      netPositions.push(x, y, -3.66, x + depth, y, -3.66);
      netPositions.push(x, y, 3.66, x + depth, y, 3.66);
    }
    for (let i = 0; i <= 8; i++) {
      const z = -3.66 + (i / 8) * 7.32;
      netPositions.push(x, 2.44, z, x + depth, 2.44, z);
    }
    const netGeo = new THREE.BufferGeometry();
    netGeo.setAttribute('position', new THREE.Float32BufferAttribute(netPositions, 3));
    g.add(new THREE.LineSegments(netGeo, netMat));
    return g;
  };
  group.add(makeGoal(1), makeGoal(-1));

  // LED perimeter boards.
  const boardGeo = new THREE.PlaneGeometry(101 * k, 0.95);
  for (const z of [-34.7 * k, 34.7 * k]) {
    const board = new THREE.Mesh(boardGeo, materials.boards);
    board.position.set(0, 0.52, z);
    board.rotation.y = z > 0 ? PI : 0;
    group.add(board);
  }
  const endBoardGeo = new THREE.PlaneGeometry(59 * k, 0.95);
  for (const x of [-55.6 * k, 55.6 * k]) {
    const board = new THREE.Mesh(endBoardGeo, materials.boards);
    board.position.set(x, 0.52, 0);
    board.rotation.y = x > 0 ? -HALF_PI : HALF_PI;
    group.add(board);
  }

  // Team benches and small athletics details.
  for (const side of [-1, 1]) {
    const shelter = new THREE.Mesh(new THREE.BoxGeometry(11, 0.16, 2.2), materials.darkMetal);
    shelter.position.set(side * 14, 2.35, -38.4 * k);
    group.add(shelter);
    for (const x of [-4.8, 4.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.35, 0.11), materials.steel);
      leg.position.set(side * 14 + x, 1.17, -38.4 * k);
      group.add(leg);
    }
  }

  const flagMat = new THREE.MeshStandardMaterial({ color: 0xe76d38, side: THREE.DoubleSide, roughness: 0.8 });
  for (const x of [-52.5 * k, 52.5 * k]) {
    for (const z of [-34 * k, 34 * k]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.8, 5), goalMat);
      pole.position.set(x, 0.9, z);
      group.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.4), flagMat);
      flag.position.set(x + 0.34, 1.52, z);
      flag.rotation.y = -HALF_PI;
      group.add(flag);
    }
  }

  return group;
}

/* --------------------------------------------------------------------------
   Site: plaza, lake, trees, city and hills
   -------------------------------------------------------------------------- */

function buildLake(materials) {
  const group = new THREE.Group();
  group.name = 'lake';
  const center = new THREE.Vector3(120, 0, 326);
  const ax = 178;
  const az = 84;

  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x123438) },
    uShallow: { value: new THREE.Color(0x38686a) },
    uSkyTop: { value: new THREE.Color(0x21404d) },
    uSkyHorizon: { value: new THREE.Color(0xb9a383) },
    uSunDir: { value: new THREE.Vector3(0, -1, 0) },
    uSunColor: { value: new THREE.Color(0xffd8a1) },
    uSunStrength: { value: 0 },
    uNight: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uSunStrength;
      uniform float uNight;
      varying vec3 vWorld;

      void main() {
        float w1 = sin(vWorld.x * 0.16 + uTime * 0.35) * 0.5;
        float w2 = sin(vWorld.z * 0.24 - uTime * 0.24) * 0.35;
        float w3 = sin((vWorld.x + vWorld.z) * 0.08 + uTime * 0.18) * 0.25;
        vec3 normal = normalize(vec3(
          -(cos(vWorld.x * 0.34 + uTime * 0.35) * 0.012 + cos((vWorld.x + vWorld.z) * 0.11 + uTime * 0.18) * 0.005),
          1.0,
          -(cos(vWorld.z * 0.41 - uTime * 0.24) * 0.009 + cos((vWorld.x + vWorld.z) * 0.11 + uTime * 0.18) * 0.005)
        ));

        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
        vec3 sky = mix(uSkyHorizon, uSkyTop, 0.45 + 0.3 * normal.y);
        vec3 col = mix(uDeep, uShallow, 0.46 + w1 * 0.008 + w2 * 0.006 + w3 * 0.005);
        col = mix(col, sky, 0.3 + fresnel * 0.4);

        vec3 sunDir = normalize(uSunDir);
        vec3 reflected = reflect(-viewDir, normal);
        float spec = pow(max(dot(reflected, sunDir), 0.0), 160.0);
        col += uSunColor * spec * (0.7 + 1.6 * uSunStrength);

        float sparkle = pow(max(dot(reflected, normalize(vec3(-0.3, 0.8, 0.45))), 0.0), 90.0);
        col += vec3(0.64, 0.8, 0.76) * sparkle * uNight * 0.28;

        // A soft pool of light on the shoreline beneath the stadium.
        float shore = exp(-pow((vWorld.z - 238.0) / 52.0, 2.0))
                    * exp(-pow((vWorld.x - 112.0) / 145.0, 2.0));
        col += vec3(0.18, 0.29, 0.25) * shore * uNight * 0.22;

        // A faint, broken reflection of the illuminated crystal on the water.
        float across = exp(-pow((vWorld.x - 128.0) / 122.0, 2.0));
        float along = exp(-pow((vWorld.z - 286.0) / 88.0, 2.0));
        float ripple = 0.5 + 0.5 * sin(vWorld.z * 2.6 + sin(vWorld.x * 0.7) * 1.8 + uTime * 0.5);
        float glint = pow(0.5 + 0.5 * sin(vWorld.x * 1.7 - uTime * 0.9), 8.0);
        col += vec3(0.31, 0.46, 0.4) * across * along * (ripple * 0.03 + glint * 0.05) * uNight;
        col += vec3(0.018, 0.04, 0.045) * uNight;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });

  const shape = ellipsoidShape(ax, az);
  const geometry = new THREE.ShapeGeometry(shape, 160);
  geometry.rotateX(-HALF_PI);
  const water = new THREE.Mesh(geometry, material);
  water.position.set(center.x, -0.025, center.z);
  water.name = 'water';
  group.add(water);

  // shoreline
  const shorePoints = [];
  for (let i = 0; i < 180; i++) {
    shorePoints.push(ellipsePoint(ax + 0.7, az + 0.7, (i / 180) * TAU, 0.03));
  }
  const shoreCurve = new THREE.CatmullRomCurve3(shorePoints, true, 'catmullrom', 0.12);
  const shore = new THREE.Mesh(new THREE.TubeGeometry(shoreCurve, 280, 0.55, 5, true), materials.stone);
  shore.position.set(center.x, 0, center.z);
  group.add(shore);

  // scattered shoreline stones
  const rand = mulberry32(219);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7e8277, roughness: 0.95 });
  const rocks = 60;
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < rocks; i++) {
    const theta = rand() * TAU;
    const rr = 0.96 + rand() * 0.1;
    dummy.position.set(
      center.x + ax * rr * Math.cos(theta),
      0.12 + rand() * 0.2,
      center.z + az * rr * Math.sin(theta),
    );
    dummy.rotation.set(rand() * PI, rand() * PI, rand() * PI);
    dummy.scale.set(0.7 + rand() * 1.6, 0.4 + rand() * 0.65, 0.7 + rand() * 1.6);
    dummy.updateMatrix();
    rockMesh.setMatrixAt(i, dummy.matrix);
  }
  rockMesh.instanceMatrix.needsUpdate = true;
  rockMesh.receiveShadow = true;
  group.add(rockMesh);

  // A narrow timber boardwalk on the northern shoreline, facing the stadium.
  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(148, 0.22, 4.2),
    new THREE.MeshStandardMaterial({ color: 0x5e4a35, roughness: 0.88 }),
  );
  boardwalk.position.set(center.x, 0.05, center.z - az - 3.6);
  boardwalk.receiveShadow = true;
  group.add(boardwalk);

  return { group, uniforms };
}

function palmCrownGeometry() {
  const geometry = [];
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const angle = (i / leaves) * TAU;
    const tip = new THREE.Vector3(3.3, -0.65, 0).applyAxisAngle(Y_AXIS, angle);
    const left = new THREE.Vector3(1.2, 0.11, 0.32).applyAxisAngle(Y_AXIS, angle);
    const right = new THREE.Vector3(1.2, 0.11, -0.32).applyAxisAngle(Y_AXIS, angle);
    const base = new THREE.Vector3(0, 0, 0);
    const positions = [];
    addTriangle(positions, base, left, tip);
    addTriangle(positions, base, tip, right);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    geometry.push(g);
  }
  const merged = mergeGeometries(geometry, false);
  merged.computeVertexNormals();
  return merged;
}

function buildTrees(materials) {
  const group = new THREE.Group();
  group.name = 'trees';
  const rand = mulberry32(1347);
  const broad = [];
  const palms = [];

  const isFree = (x, z) => {
    if ((x / 168) ** 2 + (z / 158) ** 2 < 1) return false;
    const lakeDx = (x - 120) / 202;
    const lakeDz = (z - 326) / 108;
    if (lakeDx * lakeDx + lakeDz * lakeDz < 1) return false;
    if (Math.abs(z - 326) < 32 && Math.abs(x - 120) < 200) return false;
    return true;
  };

  for (let i = 0; i < 180 && broad.length < 96; i++) {
    const angle = rand() * TAU;
    const radius = 205 + Math.pow(rand(), 0.7) * 255;
    const x = Math.cos(angle) * radius * 1.15;
    const z = Math.sin(angle) * radius;
    if (!isFree(x, z)) continue;
    broad.push({
      x,
      z,
      scale: 0.68 + rand() * 0.82,
      rotation: rand() * TAU,
      tone: rand(),
    });
  }

  for (let i = 0; i < 80 && palms.length < 34; i++) {
    const angle = rand() * TAU;
    const radius = 200 + rand() * 180;
    const x = Math.cos(angle) * radius * 1.12;
    const z = Math.sin(angle) * radius;
    if (!isFree(x, z)) continue;
    if (Math.abs(z) < 210) continue;
    palms.push({ x, z, scale: 0.8 + rand() * 0.5, rotation: rand() * TAU });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.4, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, materials.leaves, broad.length * 2);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, materials.trunk, broad.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  broad.forEach((tree, i) => {
    const height = 7.8 * tree.scale;
    dummy.position.set(tree.x, 0, tree.z);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.scale.set(tree.scale * 0.55, height, tree.scale * 0.55);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);

    for (let c = 0; c < 2; c++) {
      dummy.position.set(
        tree.x + (c === 0 ? -1.5 : 1.6) * tree.scale,
        height - 1.2 + c * 0.9,
        tree.z + (c === 0 ? 0.6 : -0.9) * tree.scale,
      );
      dummy.rotation.set(0, tree.rotation + c * 1.1, 0);
      dummy.scale.set(
        (3.5 + tree.tone * 1.8) * tree.scale,
        (2.7 + c * 0.7) * tree.scale,
        (3.3 + c * 0.4) * tree.scale,
      );
      dummy.updateMatrix();
      canopyMesh.setMatrixAt(i * 2 + c, dummy.matrix);
      color.setHSL(0.29 + tree.tone * 0.04, 0.24, 0.23 + tree.tone * 0.09);
      canopyMesh.setColorAt(i * 2 + c, color);
    }
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceColor.needsUpdate = true;
  trunkMesh.castShadow = true;
  canopyMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  canopyMesh.receiveShadow = true;
  group.add(trunkMesh, canopyMesh);

  const palmTrunk = new THREE.CylinderGeometry(0.16, 0.3, 1, 6);
  palmTrunk.translate(0, 0.5, 0);
  const palmTrunks = new THREE.InstancedMesh(palmTrunk, materials.trunk, palms.length);
  const crownMesh = new THREE.InstancedMesh(palmCrownGeometry(), materials.palmLeaf, palms.length);
  palms.forEach((tree, i) => {
    const h = 9.5 * tree.scale;
    dummy.position.set(tree.x, 0, tree.z);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.scale.set(tree.scale * 0.8, h, tree.scale * 0.8);
    dummy.updateMatrix();
    palmTrunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tree.x, h - 0.2, tree.z);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.updateMatrix();
    crownMesh.setMatrixAt(i, dummy.matrix);
  });
  palmTrunks.instanceMatrix.needsUpdate = true;
  crownMesh.instanceMatrix.needsUpdate = true;
  palmTrunks.castShadow = true;
  crownMesh.castShadow = true;
  group.add(palmTrunks, crownMesh);

  return group;
}

function buildLamps(materials) {
  const group = new THREE.Group();
  group.name = 'lighting-masts';
  const count = 10;
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.27, 13, 7);
  poleGeo.translate(0, 6.5, 0);
  const headGeo = new THREE.BoxGeometry(2.6, 0.28, 0.8);
  const poles = new THREE.InstancedMesh(poleGeo, materials.steel, count);
  const heads = new THREE.InstancedMesh(headGeo, materials.darkMetal, count);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * TAU + 0.18;
    const x = 186 * Math.cos(theta);
    const z = 176 * Math.sin(theta);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, -theta, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, 13.1, z);
    dummy.rotation.set(0, -theta, 0);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);

    const glow = new THREE.Sprite(materials.glowLamp.clone());
    glow.position.set(x, 13.2, z);
    glow.scale.set(9, 9, 1);
    glow.userData.isLampGlow = true;
    group.add(glow);
  }
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  poles.castShadow = true;
  group.add(poles, heads);
  return group;
}

function buildHills(materials) {
  const group = new THREE.Group();
  group.name = 'horizon';
  const rand = mulberry32(941);

  for (let layer = 0; layer < 2; layer++) {
    const radius = 1240 + layer * 290;
    const segments = 160;
    const positions = [];
    const heights = [];
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * TAU;
      const wave =
        Math.sin(theta * 3.1 + layer * 1.7) * 0.42 +
        Math.sin(theta * 7.3 + 1.2) * 0.2 +
        Math.sin(theta * 13.7 + 2.4) * 0.1;
      heights.push(24 + layer * 14 + wave * 40 + rand() * 8);
    }
    const ring = [];
    for (let i = 0; i < segments; i++) {
      const theta0 = (i / segments) * TAU;
      const theta1 = ((i + 1) / segments) * TAU;
      const h0 = heights[i];
      const h1 = heights[(i + 1) % segments];
      const a = new THREE.Vector3(Math.cos(theta0) * radius, -2, Math.sin(theta0) * radius);
      const b = new THREE.Vector3(Math.cos(theta1) * radius, -2, Math.sin(theta1) * radius);
      const c = new THREE.Vector3(Math.cos(theta1) * radius, h1, Math.sin(theta1) * radius);
      const d = new THREE.Vector3(Math.cos(theta0) * radius, h0, Math.sin(theta0) * radius);
      addQuad(positions, a, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      color: layer === 0 ? 0x101d1a : 0x0b1513,
      transparent: layer > 0,
      opacity: layer === 0 ? 1 : 0.72,
      fog: true,
      depthWrite: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  return group;
}

function buildCity(materials) {
  const group = new THREE.Group();
  group.name = 'distant-city';
  const rand = mulberry32(551);
  const count = 46;
  const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.building, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const lightPositions = [];

  for (let i = 0; i < count; i++) {
    const theta = 0.15 + rand() * 2.6;
    const radius = 910 + rand() * 260;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    const h = 18 + Math.pow(rand(), 2) * 74;
    const w = 10 + rand() * 22;
    const d = 10 + rand() * 22;
    dummy.position.set(x, h / 2, z);
    dummy.rotation.set(0, rand() * 0.7, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    boxes.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.43, 0.08, 0.11 + rand() * 0.05);
    boxes.setColorAt(i, color);

    for (let j = 0; j < 4; j++) {
      lightPositions.push(
        x + (rand() - 0.5) * w,
        h * (0.25 + rand() * 0.7),
        z + (rand() - 0.5) * d,
      );
    }
  }
  boxes.instanceMatrix.needsUpdate = true;
  boxes.instanceColor.needsUpdate = true;
  group.add(boxes);

  const lightsGeo = new THREE.BufferGeometry();
  lightsGeo.setAttribute('position', new THREE.Float32BufferAttribute(lightPositions, 3));
  const lights = new THREE.Points(lightsGeo, materials.cityLights);
  group.add(lights);

  return group;
}

function buildSite(materials) {
  const group = new THREE.Group();
  group.name = 'site';

  const ground = ellipseRingGeometry(1700, 1700, 138.8, 129.4, -0.42, materials.grass, 200);
  group.add(ground);

  const plaza = ellipseRingGeometry(194, 184, 145.5, 136.1, 0.02, materials.paving, 190);
  group.add(plaza);

  const ringRoad = ellipseRingGeometry(262, 250, 254, 242, 0.01, materials.asphalt, 180);
  group.add(ringRoad);

  const accessMat = materials.paving;
  for (let i = 0; i < 4; i++) {
    const theta = (i / 4) * TAU + PI / 4;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(13, 94), accessMat);
    path.rotation.order = 'YXZ';
    path.rotation.y = theta;
    path.rotation.x = -HALF_PI;
    path.position.set(Math.cos(theta) * 211, 0.03, Math.sin(theta) * 211);
    path.receiveShadow = true;
    group.add(path);
  }

  const lake = buildLake(materials);
  group.add(lake.group);
  group.add(buildTrees(materials));
  group.add(buildLamps(materials));

  // Low path bollards tie the plaza to the lake shore and give the site a scale.
  const bollardCount = 26;
  const bollardGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.05, 6);
  bollardGeo.translate(0, 0.53, 0);
  const bollards = new THREE.InstancedMesh(bollardGeo, materials.darkMetal, bollardCount);
  const bollardLight = new THREE.SphereGeometry(0.17, 6, 5);
  const bollardGlow = new THREE.InstancedMesh(bollardLight, materials.ledRibbon, bollardCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < bollardCount; i++) {
    const theta = (i / bollardCount) * TAU + 0.08;
    const x = 181 * Math.cos(theta);
    const z = 172 * Math.sin(theta);
    dummy.position.set(x, 0.02, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bollards.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 1.13;
    dummy.updateMatrix();
    bollardGlow.setMatrixAt(i, dummy.matrix);

    if (i % 2 === 0) {
      const glow = new THREE.Sprite(materials.glowLamp.clone());
      glow.position.set(x, 1.2, z);
      glow.scale.set(4.5, 4.5, 1);
      glow.userData.isLampGlow = true;
      group.add(glow);
    }
  }
  bollards.instanceMatrix.needsUpdate = true;
  bollardGlow.instanceMatrix.needsUpdate = true;
  group.add(bollards, bollardGlow);

  group.add(buildHills(materials));
  group.add(buildCity(materials));

  return { group, lake };
}

/* --------------------------------------------------------------------------
   Public API
   -------------------------------------------------------------------------- */

export function createStadium({ detail = 1, onProgress = () => {} } = {}) {
  const root = new THREE.Group();
  root.name = 'shenzhen-universiade-stadium';
  const materials = createMaterials();
  const struts = [];
  const stats = { seats: 0, struts: 0 };

  onProgress(0.06, '解析 20 组折面单元');
  const facade = buildFacade(materials, struts, detail);
  root.add(facade.group);

  onProgress(0.2, '铺设三层看台与座席');
  const bowlStart = struts.length;
  const bowl = buildBowl(materials, struts, detail);
  stats.seats = bowl.seatCount;
  for (let i = bowlStart; i < struts.length; i++) {
    struts[i].a.y -= PITCH_DROP;
    struts[i].b.y -= PITCH_DROP;
  }
  bowl.group.position.y = -PITCH_DROP;
  root.add(bowl.group);

  // Concert crowd sits on the real seats, so it inherits the bowl's own frame.
  const crowd = buildCrowdLights(bowl.seatMesh);
  bowl.group.add(crowd.group);

  onProgress(0.38, '张拉屋顶膜面');
  const roof = buildRoof(materials, struts, detail);
  root.add(roof.group);

  onProgress(0.55, '建立基座与入口');
  root.add(buildBase(materials, struts));

  onProgress(0.66, '铺设田径场与足球场');
  const field = buildField(materials);
  field.position.y = -PITCH_DROP;
  root.add(field);

  onProgress(0.78, '种植湖岸与城市森林');
  const site = buildSite(materials);
  const lake = site.lake;
  root.add(site.group);

  onProgress(0.93, '焊接空间网格');
  stats.struts = struts.length;
  const heavyStruts = struts.filter((segment) => !segment.light);
  const brightStruts = struts.filter((segment) => segment.light);
  const strutMesh = buildStrutMesh(heavyStruts, materials.steel, 6);
  if (strutMesh) {
    strutMesh.name = 'space-grid-struts';
    root.add(strutMesh);
  }
  const edgeMesh = buildStrutMesh(brightStruts, materials.frame, 5);
  if (edgeMesh) {
    edgeMesh.name = 'bright-edge-members';
    root.add(edgeMesh);
  }

  // Glow sprites belong to the roof group; collect them for atmosphere updates.
  const glows = [];
  root.traverse((object) => {
    if (object.isSprite) glows.push(object);
  });

  let currentMode = null;
  let structure = false;
  let strobe = false;
  // The "关灯" mode kills the architectural lighting only: the facade wash, the
  // canopy skin and the floodlight banks go dark while the pitch keeps its own
  // rig, so the material can be read without any lamp on it.
  let lightsOff = false;
  const lampBase = { intensity: 0.22 };
  // Level a flash is built on, independent of the lights-off switch.
  const lampLit = { intensity: 0.22, glow: 0 };
  // Deterministic but deliberately disorderly: each bank gets a new value at
  // ~15 Hz so the rig reads as a random chase instead of a synchronised blink.
  const flicker = (t, seed) => {
    const step = Math.floor(t * 15 + seed * 5.7);
    const h = Math.sin(step * 12.9898 + seed * 78.233) * 43758.5453;
    const v = h - Math.floor(h);
    return v < 0.46 ? 0.05 + v * 0.18 : 0.55 + v * 0.55;
  };

  /* Concert crowd. Every stick walks the same hue wheel from its own offset, so
     the bowl changes colour together, while each hand sways on its own clock. */
  const crowdTint = new THREE.Color();
  const crowdPalette = new Float32Array(CROWD_PALETTE * 3);
  for (let k = 0; k < CROWD_PALETTE; k++) {
    crowdTint.setHSL(k / CROWD_PALETTE, 0.92, 0.72);
    crowdPalette[k * 3] = crowdTint.r;
    crowdPalette[k * 3 + 1] = crowdTint.g;
    crowdPalette[k * 3 + 2] = crowdTint.b;
  }
  const swayTable = new Float32Array(CROWD_SWAY);
  for (let k = 0; k < CROWD_SWAY; k++) {
    swayTable[k] = Math.sin((k / CROWD_SWAY) * TAU);
  }

  const applyCrowdSticks = (t) => {
    // One hue for every stick; only the brightness differs a little, so the sea
    // still has depth.
    const idx = (Math.floor(t * 16) % CROWD_PALETTE) * 3;
    const red = crowdPalette[idx];
    const green = crowdPalette[idx + 1];
    const blue = crowdPalette[idx + 2];
    const { stickColors, stickLevels, stickCount, stickPhases, stickBase } = crowd;
    const pos = crowd.stickGeometry.attributes.position;
    const arr = pos.array;
    // Three clocks: side to side, up and down, in and out.
    const clockX = Math.floor(t * 19) % CROWD_SWAY;
    const clockY = Math.floor(t * 25) % CROWD_SWAY;
    const clockZ = Math.floor(t * 14) % CROWD_SWAY;
    for (let i = 0; i < stickCount; i++) {
      const phase = stickPhases[i];
      const k = i * 3;
      arr[k] = stickBase[k] + swayTable[(phase + clockX) & 255] * 0.72;
      arr[k + 1] = stickBase[k + 1] + swayTable[((phase * 2 + clockY) & 255)] * 0.34;
      arr[k + 2] = stickBase[k + 2] + swayTable[(phase + clockZ) & 255] * 0.72;
      // The glow pulses a little as the hand swings.
      const level = stickLevels[i] * (0.9 + 0.1 * swayTable[(phase + clockY) & 255]);
      stickColors[k] = red * level;
      stickColors[k + 1] = green * level;
      stickColors[k + 2] = blue * level;
    }
    pos.needsUpdate = true;
    crowd.stickGeometry.attributes.color.needsUpdate = true;
  };

  const applyCrowdFlash = (t) => {
    const step = Math.floor(t * 4);
    const { flashColors, flashSeeds, flashCount, flashBase } = crowd;
    const pos = crowd.flashGeometry.attributes.position;
    const arr = pos.array;
    const clockA = Math.floor(t * 16) % CROWD_SWAY;
    const clockB = Math.floor(t * 21) % CROWD_SWAY;
    for (let i = 0; i < flashCount; i++) {
      const seed = flashSeeds[i];
      const phase = Math.floor(seed * CROWD_SWAY);
      // The phone is lit the whole time and only trembles as the hand moves…
      const wobble = 1.02 + 0.14 * swayTable[(phase + clockA) & 255];
      // …with the occasional quick blink as it is lifted or tilted.
      const h = Math.sin(step * 12.9898 + seed * 78.233) * 43758.5453;
      const v = h - Math.floor(h);
      const blink = v > 0.95 ? 1.75 : v < 0.04 ? 0.4 : 1;
      const level = wobble * blink;
      flashColors[i * 3] = level;
      flashColors[i * 3 + 1] = level * 0.98;
      flashColors[i * 3 + 2] = level * 0.94;
      const k = i * 3;
      arr[k] = flashBase[k] + swayTable[(phase + clockB) & 255] * 0.34;
      arr[k + 1] = flashBase[k + 1] + swayTable[(phase * 3 + clockA) & 255] * 0.18;
      arr[k + 2] = flashBase[k + 2] + swayTable[(phase + clockA) & 255] * 0.34;
    }
    pos.needsUpdate = true;
    crowd.flashGeometry.attributes.color.needsUpdate = true;
  };

  let crowdSticks = false;
  let crowdFlash = false;

  const setCrowdSticks = (enabled) => {
    crowdSticks = Boolean(enabled);
    crowd.sticks.visible = crowdSticks;
    if (crowdSticks) applyCrowdSticks(performance.now() * 0.001);
  };

  const setCrowdFlash = (enabled) => {
    crowdFlash = Boolean(enabled);
    crowd.flashes.visible = crowdFlash;
    if (crowdFlash) applyCrowdFlash(performance.now() * 0.001);
  };

  /* The canopy has one master switch of its own: the ten banks of floodlights
     under the opening ring. Everything else — the facade wash, the pitch rig,
     the strobe and the per-lamp flicker — is a separate switch. */
  let lampBanks = true;

  const setLampBanks = (enabled) => {
    lampBanks = Boolean(enabled);
    if (lampBanks) {
      roof.lampMaterials.forEach((material) => {
        material.emissiveIntensity = lampBase.intensity;
      });
      roof.lampTint.fill(1);
      roof.lampGlow.geometry.attributes.color.needsUpdate = true;
      materials.roofLampGlow.opacity = lampLit.glow;
      materials.roofLampHaze.opacity = lampLit.glow * 0.24;
    } else {
      roof.lampMaterials.forEach((material) => {
        material.emissiveIntensity = 0.02;
      });
      roof.lampTint.fill(1);
      roof.lampGlow.geometry.attributes.color.needsUpdate = true;
      materials.roofLampGlow.opacity = 0;
      materials.roofLampHaze.opacity = 0;
    }
  };

  const applyGlow = (color, night, gala = null) => {
    const modeIntensity = currentMode ? currentMode.intensity : 1;
    const glow = smoothstep(0.02, 0.65, night) * modeIntensity;
    // With the lights switched off the whole skin, the lamps and their haze get
    // nothing, while the bowl, the pitch and the screens keep their own glow.
    const skin = lightsOff ? 0 : glow;

    materials.facadePearl.emissive.copy(color);
    materials.facadeMist.emissive.copy(color);
    materials.facadeGlass.emissive.copy(color);
    // Every crystal facet answers the night rig in exactly the same way, so the
    // skin reads as one colour rather than a lit top and a dark bottom.
    materials.facadePearl.emissiveIntensity = skin * 0.26;
    materials.facadeMist.emissiveIntensity = skin * 0.26;
    materials.facadeGlass.emissiveIntensity = skin * 0.26;
    materials.facadeShade.emissive.copy(color);
    materials.facadeShade.emissiveIntensity = skin * 0.05;
    materials.facadeStone.emissive.copy(color);
    materials.facadeStone.emissiveIntensity = skin * 0.26;
    materials.roofSkin.emissive.copy(color);
    materials.roofSkin.emissiveIntensity = skin * 0.16;
    const lampIntensity = lampBanks ? 0.22 + glow * 2.6 : 0.02;
    roof.lampMaterials.forEach((material) => {
      material.emissive.copy(color).offsetHSL(0, -0.08, 0.28);
      material.emissiveIntensity = lampIntensity;
    });
    lampBase.intensity = lampIntensity;
    // What a flash uses. It ignores the lights-off switch on purpose: the lamp
    // switches work even while the facade and the pitch are dark, they just light
    // the fittings for as long as they are on. The bank's own switch still wins:
    // with the banks off there is nothing to flash.
    lampLit.intensity = 0.22 + glow * 2.6;
    lampLit.glow = glow;
    materials.roofLampGlow.color.copy(color).offsetHSL(0, -0.05, 0.32);
    materials.roofLampGlow.opacity = lampBanks ? glow : 0;
    materials.roofLampHaze.color.copy(color).offsetHSL(0, 0, 0.2);
    materials.roofLampHaze.opacity = skin * 0.24;
    // The warm glazed band that fronts the concourse platforms. It used to be the
    // brightest thing in the bowl after dusk, so it now only glows faintly and
    // goes out with the lamps.
    materials.suiteGlass.emissiveIntensity = skin * 0.1;
    // Deep-grey seats go almost black under the night rig; a touch of self
    // illumination keeps them grey while the stand floods do the modelling.
    materials.seat.emissive.setHex(0x94a2a4);
    materials.seat.emissiveIntensity = glow * 0.03;
    materials.tread.emissiveIntensity = glow * 0.12;
    // The concourse decks also stay faintly self-lit by day, so each entrance
    // reads as a lighter opening punched through the dark glazed band. At night
    // they used to glow like a lit strip along the head of the lower and middle
    // bowls, so the night term is much weaker and dies with the lamps.
    materials.deck.emissiveIntensity = lightsOff ? 0.035 : 0.07 + glow * 0.1;
    materials.lobbyGlass.emissiveIntensity = 0.08 + glow * 0.62;
    materials.ledRibbon.color.copy(color);
    materials.ledRibbon.color.offsetHSL(0, 0, 0.18);
    materials.boards.emissiveIntensity = 0.08 + glow * 0.7;

    glows.forEach((sprite) => {
      if (sprite.userData.isLampGlow) {
        sprite.material.opacity = glow * 0.7;
      } else {
        sprite.material.opacity = glow * 0.55;
        sprite.material.color.copy(color);
      }
      sprite.material.needsUpdate = true;
    });

    materials.cityLights.opacity = glow * 0.7;
    materials.glowLamp.opacity = glow * 0.65;
    materials.glowField.opacity = glow * 0.55;
    lake.uniforms.uNight.value = glow;
  };

  const setLightMode = (mode) => {
    currentMode = mode;
    const color = new THREE.Color(mode.color);
    applyGlow(color, atmosphere.night);
  };

  // Independent of the colour preset: kills the facade wash, the skin's own
  // illumination and the whole floodlight rig, while the bowl, the pitch, the
  // screens and the site lamps keep working.
  const setLightsOff = (enabled) => {
    lightsOff = Boolean(enabled);
    applyGlow(new THREE.Color(currentMode ? currentMode.color : 0xe8fff4), atmosphere.night);
  };

  // Party strobe: every bank, plus the beacon glows, fires on its own random
  // beat. The average of the banks is published so the light they throw on the
  // pitch and the stands can flash with them.
  let strobeLevel = 1;
  const applyStrobe = (t) => {
    if (!lampBanks) return;
    const { lampMaterials, lampTint, lampsPerBank } = roof;
    const bankValue = [];
    let sum = 0;
    for (let bank = 0; bank * lampsPerBank < lampMaterials.length; bank++) {
      const v = flicker(t, bank * 1.7 + 1);
      bankValue.push(v);
      sum += v;
    }
    for (let i = 0; i < lampMaterials.length; i++) {
      const v = bankValue[Math.floor(i / lampsPerBank)] ?? 1;
      lampMaterials[i].emissiveIntensity = lampLit.intensity * (0.06 + v * 1.25);
      const c = 0.1 + v * 0.95;
      const idx = i * 3;
      lampTint[idx] = c;
      lampTint[idx + 1] = c;
      lampTint[idx + 2] = c;
    }
    // A flashing rig is lit, even with the lights-off switch on.
    materials.roofLampGlow.opacity = lampLit.glow;
    materials.roofLampHaze.opacity = lampLit.glow * 0.24;
    strobeLevel = sum / Math.max(1, bankValue.length);
    roof.lampGlow.geometry.attributes.color.needsUpdate = true;
  };

  const getStrobeLevel = () => {
    if (allFlicker) return allLevel;
    return strobe ? strobeLevel : 1;
  };

  const resetStrobe = () => {
    roof.lampMaterials.forEach((material) => {
      material.emissiveIntensity = lampBanks ? lampBase.intensity : 0.02;
    });
    roof.lampTint.fill(1);
    roof.lampGlow.geometry.attributes.color.needsUpdate = true;
    materials.roofLampGlow.opacity = lampBanks ? lampLit.glow : 0;
    materials.roofLampHaze.opacity = lampBanks ? lampLit.glow * 0.24 : 0;
    strobeLevel = 1;
  };

  const setStrobe = (enabled) => {
    strobe = enabled;
    if (!enabled) resetStrobe();
  };

  /* Same as the bank strobe, except that each of the 100 floodlights runs its own
     clock instead of its whole bank blinking together. Nothing else in the
     building changes: the pitch light flashes with the average, exactly like the
     bank strobe does. */
  let allFlicker = false;
  let allLevel = 1;
  const flickerAll = (t) => {
    if (!lampBanks) return;
    const { lampMaterials, lampTint } = roof;
    let sum = 0;
    for (let i = 0; i < lampMaterials.length; i++) {
      const v = flicker(t, i * 0.83 + 2.1);
      sum += v;
      lampMaterials[i].emissiveIntensity = lampLit.intensity * (0.06 + v * 1.25);
      const c = 0.1 + v * 0.95;
      const idx = i * 3;
      lampTint[idx] = c;
      lampTint[idx + 1] = c;
      lampTint[idx + 2] = c;
    }
    materials.roofLampGlow.opacity = lampLit.glow;
    materials.roofLampHaze.opacity = lampLit.glow * 0.24;
    roof.lampGlow.geometry.attributes.color.needsUpdate = true;
    allLevel = sum / Math.max(1, lampMaterials.length);
  };

  const resetAllFlicker = () => {
    resetStrobe();
    applyGlow(new THREE.Color(currentMode ? currentMode.color : 0xe8fff4), atmosphere.night);
  };

  const setAllFlicker = (enabled) => {
    allFlicker = Boolean(enabled);
    if (!allFlicker) resetAllFlicker();
  };

  /* One green for the crystals and one for the canopy, shaded by the real sun:
     low suns darken and warm the skin (long light, grazing incidence), noon lifts
     it to full value, night drops it back under the lamp rig. */
  const crystalGreen = new THREE.Color(0x3d9463);
  const canopyGreen = new THREE.Color(0x35895a);
  const warmLight = new THREE.Color(0xffc98b);
  const sunShade = new THREE.Color();
  const setSunlight = ({ altitude = 0 } = {}) => {
    const up = smoothstep(-0.08, 0.62, altitude);
    const level = 0.52 + 0.48 * up;
    const warm = (1 - smoothstep(0.03, 0.34, altitude)) * 0.4;
    sunShade.setRGB(1, 1, 1).lerp(warmLight, warm);
    const paint = (material, base) => {
      material.color.copy(base).multiplyScalar(level).multiply(sunShade);
    };
    paint(materials.facadePearl, crystalGreen);
    paint(materials.facadeMist, crystalGreen);
    paint(materials.facadeGlass, crystalGreen);
    paint(materials.facadeStone, crystalGreen);
    paint(materials.roofSkin, canopyGreen);
  };

  const atmosphere = { night: 0.8 };

  const updateAtmosphere = ({ night = 0.8, lightMode } = {}) => {
    atmosphere.night = night;
    if (lightMode) currentMode = lightMode;
    if (!currentMode) return;
    const base = new THREE.Color(currentMode.color);
    if (currentMode.gala) {
      const t = performance.now() * 0.00006;
      base.setHSL((t * 0.17) % 1, 0.82, 0.62);
    }
    applyGlow(base, night, currentMode.gala);
  };

  const setSky = ({ skyTop, skyHorizon, sunDir, sunColor, sunStrength, night }) => {
    if (lake) {
      lake.uniforms.uSkyTop.value.copy(skyTop);
      lake.uniforms.uSkyHorizon.value.copy(skyHorizon);
      lake.uniforms.uSunDir.value.copy(sunDir);
      lake.uniforms.uSunColor.value.copy(sunColor);
      lake.uniforms.uSunStrength.value = sunStrength;
      lake.uniforms.uNight.value = night;
    }
  };

  const setStructure = (enabled) => {
    structure = enabled;
    [materials.facadePearl, materials.facadeMist, materials.facadeGlass, materials.facadeShade, materials.facadeStone].forEach((material, index) => {
      material.transparent = enabled;
      material.opacity = enabled ? [0.12, 0.1, 0.07, 0.04, 0.045][index] : 1;
      material.depthWrite = !enabled;
      material.needsUpdate = true;
    });

    materials.roofSkin.transparent = enabled;
    materials.roofSkin.opacity = enabled ? 0.24 : 1;
    materials.roofSkin.depthWrite = !enabled;
    materials.roofSkin.needsUpdate = true;
    materials.facadeLines.opacity = enabled ? 0.95 : 0.7;
    materials.roofLines.opacity = enabled ? 0.78 : 0.5;
  };

  const update = (elapsed, delta) => {
    lake.uniforms.uTime.value = elapsed;
    if (currentMode?.gala) {
      updateAtmosphere({ night: atmosphere.night, lightMode: currentMode });
    }
    const pitchGlow = lightsOff ? 0 : 1;
    materials.glowField.opacity = (0.35 + Math.sin(elapsed * 0.8) * 0.025) * atmosphere.night * pitchGlow;
    if (strobe) applyStrobe(elapsed);
    if (allFlicker) flickerAll(elapsed);
    if (crowdSticks) applyCrowdSticks(elapsed);
    if (crowdFlash) applyCrowdFlash(elapsed);
  };

  const initialColor = new THREE.Color(0xe8fff4);
  applyGlow(initialColor, 0.8);

  // First-person walk volumes. The sunken pitch/apron and all three tiers are
  // described here, including the concourse platform behind each tier and the
  // entrance portals that connect the two.
  const wallOf = (index) => bowl.concourseBands[index] || null;
  const standArea = (index, label, spawnT, pitch) => {
    const tier = bowl.tiers[index];
    const top = tier.y0 + tier.rows * tier.rise;
    const wall = wallOf(index);
    return {
      label,
      view: 'stands',
      tier: index + 1,
      ax0: tier.ax0,
      az0: tier.az0,
      ax1: tier.ax1,
      az1: tier.az1,
      y0: tier.y0 - PITCH_DROP,
      rise: tier.rise,
      rows: tier.rows,
      eye: 2.6,
      tMin: 0.03,
      tMax: 0.95,
      spawnTheta: HALF_PI,
      spawnT,
      yaw: 0,
      pitch,
      fov: 68,
      speed: 7.0,
      run: 14.5,
      settle: index === 2 ? bowl.settle : null,
      // The upper bowl only exists along the two long sides; keep the walker
      // inside it so nobody strolls off the cut end of the wedge.
      spans: index === 2
        ? [[HALF_PI - bowl.settle.half, HALF_PI + bowl.settle.half],
          [PI * 1.5 - bowl.settle.half, PI * 1.5 + bowl.settle.half]]
        : null,
      platform: wall ? {
        ax: 137.2,
        az: 127.8,
        y: top - PITCH_DROP,
        wallAx: wall.ax,
        wallAz: wall.az,
        doors: wall.doors.map((door) => ({ theta: door.theta, half: door.half })),
        // The first tier's platform sits 1.2 m below the plaza and lines up
        // with the facade lobbies, so it can open straight out of the building.
        exit: index === 0 ? {
          ax: 139.0,
          az: 129.6,
          radius: 168,
          doors: Array.from({ length: SECTORS }, (_, s) => ({
            theta: s * SECTOR,
            half: 0.05,
          })),
        } : null,
      } : null,
    };
  };

  const walkAreas = {
    free: {
      label: '自由视角',
      view: 'free',
      free: true,
      spawn: [186, 88, 248],
      yaw: 0.645,
      pitch: -0.2,
      fov: 55,
      speed: 78,
    },
    field: {
      label: '内场',
      floor: -PITCH_DROP + 0.06,
      eye: 2.2,
      limitX: 86.0,
      limitZ: 50.4,
      spawn: [0, 14],
      yaw: 0,
      pitch: 0.04,
      fov: 72,
      speed: 8.6,
      run: 17.0,
    },
    stands1: standArea(0, '一层看台', 0.5, -0.02),
    stands2: standArea(1, '二层看台', 0.46, -0.12),
    stands3: standArea(2, '三层看台', 0.44, -0.16),
  };

  return {
    group: root,
    materials,
    stats,
    facade,
    roof,
    bowl,
    lake,
    walkAreas,
    setLightMode,
    setLightsOff,
    updateAtmosphere,
    setSky,
    setStructure,
    setStrobe,
    setAllFlicker,
    setCrowdSticks,
    setCrowdFlash,
    setLampBanks,
    crowd,
    getStrobeLevel,
    setSunlight,
    update,
    get structureMode() { return structure; },
    get strobeMode() { return strobe; },
    get flickerMode() { return allFlicker; },
    get lightsOffMode() { return lightsOff; },
    get crowdSticksMode() { return crowdSticks; },
    get crowdFlashMode() { return crowdFlash; },
    get lampBanksMode() { return lampBanks; },
  };
}
