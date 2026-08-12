import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import donkeyDriverUrl from "./assets/donkey-driver.glb?url";
import derbyCarUrl from "./assets/derby-car.glb?url";
import "./style.css";

type BodyKit = "wedge" | "tank" | "lowrider";
type PowerUpType = "rainbowTeeth" | "chompRam" | "hayRepair" | "goldHooves";
type ShopKey = "exhaust" | "exhaustSound" | "enginePreset" | "engineSound" | "fuel" | "springLevel" | "springMetal" | "springStrength" | "liftKit" | "rims" | "tires" | "brakes" | "brakeStrength";

interface MapTheme {
  name: string;
  floor: number;
  grid: number;
  neonA: number;
  neonB: number;
  accent: number;
  props: "junkyard" | "foodcourt" | "laserRink" | "arcade" | "vhs" | "rink" | "pizza" | "mall" | "drivein" | "skatepark" | "subway";
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

interface CarVisualDamage {
  parts: Map<string, THREE.Object3D>;
  base: Map<string, { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }>;
  detached: Set<string>;
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
  body?: RAPIER.RigidBody;
  collider?: RAPIER.Collider;
}

interface PowerUp {
  type: PowerUpType;
  group: THREE.Group;
  position: THREE.Vector3;
  respawnAt: number;
  active: boolean;
}

interface ActivePowerState {
  active: boolean;
  timer: number;
}

interface CarTuning {
  speed: number;
  grip: number;
  brake: number;
  lift: number;
  reverseSpeed: number;
  acceleration: number;
  coastDrag: number;
  steerResponse: number;
  steerGrip: number;
  engineBase: number;
  enginePitch: number;
  engineGain: number;
  engineWave: OscillatorType;
}

interface Car {
  id: string;
  group: THREE.Group;
  chassis: THREE.Object3D;
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
  visualShell?: THREE.Group;
  visualDamage?: CarVisualDamage;
  championPassenger?: ChampionPassenger;
  damage: number;
  scoreValue: number;
  isPlayer: boolean;
  aiAngle: number;
  lastHitAt: number;
  lastWallHitAt: number;
  preStepVelocity: THREE.Vector3;
  smokeTimer: number;
}

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("Missing canvas");

const speedEl = document.querySelector<HTMLElement>("#speed")!;
const damageEl = document.querySelector<HTMLElement>("#damage")!;
const scoreEl = document.querySelector<HTMLElement>("#score")!;
const walletEl = document.querySelector<HTMLElement>("#wallet")!;
const xpEl = document.querySelector<HTMLElement>("#xp")!;
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
const shopFundsEl = document.querySelector<HTMLElement>("#shopFunds")!;
const shopItemsEl = document.querySelector<HTMLElement>("#shopItems")!;
const mainMenuEl = document.querySelector<HTMLElement>("#mainMenu")!;
const pauseMenuEl = document.querySelector<HTMLElement>("#pauseMenu")!;
const soloModeEl = document.querySelector<HTMLButtonElement>("#soloMode")!;
const hostOnlineEl = document.querySelector<HTMLButtonElement>("#hostOnline")!;
const joinOnlineEl = document.querySelector<HTMLButtonElement>("#joinOnline")!;
const roomCodeEl = document.querySelector<HTMLInputElement>("#roomCode")!;
const menuStatusEl = document.querySelector<HTMLElement>("#menuStatus")!;
const resumeGameEl = document.querySelector<HTMLButtonElement>("#resumeGame")!;
const pauseGarageEl = document.querySelector<HTMLButtonElement>("#pauseGarage")!;
const pauseResetEl = document.querySelector<HTMLButtonElement>("#pauseReset")!;
const pauseMainMenuEl = document.querySelector<HTMLButtonElement>("#pauseMainMenu")!;
const pauseNoteEl = document.querySelector<HTMLElement>("#pauseNote")!;

const keys = new Set<string>();
const customization: Customization = {
  paint: paintEl.value,
  stripe: stripeEl.value,
  bodyKit: bodyKitEl.value as BodyKit,
  teethScale: Number(teethEl.value),
};

const shopCatalog: Record<ShopKey, { label: string; values: string[]; baseCost: number; xp: number }> = {
  exhaust: { label: "Exhaust pipes", values: ["Stock", "Side dump", "Stack pipes", "Twin slash", "Megaphone", "Shorties", "Bullhorn", "Quad chrome"], baseCost: 18000, xp: 30 },
  exhaustSound: { label: "Exhaust sound", values: ["Stock rasp", "Deep rumble", "Tin can", "Angry burble", "Backfire pop", "Turbo whistle", "Drag roar", "Muffled growl"], baseCost: 12000, xp: 20 },
  enginePreset: { label: "Engine preset", values: ["Farm stock", "Street bruiser", "Junkyard torque", "Derby monster"], baseCost: 65000, xp: 85 },
  engineSound: { label: "Engine sound", values: ["Classic", "Hot rod", "Big block", "Turbo", "Tractor pull", "Rally"], baseCost: 16000, xp: 25 },
  fuel: { label: "Engine type", values: ["Gas", "Diesel"], baseCost: 45000, xp: 70 },
  springLevel: { label: "Suspension level", values: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], baseCost: 22000, xp: 35 },
  springMetal: { label: "Spring metal", values: ["Steel", "Cast iron", "Titanium"], baseCost: 38000, xp: 55 },
  springStrength: { label: "Spring strength", values: ["Soft", "Medium", "Heavy", "Extreme"], baseCost: 26000, xp: 40 },
  liftKit: { label: "Lift kit", values: ["Stock", "Lift 1", "Lift 2", "Lift 3", "Lift 4", "Lift 5", "Lift 6", "Lift 7"], baseCost: 30000, xp: 45 },
  rims: { label: "Rims", values: ["Steelies", "Chrome dish", "Beadlock", "Spiked", "Cyber mesh", "Gold deep dish", "Scrap star", "Forged derby"], baseCost: 24000, xp: 30 },
  tires: { label: "Tires", values: ["All terrain", "Mud claw", "Street slick", "Paddle", "Studded", "Run flat", "Monster lug", "Derby bite"], baseCost: 28000, xp: 38 },
  brakes: { label: "Brakes", values: ["Drums", "Vented disc", "Hydraulic", "Carbon ceramic"], baseCost: 34000, xp: 50 },
  brakeStrength: { label: "Brake strength", values: ["1", "2", "3", "4", "5"], baseCost: 18000, xp: 28 },
};

const progression = loadProgression();

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
const crowdDonkeys: THREE.Group[] = [];
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
const activePowerStates: Record<PowerUpType, ActivePowerState> = {
  rainbowTeeth: { active: false, timer: 0 },
  chompRam: { active: false, timer: 0 },
  hayRepair: { active: false, timer: 0 },
  goldHooves: { active: false, timer: 0 },
};
let gameStarted = false;
let pauseOpen = false;
let gameMode: "solo" | "online" = "solo";
let roomId = "";
const localPlayerId = crypto.randomUUID?.() ?? `player-${Math.random().toString(36).slice(2)}`;
let networkTimer = 0;
const remoteCars = new Map<string, Car>();
const PODIUM_POSITION = new THREE.Vector3(0, 0, -31);
let audioContext: AudioContext | null = null;
let audioMaster: GainNode | null = null;
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let donkeySoundCooldown = 0;
let donkeyDriverTemplate: THREE.Group | null = null;
let derbyCarTemplate: THREE.Group | null = null;

const mapThemes: MapTheme[] = [
  { name: "Scrapyard Slam", floor: 0x5c5548, grid: 0x8d8170, neonA: 0xb85c28, neonB: 0x8a9a5b, accent: 0xd4a03c, props: "junkyard" },
  { name: "Boardwalk Brawl", floor: 0xe0d4b8, grid: 0xc4b898, neonA: 0xff6b4a, neonB: 0x4ecdc4, accent: 0xffd93d, props: "foodcourt" },
  { name: "Alpine Arena", floor: 0xd8e2e8, grid: 0xa8b8c4, neonA: 0x2d5a6b, neonB: 0x8cb4c4, accent: 0xc43e3e, props: "laserRink" },
  { name: "Redwood Rally", floor: 0x3d3328, grid: 0x5c4d3c, neonA: 0x4a7c59, neonB: 0x8b6914, accent: 0xc1440e, props: "arcade" },
  { name: "Harbor Havoc", floor: 0x4a5560, grid: 0x6a7a8a, neonA: 0xff8c42, neonB: 0x4a90e2, accent: 0xf4e4bc, props: "vhs" },
  { name: "Moonlit Mesa", floor: 0x8b7355, grid: 0xa89070, neonA: 0xe8c547, neonB: 0x6b8cae, accent: 0xc75b39, props: "rink" },
  { name: "Canyon Crunch", floor: 0xa85d3e, grid: 0xc47a5a, neonA: 0xd4a03c, neonB: 0x8b4513, accent: 0xcd5c5c, props: "pizza" },
  { name: "Overgrown Oasis", floor: 0x2d3a2d, grid: 0x4a5a4a, neonA: 0x6b8e6b, neonB: 0x8b7355, accent: 0xd4a03c, props: "mall" },
  { name: "Midnight Farm", floor: 0x3d3530, grid: 0x5a5048, neonA: 0xb85c28, neonB: 0x6b7a3e, accent: 0xd4a03c, props: "drivein" },
  { name: "Frostbite Fair", floor: 0xc8d8e8, grid: 0xa8b8c8, neonA: 0x8cb4d4, neonB: 0xd4a0d4, accent: 0xe85d75, props: "skatepark" },
  { name: "Iron Works", floor: 0x3a3a3a, grid: 0x5a5a5a, neonA: 0xff6b35, neonB: 0x8a9aaa, accent: 0xffd43b, props: "subway" },
];
const MAP_SCALE = 1.25;
let currentMapIndex = 0;

void boot();

async function boot() {
  await Promise.all([RAPIER.init(), loadDonkeyDriverModel(), loadDerbyCarModel()]);
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
  renderShop();
  bindEvents();
  resize();
  pauseMenuEl.classList.add("hidden");
  renderer.setAnimationLoop(loop);
}

interface Progression {
  money: number;
  xp: number;
  wins: number;
  owned: Record<ShopKey, number>;
  equipped: Record<ShopKey, number>;
}

async function loadDonkeyDriverModel() {
  try {
    const gltf = await new GLTFLoader().loadAsync(donkeyDriverUrl);
    donkeyDriverTemplate = gltf.scene;
    donkeyDriverTemplate.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  } catch (error) {
    console.warn("Could not load donkey driver GLB; using procedural fallback.", error);
    donkeyDriverTemplate = null;
  }
}

async function loadDerbyCarModel() {
  try {
    const gltf = await new GLTFLoader().loadAsync(derbyCarUrl);
    derbyCarTemplate = gltf.scene;
    derbyCarTemplate.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  } catch (error) {
    console.warn("Could not load derby car GLB; using procedural car.", error);
    derbyCarTemplate = null;
  }
}

