import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Camera as CameraIcon,
  Crosshair,
  Gamepad2,
  Hand,
  Heart,
  Keyboard,
  Maximize2,
  Minimize2,
  PackageOpen,
  RotateCcw,
  SplitSquareHorizontal,
  Swords,
  ArrowUp,
} from 'lucide-react';
import {
  cloneParsedModel,
  type ParsedModelResult,
} from '../utils/modelLoaders';
import {
  compileUnityScript,
  type CompiledScriptFn,
} from '../utils/scriptRuntime';
import {
  applyHumanoidPose,
  buildHumanoidVisual,
  buildSpawnerCrateVisual,
  evaluateRealisticHumanoidPose,
  type HumanoidMoveType,
  type HumanoidPose,
  type HumanoidVisualNodes,
  type SpawnerCrateVisualNodes,
} from '../utils/humanoidRig';
import {
  createInitialMouseState,
  createInitialTouchState,
  pollNativeGamepads,
  samplePlayerInput,
  type UnifiedInputFrame,
} from '../utils/inputSystem';
import {
  detectPlatformRuntime,
  getQuickPlatformInfo,
  type PlatformRuntimeInfo,
} from '../utils/platformRuntime';
import {
  DEFAULT_INPUT_SETTINGS,
  type EngineEntity,
  type EngineInputSettings,
  type GizmoMode,
  type GizmoSpace,
  type MeshPrimitive,
  type ScriptAsset,
  type TexturePreset,
  type TimelineKeyframe,
  type Vec3,
} from '../types/engine';

interface Viewport3DProps {
  entities: EngineEntity[];
  scripts: ScriptAsset[];
  parsedModels: Record<string, ParsedModelResult>;
  selectedId: number | null;
  onSelectEntity: (id: number | null) => void;
  onTransformEntity: (id: number, pos: Vec3, rot: Vec3, scale: Vec3) => void;
  onBoneTransform: (id: number, boneName: string, pos: Vec3, rot: Vec3) => void;
  isPlaying: boolean;
  isPaused: boolean;
  clipPreviewPlaying: boolean;
  clipScrubTime: number;
  gizmoMode: GizmoMode;
  gizmoSpace: GizmoSpace;
  is2DView: boolean;
  showGrid: boolean;
  globalWireframe: boolean;
  lightDir: Vec3;
  ambientIntensity: number;
  inputSettings?: EngineInputSettings;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onUpdateInputSettings?: (next: EngineInputSettings) => void;
  onRestartPlay?: () => void;
  onStatsUpdate: (stats: { fps: number; drawCalls: number; triangles: number; backendLabel?: string }) => void;
  onSimEntitiesSync: (updated: EngineEntity[]) => void;
  onScriptLog: (msg: string, level?: 'Info' | 'Warning' | 'Error') => void;
}

type CombatMoveType = HumanoidMoveType;

interface GameHudState {
  p1Hp: number;
  p1MaxHp: number;
  p2Active: boolean;
  p2Hp: number;
  p2MaxHp: number;
  enemiesAlive: number;
  enemiesTotal: number;
  spawnersBroken: number;
  spawnersTotal: number;
  nearestSpawnerDist: number | null;
  nearestSpawnerDir: string | null;
  koCount: number;
  coinsCollected: number;
  score: number;
  elapsed: number;
  won: boolean;
  gameOver: boolean;
  splitScreen: boolean;
  gamepadCount: number;
  lastHitEnemy: { name: string; hp: number; maxHp: number } | null;
  lockedTargetName: string | null;
  lastMoveLabel: string | null;
  monitorCameraName: string | null;
  activeMainCamName: string | null;
}

interface ProjectileRuntime {
  id: number;
  ownerId: number;
  team: 'player' | 'enemy' | 'neutral';
  damage: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  ttl: number;
  color: string;
  mesh: THREE.Mesh;
}

function createProceduralTexture(preset: TexturePreset): THREE.Texture | null {
  if (preset === 'None' || preset === 'Custom') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (preset === 'Checkerboard') {
    const size = 32;
    for (let y = 0; y < 256; y += size) {
      for (let x = 0; x < 256; x += size) {
        const even = ((x / size) + (y / size)) % 2 === 0;
        ctx.fillStyle = even ? '#334155' : '#E2E8F0';
        ctx.fillRect(x, y, size, size);
      }
    }
  } else if (preset === 'UVGrid') {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('UV', 14, 30);
  } else if (preset === 'MetalPlate') {
    ctx.fillStyle = '#64748B';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, y, 256, 2);
    }
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 248);
  } else if (preset === 'WoodGrain') {
    ctx.fillStyle = '#7C4A2D';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 6) {
      ctx.fillStyle = y % 12 === 0 ? '#5E351E' : '#8D5838';
      ctx.fillRect(0, y, 256, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createDefaultSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(10, 10, 44, 44);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 44, 44);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('2D', 21, 38);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function createPrimitiveGeometry(primitive: MeshPrimitive): THREE.BufferGeometry {
  switch (primitive) {
    case 'Sphere':
      return new THREE.SphereGeometry(0.5, 24, 16);
    case 'Plane':
      return new THREE.BoxGeometry(1, 0.04, 1);
    case 'Cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    case 'Cone':
      return new THREE.ConeGeometry(0.5, 1, 24);
    case 'Quad2D':
      return new THREE.PlaneGeometry(1, 1);
    case 'Cube':
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function buildCameraGizmoVisual(entityId: number, color: string): THREE.Group {
  const grp = new THREE.Group();
  grp.userData.entityId = entityId;
  const tag = (o: THREE.Object3D) => {
    o.userData.entityId = entityId;
    return o;
  };

  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.35 });
  const lensMat = new THREE.MeshStandardMaterial({ color: '#0F172A', metalness: 0.8, roughness: 0.2 });

  const body = tag(new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.44, 0.82), bodyMat));
  const lens = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.32, 16), lensMat));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0, -0.52);

  // Frustum wireframe apontando para -Z (frente padrão de câmera Three.js)
  const frustumPts = [
    new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(-0.9, 0.55, -2.2),
    new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0.9, 0.55, -2.2),
    new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(-0.9, -0.55, -2.2),
    new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0.9, -0.55, -2.2),
    new THREE.Vector3(-0.9, 0.55, -2.2), new THREE.Vector3(0.9, 0.55, -2.2),
    new THREE.Vector3(0.9, 0.55, -2.2), new THREE.Vector3(0.9, -0.55, -2.2),
    new THREE.Vector3(0.9, -0.55, -2.2), new THREE.Vector3(-0.9, -0.55, -2.2),
    new THREE.Vector3(-0.9, -0.55, -2.2), new THREE.Vector3(-0.9, 0.55, -2.2),
  ];
  const frustumGeo = new THREE.BufferGeometry().setFromPoints(frustumPts);
  const frustumLine = tag(
    new THREE.LineSegments(
      frustumGeo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 })
    )
  );

  grp.add(body, lens, frustumLine);
  return grp;
}

function buildSpiderVisual(entityId: number, color: string): {
  root: THREE.Group;
  legs: THREE.Group[];
  bodyMat: THREE.MeshStandardMaterial;
} {
  const root = new THREE.Group();
  root.userData.entityId = entityId;
  const tag = (o: THREE.Object3D) => {
    o.userData.entityId = entityId;
    return o;
  };
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.4 });
  const legMat = new THREE.MeshStandardMaterial({ color: '#1E1B4B', metalness: 0.2, roughness: 0.5 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#EF4444' });

  const abdomen = tag(new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), bodyMat));
  abdomen.scale.set(1.0, 0.78, 1.25);
  abdomen.position.set(0, 0.42, -0.28);

  const head = tag(new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), bodyMat));
  head.position.set(0, 0.36, 0.28);

  for (const ex of [-0.12, -0.04, 0.04, 0.12]) {
    const eye = tag(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat));
    eye.position.set(ex, 0.42, 0.5);
    root.add(eye);
  }

  const legs: THREE.Group[] = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.22, 0.32, 0.24 - i * 0.2);
      const upper = tag(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.07, 0.07), legMat));
      upper.position.set(side * 0.22, 0.12, 0);
      upper.rotation.z = side * 0.45;
      const lower = tag(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, 0.07), legMat));
      lower.position.set(side * 0.45, -0.1, 0);
      lower.rotation.z = -side * 0.28;
      pivot.add(upper, lower);
      root.add(pivot);
      legs.push(pivot);
    }
  }
  root.add(abdomen, head);
  return { root, legs, bodyMat };
}

function buildSpinningCanVisual(entityId: number, color: string): {
  root: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
} {
  const root = new THREE.Group();
  root.userData.entityId = entityId;
  const tag = (o: THREE.Object3D) => {
    o.userData.entityId = entityId;
    return o;
  };
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.78, roughness: 0.2 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#E2E8F0', metalness: 0.9, roughness: 0.15 });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: '#FACC15',
    emissive: '#CA8A04',
    emissiveIntensity: 0.35,
  });

  const canBody = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.95, 22), bodyMat));
  const rimTop = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.47, 0.1, 22), chromeMat));
  rimTop.position.y = 0.5;
  const rimBot = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.42, 0.1, 22), chromeMat));
  rimBot.position.y = -0.5;
  const stripe = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.22, 22), stripeMat));
  const bolt = tag(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.98), stripeMat));

  root.add(canBody, rimTop, rimBot, stripe, bolt);
  return { root, bodyMat };
}

function buildHouseVisual(entityId: number, color: string): {
  root: THREE.Group;
  wallMat: THREE.MeshStandardMaterial;
} {
  const root = new THREE.Group();
  root.userData.entityId = entityId;
  const tag = (o: THREE.Object3D) => {
    o.userData.entityId = entityId;
    return o;
  };
  const wallMat = new THREE.MeshStandardMaterial({ color, metalness: 0.08, roughness: 0.75 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#1E293B', metalness: 0.2, roughness: 0.65 });
  const doorMat = new THREE.MeshStandardMaterial({ color: '#451A03', roughness: 0.7 });
  const winMat = new THREE.MeshStandardMaterial({
    color: '#FEF08A',
    emissive: '#F59E0B',
    emissiveIntensity: 0.65,
  });

  // Base normalizada (altura de y=0 até y=1.0) para que scale da entidade controle o tamanho real
  const baseWall = tag(new THREE.Mesh(new THREE.BoxGeometry(1, 0.72, 1), wallMat));
  baseWall.position.y = 0.36;

  const roof = tag(new THREE.Mesh(new THREE.ConeGeometry(0.76, 0.36, 4), roofMat));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.89;

  const door = tag(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.34, 0.04), doorMat));
  door.position.set(0, 0.17, 0.505);

  const w1 = tag(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), winMat));
  w1.position.set(-0.28, 0.46, 0.505);
  const w2 = tag(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), winMat));
  w2.position.set(0.28, 0.46, 0.505);
  const w3 = tag(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), winMat));
  w3.position.set(-0.28, 0.46, -0.505);
  const w4 = tag(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), winMat));
  w4.position.set(0.28, 0.46, -0.505);

  root.add(baseWall, roof, door, w1, w2, w3, w4);
  return { root, wallMat };
}

function sampleTrackValue(
  keyframes: TimelineKeyframe[],
  targetName: string,
  property: 'position' | 'rotation' | 'scale',
  axis: 'x' | 'y' | 'z',
  time: number
): number | null {
  const track = keyframes
    .filter((k) => k.targetName === targetName && k.property === property && k.axis === axis)
    .sort((a, b) => a.time - b.time);
  if (track.length === 0) return null;
  if (time <= track[0].time) return track[0].value;
  if (time >= track[track.length - 1].time) return track[track.length - 1].value;
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (time >= a.time && time <= b.time) {
      const span = Math.max(0.0001, b.time - a.time);
      const t = (time - a.time) / span;
      return a.value + (b.value - a.value) * t;
    }
  }
  return track[track.length - 1].value;
}

function getEntityFeetHalfHeight(e: EngineEntity): number {
  if (
    e.kind === 'Rig3D' ||
    e.kind === 'Rig2D' ||
    e.primitive === 'CustomModel' ||
    e.visualArchetype === 'spider' ||
    e.visualArchetype === 'house' ||
    e.visualArchetype === 'spawner_crate'
  ) {
    return 0;
  }
  return Math.abs(e.scale.y) * 0.5;
}

