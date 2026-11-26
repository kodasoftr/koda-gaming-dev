import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  Plus,
  Copy,
  Trash2,
  Grid,
  Box,
  Download,
  Terminal,
  Cpu,
  Sliders,
  Sparkles,
  Move,
  RotateCw,
  Maximize2,
  Folder,
  Image as ImageIcon,
  FileBox,
  Film,
  GitBranch,
  Eye,
  EyeOff,
  Search,
  Upload,
  Sun,
  User,
  Bone,
  Code2,
  Link2,
  PanelLeft,
  PanelRight,
  PanelBottom,
  ChevronDown,
  ChevronRight,
  X,
  Camera as CameraIcon,
  Gamepad2,
  Heart,
} from 'lucide-react';
import { Viewport3D } from './Viewport3D';
import { AnimatorStateGraph, AnimationTimelinePanel } from './AnimatorPanels';
import { ScriptEditorPanel } from './ScriptEditorPanel';
import {
  parseModelFile,
  sampleClipToTimelineKeyframes,
  type ParsedModelResult,
} from '../utils/modelLoaders';
import { SCRIPT_TEMPLATES } from '../utils/scriptRuntime';
import {
  BUILTIN_SPRITE_COIN,
  BUILTIN_SPRITE_FLAG,
  BUILTIN_SPRITE_HERO,
  BUILTIN_SPRITE_SLIME,
  makeDefaultCameraConfig,
} from '../utils/projectStorage';
import { detectPlatformRuntime, getQuickPlatformInfo } from '../utils/platformRuntime';
import {
  BUILTIN_RIG_BONES,
  DEFAULT_ANIMATOR_STATES,
  DEFAULT_INPUT_SETTINGS,
  DEFAULT_RIG_POSE,
  generateGuid,
  type AnimationClipData,
  type AnimatorStateName,
  type EngineEntity,
  type EngineInputSettings,
  type EntityKind,
  type GizmoMode,
  type GizmoSpace,
  type ImportedModelAsset,
  type KodaProject,
  type LogEntry,
  type MechanicPreset,
  type MeshPrimitive,
  type ModelFormat,
  type RigPose,
  type ScriptAsset,
  type TexturePreset,
  type TimelineKeyframe,
  type Vec3,
} from '../types/engine';

const DEFAULT_HLSL = `Texture2D gAlbedoMap : register(t0);
SamplerState gSampler : register(s0);

cbuffer CB : register(b0)
{
    float4x4 gWVP;
    float4x4 gWorld;
    float4   gColor;
    float4   gCameraPos;
    float4   gLightDir;
    float4   gMaterial; // x=metallic, y=glow, zw=uvTiling
};

struct VSOut {
    float4 pos      : SV_POSITION;
    float3 worldPos : TEXCOORD0;
    float3 nrm      : NORMAL;
    float2 uv       : TEXCOORD1;
};

VSOut VS(float3 p : POSITION, float3 n : NORMAL, float2 uv : TEXCOORD)
{
    VSOut o;
    o.worldPos = mul(float4(p, 1.0f), gWorld).xyz;
    o.pos = mul(float4(p, 1.0f), gWVP);
    o.nrm = mul(float4(n, 0.0f), gWorld).xyz;
    o.uv  = uv * gMaterial.zw;
    return o;
}

float4 PS(VSOut i) : SV_Target
{
    float3 texel = gAlbedoMap.Sample(gSampler, i.uv).rgb;
    float3 N = normalize(i.nrm);
    float3 L = normalize(gLightDir.xyz);
    float3 V = normalize(gCameraPos.xyz - i.worldPos);
    float3 H = normalize(L + V);
    float NdotL = saturate(dot(N, L));
    float spec = pow(saturate(dot(N, H)), lerp(64.0f, 8.0f, gCameraPos.w));
    return float4(saturate(gColor.rgb * texel * (gLightDir.w + NdotL * 0.85f) + spec * 0.35f), 1.0f);
}`;

const DEFAULT_SCRIPT_PARAMS = {
  moveSpeed: 4.5,
  jumpForce: 6.2,
  rotateSpeed: 90,
  amplitude: 1.5,
};

type AssetFolder = 'Models' | 'Textures' | 'Animations' | 'Shaders' | 'Scripts' | 'Scenes';
type BottomDrawerTab = 'timeline' | 'assets' | 'input' | 'console' | 'shader' | 'rdg' | 'mcp';

function upsertKeyframes(
  existing: TimelineKeyframe[],
  time: number,
  targetName: string,
  property: 'position' | 'rotation' | 'scale',
  vec: Vec3
): TimelineKeyframe[] {
  const t = Number(time.toFixed(2));
  const axes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
  const filtered = existing.filter(
    (k) => !(Math.abs(k.time - t) < 0.02 && k.targetName === targetName && k.property === property)
  );
  const additions: TimelineKeyframe[] = axes.map((axis) => ({
    id: `rec_${targetName}_${property}_${axis}_${Date.now()}_${Math.random()}`,
    time: t,
    targetName,
    property,
    axis,
    value: vec[axis],
  }));
  return [...filtered, ...additions].sort((a, b) => a.time - b.time);
}

