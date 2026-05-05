import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import "./style.css";

type BodyKit = "wedge" | "tank" | "lowrider";
type PowerUpType = "rainbowTeeth" | "chompRam" | "hayRepair" | "goldHooves";

interface MapTheme {
  name: string;
  floor: number;
  grid: number;
  neonA: number;
  neonB: number;
  accent: number;
  props: "arcade" | "vhs" | "rink" | "pizza" | "mall" | "drivein" | "skatepark" | "subway";
}

interface Customization {
  paint: string;
  stripe: string;
  bodyKit: BodyKit;
  teethScale: number;
}

interface Driver {
  group: THREE.Group;
  teeth: THREE.Mesh[];
}

interface ChampionPassenger {
  group: THREE.Group;
  torso: THREE.Object3D;
  hips: THREE.Object3D;
  head: THREE.Object3D;
  arms: THREE.Object3D[];
  teeth: THREE.Mesh[];
}

interface DebrisPiece {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

interface PowerUp {
  type: PowerUpType;
  group: THREE.Group;
  position: THREE.Vector3;
  respawnAt: number;
  active: boolean;
}

interface Car {
  id: string;
  group: THREE.Group;
  chassis: THREE.Mesh;
  stripe: THREE.Mesh;
  cabin: THREE.Mesh;
  ram: THREE.Mesh;
  wheels: THREE.Mesh[];
  dents: THREE.Mesh[];
  damageMarks: THREE.Mesh[];
  dentLevels: number[];
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  driver: Driver;
  championPassenger?: ChampionPassenger;
  damage: number;
  scoreValue: number;
  isPlayer: boolean;
  aiAngle: number;
  lastHitAt: number;
  smokeTimer: number;
}

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("Missing canvas");

const speedEl = document.querySelector<HTMLElement>("#speed")!;
const damageEl = document.querySelector<HTMLElement>("#damage")!;
const scoreEl = document.querySelector<HTMLElement>("#score")!;
const powerupEl = document.querySelector<HTMLElement>("#powerup")!;
const mapEl = document.querySelector<HTMLElement>("#map")!;
const bannerEl = document.querySelector<HTMLElement>("#banner")!;
const garageEl = document.querySelector<HTMLElement>("#garage")!;
const openGarageEl = document.querySelector<HTMLButtonElement>("#openGarage")!;
const closeGarageEl = document.querySelector<HTMLButtonElement>("#closeGarage")!;
const paintEl = document.querySelector<HTMLInputElement>("#paint")!;
const stripeEl = document.querySelector<HTMLInputElement>("#stripe")!;
const bodyKitEl = document.querySelector<HTMLSelectElement>("#bodyKit")!;
const teethEl = document.querySelector<HTMLInputElement>("#teeth")!;
const companionToggleEl = document.querySelector<HTMLInputElement>("#companionToggle")!;

const keys = new Set<string>();
const customization: Customization = {
  paint: paintEl.value,
  stripe: stripeEl.value,
  bodyKit: bodyKitEl.value as BodyKit,
  teethScale: Number(teethEl.value),
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x161616);
scene.fog = new THREE.Fog(0x161616, 45, 105);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 220);
const clock = new THREE.Clock();

const hemi = new THREE.HemisphereLight(0xfff4d6, 0x2f3f44, 1.1);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(16, 28, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);

let world: RAPIER.World;
let player: Car;
let cars: Car[] = [];
const debris: DebrisPiece[] = [];
const powerUps: PowerUp[] = [];
let mapGroup = new THREE.Group();
let mapBodies: RAPIER.RigidBody[] = [];
let podiumGroup: THREE.Group;
let playerHits = 0;
let messageTimer = 4;
let cameraShake = 0;
let victory = false;
let victoryTimer = 0;
let championPassengerUnlocked = false;
let championPassengerEnabled = false;
let activePower: PowerUpType | null = null;
let activePowerTimer = 0;
const PODIUM_POSITION = new THREE.Vector3(0, 0, -31);
let audioContext: AudioContext | null = null;
let audioMaster: GainNode | null = null;
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let donkeySoundCooldown = 0;

const mapThemes: MapTheme[] = [
  { name: "Neon Arcade", floor: 0x221b35, grid: 0xff4fd8, neonA: 0x46b5ff, neonB: 0xff3bd5, accent: 0xffd95a, props: "arcade" },
  { name: "VHS Parking Lot", floor: 0x302538, grid: 0x79ffe1, neonA: 0xff4f38, neonB: 0x7c5cff, accent: 0xf7f0df, props: "vhs" },
  { name: "Laser Roller Rink", floor: 0x18313a, grid: 0xfff14d, neonA: 0xff4fd8, neonB: 0x5eff7e, accent: 0x47b4ff, props: "rink" },
  { name: "Pizza Palace 2099", floor: 0x332015, grid: 0xffd43b, neonA: 0xff3b2f, neonB: 0x31f0ff, accent: 0x63db7b, props: "pizza" },
  { name: "Dead Mall Dream", floor: 0x1d2634, grid: 0xff75c8, neonA: 0x00e5ff, neonB: 0xf5ead0, accent: 0xff9d2f, props: "mall" },
  { name: "Holo Drive-In", floor: 0x17212b, grid: 0x7affd7, neonA: 0xffe45e, neonB: 0x46b5ff, accent: 0xff4f7b, props: "drivein" },
  { name: "Cyber Skatepark", floor: 0x20242c, grid: 0xa8ff3e, neonA: 0xff4fd8, neonB: 0x00d4ff, accent: 0xfff14d, props: "skatepark" },
  { name: "Subway Afterhours", floor: 0x1b1f22, grid: 0xff3434, neonA: 0xffd43b, neonB: 0x4ee6ff, accent: 0xb088ff, props: "subway" },
];
let currentMapIndex = 0;

void boot();

async function boot() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  buildArena();
  podiumGroup = buildVictoryPodium();
  buildMapLayer();
  buildPowerUps();
  player = createCar("player", new THREE.Vector3(0, 1.1, 13), 0xf04f32, true);
  cars = [
    player,
    createCar("ai-1", new THREE.Vector3(-13, 1.1, -11), 0x3ea6ff, false),
    createCar("ai-2", new THREE.Vector3(14, 1.1, -8), 0xf9d04a, false),
    createCar("ai-3", new THREE.Vector3(0, 1.1, -17), 0x64d16e, false),
  ];
  applyCustomization();
  bindEvents();
  resize();
  renderer.setAnimationLoop(loop);
}

function buildArena() {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x5b5147, roughness: 0.92 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(42, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(84, 28, 0x8d8170, 0x6f6558);
  grid.position.y = 0.015;
  scene.add(grid);

  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(44, 0.05, 44).setFriction(1.1), groundBody);

  const barrierMat = new THREE.MeshStandardMaterial({ color: 0x30383a, roughness: 0.7, metalness: 0.2 });
  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2;
    const x = Math.cos(angle) * 41;
    const z = Math.sin(angle) * 41;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 1.2), barrierMat);
    wall.position.set(x, 1.5, z);
    wall.rotation.y = -angle;
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 1.5, z).setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) }));
    world.createCollider(RAPIER.ColliderDesc.cuboid(4, 1.5, 0.6).setFriction(0.8).setRestitution(0.35), body);
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2 + 0.2;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.4, 4),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xff7a24, roughness: 0.8 }),
    );
    cone.position.set(Math.cos(angle) * 26, 0.7, Math.sin(angle) * 26);
    cone.castShadow = true;
    scene.add(cone);
  }
}