function buildArena() {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x5b5147, roughness: 0.92 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(52, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(104, 28, 0x8d8170, 0x6f6558);
  grid.position.y = 0.015;
  scene.add(grid);

  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(54, 0.05, 54).setFriction(1.1), groundBody);

  const barrierMat = new THREE.MeshStandardMaterial({ color: 0x30383a, roughness: 0.7, metalness: 0.2 });
  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2;
    const x = Math.cos(angle) * 50;
    const z = Math.sin(angle) * 50;
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
    cone.position.set(Math.cos(angle) * 32, 0.7, Math.sin(angle) * 32);
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
  crowdDonkeys.length = 0;

  const theme = mapThemes[currentMapIndex];
  mapGroup = new THREE.Group();
  mapGroup.name = `map-${theme.name}`;
  scene.add(mapGroup);
  scene.background = new THREE.Color(theme.floor).offsetHSL(0, -0.08, -0.08);
  scene.fog = new THREE.Fog(scene.background, 52, 130);

  const floor = new THREE.Mesh(
    new THREE.RingGeometry(4, 50, 96),
    new THREE.MeshStandardMaterial({ color: theme.floor, roughness: 0.86, metalness: 0.06 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.025;
  floor.receiveShadow = true;
  mapGroup.add(floor);

  buildArenaSurfaceDetails(theme);

  const neonGrid = new THREE.GridHelper(100, 20, theme.grid, theme.neonA);
  neonGrid.position.y = 0.04;
  const gridMats = Array.isArray(neonGrid.material) ? neonGrid.material : [neonGrid.material];
  for (const gm of gridMats) {
    if (gm instanceof THREE.LineBasicMaterial) {
      gm.transparent = true;
      gm.opacity = 0.25;
    }
  }
  mapGroup.add(neonGrid);

  buildCyberBackdrop(theme);
  buildPerimeterDressing(theme);
  buildDonkeyCrowd(theme);
  buildMapProps(theme);
  applyPodiumTheme(theme);
  mapEl.textContent = `Map ${theme.name}`;
}

function buildCyberBackdrop(theme: MapTheme) {
  const matA = new THREE.MeshStandardMaterial({ color: theme.neonA, emissive: theme.neonA, emissiveIntensity: 0.18, roughness: 0.65 });
  const matB = new THREE.MeshStandardMaterial({ color: theme.neonB, emissive: theme.neonB, emissiveIntensity: 0.12, roughness: 0.72 });
  for (let i = 0; i < 20; i += 1) {
    const angle = (i / 20) * Math.PI * 2;
    const radius = 75 + (i % 3) * 3.2;
    let tower: THREE.Mesh;
    if (theme.props === "junkyard") {
      tower = new THREE.Mesh(
        new THREE.ConeGeometry(1.2 + (i % 3) * 0.35, 4 + (i % 5) * 1.4, 5),
        i % 2 === 0 ? matA : matB,
      );
    } else if (theme.props === "laserRink" || theme.props === "skatepark") {
      tower = new THREE.Mesh(
        new THREE.ConeGeometry(0.9 + (i % 3) * 0.3, 5 + (i % 5) * 1.8, 6),
        i % 2 === 0 ? matA : matB,
      );
    } else if (theme.props === "arcade" || theme.props === "mall") {
      tower = new THREE.Mesh(
        new THREE.BoxGeometry(2 + (i % 4) * 0.5, 5 + (i % 5) * 2, 2 + (i % 3) * 0.6),
        i % 2 === 0 ? matA : matB,
      );
    } else {
      tower = new THREE.Mesh(
        new THREE.BoxGeometry(1.6 + (i % 4) * 0.45, 5 + (i % 5) * 1.7, 1.1),
        i % 2 === 0 ? matA : matB,
      );
    }
    tower.position.set(Math.cos(angle) * radius, (tower.geometry as any).parameters.height / 2, Math.sin(angle) * radius);
    tower.rotation.y = -angle;
    tower.castShadow = true;
    mapGroup.add(tower);
  }
}

function buildArenaSurfaceDetails(theme: MapTheme) {
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(41.5, 49.2, 128),
    new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.82, metalness: 0.08, transparent: true, opacity: 0.24 }),
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.052;
  outerRing.receiveShadow = true;
  mapGroup.add(outerRing);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(17.5, 18.2, 96),
    new THREE.MeshStandardMaterial({ color: theme.neonA, roughness: 0.7, metalness: 0.08, transparent: true, opacity: 0.32 }),
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.058;
  mapGroup.add(innerRing);

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(i % 3 === 0 ? 8 : 5.5, 0.025, 0.18),
      new THREE.MeshStandardMaterial({ color: i % 2 ? theme.neonB : theme.accent, roughness: 0.72, metalness: 0.1, transparent: true, opacity: 0.38 }),
    );
    lane.position.set(Math.cos(angle) * 32, 0.075, Math.sin(angle) * 32);
    lane.rotation.y = -angle;
    mapGroup.add(lane);
  }

  const grimeColors = surfacePalette(theme);
  for (let i = 0; i < 44; i += 1) {
    const radius = 8 + Math.random() * 38;
    const angle = Math.random() * Math.PI * 2;
    const stain = new THREE.Mesh(
      new THREE.CircleGeometry(0.7 + Math.random() * 2.2, 14),
      new THREE.MeshStandardMaterial({ color: grimeColors[i % grimeColors.length], roughness: 0.96, transparent: true, opacity: 0.2 + Math.random() * 0.18 }),
    );
    stain.position.set(Math.cos(angle) * radius, 0.064 + i * 0.0003, Math.sin(angle) * radius);
    stain.rotation.x = -Math.PI / 2;
    stain.rotation.z = Math.random() * Math.PI;
    stain.scale.set(1.8 + Math.random() * 2.4, 0.45 + Math.random() * 0.7, 1);
    mapGroup.add(stain);
  }

  for (let i = 0; i < 28; i += 1) {
    const radius = 9 + Math.random() * 31;
    const angle = Math.random() * Math.PI * 2;
    const skid = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.02, 2.4 + Math.random() * 4.8),
      new THREE.MeshStandardMaterial({ color: 0x080807, roughness: 0.98, transparent: true, opacity: 0.28 }),
    );
    skid.position.set(Math.cos(angle) * radius, 0.09 + i * 0.0004, Math.sin(angle) * radius);
    skid.rotation.y = -angle + (Math.random() - 0.5) * 1.4;
    mapGroup.add(skid);
  }

  if (theme.props === "foodcourt" || theme.props === "mall") {
    addTilePattern(theme);
  } else if (theme.props === "junkyard" || theme.props === "subway") {
    addMetalPatchwork(theme);
  } else if (theme.props === "laserRink" || theme.props === "skatepark") {
    addPaintedSportLines(theme);
  }
}

function surfacePalette(theme: MapTheme) {
  if (theme.props === "junkyard" || theme.props === "subway") return [0x171310, 0x4e4a42, 0x6c4b2f, 0x2b2f30];
  if (theme.props === "foodcourt" || theme.props === "mall") return [0xb8aa90, 0x746b5e, 0x2f5d4a, 0x8c6143];
  if (theme.props === "laserRink" || theme.props === "skatepark") return [0xffffff, 0x495868, 0x243440, 0x6b5a7a];
  if (theme.props === "pizza" || theme.props === "rink") return [0x55351f, 0xb06a42, 0x2f241b, 0xc69b5f];
  return [0x25211d, 0x4a4137, 0x5f584d, 0x1c2025];
}

function addTilePattern(theme: MapTheme) {
  const matA = new THREE.MeshStandardMaterial({ color: 0xf0e6cf, roughness: 0.74, transparent: true, opacity: 0.18 });
  const matB = new THREE.MeshStandardMaterial({ color: theme.neonB, roughness: 0.78, transparent: true, opacity: 0.12 });
  for (let x = -36; x <= 36; x += 6) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 72), matA);
    line.position.set(x, 0.083, 0);
    mapGroup.add(line);
  }
  for (let z = -36; z <= 36; z += 6) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(72, 0.018, 0.07), z % 12 === 0 ? matB : matA);
    line.position.set(0, 0.084, z);
    mapGroup.add(line);
  }
}

function addMetalPatchwork(theme: MapTheme) {
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0x4d5657, roughness: 0.8, metalness: 0.35 }),
    new THREE.MeshStandardMaterial({ color: 0x343a3c, roughness: 0.86, metalness: 0.45 }),
    new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.7, metalness: 0.25, transparent: true, opacity: 0.55 }),
  ];
  for (let i = 0; i < 18; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 10 + Math.random() * 31;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.6 + Math.random() * 4.8, 0.035, 1.2 + Math.random() * 2.4), mats[i % mats.length]);
    plate.position.set(Math.cos(angle) * radius, 0.1 + i * 0.001, Math.sin(angle) * radius);
    plate.rotation.y = Math.random() * Math.PI;
    plate.receiveShadow = true;
    mapGroup.add(plate);
  }
}

function addPaintedSportLines(theme: MapTheme) {
  for (const radius of [12, 24, 36]) {
    const line = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.08, radius + 0.08, 96),
      new THREE.MeshStandardMaterial({ color: radius === 24 ? theme.neonB : theme.neonA, roughness: 0.58, transparent: true, opacity: 0.42 }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.096 + radius * 0.0001;
    mapGroup.add(line);
  }
}

function buildPerimeterDressing(theme: MapTheme) {
  const bannerMat = new THREE.MeshStandardMaterial({ color: theme.neonA, emissive: theme.neonA, emissiveIntensity: 0.08, roughness: 0.62, metalness: 0.1 });
  const shadowMat = new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.86, metalness: 0.2 });
  for (let i = 0; i < 20; i += 1) {
    const angle = (i / 20) * Math.PI * 2 + 0.05;
    const radius = 53.5;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.15, 0.12), i % 2 ? bannerMat : shadowMat);
    banner.position.set(Math.cos(angle) * radius, 2.15 + (i % 3) * 0.16, Math.sin(angle) * radius);
    banner.rotation.y = -angle;
    banner.castShadow = true;
    mapGroup.add(banner);
  }

  if (theme.props === "drivein") {
    addHayBales(theme);
  } else if (theme.props === "pizza" || theme.props === "rink") {
    addRockOutcrops(theme);
  } else if (theme.props === "vhs") {
    addLightPoles(theme);
  } else {
    addLightPoles(theme);
  }
}

function addLightPoles(theme: MapTheme) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1c2225, roughness: 0.54, metalness: 0.55 });
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + 0.18;
    const x = Math.cos(angle) * 47;
    const z = Math.sin(angle) * 47;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.8, 10), poleMat);
    pole.position.set(x, 2.4, z);
    pole.castShadow = true;
    mapGroup.add(pole);

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.32), new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.35, roughness: 0.35 }));
    lamp.position.set(x, 4.9, z);
    lamp.rotation.y = -angle;
    mapGroup.add(lamp);
  }
}

function addHayBales(theme: MapTheme) {
  const hayMat = new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.88, metalness: 0.02 });
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const bale = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.0, 1.2), hayMat);
    bale.position.set(Math.cos(angle) * 39, 0.5, Math.sin(angle) * 39);
    bale.rotation.y = -angle + 0.4;
    bale.castShadow = true;
    bale.receiveShadow = true;
    mapGroup.add(bale);
  }
}

function addRockOutcrops(theme: MapTheme) {
  const rockMat = new THREE.MeshStandardMaterial({ color: theme.floor, roughness: 0.92, metalness: 0.02 });
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2 + 0.12;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + (i % 3) * 0.35, 0), rockMat);
    rock.position.set(Math.cos(angle) * (43 + (i % 2) * 3), 0.7, Math.sin(angle) * (43 + (i % 2) * 3));
    rock.scale.set(1.8, 0.8 + (i % 3) * 0.25, 1.1);
    rock.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
    rock.castShadow = true;
    mapGroup.add(rock);
  }
}

function buildDonkeyCrowd(theme: MapTheme) {
  const bleacherMat = new THREE.MeshStandardMaterial({ color: 0x171c22, roughness: 0.72, metalness: 0.28 });
  const railMat = new THREE.MeshStandardMaterial({ color: theme.neonA, emissive: theme.neonA, emissiveIntensity: 0.18, roughness: 0.55, metalness: 0.18 });
  const backWallMat = new THREE.MeshStandardMaterial({ color: 0x080d12, roughness: 0.82, metalness: 0.2 });
  const rows = [
    { radius: 68, y: 3.2, depth: 1.8 },
    { radius: 72, y: 4.35, depth: 1.9 },
    { radius: 76, y: 5.5, depth: 2 },
  ];

  for (let segment = 0; segment < 16; segment += 1) {
    const angle = (segment / 16) * Math.PI * 2;
    const retainingWall = new THREE.Mesh(new THREE.BoxGeometry(7.4, 3.2, 0.38), backWallMat);
    retainingWall.position.set(Math.cos(angle) * 64, 1.7, Math.sin(angle) * 64);
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
    rail.position.set(Math.cos(angle) * 65, 3.15, Math.sin(angle) * 65);
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
    spectator.userData.baseY = spectator.position.y;
    spectator.userData.baseRotationY = spectator.rotation.y;
    spectator.userData.phase = i * 0.47;
    spectator.userData.energy = 0.65 + rowIndex * 0.18 + (i % 4) * 0.08;
    crowdDonkeys.push(spectator);
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

  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: neonColor, emissive: neonColor, emissiveIntensity: 0.25 }));
  glow.position.set(0, 0.98, -0.27);
  group.add(glow);

  for (const x of [-0.16, 0.16]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 6), new THREE.MeshStandardMaterial({ color: 0x8d684b, roughness: 0.8 }));
    ear.position.set(x, 1.42, 0);
    ear.rotation.z = x > 0 ? -0.18 : 0.18;
    ear.userData.baseRotationZ = ear.rotation.z;
    group.add(ear);
  }

  for (const x of [-0.42, 0.42]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.42, 4, 8), new THREE.MeshStandardMaterial({ color: 0x8d684b, roughness: 0.82 }));
    arm.position.set(x, 0.62, -0.04);
    arm.rotation.z = x > 0 ? -0.62 : 0.62;
    arm.rotation.x = -0.2;
    arm.userData.baseRotationZ = arm.rotation.z;
    arm.userData.cheerArm = true;
    group.add(arm);
  }

  group.userData.head = head;

  return group;
}

