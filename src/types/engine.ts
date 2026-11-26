export type MeshPrimitive = 'Cube' | 'Sphere' | 'Plane' | 'Cylinder' | 'Cone' | 'Quad2D' | 'CustomModel';

export type ModelFormat = 'obj' | 'gltf' | 'glb' | 'fbx';

export type EntityKind = 'Mesh3D' | 'Rig3D' | 'Rig2D' | 'Sprite2D' | 'PointLight' | 'Camera';

export type TexturePreset = 'None' | 'Checkerboard' | 'UVGrid' | 'MetalPlate' | 'WoodGrain' | 'Custom';

export type ScriptLanguage = 'None' | 'CSharp_Mono' | 'Kotlin_JNI' | 'Native_CPP';

export type AnimatorStateName = string;

export interface AnimatorStateDef {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  source: 'procedural' | 'clip' | 'library' | 'blender';
  clipId?: string | null;
  libraryPresetId?: string | null;
  blenderClipName?: string | null;
  speed: number;
  loop: boolean;
  isDefault?: boolean;
  description?: string;
}

export type GizmoMode = 'translate' | 'rotate' | 'scale';

export type GizmoSpace = 'world' | 'local';

export type MechanicPreset =
  | 'None'
  | 'PlayerWASD'
  | 'Platformer2D'
  | 'Brawler3D'
  | 'Shooter2D'
  | 'Patrol'
  | 'ZombieEnemy'
  | 'SpiderEnemy'
  | 'SpinningCanEnemy'
  | 'EnemySpawner'
  | 'CollectibleSpin'
  | 'JumpPad'
  | 'Hazard'
  | 'Goal';

export type RHIBackend =
  | 'DirectX 11 (Ativo)'
  | 'WebGPU (Navegador)'
  | 'DirectX 12 (Moderno)'
  | 'Vulkan 1.3'
  | 'DirectX 9 (Legado)'
  | 'OpenGL 3.3 (Legado)';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RigPose {
  spine: Vec3;
  head: Vec3;
  armL: Vec3;
  armR: Vec3;
  legL: Vec3;
  legR: Vec3;
}

export interface BoneTransformOverride {
  position?: Vec3;
  rotation: Vec3;
}

export interface TimelineKeyframe {
  id: string;
  time: number;
  targetName: string; // '__root__' para objeto principal ou nome do osso (ex: 'armL', 'mixamorigSpine')
  property: 'position' | 'rotation' | 'scale';
  axis: 'x' | 'y' | 'z';
  value: number;
  interpolation?: 'linear' | 'smooth' | 'step';
}

export interface AnimationClipData {
  id: string;
  name: string;
  duration: number;
  loop: boolean;
  keyframes: TimelineKeyframe[];
}

export interface AnimatorTransition {
  id: string;
  from: AnimatorStateName;
  to: AnimatorStateName;
  condition: string;
  duration: number;
  hasExitTime?: boolean;
}

export interface ScriptAsset {
  id: string;
  name: string;
  language: Exclude<ScriptLanguage, 'None'>;
  code: string;
  defaultParams: {
    moveSpeed: number;
    jumpForce: number;
    rotateSpeed: number;
    amplitude: number;
  };
}

export interface ImportedModelAsset {
  id: string;
  name: string;
  format: ModelFormat;
  data: string | ArrayBuffer;
  boneNames: string[];
  clipNames: string[];
  clipDurations: Record<string, number>;
}

export interface SpriteConfig {
  sourceUrl?: string;
  isGif?: boolean;
  flipX?: boolean;
  billboard?: boolean;
  fps?: number;
  cols?: number;
  rows?: number;
}

export interface CameraConfig {
  enabled: boolean;
  isMain: boolean;
  playerSlot: 1 | 2;
  projection: 'Perspective' | 'Orthographic';
  fov: number;
  orthoSize: number;
  nearClip: number;
  farClip: number;
  followTargetName: string;
  followOffset: Vec3;
  smoothSpeed: number;
  showMonitor: boolean;
  monitorSize: 'small' | 'medium';
  gtaChase?: boolean;
  lockOnEnabled?: boolean;
  lockOnRange?: number;
}

export interface HealthConfig {
  enabled: boolean;
  maxHp: number;
  currentHp: number;
  team: 'player' | 'enemy' | 'neutral';
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  canShoot?: boolean;
  projectileColor?: string;
  projectileSpeed?: number;
}

export interface EngineInputSettings {
  keyboardEnabled: boolean;
  mouseEnabled: boolean;
  gamepadEnabled: boolean;
  touchControls: 'always' | 'auto' | 'off';
  splitScreenCoop: 'auto_touch_keyboard' | 'always' | 'off';
}

export const DEFAULT_INPUT_SETTINGS: EngineInputSettings = {
  keyboardEnabled: true,
  mouseEnabled: true,
  gamepadEnabled: true,
  touchControls: 'always',
  splitScreenCoop: 'auto_touch_keyboard',
};