function buildMapLayer() {
  scene.remove(mapGroup);
  for (const body of mapBodies) {
    world.removeRigidBody(body);
  }
  mapBodies = [];

  const theme = mapThemes[currentMapIndex];
  mapGroup = new THREE.Group();
  mapGroup.name = `map-${theme.name}`;
  scene.add(mapGroup);
  scene.background = new THREE.Color(theme.floor).offsetHSL(0, -0.08, -0.08);
  scene.fog = new THREE.Fog(scene.background, 42, 112);

  const floor = new THREE.Mesh(
    new THREE.RingGeometry(4, 40.5, 96),
    new THREE.MeshStandardMaterial({ color: theme.floor, roughness: 0.78, metalness: 0.12 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.025;
  floor.receiveShadow = true;
  mapGroup.add(floor);

  const neonGrid = new THREE.GridHelper(80, 20, theme.grid, theme.neonA);
  neonGrid.position.y = 0.04;
  mapGroup.add(neonGrid);

  buildCyberBackdrop(theme);
  buildDonkeyCrowd(theme);
  buildMapProps(theme);
  applyPodiumTheme(theme);
  mapEl.textContent = `Map ${theme.name}`;
}

function buildCyberBackdrop(theme: MapTheme) {
  const signMatA = new THREE.MeshStandardMaterial({ color: theme.neonA, emissive: theme.neonA, emissiveIntensity: 1.15, roughness: 0.35 });
  const signMatB = new THREE.MeshStandardMaterial({ color: theme.neonB, emissive: theme.neonB, emissiveIntensity: 1.05, roughness: 0.35 });
  for (let i = 0; i < 20; i += 1) {
    const angle = (i / 20) * Math.PI * 2;
    const radius = 61 + (i % 3) * 3.2;
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(1.6 + (i % 4) * 0.45, 5 + (i % 5) * 1.7, 1.1),
      i % 2 === 0 ? signMatA : signMatB,
    );
    tower.position.set(Math.cos(angle) * radius, tower.geometry.parameters.height / 2, Math.sin(angle) * radius);
    tower.rotation.y = -angle;
    tower.castShadow = true;
    mapGroup.add(tower);
  }
}

function buildDonkeyCrowd(theme: MapTheme) {
  const bleacherMat = new THREE.MeshStandardMaterial({ color: 0x171c22, roughness: 0.72, metalness: 0.28 });
  const railMat = new THREE.MeshStandardMaterial({ color: theme.neonA, emissive: theme.neonA, emissiveIntensity: 0.65, roughness: 0.4, metalness: 0.18 });
  const backWallMat = new THREE.MeshStandardMaterial({ color: 0x080d12, roughness: 0.82, metalness: 0.2 });
  const rows = [
    { radius: 55.5, y: 3.2, depth: 1.8 },
    { radius: 59.2, y: 4.35, depth: 1.9 },
    { radius: 63.2, y: 5.5, depth: 2 },
  ];

  for (let segment = 0; segment < 16; segment += 1) {
    const angle = (segment / 16) * Math.PI * 2;
    const retainingWall = new THREE.Mesh(new THREE.BoxGeometry(7.4, 3.2, 0.38), backWallMat);
    retainingWall.position.set(Math.cos(angle) * 52.4, 1.7, Math.sin(angle) * 52.4);
    retainingWall.rotation.y = -angle;
    retainingWall.castShadow = true;
    retainingWall.receiveShadow = true;
    mapGroup.add(retainingWall);

    for (const row of rows) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.42, row.depth), bleacherMat);
      bench.position.set(Math.cos(angle) * row.radius, row.y, Math.sin(angle) * row.radius);
      bench.rotation.y = -angle;
      bench.castShadow = true;
      bench.receiveShadow = true;
      mapGroup.add(bench);
    }

    const rail = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.14, 0.14), railMat);
    rail.position.set(Math.cos(angle) * 53.15, 3.15, Math.sin(angle) * 53.15);
    rail.rotation.y = -angle;
    mapGroup.add(rail);
  }

  for (let i = 0; i < 96; i += 1) {
    const rowIndex = i % rows.length;
    const segment = Math.floor(i / rows.length);
    const angle = (segment / 32) * Math.PI * 2 + (rowIndex - 1) * 0.012;
    const row = rows[rowIndex];
    const lateral = ((segment % 2) - 0.5) * 0.9;
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const spectator = createCrowdDonkey(i % 3 === 0 ? theme.neonA : i % 3 === 1 ? theme.neonB : theme.accent);
    spectator.scale.setScalar(0.88 + rowIndex * 0.06);
    spectator.position.copy(radial.multiplyScalar(row.radius - 0.45).add(tangent.multiplyScalar(lateral)));
    spectator.position.y = row.y + 0.36;
    spectator.rotation.y = -angle + Math.PI;
    mapGroup.add(spectator);
  }
}

function createCrowdDonkey(neonColor: number) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.36), new THREE.MeshStandardMaterial({ color: 0x8d684b, roughness: 0.82 }));
  body.position.y = 0.45;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb2855d, roughness: 0.8 }));
  head.position.set(0, 1.08, -0.05);
  group.add(head);

  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: neonColor, emissive: neonColor, emissiveIntensity: 0.9 }));
  glow.position.set(0, 0.98, -0.27);
  group.add(glow);

  for (const x of [-0.16, 0.16]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 6), new THREE.MeshStandardMaterial({ color: 0x8d684b, roughness: 0.8 }));
    ear.position.set(x, 1.42, 0);
    ear.rotation.z = x > 0 ? -0.18 : 0.18;
    group.add(ear);
  }

  return group;
}

function buildMapProps(theme: MapTheme) {
  const matA = new THREE.MeshStandardMaterial({ color: theme.neonA, emissive: theme.neonA, emissiveIntensity: 0.55, roughness: 0.45, metalness: 0.2 });
  const matB = new THREE.MeshStandardMaterial({ color: theme.neonB, emissive: theme.neonB, emissiveIntensity: 0.4, roughness: 0.55, metalness: 0.1 });
  const matAccent = new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.72, metalness: 0.15 });

  if (theme.props === "arcade") {
    addPropWall(-25, -5, 1.8, 4, 3, matA);
    addPropWall(24, 7, 1.8, 4, 3, matB);
    addPropWall(0, -24, 8, 1.2, 2.2, matAccent);
  } else if (theme.props === "vhs") {
    addPropWall(-21, 16, 7, 0.9, 2.4, matA);
    addPropWall(21, -14, 7, 0.9, 2.4, matB);
    addPropWall(0, 0, 3.2, 3.2, 1.8, matAccent);
  } else if (theme.props === "rink") {
    for (const z of [-18, 18]) addPropWall(0, z, 10, 0.8, 1.4, z < 0 ? matA : matB);
  } else if (theme.props === "pizza") {
    addPropWall(-11, -11, 5.5, 1.1, 2.1, matAccent);
    addPropWall(13, 11, 5.5, 1.1, 2.1, matA);
    addPropWall(0, 22, 3, 3, 2.6, matB);
  } else if (theme.props === "mall") {
    addPropWall(-18, 0, 1.4, 12, 2, matA);
    addPropWall(18, 0, 1.4, 12, 2, matB);
  } else if (theme.props === "drivein") {
    addPropWall(0, -20, 14, 0.7, 4.4, matA);
    addPropWall(-17, 13, 4, 1.1, 1.5, matAccent);
    addPropWall(17, 13, 4, 1.1, 1.5, matAccent);
  } else if (theme.props === "skatepark") {
    addRamp(-14, -6, 6, 2.8, matA, -0.45);
    addRamp(14, 8, 6, 2.8, matB, 0.45);
    addPropWall(0, 0, 8, 0.8, 1.3, matAccent);
  } else {
    addPropWall(-23, 0, 2, 15, 2.2, matA);
    addPropWall(23, 0, 2, 15, 2.2, matB);
    addPropWall(0, -18, 7, 1.1, 1.8, matAccent);
  }

  addHistoricalArchiveKiosk(theme);
}

function addPropWall(x: number, z: number, width: number, depth: number, height: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mapGroup.add(mesh);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, height / 2, z));
  world.createCollider(RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2).setFriction(0.8).setRestitution(0.35), body);
  mapBodies.push(body);
}

function addRamp(x: number, z: number, width: number, depth: number, material: THREE.Material, tilt: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, depth), material);
  mesh.position.set(x, 0.35, z);
  mesh.rotation.x = tilt;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mapGroup.add(mesh);
}

function addHistoricalArchiveKiosk(theme: MapTheme) {
  const kiosk = new THREE.Group();
  const angle = -Math.PI * 0.28;
  kiosk.position.set(Math.cos(angle) * 48, 0, Math.sin(angle) * 48);
  kiosk.lookAt(0, 2.5, 0);
  mapGroup.add(kiosk);

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x10161c, roughness: 0.7, metalness: 0.22 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x6adfff, emissive: 0x114d66, emissiveIntensity: 0.32, transparent: true, opacity: 0.34, roughness: 0.12 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x8c6a46, roughness: 0.68, metalness: 0.26 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x15100d, roughness: 0.76 });
  const neonMat = new THREE.MeshStandardMaterial({ color: theme.neonB, emissive: theme.neonB, emissiveIntensity: 0.85, roughness: 0.36 });
  const warnMat = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.42, roughness: 0.44 });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 1.35), baseMat);
  plinth.position.y = 0.35;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  kiosk.add(plinth);

  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.9, 0.18), baseMat);
  backPanel.position.set(0, 2.1, 0.6);
  backPanel.castShadow = true;
  kiosk.add(backPanel);

  const archiveGlow = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.12, 0.08), neonMat);
  archiveGlow.position.set(0, 3.25, 0.48);
  kiosk.add(archiveGlow);

  const caseGlass = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.72, 0.9), glassMat);
  caseGlass.position.set(0, 1.8, -0.03);
  kiosk.add(caseGlass);

  const bustBase = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.56, 0.34, 8), bronzeMat);
  bustBase.position.set(0, 1.02, -0.05);
  bustBase.castShadow = true;
  kiosk.add(bustBase);

  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.38, 5, 10), bronzeMat);
  shoulders.position.set(0, 1.33, -0.05);
  shoulders.scale.set(1.55, 0.58, 0.78);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.castShadow = true;
  kiosk.add(shoulders);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), bronzeMat);
  head.position.set(0, 1.82, -0.05);
  head.scale.set(0.9, 1.12, 0.84);
  head.castShadow = true;
  kiosk.add(head);

  const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.14, 16), darkMat);
  beret.position.set(0.04, 2.22, -0.08);
  beret.rotation.z = -0.16;
  beret.castShadow = true;
  kiosk.add(beret);

  const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.08), darkMat);
  mustache.position.set(0, 1.76, -0.36);
  kiosk.add(mustache);

  const crownBand = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.08, 0.16), warnMat);
  crownBand.position.set(0, 2.45, -0.05);
  crownBand.rotation.z = 0.18;
  kiosk.add(crownBand);

  for (const x of [-0.32, 0, 0.32]) {
    const crownPoint = new THREE.Mesh(new THREE.ConeGeometry(0.08, x === 0 ? 0.32 : 0.22, 4), warnMat);
    crownPoint.position.set(x, 2.62 + (x === 0 ? 0.04 : 0), -0.05);
    crownPoint.rotation.z = x * -0.8;
    kiosk.add(crownPoint);
  }

  for (const x of [-1.18, 1.18]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 0.08), warnMat);
    stripe.position.set(x, 1.92, 0.45);
    stripe.rotation.z = x > 0 ? 0.18 : -0.18;
    kiosk.add(stripe);
  }
}