function buildMapProps(theme: MapTheme) {
  const matA = new THREE.MeshStandardMaterial({ color: theme.neonA, emissive: theme.neonA, emissiveIntensity: 0.12, roughness: 0.55, metalness: 0.2 });
  const matB = new THREE.MeshStandardMaterial({ color: theme.neonB, emissive: theme.neonB, emissiveIntensity: 0.08, roughness: 0.62, metalness: 0.1 });
  const matAccent = new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.72, metalness: 0.15 });

  if (theme.props === "junkyard") {
    buildJunkyardBowl(theme, matA, matB, matAccent);
  } else if (theme.props === "foodcourt") {
    buildFoodCourtDerby(theme, matA, matB, matAccent);
  } else if (theme.props === "laserRink") {
    buildLaserRollerRink(theme, matA, matB, matAccent);
  } else if (theme.props === "arcade") {
    addPropWall(-30, -6, 1.8, 4, 3, matA);
    addPropWall(29, 8, 1.8, 4, 3, matB);
    addPropWall(0, -29, 8, 1.2, 2.2, matAccent);
  } else if (theme.props === "vhs") {
    addPropWall(-25, 19, 7, 0.9, 2.4, matA);
    addPropWall(25, -16, 7, 0.9, 2.4, matB);
    addPropWall(0, 0, 2.4, 2.4, 1.4, matAccent);
  } else if (theme.props === "rink") {
    for (const z of [-22, 22]) addPropWall(0, z, 10, 0.8, 1.4, z < 0 ? matA : matB);
  } else if (theme.props === "pizza") {
    addPropWall(-13, -13, 4.5, 1.1, 2.1, matAccent);
    addPropWall(15, 13, 4.5, 1.1, 2.1, matA);
    addPropWall(0, 26, 2.5, 2.5, 2.2, matB);
  } else if (theme.props === "mall") {
    addPropWall(-22, 0, 1.4, 10, 2, matA);
    addPropWall(22, 0, 1.4, 10, 2, matB);
  } else if (theme.props === "drivein") {
    addPropWall(0, -24, 14, 0.7, 4.4, matA);
    addPropWall(-20, 15, 4, 1.1, 1.5, matAccent);
    addPropWall(20, 15, 4, 1.1, 1.5, matAccent);
  } else if (theme.props === "skatepark") {
    addRamp(-17, -7, 6, 2.8, matA, -0.45);
    addRamp(17, 10, 6, 2.8, matB, 0.45);
    addPropWall(0, 0, 6, 0.8, 1.3, matAccent);
  } else {
    addPropWall(-28, 0, 2, 12, 2.2, matA);
    addPropWall(28, 0, 2, 12, 2.2, matB);
    addPropWall(0, -22, 6, 1.1, 1.8, matAccent);
  }

  addHistoricalArchiveKiosk(theme);
}

function buildJunkyardBowl(theme: MapTheme, matA: THREE.Material, matB: THREE.Material, matAccent: THREE.Material) {
  const scrapMat = new THREE.MeshStandardMaterial({ color: 0x6f756f, roughness: 0.86, metalness: 0.38 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0c, roughness: 0.94 });
  const hazardMat = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.25, roughness: 0.62 });

  addCraneSetPiece(theme);
  addPropWall(-22, -18, 9, 1.1, 1.8, scrapMat, -0.35);
  addPropWall(23, 17, 9, 1.1, 1.8, scrapMat, -0.35);
  addPropWall(-28, 10, 1.2, 8, 2.2, matA, 0.22);
  addPropWall(28, -10, 1.2, 8, 2.2, matB, 0.22);
  addRamp(-12, 12, 6.5, 3.2, matAccent, -0.35, 0.5);
  addRamp(13, -13, 6.5, 3.2, matAccent, 0.35, -0.45);

  for (const [x, z, rotation] of [[-11, -28, 0.2], [10, 28, -0.25], [-33, -2, 1.35], [33, 2, -1.35]] as Array<[number, number, number]>) {
    addPropWall(x, z, 4.7, 1, 1.1, hazardMat, rotation);
  }

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + 0.18;
    const radius = i % 2 === 0 ? 36 : 40;
    addTireStack(Math.cos(angle) * radius, Math.sin(angle) * radius, tireMat, 2 + (i % 3));
  }
}

function buildFoodCourtDerby(theme: MapTheme, matA: THREE.Material, matB: THREE.Material, matAccent: THREE.Material) {
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xd7d1c2, roughness: 0.72, metalness: 0.04 });
  const planterMat = new THREE.MeshStandardMaterial({ color: 0x2f6f51, roughness: 0.84 });
  const counterMat = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.68, metalness: 0.22 });

  addFoodKiosk(-22, -14, "TACO", matA, counterMat, theme);
  addFoodKiosk(22, 14, "PIZZA", matB, counterMat, theme);
  addFoodKiosk(-20, 17, "BUBBLE", matAccent, counterMat, theme);
  addPropWall(0, -28, 14, 1, 2.4, matA);
  addPropWall(0, 28, 14, 1, 2.4, matB);
  addEscalatorRamp(-8, 0, matAccent, -0.28);
  addEscalatorRamp(8, 0, matAccent, 0.28);

  for (const [x, z] of [[-7, -17], [8, -17], [-8, 18], [7, 18], [-29, 0], [29, 0]] as Array<[number, number]>) {
    addPlanter(x, z, tileMat, planterMat);
  }
}

function buildLaserRollerRink(theme: MapTheme, matA: THREE.Material, matB: THREE.Material, matAccent: THREE.Material) {
  const railMat = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.62, metalness: 0.28 });
  const discoMat = new THREE.MeshStandardMaterial({ color: 0xf7f0df, roughness: 0.24, metalness: 0.75 });
  const glowMat = new THREE.MeshStandardMaterial({ color: theme.neonA, emissive: theme.neonA, emissiveIntensity: 0.92, roughness: 0.32 });

  addDiscoCenterpiece(theme, discoMat);
  addPropWall(-22, 0, 1, 18, 1.15, railMat);
  addPropWall(22, 0, 1, 18, 1.15, railMat);
  addPropWall(0, -23, 18, 1, 1.15, railMat);
  addPropWall(0, 23, 18, 1, 1.15, railMat);
  addRamp(-14, -14, 7, 3, matA, -0.28, 0.65);
  addRamp(14, 14, 7, 3, matB, 0.28, -0.65);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    addLaserPylon(Math.cos(angle) * 32, Math.sin(angle) * 32, glowMat, theme, -angle);
  }
  addPropWall(-33, 0, 0.55, 8, 2.8, matAccent, 0.3);
  addPropWall(33, 0, 0.55, 8, 2.8, matAccent, -0.3);
}

function addCraneSetPiece(theme: MapTheme) {
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x2d3637, roughness: 0.58, metalness: 0.62 });
  const hookMat = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.08, roughness: 0.55, metalness: 0.45 });
  const crane = new THREE.Group();
  crane.position.set(0, 0, -29);
  mapGroup.add(crane);

  const mast = new THREE.Mesh(new THREE.BoxGeometry(1, 8.5, 1), steelMat);
  mast.position.y = 4.25;
  mast.castShadow = true;
  crane.add(mast);

  const boom = new THREE.Mesh(new THREE.BoxGeometry(14, 0.55, 0.55), steelMat);
  boom.position.set(4.8, 8.1, 0);
  boom.rotation.z = -0.12;
  boom.castShadow = true;
  crane.add(boom);

  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.2, 8), steelMat);
  cable.position.set(9.6, 5.9, 0);
  crane.add(cable);

  const magnet = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.42, 24), hookMat);
  magnet.position.set(9.6, 3.7, 0);
  magnet.rotation.x = Math.PI / 2;
  magnet.castShadow = true;
  crane.add(magnet);

  addPropWall(0, -29, 1.4, 1.4, 2.2, steelMat);
}

function addTireStack(x: number, z: number, material: THREE.Material, count: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  mapGroup.add(group);
  for (let i = 0; i < count; i += 1) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.18, 10, 18), material);
    tire.position.y = 0.28 + i * 0.34;
    tire.rotation.x = Math.PI / 2;
    tire.rotation.z = i * 0.27;
    tire.castShadow = true;
    group.add(tire);
  }
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.65, z));
  world.createCollider(RAPIER.ColliderDesc.cylinder(0.85, 0.72).setFriction(1).setRestitution(0.28), body);
  mapBodies.push(body);
}

function addFoodKiosk(x: number, z: number, label: string, signMat: THREE.Material, counterMat: THREE.Material, theme: MapTheme) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.lookAt(0, 0, 0);
  mapGroup.add(group);

  const counter = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.15, 2.2), counterMat);
  counter.position.y = 0.58;
  counter.castShadow = true;
  counter.receiveShadow = true;
  group.add(counter);

  const sign = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.72, 0.18), signMat);
  sign.position.set(0, 2.15, -1.16);
  sign.castShadow = true;
  group.add(sign);

  for (let i = 0; i < label.length; i += 1) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.25 }));
    light.position.set((i - label.length / 2) * 0.55 + 0.25, 2.15, -1.29);
    group.add(light);
  }

  const worldPosition = new THREE.Vector3();
  group.getWorldPosition(worldPosition);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(worldPosition.x, 0.7, worldPosition.z).setRotation({ x: 0, y: group.quaternion.y, z: 0, w: group.quaternion.w }));
  world.createCollider(RAPIER.ColliderDesc.cuboid(3.1, 0.75, 1.1).setFriction(0.9).setRestitution(0.25), body);
  mapBodies.push(body);
}

function addPlanter(x: number, z: number, baseMat: THREE.Material, plantMat: THREE.Material) {
  addPropWall(x, z, 3.4, 1.2, 0.75, baseMat, Math.random() * 0.35);
  const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), plantMat);
  plant.position.set(x, 1.1, z);
  plant.scale.set(1.4, 0.58, 0.72);
  plant.castShadow = true;
  mapGroup.add(plant);
}

function addEscalatorRamp(x: number, z: number, material: THREE.Material, tilt: number) {
  addRamp(x, z, 4.2, 8, material, tilt, x < 0 ? 0.45 : -0.45);
  addPropWall(x + (x < 0 ? -2.5 : 2.5), z, 0.35, 8.5, 1.2, material);
}

function addDiscoCenterpiece(theme: MapTheme, discoMat: THREE.Material) {
  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  mapGroup.add(group);
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 2), discoMat);
  ball.position.y = 4.6;
  ball.castShadow = true;
  group.add(ball);
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 10), new THREE.MeshStandardMaterial({ color: i % 2 ? theme.neonA : theme.neonB, emissive: i % 2 ? theme.neonA : theme.neonB, emissiveIntensity: 0.2, transparent: true, opacity: 0.55 }));
    beam.position.set(Math.cos(angle) * 4.8, 3.8, Math.sin(angle) * 4.8);
    beam.rotation.y = -angle;
    group.add(beam);
  }
}

function addLaserPylon(x: number, z: number, material: THREE.Material, theme: MapTheme, rotationY: number) {
  addPropWall(x, z, 0.75, 0.75, 3.4, material, rotationY);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 7.5), new THREE.MeshStandardMaterial({ color: theme.neonB, emissive: theme.neonB, emissiveIntensity: 0.22, transparent: true, opacity: 0.5 }));
  beam.position.set(x, 2.4, z);
  beam.rotation.y = rotationY;
  mapGroup.add(beam);
}

function addPropWall(x: number, z: number, width: number, depth: number, height: number, material: THREE.Material, rotationY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, height / 2, z);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mapGroup.add(mesh);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, height / 2, z).setRotation({ x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) }));
  world.createCollider(RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2).setFriction(0.8).setRestitution(0.35), body);
  mapBodies.push(body);
}

function addRamp(x: number, z: number, width: number, depth: number, material: THREE.Material, tilt: number, rotationY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, depth), material);
  mesh.position.set(x, 0.35, z);
  mesh.rotation.x = tilt;
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mapGroup.add(mesh);
  const q = new THREE.Quaternion().setFromEuler(mesh.rotation);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.35, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  world.createCollider(RAPIER.ColliderDesc.cuboid(width / 2, 0.25, depth / 2).setFriction(1.15).setRestitution(0.08), body);
  mapBodies.push(body);
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
  const neonMat = new THREE.MeshStandardMaterial({ color: theme.neonB, emissive: theme.neonB, emissiveIntensity: 0.22, roughness: 0.48 });
  const warnMat = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.15, roughness: 0.52 });

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
      child.material = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.08, roughness: 0.42, metalness: 0.42 });
    } else if (child.name === "podium-side") {
      child.material = new THREE.MeshStandardMaterial({ color: theme.neonA, emissive: theme.neonA, emissiveIntensity: 0.06, roughness: 0.52, metalness: 0.26 });
    } else if (child.name === "podium-base") {
      child.material = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.72, metalness: 0.25 });
    }
  });
}