function isPlayerLike(e: EngineEntity): boolean {
  return (
    e.health?.team === 'player' ||
    e.script.mechanicPreset === 'PlayerWASD' ||
    e.script.mechanicPreset === 'Platformer2D' ||
    e.script.mechanicPreset === 'Brawler3D' ||
    e.script.mechanicPreset === 'Shooter2D' ||
    e.script.scriptAssetId === 'scr_player' ||
    e.script.scriptAssetId === 'scr_plat2d' ||
    e.script.scriptAssetId === 'scr_brawler3d' ||
    e.script.scriptAssetId === 'scr_shooter2d'
  );
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  entities,
  scripts,
  parsedModels,
  selectedId,
  onSelectEntity,
  onTransformEntity,
  onBoneTransform,
  isPlaying,
  isPaused,
  clipPreviewPlaying,
  clipScrubTime,
  gizmoMode,
  gizmoSpace,
  is2DView,
  showGrid,
  globalWireframe,
  lightDir,
  ambientIntensity,
  inputSettings = DEFAULT_INPUT_SETTINGS,
  isMaximized = false,
  onToggleMaximize,
  onUpdateInputSettings,
  onRestartPlay,
  onStatsUpdate,
  onSimEntitiesSync,
  onScriptLog,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [followCam, setFollowCam] = useState(true);
  const [stickVisual, setStickVisual] = useState({ x: 0, y: 0 });
  const [hudState, setHudState] = useState<GameHudState>({
    p1Hp: 100,
    p1MaxHp: 100,
    p2Active: false,
    p2Hp: 100,
    p2MaxHp: 100,
    enemiesAlive: 0,
    enemiesTotal: 0,
    spawnersBroken: 0,
    spawnersTotal: 0,
    nearestSpawnerDist: null,
    nearestSpawnerDir: null,
    koCount: 0,
    coinsCollected: 0,
    score: 0,
    elapsed: 0,
    won: false,
    gameOver: false,
    splitScreen: false,
    gamepadCount: 0,
    lastHitEnemy: null,
    lockedTargetName: null,
    lastMoveLabel: null,
    monitorCameraName: null,
    activeMainCamName: null,
  });

  const followCamRef = useRef(followCam);
  followCamRef.current = followCam;
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const scriptsRef = useRef(scripts);
  scriptsRef.current = scripts;
  const parsedModelsRef = useRef(parsedModels);
  parsedModelsRef.current = parsedModels;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const playStateRef = useRef({ isPlaying, isPaused, clipPreviewPlaying, clipScrubTime });
  playStateRef.current = { isPlaying, isPaused, clipPreviewPlaying, clipScrubTime };
  const gizmoCfgRef = useRef({ gizmoMode, gizmoSpace, is2DView });
  gizmoCfgRef.current = { gizmoMode, gizmoSpace, is2DView };
  const showGridRef = useRef(showGrid);
  showGridRef.current = showGrid;
  const wireRef = useRef(globalWireframe);
  wireRef.current = globalWireframe;
  const lightRef = useRef({ lightDir, ambientIntensity });
  lightRef.current = { lightDir, ambientIntensity };
  const inputSettingsRef = useRef<EngineInputSettings>(inputSettings);
  inputSettingsRef.current = inputSettings;

  // Estado nativo de Entrada (Teclado + Mouse + Touchscreen + Controle)
  const keysDownRef = useRef<Set<string>>(new Set());
  const touchStateRef = useRef(createInitialTouchState());
  const mouseStateRef = useRef(createInitialMouseState());
  const lastKeyboardAtRef = useRef(0);
  const playStartAtRef = useRef(0);
  const split2PActiveRef = useRef(false);

  const simDataRef = useRef<EngineEntity[]>(entities);
  const wasPlayingRef = useRef(false);
  const projectilesRef = useRef<ProjectileRuntime[]>([]);
  const combatCooldownRef = useRef<Map<number, number>>(new Map());
  const invulnUntilRef = useRef<Map<number, number>>(new Map());
  const hitFlashUntilRef = useRef<Map<number, number>>(new Map());
  const attackAnimUntilRef = useRef<Map<number, number>>(new Map());
  const combatMoveMapRef = useRef<
    Map<number, { move: CombatMoveType; startedAt: number; endsAt: number; baseRotY: number; comboIdx: number }>
  >(new Map());
  const comboIndexRef = useRef<Map<number, number>>(new Map());
  const spawnerNextAtRef = useRef<Map<number, number>>(new Map());
  const nextSpawnedIdRef = useRef(10000);
  const mobAiMapRef = useRef<
    Map<
      number,
      {
        targetId: number | null;
        nextThinkAt: number;
        sepX: number;
        sepZ: number;
        distToNearest: number;
      }
    >
  >(new Map());
  const camYawMapRef = useRef<Map<number, number>>(new Map());
  const camPitchMapRef = useRef<Map<number, number>>(new Map());
  const smoothLookMapRef = useRef<Map<number, THREE.Vector3>>(new Map());
  const lockedTargetMapRef = useRef<Map<number, number | null>>(new Map());
  const lockToggleCooldownRef = useRef<Map<number, number>>(new Map());
  const camShakeRef = useRef(0);

  const gameSessionRef = useRef({
    coinsCollected: 0,
    koCount: 0,
    score: 0,
    won: false,
    gameOver: false,
    lastHitEnemy: null as { name: string; hp: number; maxHp: number } | null,
    lastMoveLabel: null as string | null,
    spawnPos: { x: 0, y: 0, z: 0 },
  });

  useEffect(() => {
    if (!isPlaying) {
      wasPlayingRef.current = false;
      simDataRef.current = entities.map((e) => JSON.parse(JSON.stringify(e)));
      playStartAtRef.current = 0;
      lastKeyboardAtRef.current = 0;
      touchStateRef.current = createInitialTouchState();
      split2PActiveRef.current = false;
      combatCooldownRef.current.clear();
      invulnUntilRef.current.clear();
      hitFlashUntilRef.current.clear();
      attackAnimUntilRef.current.clear();
      combatMoveMapRef.current.clear();
      comboIndexRef.current.clear();
      spawnerNextAtRef.current.clear();
      mobAiMapRef.current.clear();
      nextSpawnedIdRef.current = 10000;
      camYawMapRef.current.clear();
      camPitchMapRef.current.clear();
      smoothLookMapRef.current.clear();
      lockedTargetMapRef.current.clear();
      lockToggleCooldownRef.current.clear();
      camShakeRef.current = 0;

      const p1 = entities.find((e) => isPlayerLike(e) && (e.playerSlot ?? 1) === 1);
      const spawners = entities.filter((e) => e.script.mechanicPreset === 'EnemySpawner');
      const enemies = entities.filter(
        (e) =>
          (e.health?.team === 'enemy' ||
            e.script.mechanicPreset === 'ZombieEnemy' ||
            e.script.mechanicPreset === 'SpiderEnemy' ||
            e.script.mechanicPreset === 'SpinningCanEnemy' ||
            e.script.mechanicPreset === 'Hazard') &&
          e.script.mechanicPreset !== 'EnemySpawner'
      );
      gameSessionRef.current = {
        coinsCollected: 0,
        koCount: 0,
        score: 0,
        won: false,
        gameOver: false,
        lastHitEnemy: null,
        lastMoveLabel: null,
        spawnPos: p1 ? { ...p1.position } : { x: 0, y: 0, z: 0 },
      };
      setHudState((prev) => ({
        ...prev,
        p1Hp: p1?.health?.currentHp ?? 100,
        p1MaxHp: p1?.health?.maxHp ?? 100,
        p2Active: false,
        enemiesAlive: enemies.length,
        enemiesTotal: enemies.length,
        spawnersBroken: 0,
        spawnersTotal: spawners.length,
        nearestSpawnerDist: null,
        nearestSpawnerDir: null,
        koCount: 0,
        coinsCollected: 0,
        score: 0,
        elapsed: 0,
        won: false,
        gameOver: false,
        splitScreen: false,
        lastHitEnemy: null,
        lockedTargetName: null,
        lastMoveLabel: null,
      }));
    } else if (!wasPlayingRef.current) {
      // Captura snapshot APENAS na entrada do Play Mode (nunca sobrescreve durante simulação ao vivo!)
      wasPlayingRef.current = true;
      simDataRef.current = entities.map((e) => JSON.parse(JSON.stringify(e)));
      playStartAtRef.current = performance.now();
    }
  }, [entities, isPlaying]);

  useEffect(() => {
    const onKD = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (playStateRef.current.isPlaying && ev.key === 'Tab') ev.preventDefault();
      const lower = ev.key.toLowerCase();
      keysDownRef.current.add(lower);
      if (ev.code === 'Space') keysDownRef.current.add('space');
      if (
        [
          'w',
          'a',
          's',
          'd',
          'f',
          'j',
          'c',
          'k',
          'q',
          'v',
          'r',
          't',
          'shift',
          'tab',
          ' ',
          'space',
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
        ].includes(lower) ||
        ev.code === 'Space'
      ) {
        lastKeyboardAtRef.current = performance.now();
      }
    };
    const onKU = (ev: KeyboardEvent) => {
      keysDownRef.current.delete(ev.key.toLowerCase());
      if (ev.code === 'Space') keysDownRef.current.delete('space');
    };
    const onBlur = () => {
      keysDownRef.current.clear();
      mouseStateRef.current.leftDown = false;
      mouseStateRef.current.rightDown = false;
    };
    window.addEventListener('keydown', onKD);
    window.addEventListener('keyup', onKU);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKD);
      window.removeEventListener('keyup', onKU);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const compiledScriptCacheRef = useRef<Map<string, { code: string; fn: CompiledScriptFn | null }>>(new Map());
  const onScriptLogRef = useRef(onScriptLog);
  onScriptLogRef.current = onScriptLog;

  const onTransformRef = useRef(onTransformEntity);
  onTransformRef.current = onTransformEntity;
  const onBoneTransformRef = useRef(onBoneTransform);
  onBoneTransformRef.current = onBoneTransform;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let cleanupFn: (() => void) | null = null;

    interface UnifiedRenderer {
      domElement: HTMLCanvasElement;
      autoClear: boolean;
      outputColorSpace: string;
      toneMapping: THREE.ToneMapping;
      toneMappingExposure: number;
      shadowMap: { enabled: boolean; type: THREE.ShadowMapType };
      info: {
        render: {
          calls?: number;
          drawCalls?: number;
          triangles: number;
        };
      };
      setPixelRatio: (r: number) => void;
      setSize: (w: number, h: number, updateStyle?: boolean) => void;
      setViewport: (x: number, y: number, w: number, h: number) => void;
      setScissor: (x: number, y: number, w: number, h: number) => void;
      setScissorTest: (v: boolean) => void;
      clear: (color?: boolean, depth?: boolean, stencil?: boolean) => void;
      render: (scene: THREE.Scene, camera: THREE.Camera) => void;
      dispose: () => void;
      getContext?: () => WebGL2RenderingContext | WebGLRenderingContext;
      compile?: (scene: THREE.Scene, camera: THREE.Camera) => void;
    }

    const bootstrapRenderer = async () => {
      const runtime: PlatformRuntimeInfo = await detectPlatformRuntime().catch(() => getQuickPlatformInfo());
      if (disposed || !container) return;

      const isSoftwareGl = runtime.isSoftwareRenderer;
      let renderer: UnifiedRenderer | null = null;
      let usingWebGPU = false;
      let activeBackendLabel = runtime.backendLabel;
      let envRT: { texture: THREE.Texture; dispose: () => void } | null = null;

      // Suporte nativo WebGPU quando iniciado em navegador compatível com placa de vídeo
      if (runtime.origin === 'browser' && runtime.graphicsBackend === 'webgpu') {
        try {
          const ThreeWebGPU = await import('three/webgpu');
          if (disposed) return;
          const wgpu = new ThreeWebGPU.WebGPURenderer({
            antialias: true,
            powerPreference: 'high-performance',
          });
          await wgpu.init();
          if (disposed) {
            wgpu.dispose();
            return;
          }
          const isWgpuBackend = Boolean(
            (wgpu.backend as { isWebGPUBackend?: boolean } | undefined)?.isWebGPUBackend
          );
          usingWebGPU = isWgpuBackend;
          activeBackendLabel = isWgpuBackend ? 'WebGPU' : 'WebGL2';
          wgpu.onDeviceLost = (info) => {
            if (info.reason === 'unknown') setContextLost(true);
          };
          renderer = wgpu as unknown as UnifiedRenderer;

          const pmremWgpu = new ThreeWebGPU.PMREMGenerator(wgpu);
          envRT = pmremWgpu.fromScene(new RoomEnvironment(), 0.04);
          pmremWgpu.dispose();
        } catch {
          usingWebGPU = false;
          activeBackendLabel = isSoftwareGl ? 'WebGL2 SW' : 'WebGL2';
          renderer = null;
        }
      }

      if (!renderer) {
        try {
          const glRenderer = new THREE.WebGLRenderer({
            antialias: !isSoftwareGl,
            powerPreference: 'high-performance',
          });
          renderer = glRenderer as unknown as UnifiedRenderer;
          const pmremGl = new THREE.PMREMGenerator(glRenderer);
          envRT = pmremGl.fromScene(new RoomEnvironment(), 0.04);
          pmremGl.dispose();
        } catch {
          setContextLost(true);
          return;
        }
      }

      if (disposed) {
        envRT?.dispose();
        renderer.dispose();
        return;
      }

      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, runtime.maxPixelRatio));
      renderer.autoClear = false;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight), false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      onScriptLogRef.current(
        `[Runtime] ${runtime.origin === 'browser' ? `Navegador (${runtime.osName}) · ${activeBackendLabel}` : runtime.techStackLabel} · ${runtime.hardwareCores} threads · ${runtime.gpuName}`
      );

      const handleLost = (ev: Event) => {
        ev.preventDefault();
        setContextLost(true);
      };
      const handleRestored = () => setContextLost(false);
      if (!usingWebGPU) {
        renderer.domElement.addEventListener('webglcontextlost', handleLost);
        renderer.domElement.addEventListener('webglcontextrestored', handleRestored);
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0E1117');
      scene.fog = new THREE.FogExp2('#0E1117', 0.01);
      if (envRT) scene.environment = envRT.texture;

    const editorCamera = new THREE.PerspectiveCamera(
      45,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      500
    );
    editorCamera.position.set(5.5, 5.2, 11.2);

    const orbit = new OrbitControls(editorCamera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.target.set(0, 1.0, 0);

    const transformGizmo = new TransformControls(editorCamera, renderer.domElement);
    const gizmoHelper = transformGizmo.getHelper();
    scene.add(gizmoHelper);

    let isDraggingGizmo = false;
    transformGizmo.addEventListener('dragging-changed', (ev) => {
      isDraggingGizmo = Boolean((ev as { value?: boolean }).value);
      orbit.enabled = !isDraggingGizmo;
    });

    transformGizmo.addEventListener('objectChange', () => {
      const obj = transformGizmo.object;
      if (!obj || selectedRef.current === null) return;
      const attachedBone = obj.userData.attachedBoneName as string | undefined;
      if (attachedBone) {
        onBoneTransformRef.current(
          selectedRef.current,
          attachedBone,
          { x: Number(obj.position.x.toFixed(2)), y: Number(obj.position.y.toFixed(2)), z: Number(obj.position.z.toFixed(2)) },
          {
            x: Number(THREE.MathUtils.radToDeg(obj.rotation.x).toFixed(1)),
            y: Number(THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(1)),
            z: Number(THREE.MathUtils.radToDeg(obj.rotation.z).toFixed(1)),
          }
        );
      } else {
        onTransformRef.current(
          selectedRef.current,
          { x: Number(obj.position.x.toFixed(2)), y: Number(obj.position.y.toFixed(2)), z: Number(obj.position.z.toFixed(2)) },
          {
            x: Number(THREE.MathUtils.radToDeg(obj.rotation.x).toFixed(1)),
            y: Number(THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(1)),
            z: Number(THREE.MathUtils.radToDeg(obj.rotation.z).toFixed(1)),
          },
          { x: Number(obj.scale.x.toFixed(2)), y: Number(obj.scale.y.toFixed(2)), z: Number(obj.scale.z.toFixed(2)) }
        );
      }
    });

    // Iluminação 3 pontos + sombra suave
    const ambientLight = new THREE.HemisphereLight('#B8CCF0', '#1B202C', ambientIntensity + 0.55);
    scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight('#FFF5E8', 1.85);
    keyLight.position.set(lightDir.x * 16, lightDir.y * 18, lightDir.z * 16);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -28;
    keyLight.shadow.camera.right = 28;
    keyLight.shadow.camera.top = 24;
    keyLight.shadow.camera.bottom = -24;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);
    const rimLight = new THREE.DirectionalLight('#60A5FA', 0.9);
    rimLight.position.set(-10, 8, -12);
    scene.add(rimLight);

    const gridHelper = new THREE.GridHelper(36, 36, '#334155', '#1E2430');
    scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(2.5);
    scene.add(axesHelper);

    const textureCache = new Map<string, THREE.Texture>();
    const texLoader = new THREE.TextureLoader();

    // Cache de objetos THREE.Camera criados para cada CameraEntity
    const entityCamMap = new Map<
      number,
      { persp: THREE.PerspectiveCamera; ortho: THREE.OrthographicCamera; smoothPos: THREE.Vector3; init: boolean }
    >();

    // GIF animado via <img> + CanvasTexture
    const gifCache = new Map<
      string,
      { img: HTMLImageElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture }
    >();
    const gifHost = document.createElement('div');
    gifHost.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:4px;height:4px;opacity:0.01;pointer-events:none;overflow:hidden;';
    document.body.appendChild(gifHost);

    const defaultSpriteTex = createDefaultSpriteTexture();

    const getSpriteTextureForEntity = (e: EngineEntity, clockSec: number): THREE.Texture => {
      const src = e.sprite?.sourceUrl;
      if (!src) return defaultSpriteTex;

      const looksLikeGif =
        Boolean(e.sprite?.isGif) ||
        src.startsWith('data:image/gif') ||
        /\.gif(\?|$)/i.test(src);

      if (looksLikeGif) {
        let entry = gifCache.get(src);
        if (!entry) {
          const img = document.createElement('img');
          img.src = src;
          img.style.cssText = 'width:auto;height:auto;';
          gifHost.appendChild(img);
          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext('2d')!;
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.magFilter = THREE.NearestFilter;
          tex.wrapS = THREE.RepeatWrapping;
          entry = { img, canvas, ctx, tex };
          gifCache.set(src, entry);
        }
        if (entry.img.complete && entry.img.naturalWidth > 0) {
          if (
            entry.canvas.width !== entry.img.naturalWidth ||
            entry.canvas.height !== entry.img.naturalHeight
          ) {
            entry.canvas.width = Math.min(512, entry.img.naturalWidth);
            entry.canvas.height = Math.min(512, entry.img.naturalHeight);
          }
          entry.ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
          entry.ctx.drawImage(entry.img, 0, 0, entry.canvas.width, entry.canvas.height);
          entry.tex.needsUpdate = true;
        }
        const flipX = Boolean(e.sprite?.flipX);
        entry.tex.repeat.set(flipX ? -1 : 1, 1);
        entry.tex.offset.set(flipX ? 1 : 0, 0);
        return entry.tex;
      }

      const key = `spr_${e.id}_${src}`;
      let tex = textureCache.get(key);
      if (!tex) {
        tex = texLoader.load(src);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        textureCache.set(key, tex);
      }

      const cols = Math.max(1, e.sprite?.cols ?? 1);
      const rows = Math.max(1, e.sprite?.rows ?? 1);
      const totalFrames = cols * rows;
      const fps = Math.max(1, e.sprite?.fps ?? 8);
      const frameIdx = totalFrames > 1 ? Math.floor(clockSec * fps) % totalFrames : 0;
      const col = frameIdx % cols;
      const row = Math.floor(frameIdx / cols);
      const flipX = Boolean(e.sprite?.flipX);

      const rx = (1 / cols) * (flipX ? -1 : 1);
      const ry = 1 / rows;
      const ox = flipX ? (col + 1) / cols : col / cols;
      const oy = 1 - (row + 1) / rows;
      tex.repeat.set(rx, ry);
      tex.offset.set(ox, oy);
      return tex;
    };

    const getTextureForEntity = (e: EngineEntity): THREE.Texture | null => {
      if (e.texturePreset === 'Custom' && e.customTextureUrl) {
        if (!textureCache.has(e.customTextureUrl)) {
          const t = texLoader.load(e.customTextureUrl);
          t.wrapS = THREE.RepeatWrapping;
          t.wrapT = THREE.RepeatWrapping;
          t.colorSpace = THREE.SRGBColorSpace;
          textureCache.set(e.customTextureUrl, t);
        }
        const tex = textureCache.get(e.customTextureUrl)!;
        tex.repeat.set(e.uvTiling.x, e.uvTiling.y);
        return tex;
      }
      if (e.texturePreset !== 'None' && e.texturePreset !== 'Custom') {
        const key = `${e.texturePreset}_${e.uvTiling.x}_${e.uvTiling.y}`;
        if (!textureCache.has(key)) {
          const tex = createProceduralTexture(e.texturePreset);
          if (tex) {
            tex.repeat.set(e.uvTiling.x, e.uvTiling.y);
            textureCache.set(key, tex);
          }
        }
        return textureCache.get(key) ?? null;
      }
      return null;
    };

    interface SceneRecord {
      kind: EngineEntity['kind'];
      primitive: MeshPrimitive;
      visualArchetype?: EngineEntity['visualArchetype'];
      isZombieRig?: boolean;
      modelAssetId?: string;
      root: THREE.Object3D;
      humanoid?: HumanoidVisualNodes;
      spawnerCrate?: SpawnerCrateVisualNodes;
      spiderLegs?: THREE.Group[];
      spiderMat?: THREE.MeshStandardMaterial;
      light?: THREE.PointLight;
      bonesMap?: Map<string, THREE.Object3D>;
      mixer?: THREE.AnimationMixer;
      activeClipName?: string | null;
      skeletonHelper?: THREE.SkeletonHelper;
    }

    const recordMap = new Map<number, SceneRecord>();
    const selectionBox = new THREE.BoxHelper(new THREE.Object3D(), '#FBBF24');
    selectionBox.visible = false;
    scene.add(selectionBox);

    // Retículo 3D animado de Auxílio de Mira (Lock-On) no mob ou caixa focada
    const lockRingGroup = new THREE.Group();
    const lockOuterRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.055, 10, 32),
      new THREE.MeshBasicMaterial({ color: '#FACC15' })
    );
    lockOuterRing.rotation.x = Math.PI / 2;
    const lockInnerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.04, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#EF4444' })
    );
    lockInnerRing.rotation.x = Math.PI / 2;
    lockRingGroup.add(lockOuterRing, lockInnerRing);
    lockRingGroup.visible = false;
    scene.add(lockRingGroup);

    const raycaster = new THREE.Raycaster();
    const downPos = { x: 0, y: 0 };
    let lastClientX = 0;
    let lastClientY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downPos.x = e.clientX;
      downPos.y = e.clientY;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      if (playStateRef.current.isPlaying) {
        if (e.button === 0) mouseStateRef.current.leftDown = true;
        if (e.button === 2) mouseStateRef.current.rightDown = true;
        mouseStateRef.current.lastClickAt = performance.now();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseStateRef.current.ndcX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      mouseStateRef.current.ndcY = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      if (playStateRef.current.isPlaying && (e.buttons & 1 || e.buttons & 2)) {
        mouseStateRef.current.deltaX += e.clientX - lastClientX;
        mouseStateRef.current.deltaY += e.clientY - lastClientY;
      }
      lastClientX = e.clientX;
      lastClientY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 0) mouseStateRef.current.leftDown = false;
      if (e.button === 2) mouseStateRef.current.rightDown = false;
      if (playStateRef.current.isPlaying) return;
      if (e.button !== 0 || isDraggingGizmo || transformGizmo.axis !== null) return;
      if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, editorCamera);
      const targets: THREE.Object3D[] = [];
      recordMap.forEach((rec) => {
        if (rec.root.visible) targets.push(rec.root);
      });
      const hits = raycaster.intersectObjects(targets, true);
      if (hits.length > 0) {
        let cur: THREE.Object3D | null = hits[0].object;
        let foundId: number | null = null;
        while (cur) {
          if (typeof cur.userData.entityId === 'number') {
            foundId = cur.userData.entityId;
            break;
          }
          cur = cur.parent;
        }
        onSelectEntity(foundId);
      } else {
        onSelectEntity(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    let resizeRaf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        editorCamera.aspect = w / h;
        editorCamera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      });
    });
    ro.observe(container);

    let last2D: boolean | null = null;
    let animFrame = 0;
    let pacingTimer = 0;
    let lastTime = performance.now();
    let fpsAccumulator = 0;
    let frameCounter = 0;
    let globalFrameIndex = 0;
    let simClock = 0;
    let totalClock = 0;
    let nextProjId = 1;

    // Pools compartilhados para Zero-GC no loop (projéteis, vetores e listas por frame)
    const sharedProjectileGeo = new THREE.SphereGeometry(0.18, 10, 8);
    const projectileMatCache = new Map<string, THREE.MeshBasicMaterial>();
    const staticPlatformsPool: EngineEntity[] = [];
    const playersPool: EngineEntity[] = [];
    const livingPlayersPool: EngineEntity[] = [];
    const activeEnemiesPool: EngineEntity[] = [];
    const spawnersPool: EngineEntity[] = [];
    const enabledCamsPool: EngineEntity[] = [];
    const fallbackC2 = editorCamera.clone();
    const poseScratch: HumanoidPose = {
      hipsPosY: 0.9,
      hipsRot: { x: 0, y: 0, z: 0 },
      spine: { x: 0, y: 0, z: 0 },
      head: { x: 0, y: 0, z: 0 },
      armL: { x: 0, y: 0, z: 8 },
      forearmL: { x: -35, y: 0, z: 0 },
      armR: { x: 0, y: 0, z: -8 },
      forearmR: { x: -35, y: 0, z: 0 },
      legL: { x: 0, y: 0, z: 0 },
      shinL: { x: 10, y: 0, z: 0 },
      legR: { x: 0, y: 0, z: 0 },
      shinR: { x: 10, y: 0, z: 0 },
    };
    const poseOverridesScratch: Record<string, Vec3> = {};

    if (!usingWebGPU && !isSoftwareGl && renderer.compile) {
      renderer.compile(scene, editorCamera);
    }

    const triggerCombatMove = (
      attacker: EngineEntity,
      move: CombatMoveType,
      list: EngineEntity[],
      nowSec: number
    ) => {
      const baseCd = attacker.health?.attackCooldown ?? 0.3;
      const cd =
        move === 'capoeira'
          ? 0.58
          : move === 'roll'
          ? 0.56
          : move === 'kick'
          ? 0.42
          : baseCd;
      const readyAt = combatCooldownRef.current.get(attacker.id) ?? 0;
      if (nowSec < readyAt) return;
      combatCooldownRef.current.set(attacker.id, nowSec + cd);

      const dur = move === 'capoeira' ? 0.46 : move === 'roll' ? 0.42 : move === 'kick' ? 0.34 : 0.28;
      const nextCombo = move === 'punch' ? (comboIndexRef.current.get(attacker.id) ?? 0) + 1 : 0;
      comboIndexRef.current.set(attacker.id, nextCombo);
      attacker.animator.currentState = 'Attack';
      attackAnimUntilRef.current.set(attacker.id, nowSec + dur);
      combatMoveMapRef.current.set(attacker.id, {
        move,
        startedAt: nowSec,
        endsAt: nowSec + dur,
        baseRotY: attacker.rotation.y,
        comboIdx: nextCombo,
      });

      const attackerTeam = attacker.health?.team ?? (isPlayerLike(attacker) ? 'player' : 'enemy');
      if (attackerTeam === 'player') {
        gameSessionRef.current.lastMoveLabel =
          move === 'capoeira'
            ? 'Capoeira 360°!'
            : move === 'kick'
            ? 'Chute Forte!'
            : move === 'roll'
            ? 'Rolamento (Esquiva)'
            : 'Soco Combo';
      }

      if (move === 'roll') {
        const rad = THREE.MathUtils.degToRad(attacker.rotation.y);
        attacker.physics.velocity.x = Math.sin(rad) * 10.8;
        attacker.physics.velocity.z = Math.cos(rad) * 10.8;
        invulnUntilRef.current.set(attacker.id, nowSec + 0.48);
        return;
      }

      const baseRange = attacker.health?.attackRange ?? 2.3;
      const range = move === 'capoeira' ? baseRange + 1.05 : move === 'kick' ? baseRange + 0.5 : baseRange;
      const baseDmg = attacker.health?.attackDamage ?? 26;
      const dmg =
        move === 'capoeira'
          ? Math.round(baseDmg * 1.65)
          : move === 'kick'
          ? Math.round(baseDmg * 1.35)
          : baseDmg;

      let hitAny = false;
      for (const target of list) {
        if (!target.active || target.id === attacker.id || !target.health?.enabled) continue;
        if (target.health.team === attackerTeam) continue;

        const dx = target.position.x - attacker.position.x;
        const dy = target.position.y - attacker.position.y;
        const dz = gizmoCfgRef.current.is2DView ? 0 : target.position.z - attacker.position.z;
        const dist = Math.hypot(dx, dy, dz);
        const effRange = target.script.mechanicPreset === 'EnemySpawner' ? range + 0.65 : range;
        if (dist > effRange) continue;

        const targetInvuln = invulnUntilRef.current.get(target.id) ?? 0;
        if (target.health.team === 'player' && nowSec < targetInvuln) continue;

        hitAny = true;
        target.health.currentHp = Math.max(0, target.health.currentHp - dmg);
        hitFlashUntilRef.current.set(target.id, nowSec + 0.18);
        if (target.health.team === 'player') {
          invulnUntilRef.current.set(target.id, nowSec + 0.72);
        }

        // Caixas nascedoras e objetos estáticos não voam com knockback
        if (!target.physics.isStatic && target.script.mechanicPreset !== 'EnemySpawner') {
          const nx = dist > 0.01 ? dx / dist : 1;
          const nz = dist > 0.01 ? dz / dist : 0;
          const kb = move === 'capoeira' ? 8.5 : move === 'kick' ? 7.6 : 5.4;
          target.physics.velocity.x += nx * (attackerTeam === 'player' ? kb : 4.0);
          target.physics.velocity.z += nz * (attackerTeam === 'player' ? kb * 0.85 : 3.0);
          target.physics.velocity.y = Math.max(
            target.physics.velocity.y,
            move === 'kick' || move === 'capoeira' ? 3.8 : 2.2
          );
        }

        if (attackerTeam === 'player') {
          const pSlot = attacker.playerSlot === 2 ? 2 : 1;
          if (target.health.currentHp > 0) {
            lockedTargetMapRef.current.set(pSlot, target.id);
          } else {
            lockedTargetMapRef.current.set(pSlot, null);
          }
          gameSessionRef.current.lastHitEnemy = {
            name: target.name,
            hp: target.health.currentHp,
            maxHp: target.health.maxHp,
          };
          if (target.health.currentHp <= 0) {
            target.active = false;
            gameSessionRef.current.koCount += 1;
            const isCrate = target.script.mechanicPreset === 'EnemySpawner';
            gameSessionRef.current.score += isCrate ? 250 : 150;
            if (isCrate) {
              camShakeRef.current = Math.max(camShakeRef.current, 0.36);
              onScriptLogRef.current(`Caixa quebrada! ${target.name} destruída (+250 pts)`);
            } else {
              onScriptLogRef.current(`Nocaute! ${target.name} derrotado (+150 pts)`);
            }
          }
        } else {
          onScriptLogRef.current(
            `${attacker.name} causou ${dmg} de dano em ${target.name} (${target.health.currentHp}/${target.health.maxHp} HP)`,
            'Warning'
          );
        }
      }

      if (hitAny && attackerTeam === 'player') {
        camShakeRef.current = Math.max(camShakeRef.current, move === 'capoeira' ? 0.28 : move === 'kick' ? 0.2 : 0.12);
      }
    };

    const triggerMeleeAttack = (attacker: EngineEntity, list: EngineEntity[], nowSec: number) =>
      triggerCombatMove(attacker, 'punch', list, nowSec);

    const triggerShoot = (shooter: EngineEntity, nowSec: number) => {
      const cd = shooter.health?.attackCooldown ?? 0.24;
      const readyAt = combatCooldownRef.current.get(shooter.id) ?? 0;
      if (nowSec < readyAt) return;
      combatCooldownRef.current.set(shooter.id, nowSec + cd);
      shooter.animator.currentState = 'Attack';
      attackAnimUntilRef.current.set(shooter.id, nowSec + 0.22);

      const speed = shooter.health?.projectileSpeed ?? 16;
      const color = shooter.health?.projectileColor ?? '#38BDF8';
      const dmg = shooter.health?.attackDamage ?? 25;

      let dirX = 1;
      let dirZ = 0;
      if (shooter.kind === 'Sprite2D' || gizmoCfgRef.current.is2DView) {
        dirX = shooter.sprite?.flipX ? -1 : 1;
      } else {
        const rad = THREE.MathUtils.degToRad(shooter.rotation.y);
        dirX = Math.sin(rad);
        dirZ = Math.cos(rad);
      }

      const startPos = new THREE.Vector3(
        shooter.position.x + dirX * 0.75,
        shooter.position.y + (shooter.kind === 'Rig3D' ? 0.95 : 0.1),
        shooter.position.z + dirZ * 0.75
      );

      let pMat = projectileMatCache.get(color);
      if (!pMat) {
        pMat = new THREE.MeshBasicMaterial({ color });
        projectileMatCache.set(color, pMat);
      }
      const projMesh = new THREE.Mesh(sharedProjectileGeo, pMat);
      projMesh.position.copy(startPos);
      scene.add(projMesh);

      projectilesRef.current.push({
        id: nextProjId++,
        ownerId: shooter.id,
        team: shooter.health?.team ?? 'player',
        damage: dmg,
        pos: startPos,
        vel: new THREE.Vector3(dirX * speed, 0, dirZ * speed),
        ttl: 1.6,
        color,
        mesh: projMesh,
      });
    };

    const clearProjectiles = () => {
      for (const pr of projectilesRef.current) {
        scene.remove(pr.mesh);
      }
      projectilesRef.current = [];
    };

    const afterDrawWebGL = (cb: () => void) => {
      if (disposed) return;
      const gl = renderer?.getContext?.() as WebGL2RenderingContext | undefined;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            pacingTimer = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            pacingTimer = window.setTimeout(cb, 80);
          }
        };
        pacingTimer = window.setTimeout(poll, 5);
      } else {
        pacingTimer = window.setTimeout(cb, 80);
      }
    };

    const scheduleNextFrame = () => {
      if (disposed) return;
      if (!usingWebGPU && isSoftwareGl) {
        afterDrawWebGL(() => {
          if (!disposed) animFrame = requestAnimationFrame(tick);
        });
      } else {
        animFrame = requestAnimationFrame(tick);
      }
    };

    const tick = (now: number) => {
      if (disposed) return;
      globalFrameIndex++;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      totalClock += dt;

      if (gizmoCfgRef.current.is2DView !== last2D) {
        last2D = gizmoCfgRef.current.is2DView;
        if (last2D) {
          editorCamera.position.set(0, 2.4, 15.0);
          orbit.target.set(0, 1.5, 0);
        } else {
          editorCamera.position.set(6.2, 5.2, 11.4);
          orbit.target.set(0, 1.0, 0);
        }
      }

      transformGizmo.setMode(gizmoCfgRef.current.gizmoMode);
      transformGizmo.setSpace(gizmoCfgRef.current.gizmoSpace);

      gridHelper.visible = showGridRef.current;
      axesHelper.visible = showGridRef.current;
      keyLight.position.set(
        lightRef.current.lightDir.x * 12,
        lightRef.current.lightDir.y * 12,
        lightRef.current.lightDir.z * 12
      );
      ambientLight.intensity = lightRef.current.ambientIntensity + 0.5;

      const playing = playStateRef.current.isPlaying && !playStateRef.current.isPaused;
      if (playing) {
        simClock += dt;
      } else if (!playStateRef.current.isPlaying) {
        simClock = 0;
        if (projectilesRef.current.length > 0) clearProjectiles();
      }

      const currentList = playStateRef.current.isPlaying ? simDataRef.current : entitiesRef.current;
      const settings = inputSettingsRef.current;
      const gamepads = pollNativeGamepads(settings.gamepadEnabled);

      // Detecção automática de 2 Jogadores Split-Screen quando Teclado + Touchscreen são usados juntos!
      if (playing) {
        const keyboardUsedInPlay = lastKeyboardAtRef.current >= playStartAtRef.current && playStartAtRef.current > 0;
        const touchUsedInPlay =
          touchStateRef.current.lastTouchAt >= playStartAtRef.current && playStartAtRef.current > 0;

        if (settings.splitScreenCoop === 'always') {
          split2PActiveRef.current = true;
        } else if (settings.splitScreenCoop === 'off') {
          split2PActiveRef.current = false;
        } else if (
          !split2PActiveRef.current &&
          ((keyboardUsedInPlay && touchUsedInPlay) || gamepads.length >= 2)
        ) {
          split2PActiveRef.current = true;
          const p1 = currentList.find((e) => isPlayerLike(e) && (e.playerSlot ?? 1) === 1);
          const p2 = currentList.find((e) => isPlayerLike(e) && e.playerSlot === 2);
          if (p2) {
            p2.active = true;
            if (p1) {
              p2.position = {
                x: p1.position.x + 1.5,
                y: p1.position.y + 0.2,
                z: gizmoCfgRef.current.is2DView ? p1.position.z : p1.position.z - 1.5,
              };
            }
            if (p2.health) p2.health.currentHp = p2.health.maxHp;
          }
          onScriptLogRef.current('Modo 2 Jogadores ativado (Teclado + Touchscreen) com 2 Câmeras!');
        } else if (split2PActiveRef.current) {
          const p2 = currentList.find((e) => isPlayerLike(e) && e.playerSlot === 2);
          if (p2 && !p2.active && (p2.health?.currentHp ?? 1) > 0) {
            p2.active = true;
          }
        }
      }

      const inputFrame: UnifiedInputFrame = {
        keysDown: keysDownRef.current,
        touch: touchStateRef.current,
        mouse: mouseStateRef.current,
        gamepads,
        lastKeyboardAt: lastKeyboardAtRef.current,
        splitScreen2PActive: split2PActiveRef.current,
        settings,
      };

      // Pre-coleta única por frame em pools reutilizáveis (Zero-GC, evita N× .filter())
      staticPlatformsPool.length = 0;
      playersPool.length = 0;
      livingPlayersPool.length = 0;
      activeEnemiesPool.length = 0;
      spawnersPool.length = 0;
      enabledCamsPool.length = 0;
      for (let i = 0; i < currentList.length; i++) {
        const item = currentList[i];
        if (item.script.mechanicPreset === 'EnemySpawner') {
          spawnersPool.push(item);
        } else if (item.active && item.health?.team === 'enemy') {
          activeEnemiesPool.push(item);
        }
        if (!item.active) continue;
        if (item.kind === 'Camera' && (item.camera?.enabled ?? true)) {
          enabledCamsPool.push(item);
        }
        if (item.physics.enabled && item.physics.isStatic && item.script.mechanicPreset !== 'JumpPad') {
          staticPlatformsPool.push(item);
        }
        if (isPlayerLike(item)) {
          playersPool.push(item);
          if (!item.health || item.health.currentHp > 0) {
            livingPlayersPool.push(item);
          }
        }
      }

      if (playing && !gameSessionRef.current.gameOver) {
        const staticPlatforms = staticPlatformsPool;
        const aiStride = Math.max(2, runtime.aiStaggerStride);

        for (const e of currentList) {
          if (!e.active) continue;

          // Se entidade é jogador com 0 HP, não executa input
          if (e.health?.team === 'player' && e.health.currentHp <= 0) continue;

          const attackUntil = attackAnimUntilRef.current.get(e.id) ?? 0;
          if (simClock > attackUntil && e.animator.currentState === 'Attack') {
            e.animator.currentState = 'Idle';
          }

          const slot: 1 | 2 = e.playerSlot === 2 ? 2 : 1;
          const activeCamForSlot = currentList.find(
            (c) => c.kind === 'Camera' && c.active && (c.camera?.playerSlot ?? 1) === slot
          );
          const isGtaCam = Boolean(!gizmoCfgRef.current.is2DView && activeCamForSlot?.camera?.gtaChase);

          // 1. Execução de Script ou Preset Nativo
          if (e.script.scriptAssetId) {
            const scr = scriptsRef.current.find((s) => s.id === e.script.scriptAssetId);
            if (scr) {
              let cached = compiledScriptCacheRef.current.get(scr.id);
              if (!cached || cached.code !== scr.code) {
                const res = compileUnityScript(scr.code);
                cached = { code: scr.code, fn: res.fn };
                compiledScriptCacheRef.current.set(scr.id, cached);
                if (res.error) onScriptLogRef.current(`Script '${scr.name}': ${res.error}`, 'Error');
              }
              if (cached.fn) {
                try {
                  cached.fn(e, {
                    dt,
                    time: simClock,
                    inputFrame,
                    allEntities: currentList,
                    onLog: onScriptLogRef.current,
                    onRequestAttack: (att) => triggerMeleeAttack(att, currentList, simClock),
                    onRequestShoot: (sh) => triggerShoot(sh, simClock),
                  });
                } catch (err) {
                  const m = err instanceof Error ? err.message : 'Erro em runtime';
                  onScriptLogRef.current(`Erro em '${scr.name}': ${m}`, 'Error');
                }
              }
            }
          } else {
            const preset = e.script.mechanicPreset;
            if (preset === 'PlayerWASD' || preset === 'Brawler3D') {
              const inp = samplePlayerInput(inputFrame, slot);
              const lockRange = activeCamForSlot?.camera?.lockOnRange ?? 6.5;

              // Alternar ou soltar auxílio de mira manualmente (T / Tab)
              if (inp.lockToggle && simClock >= (lockToggleCooldownRef.current.get(slot) ?? 0)) {
                lockToggleCooldownRef.current.set(slot, simClock + 0.3);
                const curLocked = lockedTargetMapRef.current.get(slot);
                if (curLocked) {
                  lockedTargetMapRef.current.set(slot, null);
                } else if (activeCamForSlot?.camera?.lockOnEnabled !== false) {
                  let bestId: number | null = null;
                  let bestD = lockRange;
                  for (const en of currentList) {
                    if (!en.active || en.health?.team !== 'enemy' || (en.health?.currentHp ?? 0) <= 0) continue;
                    const d = Math.hypot(en.position.x - e.position.x, en.position.z - e.position.z);
                    if (d < bestD) {
                      bestD = d;
                      bestId = en.id;
                    }
                  }
                  lockedTargetMapRef.current.set(slot, bestId);
                }
              }

              // Verifica se o alvo travado morreu ou saiu de perto -> desbloqueia mira automaticamente!
              const curLockedId = lockedTargetMapRef.current.get(slot) ?? null;
              let lockedEnt: EngineEntity | null = null;
              if (curLockedId !== null) {
                const candidate = currentList.find((item) => item.id === curLockedId && item.active && (item.health?.currentHp ?? 0) > 0);
                if (!candidate) {
                  lockedTargetMapRef.current.set(slot, null);
                } else {
                  const dLock = Math.hypot(candidate.position.x - e.position.x, candidate.position.z - e.position.z);
                  if (dLock > lockRange + 1.5) {
                    lockedTargetMapRef.current.set(slot, null);
                  } else {
                    lockedEnt = candidate;
                  }
                }
              }

              const activeMove = combatMoveMapRef.current.get(e.id);
              const isRolling = activeMove && activeMove.move === 'roll' && simClock < activeMove.endsAt;

              if (!isRolling) {
                if (Math.abs(inp.h) > 0.05 || Math.abs(inp.v) > 0.05) {
                  let moveX = inp.h;
                  let moveZ = -inp.v;
                  if (isGtaCam) {
                    const camYaw = camYawMapRef.current.get(slot) ?? THREE.MathUtils.degToRad(e.rotation.y);
                    // Forward = (sin(yaw), cos(yaw)), Right = (-cos(yaw), sin(yaw))
                    const fwdX = Math.sin(camYaw);
                    const fwdZ = Math.cos(camYaw);
                    const rightX = -Math.cos(camYaw);
                    const rightZ = Math.sin(camYaw);
                    moveX = fwdX * inp.v + rightX * inp.h;
                    moveZ = fwdZ * inp.v + rightZ * inp.h;
                  }
                  const mag = Math.max(1, Math.hypot(moveX, moveZ));
                  const nx = moveX / mag;
                  const nz = moveZ / mag;
                  e.position.x += nx * e.script.params.moveSpeed * dt;
                  e.position.z += nz * e.script.params.moveSpeed * dt;
                  e.rotation.y = Math.atan2(nx, nz) * (180 / Math.PI);
                  e.animator.paramSpeed = e.script.params.moveSpeed;
                  if (e.animator.paramGrounded && simClock > attackUntil) e.animator.currentState = 'Walk';
                } else {
                  e.animator.paramSpeed = 0;
                  if (e.animator.paramGrounded && simClock > attackUntil) e.animator.currentState = 'Idle';
                  if (lockedEnt && simClock > attackUntil) {
                    const ldx = lockedEnt.position.x - e.position.x;
                    const ldz = lockedEnt.position.z - e.position.z;
                    e.rotation.y = Math.atan2(ldx, ldz) * (180 / Math.PI);
                  }
                }
              }

              if (inp.jump && e.animator.paramGrounded) {
                e.physics.enabled = true;
                e.physics.velocity.y = e.script.params.jumpForce;
                e.animator.paramGrounded = false;
                e.animator.currentState = 'Jump';
              }

              if (inp.roll) {
                triggerCombatMove(e, 'roll', currentList, simClock);
              } else if (inp.capoeira) {
                triggerCombatMove(e, 'capoeira', currentList, simClock);
              } else if (inp.kick) {
                triggerCombatMove(e, 'kick', currentList, simClock);
              } else if (inp.attack) {
                if (e.health?.canShoot) triggerShoot(e, simClock);
                else triggerCombatMove(e, 'punch', currentList, simClock);
              }
            } else if (preset === 'Platformer2D' || preset === 'Shooter2D') {
              const inp = samplePlayerInput(inputFrame, slot);
              if (Math.abs(inp.h) > 0.05) {
                e.position.x += inp.h * e.script.params.moveSpeed * dt;
                if (!e.sprite) e.sprite = {};
                e.sprite.flipX = inp.h < 0;
                e.animator.paramSpeed = e.script.params.moveSpeed;
                if (e.animator.paramGrounded && simClock > attackUntil) e.animator.currentState = 'Walk';
              } else {
                e.animator.paramSpeed = 0;
                if (e.animator.paramGrounded && simClock > attackUntil) e.animator.currentState = 'Idle';
              }
              if (inp.jump && e.animator.paramGrounded) {
                e.physics.enabled = true;
                e.physics.velocity.y = e.script.params.jumpForce;
                e.animator.paramGrounded = false;
                e.animator.currentState = 'Jump';
              }
              if (inp.attack || inp.kick || inp.capoeira) {
                if (preset === 'Shooter2D' || e.health?.canShoot) triggerShoot(e, simClock);
                else triggerMeleeAttack(e, currentList, simClock);
              }
            } else if (
              preset === 'ZombieEnemy' ||
              preset === 'SpiderEnemy' ||
              preset === 'SpinningCanEnemy'
            ) {
              // IA Escalonada + Separação de Multidão + LOD por Distância (elimina lag de múltiplos mobs)
              let ai = mobAiMapRef.current.get(e.id);
              if (!ai) {
                ai = { targetId: null, nextThinkAt: 0, sepX: 0, sepZ: 0, distToNearest: 99 };
                mobAiMapRef.current.set(e.id, ai);
              }

              const shouldThink =
                ((e.id + globalFrameIndex) % aiStride === 0 && simClock >= ai.nextThinkAt) ||
                ai.targetId === null;

              let nearest: EngineEntity | undefined;
              if (shouldThink) {
                ai.nextThinkAt = simClock + (ai.distToNearest > 22 ? 0.25 : 0.08);
                let minD = Infinity;
                for (let pi = 0; pi < livingPlayersPool.length; pi++) {
                  const p = livingPlayersPool[pi];
                  const d = Math.hypot(
                    p.position.x - e.position.x,
                    gizmoCfgRef.current.is2DView ? 0 : p.position.z - e.position.z
                  );
                  if (d < minD) {
                    minD = d;
                    nearest = p;
                  }
                }
                ai.targetId = nearest ? nearest.id : null;
                ai.distToNearest = minD;

                // Separação leve com limite de vizinhos para impedir empilhamento sem custo O(N^2)
                let sx = 0;
                let sz = 0;
                if (minD < 20) {
                  let checked = 0;
                  for (let ei = 0; ei < activeEnemiesPool.length; ei++) {
                    const other = activeEnemiesPool[ei];
                    if (other.id === e.id) continue;
                    const ox = e.position.x - other.position.x;
                    const oz = gizmoCfgRef.current.is2DView ? 0 : e.position.z - other.position.z;
                    const d2 = ox * ox + oz * oz;
                    if (d2 > 0.001 && d2 < 1.35) {
                      const inv = (1.16 - Math.sqrt(d2)) / Math.sqrt(d2);
                      sx += ox * inv;
                      sz += oz * inv;
                      if (++checked >= 4) break;
                    }
                  }
                }
                ai.sepX = sx * 1.45;
                ai.sepZ = sz * 1.45;
              } else if (ai.targetId !== null) {
                for (let pi = 0; pi < livingPlayersPool.length; pi++) {
                  if (livingPlayersPool[pi].id === ai.targetId) {
                    nearest = livingPlayersPool[pi];
                    break;
                  }
                }
              }

              if (nearest) {
                const dx = nearest.position.x - e.position.x;
                const dz = gizmoCfgRef.current.is2DView ? 0 : nearest.position.z - e.position.z;
                const dist = Math.hypot(dx, dz);
                ai.distToNearest = dist;
                const atkRange = e.health?.attackRange ?? 1.25;
                if (dist > atkRange) {
                  const invDist = 1 / Math.max(0.01, dist);
                  const vx = dx * invDist * e.script.params.moveSpeed + ai.sepX;
                  const vz = dz * invDist * e.script.params.moveSpeed + ai.sepZ;
                  e.position.x += vx * dt;
                  e.position.z += vz * dt;
                  if (e.sprite) e.sprite.flipX = dx < 0;
                  if (!gizmoCfgRef.current.is2DView && e.kind !== 'Sprite2D' && preset !== 'SpinningCanEnemy') {
                    e.rotation.y = Math.atan2(dx, dz) * (180 / Math.PI);
                  }
                  if (preset === 'SpiderEnemy' && e.animator.paramGrounded && dist < 5.5 && Math.sin(simClock * 4.5 + e.id) > 0.85) {
                    e.physics.velocity.y = Math.max(4.5, e.script.params.jumpForce || 5.2);
                    e.animator.paramGrounded = false;
                  }
                  if (simClock > attackUntil) e.animator.currentState = 'Walk';
                } else {
                  triggerMeleeAttack(e, currentList, simClock);
                }
              }
              if (preset === 'SpinningCanEnemy') {
                const spinRate = e.script.params.rotateSpeed || 720;
                if (e.kind === 'Sprite2D' || gizmoCfgRef.current.is2DView) {
                  e.rotation.z += spinRate * dt;
                } else {
                  e.rotation.y += spinRate * dt;
                }
              }
            } else if (preset === 'EnemySpawner') {
              // Caixa Nascedora: gera novos inimigos periodicamente enquanto estiver ativa
              if (!spawnerNextAtRef.current.has(e.id)) {
                spawnerNextAtRef.current.set(e.id, simClock + 3.0 + (e.id % 5) * 1.3);
              }
              const nextSpawnAt = spawnerNextAtRef.current.get(e.id)!;
              const interval = Math.max(4.0, e.spawner?.spawnInterval ?? 8.5);
              if (simClock >= nextSpawnAt) {
                spawnerNextAtRef.current.set(e.id, simClock + interval);
                const p1Ref = livingPlayersPool[0];
                const distToPlayer = p1Ref
                  ? Math.hypot(p1Ref.position.x - e.position.x, p1Ref.position.z - e.position.z)
                  : 0;
                const cap = e.spawner?.maxAlive ?? 14;
                if (activeEnemiesPool.length < cap && distToPlayer < 26) {
                  const sid = nextSpawnedIdRef.current++;
                  const modeChoice = e.spawner?.spawnType ?? 'mixed';
                  const pick =
                    modeChoice === 'mixed'
                      ? (['zombie', 'spider', 'spinning_can'] as const)[sid % 3]
                      : modeChoice;
                  const angle = (sid % 6) * 1.05;
                  const sx = Math.max(-28, Math.min(36, e.position.x + Math.cos(angle) * 1.65));
                  const sz = Math.max(-5.0, Math.min(5.2, e.position.z + Math.sin(angle) * 1.65));
                  const spawned: EngineEntity = JSON.parse(JSON.stringify(e));
                  spawned.id = sid;
                  spawned.guid = `spawn_${sid}`;
                  spawned.spawner = undefined;
                  spawned.position = { x: sx, y: pick === 'zombie' ? 0 : 0.45, z: sz };
                  spawned.rotation = { x: 0, y: -90, z: 0 };
                  spawned.physics = {
                    enabled: true,
                    useGravity: true,
                    isStatic: false,
                    restitution: 0.1,
                    velocity: { x: 0, y: 2.2, z: 0 },
                  };
                  if (pick === 'spider') {
                    spawned.name = `Aranha_Nasc_${sid - 9999}`;
                    spawned.kind = 'Mesh3D';
                    spawned.visualArchetype = 'spider';
                    spawned.scale = { x: 1.15, y: 1.15, z: 1.15 };
                    spawned.color = '#4338CA';
                    spawned.health = { enabled: true, maxHp: 50, currentHp: 50, team: 'enemy', attackDamage: 10, attackRange: 1.45, attackCooldown: 0.8 };
                    spawned.script = { ...spawned.script, scriptAssetId: null, mechanicPreset: 'SpiderEnemy', spinSpeedDeg: 0, params: { moveSpeed: 4.2, jumpForce: 5.5, rotateSpeed: 0, amplitude: 1.3 } };
                  } else if (pick === 'spinning_can') {
                    spawned.name = `Lata_Nasc_${sid - 9999}`;
                    spawned.kind = 'Mesh3D';
                    spawned.visualArchetype = 'spinning_can';
                    spawned.scale = { x: 0.95, y: 1.1, z: 0.95 };
                    spawned.color = '#EF4444';
                    spawned.health = { enabled: true, maxHp: 55, currentHp: 55, team: 'enemy', attackDamage: 12, attackRange: 1.35, attackCooldown: 0.7 };
                    spawned.script = { ...spawned.script, scriptAssetId: null, mechanicPreset: 'SpinningCanEnemy', spinSpeedDeg: 740, params: { moveSpeed: 4.7, jumpForce: 0, rotateSpeed: 740, amplitude: 1.2 } };
                  } else {
                    spawned.name = `Zumbi_Nasc_${sid - 9999}`;
                    spawned.kind = 'Rig3D';
                    spawned.visualArchetype = 'default';
                    spawned.scale = { x: 1, y: 1, z: 1 };
                    spawned.color = '#3F6212';
                    spawned.health = { enabled: true, maxHp: 65, currentHp: 65, team: 'enemy', attackDamage: 10, attackRange: 1.45, attackCooldown: 0.95 };
                    spawned.script = { ...spawned.script, scriptAssetId: null, mechanicPreset: 'ZombieEnemy', spinSpeedDeg: 0, params: { moveSpeed: 2.4, jumpForce: 0, rotateSpeed: 0, amplitude: 1.25 } };
                    spawned.animator = { ...spawned.animator, enabled: true, currentState: 'Walk' };
                  }
                  currentList.push(spawned);
                  activeEnemiesPool.push(spawned);
                  hitFlashUntilRef.current.set(e.id, simClock + 0.14);
                }
              }
            } else if (preset === 'Patrol' || preset === 'Hazard') {
              const vx = Math.cos(simClock * e.script.params.moveSpeed) * e.script.params.amplitude * e.script.params.moveSpeed;
              e.position.x += vx * dt;
              if (e.sprite) e.sprite.flipX = vx < 0;
              if (!gizmoCfgRef.current.is2DView && e.kind !== 'Sprite2D') {
                e.rotation.y = vx >= 0 ? 90 : -90;
              }
              e.animator.currentState = 'Walk';
            } else if (preset === 'CollectibleSpin') {
              if (e.kind !== 'Sprite2D') e.rotation.y += e.script.params.rotateSpeed * dt;
              e.position.y += Math.sin(simClock * e.script.params.moveSpeed) * e.script.params.amplitude * dt;
            }
          }

          if (Math.abs(e.script.spinSpeedDeg) > 0.001 && e.script.mechanicPreset !== 'SpinningCanEnemy') {
            if (e.kind === 'Sprite2D') e.rotation.z += e.script.spinSpeedDeg * dt;
            else e.rotation.y += e.script.spinSpeedDeg * dt;
          }

          // 2. Física + Gravidade + Colisão AABB em Plataformas
          if (e.physics.enabled && !e.physics.isStatic) {
            const prevY = e.position.y;
            if (e.physics.useGravity) e.physics.velocity.y -= 17.5 * dt;
            e.position.x += e.physics.velocity.x * dt;
            e.position.y += e.physics.velocity.y * dt;
            e.position.z += e.physics.velocity.z * dt;
            e.physics.velocity.x *= Math.max(0, 1 - 7 * dt);
            e.physics.velocity.z *= Math.max(0, 1 - 7 * dt);

            // Limites amplos para suportar toda a rua 3D (com 7 caixas) e a fase longa 2D
            if (!gizmoCfgRef.current.is2DView) {
              e.position.z = Math.max(-5.2, Math.min(5.6, e.position.z));
              e.position.x = Math.max(-29, Math.min(37, e.position.x));
            } else {
              e.position.x = Math.max(-19, Math.min(55, e.position.x));
            }

            const halfH = getEntityFeetHalfHeight(e);
            const halfW = Math.max(0.32, Math.abs(e.scale.x) * 0.35);
            const halfD = Math.max(0.32, Math.abs(e.scale.z) * 0.35);

            let bestFloor = gizmoCfgRef.current.is2DView ? -20 : 0;

            for (const plat of staticPlatforms) {
              if (plat.id === e.id || plat.visualArchetype === 'house' || plat.visualArchetype === 'spawner_crate') continue;
              const pHalfW = Math.abs(plat.scale.x) * 0.5 + halfW * 0.7;
              const pHalfD = Math.abs(plat.scale.z) * 0.5 + halfD * 0.7;
              const pTop =
                plat.primitive === 'Plane'
                  ? plat.position.y + 0.02
                  : plat.position.y + Math.abs(plat.scale.y) * 0.5;

              const insideX = Math.abs(e.position.x - plat.position.x) <= pHalfW;
              const insideZ = gizmoCfgRef.current.is2DView
                ? true
                : Math.abs(e.position.z - plat.position.z) <= pHalfD;

              const wasAboveOrNear = prevY - halfH >= pTop - 0.38;
              if (insideX && insideZ && wasAboveOrNear && pTop > bestFloor) {
                bestFloor = pTop;
              }
            }

            if (bestFloor <= -19 && !gizmoCfgRef.current.is2DView) bestFloor = 0;

            const targetCenterY = bestFloor + halfH;
            if (e.position.y <= targetCenterY && e.physics.velocity.y <= 0.1) {
              e.position.y = targetCenterY;
              e.animator.paramGrounded = true;
              e.physics.velocity.y =
                e.physics.velocity.y < -1.5 ? -e.physics.velocity.y * e.physics.restitution * 0.35 : 0;
            } else {
              e.animator.paramGrounded = false;
            }

            if (e.position.y < -8) {
              e.position = { ...gameSessionRef.current.spawnPos };
              e.physics.velocity = { x: 0, y: 0, z: 0 };
            }
          }
        }

        // 3. Atualização de Projéteis & Colisão com Inimigos
        for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
          const pr = projectilesRef.current[i];
          pr.ttl -= dt;
          pr.pos.addScaledVector(pr.vel, dt);
          pr.mesh.position.copy(pr.pos);

          let hit = false;
          for (const target of currentList) {
            if (!target.active || target.id === pr.ownerId || !target.health?.enabled) continue;
            if (target.health.team === pr.team) continue;

            const ty = target.position.y + (target.kind === 'Rig3D' ? 0.8 : 0);
            const dist = Math.hypot(
              pr.pos.x - target.position.x,
              pr.pos.y - ty,
              gizmoCfgRef.current.is2DView ? 0 : pr.pos.z - target.position.z
            );
            if (dist < 0.95) {
              target.health.currentHp = Math.max(0, target.health.currentHp - pr.damage);
              hitFlashUntilRef.current.set(target.id, simClock + 0.16);
              target.physics.velocity.x += Math.sign(pr.vel.x) * 3.5;
              gameSessionRef.current.lastHitEnemy = {
                name: target.name,
                hp: target.health.currentHp,
                maxHp: target.health.maxHp,
              };
              if (target.health.currentHp <= 0) {
                target.active = false;
                gameSessionRef.current.koCount += 1;
                gameSessionRef.current.score += 150;
                onScriptLogRef.current(`Alvo abatido: ${target.name} (+150 pts)`);
              }
              hit = true;
              break;
            }
          }

          if (hit || pr.ttl <= 0) {
            scene.remove(pr.mesh);
            projectilesRef.current.splice(i, 1);
          }
        }

        // 4. Coletáveis, Molas, Inimigos sem script AI, Meta e Game Over (usando pools pré-coletados)
        if (playersPool.length > 0 && livingPlayersPool.length === 0 && !gameSessionRef.current.gameOver) {
          gameSessionRef.current.gameOver = true;
          onScriptLogRef.current('Jogadores nocauteados! Clique em Reiniciar para tentar de novo.', 'Warning');
        }

        for (const playerEntity of livingPlayersPool) {
          const px = playerEntity.position.x;
          const py = playerEntity.position.y + (playerEntity.kind === 'Rig3D' ? 0.65 : 0);
          const pz = playerEntity.position.z;

          for (const obj of currentList) {
            if (!obj.active || obj.id === playerEntity.id) continue;
            const dx = px - obj.position.x;
            const dy = py - obj.position.y;
            const dz = gizmoCfgRef.current.is2DView ? 0 : pz - obj.position.z;
            const dist = Math.hypot(dx, dy, dz);

            if (obj.script.mechanicPreset === 'CollectibleSpin' && dist < 1.2) {
              obj.active = false;
              gameSessionRef.current.coinsCollected += 1;
              gameSessionRef.current.score += 100;
              if (playerEntity.health) {
                playerEntity.health.currentHp = Math.min(
                  playerEntity.health.maxHp,
                  playerEntity.health.currentHp + 30
                );
              }
              onScriptLogRef.current(`Item coletado: ${obj.name} (+30 HP / +100 pts)`);
            } else if (obj.script.mechanicPreset === 'JumpPad') {
              const horiz = Math.hypot(dx, dz);
              if (horiz < Math.max(0.85, obj.scale.x * 0.55) && Math.abs(dy) < 1.15) {
                playerEntity.physics.enabled = true;
                playerEntity.physics.velocity.y = Math.max(10.0, obj.script.params.jumpForce);
                playerEntity.animator.paramGrounded = false;
                playerEntity.animator.currentState = 'Jump';
              }
            } else if (
              (obj.script.mechanicPreset === 'Hazard' ||
                (obj.script.mechanicPreset === 'Patrol' && obj.health?.team === 'enemy')) &&
              dist < 1.15
            ) {
              if (playerEntity.physics.velocity.y < -0.8 && py > obj.position.y + 0.35) {
                obj.active = false;
                playerEntity.physics.velocity.y = 7.2;
                gameSessionRef.current.koCount += 1;
                gameSessionRef.current.score += 150;
              } else {
                const inv = invulnUntilRef.current.get(playerEntity.id) ?? 0;
                if (simClock > inv && playerEntity.health) {
                  invulnUntilRef.current.set(playerEntity.id, simClock + 0.9);
                  const dmg = obj.health?.attackDamage ?? 15;
                  playerEntity.health.currentHp = Math.max(0, playerEntity.health.currentHp - dmg);
                  hitFlashUntilRef.current.set(playerEntity.id, simClock + 0.2);
                  playerEntity.physics.velocity.y = 4.2;
                  playerEntity.physics.velocity.x = dx >= 0 ? 4.5 : -4.5;
                }
              }
            } else if (obj.script.mechanicPreset === 'Goal' && dist < 1.35 && !gameSessionRef.current.won) {
              gameSessionRef.current.won = true;
              onScriptLogRef.current('Objetivo alcançado! Fase concluída!');
            }
          }
        }

        // Objetivo: se houver caixas nascedoras, vence ao quebrar todas elas (ex: 7/7); caso contrário vence ao limpar os inimigos
        if (spawnersPool.length > 0) {
          let aliveSp = 0;
          for (let i = 0; i < spawnersPool.length; i++) {
            const s = spawnersPool[i];
            if (s.active && (s.health?.currentHp ?? 0) > 0) aliveSp++;
          }
          if (aliveSp === 0 && !gameSessionRef.current.won) {
            gameSessionRef.current.won = true;
            onScriptLogRef.current('Todas as Caixas Nascedoras foram destruídas! Vitória!');
          }
        } else {
          let totalE = 0;
          let aliveE = 0;
          for (let i = 0; i < currentList.length; i++) {
            const en = currentList[i];
            if (en.health?.team === 'enemy') {
              totalE++;
              if (en.active && (en.health?.currentHp ?? 0) > 0) aliveE++;
            }
          }
          if (totalE > 0 && aliveE === 0 && !gameSessionRef.current.won) {
            gameSessionRef.current.won = true;
            onScriptLogRef.current('Todos os inimigos derrotados! Vitória!');
          }
        }
      }

      // Desativa OrbitControls durante Play Mode com câmera seguindo para não brigar com o mouse
      orbit.enabled = !(playing && followCamRef.current) && !isDraggingGizmo;

      // 5. Atualiza Câmeras da Cena (GTA Chase Estável + Anti-Clip + Soft Lock-On + Shake)
      camShakeRef.current = Math.max(0, camShakeRef.current - dt * 1.4);
      const mouseDx = mouseStateRef.current.deltaX;
      const mouseDy = mouseStateRef.current.deltaY;
      mouseStateRef.current.deltaX = 0;
      mouseStateRef.current.deltaY = 0;

      for (const camEnt of currentList) {
        if (camEnt.kind !== 'Camera' || !camEnt.camera) continue;
        const cfg = camEnt.camera;
        const cSlot = cfg.playerSlot === 2 ? 2 : 1;

        const target = cfg.followTargetName
          ? currentList.find((t) => t.name === cfg.followTargetName && t.active)
          : undefined;
        const lockedId = lockedTargetMapRef.current.get(cSlot) ?? null;
        const lockedTarget =
          lockedId !== null ? currentList.find((t) => t.id === lockedId && t.active) : undefined;

        if (playing && followCamRef.current && target) {
          if (cfg.gtaChase && !gizmoCfgRef.current.is2DView) {
            if (!camYawMapRef.current.has(cSlot)) {
              camYawMapRef.current.set(cSlot, THREE.MathUtils.degToRad(target.rotation.y));
              camPitchMapRef.current.set(cSlot, 0.22);
            }
            let camYaw = camYawMapRef.current.get(cSlot)!;
            let camPitch = camPitchMapRef.current.get(cSlot) ?? 0.22;

            // Mouse drag ou analógico direito gira câmera suavemente sem travar
            if (cSlot === 1 && (Math.abs(mouseDx) > 0.2 || Math.abs(mouseDy) > 0.2)) {
              camYaw -= mouseDx * 0.0065;
              camPitch = THREE.MathUtils.clamp(camPitch + mouseDy * 0.004, -0.05, 0.58);
            }
            const padLookX = gamepads[cSlot - 1]?.lookX ?? 0;
            const padLookY = gamepads[cSlot - 1]?.lookY ?? 0;
            if (Math.abs(padLookX) > 0.08) camYaw -= padLookX * dt * 2.4;
            if (Math.abs(padLookY) > 0.08) {
              camPitch = THREE.MathUtils.clamp(camPitch - padLookY * dt * 1.4, -0.05, 0.58);
            }

            if (lockedTarget && cfg.lockOnEnabled !== false) {
              const targetAngle = Math.atan2(
                lockedTarget.position.x - target.position.x,
                lockedTarget.position.z - target.position.z
              );
              const diff = Math.atan2(Math.sin(targetAngle - camYaw), Math.cos(targetAngle - camYaw));
              camYaw += diff * (1 - Math.exp(-6.0 * dt));
            } else {
              // Alinha suavemente APENAS quando o jogador corre para frente (nunca gira 180° ao andar para trás com S!)
              const inpCheck = samplePlayerInput(inputFrame, cSlot);
              if (inpCheck.v > 0.15 && target.animator.paramSpeed > 0.2) {
                const targetYaw = THREE.MathUtils.degToRad(target.rotation.y);
                const diff = Math.atan2(Math.sin(targetYaw - camYaw), Math.cos(targetYaw - camYaw));
                camYaw += diff * (1 - Math.exp(-1.5 * dt));
              }
            }
            camYawMapRef.current.set(cSlot, camYaw);
            camPitchMapRef.current.set(cSlot, camPitch);

            const distBack = Math.abs(cfg.followOffset.z || 5.8);
            const horizDist = distBack * Math.cos(camPitch);
            const heightUp = (cfg.followOffset.y || 2.5) + distBack * Math.sin(camPitch) * 0.55;

            let desiredX = target.position.x - Math.sin(camYaw) * horizDist;
            let desiredZ = target.position.z - Math.cos(camYaw) * horizDist;
            let desiredY = target.position.y + heightUp;

            // Impede a câmera de entrar dentro das casas da rua ou afundar no asfalto
            if (desiredZ < -6.8) {
              desiredY += (-6.8 - desiredZ) * 0.35;
              desiredZ = -6.8;
            } else if (desiredZ > 7.1) {
              desiredY += (desiredZ - 7.1) * 0.35;
              desiredZ = 7.1;
            }
            desiredX = Math.max(-31, Math.min(39, desiredX));
            desiredY = Math.max(target.position.y + 1.35, desiredY);

            const posAlpha = 1 - Math.exp(-Math.max(3, cfg.smoothSpeed) * dt);
            camEnt.position.x += (desiredX - camEnt.position.x) * posAlpha;
            camEnt.position.y += (desiredY - camEnt.position.y) * posAlpha;
            camEnt.position.z += (desiredZ - camEnt.position.z) * posAlpha;
          } else {
            const desiredX = target.position.x + cfg.followOffset.x;
            const desiredY = target.position.y + cfg.followOffset.y;
            const desiredZ = target.position.z + cfg.followOffset.z;
            const posAlpha = 1 - Math.exp(-Math.max(3, cfg.smoothSpeed) * dt);
            camEnt.position.x += (desiredX - camEnt.position.x) * posAlpha;
            camEnt.position.y += (desiredY - camEnt.position.y) * posAlpha;
            camEnt.position.z += (desiredZ - camEnt.position.z) * posAlpha;
          }
        }

        let camEntry = entityCamMap.get(camEnt.id);
        if (!camEntry) {
          camEntry = {
            persp: new THREE.PerspectiveCamera(cfg.fov, 16 / 9, cfg.nearClip, cfg.farClip),
            ortho: new THREE.OrthographicCamera(-5, 5, 5, -5, cfg.nearClip, cfg.farClip),
            smoothPos: new THREE.Vector3(camEnt.position.x, camEnt.position.y, camEnt.position.z),
            init: true,
          };
          entityCamMap.set(camEnt.id, camEntry);
        }

        const camObj = cfg.projection === 'Orthographic' ? camEntry.ortho : camEntry.persp;
        const shakeX = playing && camShakeRef.current > 0.01 ? (Math.random() - 0.5) * camShakeRef.current : 0;
        const shakeY = playing && camShakeRef.current > 0.01 ? (Math.random() - 0.5) * camShakeRef.current : 0;
        camObj.position.set(camEnt.position.x + shakeX, camEnt.position.y + shakeY, camEnt.position.z);
        camObj.near = Math.max(0.05, cfg.nearClip);
        camObj.far = Math.max(camObj.near + 1, cfg.farClip);

        if (target) {
          let goalLookX = target.position.x;
          let goalLookY = target.position.y + 1.2;
          let goalLookZ = target.position.z;
          if (playing && cfg.gtaChase && lockedTarget && cfg.lockOnEnabled !== false) {
            goalLookX = target.position.x * 0.62 + lockedTarget.position.x * 0.38;
            goalLookY = target.position.y * 0.62 + lockedTarget.position.y * 0.38 + 1.0;
            goalLookZ = target.position.z * 0.62 + lockedTarget.position.z * 0.38;
          }
          let sLook = smoothLookMapRef.current.get(camEnt.id);
          if (!sLook) {
            sLook = new THREE.Vector3(goalLookX, goalLookY, goalLookZ);
            smoothLookMapRef.current.set(camEnt.id, sLook);
          } else {
            const lookAlpha = 1 - Math.exp(-14 * dt);
            sLook.x += (goalLookX - sLook.x) * lookAlpha;
            sLook.y += (goalLookY - sLook.y) * lookAlpha;
            sLook.z += (goalLookZ - sLook.z) * lookAlpha;
          }
          camObj.lookAt(sLook);
        } else {
          camObj.rotation.set(
            THREE.MathUtils.degToRad(camEnt.rotation.x),
            THREE.MathUtils.degToRad(camEnt.rotation.y),
            THREE.MathUtils.degToRad(camEnt.rotation.z)
          );
        }
      }

      // Mantém luz principal de sombra acompanhando o jogador na rua
      const p1LightFollow = currentList.find((item) => isPlayerLike(item) && (item.playerSlot ?? 1) === 1);
      if (p1LightFollow) {
        keyLight.position.set(
          p1LightFollow.position.x + lightRef.current.lightDir.x * 16,
          lightRef.current.lightDir.y * 18,
          lightRef.current.lightDir.z * 16
        );
        keyLight.target.position.set(p1LightFollow.position.x, 0, 0);
        keyLight.target.updateMatrixWorld();
      }

      // Atualiza Retículo 3D animado sobre o mob ou caixa travada pelo P1
      const p1LockedId = lockedTargetMapRef.current.get(1) ?? null;
      const p1LockedEnt =
        playing && p1LockedId !== null
          ? currentList.find((t) => t.id === p1LockedId && t.active)
          : undefined;
      if (p1LockedEnt) {
        lockRingGroup.visible = true;
        lockRingGroup.position.set(p1LockedEnt.position.x, p1LockedEnt.position.y + 0.14, p1LockedEnt.position.z);
        lockOuterRing.rotation.z = totalClock * 3.5;
        lockInnerRing.rotation.z = -totalClock * 5.0;
        const pulse = 1 + Math.sin(totalClock * 8) * 0.08;
        lockRingGroup.scale.set(pulse, 1, pulse);
      } else {
        lockRingGroup.visible = false;
      }

      // 6. Sincronização de Malhas / Rigs / Sprites / Câmeras na Scene Three.js
      const seen = new Set<number>();
      let targetToAttach: THREE.Object3D | null = null;
      let selectedEntityRoot: THREE.Object3D | null = null;

      for (const e of currentList) {
        seen.add(e.id);
        let rec = recordMap.get(e.id);
        const wantZombieRig =
          (e.kind === 'Rig3D' || e.kind === 'Rig2D') &&
          (e.script.mechanicPreset === 'ZombieEnemy' || e.health?.team === 'enemy');

        if (
          !rec ||
          rec.kind !== e.kind ||
          rec.primitive !== e.primitive ||
          rec.visualArchetype !== e.visualArchetype ||
          rec.isZombieRig !== wantZombieRig ||
          rec.modelAssetId !== e.modelAssetId
        ) {
          if (rec) {
            scene.remove(rec.root);
            if (rec.skeletonHelper) scene.remove(rec.skeletonHelper);
          }

          if (e.kind === 'Rig3D' || e.kind === 'Rig2D') {
            const isBoss = Math.abs(e.scale.x) >= 1.22 || /chefe|boss/i.test(e.name);
            const humanoid = buildHumanoidVisual(e.id, {
              is2D: e.kind === 'Rig2D',
              color: e.color,
              isZombie: wantZombieRig,
              isBoss,
              playerSlot: e.playerSlot === 2 ? 2 : 1,
            });
            scene.add(humanoid.root);
            rec = {
              kind: e.kind,
              primitive: e.primitive,
              visualArchetype: e.visualArchetype,
              isZombieRig: wantZombieRig,
              root: humanoid.root,
              humanoid,
              bonesMap: humanoid.bonesMap,
            };
          } else if (e.kind === 'Sprite2D') {
            const spriteMat = new THREE.MeshBasicMaterial({
              color: e.color,
              transparent: true,
              alphaTest: 0.08,
              side: THREE.DoubleSide,
            });
            const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spriteMat);
            quad.userData.entityId = e.id;
            scene.add(quad);
            rec = { kind: e.kind, primitive: e.primitive, visualArchetype: e.visualArchetype, root: quad };
          } else if (e.kind === 'Camera') {
            const camGrp = buildCameraGizmoVisual(e.id, e.color || '#38BDF8');
            scene.add(camGrp);
            rec = { kind: e.kind, primitive: e.primitive, visualArchetype: e.visualArchetype, root: camGrp };
          } else if (e.kind === 'PointLight') {
            const grp = new THREE.Group();
            grp.userData.entityId = e.id;
            const bulb = new THREE.Mesh(
              new THREE.SphereGeometry(0.22, 12, 10),
              new THREE.MeshBasicMaterial({ color: e.color })
            );
            bulb.userData.entityId = e.id;
            const pt = new THREE.PointLight(e.color, 3.5, 24);
            grp.add(bulb, pt);
            scene.add(grp);
            rec = { kind: e.kind, primitive: e.primitive, visualArchetype: e.visualArchetype, root: grp, light: pt };
          } else if (e.visualArchetype === 'spawner_crate') {
            const crate = buildSpawnerCrateVisual(e.id, e.color);
            scene.add(crate.root);
            rec = {
              kind: e.kind,
              primitive: e.primitive,
              visualArchetype: e.visualArchetype,
              root: crate.root,
              spawnerCrate: crate,
              spiderMat: crate.crateMat,
            };
          } else if (e.visualArchetype === 'spider') {
            const sp = buildSpiderVisual(e.id, e.color);
            scene.add(sp.root);
            rec = {
              kind: e.kind,
              primitive: e.primitive,
              visualArchetype: e.visualArchetype,
              root: sp.root,
              spiderLegs: sp.legs,
              spiderMat: sp.bodyMat,
            };
          } else if (e.visualArchetype === 'spinning_can') {
            const can = buildSpinningCanVisual(e.id, e.color);
            scene.add(can.root);
            rec = {
              kind: e.kind,
              primitive: e.primitive,
              visualArchetype: e.visualArchetype,
              root: can.root,
              spiderMat: can.bodyMat,
            };
          } else if (e.visualArchetype === 'house') {
            const house = buildHouseVisual(e.id, e.color);
            scene.add(house.root);
            rec = {
              kind: e.kind,
              primitive: e.primitive,
              visualArchetype: e.visualArchetype,
              root: house.root,
              spiderMat: house.wallMat,
            };
          } else if (e.primitive === 'CustomModel' && e.modelAssetId && parsedModelsRef.current[e.modelAssetId]) {
            const parsed = parsedModelsRef.current[e.modelAssetId];
            const { root: modelRoot, bonesMap } = cloneParsedModel(parsed);
            modelRoot.userData.entityId = e.id;
            modelRoot.traverse((child) => {
              child.userData.entityId = e.id;
            });
            scene.add(modelRoot);

            let skeletonHelper: THREE.SkeletonHelper | undefined;
            if (parsed.bones.length > 0) {
              skeletonHelper = new THREE.SkeletonHelper(modelRoot);
              skeletonHelper.visible = e.showSkeletonHelper;
              scene.add(skeletonHelper);
            }

            const mixer = parsed.clips.length > 0 ? new THREE.AnimationMixer(modelRoot) : undefined;
            rec = {
              kind: e.kind,
              primitive: e.primitive,
              visualArchetype: e.visualArchetype,
              modelAssetId: e.modelAssetId,
              root: modelRoot,
              bonesMap,
              mixer,
              activeClipName: null,
              skeletonHelper,
            };
          } else {
            const mesh = new THREE.Mesh(
              createPrimitiveGeometry(e.primitive),
              new THREE.MeshStandardMaterial({ color: e.color, metalness: e.metallic, roughness: e.roughness })
            );
            mesh.userData.entityId = e.id;
            scene.add(mesh);
            rec = { kind: e.kind, primitive: e.primitive, visualArchetype: e.visualArchetype, root: mesh };
          }
          recordMap.set(e.id, rec);
        }

        const root = rec.root;
        root.visible = e.kind === 'Camera' ? !playStateRef.current.isPlaying && e.active : e.active;
        if (rec.skeletonHelper) rec.skeletonHelper.visible = e.active && e.showSkeletonHelper;

        const clipDur = Math.max(0.2, e.animator.clipDuration);
        const animTime = playing ? (simClock % clipDur) : playStateRef.current.clipScrubTime;
        const shouldEvalKeyframes =
          e.animator.useKeyframes &&
          e.animator.keyframes.length > 0 &&
          (playing || playStateRef.current.clipPreviewPlaying || e.id === selectedRef.current);

        if (!isDraggingGizmo || e.id !== selectedRef.current || e.selectedBone) {
          let px = e.position.x, py = e.position.y, pz = e.position.z;
          let rx = e.rotation.x, ry = e.rotation.y, rz = e.rotation.z;
          let sx = e.scale.x, sy = e.scale.y, sz = e.scale.z;

          if (shouldEvalKeyframes) {
            px = sampleTrackValue(e.animator.keyframes, '__root__', 'position', 'x', animTime) ?? px;
            py = sampleTrackValue(e.animator.keyframes, '__root__', 'position', 'y', animTime) ?? py;
            pz = sampleTrackValue(e.animator.keyframes, '__root__', 'position', 'z', animTime) ?? pz;
            rx = sampleTrackValue(e.animator.keyframes, '__root__', 'rotation', 'x', animTime) ?? rx;
            ry = sampleTrackValue(e.animator.keyframes, '__root__', 'rotation', 'y', animTime) ?? ry;
            rz = sampleTrackValue(e.animator.keyframes, '__root__', 'rotation', 'z', animTime) ?? rz;
            sx = sampleTrackValue(e.animator.keyframes, '__root__', 'scale', 'x', animTime) ?? sx;
            sy = sampleTrackValue(e.animator.keyframes, '__root__', 'scale', 'y', animTime) ?? sy;
            sz = sampleTrackValue(e.animator.keyframes, '__root__', 'scale', 'z', animTime) ?? sz;
          }

          // Rotação acrobática durante Capoeira 360° ou Rolamento de esquiva
          const activeMove = playing ? combatMoveMapRef.current.get(e.id) : undefined;
          if (activeMove && simClock < activeMove.endsAt) {
            const mp = (simClock - activeMove.startedAt) / Math.max(0.05, activeMove.endsAt - activeMove.startedAt);
            if (activeMove.move === 'capoeira') {
              ry = activeMove.baseRotY + mp * 360;
              py += Math.sin(mp * Math.PI) * 0.45;
            } else if (activeMove.move === 'roll') {
              rx = mp * 360;
              py += Math.sin(mp * Math.PI) * 0.28;
            }
          }

          root.position.set(px, py, pz);
          root.rotation.set(
            THREE.MathUtils.degToRad(rx),
            THREE.MathUtils.degToRad(ry),
            THREE.MathUtils.degToRad(rz)
          );
          root.scale.set(sx, sy, sz);
        }

        const isFlashing = playing && simClock < (hitFlashUntilRef.current.get(e.id) ?? 0);

        if (e.kind === 'Sprite2D') {
          const mat = (root as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.color.set(isFlashing ? '#EF4444' : e.color);
          const nextSpriteTex = getSpriteTextureForEntity(e, playing ? simClock : totalClock);
          if (mat.map !== nextSpriteTex) {
            mat.map = nextSpriteTex;
            mat.needsUpdate = true;
          }
          mat.wireframe = e.wireframe || wireRef.current;
          if (e.sprite?.billboard) {
            root.lookAt(editorCamera.position.x, root.position.y, editorCamera.position.z);
          }
        } else if (e.kind !== 'Camera') {
          const tex = getTextureForEntity(e);

          if (rec.mixer && e.modelAssetId && parsedModelsRef.current[e.modelAssetId]) {
            const parsed = parsedModelsRef.current[e.modelAssetId];
            if (e.activeBlenderClip && !e.animator.useKeyframes) {
              const clip = parsed.clips.find((c) => c.name === e.activeBlenderClip);
              if (clip) {
                if (rec.activeClipName !== clip.name) {
                  rec.mixer.stopAllAction();
                  const action = rec.mixer.clipAction(clip);
                  action.setLoop(e.blenderClipLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
                  action.play();
                  rec.activeClipName = clip.name;
                }
                if (playing) {
                  rec.mixer.update(dt * e.blenderClipSpeed);
                } else {
                  rec.mixer.setTime(playStateRef.current.clipScrubTime * e.blenderClipSpeed);
                }
              }
            } else if (rec.activeClipName) {
              rec.mixer.stopAllAction();
              rec.activeClipName = null;
            }
          }

          if (rec.humanoid) {
            rec.humanoid.bodyMat.color.set(isFlashing ? '#FCA5A5' : e.color);
            rec.humanoid.bodyMat.emissive.set(isFlashing ? '#DC2626' : '#000000');
            rec.humanoid.bodyMat.emissiveIntensity = isFlashing ? 0.65 : 0;
            if (rec.humanoid.bodyMat.map !== tex) {
              rec.humanoid.bodyMat.map = tex;
              rec.humanoid.bodyMat.needsUpdate = true;
            }
            rec.humanoid.bodyMat.metalness = e.metallic;
            rec.humanoid.bodyMat.roughness = e.roughness;
            rec.humanoid.bodyMat.wireframe = e.wireframe || wireRef.current;

            rec.humanoid.shadowDisc.position.y = -e.position.y + 0.02;
            (rec.humanoid.shadowDisc.material as THREE.MeshBasicMaterial).opacity = Math.max(
              0.15,
              0.72 - e.position.y * 0.22
            );

            // LOD de animação: mobs distantes (>26m) atualizam ossos a 1/3 da frequência
            const aiDist = playing ? mobAiMapRef.current.get(e.id)?.distToNearest ?? 0 : 0;
            const skipBoneUpdate =
              playing &&
              !isPlayerLike(e) &&
              aiDist > 26 &&
              (globalFrameIndex + e.id) % 3 !== 0;

            if (!skipBoneUpdate) {
              const isZomb = e.script.mechanicPreset === 'ZombieEnemy' || e.health?.team === 'enemy';
              const activeMove = playing ? combatMoveMapRef.current.get(e.id) : undefined;
              let pose: HumanoidPose;
              if (activeMove && simClock < activeMove.endsAt) {
                pose = evaluateRealisticHumanoidPose({
                  state: 'Attack',
                  move: activeMove.move,
                  moveProgress:
                    (simClock - activeMove.startedAt) / Math.max(0.05, activeMove.endsAt - activeMove.startedAt),
                  comboIndex: activeMove.comboIdx,
                  time: animTime,
                  isZombie: isZomb,
                });
              } else if (
                e.animator.enabled &&
                !e.animator.useKeyframes &&
                (playing || playStateRef.current.clipPreviewPlaying)
              ) {
                pose = evaluateRealisticHumanoidPose({
                  state: e.animator.currentState,
                  time: playing ? simClock + e.id * 0.37 : animTime,
                  isZombie: isZomb,
                });
              } else {
                poseScratch.hipsPosY = 0.9;
                poseScratch.hipsRot.x = 0;
                poseScratch.hipsRot.y = 0;
                poseScratch.hipsRot.z = 0;
                poseScratch.spine.x = e.rigPose.spine.x;
                poseScratch.spine.y = e.rigPose.spine.y;
                poseScratch.spine.z = e.rigPose.spine.z;
                poseScratch.head.x = e.rigPose.head.x;
                poseScratch.head.y = e.rigPose.head.y;
                poseScratch.head.z = e.rigPose.head.z;
                poseScratch.armL.x = e.rigPose.armL.x;
                poseScratch.armL.y = e.rigPose.armL.y;
                poseScratch.armL.z = e.rigPose.armL.z;
                poseScratch.forearmL.x = -45;
                poseScratch.forearmL.y = 0;
                poseScratch.forearmL.z = 0;
                poseScratch.armR.x = e.rigPose.armR.x;
                poseScratch.armR.y = e.rigPose.armR.y;
                poseScratch.armR.z = e.rigPose.armR.z;
                poseScratch.forearmR.x = -45;
                poseScratch.forearmR.y = 0;
                poseScratch.forearmR.z = 0;
                poseScratch.legL.x = e.rigPose.legL.x;
                poseScratch.legL.y = e.rigPose.legL.y;
                poseScratch.legL.z = e.rigPose.legL.z;
                poseScratch.shinL.x = 10;
                poseScratch.shinL.y = 0;
                poseScratch.shinL.z = 0;
                poseScratch.legR.x = e.rigPose.legR.x;
                poseScratch.legR.y = e.rigPose.legR.y;
                poseScratch.legR.z = e.rigPose.legR.z;
                poseScratch.shinR.x = 10;
                poseScratch.shinR.y = 0;
                poseScratch.shinR.z = 0;
                pose = poseScratch;
              }

              for (const k in poseOverridesScratch) delete poseOverridesScratch[k];
              if (shouldEvalKeyframes || (isDraggingGizmo && e.id === selectedRef.current && e.selectedBone)) {
                const allBoneKeys = [
                  'spine',
                  'head',
                  'armL',
                  'forearmL',
                  'armR',
                  'forearmR',
                  'legL',
                  'shinL',
                  'legR',
                  'shinR',
                ] as const;
                for (const b of allBoneKeys) {
                  if (isDraggingGizmo && e.id === selectedRef.current && e.selectedBone === b) {
                    continue;
                  }
                  if (shouldEvalKeyframes) {
                    const kx = sampleTrackValue(e.animator.keyframes, b, 'rotation', 'x', animTime);
                    const ky = sampleTrackValue(e.animator.keyframes, b, 'rotation', 'y', animTime);
                    const kz = sampleTrackValue(e.animator.keyframes, b, 'rotation', 'z', animTime);
                    if (kx !== null || ky !== null || kz !== null) {
                      poseOverridesScratch[b] = { x: kx ?? pose[b].x, y: ky ?? pose[b].y, z: kz ?? pose[b].z };
                    }
                  }
                }
              }
              applyHumanoidPose(rec.humanoid, pose, poseOverridesScratch);
            }
          } else if (rec.spawnerCrate) {
            rec.spawnerCrate.crateMat.color.set(isFlashing ? '#FCA5A5' : e.color);
            rec.spawnerCrate.crateMat.emissive.set(isFlashing ? '#DC2626' : '#000000');
            rec.spawnerCrate.crateMat.emissiveIntensity = isFlashing ? 0.75 : 0;
            const hpRatio = e.health ? e.health.currentHp / Math.max(1, e.health.maxHp) : 1;
            rec.spawnerCrate.coreGroup.rotation.y = totalClock * (1.8 + (1 - hpRatio) * 3.0);
            rec.spawnerCrate.coreGroup.position.y = 1.46 + Math.sin(totalClock * 3.4 + e.id) * 0.08;
            rec.spawnerCrate.beaconMat.emissiveIntensity = isFlashing ? 2.6 : 0.7 + hpRatio * 0.9;
            if (isFlashing) {
              root.position.x += Math.sin(totalClock * 55) * 0.06;
            }
          } else if (rec.spiderLegs && rec.spiderMat) {
            rec.spiderMat.color.set(isFlashing ? '#FCA5A5' : e.color);
            rec.spiderMat.emissive.set(isFlashing ? '#DC2626' : '#000000');
            rec.spiderMat.emissiveIntensity = isFlashing ? 0.65 : 0;
            const tSp = playing ? simClock * 16 : totalClock * 3;
            rec.spiderLegs.forEach((leg, idx) => {
              leg.rotation.y = Math.sin(tSp + idx * 1.4) * 0.35;
              leg.rotation.z = Math.cos(tSp + idx * 1.4) * 0.16;
            });
          } else if (rec.spiderMat) {
            rec.spiderMat.color.set(isFlashing ? '#FCA5A5' : e.color);
            rec.spiderMat.emissive.set(isFlashing ? '#DC2626' : '#000000');
            rec.spiderMat.emissiveIntensity = isFlashing ? 0.65 : 0;
          } else if (rec.bonesMap && (!e.activeBlenderClip || e.animator.useKeyframes)) {
            rec.bonesMap.forEach((node, boneName) => {
              if (isDraggingGizmo && e.id === selectedRef.current && e.selectedBone === boneName) return;
              const ov = e.boneOverrides[boneName];
              let rx = ov ? ov.rotation.x : THREE.MathUtils.radToDeg(node.rotation.x);
              let ry = ov ? ov.rotation.y : THREE.MathUtils.radToDeg(node.rotation.y);
              let rz = ov ? ov.rotation.z : THREE.MathUtils.radToDeg(node.rotation.z);

              if (shouldEvalKeyframes) {
                rx = sampleTrackValue(e.animator.keyframes, boneName, 'rotation', 'x', animTime) ?? rx;
                ry = sampleTrackValue(e.animator.keyframes, boneName, 'rotation', 'y', animTime) ?? ry;
                rz = sampleTrackValue(e.animator.keyframes, boneName, 'rotation', 'z', animTime) ?? rz;
              }
              if (ov || shouldEvalKeyframes) {
                node.rotation.set(
                  THREE.MathUtils.degToRad(rx),
                  THREE.MathUtils.degToRad(ry),
                  THREE.MathUtils.degToRad(rz)
                );
              }
            });
          }

          if (rec.light) {
            rec.light.color.set(e.color);
          } else if (!rec.humanoid && !rec.spiderMat && !rec.spawnerCrate && e.primitive !== 'CustomModel') {
            root.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                const mat = mesh.material as THREE.MeshStandardMaterial;
                mat.color.set(isFlashing ? '#FCA5A5' : e.color);
                if (mat.map !== tex) {
                  mat.map = tex;
                  mat.needsUpdate = true;
                }
                mat.metalness = e.metallic;
                mat.roughness = e.roughness;
                mat.wireframe = e.wireframe || wireRef.current;
              }
            });
          } else if (rec.spawnerCrate) {
            rec.spawnerCrate.crateMat.wireframe = e.wireframe || wireRef.current;
          }
        }

        if (e.id === selectedRef.current && e.active && !playStateRef.current.isPlaying) {
          selectedEntityRoot = root;
          if (e.selectedBone && rec.bonesMap?.has(e.selectedBone)) {
            const boneObj = rec.bonesMap.get(e.selectedBone)!;
            boneObj.userData.attachedBoneName = e.selectedBone;
            targetToAttach = boneObj;
          } else {
            delete root.userData.attachedBoneName;
            targetToAttach = root;
          }
        }
      }

      recordMap.forEach((rec, id) => {
        if (!seen.has(id)) {
          if (transformGizmo.object === rec.root) transformGizmo.detach();
          scene.remove(rec.root);
          if (rec.skeletonHelper) scene.remove(rec.skeletonHelper);
          recordMap.delete(id);
        }
      });

      if (targetToAttach) {
        if (transformGizmo.object !== targetToAttach) transformGizmo.attach(targetToAttach);
        if (selectedEntityRoot) {
          selectionBox.setFromObject(selectedEntityRoot);
          selectionBox.visible = true;
        }
      } else {
        if (transformGizmo.object) transformGizmo.detach();
        selectionBox.visible = false;
      }

      orbit.update();

      // 7. Renderização Multi-Câmera (Principal / Split-Screen 2P / Monitor PiP)
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      const enabledCams = enabledCamsPool;
      const camP1Ent =
        enabledCams.find((c) => c.camera?.playerSlot === 1 && c.camera?.isMain) ??
        enabledCams.find((c) => c.camera?.playerSlot === 1) ??
        enabledCams[0] ??
        null;
      const camP2Ent =
        enabledCams.find((c) => c.camera?.playerSlot === 2) ??
        enabledCams.find((c) => c.id !== camP1Ent?.id) ??
        null;

      const getThreeCam = (camEnt: EngineEntity, aspect: number): THREE.Camera => {
        const entry = entityCamMap.get(camEnt.id)!;
        const cfg = camEnt.camera!;
        if (cfg.projection === 'Orthographic') {
          const halfH = Math.max(1.5, cfg.orthoSize);
          const halfW = halfH * aspect;
          entry.ortho.left = -halfW;
          entry.ortho.right = halfW;
          entry.ortho.top = halfH;
          entry.ortho.bottom = -halfH;
          entry.ortho.updateProjectionMatrix();
          return entry.ortho;
        }
        entry.persp.fov = cfg.fov;
        entry.persp.aspect = aspect;
        entry.persp.updateProjectionMatrix();
        return entry.persp;
      };

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.clear(true, true, true);

      let activeMainCamName: string | null = null;
      let monitorCamEnt: EngineEntity | null = null;

      if (playStateRef.current.isPlaying && split2PActiveRef.current && camP1Ent) {
        const halfW = Math.floor(w / 2);
        const rightW = w - halfW;
        activeMainCamName = `${camP1Ent.name} | ${camP2Ent?.name ?? 'Cam P2'}`;

        // Pass 1: Metade Esquerda (Jogador 1)
        const c1 = getThreeCam(camP1Ent, halfW / h);
        renderer.setViewport(0, 0, halfW, h);
        renderer.setScissor(0, 0, halfW, h);
        renderer.setScissorTest(true);
        renderer.clear(false, true, false);
        renderer.render(scene, c1);

        // Pass 2: Metade Direita (Jogador 2)
        let c2: THREE.Camera;
        if (camP2Ent) {
          c2 = getThreeCam(camP2Ent, rightW / h);
        } else {
          fallbackC2.position.copy(editorCamera.position);
          fallbackC2.rotation.copy(editorCamera.rotation);
          fallbackC2.aspect = rightW / h;
          fallbackC2.updateProjectionMatrix();
          c2 = fallbackC2;
        }
        renderer.setViewport(halfW, 0, rightW, h);
        renderer.setScissor(halfW, 0, rightW, h);
        renderer.setScissorTest(true);
        renderer.clear(false, true, false);
        renderer.render(scene, c2);
        renderer.setScissorTest(false);
      } else if (playStateRef.current.isPlaying && camP1Ent) {
        activeMainCamName = camP1Ent.name;
        const c1 = getThreeCam(camP1Ent, w / h);
        renderer.setViewport(0, 0, w, h);
        renderer.render(scene, c1);

        monitorCamEnt =
          enabledCams.find((c) => c.id !== camP1Ent.id && c.camera?.showMonitor) ?? null;
      } else {
        editorCamera.aspect = w / h;
        editorCamera.updateProjectionMatrix();
        renderer.setViewport(0, 0, w, h);
        renderer.render(scene, editorCamera);

        monitorCamEnt = enabledCams.find((c) => c.camera?.showMonitor) ?? null;
      }

      // Pass de Monitor PiP ("mostrar monitor")
      if (monitorCamEnt && w > 340 && h > 220) {
        const isMed = monitorCamEnt.camera?.monitorSize === 'medium';
        const mw = isMed ? 280 : 210;
        const mh = isMed ? 158 : 118;
        const mx = w - mw - 14;
        const my = 46;

        const gizmoPrev = gizmoHelper.visible;
        const selPrev = selectionBox.visible;
        const monRec = recordMap.get(monitorCamEnt.id);
        const monVisPrev = monRec ? monRec.root.visible : false;

        gizmoHelper.visible = false;
        selectionBox.visible = false;
        if (monRec) monRec.root.visible = false;

        const mCam = getThreeCam(monitorCamEnt, mw / mh);
        renderer.setViewport(mx, my, mw, mh);
        renderer.setScissor(mx, my, mw, mh);
        renderer.setScissorTest(true);
        renderer.clear(true, true, true);
        renderer.render(scene, mCam);
        renderer.setScissorTest(false);

        gizmoHelper.visible = gizmoPrev;
        selectionBox.visible = selPrev;
        if (monRec) monRec.root.visible = monVisPrev;
      }

      fpsAccumulator += dt;
      frameCounter++;
      if (fpsAccumulator >= 0.25) {
        const renderInfo = renderer.info.render;
        onStatsUpdate({
          fps: Math.round(frameCounter / fpsAccumulator),
          drawCalls: renderInfo.drawCalls ?? renderInfo.calls ?? 0,
          triangles: renderInfo.triangles ?? 0,
          backendLabel: activeBackendLabel,
        });

        const p1 = playersPool.find((item) => (item.playerSlot ?? 1) === 1);
        const p2 = playersPool.find((item) => item.playerSlot === 2);
        let aliveSpawnersCount = 0;
        let nearestSpawnerDist: number | null = null;
        let nearestSpawnerDir: string | null = null;
        let bestD = Infinity;
        let bestS: EngineEntity | null = null;

        for (let i = 0; i < spawnersPool.length; i++) {
          const sp = spawnersPool[i];
          if (sp.active && (sp.health?.currentHp ?? 1) > 0) {
            aliveSpawnersCount++;
            if (p1) {
              const d = Math.hypot(sp.position.x - p1.position.x, sp.position.z - p1.position.z);
              if (d < bestD) {
                bestD = d;
                bestS = sp;
              }
            }
          }
        }
        if (p1 && bestS) {
          nearestSpawnerDist = Math.round(bestD);
          nearestSpawnerDir = bestS.position.x >= p1.position.x ? '→' : '←';
        }

        let aliveEnemiesCount = 0;
        for (let i = 0; i < activeEnemiesPool.length; i++) {
          if ((activeEnemiesPool[i].health?.currentHp ?? 1) > 0) aliveEnemiesCount++;
        }

        setHudState({
          p1Hp: p1?.health?.currentHp ?? 100,
          p1MaxHp: p1?.health?.maxHp ?? 100,
          p2Active: Boolean(p2?.active),
          p2Hp: p2?.health?.currentHp ?? 100,
          p2MaxHp: p2?.health?.maxHp ?? 100,
          enemiesAlive: aliveEnemiesCount,
          enemiesTotal: activeEnemiesPool.length,
          spawnersBroken: spawnersPool.length - aliveSpawnersCount,
          spawnersTotal: spawnersPool.length,
          nearestSpawnerDist,
          nearestSpawnerDir,
          koCount: gameSessionRef.current.koCount,
          coinsCollected: gameSessionRef.current.coinsCollected,
          score: gameSessionRef.current.score,
          elapsed: simClock,
          won: gameSessionRef.current.won,
          gameOver: gameSessionRef.current.gameOver,
          splitScreen: split2PActiveRef.current,
          gamepadCount: gamepads.length,
          lastHitEnemy: gameSessionRef.current.lastHitEnemy,
          lockedTargetName: p1LockedEnt ? p1LockedEnt.name : null,
          lastMoveLabel: gameSessionRef.current.lastMoveLabel,
          monitorCameraName: monitorCamEnt ? monitorCamEnt.name : null,
          activeMainCamName,
        });

        fpsAccumulator = 0;
        frameCounter = 0;
      }

      scheduleNextFrame();
    };

    animFrame = requestAnimationFrame(tick);

    cleanupFn = () => {
      cancelAnimationFrame(animFrame);
      clearTimeout(pacingTimer);
      cancelAnimationFrame(resizeRaf);
      clearProjectiles();
      sharedProjectileGeo.dispose();
      projectileMatCache.forEach((m) => m.dispose());
      projectileMatCache.clear();
      ro.disconnect();
      transformGizmo.dispose();
      orbit.dispose();
      renderer!.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer!.domElement.removeEventListener('pointermove', onPointerMove);
      renderer!.domElement.removeEventListener('pointerup', onPointerUp);
      if (!usingWebGPU) {
        renderer!.domElement.removeEventListener('webglcontextlost', handleLost);
        renderer!.domElement.removeEventListener('webglcontextrestored', handleRestored);
      }
      textureCache.forEach((t) => t.dispose());
      gifCache.forEach((g) => g.tex.dispose());
      defaultSpriteTex.dispose();
      envRT?.dispose();
      if (gifHost.parentNode) gifHost.parentNode.removeChild(gifHost);
      renderer!.dispose();
      if (renderer!.domElement.parentNode === container) container.removeChild(renderer!.domElement);
    };
  };

    bootstrapRenderer();

    return () => {
      disposed = true;
      if (cleanupFn) cleanupFn();
    };
  }, []);

  // Handlers do Joystick Analógico Virtual Touchscreen
  const updateTouchStick = (clientX: number, clientY: number) => {
    const el = stickRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = rect.width * 0.38;
    let dx = (clientX - cx) / maxR;
    let dy = (cy - clientY) / maxR;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    touchStateRef.current.axisX = Math.abs(dx) < 0.12 ? 0 : dx;
    touchStateRef.current.axisY = Math.abs(dy) < 0.12 ? 0 : dy;
    touchStateRef.current.lastTouchAt = performance.now();
    setStickVisual({ x: dx * 22, y: -dy * 22 });
  };

  const resetTouchStick = () => {
    touchStateRef.current.axisX = 0;
    touchStateRef.current.axisY = 0;
    setStickVisual({ x: 0, y: 0 });
  };

  const showTouchUi =
    isPlaying &&
    (inputSettings.touchControls === 'always' ||
      (inputSettings.touchControls === 'auto' &&
        (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0))));

  if (contextLost) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0E1117] text-slate-300 p-6 text-center">
        <p className="font-display text-base font-semibold text-white">Viewport WebGL indisponível</p>
        <p className="text-sm text-slate-400 mt-1 max-w-md">
          O contexto WebGL foi suspenso. O código C++17 DirectX 11 segue disponível para compilação nativa.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onContextMenu={(ev) => {
        if (isPlaying) ev.preventDefault();
      }}
      className="relative w-full h-full overflow-hidden bg-[#0E1117] select-none"
    >
      {/* Divisor Central de Tela Dividida 2P (2 Câmeras) */}
      {isPlaying && hudState.splitScreen && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 bg-blue-400/70 z-10" />
          <div className="pointer-events-none absolute top-14 left-3 z-10 rounded bg-black/65 border border-blue-500/40 px-2 py-0.5 text-[11px] font-mono text-blue-200">
            Câmera P1 · Teclado
          </div>
          <div className="pointer-events-none absolute top-14 right-3 z-10 rounded bg-black/65 border border-amber-500/40 px-2 py-0.5 text-[11px] font-mono text-amber-200">
            Câmera P2 · Touch / Setas
          </div>
        </>
      )}

      {/* Moldura do Monitor da Câmera (PiP ao vivo renderizado via Scissor/Viewport WebGL) */}
      {hudState.monitorCameraName && (
        <div
          style={{ right: 14, bottom: 46 }}
          className={`pointer-events-none absolute z-10 rounded-md border border-sky-400/60 shadow-lg ${
            entities.find((e) => e.name === hudState.monitorCameraName)?.camera?.monitorSize === 'medium'
              ? 'w-[280px] h-[158px]'
              : 'w-[210px] h-[118px]'
          }`}
        >
          <div className="absolute top-1 left-1.5 right-1.5 flex items-center justify-between text-[10px] font-mono text-sky-200 bg-black/65 px-1.5 py-0.5 rounded">
            <span className="inline-flex items-center gap-1 truncate">
              <CameraIcon className="w-3 h-3 shrink-0" />
              Monitor: {hudState.monitorCameraName}
            </span>
          </div>
        </div>
      )}

      {/* HUD de Jogo (Vida, Dano, Mira Travada, Câmeras, Controles e Maximizar Tela) */}
      {isPlaying && (
        <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-md bg-black/75 border border-white/10 px-3 py-1.5 text-xs text-slate-100">
            <div className="flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="font-mono text-[11px]">P1</span>
              <div className="w-20 h-2 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, (hudState.p1Hp / Math.max(1, hudState.p1MaxHp)) * 100))}%` }}
                />
              </div>
              <span className="font-mono text-[11px] tabular-nums">{hudState.p1Hp}</span>
            </div>

            {hudState.p2Active && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-600">·</span>
                <span className="font-mono text-[11px] text-amber-300">P2</span>
                <div className="w-20 h-2 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, (hudState.p2Hp / Math.max(1, hudState.p2MaxHp)) * 100))}%` }}
                  />
                </div>
                <span className="font-mono text-[11px] tabular-nums">{hudState.p2Hp}</span>
              </div>
            )}

            {hudState.spawnersTotal > 0 ? (
              <>
                <span className="text-slate-600">·</span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-300 tabular-nums">
                  <PackageOpen className="w-3.5 h-3.5" />
                  Caixas: {hudState.spawnersBroken}/{hudState.spawnersTotal}
                  {hudState.nearestSpawnerDist !== null && hudState.nearestSpawnerDir && (
                    <span className="text-slate-300 ml-1">
                      ({hudState.nearestSpawnerDist}m {hudState.nearestSpawnerDir})
                    </span>
                  )}
                </span>
              </>
            ) : null}
            <span className="text-slate-600">·</span>
            <span className="font-mono text-[11px] tabular-nums">
              Inimigos: {hudState.enemiesAlive}
            </span>
            <span className="text-slate-600">·</span>
            <span className="font-mono text-[11px] tabular-nums">Pts: {hudState.score}</span>
            {hudState.lockedTargetName && (
              <>
                <span className="text-slate-600">·</span>
                <button
                  onClick={() => lockedTargetMapRef.current.set(1, null)}
                  title="Clique ou pressione T/Tab para destravar mira"
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-300 hover:text-amber-200"
                >
                  <Crosshair className="w-3 h-3" /> Mira: {hudState.lockedTargetName}
                </button>
              </>
            )}
            {hudState.lastHitEnemy && (
              <>
                <span className="text-slate-600">·</span>
                <span className="font-mono text-[11px] text-red-300 tabular-nums">
                  {hudState.lastHitEnemy.name}: {hudState.lastHitEnemy.hp}/{hudState.lastHitEnemy.maxHp}
                </span>
              </>
            )}
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5">
            {hudState.gamepadCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/25 border border-emerald-500/40 px-2 py-1 text-[11px] text-emerald-200">
                <Gamepad2 className="w-3.5 h-3.5" /> {hudState.gamepadCount}
              </span>
            )}

            {onUpdateInputSettings && (
              <>
                <button
                  onClick={() =>
                    onUpdateInputSettings({
                      ...inputSettings,
                      touchControls: inputSettings.touchControls === 'always' ? 'off' : 'always',
                    })
                  }
                  title="Alternar botões Touchscreen na tela"
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] border ${
                    inputSettings.touchControls !== 'off'
                      ? 'bg-blue-600/30 border-blue-500/50 text-blue-100'
                      : 'bg-black/60 border-white/10 text-slate-300'
                  }`}
                >
                  <Hand className="w-3.5 h-3.5" /> Touch
                </button>
                <button
                  onClick={() =>
                    onUpdateInputSettings({
                      ...inputSettings,
                      splitScreenCoop: inputSettings.splitScreenCoop === 'always' ? 'auto_touch_keyboard' : 'always',
                    })
                  }
                  title="Forçar ou deixar automático 2P Tela Dividida"
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] border ${
                    hudState.splitScreen || inputSettings.splitScreenCoop === 'always'
                      ? 'bg-amber-600/30 border-amber-500/50 text-amber-100'
                      : 'bg-black/60 border-white/10 text-slate-300'
                  }`}
                >
                  <SplitSquareHorizontal className="w-3.5 h-3.5" /> 2P Split
                </button>
              </>
            )}

            <button
              onClick={() => setFollowCam((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] border ${
                followCam
                  ? 'bg-blue-600/30 border-blue-500/50 text-blue-100'
                  : 'bg-black/60 border-white/10 text-slate-300'
              }`}
            >
              <CameraIcon className="w-3.5 h-3.5" />
              {followCam ? (hudState.activeMainCamName ? hudState.activeMainCamName : 'Seguindo') : 'Livre'}
            </button>

            {onToggleMaximize && (
              <button
                onClick={onToggleMaximize}
                title={isMaximized ? 'Restaurar interface do editor (ESC)' : 'Maximizar câmera na tela inteira'}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium border ${
                  isMaximized
                    ? 'bg-emerald-600/80 border-emerald-400 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 border-blue-400/50 text-white'
                }`}
              >
                {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                {isMaximized ? 'Restaurar Editor' : 'Maximizar Câmera'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Banner de Vitória / Game Over */}
      {isPlaying && (hudState.won || hudState.gameOver) && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center">
          <div
            className={`pointer-events-auto rounded-lg border px-5 py-3 text-center shadow-lg space-y-2 ${
              hudState.won
                ? 'bg-emerald-950/95 border-emerald-400/50'
                : 'bg-red-950/95 border-red-400/50'
            }`}
          >
            <p className="font-display text-sm font-semibold text-white">
              {hudState.won
                ? hudState.spawnersTotal > 0
                  ? `Vitória! Todas as ${hudState.spawnersTotal} Caixas Destruídas!`
                  : 'Vitória! Área Limpa!'
                : 'Fim de Jogo — Jogador Nocauteado'}
            </p>
            <p className="text-xs text-slate-200 font-mono tabular-nums">
              Pontuação: {hudState.score} · Nocautes: {hudState.koCount} · {hudState.elapsed.toFixed(1)}s
            </p>
            {onRestartPlay && (
              <button
                onClick={onRestartPlay}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-white/15 hover:bg-white/25 text-xs font-medium text-white"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reiniciar Fase
              </button>
            )}
          </div>
        </div>
      )}

      {/* CONTROLES TOUCHSCREEN NATIVOS DA ENGINE (Analógico + Soco/Tiro + Chute + Capoeira + Rolamento + Pular) */}
      {showTouchUi && (
        <>
          <div
            ref={stickRef}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
              updateTouchStick(ev.clientX, ev.clientY);
            }}
            onPointerMove={(ev) => {
              if (ev.buttons === 0 && ev.pointerType === 'mouse') return;
              if (touchStateRef.current.lastTouchAt > 0 && ev.pressure >= 0) {
                updateTouchStick(ev.clientX, ev.clientY);
              }
            }}
            onPointerUp={(ev) => {
              ev.stopPropagation();
              resetTouchStick();
            }}
            onPointerCancel={resetTouchStick}
            style={{ touchAction: 'none' }}
            className="absolute bottom-12 left-4 z-20 w-28 h-28 rounded-full bg-black/60 border border-white/20 flex items-center justify-center cursor-pointer"
          >
            <div
              style={{ transform: `translate(${stickVisual.x}px, ${stickVisual.y}px)` }}
              className="w-11 h-11 rounded-full bg-blue-500/80 border border-white/60 shadow-md pointer-events-none"
            />
            <span className="absolute -bottom-5 text-[10px] font-mono text-slate-400 pointer-events-none">
              Mover (Touch)
            </span>
          </div>

          <div
            style={{ touchAction: 'none' }}
            className="absolute bottom-12 right-4 z-20 flex flex-col items-end gap-2"
          >
            {!is2DView && (
              <div className="flex items-center gap-2">
                <button
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    touchStateRef.current.roll = true;
                    touchStateRef.current.lastTouchAt = performance.now();
                  }}
                  onPointerUp={() => {
                    touchStateRef.current.roll = false;
                  }}
                  onPointerLeave={() => {
                    touchStateRef.current.roll = false;
                  }}
                  onPointerCancel={() => {
                    touchStateRef.current.roll = false;
                  }}
                  className="w-12 h-12 rounded-full bg-sky-600/80 active:bg-sky-500 border border-white/40 flex flex-col items-center justify-center text-white shadow-lg text-[9px] font-medium"
                >
                  Rolar
                </button>
                <button
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    touchStateRef.current.capoeira = true;
                    touchStateRef.current.lastTouchAt = performance.now();
                  }}
                  onPointerUp={() => {
                    touchStateRef.current.capoeira = false;
                  }}
                  onPointerLeave={() => {
                    touchStateRef.current.capoeira = false;
                  }}
                  onPointerCancel={() => {
                    touchStateRef.current.capoeira = false;
                  }}
                  className="w-12 h-12 rounded-full bg-purple-600/85 active:bg-purple-500 border border-white/40 flex flex-col items-center justify-center text-white shadow-lg text-[9px] font-medium"
                >
                  Capoeira
                </button>
                <button
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    touchStateRef.current.kick = true;
                    touchStateRef.current.lastTouchAt = performance.now();
                  }}
                  onPointerUp={() => {
                    touchStateRef.current.kick = false;
                  }}
                  onPointerLeave={() => {
                    touchStateRef.current.kick = false;
                  }}
                  onPointerCancel={() => {
                    touchStateRef.current.kick = false;
                  }}
                  className="w-12 h-12 rounded-full bg-amber-600/85 active:bg-amber-500 border border-white/40 flex flex-col items-center justify-center text-white shadow-lg text-[9px] font-medium"
                >
                  Chute
                </button>
              </div>
            )}

            <div className="flex items-end gap-2.5">
              <button
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  touchStateRef.current.attack = true;
                  touchStateRef.current.lastTouchAt = performance.now();
                }}
                onPointerUp={(ev) => {
                  ev.stopPropagation();
                  touchStateRef.current.attack = false;
                }}
                onPointerLeave={() => {
                  touchStateRef.current.attack = false;
                }}
                onPointerCancel={() => {
                  touchStateRef.current.attack = false;
                }}
                className="w-14 h-14 rounded-full bg-red-600/85 active:bg-red-500 border border-white/40 flex flex-col items-center justify-center text-white shadow-lg"
              >
                <Swords className="w-5 h-5" />
                <span className="text-[9px] font-medium">{is2DView ? 'Atirar' : 'Soco'}</span>
              </button>

              <button
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  touchStateRef.current.jump = true;
                  touchStateRef.current.lastTouchAt = performance.now();
                }}
                onPointerUp={(ev) => {
                  ev.stopPropagation();
                  touchStateRef.current.jump = false;
                }}
                onPointerLeave={() => {
                  touchStateRef.current.jump = false;
                }}
                onPointerCancel={() => {
                  touchStateRef.current.jump = false;
                }}
                className="w-14 h-14 rounded-full bg-emerald-600/85 active:bg-emerald-500 border border-white/40 flex flex-col items-center justify-center text-white shadow-lg"
              >
                <ArrowUp className="w-5 h-5" />
                <span className="text-[9px] font-medium">Pular</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Barra discreta inferior de ajuda */}
      <div className="pointer-events-none absolute bottom-2.5 left-3 z-10 inline-flex items-center gap-2 rounded-md bg-black/70 border border-white/10 px-2.5 py-1 text-[11px] text-slate-300">
        <Keyboard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>
          {isPlaying
            ? is2DView
              ? 'A/D Mover · Espaço Pular · F / Clique Atirar · Teclado + Touch ativa 2P Split'
              : 'WASD Mover · F Soco · C/Dir Chute · Q Capoeira · Shift Rolar · T Soltar Mira · Arraste Mouse gira Câmera GTA'
            : 'Arraste .PNG / .GIF / .FBX / .OBJ / .GLB · Clique na Câmera para configurar Monitor'}
        </span>
      </div>
    </div>
  );
};