function buildVictoryPodium() {
  const group = new THREE.Group();
  group.position.copy(PODIUM_POSITION);
  group.visible = false;
  scene.add(group);

  const gold = new THREE.MeshStandardMaterial({ color: 0xd7b44a, roughness: 0.38, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x202426, roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf5ead0, roughness: 0.42, metalness: 0.2 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(12, 0.75, 7), dark);
  base.name = "podium-base";
  base.position.y = 0.38;
  base.receiveShadow = true;
  base.castShadow = true;
  group.add(base);

  const first = new THREE.Mesh(new THREE.BoxGeometry(5, 1.8, 4.8), gold);
  first.name = "podium-first";
  first.position.set(0, 1.25, 0);
  first.castShadow = true;
  first.receiveShadow = true;
  group.add(first);

  const second = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 3.8), trim);
  second.name = "podium-side";
  second.position.set(-4.2, 0.9, 0.25);
  second.castShadow = true;
  second.receiveShadow = true;
  group.add(second);

  const third = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.8, 3.8), trim);
  third.name = "podium-side";
  third.position.set(4.2, 0.75, 0.25);
  third.castShadow = true;
  third.receiveShadow = true;
  group.add(third);

  for (const x of [-6.4, 6.4]) {
    const light = new THREE.SpotLight(0xfff0b0, 3.4, 26, Math.PI / 5, 0.45, 1.2);
    light.position.set(x, 7.5, -3.8);
    light.target.position.set(0, 2.7, 0);
    light.castShadow = true;
    group.add(light, light.target);
  }

  for (const x of [-5.3, 5.3]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.8, 12), dark);
    pole.position.set(x, 2.4, 2.9);
    pole.castShadow = true;
    group.add(pole);
  }

  return group;
}

function applyPodiumTheme(theme: MapTheme) {
  podiumGroup.position.copy(PODIUM_POSITION);
  podiumGroup.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.name === "podium-first") {
      child.material = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.18, roughness: 0.36, metalness: 0.42 });
    } else if (child.name === "podium-side") {
      child.material = new THREE.MeshStandardMaterial({ color: theme.neonA, emissive: theme.neonA, emissiveIntensity: 0.14, roughness: 0.48, metalness: 0.26 });
    } else if (child.name === "podium-base") {
      child.material = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.72, metalness: 0.25 });
    }
  });
}

function buildPowerUps() {
  const placements: Array<[PowerUpType, number, number]> = [
    ["rainbowTeeth", -18, 9],
    ["chompRam", 18, 8],
    ["hayRepair", -14, -18],
    ["goldHooves", 15, -16],
  ];
  for (const [type, x, z] of placements) {
    const group = createPowerUpMesh(type);
    group.position.set(x, 1.15, z);
    scene.add(group);
    powerUps.push({ type, group, position: new THREE.Vector3(x, 1.15, z), respawnAt: 0, active: true });
  }
}

function createPowerUpMesh(type: PowerUpType) {
  const group = new THREE.Group();
  const colorByType: Record<PowerUpType, number> = {
    rainbowTeeth: 0xff4fd8,
    chompRam: 0xff3b2f,
    hayRepair: 0xe0bd55,
    goldHooves: 0xffd43b,
  };
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.72, 1),
    new THREE.MeshStandardMaterial({ color: colorByType[type], emissive: colorByType[type], emissiveIntensity: 0.42, roughness: 0.35, metalness: 0.25 }),
  );
  core.castShadow = true;
  group.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.96, 0.045, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0xf7f0df, emissive: 0x443311, emissiveIntensity: 0.25, roughness: 0.5 }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  if (type === "rainbowTeeth") {
    for (let i = 0; i < 6; i += 1) {
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.42, 0.08),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 6, 0.9, 0.58), emissive: new THREE.Color().setHSL(i / 6, 0.6, 0.18) }),
      );
      tooth.position.set((i - 2.5) * 0.18, -0.1, -0.78);
      group.add(tooth);
    }
  } else if (type === "chompRam") {
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.28, 0.32), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.75 }));
    jaw.position.z = -0.85;
    group.add(jaw);
  } else if (type === "hayRepair") {
    const bale = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.48, 0.7), new THREE.MeshStandardMaterial({ color: 0xd1a83f, roughness: 0.9 }));
    bale.position.y = -0.1;
    group.add(bale);
  } else {
    for (const x of [-0.34, 0.34]) {
      const hoof = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.42, 4, 8), new THREE.MeshStandardMaterial({ color: 0xffd43b, metalness: 0.55, roughness: 0.28 }));
      hoof.position.set(x, -0.15, -0.62);
      hoof.rotation.x = Math.PI / 2;
      group.add(hoof);
    }
  }

  return group;
}

function createCar(id: string, position: THREE.Vector3, color: number, isPlayer: boolean): Car {
  const group = new THREE.Group();
  scene.add(group);

  const paintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.46, metalness: 0.32, flatShading: true });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: 0.58, metalness: 0.18 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd2d2c8, roughness: 0.32, metalness: 0.75 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x10242f, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.72 });

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(3.35, 0.82, 4.55),
    paintMat,
  );
  chassis.position.y = 0.86;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(3.08, 0.18, 1.55), paintMat);
  hood.position.set(0, 1.36, -1.82);
  hood.rotation.x = -0.12;
  hood.castShadow = true;
  group.add(hood);

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(3.08, 0.18, 1.28), paintMat);
  trunk.position.set(0, 1.28, 1.82);
  trunk.rotation.x = 0.08;
  trunk.castShadow = true;
  group.add(trunk);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.07, 4.95),
    new THREE.MeshStandardMaterial({ color: isPlayer ? 0xffe45e : 0x202020, roughness: 0.35 }),
  );
  stripe.position.set(0, 1.48, 0);
  group.add(stripe);

  const dents = createDentPanels();
  const damageMarks = createDamageMarks();
  const dentLevels = dents.map(() => 0);
  for (const dent of dents) {
    group.add(dent);
  }
  for (const mark of damageMarks) {
    group.add(mark);
  }

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.74, 1.55),
    trimMat,
  );
  cabin.position.set(0, 1.65, -0.5);
  cabin.castShadow = true;
  group.add(cabin);

  addCarShellDetails(group, paintMat, trimMat, chromeMat, glassMat);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.75 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xbfc4bd, roughness: 0.32, metalness: 0.7 });
  const wheels: THREE.Mesh[] = [];
  for (const x of [-1.85, 1.85]) {
    for (const z of [-1.75, 1.75]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.42, 24), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.58, z);
      wheel.userData.basePosition = wheel.position.clone();
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);

      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 16), rimMat);
      rim.position.set(0, 0, 0);
      rim.castShadow = true;
      wheel.add(rim);
    }
  }

  const ram = new THREE.Mesh(
    new THREE.BoxGeometry(3.9, 0.3, 0.34),
    chromeMat,
  );
  ram.position.set(0, 0.88, -2.9);
  ram.castShadow = true;
  group.add(ram);

  const ramLower = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.18, 0.28), chromeMat);
  ramLower.position.set(0, 0.58, -3.03);
  ramLower.castShadow = true;
  group.add(ramLower);

  const driver = createDonkeyDriver(isPlayer ? 0xb88759 : 0x957256);
  driver.group.position.set(0, 2.88, -0.02);
  driver.group.rotation.y = 0;
  group.add(driver.group);

  const championPassenger = isPlayer ? createChampionPassenger() : undefined;
  if (championPassenger) {
    championPassenger.group.position.set(0, 2.52, 1.1);
    championPassenger.group.rotation.y = 0;
    championPassenger.group.scale.setScalar(0.92);
    championPassenger.group.visible = false;
    group.add(championPassenger.group);
  }

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(1.45)
      .setAngularDamping(3.2)
      .setCanSleep(false),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(1.65, 0.55, 2.6).setDensity(1.4).setFriction(1.2).setRestitution(0.48),
    body,
  );

  return { id, group, chassis, stripe, cabin, ram, wheels, dents, damageMarks, dentLevels, body, collider, driver, championPassenger, damage: 0, scoreValue: 1, isPlayer, aiAngle: Math.random() * Math.PI * 2, lastHitAt: 0, smokeTimer: 0 };
}

function addCarShellDetails(group: THREE.Group, paintMat: THREE.Material, trimMat: THREE.Material, chromeMat: THREE.Material, glassMat: THREE.Material) {
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.58), glassMat);
  windshield.position.set(0, 1.93, -1.23);
  windshield.rotation.x = -0.48;
  group.add(windshield);

  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.48), glassMat);
  rearGlass.position.set(0, 1.87, 0.22);
  rearGlass.rotation.x = 0.38;
  group.add(rearGlass);

  for (const x of [-1.08, 1.08]) {
    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 1.08), glassMat);
    sideWindow.position.set(x, 1.75, -0.54);
    sideWindow.castShadow = true;
    group.add(sideWindow);
  }

  for (const x of [-1.46, 1.46]) {
    const sideSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 4.35), trimMat);
    sideSkirt.position.set(x, 0.66, 0);
    sideSkirt.castShadow = true;
    group.add(sideSkirt);

    for (const z of [-1.76, 1.76]) {
      const fender = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.08, 8, 18, Math.PI), paintMat);
      fender.position.set(x, 0.78, z);
      fender.rotation.y = Math.PI / 2;
      fender.rotation.z = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      fender.castShadow = true;
      group.add(fender);
    }
  }

  for (const x of [-0.78, 0.78]) {
    const headlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff1b5, emissive: 0xffd25a, emissiveIntensity: 0.55, roughness: 0.2 }),
    );
    headlight.scale.set(1, 0.55, 0.35);
    headlight.position.set(x, 1.05, -2.72);
    group.add(headlight);

    const tailLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.18, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xff2b2b, emissive: 0xff1b1b, emissiveIntensity: 0.45, roughness: 0.35 }),
    );
    tailLight.position.set(x, 0.98, 2.58);
    group.add(tailLight);
  }

  for (const x of [-0.9, 0.9]) {
    const rollBar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.55, 10), chromeMat);
    rollBar.position.set(x, 2.14, -0.08);
    rollBar.rotation.x = 0.42;
    rollBar.castShadow = true;
    group.add(rollBar);
  }

  const roofBar = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.1, 0.16), chromeMat);
  roofBar.position.set(0, 2.28, -0.45);
  roofBar.castShadow = true;
  group.add(roofBar);

  const hoodScoop = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.65), trimMat);
  hoodScoop.position.set(0, 1.55, -1.75);
  hoodScoop.rotation.x = -0.12;
  hoodScoop.castShadow = true;
  group.add(hoodScoop);

  for (const x of [-1.05, 1.05]) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.68, 10), chromeMat);
    exhaust.position.set(x, 1.42, 2.35);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.castShadow = true;
    group.add(exhaust);
  }
}