function buildPowerUps() {
  const placements: Array<[PowerUpType, number, number]> = [
    ["rainbowTeeth", -22, 11],
    ["chompRam", 22, 10],
    ["hayRepair", -17, -22],
    ["goldHooves", 18, -20],
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

  const paintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.38, flatShading: false });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x111416, roughness: 0.55, metalness: 0.2 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe0e0d8, roughness: 0.28, metalness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1c26, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.78 });

  // Segmented Chassis for more detailed shape
  const chassisGroup = new THREE.Group();
  group.add(chassisGroup);

  const mainBody = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.78, 3.2), paintMat);
  mainBody.position.y = 0.84;
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  chassisGroup.add(mainBody);

  const frontBody = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.68, 1.4), paintMat);
  frontBody.position.set(0, 0.79, -2.15);
  frontBody.castShadow = true;
  chassisGroup.add(frontBody);

  const rearBody = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.72, 1.1), paintMat);
  rearBody.position.set(0, 0.81, 2.05);
  rearBody.castShadow = true;
  chassisGroup.add(rearBody);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(3.08, 0.22, 1.55), paintMat);
  hood.position.set(0, 1.34, -1.82);
  hood.rotation.x = -0.14;
  hood.castShadow = true;
  group.add(hood);

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(3.08, 0.18, 1.35), paintMat);
  trunk.position.set(0, 1.26, 1.88);
  trunk.rotation.x = 0.1;
  trunk.castShadow = true;
  group.add(trunk);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.08, 5.05),
    new THREE.MeshStandardMaterial({ color: isPlayer ? 0xfff14d : 0x1a1a1a, roughness: 0.3, emissive: isPlayer ? 0x221100 : 0x000000, emissiveIntensity: 0.1 }),
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
    new THREE.BoxGeometry(2.15, 0.78, 1.65),
    trimMat,
  );
  cabin.position.set(0, 1.65, -0.5);
  cabin.castShadow = true;
  group.add(cabin);

  addCarShellDetails(group, paintMat, trimMat, chromeMat, glassMat);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.82 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xdde2dc, roughness: 0.25, metalness: 0.8 });
  const wheels: THREE.Mesh[] = [];
  for (const x of [-1.88, 1.88]) {
    for (const z of [-1.78, 1.78]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.44, 32), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.58, z);
      wheel.userData.basePosition = wheel.position.clone();
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);

      // Detailed Rim with Spokes
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.46, 16), rimMat);
      wheel.add(rim);

      for (let i = 0; i < 5; i += 1) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.08), rimMat);
        spoke.position.y = 0.24;
        const spokeGroup = new THREE.Group();
        spokeGroup.rotation.z = (i / 5) * Math.PI * 2;
        spokeGroup.add(spoke);
        rim.add(spokeGroup);
      }
    }
  }

  const ram = new THREE.Mesh(
    new THREE.BoxGeometry(4.05, 0.34, 0.36),
    chromeMat,
  );
  ram.position.set(0, 0.9, -2.95);
  ram.castShadow = true;
  group.add(ram);

  const ramLower = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.2, 0.3), chromeMat);
  ramLower.position.set(0, 0.58, -3.08);
  ramLower.castShadow = true;
  group.add(ramLower);

  const visualShell = createDerbyCarVisual(color, isPlayer ? 0xffe45e : 0x202020);
  const visualDamage = visualShell ? createCarVisualDamage(visualShell) : undefined;
  if (visualShell) {
    chassisGroup.visible = false;
    hood.visible = false;
    trunk.visible = false;
    stripe.visible = false;
    cabin.visible = false;
    ram.visible = false;
    ramLower.visible = false;
    for (const dent of dents) {
      dent.visible = false;
    }
    for (const mark of damageMarks) {
      mark.visible = false;
    }
    for (const wheel of wheels) {
      wheel.visible = false;
    }
    group.add(visualShell);
  }

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

  return {
    id,
    group,
    chassis: chassisGroup,
    stripe,
    cabin,
    ram,
    wheels,
    dents,
    damageMarks,
    dentLevels,
    body,
    collider,
    driver,
    visualShell,
    visualDamage,
    championPassenger,
    damage: 0,
    scoreValue: 1,
    isPlayer,
    aiAngle: Math.random() * Math.PI * 2,
    lastHitAt: 0,
    lastWallHitAt: 0,
    preStepVelocity: new THREE.Vector3(),
    smokeTimer: 0,
  };
}

function createDerbyCarVisual(paintColor: number, stripeColor: number) {
  if (!derbyCarTemplate) return undefined;

  const visual = derbyCarTemplate.clone(true);
  tintDerbyCarVisual(visual, paintColor, stripeColor);
  visual.position.set(0, 0.04, 0);
  visual.rotation.y = Math.PI;
  visual.scale.setScalar(1);
  return visual;
}

function tintDerbyCarVisual(visual: THREE.Object3D, paintColor: number | string, stripeColor: number | string) {
  const paintTint = new THREE.Color(paintColor);
  const stripeTint = new THREE.Color(stripeColor);
  visual.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = cloneMaterial(child.material);

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (material.name.startsWith("car paint tintable")) {
        material.color.copy(paintTint);
      } else if (material.name.startsWith("car stripe tintable")) {
        material.color.copy(stripeTint);
      }
    }
  });
}

function createCarVisualDamage(visual: THREE.Group): CarVisualDamage {
  const parts = new Map<string, THREE.Object3D>();
  const base = new Map<string, { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }>();
  visual.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.name.startsWith("Car_")) return;
    parts.set(child.name, child);
    base.set(child.name, {
      position: child.position.clone(),
      rotation: child.rotation.clone(),
      scale: child.scale.clone(),
    });
  });
  return { parts, base, detached: new Set<string>() };
}

function resetCarVisualDamage(car: Car) {
  if (!car.visualShell || !car.visualDamage) return;
  car.visualShell.visible = true;
  car.visualDamage.detached.clear();
  car.visualDamage.parts.forEach((part, name) => {
    const base = car.visualDamage?.base.get(name);
    if (!base) return;
    part.visible = true;
    part.position.copy(base.position);
    part.rotation.copy(base.rotation);
    part.scale.copy(base.scale);
  });
}


function addCarShellDetails(group: THREE.Group, paintMat: THREE.Material, trimMat: THREE.Material, chromeMat: THREE.Material, glassMat: THREE.Material) {
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.62), glassMat);
  windshield.position.set(0, 1.95, -1.25);
  windshield.rotation.x = -0.52;
  group.add(windshield);

  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.52), glassMat);
  rearGlass.position.set(0, 1.89, 0.25);
  rearGlass.rotation.x = 0.42;
  group.add(rearGlass);

  for (const x of [-1.1, 1.1]) {
    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 1.12), glassMat);
    sideWindow.position.set(x, 1.76, -0.54);
    sideWindow.castShadow = true;
    group.add(sideWindow);

    // Door handles
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.28), chromeMat);
    handle.position.set(x * 1.55, 1.25, -0.2);
    group.add(handle);
  }

  for (const x of [-1.52, 1.52]) {
    const sideSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.38, 4.45), trimMat);
    sideSkirt.position.set(x, 0.68, 0);
    sideSkirt.castShadow = true;
    group.add(sideSkirt);

    for (const z of [-1.76, 1.76]) {
      const fender = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.1, 10, 20, Math.PI), paintMat);
      fender.position.set(x, 0.78, z);
      fender.rotation.y = Math.PI / 2;
      fender.rotation.z = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      fender.castShadow = true;
      group.add(fender);
    }
  }

  // Headlights and Taillights
  for (const x of [-0.85, 0.85]) {
    const headGroup = new THREE.Group();
    headGroup.position.set(x, 1.08, -2.78);
    group.add(headGroup);

    const headlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffd0, emissive: 0xfff4a0, emissiveIntensity: 1.2, roughness: 0.1 }),
    );
    headlight.scale.set(1, 0.6, 0.4);
    headGroup.add(headlight);

    const headBezel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 16), chromeMat);
    headBezel.rotation.y = Math.PI / 2;
    headGroup.add(headBezel);

    const tailGroup = new THREE.Group();
    tailGroup.position.set(x, 1.02, 2.6);
    group.add(tailGroup);

    const tailLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.22, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xff1010, emissive: 0xff0000, emissiveIntensity: 1.1, roughness: 0.3 }),
    );
    tailGroup.add(tailLight);

    const tailBezel = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.04), trimMat);
    tailBezel.position.z = -0.05;
    tailGroup.add(tailBezel);
  }

  // Engine Details / Hood Scoop
  const scoopGroup = new THREE.Group();
  scoopGroup.position.set(0, 1.58, -1.78);
  scoopGroup.rotation.x = -0.14;
  group.add(scoopGroup);

  const scoopBase = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.25, 0.75), trimMat);
  scoopGroup.add(scoopBase);

  const intake = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.1), chromeMat);
  intake.position.set(0, 0.02, -0.38);
  scoopGroup.add(intake);

  // Interior: Steering Wheel
  const steeringGroup = new THREE.Group();
  steeringGroup.position.set(0, 1.55, -1.1);
  steeringGroup.rotation.x = 0.4;
  group.add(steeringGroup);

  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 24), trimMat);
  steeringGroup.add(wheelRim);

  const wheelSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), trimMat);
  steeringGroup.add(wheelSpoke);

  for (const x of [-1.1, 1.1]) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.75, 12), chromeMat);
    exhaust.position.set(x, 1.42, 2.38);
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
  if (!donkeyDriverTemplate) return createProceduralDonkeyDriver(color);

  const model = donkeyDriverTemplate.clone(true);
  const group = new THREE.Group();
  const teeth: THREE.Mesh[] = [];
  const hideColor = new THREE.Color(color);

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = cloneMaterial(child.material);

    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    if (material instanceof THREE.MeshStandardMaterial && material.name.startsWith("warm donkey hide")) {
      material.color.copy(hideColor);
    }

    if (child.name.startsWith("Driver_Tooth")) {
      teeth.push(child);
    }
  });

  teeth.sort((a, b) => a.name.localeCompare(b.name));
  model.rotation.y = Math.PI;
  model.position.set(0, -0.62, 0.02);
  model.scale.setScalar(0.82);
  group.add(model);
  return { group, teeth };
}

function cloneMaterial(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material.map((item) => item.clone()) : material.clone();
}

