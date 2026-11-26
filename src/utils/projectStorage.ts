import {
  BUILTIN_RIG_BONES,
  DEFAULT_ANIMATOR_STATES,
  DEFAULT_ANIMATOR_TRANSITIONS,
  DEFAULT_INPUT_SETTINGS,
  DEFAULT_RIG_POSE,
  generateGuid,
  type CameraConfig,
  type EngineEntity,
  type EntityKind,
  type HealthConfig,
  type KodaProject,
  type MechanicPreset,
  type MeshPrimitive,
  type ProjectIconId,
  type SpriteConfig,
  type TexturePreset,
  type TimelineKeyframe,
  type Vec3,
} from '../types/engine';
import { INITIAL_SCRIPTS } from './scriptRuntime';

const STORAGE_KEY_V1 = 'koda_game_dev_projects_v1';
const STORAGE_KEY_V2 = 'koda_game_dev_projects_v2';
const STORAGE_KEY_V3 = 'koda_game_dev_projects_v3';
const STORAGE_KEY_V4 = 'koda_game_dev_projects_v4';
const STORAGE_KEY_V5 = 'koda_game_dev_projects_v5';

export const PROJECT_ICON_OPTIONS: { id: ProjectIconId; label: string; defaultColor: string }[] = [
  { id: 'gamepad', label: 'Controle', defaultColor: '#3B82F6' },
  { id: 'sword', label: 'Ação / Luta', defaultColor: '#EF4444' },
  { id: 'rocket', label: 'Tiro / Espaço', defaultColor: '#8B5CF6' },
  { id: 'box', label: 'Sandbox 3D', defaultColor: '#0EA5E9' },
  { id: 'ghost', label: 'Plataforma', defaultColor: '#EC4899' },
  { id: 'car', label: 'Corrida', defaultColor: '#F59E0B' },
  { id: 'shield', label: 'Sobrevivência', defaultColor: '#10B981' },
  { id: 'sparkles', label: 'Fantasia', defaultColor: '#6366F1' },
];

const svgUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

function renderSpritePng(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  fallbackSvg: string
): string {
  if (typeof document === 'undefined') return svgUri(fallbackSvg);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return svgUri(fallbackSvg);
    ctx.clearRect(0, 0, width, height);
    draw(ctx);
    return canvas.toDataURL('image/png');
  } catch {
    return svgUri(fallbackSvg);
  }
}

export const BUILTIN_SPRITE_HERO = renderSpritePng(
  256,
  64,
  (ctx) => {
    for (let f = 0; f < 4; f++) {
      const ox = f * 64;
      const bob = f % 2 === 1 ? -2 : 0;
      const stride = f === 1 ? 4 : f === 3 ? -4 : 0;
      ctx.save();
      ctx.translate(ox, 0);
      // Capacete / cabeça com contorno nítido
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(14, 5 + bob, 34, 24);
      ctx.fillStyle = '#2563EB';
      ctx.fillRect(16, 7 + bob, 30, 20);
      ctx.fillStyle = '#60A5FA';
      ctx.fillRect(18, 8 + bob, 26, 4);
      // Rosto e viseira/olhos
      ctx.fillStyle = '#FDE68A';
      ctx.fillRect(20, 13 + bob, 22, 12);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(25, 16 + bob, 4, 5);
      ctx.fillRect(35, 16 + bob, 4, 5);
      // Jaqueta azul com cinto dourado
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(13, 28 + bob, 36, 22);
      ctx.fillStyle = '#1D4ED8';
      ctx.fillRect(15, 30 + bob, 32, 18);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(16, 37 + bob, 28, 4);
      // Arma laser frontal
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(41, 29 + bob, 20, 10);
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(43, 31 + bob, 16, 6);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(55, 32 + bob, 5, 4);
      // Pernas animadas
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(17 - stride, 48 + bob, 10, 13);
      ctx.fillRect(34 + stride, 48 + bob, 10, 13);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(17 - stride, 58 + bob, 11, 3);
      ctx.fillRect(34 + stride, 58 + bob, 11, 3);
      ctx.restore();
    }
  },
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="64" viewBox="0 0 256 64"><rect x="16" y="7" width="30" height="42" fill="#2563EB"/></svg>`
);

export const BUILTIN_SPRITE_COIN = renderSpritePng(
  256,
  64,
  (ctx) => {
    const widths = [20, 13, 6, 13];
    for (let f = 0; f < 4; f++) {
      const cx = f * 64 + 32;
      const rx = widths[f];
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.ellipse(cx, 32, rx + 3, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.ellipse(cx, 32, rx, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      if (rx >= 10) {
        ctx.fillStyle = '#FEF9C3';
        ctx.fillRect(cx - 2, 20, 4, 24);
      }
    }
  },
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="64" viewBox="0 0 256 64"><circle cx="32" cy="32" r="22" fill="#F59E0B"/></svg>`
);

export const BUILTIN_SPRITE_SLIME = renderSpritePng(
  128,
  64,
  (ctx) => {
    for (let f = 0; f < 2; f++) {
      const ox = f * 64;
      const bob = f === 1 ? 2 : 0;
      ctx.save();
      ctx.translate(ox, 0);
      // Cabeça Zumbi
      ctx.fillStyle = '#052E16';
      ctx.fillRect(14, 5 + bob, 36, 25);
      ctx.fillStyle = '#4ADE80';
      ctx.fillRect(17, 8 + bob, 30, 19);
      // Olhos vermelhos brilhantes
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(22, 14 + bob, 6, 5);
      ctx.fillRect(36, 14 + bob, 6, 5);
      ctx.fillStyle = '#052E16';
      ctx.fillRect(24, 22 + bob, 16, 3);
      // Corpo
      ctx.fillStyle = '#052E16';
      ctx.fillRect(13, 29 + bob, 38, 22);
      ctx.fillStyle = '#16A34A';
      ctx.fillRect(16, 31 + bob, 32, 18);
      // Braços estendidos
      ctx.fillStyle = '#4ADE80';
      ctx.fillRect(45, 31 + bob - f * 2, 15, 7);
      ctx.fillRect(4, 32 + bob - f * 2, 12, 7);
      // Pernas
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(16 + f * 2, 50, 11, 12);
      ctx.fillRect(36 - f * 2, 50, 11, 12);
      ctx.restore();
    }
  },
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64"><rect x="16" y="7" width="32" height="44" fill="#4ADE80"/></svg>`
);