function createDentPanels() {
  const dentMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.92, metalness: 0.05 });
  const front = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.7, 0.12), dentMat);
  front.position.set(0, 0.98, -2.65);

  const rear = new THREE.Mesh(new THREE.BoxGeometry(2, 0.62, 0.12), dentMat);
  rear.position.set(0, 0.94, 2.65);

  const left = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.64, 2.2), dentMat);
  left.position.set(-1.7, 0.95, 0.15);

  const right = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.64, 2.2), dentMat);
  right.position.set(1.7, 0.95, 0.15);

  return [front, rear, left, right].map((dent) => {
    dent.visible = false;
    dent.castShadow = true;
    return dent;
  });
}

function createDamageMarks() {
  const scarMat = new THREE.MeshStandardMaterial({ color: 0xffd15b, roughness: 0.55, metalness: 0.2, emissive: 0x5f2200, emissiveIntensity: 0.35 });
  const sootMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.95 });
  const specs: Array<[THREE.Vector3Tuple, THREE.Vector3Tuple, number]> = [
    [[0, 1.44, -2.72], [2.7, 0.09, 0.08], 0.16],
    [[0, 0.78, -2.75], [2.2, 0.11, 0.08], -0.12],
    [[0, 1.4, 2.72], [2.4, 0.09, 0.08], -0.18],
    [[-1.78, 1.28, 0], [0.08, 0.1, 2.7], 0.18],
    [[1.78, 1.28, 0], [0.08, 0.1, 2.7], -0.18],
    [[-1.79, 0.76, 0.55], [0.08, 0.13, 1.8], -0.4],
    [[1.79, 0.76, 0.55], [0.08, 0.13, 1.8], 0.4],
    [[0, 1.5, 0], [0.18, 0.08, 3.6], 0.7],
    [[-0.62, 1.96, -0.94], [0.95, 0.08, 0.08], 0.58],
    [[0.62, 1.9, -0.08], [0.85, 0.08, 0.08], -0.5],
    [[0, 1.49, -1.55], [1.5, 0.07, 0.08], -0.35],
    [[0, 1.49, 1.55], [1.5, 0.07, 0.08], 0.35],
  ];

  return specs.map(([position, size, rotation], index) => {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(...size), index % 2 === 0 ? scarMat : sootMat);
    mark.position.set(...position);
    mark.rotation.y = rotation;
    mark.visible = false;
    return mark;
  });
}

function createDonkeyDriver(color: number): Driver {
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
  const lightHide = new THREE.MeshStandardMaterial({ color: 0xd0a06f, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x211915, roughness: 0.7 });
  const maneMat = new THREE.MeshStandardMaterial({ color: 0x2b1d16, roughness: 0.86 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xfff9df, roughness: 0.26 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.65, metalness: 0.1 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x69d8ff, emissive: 0x1d7ea2, emissiveIntensity: 0.28, roughness: 0.18, transparent: true, opacity: 0.82 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.72, 8, 16), hide);
  torso.position.set(0, -0.78, 0.08);
  torso.scale.set(1.2, 1.05, 0.9);
  torso.castShadow = true;
  group.add(torso);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 12), lightHide);
  belly.position.set(0, -0.94, -0.12);
  belly.scale.set(1.05, 0.75, 0.72);
  belly.castShadow = true;
  group.add(belly);

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.54, 18, 12), hide);
  hips.position.set(0, -1.18, 0.28);
  hips.scale.set(1.32, 0.62, 0.95);
  hips.castShadow = true;
  group.add(hips);

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.48, 6, 12), hide);
  neck.position.set(0, -0.3, -0.03);
  neck.rotation.x = -0.2;
  neck.castShadow = true;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 18), hide);
  head.scale.set(0.82, 1.08, 1.18);
  head.position.y = 0.04;
  head.castShadow = true;
  group.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), lightHide);
  muzzle.scale.set(1.12, 0.58, 0.92);
  muzzle.position.set(0, -0.14, -0.43);
  muzzle.castShadow = true;
  group.add(muzzle);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.28), lightHide);
  snout.position.set(0, -0.12, -0.58);
  snout.castShadow = true;
  group.add(snout);

  for (const x of [-0.09, 0.09]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark);
    nostril.position.set(x, -0.13, -0.73);
    nostril.scale.set(1.2, 0.55, 0.7);
    group.add(nostril);
  }

  const teeth: THREE.Mesh[] = [];
  for (const x of [-0.16, 0, 0.16]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(x === 0 ? 0.12 : 0.14, 0.5, 0.08), toothMat);
    tooth.position.set(x, -0.37, -0.72);
    tooth.castShadow = true;
    group.add(tooth);
    teeth.push(tooth);
  }

  for (const x of [-0.25, 0.25]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 8), dark);
    eye.position.set(x, 0.08, -0.39);
    group.add(eye);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), maneMat);
    brow.position.set(x, 0.2, -0.39);
    brow.rotation.z = x > 0 ? -0.22 : 0.22;
    group.add(brow);

    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), lensMat);
    lens.position.set(x, 0.08, -0.44);
    lens.scale.set(1.2, 0.72, 0.34);
    group.add(lens);
  }

  const goggleStrap = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.07, 0.06), strapMat);
  goggleStrap.position.set(0, 0.08, -0.43);
  group.add(goggleStrap);

  for (const x of [-0.26, 0.26]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.78, 10), hide);
    ear.position.set(x, 0.62, 0.02);
    ear.rotation.z = x > 0 ? -0.22 : 0.22;
    ear.rotation.x = -0.08;
    ear.castShadow = true;
    group.add(ear);

    const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0xd89b8a, roughness: 0.72 }));
    innerEar.position.set(x, 0.61, -0.03);
    innerEar.rotation.copy(ear.rotation);
    group.add(innerEar);
  }

  for (let i = 0; i < 6; i += 1) {
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.12), maneMat);
    mane.position.set(0, 0.4 - i * 0.13, 0.31 + i * 0.02);
    mane.rotation.x = 0.45;
    mane.castShadow = true;
    group.add(mane);
  }

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.43, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), strapMat);
  helmet.position.set(0, 0.18, 0);
  helmet.scale.set(0.94, 0.55, 0.94);
  helmet.castShadow = true;
  group.add(helmet);

  for (const x of [-0.54, 0.54]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), hide);
    shoulder.position.set(x, -0.58, -0.08);
    shoulder.scale.set(1.1, 0.9, 0.8);
    shoulder.castShadow = true;
    group.add(shoulder);
  }

  for (const x of [-0.34, 0.34]) {
    const rein = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), strapMat);
    rein.position.set(x, -0.54, -0.36);
    rein.rotation.x = 0.65;
    rein.rotation.z = x > 0 ? 0.16 : -0.16;
    group.add(rein);
  }

  for (const x of [-0.44, 0.44]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.56, 5, 10), hide);
    arm.position.set(x, -0.68, -0.22);
    arm.rotation.x = -0.9;
    arm.rotation.z = x > 0 ? -0.32 : 0.32;
    arm.castShadow = true;
    group.add(arm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), dark);
    hand.position.set(x * 0.9, -0.95, -0.56);
    hand.scale.set(1.2, 0.8, 0.9);
    group.add(hand);
  }

  for (const x of [-0.42, 0.42]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.56, 5, 10), hide);
    thigh.position.set(x, -1.32, -0.06);
    thigh.rotation.x = Math.PI / 2.35;
    thigh.rotation.z = x > 0 ? -0.18 : 0.18;
    thigh.scale.set(1.25, 1, 1);
    thigh.castShadow = true;
    group.add(thigh);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.46, 5, 10), hide);
    shin.position.set(x, -1.5, -0.5);
    shin.rotation.x = Math.PI / 2.6;
    shin.rotation.z = x > 0 ? -0.08 : 0.08;
    shin.castShadow = true;
    group.add(shin);

    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.22), dark);
    hoof.position.set(x, -1.54, -0.86);
    hoof.rotation.y = x > 0 ? -0.08 : 0.08;
    hoof.castShadow = true;
    group.add(hoof);
  }

  for (const x of [-0.5, 0.5]) {
    const rearLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.48, 5, 10), hide);
    rearLeg.position.set(x, -1.4, 0.52);
    rearLeg.rotation.x = -Math.PI / 2.7;
    rearLeg.rotation.z = x > 0 ? 0.16 : -0.16;
    rearLeg.castShadow = true;
    group.add(rearLeg);

    const rearHoof = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, 0.22), dark);
    rearHoof.position.set(x, -1.58, 0.86);
    rearHoof.castShadow = true;
    group.add(rearHoof);
  }

  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.58, 4, 8), maneMat);
  tail.position.set(0, -1.05, 0.82);
  tail.rotation.x = -0.85;
  tail.castShadow = true;
  group.add(tail);

  const tailTuft = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), maneMat);
  tailTuft.position.set(0, -1.28, 1.05);
  tailTuft.scale.set(0.9, 1.25, 0.8);
  tailTuft.castShadow = true;
  group.add(tailTuft);

  return { group, teeth };
}