function createProceduralDonkeyDriver(color: number): Driver {
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
  const lightHide = new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.65 });
  const maneMat = new THREE.MeshStandardMaterial({ color: 0x221812, roughness: 0.82 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xfffae6, roughness: 0.22 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.6, metalness: 0.15 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x5cd6ff, emissive: 0x156d8a, emissiveIntensity: 0.35, roughness: 0.12, transparent: true, opacity: 0.85 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.75, 10, 20), hide);
  torso.position.set(0, -0.78, 0.08);
  torso.scale.set(1.15, 1.02, 0.92);
  torso.castShadow = true;
  group.add(torso);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.54, 20, 14), lightHide);
  belly.position.set(0, -0.92, -0.15);
  belly.scale.set(1.02, 0.78, 0.75);
  belly.castShadow = true;
  group.add(belly);

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.56, 20, 14), hide);
  hips.position.set(0, -1.2, 0.3);
  hips.scale.set(1.28, 0.65, 0.98);
  hips.castShadow = true;
  group.add(hips);

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.52, 8, 16), hide);
  neck.position.set(0, -0.28, -0.05);
  neck.rotation.x = -0.25;
  neck.castShadow = true;
  group.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.06;
  group.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 28, 20), hide);
  head.scale.set(0.85, 1.1, 1.2);
  head.castShadow = true;
  headGroup.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), lightHide);
  muzzle.scale.set(1.15, 0.62, 0.95);
  muzzle.position.set(0, -0.18, -0.45);
  muzzle.castShadow = true;
  headGroup.add(muzzle);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.3), lightHide);
  snout.position.set(0, -0.15, -0.62);
  snout.castShadow = true;
  headGroup.add(snout);

  for (const x of [-0.1, 0.1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), dark);
    nostril.position.set(x, -0.16, -0.76);
    nostril.scale.set(1.2, 0.5, 0.75);
    headGroup.add(nostril);
  }

  const teeth: THREE.Mesh[] = [];
  for (const x of [-0.18, 0, 0.18]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(x === 0 ? 0.14 : 0.16, 0.52, 0.08), toothMat);
    tooth.position.set(x, -0.39, -0.74);
    tooth.castShadow = true;
    headGroup.add(tooth);
    teeth.push(tooth);
  }

  for (const x of [-0.26, 0.26]) {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(x, 0.12, -0.4);
    headGroup.add(eyeGroup);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), dark);
    eyeGroup.add(eye);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    pupil.position.set(0, 0, -0.05);
    eyeGroup.add(pupil);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.06), maneMat);
    brow.position.set(0, 0.14, 0.02);
    brow.rotation.z = x > 0 ? -0.25 : 0.25;
    eyeGroup.add(brow);

    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), lensMat);
    lens.position.set(0, 0, -0.06);
    lens.scale.set(1.15, 0.75, 0.35);
    eyeGroup.add(lens);
  }

  const goggleStrap = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.07), strapMat);
  goggleStrap.position.set(0, 0.12, -0.42);
  headGroup.add(goggleStrap);

  for (const x of [-0.28, 0.28]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.85, 12), hide);
    ear.position.set(x, 0.65, 0.04);
    ear.rotation.z = x > 0 ? -0.25 : 0.25;
    ear.rotation.x = -0.1;
    ear.castShadow = true;
    headGroup.add(ear);

    const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 10), new THREE.MeshStandardMaterial({ color: 0xdfa090, roughness: 0.68 }));
    innerEar.position.set(0, -0.05, -0.05);
    ear.add(innerEar);
  }

  // Improved Mane with multiple segments
  for (let i = 0; i < 8; i += 1) {
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.14), maneMat);
    mane.position.set(0, 0.45 - i * 0.14, 0.35 + i * 0.03);
    mane.rotation.x = 0.5 + Math.sin(i * 0.5) * 0.1;
    mane.castShadow = true;
    headGroup.add(mane);
  }

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), strapMat);
  helmet.position.set(0, 0.2, 0);
  helmet.scale.set(0.96, 0.58, 0.96);
  helmet.castShadow = true;
  headGroup.add(helmet);

  for (const x of [-0.56, 0.56]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), hide);
    shoulder.position.set(x, -0.58, -0.1);
    shoulder.scale.set(1.15, 0.95, 0.85);
    shoulder.castShadow = true;
    group.add(shoulder);
  }

  for (const x of [-0.36, 0.36]) {
    const rein = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 8), strapMat);
    rein.position.set(x, -0.55, -0.38);
    rein.rotation.x = 0.7;
    rein.rotation.z = x > 0 ? 0.18 : -0.18;
    group.add(rein);
  }

  for (const x of [-0.46, 0.46]) {
    const armGroup = new THREE.Group();
    armGroup.position.set(x, -0.68, -0.22);
    group.add(armGroup);

    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 6, 12), hide);
    arm.rotation.x = -0.95;
    arm.rotation.z = x > 0 ? -0.35 : 0.35;
    arm.castShadow = true;
    armGroup.add(arm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), dark);
    hand.position.set(x * 0.45, -0.42, -0.52);
    hand.scale.set(1.25, 0.85, 0.95);
    armGroup.add(hand);
  }

  for (const x of [-0.44, 0.44]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.6, 6, 12), hide);
    thigh.position.set(x, -1.35, -0.08);
    thigh.rotation.x = Math.PI / 2.3;
    thigh.rotation.z = x > 0 ? -0.2 : 0.2;
    thigh.scale.set(1.3, 1, 1);
    thigh.castShadow = true;
    group.add(thigh);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.5, 6, 12), hide);
    shin.position.set(x, -1.52, -0.55);
    shin.rotation.x = Math.PI / 2.5;
    shin.rotation.z = x > 0 ? -0.1 : 0.1;
    shin.castShadow = true;
    group.add(shin);

    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.25), dark);
    hoof.position.set(x, -1.56, -0.92);
    hoof.rotation.y = x > 0 ? -0.1 : 0.1;
    hoof.castShadow = true;
    group.add(hoof);
  }

  for (const x of [-0.52, 0.52]) {
    const rearLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.52, 6, 12), hide);
    rearLeg.position.set(x, -1.45, 0.55);
    rearLeg.rotation.x = -Math.PI / 2.6;
    rearLeg.rotation.z = x > 0 ? 0.18 : -0.18;
    rearLeg.castShadow = true;
    group.add(rearLeg);

    const rearHoof = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.24), dark);
    rearHoof.position.set(x, -1.62, 0.9);
    rearHoof.castShadow = true;
    group.add(rearHoof);
  }

  // Improved Tail with tufts
  const tailBase = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.62, 5, 10), maneMat);
  tailBase.position.set(0, -1.08, 0.85);
  tailBase.rotation.x = -0.9;
  tailBase.castShadow = true;
  group.add(tailBase);

  for (let i = 0; i < 3; i += 1) {
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), maneMat);
    tuft.position.set((Math.random() - 0.5) * 0.1, -1.35 - i * 0.1, 1.1 + i * 0.1);
    tuft.scale.set(0.85, 1.35, 0.75);
    tuft.castShadow = true;
    group.add(tuft);
  }

  return { group, teeth };
}

function createChampionPassenger(): ChampionPassenger {
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0xa8754c, roughness: 0.7 });
  const lightHide = new THREE.MeshStandardMaterial({ color: 0xdaa87d, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x18120f, roughness: 0.68 });
  const neonPink = new THREE.MeshStandardMaterial({ color: 0xff4fd8, emissive: 0xc42a96, emissiveIntensity: 0.45, roughness: 0.3 });
  const neonBlue = new THREE.MeshStandardMaterial({ color: 0x4cc5ff, emissive: 0x1878ad, emissiveIntensity: 0.4, roughness: 0.32 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xfffae6, roughness: 0.22 });
  const maneMat = new THREE.MeshStandardMaterial({ color: 0x281512, roughness: 0.82 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xfbd75e, roughness: 0.22, metalness: 0.8 });

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.6, 22, 16), hide);
  hips.position.set(0, -1.1, 0.22);
  hips.scale.set(1.48, 0.75, 1.05);
  hips.castShadow = true;
  group.add(hips);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.44, 0.75, 10, 20), hide);
  torso.position.set(0, -0.58, -0.02);
  torso.scale.set(1.15, 1.08, 0.9);
  torso.castShadow = true;
  group.add(torso);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 14), lightHide);
  belly.position.set(0, -0.78, -0.22);
  belly.scale.set(1.05, 0.75, 0.75);
  belly.castShadow = true;
  group.add(belly);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.75), neonPink);
  vest.position.set(0, -0.62, -0.45);
  vest.rotation.x = -0.22;
  group.add(vest);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.18, -0.02);
  group.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 26, 18), hide);
  head.scale.set(0.92, 1.1, 1.15);
  head.castShadow = true;
  headGroup.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 12), lightHide);
  muzzle.position.set(0, -0.05, -0.44);
  muzzle.scale.set(1.1, 0.6, 0.95);
  muzzle.castShadow = true;
  headGroup.add(muzzle);

  const teeth: THREE.Mesh[] = [];
  for (const x of [-0.14, 0.02, 0.18]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.06), toothMat);
    tooth.position.set(x, -0.24, -0.65);
    tooth.castShadow = true;
    headGroup.add(tooth);
    teeth.push(tooth);
  }

  for (const x of [-0.2, 0.2]) {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(x, 0.2, -0.36);
    headGroup.add(eyeGroup);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), dark);
    eyeGroup.add(eye);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    pupil.position.set(0, 0, -0.05);
    eyeGroup.add(pupil);

    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.05), neonBlue);
    lens.position.set(0, 0, -0.06);
    lens.rotation.z = x > 0 ? -0.2 : 0.2;
    eyeGroup.add(lens);
  }

  for (const x of [-0.25, 0.25]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.68, 12), hide);
    ear.position.set(x, 0.7, 0.04);
    ear.rotation.z = x > 0 ? -0.3 : 0.3;
    ear.castShadow = true;
    headGroup.add(ear);
  }

  for (let i = 0; i < 6; i += 1) {
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.12), maneMat);
    mane.position.set(0, 0.48 - i * 0.14, 0.32 + i * 0.03);
    mane.rotation.x = 0.5;
    headGroup.add(mane);
  }

  const necklace = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 10, 20), goldMat);
  necklace.position.set(0, -0.22, -0.1);
  necklace.rotation.x = Math.PI / 2;
  necklace.scale.set(1.18, 0.75, 1);
  group.add(necklace);

  const arms: THREE.Object3D[] = [];
  for (const x of [-0.5, 0.5]) {
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.52, 6, 12), hide);
    upperArm.position.set(x, -0.36, -0.08);
    upperArm.rotation.z = x > 0 ? -0.75 : 0.75;
    upperArm.rotation.x = -0.6;
    upperArm.userData.baseRotation = upperArm.rotation.clone();
    upperArm.castShadow = true;
    group.add(upperArm);
    arms.push(upperArm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), dark);
    hand.position.set(x * 1.15, -0.18, -0.4);
    hand.scale.set(1.15, 0.85, 0.95);
    hand.userData.baseRotation = hand.rotation.clone();
    group.add(hand);
    arms.push(hand);
  }

  for (const x of [-0.36, 0.36]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.55, 6, 12), hide);
    thigh.position.set(x, -1.38, -0.26);
    thigh.rotation.x = Math.PI / 2.3;
    thigh.rotation.z = x > 0 ? -0.28 : 0.28;
    thigh.castShadow = true;
    group.add(thigh);

    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.26), dark);
    hoof.position.set(x, -1.5, -0.88);
    hoof.castShadow = true;
    group.add(hoof);
  }

  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 5, 10), maneMat);
  tail.position.set(0, -1.05, 0.85);
  tail.rotation.x = -0.95;
  tail.castShadow = true;
  group.add(tail);

  return { group, torso, hips, head: headGroup, arms, teeth };
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const pausedSimulation = !gameStarted || (pauseOpen && gameMode === "solo");
  if (pausedSimulation) {
    updateCamera(dt);
    updateHud(dt);
    renderer.render(scene, camera);
    return;
  }
  handlePlayer(dt);
  updateAi(dt);
  capturePreStepVelocities();
  world.step();
  scoreWallCollisions();
  syncCars();
  updateCrowdDonkeys();
  updateChampionPassenger(dt);
  updateProgressiveDamage(dt);
  updatePowerUps(dt);
  scoreCollisions();
  updateOutOfBoundsCars();
  maybeEnterVictory();
  updateDebris(dt);
  updateVictory(dt);
  updateCamera(dt);
  updateHud(dt);
  updateAudio(dt);
  updateMultiplayer(dt);
  renderer.render(scene, camera);
}

function handlePlayer(dt: number) {
  if (victory || player.damage >= 100) return;
  const forwardPressed = pressed("w", "arrowup");
  const reversePressed = pressed("s", "arrowdown");
  const leftPressed = pressed("a", "arrowleft");
  const rightPressed = pressed("d", "arrowright");
  const throttle = (forwardPressed ? 1 : 0) - (reversePressed ? 0.88 : 0);
  const rawSteer = (leftPressed ? 1 : 0) - (rightPressed ? 1 : 0);
  const handbrake = keys.has(" ");
  const steer = THREE.MathUtils.lerp(0, rawSteer, handbrake ? 1 : forwardPressed || reversePressed ? 1 : 0.72);
  const speedBoost = hasPowerUp("goldHooves") ? 1.45 : 1;
  applyCarControls(player, throttle, steer, handbrake, dt, 17 * speedBoost);
}

function applyCarControls(car: Car, throttle: number, steer: number, handbrake: boolean, dt: number, maxForward: number) {
  const fwd = forwardOf(car.body);
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const velocity = car.body.linvel();
  const angular = car.body.angvel();
  const forwardSpeed = velocity.x * fwd.x + velocity.z * fwd.z;
  const sideSpeed = velocity.x * right.x + velocity.z * right.z;
  const tuning: CarTuning = car.isPlayer
    ? playerTuning()
    : {
        speed: 1,
        grip: 1,
        brake: 1,
        lift: 0,
        reverseSpeed: 0.75,
        acceleration: 7.8,
        coastDrag: 3.4,
        steerResponse: 1,
        steerGrip: 1,
        engineBase: 62,
        enginePitch: 15,
        engineGain: 0,
        engineWave: "sawtooth",
      };
  const maxDrive = (handbrake ? Math.min(maxForward, 8.8) : maxForward) * tuning.speed;
  const reverseDrive = Math.max(6.5, maxForward * tuning.reverseSpeed);
  const targetForward = throttle >= 0 ? throttle * maxDrive : throttle * reverseDrive;
  const driveSharpness = Math.abs(throttle) < 0.05 ? tuning.coastDrag : tuning.acceleration;
  const grip = (handbrake ? 3.1 : 11.8) * tuning.grip * tuning.steerGrip;
  const nextForward = THREE.MathUtils.damp(forwardSpeed, targetForward, driveSharpness, dt);
  const nextSide = THREE.MathUtils.damp(sideSpeed, 0, grip, dt);
  const steerDirection = nextForward < -0.4 ? -1 : 1;
  const speedRatio = clamp(Math.abs(nextForward) / Math.max(1, maxDrive), 0, 1.15);
  const steerAuthority = handbrake ? 1.45 : 0.82 + (1 - speedRatio) * 0.62;
  const steerRate =
    steer *
    steerDirection *
    (1.55 + Math.min(Math.abs(nextForward) / 10.5, 1) * 1.75) *
    tuning.brake *
    tuning.steerResponse *
    steerAuthority;
  const steerDamping = Math.abs(steer) < 0.05 ? 10.5 : 15;

  car.body.setLinvel(
    {
      x: fwd.x * nextForward + right.x * nextSide,
      y: velocity.y,
      z: fwd.z * nextForward + right.z * nextSide,
    },
    true,
  );
  car.body.setAngvel({ x: angular.x * 0.2, y: THREE.MathUtils.damp(angular.y, steerRate, steerDamping, dt), z: angular.z * 0.2 }, true);
}