export interface EngineEntity {
  id: number;
  guid: string;
  name: string;
  kind: EntityKind;
  active: boolean;
  playerSlot?: 1 | 2;
  visualArchetype?: 'default' | 'spider' | 'spinning_can' | 'house' | 'spawner_crate' | 'drone';
  spawner?: {
    spawnInterval: number;
    maxAlive: number;
    spawnType: 'mixed' | 'zombie' | 'spider' | 'spinning_can';
  };
  primitive: MeshPrimitive;
  modelAssetId?: string;
  blenderClips: string[];
  activeBlenderClip: string | null;
  blenderClipSpeed: number;
  blenderClipLoop: boolean;
  boneNames: string[];
  selectedBone: string | null;
  showSkeletonHelper: boolean;
  boneOverrides: Record<string, BoneTransformOverride>;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  texturePreset: TexturePreset;
  customTextureUrl?: string;
  uvTiling: { x: number; y: number };
  metallic: number;
  roughness: number;
  wireframe: boolean;
  sprite?: SpriteConfig;
  camera?: CameraConfig;
  health?: HealthConfig;
  rigPose: RigPose;
  physics: {
    enabled: boolean;
    useGravity: boolean;
    isStatic: boolean;
    restitution: number;
    velocity: Vec3;
  };
  script: {
    language: ScriptLanguage;
    className: string;
    scriptAssetId: string | null;
    mechanicPreset: MechanicPreset;
    spinSpeedDeg: number;
    params: {
      moveSpeed: number;
      jumpForce: number;
      rotateSpeed: number;
      amplitude: number;
    };
  };
  animator: {
    enabled: boolean;
    useKeyframes: boolean;
    currentState: AnimatorStateName;
    clipDuration: number;
    activeClipId: string | null;
    clips: AnimationClipData[];
    states?: AnimatorStateDef[];
    libraryPresetId?: string | null;
    clipSpeed?: number;
    clipLoop?: boolean;
    paramSpeed: number;
    paramGrounded: boolean;
    triggerAttack: boolean;
    keyframes: TimelineKeyframe[];
  };
  network: {
    replicated: boolean;
    syncRateHz: number;
  };
}

export interface LogEntry {
  id: number;
  timestamp: string;
  level: 'Info' | 'Warning' | 'Error';
  message: string;
}

export const DEFAULT_RIG_POSE: RigPose = {
  spine: { x: 0, y: 0, z: 0 },
  head: { x: 0, y: 0, z: 0 },
  armL: { x: 0, y: 0, z: 10 },
  armR: { x: 0, y: 0, z: -10 },
  legL: { x: 0, y: 0, z: 0 },
  legR: { x: 0, y: 0, z: 0 },
};

export const BUILTIN_RIG_BONES = ['spine', 'head', 'armL', 'armR', 'legL', 'legR'];

export const DEFAULT_ANIMATOR_STATES: AnimatorStateDef[] = [
  {
    id: 'st_idle',
    name: 'Idle',
    x: 170,
    y: 145,
    color: '#3B82F6',
    source: 'procedural',
    speed: 1,
    loop: true,
    isDefault: true,
    description: 'Guarda / respiração · Loop',
  },
  {
    id: 'st_walk',
    name: 'Walk',
    x: 410,
    y: 65,
    color: '#10B981',
    source: 'procedural',
    speed: 1,
    loop: true,
    description: 'Caminhada bípede · Loop',
  },
  {
    id: 'st_run',
    name: 'Run',
    x: 650,
    y: 65,
    color: '#06B6D4',
    source: 'procedural',
    speed: 1,
    loop: true,
    description: 'Corrida inclinada · Loop',
  },
  {
    id: 'st_jump',
    name: 'Jump',
    x: 410,
    y: 235,
    color: '#8B5CF6',
    source: 'procedural',
    speed: 1,
    loop: false,
    description: 'Salto aéreo · Pose',
  },
  {
    id: 'st_attack',
    name: 'Attack',
    x: 170,
    y: 295,
    color: '#F59E0B',
    source: 'procedural',
    speed: 1,
    loop: false,
    description: 'Golpe rápido · One-shot',
  },
];

export const DEFAULT_ANIMATOR_TRANSITIONS: AnimatorTransition[] = [
  { id: 't1', from: 'Idle', to: 'Walk', condition: 'speed > 0.1', duration: 0.18 },
  { id: 't2', from: 'Walk', to: 'Run', condition: 'speed > 3.5', duration: 0.15 },
  { id: 't3', from: 'Run', to: 'Walk', condition: 'speed <= 3.5', duration: 0.15 },
  { id: 't4', from: 'Walk', to: 'Idle', condition: 'speed <= 0.1', duration: 0.20 },
  { id: 't5', from: 'Idle', to: 'Jump', condition: 'isGrounded == false', duration: 0.10 },
  { id: 't6', from: 'Walk', to: 'Jump', condition: 'isGrounded == false', duration: 0.10 },
  { id: 't7', from: 'Jump', to: 'Idle', condition: 'isGrounded == true', duration: 0.15 },
  { id: 't8', from: 'Idle', to: 'Attack', condition: 'triggerAttack', duration: 0.08 },
  { id: 't9', from: 'Attack', to: 'Idle', condition: 'clipNormalized >= 1.0', duration: 0.12, hasExitTime: true },
];

export function generateGuid(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

export type ProjectIconId =
  | 'gamepad'
  | 'sword'
  | 'rocket'
  | 'box'
  | 'ghost'
  | 'car'
  | 'shield'
  | 'sparkles';

export interface KodaProject {
  id: string;
  name: string;
  mode: '3D' | '2D';
  iconId: ProjectIconId;
  iconColor: string;
  customIconUrl?: string;
  updatedAt: string;
  inputSettings?: EngineInputSettings;
  entities: EngineEntity[];
  scripts: ScriptAsset[];
  transitions: AnimatorTransition[];
}