function createChampionPassenger(): ChampionPassenger {
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0xa16f47, roughness: 0.74 });
  const lightHide = new THREE.MeshStandardMaterial({ color: 0xd8a170, roughness: 0.78 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1411, roughness: 0.72 });
  const neonPink = new THREE.MeshStandardMaterial({ color: 0xff4fd8, emissive: 0xb21a86, emissiveIntensity: 0.35, roughness: 0.34 });
  const neonBlue = new THREE.MeshStandardMaterial({ color: 0x46b5ff, emissive: 0x1468ad, emissiveIntensity: 0.3, roughness: 0.36 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xfff9df, roughness: 0.25 });
  const maneMat = new THREE.MeshStandardMaterial({ color: 0x2d1712, roughness: 0.84 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf4d35e, roughness: 0.26, metalness: 0.62 });

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.58, 20, 14), hide);
  hips.position.set(0, -1.08, 0.2);
  hips.scale.set(1.45, 0.72, 1.03);
  hips.castShadow = true;
  group.add(hips);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.72, 8, 16), hide);
  torso.position.set(0, -0.58, -0.02);
  torso.scale.set(1.12, 1.05, 0.88);
  torso.castShadow = true;
  group.add(torso);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.44, 18, 12), lightHide);
  belly.position.set(0, -0.78, -0.2);
  belly.scale.set(1.02, 0.72, 0.72);
  belly.castShadow = true;
  group.add(belly);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.14, 0.72), neonPink);
  vest.position.set(0, -0.62, -0.42);
  vest.rotation.x = -0.2;
  group.add(vest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 22, 16), hide);
  head.position.set(0, 0.16, -0.02);
  head.scale.set(0.9, 1.08, 1.1);
  head.castShadow = true;
  group.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 10), lightHide);
  muzzle.position.set(0, -0.02, -0.42);
  muzzle.scale.set(1.08, 0.58, 0.9);
  muzzle.castShadow = true;
  group.add(muzzle);

  const teeth: THREE.Mesh[] = [];
  for (const x of [-0.12, 0.02, 0.16]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.06), toothMat);
    tooth.position.set(x, -0.21, -0.62);
    tooth.castShadow = true;
    group.add(tooth);
    teeth.push(tooth);
  }

  for (const x of [-0.19, 0.19]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), dark);
    eye.position.set(x, 0.18, -0.34);
    group.add(eye);

    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.04), neonBlue);
    lens.position.set(x, 0.18, -0.39);
    lens.rotation.z = x > 0 ? -0.18 : 0.18;
    group.add(lens);
  }

  for (const x of [-0.23, 0.23]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.64, 10), hide);
    ear.position.set(x, 0.67, 0.02);
    ear.rotation.z = x > 0 ? -0.28 : 0.28;
    ear.castShadow = true;
    group.add(ear);
  }

  for (let i = 0; i < 5; i += 1) {
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.11), maneMat);
    mane.position.set(0, 0.44 - i * 0.12, 0.28 + i * 0.02);
    mane.rotation.x = 0.45;
    group.add(mane);
  }

  const necklace = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 8, 18), chromeMat);
  necklace.position.set(0, -0.22, -0.09);
  necklace.rotation.x = Math.PI / 2;
  necklace.scale.set(1.15, 0.72, 1);
  group.add(necklace);

  const arms: THREE.Object3D[] = [];
  for (const x of [-0.48, 0.48]) {
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 5, 10), hide);
    upperArm.position.set(x, -0.36, -0.08);
    upperArm.rotation.z = x > 0 ? -0.72 : 0.72;
    upperArm.rotation.x = -0.55;
    upperArm.userData.baseRotation = upperArm.rotation.clone();
    upperArm.castShadow = true;
    group.add(upperArm);
    arms.push(upperArm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), dark);
    hand.position.set(x * 1.12, -0.18, -0.38);
    hand.scale.set(1.1, 0.8, 0.9);
    hand.userData.baseRotation = hand.rotation.clone();
    group.add(hand);
    arms.push(hand);
  }

  for (const x of [-0.34, 0.34]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.52, 5, 10), hide);
    thigh.position.set(x, -1.36, -0.24);
    thigh.rotation.x = Math.PI / 2.35;
    thigh.rotation.z = x > 0 ? -0.25 : 0.25;
    thigh.castShadow = true;
    group.add(thigh);

    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, 0.24), dark);
    hoof.position.set(x, -1.48, -0.82);
    hoof.castShadow = true;
    group.add(hoof);
  }

  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.46, 4, 8), maneMat);
  tail.position.set(0, -1.02, 0.82);
  tail.rotation.x = -0.9;
  tail.castShadow = true;
  group.add(tail);

  return { group, torso, hips, head, arms, teeth };
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.033);
  handlePlayer(dt);
  updateAi(dt);
  world.step();
  syncCars();
  updateChampionPassenger(dt);
  updateProgressiveDamage(dt);
  updatePowerUps(dt);
  scoreCollisions();
  maybeEnterVictory();
  updateDebris(dt);
  updateVictory(dt);
  updateCamera(dt);
  updateHud(dt);
  updateAudio(dt);
  renderer.render(scene, camera);
}

function handlePlayer(dt: number) {
  if (victory) return;
  const fwd = forwardOf(player.body);
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const throttle = (pressed("w", "arrowup") ? 1 : 0) - (pressed("s", "arrowdown") ? 0.72 : 0);
  const steer = (pressed("a", "arrowleft") ? 1 : 0) - (pressed("d", "arrowright") ? 1 : 0);
  const handbrake = keys.has(" ");
  const velocity = player.body.linvel();
  const angular = player.body.angvel();
  const forwardSpeed = velocity.x * fwd.x + velocity.z * fwd.z;
  const sideSpeed = velocity.x * right.x + velocity.z * right.z;
  const speedBoost = activePower === "goldHooves" ? 1.45 : 1;
  const maxForward = (handbrake ? 7.5 : 17) * speedBoost;
  const maxReverse = 8;
  const targetForward = throttle >= 0 ? throttle * maxForward : throttle * maxReverse;
  const driveSharpness = throttle === 0 ? 3.4 : 7.8;
  const grip = handbrake ? 2.2 : 10.5;
  const nextForward = THREE.MathUtils.damp(forwardSpeed, targetForward, driveSharpness, dt);
  const nextSide = THREE.MathUtils.damp(sideSpeed, 0, grip, dt);
  const steerDirection = nextForward < -0.4 ? -1 : 1;
  const steerRate = steer * steerDirection * (1.3 + Math.min(Math.abs(nextForward) / 12, 1) * 2.1);

  player.body.setLinvel(
    {
      x: fwd.x * nextForward + right.x * nextSide,
      y: velocity.y,
      z: fwd.z * nextForward + right.z * nextSide,
    },
    true,
  );
  player.body.setAngvel({ x: angular.x * 0.2, y: THREE.MathUtils.damp(angular.y, steerRate, steer === 0 ? 8 : 12, dt), z: angular.z * 0.2 }, true);
}

function updateAi(dt: number) {
  if (victory) return;
  const target = player.body.translation();
  for (const car of cars) {
    if (car.isPlayer || car.damage >= 100) continue;
    const pos = car.body.translation();
    const desired = Math.atan2(target.x - pos.x, target.z - pos.z);
    const current = yawOf(car.body);
    const turn = clamp(angleDelta(current, desired), -1, 1);
    const distance = Math.hypot(target.x - pos.x, target.z - pos.z);
    car.body.applyTorqueImpulse({ x: 0, y: turn * 6 * dt, z: 0 }, true);
    car.body.applyImpulse({ ...scaledForward(car.body, distance > 8 ? 24 * dt : 13 * dt), y: 0 }, true);
  }
}

function syncCars() {
  for (const car of cars) {
    const t = car.body.translation();
    const r = car.body.rotation();
    car.group.position.set(t.x, t.y - 0.42, t.z);
    car.group.quaternion.set(r.x, r.y, r.z, r.w);
    const damageRatio = Math.min(1, car.damage / 100);
    const squash = 1 - car.damage / 360;
    car.chassis.scale.y = Math.max(0.45, squash);
    car.cabin.position.y = 1.65 - damageRatio * 0.28;
    car.cabin.rotation.x = -car.dentLevels[0] * 0.18 + car.dentLevels[1] * 0.1;
    car.cabin.rotation.z = (car.dentLevels[2] - car.dentLevels[3]) * 0.18;
    car.ram.position.y = 0.88 - car.dentLevels[0] * 0.32;
    car.ram.position.z = -2.9 + car.dentLevels[0] * 0.45;
    car.ram.rotation.x = car.dentLevels[0] * 0.36;
    car.ram.rotation.z = (car.dentLevels[2] - car.dentLevels[3]) * 0.16;
    car.wheels.forEach((wheel, index) => {
      const base = wheel.userData.basePosition as THREE.Vector3;
      const wheelDamage = damageRatio * (0.35 + car.dentLevels[index < 2 ? 2 : 3] * 0.65);
      wheel.position.set(base.x, base.y - wheelDamage * 0.22, base.z);
      wheel.rotation.y = Math.sin(performance.now() * 0.012 + index) * wheelDamage * 0.35;
      wheel.rotation.x = (index % 2 === 0 ? 1 : -1) * wheelDamage * 0.22;
    });
    car.dents.forEach((dent, index) => {
      const level = car.dentLevels[index];
      dent.visible = level > 0.04;
      const bulge = 0.75 + level * 2.4;
      if (index < 2) {
        dent.scale.set(bulge, 0.7 + level * 1.7, 1);
        dent.position.z = index === 0 ? -2.72 - level * 0.1 : 2.72 + level * 0.1;
      } else {
        dent.scale.set(1, 0.7 + level * 1.55, bulge);
        dent.position.x = index === 2 ? -1.78 - level * 0.1 : 1.78 + level * 0.1;
      }
    });
    car.damageMarks.forEach((mark, index) => {
      mark.visible = car.damage > 5 + index * 8;
      const throb = 1 + Math.min(0.65, car.damage / 140);
      mark.scale.setScalar(mark.visible ? throb : 1);
    });
    car.group.visible = true;
  }
}