function updateAi(dt: number) {
  if (victory) return;
  for (const car of cars) {
    if (car.isPlayer || car.damage >= 100) continue;
    const targetCar = chooseAiTarget(car);
    const pos = car.body.translation();
    const target = targetCar.body.translation();
    const toTarget = new THREE.Vector3(target.x - pos.x, 0, target.z - pos.z);
    const distance = Math.max(0.001, toTarget.length());
    const arenaDistance = Math.hypot(pos.x, pos.z);
    const targetLead = targetCar.body.linvel();
    const leadScale = clamp(distance / 18, 0.15, 0.75);
    const desiredPoint = new THREE.Vector3(target.x + targetLead.x * leadScale, 0, target.z + targetLead.z * leadScale);

    if (arenaDistance > 35) {
      desiredPoint.set(0, 0, 0);
    } else if (distance < 5.5) {
      const fwd = forwardOf(car.body);
      desiredPoint.add(fwd.multiplyScalar(3.8));
    }

    const desired = Math.atan2(desiredPoint.x - pos.x, desiredPoint.z - pos.z);
    const current = yawOf(car.body);
    const turnError = angleDelta(current, desired);
    const steer = clamp(turnError * 1.45, -1, 1);
    const aligned = Math.cos(turnError);
    const stuck = speedOf(car.body) < 0.55 && distance > 7;
    const throttle = stuck ? -0.45 : clamp(0.35 + aligned * 0.75, -0.35, 1);
    const handbrake = Math.abs(turnError) > 1.65 && speedOf(car.body) > 5.5;

    car.aiAngle += dt * (0.8 + distance * 0.025);
    applyCarControls(car, throttle, steer, handbrake, dt, 14.5);
  }
}

function chooseAiTarget(car: Car) {
  let best = player;
  let bestScore = Number.POSITIVE_INFINITY;
  const pos = car.body.translation();
  for (const candidate of cars) {
    if (candidate === car || candidate.damage >= 100) continue;
    const c = candidate.body.translation();
    const distance = Math.hypot(c.x - pos.x, c.z - pos.z);
    const playerBias = candidate.isPlayer ? -8 : 0;
    const woundedBias = candidate.damage * -0.035;
    const score = distance + playerBias + woundedBias;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function capturePreStepVelocities() {
  for (const car of cars) {
    const velocity = car.body.linvel();
    car.preStepVelocity.set(velocity.x, velocity.y, velocity.z);
  }
}

function updateCrowdDonkeys() {
  const time = performance.now() * 0.001;
  const hype = victory ? 1.75 : 1 + Math.min(0.9, playerHits / 10);
  for (const donkey of crowdDonkeys) {
    const phase = donkey.userData.phase as number;
    const energy = donkey.userData.energy as number;
    const baseY = donkey.userData.baseY as number;
    const baseRotationY = donkey.userData.baseRotationY as number;
    const beat = time * (2.8 + energy) + phase;
    const bounce = Math.max(0, Math.sin(beat)) * 0.16 * energy * hype;

    donkey.position.y = baseY + bounce;
    donkey.rotation.y = baseRotationY + Math.sin(time * 1.6 + phase) * 0.1 * hype;
    donkey.rotation.z = Math.sin(beat * 0.75) * 0.045 * hype;

    const head = donkey.userData.head as THREE.Object3D | undefined;
    if (head) {
      head.rotation.x = Math.sin(beat * 1.15) * 0.12 * hype;
      head.rotation.y = Math.sin(time * 2.1 + phase) * 0.18 * hype;
    }

    for (const child of donkey.children) {
      const baseRotationZ = child.userData.baseRotationZ as number | undefined;
      if (baseRotationZ === undefined) continue;
      const cheer = child.userData.cheerArm ? 0.55 : 0.16;
      child.rotation.z = baseRotationZ + Math.sin(beat * 1.35 + child.position.x) * cheer * hype;
    }
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
    if (car.visualShell) {
      car.dents.forEach((dent) => {
        dent.visible = false;
      });
      car.damageMarks.forEach((mark) => {
        mark.visible = false;
      });
    } else {
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
    }
    updateCarVisualDamage(car, damageRatio);
    car.group.visible = true;
  }
}

function updateCarVisualDamage(car: Car, damageRatio: number) {
  const visual = car.visualDamage;
  if (!visual) return;

  const now = performance.now() * 0.001;
  const front = car.dentLevels[0];
  const rear = car.dentLevels[1];
  const left = car.dentLevels[2];
  const right = car.dentLevels[3];
  const wobble = Math.sin(now * 18 + car.aiAngle) * damageRatio;

  setVisualPartTransform(visual, "Car_Chassis", { scale: [1 - (left + right) * 0.035, 1 - (front + rear) * 0.045, 1 - damageRatio * 0.08], rotation: [0, 0, (left - right) * 0.035] });
  setVisualPartTransform(visual, "Car_Hood_Wedge", { position: [0, front * 0.16, -front * 0.12], rotation: [front * 0.35, 0, (right - left) * 0.07] });
  setVisualPartTransform(visual, "Car_Trunk_Wedge", { position: [0, -rear * 0.12, -rear * 0.08], rotation: [-rear * 0.22, 0, (left - right) * 0.06] });
  setVisualPartTransform(visual, "Car_Cabin_Base", { position: [(right - left) * 0.05, 0, -damageRatio * 0.16], rotation: [front * 0.1 - rear * 0.06, 0, (left - right) * 0.12] });
  setVisualPartTransform(visual, "Car_Seat_Back", { rotation: [-rear * 0.22, 0, (left - right) * 0.1] });
  setVisualPartTransform(visual, "Car_Dash", { rotation: [front * 0.16, 0, 0] });
  setVisualPartTransform(visual, "Car_Front_Ram", { position: [(right - left) * 0.1, front * 0.26, -front * 0.18], rotation: [front * 0.48, 0, (left - right) * 0.2] });
  setVisualPartTransform(visual, "Car_Front_Ram_Lower", { position: [(right - left) * 0.08, front * 0.32, -front * 0.16], rotation: [front * 0.42, 0, (left - right) * 0.16] });
  setVisualPartTransform(visual, "Car_Stripe", { scale: [1 + damageRatio * 0.08, Math.max(0.72, 1 - (front + rear) * 0.08), 1], rotation: [0, 0, (left - right) * 0.04] });

  for (const side of ["-1.9", "+1.9"]) {
    const amount = side.startsWith("-") ? left : right;
    setVisualPartTransform(visual, `Car_Side_Rail_${side}`, { position: [side.startsWith("-") ? -amount * 0.12 : amount * 0.12, 0, -amount * 0.1], rotation: [0, amount * 0.18, side.startsWith("-") ? -amount * 0.24 : amount * 0.24] });
    setVisualPartTransform(visual, `Car_Side_Rocker_${side}`, { position: [side.startsWith("-") ? -amount * 0.08 : amount * 0.08, 0, -amount * 0.09], rotation: [0, amount * 0.08, side.startsWith("-") ? -amount * 0.16 : amount * 0.16] });
  }

  for (const wheel of ["FL", "FR", "RL", "RR"]) {
    const sideLevel = wheel.endsWith("L") ? left : right;
    const endLevel = wheel.startsWith("F") ? front : rear;
    const wheelDamage = Math.min(1, damageRatio * 0.45 + sideLevel * 0.45 + endLevel * 0.2);
    setVisualPartTransform(visual, `Car_Wheel_${wheel}`, {
      position: [(wheel.endsWith("L") ? -1 : 1) * wheelDamage * 0.08, 0, -wheelDamage * 0.16],
      rotation: [wobble * 0.25, 0, (wheel.endsWith("L") ? -1 : 1) * wheelDamage * 0.38],
      scale: [1, 1, Math.max(0.62, 1 - wheelDamage * 0.2)],
    });
    setVisualPartTransform(visual, `Car_Rim_${wheel}`, {
      position: [(wheel.endsWith("L") ? -1 : 1) * wheelDamage * 0.08, 0, -wheelDamage * 0.16],
      rotation: [wobble * 0.25, 0, (wheel.endsWith("L") ? -1 : 1) * wheelDamage * 0.38],
    });
    setVisualPartTransform(visual, `Car_Fender_${wheel}`, {
      position: [(wheel.endsWith("L") ? -1 : 1) * sideLevel * 0.08, 0, -endLevel * 0.1],
      rotation: [endLevel * 0.08, 0, (wheel.endsWith("L") ? -1 : 1) * sideLevel * 0.24],
    });
  }
}

function setVisualPartTransform(
  visual: CarVisualDamage,
  name: string,
  delta: { position?: THREE.Vector3Tuple; rotation?: THREE.Vector3Tuple; scale?: THREE.Vector3Tuple },
) {
  const part = visual.parts.get(name);
  const base = visual.base.get(name);
  if (!part || !base || visual.detached.has(name)) return;
  part.position.copy(base.position);
  part.rotation.copy(base.rotation);
  part.scale.copy(base.scale);
  if (delta.position) part.position.add(new THREE.Vector3(...delta.position));
  if (delta.rotation) {
    part.rotation.x += delta.rotation[0];
    part.rotation.y += delta.rotation[1];
    part.rotation.z += delta.rotation[2];
  }
  if (delta.scale) {
    part.scale.multiply(new THREE.Vector3(...delta.scale));
  }
}

function scoreCollisions() {
  const now = performance.now();
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const aCar = cars[i];
      const bCar = cars[j];
      if (aCar.damage >= 100 || bCar.damage >= 100) continue;
      if (now - aCar.lastHitAt < 260 || now - bCar.lastHitAt < 260) continue;

      const a = aCar.body.translation();
      const b = bCar.body.translation();
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist > 4.9) continue;

      const aVelocity = aCar.body.linvel();
      const bVelocity = bCar.body.linvel();
      const relativeSpeed = Math.hypot(aVelocity.x - bVelocity.x, aVelocity.z - bVelocity.z);
      const aSpeed = speedOf(aCar.body);
      const bSpeed = speedOf(bCar.body);
      const impact = Math.max(relativeSpeed, Math.max(aSpeed, bSpeed) + Math.min(aSpeed, bSpeed) * 0.35);
      if (impact < 1.15) continue;

      const hitDirection = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      const hitPoint = new THREE.Vector3((a.x + b.x) * 0.5, 1.05, (a.z + b.z) * 0.5);
      const smash = Math.min(1, impact / 13);
      const playerInvolved = aCar.isPlayer || bCar.isPlayer;
      const rainbowBonus = hasPowerUp("rainbowTeeth") ? 1.55 : 1;
      const ramBonus = hasPowerUp("chompRam") ? 1.85 : 1;
      const playerPower = Math.max(rainbowBonus, ramBonus);
      const aMultiplier = aCar.isPlayer ? playerPower : 1;
      const bMultiplier = bCar.isPlayer ? playerPower : 1;
      const aAttack = aSpeed + relativeSpeed * 0.45;
      const bAttack = bSpeed + relativeSpeed * 0.45;
      const damageToA = 1.2 + bAttack * 1.35 * bMultiplier;
      const damageToB = 1.2 + aAttack * 1.35 * aMultiplier;

      aCar.damage += damageToA;
      bCar.damage += damageToB;
      aCar.lastHitAt = now;
      bCar.lastHitAt = now;
      if (playerInvolved) playerHits += 1;

      dentCar(aCar, hitDirection.clone().multiplyScalar(-1), impact);
      dentCar(bCar, hitDirection, impact);
      throwCar(aCar, hitDirection.clone().multiplyScalar(-1), impact * 0.75 * bMultiplier);
      throwCar(bCar, hitDirection, impact * 0.75 * aMultiplier);
      spawnImpactDebris(hitPoint, hitDirection, impact * Math.max(aMultiplier, bMultiplier));
      spawnDamageSmoke(aCar, hitPoint, impact);
      spawnDamageSmoke(bCar, hitPoint, impact);
      if (playerInvolved && (hasPowerUp("rainbowTeeth") || hasPowerUp("chompRam"))) {
        spawnPowerBurst(hitPoint, hasPowerUp("chompRam") ? "chompRam" : "rainbowTeeth");
      }
      playCrashSound(impact * Math.max(aMultiplier, bMultiplier));
      if (playerInvolved) playDonkeyHitSound(impact);
      cameraShake = Math.max(cameraShake, 0.16 + smash * 0.42 * (playerInvolved ? playerPower : 0.85));

      for (const car of [aCar, bCar]) {
        if (car.damage < 100) continue;
        const wreckDirection = car === aCar ? hitDirection.clone().multiplyScalar(-1) : hitDirection;
        destroyCar(car, wreckDirection, impact, car.isPlayer ? "Wrecked. Press R to reset." : `${car.id.toUpperCase()} wrecked`);
      }

      if (aCar.damage < 100 && bCar.damage < 100 && playerInvolved) {
        showMessage(`Heavy hit +${Math.round(impact * 12)}`);
      }
    }
  }
  if (player.damage >= 100) {
    showMessage("Wrecked. Press R to reset.");
  }
}