export const BUILTIN_SPRITE_SPIDER = renderSpritePng(
  128,
  64,
  (ctx) => {
    for (let f = 0; f < 2; f++) {
      const ox = f * 64;
      const lift = f === 1 ? -4 : 0;
      ctx.save();
      ctx.translate(ox, 0);
      ctx.strokeStyle = '#1E1B4B';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      const legs: [number, number, number, number][] = [
        [16, 34, 4, 22 + lift],
        [16, 38, 3, 38 - lift],
        [16, 42, 7, 53 + lift],
        [48, 34, 60, 22 + lift],
        [48, 38, 61, 38 - lift],
        [48, 42, 57, 53 + lift],
      ];
      for (const [x1, y1, x2, y2] of legs) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.ellipse(32, 37, 20, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = f === 0 ? '#312E81' : '#4338CA';
      ctx.beginPath();
      ctx.ellipse(32, 37, 17, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(23, 34, 5, 5);
      ctx.fillRect(36, 34, 5, 5);
      ctx.fillStyle = '#F87171';
      ctx.fillRect(30, 31, 4, 4);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(27, 44, 3, 6);
      ctx.fillRect(34, 44, 3, 6);
      ctx.restore();
    }
  },
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64"><ellipse cx="32" cy="37" rx="18" ry="14" fill="#312E81"/></svg>`
);

export const BUILTIN_SPRITE_CAN = renderSpritePng(
  128,
  64,
  (ctx) => {
    for (let f = 0; f < 2; f++) {
      const ox = f * 64;
      ctx.save();
      ctx.translate(ox, 0);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(14, 9, 36, 46);
      ctx.fillStyle = f === 0 ? '#DC2626' : '#EA580C';
      ctx.fillRect(17, 12, 30, 40);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(15, 10, 34, 6);
      ctx.fillRect(15, 48, 34, 6);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(24, 24, 16, 16);
      ctx.restore();
    }
  },
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64"><rect x="16" y="10" width="32" height="44" fill="#DC2626"/></svg>`
);

export const BUILTIN_SPRITE_BOSS_ZOMBIE = renderSpritePng(
  128,
  64,
  (ctx) => {
    for (let f = 0; f < 2; f++) {
      const ox = f * 64;
      const bob = f === 1 ? 2 : 0;
      ctx.save();
      ctx.translate(ox, 0);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(12, 3 + bob, 40, 26);
      ctx.fillStyle = '#9333EA';
      ctx.fillRect(15, 6 + bob, 34, 20);
      ctx.fillStyle = f === 0 ? '#EF4444' : '#FACC15';
      ctx.fillRect(19, 13 + bob, 26, 6);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(8, 28 + bob, 48, 23);
      ctx.fillStyle = '#6B21A8';
      ctx.fillRect(11, 30 + bob, 42, 19);
      ctx.fillStyle = '#A855F7';
      ctx.fillRect(3, 27 + bob, 9, 17);
      ctx.fillRect(52, 27 + bob, 9, 17);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(15, 50, 14, 12);
      ctx.fillRect(35, 50, 14, 12);
      ctx.restore();
    }
  },
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64"><rect x="10" y="6" width="44" height="50" fill="#9333EA"/></svg>`
);

export const BUILTIN_SPRITE_FLAG = renderSpritePng(
  128,
  64,
  (ctx) => {
    for (let f = 0; f < 2; f++) {
      const ox = f * 64;
      ctx.save();
      ctx.translate(ox, 0);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(14, 6, 5, 54);
      ctx.fillStyle = f === 0 ? '#10B981' : '#34D399';
      ctx.beginPath();
      ctx.moveTo(19, 8);
      ctx.lineTo(f === 0 ? 56 : 52, f === 0 ? 16 : 20);
      ctx.lineTo(19, 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#FBBF24';
      ctx.beginPath();
      ctx.arc(16.5, 6, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64"><rect x="14" y="6" width="5" height="54" fill="#E2E8F0"/></svg>`
);

const DEFAULT_PARAMS = {
  moveSpeed: 5.0,
  jumpForce: 7.4,
  rotateSpeed: 120,
  amplitude: 1.5,
};

const PLAYER_INIT_KEYFRAMES: TimelineKeyframe[] = [
  { id: 'kf1', time: 0.0, targetName: 'armL', property: 'rotation', axis: 'x', value: -35 },
  { id: 'kf2', time: 0.5, targetName: 'armL', property: 'rotation', axis: 'x', value: 45 },
  { id: 'kf3', time: 1.0, targetName: 'armL', property: 'rotation', axis: 'x', value: -35 },
  { id: 'kf4', time: 0.0, targetName: 'armR', property: 'rotation', axis: 'x', value: 35 },
  { id: 'kf5', time: 0.5, targetName: 'armR', property: 'rotation', axis: 'x', value: -45 },
  { id: 'kf6', time: 1.0, targetName: 'armR', property: 'rotation', axis: 'x', value: 35 },
];

export function makeDefaultCameraConfig(overrides?: Partial<CameraConfig>): CameraConfig {
  return {
    enabled: true,
    isMain: true,
    playerSlot: 1,
    projection: 'Perspective',
    fov: 52,
    orthoSize: 5.8,
    nearClip: 0.1,
    farClip: 180,
    followTargetName: '',
    followOffset: { x: 0, y: 2.35, z: -5.4 },
    smoothSpeed: 8.5,
    showMonitor: false,
    monitorSize: 'small',
    gtaChase: false,
    lockOnEnabled: true,
    lockOnRange: 6.2,
    ...overrides,
  };
}

function makeBaseEntity(
  id: number,
  name: string,
  kind: EntityKind,
  primitive: MeshPrimitive,
  overrides: {
    active?: boolean;
    playerSlot?: 1 | 2;
    visualArchetype?: EngineEntity['visualArchetype'];
    spawner?: EngineEntity['spawner'];
    position?: Vec3;
    rotation?: Vec3;
    scale?: Vec3;
    color?: string;
    texturePreset?: TexturePreset;
    uvTiling?: { x: number; y: number };
    metallic?: number;
    roughness?: number;
    sprite?: SpriteConfig;
    camera?: Partial<CameraConfig>;
    health?: HealthConfig;
    physics?: Partial<EngineEntity['physics']>;
    script?: Partial<EngineEntity['script']>;
    animatorEnabled?: boolean;
  }
): EngineEntity {
  const isRig = kind === 'Rig3D' || kind === 'Rig2D';
  return {
    id,
    guid: generateGuid(),
    name,
    kind,
    active: overrides.active ?? true,
    playerSlot: overrides.playerSlot ?? 1,
    visualArchetype: overrides.visualArchetype ?? 'default',
    spawner: overrides.spawner,
    primitive,
    blenderClips: [],
    activeBlenderClip: null,
    blenderClipSpeed: 1,
    blenderClipLoop: true,
    boneNames: isRig ? [...BUILTIN_RIG_BONES] : [],
    selectedBone: null,
    showSkeletonHelper: kind === 'Rig3D' || kind === 'Rig2D' ? false : true,
    boneOverrides: {},
    position: overrides.position ?? { x: 0, y: 0, z: 0 },
    rotation: overrides.rotation ?? { x: 0, y: 0, z: 0 },
    scale: overrides.scale ?? { x: 1, y: 1, z: 1 },
    color: overrides.color ?? '#3B82F6',
    texturePreset: overrides.texturePreset ?? 'None',
    uvTiling: overrides.uvTiling ?? { x: 1, y: 1 },
    metallic: overrides.metallic ?? 0.2,
    roughness: overrides.roughness ?? 0.45,
    wireframe: false,
    sprite: overrides.sprite,
    camera: kind === 'Camera' ? makeDefaultCameraConfig(overrides.camera) : undefined,
    health: overrides.health,
    rigPose: { ...DEFAULT_RIG_POSE },
    physics: {
      enabled: overrides.physics?.enabled ?? true,
      useGravity: overrides.physics?.useGravity ?? false,
      isStatic: overrides.physics?.isStatic ?? true,
      restitution: overrides.physics?.restitution ?? 0.25,
      velocity: overrides.physics?.velocity ?? { x: 0, y: 0, z: 0 },
    },
    script: {
      language: overrides.script?.language ?? 'None',
      className: overrides.script?.className ?? 'Object',
      scriptAssetId: overrides.script?.scriptAssetId ?? null,
      mechanicPreset: overrides.script?.mechanicPreset ?? ('None' as MechanicPreset),
      spinSpeedDeg: overrides.script?.spinSpeedDeg ?? 0,
      params: overrides.script?.params ?? { ...DEFAULT_PARAMS },
    },
    animator: {
      enabled: overrides.animatorEnabled ?? isRig,
      useKeyframes: false,
      currentState: 'Idle',
      clipDuration: 2.0,
      activeClipId: isRig ? 'clip_aceno' : null,
      clips: isRig
        ? [
            {
              id: 'clip_aceno',
              name: 'Aceno_Bracos',
              duration: 2.0,
              loop: true,
              keyframes: PLAYER_INIT_KEYFRAMES,
            },
          ]
        : [],
      states: isRig ? JSON.parse(JSON.stringify(DEFAULT_ANIMATOR_STATES)) : [],
      libraryPresetId: null,
      clipSpeed: 1.0,
      clipLoop: true,
      paramSpeed: 0,
      paramGrounded: true,
      triggerAttack: false,
      keyframes: isRig ? PLAYER_INIT_KEYFRAMES : [],
    },
    network: { replicated: isRig, syncRateHz: isRig ? 30 : 20 },
  };
}

export function createStarterEntities(mode: '3D' | '2D' = '3D'): EngineEntity[] {
  if (mode === '2D') {
    // Demo 2D Profissional: Fase longa de Tiro 2D com Zumbis nítidos, Aranhas, Latas Giratórias, Drones e Chefe
    return [
      makeBaseEntity(1, 'Chao_Principal', 'Mesh3D', 'Cube', {
        position: { x: 18, y: -0.45, z: 0 },
        scale: { x: 76, y: 0.9, z: 2.8 },
        color: '#334155',
        texturePreset: 'UVGrid',
        uvTiling: { x: 26, y: 1 },
        physics: { enabled: true, useGravity: false, isStatic: true },
      }),
      makeBaseEntity(2, 'Camera_2D_P1', 'Camera', 'Cube', {
        position: { x: -12, y: 2.3, z: 16 },
        rotation: { x: -3, y: 0, z: 0 },
        color: '#38BDF8',
        camera: {
          enabled: true,
          isMain: true,
          playerSlot: 1,
          projection: 'Orthographic',
          orthoSize: 5.8,
          followTargetName: 'Atirador_1',
          followOffset: { x: 1.5, y: 1.8, z: 16 },
          smoothSpeed: 9.0,
          showMonitor: true,
          monitorSize: 'small',
          gtaChase: false,
          lockOnEnabled: false,
        },
        physics: { enabled: false, useGravity: false, isStatic: true },
      }),
      makeBaseEntity(3, 'Camera_2D_P2', 'Camera', 'Cube', {
        position: { x: -10, y: 2.3, z: 16 },
        rotation: { x: -3, y: 0, z: 0 },
        color: '#F59E0B',
        camera: {
          enabled: true,
          isMain: false,
          playerSlot: 2,
          projection: 'Orthographic',
          orthoSize: 5.8,
          followTargetName: 'Atirador_2',
          followOffset: { x: 1.5, y: 1.8, z: 16 },
          smoothSpeed: 9.0,
          showMonitor: false,
          monitorSize: 'small',
          gtaChase: false,
          lockOnEnabled: false,
        },
        physics: { enabled: false, useGravity: false, isStatic: true },
      }),
      makeBaseEntity(4, 'Atirador_1', 'Sprite2D', 'Quad2D', {
        playerSlot: 1,
        position: { x: -14, y: 0.85, z: 0 },
        scale: { x: 1.55, y: 1.55, z: 1 },
        color: '#FFFFFF',
        sprite: { sourceUrl: BUILTIN_SPRITE_HERO, isGif: false, flipX: false, billboard: false, cols: 4, rows: 1, fps: 8 },
        health: {
          enabled: true,
          maxHp: 120,
          currentHp: 120,
          team: 'player',
          attackDamage: 28,
          attackRange: 16,
          attackCooldown: 0.2,
          canShoot: true,
          projectileColor: '#38BDF8',
          projectileSpeed: 19,
        },
        physics: { enabled: true, useGravity: true, isStatic: false, restitution: 0.05 },
        script: {
          language: 'None',
          className: 'Shooter2DController',
          scriptAssetId: null,
          mechanicPreset: 'Shooter2D',
          params: { moveSpeed: 6.4, jumpForce: 9.2, rotateSpeed: 0, amplitude: 0 },
        },
      }),
      makeBaseEntity(5, 'Atirador_2', 'Sprite2D', 'Quad2D', {
        active: false,
        playerSlot: 2,
        position: { x: -12.2, y: 0.85, z: 0 },
        scale: { x: 1.55, y: 1.55, z: 1 },
        color: '#FDE68A',
        sprite: { sourceUrl: BUILTIN_SPRITE_HERO, isGif: false, flipX: false, billboard: false, cols: 4, rows: 1, fps: 8 },
        health: {
          enabled: true,
          maxHp: 120,
          currentHp: 120,
          team: 'player',
          attackDamage: 28,
          attackRange: 16,
          attackCooldown: 0.2,
          canShoot: true,
          projectileColor: '#F59E0B',
          projectileSpeed: 19,
        },
        physics: { enabled: true, useGravity: true, isStatic: false, restitution: 0.05 },
        script: {
          language: 'None',
          className: 'Shooter2DController',
          scriptAssetId: null,
          mechanicPreset: 'Shooter2D',
          params: { moveSpeed: 6.4, jumpForce: 9.2, rotateSpeed: 0, amplitude: 0 },
        },
      }),
      // Cenário / Plataformas multi-nível
      makeBaseEntity(6, 'Plataforma_Urbana_1', 'Mesh3D', 'Cube', {
        position: { x: -6.5, y: 1.75, z: 0 },
        scale: { x: 4.5, y: 0.45, z: 1.8 },
        color: '#8B5CF6',
        texturePreset: 'WoodGrain',
        uvTiling: { x: 2, y: 1 },
        physics: { enabled: true, useGravity: false, isStatic: true },
      }),
      makeBaseEntity(7, 'Plataforma_Galpao', 'Mesh3D', 'Cube', {
        position: { x: 2.2, y: 2.6, z: 0 },
        scale: { x: 5.5, y: 0.45, z: 1.8 },
        color: '#0EA5E9',
        texturePreset: 'MetalPlate',
        uvTiling: { x: 3, y: 1 },
        physics: { enabled: true, useGravity: false, isStatic: true },
      }),
      makeBaseEntity(8, 'Plataforma_Ponte_A', 'Mesh3D', 'Cube', {
        position: { x: 11.5, y: 1.9, z: 0 },
        scale: { x: 4.8, y: 0.45, z: 1.8 },
        color: '#F59E0B',
        texturePreset: 'MetalPlate',
        uvTiling: { x: 2, y: 1 },
        physics: { enabled: true, useGravity: false, isStatic: true },
      }),
      makeBaseEntity(9, 'Plataforma_Torre_Alta', 'Mesh3D', 'Cube', {
        position: { x: 20.5, y: 3.4, z: 0 },
        scale: { x: 5.2, y: 0.45, z: 1.8 },
        color: '#6366F1',
        texturePreset: 'MetalPlate',
        uvTiling: { x: 3, y: 1 },
        physics: { enabled: true, useGravity: false, isStatic: true },
      }),
      makeBaseEntity(10, 'Plataforma_Base_1', 'Mesh3D', 'Cube', {
        position: { x: 31.0, y: 2.1, z: 0 },
        scale: { x: 6.0, y: 0.45, z: 1.8 },
        color: '#14B8A6',
        texturePreset: 'WoodGrain',
        uvTiling: { x: 3, y: 1 },
        physics: { enabled: true, useGravity: false, isStatic: true },
      }),
      makeBaseEntity(11, 'Plataforma_Arena_Chefe', 'Mesh3D', 'Cube', {
        position: { x: 42.0, y: 2.8, z: 0 },
        scale: { x: 5.4, y: 0.45, z: 1.8 },
        color: '#EC4899',
        texturePreset: 'MetalPlate',
        uvTiling: { x: 3, y: 1 },
        physics: { enabled: true, useGravity: false, isStatic: true },
      }),
      makeBaseEntity(12, 'Mola_Impulsora', 'Mesh3D', 'Cylinder', {
        position: { x: 16.2, y: 0.25, z: 0 },
        scale: { x: 1.4, y: 0.45, z: 1.4 },
        color: '#10B981',
        physics: { enabled: true, useGravity: false, isStatic: true },
        script: { mechanicPreset: 'JumpPad', params: { moveSpeed: 0, jumpForce: 13.5, rotateSpeed: 0, amplitude: 0 } },
      }),
      // Casinhas de fundo decorativas para a cidade 2D
      makeBaseEntity(13, 'Casa_Fundo_1', 'Mesh3D', 'Cube', {
        visualArchetype: 'house',
        position: { x: -7.5, y: 0, z: -2.4 },
        scale: { x: 3.4, y: 3.2, z: 2.2 },
        color: '#F59E0B',
        physics: { enabled: false, useGravity: false, isStatic: true },
      }),
      makeBaseEntity(14, 'Casa_Fundo_2', 'Mesh3D', 'Cube', {
        visualArchetype: 'house',
        position: { x: 12.0, y: 0, z: -2.6 },
        scale: { x: 4.2, y: 3.8, z: 2.2 },
        color: '#3B82F6',
        physics: { enabled: false, useGravity: false, isStatic: true },
      }),
      makeBaseEntity(15, 'Casa_Fundo_3', 'Mesh3D', 'Cube', {
        visualArchetype: 'house',
        position: { x: 33.0, y: 0, z: -2.5 },
        scale: { x: 4.0, y: 3.5, z: 2.2 },
        color: '#EF4444',
        physics: { enabled: false, useGravity: false, isStatic: true },
      }),
      // MOBs 2D bem visíveis (rotation.y sempre 0!)
      makeBaseEntity(16, 'Zumbi_2D_1', 'Sprite2D', 'Quad2D', {
        position: { x: -4.5, y: 0.85, z: 0 },
        scale: { x: 1.6, y: 1.6, z: 1 },
        color: '#FFFFFF',
        sprite: { sourceUrl: BUILTIN_SPRITE_SLIME, cols: 2, rows: 1, fps: 5, flipX: true },
        health: { enabled: true, maxHp: 60, currentHp: 60, team: 'enemy', attackDamage: 12, attackRange: 1.25, attackCooldown: 0.85 },
        physics: { enabled: true, useGravity: true, isStatic: false },
        script: { mechanicPreset: 'ZombieEnemy', params: { moveSpeed: 2.1, jumpForce: 0, rotateSpeed: 0, amplitude: 1.0 } },
      }),
      makeBaseEntity(17, 'Zumbi_2D_2', 'Sprite2D', 'Quad2D', {
        position: { x: 2.2, y: 3.6, z: 0 },
        scale: { x: 1.6, y: 1.6, z: 1 },
        color: '#D9F99D',
        sprite: { sourceUrl: BUILTIN_SPRITE_SLIME, cols: 2, rows: 1, fps: 5, flipX: true },
        health: { enabled: true, maxHp: 65, currentHp: 65, team: 'enemy', attackDamage: 12, attackRange: 1.25, attackCooldown: 0.85 },
        physics: { enabled: true, useGravity: true, isStatic: false },
        script: { mechanicPreset: 'ZombieEnemy', params: { moveSpeed: 2.3, jumpForce: 0, rotateSpeed: 0, amplitude: 1.0 } },
      }),
      makeBaseEntity(18, 'Aranha_2D_1', 'Sprite2D', 'Quad2D', {
        position: { x: 8.0, y: 0.75, z: 0 },
        scale: { x: 1.45, y: 1.45, z: 1 },
        color: '#FFFFFF',
        sprite: { sourceUrl: BUILTIN_SPRITE_SPIDER, cols: 2, rows: 1, fps: 8, flipX: true },
        health: { enabled: true, maxHp: 45, currentHp: 45, team: 'enemy', attackDamage: 10, attackRange: 1.15, attackCooldown: 0.7 },
        physics: { enabled: true, useGravity: true, isStatic: false },
        script: { mechanicPreset: 'SpiderEnemy', params: { moveSpeed: 4.1, jumpForce: 5.8, rotateSpeed: 0, amplitude: 1.2 } },
      }),
      makeBaseEntity(19, 'Lata_Giratoria_2D_1', 'Sprite2D', 'Quad2D', {
        position: { x: 14.5, y: 0.75, z: 0 },
        scale: { x: 1.35, y: 1.35, z: 1 },
        color: '#FFFFFF',
        sprite: { sourceUrl: BUILTIN_SPRITE_CAN, cols: 2, rows: 1, fps: 10 },
        health: { enabled: true, maxHp: 55, currentHp: 55, team: 'enemy', attackDamage: 14, attackRange: 1.15, attackCooldown: 0.65 },
        physics: { enabled: true, useGravity: true, isStatic: false },
        script: { mechanicPreset: 'SpinningCanEnemy', params: { moveSpeed: 4.6, jumpForce: 0, rotateSpeed: 540, amplitude: 1.0 } },
      }),
      makeBaseEntity(20, 'Zumbi_2D_3', 'Sprite2D', 'Quad2D', {
        position: { x: 20.5, y: 4.3, z: 0 },
        scale: { x: 1.65, y: 1.65, z: 1 },
        color: '#FCA5A5',
        sprite: { sourceUrl: BUILTIN_SPRITE_SLIME, cols: 2, rows: 1, fps: 5, flipX: true },
        health: { enabled: true, maxHp: 80, currentHp: 80, team: 'enemy', attackDamage: 15, attackRange: 1.3, attackCooldown: 0.85 },
        physics: { enabled: true, useGravity: true, isStatic: false },
        script: { mechanicPreset: 'ZombieEnemy', params: { moveSpeed: 2.5, jumpForce: 0, rotateSpeed: 0, amplitude: 1.0 } },
      }),
      makeBaseEntity(21, 'Aranha_2D_2', 'Sprite2D', 'Quad2D', {
        position: { x: 27.0, y: 0.75, z: 0 },
        scale: { x: 1.5, y: 1.5, z: 1 },
        color: '#FFFFFF',
        sprite: { sourceUrl: BUILTIN_SPRITE_SPIDER, cols: 2, rows: 1, fps: 8, flipX: true },
        health: { enabled: true, maxHp: 55, currentHp: 55, team: 'enemy', attackDamage: 12, attackRange: 1.2, attackCooldown: 0.7 },
        physics: { enabled: true, useGravity: true, isStatic: false },
        script: { mechanicPreset: 'SpiderEnemy', params: { moveSpeed: 4.3, jumpForce: 6.2, rotateSpeed: 0, amplitude: 1.2 } },
      }),
      makeBaseEntity(22, 'Zumbi_2D_4', 'Sprite2D', 'Quad2D', {
        position: { x: 31.5, y: 3.1, z: 0 },
        scale: { x: 1.65, y: 1.65, z: 1 },
        color: '#86EFAC',
        sprite: { sourceUrl: BUILTIN_SPRITE_SLIME, cols: 2, rows: 1, fps: 5, flipX: true },
        health: { enabled: true, maxHp: 85, currentHp: 85, team: 'enemy', attackDamage: 15, attackRange: 1.3, attackCooldown: 0.85 },
        physics: { enabled: true, useGravity: true, isStatic: false },
        script: { mechanicPreset: 'ZombieEnemy', params: { moveSpeed: 2.6, jumpForce: 0, rotateSpeed: 0, amplitude: 1.0 } },
      }),
      makeBaseEntity(23, 'Lata_Giratoria_2D_2', 'Sprite2D', 'Quad2D', {
        position: { x: 38.0, y: 0.75, z: 0 },
        scale: { x: 1.4, y: 1.4, z: 1 },
        color: '#FFFFFF',
        sprite: { sourceUrl: BUILTIN_SPRITE_CAN, cols: 2, rows: 1, fps: 10 },
        health: { enabled: true, maxHp: 65, currentHp: 65, team: 'enemy', attackDamage: 16, attackRange: 1.2, attackCooldown: 0.65 },
        physics: { enabled: true, useGravity: true, isStatic: false },
        script: { mechanicPreset: 'SpinningCanEnemy', params: { moveSpeed: 4.9, jumpForce: 0, rotateSpeed: 580, amplitude: 1.0 } },
      }),
      makeBaseEntity(24, 'Drone_3D_1', 'Mesh3D', 'Cone', {
        visualArchetype: 'drone',
        position: { x: 7.5, y: 3.8, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1.05, y: 1.05, z: 1.05 },
        color: '#EF4444',
        metallic: 0.75,
        roughness: 0.2,
        health: { enabled: true, maxHp: 60, currentHp: 60, team: 'enemy', attackDamage: 14, attackRange: 1.25, attackCooldown: 0.95 },
        physics: { enabled: false, useGravity: false, isStatic: true },
        script: { mechanicPreset: 'Patrol', spinSpeedDeg: 140, params: { moveSpeed: 2.1, jumpForce: 0, rotateSpeed: 140, amplitude: 2.4 } },
      }),
      makeBaseEntity(25, 'Drone_3D_2', 'Mesh3D', 'Cone', {
        visualArchetype: 'drone',
        position: { x: 28.0, y: 4.2, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1.15, y: 1.15, z: 1.15 },
        color: '#F97316',
        metallic: 0.75,
        roughness: 0.2,
        health: { enabled: true, maxHp: 75, currentHp: 75, team: 'enemy', attackDamage: 16, attackRange: 1.3, attackCooldown: 0.95 },
        physics: { enabled: false, useGravity: false, isStatic: true },
        script: { mechanicPreset: 'Patrol', spinSpeedDeg: 160, params: { moveSpeed: 2.3, jumpForce: 0, rotateSpeed: 160, amplitude: 2.8 } },
      }),
      makeBaseEntity(26, 'Zumbi_Chefe_2D', 'Sprite2D', 'Quad2D', {
        position: { x: 46.5, y: 1.15, z: 0 },
        scale: { x: 2.15, y: 2.15, z: 1 },
        color: '#FFFFFF',
        sprite: { sourceUrl: BUILTIN_SPRITE_BOSS_ZOMBIE, cols: 2, rows: 1, fps: 4, flipX: true },
        health: { enabled: true, maxHp: 190, currentHp: 190, team: 'enemy', attackDamage: 22, attackRange: 1.65, attackCooldown: 0.9 },
        physics: { enabled: true, useGravity: true, isStatic: false },
        script: { mechanicPreset: 'ZombieEnemy', params: { moveSpeed: 2.75, jumpForce: 0, rotateSpeed: 0, amplitude: 1.0 } },
      }),
      // Kits de Energia + Bandeira Meta
      makeBaseEntity(27, 'Kit_Energia_1', 'Sprite2D', 'Quad2D', {
        position: { x: -6.5, y: 2.65, z: 0 },
        scale: { x: 0.95, y: 0.95, z: 1 },
        color: '#FFFFFF',
        sprite: { sourceUrl: BUILTIN_SPRITE_COIN, cols: 4, rows: 1, fps: 8 },
        physics: { enabled: false, useGravity: false, isStatic: true },
        script: { mechanicPreset: 'CollectibleSpin', params: { moveSpeed: 3.0, jumpForce: 0, rotateSpeed: 0, amplitude: 0.15 } },
      }),
      makeBaseEntity(28, 'Kit_Energia_2', 'Sprite2D', 'Quad2D', {
        position: { x: 20.5, y: 4.3, z: 0 },
        scale: { x: 0.95, y: 0.95, z: 1 },
        color: '#FFFFFF',
        sprite: { sourceUrl: BUILTIN_SPRITE_COIN, cols: 4, rows: 1, fps: 8 },
        physics: { enabled: false, useGravity: false, isStatic: true },
        script: { mechanicPreset: 'CollectibleSpin', params: { moveSpeed: 3.0, jumpForce: 0, rotateSpeed: 0, amplitude: 0.15 } },
      }),
      makeBaseEntity(29, 'Kit_Energia_3', 'Sprite2D', 'Quad2D', {
        position: { x: 42.0, y: 3.7, z: 0 },
        scale: { x: 0.95, y: 0.95, z: 1 },
        color: '#FFFFFF',
        sprite: { sourceUrl: BUILTIN_SPRITE_COIN, cols: 4, rows: 1, fps: 8 },
        physics: { enabled: false, useGravity: false, isStatic: true },
        script: { mechanicPreset: 'CollectibleSpin', params: { moveSpeed: 3.0, jumpForce: 0, rotateSpeed: 0, amplitude: 0.15 } },
      }),
      makeBaseEntity(30, 'Bandeira_Meta_2D', 'Sprite2D', 'Quad2D', {
        position: { x: 51.5, y: 0.95, z: 0 },
        scale: { x: 1.5, y: 1.5, z: 1 },
        color: '#FFFFFF',
        sprite: { sourceUrl: BUILTIN_SPRITE_FLAG, cols: 2, rows: 1, fps: 4 },
        physics: { enabled: false, useGravity: false, isStatic: true },
        script: { mechanicPreset: 'Goal', params: { ...DEFAULT_PARAMS } },
      }),
      makeBaseEntity(31, 'Luz_Cena', 'PointLight', 'Sphere', {
        position: { x: 12, y: 7.5, z: 6.0 },
        color: '#FBBF24',
        physics: { enabled: false, useGravity: false, isStatic: true },
      }),
    ];
  }

  // Demo 3D: Briga de Rua estilo GTA — Objetivo: quebrar as 7 Caixas Nascedoras de Inimigos
  return [
    makeBaseEntity(1, 'Rua_Asfalto', 'Mesh3D', 'Plane', {
      position: { x: 4, y: -0.02, z: 0 },
      scale: { x: 70, y: 1, z: 16 },
      color: '#27303F',
      texturePreset: 'UVGrid',
      uvTiling: { x: 20, y: 5 },
      metallic: 0.08,
      roughness: 0.88,
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(2, 'Calcada_Fundo', 'Mesh3D', 'Cube', {
      position: { x: 4, y: 0.22, z: -6.8 },
      scale: { x: 70, y: 0.44, z: 3.2 },
      color: '#475569',
      texturePreset: 'Checkerboard',
      uvTiling: { x: 24, y: 1 },
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(3, 'Calcada_Frente', 'Mesh3D', 'Cube', {
      position: { x: 4, y: 0.22, z: 7.0 },
      scale: { x: 70, y: 0.44, z: 2.4 },
      color: '#475569',
      texturePreset: 'Checkerboard',
      uvTiling: { x: 24, y: 1 },
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    // Blocagens de casas pelo bairro
    makeBaseEntity(4, 'Casa_Amarela', 'Mesh3D', 'Cube', {
      visualArchetype: 'house',
      position: { x: -20.5, y: 0, z: -9.6 },
      scale: { x: 5.4, y: 4.3, z: 4.0 },
      color: '#F59E0B',
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(5, 'Casa_Azul', 'Mesh3D', 'Cube', {
      visualArchetype: 'house',
      position: { x: -12.0, y: 0, z: -9.6 },
      scale: { x: 5.6, y: 5.0, z: 4.2 },
      color: '#3B82F6',
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(6, 'Sobrado_Tijolo', 'Mesh3D', 'Cube', {
      visualArchetype: 'house',
      position: { x: -3.2, y: 0, z: -9.8 },
      scale: { x: 6.2, y: 5.8, z: 4.4 },
      color: '#DC2626',
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(7, 'Casa_Verde', 'Mesh3D', 'Cube', {
      visualArchetype: 'house',
      position: { x: 5.8, y: 0, z: -9.5 },
      scale: { x: 5.4, y: 4.5, z: 4.0 },
      color: '#10B981',
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(8, 'Mercado_Esquina', 'Mesh3D', 'Cube', {
      visualArchetype: 'house',
      position: { x: 15.0, y: 0, z: -9.6 },
      scale: { x: 6.4, y: 4.9, z: 4.5 },
      color: '#8B5CF6',
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(9, 'Casa_Ciano', 'Mesh3D', 'Cube', {
      visualArchetype: 'house',
      position: { x: 24.5, y: 0, z: -9.6 },
      scale: { x: 5.8, y: 5.2, z: 4.2 },
      color: '#0EA5E9',
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(10, 'Galpao_Leste', 'Mesh3D', 'Cube', {
      visualArchetype: 'house',
      position: { x: 33.8, y: 0, z: -9.8 },
      scale: { x: 6.8, y: 5.4, z: 4.6 },
      color: '#6366F1',
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(11, 'Casa_Laranja', 'Mesh3D', 'Cube', {
      visualArchetype: 'house',
      position: { x: -13.0, y: 0, z: 9.8 },
      rotation: { x: 0, y: 180, z: 0 },
      scale: { x: 5.2, y: 4.2, z: 3.8 },
      color: '#F97316',
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(12, 'Casa_Vinho_Sul', 'Mesh3D', 'Cube', {
      visualArchetype: 'house',
      position: { x: 6.5, y: 0, z: 9.9 },
      rotation: { x: 0, y: 180, z: 0 },
      scale: { x: 5.8, y: 4.6, z: 4.0 },
      color: '#BE123C',
      physics: { enabled: true, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(13, 'Camera_P1', 'Camera', 'Cube', {
      position: { x: -21.2, y: 2.65, z: 0.5 },
      rotation: { x: -12, y: -90, z: 0 },
      color: '#38BDF8',
      camera: {
        enabled: true,
        isMain: true,
        playerSlot: 1,
        projection: 'Perspective',
        fov: 54,
        followTargetName: 'Jogador_1',
        followOffset: { x: 0, y: 2.65, z: -5.8 },
        smoothSpeed: 10.0,
        showMonitor: true,
        monitorSize: 'small',
        gtaChase: true,
        lockOnEnabled: true,
        lockOnRange: 6.8,
      },
      physics: { enabled: false, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(14, 'Camera_P2', 'Camera', 'Cube', {
      position: { x: -19.5, y: 2.65, z: -1.5 },
      rotation: { x: -12, y: -90, z: 0 },
      color: '#F59E0B',
      camera: {
        enabled: true,
        isMain: false,
        playerSlot: 2,
        projection: 'Perspective',
        fov: 54,
        followTargetName: 'Jogador_2',
        followOffset: { x: 0, y: 2.65, z: -5.8 },
        smoothSpeed: 10.0,
        showMonitor: false,
        monitorSize: 'small',
        gtaChase: true,
        lockOnEnabled: true,
        lockOnRange: 6.8,
      },
      physics: { enabled: false, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(15, 'Jogador_1', 'Rig3D', 'Cube', {
      playerSlot: 1,
      position: { x: -15.5, y: 0, z: 0.5 },
      rotation: { x: 0, y: 90, z: 0 },
      color: '#2563EB',
      metallic: 0.15,
      roughness: 0.45,
      health: {
        enabled: true,
        maxHp: 180,
        currentHp: 180,
        team: 'player',
        attackDamage: 26,
        attackRange: 2.35,
        attackCooldown: 0.26,
      },
      physics: { enabled: true, useGravity: true, isStatic: false, restitution: 0.05 },
      script: {
        language: 'None',
        className: 'Brawler3DController',
        scriptAssetId: null,
        mechanicPreset: 'Brawler3D',
        params: { moveSpeed: 6.6, jumpForce: 8.2, rotateSpeed: 150, amplitude: 0 },
      },
    }),
    makeBaseEntity(16, 'Jogador_2', 'Rig3D', 'Cube', {
      active: false,
      playerSlot: 2,
      position: { x: -14.0, y: 0, z: -1.5 },
      rotation: { x: 0, y: 90, z: 0 },
      color: '#D97706',
      metallic: 0.15,
      roughness: 0.45,
      health: {
        enabled: true,
        maxHp: 180,
        currentHp: 180,
        team: 'player',
        attackDamage: 26,
        attackRange: 2.35,
        attackCooldown: 0.26,
      },
      physics: { enabled: true, useGravity: true, isStatic: false, restitution: 0.05 },
      script: {
        language: 'None',
        className: 'Brawler3DController',
        scriptAssetId: null,
        mechanicPreset: 'Brawler3D',
        params: { moveSpeed: 6.6, jumpForce: 8.2, rotateSpeed: 150, amplitude: 0 },
      },
    }),
    // 7 Caixas Nascedoras de Inimigos (Objetivo principal: quebrar todas as 7!)
    makeBaseEntity(17, 'Caixa_Nascedora_1', 'Mesh3D', 'Cube', {
      visualArchetype: 'spawner_crate',
      position: { x: -7.5, y: 0, z: -3.2 },
      scale: { x: 1.15, y: 1.15, z: 1.15 },
      color: '#9A3412',
      spawner: { spawnInterval: 8.5, maxAlive: 14, spawnType: 'zombie' },
      health: { enabled: true, maxHp: 100, currentHp: 100, team: 'enemy', attackDamage: 0, attackRange: 0, attackCooldown: 1 },
      physics: { enabled: true, useGravity: false, isStatic: true },
      script: { mechanicPreset: 'EnemySpawner', params: { moveSpeed: 0, jumpForce: 0, rotateSpeed: 90, amplitude: 0 } },
    }),
    makeBaseEntity(18, 'Caixa_Nascedora_2', 'Mesh3D', 'Cube', {
      visualArchetype: 'spawner_crate',
      position: { x: -0.5, y: 0, z: 3.3 },
      scale: { x: 1.15, y: 1.15, z: 1.15 },
      color: '#7C2D12',
      spawner: { spawnInterval: 9.0, maxAlive: 14, spawnType: 'spider' },
      health: { enabled: true, maxHp: 100, currentHp: 100, team: 'enemy', attackDamage: 0, attackRange: 0, attackCooldown: 1 },
      physics: { enabled: true, useGravity: false, isStatic: true },
      script: { mechanicPreset: 'EnemySpawner', params: { moveSpeed: 0, jumpForce: 0, rotateSpeed: 90, amplitude: 0 } },
    }),
    makeBaseEntity(19, 'Caixa_Nascedora_3', 'Mesh3D', 'Cube', {
      visualArchetype: 'spawner_crate',
      position: { x: 6.5, y: 0, z: -2.9 },
      scale: { x: 1.15, y: 1.15, z: 1.15 },
      color: '#9A3412',
      spawner: { spawnInterval: 9.2, maxAlive: 14, spawnType: 'spinning_can' },
      health: { enabled: true, maxHp: 110, currentHp: 110, team: 'enemy', attackDamage: 0, attackRange: 0, attackCooldown: 1 },
      physics: { enabled: true, useGravity: false, isStatic: true },
      script: { mechanicPreset: 'EnemySpawner', params: { moveSpeed: 0, jumpForce: 0, rotateSpeed: 90, amplitude: 0 } },
    }),
    makeBaseEntity(20, 'Caixa_Nascedora_4', 'Mesh3D', 'Cube', {
      visualArchetype: 'spawner_crate',
      position: { x: 13.5, y: 0, z: 3.1 },
      scale: { x: 1.15, y: 1.15, z: 1.15 },
      color: '#7C2D12',
      spawner: { spawnInterval: 8.8, maxAlive: 14, spawnType: 'mixed' },
      health: { enabled: true, maxHp: 110, currentHp: 110, team: 'enemy', attackDamage: 0, attackRange: 0, attackCooldown: 1 },
      physics: { enabled: true, useGravity: false, isStatic: true },
      script: { mechanicPreset: 'EnemySpawner', params: { moveSpeed: 0, jumpForce: 0, rotateSpeed: 90, amplitude: 0 } },
    }),
    makeBaseEntity(21, 'Caixa_Nascedora_5', 'Mesh3D', 'Cube', {
      visualArchetype: 'spawner_crate',
      position: { x: 20.5, y: 0, z: -3.2 },
      scale: { x: 1.15, y: 1.15, z: 1.15 },
      color: '#9A3412',
      spawner: { spawnInterval: 8.5, maxAlive: 14, spawnType: 'zombie' },
      health: { enabled: true, maxHp: 120, currentHp: 120, team: 'enemy', attackDamage: 0, attackRange: 0, attackCooldown: 1 },
      physics: { enabled: true, useGravity: false, isStatic: true },
      script: { mechanicPreset: 'EnemySpawner', params: { moveSpeed: 0, jumpForce: 0, rotateSpeed: 90, amplitude: 0 } },
    }),
    makeBaseEntity(22, 'Caixa_Nascedora_6', 'Mesh3D', 'Cube', {
      visualArchetype: 'spawner_crate',
      position: { x: 26.8, y: 0, z: 3.0 },
      scale: { x: 1.15, y: 1.15, z: 1.15 },
      color: '#7C2D12',
      spawner: { spawnInterval: 8.5, maxAlive: 14, spawnType: 'spinning_can' },
      health: { enabled: true, maxHp: 120, currentHp: 120, team: 'enemy', attackDamage: 0, attackRange: 0, attackCooldown: 1 },
      physics: { enabled: true, useGravity: false, isStatic: true },
      script: { mechanicPreset: 'EnemySpawner', params: { moveSpeed: 0, jumpForce: 0, rotateSpeed: 90, amplitude: 0 } },
    }),
    makeBaseEntity(23, 'Caixa_Nascedora_7', 'Mesh3D', 'Cube', {
      visualArchetype: 'spawner_crate',
      position: { x: 32.5, y: 0, z: -0.2 },
      scale: { x: 1.25, y: 1.25, z: 1.25 },
      color: '#581C87',
      spawner: { spawnInterval: 7.8, maxAlive: 14, spawnType: 'mixed' },
      health: { enabled: true, maxHp: 140, currentHp: 140, team: 'enemy', attackDamage: 0, attackRange: 0, attackCooldown: 1 },
      physics: { enabled: true, useGravity: false, isStatic: true },
      script: { mechanicPreset: 'EnemySpawner', params: { moveSpeed: 0, jumpForce: 0, rotateSpeed: 120, amplitude: 0 } },
    }),
    // Onda inicial de inimigos humanoides, aranhas e latas giratórias
    makeBaseEntity(24, 'Zumbi_1', 'Rig3D', 'Cube', {
      position: { x: -9.0, y: 0, z: 1.4 },
      rotation: { x: 0, y: -90, z: 0 },
      color: '#3F6212',
      health: { enabled: true, maxHp: 65, currentHp: 65, team: 'enemy', attackDamage: 9, attackRange: 1.45, attackCooldown: 0.95 },
      physics: { enabled: true, useGravity: true, isStatic: false },
      script: { mechanicPreset: 'ZombieEnemy', params: { moveSpeed: 2.2, jumpForce: 0, rotateSpeed: 0, amplitude: 1.25 } },
    }),
    makeBaseEntity(25, 'Aranha_1', 'Mesh3D', 'Cube', {
      visualArchetype: 'spider',
      position: { x: -4.0, y: 0.4, z: -1.8 },
      rotation: { x: 0, y: -90, z: 0 },
      scale: { x: 1.15, y: 1.15, z: 1.15 },
      color: '#312E81',
      health: { enabled: true, maxHp: 50, currentHp: 50, team: 'enemy', attackDamage: 10, attackRange: 1.45, attackCooldown: 0.8 },
      physics: { enabled: true, useGravity: true, isStatic: false },
      script: { mechanicPreset: 'SpiderEnemy', params: { moveSpeed: 4.1, jumpForce: 5.5, rotateSpeed: 0, amplitude: 1.4 } },
    }),
    makeBaseEntity(26, 'Lata_Giratoria_1', 'Mesh3D', 'Cylinder', {
      visualArchetype: 'spinning_can',
      position: { x: 2.2, y: 0.55, z: 2.1 },
      scale: { x: 0.95, y: 1.1, z: 0.95 },
      color: '#EF4444',
      metallic: 0.8,
      roughness: 0.2,
      health: { enabled: true, maxHp: 55, currentHp: 55, team: 'enemy', attackDamage: 12, attackRange: 1.35, attackCooldown: 0.7 },
      physics: { enabled: true, useGravity: true, isStatic: false },
      script: { mechanicPreset: 'SpinningCanEnemy', spinSpeedDeg: 720, params: { moveSpeed: 4.6, jumpForce: 0, rotateSpeed: 720, amplitude: 1.2 } },
    }),
    makeBaseEntity(27, 'Zumbi_2', 'Rig3D', 'Cube', {
      position: { x: 5.5, y: 0, z: -1.2 },
      rotation: { x: 0, y: -90, z: 0 },
      color: '#166534',
      health: { enabled: true, maxHp: 70, currentHp: 70, team: 'enemy', attackDamage: 10, attackRange: 1.45, attackCooldown: 0.95 },
      physics: { enabled: true, useGravity: true, isStatic: false },
      script: { mechanicPreset: 'ZombieEnemy', params: { moveSpeed: 2.4, jumpForce: 0, rotateSpeed: 0, amplitude: 1.25 } },
    }),
    makeBaseEntity(28, 'Aranha_2', 'Mesh3D', 'Cube', {
      visualArchetype: 'spider',
      position: { x: 11.0, y: 0.4, z: 2.4 },
      rotation: { x: 0, y: -90, z: 0 },
      scale: { x: 1.2, y: 1.2, z: 1.2 },
      color: '#4C1D95',
      health: { enabled: true, maxHp: 60, currentHp: 60, team: 'enemy', attackDamage: 11, attackRange: 1.5, attackCooldown: 0.75 },
      physics: { enabled: true, useGravity: true, isStatic: false },
      script: { mechanicPreset: 'SpiderEnemy', params: { moveSpeed: 4.3, jumpForce: 5.8, rotateSpeed: 0, amplitude: 1.4 } },
    }),
    makeBaseEntity(29, 'Lata_Giratoria_2', 'Mesh3D', 'Cylinder', {
      visualArchetype: 'spinning_can',
      position: { x: 16.5, y: 0.55, z: -2.0 },
      scale: { x: 1.0, y: 1.15, z: 1.0 },
      color: '#F97316',
      metallic: 0.85,
      roughness: 0.18,
      health: { enabled: true, maxHp: 65, currentHp: 65, team: 'enemy', attackDamage: 13, attackRange: 1.35, attackCooldown: 0.7 },
      physics: { enabled: true, useGravity: true, isStatic: false },
      script: { mechanicPreset: 'SpinningCanEnemy', spinSpeedDeg: 780, params: { moveSpeed: 4.8, jumpForce: 0, rotateSpeed: 780, amplitude: 1.2 } },
    }),
    makeBaseEntity(30, 'Zumbi_3', 'Rig3D', 'Cube', {
      position: { x: 19.0, y: 0, z: 1.5 },
      rotation: { x: 0, y: -90, z: 0 },
      color: '#365314',
      health: { enabled: true, maxHp: 80, currentHp: 80, team: 'enemy', attackDamage: 12, attackRange: 1.5, attackCooldown: 0.9 },
      physics: { enabled: true, useGravity: true, isStatic: false },
      script: { mechanicPreset: 'ZombieEnemy', params: { moveSpeed: 2.5, jumpForce: 0, rotateSpeed: 0, amplitude: 1.25 } },
    }),
    makeBaseEntity(31, 'Aranha_3', 'Mesh3D', 'Cube', {
      visualArchetype: 'spider',
      position: { x: 24.0, y: 0.4, z: -1.4 },
      rotation: { x: 0, y: -90, z: 0 },
      scale: { x: 1.25, y: 1.25, z: 1.25 },
      color: '#3730A3',
      health: { enabled: true, maxHp: 65, currentHp: 65, team: 'enemy', attackDamage: 12, attackRange: 1.5, attackCooldown: 0.75 },
      physics: { enabled: true, useGravity: true, isStatic: false },
      script: { mechanicPreset: 'SpiderEnemy', params: { moveSpeed: 4.4, jumpForce: 6.0, rotateSpeed: 0, amplitude: 1.4 } },
    }),
    makeBaseEntity(32, 'Zumbi_4', 'Rig3D', 'Cube', {
      position: { x: 28.5, y: 0, z: 0.8 },
      rotation: { x: 0, y: -90, z: 0 },
      color: '#4D7C0F',
      health: { enabled: true, maxHp: 85, currentHp: 85, team: 'enemy', attackDamage: 13, attackRange: 1.5, attackCooldown: 0.9 },
      physics: { enabled: true, useGravity: true, isStatic: false },
      script: { mechanicPreset: 'ZombieEnemy', params: { moveSpeed: 2.6, jumpForce: 0, rotateSpeed: 0, amplitude: 1.25 } },
    }),
    makeBaseEntity(33, 'Zumbi_Chefe', 'Rig3D', 'Cube', {
      position: { x: 30.8, y: 0, z: -1.6 },
      rotation: { x: 0, y: -90, z: 0 },
      scale: { x: 1.32, y: 1.32, z: 1.32 },
      color: '#7E22CE',
      health: { enabled: true, maxHp: 170, currentHp: 170, team: 'enemy', attackDamage: 18, attackRange: 1.75, attackCooldown: 0.95 },
      physics: { enabled: true, useGravity: true, isStatic: false },
      script: { mechanicPreset: 'ZombieEnemy', params: { moveSpeed: 2.4, jumpForce: 0, rotateSpeed: 0, amplitude: 1.5 } },
    }),
    // Kits Médicos pelo caminho
    makeBaseEntity(34, 'Kit_Medico_1', 'Mesh3D', 'Cylinder', {
      position: { x: -3.5, y: 0.7, z: 3.8 },
      rotation: { x: 90, y: 0, z: 0 },
      scale: { x: 0.75, y: 0.25, z: 0.75 },
      color: '#10B981',
      metallic: 0.4,
      roughness: 0.25,
      physics: { enabled: false, useGravity: false, isStatic: true },
      script: { mechanicPreset: 'CollectibleSpin', spinSpeedDeg: 130, params: { moveSpeed: 3.0, jumpForce: 0, rotateSpeed: 130, amplitude: 0.2 } },
    }),
    makeBaseEntity(35, 'Kit_Medico_2', 'Mesh3D', 'Cylinder', {
      position: { x: 10.5, y: 0.7, z: -4.0 },
      rotation: { x: 90, y: 0, z: 0 },
      scale: { x: 0.75, y: 0.25, z: 0.75 },
      color: '#10B981',
      metallic: 0.4,
      roughness: 0.25,
      physics: { enabled: false, useGravity: false, isStatic: true },
      script: { mechanicPreset: 'CollectibleSpin', spinSpeedDeg: 130, params: { moveSpeed: 3.0, jumpForce: 0, rotateSpeed: 130, amplitude: 0.2 } },
    }),
    makeBaseEntity(36, 'Kit_Medico_3', 'Mesh3D', 'Cylinder', {
      position: { x: 24.0, y: 0.7, z: 4.0 },
      rotation: { x: 90, y: 0, z: 0 },
      scale: { x: 0.75, y: 0.25, z: 0.75 },
      color: '#10B981',
      metallic: 0.4,
      roughness: 0.25,
      physics: { enabled: false, useGravity: false, isStatic: true },
      script: { mechanicPreset: 'CollectibleSpin', spinSpeedDeg: 130, params: { moveSpeed: 3.0, jumpForce: 0, rotateSpeed: 130, amplitude: 0.2 } },
    }),
    makeBaseEntity(37, 'Luz_Poste_1', 'PointLight', 'Sphere', {
      position: { x: -10.0, y: 6.0, z: -4.2 },
      color: '#FBBF24',
      physics: { enabled: false, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(38, 'Luz_Poste_2', 'PointLight', 'Sphere', {
      position: { x: 12.0, y: 6.0, z: 3.8 },
      color: '#60A5FA',
      physics: { enabled: false, useGravity: false, isStatic: true },
    }),
    makeBaseEntity(39, 'Luz_Poste_3', 'PointLight', 'Sphere', {
      position: { x: 28.0, y: 6.0, z: -3.5 },
      color: '#F87171',
      physics: { enabled: false, useGravity: false, isStatic: true },
    }),
  ];
}

export function getDefaultDemoProjects(): KodaProject[] {
  const now = new Date().toLocaleDateString('pt-BR');
  return [
    {
      id: 'proj_briga_rua_3d',
      name: 'Briga de Rua 3D',
      mode: '3D',
      iconId: 'sword',
      iconColor: '#EF4444',
      updatedAt: now,
      inputSettings: { ...DEFAULT_INPUT_SETTINGS },
      entities: createStarterEntities('3D'),
      scripts: JSON.parse(JSON.stringify(INITIAL_SCRIPTS)),
      transitions: JSON.parse(JSON.stringify(DEFAULT_ANIMATOR_TRANSITIONS)),
    },
    {
      id: 'proj_tiro_2d',
      name: 'Tiro 2D: Invasão',
      mode: '2D',
      iconId: 'rocket',
      iconColor: '#8B5CF6',
      updatedAt: now,
      inputSettings: { ...DEFAULT_INPUT_SETTINGS },
      entities: createStarterEntities('2D'),
      scripts: JSON.parse(JSON.stringify(INITIAL_SCRIPTS)),
      transitions: JSON.parse(JSON.stringify(DEFAULT_ANIMATOR_TRANSITIONS)),
    },
  ];
}

function normalizeLoadedProjects(projects: KodaProject[]): KodaProject[] {
  return projects.map((proj) => {
    const nextEntities = proj.entities.map((ent) => {
      let updated = ent;
      if ((ent.kind === 'Rig3D' || ent.kind === 'Rig2D') && (!ent.animator.states || ent.animator.states.length === 0)) {
        updated = {
          ...updated,
          animator: {
            ...updated.animator,
            states: JSON.parse(JSON.stringify(DEFAULT_ANIMATOR_STATES)),
          },
        };
      }
      if (proj.id === 'proj_briga_rua_3d') {
        if (ent.name === 'Rua_Asfalto' && ent.position.y === 0) {
          updated = { ...updated, position: { ...updated.position, y: -0.02 } };
        } else if ((ent.name === 'Calcada_Fundo' || ent.name === 'Calcada_Frente') && ent.position.y === 0.25 && ent.scale.y === 0.5) {
          updated = {
            ...updated,
            position: { ...updated.position, y: 0.22 },
            scale: { ...updated.scale, y: 0.44 },
          };
        }
      }
      if (proj.id === 'proj_tiro_2d') {
        if ((ent.name === 'Drone_3D_1' || ent.name === 'Drone_3D_2') && (!ent.visualArchetype || ent.visualArchetype === 'default')) {
          updated = {
            ...updated,
            visualArchetype: 'drone',
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1.1, y: 1.1, z: 1.1 },
          };
        } else if (ent.kind === 'Sprite2D' && ent.sprite?.sourceUrl?.startsWith('data:image/svg+xml')) {
          const n = ent.name.toLowerCase();
          const pngUrl = n.includes('atirador')
            ? BUILTIN_SPRITE_HERO
            : n.includes('aranha')
            ? BUILTIN_SPRITE_SPIDER
            : n.includes('lata')
            ? BUILTIN_SPRITE_CAN
            : n.includes('chefe')
            ? BUILTIN_SPRITE_BOSS_ZOMBIE
            : n.includes('zumbi')
            ? BUILTIN_SPRITE_SLIME
            : n.includes('kit')
            ? BUILTIN_SPRITE_COIN
            : n.includes('bandeira')
            ? BUILTIN_SPRITE_FLAG
            : ent.sprite.sourceUrl;
          updated = { ...updated, sprite: { ...ent.sprite, sourceUrl: pngUrl } };
        }
      }
      return updated;
    });
    return { ...proj, entities: nextEntities };
  });
}

export function loadProjects(): KodaProject[] {
  try {
    // Se V5 já existe (mesmo vazio []), respeita exclusões do usuário inclusive dos demos!
    const rawV5 = localStorage.getItem(STORAGE_KEY_V5);
    if (rawV5 !== null) {
      const parsed = JSON.parse(rawV5);
      if (Array.isArray(parsed)) return normalizeLoadedProjects(parsed);
    }

    const defaults = getDefaultDemoProjects();
    const rawPrev =
      localStorage.getItem(STORAGE_KEY_V4) ??
      localStorage.getItem(STORAGE_KEY_V3) ??
      localStorage.getItem(STORAGE_KEY_V2) ??
      localStorage.getItem(STORAGE_KEY_V1);

    if (rawPrev) {
      const parsedPrev = JSON.parse(rawPrev);
      if (Array.isArray(parsedPrev)) {
        const customUserProjects = parsedPrev.filter(
          (p: KodaProject) =>
            p.id !== 'proj_aventura_3d' &&
            p.id !== 'proj_plataforma_2d' &&
            p.id !== 'proj_briga_rua_3d' &&
            p.id !== 'proj_tiro_2d'
        );
        const merged = normalizeLoadedProjects([...customUserProjects, ...defaults]);
        saveProjects(merged);
        return merged;
      }
    }

    saveProjects(defaults);
    return defaults;
  } catch {
    return getDefaultDemoProjects();
  }
}

export function saveProjects(projects: KodaProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(projects));
  } catch {
    // Ignora caso localStorage esteja cheio
  }
}

export function parseImportedProjectJson(rawText: string, fileName: string): KodaProject {
  const parsed = JSON.parse(rawText);
  const baseName = fileName.replace(/\.(kproj|kscene|json)$/i, '') || 'Projeto Importado';
  const now = new Date().toLocaleDateString('pt-BR');

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entities)) {
    return {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: typeof parsed.name === 'string' && parsed.name ? parsed.name : baseName,
      mode: parsed.mode === '2D' ? '2D' : '3D',
      iconId: (parsed.iconId as ProjectIconId) || 'box',
      iconColor: typeof parsed.iconColor === 'string' ? parsed.iconColor : '#0EA5E9',
      customIconUrl: typeof parsed.customIconUrl === 'string' ? parsed.customIconUrl : undefined,
      updatedAt: now,
      inputSettings: parsed.inputSettings ?? { ...DEFAULT_INPUT_SETTINGS },
      entities: parsed.entities,
      scripts: Array.isArray(parsed.scripts) ? parsed.scripts : JSON.parse(JSON.stringify(INITIAL_SCRIPTS)),
      transitions: Array.isArray(parsed.transitions)
        ? parsed.transitions
        : JSON.parse(JSON.stringify(DEFAULT_ANIMATOR_TRANSITIONS)),
    };
  }

  throw new Error('Arquivo de projeto inválido. Use um .kproj ou .kscene válido.');
}