function scoreCollisions() {
  const now = performance.now();
  for (const other of cars) {
    if (other === player || other.damage >= 100) continue;
    const a = player.body.translation();
    const b = other.body.translation();
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    if (dist > 4.9 || now - other.lastHitAt < 260) continue;
    const playerVelocity = player.body.linvel();
    const otherVelocity = other.body.linvel();
    const relativeSpeed = Math.hypot(playerVelocity.x - otherVelocity.x, playerVelocity.z - otherVelocity.z);
    const impact = Math.max(relativeSpeed, speedOf(player.body) + speedOf(other.body) * 0.45);
    if (impact < 1.15) continue;
    const hitDirection = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    const hitPoint = new THREE.Vector3(b.x - hitDirection.x * 1.9, 1.05, b.z - hitDirection.z * 1.9);
    const smash = Math.min(1, impact / 13);
    const powerMultiplier = activePower === "rainbowTeeth" ? 1.55 : activePower === "chompRam" ? 1.85 : 1;
    other.damage += (4 + impact * 5.8) * powerMultiplier;
    player.damage += 1.4 + impact * 1.35;
    other.lastHitAt = now;
    playerHits += 1;
    dentCar(other, hitDirection, impact);
    throwCar(other, hitDirection, impact * powerMultiplier);
    spawnImpactDebris(hitPoint, hitDirection, impact * powerMultiplier);
    spawnDamageSmoke(other, hitPoint, impact);
    if (activePower === "rainbowTeeth" || activePower === "chompRam") {
      spawnPowerBurst(hitPoint, activePower);
    }
    playCrashSound(impact * powerMultiplier);
    playDonkeyHitSound(impact);
    cameraShake = Math.max(cameraShake, 0.16 + smash * 0.42 * powerMultiplier);
    if (other.damage >= 100) {
      blowApartCar(other, hitDirection, impact);
      showMessage(`${other.id.toUpperCase()} wrecked`);
      maybeEnterVictory();
    } else {
      showMessage(`Crushed panel +${Math.round(impact * 12)}`);
    }
  }
  if (player.damage >= 100) {
    showMessage("Wrecked. Press R to reset.");
  }
}

function updateProgressiveDamage(dt: number) {
  for (const car of cars) {
    if (car.damage < 35 || car.damage >= 100) continue;
    car.smokeTimer -= dt;
    if (car.smokeTimer > 0) continue;
    const t = car.body.translation();
    const smokePoint = new THREE.Vector3(t.x + (Math.random() - 0.5) * 1.2, 1.65, t.z + (Math.random() - 0.5) * 1.8);
    spawnDamageSmoke(car, smokePoint, Math.max(2, car.damage / 18));
    car.smokeTimer = car.damage > 70 ? 0.45 : 0.9;
  }
}

function updatePowerUps(dt: number) {
  if (activePowerTimer > 0) {
    activePowerTimer -= dt;
    if (activePower === "rainbowTeeth") {
      updateRainbowTeeth();
    }
    if (activePowerTimer <= 0) {
      clearPowerUpEffect();
    }
  }

  const now = performance.now();
  const playerPos = player.body.translation();
  for (const powerUp of powerUps) {
    if (!powerUp.active && now >= powerUp.respawnAt) {
      powerUp.active = true;
      powerUp.group.visible = true;
      powerUp.group.position.copy(powerUp.position);
    }
    if (!powerUp.active) continue;

    powerUp.group.rotation.y += dt * 2.6;
    powerUp.group.rotation.x = Math.sin(now * 0.003) * 0.18;
    powerUp.group.position.y = powerUp.position.y + Math.sin(now * 0.004 + powerUp.position.x) * 0.22;

    const distance = Math.hypot(playerPos.x - powerUp.position.x, playerPos.z - powerUp.position.z);
    if (distance < 2.9) {
      collectPowerUp(powerUp);
    }
  }
}

function collectPowerUp(powerUp: PowerUp) {
  powerUp.active = false;
  powerUp.group.visible = false;
  powerUp.respawnAt = performance.now() + 14000;
  activePower = powerUp.type;
  activePowerTimer = powerUp.type === "hayRepair" ? 0 : 9;

  if (powerUp.type === "rainbowTeeth") {
    activePowerTimer = 10;
    for (const tooth of player.driver.teeth) {
      tooth.scale.y = Math.max(tooth.scale.y, customization.teethScale * 1.8);
    }
    showMessage("Rainbow teeth: boosted impact");
  } else if (powerUp.type === "chompRam") {
    activePowerTimer = 8;
    player.ram.scale.set(1.45, 1.35, 1.55);
    showMessage("Chomp ram: savage hits");
  } else if (powerUp.type === "hayRepair") {
    repairPlayerCar();
    activePower = null;
    showMessage("Hay repair: patched up");
  } else {
    activePowerTimer = 8;
    showMessage("Gold hooves: speed boost");
  }

  spawnPowerBurst(powerUp.position, powerUp.type);
}

function repairPlayerCar() {
  player.damage = Math.max(0, player.damage - 32);
  player.dentLevels.forEach((level, index) => {
    player.dentLevels[index] = Math.max(0, level - 0.35);
  });
  player.chassis.scale.x = Math.min(1, player.chassis.scale.x + 0.12);
  player.chassis.scale.z = Math.min(1, player.chassis.scale.z + 0.08);
  player.stripe.scale.x = Math.min(1, player.stripe.scale.x + 0.12);
}

function clearPowerUpEffect() {
  if (activePower === "rainbowTeeth") {
    applyCustomization();
  }
  if (activePower === "chompRam") {
    player.ram.scale.set(1, 1, 1);
  }
  activePower = null;
  activePowerTimer = 0;
}

function updateRainbowTeeth() {
  player.driver.teeth.forEach((tooth, index) => {
    const material = tooth.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.setHSL((performance.now() * 0.001 + index * 0.18) % 1, 0.95, 0.62);
      material.emissive.setHSL((performance.now() * 0.001 + index * 0.18) % 1, 0.8, 0.2);
      material.emissiveIntensity = 0.8;
    }
  });
}

function spawnPowerBurst(position: THREE.Vector3, type: PowerUpType) {
  const colors: Record<PowerUpType, number[]> = {
    rainbowTeeth: [0xff3bd5, 0x46b5ff, 0xfff14d, 0x5eff7e],
    chompRam: [0xff3b2f, 0xffffff, 0x111111],
    hayRepair: [0xe0bd55, 0x63db7b, 0xf7f0df],
    goldHooves: [0xffd43b, 0xffffff, 0xf6a800],
  };
  for (let i = 0; i < 22; i += 1) {
    const color = colors[type][i % colors[type].length];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.05, 0.3),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.42 }),
    );
    mesh.position.copy(position).add(new THREE.Vector3(0, 0.4, 0));
    scene.add(mesh);
    debris.push({
      mesh,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 7, 2 + Math.random() * 3, (Math.random() - 0.5) * 7),
      spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      life: 0.9 + Math.random() * 0.7,
    });
  }
}

function maybeEnterVictory() {
  if (victory || player.damage >= 100) return;
  const rivalsWrecked = cars.filter((car) => !car.isPlayer).every((car) => car.damage >= 100);
  if (rivalsWrecked) {
    enterVictoryPodium();
  }
}

function enterVictoryPodium() {
  victory = true;
  victoryTimer = 0;
  championPassengerUnlocked = true;
  championPassengerEnabled = true;
  podiumGroup.visible = true;
  keys.clear();
  player.body.setTranslation({ x: PODIUM_POSITION.x, y: 2.55, z: PODIUM_POSITION.z }, true);
  player.body.setRotation({ x: 0, y: 1, z: 0, w: 0 }, true);
  player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  player.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  for (const tooth of player.driver.teeth) {
    tooth.scale.y = Math.max(tooth.scale.y, 2.35);
  }
  spawnVictoryConfetti(new THREE.Vector3(PODIUM_POSITION.x, 6, PODIUM_POSITION.z));
  playYeeHawSound();
  showMessage("Winner. Champion passenger unlocked.");
}

function updateVictory(dt: number) {
  if (!victory) return;
  victoryTimer += dt;
  player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  player.body.setAngvel({ x: 0, y: 0.38, z: 0 }, true);
  if (Math.floor(victoryTimer * 2) !== Math.floor((victoryTimer - dt) * 2)) {
    spawnVictoryConfetti(new THREE.Vector3(PODIUM_POSITION.x + (Math.random() - 0.5) * 8, 6.5, PODIUM_POSITION.z + (Math.random() - 0.5) * 4));
  }
}