function scoreWallCollisions() {
  if (victory) return;
  const now = performance.now();
  for (const car of cars) {
    if (car.damage >= 100 || now - car.lastWallHitAt < 340) continue;

    const currentVelocityRaw = car.body.linvel();
    const currentVelocity = new THREE.Vector3(currentVelocityRaw.x, currentVelocityRaw.y, currentVelocityRaw.z);
    const before = car.preStepVelocity.clone();
    before.y = 0;
    currentVelocity.y = 0;
    const previousSpeed = before.length();
    if (previousSpeed < 6.5) continue;

    const nearestCarDistance = distanceToNearestCar(car);
    if (nearestCarDistance < 5.4) continue;

    const velocityDelta = before.sub(currentVelocity);
    const impact = velocityDelta.length();
    const speedLoss = Math.max(0, previousSpeed - currentVelocity.length());
    const wallSmash = Math.max(impact, speedLoss * 1.35);
    if (wallSmash < 5.5) continue;

    const crashDirection = car.preStepVelocity.clone();
    crashDirection.y = 0;
    if (crashDirection.lengthSq() < 0.001) continue;
    crashDirection.normalize();

    const pos = car.body.translation();
    const hitPoint = new THREE.Vector3(pos.x + crashDirection.x * 2, 1.05, pos.z + crashDirection.z * 2);
    const damage = (wallSmash - 4.5) * (car.isPlayer ? 2.35 : 1.9);
    car.damage += damage;
    car.lastWallHitAt = now;
    dentCar(car, crashDirection, wallSmash);
    spawnImpactDebris(hitPoint, crashDirection.clone().multiplyScalar(-1), wallSmash);
    spawnDamageSmoke(car, hitPoint, wallSmash);
    playCrashSound(wallSmash);
    if (car.isPlayer) playDonkeyHitSound(wallSmash);
    cameraShake = Math.max(cameraShake, 0.13 + Math.min(0.5, wallSmash / 22));

    if (car.damage >= 100) {
      destroyCar(car, crashDirection.clone().multiplyScalar(-1), wallSmash, car.isPlayer ? "Totaled on the wall. Press R to reset." : `${car.id.toUpperCase()} wrecked`);
    } else if (car.isPlayer) {
      showMessage(`Wall slam +${Math.round(damage)}`);
    }
  }
}

function distanceToNearestCar(car: Car) {
  const pos = car.body.translation();
  let nearest = Number.POSITIVE_INFINITY;
  for (const other of cars) {
    if (other === car || other.damage >= 100) continue;
    const otherPos = other.body.translation();
    nearest = Math.min(nearest, Math.hypot(otherPos.x - pos.x, otherPos.z - pos.z));
  }
  return nearest;
}

function updateOutOfBoundsCars() {
  for (const car of cars) {
    if (car.damage >= 100) continue;
    const pos = car.body.translation();
    const horizontalDistance = Math.hypot(pos.x, pos.z);
    if (horizontalDistance < 47 && pos.y > -6) continue;

    const fallDirection = new THREE.Vector3(pos.x, 0, pos.z).normalize();
    if (fallDirection.lengthSq() === 0) fallDirection.set(0, 0, -1);
    destroyCar(car, fallDirection, 16, car.isPlayer ? "You fell off the map. Press R to reset." : `${car.id.toUpperCase()} fell off and wrecked`);
  }
}

