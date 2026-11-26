import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ImportedModelAsset, ModelFormat, TimelineKeyframe, Vec3 } from '../types/engine';

export interface BoneRestTransform {
  pos: Vec3;
  rot: Vec3;
  scale: Vec3;
}

export interface ParsedModelResult {
  asset: ImportedModelAsset;
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  bones: THREE.Bone[];
  boneRestMap: Record<string, BoneRestTransform>;
}

function collectBonesAndNormScale(root: THREE.Object3D): {
  bones: THREE.Bone[];
  boneRestMap: Record<string, BoneRestTransform>;
  scaleFactor: number;
  yOffset: number;
} {
  const bones: THREE.Bone[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      bones.push(obj as THREE.Bone);
    } else if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = true;
    }
  });

  // Normaliza escala (ex: FBX do Blender/Mixamo exportado em centimetros)
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  let scaleFactor = 1.0;
  if (maxDim > 8 || maxDim < 0.2) {
    scaleFactor = 2.0 / maxDim;
  }

  root.scale.multiplyScalar(scaleFactor);
  root.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(root);
  const yOffset = Number.isFinite(scaledBox.min.y) ? -scaledBox.min.y : 0;
  root.position.y += yOffset;

  const boneRestMap: Record<string, BoneRestTransform> = {};
  root.traverse((obj) => {
    if (obj !== root && obj.name) {
      boneRestMap[obj.name] = {
        pos: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        rot: {
          x: THREE.MathUtils.radToDeg(obj.rotation.x),
          y: THREE.MathUtils.radToDeg(obj.rotation.y),
          z: THREE.MathUtils.radToDeg(obj.rotation.z),
        },
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
      };
    }
  });

  return { bones, boneRestMap, scaleFactor, yOffset };
}

export async function parseModelFile(
  id: string,
  fileName: string,
  format: ModelFormat,
  data: string | ArrayBuffer
): Promise<ParsedModelResult> {
  let root = new THREE.Group();
  let clips: THREE.AnimationClip[] = [];

  if (format === 'obj') {
    const loader = new OBJLoader();
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    root = loader.parse(text);
  } else if (format === 'gltf' || format === 'glb') {
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(data, '');
    root = gltf.scene || new THREE.Group();
    clips = gltf.animations || [];
  } else if (format === 'fbx') {
    const loader = new FBXLoader();
    const fbxGroup = loader.parse(data, '');
    root = fbxGroup;
    clips = fbxGroup.animations || [];
  }

  const { bones, boneRestMap } = collectBonesAndNormScale(root);
  const boneNames = bones.map((b) => b.name).filter(Boolean);

  // Se nao houver THREE.Bone explicito, lista sub-grupos/malhas nomeadas para animacao de partes
  if (boneNames.length === 0) {
    root.traverse((obj) => {
      if (obj !== root && obj.name) boneNames.push(obj.name);
    });
  }

  const clipDurations: Record<string, number> = {};
  const clipNames: string[] = [];
  clips.forEach((c, idx) => {
    const cname = c.name || `BlenderClip_${idx + 1}`;
    c.name = cname;
    clipNames.push(cname);
    clipDurations[cname] = Math.max(0.2, Number(c.duration.toFixed(2)));
  });

  const cleanName = fileName.replace(/\.(fbx|obj|gltf|glb)$/i, '');

  return {
    asset: {
      id,
      name: cleanName,
      format,
      data,
      boneNames: Array.from(new Set(boneNames)),
      clipNames,
      clipDurations,
    },
    root,
    clips,
    bones,
    boneRestMap,
  };
}

export function cloneParsedModel(parsed: ParsedModelResult): {
  root: THREE.Group;
  bonesMap: Map<string, THREE.Object3D>;
  boneRestMap: Record<string, BoneRestTransform>;
} {
  const cloned = SkeletonUtils.clone(parsed.root) as THREE.Group;
  const bonesMap = new Map<string, THREE.Object3D>();
  cloned.traverse((obj) => {
    if (obj.name) bonesMap.set(obj.name, obj);
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      const sk = obj as THREE.SkinnedMesh;
      sk.frustumCulled = true;
      sk.castShadow = true;
      sk.receiveShadow = true;
    } else if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return { root: cloned, bonesMap, boneRestMap: parsed.boneRestMap };
}

/**
 * Converte um AnimationClip do Blender (THREE.AnimationClip) para keyframes editaveis
 * na Linha do Tempo tradicional (amostrando ate 36 ossos com poda de keyframes redundantes).
 */
export function sampleClipToTimelineKeyframes(
  clip: THREE.AnimationClip,
  root: THREE.Group,
  boneNames: string[],
  sampleCount = 12
): TimelineKeyframe[] {
  const cloned = SkeletonUtils.clone(root) as THREE.Group;
  const mixer = new THREE.AnimationMixer(cloned);
  const action = mixer.clipAction(clip);
  action.play();

  const boneMap = new Map<string, THREE.Object3D>();
  cloned.traverse((o) => {
    if (o.name) boneMap.set(o.name, o);
  });

  const targets = boneNames.slice(0, 36);
  const dur = Math.max(0.2, clip.duration);
  const keyframes: TimelineKeyframe[] = [];
  const lastSampled = new Map<string, number>();

  for (let s = 0; s <= sampleCount; s++) {
    const t = (s / sampleCount) * dur;
    mixer.setTime(t);
    cloned.updateMatrixWorld(true);
    const timeRounded = Number(t.toFixed(2));
    const isEdge = s === 0 || s === sampleCount;

    for (const bname of targets) {
      const node = boneMap.get(bname);
      if (!node) continue;
      const vals: [axis: 'x' | 'y' | 'z', val: number][] = [
        ['x', Number(THREE.MathUtils.radToDeg(node.rotation.x).toFixed(1))],
        ['y', Number(THREE.MathUtils.radToDeg(node.rotation.y).toFixed(1))],
        ['z', Number(THREE.MathUtils.radToDeg(node.rotation.z).toFixed(1))],
      ];
      for (const [axis, val] of vals) {
        const key = `${bname}:${axis}`;
        const prev = lastSampled.get(key);
        if (isEdge || prev === undefined || Math.abs(val - prev) >= 0.4) {
          lastSampled.set(key, val);
          keyframes.push({
            id: `bkf_${bname}_${axis}_${s}_${Math.random().toString(36).slice(2, 6)}`,
            time: timeRounded,
            targetName: bname,
            property: 'rotation',
            axis,
            value: val,
            interpolation: 'smooth',
          });
        }
      }
    }
  }

  mixer.stopAllAction();
  return keyframes;
}