function updateChampionPassenger(dt: number) {
  const passenger = player.championPassenger;
  if (!passenger) return;

  const shouldShow = championPassengerUnlocked && championPassengerEnabled;
  passenger.group.visible = shouldShow;
  companionToggleEl.checked = championPassengerEnabled;
  companionToggleEl.disabled = !championPassengerUnlocked;
  if (!shouldShow) return;

  const rivals = cars.filter((car) => !car.isPlayer);
  const averageRivalDamage = rivals.reduce((sum, car) => sum + car.damage, 0) / rivals.length;
  const isCelebrating = victory || averageRivalDamage > 72;
  const speed = isCelebrating ? 9 : 4.5;
  const amount = isCelebrating ? 1 : 0.36;
  const beat = performance.now() * 0.001 * speed;

  passenger.group.position.y = 2.52 + Math.sin(beat) * 0.045 * amount;
  passenger.group.rotation.z = Math.sin(beat * 0.7) * 0.13 * amount;
  passenger.torso.rotation.x = Math.sin(beat) * 0.1 * amount;
  passenger.hips.rotation.x = -0.15 + Math.sin(beat + Math.PI / 2) * 0.18 * amount;
  passenger.hips.rotation.z = Math.sin(beat * 1.2) * 0.12 * amount;
  passenger.head.rotation.y = Math.sin(beat * 0.5) * 0.22 * amount;
  passenger.arms.forEach((arm, index) => {
    const base = arm.userData.baseRotation as THREE.Euler | undefined;
    arm.rotation.z = (base?.z ?? 0) + Math.sin(beat + index) * 0.38 * amount;
    arm.rotation.x = (base?.x ?? 0) + Math.cos(beat * 0.8 + index) * 0.24 * amount;
  });
  for (const tooth of passenger.teeth) {
    tooth.scale.y = 1 + Math.sin(beat * 1.4) * 0.08 * amount;
  }
}

function spawnVictoryConfetti(position: THREE.Vector3) {
  const colors = [0xff4f38, 0xffd95a, 0x47b4ff, 0xf7f0df, 0x63db7b];
  for (let i = 0; i < 18; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.025, 0.26),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.55, metalness: 0.1 }),
    );
    mesh.position.copy(position);
    mesh.castShadow = true;
    scene.add(mesh);
    debris.push({
      mesh,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 2.5 + 1.5, (Math.random() - 0.5) * 7),
      spin: new THREE.Vector3(Math.random() * 9, Math.random() * 12, Math.random() * 9),
      life: 2.4 + Math.random() * 1.2,
    });
  }
}

function dentCar(car: Car, worldDirection: THREE.Vector3, impact: number) {
  const q = car.body.rotation();
  const localDirection = worldDirection.clone().applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w).invert());
  const index = Math.abs(localDirection.z) > Math.abs(localDirection.x) ? (localDirection.z < 0 ? 0 : 1) : (localDirection.x < 0 ? 2 : 3);
  car.dentLevels[index] = Math.min(1, car.dentLevels[index] + 0.22 + impact / 20);
  const neighbor = index < 2 ? (index === 0 ? 2 : 3) : (index === 2 ? 0 : 1);
  car.dentLevels[neighbor] = Math.min(1, car.dentLevels[neighbor] + 0.07 + impact / 68);
  const bite = 1 - Math.min(0.18, impact / 92);
  car.chassis.scale.x = Math.max(0.68, car.chassis.scale.x * bite);
  car.chassis.scale.z = Math.max(0.8, car.chassis.scale.z * (1 - Math.min(0.12, impact / 120)));
  car.stripe.scale.x = Math.max(0.55, car.stripe.scale.x * bite);
}

function throwCar(car: Car, direction: THREE.Vector3, impact: number) {
  const shove = Math.min(22, impact * 1.55);
  const lift = Math.min(5.5, impact * 0.18);
  car.body.applyImpulse({ x: direction.x * shove, y: lift, z: direction.z * shove }, true);
  car.body.applyTorqueImpulse(
    {
      x: (Math.random() - 0.5) * impact * 0.7,
      y: (Math.random() - 0.5) * impact * 1.25,
      z: (Math.random() - 0.5) * impact * 0.7,
    },
    true,
  );
}

function spawnImpactDebris(position: THREE.Vector3, direction: THREE.Vector3, impact: number) {
  const count = Math.min(34, 10 + Math.floor(impact * 1.7));
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x8b8a7d, roughness: 0.6, metalness: 0.65 });
  const sparkMat = new THREE.MeshStandardMaterial({ color: 0xffd15b, emissive: 0xff8a1f, emissiveIntensity: 1.2 });
  for (let i = 0; i < count; i += 1) {
    const isSpark = i % 3 === 0;
    const mesh = new THREE.Mesh(
      isSpark ? new THREE.BoxGeometry(0.06, 0.06, 0.34) : new THREE.BoxGeometry(0.16, 0.08, 0.24),
      isSpark ? sparkMat : metalMat,
    );
    mesh.position.copy(position);
    mesh.castShadow = true;
    scene.add(mesh);

    const spread = new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 0.9 + 0.3, (Math.random() - 0.5) * 1.5);
    const velocity = direction.clone().multiplyScalar(5 + Math.random() * impact * 0.75).add(spread.multiplyScalar(5));
    debris.push({
      mesh,
      velocity,
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 9, Math.random() * 8),
      life: isSpark ? 0.45 + Math.random() * 0.35 : 1.1 + Math.random() * 0.9,
    });
  }
}

function spawnDamageSmoke(car: Car, position: THREE.Vector3, impact: number) {
  if (car.damage < 18) return;
  const count = Math.min(16, 4 + Math.floor(car.damage / 14) + Math.floor(impact));
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x3a3a35, roughness: 1, transparent: true, opacity: 0.72 });
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14 + Math.random() * 0.18, 8, 6), smokeMat);
    mesh.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2));
    scene.add(mesh);
    debris.push({
      mesh,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 1.3, 1.8 + Math.random() * 1.5, (Math.random() - 0.5) * 1.3),
      spin: new THREE.Vector3(Math.random() * 2, Math.random() * 2, Math.random() * 2),
      life: 1 + Math.random() * 0.8,
    });
  }
}

function blowApartCar(car: Car, direction: THREE.Vector3, impact: number) {
  const pos = car.body.translation();
  spawnImpactDebris(new THREE.Vector3(pos.x, 1.5, pos.z), direction, impact + 10);
  for (const child of car.group.children) {
    if (child instanceof THREE.Mesh && child !== car.chassis) {
      child.visible = Math.random() > 0.35;
    }
  }
}

function updateDebris(dt: number) {
  for (let i = debris.length - 1; i >= 0; i -= 1) {
    const piece = debris[i];
    piece.life -= dt;
    piece.velocity.y -= 11.5 * dt;
    piece.mesh.position.addScaledVector(piece.velocity, dt);
    piece.mesh.rotation.x += piece.spin.x * dt;
    piece.mesh.rotation.y += piece.spin.y * dt;
    piece.mesh.rotation.z += piece.spin.z * dt;
    if (piece.mesh.position.y < 0.08) {
      piece.mesh.position.y = 0.08;
      piece.velocity.y *= -0.28;
      piece.velocity.x *= 0.72;
      piece.velocity.z *= 0.72;
    }
    if (piece.life <= 0) {
      scene.remove(piece.mesh);
      piece.mesh.geometry.dispose();
      debris.splice(i, 1);
    }
  }
}

function updateCamera(dt: number) {
  const pos = player.body.translation();
  const fwd = forwardOf(player.body);
  const desired = victory ? new THREE.Vector3(PODIUM_POSITION.x, 5.8, PODIUM_POSITION.z - 9) : new THREE.Vector3(pos.x - fwd.x * 10, pos.y + 8, pos.z - fwd.z * 10);
  camera.position.lerp(desired, 1 - Math.pow(0.002, dt));
  if (cameraShake > 0) {
    camera.position.x += (Math.random() - 0.5) * cameraShake;
    camera.position.y += (Math.random() - 0.5) * cameraShake * 0.65;
    camera.position.z += (Math.random() - 0.5) * cameraShake;
    cameraShake = Math.max(0, cameraShake - dt * 1.9);
  }
  if (victory) {
    camera.lookAt(PODIUM_POSITION.x, 3.7, PODIUM_POSITION.z);
  } else {
    camera.lookAt(pos.x, pos.y + 1.5, pos.z);
  }
}

function updateHud(dt: number) {
  const speed = Math.round(speedOf(player.body) * 7.2);
  speedEl.textContent = `${speed} mph`;
  damageEl.textContent = `Damage ${Math.min(100, Math.round(player.damage))}%`;
  scoreEl.textContent = victory ? "Winner" : `Hits ${playerHits}`;
  powerupEl.textContent = activePower ? `${powerUpLabel(activePower)} ${Math.ceil(activePowerTimer)}s` : "Power none";
  if (messageTimer > 0) {
    messageTimer -= dt;
    bannerEl.style.opacity = "1";
  } else {
    bannerEl.style.opacity = "0";
  }
}

function powerUpLabel(type: PowerUpType) {
  const labels: Record<PowerUpType, string> = {
    rainbowTeeth: "Rainbow teeth",
    chompRam: "Chomp ram",
    hayRepair: "Hay repair",
    goldHooves: "Gold hooves",
  };
  return labels[type];
}

function ensureAudio() {
  if (audioContext) {
    if (audioContext.state === "suspended") void audioContext.resume();
    return;
  }
  audioContext = new AudioContext();
  audioMaster = audioContext.createGain();
  audioMaster.gain.value = 0.58;
  audioMaster.connect(audioContext.destination);

  engineOsc = audioContext.createOscillator();
  engineOsc.type = "sawtooth";
  engineGain = audioContext.createGain();
  engineGain.gain.value = 0;
  const engineFilter = audioContext.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 360;
  engineOsc.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(audioMaster);
  engineOsc.start();
}