function destroyCar(car: Car, direction: THREE.Vector3, impact: number, message: string) {
  car.damage = 100;
  car.dentLevels.fill(1);
  car.body.setLinvel({ x: 0, y: car.body.linvel().y, z: 0 }, true);
  car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  blowApartCar(car, direction, impact);
  showMessage(message);
  if (!car.isPlayer) {
    maybeEnterVictory();
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
  for (const type of Object.keys(activePowerStates) as PowerUpType[]) {
    const state = activePowerStates[type];
    if (!state.active) continue;
    if (type === "rainbowTeeth") {
      updateRainbowTeeth();
    }
    if (state.timer > 0) {
      state.timer -= dt;
      if (state.timer <= 0) {
        clearPowerUpEffect(type);
      }
    }
  }
  syncActivePowerHud();

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

  if (powerUp.type === "rainbowTeeth") {
    setPowerUpState("rainbowTeeth", 10);
    for (const tooth of player.driver.teeth) {
      tooth.scale.y = Math.max(tooth.scale.y, customization.teethScale * 1.8);
    }
    showMessage("Rainbow teeth: boosted impact");
  } else if (powerUp.type === "chompRam") {
    setPowerUpState("chompRam", 8);
    player.ram.scale.set(1.45, 1.35, 1.55);
    showMessage("Chomp ram: savage hits");
  } else if (powerUp.type === "hayRepair") {
    repairPlayerCar();
    showMessage("Hay repair: patched up");
  } else {
    setPowerUpState("goldHooves", 8);
    showMessage("Gold hooves: speed boost");
  }

  syncActivePowerHud();
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

function clearPowerUpEffect(type: PowerUpType) {
  activePowerStates[type].active = false;
  activePowerStates[type].timer = 0;
  if (type === "rainbowTeeth") {
    applyCustomization();
  }
  if (type === "chompRam") {
    player.ram.scale.set(1, 1, 1);
  }
  syncActivePowerHud();
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

function setPowerUpState(type: PowerUpType, duration: number) {
  activePowerStates[type].active = true;
  activePowerStates[type].timer = Math.max(activePowerStates[type].timer, duration);
}

function hasPowerUp(type: PowerUpType) {
  return activePowerStates[type].active;
}

function syncActivePowerHud() {
  const activeTypes = (Object.keys(activePowerStates) as PowerUpType[]).filter((type) => activePowerStates[type].active);
  if (activeTypes.length === 0) {
    activePower = null;
    activePowerTimer = 0;
    return;
  }

  activeTypes.sort((a, b) => activePowerStates[b].timer - activePowerStates[a].timer);
  activePower = activeTypes[0];
  activePowerTimer = activePowerStates[activePower].timer;
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
  awardDerbyWin();
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
  showMessage("Winner. $250K paid out.");
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
  detachCarVisualPart(car, index, impact);
}

function detachCarVisualPart(car: Car, sideIndex: number, impact: number) {
  if (!car.visualDamage || impact < 8) return;
  const candidates = [
    ["Car_Front_Ram", "Car_Front_Ram_Lower", "Car_Hood_Wedge", "Car_Headlight_-0.6", "Car_Headlight_+0.6"],
    ["Car_Trunk_Wedge", "Car_Duct_Tape_Rear", "Car_Tail_Light_-0.6", "Car_Tail_Light_+0.6"],
    ["Car_Side_Rail_-1.9", "Car_Side_Rocker_-1.9", "Car_Fender_FL", "Car_Fender_RL", "Car_Wheel_FL"],
    ["Car_Side_Rail_+1.9", "Car_Side_Rocker_+1.9", "Car_Fender_FR", "Car_Fender_RR", "Car_Wheel_FR"],
  ][sideIndex];
  const available = candidates.filter((name) => !car.visualDamage!.detached.has(name) && car.visualDamage!.parts.has(name));
  if (available.length === 0) return;
  const threshold = impact > 13 ? 0.74 : 0.88;
  if (Math.random() > threshold) {
    const name = available[Math.floor(Math.random() * available.length)];
    const part = car.visualDamage.parts.get(name);
    if (!part) return;
    car.visualDamage.detached.add(name);
    part.visible = false;
    spawnCarPartDebris(car, part, impact);
  }
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

function spawnCarPartDebris(car: Car, part: THREE.Object3D, impact: number) {
  const worldPosition = new THREE.Vector3();
  part.getWorldPosition(worldPosition);
  const worldQuaternion = new THREE.Quaternion();
  part.getWorldQuaternion(worldQuaternion);
  const bounds = new THREE.Box3().setFromObject(part);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || size.lengthSq() === 0) size.set(0.45, 0.22, 0.45);
  size.set(clamp(size.x, 0.16, 1.9), clamp(size.y, 0.08, 0.75), clamp(size.z, 0.16, 1.9));

  const worldScale = new THREE.Vector3();
  part.getWorldScale(worldScale);
  const mesh = cloneDebrisMesh(part, size);
  mesh.position.copy(worldPosition);
  mesh.quaternion.copy(worldQuaternion);
  mesh.scale.copy(worldScale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const carVelocity = car.body.linvel();
  const velocity = new THREE.Vector3(
    carVelocity.x * 0.35 + (Math.random() - 0.5) * impact,
    1.4 + Math.random() * impact * 0.25,
    carVelocity.z * 0.35 + (Math.random() - 0.5) * impact,
  );
  const spin = new THREE.Vector3((Math.random() - 0.5) * impact, (Math.random() - 0.5) * impact * 1.4, (Math.random() - 0.5) * impact);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(worldPosition.x, worldPosition.y, worldPosition.z)
      .setRotation({ x: worldQuaternion.x, y: worldQuaternion.y, z: worldQuaternion.z, w: worldQuaternion.w })
      .setLinearDamping(0.55)
      .setAngularDamping(0.45),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(size.x * 0.5, size.y * 0.5, size.z * 0.5)
      .setDensity(0.32)
      .setRestitution(0.22)
      .setFriction(1.35),
    body,
  );
  body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
  body.setAngvel({ x: spin.x, y: spin.y, z: spin.z }, true);

  debris.push({
    mesh,
    velocity,
    spin,
    life: 3 + Math.random() * 1.8,
    body,
    collider,
  });
}

function pickDebrisMaterial(part: THREE.Object3D) {
  if (part instanceof THREE.Mesh) {
    const material = Array.isArray(part.material) ? part.material[0] : part.material;
    if (material instanceof THREE.Material) return material.clone();
  }
  return new THREE.MeshStandardMaterial({ color: 0x8b8a7d, roughness: 0.6, metalness: 0.5 });
}

function cloneDebrisMesh(part: THREE.Object3D, fallbackSize: THREE.Vector3) {
  if (part instanceof THREE.Mesh) {
    const mesh = new THREE.Mesh(part.geometry.clone(), cloneMaterial(part.material));
    mesh.name = `${part.name}_Debris`;
    return mesh;
  }
  return new THREE.Mesh(new THREE.BoxGeometry(fallbackSize.x, fallbackSize.y, fallbackSize.z), pickDebrisMaterial(part));
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
  if (car.visualDamage) {
    const wreckParts = ["Car_Front_Ram", "Car_Hood_Wedge", "Car_Trunk_Wedge", "Car_Side_Rail_-1.9", "Car_Side_Rail_+1.9", "Car_Wheel_FL", "Car_Wheel_FR", "Car_Wheel_RL", "Car_Wheel_RR"];
    for (const name of wreckParts) {
      const part = car.visualDamage.parts.get(name);
      if (!part || car.visualDamage.detached.has(name)) continue;
      car.visualDamage.detached.add(name);
      part.visible = false;
      spawnCarPartDebris(car, part, impact + 6);
    }
  }
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
    if (piece.body) {
      const position = piece.body.translation();
      const rotation = piece.body.rotation();
      piece.mesh.position.set(position.x, position.y, position.z);
      piece.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    } else {
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
    }
    if (piece.life <= 0) {
      if (piece.body) world.removeRigidBody(piece.body);
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
  walletEl.textContent = formatMoney(progression.money);
  xpEl.textContent = `XP ${progression.xp}`;
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
  const tuning = playerTuning();
  const targetFrequency = victory ? 92 : tuning.engineBase + Math.min(390, speed * tuning.enginePitch);
  const targetGain = victory ? 0.025 : 0.035 + Math.min(0.22, speed / 90) + tuning.engineGain;
  engineOsc.type = tuning.engineWave;
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
    if (key === "escape") togglePauseMenu();
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
  soloModeEl.addEventListener("click", () => startDerby("solo"));
  hostOnlineEl.addEventListener("click", () => {
    const code = `DEN-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    roomCodeEl.value = code;
    void startDerby("online", code);
  });
  joinOnlineEl.addEventListener("click", () => {
    const code = roomCodeEl.value.trim().toUpperCase();
    if (!code) {
      menuStatusEl.textContent = "Enter a room code first.";
      return;
    }
    void startDerby("online", code);
  });
  resumeGameEl.addEventListener("click", closePauseMenu);
  pauseGarageEl.addEventListener("click", () => garageEl.classList.add("open"));
  pauseResetEl.addEventListener("click", resetGame);
  pauseMainMenuEl.addEventListener("click", returnToMainMenu);
}

async function startDerby(mode: "solo" | "online", code = "") {
  gameMode = mode;
  gameStarted = true;
  pauseOpen = false;
  mainMenuEl.classList.add("hidden");
  pauseMenuEl.classList.add("hidden");
  roomId = code.trim().toUpperCase();
  resetGame();
  if (mode === "online") {
    menuStatusEl.textContent = `Room ${roomId}`;
    showMessage(`Online room ${roomId}`);
    await pushMultiplayerState();
  } else {
    showMessage("Solo derby started");
  }
}

function togglePauseMenu() {
  if (!gameStarted) return;
  pauseOpen = !pauseOpen;
  pauseMenuEl.classList.toggle("hidden", !pauseOpen);
  pauseNoteEl.textContent = gameMode === "online" ? "Online room keeps running while this menu is open." : "Solo derby is paused.";
}

function closePauseMenu() {
  pauseOpen = false;
  pauseMenuEl.classList.add("hidden");
}

function returnToMainMenu() {
  gameStarted = false;
  pauseOpen = false;
  roomId = "";
  for (const car of remoteCars.values()) {
    scene.remove(car.group);
    world.removeRigidBody(car.body);
  }
  remoteCars.clear();
  pauseMenuEl.classList.add("hidden");
  mainMenuEl.classList.remove("hidden");
  showMessage("Choose a derby mode.");
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

function defaultProgression(): Progression {
  const owned = {} as Record<ShopKey, number>;
  const equipped = {} as Record<ShopKey, number>;
  for (const key of Object.keys(shopCatalog) as ShopKey[]) {
    owned[key] = 0;
    equipped[key] = 0;
  }
  return { money: 0, xp: 0, wins: 0, owned, equipped };
}

function loadProgression() {
  try {
    const raw = localStorage.getItem("donkey-derby-progression");
    if (!raw) return defaultProgression();
    const parsed = JSON.parse(raw) as Progression;
    const base = defaultProgression();
    return {
      ...base,
      ...parsed,
      owned: { ...base.owned, ...parsed.owned },
      equipped: { ...base.equipped, ...parsed.equipped },
    };
  } catch {
    return defaultProgression();
  }
}

function saveProgression() {
  localStorage.setItem("donkey-derby-progression", JSON.stringify(progression));
}

function awardDerbyWin() {
  progression.money += 250000;
  progression.xp += 500;
  progression.wins += 1;
  saveProgression();
  renderShop();
}

function renderShop() {
  shopFundsEl.textContent = `${formatMoney(progression.money)} | XP ${progression.xp}`;
  shopItemsEl.replaceChildren();
  for (const key of Object.keys(shopCatalog) as ShopKey[]) {
    const item = shopCatalog[key];
    const row = document.createElement("div");
    row.className = "shop-row";

    const label = document.createElement("label");
    label.textContent = item.label;
    const small = document.createElement("small");
    const next = Math.min(progression.owned[key] + 1, item.values.length - 1);
    small.textContent = progression.owned[key] >= item.values.length - 1 ? "Max owned" : `${formatMoney(shopCost(key, next))} | XP ${item.xp * next}`;
    label.append(small);

    const select = document.createElement("select");
    item.values.forEach((value, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = index <= progression.owned[key] ? value : `${value} locked`;
      option.disabled = index > progression.owned[key];
      select.append(option);
    });
    select.value = String(progression.equipped[key]);
    select.addEventListener("change", () => {
      progression.equipped[key] = Number(select.value);
      saveProgression();
      applyCustomization();
      renderShop();
    });

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = progression.owned[key] >= item.values.length - 1 ? "Max" : "Buy";
    button.disabled = progression.owned[key] >= item.values.length - 1;
    button.addEventListener("click", () => buyShopUpgrade(key));

    row.append(label, select, button);
    shopItemsEl.append(row);
  }
}

function buyShopUpgrade(key: ShopKey) {
  const item = shopCatalog[key];
  const next = progression.owned[key] + 1;
  if (next >= item.values.length) return;
  const cost = shopCost(key, next);
  const xpRequired = item.xp * next;
  if (progression.money < cost || progression.xp < xpRequired) {
    showMessage(`Need ${formatMoney(cost)} and XP ${xpRequired}`);
    return;
  }
  progression.money -= cost;
  progression.owned[key] = next;
  progression.equipped[key] = next;
  saveProgression();
  applyCustomization();
  renderShop();
  showMessage(`${item.label}: ${item.values[next]}`);
}

function shopCost(key: ShopKey, level: number) {
  return shopCatalog[key].baseCost * level * (key === "enginePreset" ? 2 : 1);
}

function playerTuning() {
  const eq = progression.equipped;
  const fuelDiesel = eq.fuel === 1;
  const engine = eq.enginePreset;
  const spring = eq.springLevel;
  const metal = eq.springMetal;
  const strength = eq.springStrength;
  const lift = eq.liftKit;
  const tires = eq.tires;
  const brakes = eq.brakes;
  const brakeStrength = eq.brakeStrength;
  const exhaustFlow = eq.exhaust * 0.018;
  const exhaustTone = eq.exhaustSound * 0.012;
  const engineSoundResponse = eq.engineSound * 0.01;
  const springSupport = spring * 0.018 + metal * 0.028 + strength * 0.04;
  const tireGrip = tires * 0.026;
  const brakeForce = brakes * 0.085 + brakeStrength * 0.055;
  const rimWeightPenalty = eq.rims * 0.008;
  return {
    speed: 1 + engine * 0.11 + (fuelDiesel ? -0.03 : 0.045) + tireGrip + exhaustFlow - rimWeightPenalty,
    grip: 1 + springSupport + tireGrip - lift * 0.012,
    brake: 1 + brakeForce,
    lift: lift * 0.035,
    reverseSpeed: 0.68 + engine * 0.045 + brakeStrength * 0.018,
    acceleration: 7.6 + engine * 0.95 + eq.fuel * 0.35 + eq.exhaust * 0.3 + eq.engineSound * 0.18,
    coastDrag: 3.8 + brakes * 0.42 + brakeStrength * 0.35 + tires * 0.14,
    steerResponse: 1 + tireGrip * 0.8 + springSupport * 0.34 - lift * 0.018,
    steerGrip: 1 + tireGrip * 0.65 + brakeForce * 0.18,
    engineBase: fuelDiesel ? 46 : 62,
    enginePitch: 15 + engine * 2.5 + eq.engineSound * 0.8 + exhaustTone * 18,
    engineGain: eq.exhaustSound * 0.006 + eq.exhaust * 0.004 + engineSoundResponse * 0.08,
    engineWave: (fuelDiesel ? "square" : eq.engineSound % 2 === 0 ? "sawtooth" : "triangle") as OscillatorType,
  };
}

function formatMoney(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}K`;
  return `$${value}`;
}

interface NetworkCarState {
  id: string;
  roomId: string;
  color: string;
  stripe: string;
  damage: number;
  position: THREE.Vector3Tuple;
  rotation: [number, number, number, number];
  velocity: THREE.Vector3Tuple;
  updatedAt: number;
}

async function updateMultiplayer(dt: number) {
  if (gameMode !== "online" || !roomId) return;
  networkTimer -= dt;
  if (networkTimer > 0) return;
  networkTimer = 0.12;
  await pushMultiplayerState();
  await pullMultiplayerState();
}

async function pushMultiplayerState() {
  if (!roomId) return;
  const pos = player.body.translation();
  const rot = player.body.rotation();
  const vel = player.body.linvel();
  const state: NetworkCarState = {
    id: localPlayerId,
    roomId,
    color: customization.paint,
    stripe: customization.stripe,
    damage: player.damage,
    position: [pos.x, pos.y, pos.z],
    rotation: [rot.x, rot.y, rot.z, rot.w],
    velocity: [vel.x, vel.y, vel.z],
    updatedAt: Date.now(),
  };
  try {
    await fetch("/api/room", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch {
    menuStatusEl.textContent = "Online API unavailable locally. Deploy to Vercel for room sync.";
  }
}

async function pullMultiplayerState() {
  try {
    const response = await fetch(`/api/room?roomId=${encodeURIComponent(roomId)}&playerId=${encodeURIComponent(localPlayerId)}`);
    if (!response.ok) return;
    const payload = (await response.json()) as { players: NetworkCarState[] };
    const seen = new Set<string>();
    for (const state of payload.players) {
      seen.add(state.id);
      applyRemoteCarState(state);
    }
    for (const [id, car] of remoteCars) {
      if (seen.has(id)) continue;
      scene.remove(car.group);
      world.removeRigidBody(car.body);
      remoteCars.delete(id);
    }
    scoreEl.textContent = `Online ${payload.players.length + 1}`;
  } catch {
    // Local Vite does not serve Vercel functions; deployed rooms use /api/room.
  }
}

function applyRemoteCarState(state: NetworkCarState) {
  let car = remoteCars.get(state.id);
  if (!car) {
    const color = new THREE.Color(state.color || "#3ea6ff").getHex();
    car = createCar(`net-${state.id.slice(0, 4)}`, new THREE.Vector3(...state.position), color, false);
    car.scoreValue = 0;
    remoteCars.set(state.id, car);
    showMessage("Online rival joined.");
  }
  if (car.visualShell) {
    tintDerbyCarVisual(car.visualShell, state.color || "#3ea6ff", state.stripe || "#ffe45e");
  } else {
    setMeshColor(car.chassis, state.color || "#3ea6ff");
    setMeshColor(car.stripe, state.stripe || "#ffe45e");
  }
  car.damage = state.damage;
  car.body.setTranslation({ x: state.position[0], y: state.position[1], z: state.position[2] }, true);
  car.body.setRotation({ x: state.rotation[0], y: state.rotation[1], z: state.rotation[2], w: state.rotation[3] }, true);
  car.body.setLinvel({ x: state.velocity[0], y: state.velocity[1], z: state.velocity[2] }, true);
  car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  car.group.position.set(state.position[0], state.position[1] - 0.42, state.position[2]);
  car.group.quaternion.set(state.rotation[0], state.rotation[1], state.rotation[2], state.rotation[3]);
}

function applyCustomization() {
  setMeshColor(player.chassis, customization.paint);
  setMeshColor(player.stripe, customization.stripe);
  if (player.visualShell) {
    tintDerbyCarVisual(player.visualShell, customization.paint, customization.stripe);
  }
  const scaleByKit: Record<BodyKit, THREE.Vector3Tuple> = {
    wedge: [1, 1, 1],
    tank: [1.16, 1.2, 1.03],
    lowrider: [1.08, 0.72, 1.12],
  };
  const tuning = playerTuning();
  player.group.position.y = 0;
  player.chassis.scale.set(...scaleByKit[customization.bodyKit]);
  player.chassis.scale.y += tuning.lift;
  player.group.position.y += tuning.lift * 0.08;
  player.ram.scale.set(1 + progression.equipped.brakes * 0.035, 1 + progression.equipped.brakeStrength * 0.025, 1 + progression.equipped.brakes * 0.05);
  player.ram.position.z = -2.9 - progression.equipped.brakes * 0.04;
  player.ram.position.y = 0.88 + tuning.lift * 0.18;
  player.cabin.position.y = 1.65 + tuning.lift * 0.22;
  player.wheels.forEach((wheel, index) => {
    const tireBoost = progression.equipped.tires * 0.018;
    const rimBoost = progression.equipped.rims * 0.012;
    wheel.scale.setScalar(1 + tireBoost + rimBoost);
    const material = wheel.children[0] instanceof THREE.Mesh ? wheel.children[0].material : undefined;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.setHSL((progression.equipped.rims * 0.08) % 1, 0.25, 0.62);
      material.metalness = 0.45 + progression.equipped.rims * 0.05;
    }
    const base = (wheel.userData.basePosition as THREE.Vector3)?.clone() ?? wheel.position.clone();
    wheel.position.copy(base);
    wheel.position.y += tuning.lift + (index % 2) * 0.005;
    wheel.position.z += progression.equipped.tires * 0.01 * (index < 2 ? -1 : 1);
  });
  for (const tooth of player.driver.teeth) {
    tooth.scale.y = customization.teethScale + progression.equipped.exhaust * 0.03;
    const material = tooth.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.set(0xfff9df);
      material.emissive.set(0x000000);
      material.emissiveIntensity = 0;
    }
  }
  if (hasPowerUp("rainbowTeeth")) {
    for (const tooth of player.driver.teeth) {
      tooth.scale.y = Math.max(tooth.scale.y, customization.teethScale * 1.8);
    }
  }
  if (hasPowerUp("chompRam")) {
    player.ram.scale.multiply(new THREE.Vector3(1.45, 1.35, 1.55));
  }
}

function resetGame() {
  victory = false;
  victoryTimer = 0;
  podiumGroup.visible = false;
  for (const type of Object.keys(activePowerStates) as PowerUpType[]) {
    activePowerStates[type].active = false;
    activePowerStates[type].timer = 0;
  }
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
    car.lastWallHitAt = 0;
    car.preStepVelocity.set(0, 0, 0);
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
    resetCarVisualDamage(car);
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
    if (piece.body) world.removeRigidBody(piece.body);
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

function setMeshColor(object: THREE.Object3D, color: string) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.set(color);
      }
    }
  });
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
    Escape: "escape",
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