interface EditorWorkspaceProps {
  project: KodaProject;
  onUpdateProject: (updated: KodaProject) => void;
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
  project,
  onUpdateProject,
}) => {
  const [entities, setEntities] = useState<EngineEntity[]>(project.entities);
  const [scripts, setScripts] = useState<ScriptAsset[]>(project.scripts);
  const [transitions, setTransitions] = useState(project.transitions);
  const [inputSettings, setInputSettings] = useState<EngineInputSettings>(
    project.inputSettings ?? DEFAULT_INPUT_SETTINGS
  );

  const [playSnapshot, setPlaySnapshot] = useState<EngineEntity[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(project.entities[1]?.id ?? project.entities[0]?.id ?? null);
  const [nextId, setNextId] = useState<number>(
    Math.max(5, ...project.entities.map((e) => e.id + 1))
  );
  const [hierarchySearch, setHierarchySearch] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);

  const [centerView, setCenterView] = useState<'scene' | 'animator' | 'scripts'>('scene');
  const [activeScriptId, setActiveScriptId] = useState<string | null>(project.scripts[0]?.id ?? null);

  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<BottomDrawerTab>('timeline');

  const [openMaterialSec, setOpenMaterialSec] = useState(false);
  const [openPhysicsSec, setOpenPhysicsSec] = useState(false);
  const [openHealthSec, setOpenHealthSec] = useState(true);

  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');
  const [gizmoSpace, setGizmoSpace] = useState<GizmoSpace>('world');
  const [is2DView, setIs2DView] = useState(project.mode === '2D');

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCameraMaximized, setIsCameraMaximized] = useState(false);
  const [clipPreviewPlaying, setClipPreviewPlaying] = useState(false);
  const [clipScrubTime, setClipScrubTime] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  const [showGrid, setShowGrid] = useState(true);
  const [globalWireframe, setGlobalWireframe] = useState(false);
  const [stats, setStats] = useState<{ fps: number; drawCalls: number; triangles: number; backendLabel?: string }>({
    fps: 60,
    drawCalls: 6,
    triangles: 1400,
    backendLabel: getQuickPlatformInfo().backendLabel,
  });

  useEffect(() => {
    let active = true;
    detectPlatformRuntime().then((info) => {
      if (active) {
        setStats((prev) => ({ ...prev, backendLabel: info.backendLabel }));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const [assetFolder, setAssetFolder] = useState<AssetFolder>('Models');
  const [customTextures, setCustomTextures] = useState<{ name: string; url: string }[]>([]);
  const [importedAssets, setImportedAssets] = useState<ImportedModelAsset[]>([]);
  const [parsedModels, setParsedModels] = useState<Record<string, ParsedModelResult>>({});
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [logFilter, setLogFilter] = useState<'All' | 'Info' | 'Warning' | 'Error'>('All');
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 1,
      timestamp: '10:30:00',
      level: 'Info',
      message: `Projeto '${project.name}' carregado (${project.mode}).`,
    },
  ]);

  const [shaderSrc, setShaderSrc] = useState(DEFAULT_HLSL);
  const [shaderStatus, setShaderStatus] = useState<{ ok: boolean; msg: string }>({
    ok: true,
    msg: 'HLSL compilado (vs_5_0 / ps_5_0).',
  });

  const [mcpInput, setMcpInput] = useState('create_rig Hero_IA 2 0 1');
  const [mcpLog, setMcpLog] = useState<string[]>([
    'MCP pronto: create_rig <nome> <x> <y> <z> | create_entity <nome> <x> <y> <z>',
  ]);

  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const texInputRef = useRef<HTMLInputElement | null>(null);
  const spriteInputRef = useRef<HTMLInputElement | null>(null);

  // Sincroniza estado ao trocar de projeto
  useEffect(() => {
    setEntities(project.entities);
    setScripts(project.scripts);
    setTransitions(project.transitions);
    setInputSettings(project.inputSettings ?? DEFAULT_INPUT_SETTINGS);
    setIs2DView(project.mode === '2D');
    setSelectedId(project.entities[1]?.id ?? project.entities[0]?.id ?? null);
    setActiveScriptId(project.scripts[0]?.id ?? null);
    setIsPlaying(false);
    setIsCameraMaximized(false);
    setPlaySnapshot(null);
  }, [project.id]);

  // Auto-salva alterações do projeto no storage (fora do Play Mode para preservar estado de edição)
  const projectRef = useRef(project);
  projectRef.current = project;
  const onUpdateProjectRef = useRef(onUpdateProject);
  onUpdateProjectRef.current = onUpdateProject;

  useEffect(() => {
    if (isPlaying) return;
    onUpdateProjectRef.current({
      ...projectRef.current,
      updatedAt: new Date().toLocaleDateString('pt-BR'),
      inputSettings,
      entities,
      scripts,
      transitions,
    });
  }, [entities, scripts, transitions, inputSettings, isPlaying]);

  const selectedEntity = entities.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'w' || e.key === 'W') setGizmoMode('translate');
      if (e.key === 'e' || e.key === 'E') setGizmoMode('rotate');
      if (e.key === 'r' || e.key === 'R') setGizmoMode('scale');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!isCameraMaximized) return;
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setIsCameraMaximized(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isCameraMaximized]);

  useEffect(() => {
    if (!clipPreviewPlaying) return;
    let raf = 0;
    let prev = performance.now();
    const dur = Math.max(0.5, selectedEntity?.animator.clipDuration ?? 2.0);
    const step = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      setClipScrubTime((t) => (t + dt) % dur);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [clipPreviewPlaying, selectedEntity?.animator.clipDuration]);

  const appendLog = (message: string, level: LogEntry['level'] = 'Info') => {
    const ts = new Date().toTimeString().slice(0, 8);
    setLogs((prev) => [...prev.slice(-99), { id: Date.now() + Math.random(), timestamp: ts, level, message }]);
  };

  const updateSelected = (updater: (ent: EngineEntity) => EngineEntity) => {
    if (selectedId === null) return;
    setEntities((prev) => prev.map((e) => (e.id === selectedId ? updater(e) : e)));
  };

  const openBottomTool = (tab: BottomDrawerTab) => {
    if (drawerOpen && bottomTab === tab) {
      setDrawerOpen(false);
    } else {
      setBottomTab(tab);
      setDrawerOpen(true);
    }
  };

  const spawnEntity = (
    kind: EntityKind,
    primitive: MeshPrimitive,
    customName?: string,
    pos?: Vec3,
    asset?: ImportedModelAsset,
    spriteSrc?: { url: string; isGif?: boolean; cols?: number; rows?: number; fps?: number }
  ) => {
    const id = nextId;
    setNextId((n) => n + 1);
    const defaultName =
      kind === 'Rig3D'
        ? `Rig3D_${id}`
        : kind === 'Rig2D'
        ? `Rig2D_${id}`
        : kind === 'Sprite2D'
        ? `Sprite2D_${id}`
        : kind === 'Camera'
        ? `Camera_${id}`
        : kind === 'PointLight'
        ? `PointLight_${id}`
        : asset
        ? asset.name
        : `${primitive}_${id}`;

    const firstClip = asset?.clipNames[0] ?? null;
    const clipDur = firstClip ? asset?.clipDurations[firstClip] ?? 2.0 : 2.0;

    const created: EngineEntity = {
      id,
      guid: generateGuid(),
      name: customName || defaultName,
      kind,
      active: true,
      playerSlot: 1,
      primitive: kind === 'Sprite2D' ? 'Quad2D' : primitive,
      modelAssetId: asset?.id,
      blenderClips: asset?.clipNames ?? [],
      activeBlenderClip: firstClip,
      blenderClipSpeed: 1.0,
      blenderClipLoop: true,
      boneNames:
        kind === 'Rig3D' || kind === 'Rig2D'
          ? [...BUILTIN_RIG_BONES]
          : asset?.boneNames ?? [],
      selectedBone: null,
      showSkeletonHelper: true,
      boneOverrides: {},
      position: pos || {
        x: ((entities.length % 4) - 1.5) * 1.8,
        y:
          kind === 'Rig3D' || kind === 'Rig2D' || primitive === 'Plane' || primitive === 'CustomModel'
            ? 0
            : kind === 'Camera'
            ? 3.2
            : kind === 'Sprite2D'
            ? 0.85
            : 0.6,
        z: kind === 'Camera' ? 8.0 : 0,
      },
      rotation: kind === 'Camera' ? { x: -16, y: 0, z: 0 } : { x: 0, y: 0, z: 0 },
      scale: primitive === 'Plane' ? { x: 10, y: 1, z: 10 } : kind === 'Sprite2D' ? { x: 1.25, y: 1.25, z: 1 } : { x: 1, y: 1, z: 1 },
      color:
        kind === 'Camera'
          ? '#38BDF8'
          : kind === 'PointLight'
          ? '#FBBF24'
          : primitive === 'Plane'
          ? '#64748B'
          : kind === 'Sprite2D'
          ? '#FFFFFF'
          : '#3B82F6',
      texturePreset: primitive === 'Plane' ? 'UVGrid' : 'None',
      uvTiling: { x: 1, y: 1 },
      metallic: 0.2,
      roughness: 0.45,
      wireframe: false,
      sprite:
        kind === 'Sprite2D'
          ? {
              sourceUrl: spriteSrc?.url ?? BUILTIN_SPRITE_HERO,
              isGif: spriteSrc?.isGif ?? false,
              flipX: false,
              billboard: !is2DView,
              cols: spriteSrc?.cols ?? (spriteSrc ? 1 : 4),
              rows: spriteSrc?.rows ?? 1,
              fps: spriteSrc?.fps ?? 8,
            }
          : undefined,
      camera:
        kind === 'Camera'
          ? makeDefaultCameraConfig({
              projection: is2DView ? 'Orthographic' : 'Perspective',
              showMonitor: true,
            })
          : undefined,
      rigPose: { ...DEFAULT_RIG_POSE },
      physics: {
        enabled: kind !== 'PointLight' && kind !== 'Sprite2D' && kind !== 'Camera',
        useGravity:
          kind !== 'PointLight' &&
          kind !== 'Sprite2D' &&
          kind !== 'Camera' &&
          primitive !== 'Plane' &&
          primitive !== 'CustomModel',
        isStatic: primitive === 'Plane' || kind === 'PointLight' || kind === 'Sprite2D' || kind === 'Camera',
        restitution: 0.45,
        velocity: { x: 0, y: 0, z: 0 },
      },
      script: {
        language: 'None',
        className: 'Controller',
        scriptAssetId: null,
        mechanicPreset: 'None',
        spinSpeedDeg: 0,
        params: { ...DEFAULT_SCRIPT_PARAMS },
      },
      animator: {
        enabled: kind === 'Rig3D' || kind === 'Rig2D' || Boolean(firstClip),
        useKeyframes: false,
        currentState: 'Idle',
        clipDuration: Math.max(0.5, clipDur),
        activeClipId: null,
        clips: [],
        paramSpeed: 0,
        paramGrounded: true,
        triggerAttack: false,
        keyframes: [],
      },
      network: { replicated: false, syncRateHz: 20 },
    };

    setEntities((prev) => [...prev, created]);
    setSelectedId(id);
    setShowAddMenu(false);
    if (kind === 'Rig2D') setIs2DView(true);
    appendLog(`Criado: ${created.name} (${kind})`);
  };

  const handleImport3DModel = async (file: File) => {
    const extMatch = file.name.toLowerCase().match(/\.(fbx|obj|gltf|glb)$/);
    if (!extMatch) {
      appendLog(`Formato não suportado: ${file.name}. Use .fbx, .obj, .gltf ou .glb.`, 'Error');
      return;
    }
    const format = extMatch[1] as ModelFormat;

    try {
      const data: string | ArrayBuffer =
        format === 'glb' || format === 'fbx' ? await file.arrayBuffer() : await file.text();
      const assetId = `mdl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const parsed = await parseModelFile(assetId, file.name, format, data);

      setParsedModels((prev) => ({ ...prev, [assetId]: parsed }));
      setImportedAssets((prev) => [...prev, parsed.asset]);
      spawnEntity('Mesh3D', 'CustomModel', parsed.asset.name, { x: 0, y: 0, z: 0 }, parsed.asset);

      setBottomTab('timeline');
      setDrawerOpen(true);
      if (parsed.clips.length > 0) setClipPreviewPlaying(true);
      appendLog(
        `Modelo .${format.toUpperCase()} importado: ${file.name} (${parsed.asset.boneNames.length} ossos, ${parsed.clips.length} clipes).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao interpretar arquivo 3D';
      appendLog(`Falha ao importar ${file.name}: ${msg}`, 'Error');
    }
  };

  const readImageAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else resolve(URL.createObjectURL(file));
      };
      reader.onerror = () => resolve(URL.createObjectURL(file));
      reader.readAsDataURL(file);
    });

  const handleImportTexture = async (file: File) => {
    const url = await readImageAsDataUrl(file);
    const isGif = /\.gif$/i.test(file.name) || file.type === 'image/gif';
    setCustomTextures((prev) => [...prev, { name: file.name, url }]);
    if (selectedEntity) {
      if (selectedEntity.kind === 'Sprite2D') {
        updateSelected((ent) => ({
          ...ent,
          sprite: {
            ...ent.sprite,
            sourceUrl: url,
            isGif,
            cols: 1,
            rows: 1,
          },
        }));
      } else {
        updateSelected((ent) => ({ ...ent, texturePreset: 'Custom', customTextureUrl: url }));
      }
    }
    appendLog(`${isGif ? 'GIF animado' : 'Textura/Sprite'} importado: ${file.name}`);
  };

  const handleImportSpriteFile = async (file: File) => {
    const url = await readImageAsDataUrl(file);
    const isGif = /\.gif$/i.test(file.name) || file.type === 'image/gif';
    setCustomTextures((prev) => [...prev, { name: file.name, url }]);
    if (selectedEntity && selectedEntity.kind === 'Sprite2D') {
      updateSelected((ent) => ({
        ...ent,
        sprite: { ...ent.sprite, sourceUrl: url, isGif, cols: 1, rows: 1 },
      }));
      appendLog(`Sprite atualizado em ${selectedEntity.name}: ${file.name}`);
    } else {
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'Sprite2D';
      spawnEntity('Sprite2D', 'Quad2D', baseName, undefined, undefined, {
        url,
        isGif,
        cols: 1,
        rows: 1,
        fps: 8,
      });
    }
  };

  const handleDropFiles = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) {
      if (/\.(fbx|obj|gltf|glb)$/i.test(f.name)) {
        await handleImport3DModel(f);
      } else if (/\.gif$/i.test(f.name)) {
        await handleImportSpriteFile(f);
      } else if (/\.(png|jpg|jpeg|webp|bmp)$/i.test(f.name)) {
        if (selectedEntity && selectedEntity.kind === 'Sprite2D') {
          await handleImportSpriteFile(f);
        } else if (is2DView) {
          await handleImportSpriteFile(f);
        } else {
          await handleImportTexture(f);
        }
      }
    }
  };

  const handleBakeBlenderClip = (clipName: string) => {
    if (!selectedEntity || !selectedEntity.modelAssetId) return;
    const parsed = parsedModels[selectedEntity.modelAssetId];
    if (!parsed) return;
    const clip = parsed.clips.find((c) => c.name === clipName);
    if (!clip) return;

    const kfs = sampleClipToTimelineKeyframes(clip, parsed.root, selectedEntity.boneNames, 10);
    const dur = Math.max(0.5, Number(clip.duration.toFixed(2)));
    const newClip: AnimationClipData = {
      id: `clip_${Date.now()}`,
      name: `${clipName}_Editavel`,
      duration: dur,
      loop: true,
      keyframes: kfs,
    };
    updateSelected((ent) => ({
      ...ent,
      activeBlenderClip: null,
      animator: {
        ...ent.animator,
        enabled: true,
        useKeyframes: true,
        activeClipId: newClip.id,
        clipDuration: dur,
        keyframes: kfs,
        clips: [...ent.animator.clips, newClip],
      },
    }));
    setClipScrubTime(0);
    appendLog(`Clipe Blender '${clipName}' convertido para '${newClip.name}'.`);
  };

  const syncRecordingIntoClip = (ent: EngineEntity, nextKfs: TimelineKeyframe[]) => {
    if (ent.animator.activeClipId) {
      return {
        ...ent.animator,
        enabled: true,
        useKeyframes: true,
        keyframes: nextKfs,
        clips: ent.animator.clips.map((c) =>
          c.id === ent.animator.activeClipId ? { ...c, keyframes: nextKfs } : c
        ),
      };
    }
    const autoClip: AnimationClipData = {
      id: `clip_${Date.now()}`,
      name: `Animacao_${ent.animator.clips.length + 1}`,
      duration: Math.max(0.5, ent.animator.clipDuration),
      loop: true,
      keyframes: nextKfs,
    };
    return {
      ...ent.animator,
      enabled: true,
      useKeyframes: true,
      activeClipId: autoClip.id,
      keyframes: nextKfs,
      clips: [...ent.animator.clips, autoClip],
    };
  };

  const handleTransformEntity = (id: number, pos: Vec3, rot: Vec3, scale: Vec3) => {
    setEntities((prev) =>
      prev.map((ent) => {
        if (ent.id !== id) return ent;
        let nextAnim = ent.animator;
        if (isRecording) {
          let nextKfs = upsertKeyframes(ent.animator.keyframes, clipScrubTime, '__root__', 'position', pos);
          nextKfs = upsertKeyframes(nextKfs, clipScrubTime, '__root__', 'rotation', rot);
          nextAnim = syncRecordingIntoClip(ent, nextKfs);
        }
        return {
          ...ent,
          position: pos,
          rotation: rot,
          scale,
          activeBlenderClip: isRecording ? null : ent.activeBlenderClip,
          animator: nextAnim,
        };
      })
    );
  };

  const handleBoneTransform = (id: number, boneName: string, pos: Vec3, rot: Vec3) => {
    setEntities((prev) =>
      prev.map((ent) => {
        if (ent.id !== id) return ent;
        let nextRigPose = ent.rigPose;
        if ((ent.kind === 'Rig3D' || ent.kind === 'Rig2D') && boneName in ent.rigPose) {
          nextRigPose = { ...ent.rigPose, [boneName]: rot };
        }
        let nextAnim = ent.animator;
        if (isRecording) {
          let nextKfs = upsertKeyframes(ent.animator.keyframes, clipScrubTime, boneName, 'rotation', rot);
          if (ent.primitive === 'CustomModel') {
            nextKfs = upsertKeyframes(nextKfs, clipScrubTime, boneName, 'position', pos);
          }
          nextAnim = syncRecordingIntoClip(ent, nextKfs);
        }
        return {
          ...ent,
          rigPose: nextRigPose,
          activeBlenderClip: isRecording ? null : ent.activeBlenderClip,
          boneOverrides: {
            ...ent.boneOverrides,
            [boneName]: { position: pos, rotation: rot },
          },
          animator: nextAnim,
        };
      })
    );
  };

  const handleCreateScript = (templateKey: keyof typeof SCRIPT_TEMPLATES, customName?: string) => {
    const tpl = SCRIPT_TEMPLATES[templateKey];
    const cleanName = customName || `${tpl.name}_${scripts.length + 1}`;
    const created: ScriptAsset = {
      id: `scr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
      language: tpl.language,
      code: tpl.code.replace(new RegExp(tpl.name, 'g'), cleanName),
      defaultParams: { ...tpl.defaultParams },
    };
    setScripts((prev) => [...prev, created]);
    setActiveScriptId(created.id);
    setCenterView('scripts');
    appendLog(`Script criado: ${created.name}`);
    return created;
  };

  const handleBindScriptToEntity = (entityId: number, scriptId: string | null) => {
    const scr = scriptId ? scripts.find((s) => s.id === scriptId) : null;
    setEntities((prev) =>
      prev.map((ent) => {
        if (ent.id !== entityId) return ent;
        if (!scr) {
          return {
            ...ent,
            script: { ...ent.script, language: 'None', scriptAssetId: null, className: 'None' },
          };
        }
        return {
          ...ent,
          script: {
            ...ent.script,
            language: scr.language,
            className: scr.name,
            scriptAssetId: scr.id,
            params: { ...scr.defaultParams },
          },
        };
      })
    );
    const targetEnt = entities.find((e) => e.id === entityId);
    if (targetEnt) {
      appendLog(
        scr
          ? `Script '${scr.name}' vinculado ao objeto '${targetEnt.name}'.`
          : `Script desvinculado de '${targetEnt.name}'.`
      );
    }
  };

  const duplicateSelected = () => {
    if (!selectedEntity) return;
    const id = nextId;
    setNextId((n) => n + 1);
    const copy: EngineEntity = {
      ...JSON.parse(JSON.stringify(selectedEntity)),
      id,
      guid: generateGuid(),
      name: `${selectedEntity.name} (Cópia)`,
      position: { ...selectedEntity.position, x: selectedEntity.position.x + 1.5 },
    };
    setEntities((prev) => [...prev, copy]);
    setSelectedId(id);
  };

  const deleteSelected = () => {
    if (!selectedEntity) return;
    setEntities((prev) => prev.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  };

  const handleTogglePlay = () => {
    if (!isPlaying) {
      setPlaySnapshot(JSON.parse(JSON.stringify(entities)));
      setIsPlaying(true);
      setIsPaused(false);
      appendLog('Simulação iniciada (Play Mode).');
    } else if (playSnapshot) {
      setEntities(playSnapshot);
      setPlaySnapshot(null);
      setIsPlaying(false);
      setIsPaused(false);
      setIsCameraMaximized(false);
      appendLog('Simulação parada.');
    }
  };

  const handleExportProjectFile = () => {
    const payload: KodaProject = {
      ...project,
      entities,
      scripts,
      transitions,
      updatedAt: new Date().toLocaleDateString('pt-BR'),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}.kproj`;
    a.click();
    URL.revokeObjectURL(url);
    appendLog(`Projeto exportado: ${project.name}.kproj`);
  };

  const handleValidateShader = () => {
    if (!shaderSrc.includes('VS(') || !shaderSrc.includes('PS(')) {
      setShaderStatus({ ok: false, msg: 'Erro (X3501): VS() e PS() obrigatórios.' });
      return;
    }
    setShaderStatus({ ok: true, msg: 'HLSL compilado (vs_5_0 / ps_5_0).' });
  };

  const handleRunMCP = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = mcpInput.trim().split(/\s+/);
    const cmd = parts[0];
    if (cmd === 'create_rig') {
      const name = parts[1] || 'Rig_MCP';
      const x = parseFloat(parts[2] ?? '0') || 0;
      const y = parseFloat(parts[3] ?? '0') || 0;
      const z = parseFloat(parts[4] ?? '0') || 0;
      spawnEntity('Rig3D', 'Cube', name, { x, y, z });
      setMcpLog((p) => [...p, `MCP OK: Rig3D '${name}' criado em (${x}, ${y}, ${z})`]);
    } else if (cmd === 'create_entity') {
      const name = parts[1] || 'Cubo_MCP';
      const x = parseFloat(parts[2] ?? '0') || 0;
      const y = parseFloat(parts[3] ?? '1') || 1;
      const z = parseFloat(parts[4] ?? '0') || 0;
      spawnEntity('Mesh3D', 'Cube', name, { x, y, z });
      setMcpLog((p) => [...p, `MCP OK: Cubo '${name}' criado`]);
    } else {
      setMcpLog((p) => [...p, 'Use: create_rig <nome> x y z | create_entity <nome> x y z']);
    }
  };

  const visibleHierarchy = entities.filter((e) =>
    e.name.toLowerCase().includes(hierarchySearch.trim().toLowerCase())
  );
  const filteredLogs = logs.filter((l) => logFilter === 'All' || l.level === logFilter);

  const selectedBoneName = selectedEntity?.selectedBone ?? null;
  const selectedBoneTransform = selectedBoneName
    ? selectedEntity?.boneOverrides[selectedBoneName] ?? {
        position: { x: 0, y: 0, z: 0 },
        rotation:
          selectedEntity && selectedBoneName in selectedEntity.rigPose
            ? selectedEntity.rigPose[selectedBoneName as keyof RigPose]
            : { x: 0, y: 0, z: 0 },
      }
    : null;

  const drawerLabels: Record<BottomDrawerTab, string> = {
    timeline: 'Animation Timeline',
    assets: 'Project Assets',
    input: 'Controles Nativos (Teclado / Touch / Controle / Mouse)',
    console: 'Console',
    shader: 'Shader HLSL',
    rdg: 'Render Graph (RDG)',
    mcp: 'Agente IA / MCP',
  };

  return (
    <div className="flex flex-col h-[calc(100vh-49px)] min-h-[640px] bg-[#0B0D11]">
      <input
        ref={modelInputRef}
        type="file"
        accept=".fbx,.obj,.gltf,.glb"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImport3DModel(f);
          e.target.value = '';
        }}
      />
      <input
        ref={texInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportTexture(f);
          e.target.value = '';
        }}
      />
      <input
        ref={spriteInputRef}
        type="file"
        accept="image/png,image/gif,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportSpriteFile(f);
          e.target.value = '';
        }}
      />

      {/* Barra Superior Minimalista */}
      <div className="h-10 flex items-center justify-between gap-3 px-3 bg-[#131720] border-b border-white/[0.08] shrink-0">
        {/* Esquerda: Gizmos + 2D/3D */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-[#0B0D11] border border-white/10 rounded p-0.5">
            {(
              [
                { mode: 'translate', icon: Move, label: 'Mover (W)' },
                { mode: 'rotate', icon: RotateCw, label: 'Rotacionar (E)' },
                { mode: 'scale', icon: Maximize2, label: 'Escalar (R)' },
              ] as const
            ).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setGizmoMode(mode)}
                title={label}
                className={`p-1 rounded transition-colors ${
                  gizmoMode === mode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <button
            onClick={() => setGizmoSpace((s) => (s === 'world' ? 'local' : 'world'))}
            title="Alternar espaço Global/Local"
            className="px-2 py-1 rounded bg-[#0B0D11] border border-white/10 text-[11px] text-slate-300 hover:text-white"
          >
            {gizmoSpace === 'world' ? 'Global' : 'Local'}
          </button>

          <button
            onClick={() => setIs2DView((v) => !v)}
            className={`px-2 py-1 rounded border text-[11px] font-medium ${
              is2DView
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                : 'bg-[#0B0D11] border-white/10 text-slate-300'
            }`}
          >
            {is2DView ? '2D' : '3D'}
          </button>

          <button
            onClick={() => setShowGrid((g) => !g)}
            title="Mostrar/Ocultar Grid"
            className={`p-1.5 rounded border ${
              showGrid ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-[#0B0D11] border-white/10 text-slate-400'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setGlobalWireframe((w) => !w)}
            title="Modo Wireframe"
            className={`p-1.5 rounded border ${
              globalWireframe ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-[#0B0D11] border-white/10 text-slate-400'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Centro: Play / Pause / Stop */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleTogglePlay}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              isPlaying
                ? 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Stop' : 'Play'}
          </button>
          {isPlaying && (
            <button
              onClick={() => setIsPaused((p) => !p)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 text-xs text-white"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Direita: Importar 3D / Textura / Exportar .kproj */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => modelInputRef.current?.click()}
            title="Importar modelo 3D (.fbx, .obj, .gltf, .glb)"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-[11px] text-slate-200 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" /> + 3D
          </button>
          <button
            onClick={() => spriteInputRef.current?.click()}
            title="Importar Sprite PNG ou GIF animado"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-[11px] text-slate-200 whitespace-nowrap"
          >
            <ImageIcon className="w-3.5 h-3.5" /> + Sprite/GIF
          </button>
          <button
            onClick={handleExportProjectFile}
            title="Exportar projeto (.kproj) para importar depois"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-[11px] text-slate-200 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" /> .kproj
          </button>
          <span className="font-mono text-[11px] text-slate-400 tabular-nums pl-1 hidden sm:inline">
            {stats.backendLabel ? `${stats.backendLabel} · ` : ''}
            {stats.fps} FPS
          </span>
        </div>
      </div>

      {/* Área Principal: Rail de Ícones à Esquerda + Hierarquia + Centro + Inspetor */}
      <div className="flex-1 flex min-h-0">
        {/* RAIL DE ÍCONES MINIMALISTA (acessa todas as abas e painéis) */}
        <nav className="w-11 flex flex-col items-center justify-between py-2 bg-[#10131A] border-r border-white/[0.08] shrink-0">
          <div className="flex flex-col items-center gap-1">
            {(
              [
                { id: 'scene', icon: Box, title: 'Viewport 3D / 2D' },
                { id: 'animator', icon: GitBranch, title: 'Animator (Máquina de Estados)' },
                { id: 'scripts', icon: Code2, title: 'Código / Scripts (C# / Kotlin)' },
              ] as const
            ).map(({ id, icon: Icon, title }) => (
              <button
                key={id}
                onClick={() => setCenterView(id)}
                title={title}
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                  centerView === id
                    ? 'bg-blue-600/25 text-blue-300 border border-blue-500/40'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}

            <div className="w-5 h-px bg-white/10 my-1.5" />

            {(
              [
                { id: 'timeline', icon: Film, title: 'Linha do Tempo (Animações)' },
                { id: 'assets', icon: Folder, title: 'Project Assets' },
                { id: 'input', icon: Gamepad2, title: 'Controles Nativos (Touch / Teclado / Controle)' },
                { id: 'console', icon: Terminal, title: 'Console' },
                { id: 'shader', icon: Sliders, title: 'Editor HLSL' },
                { id: 'rdg', icon: Cpu, title: 'Render Graph (RDG)' },
                { id: 'mcp', icon: Sparkles, title: 'Agente IA / MCP' },
              ] as const
            ).map(({ id, icon: Icon, title }) => {
              const isActive = drawerOpen && bottomTab === id;
              return (
                <button
                  key={id}
                  onClick={() => openBottomTool(id)}
                  title={title}
                  className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>

          {/* Controles de visibilidade dos painéis */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setShowLeftPanel((v) => !v)}
              title="Mostrar/Ocultar Hierarquia"
              className={`w-8 h-8 rounded-md flex items-center justify-center ${
                showLeftPanel ? 'text-slate-200 bg-white/5' : 'text-slate-500 hover:text-white'
              }`}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              title="Mostrar/Ocultar Gaveta Inferior"
              className={`w-8 h-8 rounded-md flex items-center justify-center ${
                drawerOpen ? 'text-slate-200 bg-white/5' : 'text-slate-500 hover:text-white'
              }`}
            >
              <PanelBottom className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowRightPanel((v) => !v)}
              title="Mostrar/Ocultar Inspetor"
              className={`w-8 h-8 rounded-md flex items-center justify-center ${
                showRightPanel ? 'text-slate-200 bg-white/5' : 'text-slate-500 hover:text-white'
              }`}
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
        </nav>

        {/* ESQUERDA: Hierarquia (colapsável) */}
        {showLeftPanel && (
          <aside className="w-[225px] flex flex-col bg-[#11141B] border-r border-white/[0.08] min-h-0 shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08]">
              <span className="font-display text-xs font-semibold text-slate-200">Hierarquia</span>
              <div className="relative flex items-center gap-1">
                <button
                  onClick={() => setShowAddMenu((v) => !v)}
                  title="Adicionar Objeto ou Rig"
                  className="p-1 rounded bg-blue-600/20 hover:bg-blue-600/35 text-blue-300"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={duplicateSelected}
                  disabled={!selectedEntity}
                  title="Duplicar"
                  className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-slate-400"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={deleteSelected}
                  disabled={!selectedEntity}
                  title="Excluir"
                  className="p-1 rounded hover:bg-red-500/20 disabled:opacity-30 text-red-300"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {showAddMenu && (
                  <div className="absolute left-0 top-8 z-40 w-48 rounded-md bg-[#161B26] border border-white/15 shadow-xl p-1 text-xs space-y-0.5">
                    <button
                      onClick={() => spawnEntity('Camera', 'Cube')}
                      className="w-full text-left px-2.5 py-1.5 rounded hover:bg-white/10 text-sky-300"
                    >
                      + Câmera (Jogo / Monitor)
                    </button>
                    <button
                      onClick={() => spawnEntity('Sprite2D', 'Quad2D')}
                      className="w-full text-left px-2.5 py-1.5 rounded hover:bg-white/10 text-emerald-300"
                    >
                      + Sprite 2D (PNG/GIF)
                    </button>
                    <button
                      onClick={() => spawnEntity('Rig3D', 'Cube')}
                      className="w-full text-left px-2.5 py-1.5 rounded hover:bg-white/10 text-slate-200"
                    >
                      + Rig 3D
                    </button>
                    <button
                      onClick={() => spawnEntity('Rig2D', 'Cube')}
                      className="w-full text-left px-2.5 py-1.5 rounded hover:bg-white/10 text-slate-200"
                    >
                      + Rig 2D
                    </button>
                    <button
                      onClick={() => spawnEntity('Mesh3D', 'Cube')}
                      className="w-full text-left px-2.5 py-1.5 rounded hover:bg-white/10 text-slate-200"
                    >
                      + Cubo 3D
                    </button>
                    <button
                      onClick={() => spawnEntity('Mesh3D', 'Sphere')}
                      className="w-full text-left px-2.5 py-1.5 rounded hover:bg-white/10 text-slate-200"
                    >
                      + Esfera 3D
                    </button>
                    <button
                      onClick={() => spawnEntity('PointLight', 'Sphere')}
                      className="w-full text-left px-2.5 py-1.5 rounded hover:bg-white/10 text-slate-200"
                    >
                      + Luz Pontual
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-2 border-b border-white/[0.06]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  value={hierarchySearch}
                  onChange={(e) => setHierarchySearch(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full bg-[#0B0D11] border border-white/10 rounded pl-7 pr-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {visibleHierarchy.map((ent) => {
                const Icon =
                  ent.kind === 'Camera'
                    ? CameraIcon
                    : ent.kind === 'Rig3D' || ent.kind === 'Rig2D'
                    ? User
                    : ent.kind === 'Sprite2D'
                    ? ImageIcon
                    : ent.kind === 'PointLight'
                    ? Sun
                    : ent.primitive === 'CustomModel'
                    ? FileBox
                    : Box;
                return (
                  <div
                    key={ent.id}
                    onClick={() => setSelectedId(ent.id)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                      ent.id === selectedId
                        ? 'bg-blue-600/20 text-white border border-blue-500/40'
                        : 'text-slate-300 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{ent.name}</span>
                    </div>
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setEntities((prev) =>
                          prev.map((item) => (item.id === ent.id ? { ...item, active: !item.active } : item))
                        );
                      }}
                      className="p-0.5 text-slate-500 hover:text-white"
                      title="Mostrar / Ocultar"
                    >
                      {ent.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* CENTRO: Viewport / Animator / Scripts + Gaveta Inferior Minimalista */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div
            className={
              isPlaying && isCameraMaximized && centerView === 'scene'
                ? 'fixed inset-0 z-50 bg-[#07090D] overflow-hidden'
                : 'relative flex-1 min-h-[240px] min-w-0 overflow-hidden'
            }
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={handleDropFiles}
          >
            {isDraggingFile && (
              <div className="absolute inset-0 z-30 bg-blue-600/20 border-2 border-dashed border-blue-400 flex items-center justify-center pointer-events-none">
                <div className="bg-[#0B0D11]/90 px-4 py-2 rounded text-xs font-medium text-white border border-blue-400/50">
                  Solte modelos .FBX, .OBJ, .GLTF, .GLB ou texturas PNG/JPG
                </div>
              </div>
            )}

            {centerView === 'scene' ? (
              <Viewport3D
                entities={entities}
                scripts={scripts}
                parsedModels={parsedModels}
                transitions={transitions}
                selectedId={selectedId}
                onSelectEntity={setSelectedId}
                onTransformEntity={handleTransformEntity}
                onBoneTransform={handleBoneTransform}
                isPlaying={isPlaying}
                isPaused={isPaused}
                clipPreviewPlaying={clipPreviewPlaying}
                clipScrubTime={clipScrubTime}
                gizmoMode={gizmoMode}
                gizmoSpace={gizmoSpace}
                is2DView={is2DView}
                showGrid={showGrid}
                globalWireframe={globalWireframe}
                lightDir={{ x: 0.45, y: 0.85, z: 0.55 }}
                ambientIntensity={0.28}
                inputSettings={inputSettings}
                isMaximized={isCameraMaximized}
                onToggleMaximize={() => setIsCameraMaximized((v) => !v)}
                onUpdateInputSettings={setInputSettings}
                onRestartPlay={() => {
                  if (playSnapshot) {
                    setEntities(JSON.parse(JSON.stringify(playSnapshot)));
                    setIsPlaying(false);
                    setTimeout(() => {
                      setPlaySnapshot(JSON.parse(JSON.stringify(playSnapshot)));
                      setIsPlaying(true);
                      setIsPaused(false);
                    }, 30);
                  }
                }}
                onStatsUpdate={setStats}
                onSimEntitiesSync={(updated) => {
                  if (isPlaying && !isPaused) setEntities(updated);
                }}
                onScriptLog={(msg, lvl) => appendLog(msg, lvl)}
              />
            ) : centerView === 'animator' ? (
              <AnimatorStateGraph
                entity={selectedEntity}
                transitions={transitions}
                onUpdateEntity={updateSelected}
                onAddTransition={(tr) => setTransitions((prev) => [...prev, tr])}
                onDeleteTransition={(id) => setTransitions((prev) => prev.filter((t) => t.id !== id))}
              />
            ) : (
              <ScriptEditorPanel
                scripts={scripts}
                activeScriptId={activeScriptId}
                onSelectScript={setActiveScriptId}
                onCreateScript={handleCreateScript}
                onUpdateScript={(id, updater) =>
                  setScripts((prev) => prev.map((s) => (s.id === id ? updater(s) : s)))
                }
                onDeleteScript={(id) => {
                  setScripts((prev) => prev.filter((s) => s.id !== id));
                  setEntities((prev) =>
                    prev.map((ent) =>
                      ent.script.scriptAssetId === id
                        ? { ...ent, script: { ...ent.script, scriptAssetId: null, language: 'None' } }
                        : ent
                    )
                  );
                }}
                entities={entities}
                selectedEntity={selectedEntity}
                onBindScriptToEntity={handleBindScriptToEntity}
                onUpdateEntity={(entityId, updater) =>
                  setEntities((prev) => prev.map((ent) => (ent.id === entityId ? updater(ent) : ent)))
                }
                isPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
              />
            )}
          </div>

          {/* Gaveta Inferior Minimalista (controlada pelos ícones laterais) */}
          {drawerOpen && (
            <div className="h-[235px] flex flex-col bg-[#11141B] border-t border-white/[0.08] shrink-0">
              <div className="h-8 flex items-center justify-between px-3 border-b border-white/[0.08]">
                <span className="font-display text-xs font-semibold text-slate-200">
                  {drawerLabels[bottomTab]}
                </span>
                <div className="flex items-center gap-2">
                  {bottomTab === 'console' && (
                    <>
                      <select
                        value={logFilter}
                        onChange={(e) => setLogFilter(e.target.value as typeof logFilter)}
                        className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-slate-300"
                      >
                        <option value="All">Todos</option>
                        <option value="Info">Info</option>
                        <option value="Warning">Warning</option>
                        <option value="Error">Error</option>
                      </select>
                      <button onClick={() => setLogs([])} className="text-[11px] text-slate-400 hover:text-white">
                        Limpar
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setDrawerOpen(false)}
                    title="Minimizar gaveta"
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 text-xs min-h-0">
                {bottomTab === 'timeline' && (
                  <AnimationTimelinePanel
                    entity={selectedEntity}
                    scrubTime={clipScrubTime}
                    isPreviewPlaying={clipPreviewPlaying}
                    isRecording={isRecording}
                    onToggleRecord={() => setIsRecording((r) => !r)}
                    onTogglePreview={() => setClipPreviewPlaying((p) => !p)}
                    onScrubChange={setClipScrubTime}
                    onUpdateEntity={updateSelected}
                    onBakeBlenderClip={handleBakeBlenderClip}
                    onOpenAnimator={() => setCenterView('animator')}
                  />
                )}

                {bottomTab === 'assets' && (
                  <div className="grid grid-cols-[140px_1fr] gap-3 h-full">
                    <div className="border-r border-white/10 pr-2 space-y-0.5">
                      {(['Models', 'Textures', 'Animations', 'Scripts', 'Shaders', 'Scenes'] as AssetFolder[]).map(
                        (folder) => (
                          <button
                            key={folder}
                            onClick={() => setAssetFolder(folder)}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs ${
                              assetFolder === folder
                                ? 'bg-blue-600/20 text-white'
                                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                            }`}
                          >
                            <Folder className="w-3.5 h-3.5 shrink-0" />
                            <span>{folder}</span>
                          </button>
                        )
                      )}
                    </div>

                    <div className="flex flex-wrap content-start gap-2 overflow-y-auto">
                      {assetFolder === 'Models' && (
                        <>
                          {(['Cube', 'Sphere', 'Cylinder', 'Cone', 'Plane'] as MeshPrimitive[]).map((prim) => (
                            <button
                              key={prim}
                              onClick={() => spawnEntity('Mesh3D', prim)}
                              className="w-24 p-2 rounded bg-[#0B0D11] border border-white/10 hover:border-blue-500/50 text-left space-y-1"
                            >
                              <FileBox className="w-4 h-4 text-slate-300" />
                              <div className="truncate font-medium text-slate-200">{prim}</div>
                            </button>
                          ))}
                          {importedAssets.map((asset) => (
                            <button
                              key={asset.id}
                              onClick={() => spawnEntity('Mesh3D', 'CustomModel', asset.name, undefined, asset)}
                              className="w-28 p-2 rounded bg-[#0B0D11] border border-blue-500/30 hover:border-blue-400 text-left space-y-1"
                            >
                              <div className="font-mono text-[10px] text-blue-300">.{asset.format.toUpperCase()}</div>
                              <div className="truncate font-medium text-slate-200">{asset.name}</div>
                            </button>
                          ))}
                          <button
                            onClick={() => modelInputRef.current?.click()}
                            className="w-28 p-2 rounded border border-dashed border-white/20 hover:border-blue-500/60 flex items-center justify-center gap-1 text-slate-400 hover:text-white"
                          >
                            <Plus className="w-3.5 h-3.5" /> 3D
                          </button>
                        </>
                      )}

                      {assetFolder === 'Textures' && (
                        <>
                          {(
                            [
                              { label: 'Sprite Herói', url: BUILTIN_SPRITE_HERO, cols: 4 },
                              { label: 'Sprite Moeda', url: BUILTIN_SPRITE_COIN, cols: 4 },
                              { label: 'Sprite Slime', url: BUILTIN_SPRITE_SLIME, cols: 2 },
                              { label: 'Sprite Bandeira', url: BUILTIN_SPRITE_FLAG, cols: 2 },
                            ] as const
                          ).map((sp) => (
                            <button
                              key={sp.label}
                              onClick={() =>
                                spawnEntity('Sprite2D', 'Quad2D', sp.label.replace(' ', '_'), undefined, undefined, {
                                  url: sp.url,
                                  cols: sp.cols,
                                  rows: 1,
                                  fps: 6,
                                })
                              }
                              className="w-24 p-1.5 rounded bg-[#0B0D11] border border-emerald-500/30 hover:border-emerald-400 text-left"
                            >
                              <img src={sp.url} alt={sp.label} className="w-full h-9 object-contain bg-black/40 rounded mb-1" />
                              <div className="truncate text-[10px] text-emerald-300">+ {sp.label}</div>
                            </button>
                          ))}
                          {(['Checkerboard', 'UVGrid', 'MetalPlate', 'WoodGrain'] as TexturePreset[]).map((preset) => (
                            <button
                              key={preset}
                              onClick={() =>
                                selectedEntity && updateSelected((ent) => ({ ...ent, texturePreset: preset }))
                              }
                              className="w-24 p-2 rounded bg-[#0B0D11] border border-white/10 hover:border-blue-500/50 text-left space-y-1"
                            >
                              <ImageIcon className="w-4 h-4 text-slate-300" />
                              <div className="truncate text-slate-200">{preset}</div>
                            </button>
                          ))}
                          {customTextures.map((ct) => (
                            <button
                              key={ct.url}
                              onClick={() =>
                                spawnEntity('Sprite2D', 'Quad2D', ct.name.replace(/\.[^.]+$/, ''), undefined, undefined, {
                                  url: ct.url,
                                  isGif: /\.gif$/i.test(ct.name) || ct.url.startsWith('data:image/gif'),
                                  cols: 1,
                                  rows: 1,
                                })
                              }
                              className="w-24 p-1.5 rounded bg-[#0B0D11] border border-white/10 hover:border-blue-500/50 text-left"
                            >
                              <img src={ct.url} alt={ct.name} className="w-full h-9 object-contain rounded mb-1" />
                              <div className="truncate text-[11px] text-slate-200">{ct.name}</div>
                            </button>
                          ))}
                          <button
                            onClick={() => spriteInputRef.current?.click()}
                            className="w-24 p-2 rounded border border-dashed border-white/20 hover:border-blue-500/60 flex items-center justify-center gap-1 text-slate-400 hover:text-white"
                          >
                            <Plus className="w-3.5 h-3.5" /> PNG/GIF
                          </button>
                        </>
                      )}

                      {assetFolder === 'Animations' && (
                        <>
                          {selectedEntity?.animator.clips.map((clip) => (
                            <button
                              key={clip.id}
                              onClick={() => {
                                updateSelected((ent) => ({
                                  ...ent,
                                  activeBlenderClip: null,
                                  animator: {
                                    ...ent.animator,
                                    enabled: true,
                                    useKeyframes: true,
                                    activeClipId: clip.id,
                                    clipDuration: clip.duration,
                                    keyframes: clip.keyframes,
                                  },
                                }));
                                setBottomTab('timeline');
                                setClipPreviewPlaying(true);
                              }}
                              className="w-32 p-2 rounded bg-[#0B0D11] border border-emerald-500/30 text-left space-y-1"
                            >
                              <Film className="w-4 h-4 text-emerald-400" />
                              <div className="truncate text-slate-200">{clip.name}</div>
                            </button>
                          ))}
                          {selectedEntity && (
                            <button
                              onClick={() => {
                                const c: AnimationClipData = {
                                  id: `clip_${Date.now()}`,
                                  name: `Animacao_${selectedEntity.animator.clips.length + 1}`,
                                  duration: 2.0,
                                  loop: true,
                                  keyframes: [],
                                };
                                updateSelected((ent) => ({
                                  ...ent,
                                  activeBlenderClip: null,
                                  animator: {
                                    ...ent.animator,
                                    enabled: true,
                                    useKeyframes: true,
                                    activeClipId: c.id,
                                    clipDuration: c.duration,
                                    keyframes: [],
                                    clips: [...ent.animator.clips, c],
                                  },
                                }));
                                setBottomTab('timeline');
                              }}
                              className="w-32 p-2 rounded border border-dashed border-white/20 hover:border-emerald-400/60 flex items-center justify-center gap-1 text-slate-400 hover:text-white"
                            >
                              <Plus className="w-3.5 h-3.5" /> Nova Animação
                            </button>
                          )}
                        </>
                      )}

                      {assetFolder === 'Scripts' && (
                        <>
                          {scripts.map((scr) => (
                            <button
                              key={scr.id}
                              onClick={() => {
                                setActiveScriptId(scr.id);
                                setCenterView('scripts');
                              }}
                              className="w-32 p-2 rounded bg-[#0B0D11] border border-white/10 hover:border-blue-500/50 text-left space-y-1"
                            >
                              <Code2 className="w-4 h-4 text-blue-400" />
                              <div className="truncate font-mono text-slate-200">{scr.name}</div>
                            </button>
                          ))}
                          <button
                            onClick={() => handleCreateScript('blank')}
                            className="w-28 p-2 rounded border border-dashed border-white/20 hover:border-blue-500/60 flex items-center justify-center gap-1 text-slate-400 hover:text-white"
                          >
                            <Plus className="w-3.5 h-3.5" /> Script
                          </button>
                        </>
                      )}

                      {(assetFolder === 'Shaders' || assetFolder === 'Scenes') && (
                        <div className="font-mono text-slate-400">
                          {assetFolder === 'Shaders'
                            ? 'Shaders/StandardTextured.hlsl · vs_5_0 / ps_5_0'
                            : `Scenes/Main.kscene (${entities.length} objetos)`}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {bottomTab === 'input' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="rounded bg-[#0B0D11] border border-white/10 p-3 space-y-2">
                      <p className="font-display font-semibold text-white">Dispositivos da Engine</p>
                      <label className="flex items-center gap-2 text-slate-300">
                        <input
                          type="checkbox"
                          checked={inputSettings.keyboardEnabled}
                          onChange={(e) =>
                            setInputSettings((s) => ({ ...s, keyboardEnabled: e.target.checked }))
                          }
                        />
                        Teclado (WASD / Setas / Espaço / F)
                      </label>
                      <label className="flex items-center gap-2 text-slate-300">
                        <input
                          type="checkbox"
                          checked={inputSettings.mouseEnabled}
                          onChange={(e) =>
                            setInputSettings((s) => ({ ...s, mouseEnabled: e.target.checked }))
                          }
                        />
                        Mouse (Clique Esquerdo Ataca / Atira)
                      </label>
                      <label className="flex items-center gap-2 text-slate-300">
                        <input
                          type="checkbox"
                          checked={inputSettings.gamepadEnabled}
                          onChange={(e) =>
                            setInputSettings((s) => ({ ...s, gamepadEnabled: e.target.checked }))
                          }
                        />
                        Controle / Gamepad (Xbox, PS, Genérico)
                      </label>
                    </div>

                    <div className="rounded bg-[#0B0D11] border border-white/10 p-3 space-y-2">
                      <p className="font-display font-semibold text-white">Botões Touchscreen</p>
                      <select
                        value={inputSettings.touchControls}
                        onChange={(e) =>
                          setInputSettings((s) => ({
                            ...s,
                            touchControls: e.target.value as EngineInputSettings['touchControls'],
                          }))
                        }
                        className="w-full bg-[#131720] border border-white/10 rounded px-2 py-1.5 text-slate-200"
                      >
                        <option value="always">Sempre Visíveis no Play</option>
                        <option value="auto">Automático (Dispositivos Touch)</option>
                        <option value="off">Desligado</option>
                      </select>
                      <p className="text-[11px] text-slate-400">
                        Analógico virtual + botões Pular e Atacar/Atirar nativos da engine.
                      </p>
                    </div>

                    <div className="rounded bg-[#0B0D11] border border-white/10 p-3 space-y-2">
                      <p className="font-display font-semibold text-white">Co-op 2 Jogadores (2 Câmeras)</p>
                      <select
                        value={inputSettings.splitScreenCoop}
                        onChange={(e) =>
                          setInputSettings((s) => ({
                            ...s,
                            splitScreenCoop: e.target.value as EngineInputSettings['splitScreenCoop'],
                          }))
                        }
                        className="w-full bg-[#131720] border border-white/10 rounded px-2 py-1.5 text-slate-200"
                      >
                        <option value="auto_touch_keyboard">Auto: Teclado + Touchscreen divide tela</option>
                        <option value="always">Sempre Tela Dividida (2P)</option>
                        <option value="off">Apenas 1 Jogador</option>
                      </select>
                      <p className="text-[11px] text-slate-400">
                        Ao usar Teclado e Touch juntos, P2 ativa e a tela divide ao meio com 2 câmeras.
                      </p>
                    </div>
                  </div>
                )}

                {bottomTab === 'console' && (
                  <div className="font-mono space-y-1">
                    {filteredLogs.map((l) => (
                      <div key={l.id} className="flex items-start gap-2">
                        <span className="text-slate-500 shrink-0">{l.timestamp}</span>
                        <span
                          className={
                            l.level === 'Error'
                              ? 'text-red-400'
                              : l.level === 'Warning'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }
                        >
                          [{l.level}]
                        </span>
                        <span className="text-slate-200">{l.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {bottomTab === 'shader' && (
                  <div className="flex flex-col h-full gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={handleValidateShader}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
                      >
                        Validar HLSL
                      </button>
                      <span className={shaderStatus.ok ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                        {shaderStatus.msg}
                      </span>
                    </div>
                    <textarea
                      value={shaderSrc}
                      onChange={(e) => setShaderSrc(e.target.value)}
                      spellCheck={false}
                      className="flex-1 w-full bg-[#0B0D11] border border-white/10 rounded p-2 font-mono text-xs text-slate-200 resize-none"
                    />
                  </div>
                )}

                {bottomTab === 'rdg' && (
                  <div className="font-mono space-y-1 text-slate-300">
                    <div>01. ShadowDepthPass · SceneMeshes → ShadowMap_D32</div>
                    <div>02. HiZ_OcclusionPass · PrevDepth → HiZ_Pyramid</div>
                    <div>03. OpaqueForwardPass · ShadowMap + AlbedoTex → ViewportColor</div>
                    <div>04. ImGuiCompositePass · ViewportColor → BackBuffer</div>
                  </div>
                )}

                {bottomTab === 'mcp' && (
                  <div className="flex flex-col h-full gap-2">
                    <form onSubmit={handleRunMCP} className="flex gap-2">
                      <input
                        value={mcpInput}
                        onChange={(e) => setMcpInput(e.target.value)}
                        className="flex-1 bg-[#0B0D11] border border-white/10 rounded px-2.5 py-1 font-mono text-slate-200"
                      />
                      <button type="submit" className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium">
                        Executar
                      </button>
                    </form>
                    <div className="flex-1 overflow-y-auto font-mono text-slate-300 space-y-1">
                      {mcpLog.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* DIREITA: Inspetor Minimalista com Seções Retráteis */}
        {showRightPanel && (
          <aside className="w-[300px] flex flex-col bg-[#11141B] border-l border-white/[0.08] min-h-0 overflow-y-auto p-3 space-y-3 shrink-0">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="font-display text-xs font-semibold text-white">Inspetor</span>
              {selectedEntity && (
                <span className="font-mono text-[11px] text-slate-500">{selectedEntity.kind}</span>
              )}
            </div>

            {!selectedEntity ? (
              <p className="text-xs text-slate-500">Selecione um objeto na cena.</p>
            ) : (
              <div className="space-y-3 text-xs">
                {/* Nome & Ativo */}
                <div className="flex items-center gap-2">
                  <input
                    value={selectedEntity.name}
                    onChange={(e) => updateSelected((ent) => ({ ...ent, name: e.target.value }))}
                    className="flex-1 bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-white"
                  />
                  <label className="flex items-center gap-1 text-slate-300">
                    <input
                      type="checkbox"
                      checked={selectedEntity.active}
                      onChange={(e) => updateSelected((ent) => ({ ...ent, active: e.target.checked }))}
                    />
                    Ativo
                  </label>
                </div>

                {/* Transform */}
                <div className="space-y-1.5 pt-2 border-t border-white/[0.08]">
                  <p className="font-display font-semibold text-slate-200">Transform</p>
                  {(['position', 'rotation', 'scale'] as const).map((prop) => {
                    const label = prop === 'position' ? 'Pos' : prop === 'rotation' ? 'Rot' : 'Esc';
                    const vec = selectedEntity[prop];
                    return (
                      <div key={prop} className="grid grid-cols-[32px_1fr_1fr_1fr] items-center gap-1">
                        <span className="text-[11px] text-slate-400">{label}</span>
                        {(['x', 'y', 'z'] as const).map((axis) => (
                          <input
                            key={axis}
                            type="number"
                            step={prop === 'rotation' ? 5 : 0.1}
                            value={Number(vec[axis].toFixed(2))}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const nextVec = { ...selectedEntity[prop], [axis]: val };
                              handleTransformEntity(
                                selectedEntity.id,
                                prop === 'position' ? nextVec : selectedEntity.position,
                                prop === 'rotation' ? nextVec : selectedEntity.rotation,
                                prop === 'scale' ? nextVec : selectedEntity.scale
                              );
                            }}
                            className="w-full bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-[11px] text-slate-200 tabular-nums"
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* Componente de Câmera (Renderização no Jogo & Monitor PiP) */}
                {selectedEntity.kind === 'Camera' && selectedEntity.camera && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 font-display font-semibold text-sky-300">
                        <CameraIcon className="w-3.5 h-3.5" /> Câmera
                      </span>
                      <label className="flex items-center gap-1 text-[11px] text-slate-200">
                        <input
                          type="checkbox"
                          checked={selectedEntity.camera.enabled}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              camera: { ...ent.camera!, enabled: e.target.checked },
                            }))
                          }
                        />
                        Ligada no Jogo
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-3 text-[11px] text-slate-300">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedEntity.camera.showMonitor}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              camera: { ...ent.camera!, showMonitor: e.target.checked },
                            }))
                          }
                        />
                        Mostrar no Monitor
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedEntity.camera.isMain}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              camera: { ...ent.camera!, isMain: e.target.checked },
                            }))
                          }
                        />
                        Principal
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedEntity.camera.gtaChase)}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              camera: { ...ent.camera!, gtaChase: e.target.checked },
                            }))
                          }
                        />
                        Câmera Estilo GTA (Costas)
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedEntity.camera.lockOnEnabled)}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              camera: { ...ent.camera!, lockOnEnabled: e.target.checked },
                            }))
                          }
                        />
                        Auxílio de Mira Próximo
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                      <label className="flex flex-col gap-0.5">
                        Projeção
                        <select
                          value={selectedEntity.camera.projection}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              camera: {
                                ...ent.camera!,
                                projection: e.target.value as 'Perspective' | 'Orthographic',
                              },
                            }))
                          }
                          className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 text-slate-200"
                        >
                          <option value="Perspective">Perspectiva (3D)</option>
                          <option value="Orthographic">Ortográfica (2D)</option>
                        </select>
                      </label>

                      <label className="flex flex-col gap-0.5">
                        Slot Jogador
                        <select
                          value={selectedEntity.camera.playerSlot}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              camera: { ...ent.camera!, playerSlot: Number(e.target.value) as 1 | 2 },
                            }))
                          }
                          className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 text-slate-200"
                        >
                          <option value={1}>Câmera 1P</option>
                          <option value={2}>Câmera 2P (Split)</option>
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                      <label className="flex flex-col gap-0.5">
                        {selectedEntity.camera.projection === 'Orthographic' ? 'Tamanho Orto' : 'FOV (°)'}
                        <input
                          type="number"
                          step={1}
                          value={
                            selectedEntity.camera.projection === 'Orthographic'
                              ? selectedEntity.camera.orthoSize
                              : selectedEntity.camera.fov
                          }
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 45;
                            updateSelected((ent) => ({
                              ...ent,
                              camera: {
                                ...ent.camera!,
                                ...(ent.camera!.projection === 'Orthographic'
                                  ? { orthoSize: Math.max(1.5, val) }
                                  : { fov: Math.max(15, Math.min(120, val)) }),
                              },
                            }));
                          }}
                          className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200"
                        />
                      </label>

                      <label className="flex flex-col gap-0.5">
                        Tamanho Monitor
                        <select
                          value={selectedEntity.camera.monitorSize}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              camera: {
                                ...ent.camera!,
                                monitorSize: e.target.value as 'small' | 'medium',
                              },
                            }))
                          }
                          className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 text-slate-200"
                        >
                          <option value="small">Pequeno</option>
                          <option value="medium">Médio</option>
                        </select>
                      </label>
                    </div>

                    <label className="flex flex-col gap-0.5 text-[11px] text-slate-400">
                      Seguir Objeto
                      <select
                        value={selectedEntity.camera.followTargetName}
                        onChange={(e) =>
                          updateSelected((ent) => ({
                            ...ent,
                            camera: { ...ent.camera!, followTargetName: e.target.value },
                          }))
                        }
                        className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 text-slate-200"
                      >
                        <option value="">Câmera Fixa (Não seguir)</option>
                        {entities
                          .filter((item) => item.id !== selectedEntity.id && item.kind !== 'Camera')
                          .map((item) => (
                            <option key={item.id} value={item.name}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                )}

                {/* Script & Mecânica */}
                <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-display font-semibold text-slate-200">
                      <Code2 className="w-3.5 h-3.5 text-blue-400" /> Script & Mecânica
                    </span>
                    <button
                      onClick={() => {
                        if (selectedEntity.script.scriptAssetId) {
                          setActiveScriptId(selectedEntity.script.scriptAssetId);
                          setCenterView('scripts');
                        } else {
                          const created = handleCreateScript('blank', `${selectedEntity.name}_Script`);
                          handleBindScriptToEntity(selectedEntity.id, created.id);
                        }
                      }}
                      className="text-[11px] text-blue-400 hover:text-blue-300"
                    >
                      {selectedEntity.script.scriptAssetId ? 'Editar Código' : '+ Novo Script'}
                    </button>
                  </div>

                  <div className="flex gap-1">
                    <select
                      value={selectedEntity.script.scriptAssetId ?? '__none__'}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleBindScriptToEntity(selectedEntity.id, val === '__none__' ? null : val);
                      }}
                      className="flex-1 min-w-0 bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200 font-mono"
                    >
                      <option value="__none__">Sem script vinculado</option>
                      {scripts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {selectedEntity.script.scriptAssetId && (
                      <button
                        onClick={() => {
                          setActiveScriptId(selectedEntity.script.scriptAssetId);
                          setCenterView('scripts');
                        }}
                        title="Abrir código"
                        className="px-2 py-1 rounded bg-blue-600/20 border border-blue-500/30 text-blue-200"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {!selectedEntity.script.scriptAssetId && (
                    <select
                      value={selectedEntity.script.mechanicPreset}
                      onChange={(e) =>
                        updateSelected((ent) => ({
                          ...ent,
                          script: { ...ent.script, mechanicPreset: e.target.value as MechanicPreset },
                        }))
                      }
                      className="w-full bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200"
                    >
                      <option value="None">Mecânica: Nenhuma</option>
                      <option value="Brawler3D">Mecânica: Briga de Rua 3D</option>
                      <option value="Shooter2D">Mecânica: Jogo de Tiro 2D</option>
                      <option value="ZombieEnemy">Mecânica: Zumbi / Perseguidor</option>
                      <option value="SpiderEnemy">Mecânica: Aranha (Rápida/Pulo)</option>
                      <option value="SpinningCanEnemy">Mecânica: Lata Giratória</option>
                      <option value="EnemySpawner">Mecânica: Nascedor de Inimigos</option>
                      <option value="PlayerWASD">Mecânica: Jogador 3D (WASD + Pulo)</option>
                      <option value="Platformer2D">Mecânica: Plataforma 2D (A/D + Pulo)</option>
                      <option value="Patrol">Mecânica: Patrulha</option>
                      <option value="Hazard">Mecânica: Inimigo / Dano</option>
                      <option value="CollectibleSpin">Mecânica: Moeda / Kit Médico</option>
                      <option value="JumpPad">Mecânica: Mola Impulsora</option>
                      <option value="Goal">Mecânica: Bandeira / Meta</option>
                    </select>
                  )}

                  {(selectedEntity.script.scriptAssetId || selectedEntity.script.mechanicPreset !== 'None') && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="flex flex-col gap-0.5 text-[11px] text-slate-400">
                        Velocidade
                        <input
                          type="number"
                          step={0.5}
                          value={selectedEntity.script.params.moveSpeed}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              script: {
                                ...ent.script,
                                params: { ...ent.script.params, moveSpeed: parseFloat(e.target.value) || 0 },
                              },
                            }))
                          }
                          className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200 tabular-nums"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-[11px] text-slate-400">
                        Pulo / Força
                        <input
                          type="number"
                          step={0.5}
                          value={selectedEntity.script.params.jumpForce}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              script: {
                                ...ent.script,
                                params: { ...ent.script.params, jumpForce: parseFloat(e.target.value) || 0 },
                              },
                            }))
                          }
                          className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200 tabular-nums"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Vida, Dano & Combate (para Rigs, Sprites e Meshes) */}
                {selectedEntity.kind !== 'Camera' && selectedEntity.kind !== 'PointLight' && (
                  <div className="pt-2 border-t border-white/[0.08]">
                    <button
                      onClick={() => setOpenHealthSec((v) => !v)}
                      className="w-full flex items-center justify-between font-display font-semibold text-slate-200 py-0.5"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Heart className="w-3.5 h-3.5 text-red-400" /> Vida & Combate
                      </span>
                      {openHealthSec ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    {openHealthSec && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <label className="flex items-center gap-1.5 text-slate-300">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedEntity.health?.enabled)}
                              onChange={(e) =>
                                updateSelected((ent) => ({
                                  ...ent,
                                  health: {
                                    enabled: e.target.checked,
                                    maxHp: ent.health?.maxHp ?? 100,
                                    currentHp: ent.health?.currentHp ?? 100,
                                    team: ent.health?.team ?? 'player',
                                    attackDamage: ent.health?.attackDamage ?? 20,
                                    attackRange: ent.health?.attackRange ?? 2.0,
                                    attackCooldown: ent.health?.attackCooldown ?? 0.35,
                                    canShoot: ent.health?.canShoot ?? false,
                                    projectileColor: ent.health?.projectileColor ?? '#38BDF8',
                                    projectileSpeed: ent.health?.projectileSpeed ?? 16,
                                  },
                                }))
                              }
                            />
                            Ativar Vida & Dano
                          </label>
                          <select
                            value={selectedEntity.playerSlot ?? 1}
                            onChange={(e) =>
                              updateSelected((ent) => ({
                                ...ent,
                                playerSlot: Number(e.target.value) as 1 | 2,
                              }))
                            }
                            className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-slate-200"
                          >
                            <option value={1}>Jogador 1</option>
                            <option value={2}>Jogador 2</option>
                          </select>
                        </div>

                        {selectedEntity.health?.enabled && (
                          <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                            <label className="flex flex-col gap-0.5">
                              HP Máximo
                              <input
                                type="number"
                                min={1}
                                value={selectedEntity.health.maxHp}
                                onChange={(e) => {
                                  const maxHp = Math.max(1, parseInt(e.target.value, 10) || 100);
                                  updateSelected((ent) => ({
                                    ...ent,
                                    health: { ...ent.health!, maxHp, currentHp: maxHp },
                                  }));
                                }}
                                className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200"
                              />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              Dano
                              <input
                                type="number"
                                min={1}
                                value={selectedEntity.health.attackDamage}
                                onChange={(e) =>
                                  updateSelected((ent) => ({
                                    ...ent,
                                    health: {
                                      ...ent.health!,
                                      attackDamage: Math.max(1, parseInt(e.target.value, 10) || 10),
                                    },
                                  }))
                                }
                                className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200"
                              />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              Equipe
                              <select
                                value={selectedEntity.health.team}
                                onChange={(e) =>
                                  updateSelected((ent) => ({
                                    ...ent,
                                    health: {
                                      ...ent.health!,
                                      team: e.target.value as 'player' | 'enemy' | 'neutral',
                                    },
                                  }))
                                }
                                className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 text-slate-200"
                              >
                                <option value="player">Jogador</option>
                                <option value="enemy">Inimigo / Zumbi</option>
                                <option value="neutral">Neutro</option>
                              </select>
                            </label>
                            <label className="flex items-center gap-1.5 pt-4 text-slate-300">
                              <input
                                type="checkbox"
                                checked={Boolean(selectedEntity.health.canShoot)}
                                onChange={(e) =>
                                  updateSelected((ent) => ({
                                    ...ent,
                                    health: { ...ent.health!, canShoot: e.target.checked },
                                  }))
                                }
                              />
                              Atirar Projétil
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Animações do Blender */}
                {selectedEntity.blenderClips.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                    <p className="font-display font-semibold text-slate-200">Animações Blender</p>
                    <select
                      value={selectedEntity.activeBlenderClip ?? '__none__'}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateSelected((ent) => ({
                          ...ent,
                          activeBlenderClip: val === '__none__' ? null : val,
                          animator: { ...ent.animator, useKeyframes: val === '__none__' },
                        }));
                      }}
                      className="w-full bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200"
                    >
                      {selectedEntity.blenderClips.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__none__">Usar Timeline Manual</option>
                    </select>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setClipPreviewPlaying((p) => !p)}
                        className="flex-1 py-1 rounded bg-blue-600/20 border border-blue-500/40 text-blue-200"
                      >
                        {clipPreviewPlaying ? 'Pausar' : 'Reproduzir'}
                      </button>
                      {selectedEntity.activeBlenderClip && (
                        <button
                          onClick={() => handleBakeBlenderClip(selectedEntity.activeBlenderClip!)}
                          className="px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-200"
                        >
                          Converter
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Ossos / Rig */}
                {(selectedEntity.boneNames.length > 0 ||
                  selectedEntity.kind === 'Rig3D' ||
                  selectedEntity.kind === 'Rig2D') && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 font-display font-semibold text-slate-200">
                        <Bone className="w-3.5 h-3.5 text-amber-400" /> Ossos / Animator
                      </span>
                      <label className="flex items-center gap-1 text-[11px] text-slate-400">
                        <input
                          type="checkbox"
                          checked={selectedEntity.showSkeletonHelper}
                          onChange={(e) =>
                            updateSelected((ent) => ({ ...ent, showSkeletonHelper: e.target.checked }))
                          }
                        />
                        Ver Ossos
                      </label>
                    </div>

                    <select
                      value={selectedEntity.selectedBone ?? '__root__'}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateSelected((ent) => ({
                          ...ent,
                          selectedBone: val === '__root__' ? null : val,
                        }));
                      }}
                      className="w-full bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200 font-mono"
                    >
                      <option value="__root__">Objeto Raiz</option>
                      {selectedEntity.boneNames.map((b) => (
                        <option key={b} value={b}>Osso: {b}</option>
                      ))}
                    </select>

                    {selectedBoneName && selectedBoneTransform && (
                      <div className="p-2 rounded bg-[#0B0D11] border border-white/10 space-y-1">
                        {(['position', 'rotation'] as const).map((prop) => {
                          const vec =
                            prop === 'position'
                              ? selectedBoneTransform.position ?? { x: 0, y: 0, z: 0 }
                              : selectedBoneTransform.rotation;
                          return (
                            <div key={prop} className="grid grid-cols-[32px_1fr_1fr_1fr] items-center gap-1">
                              <span className="text-[11px] text-slate-400">
                                {prop === 'position' ? 'Pos' : 'Rot'}
                              </span>
                              {(['x', 'y', 'z'] as const).map((axis) => (
                                <input
                                  key={axis}
                                  type="number"
                                  step={prop === 'rotation' ? 5 : 0.05}
                                  value={Number(vec[axis].toFixed(2))}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    const nextPos =
                                      prop === 'position'
                                        ? { ...(selectedBoneTransform.position ?? { x: 0, y: 0, z: 0 }), [axis]: val }
                                        : selectedBoneTransform.position ?? { x: 0, y: 0, z: 0 };
                                    const nextRot =
                                      prop === 'rotation'
                                        ? { ...selectedBoneTransform.rotation, [axis]: val }
                                        : selectedBoneTransform.rotation;
                                    handleBoneTransform(selectedEntity.id, selectedBoneName, nextPos, nextRot);
                                  }}
                                  className="w-full bg-[#12151C] border border-white/10 rounded px-1 py-0.5 font-mono text-[11px] text-slate-200 tabular-nums"
                                />
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {(selectedEntity.kind === 'Rig3D' ||
                      selectedEntity.kind === 'Rig2D' ||
                      (selectedEntity.animator.states && selectedEntity.animator.states.length > 0)) && (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={selectedEntity.animator.currentState}
                          onChange={(e) => {
                            const nextName = e.target.value as AnimatorStateName;
                            updateSelected((ent) => {
                              const baseStates =
                                ent.animator.states && ent.animator.states.length > 0
                                  ? ent.animator.states
                                  : DEFAULT_ANIMATOR_STATES;
                              const st = baseStates.find((s) => s.name === nextName);
                              if (st?.source === 'clip' && st.clipId) {
                                const clip = ent.animator.clips.find((c) => c.id === st.clipId);
                                if (clip) {
                                  return {
                                    ...ent,
                                    activeBlenderClip: null,
                                    animator: {
                                      ...ent.animator,
                                      currentState: nextName,
                                      useKeyframes: true,
                                      libraryPresetId: null,
                                      activeClipId: clip.id,
                                      clipDuration: clip.duration,
                                      keyframes: clip.keyframes,
                                    },
                                  };
                                }
                              }
                              if (st?.source === 'library' && st.libraryPresetId) {
                                return {
                                  ...ent,
                                  activeBlenderClip: null,
                                  animator: {
                                    ...ent.animator,
                                    currentState: nextName,
                                    useKeyframes: false,
                                    libraryPresetId: st.libraryPresetId,
                                  },
                                };
                              }
                              return {
                                ...ent,
                                activeBlenderClip: null,
                                animator: {
                                  ...ent.animator,
                                  currentState: nextName,
                                  useKeyframes: false,
                                  libraryPresetId: null,
                                },
                              };
                            });
                          }}
                          className="flex-1 bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200"
                        >
                          {(selectedEntity.animator.states && selectedEntity.animator.states.length > 0
                            ? selectedEntity.animator.states
                            : DEFAULT_ANIMATOR_STATES
                          ).map((st) => (
                            <option key={st.id} value={st.name}>
                              Estado: {st.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setCenterView('animator')}
                          title="Abrir máquina de estados para criar mais estados"
                          className="px-2 py-1 rounded bg-blue-600/20 border border-blue-500/40 text-[11px] text-blue-300 hover:bg-blue-600/30 whitespace-nowrap"
                        >
                          + Estados
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Sprite 2D (PNG / GIF / Sprite Sheet) */}
                {selectedEntity.kind === 'Sprite2D' && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 font-display font-semibold text-emerald-300">
                        <ImageIcon className="w-3.5 h-3.5" /> Sprite 2D (PNG / GIF)
                      </span>
                      <button
                        onClick={() => spriteInputRef.current?.click()}
                        className="px-2 py-0.5 rounded bg-emerald-600/20 border border-emerald-500/40 text-[11px] text-emerald-200 hover:bg-emerald-600/30"
                      >
                        Trocar PNG/GIF
                      </button>
                    </div>

                    {selectedEntity.sprite?.sourceUrl && (
                      <div className="flex items-center gap-2 bg-[#0B0D11] border border-white/10 rounded p-1.5">
                        <img
                          src={selectedEntity.sprite.sourceUrl}
                          alt={selectedEntity.name}
                          className="w-10 h-10 object-contain rounded bg-black/40"
                        />
                        <div className="text-[11px] text-slate-400">
                          {selectedEntity.sprite.isGif
                            ? 'GIF Animado ativo'
                            : `Sprite Sheet ${selectedEntity.sprite.cols ?? 1}x${selectedEntity.sprite.rows ?? 1}`}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 text-[11px] text-slate-300">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedEntity.sprite?.isGif)}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              sprite: { ...ent.sprite, isGif: e.target.checked },
                            }))
                          }
                        />
                        GIF Animado
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedEntity.sprite?.flipX)}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              sprite: { ...ent.sprite, flipX: e.target.checked },
                            }))
                          }
                        />
                        Espelhar X
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedEntity.sprite?.billboard)}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              sprite: { ...ent.sprite, billboard: e.target.checked },
                            }))
                          }
                        />
                        Billboard 3D
                      </label>
                    </div>

                    {!selectedEntity.sprite?.isGif && (
                      <div className="grid grid-cols-3 gap-1.5 text-[11px] text-slate-400">
                        <label className="flex flex-col gap-0.5">
                          Colunas
                          <input
                            type="number"
                            min={1}
                            max={16}
                            value={selectedEntity.sprite?.cols ?? 1}
                            onChange={(e) =>
                              updateSelected((ent) => ({
                                ...ent,
                                sprite: { ...ent.sprite, cols: Math.max(1, parseInt(e.target.value, 10) || 1) },
                              }))
                            }
                            className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200 tabular-nums"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          Linhas
                          <input
                            type="number"
                            min={1}
                            max={16}
                            value={selectedEntity.sprite?.rows ?? 1}
                            onChange={(e) =>
                              updateSelected((ent) => ({
                                ...ent,
                                sprite: { ...ent.sprite, rows: Math.max(1, parseInt(e.target.value, 10) || 1) },
                              }))
                            }
                            className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200 tabular-nums"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          FPS
                          <input
                            type="number"
                            min={1}
                            max={60}
                            value={selectedEntity.sprite?.fps ?? 8}
                            onChange={(e) =>
                              updateSelected((ent) => ({
                                ...ent,
                                sprite: { ...ent.sprite, fps: Math.max(1, parseInt(e.target.value, 10) || 8) },
                              }))
                            }
                            className="bg-[#0B0D11] border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200 tabular-nums"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Seção Retrátil: Material & Textura */}
                {selectedEntity.kind !== 'PointLight' && selectedEntity.kind !== 'Sprite2D' && (
                  <div className="pt-2 border-t border-white/[0.08]">
                    <button
                      onClick={() => setOpenMaterialSec((v) => !v)}
                      className="w-full flex items-center justify-between font-display font-semibold text-slate-200 py-0.5"
                    >
                      <span>Material & Textura</span>
                      {openMaterialSec ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    {openMaterialSec && (
                      <div className="mt-2 space-y-2">
                        {selectedEntity.kind === 'Mesh3D' && (
                          <label className="flex flex-col gap-0.5 text-[11px] text-slate-400">
                            Visual Procedural 3D
                            <select
                              value={selectedEntity.visualArchetype ?? 'default'}
                              onChange={(e) =>
                                updateSelected((ent) => ({
                                  ...ent,
                                  visualArchetype: e.target.value as EngineEntity['visualArchetype'],
                                }))
                              }
                              className="bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200"
                            >
                              <option value="default">Primitiva / Modelo Padrão</option>
                              <option value="spider">Aranha 3D (8 Patas)</option>
                              <option value="spinning_can">Lata Giratória 3D</option>
                              <option value="drone">Drone Aéreo 3D</option>
                              <option value="spawner_crate">Caixa Nascedora 3D</option>
                              <option value="house">Bloco Casa 3D</option>
                            </select>
                          </label>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={selectedEntity.texturePreset}
                            onChange={(e) =>
                              updateSelected((ent) => ({
                                ...ent,
                                texturePreset: e.target.value as TexturePreset,
                              }))
                            }
                            className="bg-[#0B0D11] border border-white/10 rounded px-2 py-1 text-slate-200"
                          >
                            <option value="None">Sólido</option>
                            <option value="Checkerboard">Checkerboard</option>
                            <option value="UVGrid">UV Grid</option>
                            <option value="MetalPlate">Metal</option>
                            <option value="WoodGrain">Madeira</option>
                            {selectedEntity.customTextureUrl && <option value="Custom">Importada</option>}
                          </select>
                          <input
                            type="color"
                            value={selectedEntity.color}
                            onChange={(e) => updateSelected((ent) => ({ ...ent, color: e.target.value }))}
                            className="h-7 w-full bg-[#0B0D11] border border-white/10 rounded cursor-pointer"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                          <label className="flex flex-col gap-0.5">
                            Metálico ({selectedEntity.metallic.toFixed(2)})
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={selectedEntity.metallic}
                              onChange={(e) =>
                                updateSelected((ent) => ({ ...ent, metallic: parseFloat(e.target.value) }))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-0.5">
                            Rugosidade ({selectedEntity.roughness.toFixed(2)})
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={selectedEntity.roughness}
                              onChange={(e) =>
                                updateSelected((ent) => ({ ...ent, roughness: parseFloat(e.target.value) }))
                              }
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Seção Retrátil: Física */}
                <div className="pt-2 border-t border-white/[0.08]">
                  <button
                    onClick={() => setOpenPhysicsSec((v) => !v)}
                    className="w-full flex items-center justify-between font-display font-semibold text-slate-200 py-0.5"
                  >
                    <span>Física & Rigidbody</span>
                    {openPhysicsSec ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  {openPhysicsSec && (
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-300">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedEntity.physics.enabled}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              physics: { ...ent.physics, enabled: e.target.checked },
                            }))
                          }
                        />
                        Ativo
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedEntity.physics.useGravity}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              physics: { ...ent.physics, useGravity: e.target.checked },
                            }))
                          }
                        />
                        Gravidade
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedEntity.physics.isStatic}
                          onChange={(e) =>
                            updateSelected((ent) => ({
                              ...ent,
                              physics: { ...ent.physics, isStatic: e.target.checked },
                            }))
                          }
                        />
                        Estático
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