function updateAudio(dt: number) {
  donkeySoundCooldown = Math.max(0, donkeySoundCooldown - dt);
  if (!audioContext || !engineOsc || !engineGain) return;
  const now = audioContext.currentTime;
  const speed = speedOf(player.body);
  const targetFrequency = victory ? 92 : 58 + Math.min(360, speed * 18);
  const targetGain = victory ? 0.025 : 0.035 + Math.min(0.18, speed / 90);
  engineOsc.frequency.setTargetAtTime(targetFrequency, now, 0.045);
  engineGain.gain.setTargetAtTime(targetGain, now, 0.08);
}

function playCrashSound(impact: number) {
  const ctx = ensurePlayableAudio();
  if (!ctx || !audioMaster) return;
  const now = ctx.currentTime;
  const duration = 0.16 + Math.min(0.34, impact / 55);
  const noise = createNoiseSource(ctx, duration);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 180 + impact * 30;
  filter.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.min(0.44, 0.12 + impact / 42), now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioMaster);
  noise.start(now);
  noise.stop(now + duration);

  playTone(75 + impact * 5, duration * 0.65, "square", Math.min(0.18, impact / 90), now);
}

function playDonkeyHitSound(impact: number) {
  if (donkeySoundCooldown > 0) return;
  donkeySoundCooldown = 0.35;
  const ctx = ensurePlayableAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const volume = Math.min(0.34, 0.12 + impact / 50);
  playBrayPhrase(now, volume, [
    [260, 0.12],
    [190, 0.1],
    [315, 0.14],
    [150, 0.18],
  ]);
}

function playYeeHawSound() {
  const ctx = ensurePlayableAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  playBrayPhrase(now, 0.38, [
    [360, 0.16],
    [470, 0.15],
    [410, 0.12],
    [245, 0.22],
    [330, 0.28],
  ]);
}

function playBrayPhrase(startTime: number, volume: number, notes: Array<[number, number]>) {
  let t = startTime;
  for (const [frequency, duration] of notes) {
    playTone(frequency, duration, "sawtooth", volume, t, 0.035);
    playTone(frequency * 1.52, duration * 0.82, "triangle", volume * 0.36, t + 0.015, 0.02);
    t += duration * 0.82;
  }
}

function playTone(frequency: number, duration: number, type: OscillatorType, volume: number, startTime: number, attack = 0.01) {
  const ctx = ensurePlayableAudio();
  if (!ctx || !audioMaster) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * 0.72), startTime + duration);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, startTime);
  filter.frequency.exponentialRampToValueAtTime(240, startTime + duration);
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.002, volume), startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioMaster);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.04);
}

function createNoiseSource(ctx: AudioContext, duration: number) {
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

function ensurePlayableAudio() {
  ensureAudio();
  return audioContext;
}

function cycleMap() {
  currentMapIndex = (currentMapIndex + 1) % mapThemes.length;
  buildMapLayer();
  resetGame();
  showMessage(`Loaded ${mapThemes[currentMapIndex].name}`);
}

function bindEvents() {
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => {
    ensureAudio();
    const key = normalizeKey(event);
    keys.add(key);
    if (isDrivingKey(key)) event.preventDefault();
    if (key === "c") garageEl.classList.toggle("open");
    if (key === "r") resetGame();
    if (key === "m") cycleMap();
    if (key === "p") toggleChampionPassenger();
  });
  window.addEventListener("pointerdown", () => ensureAudio());
  window.addEventListener("keyup", (event) => {
    const key = normalizeKey(event);
    keys.delete(key);
    if (isDrivingKey(key)) event.preventDefault();
  });

  openGarageEl.addEventListener("click", () => garageEl.classList.add("open"));
  closeGarageEl.addEventListener("click", () => garageEl.classList.remove("open"));
  paintEl.addEventListener("input", () => {
    customization.paint = paintEl.value;
    applyCustomization();
  });
  stripeEl.addEventListener("input", () => {
    customization.stripe = stripeEl.value;
    applyCustomization();
  });
  bodyKitEl.addEventListener("change", () => {
    customization.bodyKit = bodyKitEl.value as BodyKit;
    applyCustomization();
  });
  teethEl.addEventListener("input", () => {
    customization.teethScale = Number(teethEl.value);
    applyCustomization();
  });
  companionToggleEl.addEventListener("change", () => {
    if (!championPassengerUnlocked) {
      companionToggleEl.checked = false;
      showMessage("Win a derby to unlock the back-seat champion.");
      return;
    }
    championPassengerEnabled = companionToggleEl.checked;
    showMessage(championPassengerEnabled ? "Champion passenger riding next round." : "Champion passenger benched.");
  });
}

function toggleChampionPassenger() {
  if (!championPassengerUnlocked) {
    showMessage("Win a derby to unlock the back-seat champion.");
    return;
  }
  championPassengerEnabled = !championPassengerEnabled;
  companionToggleEl.checked = championPassengerEnabled;
  showMessage(championPassengerEnabled ? "Champion passenger riding next round." : "Champion passenger benched.");
}

function applyCustomization() {
  setMeshColor(player.chassis, customization.paint);
  setMeshColor(player.stripe, customization.stripe);
  const scaleByKit: Record<BodyKit, THREE.Vector3Tuple> = {
    wedge: [1, 1, 1],
    tank: [1.16, 1.2, 1.03],
    lowrider: [1.08, 0.72, 1.12],
  };
  player.chassis.scale.set(...scaleByKit[customization.bodyKit]);
  for (const tooth of player.driver.teeth) {
    tooth.scale.y = customization.teethScale;
    const material = tooth.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.set(0xfff9df);
      material.emissive.set(0x000000);
      material.emissiveIntensity = 0;
    }
  }
}

function resetGame() {
  victory = false;
  victoryTimer = 0;
  podiumGroup.visible = false;
  activePower = null;
  activePowerTimer = 0;
  const starts = [
    new THREE.Vector3(0, 1.1, 13),
    new THREE.Vector3(-13, 1.1, -11),
    new THREE.Vector3(14, 1.1, -8),
    new THREE.Vector3(0, 1.1, -17),
  ];
  cars.forEach((car, index) => {
    car.damage = 0;
    car.lastHitAt = 0;
    car.dentLevels.fill(0);
    for (const child of car.group.children) {
      child.visible = true;
    }
    car.chassis.scale.set(1, 1, 1);
    car.stripe.scale.set(1, 1, 1);
    car.cabin.position.set(0, 1.65, -0.5);
    car.cabin.rotation.set(0, 0, 0);
    car.ram.position.set(0, 0.88, -2.9);
    car.ram.rotation.set(0, 0, 0);
    car.smokeTimer = 0;
    car.wheels.forEach((wheel) => {
      const base = wheel.userData.basePosition as THREE.Vector3;
      wheel.position.copy(base);
      wheel.rotation.set(0, 0, Math.PI / 2);
    });
    for (const mark of car.damageMarks) {
      mark.visible = false;
      mark.scale.set(1, 1, 1);
    }
    car.body.setTranslation(starts[index], true);
    car.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    car.body.setRotation({ x: 0, y: index === 0 ? 0 : Math.sin(Math.PI / 2), z: 0, w: index === 0 ? 1 : Math.cos(Math.PI / 2) }, true);
  });
  playerHits = 0;
  player.damage = 0;
  cameraShake = 0;
  for (const powerUp of powerUps) {
    powerUp.active = true;
    powerUp.group.visible = true;
    powerUp.group.position.copy(powerUp.position);
    powerUp.respawnAt = 0;
  }
  while (debris.length > 0) {
    const piece = debris.pop()!;
    scene.remove(piece.mesh);
    piece.mesh.geometry.dispose();
  }
  player.ram.scale.set(1, 1, 1);
  applyCustomization();
  showMessage("Derby reset");
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setMeshColor(mesh: THREE.Mesh, color: string) {
  const material = mesh.material;
  if (material instanceof THREE.MeshStandardMaterial) {
    material.color.set(color);
  }
}

function normalizeKey(event: KeyboardEvent) {
  const byCode: Record<string, string> = {
    KeyW: "w",
    KeyA: "a",
    KeyS: "s",
    KeyD: "d",
    ArrowUp: "arrowup",
    ArrowLeft: "arrowleft",
    ArrowDown: "arrowdown",
    ArrowRight: "arrowright",
    Space: " ",
    KeyC: "c",
    KeyR: "r",
    KeyM: "m",
    KeyP: "p",
  };
  return byCode[event.code] ?? event.key.toLowerCase();
}

function pressed(primary: string, alternate: string) {
  return keys.has(primary) || keys.has(alternate);
}

function isDrivingKey(key: string) {
  return ["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright", " "].includes(key);
}

function showMessage(message: string) {
  bannerEl.textContent = message;
  messageTimer = 2.4;
}

function forwardOf(body: RAPIER.RigidBody) {
  const q = body.rotation();
  return new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w)).normalize();
}

function scaledForward(body: RAPIER.RigidBody, scale: number) {
  const fwd = forwardOf(body);
  return { x: fwd.x * scale, z: fwd.z * scale };
}

function yawOf(body: RAPIER.RigidBody) {
  const q = body.rotation();
  const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
  return Math.atan2(fwd.x, fwd.z);
}

function angleDelta(a: number, b: number) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function speedOf(body: RAPIER.RigidBody) {
  const v = body.linvel();
  return Math.hypot(v.x, v.z);
}

function lateralVelocity(body: RAPIER.RigidBody) {
  const v = body.linvel();
  const fwd = forwardOf(body);
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  return v.x * right.x + v.z * right.z;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
