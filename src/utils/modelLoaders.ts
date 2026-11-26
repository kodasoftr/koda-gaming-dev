import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ImportedModelAsset, ModelFormat, TimelineKeyframe } from '../types/engine';

export interface ParsedModelResult {
  asset: ImportedModelAsset;
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  bones: THREE.Bone[];
}

function collectBonesAndNormScale(root: THREE.Object3D): { bones: THREE.Bone[]; scaleFactor: number; yOffset: number } {
  const bones: THREE.Bone[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      bones.push(obj as THREE.Bone);
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

  return { bones, scaleFactor, yOffset };
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

  const { bones } = collectBonesAndNormScale(root);
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
  };
}

export function cloneParsedModel(parsed: ParsedModelResult): {
  root: THREE.Group;
  bonesMap: Map<string, THREE.Object3D>;
} {
  const cloned = SkeletonUtils.clone(parsed.root) as THREE.Group;
  const bonesMap = new Map<string, THREE.Object3D>();
  cloned.traverse((obj) => {
    if (obj.name) bonesMap.set(obj.name, obj);
  });
  return { root: cloned, bonesMap };
}

/**
 * Converte um AnimationClip do Blender (THREE.AnimationClip) para keyframes editaveis
 * na Linha do Tempo tradicional (amostrando rotacao Euler em graus dos ossos/nos).
 */
export function sampleClipToTimelineKeyframes(
  clip: THREE.AnimationClip,
  root: THREE.Group,
  boneNames: string[],
  sampleCount = 10
): TimelineKeyframe[] {
  const cloned = SkeletonUtils.clone(root) as THREE.Group;
  const mixer = new THREE.AnimationMixer(cloned);
  const action = mixer.clipAction(clip);
  action.play();

  const boneMap = new Map<string, THREE.Object3D>();
  cloned.traverse((o) => {
    if (o.name) boneMap.set(o.name, o);
  });

  const targets = boneNames.slice(0, 14);
  const dur = Math.max(0.2, clip.duration);
  const keyframes: TimelineKeyframe[] = [];

  for (let s = 0; s <= sampleCount; s++) {
    const t = (s / sampleCount) * dur;
    mixer.setTime(t);
    cloned.updateMatrixWorld(true);

    for (const bname of targets) {
      const node = boneMap.get(bname);
      if (!node) continue;
      const rx = Number(THREE.MathUtils.radToDeg(node.rotation.x).toFixed(1));
      const ry = Number(THREE.MathUtils.radToDeg(node.rotation.y).toFixed(1));
      const rz = Number(THREE.MathUtils.radToDeg(node.rotation.z).toFixed(1));
      const timeRounded = Number(t.toFixed(2));
      keyframes.push(
        { id: `bkf_${bname}_x_${s}_${Math.random()}`, time: timeRounded, targetName: bname, property: 'rotation', axis: 'x', value: rx },
        { id: `bkf_${bname}_y_${s}_${Math.random()}`, time: timeRounded, targetName: bname, property: 'rotation', axis: 'y', value: ry },
        { id: `bkf_${bname}_z_${s}_${Math.random()}`, time: timeRounded, targetName: bname, property: 'rotation', axis: 'z', value: rz }
      );
    }
  }

  mixer.stopAllAction();
  return keyframes;
}
